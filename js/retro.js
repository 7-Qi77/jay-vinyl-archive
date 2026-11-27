/* retro.js — 融合层：纸面橡胶管卡通（rubber-hose-ui）× 暗面像素机器（pixel-worlds）
 * 原则：两种风格各归其位——卡通只上纸面（控制 bench / 歌词内页），像素场景只上暗面或自带背景；
 * 所有控件复用 app.js 既有节点（reparent），事件单一来源；本模块只监听 / 派发 window 事件。
 * 版权：两库均 MIT，见 assets/vendor 下各 LICENSE。 */

/* 站点根由本模块 URL 回推（js/retro.js → 站点根），
   兼容 GitHub Pages 子路径部署（/jay-vinyl-archive/），本地根路径同样成立 */
const SITE_ROOT = new URL('../', import.meta.url).href;
const HOSE = SITE_ROOT + 'assets/vendor/rubber-hose-ui/';
const PIXEL = SITE_ROOT + 'assets/vendor/pixel-worlds/';

const ERAS = [
  { label: '2000-03', name: '出道 · 范特西年代', from: 0, to: 3 },
  { label: '2004-07', name: '七里香 · 萧邦年代', from: 4, to: 7 },
  { label: '2008-12', name: '跨时代 · 惊叹号年代', from: 8, to: 11 },
  { label: '2014-26', name: '最伟大的作品 · 太阳之子年代', from: 12, to: 15 },
];
const eraOf = (i) => ERAS.findIndex((e) => i >= e.from && i <= e.to);

const scriptCache = new Map();
function loadScript(src) {
  if (!scriptCache.has(src)) {
    scriptCache.set(src, new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = res;
      s.onerror = () => rej(new Error(`load fail ${src}`));
      document.head.appendChild(s);
    }));
  }
  return scriptCache.get(src);
}
const loadHoseBench = () => Promise.all(['slider', 'tabs', 'toast'].map((n) => loadScript(HOSE + n + '.js')));
const loadHoseSheet = () => Promise.all(['progress', 'toggle', 'button'].map((n) => loadScript(HOSE + n + '.js')));
const loadPixel = () => Promise.all(['sigil', 'sage', 'round', 'raven', 'hoard'].map((n) => loadScript(PIXEL + n + '.js')));

const $ = (id) => document.getElementById(id);
const emit = (name, detail) => window.dispatchEvent(new CustomEvent(name, { detail }));

/* 自定义元素属性写入守卫：组件 upgrade 之前对 host 赋值会留下 own property，
   永久遮蔽原型 accessor（读值冻结、内部状态不跟随）。故先删 own 再写；
   尚未 upgrade 时退回 attribute，让组件首帧读到正确初值。 */
function setProp(el, name, val) {
  if (!el) return;
  if (!customElements.get(el.localName)) {
    if (name === 'checked') el.toggleAttribute('checked', Boolean(val));
    else if (name === 'selected') {
      el.querySelectorAll('option').forEach((o, i) => o.toggleAttribute('selected', i === Number(val)));
    } else el.setAttribute('value', String(val));
    return;
  }
  if (Object.prototype.hasOwnProperty.call(el, name)) delete el[name];
  el[name] = val;
}

let enabled = true;
let cb = {};
let albums = [];
let benchBuilt = false;
let sheetBuilt = false;
let benchReady = false;
let sheetReady = false;
let seeking = false;
let room = null;
let irisRaf = 0;
let coversPct = 0;

/* 封面进度：组件可能尚未 upgrade，先记值，像素件加载后再补画 */
function applyCovers(pct) {
  coversPct = pct;
  $('gateSigil')?.set?.(pct);
  $('crateRound')?.set?.(pct);
  if (pct >= 1) {
    const note = $('gateSigilNote');
    if (note) note.textContent = '唱针已唤醒 · 请入内';
    setTimeout(() => { $('crateRoundWrap')?.classList.add('is-done'); }, 1600);
  }
}

/* ── DOM 构建 ─────────────────────────────────────────────── */
function buildBench() {
  if (benchBuilt) return;
  benchBuilt = true;
  const stage = $('viewStage');
  const bench = document.createElement('div');
  bench.className = 'bench';
  bench.id = 'retroBench';
  bench.innerHTML = `
    <div class="bench__era">
      <hose-tabs id="eraTabs" label="专辑年代"></hose-tabs>
      <span class="bench__era-name" id="eraName"></span>
    </div>
    <div class="bench__shelf" id="benchShelf"></div>
    <div class="bench__deck">
      <div class="bench__transport" id="benchTransport"></div>
      <div class="bench__meta" id="benchMeta"></div>
      <hose-slider id="deckHose" label="播放进度" min="0" max="100" step="1" value="0"></hose-slider>
    </div>
    <hose-toast id="benchToast" stay duration="3.2" role="status" aria-live="polite"></hose-toast>`;
  stage.appendChild(bench);
  const tabs = $('eraTabs');
  tabs.innerHTML = ERAS.map((e, i) => `<option value="${i}">${e.label}</option>`).join('');
  tabs.addEventListener('change', (e) => {
    const era = ERAS[Number(e.detail.value)];
    if (era) cb.onEraPick?.(era.from);
  });
  const hose = $('deckHose');
  hose.addEventListener('input', () => {
    seeking = true;
    emit('jc-retro:seek', { pct: Number(hose.value) });
  });
  hose.addEventListener('change', () => {
    seeking = false;
    emit('jc-retro:seek', { pct: Number(hose.value) });
  });
}

function buildSheet() {
  if (sheetBuilt) return;
  sheetBuilt = true;
  const head = document.querySelector('.lyrics__head');
  const headRow = document.createElement('div');
  headRow.className = 'sheet-retro-head';
  headRow.innerHTML = `
    <span class="sheet-retro-cap">逐字填色</span>
    <hose-toggle id="karaokeToggle" label="逐字卡拉OK填色" checked></hose-toggle>
    <sage-status id="lyricSage" state="done" label="STANDBY" detail="LOCAL FIRST"></sage-status>`;
  head.appendChild(headRow);
  $('karaokeToggle').addEventListener('change', (e) => cb.onKaraoke?.(Boolean(e.target.checked)));

  const audioRow = document.querySelector('.lyrics__audio');
  const thermo = document.createElement('hose-progress');
  thermo.id = 'sheetThermo';
  thermo.setAttribute('label', '本曲播放进度');
  audioRow.appendChild(thermo);

  const side = document.querySelector('.lyrics__side');
  const footRow = document.createElement('div');
  footRow.className = 'sheet-retro-foot';
  footRow.innerHTML = `
    <span class="sheet-retro-import">
      <hose-button id="sheetImportBtn">导入歌词文件</hose-button>
      <span class="sheet-retro-cap">导入 LRC / TXT</span>
    </span>
    <round-bar id="batchRound" label="批量导入进度" hidden></round-bar>
    <span class="sheet-retro-clear">
      <hoard-button id="clearHoard" heading="CLEAR LOCAL IMPORTS" warning="HOLD 1.7S - NO UNDO" done-heading="CLEARED" done-warning="LOCAL CACHE GONE"></hoard-button>
      <span class="sheet-retro-cap">长按清除本专辑本机导入与缓存</span>
    </span>`;
  side.insertBefore(footRow, side.querySelector('.lyrics__note'));
  $('sheetImportBtn').addEventListener('click', () => $('lyricsImportBtn')?.click());
  $('clearHoard').addEventListener('hoard:delete', () => {
    cb.onClearAlbum?.(albums[cb.getIndex?.() ?? 0]?.n);
  });

  // 压碟档案卡：提示词 + 附加磨损滑杆（驱动同一条物理链）
  const dossier = document.createElement('section');
  dossier.className = 'dossier';
  dossier.innerHTML = `
    <span class="dossier__kicker">PRESSING DOSSIER · 压碟档案</span>
    <strong class="dossier__title" id="dossierTitle">—</strong>
    <p class="dossier__prompt" id="dossierPrompt">档案加载中…</p>
    <span class="dossier__meta" id="dossierMeta"></span>
    <label class="dossier__wear">
      <span>附加磨损</span>
      <hose-slider id="wearHose" label="附加磨损" min="0" max="100" step="1" value="0"></hose-slider>
      <output id="wearOut">+0%</output>
    </label>`;
  side.insertBefore(dossier, side.firstChild);
  const wearHose = $('wearHose');
  let off = 0;
  try { off = Number(localStorage.getItem('jc-wear-offset')) || 0; } catch { off = 0; }
  setProp(wearHose, 'value', Math.round(off * 200));
  $('wearOut').textContent = `+${Math.round(off * 100)}%`;
  const onWear = () => {
    const v = Number(wearHose.value) || 0;
    $('wearOut').textContent = `+${Math.round(v / 2)}%`;
    emit('jc-retro:wear', { pct: v });
  };
  wearHose.addEventListener('input', onWear);
  wearHose.addEventListener('change', onWear);
}

function buildMisc() {
  // 门禁法阵
  const gateContent = document.querySelector('.gate__content');
  const sigilWrap = document.createElement('div');
  sigilWrap.className = 'gate-sigil';
  sigilWrap.innerHTML = `<sigil-spinner id="gateSigil" label="筹备听音室"></sigil-spinner><span class="gate-sigil__note" id="gateSigilNote">封面与曲目筹备中</span>`;
  gateContent.insertBefore(sigilWrap, $('enterBtn'));
  // 唱片柜酒馆加载条
  const crate = $('viewCrate');
  const roundWrap = document.createElement('div');
  roundWrap.className = 'crate-round';
  roundWrap.id = 'crateRoundWrap';
  roundWrap.innerHTML = `<round-bar id="crateRound" label="封面加载进度"></round-bar>`;
  crate.appendChild(roundWrap);
  // 记忆渡鸦
  const memBody = $('memoryBody');
  const raven = document.createElement('raven-send');
  raven.id = 'memoryRaven';
  raven.setAttribute('label', 'SEND NOTE');
  raven.setAttribute('sent-label', 'SENT');
  raven.setAttribute('duration', '1.6');
  memBody.appendChild(raven);
  raven.addEventListener('click', () => cb.onMemorySave?.());
  raven.addEventListener('raven:sent', () => notify('记忆已寄出，存于本机', 'SENT'));
  // 复古层开关
  const header = document.querySelector('.topbar');
  const btn = document.createElement('button');
  btn.className = 'icon-btn retro-btn';
  btn.id = 'retroBtn';
  btn.type = 'button';
  btn.textContent = '复古';
  btn.setAttribute('aria-pressed', 'true');
  btn.dataset.cursor = '复古层';
  header.appendChild(btn);
  btn.addEventListener('click', () => setEnabled(!enabled));
  // iris 转场幕布
  const iris = document.createElement('canvas');
  iris.id = 'irisFx';
  iris.className = 'iris-fx';
  iris.setAttribute('aria-hidden', 'true');
  document.body.appendChild(iris);
  // 沉浸像素听音室
  const imx = $('imxUI');
  const roomEl = document.createElement('pixel-room');
  roomEl.id = 'pixelRoom';
  imx.insertBefore(roomEl, imx.firstChild);
}

/* ── 控件复_parent_：单一事件源 ───────────────────────────── */
function reparent(on) {
  const deck = $('deckPlayer');
  const shelfWrap = document.querySelector('.spine-rail-wrap');
  if (on && benchReady) {
    buildBench();
    $('benchTransport').append($('deckPrev'), $('deckPlay'), $('deckNext'));
    const title = deck.querySelector('.deck-player__title');
    $('benchMeta').append(title, $('deckTime'));
    $('benchShelf').append($('spineRail'));
  } else {
    if (deck && $('benchTransport')) {
      deck.querySelector('.deck-player__transport').append($('deckPrev'), $('deckPlay'), $('deckNext'));
      const info = deck.querySelector('.deck-player__info');
      const t = $('benchMeta').querySelector('.deck-player__title');
      if (t) info.insertBefore(t, $('deckBarWrap'));
      const time = $('benchMeta').querySelector('#deckTime');
      if (time) deck.appendChild(time);
      shelfWrap.append($('spineRail'));
    }
  }
}

/* ── 开关 ────────────────────────────────────────────────── */
function setEnabled(on, { silent = false } = {}) {
  enabled = on;
  try { localStorage.setItem('jc-retro', on ? '1' : '0'); } catch { /* ignore */ }
  document.body.classList.toggle('no-retro', !on);
  $('retroBtn')?.setAttribute('aria-pressed', on ? 'true' : 'false');
  if (on) {
    loadPixel().then(() => applyCovers(coversPct)).catch(() => {});
    if (cb.getView?.() === 'stage') loadHoseBench().then(() => { benchReady = true; reparent(true); syncAlbum(cb.getIndex?.() ?? 0); }).catch(() => {});
    if (cb.getSheetOpen?.()) loadHoseSheet().then(() => { sheetReady = true; }).catch(() => {});
  } else {
    reparent(false);
  }
  if (!silent) cb.onToggle?.(on);
}

/* ── 通知 / 状态入口 ─────────────────────────────────────── */
function notify(zh, en) {
  if (!enabled) return;
  const t = $('benchToast');
  if (t?.show) t.show(zh, en || 'DONE');
}

function syncAlbum(index) {
  const era = eraOf(index);
  const tabs = $('eraTabs');
  if (tabs && era >= 0) setProp(tabs, 'selected', era);
  const name = $('eraName');
  if (name && era >= 0) name.textContent = `${ERAS[era].name} · ${ERAS[era].to - ERAS[era].from + 1} 张`;
  $('clearHoard')?.reset?.();
  const album = albums[index];
  room?.setRoom?.({
    accent: album?.palette?.accent || '#c9a86a',
    spines: albums.map((a) => a.palette.bg),
    active: index,
    titleEn: (album?.en || 'JAY CHOU').toUpperCase(),
  });
}

/* ── 抖动 iris 转场：橡皮管圆收放 × 像素 Bayer 边缘 ───────── */
function iris() {
  if (!enabled || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cv = $('irisFx');
  const AW = 200, AH = 112;
  cv.width = AW; cv.height = AH;
  const g = cv.getContext('2d');
  const img = g.createImageData(AW, AH);
  const d = img.data;
  const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const cx = AW / 2, cy = AH / 2;
  const maxR = Math.hypot(cx, cy) + 4;
  const t0 = performance.now();
  const DUR = 620;
  cancelAnimationFrame(irisRaf);
  cv.classList.add('is-on');
  const step = (now) => {
    const t = Math.min(1, (now - t0) / DUR);
    const e = 1 - Math.pow(1 - t, 3);
    const r = e * maxR;
    for (let y = 0; y < AH; y++) {
      for (let x = 0; x < AW; x++) {
        const dist = Math.hypot(x - cx, y - cy);
        const i = (y * AW + x) * 4;
        let a = 255;
        if (dist < r - 3) a = 0;
        else if (dist < r + 3) {
          const th = (B4[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
          a = (dist - (r - 3)) / 6 > th ? 255 : 0;
        }
        d[i] = 10; d[i + 1] = 8; d[i + 2] = 6; d[i + 3] = a;
      }
    }
    g.putImageData(img, 0, 0);
    if (t < 1) irisRaf = requestAnimationFrame(step);
    else cv.classList.remove('is-on');
  };
  irisRaf = requestAnimationFrame(step);
}

/* ── 事件接线 ────────────────────────────────────────────── */
function wire() {
  window.addEventListener('jc:covers', (e) => {
    applyCovers(Math.max(0, Math.min(1, e.detail.pct)));
  });
  window.addEventListener('jc:progress', (e) => {
    const { pct, sheetPct, playing } = e.detail;
    if (!seeking) { const h = $('deckHose'); if (h) setProp(h, 'value', Math.round(pct)); }
    $('sheetThermo')?.set?.(sheetPct / 100);
    room?.setRoom?.({ progress: pct / 100, playing });
  });
  window.addEventListener('jc:playstate', (e) => {
    const { playing, hasEntry } = e.detail;
    room?.setRoom?.({ playing });
    if (!hasEntry) { const h = $('deckHose'); if (h) setProp(h, 'value', 0); $('sheetThermo')?.reset?.(); }
  });
  window.addEventListener('jc:album', (e) => syncAlbum(e.detail.index));
  window.addEventListener('jc:profile', (e) => {
    const p = e.detail.profile;
    const t = $('dossierTitle');
    const pr = $('dossierPrompt');
    const meta = $('dossierMeta');
    if (!t || !pr || !meta) return;
    if (!p) {
      t.textContent = '—';
      pr.textContent = '档案未加载';
      meta.textContent = '';
      return;
    }
    const alb = albums.find((a) => a.n === e.detail.n);
    const trackName = e.detail.trackTitle
      || document.querySelector(`.track[data-track="${e.detail.track}"] .track__name`)?.textContent
      || alb?.tracks?.[e.detail.track] || '';
    t.textContent = `${trackName || alb?.title || ''} · ${p.pressing || ''}`;
    pr.textContent = p.prompt || '';
    meta.textContent = `${p.era || ''} · 播放约 ${p.plays ?? '—'} 次 · 磨损 ${Math.round((p.wear || 0) * 100)}% · ${p.id || ''}`;
  });
  window.addEventListener('jc:view', (e) => {
    const view = e.detail.view;
    iris();
    if (view === 'stage' && enabled && !benchReady) {
      loadHoseBench().then(() => { benchReady = true; reparent(true); syncAlbum(cb.getIndex?.() ?? 0); }).catch(() => {});
    }
    if (view === 'imx' && enabled) {
      loadScript(SITE_ROOT + 'js/pixel-room.js').then(() => { room = $('pixelRoom'); syncAlbum(cb.getIndex?.() ?? 0); }).catch(() => {});
    }
    if (view !== 'imx') room?.setRoom?.({ playing: false });
  });
  window.addEventListener('jc:sheet', (e) => {
    if (e.detail.open && enabled && !sheetReady) loadHoseSheet().then(() => { sheetReady = true; }).catch(() => {});
  });
  window.addEventListener('jc:lyricstate', (e) => {
    const { state, detail } = e.detail;
    $('lyricSage')?.set?.(state, state.toUpperCase(), detail || '');
  });
  window.addEventListener('jc:batch', (e) => {
    const bar = $('batchRound');
    if (!bar) return;
    bar.hidden = !e.detail.active;
    if (e.detail.active) bar.set(e.detail.pct);
  });
  window.addEventListener('jc:notify', (e) => notify(e.detail.zh, e.detail.en));
  window.addEventListener('jc-retro:toggle', (e) => setEnabled(Boolean(e.detail.on)));
}

/* ── 启动 ────────────────────────────────────────────────── */
export function bootRetro(callbacks) {
  cb = callbacks || {};
  albums = cb.albums || [];
  try { enabled = localStorage.getItem('jc-retro') === '1'; } catch { enabled = false; }
  buildMisc();
  buildBench();
  buildSheet();
  wire();
  document.body.classList.toggle('no-retro', !enabled);
  if (enabled) loadPixel().then(() => applyCovers(coversPct)).catch(() => {});
  $('retroBtn')?.setAttribute('aria-pressed', enabled ? 'true' : 'false');
  // 卡拉OK开关初值由 app 同步
  return {
    setKaraokeChecked(on) { const t = $('karaokeToggle'); if (t) setProp(t, 'checked', Boolean(on)); },
    notify,
    isEnabled: () => enabled,
  };
}