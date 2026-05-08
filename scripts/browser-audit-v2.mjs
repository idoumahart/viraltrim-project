import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';

const OUTPUT_DIR = 'scripts/screenshots';
await mkdir(OUTPUT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await context.newPage();

const errors = [];
page.on('console', msg => {
  if (msg.type() === 'error') errors.push(msg.text());
});
page.on('pageerror', err => errors.push(err.message));

async function screenshot(name, contentCheck) {
  // Wait for content to appear (not just DOM mount)
  const start = Date.now();
  while (Date.now() - start < 15000) {
    const html = await page.content();
    if (contentCheck(html)) break;
    await page.waitForTimeout(300);
  }
  await page.screenshot({ path: `${OUTPUT_DIR}/${name}.png`, fullPage: true });
  console.log(`Screenshot: ${name}.png`);
}

// 1. Landing page
console.log('Landing page...');
await page.goto('http://localhost:3000/');
await screenshot('01-landing-v2', html => html.includes('Turn ideas into viral videos'));

// Scroll down to trigger scroll-reveal animations
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(1000);
await page.screenshot({ path: `${OUTPUT_DIR}/01-landing-scrolled.png`, fullPage: true });
console.log('Screenshot: 01-landing-scrolled.png');

// 2. Login page
console.log('Login page...');
await page.goto('http://localhost:3000/login');
await screenshot('02-login-v2', html => html.includes('Email') || html.includes('Sign in'));

// 3. Register page
console.log('Register page...');
await page.goto('http://localhost:3000/register');
await screenshot('03-register-v2', html => html.includes('Email') || html.includes('Create account'));

// 4. Dashboard redirect
console.log('Dashboard (no auth)...');
await page.goto('http://localhost:3000/dashboard');
await screenshot('04-dashboard-v2', html => html.includes('Authenticating') || html.includes('Log in'));

// 5. Editor (no auth)
console.log('Editor (no auth)...');
await page.goto('http://localhost:3000/studio/editor');
await screenshot('05-editor-v2', html => html.includes('Authenticating') || html.includes('Log in'));

await browser.close();

console.log('\n=== BROWSER AUDIT V2 ===');
console.log(`Frontend JS errors: ${errors.length}`);
errors.forEach((e, i) => console.log(`  ${i+1}. ${e.substring(0, 120)}`));
console.log('========================\n');
