import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const INTERVIEW_TOPICS = [
  'project_deep_dive',
  'technical_fundamentals',
  'behavioral',
] as const;

export const INTERVIEW_INTENSITIES = ['quick', 'deep'] as const;

export class CreateInterviewSessionDto {
  @IsString()
  datasetId: string;

  @IsString()
  @IsIn(INTERVIEW_TOPICS)
  topic: string;

  @IsString()
  @IsIn(INTERVIEW_INTENSITIES)
  intensity: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  focus?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  jobDescription?: string;

  @IsInt()
  @Min(1)
  @Max(20)
  totalQuestions = 5;
}
