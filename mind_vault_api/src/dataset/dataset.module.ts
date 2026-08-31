import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { DatasetController } from './dataset.controller';
import { DatasetService } from './dataset.service';
import { DatasetDocumentEntity } from './entities/dataset-document.entity';
import { DatasetEntity } from './entities/dataset.entity';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([DatasetEntity, DatasetDocumentEntity]),
  ],
  controllers: [DatasetController],
  providers: [DatasetService],
  exports: [DatasetService],
})
export class DatasetModule {}
