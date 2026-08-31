import { IsString, MaxLength } from 'class-validator';

export class CreateMessageDto {
  @IsString()
  @MaxLength(4000)
  content: string;
}
