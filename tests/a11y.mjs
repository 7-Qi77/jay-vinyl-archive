import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const browser = await chromium.launch({
  channel: process.env.BROWSER_CHANNEL || 'msedge',
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required']
});
const failures = [];

async function scan(page, profile, view) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  for (const violation of result.violations) {
    failures.push(`${profile}/${view}: ${violation.id} (${violation.impact}) × ${violation.nodes.length}`);
  }
  console.log(`${violationCount(result)}  ${profile}/${view}`);
}

const violationCount = (result) => result.violations.length ? `FAIL ${result.violations.length}` : 'PASS';

try {
  for (const profile of [
    { name: 'desktop', viewport: { width: 1440, height: 900 }, isMobile: false },
    { name: 'mobile', viewport: { width: 390, height: 844 }, isMobile: true }
  ]) {
    const context = await browser.newContext({
      viewport: profile.viewport,
      isMobile: profile.isMobile,
      hasTouch: profile.isMobile
    });
    const page = await context.newPage();
    await page.addInitScript(() => localStorage.clear());
    await page.goto(`${BASE}/?a11y=${profile.name}-${Date.now()}`, { waitUntil: 'networkidle' });
    await scan(page, profile.name, 'gate');
    await page.click('#enterBtn');
    await page.waitForTimeout(1300);
    await scan(page, profile.name, 'crate');
    await page.locator('.crate-item').nth(4).click();
    await page.waitForTimeout(3200);
    await scan(page, profile.name, 'stage');
    await page.locator('.track__lyric').first().click();
    await page.waitForTimeout(350);
    await scan(page, profile.name, 'lyrics');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    await page.click('#immerseBtn');
    await page.waitForTimeout(1000);
    await scan(page, profile.name, 'immersive');
    await context.close();
  }
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('A11Y PASS · WCAG 2.1 AA key views');
