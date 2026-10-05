import { expect, test } from '@playwright/test';

/**
 * Le pagine admin non devono sbordare in larghezza su un telefono: se il
 * documento è più largo della viewport, il browser rimpicciolisce tutta la
 * pagina (la pagina utenti sembrava "più piccola" per una tabella da ~690px).
 * Sessione admin finta in localStorage e API simulate: nessun backend né login.
 */
const ADMIN = { _id: 'me', name: 'Gent', email: 'g@x.it', role: 'admin' };

const PAGES: { path: string; api: Record<string, unknown> }[] = [
  {
    path: '/dashboard/users',
    api: {
      '**/api/v1/admin/users**': {
        data: [
          { _id: 'me', name: 'Gent Sallaku', email: 'gentsallaku@gmail.com', role: 'admin', emailVerified: true, createdAt: '2026-01-10' },
          { _id: 'u2', name: 'Anna Bianchi', email: 'anna.bianchi.con.email.lunga@example.com', phone: '+393331234567', role: 'user', emailVerified: false, createdAt: '2026-03-02' },
        ],
        total: 2, page: 1, totalPages: 1,
      },
    },
  },
  {
    path: '/dashboard/contacts',
    api: {
      '**/api/v1/contact?**': {
        data: [{ _id: 'c1', name: 'Mario Rossi', email: 'mario.rossi.molto.lungo@example.com', subject: 'Richiesta preventivo per una piattaforma gestionale', message: 'Buongiorno…', createdAt: '2026-10-01T10:00:00Z', read: false }],
        total: 1, page: 1, totalPages: 1,
      },
    },
  },
  {
    path: '/dashboard/newsletter',
    api: {
      '**/api/v1/newsletter/admin/campaigns': [{ _id: 'n1', subject: 'Novità di ottobre per tutti gli iscritti', html: '<p>x</p>', status: 'sending', scheduledAt: null, sentAt: null, testSentAt: null, stats: { total: 40, sent: 12, failed: 1 }, createdAt: '2026-10-01' }],
      '**/api/v1/newsletter/admin/subscribers**': { data: [{ _id: 's1', email: 'iscritto.con.email.lunga@example.com', status: 'confirmed', createdAt: '2026-09-01' }], total: 1, page: 1, totalPages: 1 },
      '**/api/v1/newsletter/admin/counts': { pending: 0, confirmed: 1, unsubscribed: 0, total: 1 },
    },
  },
];

for (const p of PAGES) {
  test(`mobile senza sbordare: ${p.path}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(user => {
      localStorage.setItem('portfolio_token', 'e2e');
      localStorage.setItem('portfolio_user', JSON.stringify(user));
    }, ADMIN);
    await page.route('**/api/v1/stats/notifications', r => r.fulfill({ json: { contactsUnread: 0, testimonialsPending: 0, notesPending: 0, liveHandoffsWaiting: 0 } }));
    for (const [pattern, json] of Object.entries(p.api)) await page.route(pattern, r => r.fulfill({ json }));

    await page.goto(p.path);
    await page.waitForLoadState('networkidle');

    const { docWidth, viewport } = await page.evaluate(() => ({ docWidth: document.documentElement.scrollWidth, viewport: window.innerWidth }));
    expect(docWidth).toBeLessThanOrEqual(viewport);
  });
}
