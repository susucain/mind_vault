import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DatasetService } from '../dataset/dataset.service';
import { nextSnowflakeId } from '../common/snowflake-id';
import { InterviewAgentService } from './interview-agent.service';
import { InterviewEvaluation } from './interview-model.service';
import { CreateInterviewSessionDto } from './dto/create-interview-session.dto';
import { SubmitInterviewAnswerDto } from './dto/submit-interview-answer.dto';
import { SubmitReviewAnswerDto } from './dto/submit-review-answer.dto';
import { UpdateReviewItemDto } from './dto/update-review-item.dto';
import { QueryReviewItemsDto } from './dto/query-review-items.dto';
import { InterviewSessionEntity } from './entities/interview-session.entity';
import { InterviewTurnEntity } from './entities/interview-turn.entity';
import { ReviewAttemptEntity } from './entities/review-attempt.entity';
import { ReviewItemEntity } from './entities/review-item.entity';

@Injectable()
export class InterviewService {
  constructor(
    @InjectRepository(InterviewSessionEntity)
    private readonly sessions: Repository<InterviewSessionEntity>,
    @InjectRepository(InterviewTurnEntity)
    private readonly turns: Repository<InterviewTurnEntity>,
    @InjectRepository(ReviewItemEntity)
    private readonly reviewItems: Repository<ReviewItemEntity>,
    @InjectRepository(ReviewAttemptEntity)
    private readonly reviewAttempts: Repository<ReviewAttemptEntity>,
    private readonly datasets: DatasetService,
    private readonly agent: InterviewAgentService,
  ) {}

  async createSession(ownerId: string, dto: CreateInterviewSessionDto) {
    await this.datasets.findOne(ownerId, dto.datasetId);
    const question = await this.agent.generateQuestion({
      ownerId,
      datasetId: dto.datasetId,
      topic: dto.topic,
      intensity: dto.intensity,
      focus: dto.focus,
      jobDescription: dto.jobDescription,
      hits: [],
    });
    const session = this.sessions.create({
      id: nextSnowflakeId(),
      ownerId,
      datasetId: dto.datasetId,
      topic: dto.topic,
      intensity: dto.intensity,
      focus: dto.focus ?? null,
      jobDescription: dto.jobDescription ?? null,
      status: 'IN_PROGRESS',
      currentIndex: 0,
      totalQuestions: dto.totalQuestions,
      currentQuestion: question.question,
    });
    return this.sessions.save(session);
  }

  async getSession(ownerId: string, id: string) {
    const session = await this.findSession(ownerId, id);
    const turns = await this.turns.find({
      where: { ownerId, sessionId: id },
      order: { createdAt: 'ASC' },
    });
    return { ...session, turns };
  }

  async listSessions(ownerId: string) {
    return {
      items: await this.sessions.find({
        where: { ownerId },
        order: { updatedAt: 'DESC' },
      }),
    };
  }

  async submitAnswer(
    ownerId: string,
    id: string,
    dto: SubmitInterviewAnswerDto & { question?: string },
  ) {
    const session = await this.findSession(ownerId, id);
    if (session.status !== 'IN_PROGRESS' || !session.currentQuestion) {
      throw new BadRequestException('当前训练会话不可提交回答');
    }
    const question = dto.question ?? session.currentQuestion;
    const result = (await this.agent.evaluate({
      ownerId,
      datasetId: session.datasetId,
      question,
      answer: dto.answer,
      topic: session.topic,
    })) as {
      evaluation: InterviewEvaluation;
      citations: string[];
      nextQuestion?: string;
    };
    const turn = await this.turns.save(
      this.turns.create({
        id: nextSnowflakeId(),
        ownerId,
        sessionId: id,
        question,
        answer: dto.answer,
        evaluation: result.evaluation,
        citationIds: result.citations,
      }),
    );
    const reviewItems: ReviewItemEntity[] = [];
    for (const title of result.evaluation.reviewItems) {
      reviewItems.push(
        await this.reviewItems.save(
          this.reviewItems.create({
            id: nextSnowflakeId(),
            ownerId,
            sourceTurnId: turn.id,
            title,
            reason: result.evaluation.gaps.join('；') || null,
            status: 'PENDING',
            dueAt: null,
          }),
        ),
      );
    }
    session.currentIndex += 1;
    const completed = session.currentIndex >= session.totalQuestions;
    session.status = completed ? 'COMPLETED' : 'IN_PROGRESS';
    session.currentQuestion = completed
      ? null
      : await this.resolveNextQuestion(session, result);
    await this.sessions.save(session);
    return {
      turn,
      evaluation: result.evaluation,
      citations: result.citations,
      nextQuestion: session.currentQuestion,
      reviewItems,
      status: session.status,
    };
  }

  async finish(ownerId: string, id: string) {
    const session = await this.findSession(ownerId, id);
    session.status = 'COMPLETED';
    session.currentQuestion = null;
    await this.sessions.save(session);
    return session;
  }

  async listReviewItems(ownerId: string, query: QueryReviewItemsDto = {}) {
    const status = query.status ?? 'PENDING';
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const [items, total] = await this.reviewItems.findAndCount({
      where: { ownerId, status },
      order:
        status === 'COMPLETED'
          ? { completedAt: 'DESC', createdAt: 'DESC' }
          : { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { items, total, page, pageSize };
  }

  async getReviewItem(ownerId: string, id: string) {
    const item = await this.findReviewItem(ownerId, id);
    const sourceTurn = await this.turns.findOne({
      where: { id: item.sourceTurnId, ownerId },
    });
    const sourceSession = sourceTurn
      ? await this.sessions.findOne({
          where: { id: sourceTurn.sessionId, ownerId },
        })
      : null;
    const attempts = await this.reviewAttempts.find({
      where: { reviewItemId: id, ownerId },
      order: { createdAt: 'ASC' },
    });
    return {
      item,
      sourceTurn,
      sourceTopic: sourceSession?.topic ?? null,
      attempts,
    };
  }

  async submitReviewAnswer(
    ownerId: string,
    id: string,
    dto: SubmitReviewAnswerDto,
  ) {
    const item = await this.findReviewItem(ownerId, id);
    const sourceTurn = await this.turns.findOne({
      where: { id: item.sourceTurnId, ownerId },
    });
    if (!sourceTurn) {
      throw new NotFoundException(
        `Interview turn ${item.sourceTurnId} not found`,
      );
    }
    const sourceSession = await this.sessions.findOne({
      where: { id: sourceTurn.sessionId, ownerId },
    });
    if (!sourceSession) {
      throw new NotFoundException(
        `Interview session ${sourceTurn.sessionId} not found`,
      );
    }
    const result = (await this.agent.evaluate({
      ownerId,
      datasetId: sourceSession.datasetId,
      question: sourceTurn.question,
      answer: dto.answer,
      topic: sourceSession.topic,
    })) as { evaluation: InterviewEvaluation; citations: string[] };
    const evaluation = result.evaluation;
    const score =
      (evaluation.accuracy +
        evaluation.depth +
        evaluation.structure +
        evaluation.clarity) /
      4;
    const autoCompleted = score >= 60;
    const now = new Date();
    const attempt = await this.reviewAttempts.save(
      this.reviewAttempts.create({
        id: nextSnowflakeId(),
        reviewItemId: id,
        ownerId,
        answer: dto.answer,
        evaluation,
        citationIds: result.citations,
        score: score.toFixed(2),
      }),
    );
    item.status = autoCompleted ? 'COMPLETED' : 'PENDING';
    item.lastReviewedAt = now;
    item.completedAt = autoCompleted ? now : null;
    await this.reviewItems.save(item);
    return { attempt, item, autoCompleted, score };
  }

  async updateReviewItemStatus(
    ownerId: string,
    id: string,
    dto: UpdateReviewItemDto,
  ) {
    const item = await this.findReviewItem(ownerId, id);
    const now = new Date();
    item.status = dto.status;
    item.lastReviewedAt = now;
    item.completedAt = dto.status === 'COMPLETED' ? now : null;
    await this.reviewItems.save(item);
    return item;
  }

  /**
   * 深度强度沿用评估给出的追问；快速强度重新出一题，并把已问过的题目交给出题节点去重。
   */
  private async resolveNextQuestion(
    session: InterviewSessionEntity,
    result: { evaluation: InterviewEvaluation },
  ) {
    if (session.intensity !== 'quick') return result.evaluation.followUp;
    const asked = await this.turns.find({
      where: { ownerId: session.ownerId, sessionId: session.id },
      order: { createdAt: 'ASC' },
    });
    const next = await this.agent.generateQuestion({
      ownerId: session.ownerId,
      datasetId: session.datasetId,
      topic: session.topic,
      intensity: session.intensity,
      focus: session.focus,
      jobDescription: session.jobDescription,
      askedQuestions: asked.map((turn) => turn.question),
      hits: [],
    });
    return next.question;
  }

  private async findReviewItem(ownerId: string, id: string) {
    const item = await this.reviewItems.findOne({ where: { id, ownerId } });
    if (!item) throw new NotFoundException(`Review item ${id} not found`);
    return item;
  }

  private async findSession(ownerId: string, id: string) {
    const session = await this.sessions.findOne({ where: { id, ownerId } });
    if (!session)
      throw new NotFoundException(`Interview session ${id} not found`);
    return session;
  }
}
