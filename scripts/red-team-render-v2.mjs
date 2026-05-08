import { chromium } from 'playwright';

const BASE_URL = 'https://viraltrim.codedmotion.studio';
const TEST_EMAIL = 'redteam-484654@audit.local';
const TEST_PASSWORD = 'TestPassword123!';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await context.newPage();

const jsErrors = [];
const apiErrors = [];

page.on('console', msg => {
  const text = msg.text();
  if (msg.type() === 'error' && !text.includes('the server responded with a status')) {
    jsErrors.push(text);
  }
});
page.on('pageerror', err => jsErrors.push(err.message));
page.on('response', res => {
  const url = res.url();
  if (url.includes('/api/') && res.status() >= 500) {
    apiErrors.push({ url: url.replace(/\?.*$/, ''), status: res.status() });
  }
});

console.log('\n🔴 RENDER PIPELINE TEST v2 — Production\n');

// Login
await page.goto(`${BASE_URL}/login`);
await page.fill('#email', TEST_EMAIL);
await page.fill('#password', TEST_PASSWORD);
await page.click('button[type="submit"]');
await page.waitForTimeout(3000);

// Get clips
const clipsData = await page.evaluate(async () => {
  const r = await fetch('/api/clips', { credentials: 'include' });
  return r.json();
});

if (!clipsData.data?.length) {
  console.log('❌ No clips');
  await browser.close();
  process.exit(1);
}

const clip = clipsData.data[0];
console.log(`Clip: ${clip.title} (${clip.id})`);
console.log(`Video URL: ${clip.videoUrl}`);

// Open editor
await page.goto(`${BASE_URL}/studio/editor/${clip.id}`);
await page.waitForTimeout(8000);
await page.screenshot({ path: 'scripts/redteam/editor-v2.png', fullPage: true });

// Try "Finish & Schedule" button
const finishBtn = await page.$('button:has-text("Finish")');
if (finishBtn) {
  console.log('Clicking Finish & Schedule...');
  await finishBtn.click();
  await page.waitForTimeout(15000);
  await page.screenshot({ path: 'scripts/redteam/editor-finish.png', fullPage: true });
  
  const html = await page.content();
  if (html.includes('render') || html.includes('Export') || html.includes('download') || html.includes('Done')) {
    console.log('✅ Render flow triggered');
  } else if (html.includes('Error') || html.includes('failed')) {
    console.log('❌ Render failed');
  } else {
    console.log('⚠️ Check screenshot for status');
  }
} else {
  console.log('⚠️ No Finish button');
  // List all buttons
  const buttons = await page.$$eval('button', btns => btns.map(b => b.textContent?.trim()).filter(Boolean));
  console.log('Available buttons:', buttons.slice(0, 20));
}

await browser.close();

console.log(`\nJS errors: ${jsErrors.length}`);
jsErrors.forEach((e, i) => console.log(`  ${i+1}. ${e.substring(0, 200)}`));
console.log(`5xx errors: ${apiErrors.length}`);
