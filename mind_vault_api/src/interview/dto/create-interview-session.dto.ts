import { IsInt, IsIn, IsString, Max, Min } from 'class-validator';

export class CreateInterviewSessionDto {
  @IsString()
  datasetId: string;

  @IsString()
  @IsIn(['quick_qa', 'project_deep_dive', 'technical', 'behavioral'])
  mode: string;

  @IsInt()
  @Min(1)
  @Max(20)
  totalQuestions = 5;
}
