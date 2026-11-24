import { ALBUMS, pad2 } from './data.js';
import { createTurntable } from './scene.js';
import { VinylAudio } from './audio.js';
import { initCovers, getCoverUrls, getStageImage, initTracklists } from './covers.js';
import {
  initMedia,
  resolveAudio,
  registerImport,
  dropImport,
  hasLocalAudio,
  getTrackMeta,
  getLyrics,
  parseLyricData,
  lyricSourceLabel,
  adoptFullTracklist
} from './media.js';
import { initLyricStore, readLyricData, readLyric, writeLyric, removeLyric, migrateLyricIndices } from './lyricstore.js';
import { bootRetro } from './retro.js';

const emit = (name, detail) => window.dispatchEvent(new CustomEvent(name, { detail }));

/* ── 15 个原创几何图形，对应每张专辑的气质 ───────────────── */
const MOTIFS = {
  rings: `<svg viewBox="0 0 200 200"><circle class="line" cx="100" cy="100" r="82"/><circle class="line" cx="100" cy="100" r="64"/><circle class="thin" cx="100" cy="100" r="46"/><circle class="fill" cx="100" cy="100" r="4"/><line class="thin" x1="16" y1="184" x2="184" y2="16"/></svg>`,
  crescent: `<svg viewBox="0 0 200 200"><path class="fill" d="M104 18a82 82 0 1 0 0 164 68 68 0 1 1 0-164Z"/><line class="thin" x1="24" y1="38" x2="68" y2="38"/><line class="thin" x1="24" y1="52" x2="56" y2="52"/><line class="thin" x1="24" y1="66" x2="62" y2="66"/></svg>`,
  dimensions: `<svg viewBox="0 0 200 200"><g class="line"><circle cx="40" cy="40" r="12"/><circle cx="100" cy="40" r="12"/><circle cx="160" cy="40" r="12"/><circle cx="40" cy="100" r="12"/><circle cx="160" cy="100" r="12"/><circle cx="40" cy="160" r="12"/><circle cx="100" cy="160" r="12"/><circle cx="160" cy="160" r="12"/></g><circle class="fill" cx="160" cy="100" r="4"/><line class="thin" x1="100" y1="52" x2="100" y2="148"/></svg>`,
  frame: `<svg viewBox="0 0 200 200"><rect class="line" x="24" y="24" width="152" height="152"/><rect class="thin" x="36" y="36" width="128" height="128"/><path class="line" d="M24 60V24h36M140 24h36v36M176 140v36h-36M60 176H24v-36"/><path class="thin" d="M24 44h20V24M156 24v20h20M176 156h-20v20M44 176v-20H24"/><circle class="fill" cx="100" cy="100" r="5"/></svg>`,
  petals: `<svg viewBox="0 0 200 200"><g class="line"><ellipse cx="100" cy="64" rx="14" ry="32"/><ellipse cx="100" cy="64" rx="14" ry="32" transform="rotate(72 100 100)"/><ellipse cx="100" cy="64" rx="14" ry="32" transform="rotate(144 100 100)"/><ellipse cx="100" cy="64" rx="14" ry="32" transform="rotate(216 100 100)"/><ellipse cx="100" cy="64" rx="14" ry="32" transform="rotate(288 100 100)"/></g><circle class="fill" cx="100" cy="100" r="6"/></svg>`,
  keys: `<svg viewBox="0 0 200 200"><rect class="line" x="28" y="58" width="144" height="84"/><g class="thin"><line x1="48.5" y1="58" x2="48.5" y2="142"/><line x1="69" y1="58" x2="69" y2="142"/><line x1="89.5" y1="58" x2="89.5" y2="142"/><line x1="110" y1="58" x2="110" y2="142"/><line x1="130.5" y1="58" x2="130.5" y2="142"/><line x1="151" y1="58" x2="151" y2="142"/></g><g class="fill-ink"><rect x="43" y="58" width="11" height="50"/><rect x="73" y="58" width="11" height="50"/><rect x="104" y="58" width="11" height="50"/><rect x="134" y="58" width="11" height="50"/><rect x="157" y="58" width="11" height="50"/></g><line class="thin" x1="20" y1="154" x2="180" y2="154"/></svg>`,
  mirror: `<svg viewBox="0 0 200 200"><path class="line" d="M92 30a62 62 0 1 0 0 140"/><path class="line" d="M108 30a62 62 0 1 1 0 140"/><g class="thin"><line x1="60" y1="72" x2="140" y2="72"/><line x1="52" y1="100" x2="148" y2="100"/><line x1="60" y1="128" x2="140" y2="128"/></g><circle class="fill" cx="100" cy="100" r="4"/></svg>`,
  stripes: `<svg viewBox="0 0 200 200"><g class="line"><line x1="26" y1="156" x2="96" y2="86"/><line x1="44" y1="168" x2="124" y2="88"/><line x1="62" y1="180" x2="152" y2="90"/></g><path class="fill" d="M136 30l7 17 18 2-14 12 4 18-15-9-15 9 4-18-14-12 18-2z"/></svg>`,
  diamond: `<svg viewBox="0 0 200 200"><path class="line" d="M100 32l46 68-46 68-46-68z"/><ellipse class="thin" cx="100" cy="100" rx="80" ry="28" transform="rotate(-24 100 100)"/><circle class="line" cx="100" cy="100" r="22"/><circle class="fill" cx="100" cy="100" r="4"/><circle class="line" cx="100" cy="32" r="3"/></svg>`,
  arch: `<svg viewBox="0 0 200 200"><path class="line" d="M58 170V92c0-32 18-52 42-68 24 16 42 36 42 68v78"/><path class="thin" d="M72 170V96c0-24 12-40 28-52 16 12 28 28 28 52v74"/><line class="line" x1="44" y1="170" x2="156" y2="170"/><line class="thin" x1="34" y1="182" x2="166" y2="182"/><circle class="fill" cx="100" cy="102" r="4"/></svg>`,
  bang: `<svg viewBox="0 0 200 200"><rect class="fill-ink" x="82" y="28" width="36" height="104" rx="18"/><circle class="fill-ink" cx="100" cy="158" r="17"/></svg>`,
  ticks: `<svg viewBox="0 0 200 200"><circle class="line" cx="100" cy="100" r="50"/><g class="line"><line x1="158" y1="100" x2="176" y2="100"/><line x1="158" y1="100" x2="176" y2="100" transform="rotate(30 100 100)"/><line x1="158" y1="100" x2="176" y2="100" transform="rotate(60 100 100)"/><line x1="158" y1="100" x2="176" y2="100" transform="rotate(90 100 100)"/><line x1="158" y1="100" x2="176" y2="100" transform="rotate(120 100 100)"/><line x1="158" y1="100" x2="176" y2="100" transform="rotate(150 100 100)"/><line x1="158" y1="100" x2="176" y2="100" transform="rotate(180 100 100)"/><line x1="158" y1="100" x2="176" y2="100" transform="rotate(210 100 100)"/><line x1="158" y1="100" x2="176" y2="100" transform="rotate(240 100 100)"/><line x1="158" y1="100" x2="176" y2="100" transform="rotate(270 100 100)"/><line x1="158" y1="100" x2="176" y2="100" transform="rotate(300 100 100)"/><line x1="158" y1="100" x2="176" y2="100" transform="rotate(330 100 100)"/></g><circle class="fill" cx="100" cy="100" r="5"/></svg>`,
  bubble: `<svg viewBox="0 0 200 200"><path class="line" d="M34 42h132v88H88l-28 28v-28H34z"/><circle class="fill" cx="74" cy="86" r="4"/><circle class="fill" cx="100" cy="86" r="4"/><circle class="fill" cx="126" cy="86" r="4"/><path class="thin" d="M158 26l6-12M174 40l12-4M168 16l10 6"/></svg>`,
  moon: `<svg viewBox="0 0 200 200"><path class="fill" d="M128 26a70 70 0 1 0 0 140 58 58 0 1 1 0-140Z"/><g class="line"><circle cx="42" cy="46" r="2"/><circle cx="64" cy="28" r="1.5"/><circle cx="30" cy="86" r="1.5"/><circle cx="58" cy="70" r="1"/></g><line class="thin" x1="18" y1="162" x2="182" y2="162"/><path class="thin" d="M40 162c10-14 20-20 34-20M58 162c8-9 16-13 26-13"/></svg>`,
  sun: `<svg viewBox="0 0 200 200"><circle class="fill" cx="100" cy="94" r="26"/><g class="line" transform="translate(100 94)"><line x1="0" y1="-38" x2="0" y2="-60"/><line x1="0" y1="-38" x2="0" y2="-60" transform="rotate(45)"/><line x1="0" y1="-38" x2="0" y2="-60" transform="rotate(90)"/><line x1="0" y1="-38" x2="0" y2="-60" transform="rotate(135)"/><line x1="0" y1="-38" x2="0" y2="-60" transform="rotate(180)"/><line x1="0" y1="-38" x2="0" y2="-60" transform="rotate(225)"/><line x1="0" y1="-38" x2="0" y2="-60" transform="rotate(270)"/><line x1="0" y1="-38" x2="0" y2="-60" transform="rotate(315)"/></g><line class="line" x1="22" y1="146" x2="178" y2="146"/><path class="thin" d="M36 162c12-8 24-12 40-12M96 162c10-6 22-9 36-9M52 174c14-6 30-9 48-9"/><circle class="thin" cx="52" cy="42" r="1.5"/><circle class="thin" cx="158" cy="30" r="1.5"/></svg>`,
  laurel: `<svg viewBox="0 0 200 200"><ellipse class="line" cx="100" cy="100" rx="54" ry="74"/><ellipse class="thin" cx="100" cy="100" rx="42" ry="60"/><path class="line" d="M62 158c-18-28-20-76 2-108M138 158c18-28 20-76-2-108"/><g class="fill"><ellipse cx="52" cy="128" rx="6" ry="13" transform="rotate(-38 52 128)"/><ellipse cx="46" cy="100" rx="6" ry="13" transform="rotate(-20 46 100)"/><ellipse cx="54" cy="72" rx="6" ry="13" transform="rotate(10 54 72)"/><ellipse cx="148" cy="128" rx="6" ry="13" transform="rotate(38 148 128)"/><ellipse cx="154" cy="100" rx="6" ry="13" transform="rotate(20 154 100)"/><ellipse cx="146" cy="72" rx="6" ry="13" transform="rotate(-10 146 72)"/></g><circle class="fill" cx="100" cy="100" r="5"/></svg>`
};

const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function charWeight(text) {
  let w = 0;
  for (const ch of text) {
    if (/[\u4e00-\u9fff]/.test(ch)) w += 1;
    else if (/\s/.test(ch)) w += 0.3;
    else if (/[，。·]/.test(ch)) w += 0.55;
    else w += 0.58;
  }
  return Math.max(1, w);
}

const isLatinTitle = (t) => /^[\x20-\x7E]+$/.test(t) && !/[\u4e00-\u9fff]/.test(t);

/* ── DOM ──────────────────────────────────────────────────── */
const gate = $('gate');
const enterBtn = $('enterBtn');
const enterText = enterBtn.querySelector('.gate__enter-text');
const viewCrate = $('viewCrate');
const viewStage = $('viewStage');
const rack = $('rack');
const cabinet = $('cabinet');
const cabinetWrap = $('cabinetWrap');
const stageCopy = $('stageCopy');
const stageSleeve = $('stageSleeve');
const spineRail = $('spineRail');
const soundBtn = $('soundBtn');
const veil = $('transitionVeil');
const flightLayer = $('flightLayer');
const stageTitle = $('stageTitle');
const stageEn = $('stageEn');
const stageNum = $('stageNum');
const stageYear = $('stageYear');
const stageTag = $('stageTag');
const stageMedia = $('stageMedia');
const stageDesc = $('stageDesc');
const stageTracks = $('stageTracks');
const memoryBlock = $('memoryBlock');
const memoryToggle = $('memoryToggle');
const memoryBody = $('memoryBody');
const memoryInput = $('memoryInput');
const memorySaved = $('memorySaved');
const lyricsPanel = $('lyricsPanel');
const lyricsBackdrop = $('lyricsBackdrop');
const lyricsClose = $('lyricsClose');
const lyricsCover = $('lyricsCover');
const lyricsTitle = $('lyricsTitle');
const lyricsMeta = $('lyricsMeta');
const lyricsTracks = $('lyricsTracks');
const lyricsTrackNo = $('lyricsTrackNo');
const lyricsTrackName = $('lyricsTrackName');
const lyricsBody = $('lyricsBody');
const lyricsPage = $('lyricsPage');
const lyricsStatus = $('lyricsStatus');
const lyricsImportBtn = $('lyricsImportBtn');
const lyricsRemoveBtn = $('lyricsRemoveBtn');
const lyricsBatchBtn = $('lyricsBatchBtn');
const lyricsBatchFile = $('lyricsBatchFile');
const lyricsFile = $('lyricsFile');
const lyricsAudioPick = $('lyricsAudioPick');
const lyricsAudioPlay = $('lyricsAudioPlay');
const lyricsAudioName = $('lyricsAudioName');
const lyricsAudioProgress = $('lyricsAudioProgress');
const lyricsAudioTime = $('lyricsAudioTime');
const lyricsAudioFile = $('lyricsAudioFile');
const audioEl = $('localAudioEl');
/* Apple 试听是跨域资源：Web Audio 的 MediaElementAudioSourceNode 只在 CORS 模式下出声，
   不声明 crossOrigin 时整条输出恒为 0（表现为「只有站内三首 MP3 有声音」）。 */
audioEl.crossOrigin = 'anonymous';
/* iOS/iPadOS 的 Web Audio 输出会被静音拨片整段掐掉，媒体元素接进去后同样静默，
   因此 Apple 触屏设备让 <audio> 直出；桌面保留干湿两路与房间混响。 */
const IS_APPLE_TOUCH = /iP(hone|ad|od)/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const immerseBtn = $('immerseBtn');
const imxUI = $('imxUI');
const imxTitle = $('imxTitle');
const imxMeta = $('imxMeta');
const imxLyric = $('imxLyric');
const imxPlayer = $('imxPlayer');
const imxPlay = $('imxPlay');
const imxTime = $('imxTime');
const imxBar = $('imxBar');
const imxLyrics = $('imxLyrics');
const imxSound = $('imxSound');
const imxExit = $('imxExit');
const imxPrev = $('imxPrev');
const imxNext = $('imxNext');
const imxLyricNext = $('imxLyricNext');
const deckPlayer = $('deckPlayer');
const deckPlay = $('deckPlay');
const deckPrev = $('deckPrev');
const deckNext = $('deckNext');
const deckTitle = $('deckTitle');
const deckSrc = $('deckSrc');
const deckBar = $('deckBar');
const deckBarWrap = $('deckBarWrap');
const deckTime = $('deckTime');
const lyricsSource = $('lyricsSource');
const rpmButtons = [...document.querySelectorAll('.rpm-switch button')];
const rpmLed = document.querySelector('.rpm-led');
const mainEl = document.querySelector('main');
const topbarEl = document.querySelector('.topbar');

const lyricsState = { open: false, track: 0, lastFocus: null };
const imxState = { open: false };
const audioBank = new Map(); // `${n}-${t}` -> 已解析的播放源 { url, name, source }
const lyricDataMap = new Map(); // `${n}-${t}` -> 已解析歌词 { text, timed, karaoke?, source }
const pendingLyrics = new Map();
let activeAudioKey = null;
let deckSpinning = false;
let playToken = 0;
let pendingLyricTrack = null;
let imxIdleTimer = 0;
let lastLyricIndex = -1;
let immersiveExitAt = 0;
const prevBtn = $('prevBtn');
const nextBtn = $('nextBtn');
const backBtn = $('backBtn');
const brandLink = $('brandLink');
const canvas = $('vinylCanvas');

const audio = new VinylAudio();
const state = {
  view: 'crate',
  index: 0,
  busy: false,
  sound: true,
  scene: null,
  sceneFailed: false,
  rpm: 33,
  karaokeChar: (() => { try { return localStorage.getItem('jc-karaoke') !== '0'; } catch { return true; } })()
};

/* ── 运行环境：iOS 原生壳 / 触屏 ─────────────────────────── */
const isNative = Boolean(window.Capacitor?.isNativePlatform?.());
const isCoarse = window.matchMedia('(pointer: coarse)').matches;
if (isNative) document.body.classList.add('is-native');
if (isCoarse) document.body.classList.add('is-touch');
// WKWebView 的 IndexedDB 位于 App 容器内，再申请一次持久化降低回收概率
try {
  navigator.storage?.persist?.();
} catch { /* ignore */ }

/* ── 封套构建：正面原版封面 / 背面档案内页 ───────────────── */
function archiveSleeveEl(album) {
  const el = document.createElement('div');
  el.className = 'sleeve';
  el.dataset.layout = album.layout;
  el.dataset.motif = album.motif;
  el.style.setProperty('--bg', album.palette.bg);
  el.style.setProperty('--accent', album.palette.accent);
  el.style.setProperty('--ink', album.palette.ink);
  el.style.setProperty('--len', charWeight(album.title).toFixed(2));

  const latin = isLatinTitle(album.title);
  el.innerHTML = `
    <div class="sleeve__inner">
      <div class="sl-meta"><span>JAY CHOU</span><span>NO.${pad2(album.n)}</span></div>
      <div class="sl-motif" aria-hidden="true">${MOTIFS[album.motif] || ''}</div>
      <h3 class="sl-title${latin ? ' sl-title--latin' : ''}">${escapeHtml(album.title)}</h3>
      <p class="sl-en">${escapeHtml(album.en)}</p>
      <span class="sl-year">${album.year}</span>
      <span class="sl-seal">黑胶<br>典藏</span>
      <span class="sl-mark">ARCHIVE EDITION</span>
      <span class="sl-glare" aria-hidden="true"></span>
    </div>`;
  return el;
}

function jacketEl(album, { stage = false } = {}) {
  const jacket = document.createElement('div');
  jacket.className = 'jacket';
  jacket.dataset.n = String(album.n);
  jacket.style.setProperty('--bg', album.palette.bg);
  jacket.style.setProperty('--accent', album.palette.accent);
  jacket.style.setProperty('--ink', album.palette.ink);
  jacket.style.setProperty('--len', charWeight(album.title).toFixed(2));

  const disc = document.createElement('span');
  disc.className = 'jacket__disc';
  disc.setAttribute('aria-hidden', 'true');

  const inner = document.createElement('div');
  inner.className = 'jacket__inner';

  const front = document.createElement('div');
  front.className = 'jacket__face jacket__front';

  const img = document.createElement('img');
  img.className = 'jacket__img';
  img.dataset.cover = String(album.n);
  img.dataset.size = stage ? 'large' : 'small';
  img.loading = stage ? 'eager' : 'lazy';
  img.decoding = 'async';
  img.crossOrigin = 'anonymous';
  img.alt = `《${album.title}》原版专辑封面`;
  img.addEventListener('load', () => {
    jacket.classList.add('has-cover');
    jacket.classList.remove('cover-failed');
  });
  img.addEventListener('error', () => {
    jacket.classList.add('cover-failed');
    jacket.classList.remove('has-cover');
  });

  const urls = getCoverUrls(album.n);
  if (urls) img.src = stage ? urls.large : urls.small;

  const fallback = document.createElement('div');
  fallback.className = 'jacket__fallback';
  fallback.innerHTML = `
    <span class="jf-meta">JAY CHOU · NO.${pad2(album.n)}</span>
    <span class="jf-motif" aria-hidden="true">${MOTIFS[album.motif] || ''}</span>
    <strong class="jf-title">${escapeHtml(album.title)}</strong>
    <span class="jf-en">${escapeHtml(album.en)}</span>
    <span class="jf-year">${album.year}</span>`;

  const wear = document.createElement('span');
  wear.className = 'jacket__wear';
  wear.setAttribute('aria-hidden', 'true');

  const glare = document.createElement('span');
  glare.className = 'jacket__glare';
  glare.setAttribute('aria-hidden', 'true');

  front.append(img, fallback, wear, glare);

  const back = document.createElement('div');
  back.className = 'jacket__face jacket__back';
  back.appendChild(archiveSleeveEl(album));

  inner.append(front, back);
  jacket.append(disc, inner);
  return jacket;
}

const coversSeen = new Set();
function applyCover(album, urls) {
  coversSeen.add(album.n);
  emit('jc:covers', { pct: coversSeen.size / ALBUMS.length });
  document.querySelectorAll(`.jacket__img[data-cover="${album.n}"]`).forEach((img) => {
    const url = img.dataset.size === 'large' ? urls.large : urls.small;
    if (url && img.getAttribute('src') !== url) img.src = url;
  });
  if (state.scene && state.view === 'stage' && state.index === album.n - 1) {
    state.scene.refreshCover(album);
  }
}

function flipChipEl() {
  const chip = document.createElement('span');
  chip.className = 'stage-sleeve__flip';
  chip.setAttribute('aria-hidden', 'true');
  chip.innerHTML = `
    <svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4v5h-5"/></svg>
    <span>翻面</span>`;
  return chip;
}

/* ── 那年的话 ─────────────────────────────────────────────── */
const NOTE_PREFIX = 'jc-note-';
let noteTimer = 0;

const readNote = (n) => {
  try {
    return localStorage.getItem(NOTE_PREFIX + n) || '';
  } catch {
    return '';
  }
};

const writeNote = (n, value) => {
  try {
    if (value.trim()) localStorage.setItem(NOTE_PREFIX + n, value.trim());
    else localStorage.removeItem(NOTE_PREFIX + n);
  } catch {
    /* 本地存储不可用时静默 */
  }
};

function updateMemoryUI(note) {
  const has = Boolean(note.trim());
  memoryBlock.classList.toggle('has-note', has);
  memorySaved.textContent = has ? `“${note.trim()}”` : '写一句关于这张专辑的记忆';
}

function syncMemory(album) {
  clearTimeout(noteTimer);
  const note = readNote(album.n);
  memoryInput.value = note;
  memoryInput.placeholder = `${album.year} 年，你第一次听到它在哪里？`;
  memoryInput.setAttribute('aria-label', `写下关于《${album.title}》的记忆`);
  updateMemoryUI(note);
  memoryBlock.classList.remove('is-open');
  memoryBody.hidden = true;
  memoryToggle.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('typing');
}

function toggleMemory(force) {
  const open = typeof force === 'boolean' ? force : memoryBody.hidden;
  memoryBody.hidden = !open;
  memoryBlock.classList.toggle('is-open', open);
  memoryToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (open) {
    memoryInput.focus({ preventScroll: true });
    memoryInput.setSelectionRange(memoryInput.value.length, memoryInput.value.length);
  } else {
    memoryInput.blur();
  }
}

function saveNoteSoon() {
  const album = ALBUMS[state.index];
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => {
    writeNote(album.n, memoryInput.value);
    updateMemoryUI(memoryInput.value);
  }, 350);
}

function flushNote() {
  clearTimeout(noteTimer);
  const album = ALBUMS[state.index];
  if (!album) return;
  writeNote(album.n, memoryInput.value);
}

/* ── 歌词内页（仅本地文件） ───────────────────────────────── */
/* 歌词持久化由 lyricstore.js 提供：IndexedDB 为主 + localStorage 双写 */
let lyricStatusTimer = 0;

/* parseLyricData 由 media.js 提供（导入与在线歌词共用同一解析器） */

function showLyricStatus(text, isError = false) {
  lyricsStatus.textContent = text;
  lyricsStatus.classList.toggle('is-error', Boolean(isError));
  clearTimeout(lyricStatusTimer);
  if (text) {
    lyricStatusTimer = setTimeout(() => {
      lyricsStatus.textContent = '';
      lyricsStatus.classList.remove('is-error');
    }, 3200);
  }
}

function lyricAvailable(n, t) {
  if (readLyric(n, t)) return true;
  const cached = lyricDataMap.get(`${n}-${t}`);
  if (cached?.text) return true;
  return Boolean(getTrackMeta(n, t)?.lrclibId);
}

function refreshTrackBadges() {
  const album = ALBUMS[state.index];
  stageTracks.querySelectorAll('.track').forEach((btn, i) => {
    const badge = btn.querySelector('.track__lyric');
    if (badge) badge.classList.toggle('has-lyrics', lyricAvailable(album.n, i));
  });
  refreshPlayingBadges();
}

function refreshPlayingBadges() {
  const album = ALBUMS[state.index];
  const playing = activeAudioKey && !audioEl.paused && !audioEl.ended;
  stageTracks.querySelectorAll('.track').forEach((btn, i) => {
    const key = `${album.n}-${i}`;
    btn.classList.toggle('is-current', activeAudioKey === key);
    btn.classList.toggle('is-playing', playing && activeAudioKey === key);
  });
}

/* ── 歌词自动解析：用户导入 > 内置 > 在线 ─────────────────── */

function ensureLyrics(n, t) {
  const key = `${n}-${t}`;
  if (lyricDataMap.has(key)) return Promise.resolve(lyricDataMap.get(key));
  if (pendingLyrics.has(key)) return pendingLyrics.get(key);
  const user = readLyricData(n, t);
  if (user.text) {
    const data = { ...user, source: 'user' };
    lyricDataMap.set(key, data);
    emit('jc:lyricstate', { state: 'done', detail: 'LOCAL' });
    return Promise.resolve(data);
  }
  const album = ALBUMS.find((a) => a.n === n);
  emit('jc:lyricstate', { state: 'searching', detail: 'LRCLIB' });
  const promise = getLyrics(n, t, album.tracks[t])
    .then((data) => {
      const res = data || { text: '', timed: [], source: '' };
      lyricDataMap.set(key, res);
      pendingLyrics.delete(key);
      emit('jc:lyricstate', { state: res.text ? 'done' : 'failed', detail: res.text ? (res.source || 'CACHE').toUpperCase().slice(0, 17) : 'NO LYRIC' });
      if (res.text && (res.source === 'lrclib' || res.source === 'cache')) emit('jc:notify', { zh: '歌词已匹配并缓存在本机', en: 'CACHED' });
      refreshTrackBadges();
      if (lyricsState.open && ALBUMS[state.index].n === n && lyricsState.track === t) renderLyricsSheet();
      if (activeAudioKey === key) updateTimedLyric();
      return res;
    })
    .catch(() => {
      pendingLyrics.delete(key);
      emit('jc:lyricstate', { state: 'failed', detail: 'NETWORK' });
      return { text: '', timed: [], source: '' };
    });
  pendingLyrics.set(key, promise);
  return promise;
}

function buildLyricsTracks(album) {
  lyricsTracks.innerHTML = album.tracks
    .map((track, i) => {
      const has = lyricAvailable(album.n, i);
      const local = hasLocalAudio(album.n, i);
      const playing = activeAudioKey === `${album.n}-${i}` && !audioEl.paused;
      return `<button class="lyrics__track${has ? ' has-lyrics' : ''}${i === lyricsState.track ? ' is-active' : ''}${playing ? ' is-playing' : ''}" type="button" data-track="${i}">
        <span class="no">A${i + 1}</span>
        <span class="name">${escapeHtml(track)}</span>
        <span class="dot" aria-hidden="true"></span>
        ${local ? '<span class="audio" aria-hidden="true">♪</span>' : ''}
      </button>`;
    })
    .join('');
}

function renderLyricsSheet() {
  const album = ALBUMS[state.index];
  const track = lyricsState.track;
  const name = album.tracks[track];
  const key = `${album.n}-${track}`;
  const user = readLyricData(album.n, track);
  const data = user.text ? { ...user, source: 'user' } : lyricDataMap.get(key);
  const loading = !data && pendingLyrics.has(key);

  lyricsTrackNo.textContent = `A${track + 1}`;
  lyricsTrackName.textContent = name;
  lyricsPage.textContent = `${pad2(track + 1)} / ${pad2(album.tracks.length)}`;
  lyricsRemoveBtn.hidden = !user.text;
  lyricsImportBtn.textContent = user.text ? '替换歌词' : '导入 LRC / TXT';
  lyricsSource.textContent = data?.text ? `歌词来源 · ${lyricSourceLabel(data.source)}` : '';
  lyricsTracks.querySelectorAll('.lyrics__track').forEach((btn, i) => {
    btn.classList.toggle('is-active', i === track);
  });

  lastLyricIndex = -1;
  if (data?.text) {
    lyricsBody.innerHTML = '';
    if (data.karaoke?.length && state.karaokeChar) {
      const wrap = document.createElement('div');
      wrap.className = 'lyrics__text lyrics__text--timed';
      data.karaoke.forEach((line) => {
        const p = document.createElement('p');
        p.className = 'lyric-line lyric-line--karaoke';
        p.dataset.t = String(line.start);
        for (const ch of line.chars || []) {
          const span = document.createElement('span');
          span.className = 'kchar';
          span.dataset.s = String(ch.s);
          span.dataset.e = String(ch.e);
          span.textContent = ch.c;
          p.appendChild(span);
        }
        if (!line.chars?.length) p.textContent = line.text;
        wrap.appendChild(p);
      });
      lyricsBody.appendChild(wrap);
    } else if (data.karaoke?.length) {
      const wrap = document.createElement('div');
      wrap.className = 'lyrics__text lyrics__text--timed';
      data.karaoke.forEach((line) => {
        const p = document.createElement('p');
        p.className = 'lyric-line';
        p.dataset.t = String(line.start);
        p.textContent = line.text;
        wrap.appendChild(p);
      });
      lyricsBody.appendChild(wrap);
    } else if (data.timed.length) {
      const wrap = document.createElement('div');
      wrap.className = 'lyrics__text lyrics__text--timed';
      data.timed.forEach((line) => {
        const p = document.createElement('p');
        p.className = 'lyric-line';
        p.dataset.t = String(line.t);
        p.textContent = line.text;
        wrap.appendChild(p);
      });
      lyricsBody.appendChild(wrap);
    } else {
      const div = document.createElement('div');
      div.className = 'lyrics__text';
      div.textContent = data.text;
      lyricsBody.appendChild(div);
    }
    lyricsBody.scrollTop = 0;
  } else if (loading) {
    lyricsBody.innerHTML = `
      <div class="lyrics__empty lyrics__empty--loading">
        <span class="lyrics__spinner" aria-hidden="true"></span>
        <strong>正在取歌词</strong>
        <p>首次播放时在线匹配，之后缓存在本机。</p>
      </div>`;
  } else {
    lyricsBody.innerHTML = `
      <div class="lyrics__empty">
        <span class="lyrics__empty-icon">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M5 15v4h14v-4"/></svg>
        </span>
        <strong>这页还空着</strong>
        <p>曲目播放时会自动匹配歌词；也可以把 LRC / TXT 拖进来，<br />文件名包含曲名即可自动匹配。仅在本机读取。</p>
        <button class="lyrics__drop" type="button" data-cursor="选择文件">选择歌词文件</button>
      </div>`;
    ensureLyrics(album.n, track);
  }

  syncSheetAudio();
  updateTimedLyric();
}

/* ── 播放器：本地完整版 / 官方试听 ─────────────────────────── */

function fmtClock(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/* 45 转音调修正 + wow & flutter 抖动（唱片的物理特性） */
const BASE_RATE = () => (state.rpm === 45 ? 45 / (100 / 3) : 1);

function applyBaseRate() {
  try {
    audioEl.preservesPitch = false;
    if ('webkitPreservesPitch' in audioEl) audioEl.webkitPreservesPitch = false;
    audioEl.defaultPlaybackRate = BASE_RATE();
    if (audioEl.paused || audioEl.ended) audioEl.playbackRate = BASE_RATE();
  } catch {
    /* 个别浏览器不支持时忽略 */
  }
}

let wobbleTimer = 0;
function startWobble() {
  stopWobble();
  wobbleTimer = setInterval(() => {
    if (audioEl.paused || audioEl.ended) return;
    const t = performance.now() / 1000;
    // ±0.2% 量级的转速起伏
    const wobble = 1 + 0.0021 * Math.sin(t * 2.7) + 0.0012 * Math.sin(t * 6.9 + 1.2);
    audioEl.playbackRate = BASE_RATE() * wobble;
  }, 140);
}
function stopWobble() {
  if (wobbleTimer) {
    clearInterval(wobbleTimer);
    wobbleTimer = 0;
  }
}

/* ── 唱片磨损：累计播放秒数 → 伤痕贴花增长（收藏感） ─────── */
const WEAR_FULL_SECONDS = 2400;
let wearLastT = -1;
let wearFlushAt = 0;
const wearCache = new Map();

function getWearSeconds(n) {
  if (wearCache.has(n)) return wearCache.get(n);
  let v = 0;
  try {
    v = Number(localStorage.getItem(`jc-wear-${n}`)) || 0;
  } catch {
    v = 0;
  }
  wearCache.set(n, v);
  return v;
}

function getWear(n) {
  return Math.min(1, getWearSeconds(n) / WEAR_FULL_SECONDS);
}

function accrueWear() {
  if (!activeAudioKey || audioEl.paused || audioEl.ended) {
    wearLastT = -1;
    return;
  }
  const t = audioEl.currentTime;
  if (wearLastT >= 0) {
    const d = t - wearLastT;
    if (d > 0 && d < 2) {
      const n = Number(activeAudioKey.split('-')[0]);
      const secs = getWearSeconds(n) + d;
      wearCache.set(n, secs);
      try {
        localStorage.setItem(`jc-wear-${n}`, String(Math.round(secs)));
      } catch {
        /* 存储不可用时跳过 */
      }
      const nowMs = performance.now();
      if (nowMs > wearFlushAt && state.scene) {
        wearFlushAt = nowMs + 3000;
        state.scene.setWear();
      }
    }
  }
  wearLastT = t;
}

const sheetAudioKey = () => `${ALBUMS[state.index].n}-${lyricsState.track}`;
const currentEntry = () => (activeAudioKey ? audioBank.get(activeAudioKey) : null);
const clampTrack = (i) => Math.max(0, Math.min(ALBUMS[state.index].tracks.length - 1, i));

function sourceChip(src) {
  return src === 'preview' ? '30s 试听' : '完整版';
}

function syncSheetAudio() {
  const key = sheetAudioKey();
  const album = ALBUMS[state.index];
  const isCurrent = activeAudioKey === key;
  const entry = isCurrent ? currentEntry() : resolveAudio(album.n, lyricsState.track, album.tracks[lyricsState.track]);
  lyricsAudioPick.textContent = hasLocalAudio(album.n, lyricsState.track) ? '替换音频' : '放入本地音频';
  lyricsAudioPlay.hidden = !entry;
  lyricsAudioName.textContent = entry
    ? isCurrent
      ? entry.name
      : `${entry.name} · 未播放`
    : '暂无音源';
  updateAudioUI();
}

function updateAudioUI() {
  const entry = currentEntry();
  const playing = Boolean(entry && !audioEl.paused && !audioEl.ended);
  const sheetIsCurrent = activeAudioKey === sheetAudioKey();
  const sheetPlaying = sheetIsCurrent && playing;

  lyricsAudioPlay.classList.toggle('is-playing', sheetPlaying);
  lyricsAudioPlay.setAttribute('aria-label', sheetPlaying ? '暂停' : '播放');
  imxPlay.classList.toggle('is-playing', playing);
  imxPlay.setAttribute('aria-label', playing ? '暂停' : '播放');
  imxPlayer.hidden = !entry;
  if (rpmLed) rpmLed.classList.toggle('is-on', playing);

  deckPlayer.hidden = !entry;
  deckPlay.classList.toggle('is-playing', playing);
  deckPlay.setAttribute('aria-label', playing ? '暂停' : '播放');
  if (entry) {
    const [n, t] = activeAudioKey.split('-').map(Number);
    const album = ALBUMS.find((a) => a.n === n);
    deckTitle.textContent = album?.tracks[t] || '—';
    deckSrc.textContent = sourceChip(entry.source);
    deckSrc.classList.toggle('deck-player__src--local', entry.source !== 'preview');
  }

  refreshPlayingBadges();
  syncMediaSession();
  updateAudioProgress();
  emit('jc:playstate', { playing, hasEntry: Boolean(entry) });
}

function updateAudioProgress() {
  const entry = currentEntry();
  const duration = entry ? audioEl.duration : NaN;
  const time = entry ? audioEl.currentTime : 0;
  const ok = entry && Number.isFinite(duration) && duration > 0;
  const pct = ok ? Math.min(100, (time / duration) * 100) : 0;
  const sheetIsCurrent = activeAudioKey === sheetAudioKey();

  lyricsAudioProgress.style.width = `${sheetIsCurrent ? pct : 0}%`;
  imxBar.style.width = `${pct}%`;
  deckBar.style.width = `${pct}%`;
  lyricsAudioTime.textContent = sheetIsCurrent && ok ? `${fmtClock(time)} / ${fmtClock(duration)}` : '--:--';
  imxTime.textContent = ok ? fmtClock(time) : '--:--';
  deckTime.textContent = ok ? `${fmtClock(time)} / ${fmtClock(duration)}` : '--:--';

  if (ok && navigator.mediaSession) {
    try {
      navigator.mediaSession.setPositionState({
        duration,
        position: Math.min(time, duration),
        playbackRate: audioEl.playbackRate || 1
      });
    } catch { /* 部分平台不支持位置上报 */ }
  }

  if (ok) {
    state.scene?.setProgress(pct / 100);
    // 沟槽声学：唱针越靠内圈，表面噪声越明显
    audio.setNeedleProgress(pct / 100);
    accrueWear();
  }
  emit('jc:progress', { pct, sheetPct: sheetIsCurrent ? pct : 0, playing: Boolean(entry && !audioEl.paused && !audioEl.ended) });
}

function pausePlayback() {
  if (!audioEl.paused) audioEl.pause();
  audioEl.volume = 1;
  deckSpinning = false;
  state.scene?.setPlaying(false);
  audio.setDucking(false);
  updateAudioUI();
}

function stopPlayback() {
  playToken++;
  if (!audioEl.paused) audioEl.pause();
  audioEl.volume = 1;
  audioEl.removeAttribute('src');
  audioEl.load();
  activeAudioKey = null;
  deckSpinning = false;
  state.scene?.setPlaying(false);
  audio.setDucking(false);
  updateAudioUI();
  updateTimedLyric();
}

/** 点曲即播：导入/本地完整版优先，其余走官方试听；落针后出声 */
async function playTrack(trackIndex, { toggle = false } = {}) {
  const album = ALBUMS[state.index];
  const t = clampTrack(trackIndex);
  const key = `${album.n}-${t}`;

  if (toggle && activeAudioKey === key && !audioEl.paused) {
    pausePlayback();
    return;
  }

  const entry = resolveAudio(album.n, t, album.tracks[t]);
  if (!entry) {
    showLyricStatus('这首暂无音源，可放入本地 MP3', true);
    return;
  }
  audioBank.set(key, entry);

  const token = ++playToken;
  if (activeAudioKey !== key) {
    audioEl.pause();
    audioEl.src = entry.url;
    audioEl.load();
    activeAudioKey = key;
  } else if (audioEl.ended) {
    audioEl.currentTime = 0;
  }
  audioEl.muted = !state.sound;

  lyricsState.track = t;
  if (lyricsState.open) {
    buildLyricsTracks(album);
    renderLyricsSheet();
  }
  ensureLyrics(album.n, t);
  updateImxInfo();
  updateAudioUI();

  // 唱臂在休息位时，等落针再出声；但 play() 必须在点击的同一任务里发起，
  // 否则 iOS / Safari 判定为无手势直接拒绝（延迟用音量淡入来补，视觉节奏不变）
  const delay = state.scene?.spinning || deckSpinning ? 0 : 920;
  state.scene?.setPlaying(true);
  audio.setDucking(true);
  audioEl.volume = delay ? 0 : 1;
  let playback;
  try {
    playback = audioEl.play();
  } catch (err) {
    playback = Promise.reject(err);
  }
  if (delay) {
    wait(delay).then(() => {
      if (token === playToken && activeAudioKey === key) audioEl.volume = 1;
    });
  }
  try {
    await playback;
  } catch {
    audioEl.volume = 1;
    if (token === playToken) {
      showLyricStatus('浏览器拦住了播放，请再点一下播放键', true);
      emit('jc:notify', { zh: '再点一下播放键即可出声', en: 'TAP TO PLAY' });
    }
  }
  updateAudioUI();
  updateTimedLyric();
}

function togglePlayback() {
  if (activeAudioKey && !audioEl.paused) {
    pausePlayback();
    return;
  }
  let t = lyricsState.track;
  if (activeAudioKey) {
    const [n, ti] = activeAudioKey.split('-').map(Number);
    if (n === ALBUMS[state.index].n) t = ti;
  }
  playTrack(t);
}

function stepTrack(dir) {
  const album = ALBUMS[state.index];
  let t = lyricsState.track;
  if (activeAudioKey) {
    const [n, ti] = activeAudioKey.split('-').map(Number);
    if (n === album.n) t = ti;
  }
  const next = t + dir;
  if (next < 0 || next >= album.tracks.length) return;
  playTrack(next);
}

function seekFromEvent(e, el) {
  if (!activeAudioKey || !Number.isFinite(audioEl.duration)) return;
  const r = el.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  audioEl.currentTime = ratio * audioEl.duration;
  updateAudioProgress();
  updateTimedLyric();
}

function updateTimedLyric() {
  const entry = currentEntry();
  if (!entry || !activeAudioKey) {
    imxLyric.textContent = '';
    imxLyricNext.textContent = '';
    return;
  }
  const [n, t] = activeAudioKey.split('-').map(Number);
  const key = activeAudioKey;
  const user = readLyricData(n, t);
  const data = user.text ? user : lyricDataMap.get(key);
  const timed = data?.timed || [];
  if (!timed.length) {
    imxLyric.textContent = '';
    imxLyricNext.textContent = '';
    return;
  }
  const now = audioEl.currentTime || 0;
  let index = -1;
  for (let i = 0; i < timed.length; i++) {
    if (timed[i].t <= now + 0.12) index = i;
    else break;
  }
  imxLyric.textContent = index >= 0 ? timed[index].text : '';
  imxLyricNext.textContent = index + 1 < timed.length ? timed[index + 1].text : '';

  if (!lyricsState.open) return;
  const album = ALBUMS[state.index];
  if (album.n !== n || lyricsState.track !== t) return;
  const lines = lyricsBody.querySelectorAll('.lyric-line');
  if (!lines.length) return;
  lines.forEach((el, i) => el.classList.toggle('is-current', i === index));

  if (index !== lastLyricIndex) {
    if (lastLyricIndex >= 0 && lines[lastLyricIndex]) {
      lines[lastLyricIndex].querySelectorAll('.kchar').forEach((ch) => ch.style.setProperty('--fill', '1'));
    }
    lastLyricIndex = index;
    if (index >= 0) lines[index].scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  // 逐字卡拉OK填色
  if (state.karaokeChar && data.karaoke?.length && index >= 0 && lines[index]) {
    lines[index].querySelectorAll('.kchar').forEach((ch) => {
      const s = Number(ch.dataset.s);
      const e = Number(ch.dataset.e);
      const f = Math.min(1, Math.max(0, (now - s) / Math.max(0.12, e - s)));
      ch.style.setProperty('--fill', f.toFixed(3));
    });
  }
}

function updateImxInfo() {
  const album = ALBUMS[state.index];
  let t = lyricsState.track;
  if (activeAudioKey) {
    const [n, ti] = activeAudioKey.split('-').map(Number);
    if (n === album.n) t = ti;
  }
  imxTitle.textContent = album.tracks[t] || album.title;
  imxMeta.textContent = `${album.title} · ${album.released}`;
}

function showImxBar() {
  if (!imxState.open) return;
  imxUI.classList.remove('is-idle');
  clearTimeout(imxIdleTimer);
  imxIdleTimer = setTimeout(() => {
    if (imxState.open) imxUI.classList.add('is-idle');
  }, 3200);
}

function resetCursorHover() {
  const c = $('cursor');
  const l = $('cursorLabel');
  if (c) c.classList.remove('is-hover');
  if (l) l.textContent = '';
}

function enterImmersive() {
  if (state.view !== 'stage' || imxState.open) return;
  imxState.open = true;
  emit('jc:view', { view: 'imx' });
  viewStage.classList.add('is-immersive');
  document.body.classList.add('immersive');
  imxUI.hidden = false;
  imxUI.setAttribute('aria-hidden', 'false');
  imxUI.inert = false;
  updateImxInfo();
  updateAudioUI();
  updateTimedLyric();
  state.scene?.setImmersive(true);
  resetCursorHover();
  requestAnimationFrame(() => imxUI.classList.add('is-open'));
  showImxBar();
  if (document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen().catch(() => {});
  }
}

function exitImmersive(fromFullscreen = false) {
  if (!imxState.open) return;
  imxState.open = false;
  emit('jc:view', { view: 'stage' });
  immersiveExitAt = Date.now();
  clearTimeout(imxIdleTimer);
  imxUI.classList.remove('is-open', 'is-idle');
  imxUI.setAttribute('aria-hidden', 'true');
  viewStage.classList.remove('is-immersive');
  document.body.classList.remove('immersive');
  state.scene?.setImmersive(false);
  resetCursorHover();
  if (!fromFullscreen && document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  }
  setTimeout(() => {
    if (!imxState.open) imxUI.hidden = true;
    if (!lyricsState.open && !immerseBtn.disabled) immerseBtn.focus({ preventScroll: true });
  }, 500);
}

function fillLyricsSide(album) {
  lyricsTitle.textContent = album.title;
  lyricsMeta.textContent = `${album.released} · ${album.en}`;
  lyricsCover.innerHTML = '';
  const urls = getCoverUrls(album.n);
  if (urls) {
    const img = document.createElement('img');
    img.alt = '';
    img.loading = 'eager';
    img.src = urls.small;
    lyricsCover.appendChild(img);
  } else {
    lyricsCover.textContent = album.title;
  }
  buildLyricsTracks(album);
}

function setLyricTrack(track) {
  const album = ALBUMS[state.index];
  const next = Math.max(0, Math.min(album.tracks.length - 1, track));
  if (next === lyricsState.track) return;
  lyricsState.track = next;
  showLyricStatus('');
  buildLyricsTracks(album);
  renderLyricsSheet();
  ensureLyrics(album.n, next);
}

function openLyrics(track, trigger) {
  if (state.view !== 'stage') return;
  const album = ALBUMS[state.index];
  const next = Math.max(0, Math.min(album.tracks.length - 1, track));
  lyricsState.open = true;
  emit('jc:sheet', { open: true });
  lyricsState.track = next;
  lyricsState.lastFocus = trigger || null;
  showLyricStatus('');
  fillLyricsSide(album);
  renderLyricsSheet();
  ensureLyrics(album.n, next);

  lyricsPanel.hidden = false;
  lyricsPanel.setAttribute('aria-hidden', 'false');
  document.body.classList.add('lyrics-open');
  if (mainEl) mainEl.inert = true;
  if (topbarEl) topbarEl.inert = true;
  if (imxState.open) imxUI.inert = true;
  requestAnimationFrame(() => lyricsPanel.classList.add('is-open'));
  setTimeout(() => {
    if (lyricsState.open) lyricsClose.focus({ preventScroll: true });
  }, 70);
  audio.playSleeve();
}

function closeLyrics() {
  if (!lyricsState.open) return;
  lyricsState.open = false;
  emit('jc:sheet', { open: false });
  lyricsPanel.classList.remove('is-open');
  document.body.classList.remove('lyrics-open');
  if (mainEl) mainEl.inert = false;
  if (topbarEl) topbarEl.inert = false;
  if (imxState.open) imxUI.inert = false;
  updateImxInfo();
  updateTimedLyric();

  const last = lyricsState.lastFocus;
  if (last && document.contains(last)) last.focus({ preventScroll: true });

  setTimeout(() => {
    if (lyricsState.open) return;
    lyricsPanel.hidden = true;
    lyricsPanel.setAttribute('aria-hidden', 'true');
  }, 380);
}

function pickLyricFile() {
  pendingLyricTrack = lyricsState.track;
  lyricsFile.value = '';
  lyricsFile.click();
}

function registerAudioFile(file, trackIndex) {
  if (!file) return null;
  if (!/^audio\//.test(file.type) && !/\.(mp3|wav|flac|m4a|aac|ogg|opus)$/i.test(file.name)) return null;
  const album = ALBUMS[state.index];
  const key = `${album.n}-${trackIndex}`;
  const url = URL.createObjectURL(file);
  registerImport(key, url, file.name, file); // 会话可用 + IndexedDB 持久化
  audioBank.set(key, { url, name: file.name, source: 'import' });
  return key;
}

function importAudioFile(file, trackIndex = lyricsState.track, { play = true } = {}) {
  const key = registerAudioFile(file, trackIndex);
  if (!key) return false;
  const album = ALBUMS[state.index];
  buildLyricsTracks(album);
  refreshTrackBadges();
  if (play) {
    showLyricStatus('本地音频已载入 · 已保存到本机浏览器');
    emit('jc:notify', { zh: '本地音频已载入并存于本机浏览器', en: 'IMPORTED' });
    playTrack(trackIndex);
  } else if (trackIndex === lyricsState.track) {
    syncSheetAudio();
  }
  return true;
}

async function importLyricFile(file, trackIndex, { silent = false } = {}) {
  if (!file) return false;
  if (!/\.(lrc|txt)$/i.test(file.name)) {
    if (!silent) showLyricStatus('只支持 LRC 或 TXT 文件', true);
    return false;
  }
  if (file.size > 512 * 1024) {
    if (!silent) showLyricStatus('文件太大，建议 512KB 以内', true);
    return false;
  }
  try {
    const parsed = parseLyricData(await file.text());
    if (!parsed.text) {
      if (!silent) showLyricStatus('没有读到可显示的歌词行', true);
      return false;
    }
    const album = ALBUMS[state.index];
    const t = Number.isInteger(trackIndex) ? trackIndex : lyricsState.track;
    if (!writeLyric(album.n, t, parsed)) {
      if (!silent) showLyricStatus('本地存储不可用，无法保存', true);
      return false;
    }
    lyricDataMap.delete(`${album.n}-${t}`);
    if (!silent) emit('jc:notify', { zh: '歌词已导入本机', en: 'IMPORTED' });
    if (!silent) {
      buildLyricsTracks(album);
      if (t === lyricsState.track) renderLyricsSheet();
      refreshTrackBadges();
      showLyricStatus('已导入 · 仅保存在本机');
      audio.playSleeve();
    }
    return true;
  } catch {
    if (!silent) showLyricStatus('读取失败，请重试', true);
    return false;
  }
}

function normalizeFileBase(name) {
  return name
    .toLowerCase()
    .replace(/\.[^.]+$/, '')
    .replace(/[\s\-_.·,，。:：()（）[\]【】《》]/g, '');
}

async function handleDroppedFiles(files) {
  const album = ALBUMS[state.index];
  const tracks = album.tracks;
  const list = [...files];
  if (!list.length) return;

  const audioFiles = list.filter((f) => /^audio\//.test(f.type) || /\.(mp3|wav|flac|m4a|aac|ogg|opus)$/i.test(f.name));
  const lyricFiles = list.filter((f) => /\.(lrc|txt)$/i.test(f.name) || f.type === 'text/plain');
  if (!audioFiles.length && !lyricFiles.length) {
    showLyricStatus('没有识别到音频或 LRC / TXT 文件', true);
    return;
  }

  const matchTrack = (file) => {
    const base = normalizeFileBase(file.name);
    let best = -1;
    let bestLen = 0;
    tracks.forEach((track, i) => {
      const key = normalizeFileBase(track);
      if (key && base.includes(key) && key.length > bestLen) {
        best = i;
        bestLen = key.length;
      }
    });
    return best;
  };

  if (!audioEl.paused) audioEl.pause();
  emit('jc:batch', { active: true, pct: 0 });
  const totalFiles = audioFiles.length + lyricFiles.length;
  let doneFiles = 0;
  let audioCount = 0;
  let lyricCount = 0;
  const unmatched = [];
  const audioSeen = new Set();

  for (const file of audioFiles) {
    let index = matchTrack(file);
    if (index < 0 && audioFiles.length === 1) index = lyricsState.track;
    if (index < 0 || audioSeen.has(index)) {
      unmatched.push(file.name);
      continue;
    }
    audioSeen.add(index);
    if (registerAudioFile(file, index)) audioCount++;
    doneFiles++;
    emit('jc:batch', { active: true, pct: doneFiles / totalFiles });
  }

  for (const file of lyricFiles) {
    let index = matchTrack(file);
    if (index < 0 && lyricFiles.length === 1) index = lyricsState.track;
    if (index < 0) {
      unmatched.push(file.name);
      continue;
    }
    if (await importLyricFile(file, index, { silent: true })) lyricCount++;
    doneFiles++;
    emit('jc:batch', { active: true, pct: doneFiles / totalFiles });
  }

  buildLyricsTracks(album);
  refreshTrackBadges();
  renderLyricsSheet();

  const currentKey = `${album.n}-${lyricsState.track}`;
  if (audioBank.has(currentKey) || resolveAudio(album.n, lyricsState.track, tracks[lyricsState.track])) {
    playTrack(lyricsState.track);
  } else {
    syncSheetAudio();
  }

  const detail = unmatched.length ? ` · 未识别 ${unmatched.length}` : '';
  showLyricStatus(`已匹配 音频 ${audioCount} · 歌词 ${lyricCount}${detail}`, !audioCount && !lyricCount);
  emit('jc:batch', { active: false, pct: 1 });
  emit('jc:notify', { zh: `批量导入完成：音频 ${audioCount} · 歌词 ${lyricCount}`, en: 'IMPORTED' });
  audio.playSleeve();
}

function flipStageSleeve() {
  const jacket = stageSleeve.querySelector('.jacket');
  if (!jacket) return;
  const flipped = jacket.classList.toggle('is-flipped');
  stageSleeve.classList.toggle('is-flipped', flipped);
  stageSleeve.setAttribute('aria-pressed', flipped ? 'true' : 'false');
  const album = ALBUMS[state.index];
  stageSleeve.setAttribute('aria-label', flipped ? `返回《${album.title}》原版封面` : `翻面查看《${album.title}》内页`);
  const label = stageSleeve.querySelector('.stage-sleeve__flip span');
  if (label) label.textContent = flipped ? '封面' : '翻面';
  audio.playSleeve();
}

function buildRack() {
  const frag = document.createDocumentFragment();
  ALBUMS.forEach((album, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'crate-item';
    btn.dataset.index = String(i);
    btn.dataset.cursor = '';
    btn.style.setProperty('--i', String(i));
    btn.style.setProperty('--rot', `${((i * 37) % 7 - 3) * 0.45}deg`);
    btn.setAttribute('aria-label', `抽出《${album.title}》，${album.year} 年专辑`);

    btn.appendChild(jacketEl(album));
    const hint = document.createElement('span');
    hint.className = 'crate-item__hint';
    hint.textContent = `${album.year} · 抽出`;
    btn.appendChild(hint);

    frag.appendChild(btn);
  });
  rack.appendChild(frag);
}

function buildSpines() {
  const frag = document.createDocumentFragment();
  const label = document.createElement('span');
  label.className = 'spine-rail__label';
  label.textContent = 'RACK';
  frag.appendChild(label);

  ALBUMS.forEach((album, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'spine';
    b.dataset.index = String(i);
    b.dataset.cursor = '切换';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-label', `${album.title}，${album.year}`);
    b.style.setProperty('--album-bg', album.palette.bg);
    b.style.setProperty('--album-ink', album.palette.ink);
    b.textContent = album.title;
    if (charWeight(album.title) > 5.4) b.classList.add('is-long');
    frag.appendChild(b);
  });
  spineRail.appendChild(frag);
}

/* ── 听音室内容 ───────────────────────────────────────────── */
function fillStage(album, index) {
  state.index = index;
  document.documentElement.style.setProperty('--album-accent', album.palette.accent);
  document.documentElement.style.setProperty('--album-bg', album.palette.bg);
  document.documentElement.style.setProperty('--album-ink', album.palette.ink);

  stageNum.textContent = pad2(album.n);
  stageTitle.textContent = album.title;
  stageTitle.classList.toggle('stage-title--latin', isLatinTitle(album.title));
  stageEn.textContent = album.en;
  stageYear.textContent = album.released;
  stageTag.textContent = album.tag;
  stageMedia.textContent = album.media;
  stageDesc.textContent = album.desc;

  stageTracks.innerHTML = album.tracks
    .map((t, i) => {
      const has = lyricAvailable(album.n, i);
      const local = hasLocalAudio(album.n, i);
      return `<li><button class="track" type="button" data-track="${i}" data-cursor="播放">
        <span class="track__num">A${i + 1}</span>
        <span class="track__name">${escapeHtml(t)}</span>
        <span class="track__src${local ? ' track__src--local' : ''}">${local ? '完整版' : '试听'}</span>
        <span class="track__eq" aria-hidden="true"><i></i><i></i><i></i></span>
        <span class="track__lyric${has ? ' has-lyrics' : ''}" data-lyric="${i}" data-cursor="歌词" aria-hidden="true">词</span>
      </button></li>`;
    })
    .join('');

  stageSleeve.replaceChildren(jacketEl(album, { stage: true }), flipChipEl());
  stageSleeve.classList.remove('is-flipped');
  stageSleeve.setAttribute('aria-pressed', 'false');
  stageSleeve.setAttribute('aria-label', `翻面查看《${album.title}》内页`);

  immerseBtn.disabled = false;
  syncMemory(album);
  emit('jc:album', { index });

  [...spineRail.querySelectorAll('.spine')].forEach((s) => {
    const on = Number(s.dataset.index) === index;
    s.classList.toggle('is-active', on);
    s.setAttribute('aria-selected', on ? 'true' : 'false');
    if (on && spineRail.clientWidth > 0) {
      const left = s.offsetLeft - spineRail.clientWidth / 2 + s.offsetWidth / 2;
      spineRail.scrollTo({ left: Math.max(0, left), behavior: reducedMotion ? 'auto' : 'smooth' });
    }
  });

  document.title = `${album.title} · 周杰伦黑胶典藏`;
  refreshPlayingBadges();
  ensureLyrics(album.n, 0);
}

/* ── 3D 唱机 ──────────────────────────────────────────────── */
function ensureScene() {
  if (state.scene || state.sceneFailed) return;
  try {
    state.scene = createTurntable(canvas, {
      onNeedleDrop: () => audio.playNeedle(),
      getCoverImage: (album) => getStageImage(album),
      // 拖动唱片跳转：径向位置映射播放进度
      canSeekDisc: () => Boolean(activeAudioKey) && Number.isFinite(audioEl.duration) && audioEl.duration > 0,
      onDiscSeek: (p) => {
        if (!Number.isFinite(audioEl.duration)) return;
        audioEl.currentTime = Math.max(0, Math.min(0.985, p)) * audioEl.duration;
        updateAudioProgress();
        updateTimedLyric();
        cursorLabel.textContent = fmtClock(audioEl.currentTime);
      },
      onDiscSeekEnd: () => {
        cursorLabel.textContent = '';
      },
      // 播放越多，唱片磨损越重（0..1，约 40 分钟满损）
      getWear: (album) => getWear(album.n)
    });
  } catch (err) {
    console.warn('WebGL 唱机初始化失败，使用静态唱片。', err);
    state.sceneFailed = true;
    document.body.classList.add('no-webgl');
  }
}

/* ── 转场：唱片柜 → 听音室 ────────────────────────────────── */
async function enterStage(index, sourceEl) {
  if (state.busy || state.view === 'stage') return;
  state.busy = true;

  const album = ALBUMS[index];
  audio.playSleeve();
  fillStage(album, index);
  stageSleeve.classList.remove('is-revealed');
  stageCopy.scrollTop = 0;
  stageCopy.classList.remove('is-swapping');

  if (reducedMotion) {
    veil.classList.add('is-on');
    await wait(120);
    viewCrate.hidden = true;
    viewStage.hidden = false;
    document.body.classList.add('stage-on');
    ensureScene();
    playScene(album, true);
    stageSleeve.classList.add('is-revealed');
    veil.classList.remove('is-on');
    state.view = 'stage';
    state.busy = false;
    centerActiveSpine();
    emit('jc:view', { view: 'stage' });
    return;
  }

  const srcRect = sourceEl.getBoundingClientRect();
  const srcW = sourceEl.offsetWidth;
  const srcH = sourceEl.offsetHeight;
  const srcCx = srcRect.left + srcRect.width / 2;
  const srcCy = srcRect.top + srcRect.height / 2;

  const clone = sourceEl.cloneNode(true);
  clone.classList.add('flight-sleeve');
  Object.assign(clone.style, {
    left: `${srcCx - srcW / 2}px`,
    top: `${srcCy - srcH / 2}px`,
    width: `${srcW}px`,
    height: `${srcH}px`
  });

  veil.classList.add('is-on');
  await wait(230);

  viewCrate.hidden = true;
  viewStage.hidden = false;
  viewStage.classList.remove('is-entering');
  void viewStage.offsetWidth;
  viewStage.classList.add('is-entering');

  ensureScene();
  playScene(album, true);

  await nextFrame();
  await nextFrame();

  stageSleeve.style.transform = 'none';
  const targetRect = stageSleeve.getBoundingClientRect();
  stageSleeve.style.transform = '';

  // 窄屏下墙面唱片可能被收起，此时直接淡入
  if (targetRect.width < 10) {
    stageSleeve.classList.add('is-revealed');
    veil.classList.remove('is-on');
    state.view = 'stage';
    state.busy = false;
    centerActiveSpine();
    emit('jc:view', { view: 'stage' });
    return;
  }

  flightLayer.appendChild(clone);

  const dstCx = targetRect.left + targetRect.width / 2;
  const dstCy = targetRect.top + targetRect.height / 2;
  const scale = targetRect.width / srcW;
  const dx = dstCx - srcCx;
  const dy = dstCy - srcCy;

  const anim = clone.animate(
    [
      { transform: 'translate(0px, 0px) scale(1) rotate(0deg)' },
      {
        transform: `translate(${dx * 0.34}px, ${dy * 0.55 - 36}px) scale(${scale * 1.09}) rotate(2.2deg)`,
        offset: 0.55
      },
      { transform: `translate(${dx}px, ${dy}px) scale(${scale}) rotate(-3.2deg)` }
    ],
    { duration: 1180, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both' }
  );

  setTimeout(() => veil.classList.remove('is-on'), 430);

  try {
    await anim.finished;
  } catch (e) {
    /* 动画被取消时直接落位 */
  }

  stageSleeve.classList.add('is-revealed');
  clone.remove();
  veil.classList.remove('is-on');
  document.body.classList.add('stage-on');
  state.view = 'stage';
  state.busy = false;
  centerActiveSpine();
  emit('jc:view', { view: 'stage' });
}

function playScene(album, first) {
  if (!state.scene) return;
  state.scene.setActive(true);
  state.scene.setAlbum(album, { first });
}

function centerActiveSpine() {
  const active = spineRail.querySelector('.spine.is-active');
  if (!active || spineRail.clientWidth === 0) return;
  const left = active.offsetLeft - spineRail.clientWidth / 2 + active.offsetWidth / 2;
  spineRail.scrollTo({ left: Math.max(0, left), behavior: reducedMotion ? 'auto' : 'smooth' });
}

/* ── 切换专辑 ─────────────────────────────────────────────── */
let switchLock = false;

async function switchAlbum(index, { silent = false } = {}) {
  if (state.view !== 'stage') return;
  const next = (index + ALBUMS.length) % ALBUMS.length;
  if (next === state.index) return;
  if (switchLock) return;
  switchLock = true;
  state.busy = true;
  if (!silent) audio.playSleeve();
  stopPlayback();

  const album = ALBUMS[next];

  flushNote();
  stageCopy.classList.add('is-swapping');
  stageSleeve.classList.remove('is-revealed');

  await wait(reducedMotion ? 40 : 230);

  fillStage(album, next);
  playScene(album, false);

  await nextFrame();
  stageCopy.classList.remove('is-swapping');
  stageSleeve.classList.add('is-revealed');

  setTimeout(() => {
    state.busy = false;
    switchLock = false;
  }, reducedMotion ? 60 : 380);
}

/* ── 返回唱片柜 ───────────────────────────────────────────── */
async function backToCrate() {
  if (state.view !== 'stage' || state.busy) return;
  flushNote();
  stopPlayback();
  immerseBtn.disabled = true;
  state.busy = true;
  veil.classList.add('is-on');
  await wait(reducedMotion ? 80 : 330);

  viewStage.hidden = true;
  viewCrate.hidden = false;
  viewStage.classList.remove('is-entering');
  stageSleeve.classList.remove('is-revealed');
  document.body.classList.remove('stage-on');
  state.scene?.setActive(false);
  state.view = 'crate';
  emit('jc:view', { view: 'crate' });
  document.title = '周杰伦 · 黑胶典藏 — JAY CHOU THE VINYL ARCHIVE';

  viewCrate.classList.remove('is-entering');
  void viewCrate.offsetWidth;
  viewCrate.classList.add('is-entering');

  veil.classList.remove('is-on');
  state.busy = false;
}

/* ── 事件绑定 ─────────────────────────────────────────────── */
buildRack();
buildSpines();
viewCrate.classList.remove('is-entering');

initCovers(ALBUMS, applyCover).catch(() => {
  /* 封面失败时由档案版兜底 */
});

initMedia(ALBUMS)
  .then(() => {
    if (state.view === 'stage') {
      const album = ALBUMS[state.index];
      buildLyricsTracks(album);
      refreshTrackBadges();
      if (lyricsState.open) renderLyricsSheet();
    }
  })
  .catch(() => {});

initLyricStore().catch(() => {});

/* 完整曲目表：iTunes 目录就绪后逐张扩展，并迁移所有按索引落键的本机数据 */
initTracklists(ALBUMS, (album, entries) => {
  adoptTracklist(album, entries).catch(() => {});
}).catch(() => {});

async function adoptTracklist(album, entries) {
  if (!Array.isArray(entries) || entries.length < album.tracks.length) return;

  await initMedia(ALBUMS).catch(() => {});
  const oldTracks = album.tracks.slice();
  const names = await adoptFullTracklist(album.n, oldTracks, entries).catch(() => null);
  if (!names) return;

  await initLyricStore().catch(() => {});
  migrateLyricIndices(album.n, oldTracks, names);

  // 会话内已解析的歌词随索引迁移
  for (let i = 0; i < oldTracks.length; i++) {
    const j = names.indexOf(oldTracks[i]);
    if (j < 0 || j === i) continue;
    const from = `${album.n}-${i}`;
    const to = `${album.n}-${j}`;
    if (lyricDataMap.has(from) && !lyricDataMap.has(to)) lyricDataMap.set(to, lyricDataMap.get(from));
    lyricDataMap.delete(from);
    pendingLyrics.delete(from);
  }

  // 正在播放的曲目键同步搬到新索引
  if (activeAudioKey) {
    const [an, at] = activeAudioKey.split('-').map(Number);
    if (an === album.n) {
      const j = names.indexOf(oldTracks[at]);
      if (j >= 0 && j !== at) {
        const entry = audioBank.get(activeAudioKey);
        if (entry) {
          audioBank.set(`${an}-${j}`, entry);
          audioBank.delete(activeAudioKey);
        }
        activeAudioKey = `${an}-${j}`;
      }
    }
  }

  // 曲目数一致：meta 已并入（含试听解析），无需重建 UI
  if (entries.length === album.tracks.length) {
    emit('jc:tracks', { n: album.n, count: names.length });
    return;
  }

  album.tracks = names;

  if (state.view === 'stage' && ALBUMS[state.index].n === album.n) {
    if (lyricsState.track >= names.length) lyricsState.track = 0;
    fillStage(album, state.index);
    buildLyricsTracks(album);
    refreshTrackBadges();
    if (lyricsState.open) renderLyricsSheet();
    updateImxInfo();
  }
  emit('jc:tracks', { n: album.n, count: names.length });
}

document.body.classList.add('is-gate');

document.querySelectorAll('.stage-btn, .stage-back, .icon-btn, .brand').forEach((el) => {
  if (!el.dataset.cursor) el.dataset.cursor = '';
});
backBtn.dataset.cursor = '返回';
brandLink.dataset.cursor = '';
soundBtn.dataset.cursor = '声音';
prevBtn.dataset.cursor = '上一张';
nextBtn.dataset.cursor = '下一张';

enterBtn.classList.add('is-loading');

const fontReady = Promise.all([
  document.fonts.load('900 100px "Noto Serif SC"'),
  document.fonts.load('400 20px "Noto Serif SC"'),
  document.fonts.load('300 20px "Cormorant Garamond"'),
  document.fonts.load('500 20px "Inter"')
]).catch(() => {});
const fontTimeout = new Promise((r) => setTimeout(r, 4500));

Promise.race([fontReady, fontTimeout, document.fonts.ready.catch(() => {})]).then(() => {
  enterBtn.disabled = false;
  enterBtn.classList.remove('is-loading');
  enterText.textContent = '进入听音室';
});

let gateOpened = false;
enterBtn.addEventListener('click', async () => {
  if (enterBtn.disabled || gateOpened) return;
  gateOpened = true;
  audio.unlock().catch(() => {});
  // 本地音频接入 Web Audio：干湿两路 + 生成式房间混响（iOS 改直出，避免静音拨片连带静默）
  if (!IS_APPLE_TOUCH) audio.attachElement(audioEl);
  audio.setEnabled(state.sound);
  gate.classList.add('is-open');
  document.body.classList.remove('is-gate');

  setTimeout(() => {
    viewCrate.classList.add('is-entering');
  }, 760);

  setTimeout(() => {
    gate.hidden = true;
  }, 1120);
});

function applySound() {
  audio.setEnabled(state.sound);
  audioEl.muted = !state.sound;
  soundBtn.setAttribute('aria-pressed', state.sound ? 'true' : 'false');
  soundBtn.setAttribute('aria-label', state.sound ? '关闭黑胶音效' : '开启黑胶音效');
  imxSound.textContent = state.sound ? '声音' : '静音';
  imxSound.setAttribute('aria-pressed', state.sound ? 'true' : 'false');
}

function toggleSound() {
  state.sound = !state.sound;
  applySound();
}

soundBtn.addEventListener('click', toggleSound);
imxSound.addEventListener('click', toggleSound);
applySound();

rack.addEventListener('click', (e) => {
  const btn = e.target.closest('.crate-item');
  if (!btn) return;
  const jacket = btn.querySelector('.jacket');
  if (!jacket) return;
  enterStage(Number(btn.dataset.index), jacket);
});

stageTracks.addEventListener('click', (e) => {
  const lyricBadge = e.target.closest('.track__lyric');
  if (lyricBadge) {
    openLyrics(Number(lyricBadge.dataset.lyric), lyricBadge);
    return;
  }
  const btn = e.target.closest('.track');
  if (!btn) return;
  playTrack(Number(btn.dataset.track), { toggle: true });
});

lyricsBackdrop.addEventListener('click', closeLyrics);
lyricsClose.addEventListener('click', closeLyrics);
lyricsTracks.addEventListener('click', (e) => {
  const btn = e.target.closest('.lyrics__track');
  if (!btn) return;
  setLyricTrack(Number(btn.dataset.track));
});
lyricsImportBtn.addEventListener('click', pickLyricFile);
lyricsRemoveBtn.addEventListener('click', () => {
  const album = ALBUMS[state.index];
  removeLyric(album.n, lyricsState.track);
  lyricDataMap.delete(`${album.n}-${lyricsState.track}`);
  buildLyricsTracks(album);
  renderLyricsSheet();
  refreshTrackBadges();
  updateTimedLyric();
  ensureLyrics(album.n, lyricsState.track);
  showLyricStatus('已移除本机导入，恢复自动歌词');
  audio.playSleeve();
});
lyricsFile.addEventListener('change', () => {
  const file = lyricsFile.files?.[0];
  const track = pendingLyricTrack;
  pendingLyricTrack = null;
  lyricsFile.value = '';
  if (file) importLyricFile(file, track ?? lyricsState.track);
});
lyricsBody.addEventListener('click', (e) => {
  if (e.target.closest('.lyrics__drop')) pickLyricFile();
});
lyricsBody.addEventListener('dragover', (e) => {
  e.preventDefault();
  lyricsBody.classList.add('is-over');
  const empty = lyricsBody.querySelector('.lyrics__empty');
  if (empty) empty.classList.add('is-over');
});
lyricsBody.addEventListener('dragleave', () => {
  lyricsBody.classList.remove('is-over');
  const empty = lyricsBody.querySelector('.lyrics__empty');
  if (empty) empty.classList.remove('is-over');
});
lyricsBody.addEventListener('drop', (e) => {
  e.preventDefault();
  lyricsBody.classList.remove('is-over');
  const empty = lyricsBody.querySelector('.lyrics__empty');
  if (empty) empty.classList.remove('is-over');
  handleDroppedFiles(e.dataTransfer?.files || []);
});

lyricsBatchBtn.addEventListener('click', () => {
  lyricsBatchFile.value = '';
  lyricsBatchFile.click();
});
lyricsBatchFile.addEventListener('change', () => {
  const files = [...(lyricsBatchFile.files || [])];
  lyricsBatchFile.value = '';
  if (files.length) handleDroppedFiles(files);
});

lyricsAudioPick.addEventListener('click', () => {
  lyricsAudioFile.value = '';
  lyricsAudioFile.click();
});

lyricsAudioFile.addEventListener('change', () => {
  const file = lyricsAudioFile.files?.[0];
  lyricsAudioFile.value = '';
  if (file && !importAudioFile(file)) showLyricStatus('请选择音频文件', true);
});

lyricsAudioPlay.addEventListener('click', () => playTrack(lyricsState.track, { toggle: true }));
imxPlay.addEventListener('click', togglePlayback);
deckPlay.addEventListener('click', togglePlayback);
deckPrev.addEventListener('click', () => stepTrack(-1));
deckNext.addEventListener('click', () => stepTrack(1));
imxPrev.addEventListener('click', () => stepTrack(-1));
imxNext.addEventListener('click', () => stepTrack(1));

// 进度条拖动（听音室 / 沉浸模式）
for (const [wrap, bar] of [[deckBarWrap, deckBar], [imxBar.parentElement, imxBar]]) {
  if (!wrap) continue;
  let dragging = false;
  wrap.addEventListener('pointerdown', (e) => {
    dragging = true;
    wrap.setPointerCapture?.(e.pointerId);
    seekFromEvent(e, wrap);
  });
  wrap.addEventListener('pointermove', (e) => {
    if (dragging) seekFromEvent(e, wrap);
  });
  wrap.addEventListener('pointerup', () => { dragging = false; });
  wrap.addEventListener('pointercancel', () => { dragging = false; });
}

immerseBtn.addEventListener('click', enterImmersive);
imxExit.addEventListener('click', () => exitImmersive());
imxLyrics.addEventListener('click', () => openLyrics(lyricsState.track, imxLyrics));
imxUI.addEventListener('pointermove', showImxBar);
imxUI.addEventListener('pointerdown', showImxBar);
window.addEventListener('pointermove', () => {
  if (imxState.open) showImxBar();
}, { passive: true });

document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && imxState.open) exitImmersive(true);
});

audioEl.addEventListener('timeupdate', () => {
  updateAudioProgress();
  updateTimedLyric();
});
audioEl.addEventListener('loadedmetadata', updateAudioProgress);
audioEl.addEventListener('durationchange', updateAudioProgress);
audioEl.addEventListener('play', () => {
  deckSpinning = true;
  applyBaseRate();
  startWobble();
  updateAudioUI();
  state.scene?.setPlaying(true);
});
audioEl.addEventListener('pause', () => {
  deckSpinning = false;
  stopWobble();
  updateAudioUI();
});
audioEl.addEventListener('ended', () => {
  // 自动连播：专辑内下一首；到末尾则抬臂归位
  if (activeAudioKey) {
    const [n, t] = activeAudioKey.split('-').map(Number);
    const album = ALBUMS.find((a) => a.n === n);
    if (state.view === 'stage' && ALBUMS[state.index].n === n && t + 1 < album.tracks.length) {
      playTrack(t + 1);
      return;
    }
  }
  pausePlayback();
  updateTimedLyric();
  emit('jc:notify', { zh: '本面播完 · 唱臂归位', en: 'SIDE END' });
});
audioEl.addEventListener('error', () => {
  const entry = currentEntry();
  if (!entry || !audioEl.error) return;
  showLyricStatus(
    entry.source === 'preview' ? '试听加载失败，请检查网络或放入本地完整版' : '音频加载失败，请重新放入文件',
    true
  );
  deckSpinning = false;
  state.scene?.setPlaying(false);
  audio.setDucking(false);
  updateAudioUI();
});

rpmButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    rpmButtons.forEach((b) => {
      const active = b === btn;
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    state.rpm = Number(btn.dataset.rpm);
    applyBaseRate();
    state.scene?.setSpeed(state.rpm);
  });
});

stageSleeve.addEventListener('click', flipStageSleeve);
stageSleeve.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    flipStageSleeve();
  }
});
stageSleeve.addEventListener('pointermove', (e) => {
  const r = stageSleeve.getBoundingClientRect();
  stageSleeve.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
  stageSleeve.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`);
});

memoryToggle.addEventListener('click', () => toggleMemory());
memoryInput.addEventListener('input', saveNoteSoon);
memoryInput.addEventListener('focus', () => document.body.classList.add('typing'));
memoryInput.addEventListener('blur', () => {
  document.body.classList.remove('typing');
  const album = ALBUMS[state.index];
  writeNote(album.n, memoryInput.value);
  updateMemoryUI(memoryInput.value);
});
memoryInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    memoryInput.blur();
    toggleMemory(false);
  }
});

prevBtn.addEventListener('click', () => switchAlbum(state.index - 1));
nextBtn.addEventListener('click', () => switchAlbum(state.index + 1));
backBtn.addEventListener('click', backToCrate);
brandLink.addEventListener('click', (e) => {
  e.preventDefault();
  if (state.view === 'stage') backToCrate();
});

spineRail.addEventListener('click', (e) => {
  const s = e.target.closest('.spine');
  if (!s) return;
  switchAlbum(Number(s.dataset.index));
});

document.addEventListener('keydown', (e) => {
  if (e.defaultPrevented) return;
  const tag = e.target?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return;

  if (lyricsState.open) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeLyrics();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setLyricTrack(lyricsState.track - 1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      setLyricTrack(lyricsState.track + 1);
    }
    return;
  }

  if (imxState.open) {
    if (e.key === 'Escape' || e.key === 'f' || e.key === 'F') {
      e.preventDefault();
      exitImmersive();
    } else if (e.key === 'm' || e.key === 'M') {
      e.preventDefault();
      toggleSound();
    } else if (e.key === 'l' || e.key === 'L') {
      e.preventDefault();
      openLyrics(lyricsState.track, imxLyrics);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      stepTrack(-1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      stepTrack(1);
    } else if (e.key === ' ' && tag !== 'BUTTON' && tag !== 'A') {
      e.preventDefault();
      togglePlayback();
    }
    return;
  }

  if (!gate.hidden) {
    if ((e.key === 'Enter' || e.key === ' ') && !enterBtn.disabled) {
      e.preventDefault();
      enterBtn.click();
    }
    return;
  }
  if (state.view !== 'stage') return;

  if (e.key === 'f' || e.key === 'F') { e.preventDefault(); enterImmersive(); return; }
  if (e.key === 'm' || e.key === 'M') { e.preventDefault(); toggleSound(); return; }
  if (e.key === 'l' || e.key === 'L') {
    e.preventDefault();
    openLyrics(lyricsState.track, stageTracks.querySelector('.track'));
    return;
  }
  if (e.key === ' ' && tag !== 'BUTTON' && tag !== 'A') {
    e.preventDefault();
    togglePlayback();
    return;
  }
  if (e.key === 'ArrowLeft') { e.preventDefault(); switchAlbum(state.index - 1); }
  if (e.key === 'ArrowRight') { e.preventDefault(); switchAlbum(state.index + 1); }
  if (e.key === 'Escape') {
    e.preventDefault();
    if (Date.now() - immersiveExitAt < 400) return;
    backToCrate();
  }
});

/* ── 柜体视差与封套反光 ───────────────────────────────────── */
let tiltTarget = { x: 0, y: 0 };
let tiltCurrent = { x: 0, y: 0 };
let tiltRaf = 0;

function runTilt() {
  tiltCurrent.x += (tiltTarget.x - tiltCurrent.x) * 0.1;
  tiltCurrent.y += (tiltTarget.y - tiltCurrent.y) * 0.1;
  cabinet.style.transform = `rotateX(${tiltCurrent.x.toFixed(3)}deg) rotateY(${tiltCurrent.y.toFixed(3)}deg)`;
  if (Math.abs(tiltTarget.x - tiltCurrent.x) > 0.01 || Math.abs(tiltTarget.y - tiltCurrent.y) > 0.01) {
    tiltRaf = requestAnimationFrame(runTilt);
  } else {
    tiltRaf = 0;
  }
}

cabinetWrap.addEventListener('pointermove', (e) => {
  if (state.view !== 'crate' || window.innerWidth < 900) return;
  const r = cabinet.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width;
  const y = (e.clientY - r.top) / r.height;
  tiltTarget.x = (0.5 - y) * 3.2;
  tiltTarget.y = (x - 0.5) * 4.2;
  if (!tiltRaf) tiltRaf = requestAnimationFrame(runTilt);
});

cabinetWrap.addEventListener('pointerleave', () => {
  tiltTarget.x = 0;
  tiltTarget.y = 0;
  if (!tiltRaf) tiltRaf = requestAnimationFrame(runTilt);
});

rack.addEventListener('pointermove', (e) => {
  const jacket = e.target.closest('.jacket');
  if (!jacket) return;
  const r = jacket.getBoundingClientRect();
  jacket.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
  jacket.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`);
});

/* ── 自定义光标 ───────────────────────────────────────────── */
const cursor = $('cursor');
const cursorLabel = $('cursorLabel');
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

if (finePointer) {
  document.body.classList.add('has-cursor');
  let cx = window.innerWidth / 2;
  let cy = window.innerHeight / 2;
  let tx = cx;
  let ty = cy;
  let ringRaf = 0;

  const ring = cursor.querySelector('.cursor__ring');
  const dot = cursor.querySelector('.cursor__dot');

  const draw = () => {
    cx += (tx - cx) * 0.18;
    cy += (ty - cy) * 0.18;
    ring.style.transform = `translate(${cx}px, ${cy}px)`;
    dot.style.transform = `translate(${tx}px, ${ty}px)`;
    cursorLabel.style.transform = `translate(${cx + 20}px, ${cy + 20}px)`;
    if (Math.abs(tx - cx) > 0.1 || Math.abs(ty - cy) > 0.1) {
      ringRaf = requestAnimationFrame(draw);
    } else {
      ringRaf = 0;
    }
  };

  window.addEventListener('pointermove', (e) => {
    tx = e.clientX;
    ty = e.clientY;
    if (!document.body.classList.contains('cursor-ready')) {
      document.body.classList.add('cursor-ready');
    }
    if (!ringRaf) ringRaf = requestAnimationFrame(draw);
  }, { passive: true });

  document.addEventListener('pointerover', (e) => {
    const el = e.target.closest('[data-cursor]');
    if (el) {
      cursor.classList.add('is-hover');
      cursorLabel.textContent = el.dataset.cursor || '';
    } else {
      cursor.classList.remove('is-hover');
      cursorLabel.textContent = '';
    }
  });

  window.addEventListener('pointerdown', () => cursor.classList.add('is-down'));
  window.addEventListener('pointerup', () => cursor.classList.remove('is-down'));
  document.addEventListener('pointerleave', () => {
    document.body.classList.remove('cursor-ready');
  });
  document.addEventListener('pointerenter', () => {
    document.body.classList.add('cursor-ready');
  });
} else {
  document.body.classList.remove('has-cursor');
}

/* ── 首次进入时的轻微提示 ─────────────────────────────────── */
window.addEventListener('load', () => {
  setTimeout(() => {
    if (!gate.hidden) return;
    // 让唱片脊的当前项居中
    const active = spineRail.querySelector('.spine.is-active');
    if (active) {
      spineRail.scrollTo({
        left: Math.max(0, active.offsetLeft - spineRail.clientWidth / 2 + active.offsetWidth / 2),
        behavior: 'auto'
      });
    }
  }, 120);
});

/* ── 融合层启动：纸面卡通 × 像素机器 ──────────────────────── */
function clearAlbumLocal(n) {
  const album = ALBUMS.find((a) => a.n === n);
  if (!album) return;
  album.tracks.forEach((_, t) => {
    const key = `${n}-${t}`;
    dropImport(key);
    audioBank.delete(key);
    lyricDataMap.delete(key);
    try {
      localStorage.removeItem(`jc-lyric-${key}`);
      localStorage.removeItem(`jc-lyric-cache-${key}`);
    } catch { /* ignore */ }
  });
  if (activeAudioKey?.startsWith(`${n}-`)) stopPlayback();
  buildLyricsTracks(album);
  refreshTrackBadges();
  if (lyricsState.open) renderLyricsSheet();
  syncSheetAudio();
  emit('jc:notify', { zh: `《${album.title}》本机导入与缓存已清除`, en: 'CLEARED' });
}

const retro = bootRetro({
  albums: ALBUMS,
  getIndex: () => state.index,
  getView: () => state.view,
  getSheetOpen: () => lyricsState.open,
  onEraPick: (i) => switchAlbum(i),
  onKaraoke: (on) => {
    state.karaokeChar = on;
    try { localStorage.setItem('jc-karaoke', on ? '1' : '0'); } catch { /* ignore */ }
    if (lyricsState.open) renderLyricsSheet();
    updateTimedLyric();
  },
  onClearAlbum: (n) => clearAlbumLocal(n),
  onMemorySave: () => {
    flushNote();
    updateMemoryUI(memoryInput.value);
  },
  onToggle: () => {}
});
retro.setKaraokeChecked(state.karaokeChar);
// 初值补发：封面/视图状态可能在融合层接线之前就已完成，这里重发一次当前值
emit('jc:covers', { pct: coversSeen.size / ALBUMS.length });

/* ── iOS：锁屏 / 控制中心 / 后台播放 ───────────────────────── */

function syncMediaSession() {
  const ms = navigator.mediaSession;
  if (!ms) return;
  const entry = currentEntry();
  if (!entry || !activeAudioKey) {
    try {
      ms.metadata = null;
      ms.playbackState = 'none';
    } catch { /* ignore */ }
    return;
  }
  const [n, t] = activeAudioKey.split('-').map(Number);
  const album = ALBUMS.find((a) => a.n === n);
  const urls = getCoverUrls(n);
  if (typeof MediaMetadata === 'function') {
    try {
      ms.metadata = new MediaMetadata({
        title: album?.tracks?.[t] || '—',
        artist: '周杰伦 · 黑胶典藏',
        album: album?.title || '',
        artwork: [urls?.small, urls?.large]
          .filter(Boolean)
          .map((src, i) => ({ src, sizes: i === 0 ? '200x200' : '600x600' }))
      });
    } catch { /* ignore */ }
  }
  try {
    ms.playbackState = audioEl.paused ? 'paused' : 'playing';
  } catch { /* ignore */ }
}

function bindMediaSession() {
  const ms = 'mediaSession' in navigator ? navigator.mediaSession : null;
  if (!ms) return;
  const set = (action, handler) => {
    try {
      ms.setActionHandler(action, handler);
    } catch { /* 当前平台不支持该 action */ }
  };
  set('play', () => {
    if (activeAudioKey && audioEl.paused) togglePlayback();
  });
  set('pause', () => {
    if (!audioEl.paused) pausePlayback();
  });
  set('previoustrack', () => stepTrack(-1));
  set('nexttrack', () => stepTrack(1));
  set('seekto', (d) => {
    const t = Number(d?.seekTime);
    if (Number.isFinite(t) && Number.isFinite(audioEl.duration)) {
      audioEl.currentTime = Math.min(Math.max(0, t), audioEl.duration);
    }
  });
  set('seekbackward', (d) => {
    audioEl.currentTime = Math.max(0, audioEl.currentTime - (Number(d?.seekOffset) || 10));
  });
  set('seekforward', (d) => {
    const max = Number.isFinite(audioEl.duration) ? audioEl.duration : audioEl.currentTime;
    audioEl.currentTime = Math.min(max, audioEl.currentTime + (Number(d?.seekOffset) || 10));
  });
}
bindMediaSession();

/* 触屏入口：批量导入本机音频与歌词（桌面端仍走拖拽） */
$('importAudioBtn')?.addEventListener('click', () => {
  lyricsBatchFile.value = '';
  lyricsBatchFile.click();
});

/* 回到前台时恢复 WebAudio：iOS 锁屏或切后台会挂起 AudioContext */
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && audio.ctx?.state === 'suspended') audio.ctx.resume().catch(() => {});
});
window.addEventListener('pageshow', () => {
  if (audio.ctx?.state === 'suspended') audio.ctx.resume().catch(() => {});
});
emit('jc:album', { index: state.index });
emit('jc:view', { view: state.view });

window.addEventListener('jc-retro:seek', (e) => {
  const entry = currentEntry();
  if (!entry || !Number.isFinite(audioEl.duration) || audioEl.duration <= 0) return;
  audioEl.currentTime = (e.detail.pct / 100) * audioEl.duration;
  updateAudioProgress();
  updateTimedLyric();
});
