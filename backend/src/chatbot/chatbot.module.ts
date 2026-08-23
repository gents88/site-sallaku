import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ChatbotController } from './chatbot.controller';
import { ChatbotService } from './chatbot.service';
import { ChatSession, ChatSessionSchema } from './schemas/chat-session.schema';
import { AboutModule } from '../about/about.module';
import { ProjectsModule } from '../projects/projects.module';
import { BlogModule } from '../blog/blog.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ChatSession.name, schema: ChatSessionSchema },
    ]),
    AboutModule,
    ProjectsModule,
    BlogModule,
  ],
  controllers: [ChatbotController],
  providers: [ChatbotService],
  exports: [ChatbotService],
})
export class ChatbotModule {}
