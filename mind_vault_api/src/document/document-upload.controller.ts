import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Body,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { DocumentUploadService } from './document-upload.service';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';

@Controller('documents')
@UseGuards(AuthGuard, RateLimitGuard)
export class DocumentUploadController {
  constructor(private readonly service: DocumentUploadService) {}

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
    });
  }

  @Get(':id/status')
  status(@CurrentUser() user: { id: string }, @Param('id') documentId: string) {
    return this.service.status(user.id, documentId);
  }

  @Post(':id/retry')
  retry(@CurrentUser() user: { id: string }, @Param('id') documentId: string) {
    return this.service.retry(user.id, documentId);
  }
}
