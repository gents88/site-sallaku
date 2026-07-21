import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { ContactService } from '../contact/contact.service';
import { AnalyticsService, BreakdownItem } from '../analytics/analytics.service';
import { ChatbotService } from '../chatbot/chatbot.service';
import { MailService } from '../mail/mail.service';
import { TemplateRendererService } from '../mail/template-renderer.service';
import { CronState, CronStateDocument } from './schemas/cron-state.schema';

const DAILY_SUMMARY_JOB = 'daily-summary';

// ── View models consumed by templates/daily-summary.hbs (logic-less) ────────

interface StatCardVM {
  icon: string;
  label: string;
  value: number | string;
  color: string;
}

interface BreakdownRowVM {
  rank?: number;
  label: string;
  count: number;
  /** Bar length as % of the table's max count (min 4 so tiny values stay visible) */
  barWidth: number;
  zebra: boolean;
}

interface BreakdownTableVM {
  icon: string;
  title: string;
  accent: string;
  emptyText: string;
  rows: BreakdownRowVM[];
}

@Injectable()
export class DailySummaryService {
  private readonly logger = new Logger(DailySummaryService.name);

  constructor(
    private cfg: ConfigService,
    private contacts: ContactService,
    private analytics: AnalyticsService,
    private chatbot: ChatbotService,
    private mail: MailService,
    private templates: TemplateRendererService,
    @InjectModel(CronState.name) private cronStateModel: Model<CronStateDocument>,
  ) {}

  // ── Scheduled jobs ────────────────────────────────────────────────────────

  /** Daily summary email at 22:00 Europe/Rome */
  @Cron('0 22 * * *', { name: 'daily-summary', timeZone: 'Europe/Rome' })
  async scheduledDailySummary(): Promise<void> {
    this.logger.log('[DailySummary] Scheduled trigger fired');
    await this.executeSummary();
  }

  /** Monthly analytics reset at 00:00 on the 1st of every month */
  @Cron('0 0 1 * *', { name: 'monthly-analytics-reset', timeZone: 'Europe/Rome' })
  async scheduledMonthlyReset(): Promise<void> {
    this.logger.log('[AnalyticsReset] Monthly reset cron triggered');
    this.analytics.resetMonthlyStats().catch(err =>
      this.logger.error('[AnalyticsReset] Monthly reset failed', err as any),
    );
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

    // Deduplication: check MongoDB so restarts don't re-send
    if (!force) {
      const state = await this.cronStateModel
        .findOne({ jobName: DAILY_SUMMARY_JOB })
        .lean()
        .exec();
      if (state?.lastSentDate === todayKey) {
        this.logger.warn(`[DailySummary] Already sent for ${todayKey} — skipping duplicate execution`);
        return { success: true, message: `Already sent for ${todayKey} — skipped.` };
      }
    }

    this.logger.log(`[DailySummary] Starting — date=${todayKey} force=${force}`);

    try {
      const sent = await this.sendWithRetry(now, 3);
      if (sent) {
        await this.cronStateModel
          .findOneAndUpdate(
            { jobName: DAILY_SUMMARY_JOB },
            { lastSentDate: todayKey },
            { upsert: true, new: true },
          )
          .exec();
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
    const [todaysContacts, todayStats, advanced, engagement, chatInteractions] = await Promise.all([
      this.contacts.findToday(),
      this.analytics.getTodayPageViewStats(),
      this.analytics.getAdvancedAnalytics(),
      this.analytics.getDailyEngagementReport(),
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

    const html = this.templates.render('daily-summary', this.buildTemplateData({
      date: dateLabel,
      todaysContacts,
      todayStats,
      advanced,
      engagement,
      chatInteractions,
    }));

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
        `New / returning:     ${engagement.newVisitors} / ${engagement.returningVisitors}`,
        `Blog article views:  ${todayStats.todayBlogViews}`,
        `Chatbot messages:    ${chatInteractions}`,
        `Contact messages:    ${todaysContacts.length}`,
        ``,
        `Top pages today:`,
        ...engagement.pages.slice(0, 8).map(p =>
          `  ${p.path} — ${p.views} views / ${p.uniqueVisitors} unique (${p.viewsPerVisitor}x)` +
          (p.avgDurationSec != null ? `, avg ${p.avgDurationSec}s` : ''),
        ),
        ``,
        `Sources today: ${engagement.sources.map(s => `${s.label} (${s.count})`).join(', ') || 'N/A'}`,
        `Top referrers: ${engagement.topReferrers.slice(0, 5).map(r => `${r.label} (${r.count})`).join(', ') || 'N/A'}`,
        `Campaigns:     ${engagement.campaigns.slice(0, 5).map(c => `${c.label} (${c.count})`).join(', ') || 'N/A'}`,
        `Locations today:    ${engagement.locations.slice(0, 5).map(l => `${l.label} (${l.count})`).join(', ') || 'N/A'}`,
        `Locations all time: ${advanced.topLocations.slice(0, 5).map(l => `${l.label} (${l.count})`).join(', ') || 'N/A'}`,
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

  // ── Template data builder ─────────────────────────────────────────────────

  /**
   * Shapes the aggregated analytics into the logic-less view model consumed by
   * templates/daily-summary.hbs. All presentation decisions (bar widths, zebra
   * striping, duration formatting) happen here, not in the template.
   */
  private buildTemplateData(data: {
    date: string;
    todaysContacts: any[];
    todayStats: { todayPageViews: number; uniqueVisitorsToday: number; todayBlogViews: number };
    advanced: Awaited<ReturnType<AnalyticsService['getAdvancedAnalytics']>>;
    engagement: Awaited<ReturnType<AnalyticsService['getDailyEngagementReport']>>;
    chatInteractions: number;
  }): Record<string, unknown> {
    const { date, todaysContacts, todayStats, advanced, engagement, chatInteractions } = data;

    const kpiRows: StatCardVM[][] = [
      [
        { icon: '👁️', label: 'Page Views', value: todayStats.todayPageViews, color: '#818cf8' },
        { icon: '👤', label: 'Unique Visitors', value: todayStats.uniqueVisitorsToday, color: '#38bdf8' },
        { icon: '🤖', label: 'Chat Messages', value: chatInteractions, color: '#34d399' },
        { icon: '✉️', label: 'Contact Forms', value: todaysContacts.length, color: '#f59e0b' },
      ],
      [
        { icon: '📰', label: 'Blog Views', value: todayStats.todayBlogViews, color: '#a78bfa' },
        { icon: '🆕', label: 'New Visitors', value: engagement.newVisitors, color: '#4ade80' },
        { icon: '🔁', label: 'Returning', value: engagement.returningVisitors, color: '#fb7185' },
      ],
    ];

    const maxPageViews = Math.max(1, ...engagement.pages.map(p => p.views));
    const pages = engagement.pages.slice(0, 10).map((p, i) => ({
      path: p.path,
      views: p.views,
      uniqueVisitors: p.uniqueVisitors,
      viewsPerVisitor: p.viewsPerVisitor,
      repeatVisitors: p.repeatVisitors,
      avgTime: this.formatDuration(p.avgDurationSec),
      barWidth: Math.max(4, Math.round((p.views / maxPageViews) * 100)),
      zebra: i % 2 === 1,
    }));

    const tablePairs = [
      {
        left: this.toBreakdownTable(
          { icon: '📡', title: 'Traffic Sources — Today', accent: '#34d399', emptyText: 'No data' },
          engagement.sources, 6),
        right: this.toBreakdownTable(
          { icon: '📱', title: 'Devices', accent: '#38bdf8', emptyText: 'No data' },
          advanced.deviceBreakdown, 5),
      },
      {
        left: this.toBreakdownTable(
          { icon: '🔗', title: 'External Referrers — Today', accent: '#fb7185', emptyText: 'No external referrers' },
          engagement.topReferrers, 6),
        right: this.toBreakdownTable(
          { icon: '🎯', title: 'UTM Campaigns — Today', accent: '#4ade80', emptyText: 'No campaign traffic' },
          engagement.campaigns, 6),
      },
      {
        left: this.toBreakdownTable(
          { icon: '🌍', title: 'Top Visitor Locations — Today', accent: '#818cf8', emptyText: 'No location data today' },
          engagement.locations, 8),
        right: this.toBreakdownTable(
          { icon: '🌐', title: 'Top Visitor Locations — All Time', accent: '#f59e0b', emptyText: 'No location data' },
          advanced.topLocations, 8),
      },
    ];

    const contacts = todaysContacts.map((m, i) => ({
      time: new Date(m.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      name: m.name,
      email: m.email,
      preview: `${(m.message ?? '').slice(0, 80)}${(m.message ?? '').length > 80 ? '…' : ''}`,
      zebra: i % 2 === 1,
    }));

    return {
      date,
      year: new Date().getFullYear(),
      kpiRows,
      pages,
      tablePairs,
      contacts,
    };
  }

  private toBreakdownTable(
    header: Omit<BreakdownTableVM, 'rows'>,
    items: BreakdownItem[],
    limit: number,
    ranked = false,
  ): BreakdownTableVM {
    const sliced = items.slice(0, limit);
    const max = Math.max(1, ...sliced.map(i => i.count));
    return {
      ...header,
      rows: sliced.map((item, i) => ({
        ...(ranked ? { rank: i + 1 } : {}),
        label: item.label,
        count: item.count,
        barWidth: Math.max(4, Math.round((item.count / max) * 100)),
        zebra: i % 2 === 1,
      })),
    };
  }

  private formatDuration(sec: number | null): string {
    if (sec == null) return '—';
    return sec >= 60 ? `${Math.floor(sec / 60)}m ${sec % 60}s` : `${sec}s`;
  }
}
