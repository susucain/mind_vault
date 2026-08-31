import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { RetrievalQueryDto } from './dto/retrieval-query.dto';
import { RetrievalService } from './retrieval.service';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';

@Controller('retrieval')
@UseGuards(AuthGuard, RateLimitGuard)
export class RetrievalController {
  constructor(private readonly retrieval: RetrievalService) {}

  @Post('keyword')
  keyword(
    @CurrentUser() user: { id: string },
    @Body() body: RetrievalQueryDto,
  ) {
    return this.retrieval.keyword({
      ownerId: user.id,
      query: body.query,
      datasetIds: body.datasetIds,
      topK: body.topK,
    });
  }

  @Post('vector')
  vector(@CurrentUser() user: { id: string }, @Body() body: RetrievalQueryDto) {
    return this.retrieval.vector({
      ownerId: user.id,
      query: body.query,
      datasetIds: body.datasetIds,
      topK: body.topK,
    });
  }

  @Post('graph')
  graph(@CurrentUser() user: { id: string }, @Body() body: RetrievalQueryDto) {
    return this.retrieval.graph({
      ownerId: user.id,
      query: body.query,
      datasetIds: body.datasetIds,
      entityNames: body.entityNames ?? [],
      topK: body.topK,
    });
  }

  @Post('hybrid')
  hybrid(@CurrentUser() user: { id: string }, @Body() body: RetrievalQueryDto) {
    return this.retrieval.hybrid({
      ownerId: user.id,
      query: body.query,
      datasetIds: body.datasetIds,
      entityNames: body.entityNames,
      topK: body.topK,
    });
  }
}
