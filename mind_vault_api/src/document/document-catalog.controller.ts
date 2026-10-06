import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { QueryDocumentDto } from './dto/query-document.dto';
import { QueryDocumentSectionsDto } from './dto/query-document-sections.dto';
import { DocumentCatalogService } from './document-catalog.service';

@Controller('documents')
@UseGuards(AuthGuard)
export class DocumentCatalogController {
  constructor(private readonly service: DocumentCatalogService) {}

  @Get()
  findAll(
    @CurrentUser() user: { id: string },
    @Query() query: QueryDocumentDto,
  ) {
    return this.service.findAll(user.id, query);
  }

  @Get('datasets/:datasetId/stats')
  datasetStats(
    @CurrentUser() user: { id: string },
    @Param('datasetId') datasetId: string,
  ) {
    return this.service.datasetStats(user.id, datasetId);
  }

  @Get(':id/outline')
  findOutline(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.service.findOutline(user.id, id);
  }

  @Get(':id/sections')
  findSections(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Query() query: QueryDocumentSectionsDto,
  ) {
    return this.service.findSections(user.id, id, query);
  }

  @Get(':id')
  findOne(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.service.findOne(user.id, id);
  }
}
