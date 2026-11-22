import { OverviewSection } from './admin-dashboard.service';

/** Intervallo di polling della dashboard: ogni giro ricarica solo le sezioni vive (LIVE_SECTIONS). */
export const DASHBOARD_POLL_MS = 60_000;

/** Ogni quanto il polling ricarica anche le sezioni pesanti (statistiche visite, SEO, sistema). */
export const DASHBOARD_FULL_REFRESH_MS = 10 * 60_000;

/** Il giro di polling deve ricaricare tutto? Sì al primo, poi ogni DASHBOARD_FULL_REFRESH_MS. */
export function needsFullRefresh(lastFullAt: Date | null, now = Date.now()): boolean {
  return !lastFullAt || now - lastFullAt.getTime() >= DASHBOARD_FULL_REFRESH_MS;
}

/**
 * Altezze (%) di una sparkline da una serie reale per giorno. null quando non
 * c'è una serie: meglio nessun grafico che quello di prima, un pattern fisso
 * scalato sul valore totale che sembrava un andamento ma non lo era.
 */
export function sparkline(series: ReadonlyArray<{ count: number }> | null | undefined): number[] | null {
  if (!series || series.length < 2) return null;
  const max = Math.max(...series.map(p => p.count), 0);
  // Serie tutta a zero: barre minime uguali, non un grafico vuoto che sembra rotto.
  return series.map(p => (max > 0 ? Math.max(8, Math.round((p.count / max) * 100)) : 8));
}

/** Al ritorno sulla scheda si ricarica solo se l'ultimo snapshot è più vecchio del polling. */
export function shouldRefreshOnVisible(hidden: boolean, lastLoadedAt: Date | null, now = Date.now()): boolean {
  if (hidden) return false;
  return !lastLoadedAt || now - lastLoadedAt.getTime() >= DASHBOARD_POLL_MS;
}

/** Nome leggibile (chiave i18n) di ogni sezione, per il banner "pannelli non aggiornati". */
export const SECTION_LABEL_KEYS: Record<OverviewSection, string> = {
  core: 'admin.overview_core',
  projectsCount: 'admin.projects',
  experiencesCount: 'admin.experiences',
  topPosts: 'admin.top_posts_title',
  advanced: 'admin.visitor_analytics',
  analyticsStats: 'admin.monthly_vs_total_views',
  topPages: 'admin.top_pages',
  monthlyHistory: 'admin.monthly_trend',
  toolConversion: 'admin.tool_conversion',
  auditLogs: 'admin.audit_log',
  chatbotStats: 'admin.chatbot_stats',
  gsc: 'admin.seo_title',
  consentStats: 'admin.consent.title',
  liveHandoffs: 'live_handoff.card_title',
  systemHealth: 'admin.utility_section',
  systemDetails: 'admin.utility_section',
  systemOps: 'admin.utility_section',
  aiUsage: 'ai_usage.title',
  serverErrors: 'server_errors.title',
  serverHealth: 'server_health.title',
  translationHealth: 'translation_health.title',
  scheduledPosts: 'scheduled_posts.title',
  leads: 'leads.title',
  notFound: 'not_found.title',
  security: 'security_panel.title',
};

/** Etichette uniche (le tre sezioni di sistema condividono lo stesso pannello). */
export function failedSectionLabels(failed: ReadonlySet<OverviewSection>): string[] {
  return [...new Set([...failed].map(k => SECTION_LABEL_KEYS[k]))];
}

/** Variazione rispetto al periodo precedente: % arrotondata e direzione. */
export interface PeriodDelta {
  /** null quando il periodo precedente è 0 (nessuna base per una percentuale) */
  pct: number | null;
  direction: 'up' | 'down' | 'flat';
}

export function periodDelta(current: number, previous: number): PeriodDelta {
  const direction = current > previous ? 'up' : current < previous ? 'down' : 'flat';
  if (!previous) return { pct: null, direction };
  return { pct: Math.round(((current - previous) / previous) * 100), direction };
}

/**
 * Larghezza (%) di una barra orizzontale rispetto alla più lunga della serie.
 * Una barra con valore > 0 non scende sotto `minPct`, così resta visibile.
 */
export function barPercent(value: number, values: readonly number[], minPct = 6): number {
  const max = Math.max(...values, 1);
  return Math.max((value / max) * 100, value > 0 ? minPct : 0);
}
