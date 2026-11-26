import { expect, test, type Page } from '@playwright/test';

/**
 * Giro di controllo prima del rilascio: per le pagine principali, su telefono piccolo, telefono, tablet e desktop,
 * verifica che non ci siano errori di JavaScript, richieste fallite (a parte l'API, simulata), scroll orizzontale,
 * immagini rotte, chiavi di traduzione grezze o segnaposto nel testo.
 */
const ROUTES = [
  '/', '/about', '/experience', '/projects', '/blog', '/contact', '/lab', '/lab/convert', '/lab/qr-code',
  '/lab/pdf-to-jpg', '/lab/compress-image', '/privacy-policy', '/terms', '/cookie-policy',
  '/en', '/en/lab', '/sq/contact',
];
const VIEWPORTS = [
  { name: '320', width: 320, height: 640 },
  { name: '375', width: 375, height: 812 },
  { name: '768', width: 768, height: 1024 },
  { name: '1280', width: 1280, height: 800 },
];

/** API simulata: le liste paginate rispondono con { data, total }, tutto il resto con una lista vuota. */
async function mockApi(page: Page) {
  await page.route('**/api/**', (route) => {
    const paged = /\/(?:testimonials|blog|posts|search)(?:[/?]|$)/.test(route.request().url());
    route.fulfill({ status: 200, contentType: 'application/json', body: paged ? JSON.stringify({ data: [], items: [], total: 0 }) : '[]' });
  });
}

for (const vp of VIEWPORTS) {
  test.describe(`viewport ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    for (const url of ROUTES) {
      test(`${url}: senza errori, overflow, immagini rotte o testi grezzi`, async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}\n${(e.stack ?? '').split('\n').slice(1, 4).join('\n')}`));
        page.on('console', (m) => { if (m.type() === 'error' && !/\/api\//.test(m.text()) && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
        page.on('requestfailed', (r) => { if (new URL(r.url()).origin === new URL(page.url()).origin && !r.url().includes('/api/')) errors.push(`requestfailed: ${r.url()}`); });
        page.on('response', (r) => { if (r.status() >= 400 && !r.url().includes('/api/') && !/google|gstatic/.test(r.url())) errors.push(`${r.status()}: ${r.url()}`); });
        await mockApi(page);

        await page.goto(url, { waitUntil: 'networkidle' });
        await expect(page.locator('h1').first()).toBeVisible();

        const report = await page.evaluate(() => {
          const doc = document.documentElement;
          const text = document.body.innerText;
          const broken = [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.currentSrc && !i.closest('[hidden]')).map((i) => i.currentSrc);
          return {
            overflow: doc.scrollWidth - doc.clientWidth,
            broken,
            raw: /(?:^|\s)(?:[a-z]+_[a-z_0-9]+\.){1,3}[a-z_0-9]+(?=\s|$)/.exec(text)?.[0] ?? null,
            placeholder: /lorem ipsum|\bTODO\b|\[object Object\]|\{\{|(?:^|\s)undefined(?:\s|$)|(?:^|\s)NaN(?:\s|$)/i.exec(text)?.[0] ?? null,
          };
        });
        expect(errors, errors.join('\n')).toEqual([]);
        expect(report.overflow, 'scroll orizzontale').toBeLessThanOrEqual(1);
        expect(report.broken, 'immagini rotte').toEqual([]);
        expect(report.raw, 'chiave di traduzione grezza').toBeNull();
        expect(report.placeholder, 'segnaposto').toBeNull();
      });
    }
  });
}

test.describe('percorsi del visitatore', () => {
  // Chi ha già visto il tour guidato non lo rivede: così il tour non copre la pagina durante il test.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('hasSeenOnboarding', 'true'));
  });

  test('si arriva ai progetti, al blog e al contatto con la navigazione e si torna alla home', async ({ page }) => {
    await mockApi(page);
    await page.goto('/', { waitUntil: 'networkidle' });
    for (const [name, path] of [[/progetti/i, /\/projects/], [/blog/i, /\/blog/], [/contatt/i, /\/contact/]] as const) {
      // Con molti test in parallelo il clic può arrivare prima che la pagina sia pronta: si riprova.
      await expect(async () => {
        await page.getByRole('link', { name }).first().click({ timeout: 3000 });
        await expect(page).toHaveURL(path, { timeout: 3000 });
      }).toPass({ timeout: 20_000 });
      await expect(page.locator('h1').first()).toBeVisible();
    }
  });

  test('da tastiera: il link "vai al contenuto" compare al focus e porta al contenuto', async ({ page }) => {
    await mockApi(page);
    await page.goto('/about', { waitUntil: 'networkidle' });
    const skip = page.locator('a.skip-link');
    await expect(async () => {
      await skip.focus();
      await expect(skip).toBeFocused({ timeout: 1000 });
      const box = await skip.boundingBox();
      expect(box && box.width > 20 && box.height > 10, 'il link deve diventare visibile al focus').toBe(true);
      await page.keyboard.press('Enter');
      await expect(page.locator('#main-content')).toBeFocused({ timeout: 2000 });
    }).toPass({ timeout: 20_000 });
  });

  test('ogni elemento raggiunto con Tab mostra un indicatore di focus visibile', async ({ page }) => {
    await mockApi(page);
    await page.goto('/contact', { waitUntil: 'networkidle' });
    const bad: string[] = [];
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press('Tab');
      const r = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const cs = getComputedStyle(el);
        const visible = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== 'none';
        return { visible, tag: `${el.tagName.toLowerCase()}[aria-label="${el.getAttribute('aria-label') ?? ''}"] text="${(el.textContent ?? '').trim().slice(0, 30)}" cls=${String(el.className).slice(0, 60)}` };
      });
      if (r && !r.visible) bad.push(r.tag);
    }
    expect(bad, bad.join('\n')).toEqual([]);
  });

  test('pagina inesistente: mostra la pagina 404 e un modo per tornare indietro', async ({ page }) => {
    await mockApi(page);
    await page.goto('/questa-pagina-non-esiste', { waitUntil: 'networkidle' });
    await expect(page.locator('h1').first()).toBeVisible();
    await expect(page.getByRole('link', { name: /home|inizio|torna/i }).first()).toBeVisible();
  });
});
