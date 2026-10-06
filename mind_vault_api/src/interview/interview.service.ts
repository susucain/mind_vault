import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsOrder, FindOptionsWhere, In, Repository } from 'typeorm';
import { DatasetService } from '../dataset/dataset.service';
import { nextSnowflakeId } from '../common/snowflake-id';
import {
  InterviewAgentService,
  StageReporter,
} from './interview-agent.service';
import { InterviewEvaluation } from './interview-model.service';
import { CreateInterviewSessionDto } from './dto/create-interview-session.dto';
import { SubmitInterviewAnswerDto } from './dto/submit-interview-answer.dto';
import { SubmitReviewAnswerDto } from './dto/submit-review-answer.dto';
import { UpdateReviewItemDto } from './dto/update-review-item.dto';
import { QueryReviewItemsDto } from './dto/query-review-items.dto';
import { QueryInterviewSessionsDto } from './dto/query-interview-sessions.dto';
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

  async createSession(
    ownerId: string,
    dto: CreateInterviewSessionDto,
    onStage?: StageReporter,
  ) {
    await this.datasets.findOne(ownerId, dto.datasetId);
    // 先生成 id：出题这一步就带上它，trace 才能和这次会话归到一组
    const sessionId = nextSnowflakeId();
    const question = await this.agent.generateQuestion({
      ownerId,
      datasetId: dto.datasetId,
      topic: dto.topic,
      intensity: dto.intensity,
      focus: dto.focus,
      jobDescription: dto.jobDescription,
      hits: [],
      sessionId,
      onStage,
    });
    const session = this.sessions.create({
      id: sessionId,
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

  async listSessions(ownerId: string, query: QueryInterviewSessionsDto = {}) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const [items, total] = await this.sessions.findAndCount({
      where: { ownerId },
      order: { updatedAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    const scores = await this.averageScoresBySession(
      ownerId,
      items.map((item) => item.id),
    );
    return {
      items: items.map((item) => ({
        ...item,
        averageScore: scores.get(item.id) ?? null,
      })),
      total,
      page,
      pageSize,
    };
  }

  /**
   * 单次查询聚合每个会话的平均得分（各题四维均值的均值）。
   * 首页「平均得分」据此计算，避免逐个会话查询 turns 造成 N+1。
   */
  private async averageScoresBySession(ownerId: string, sessionIds: string[]) {
    const scores = new Map<string, number>();
    if (!sessionIds.length) return scores;
    const turns = await this.turns.find({
      where: { ownerId, sessionId: In(sessionIds) },
      select: { id: true, sessionId: true, evaluation: true },
    });
    const grouped = new Map<string, number[]>();
    for (const turn of turns) {
      const evaluation = turn.evaluation as Partial<InterviewEvaluation> | null;
      if (!evaluation) continue;
      const values = [
        evaluation.accuracy,
        evaluation.depth,
        evaluation.structure,
        evaluation.clarity,
      ].filter(
        (value): value is number =>
          typeof value === 'number' && Number.isFinite(value),
      );
      if (!values.length) continue;
      const score =
        values.reduce((total, value) => total + value, 0) / values.length;
      grouped.set(turn.sessionId, [
        ...(grouped.get(turn.sessionId) ?? []),
        score,
      ]);
    }
    for (const [sessionId, list] of grouped) {
      scores.set(
        sessionId,
        Math.round(
          list.reduce((total, value) => total + value, 0) / list.length,
        ),
      );
    }
    return scores;
  }

  async submitAnswer(
    ownerId: string,
    id: string,
    dto: SubmitInterviewAnswerDto & { question?: string },
    onStage?: StageReporter,
  ) {
    const session = await this.findSession(ownerId, id);
    if (session.status !== 'IN_PROGRESS' || !session.currentQuestion) {
      throw new BadRequestException('当前训练会话不可提交回答');
    }
    const question = dto.question ?? session.currentQuestion;
    if (dto.skipped) {
      // 跳过本题：不调用模型、不生成复习项，仅记录占位以推进会话流程
      const skippedTurn = await this.turns.save(
        this.turns.create({
          id: nextSnowflakeId(),
          ownerId,
          sessionId: id,
          question,
          answer: '',
          evaluation: { skipped: true },
          citationIds: [],
        }),
      );
      session.currentIndex += 1;
      const skippedCompleted = session.currentIndex >= session.totalQuestions;
      session.status = skippedCompleted ? 'COMPLETED' : 'IN_PROGRESS';
      session.currentQuestion = skippedCompleted
        ? null
        : await this.generateNextQuestion(session, onStage);
      await this.sessions.save(session);
      return {
        turn: skippedTurn,
        evaluation: { skipped: true },
        citations: [],
        nextQuestion: session.currentQuestion,
        reviewItems: [],
        status: session.status,
      };
    }
    const result = (await this.agent.evaluate({
      ownerId,
      datasetId: session.datasetId,
      question,
      answer: dto.answer,
      topic: session.topic,
      sessionId: id,
      onStage,
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
      : await this.resolveNextQuestion(session, result, onStage);
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
    // ALL 时不加状态过滤，仍走后端分页，保证 total 与分页语义正确
    const where: FindOptionsWhere<ReviewItemEntity> = { ownerId };
    if (status !== 'ALL') where.status = status;
    const order: FindOptionsOrder<ReviewItemEntity> =
      status === 'COMPLETED'
        ? { completedAt: 'DESC', createdAt: 'DESC' }
        : { createdAt: 'DESC' };
    const [items, total] = await this.reviewItems.findAndCount({
      where,
      order,
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
      sessionId: sourceSession.id,
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
    onStage?: StageReporter,
  ) {
    if (session.intensity !== 'quick') return result.evaluation.followUp;
    return this.generateNextQuestion(session, onStage);
  }

  /** 基于会话上下文重新出一题（用于快速强度换题与跳过本题），传入已问过的题目去重。 */
  private async generateNextQuestion(
    session: InterviewSessionEntity,
    onStage?: StageReporter,
  ) {
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
      sessionId: session.id,
      onStage,
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
