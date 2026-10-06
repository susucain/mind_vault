import {
  Controller,
  Delete,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';
import { ListSearchHistoryDto } from './dto/list-search-history.dto';
import { SearchHistoryService } from './search-history.service';

@Controller('search-history')
@UseGuards(AuthGuard, RateLimitGuard)
export class SearchHistoryController {
  constructor(private readonly history: SearchHistoryService) {}

  @Get()
  async list(
    @CurrentUser() user: { id: string },
    @Query() query: ListSearchHistoryDto,
  ) {
    const items = await this.history.list(user.id, query.limit ?? 20);
    return { items };
  }

  @Delete(':id')
  async remove(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    await this.history.remove(user.id, id);
    return { deleted: 1 };
  }

  @Delete()
  clear(@CurrentUser() user: { id: string }) {
    return this.history.clear(user.id);
  }
}
