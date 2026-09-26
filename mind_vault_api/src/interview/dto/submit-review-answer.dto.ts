import { IsString, MaxLength, MinLength } from 'class-validator';

export class SubmitReviewAnswerDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  answer: string;
}
