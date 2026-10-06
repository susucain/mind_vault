import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { RetrievalQueryDto } from './dto/retrieval-query.dto';
import { SearchQueryDto } from './dto/search-query.dto';
import { RetrievalService } from './retrieval.service';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';
import { SearchHistoryService } from '../search-history/search-history.service';
import { SearchHistoryFiltersDto } from '../search-history/dto/search-history-filters.dto';

@Controller('retrieval')
@UseGuards(AuthGuard, RateLimitGuard)
export class RetrievalController {
  constructor(
    private readonly retrieval: RetrievalService,
    private readonly history: SearchHistoryService,
  ) {}

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

  @Post('search')
  async search(
    @CurrentUser() user: { id: string },
    @Body() body: SearchQueryDto,
  ) {
    const result = await this.retrieval.search({ ownerId: user.id, ...body });
    // 仅首页记录，翻页不重复；record 内部已做异常隔离，写库失败不影响检索
    if ((body.page ?? 1) === 1) {
      const filters: SearchHistoryFiltersDto = {
        sort: body.sort ?? 'relevance',
        from: body.from ?? null,
        to: body.to ?? null,
        pageSize: body.pageSize ?? 10,
        maxHops: body.maxHops ?? 1,
      };
      await this.history.record({
        ownerId: user.id,
        mode: body.mode,
        query: body.query,
        datasetIds: body.datasetIds ?? [],
        entityNames: body.entityNames ?? [],
        filters,
        resultCount: result.total,
      });
    }
    return result;
  }
}
