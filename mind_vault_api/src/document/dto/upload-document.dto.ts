import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

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

  /** 是否构建知识图谱。multipart 表单字段均为字符串，需显式转布尔，缺省视为不构建 */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === true || value === 'true' || value === '1' ? true : false,
  )
  @IsBoolean()
  graphEnabled?: boolean;
}
