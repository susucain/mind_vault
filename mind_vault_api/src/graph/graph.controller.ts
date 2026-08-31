import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { GraphSearchDto } from './dto/graph-search.dto';
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
}
