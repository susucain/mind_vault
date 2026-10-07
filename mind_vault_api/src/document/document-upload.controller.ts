import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Sse,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Body,
} from '@nestjs/common';
import { MessageEvent } from '@nestjs/common';
import { Observable } from 'rxjs';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { DocumentUploadService } from './document-upload.service';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';
import {
  DocumentProgressEvent,
  DocumentProgressService,
} from './document-progress.service';

@Controller('documents')
@UseGuards(AuthGuard, RateLimitGuard)
export class DocumentUploadController {
  constructor(
    private readonly service: DocumentUploadService,
    private readonly progress: DocumentProgressService,
  ) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 100 * 1024 * 1024 },
    }),
  )
  upload(
    @CurrentUser() user: { id: string },
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadDocumentDto,
  ) {
    if (!file) throw new BadRequestException('请上传文件');
    return this.service.upload(user.id, file, dto.datasetId, {
      tags: dto.tags,
      remark: dto.remark,
      sourceFileName: dto.sourceFileName,
      graphEnabled: dto.graphEnabled,
    });
  }

  @Get(':id/status')
  status(@CurrentUser() user: { id: string }, @Param('id') documentId: string) {
    return this.service.status(user.id, documentId);
  }

  @Sse('events')
  allEvents(@CurrentUser() user: { id: string }): Observable<MessageEvent> {
    return new Observable((subscriber) => {
      const subscription = this.progress.streamOwner(user.id).subscribe({
        next: (event: DocumentProgressEvent) =>
          subscriber.next({ type: 'progress', data: event }),
      });
      return () => subscription.unsubscribe();
    });
  }

  @Sse(':id/events')
  events(
    @CurrentUser() user: { id: string },
    @Param('id') documentId: string,
  ): Observable<MessageEvent> {
    return new Observable((subscriber) => {
      const subscription = this.progress.stream(user.id, documentId).subscribe({
        next: (event: DocumentProgressEvent) =>
          subscriber.next({ type: 'progress', data: event }),
      });
      return () => subscription.unsubscribe();
    });
  }

  @Post(':id/retry')
  retry(@CurrentUser() user: { id: string }, @Param('id') documentId: string) {
    return this.service.retry(user.id, documentId);
  }
}
