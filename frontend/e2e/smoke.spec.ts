import { expect, test } from '@playwright/test';

test('homepage loads with navigation and theme toggle', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle(/Gent Sallaku/i);
  // Più landmark di navigazione (principale, rapida, sidebar): ognuno ha la sua etichetta.
  await expect(page.locator('nav.navbar')).toBeVisible();
  // Lingua di default italiana; il link compare sia in navbar sia nella tab bar.
  await expect(page.getByRole('link', { name: /progetti|projects/i }).first()).toBeVisible();

  // Etichetta tradotta e a tre stati (chiaro/scuro/sistema), es. "Tema di sistema attivo. Passa a…".
  const themeToggle = page.locator('app-theme-toggle button').first();
  await expect(themeToggle).toBeVisible();
});

test('manifest is exposed for PWA install', async ({ page, request }) => {
  const response = await request.get('/manifest.webmanifest');
  expect(response.ok()).toBeTruthy();

  const manifest = await response.json();
  expect(manifest.name).toContain('Gent Sallaku');

  await page.goto('/');
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
});