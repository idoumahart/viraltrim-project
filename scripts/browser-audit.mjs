import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';

const OUTPUT_DIR = 'scripts/screenshots';
await mkdir(OUTPUT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await context.newPage();

const errors = [];
const consoleLogs = [];

page.on('console', msg => {
  const text = msg.text();
  const type = msg.type();
  consoleLogs.push({ type, text });
  if (type === 'error') errors.push(text);
});

page.on('pageerror', err => {
  errors.push(err.message);
});

async function screenshot(name, waitForSelector) {
  try {
    if (waitForSelector) {
      await page.waitForSelector(waitForSelector, { timeout: 10000 });
    } else {
      await page.waitForLoadState('networkidle', { timeout: 10000 });
    }
  } catch (e) {
    console.log(`Warning: ${name} - timeout waiting for ${waitForSelector || 'networkidle'}`);
  }
  await page.screenshot({ path: `${OUTPUT_DIR}/${name}.png`, fullPage: true });
  console.log(`Screenshot: ${name}.png`);
}

// 1. Landing page
console.log('Navigating to landing page...');
await page.goto('http://localhost:3000/');
await screenshot('01-landing', '#root');

// 2. Login page
console.log('Navigating to login...');
await page.goto('http://localhost:3000/login');
await screenshot('02-login', '#root');

// 3. Register page
console.log('Navigating to register...');
await page.goto('http://localhost:3000/register');
await screenshot('03-register', '#root');

// 4. Dashboard (will redirect to login since no auth)
console.log('Navigating to dashboard (no auth)...');
await page.goto('http://localhost:3000/dashboard');
await screenshot('04-dashboard-redirect', '#root');

// 5. Editor (will redirect to login since no auth)
console.log('Navigating to editor (no auth)...');
await page.goto('http://localhost:3000/studio/editor');
await screenshot('05-editor-redirect', '#root');

await browser.close();

// Report
console.log('\n=== BROWSER AUDIT REPORT ===');
console.log(`Console logs: ${consoleLogs.length}`);
console.log(`Errors: ${errors.length}`);
if (errors.length > 0) {
  console.log('Error details:');
  errors.forEach((e, i) => console.log(`  ${i + 1}. ${e}`));
}
console.log('============================\n');
