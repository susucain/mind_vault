import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Headers,
  Param,
  Post,
  Sse,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Body,
} from '@nestjs/common';
import { MessageEvent } from '@nestjs/common';
import { interval, map, merge, Observable } from 'rxjs';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { DocumentUploadService } from './document-upload.service';
import { UPLOAD_TEMP_DIR } from './parser/utils/upload-temp.util';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';
import {
  DocumentProgressEvent,
  DocumentProgressService,
} from './document-progress.service';

/** 进度流心跳间隔（毫秒）：与问答流保持一致，低于常见网关 60s 空闲超时 */
const SSE_HEARTBEAT_MS = 12_000;

@Controller('documents')
@UseGuards(AuthGuard, RateLimitGuard)
export class DocumentUploadController {
  constructor(
    private readonly service: DocumentUploadService,
    private readonly progress: DocumentProgressService,
  ) {}

  @Post('upload')
  @UseInterceptors(
    // 流式落盘（U4）：请求体直接写临时文件，避免 100MB × 并发数 的内存峰值
    FileInterceptor('file', {
      dest: UPLOAD_TEMP_DIR,
      limits: { fileSize: 100 * 1024 * 1024 },
    }),
  )
  upload(
    @CurrentUser() user: { id: string },
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadDocumentDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!file) throw new BadRequestException('请上传文件');
    return this.service.upload(user.id, file, dto.datasetId, {
      tags: dto.tags,
      remark: dto.remark,
      sourceFileName: dto.sourceFileName,
      graphEnabled: dto.graphEnabled,
      idempotencyKey,
    });
  }

  /** 当前可上传的格式清单，供 Web 与小程序共用 */
  @Get('supported-formats')
  supportedFormats() {
    return this.service.supportedFormats();
  }

  @Get(':id/status')
  status(@CurrentUser() user: { id: string }, @Param('id') documentId: string) {
    return this.service.status(user.id, documentId);
  }

  @Sse('events')
  @Header('X-Accel-Buffering', 'no')
  allEvents(@CurrentUser() user: { id: string }): Observable<MessageEvent> {
    return this.progressStream(this.progress.streamOwner(user.id));
  }

  @Sse(':id/events')
  @Header('X-Accel-Buffering', 'no')
  events(
    @CurrentUser() user: { id: string },
    @Param('id') documentId: string,
  ): Observable<MessageEvent> {
    return this.progressStream(this.progress.stream(user.id, documentId));
  }

  /**
   * 进度事件流：附 12s 心跳（`event: ping`），避免长连接在处理空档被网关按空闲超时掐断。
   * 心跳走真实字节而非注释行——注释行在部分反代下会被缓冲，起不到保活作用。
   */
  private progressStream(
    source: Observable<DocumentProgressEvent>,
  ): Observable<MessageEvent> {
    const progress = source.pipe(
      map((event): MessageEvent => ({ type: 'progress', data: event })),
    );
    const heartbeat = interval(SSE_HEARTBEAT_MS).pipe(
      map((): MessageEvent => ({ type: 'ping', data: '' })),
    );
    return merge(progress, heartbeat);
  }

  @Post(':id/retry')
  retry(@CurrentUser() user: { id: string }, @Param('id') documentId: string) {
    return this.service.retry(user.id, documentId);
  }

  /** 取消上传（U8 档 1）：仅对尚未被 worker 接手的任务生效 */
  @Post(':id/cancel')
  cancel(@CurrentUser() user: { id: string }, @Param('id') documentId: string) {
    return this.service.cancel(user.id, documentId);
  }
}
