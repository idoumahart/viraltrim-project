import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';

const OUTPUT_DIR = 'scripts/screenshots';
await mkdir(OUTPUT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await context.newPage();

const jsErrors = [];
const apiErrors = [];

page.on('console', msg => {
  const text = msg.text();
  const type = msg.type();
  if (type === 'error' && !text.includes('the server responded with a status')) {
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

async function screenshot(name, contentCheck, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const html = await page.content();
    if (contentCheck(html)) break;
    await page.waitForTimeout(400);
  }
  await page.screenshot({ path: `${OUTPUT_DIR}/${name}.png`, fullPage: true });
  console.log(`📸 ${name}.png`);
}

// Helper to extract unique API errors
function uniqueApiErrors() {
  const seen = new Set();
  return apiErrors.filter(e => {
    const key = `${e.status} ${e.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

console.log('\n========== FEATURE AUDIT ==========\n');

const testEmail = `test${Date.now()}@audit.local`;
const testPassword = 'TestPass123!';

// ── 1. REGISTER ──
console.log('1️⃣  Registering test account...');
await page.goto('http://localhost:3000/register');
await screenshot('10-register-form', h => h.includes('Create account'));

await page.fill('#name', 'Test User');
await page.fill('#email', testEmail);
await page.fill('#password', testPassword);
await page.click('#tos');
await page.click('button[type="submit"]');

// Wait for redirect to dashboard or verification page
await page.waitForTimeout(3000);
await screenshot('11-register-submit', h => h.includes('Dashboard') || h.includes('Verify') || h.includes('Log in'));

// If we got redirected to login (email verification required), log in
const needsLogin = await page.content().then(h => h.includes('Log in') && !h.includes('Dashboard'));
if (needsLogin) {
  console.log('   → Logging in...');
  await page.fill('#email', testEmail);
  await page.fill('#password', testPassword);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
}

// Enable dev bypass for email verification so we can audit authenticated features
await page.evaluate(() => {
  sessionStorage.setItem('vt_dev_skip_verification', '1');
});
console.log('   → Dev verification bypass enabled');

// ── 2. DASHBOARD ──
console.log('2️⃣  Dashboard...');
await page.goto('http://localhost:3000/dashboard');
await page.waitForTimeout(1000);
await screenshot('20-dashboard', h => h.includes('Dashboard') || h.includes('Welcome') || h.includes('Clips'));

// ── 3. DISCOVERY (VIRAL SEARCH) ──
console.log('3️⃣  Discovery / Viral Search...');
await page.goto('http://localhost:3000/discovery');
await page.waitForTimeout(1000);
await screenshot('30-discovery', h => h.includes('Discovery') || h.includes('Viral') || h.includes('Trending'));

// ── 4. MY VIDEOS ──
console.log('4️⃣  My Videos...');
await page.goto('http://localhost:3000/studio/videos');
await page.waitForTimeout(1000);
await screenshot('40-my-videos', h => h.includes('Videos') || h.includes('Import') || h.includes('No videos'));

// ── 5. MY CLIPS ──
console.log('5️⃣  My Clips...');
await page.goto('http://localhost:3000/studio/clips');
await page.waitForTimeout(1000);
await screenshot('50-my-clips', h => h.includes('Clips') || h.includes('No clips') || h.includes('Create'));

// ── 6. AI VIDEO STUDIO ──
console.log('6️⃣  AI Video Studio...');
await page.goto('http://localhost:3000/studio/ai-video');
await page.waitForTimeout(1000);
await screenshot('60-ai-video-studio', h => h.includes('AI Video') || h.includes('Script') || h.includes('Voice'));

// ── 7. STUDIO GENERATOR ──
console.log('7️⃣  Studio Generator...');
await page.goto('http://localhost:3000/studio/generator');
await page.waitForTimeout(1000);
await screenshot('70-studio-generator', h => h.includes('Generator') || h.includes('AI Clip') || h.includes('Paste'));

// ── 8. EDITOR (empty state) ──
console.log('8️⃣  Editor (empty state)...');
await page.goto('http://localhost:3000/studio/editor');
await page.waitForTimeout(1000);
await screenshot('80-editor-empty', h => h.includes('No video') || h.includes('editor') || h.includes('Upload'));

await browser.close();

// ── REPORT ──
console.log('\n========== AUDIT REPORT ==========');
console.log(`Frontend JS errors: ${jsErrors.length}`);
jsErrors.forEach((e, i) => console.log(`  ${i+1}. ${e.substring(0, 140)}`));

const unique = uniqueApiErrors();
console.log(`\nUnique 5xx API errors: ${unique.length}`);
unique.forEach(e => console.log(`  ${e.status} ${e.url}`));

if (jsErrors.length === 0 && unique.length === 0) {
  console.log('\n✅ ZERO frontend errors + ZERO 5xx API errors');
}
console.log('==================================\n');
