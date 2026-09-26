import { IsIn } from 'class-validator';

export class UpdateReviewItemDto {
  @IsIn(['PENDING', 'COMPLETED'])
  status: 'PENDING' | 'COMPLETED';
}
