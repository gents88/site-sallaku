import { DailySummaryService } from './daily-summary.service';
import { TemplateRendererService } from '../mail/template-renderer.service';

/** Serie giornaliera dal più vecchio a oggi. */
const days = (counts: number[]) => counts.map((count, i) => ({ date: `2026-11-${16 + i}`, count }));

function build(opts: { overview?: any | null; visits?: any; contactsByDay?: any; contactsFail?: boolean } = {}) {
  const renderer = new TemplateRendererService();
  renderer.onModuleInit();
  const send = jest.fn().mockResolvedValue({ success: true, messageId: 'm1', accepted: ['x'], rejected: [] });
  const contacts = {
    findToday: jest.fn().mockResolvedValue([{ name: 'Mario <b>Rossi</b>', email: 'mario@example.test', message: 'Vorrei un preventivo', createdAt: new Date('2026-11-23T10:00:00Z') }]),
    countByDay: opts.contactsFail ? jest.fn().mockRejectedValue(new Error('timeout')) : jest.fn().mockResolvedValue(opts.contactsByDay ?? days([0, 1, 0, 2, 1, 0, 1, 3])),
  };
  const analyticsQuery = {
    getTodayPageViewStats: jest.fn().mockResolvedValue({ todayPageViews: 120, uniqueVisitorsToday: 40, todayBlogViews: 15 }),
    getAdvancedAnalytics: jest.fn().mockResolvedValue({ topLocations: [{ label: 'Milano, Italia', count: 90 }], deviceBreakdown: [{ label: 'Mobile', count: 2289 }] }),
    getDailyEngagementReport: jest.fn().mockResolvedValue({
      newVisitors: 10, returningVisitors: 30,
      pages: [{ path: '/lab/qr-code', views: 40, uniqueVisitors: 20, viewsPerVisitor: 2, repeatVisitors: 5, avgDurationSec: 75 }],
      sources: [{ label: 'search', count: 30 }], topReferrers: [], campaigns: [], locations: [{ label: 'Tirana, Albania', count: 12 }],
    }),
    getVisitSummary: opts.visits === undefined ? jest.fn().mockResolvedValue({ viewsByDay: days([100, 100, 100, 100, 100, 100, 80, 120]) }) : opts.visits,
  };
  const overview = opts.overview === undefined
    ? {
        notificationSummary: jest.fn().mockResolvedValue({ contactsUnread: 3, testimonialsPending: 0, notesPending: 0, liveHandoffsWaiting: 1, followUpsDue: 2 }),
        getSections: jest.fn().mockResolvedValue({
          generatedAt: '', errors: [],
          sections: {
            serverErrors: { open: 2 }, serverHealth: { warnings: [] }, notFound: { open: 0 }, translationHealth: { postsWithIssues: 4 }, scheduledPosts: [],
            gsc: { configured: true, clicks: 310, impressions: 9100, avgCtr: 3.4, avgPosition: 12.3, topQueries: [{ query: 'png to jpg', clicks: 40, impressions: 800, ctr: 5, position: 7.1 }] },
          },
        }),
      }
    : opts.overview;
  const cfg = { get: jest.fn((k: string) => ({ EMAIL_TO: 'admin@example.test', SITE_URL: 'https://example.test' } as Record<string, string>)[k]) };
  const service = new DailySummaryService(
    cfg as any, contacts as any, analyticsQuery as any, {} as any, { getTodayInteractionCount: jest.fn().mockResolvedValue(7) } as any,
    { send } as any, renderer, {} as any, overview as any,
  );
  const run = () => (service as any).gatherAndSend(new Date('2026-11-23T21:00:00Z'));
  return { run, send, analyticsQuery, overview };
}

describe('DailySummaryService — email delle 22:00', () => {
  it('è in italiano, ha i numeri nell\'oggetto, il confronto con ieri e il blocco "Da fare domani"', async () => {
    const { run, send } = build();

    expect(await run()).toBe(true);

    const mail = send.mock.calls[0][0];
    expect(mail.subject).toBe('📊 120 visite · 1 messaggio · 5 da fare — 23/11');
    expect(mail.html).toContain('Riepilogo giornaliero');
    expect(mail.html).toContain('Da fare domani');
    expect(mail.html).toContain('<strong>1</strong> richiesta di chat dal vivo senza risposta');
    expect(mail.html).toContain('<strong>3</strong> messaggi di contatto da leggere');
    expect(mail.html).toContain('▲ 50% <span'); // oggi 120 contro ieri 80
    expect(mail.html).toContain('media 7 gg: 97');
    expect(mail.text).toContain('Da fare domani:');
    expect(mail.text).toContain('(▲ 50% su ieri, media 7 gg: 97)');
  });

  it('i link portano alla dashboard vera (/dashboard) e non al vecchio /admin che non esiste', async () => {
    const { run, send } = build();
    await run();
    const html: string = send.mock.calls[0][0].html;
    expect(html).toContain('href="https://example.test/dashboard"');
    expect(html).toContain('href="https://example.test/dashboard/contacts"');
    expect(html).not.toMatch(/\/admin["/]/);
  });

  it('mostra Search Console quando è configurata, e dice che i totali "da sempre" sono tali', async () => {
    const { run, send } = build();
    await run();
    const html: string = send.mock.calls[0][0].html;
    expect(html).toContain('Search Console');
    expect(html).toContain('png to jpg');
    expect(html).toContain('Dispositivi · da sempre');
    expect(html).toContain('Sorgenti di traffico · oggi');
  });

  it('protegge dall\'HTML nei messaggi dei visitatori', async () => {
    const { run, send } = build();
    await run();
    const html: string = send.mock.calls[0][0].html;
    expect(html).not.toContain('<b>Rossi</b>');
    expect(html).toContain('Mario &lt;b&gt;Rossi&lt;/b&gt;');
  });

  it('se i dati in più falliscono l\'email parte comunque, senza i blocchi nuovi', async () => {
    const overview = {
      notificationSummary: jest.fn().mockRejectedValue(new Error('db giù')),
      getSections: jest.fn().mockRejectedValue(new Error('db giù')),
    };
    const { run, send } = build({ overview, visits: jest.fn().mockRejectedValue(new Error('timeout')), contactsFail: true });

    expect(await run()).toBe(true);

    const mail = send.mock.calls[0][0];
    expect(mail.subject).toBe('📊 120 visite · 1 messaggio — 23/11');
    expect(mail.html).toContain('Tutto a posto'); // nessun dato → nessun "da fare"
    expect(mail.html).not.toContain('su ieri');
    expect(mail.html).not.toContain('Search Console');
  });

  it('senza il servizio della dashboard (nessun overview) funziona ancora', async () => {
    const { run, send } = build({ overview: null });
    expect(await run()).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('con poca storia (un solo giorno) non mostra confronti', async () => {
    const { run, send } = build({ visits: jest.fn().mockResolvedValue({ viewsByDay: days([5]) }), contactsByDay: days([1]) });
    await run();
    expect(send.mock.calls[0][0].html).not.toContain('su ieri');
  });
});
