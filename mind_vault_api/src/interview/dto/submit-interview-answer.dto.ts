import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class SubmitInterviewAnswerDto {
  @IsString()
  @MaxLength(4000)
  answer: string;

  /** 跳过本题：不将占位文本当作正式答案，也不参与评估与复习项提取。 */
  @IsOptional()
  @IsBoolean()
  skipped?: boolean;
}
