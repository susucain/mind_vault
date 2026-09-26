import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { CreateMessageDto } from './dto/create-message.dto';
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
  listConversations(@CurrentUser() user: { id: string }) {
    return this.chat.listConversations(user.id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateConversationDto,
  ) {
    return this.chat.updateDatasetScope(user.id, id, dto.datasetIds);
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
      });
      if (!connected || response.writableEnded) return;
      writeEvent(response, 'meta', {
        messageId: result.message.id,
        usedTools: result.message.usedTools,
        model: result.message.model,
        thinking: result.message.thinking,
        // rag / general：general 为资料无依据时的自动补答（正文自带来源提示行）
        answerMode: result.answerMode,
        memoryAction: result.memoryAction
          ? {
              action: result.memoryAction.action,
              content: result.memoryAction.content,
            }
          : undefined,
      });
      for (const text of splitText(result.message.content, 48)) {
        if (!connected || response.writableEnded) return;
        writeEvent(response, 'token', { text });
      }
      for (const citation of result.citations) {
        if (!connected || response.writableEnded) return;
        writeEvent(response, 'citation', citation);
      }
      writeEvent(response, 'done', {
        confidence: result.message.confidence,
      });
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

function splitText(text: string, size: number) {
  const parts: string[] = [];
  for (let offset = 0; offset < text.length; offset += size) {
    parts.push(text.slice(offset, offset + size));
  }
  return parts;
}
