import { ArrayMaxSize, ArrayMinSize, IsArray, IsString } from 'class-validator';

export class UpdateConversationDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsString({ each: true })
  datasetIds: string[];
}
