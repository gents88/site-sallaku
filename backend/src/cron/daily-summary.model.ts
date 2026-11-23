/**
 * Parti "pure" del riepilogo giornaliero (nessun accesso a database o servizi): confronti con ieri e con la media,
 * elenco "Da fare domani", oggetto dell'email. Stanno qui per poterle provare con test senza inviare nulla.
 */

export type Direction = 'up' | 'down' | 'flat';

export interface Delta {
  direction: Direction;
  /** Testo pronto per l'email, es. "▲ 25%" o "= 0%" o "▲ nuovo" */
  label: string;
}

export interface Trend {
  /** Valore di oggi */
  current: number;
  yesterday: number;
  /** Media dei 7 giorni precedenti a oggi (arrotondata) */
  avg7: number;
  vsYesterday: Delta;
  vsAvg: Delta;
}

/** Confronto di `current` con `base`: variazione percentuale con freccia. Base 0 → "nuovo" se c'è qualcosa, altrimenti pari. */
export function computeDelta(current: number, base: number): Delta {
  if (base <= 0) {
    return current > 0 ? { direction: 'up', label: '▲ nuovo' } : { direction: 'flat', label: '= 0%' };
  }
  const pct = Math.round(((current - base) / base) * 100);
  if (pct === 0) return { direction: 'flat', label: '= 0%' };
  return pct > 0 ? { direction: 'up', label: `▲ ${pct}%` } : { direction: 'down', label: `▼ ${Math.abs(pct)}%` };
}

/**
 * `series` è la serie giornaliera dal più vecchio a oggi (l'ultimo elemento è oggi). Servono almeno 2 giorni;
 * la media è sui giorni precedenti a oggi (fino a 7). Se non c'è abbastanza storia → null: il blocco non si mostra.
 */
export function buildTrend(series: readonly number[] | null | undefined): Trend | null {
  if (!series || series.length < 2) return null;
  const current = series[series.length - 1];
  const yesterday = series[series.length - 2];
  const previous = series.slice(Math.max(0, series.length - 8), series.length - 1);
  const avg7 = Math.round(previous.reduce((s, n) => s + n, 0) / previous.length);
  return { current, yesterday, avg7, vsYesterday: computeDelta(current, yesterday), vsAvg: computeDelta(current, avg7) };
}

// ── Da fare domani ──────────────────────────────────────────────────────────

export type Tone = 'bad' | 'warn' | 'info';

export interface TodoItem {
  icon: string;
  count: number;
  label: string;
  tone: Tone;
  /** Percorso della dashboard dove gestirlo (senza dominio) */
  path: string;
}

export interface TodoInput {
  notifications?: {
    contactsUnread?: number;
    testimonialsPending?: number;
    notesPending?: number;
    liveHandoffsWaiting?: number;
    followUpsDue?: number;
  } | null;
  serverErrors?: { open?: number } | null;
  serverHealth?: { warnings?: string[] } | null;
  notFound?: { open?: number } | null;
  translationHealth?: { postsWithIssues?: number } | null;
  /** Articoli programmati: quelli che escono nelle prossime 24 ore */
  scheduledPosts?: { scheduledAt: string | Date }[] | null;
  now?: Date;
}

const positive = (n: number | undefined | null): n is number => typeof n === 'number' && n > 0;
/** "1 richiesta" / "3 richieste": sceglie la forma giusta in base al numero. */
const pl = (n: number, one: string, many: string): string => (n === 1 ? one : many);

/** Cose che richiedono un'azione, dalla più urgente. Vuota = tutto a posto. */
export function buildTodo(input: TodoInput): TodoItem[] {
  const n = input.notifications ?? {};
  const now = (input.now ?? new Date()).getTime();
  const next24h = (input.scheduledPosts ?? []).filter((p) => {
    const t = new Date(p.scheduledAt).getTime();
    return t > now && t <= now + 24 * 3_600_000;
  }).length;

  const items: (TodoItem | null)[] = [
    positive(n.liveHandoffsWaiting) ? { icon: '🎧', count: n.liveHandoffsWaiting, label: pl(n.liveHandoffsWaiting, 'richiesta di chat dal vivo senza risposta', 'richieste di chat dal vivo senza risposta'), tone: 'bad', path: '/dashboard' } : null,
    positive(n.contactsUnread) ? { icon: '✉️', count: n.contactsUnread, label: pl(n.contactsUnread, 'messaggio di contatto da leggere', 'messaggi di contatto da leggere'), tone: 'warn', path: '/dashboard/contacts' } : null,
    positive(n.followUpsDue) ? { icon: '⏰', count: n.followUpsDue, label: pl(n.followUpsDue, 'follow-up in scadenza', 'follow-up in scadenza'), tone: 'warn', path: '/dashboard/contacts' } : null,
    positive(input.serverErrors?.open) ? { icon: '🐞', count: input.serverErrors!.open!, label: pl(input.serverErrors!.open!, 'errore del server ancora aperto', 'errori del server ancora aperti'), tone: 'bad', path: '/dashboard' } : null,
    positive(input.serverHealth?.warnings?.length) ? { icon: '🛠️', count: input.serverHealth!.warnings!.length, label: `${pl(input.serverHealth!.warnings!.length, 'avviso', 'avvisi')} sul server (${input.serverHealth!.warnings!.join(', ')})`, tone: 'bad', path: '/dashboard' } : null,
    positive(n.testimonialsPending) ? { icon: '⭐', count: n.testimonialsPending, label: pl(n.testimonialsPending, 'testimonianza da moderare', 'testimonianze da moderare'), tone: 'info', path: '/dashboard/testimonials' } : null,
    positive(n.notesPending) ? { icon: '📝', count: n.notesPending, label: pl(n.notesPending, 'nota dei lettori da moderare', 'note dei lettori da moderare'), tone: 'info', path: '/dashboard/notes' } : null,
    positive(input.notFound?.open) ? { icon: '🔗', count: input.notFound!.open!, label: pl(input.notFound!.open!, 'link rotto (404) da sistemare', 'link rotti (404) da sistemare'), tone: 'info', path: '/dashboard' } : null,
    positive(input.translationHealth?.postsWithIssues) ? { icon: '🌍', count: input.translationHealth!.postsWithIssues!, label: pl(input.translationHealth!.postsWithIssues!, 'articolo con traduzioni da sistemare', 'articoli con traduzioni da sistemare'), tone: 'info', path: '/dashboard' } : null,
    positive(next24h) ? { icon: '🗓️', count: next24h, label: pl(next24h, 'articolo programmato nelle prossime 24 ore', 'articoli programmati nelle prossime 24 ore'), tone: 'info', path: '/dashboard/blog' } : null,
  ];
  return items.filter((i): i is TodoItem => i !== null);
}

// ── Oggetto e date ──────────────────────────────────────────────────────────

/** "📊 214 visite · 2 messaggi · 3 da fare — 23/11": i numeri chiave si leggono dalla notifica, senza aprire l'email. */
export function buildSubject(input: { pageViews: number; contacts: number; todo: number; now: Date }): string {
  const parts = [`${input.pageViews} ${input.pageViews === 1 ? 'visita' : 'visite'}`];
  if (input.contacts > 0) parts.push(`${input.contacts} ${input.contacts === 1 ? 'messaggio' : 'messaggi'}`);
  if (input.todo > 0) parts.push(`${input.todo} da fare`);
  const day = String(input.now.getDate()).padStart(2, '0');
  const month = String(input.now.getMonth() + 1).padStart(2, '0');
  return `📊 ${parts.join(' · ')} — ${day}/${month}`;
}

export function formatItalianDate(date: Date): string {
  return date.toLocaleDateString('it-IT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Europe/Rome' });
}

// ── Chatbot di oggi ─────────────────────────────────────────────────────────

export interface ChatSessionLike {
  messages?: { role: string; content: string; timestamp: Date | string; usedFallback?: boolean }[];
}

export interface ChatSummary {
  /** Conversazioni con almeno un messaggio oggi */
  sessions: number;
  /** Messaggi scritti dai visitatori oggi */
  questionsCount: number;
  /** Risposte date dal ripiego (l'AI non era disponibile o non ha risposto) */
  fallbackReplies: number;
  /** Le ultime domande di oggi, accorciate, dalla più recente */
  questions: string[];
}

/** Riepilogo delle chat di oggi. null = dato non disponibile (il blocco non si mostra). */
export function buildChatSummary(sessions: readonly ChatSessionLike[] | null | undefined, since: Date, maxQuestions = 5): ChatSummary | null {
  if (!sessions) return null;
  const from = since.getTime();
  let sessionsToday = 0;
  let fallbackReplies = 0;
  const asked: { at: number; text: string }[] = [];
  for (const s of sessions) {
    let touched = false;
    for (const m of s.messages ?? []) {
      const at = new Date(m.timestamp).getTime();
      if (!(at >= from)) continue;
      touched = true;
      if (m.role === 'user') asked.push({ at, text: m.content });
      else if (m.role === 'assistant' && m.usedFallback) fallbackReplies++;
    }
    if (touched) sessionsToday++;
  }
  asked.sort((a, b) => b.at - a.at);
  const clip = (t: string) => {
    const one = t.replace(/\s+/g, ' ').trim();
    return one.length > 90 ? `${one.slice(0, 89)}…` : one;
  };
  return { sessions: sessionsToday, questionsCount: asked.length, fallbackReplies, questions: asked.slice(0, maxQuestions).map((q) => clip(q.text)) };
}

// ── Stato del sistema ───────────────────────────────────────────────────────

export type RowTone = 'ok' | 'warn' | 'bad';

export interface SystemRow {
  label: string;
  value: string;
  tone: RowTone;
}

export interface SystemInput {
  serverHealth?: {
    backups?: { configured?: boolean; stale?: boolean; latest?: { ageHours: number } | null };
    memory?: { usedPct: number; low?: boolean };
    disk?: { freeGb: number; usedPct: number; low?: boolean } | null;
  } | null;
  aiUsage?: { tokens?: number; quota?: { dailyTokenBudget?: number }; enabled?: boolean } | null;
  security?: { failedLogins24h?: number; otpFailed24h?: number; tokenReuse?: number } | null;
}

/** Poche righe sullo stato di server, AI e accessi: servono a vedere a colpo d'occhio se qualcosa non va. */
export function buildSystemRows(input: SystemInput): SystemRow[] {
  const rows: SystemRow[] = [];
  const h = input.serverHealth;
  if (h?.backups?.configured && h.backups.latest) {
    const age = Math.round(h.backups.latest.ageHours);
    rows.push({ label: 'Ultimo backup', value: `${age} h fa${h.backups.stale ? ' (troppo vecchio)' : ''}`, tone: h.backups.stale ? 'bad' : 'ok' });
  }
  if (h?.disk) rows.push({ label: 'Disco', value: `${h.disk.freeGb} GB liberi (${h.disk.usedPct}% usato)`, tone: h.disk.low ? 'bad' : 'ok' });
  if (h?.memory) rows.push({ label: 'Memoria', value: `${h.memory.usedPct}% usata`, tone: h.memory.low ? 'warn' : 'ok' });

  const budget = input.aiUsage?.quota?.dailyTokenBudget;
  if (input.aiUsage && budget && budget > 0) {
    const tokens = input.aiUsage.tokens ?? 0;
    const pct = Math.round((tokens / budget) * 100);
    rows.push({
      label: 'Token AI di oggi',
      value: `${tokens.toLocaleString('it-IT')} su ${budget.toLocaleString('it-IT')} (${pct}%)${input.aiUsage.enabled === false ? ' · AI spenta' : ''}`,
      tone: pct >= 90 ? 'bad' : pct >= 70 ? 'warn' : 'ok',
    });
  }

  const s = input.security;
  if (s) {
    const failed = s.failedLogins24h ?? 0;
    rows.push({ label: 'Accessi falliti (24 h)', value: `${failed}${s.otpFailed24h ? ` · codici OTP errati: ${s.otpFailed24h}` : ''}`, tone: failed >= 10 ? 'bad' : failed >= 3 ? 'warn' : 'ok' });
    if ((s.tokenReuse ?? 0) > 0) rows.push({ label: 'Token di sessione riusati', value: String(s.tokenReuse), tone: 'bad' });
  }
  return rows;
}
