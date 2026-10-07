import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { nextSnowflakeId } from '../common/snowflake-id';
import { MemoryService } from '../memory/memory.service';
import type { ExplicitMemoryResult } from '../memory/memory.types';
import { DatasetEntity } from '../dataset/entities/dataset.entity';
import { DocumentMetaService } from '../retrieval/document-meta.service';
import { RagAgentService } from './agent/rag-agent.service';
import { HistoryTurn, historyWindow, RagState } from './agent/rag-types';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { ChatCitationEntity } from './entities/citation.entity';
import { ConversationEntity } from './entities/conversation.entity';
import { ChatMessageEntity } from './entities/chat-message.entity';

/**
 * 引用项视图：实体字段原样透传，另带展示用的文档名。
 * 文档名在读取时按 documentId 解析（不落库），因此文档改名或历史存量数据都能显示正确名称。
 */
export interface ChatCitationView extends ChatCitationEntity {
  documentName: string;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @InjectRepository(ConversationEntity)
    private readonly conversations: Repository<ConversationEntity>,
    @InjectRepository(ChatMessageEntity)
    private readonly messages: Repository<ChatMessageEntity>,
    @InjectRepository(ChatCitationEntity)
    private readonly citations: Repository<ChatCitationEntity>,
    private readonly agent: RagAgentService,
    private readonly memories: MemoryService,
    @InjectRepository(DatasetEntity)
    private readonly datasets: Repository<DatasetEntity>,
    private readonly documentMeta: DocumentMetaService,
  ) {}

  async updateDatasetScope(
    ownerId: string,
    conversationId: string,
    datasetIds: string[],
  ) {
    const conversation = await this.findConversation(ownerId, conversationId);
    const uniqueIds = [...new Set(datasetIds)];
    if (uniqueIds.length > 20) {
      throw new BadRequestException('资料集范围最多包含 20 个资料集');
    }
    // 空数组表示「全部资料集」，检索层对空范围不做资料集过滤
    if (uniqueIds.length) {
      const datasets = await this.datasets.find({
        where: uniqueIds.map((id) => ({ id, ownerId, deleted: false })),
      });
      if (datasets.length !== uniqueIds.length) {
        throw new BadRequestException('资料集不存在或无权访问');
      }
    }
    conversation.datasetIds = uniqueIds;
    return this.conversations.save(conversation);
  }

  async createConversation(ownerId: string, dto: CreateConversationDto) {
    const conversation = this.conversations.create({
      id: nextSnowflakeId(),
      ownerId,
      title: dto.title?.trim() || '新对话',
      datasetIds: dto.datasetIds,
    });
    return this.conversations.save(conversation);
  }

  /**
   * 会话列表：按最近更新倒序分页。
   * 关键词同时匹配会话标题与消息正文——正文命中用 EXISTS 子查询判定，
   * 会话只要有一条消息包含关键词即命中，避免 join 造成行膨胀影响分页总数。
   */
  async listConversations(
    ownerId: string,
    query: { q?: string; page?: number; pageSize?: number } = {},
  ) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const pageSize = query.pageSize && query.pageSize > 0 ? query.pageSize : 20;
    const builder = this.conversations
      .createQueryBuilder('conversation')
      .where('conversation.ownerId = :ownerId', { ownerId });
    const keyword = query.q?.trim();
    if (keyword) {
      const pattern = `%${keyword}%`;
      builder.andWhere(
        new Brackets((where) => {
          where
            .where('conversation.title ILIKE :pattern', { pattern })
            .orWhere(
              'EXISTS (SELECT 1 FROM kh_chat_message message WHERE message.conversation_id = conversation.id AND message.content ILIKE :pattern)',
              { pattern },
            );
        }),
      );
    }
    const [items, total] = await builder
      .orderBy('conversation.updatedAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();
    return { items, total, page, pageSize, hasNext: page * pageSize < total };
  }

  async getConversation(ownerId: string, conversationId: string) {
    return this.findConversation(ownerId, conversationId);
  }

  async listMessages(ownerId: string, conversationId: string) {
    await this.findConversation(ownerId, conversationId);
    const messages = await this.messages.find({
      where: { ownerId, conversationId },
      order: { createdAt: 'ASC' },
    });
    const messageIds = messages.map((message) => message.id);
    const citations = messageIds.length
      ? await this.citations.find({
          where: messageIds.map((messageId) => ({ ownerId, messageId })),
          order: { rank: 'ASC' },
        })
      : [];
    // 存量 citation 未存文档名，这里统一按 documentId 批量解析，历史会话也能显示名称
    const citationViews = await this.withDocumentNames(ownerId, citations);
    return {
      items: messages.map((message) => ({
        ...message,
        citations: citationViews.filter(
          (citation) => citation.messageId === message.id,
        ),
      })),
    };
  }

  /** 批量补上展示用文档名；文档已删除时留空串，由前端显示中性占位 */
  private async withDocumentNames(
    ownerId: string,
    citations: ChatCitationEntity[],
  ): Promise<ChatCitationView[]> {
    if (citations.length === 0) return [];
    const titles = await this.documentMeta.titlesOf(
      ownerId,
      citations.map((citation) => citation.documentId),
    );
    return citations.map((citation) => ({
      ...citation,
      documentName: titles.get(citation.documentId) ?? '',
    }));
  }

  async ask(
    ownerId: string,
    conversationId: string,
    question: string,
    options: {
      signal?: AbortSignal;
      emitStage?: (stage: string) => void;
      onToken?: (delta: string) => void;
      onMessageStart?: (message: ChatMessageEntity) => void;
    } = {},
  ) {
    const conversation = await this.findConversation(ownerId, conversationId);
    let userMessage: ChatMessageEntity | undefined;
    let assistantMessage: ChatMessageEntity | undefined;
    // 累积流式增量：客户端中途断开时用它把已生成正文落库，而不是丢成空串
    let streamed = '';
    let result: RagState;
    let memoryAction: ExplicitMemoryResult | undefined;
    try {
      // 在保存本轮用户消息之前读取记忆，避免把当前提问当成历史重复带入
      const { history, summary } = await this.loadMemory(
        ownerId,
        conversation,
        options.signal,
      );
      userMessage = await this.messages.save(
        this.messages.create({
          id: nextSnowflakeId(),
          ownerId,
          conversationId,
          role: 'user',
          content: question,
          usedTools: [],
          thinking: false,
        }),
      );
      if (conversation.title === '资料问答') {
        conversation.title = question.trim().slice(0, 28) || '资料问答';
      }
      // 先落一行 STREAMING 助手消息：拿到真实 messageId 立即告知客户端，同时保证
      // 生成过程中断开也能保留已产出的正文
      assistantMessage = await this.messages.save(
        this.messages.create({
          id: nextSnowflakeId(),
          ownerId,
          conversationId,
          role: 'assistant',
          content: '',
          status: 'STREAMING',
          usedTools: [],
          thinking: false,
        }),
      );
      options.onMessageStart?.(assistantMessage);
      const onToken = (delta: string) => {
        streamed += delta;
        options.onToken?.(delta);
      };
      memoryAction = await this.memories.handleExplicit({
        ownerId,
        conversationId,
        question,
        summary,
        history,
        signal: options.signal,
      });
      if (memoryAction.action !== 'none') {
        result = explicitMemoryState(
          ownerId,
          question,
          conversation.datasetIds,
          summary,
          history,
          memoryAction,
        );
        if (result.answer) onToken(result.answer);
      } else {
        const agentInput = {
          ownerId,
          question,
          datasetIds: conversation.datasetIds,
          summary,
          history,
        };
        // sessionId 只用于把 trace 归到同一条会话下，不进模型输入
        result = await this.agent.invoke(agentInput, {
          signal: options.signal,
          emitStage: options.emitStage,
          onToken,
          sessionId: conversationId,
        });
      }
    } catch (error) {
      if (!userMessage) {
        userMessage = await this.messages.save(
          this.messages.create({
            id: nextSnowflakeId(),
            ownerId,
            conversationId,
            role: 'user',
            content: question,
            usedTools: [],
            thinking: false,
          }),
        );
      }
      if (assistantMessage) {
        // 保留已经流出的正文，只把状态改成失败/中断
        assistantMessage.content = streamed;
        assistantMessage.status = options.signal?.aborted
          ? 'ABORTED'
          : 'FAILED';
        await this.messages.save(assistantMessage);
      } else {
        await this.messages.save(
          this.messages.create({
            id: nextSnowflakeId(),
            ownerId,
            conversationId,
            role: 'assistant',
            content: streamed,
            status: options.signal?.aborted ? 'ABORTED' : 'FAILED',
            usedTools: [],
            thinking: false,
          }),
        );
      }
      await this.conversations.save(conversation);
      throw error;
    }
    // 成功：更新同一行，把答案与元信息补齐
    assistantMessage.content =
      result.answer ?? '当前资料范围内没有足够证据回答这个问题。';
    assistantMessage.usedTools = result.usedTools;
    assistantMessage.model = result.model;
    assistantMessage.thinking = result.thinking;
    assistantMessage.status = 'COMPLETED';
    const message = await this.messages.save(assistantMessage);
    const hits = new Map(result.hits.map((hit) => [hit.chunkId, hit]));
    const citations: ChatCitationEntity[] = [];
    for (const [rank, chunkId] of result.citedChunkIds.entries()) {
      const hit = hits.get(chunkId);
      if (!hit) continue;
      const citation = await this.citations.save(
        this.citations.create({
          id: nextSnowflakeId(),
          messageId: message.id,
          ownerId,
          documentId: hit.documentId,
          chunkId: hit.chunkId,
          quote: hit.text.slice(0, 500),
          locator: { ...hit.locator },
          rank,
        }),
      );
      citations.push(citation);
    }
    await this.conversations.save(conversation);
    return {
      userMessage,
      message,
      citations: await this.withDocumentNames(ownerId, citations),
      answerMode: result.answerMode,
      memoryAction,
    };
  }

  /**
   * 短期记忆 = 窗口内的最近对话 + 窗口外历史压缩出的摘要。
   * 压缩攒够 historyWindow.summarizeBatch 条未摘要消息才重算一次，
   * 否则每轮追问都要多付一次模型调用。
   */
  private async loadMemory(
    ownerId: string,
    conversation: ConversationEntity,
    signal?: AbortSignal,
  ): Promise<{ history: HistoryTurn[]; summary?: string }> {
    const history = await this.recentHistory(ownerId, conversation.id);
    const summary = conversation.summary ?? undefined;
    const total = await this.messages.count({
      where: { ownerId, conversationId: conversation.id },
    });
    const outsideCount = Math.max(total - historyWindow.maxMessages, 0);
    const pendingCount = outsideCount - conversation.summarizedMessageCount;
    if (pendingCount < historyWindow.summarizeBatch)
      return { history, summary };

    const pending = await this.messages.find({
      where: { ownerId, conversationId: conversation.id },
      order: { createdAt: 'ASC' },
      skip: conversation.summarizedMessageCount,
      // 历史积压（如旧会话首次启用摘要）时单次只压缩一批，游标按实际条数推进
      take: Math.min(pendingCount, historyWindow.summarizeBatch * 4),
    });
    const summarizeInput = {
      previousSummary: summary,
      turns: pending.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    };
    const nextSummary = signal
      ? await this.agent.summarize(summarizeInput, { signal })
      : await this.agent.summarize(summarizeInput);
    // 压缩失败时保留原摘要与游标，下次提问再重试
    if (!nextSummary) return { history, summary };
    conversation.summary = nextSummary;
    conversation.summarizedMessageCount += pending.length;
    await this.conversations.save(conversation);
    // 摘要压缩后顺带抽取长期记忆：不阻塞本轮回答，失败只记日志
    void this.extractMemories(ownerId, conversation.id, pending);
    return { history, summary: nextSummary };
  }

  /**
   * 自动抽取长期记忆。输入正是刚滑出窗口的那批轮次（含助手回答），
   * 抽取提示词约束与入库过滤都在 memory 模块，这里只负责触发与降级。
   */
  private async extractMemories(
    ownerId: string,
    conversationId: string,
    turns: ChatMessageEntity[],
  ) {
    try {
      await this.memories.extractFromTurns({
        ownerId,
        conversationId,
        turns: turns.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      });
    } catch (error) {
      this.logger.warn(
        `长期记忆抽取失败: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * 窗口内的最近若干条消息，窗口裁剪由编排层按同一份配置完成。
   */
  private async recentHistory(
    ownerId: string,
    conversationId: string,
  ): Promise<HistoryTurn[]> {
    const messages = await this.messages.find({
      where: { ownerId, conversationId },
      order: { createdAt: 'DESC' },
      take: historyWindow.maxMessages,
    });
    return messages
      .reverse()
      .map((message) => ({ role: message.role, content: message.content }));
  }

  private async findConversation(ownerId: string, id: string) {
    const conversation = await this.conversations.findOne({
      where: { id, ownerId },
    });
    if (!conversation)
      throw new NotFoundException(`Conversation ${id} not found`);
    return conversation;
  }
}

function explicitMemoryState(
  ownerId: string,
  question: string,
  datasetIds: string[],
  summary: string | undefined,
  history: HistoryTurn[],
  action: ExplicitMemoryResult,
): RagState {
  const answer =
    action.answer ??
    (action.action === 'saved'
      ? `已记住：${action.content}`
      : action.action === 'not_saved'
        ? '好的，这次不会把这条信息保存为长期记忆。'
        : '长期记忆操作已完成。');
  return {
    ownerId,
    question,
    summary,
    history,
    memories: [],
    datasetIds,
    hits: [],
    vectorHits: [],
    hasEvidence: false,
    usedTools: ['memory'],
    answer,
    citedChunkIds: [],
    thinking: false,
    answerMode: 'general',
  };
}
