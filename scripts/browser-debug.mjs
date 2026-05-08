import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await context.newPage();

const networkLogs = [];
page.on('request', req => {
  const url = req.url();
  if (url.includes('.js') || url.includes('vite')) {
    networkLogs.push({ type: 'request', url, method: req.method() });
  }
});
page.on('response', res => {
  const url = res.url();
  if (url.includes('.js') || url.includes('vite')) {
    networkLogs.push({ type: 'response', url, status: res.status() });
  }
});
page.on('console', msg => {
  const text = msg.text();
  if (text.includes('Error') || text.includes('error') || text.includes('chunk') || text.includes('load')) {
    console.log(`[console ${msg.type()}] ${text}`);
  }
});

console.log('Navigating to login...');
await page.goto('http://localhost:3000/login');

// Wait up to 15s for the login form to appear
const start = Date.now();
let found = false;
while (Date.now() - start < 15000) {
  const html = await page.content();
  if (html.includes('Email') || html.includes('Password') || html.includes('Sign in')) {
    found = true;
    console.log(`Login hydrated after ${Date.now() - start}ms`);
    break;
  }
  await page.waitForTimeout(500);
}

if (!found) {
  console.log('LOGIN NEVER HYDRATED after 15s');
  const html = await page.content();
  console.log('Page HTML snippet:', html.substring(0, 800));
}

// Check for failed chunk requests
const failed = networkLogs.filter(n => n.type === 'response' && n.status >= 400);
if (failed.length > 0) {
  console.log('Failed network requests:');
  failed.forEach(f => console.log(`  ${f.status} ${f.url}`));
} else {
  console.log('No failed JS chunk requests');
}

await browser.close();
