import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const browser = await chromium.launch({
  channel: process.env.BROWSER_CHANNEL || 'msedge',
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required']
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
  serviceWorkers: 'block'
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.addInitScript(() => localStorage.clear());

try {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.goto(`${BASE}/?perf=${Date.now()}`, { waitUntil: 'networkidle' });
  const initial = await page.evaluate(() => {
    const resources = performance.getEntriesByType('resource').filter((entry) => entry.name.includes(location.host));
    return {
      transferKB: resources.reduce((sum, entry) => sum + (entry.transferSize || 0), 0) / 1024,
      resources: resources.length
    };
  });
  await page.click('#enterBtn');
  await page.waitForTimeout(1400);
  await page.locator('.crate-item').nth(4).click();
  await page.waitForTimeout(3400);
  const frames = await page.evaluate(() => new Promise((resolve) => {
    const deltas = [];
    let last = performance.now();
    const end = last + 2200;
    const step = (now) => {
      deltas.push(now - last);
      last = now;
      if (now < end) requestAnimationFrame(step);
      else {
        deltas.shift();
        deltas.sort((a, b) => a - b);
        resolve({
          avg: deltas.reduce((sum, value) => sum + value, 0) / deltas.length,
          p95: deltas[Math.floor(deltas.length * 0.95)],
          frames: deltas.length
        });
      }
    };
    requestAnimationFrame(step);
  }));
  const result = { initial, frames, errors };
  console.log(JSON.stringify(result, null, 2));
  const pass = initial.transferKB < 1400 && frames.avg < 34 && frames.p95 < 50 && errors.length === 0;
  console.log(pass ? 'PERF PASS · mobile 4× CPU budget' : 'PERF FAIL · mobile 4× CPU budget');
  if (!pass) process.exitCode = 1;
} finally {
  await browser.close();
}
