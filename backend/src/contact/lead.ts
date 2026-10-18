/** Stato commerciale di un messaggio di contatto. */
export const LEAD_STATUSES = ['new', 'in_progress', 'won', 'lost'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** Stati in cui un follow-up conta ancora (vinto/perso = chiuso). */
export const OPEN_LEAD_STATUSES: readonly LeadStatus[] = ['new', 'in_progress'];

export const LEAD_NOTE_MAX = 2000;

/**
 * I messaggi salvati prima degli stati non hanno `status`: uno già risposto
 * conta come "in trattativa", gli altri come nuovi. Stessa regola
 * dell'espressione Mongo LEAD_STATUS_EXPR, usata nelle aggregazioni.
 */
export function effectiveLeadStatus(doc: { status?: string | null; repliedAt?: Date | string | null }): LeadStatus {
  if (doc.status && (LEAD_STATUSES as readonly string[]).includes(doc.status)) return doc.status as LeadStatus;
  return doc.repliedAt ? 'in_progress' : 'new';
}

export const LEAD_STATUS_EXPR = {
  $ifNull: ['$status', { $cond: [{ $gt: ['$repliedAt', null] }, 'in_progress', 'new'] }],
};

/** Ore medie fra arrivo e prima risposta, con una cifra decimale; null se non c'è nessuna risposta. */
export function averageResponseHours(docs: Array<{ createdAt?: Date | string; repliedAt?: Date | string | null }>): number | null {
  const deltas = docs
    .filter((d) => d.createdAt && d.repliedAt)
    .map((d) => new Date(d.repliedAt as Date).getTime() - new Date(d.createdAt as Date).getTime())
    .filter((ms) => Number.isFinite(ms) && ms >= 0);
  if (!deltas.length) return null;
  return Math.round((deltas.reduce((s, ms) => s + ms, 0) / deltas.length / 3_600_000) * 10) / 10;
}

/** Fine della giornata di oggi in Europe/Rome espressa in UTC: un follow-up "di oggi" è dovuto fin dal mattino. */
export function endOfTodayRome(now = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  // Mezzanotte del giorno dopo a Roma: si prova l'offset di entrambe le stagioni.
  for (const offset of ['+01:00', '+02:00']) {
    const candidate = new Date(`${parts}T23:59:59.999${offset}`);
    const romeDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(candidate);
    const romeHour = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', hour: '2-digit', hour12: false }).format(candidate);
    if (romeDay === parts && romeHour === '23') return candidate;
  }
  return new Date(`${parts}T23:59:59.999+01:00`);
}
