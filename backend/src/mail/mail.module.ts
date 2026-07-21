import { Module, Global } from '@nestjs/common';
import { MailService } from './mail.service';
import { MailQueueService } from './mail-queue.service';
import { TemplateRendererService } from './template-renderer.service';
import { ContactModule } from '../contact/contact.module';
import { AnalyticsModule } from '../analytics/analytics.module';

/** Global so any module can inject MailService without re-importing */
@Global()
@Module({
  imports: [ContactModule, AnalyticsModule],
  providers: [MailService, MailQueueService, TemplateRendererService],
  exports: [MailService, MailQueueService, TemplateRendererService],
})
export class MailModule {}
