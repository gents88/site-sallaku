import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as cron from 'node-cron';
import { ContactService } from '../contact/contact.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { ChatbotService } from '../chatbot/chatbot.service';
import { MailService } from '../mail/mail.service';

@Injectable()
export class DailySummaryService implements OnModuleInit {
  private readonly logger = new Logger(DailySummaryService.name);

  /** In-memory guard: stores the last YYYY-MM-DD that a summary was successfully sent. */
  private lastSentDate = '';

  constructor(
    private cfg: ConfigService,
    private contacts: ContactService,
    private analytics: AnalyticsService,
    private chatbot: ChatbotService,
    private mail: MailService,
  ) {}

  onModuleInit() {
    const cronExpr = this.cfg.get<string>('DAILY_SUMMARY_CRON', '0 22 * * *');
    const tz = this.cfg.get<string>('CRON_TIMEZONE', 'Europe/Rome');
    this.logger.log(`Scheduling daily summary: "${cronExpr}" timezone=${tz}`);

    cron.schedule(cronExpr, () => this.executeSummary(), { timezone: tz } as any);
  }

  // ── Public API (used by the manual trigger endpoint) ──────────────────────

  async runNow(): Promise<{ success: boolean; message: string }> {
    this.logger.log('[DailySummary] Manual trigger requested');
    return this.executeSummary(true /* force */);
  }

  // ── Core execution ────────────────────────────────────────────────────────

  private async executeSummary(force = false): Promise<{ success: boolean; message: string }> {
    const now = new Date();
    const todayKey = now.toISOString().slice(0, 10); // YYYY-MM-DD

    // Deduplication: skip if already sent today (unless this is a forced/manual run)
    if (!force && this.lastSentDate === todayKey) {
      this.logger.warn(`[DailySummary] Already sent for ${todayKey} — skipping duplicate execution`);
      return { success: true, message: `Already sent for ${todayKey} — skipped.` };
    }

    this.logger.log(`[DailySummary] Starting — date=${todayKey} force=${force}`);

    try {
      const sent = await this.sendWithRetry(now, 3);
      if (sent) {
        this.lastSentDate = todayKey;
        this.logger.log(`[DailySummary] Completed successfully for ${todayKey}`);
        return { success: true, message: `Daily summary sent for ${todayKey}.` };
      }
      return { success: false, message: 'All send attempts failed — check error logs for details.' };
    } catch (err) {
      this.logger.error('[DailySummary] Unexpected error during execution', err as any);
      return { success: false, message: String((err as any)?.message ?? err) };
    }
  }

  // ── Retry wrapper ─────────────────────────────────────────────────────────

  private async sendWithRetry(now: Date, maxAttempts: number): Promise<boolean> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        this.logger.log(`[DailySummary] Attempt ${attempt}/${maxAttempts}`);
        const success = await this.gatherAndSend(now);
        if (success) return true;
        this.logger.warn(`[DailySummary] Attempt ${attempt}/${maxAttempts} — email not accepted by SMTP`);
      } catch (err) {
        this.logger.error(`[DailySummary] Attempt ${attempt}/${maxAttempts} threw an error`, err as any);
      }

      if (attempt < maxAttempts) {
        const delayMs = attempt * 60_000; // 1 min after 1st fail, 2 min after 2nd
        this.logger.log(`[DailySummary] Waiting ${delayMs / 1000}s before retry ${attempt + 1}/${maxAttempts}…`);
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
    this.logger.error(`[DailySummary] All ${maxAttempts} attempts exhausted — daily summary NOT sent`);
    return false;
  }

  // ── Data gathering + email sending ───────────────────────────────────────

  private async gatherAndSend(now: Date): Promise<boolean> {
    const dateLabel = now.toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });

    // ── Gather data in parallel ──────────────────────────────────────────
    this.logger.log('[DailySummary] Gathering analytics data…');
    const [todaysContacts, todayStats, advanced, chatInteractions] = await Promise.all([
      this.contacts.findToday(),
      this.analytics.getTodayPageViewStats(),
      this.analytics.getAdvancedAnalytics(),
      this.chatbot.getTodayInteractionCount(),
    ]);

    this.logger.log(
      `[DailySummary] Data ready — pageViews=${todayStats.todayPageViews}, ` +
      `uniqueVisitors=${todayStats.uniqueVisitorsToday}, blogViews=${todayStats.todayBlogViews}, ` +
      `chat=${chatInteractions}, contacts=${todaysContacts.length}`,
    );

    const admin = this.cfg.get<string>('EMAIL_TO')
      || this.cfg.get<string>('ADMIN_EMAIL')
      || 'gentsallaku@gmail.com';

    const html = this.buildDailySummaryHtml({
      date: dateLabel,
      todaysContacts,
      todayStats,
      advanced,
      chatInteractions,
    });

    const subject = `📊 Daily Summary — ${now.toISOString().slice(0, 10)}`;
    this.logger.log(`[DailySummary] Sending email → ${admin} subject="${subject}"`);

    const result = await this.mail.send({
      to: admin,
      subject,
      html,
      text: [
        `Daily Summary — ${dateLabel}`,
        ``,
        `Page views today:    ${todayStats.todayPageViews}`,
        `Unique visitors:     ${todayStats.uniqueVisitorsToday}`,
        `Blog article views:  ${todayStats.todayBlogViews}`,
        `Chatbot messages:    ${chatInteractions}`,
        `Contact messages:    ${todaysContacts.length}`,
        ``,
        `Top locations: ${advanced.topLocations.slice(0, 5).map(l => `${l.label} (${l.count})`).join(', ') || 'N/A'}`,
      ].join('\n'),
    });

    if (result.success) {
      this.logger.log(
        `[DailySummary] ✅ Email accepted by SMTP → ${admin} (messageId=${result.messageId})`,
      );
    } else {
      this.logger.error(
        `[DailySummary] ❌ SMTP rejected email → ${admin} ` +
        `accepted=[${result.accepted.join(',')}] rejected=[${result.rejected.join(',')}]`,
      );
    }

    return result.success;
  }

  // ── HTML builder ──────────────────────────────────────────────────────────

  private buildDailySummaryHtml(data: {
    date: string;
    todaysContacts: any[];
    todayStats: { todayPageViews: number; uniqueVisitorsToday: number; todayBlogViews: number };
    advanced: Awaited<ReturnType<AnalyticsService['getAdvancedAnalytics']>>;
    chatInteractions: number;
  }): string {
    const { date, todaysContacts, todayStats, advanced, chatInteractions } = data;

    const statCard = (icon: string, label: string, value: string | number, color: string) => `
      <td style="padding:8px;">
        <div style="background:#0f1831;border:1px solid ${color}33;border-radius:10px;padding:18px 20px;text-align:center;min-width:110px;">
          <div style="font-size:1.6rem;margin-bottom:6px;">${icon}</div>
          <div style="font-size:1.6rem;font-weight:700;color:${color};line-height:1;">${value}</div>
          <div style="font-size:0.75rem;color:#64748b;margin-top:4px;text-transform:uppercase;letter-spacing:0.05em;">${label}</div>
        </div>
      </td>`;

    const locationRows = advanced.topLocations.slice(0, 8).map((l, i) => `
      <tr style="${i % 2 === 0 ? '' : 'background:rgba(255,255,255,0.02);'}">
        <td style="padding:8px 16px;color:#94a3b8;">${i + 1}</td>
        <td style="padding:8px 16px;color:#e2e8f0;">${l.label}</td>
        <td style="padding:8px 16px;text-align:right;">
          <span style="background:rgba(79,106,245,0.15);color:#818cf8;padding:2px 10px;border-radius:12px;font-size:0.82rem;">${l.count}</span>
        </td>
      </tr>`).join('') || `<tr><td colspan="3" style="padding:12px 16px;color:#475569;text-align:center;">No location data</td></tr>`;

    const deviceRows = advanced.deviceBreakdown.map((d, i) => `
      <tr style="${i % 2 === 0 ? '' : 'background:rgba(255,255,255,0.02);'}">
        <td style="padding:7px 16px;color:#e2e8f0;">${d.label}</td>
        <td style="padding:7px 16px;text-align:right;color:#94a3b8;">${d.count}</td>
      </tr>`).join('') || `<tr><td colspan="2" style="padding:10px 16px;color:#475569;">No data</td></tr>`;

    const contactRows = todaysContacts.length
      ? todaysContacts.map((m, i) => `
        <tr style="${i % 2 === 0 ? '' : 'background:rgba(255,255,255,0.025);'}">
          <td style="padding:8px 12px;color:#94a3b8;font-size:0.8rem;white-space:nowrap;">${new Date(m.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</td>
          <td style="padding:8px 12px;color:#e2e8f0;font-weight:500;">${m.name}</td>
          <td style="padding:8px 12px;color:#818cf8;font-size:0.85rem;">${m.email}</td>
          <td style="padding:8px 12px;color:#94a3b8;font-size:0.85rem;">${(m.message ?? '').slice(0, 80)}${(m.message ?? '').length > 80 ? '…' : ''}</td>
        </tr>`).join('')
      : `<tr><td colspan="4" style="padding:14px;color:#475569;text-align:center;">No messages today</td></tr>`;

    return `
      <div style="font-family:Inter,sans-serif;max-width:680px;margin:0 auto;background:#0a0e1a;color:#e2e8f0;border-radius:14px;overflow:hidden;">

        <!-- Header -->
        <div style="background:linear-gradient(135deg,#1e3a5f,#1e1b4b);padding:32px 36px;border-bottom:1px solid rgba(79,106,245,0.3);">
          <div style="display:flex;align-items:center;gap:14px;">
            <span style="font-family:monospace;font-size:1.8rem;font-weight:700;color:#fff;">&lt;GS /&gt;</span>
            <div>
              <div style="color:rgba(255,255,255,0.6);font-size:0.72rem;text-transform:uppercase;letter-spacing:0.1em;">Automated Analytics Report</div>
              <h1 style="color:#fff;margin:4px 0 0;font-size:1.3rem;">📊 Daily Summary</h1>
              <div style="color:#818cf8;font-size:0.88rem;margin-top:2px;">${date}</div>
            </div>
          </div>
        </div>

        <div style="padding:28px 32px;">

          <!-- KPI Stats Row -->
          <table style="width:100%;border-collapse:collapse;margin-bottom:28px;">
            <tr>
              ${statCard('👁️', 'Page Views', todayStats.todayPageViews, '#818cf8')}
              ${statCard('👤', 'Unique Visitors', todayStats.uniqueVisitorsToday, '#38bdf8')}
              ${statCard('🤖', 'Chat Messages', chatInteractions, '#34d399')}
              ${statCard('✉️', 'Contact Forms', todaysContacts.length, '#f59e0b')}
            </tr>
            <tr>
              ${statCard('📰', 'Blog Views', todayStats.todayBlogViews, '#a78bfa')}
            </tr>
          </table>

          <!-- Visitor Locations -->
          <div style="background:#0f1831;border-radius:10px;border:1px solid rgba(79,106,245,0.2);overflow:hidden;margin-bottom:20px;">
            <div style="background:rgba(79,106,245,0.12);padding:12px 16px;border-bottom:1px solid rgba(79,106,245,0.2);">
              <span style="color:#818cf8;font-size:0.75rem;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;">🌍 Top Visitor Locations</span>
            </div>
            <table style="width:100%;border-collapse:collapse;">
              <thead>
                <tr style="background:rgba(255,255,255,0.03);">
                  <th style="padding:8px 16px;text-align:left;color:#475569;font-size:0.75rem;font-weight:500;">#</th>
                  <th style="padding:8px 16px;text-align:left;color:#475569;font-size:0.75rem;font-weight:500;">Location</th>
                  <th style="padding:8px 16px;text-align:right;color:#475569;font-size:0.75rem;font-weight:500;">Visits</th>
                </tr>
              </thead>
              <tbody>${locationRows}</tbody>
            </table>
          </div>

          <!-- Two-column: Traffic Sources + Devices -->
          <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
            <tr>
              <td style="padding:0 10px 0 0;vertical-align:top;width:50%;">
                <div style="background:#0f1831;border-radius:10px;border:1px solid rgba(52,211,153,0.2);overflow:hidden;">
                  <div style="background:rgba(52,211,153,0.1);padding:10px 16px;border-bottom:1px solid rgba(52,211,153,0.15);">
                    <span style="color:#34d399;font-size:0.75rem;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;">📡 Traffic Sources</span>
                  </div>
                  <table style="width:100%;border-collapse:collapse;">
                    ${advanced.trafficSources.map((t, i) => `<tr style="${i % 2 === 0 ? '' : 'background:rgba(255,255,255,0.02);'}"><td style="padding:7px 16px;color:#e2e8f0;">${t.label}</td><td style="padding:7px 16px;text-align:right;color:#94a3b8;">${t.count}</td></tr>`).join('') || '<tr><td colspan="2" style="padding:10px 16px;color:#475569;">No data</td></tr>'}
                  </table>
                </div>
              </td>
              <td style="padding:0 0 0 10px;vertical-align:top;width:50%;">
                <div style="background:#0f1831;border-radius:10px;border:1px solid rgba(56,189,248,0.2);overflow:hidden;">
                  <div style="background:rgba(56,189,248,0.09);padding:10px 16px;border-bottom:1px solid rgba(56,189,248,0.15);">
                    <span style="color:#38bdf8;font-size:0.75rem;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;">📱 Devices</span>
                  </div>
                  <table style="width:100%;border-collapse:collapse;">${deviceRows}</table>
                </div>
              </td>
            </tr>
          </table>

          <!-- Contact Messages Today -->
          <div style="background:#0f1831;border-radius:10px;border:1px solid rgba(245,158,11,0.2);overflow:hidden;">
            <div style="background:rgba(245,158,11,0.1);padding:12px 16px;border-bottom:1px solid rgba(245,158,11,0.2);">
              <span style="color:#f59e0b;font-size:0.75rem;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;">✉️ Contact Messages Today (${todaysContacts.length})</span>
            </div>
            <table style="width:100%;border-collapse:collapse;">
              <thead>
                <tr style="background:rgba(255,255,255,0.03);">
                  <th style="padding:8px 12px;text-align:left;color:#475569;font-size:0.73rem;font-weight:500;">Time</th>
                  <th style="padding:8px 12px;text-align:left;color:#475569;font-size:0.73rem;font-weight:500;">Name</th>
                  <th style="padding:8px 12px;text-align:left;color:#475569;font-size:0.73rem;font-weight:500;">Email</th>
                  <th style="padding:8px 12px;text-align:left;color:#475569;font-size:0.73rem;font-weight:500;">Preview</th>
                </tr>
              </thead>
              <tbody>${contactRows}</tbody>
            </table>
          </div>

        </div>

        <!-- Footer -->
        <div style="background:#070b15;padding:16px 32px;text-align:center;border-top:1px solid rgba(255,255,255,0.05);">
          <p style="margin:0;font-size:0.78rem;color:#334155;">
            Automated daily report · <a href="https://gentsallaku.it/admin" style="color:#818cf8;">View Dashboard</a>
            &nbsp;·&nbsp; © ${new Date().getFullYear()} Gent Sallaku
          </p>
        </div>
      </div>
    `;
  }
}
