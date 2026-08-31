import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { CreateDatasetDto } from './dto/create-dataset.dto';
import { QueryDatasetDto } from './dto/query-dataset.dto';
import { DatasetService } from './dataset.service';

@Controller('datasets')
@UseGuards(AuthGuard)
export class DatasetController {
  constructor(private readonly service: DatasetService) {}

  @Post()
  create(@CurrentUser() user: { id: string }, @Body() dto: CreateDatasetDto) {
    return this.service.create(user.id, dto);
  }

  @Get()
  findAll(
    @CurrentUser() user: { id: string },
    @Query() query: QueryDatasetDto,
  ) {
    return this.service.findAll(user.id, query);
  }

  @Get(':id')
  findOne(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.service.findOne(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: CreateDatasetDto,
  ) {
    return this.service.update(user.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.service.remove(user.id, id);
  }
}
