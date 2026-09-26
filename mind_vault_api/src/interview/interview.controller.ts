import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { CreateInterviewSessionDto } from './dto/create-interview-session.dto';
import { QueryReviewItemsDto } from './dto/query-review-items.dto';
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

  @Get('sessions')
  listSessions(@CurrentUser() user: { id: string }) {
    return this.service.listSessions(user.id);
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
