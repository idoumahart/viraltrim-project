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

console.log('\n🔴 RENDER PIPELINE TEST — Production\n');

// Login
await page.goto(`${BASE_URL}/login`);
await page.fill('#email', TEST_EMAIL);
await page.fill('#password', TEST_PASSWORD);
await page.click('button[type="submit"]');
await page.waitForTimeout(3000);

// Get clips via API
const clipsData = await page.evaluate(async () => {
  const r = await fetch('/api/clips', { credentials: 'include' });
  return r.json();
});

console.log(`Clips found: ${clipsData.data?.length || 0}`);

if (!clipsData.data || clipsData.data.length === 0) {
  console.log('❌ No clips to render');
  await browser.close();
  process.exit(1);
}

const clip = clipsData.data[0];
console.log(`Testing clip: ${clip.title} (${clip.id})`);

// Navigate to editor with this clip
await page.goto(`${BASE_URL}/studio/editor/${clip.id}`);
await page.waitForTimeout(5000);

const html = await page.content();
if (html.includes('Loading') || html.includes('Authenticating')) {
  await page.waitForTimeout(5000);
}

await page.screenshot({ path: 'scripts/redteam/editor-with-clip.png', fullPage: true });
console.log('📸 Editor with clip screenshot saved');

// Check for render button and try to render
const renderBtn = await page.$('button:has-text("Render")');
if (renderBtn) {
  console.log('Found render button, clicking...');
  await renderBtn.click();
  await page.waitForTimeout(30000); // Wait for FFmpeg render
  
  const afterHtml = await page.content();
  await page.screenshot({ path: 'scripts/redteam/editor-after-render.png', fullPage: true });
  console.log('📸 Post-render screenshot saved');
  
  if (afterHtml.includes('Error') || afterHtml.includes('failed') || afterHtml.includes('Something went wrong')) {
    console.log('❌ Render failed');
  } else if (afterHtml.includes('download') || afterHtml.includes('Export') || afterHtml.includes('Done')) {
    console.log('✅ Render appears successful');
  } else {
    console.log('⚠️ Render status ambiguous');
  }
} else {
  console.log('⚠️ No render button found');
}

await browser.close();

console.log(`\nFrontend JS errors: ${jsErrors.length}`);
jsErrors.forEach((e, i) => console.log(`  ${i+1}. ${e.substring(0, 200)}`));

console.log(`\n5xx API errors: ${apiErrors.length}`);
apiErrors.forEach(e => console.log(`  ${e.status} ${e.url}`));
