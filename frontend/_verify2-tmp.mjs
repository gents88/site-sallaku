import { chromium } from '@playwright/test';
const exe = '/Users/gent/Library/Caches/ms-playwright/chromium-1117/chrome-mac/Chromium.app/Contents/MacOS/Chromium';
const browser = await chromium.launch({ executablePath: exe });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
const SCRATCH = '/private/tmp/claude-502/-Users-gent-projects-site-sallaku/9ef151d0-1ac3-4c6a-8a74-5269de040411/scratchpad';
page.on('console', m => console.log('CONSOLE', m.type(), ':', m.text().slice(0,200)));
page.on('requestfailed', r => console.log('REQFAIL:', r.url(), r.failure()?.errorText));
page.on('response', r => { if (r.url().includes('/api/')) console.log('API', r.status(), r.url()); });

await page.goto('http://localhost:4200/blog', { waitUntil: 'load', timeout: 20000 });
await page.waitForTimeout(6000);
await page.screenshot({ path: `${SCRATCH}/debug-blog2.png` });
await browser.close();
