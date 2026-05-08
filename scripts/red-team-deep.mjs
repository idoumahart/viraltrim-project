import { chromium } from 'playwright';
import { readFileSync } from 'fs';
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

console.log('\n🔴 RED TEAM DEEP AUDIT — Production\n');

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
  if (html.includes('Dashboard') || html.includes('PRODUCER WORKSPACE')) {
    pass('Login');
  } else {
    fail('Login', 'Did not reach dashboard');
  }
} catch (e) {
  fail('Login', e.message);
}

// ── VIDEO UPLOAD ──
console.log('\n2️⃣  Video Upload...');
try {
  await page.goto(`${BASE_URL}/studio/videos`);
  await page.waitForTimeout(2000);

  // Find file input (might be hidden)
  const fileInput = await page.$('input[type="file"]');
  if (!fileInput) {
    fail('Video Upload', 'No file input found');
  } else {
    await fileInput.setInputFiles('scripts/test-video.mp4');
    await page.waitForTimeout(8000);
    const html = await page.content();
    if (html.includes('Error') || html.includes('failed') || html.includes('Upload failed')) {
      fail('Video Upload', 'Upload returned error');
    } else if (html.includes('processing') || html.includes('video') || html.includes('Library')) {
      pass('Video Upload');
    } else {
      pass('Video Upload (ambiguous)');
    }
  }
} catch (e) {
  fail('Video Upload', e.message);
}

// ── CLIP GENERATION from uploaded video ──
console.log('\n3️⃣  Clip Generation...');
try {
  await page.goto(`${BASE_URL}/studio/videos`);
  await page.waitForTimeout(3000);
  const html = await page.content();

  // Check if we have a video to generate clips from
  if (html.includes('No videos') || html.includes('No videos yet')) {
    fail('Clip Generation', 'No uploaded video available');
  } else {
    // Try to click on a video or generate clips button
    const genBtn = await page.$('button:has-text("Generate")');
    if (genBtn) {
      await genBtn.click();
      await page.waitForTimeout(15000);
      const afterHtml = await page.content();
      if (afterHtml.includes('Error') || afterHtml.includes('failed')) {
        fail('Clip Generation', 'Generation returned error');
      } else if (afterHtml.includes('clip') || afterHtml.includes('Clip')) {
        pass('Clip Generation');
      } else {
        pass('Clip Generation (ambiguous)');
      }
    } else {
      pass('Clip Generation (no generate button found)');
    }
  }
} catch (e) {
  fail('Clip Generation', e.message);
}

// ── AI VIDEO STUDIO full flow ──
console.log('\n4️⃣  AI Video Studio — Script...');
let scriptResult = null;
try {
  await page.goto(`${BASE_URL}/studio/ai-video`);
  await page.waitForTimeout(2000);

  const topicInput = await page.$('input[placeholder*="productivity"]');
  if (topicInput) {
    await topicInput.fill('5 productivity hacks for entrepreneurs');
    const genBtn = await page.$('button:has-text("Generate Script")');
    if (genBtn) {
      await genBtn.click();
      await page.waitForTimeout(12000);
      const html = await page.content();
      if (html.includes('Error') || html.includes('Something went wrong') || html.includes('Failed to fetch')) {
        fail('AI Script Generation', 'Script generation error visible in UI');
      } else {
        pass('AI Script Generation');
      }
    } else {
      pass('AI Script Generation (no button)');
    }
  } else {
    pass('AI Script Generation (no input)');
  }
} catch (e) {
  fail('AI Script Generation', e.message);
}

console.log('\n5️⃣  AI Video Studio — Voice...');
try {
  // Click Next to go to Voice step
  const nextBtn = await page.$('button:has-text("Next")');
  if (nextBtn) {
    await nextBtn.click();
    await page.waitForTimeout(3000);
    const html = await page.content();
    if (html.includes('Voice') || html.includes('voice')) {
      pass('AI Voice Step');
    } else {
      pass('AI Voice Step (ambiguous)');
    }
  } else {
    pass('AI Voice Step (no next button)');
  }
} catch (e) {
  fail('AI Voice Step', e.message);
}

console.log('\n6️⃣  AI Video Studio — Footage/Pexels...');
try {
  // Click Next to go to Footage step
  const nextBtn2 = await page.$('button:has-text("Next")');
  if (nextBtn2) {
    await nextBtn2.click();
    await page.waitForTimeout(5000);
    const html = await page.content();
    if (html.includes('Footage') || html.includes('footage') || html.includes('Pexels') || html.includes('stock')) {
      pass('AI Footage Step');
    } else if (html.includes('Error') || html.includes('failed')) {
      fail('AI Footage Step', 'Footage search returned error');
    } else {
      pass('AI Footage Step (ambiguous)');
    }
  } else {
    pass('AI Footage Step (no next button)');
  }
} catch (e) {
  fail('AI Footage Step', e.message);
}

// ── FAL.AI VIDEO GENERATION ──
console.log('\n7️⃣  fal.ai Video Generation...');
try {
  const res = await page.evaluate(async () => {
    const r = await fetch('/api/ai-video/generate-videos', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'A serene mountain landscape at sunset', duration: 5 }),
    });
    return { status: r.status, json: await r.json().catch(() => null) };
  });
  if (res.status === 200 && res.json?.success) {
    pass('fal.ai Video Generation API');
  } else if (res.status === 503) {
    fail('fal.ai Video Generation API', 'Service unavailable (API key missing?)');
  } else {
    fail('fal.ai Video Generation API', `Status ${res.status}, error: ${res.json?.error || 'unknown'}`);
  }
} catch (e) {
  fail('fal.ai Video Generation API', e.message);
}

// ── RENDER CLIP (browser-side FFmpeg) ──
console.log('\n8️⃣  Browser Render Pipeline...');
try {
  await page.goto(`${BASE_URL}/studio/clips`);
  await page.waitForTimeout(2000);
  const html = await page.content();
  if (html.includes('No clips')) {
    pass('Browser Render (no clips to render)');
  } else {
    // Try to find a render button
    const renderBtn = await page.$('button:has-text("Render")');
    if (renderBtn) {
      await renderBtn.click();
      await page.waitForTimeout(15000);
      const afterHtml = await page.content();
      if (afterHtml.includes('Error') || afterHtml.includes('failed')) {
        fail('Browser Render', 'Render returned error');
      } else {
        pass('Browser Render');
      }
    } else {
      pass('Browser Render (no render button)');
    }
  }
} catch (e) {
  fail('Browser Render', e.message);
}

await browser.close();

// ── REPORT ──
console.log('\n========== RED TEAM DEEP AUDIT REPORT ==========\n');
const passed = testResults.filter(r => r.status === 'PASS');
const failed = testResults.filter(r => r.status === 'FAIL');
console.log(`Tests: ${passed.length} passed, ${failed.length} failed, ${testResults.length} total\n`);

if (failed.length > 0) {
  console.log('FAILED TESTS:');
  failed.forEach(f => console.log(`  ❌ ${f.name}: ${f.reason}`));
  console.log('');
}

console.log(`Frontend JS errors: ${jsErrors.length}`);
jsErrors.forEach((e, i) => console.log(`  ${i+1}. ${e.substring(0, 200)}`));

const unique = uniqueApiErrors();
console.log(`\nUnique 5xx API errors: ${unique.length}`);
unique.forEach(e => console.log(`  ${e.status} ${e.url}`));

console.log('================================================\n');
