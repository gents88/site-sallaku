import { AdminOverviewService, OVERVIEW_TTL_MS } from './admin-overview.service';

function makeService(overrides: Record<string, Record<string, jest.Mock>> = {}) {
  const ok = (v: unknown) => jest.fn().mockResolvedValue(v);
  const deps = {
    users: { count: ok(3) },
    contacts: { count: ok(10), countUnread: ok(2), findAll: ok([]), countByDay: ok([{ date: '2026-10-01', count: 1 }]) },
    blog: { getContentSummary: ok({ total: 4, published: 3, drafts: 1 }), getTopPostsByViews: ok([{ title: 'A', slug: 'a', viewCount: 9 }]) },
    projects: { findAll: ok([{}, {}]) },
    experiences: { findAll: ok([{}]) },
    analytics: {
      getVisitSummary: ok({ totalViews: 100, uniqueVisitors: 40, viewsByDay: [] }),
      getAdvancedAnalytics: ok({}), getAnalyticsStats: ok({}), getTopPages: ok([]), getToolConversionFunnel: ok([]),
    },
    analyticsExport: { getMonthlyHistory: ok([]) },
    searchConsole: { getSummary: ok({ configured: false }) },
    audit: { findRecent: ok([]) },
    chatbot: { getChatbotStats: ok({}) },
    consent: { stats: ok({ total: 0 }) },
    liveHandoff: { listActive: ok([]) },
    systemInfo: { health: jest.fn(() => ({ ok: true })), version: jest.fn(() => ({})), ops: jest.fn(() => ({})) },
    testimonials: { getStats: ok({ total: 5, approved: 2, pending: 3, spam: 0, featured: 1 }) },
    notes: { getAllForAdmin: ok({ data: [], total: 4 }) },
  };
  for (const [k, v] of Object.entries(overrides)) Object.assign((deps as Record<string, object>)[k], v);
  const d = deps as unknown as Record<string, never>;
  const service = new AdminOverviewService(
    d.users, d.contacts, d.blog, d.projects, d.experiences, d.analytics, d.analyticsExport,
    d.searchConsole, d.audit, d.chatbot, d.consent, d.liveHandoff, d.systemInfo, d.testimonials, d.notes,
  );
  return { service, deps };
}

describe('AdminOverviewService', () => {
  it('assembles every dashboard section in a single snapshot', async () => {
    const { service } = makeService();
    const res = await service.getOverview();

    expect(res.errors).toEqual([]);
    expect(res.sections.projectsCount).toBe(2);
    expect(res.sections.experiencesCount).toBe(1);
    expect(res.sections.core).toEqual(expect.objectContaining({ users: 3, contacts: 10, unreadContacts: 2 }));
    expect(Object.keys(res.sections)).toEqual(expect.arrayContaining([
      'topPosts', 'advanced', 'analyticsStats', 'topPages', 'monthlyHistory', 'toolConversion', 'auditLogs',
      'chatbotStats', 'gsc', 'consentStats', 'liveHandoffs', 'systemHealth', 'systemDetails', 'systemOps',
    ]));
  });

  it('isolates a failing section: null + listed in errors, the others still load', async () => {
    const { service } = makeService({ chatbot: { getChatbotStats: jest.fn().mockRejectedValue(new Error('groq down')) } });
    const res = await service.getOverview();

    expect(res.errors).toEqual(['chatbotStats']);
    expect(res.sections.chatbotStats).toBeNull();
    expect(res.sections.projectsCount).toBe(2);
  });

  it('also isolates a section that throws synchronously', async () => {
    const { service } = makeService({ systemInfo: { ops: jest.fn(() => { throw new Error('boom'); }) } });
    const res = await service.getOverview();
    expect(res.errors).toEqual(['systemOps']);
  });

  it('serves a cached snapshot within the TTL and rebuilds after it', async () => {
    const { service, deps } = makeService();
    const t0 = Date.now();
    await service.getOverview(false, t0);
    await service.getOverview(false, t0 + OVERVIEW_TTL_MS - 1);
    expect(deps.users.count).toHaveBeenCalledTimes(1);

    await service.getOverview(false, Date.now() + OVERVIEW_TTL_MS + 1);
    expect(deps.users.count).toHaveBeenCalledTimes(2);
  });

  it('bypasses the cache when fresh=true', async () => {
    const { service, deps } = makeService();
    await service.getOverview();
    await service.getOverview(true);
    expect(deps.users.count).toHaveBeenCalledTimes(2);
  });

  it('does not cache a partial snapshot, so the next poll retries the failed section', async () => {
    const failing = jest.fn().mockRejectedValueOnce(new Error('timeout')).mockResolvedValue({ total: 1 });
    const { service } = makeService({ consent: { stats: failing } });

    expect((await service.getOverview()).errors).toEqual(['consentStats']);
    expect((await service.getOverview()).errors).toEqual([]);
    expect(failing).toHaveBeenCalledTimes(2);
  });

  it('counts what is waiting for the admin bell', async () => {
    const { service, deps } = makeService({
      liveHandoff: { listActive: jest.fn().mockResolvedValue([{ status: 'requested' }, { status: 'live' }, { status: 'notified' }]) },
    });
    await expect(service.notificationSummary()).resolves.toEqual({
      contactsUnread: 2, testimonialsPending: 3, notesPending: 4, liveHandoffsWaiting: 2,
    });
    expect(deps.notes.getAllForAdmin).toHaveBeenCalledWith('pending', 1, 0);
  });

  it('shares one in-flight build between concurrent callers', async () => {
    const { service, deps } = makeService();
    await Promise.all([service.getOverview(), service.getOverview(), service.getOverview()]);
    expect(deps.users.count).toHaveBeenCalledTimes(1);
  });
});
