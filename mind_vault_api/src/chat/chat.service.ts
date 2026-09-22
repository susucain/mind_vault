import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { nextSnowflakeId } from '../common/snowflake-id';
import { MemoryService } from '../memory/memory.service';
import { RagAgentService } from './agent/rag-agent.service';
import { HistoryTurn, historyWindow, RagState } from './agent/rag-types';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { ChatCitationEntity } from './entities/citation.entity';
import { ConversationEntity } from './entities/conversation.entity';
import { ChatMessageEntity } from './entities/chat-message.entity';

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
  ) {}

  async createConversation(ownerId: string, dto: CreateConversationDto) {
    const conversation = this.conversations.create({
      id: nextSnowflakeId(),
      ownerId,
      title: dto.title?.trim() || '新对话',
      datasetIds: dto.datasetIds,
    });
    return this.conversations.save(conversation);
  }

  async listConversations(ownerId: string) {
    return {
      items: await this.conversations.find({
        where: { ownerId },
        order: { updatedAt: 'DESC' },
      }),
    };
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
    return {
      items: messages.map((message) => ({
        ...message,
        citations: citations.filter(
          (citation) => citation.messageId === message.id,
        ),
      })),
    };
  }

  async ask(
    ownerId: string,
    conversationId: string,
    question: string,
    options: {
      signal?: AbortSignal;
      emitStage?: (stage: string) => void;
    } = {},
  ) {
    const conversation = await this.findConversation(ownerId, conversationId);
    let userMessage: ChatMessageEntity | undefined;
    let result: RagState;
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
      const agentInput = {
        ownerId,
        question,
        datasetIds: conversation.datasetIds,
        summary,
        history,
      };
      result =
        options.signal || options.emitStage
          ? await this.agent.invoke(agentInput, options)
          : await this.agent.invoke(agentInput);
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
      await this.messages.save(
        this.messages.create({
          id: nextSnowflakeId(),
          ownerId,
          conversationId,
          role: 'assistant',
          content: '',
          status: options.signal?.aborted ? 'ABORTED' : 'FAILED',
          usedTools: [],
          thinking: false,
        }),
      );
      throw error;
    }
    const assistantMessage = await this.messages.save(
      this.messages.create({
        id: nextSnowflakeId(),
        ownerId,
        conversationId,
        role: 'assistant',
        content: result.answer ?? '当前资料范围内没有足够证据回答这个问题。',
        usedTools: result.usedTools,
        model: result.model,
        thinking: result.thinking,
        confidence: result.confidence,
      }),
    );
    const hits = new Map(result.hits.map((hit) => [hit.chunkId, hit]));
    const citations: ChatCitationEntity[] = [];
    for (const [rank, chunkId] of result.citedChunkIds.entries()) {
      const hit = hits.get(chunkId);
      if (!hit) continue;
      const citation = await this.citations.save(
        this.citations.create({
          id: nextSnowflakeId(),
          messageId: assistantMessage.id,
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
    return {
      userMessage,
      message: assistantMessage,
      citations,
      answerMode: result.answerMode,
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
