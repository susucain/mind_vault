import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { EntitySuggestDto } from './dto/entity-suggest.dto';
import { GraphSearchDto } from './dto/graph-search.dto';
import { NeighborhoodDto } from './dto/neighborhood.dto';
import { KnowledgeGraphService } from './knowledge-graph.service';

@Controller('graph')
@UseGuards(AuthGuard)
export class GraphController {
  constructor(private readonly graph: KnowledgeGraphService) {}

  @Get('search')
  search(@CurrentUser() user: { id: string }, @Query() query: GraphSearchDto) {
    return this.graph.search({
      ownerId: user.id,
      entityNames: query.entityNames,
      datasetIds: query.datasetIds,
      maxHops: query.maxHops,
    });
  }

  /** 实体联想：q 缺省时返回热门实体，用于输入提示与空白引导 */
  @Get('entities')
  async entities(
    @CurrentUser() user: { id: string },
    @Query() query: EntitySuggestDto,
  ) {
    const items = await this.graph.findEntities({
      ownerId: user.id,
      q: query.q,
      types: query.types,
      limit: query.limit,
    });
    return { items };
  }

  /** 邻域展开：返回可交互探索的图谱视图 */
  @Post('neighborhood')
  neighborhood(
    @CurrentUser() user: { id: string },
    @Body() body: NeighborhoodDto,
  ) {
    return this.graph.neighborhood({
      ownerId: user.id,
      entities: [body.entity],
      maxHops: body.maxHops,
      entityTypes: body.entityTypes,
      relationTypes: body.relationTypes,
      datasetIds: body.datasetIds,
      limit: body.limit,
    });
  }
}
