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
await page.addInitScript(() => localStorage.clear());
page.on('pageerror', (e) => errors.push(`pageerror: ${e}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`);
});

try {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.click('#enterBtn');
  await page.waitForTimeout(2000);
  ok('进入唱片柜', await page.locator('#viewCrate').isVisible());
  ok('首次访问默认典雅 3D 模式', await page.evaluate(() => document.body.classList.contains('no-retro')));
  await page.waitForFunction(() => window.__jc?.audio?._directGain && window.__jc?.audio?._vinylGain);
  const referenceRoute = await page.evaluate(() => window.__jc.audio.debug);
  ok('原声模式默认绕过黑胶链', referenceRoute.mode === 'reference' && referenceRoute.directGain > 0.99 && referenceRoute.vinylGain < 0.01);

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

  await page.click('[data-listen-mode="vinyl"]');
  await page.waitForTimeout(450);
  const vinylRoute = await page.evaluate(() => window.__jc.audio.debug);
  ok('黑胶模式切换物理链', vinylRoute.mode === 'vinyl' && vinylRoute.directGain < 0.01 && vinylRoute.vinylGain > 0.99);
  await page.click('[data-listen-mode="reference"]');
  await page.waitForTimeout(450);
  ok('切回原声恢复纯净路由', await page.evaluate(() => window.__jc.audio.debug.mode === 'reference'));

  await page.locator('.track').first().click();
  await page.waitForTimeout(600);
  await page.locator('.track').first().locator('.track__lyric').click();
  await page.waitForTimeout(300);
  ok('歌词内页打开', await page.locator('#lyricsPanel').isVisible());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  await page.click('#immerseBtn');
  await page.waitForTimeout(1100);
  ok('沉浸模式开启', !(await page.locator('#imxUI').isHidden()));
  ok('沉浸模式保留真实 3D 唱机', await page.locator('#vinylCanvas').isVisible());
  ok('沉浸模式隐藏普通播放条', !(await page.locator('#deckPlayer').isVisible()));
  ok('沉浸模式呈现专辑回忆文案', (await page.locator('#imxMemoryText').textContent()).length > 10);
  ok('沉浸模式同步聆听模式', (await page.locator('#imxMode').textContent()) === '原声');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
  ok('沉浸模式退出', await page.locator('#imxUI').isHidden());

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await mobile.addInitScript(() => localStorage.clear());
  mobile.on('pageerror', (e) => errors.push(`mobile pageerror: ${e}`));
  mobile.on('console', (m) => {
    if (m.type() === 'error') errors.push(`mobile console: ${m.text()}`);
  });
  await mobile.goto(`${BASE}/?mobile=${Date.now()}`, { waitUntil: 'networkidle' });
  await mobile.click('#enterBtn');
  await mobile.waitForTimeout(1600);
  await mobile.locator('.crate-item').nth(4).click();
  await mobile.waitForTimeout(3200);
  await mobile.locator('.track').first().click();
  await mobile.waitForTimeout(500);
  ok('移动端播放控制台可用', await mobile.locator('#deckMode').isVisible());
  await mobile.click('#deckMode');
  await mobile.waitForTimeout(400);
  ok('移动端可切换黑胶模式', await mobile.evaluate(() => window.__jc.audio.debug.mode === 'vinyl'));
  ok('移动端舞台无横向溢出', await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await mobile.click('#immerseBtn');
  await mobile.waitForTimeout(1000);
  ok('移动端沉浸模式保持开启', await mobile.locator('#imxUI').isVisible());
  ok('移动端沉浸模式隐藏普通播放条', !(await mobile.locator('#deckPlayer').isVisible()));
  ok('移动端沉浸模式无横向溢出', await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await mobile.close();

  ok(`控制台无报错${errors.length ? `（${errors.length} 条）` : ''}`, errors.length === 0);
  if (errors.length) console.log(errors.join('\n'));
} catch (e) {
  console.error('SMOKE CRASH:', e);
  failed = 1;
} finally {
  await browser.close();
}

process.exit(failed);
