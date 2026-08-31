import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateDatasetDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
