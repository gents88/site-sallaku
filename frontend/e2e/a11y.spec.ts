import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * Accessibilità automatica (axe-core, regole WCAG 2.0/2.1 A e AA) sulle
 * pagine pubbliche principali. Falliscono solo le violazioni "serious" e
 * "critical": le "minor/moderate" vengono stampate per essere sistemate
 * senza bloccare la pipeline.
 */
const PAGES = ['/', '/projects', '/blog', '/contact', '/testimonials', '/lab', '/en/lab', '/lab/pdf-summary'];

for (const scheme of ['light', 'dark'] as const) for (const path of PAGES) {
  test(`a11y (${scheme}): ${path}`, async ({ page }, testInfo) => {
    // Il tema di default segue il sistema: si controllano entrambe le palette.
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto(path);
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      // Widget di terze parti (consenso cookie di Google, Turnstile) fuori dal nostro controllo.
      .exclude('iframe')
      .analyze();

    const blocking = results.violations.filter(v => v.impact === 'serious' || v.impact === 'critical');
    const others = results.violations.filter(v => !blocking.includes(v));
    if (others.length) {
      await testInfo.attach('a11y-minor', { body: JSON.stringify(others.map(v => ({ id: v.id, nodes: v.nodes.length })), null, 2), contentType: 'application/json' });
    }
    expect(
      blocking.map(v => `${v.impact} ${v.id}: ${v.help} (${v.nodes.length}× es. ${v.nodes[0]?.target.join(' ')})`),
    ).toEqual([]);
  });
}

test('palette Ctrl+K: apertura, navigazione da tastiera, chiusura con Esc', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Control+k');
  const input = page.getByRole('combobox');
  await expect(input).toBeFocused();
  await expect(page.getByRole('listbox')).toBeVisible();

  await page.keyboard.press('ArrowDown');
  const active = await input.getAttribute('aria-activedescendant');
  expect(active).toBeTruthy();
  await expect(page.locator(`#${active}`)).toHaveAttribute('aria-selected', 'true');

  await page.keyboard.press('Escape');
  await expect(page.getByRole('combobox')).toHaveCount(0);
});

test('mobile: il menu "Altro" trattiene il focus e si chiude con Esc', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const more = page.locator('.bottom-tabbar button[aria-controls="nav-menu"]');
  await more.click();
  await expect(more).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#nav-menu a').first()).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  await expect(more).toBeFocused();
});
