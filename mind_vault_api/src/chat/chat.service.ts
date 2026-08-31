import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { nextSnowflakeId } from '../common/snowflake-id';
import { RagAgentService } from './agent/rag-agent.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { ChatCitationEntity } from './entities/citation.entity';
import { ConversationEntity } from './entities/conversation.entity';
import { ChatMessageEntity } from './entities/chat-message.entity';

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(ConversationEntity)
    private readonly conversations: Repository<ConversationEntity>,
    @InjectRepository(ChatMessageEntity)
    private readonly messages: Repository<ChatMessageEntity>,
    @InjectRepository(ChatCitationEntity)
    private readonly citations: Repository<ChatCitationEntity>,
    private readonly agent: RagAgentService,
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

  async ask(ownerId: string, conversationId: string, question: string) {
    const conversation = await this.findConversation(ownerId, conversationId);
    const userMessage = await this.messages.save(
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
    const result = await this.agent.invoke({
      ownerId,
      question,
      datasetIds: conversation.datasetIds,
    });
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
    };
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
