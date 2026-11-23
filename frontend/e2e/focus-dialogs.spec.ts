import { expect, Page, test } from '@playwright/test';

/**
 * Finestre sovrapposte (scheda account, chat, ricerca): il focus deve entrare all'apertura, restare dentro
 * con Tab e tornare a chi le ha aperte alla chiusura. Prima la scheda account lasciava il focus sul pulsante
 * dietro (Tab scorreva la pagina sotto lo sfondo) e chat e ricerca non restituivano il focus.
 */
const USER = { _id: 'u1', name: 'Anna Bianchi', email: 'anna@example.com', role: 'user' };

async function prepare(page: Page, loggedIn: boolean): Promise<void> {
  await page.addInitScript(([u, li]) => {
    localStorage.setItem('hasSeenOnboarding', 'true');
    if (li) {
      localStorage.setItem('portfolio_token', 'e2e');
      localStorage.setItem('portfolio_user', JSON.stringify(u));
    }
  }, [USER, loggedIn] as const);
  await page.route('**/api/v1/**', (r) => {
    const url = r.request().url();
    if (url.includes('/auth/refresh')) return r.fulfill({ json: { access_token: 'e2e', user: USER } });
    return r.fulfill({ json: url.includes('/system/flags') ? {} : { data: [], total: 0 } });
  });
  await page.goto('/homepage');
  await page.waitForLoadState('networkidle');
  const reject = page.getByRole('button', { name: /reject all|rifiuta tutto/i });
  if (await reject.count()) await reject.first().click();
}

/** Premendo Tab più volte il focus non deve mai uscire dalla finestra. */
async function expectTabStaysInside(page: Page, container: string): Promise<void> {
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab');
    const inside = await page.evaluate((sel) => !!document.activeElement?.closest(sel), container);
    expect(inside, `Tab n.${i + 1} è uscito da ${container}`).toBe(true);
  }
}

test('scheda account: focus dentro, Tab non esce, Esc riporta il focus al pulsante', async ({ page }) => {
  await prepare(page, true);
  const opener = page.getByRole('button', { name: /Anna/ }).first();
  await opener.click();
  await expect(page.locator('.account-modal')).toBeVisible();
  expect(await page.evaluate(() => !!document.activeElement?.closest('.account-modal'))).toBe(true);

  await expectTabStaysInside(page, '.account-modal');
  await page.keyboard.press('Escape');
  await expect(page.locator('.account-modal')).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test('chat: il focus entra nel campo, Tab non esce, Esc riporta il focus al pulsante', async ({ page }) => {
  await prepare(page, false);
  const fab = page.locator('.cb-fab');
  await fab.click();
  await expect(page.locator('.cb-input')).toBeFocused();

  await expectTabStaysInside(page, '.cb-panel');
  await page.keyboard.press('Escape');
  await expect(page.locator('.cb-panel')).toHaveCount(0);
  await expect(fab).toBeFocused();
});

test('ricerca: il focus entra nel campo, Tab non esce, Esc riporta il focus al pulsante', async ({ page }) => {
  await prepare(page, false);
  const opener = page.getByRole('button', { name: /cerca|search/i }).first();
  await opener.click();
  await expect(page.locator('.so-input')).toBeFocused();

  await expectTabStaysInside(page, '.so-panel');
  await page.keyboard.press('Escape');
  await expect(page.locator('.so-panel')).toHaveCount(0);
  await expect(opener).toBeFocused();
});
