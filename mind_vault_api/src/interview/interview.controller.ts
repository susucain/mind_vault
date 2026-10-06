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
import type { InterviewStage } from './interview-agent.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { CreateInterviewSessionDto } from './dto/create-interview-session.dto';
import { QueryReviewItemsDto } from './dto/query-review-items.dto';
import { QueryInterviewSessionsDto } from './dto/query-interview-sessions.dto';
import { SubmitInterviewAnswerDto } from './dto/submit-interview-answer.dto';
import { SubmitReviewAnswerDto } from './dto/submit-review-answer.dto';
import { UpdateReviewItemDto } from './dto/update-review-item.dto';
import { InterviewService } from './interview.service';

@Controller('interview')
@UseGuards(AuthGuard)
export class InterviewController {
  constructor(private readonly service: InterviewService) {}

  @Post('sessions')
  createSession(
    @CurrentUser() user: { id: string },
    @Body() dto: CreateInterviewSessionDto,
  ) {
    return this.service.createSession(user.id, dto);
  }

  /**
   * 检索加模型生成通常十秒以上，用它把阶段推给前端，避免界面像卡死。
   * 客户端中途断开不中断已有请求：本轮回答与评估结果仍会落库。
   */
  @Post('sessions/stream')
  async createSessionStream(
    @CurrentUser() user: { id: string },
    @Body() dto: CreateInterviewSessionDto,
    @Res() response: Response,
  ) {
    const stream = openSseStream(response);
    try {
      stream.write('stage', { stage: 'preparing' });
      const session = await this.service.createSession(
        user.id,
        dto,
        stream.stageReporter,
      );
      stream.write('result', session);
      stream.write('done', {});
    } catch (error) {
      stream.write('error', { message: errorMessage(error) });
    } finally {
      stream.close();
    }
  }

  @Get('sessions')
  listSessions(
    @CurrentUser() user: { id: string },
    @Query() query: QueryInterviewSessionsDto,
  ) {
    return this.service.listSessions(user.id, query);
  }

  @Get('sessions/:id')
  getSession(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.service.getSession(user.id, id);
  }

  @Post('sessions/:id/answers')
  submitAnswer(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: SubmitInterviewAnswerDto,
  ) {
    return this.service.submitAnswer(user.id, id, dto);
  }

  @Post('sessions/:id/answers/stream')
  async submitAnswerStream(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: SubmitInterviewAnswerDto,
    @Res() response: Response,
  ) {
    const stream = openSseStream(response);
    try {
      stream.write('stage', { stage: 'preparing' });
      const result = await this.service.submitAnswer(
        user.id,
        id,
        dto,
        stream.stageReporter,
      );
      stream.write('result', result);
      stream.write('done', {});
    } catch (error) {
      stream.write('error', { message: errorMessage(error) });
    } finally {
      stream.close();
    }
  }

  @Post('sessions/:id/finish')
  finish(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.service.finish(user.id, id);
  }

  @Get('review-items')
  listReviewItems(
    @CurrentUser() user: { id: string },
    @Query() query: QueryReviewItemsDto,
  ) {
    return this.service.listReviewItems(user.id, query);
  }

  @Get('review-items/:id')
  getReviewItem(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.service.getReviewItem(user.id, id);
  }

  @Post('review-items/:id/answers')
  submitReviewAnswer(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: SubmitReviewAnswerDto,
  ) {
    return this.service.submitReviewAnswer(user.id, id, dto);
  }

  @Patch('review-items/:id')
  updateReviewItem(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateReviewItemDto,
  ) {
    return this.service.updateReviewItemStatus(user.id, id, dto);
  }
}

/** 与聊天流式接口保持一致的事件协议：stage / result / done / error */
function openSseStream(response: Response) {
  response.status(200);
  response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  response.setHeader('Cache-Control', 'no-cache, no-transform');
  response.setHeader('Connection', 'keep-alive');
  response.setHeader('X-Accel-Buffering', 'no');
  response.flushHeaders();
  let open = true;
  const heartbeat = setInterval(() => {
    if (open && !response.writableEnded) response.write(': ping\n\n');
  }, 12_000);
  response.once('close', () => {
    open = false;
    clearInterval(heartbeat);
  });
  const write = (event: string, data: unknown) => {
    // 客户端断开后静默丢弃，避免写入已关闭的响应
    if (!open || response.writableEnded) return;
    response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  return {
    write,
    // 作为回调传给 service，不用 this，避免解绑后失效
    stageReporter: (stage: InterviewStage) => write('stage', { stage }),
    close() {
      clearInterval(heartbeat);
      open = false;
      if (!response.writableEnded) response.end();
    },
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '训练请求失败';
}
