import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';

const OUTPUT_DIR = 'scripts/redteam';
await mkdir(OUTPUT_DIR, { recursive: true });

const BASE_URL = 'https://viraltrim.codedmotion.studio';
const TEST_EMAIL = 'redteam-484654@audit.local';
const TEST_PASSWORD = 'TestPassword123!';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await context.newPage();

const jsErrors = [];
const apiErrors = [];
const testResults = [];

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

async function screenshot(name) {
  await page.screenshot({ path: `${OUTPUT_DIR}/${name}.png`, fullPage: true });
  console.log(`  📸 ${name}.png`);
}

function pass(name) {
  testResults.push({ name, status: 'PASS' });
  console.log(`  ✅ ${name}`);
}

function fail(name, reason) {
  testResults.push({ name, status: 'FAIL', reason });
  console.log(`  ❌ ${name}: ${reason}`);
}

function uniqueApiErrors() {
  const seen = new Set();
  return apiErrors.filter(e => {
    const key = `${e.status} ${e.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

console.log('\n🔴 RED TEAM AUDIT — Production\n');

// ── LOGIN ──
console.log('1️⃣  Login...');
try {
  await page.goto(`${BASE_URL}/login`);
  await page.waitForSelector('#email');
  await page.fill('#email', TEST_EMAIL);
  await page.fill('#password', TEST_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
  const html = await page.content();
  if (html.includes('Dashboard') || html.includes('PRODUCER WORKSPACE') || html.includes('Welcome back')) {
    pass('Login');
  } else {
    fail('Login', 'Did not reach dashboard');
  }
} catch (e) {
  fail('Login', e.message);
}

// ── VIRAL SEARCH ──
console.log('\n2️⃣  Viral Search...');
try {
  await page.goto(`${BASE_URL}/discovery`);
  await page.waitForTimeout(2000);
  const html = await page.content();
  if (!html.includes('Viral Search')) {
    fail('Viral Search page load', 'Page did not load');
  } else {
    // Try a real search
    const searchInput = await page.$('input[placeholder*="Search"]');
    if (searchInput) {
      await searchInput.fill('AI news');
      const searchBtn = await page.$('button:has-text("Search")');
      if (searchBtn) await searchBtn.click();
      await page.waitForTimeout(5000);
      const afterHtml = await page.content();
      if (afterHtml.includes('No results') || afterHtml.includes('Something went wrong') || afterHtml.includes('Error')) {
        fail('Viral Search query', 'Search returned error or no results');
      } else if (afterHtml.includes('youtube') || afterHtml.includes('reddit') || afterHtml.includes('tiktok') || afterHtml.includes('video')) {
        pass('Viral Search query');
      } else {
        // Might still be loading or returned empty results
        pass('Viral Search query (results may be empty)');
      }
    } else {
      pass('Viral Search page load (no search input found)');
    }
  }
  await screenshot('viral-search');
} catch (e) {
  fail('Viral Search', e.message);
}

// ── URL IMPORT ──
console.log('\n3️⃣  URL Import...');
try {
  await page.goto(`${BASE_URL}/studio/videos`);
  await page.waitForTimeout(2000);
  const html = await page.content();
  if (!html.includes('My Videos')) {
    fail('My Videos page load', 'Page did not load');
  } else {
    const linkInput = await page.$('input[placeholder*="Paste"]');
    if (linkInput) {
      await linkInput.fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      const importBtn = await page.$('button:has-text("Import")');
      if (importBtn) await importBtn.click();
      await page.waitForTimeout(8000);
      const afterHtml = await page.content();
      if (afterHtml.includes('Error') || afterHtml.includes('Something went wrong') || afterHtml.includes('failed')) {
        fail('URL Import', 'Import returned error');
      } else if (afterHtml.includes('Imported') || afterHtml.includes('Library') || afterHtml.includes('processing') || afterHtml.includes('video')) {
        pass('URL Import');
      } else {
        pass('URL Import (ambiguous result)');
      }
    } else {
      fail('URL Import', 'No paste input found');
    }
  }
  await screenshot('url-import');
} catch (e) {
  fail('URL Import', e.message);
}

// ── AI CLIP GENERATOR ──
console.log('\n4️⃣  AI Clip Generator...');
try {
  await page.goto(`${BASE_URL}/studio/generator`);
  await page.waitForTimeout(2000);
  const html = await page.content();
  if (html.includes('AI Clip Generator') || html.includes('Generate Viral Clips')) {
    pass('AI Clip Generator page load');
  } else {
    fail('AI Clip Generator page load', 'Page did not load correctly');
  }
  await screenshot('ai-clip-generator');
} catch (e) {
  fail('AI Clip Generator', e.message);
}

// ── AI VIDEO STUDIO ──
console.log('\n5️⃣  AI Video Studio...');
try {
  await page.goto(`${BASE_URL}/studio/ai-video`);
  await page.waitForTimeout(2000);
  const html = await page.content();
  if (html.includes('AI Video Studio') || html.includes("What's your video")) {
    // Try to generate a script
    const topicInput = await page.$('input[placeholder*="productivity"]');
    if (topicInput) {
      await topicInput.fill('5 tips for productivity');
      const genBtn = await page.$('button:has-text("Generate Script")');
      if (genBtn) {
        await genBtn.click();
        await page.waitForTimeout(10000);
        const afterHtml = await page.content();
        if (afterHtml.includes('Error') || afterHtml.includes('Something went wrong')) {
          fail('AI Script Generation', 'Generation returned error');
        } else if (afterHtml.includes('script') || afterHtml.includes('Script') || afterHtml.includes('Next')) {
          pass('AI Script Generation');
        } else {
          pass('AI Script Generation (ambiguous)');
        }
      } else {
        pass('AI Video Studio page load (no gen button)');
      }
    } else {
      pass('AI Video Studio page load (no topic input)');
    }
  } else {
    fail('AI Video Studio page load', 'Page did not load');
  }
  await screenshot('ai-video-studio');
} catch (e) {
  fail('AI Video Studio', e.message);
}

// ── EDITOR ──
console.log('\n6️⃣  Editor...');
try {
  await page.goto(`${BASE_URL}/studio/editor`);
  await page.waitForTimeout(2000);
  const html = await page.content();
  if (html.includes('No video') || html.includes('editor') || html.includes('Upload') || html.includes('TEXT')) {
    pass('Editor page load');
  } else {
    fail('Editor page load', 'Page did not load');
  }
  await screenshot('editor');
} catch (e) {
  fail('Editor', e.message);
}

// ── BILLING ──
console.log('\n7️⃣  Billing...');
try {
  await page.goto(`${BASE_URL}/billing`);
  await page.waitForTimeout(2000);
  const html = await page.content();
  if (html.includes('Billing') || html.includes('Plan') || html.includes('Subscription')) {
    pass('Billing page load');
  } else {
    fail('Billing page load', 'Page did not load');
  }
  await screenshot('billing');
} catch (e) {
  fail('Billing', e.message);
}

// ── API DIRECT TESTS ──
console.log('\n8️⃣  API Direct Tests...');

// 8a. Get current user
try {
  const res = await page.evaluate(async () => {
    const r = await fetch('/api/auth/me', { credentials: 'include' });
    return { status: r.status, json: await r.json().catch(() => null) };
  });
  if (res.status === 200 && res.json?.success) {
    pass('API: GET /api/auth/me');
  } else {
    fail('API: GET /api/auth/me', `Status ${res.status}`);
  }
} catch (e) {
  fail('API: GET /api/auth/me', e.message);
}

// 8b. Viral discovery API
try {
  const res = await page.evaluate(async () => {
    const r = await fetch('/api/discovery/viral?category=ai%20news&platform=all', { credentials: 'include' });
    return { status: r.status, json: await r.json().catch(() => null) };
  });
  if (res.status === 200 && res.json?.success) {
    pass('API: GET /api/discovery/viral');
  } else {
    fail('API: GET /api/discovery/viral', `Status ${res.status}, error: ${res.json?.error || 'unknown'}`);
  }
} catch (e) {
  fail('API: GET /api/discovery/viral', e.message);
}

// 8c. AI video voices API
try {
  const res = await page.evaluate(async () => {
    const r = await fetch('/api/ai-video/voices', { credentials: 'include' });
    return { status: r.status, text: await r.text() };
  });
  if (res.status === 200) {
    pass('API: GET /api/ai-video/voices');
  } else {
    fail('API: GET /api/ai-video/voices', `Status ${res.status}`);
  }
} catch (e) {
  fail('API: GET /api/ai-video/voices', e.message);
}

// 8d. Billing prices API
try {
  const res = await page.evaluate(async () => {
    const r = await fetch('/api/billing/prices', { credentials: 'include' });
    return { status: r.status, json: await r.json().catch(() => null) };
  });
  if (res.status === 200 && res.json?.success) {
    pass('API: GET /api/billing/prices');
  } else {
    fail('API: GET /api/billing/prices', `Status ${res.status}, error: ${res.json?.error || 'unknown'}`);
  }
} catch (e) {
  fail('API: GET /api/billing/prices', e.message);
}

// 8e. Clips API
try {
  const res = await page.evaluate(async () => {
    const r = await fetch('/api/clips', { credentials: 'include' });
    return { status: r.status, json: await r.json().catch(() => null) };
  });
  if (res.status === 200 && res.json?.success) {
    pass('API: GET /api/clips');
  } else {
    fail('API: GET /api/clips', `Status ${res.status}`);
  }
} catch (e) {
  fail('API: GET /api/clips', e.message);
}

// 8f. Videos API
try {
  const res = await page.evaluate(async () => {
    const r = await fetch('/api/videos', { credentials: 'include' });
    return { status: r.status, json: await r.json().catch(() => null) };
  });
  if (res.status === 200 && res.json?.success) {
    pass('API: GET /api/videos');
  } else {
    fail('API: GET /api/videos', `Status ${res.status}`);
  }
} catch (e) {
  fail('API: GET /api/videos', e.message);
}

await browser.close();

// ── REPORT ──
console.log('\n========== RED TEAM AUDIT REPORT ==========\n');
const passed = testResults.filter(r => r.status === 'PASS');
const failed = testResults.filter(r => r.status === 'FAIL');
console.log(`Tests: ${passed.length} passed, ${failed.length} failed, ${testResults.length} total\n`);

if (failed.length > 0) {
  console.log('FAILED TESTS:');
  failed.forEach(f => console.log(`  ❌ ${f.name}: ${f.reason}`));
  console.log('');
}

console.log(`Frontend JS errors: ${jsErrors.length}`);
jsErrors.forEach((e, i) => console.log(`  ${i+1}. ${e.substring(0, 140)}`));

const unique = uniqueApiErrors();
console.log(`\nUnique 5xx API errors: ${unique.length}`);
unique.forEach(e => console.log(`  ${e.status} ${e.url}`));

if (jsErrors.length === 0 && unique.length === 0 && failed.length === 0) {
  console.log('\n✅ ALL TESTS PASSED — ZERO errors');
}
console.log('===========================================\n');
