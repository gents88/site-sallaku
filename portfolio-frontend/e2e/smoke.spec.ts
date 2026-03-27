import { expect, test } from '@playwright/test';

test('homepage loads with navigation and theme toggle', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle(/Gent Sallaku/i);
  await expect(page.getByRole('navigation')).toBeVisible();
  await expect(page.getByRole('link', { name: /projects/i })).toBeVisible();

  const themeToggle = page.getByRole('button', { name: /dark mode|light mode/i }).first();
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