import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { RetrievalModule } from '../retrieval/retrieval.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { RagAgentService } from './agent/rag-agent.service';
import { RagModelService } from './agent/rag-model.service';
import { ChatCitationEntity } from './entities/citation.entity';
import { ConversationEntity } from './entities/conversation.entity';
import { ChatMessageEntity } from './entities/chat-message.entity';

@Module({
  imports: [
    AuthModule,
    RetrievalModule,
    TypeOrmModule.forFeature([
      ConversationEntity,
      ChatMessageEntity,
      ChatCitationEntity,
    ]),
  ],
  controllers: [ChatController],
  providers: [ChatService, RagAgentService, RagModelService],
})
export class ChatModule {}
