import { chromium } from '@playwright/test';

const EXEC = '/Users/gent/Library/Caches/ms-playwright/chromium-1117/chrome-mac/Chromium.app/Contents/MacOS/Chromium';
const SHOT_DIR = '/private/tmp/claude-502/-Users-gent-projects-site-sallaku/46ebc3ad-d737-4e00-afe7-def329bc2686/scratchpad';

const browser = await chromium.launch({ executablePath: EXEC, args: ['--no-sandbox'] });
const page = await browser.newPage();

const netErrors = [];
page.on('response', (res) => {
  if (res.status() >= 400) netErrors.push(`${res.status()} ${res.url()}`);
});
page.on('websocket', (ws) => {
  console.log('WS opened:', ws.url());
  ws.on('framesent', (f) => console.log('WS >>', String(f.payload).slice(0, 150)));
  ws.on('framereceived', (f) => console.log('WS <<', String(f.payload).slice(0, 150)));
  ws.on('close', (code) => console.log('WS closed', code));
  ws.on('socketerror', (e) => console.log('WS socketerror:', e));
});

console.log('1) Navigo su https://gentsallaku.it (produzione reale)...');
await page.goto('https://gentsallaku.it', { waitUntil: 'networkidle', timeout: 45000 });

console.log('2) Apro il widget chatbot...');
await page.locator('.cb-fab').click();
await page.locator('.cb-panel').waitFor({ state: 'visible', timeout: 10000 });

console.log('3) Invio un primo messaggio per creare la sessione...');
await page.locator('.cb-input').fill('Ciao, test produzione live handoff');
await page.locator('.cb-input').press('Enter');
await page.locator('.cb-msg--assistant').first().waitFor({ state: 'visible', timeout: 20000 });
await page.waitForTimeout(300);

console.log('4) Digito per far comparire il banner...');
await page.locator('.cb-input').fill('Vorrei parlare con Gent, test reale');
await page.waitForTimeout(1800);
await page.screenshot({ path: `${SHOT_DIR}/prod-banner.png` });
const bannerVisible = await page.locator('.lhp-banner').isVisible().catch(() => false);
console.log('   banner visibile:', bannerVisible);

if (bannerVisible) {
  console.log('5) Clicco Sì, contattalo...');
  const [postResp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/live-handoff') && r.request().method() === 'POST', { timeout: 15000 }).catch(() => null),
    page.locator('.lhp-btn--primary').click(),
  ]);
  console.log('   risposta POST:', postResp ? postResp.status() : 'NESSUNA');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${SHOT_DIR}/prod-waiting.png` });
}

console.log('\n=== ERRORI HTTP >=400 ===');
console.log(netErrors.join('\n') || '(nessuno)');

await browser.close();
