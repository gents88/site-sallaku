import { OverviewSection } from './admin-dashboard.service';

/** Intervallo di polling della dashboard. */
export const DASHBOARD_POLL_MS = 60_000;

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
};

/** Etichette uniche (le tre sezioni di sistema condividono lo stesso pannello). */
export function failedSectionLabels(failed: ReadonlySet<OverviewSection>): string[] {
  return [...new Set([...failed].map(k => SECTION_LABEL_KEYS[k]))];
}
