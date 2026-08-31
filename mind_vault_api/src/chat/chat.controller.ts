import {
  Body,
  Controller,
  Get,
  Param,
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
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('Connection', 'keep-alive');
    response.flushHeaders();
    try {
      const result = await this.chat.ask(user.id, id, dto.content);
      writeEvent(response, 'meta', {
        messageId: result.message.id,
        usedTools: result.message.usedTools,
        model: result.message.model,
        thinking: result.message.thinking,
      });
      for (const text of splitText(result.message.content, 48)) {
        writeEvent(response, 'token', { text });
      }
      for (const citation of result.citations) {
        writeEvent(response, 'citation', citation);
      }
      writeEvent(response, 'done', {
        confidence: result.message.confidence,
      });
    } catch (error) {
      writeEvent(response, 'error', {
        message: error instanceof Error ? error.message : '问答失败',
      });
    } finally {
      response.end();
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
