/**
 * 冒烟回归：门厅 → 唱片柜 → 听音室 → 完整曲目 → 歌词内页 → 沉浸模式。
 * 用法：npm i 后先启动本地服务（python -m http.server 5173），再 npm run test:smoke。
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const errors = [];
let failed = 0;

const ok = (name, cond) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
  if (!cond) failed = 1;
};

const browser = await chromium.launch({
  channel: 'msedge',
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required']
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => errors.push(`pageerror: ${e}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`);
});

try {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.click('#enterBtn');
  await page.waitForTimeout(2000);
  ok('进入唱片柜', await page.locator('#viewCrate').isVisible());

  try {
    await page.waitForFunction(() => document.querySelectorAll('.jacket.has-cover').length >= 15, { timeout: 20000 });
  } catch {
    /* 封面走网络，失败有档案版兜底 */
  }

  await page.locator('.crate-item').nth(4).click();
  await page.waitForTimeout(3400);
  ok('进入听音室', await page.locator('#viewStage').isVisible());

  const trackCount = await page.locator('.track').count();
  ok(`曲目表加载（${trackCount} 首，≥9 视为完整）`, trackCount >= 9);

  await page.locator('.track').first.click();
  await page.waitForTimeout(600);
  ok('歌词内页打开', await page.locator('#lyricsPanel').isVisible());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  await page.click('#immerseBtn');
  await page.waitForTimeout(1100);
  ok('沉浸模式开启', !(await page.locator('#imxUI').isHidden()));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
  ok('沉浸模式退出', await page.locator('#imxUI').isHidden());

  ok(`控制台无报错${errors.length ? `（${errors.length} 条）` : ''}`, errors.length === 0);
  if (errors.length) console.log(errors.join('\n'));
} catch (e) {
  console.error('SMOKE CRASH:', e);
  failed = 1;
} finally {
  await browser.close();
}

process.exit(failed);
