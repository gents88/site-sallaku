import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

console.log('📍 Navigating to homepage...');
await page.goto('http://localhost:4200', { waitUntil: 'networkidle' });
console.log('✓ Current URL:', page.url());

// Wait for lang-switcher to be available
await page.waitForSelector('.lang-switcher', { timeout: 5000 });

console.log('\n📍 Clicking lang switcher button...');
await page.click('.lang-current');
await page.waitForSelector('.lang-option', { timeout: 2000 });

console.log('✓ Switcher opened');

// Get all language options
const optionTexts = await page.locator('.lang-option').allTextContents();
console.log(`✓ Found ${optionTexts.length} language options`);

// Click on English option
console.log('\n📍 Clicking English option...');
const langOptions = await page.locator('.lang-option').all();

for (const opt of langOptions) {
  const text = await opt.textContent();
  if (text.includes('English')) {
    await opt.click();
    console.log('✓ Clicked English');
    break;
  }
}

// Wait for page to settle
await page.waitForTimeout(2000);
console.log('✓ After clicking EN - URL:', page.url());

// Verify the URL changed
if (page.url().includes('/en')) {
  console.log('✅ SUCCESS: URL now includes /en prefix');
} else {
  console.log('❌ PROBLEM: URL does NOT have /en prefix');
}

await browser.close();
