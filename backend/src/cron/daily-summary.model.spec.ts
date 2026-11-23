import { buildChatSummary, buildSubject, buildSystemRows, buildTodo, buildTrend, computeDelta, formatItalianDate } from './daily-summary.model';

describe('computeDelta', () => {
  it('variazione percentuale con freccia', () => {
    expect(computeDelta(125, 100)).toEqual({ direction: 'up', label: '▲ 25%' });
    expect(computeDelta(95, 100)).toEqual({ direction: 'down', label: '▼ 5%' });
    expect(computeDelta(100, 100)).toEqual({ direction: 'flat', label: '= 0%' });
  });

  it('con base zero non divide: "nuovo" se oggi c\'è qualcosa, altrimenti pari', () => {
    expect(computeDelta(7, 0)).toEqual({ direction: 'up', label: '▲ nuovo' });
    expect(computeDelta(0, 0)).toEqual({ direction: 'flat', label: '= 0%' });
  });
});

describe('buildTrend', () => {
  it('confronta oggi con ieri e con la media dei 7 giorni precedenti', () => {
    // 8 giorni: 6 giorni da 100, ieri 80, oggi 120
    const t = buildTrend([100, 100, 100, 100, 100, 100, 80, 120])!;
    expect(t.current).toBe(120);
    expect(t.yesterday).toBe(80);
    expect(t.avg7).toBe(97); // (6*100 + 80 + 100) / 7 = 97,1 -> la finestra è gli ultimi 7 prima di oggi
    expect(t.vsYesterday.label).toBe('▲ 50%');
    expect(t.vsAvg.direction).toBe('up');
  });

  it('usa solo i giorni disponibili se la storia è corta', () => {
    const t = buildTrend([10, 20])!;
    expect(t.avg7).toBe(10);
    expect(t.vsYesterday.label).toBe('▲ 100%');
  });

  it('senza almeno due giorni non c\'è confronto (il blocco non si mostra)', () => {
    expect(buildTrend([5])).toBeNull();
    expect(buildTrend([])).toBeNull();
    expect(buildTrend(null)).toBeNull();
  });
});

describe('buildTodo', () => {
  const now = new Date('2026-11-23T20:00:00Z');

  it('elenca solo ciò che richiede azione, dalla più urgente', () => {
    const items = buildTodo({
      now,
      notifications: { contactsUnread: 3, liveHandoffsWaiting: 1, followUpsDue: 0, testimonialsPending: 2, notesPending: 0 },
      serverErrors: { open: 2 },
      notFound: { open: 0 },
      translationHealth: { postsWithIssues: 4 },
      serverHealth: { warnings: [] },
      scheduledPosts: [
        { scheduledAt: '2026-11-24T08:00:00Z' }, // domani mattina: sì
        { scheduledAt: '2026-11-28T08:00:00Z' }, // fra 5 giorni: no
        { scheduledAt: '2026-11-22T08:00:00Z' }, // già uscito: no
      ],
    });
    expect(items.map((i) => i.label)).toEqual([
      'richiesta di chat dal vivo senza risposta',
      'messaggi di contatto da leggere',
      'errori del server ancora aperti',
      'testimonianze da moderare',
      'articoli con traduzioni da sistemare',
      'articolo programmato nelle prossime 24 ore',
    ]);
    expect(items[0]).toMatchObject({ count: 1, tone: 'bad' });
    expect(items.find((i) => i.label.startsWith('articolo programmato'))?.count).toBe(1);
  });

  it('con tutto a posto, o con dati mancanti, è vuoto', () => {
    expect(buildTodo({ now })).toEqual([]);
    expect(buildTodo({ now, notifications: { contactsUnread: 0 }, serverErrors: null, scheduledPosts: [] })).toEqual([]);
  });

  it('usa il singolare quando c\'è un solo elemento', () => {
    const items = buildTodo({ notifications: { contactsUnread: 1, testimonialsPending: 1 }, serverErrors: { open: 1 } });
    expect(items.map((i) => i.label)).toEqual(['messaggio di contatto da leggere', 'errore del server ancora aperto', 'testimonianza da moderare']);
  });

  it('gli avvisi del server nominano il problema', () => {
    const items = buildTodo({ now, serverHealth: { warnings: ['backup_stale', 'disk_low'] } });
    expect(items[0]).toMatchObject({ count: 2, tone: 'bad' });
    expect(items[0].label).toContain('backup_stale, disk_low');
  });
});

describe('buildSubject', () => {
  const now = new Date(2026, 10, 23, 22, 0); // 23 novembre, ora locale
  it('mette i numeri chiave nell\'oggetto', () => {
    expect(buildSubject({ pageViews: 214, contacts: 2, todo: 3, now })).toBe('📊 214 visite · 2 messaggi · 3 da fare — 23/11');
  });
  it('omette ciò che è zero e usa il singolare', () => {
    expect(buildSubject({ pageViews: 1, contacts: 0, todo: 0, now })).toBe('📊 1 visita — 23/11');
    expect(buildSubject({ pageViews: 6, contacts: 1, todo: 0, now })).toBe('📊 6 visite · 1 messaggio — 23/11');
  });
});

describe('formatItalianDate', () => {
  it('data estesa in italiano, fuso di Roma', () => {
    expect(formatItalianDate(new Date('2026-11-23T20:00:00Z'))).toMatch(/lunedì 23 novembre 2026/i);
  });
});

describe('buildChatSummary', () => {
  const since = new Date('2026-11-23T00:00:00Z');
  const msg = (role: string, content: string, at: string, usedFallback?: boolean) => ({ role, content, timestamp: at, usedFallback });

  it('conta conversazioni, domande e risposte di ripiego di oggi, con le domande più recenti per prime', () => {
    const s = buildChatSummary([
      { messages: [msg('user', 'Come firmo un PDF?', '2026-11-23T09:00:00Z'), msg('assistant', 'Usa lo strumento…', '2026-11-23T09:00:05Z', false)] },
      { messages: [msg('user', 'Gent è italiano?', '2026-11-23T18:00:00Z'), msg('assistant', 'Risposta predefinita', '2026-11-23T18:00:02Z', true)] },
      { messages: [msg('user', 'vecchia', '2026-11-20T10:00:00Z')] }, // non di oggi
    ], since)!;
    expect(s).toMatchObject({ sessions: 2, questionsCount: 2, fallbackReplies: 1 });
    expect(s.questions).toEqual(['Gent è italiano?', 'Come firmo un PDF?']);
  });

  it('accorcia le domande lunghe e le porta su una riga', () => {
    const long = 'a '.repeat(80);
    const [q] = buildChatSummary([{ messages: [msg('user', `${long}\n\nfine`, '2026-11-23T10:00:00Z')] }], since)!.questions;
    expect(q.length).toBeLessThanOrEqual(90);
    expect(q.endsWith('…')).toBe(true);
    expect(q).not.toContain('\n');
  });

  it('limita il numero di domande mostrate; senza dati (null) il blocco non c\'è', () => {
    const many = Array.from({ length: 9 }, (_, i) => msg('user', `d${i}`, `2026-11-23T1${i}:00:00Z`));
    expect(buildChatSummary([{ messages: many }], since)!.questions).toHaveLength(5);
    expect(buildChatSummary(null, since)).toBeNull();
    expect(buildChatSummary([], since)).toMatchObject({ sessions: 0, questionsCount: 0, questions: [] });
  });
});

describe('buildSystemRows', () => {
  it('riassume backup, disco, memoria, token AI e accessi con il tono giusto', () => {
    const rows = buildSystemRows({
      serverHealth: { backups: { configured: true, stale: true, latest: { ageHours: 49.6 } }, disk: { freeGb: 3, usedPct: 92, low: true }, memory: { usedPct: 56, low: false } },
      aiUsage: { tokens: 460000, quota: { dailyTokenBudget: 500000 }, enabled: true },
      security: { failedLogins24h: 4, otpFailed24h: 1, tokenReuse: 0 },
    });
    expect(rows.find((r) => r.label === 'Ultimo backup')).toMatchObject({ value: '50 h fa (troppo vecchio)', tone: 'bad' });
    expect(rows.find((r) => r.label === 'Disco')).toMatchObject({ tone: 'bad' });
    expect(rows.find((r) => r.label === 'Memoria')).toMatchObject({ value: '56% usata', tone: 'ok' });
    expect(rows.find((r) => r.label === 'Token AI di oggi')).toMatchObject({ tone: 'bad' }); // 92%
    expect(rows.find((r) => r.label.startsWith('Accessi falliti'))).toMatchObject({ value: '4 · codici OTP errati: 1', tone: 'warn' });
    expect(rows.find((r) => r.label.startsWith('Token di sessione'))).toBeUndefined();
  });

  it('segnala i token di sessione riusati, e salta ciò che non c\'è', () => {
    expect(buildSystemRows({ security: { failedLogins24h: 0, tokenReuse: 2 } }).map((r) => r.label)).toEqual(['Accessi falliti (24 h)', 'Token di sessione riusati']);
    expect(buildSystemRows({})).toEqual([]);
    expect(buildSystemRows({ aiUsage: { tokens: 10, quota: { dailyTokenBudget: 0 } } })).toEqual([]);
  });
});
