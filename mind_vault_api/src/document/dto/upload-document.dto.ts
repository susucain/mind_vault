import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UploadDocumentDto {
  @IsString()
  datasetId: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  tags?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  sourceFileName?: string;
}
