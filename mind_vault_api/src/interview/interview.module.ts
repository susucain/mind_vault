import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { DatasetModule } from '../dataset/dataset.module';
import { MemoryModule } from '../memory/memory.module';
import { RetrievalModule } from '../retrieval/retrieval.module';
import { InterviewAgentService } from './interview-agent.service';
import { InterviewController } from './interview.controller';
import { InterviewModelService } from './interview-model.service';
import { InterviewService } from './interview.service';
import { InterviewSessionEntity } from './entities/interview-session.entity';
import { InterviewTurnEntity } from './entities/interview-turn.entity';
import { ReviewItemEntity } from './entities/review-item.entity';

@Module({
  imports: [
    AuthModule,
    DatasetModule,
    MemoryModule,
    RetrievalModule,
    TypeOrmModule.forFeature([
      InterviewSessionEntity,
      InterviewTurnEntity,
      ReviewItemEntity,
    ]),
  ],
  controllers: [InterviewController],
  providers: [InterviewService, InterviewAgentService, InterviewModelService],
})
export class InterviewModule {}
