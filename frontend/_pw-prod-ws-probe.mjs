import { chromium } from '@playwright/test';

const EXEC = '/Users/gent/Library/Caches/ms-playwright/chromium-1117/chrome-mac/Chromium.app/Contents/MacOS/Chromium';

const browser = await chromium.launch({ executablePath: EXEC, args: ['--no-sandbox'] });
const page = await browser.newPage();

await page.addInitScript(() => {
  window.__wsLog = [];
  const OrigWS = window.WebSocket;
  window.WebSocket = new Proxy(OrigWS, {
    construct(target, args) {
      const url = args[0];
      const entry = { url, readyStateAtClose: null, events: [] };
      window.__wsLog.push(entry);
      const instance = new target(...args);
      instance.addEventListener('open', () => entry.events.push('open'));
      instance.addEventListener('close', (e) => entry.events.push(`close code=${e.code} reason=${e.reason}`));
      instance.addEventListener('error', () => entry.events.push('error'));
      return instance;
    },
  });
});

console.log('1) Navigo su https://gentsallaku.it ...');
await page.goto('https://gentsallaku.it', { waitUntil: 'networkidle', timeout: 45000 });

console.log('2) Apro chatbot, mando messaggio, digito e clicco Sì...');
await page.locator('.cb-fab').click();
await page.locator('.cb-panel').waitFor({ state: 'visible', timeout: 10000 });
await page.locator('.cb-input').fill('Ciao, probe WS produzione');
await page.locator('.cb-input').press('Enter');
await page.locator('.cb-msg--assistant').first().waitFor({ state: 'visible', timeout: 20000 });
await page.waitForTimeout(300);
await page.locator('.cb-input').fill('Voglio parlare con Gent, probe');
await page.waitForTimeout(1800);

const bannerVisible = await page.locator('.lhp-banner').isVisible().catch(() => false);
console.log('   banner visibile:', bannerVisible);
if (bannerVisible) {
  await page.locator('.lhp-btn--primary').click();
}

console.log('3) Attendo 6s per dare tempo alla connessione WS...');
await page.waitForTimeout(6000);

const wsLog = await page.evaluate(() => window.__wsLog);
console.log('\n=== WebSocket costruiti dalla pagina reale ===');
console.log(JSON.stringify(wsLog, null, 2));

await browser.close();
