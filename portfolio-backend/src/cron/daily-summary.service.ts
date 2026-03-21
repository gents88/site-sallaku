import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as cron from 'node-cron';
import { ContactService } from '../contact/contact.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { MailService } from '../mail/mail.service';

@Injectable()
export class DailySummaryService implements OnModuleInit {
  private readonly logger = new Logger(DailySummaryService.name);

  constructor(
    private cfg: ConfigService,
    private contacts: ContactService,
    private analytics: AnalyticsService,
    private mail: MailService,
  ) {}

  onModuleInit() {
    const cronExpr = this.cfg.get<string>('DAILY_SUMMARY_CRON', '0 22 * * *'); // default 22:00 server time
    this.logger.log(`Scheduling daily summary with cron expression: ${cronExpr}`);

    cron.schedule(cronExpr, async () => {
      try {
        this.logger.log('Running daily summary job');
        const now = new Date();
        const start = new Date(now);
        start.setHours(0, 0, 0, 0);
        const end = new Date(now);
        end.setHours(23, 59, 59, 999);

        // Contacts today
        const contactsToday = await this.contacts.findAll(1000);
        const todays = contactsToday.filter(c => {
          const d = new Date((c as any).createdAt);
          return d >= start && d <= end;
        });

        const visitSummary = await this.analytics.getVisitSummary(1);

        const admin = this.cfg.get<string>('EMAIL_TO')
          || this.cfg.get<string>('ADMIN_EMAIL')
          || 'gentsallaku@gmail.com';

        const html = this.buildHtmlSummary(todays, visitSummary);
        await this.mail.send({
          to: admin,
          subject: `Daily summary — ${now.toISOString().slice(0, 10)}`,
          html,
          text: `Daily summary: ${todays.length} messages, ${visitSummary.totalViews} visits`,
        });

        this.logger.log('Daily summary sent');
      } catch (err) {
        this.logger.error('Daily summary job failed', err as any);
      }
    });
  }

  private buildHtmlSummary(messages: any[], visits: Awaited<ReturnType<AnalyticsService['getVisitSummary']>>): string {
    const rows = messages
      .map(m => `<tr><td style="padding:8px;border-bottom:1px solid #eee;">${new Date(m.createdAt).toLocaleString()}</td><td style="padding:8px;border-bottom:1px solid #eee;">${m.name} &lt;${m.email}&gt;</td><td style="padding:8px;border-bottom:1px solid #eee;">${m.message.slice(0,200)}${m.message.length>200?'...':''}</td></tr>`)
      .join('');

    return `
      <div style="font-family:Inter,sans-serif;max-width:680px;margin:0 auto;">
        <h2>Daily summary</h2>
        <p>Messages today: <strong>${messages.length}</strong></p>
        <p>Total visits: <strong>${visits.totalViews}</strong></p>
        <table style="width:100%;border-collapse:collapse;margin-top:16px;">
          <thead><tr><th style="text-align:left;padding:8px;border-bottom:2px solid #ddd">When</th><th style="text-align:left;padding:8px;border-bottom:2px solid #ddd">From</th><th style="text-align:left;padding:8px;border-bottom:2px solid #ddd">Preview</th></tr></thead>
          <tbody>
            ${rows || '<tr><td colspan="3" style="padding:8px;color:#666;">No messages today</td></tr>'}
          </tbody>
        </table>
      </div>
    `;
  }
}
