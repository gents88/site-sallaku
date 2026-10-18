/** Una richiesta di chat live come la restituisce GET admin/live-handoff/recent. */
export interface LiveHandoffHistoryEntry {
  requestId: string;
  sessionId: string;
  status: 'requested' | 'notified' | 'agent_joining' | 'live' | 'expired' | 'closed';
  lastUserMessage: string | null;
  locale: string | null;
  requestedAt: string;
  expiresAt: string;
  respondedAt: string | null;
  closedAt: string | null;
}

const OPEN_STATUSES: ReadonlySet<LiveHandoffHistoryEntry['status']> = new Set(['requested', 'notified', 'agent_joining', 'live']);

/**
 * Aperte (qualcuno aspetta o la chat è in corso) e passate (chiuse o scadute).
 * Fra le aperte vengono prima quelle in cui il visitatore aspetta ancora una
 * risposta: sono le uniche con un orologio che corre.
 */
export function splitLiveHandoffs(entries: LiveHandoffHistoryEntry[]): { open: LiveHandoffHistoryEntry[]; past: LiveHandoffHistoryEntry[] } {
  const open = entries.filter(e => OPEN_STATUSES.has(e.status));
  const waiting = open.filter(e => e.status === 'requested' || e.status === 'notified');
  const active = open.filter(e => e.status === 'agent_joining' || e.status === 'live');
  return { open: [...waiting, ...active], past: entries.filter(e => !OPEN_STATUSES.has(e.status)) };
}

export function liveHandoffEntryStatusKey(status: LiveHandoffHistoryEntry['status']): string {
  switch (status) {
    case 'live':
      return 'live_handoff.admin_live';
    case 'agent_joining':
      return 'live_handoff.admin_joining';
    case 'expired':
      return 'live_handoff.list_status_expired';
    case 'closed':
      return 'live_handoff.list_status_closed';
    default:
      return 'live_handoff.card_waiting';
  }
}

/** Minuti tra la richiesta e l'ingresso di Gent (arrotondati, minimo 1); null se non ha mai risposto. */
export function responseMinutes(entry: Pick<LiveHandoffHistoryEntry, 'requestedAt' | 'respondedAt'>): number | null {
  if (!entry.respondedAt) return null;
  const ms = new Date(entry.respondedAt).getTime() - new Date(entry.requestedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.max(1, Math.round(ms / 60_000));
}

/** La rotta admin è parametrizzata sul sessionId, non sul requestId (come nella card della dashboard). */
export function liveHandoffEntryRoute(entry: Pick<LiveHandoffHistoryEntry, 'sessionId'>): string[] {
  return ['/dashboard/live-chat', entry.sessionId];
}
