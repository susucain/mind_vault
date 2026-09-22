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
import { InterviewSessionEntity } from './entities/interview-session.entity';
import { InterviewTurnEntity } from './entities/interview-turn.entity';
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
    private readonly datasets: DatasetService,
    private readonly agent: InterviewAgentService,
  ) {}

  async createSession(ownerId: string, dto: CreateInterviewSessionDto) {
    await this.datasets.findOne(ownerId, dto.datasetId);
    const question = await this.agent.generateQuestion({
      ownerId,
      datasetId: dto.datasetId,
      mode: dto.mode,
      hits: [],
    });
    const session = this.sessions.create({
      id: nextSnowflakeId(),
      ownerId,
      datasetId: dto.datasetId,
      mode: dto.mode,
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
    session.currentQuestion = completed ? null : result.evaluation.followUp;
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

  async listReviewItems(ownerId: string) {
    return this.reviewItems.find({
      where: { ownerId, status: 'PENDING' },
      order: { createdAt: 'DESC' },
    });
  }

  private async findSession(ownerId: string, id: string) {
    const session = await this.sessions.findOne({ where: { id, ownerId } });
    if (!session)
      throw new NotFoundException(`Interview session ${id} not found`);
    return session;
  }
}
