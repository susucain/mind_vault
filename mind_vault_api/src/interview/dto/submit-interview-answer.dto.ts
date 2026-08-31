import { IsString, MaxLength } from 'class-validator';

export class SubmitInterviewAnswerDto {
  @IsString()
  @MaxLength(4000)
  answer: string;
}
