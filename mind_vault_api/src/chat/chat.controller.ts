import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { QueryConversationDto } from './dto/query-conversation.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';
import { ChatService } from './chat.service';

@Controller('conversations')
@UseGuards(AuthGuard, RateLimitGuard)
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Post()
  create(
    @CurrentUser() user: { id: string },
    @Body() dto: CreateConversationDto,
  ) {
    return this.chat.createConversation(user.id, dto);
  }

  @Get()
  listConversations(
    @CurrentUser() user: { id: string },
    @Query() query: QueryConversationDto,
  ) {
    return this.chat.listConversations(user.id, query);
  }

  @Get(':id')
  getConversation(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.chat.getConversation(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateConversationDto,
  ) {
    return this.chat.updateConversation(user.id, id, dto);
  }

  @Get(':id/messages')
  listMessages(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.chat.listMessages(user.id, id);
  }

  @Post(':id/messages')
  ask(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: CreateMessageDto,
  ) {
    return this.chat.ask(user.id, id, dto.content);
  }

  @Post(':id/messages/stream')
  async stream(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: CreateMessageDto,
    @Res() response: Response,
  ) {
    response.status(200);
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders();
    let connected = true;
    const abortController = new AbortController();
    const heartbeat = setInterval(() => {
      if (!connected || response.writableEnded) return;
      response.write(': ping\n\n');
    }, 12_000);
    response.once('close', () => {
      connected = false;
      clearInterval(heartbeat);
      abortController.abort(new Error('客户端已断开连接'));
    });
    try {
      writeEvent(response, 'stage', { stage: 'preparing' });
      const result = await this.chat.ask(user.id, id, dto.content, {
        signal: abortController.signal,
        emitStage: (stage) => {
          if (connected && !response.writableEnded) {
            writeEvent(response, 'stage', { stage });
          }
        },
        // 助手消息一落库就把真实 id 下发，前端能从头就绑定同一条消息
        onMessageStart: (message) => {
          if (connected && !response.writableEnded) {
            writeEvent(response, 'meta', { messageId: message.id });
          }
        },
        // 模型每吐一段就转发一段，不再等全量生成再切片回放
        onToken: (text) => {
          if (connected && !response.writableEnded) {
            writeEvent(response, 'token', { text });
          }
        },
      });
      if (!connected || response.writableEnded) return;
      for (const citation of result.citations) {
        if (!connected || response.writableEnded) return;
        writeEvent(response, 'citation', citation);
      }
      // 追问推荐在 citation 之后、done 之前下发：前端按「最后一轮回答」渲染可点的问题
      if (result.suggestions.length > 0) {
        writeEvent(response, 'suggestions', { items: result.suggestions });
      }
      writeEvent(response, 'done', { messageId: result.message.id });
    } catch (error) {
      if (connected && !response.writableEnded) {
        writeEvent(response, 'error', {
          message: error instanceof Error ? error.message : '问答失败',
        });
      }
    } finally {
      clearInterval(heartbeat);
      if (!response.writableEnded) response.end();
    }
  }
}

function writeEvent(response: Response, event: string, data: unknown) {
  response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}
