import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { DocumentModule } from '../document/document.module';
import { UserMemoryEntity } from './entities/user-memory.entity';
import { MemoryController } from './memory.controller';
import { MemoryModelService } from './memory-model.service';
import { MemoryService } from './memory.service';

@Module({
  // EmbeddingService 由 DocumentModule 提供，与 RetrievalModule 复用同一实例
  imports: [
    AuthModule,
    DocumentModule,
    TypeOrmModule.forFeature([UserMemoryEntity]),
  ],
  controllers: [MemoryController],
  providers: [MemoryService, MemoryModelService],
  exports: [MemoryService],
})
export class MemoryModule {}
