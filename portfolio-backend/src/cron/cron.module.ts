import { Module } from '@nestjs/common';
import { DailySummaryService } from './daily-summary.service';
import { CronController } from './cron.controller';
import { ContactModule } from '../contact/contact.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { ChatbotModule } from '../chatbot/chatbot.module';

/**
 * Cron jobs module.
 * MailService is provided globally (via MailModule @Global) — no explicit import needed.
 */
@Module({
  imports: [ContactModule, AnalyticsModule, ChatbotModule],
  controllers: [CronController],
  providers: [DailySummaryService],
  exports: [DailySummaryService],
})
export class CronModule {}
