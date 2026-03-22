import { Module, Global } from '@nestjs/common';
import { MailService } from './mail.service';
import { MailQueueService } from './mail-queue.service';
import { DailySummaryService } from '../cron/daily-summary.service';
import { ContactModule } from '../contact/contact.module';
import { AnalyticsModule } from '../analytics/analytics.module';

/** Global so any module can inject MailService without re-importing */
@Global()
@Module({
  imports: [ContactModule, AnalyticsModule],
  providers: [MailService, MailQueueService, DailySummaryService],
  exports: [MailService, MailQueueService],
})
export class MailModule {}
