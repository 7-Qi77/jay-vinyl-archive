import { webkit, devices } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const browser = await webkit.launch({ headless: true });
const failures = [];
const screenshotDir = '.screenshots';
await mkdir(screenshotDir, { recursive: true });

const profiles = [
  { name: 'iPhone 15', device: 'iPhone 15' },
  { name: 'iPhone SE', device: 'iPhone SE (3rd gen)' },
  { name: 'iPhone 17 Pro Max', device: 'iPhone 17 Pro Max', reducedMotion: 'reduce' }
];

const check = (name, condition, detail = '') => {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${detail ? ` · ${detail}` : ''}`);
  if (!condition) failures.push(name);
};

async function auditViewport(page, label) {
  const metrics = await page.evaluate(() => {
    const visible = (el) => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0
        && rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight;
    };
    const controls = [...document.querySelectorAll('button, [role="button"], a')].filter(visible);
    const outside = controls.filter((el) => {
      const r = el.getBoundingClientRect();
      return r.left < -1 || r.right > innerWidth + 1;
    }).map((el) => el.id || el.className || el.tagName);
    return {
      viewport: { width: innerWidth, height: innerHeight },
      scrollWidth: document.documentElement.scrollWidth,
      outside,
      targets: {
        deckPlay: document.querySelector('#deckPlay')?.getBoundingClientRect().toJSON(),
        deckMode: document.querySelector('#deckMode')?.getBoundingClientRect().toJSON(),
        imxPlay: document.querySelector('#imxPlay')?.getBoundingClientRect().toJSON()
      }
    };
  });
  check(`${label} 无横向溢出`, metrics.scrollWidth <= metrics.viewport.width + 1,
    `${metrics.scrollWidth}/${metrics.viewport.width}`);
  check(`${label} 可见控件未越界`, metrics.outside.length === 0, metrics.outside.join(', '));
  return metrics;
}

async function checkFooterClearance(page, label) {
  await page.evaluate(() => {
    const view = document.querySelector('#viewCrate');
    view.scrollTop = view.scrollHeight;
  });
  await page.waitForTimeout(350);
  const overlap = await page.evaluate(() => {
    const footer = document.querySelector('.crate-footer').getBoundingClientRect();
    return [...document.querySelectorAll('.crate-item')].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.bottom > footer.top + 1 && r.top < footer.bottom - 1;
    }).length;
  });
  check(`${label} 底部声明不遮挡专辑封面`, overlap === 0, `overlap=${overlap}`);
  await page.evaluate(() => { document.querySelector('#viewCrate').scrollTop = 0; });
}

try {
  for (const profile of profiles) {
    const descriptor = devices[profile.device];
    const context = await browser.newContext({
      ...descriptor,
      reducedMotion: profile.reducedMotion || 'no-preference'
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${BASE}/?ios=${encodeURIComponent(profile.name)}-${Date.now()}`, { waitUntil: 'domcontentloaded' });
    await page.click('#enterBtn');
    await page.waitForTimeout(1500);
    check(`${profile.name} 唱片柜可见`, await page.locator('#viewCrate').isVisible());
    await auditViewport(page, `${profile.name} 唱片柜`);
    await checkFooterClearance(page, profile.name);

    await page.locator('.crate-item').nth(2).click();
    await page.waitForTimeout(3400);
    check(`${profile.name} 听音室可见`, await page.locator('#viewStage').isVisible());
    check(`${profile.name} 3D 画布可见`, await page.locator('#vinylCanvas').isVisible());
    await auditViewport(page, `${profile.name} 听音室`);
    await page.screenshot({ path: `${screenshotDir}/ios-${profile.name.replaceAll(' ', '-')}-stage.png` });

    await page.locator('.track-row').filter({ hasText: '暗号' }).first().locator('.track').click();
    await page.locator('#deckPlayer').waitFor({ state: 'visible' });
    const touch = await page.evaluate(() => {
      const selectors = ['#deckPlay', '#deckMode', '.track__lyric'];
      return selectors.flatMap((selector) => [...document.querySelectorAll(selector)].slice(0, 1).map((el) => {
        const r = el.getBoundingClientRect();
        return { selector, width: r.width, height: r.height };
      }));
    });
    check(`${profile.name} 播放与模式控件可点击`, touch.every((item) => item.width >= 40 && item.height >= 40), JSON.stringify(touch));
    await auditViewport(page, `${profile.name} 播放控制台`);

    await page.click('#immerseBtn');
    await page.waitForTimeout(1200);
    check(`${profile.name} 沉浸模式可见`, await page.locator('#imxUI').isVisible());
    check(`${profile.name} 沉浸保留 3D 画布`, await page.locator('#vinylCanvas').isVisible());
    check(`${profile.name} 沉浸隐藏普通播放条`, !(await page.locator('#deckPlayer').isVisible()));
    const immersiveTouch = await page.evaluate(() => [...document.querySelectorAll('.imx__actions button, .imx__play')]
      .map((el) => ({ id: el.id, width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height })));
    check(`${profile.name} 沉浸触控目标不小于 40px`, immersiveTouch.every((item) => item.width >= 40 && item.height >= 40), JSON.stringify(immersiveTouch));
    await auditViewport(page, `${profile.name} 沉浸模式`);
    await page.screenshot({ path: `${screenshotDir}/ios-${profile.name.replaceAll(' ', '-')}-immersive.png` });
    await page.keyboard.press('Escape');
    await page.locator('#imxUI').waitFor({ state: 'hidden' });

    const landscape = devices[`${profile.device} landscape`];
    if (landscape) {
      await page.setViewportSize(landscape.viewport);
      await page.waitForTimeout(1500);
      check(`${profile.name} 横屏听音室可见`, await page.locator('#viewStage').isVisible());
      check(`${profile.name} 横屏隐藏封套避免遮挡`, !(await page.locator('#stageSleeve').isVisible()));
      check(`${profile.name} 横屏隐藏书架脊避免遮挡`, !(await page.locator('#spineRail').isVisible()));
      await auditViewport(page, `${profile.name} 横屏听音室`);
      await page.screenshot({ path: `${screenshotDir}/ios-${profile.name.replaceAll(' ', '-')}-landscape.png` });
    }
    check(`${profile.name} 无页面脚本错误`, errors.length === 0, errors.join('; '));
    await context.close();
  }
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(`IOS UI FAIL · ${failures.length}`);
  process.exit(1);
}
console.log('IOS UI PASS · WebKit device simulation');
