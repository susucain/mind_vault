import { Controller, Delete, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { DocumentLifecycleService } from './document-lifecycle.service';

@Controller('documents')
@UseGuards(AuthGuard)
export class DocumentLifecycleController {
  constructor(private readonly service: DocumentLifecycleService) {}

  @Delete(':id')
  remove(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.service.remove(user.id, id);
  }
}
