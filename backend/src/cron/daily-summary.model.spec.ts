import { buildSubject, buildTodo, buildTrend, computeDelta, formatItalianDate } from './daily-summary.model';

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
