import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DailySummaryService } from './daily-summary.service';
import { CronController } from './cron.controller';
import { ContactModule } from '../contact/contact.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { ChatbotModule } from '../chatbot/chatbot.module';
import { CronState, CronStateSchema } from './schemas/cron-state.schema';

/**
 * Cron jobs module.
 * MailService is provided globally (via MailModule @Global) — no explicit import needed.
 */
@Module({
  imports: [
    ContactModule,
    AnalyticsModule,
    ChatbotModule,
    MongooseModule.forFeature([{ name: CronState.name, schema: CronStateSchema }]),
  ],
  controllers: [CronController],
  providers: [DailySummaryService],
  exports: [DailySummaryService],
})
export class CronModule {}
