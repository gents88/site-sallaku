import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LiveHandoffRequest, LiveHandoffRequestSchema } from './schemas/live-handoff-request.schema';
import { LiveHandoffService } from './live-handoff.service';
import { LiveHandoffGateway } from './live-handoff.gateway';
import { LiveHandoffController, LiveHandoffAdminController } from './live-handoff.controller';
import { ChatbotModule } from '../chatbot/chatbot.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: LiveHandoffRequest.name, schema: LiveHandoffRequestSchema }]),
    ChatbotModule,
    AuthModule, // exports JwtModule, reused so the gateway verifies the same JWT_SECRET
  ],
  controllers: [LiveHandoffController, LiveHandoffAdminController],
  providers: [LiveHandoffService, LiveHandoffGateway],
  exports: [LiveHandoffService],
})
export class LiveHandoffModule {}
