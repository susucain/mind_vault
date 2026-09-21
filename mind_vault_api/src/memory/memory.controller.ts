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
import { RateLimitGuard } from '../common/guards/rate-limit.guard';
import { CreateMemoryDto } from './dto/create-memory.dto';
import { ListMemoriesDto } from './dto/list-memories.dto';
import { UpdateMemoryDto } from './dto/update-memory.dto';
import { MemoryService } from './memory.service';

@Controller('memories')
@UseGuards(AuthGuard, RateLimitGuard)
export class MemoryController {
  constructor(private readonly memories: MemoryService) {}

  @Post()
  create(@CurrentUser() user: { id: string }, @Body() dto: CreateMemoryDto) {
    return this.memories.create(user.id, dto);
  }

  @Get()
  list(@CurrentUser() user: { id: string }, @Query() query: ListMemoriesDto) {
    return this.memories.list(user.id, query.status);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateMemoryDto,
  ) {
    return this.memories.update(user.id, id, dto);
  }

  @Delete()
  clear(@CurrentUser() user: { id: string }) {
    return this.memories.clear(user.id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.memories.remove(user.id, id);
  }
}
