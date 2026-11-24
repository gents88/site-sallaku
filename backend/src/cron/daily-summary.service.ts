import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { ContactService } from '../contact/contact.service';
import { AnalyticsQueryService } from '../analytics/services/analytics-query.service';
import { AnalyticsExportService } from '../analytics/services/analytics-export.service';
import { BreakdownItem } from '../analytics/analytics.types';
import { ChatbotService } from '../chatbot/chatbot.service';
import { MailService } from '../mail/mail.service';
import { TemplateRendererService } from '../mail/template-renderer.service';
import { CronState, CronStateDocument } from './schemas/cron-state.schema';
import { AdminOverviewService } from '../stats/admin-overview.service';
import { buildChatSummary, buildSubject, buildSystemRows, buildTodo, buildTrend, formatItalianDate, ChatSummary, SystemRow, Trend, TodoItem } from './daily-summary.model';

const DAILY_SUMMARY_JOB = 'daily-summary';

// ── View models consumed by templates/daily-summary.hbs (logic-less) ────────

interface StatCardVM {
  icon: string;
  label: string;
  value: number | string;
  color: string;
  /** Confronto con ieri e con la media dei 7 giorni (solo per le metriche che hanno una serie giornaliera). */
  trend?: {
    avg7: number;
    vsYesterday: { label: string; color: string };
    vsAvg: { label: string; color: string };
  };
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
    private analyticsQuery: AnalyticsQueryService,
    private analyticsExport: AnalyticsExportService,
    private chatbot: ChatbotService,
    private mail: MailService,
    private templates: TemplateRendererService,
    @InjectModel(CronState.name) private cronStateModel: Model<CronStateDocument>,
    // @Optional: senza, l'email esce come prima (senza "Da fare domani", confronti e Search Console).
    @Optional() private overview?: AdminOverviewService,
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
    this.analyticsExport.resetMonthlyStats().catch(err =>
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
    const dateLabel = formatItalianDate(now);

    // ── Gather data in parallel ──────────────────────────────────────────
    this.logger.log('[DailySummary] Gathering analytics data…');
    const [todaysContacts, todayStats, advanced, engagement, chatInteractions] = await Promise.all([
      this.contacts.findToday(),
      this.analyticsQuery.getTodayPageViewStats(),
      this.analyticsQuery.getAdvancedAnalytics(),
      this.analyticsQuery.getDailyEngagementReport(),
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

    // Confronti, "Da fare domani" e Search Console: un blocco che fallisce si salta, l'email parte comunque.
    const extras = await this.gatherExtras(now);
    const todo = buildTodo({
      now,
      notifications: extras.notifications,
      serverErrors: extras.sections?.['serverErrors'] as any,
      serverHealth: extras.sections?.['serverHealth'] as any,
      notFound: extras.sections?.['notFound'] as any,
      translationHealth: extras.sections?.['translationHealth'] as any,
      scheduledPosts: extras.sections?.['scheduledPosts'] as any,
    });

    const html = this.templates.render('daily-summary', this.buildTemplateData({
      date: dateLabel,
      todaysContacts,
      todayStats,
      advanced,
      engagement,
      chatInteractions,
      viewsTrend: extras.viewsTrend,
      contactsTrend: extras.contactsTrend,
      todo,
      gsc: extras.sections?.['gsc'] as any,
      chat: extras.chat,
      system: buildSystemRows({
        serverHealth: extras.sections?.['serverHealth'] as any,
        aiUsage: extras.sections?.['aiUsage'] as any,
        security: extras.sections?.['security'] as any,
      }),
    }));

    const subject = buildSubject({
      pageViews: todayStats.todayPageViews,
      contacts: todaysContacts.length,
      todo: todo.length,
      now,
    });
    this.logger.log(`[DailySummary] Sending email → ${admin} subject="${subject}"`);

    const result = await this.mail.send({
      to: admin,
      subject,
      html,
      text: [
        `Riepilogo giornaliero — ${dateLabel}`,
        ``,
        ...(todo.length
          ? [`Da fare domani:`, ...todo.map(t => `  - ${t.count} ${t.label}`), ``]
          : [`Tutto a posto: niente da fare per domani.`, ``]),
        `Visualizzazioni:     ${todayStats.todayPageViews}${extras.viewsTrend ? ` (${extras.viewsTrend.vsYesterday.label} su ieri, media 7 gg: ${extras.viewsTrend.avg7})` : ''}`,
        `Visitatori unici:    ${todayStats.uniqueVisitorsToday}`,
        `Nuovi / di ritorno:  ${engagement.newVisitors} / ${engagement.returningVisitors}`,
        `Visite al blog:      ${todayStats.todayBlogViews}`,
        `Messaggi chat:       ${chatInteractions}`,
        `Moduli contatto:     ${todaysContacts.length}${extras.contactsTrend ? ` (${extras.contactsTrend.vsYesterday.label} su ieri)` : ''}`,
        ``,
        `Pagine più viste oggi:`,
        ...engagement.pages.slice(0, 8).map(p =>
          `  ${p.path} — ${p.views} viste / ${p.uniqueVisitors} unici` +
          (p.avgDurationSec != null ? `, tempo medio ${p.avgDurationSec}s` : ''),
        ),
        ``,
        `Sorgenti oggi:        ${engagement.sources.map(s => `${s.label} (${s.count})`).join(', ') || 'n.d.'}`,
        `Siti di provenienza:  ${engagement.topReferrers.slice(0, 5).map(r => `${r.label} (${r.count})`).join(', ') || 'n.d.'}`,
        `Campagne:             ${engagement.campaigns.slice(0, 5).map(c => `${c.label} (${c.count})`).join(', ') || 'n.d.'}`,
        `Località oggi:        ${engagement.locations.slice(0, 5).map(l => `${l.label} (${l.count})`).join(', ') || 'n.d.'}`,
        `Località da sempre:   ${advanced.topLocations.slice(0, 5).map(l => `${l.label} (${l.count})`).join(', ') || 'n.d.'}`,
        ``,
        ...(extras.chat && extras.chat.questionsCount
          ? [``, `Chatbot oggi: ${extras.chat.questionsCount} domande in ${extras.chat.sessions} conversazioni, ${extras.chat.fallbackReplies} risposte predefinite`,
             ...extras.chat.questions.map(q => `  - ${q}`)]
          : []),
        ``,
        `Dashboard: ${this.siteUrl()}/dashboard`,
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
    advanced: Awaited<ReturnType<AnalyticsQueryService['getAdvancedAnalytics']>>;
    engagement: Awaited<ReturnType<AnalyticsQueryService['getDailyEngagementReport']>>;
    chatInteractions: number;
    viewsTrend?: Trend | null;
    contactsTrend?: Trend | null;
    todo?: TodoItem[];
    gsc?: { configured?: boolean; clicks: number; impressions: number; avgCtr: number; avgPosition: number; topQueries: { query: string; clicks: number; position: number }[] } | null;
    chat?: ChatSummary | null;
    system?: SystemRow[];
  }): Record<string, unknown> {
    const { date, todaysContacts, todayStats, advanced, engagement, chatInteractions } = data;
    const dashboardUrl = `${this.siteUrl()}/dashboard`;

    // Colori dei confronti: verde sale, rosso scende, grigio pari.
    const deltaColor = { up: '#16a34a', down: '#dc2626', flat: '#64748b' } as const;
    const withTrend = (t?: Trend | null) =>
      t
        ? {
            avg7: t.avg7,
            vsYesterday: { label: t.vsYesterday.label, color: deltaColor[t.vsYesterday.direction] },
            vsAvg: { label: t.vsAvg.label, color: deltaColor[t.vsAvg.direction] },
          }
        : undefined;

    const kpiRows: StatCardVM[][] = [
      [
        { icon: '👁️', label: 'Visualizzazioni', value: todayStats.todayPageViews, color: '#6366f1', trend: withTrend(data.viewsTrend) },
        { icon: '👤', label: 'Visitatori unici', value: todayStats.uniqueVisitorsToday, color: '#0284c7' },
        { icon: '🤖', label: 'Messaggi chat', value: chatInteractions, color: '#059669' },
        { icon: '✉️', label: 'Moduli contatto', value: todaysContacts.length, color: '#d97706', trend: withTrend(data.contactsTrend) },
      ],
      [
        { icon: '📰', label: 'Visite al blog', value: todayStats.todayBlogViews, color: '#7c3aed' },
        { icon: '🆕', label: 'Nuovi visitatori', value: engagement.newVisitors, color: '#16a34a' },
        { icon: '🔁', label: 'Di ritorno', value: engagement.returningVisitors, color: '#e11d48' },
      ],
    ];

    const todoColor = { bad: '#dc2626', warn: '#b45309', info: '#4338ca' } as const;
    const todo = (data.todo ?? []).map((t) => ({ ...t, color: todoColor[t.tone], url: `${this.siteUrl()}${t.path}` }));

    const toneColor = { ok: '#16a34a', warn: '#b45309', bad: '#dc2626' } as const;
    const system = (data.system ?? []).map((r) => ({ ...r, color: toneColor[r.tone], dot: r.tone === 'ok' ? '🟢' : r.tone === 'warn' ? '🟠' : '🔴' }));
    const chat = data.chat && (data.chat.questionsCount > 0 || data.chat.fallbackReplies > 0) ? data.chat : null;

    const gsc =
      data.gsc?.configured && (data.gsc.clicks > 0 || data.gsc.impressions > 0)
        ? {
            clicks: data.gsc.clicks,
            impressions: data.gsc.impressions,
            ctr: `${data.gsc.avgCtr}%`,
            position: data.gsc.avgPosition,
            queries: (data.gsc.topQueries ?? []).slice(0, 5),
          }
        : null;

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

    // "Dispositivi" e "Località" senza "oggi" sono totali di sempre: prima la tabella dei dispositivi (migliaia)
    // stava accanto ai numeri di oggi (decine) senza dirlo, e sembrava un errore.
    const tablePairs = [
      {
        left: this.toBreakdownTable(
          { icon: '📡', title: 'Sorgenti di traffico · oggi', accent: '#059669', emptyText: 'Nessun dato' },
          engagement.sources, 6),
        right: this.toBreakdownTable(
          { icon: '📱', title: 'Dispositivi · da sempre', accent: '#0284c7', emptyText: 'Nessun dato' },
          advanced.deviceBreakdown, 5),
      },
      {
        left: this.toBreakdownTable(
          { icon: '🔗', title: 'Siti di provenienza · oggi', accent: '#e11d48', emptyText: 'Nessun sito esterno' },
          engagement.topReferrers, 6),
        right: this.toBreakdownTable(
          { icon: '🎯', title: 'Campagne UTM · oggi', accent: '#16a34a', emptyText: 'Nessuna campagna' },
          engagement.campaigns, 6),
      },
      {
        left: this.toBreakdownTable(
          { icon: '🌍', title: 'Località dei visitatori · oggi', accent: '#6366f1', emptyText: 'Nessun dato oggi' },
          engagement.locations, 8),
        right: this.toBreakdownTable(
          { icon: '🌐', title: 'Località dei visitatori · da sempre', accent: '#d97706', emptyText: 'Nessun dato' },
          advanced.topLocations, 8),
      },
    ];

    const contacts = todaysContacts.map((m, i) => ({
      time: new Date(m.createdAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' }),
      name: m.name,
      email: m.email,
      preview: `${(m.message ?? '').slice(0, 80)}${(m.message ?? '').length > 80 ? '…' : ''}`,
      zebra: i % 2 === 1,
    }));

    return {
      date,
      year: new Date().getFullYear(),
      dashboardUrl,
      todo,
      kpiRows,
      pages,
      gsc,
      chat,
      system,
      tablePairs,
      contacts,
    };
  }

  /** Indirizzo del sito per i link dell'email (il vecchio "…/admin" non esiste: la dashboard è /dashboard). */
  private siteUrl(): string {
    return (this.cfg.get<string>('SITE_URL') || this.cfg.get<string>('FRONTEND_URL') || 'https://gentsallaku.it').replace(/\/+$/, '');
  }

  /**
   * Dati per i blocchi nuovi dell'email. Ognuno è indipendente: se uno fallisce si registra un avviso e il blocco
   * manca, ma l'email parte comunque (il riepilogo delle 22:00 non deve saltare per un dato in più).
   */
  private async gatherExtras(now: Date): Promise<{
    viewsTrend: Trend | null;
    contactsTrend: Trend | null;
    notifications: Awaited<ReturnType<AdminOverviewService['notificationSummary']>> | null;
    sections: Record<string, unknown> | null;
    chat: ChatSummary | null;
  }> {
    const safe = async <T>(label: string, fn: () => Promise<T>): Promise<T | null> => {
      try {
        return await fn();
      } catch (err) {
        this.logger.warn(`[DailySummary] ${label} non disponibile: ${(err as Error)?.message ?? err}`);
        return null;
      }
    };

    // 8 giorni: oggi, ieri e i 6 precedenti per la media.
    // Inizio del giorno dell'email (non dell'ora attuale): conta anche se il riepilogo viene rigenerato dopo mezzanotte.
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const [visits, contactDays, notifications, overview, chatPage] = await Promise.all([
      safe('andamento visite', () => this.analyticsQuery.getVisitSummary(8)),
      safe('andamento contatti', () => this.contacts.countByDay(8)),
      this.overview ? safe('notifiche', () => this.overview!.notificationSummary()) : Promise.resolve(null),
      this.overview
        ? safe('sezioni dashboard', () =>
            this.overview!.getSections(['serverErrors', 'serverHealth', 'notFound', 'translationHealth', 'scheduledPosts', 'gsc', 'aiUsage', 'security']))
        : Promise.resolve(null),
      // Le chat di oggi (fino a 50 conversazioni): domande recenti e risposte di ripiego.
      safe('chat di oggi', () => this.chatbot.getTodaySessions(1, 50)),
    ]);

    return {
      viewsTrend: buildTrend(visits?.viewsByDay.map((d) => d.count)),
      contactsTrend: buildTrend(contactDays?.map((d) => d.count)),
      notifications,
      sections: overview?.sections ?? null,
      chat: buildChatSummary(chatPage?.data as any, dayStart),
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
