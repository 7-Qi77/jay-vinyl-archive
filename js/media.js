/**
 * 音源与歌词解析。
 * 音频优先级：浏览器导入（IndexedDB 持久化）→ 项目内本地文件 assets/audio → iTunes 官方 30s 试听。
 * 歌词优先级：内置（assets/lyrics，含逐字对齐）→ lrclib 在线匹配（本机缓存）→ 内置纯文本。
 * 项目只打包用户自有文件；在线内容只存 URL / ID 与本机文本缓存，不打包受版权保护的音频。
 */
import { getSongPreview, getSongDuration, getTracklistMeta } from './covers.js';

const META_URL = './assets/track-meta.json';
const AUDIO_DIR = './assets/audio/';
const LYRIC_DIR = './assets/lyrics/';
const LYRIC_CACHE_PREFIX = 'jc-lyric-cache-';
const LYRIC_CACHE_TTL = 30 * 24 * 60 * 60 * 1000;
const NEG_CACHE_TTL = 24 * 60 * 60 * 1000;

let meta = null; // { albums: { [n]: { tracks: [...] } } }
let albumsRef = null; // data.js 的 ALBUMS，用于曲目表缓存兜底
let localAudio = new Map(); // `${n}-${i}` -> { url, name }
let lyricIndex = null; // title -> { karaoke?, lrc?, txt? }
let imported = new Map(); // `${n}-${i}` -> { url, name }
let initPromise = null;

const keyOf = (n, i) => `${n}-${i}`;

async function fetchJson(url, timeout = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* ── IndexedDB：用户导入的音频，刷新后仍在 ─────────────────── */

function openDB() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) return reject(new Error('no indexedDB'));
    const rq = indexedDB.open('jc-vinyl-audio', 1);
    rq.onupgradeneeded = () => {
      if (!rq.result.objectStoreNames.contains('files')) {
        rq.result.createObjectStore('files', { keyPath: 'key' });
      }
    };
    rq.onsuccess = () => resolve(rq.result);
    rq.onerror = () => reject(rq.error);
  });
}

async function idbAll() {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('files', 'readonly');
      const rq = tx.objectStore('files').getAll();
      rq.onsuccess = () => resolve(rq.result || []);
      rq.onerror = () => reject(rq.error);
    });
  } catch {
    return [];
  }
}

export async function idbPut(key, blob, name) {
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('files', 'readwrite');
      tx.objectStore('files').put({ key, blob, name, ts: Date.now() });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    return true;
  } catch {
    return false;
  }
}

export async function idbDelete(key) {
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('files', 'readwrite');
      tx.objectStore('files').delete(key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* 忽略 */
  }
}

/* ── 初始化 ───────────────────────────────────────────────── */

export function initMedia(albums) {
  if (initPromise) return initPromise;
  albumsRef = albums;
  initPromise = (async () => {
    const [m, manifest, lidx, rows] = await Promise.all([
      fetchJson(META_URL),
      fetchJson(`${AUDIO_DIR}manifest.json`),
      fetchJson(`${LYRIC_DIR}index.json`),
      idbAll()
    ]);
    meta = m;
    lyricIndex = lidx;

    if (manifest?.files) {
      const titleIndex = new Map();
      albums.forEach((a) => a.tracks.forEach((t, i) => titleIndex.set(t, keyOf(a.n, i))));
      for (const f of manifest.files) {
        const key = titleIndex.get(f.title);
        if (key) localAudio.set(key, { url: AUDIO_DIR + encodeURIComponent(f.file), name: f.file });
      }
    }

    for (const row of rows) {
      if (row?.key && row.blob) {
        imported.set(row.key, { url: URL.createObjectURL(row.blob), name: row.name || '本地音频', blob: row.blob });
      }
    }
  })();
  return initPromise;
}

/* ── 音频 ─────────────────────────────────────────────────── */

export function getTrackMeta(n, i) {
  return meta?.albums?.[String(n)]?.tracks?.[i] || null;
}

/**
 * 采用完整曲目表：重排一切按 `${n}-${索引}` 落键的数据。
 * 1) 元数据：iTunes 目录条目为底，旧条目的 lrclibId / durationMs 按曲名搬到新位置；
 * 2) 浏览器导入的音频（内存 + IndexedDB）与 assets 清单按曲名搬到新索引；
 * 3) 在线歌词缓存（localStorage）同样搬家。
 * 返回完整曲名数组。
 */
export async function adoptFullTracklist(n, oldTracks, entries) {
  const names = entries.map((e) => e.name);

  if (!meta) meta = { albums: {} };
  if (!meta.albums) meta.albums = {};
  const albumMeta = { tracks: entries.map((e) => ({ ...e })) };
  const oldMeta = meta.albums[String(n)]?.tracks || [];
  oldTracks.forEach((title, i) => {
    const j = names.indexOf(title);
    if (j < 0 || !oldMeta[i]) return;
    albumMeta.tracks[j] = {
      ...albumMeta.tracks[j],
      lrclibId: oldMeta[i].lrclibId,
      durationMs: oldMeta[i].durationMs ?? albumMeta.tracks[j].durationMs,
      name: title
    };
  });
  meta.albums[String(n)] = albumMeta;

  // 内存键迁移（导入音频 & assets 清单）
  const moveMap = (map) => {
    const moved = [];
    for (let i = 0; i < oldTracks.length; i++) {
      const key = keyOf(n, i);
      const entry = map.get(key);
      if (!entry) continue;
      const j = names.indexOf(oldTracks[i]);
      if (j < 0 || j === i) continue;
      map.delete(key);
      const to = keyOf(n, j);
      if (!map.has(to)) map.set(to, entry);
      moved.push({ from: key, to, entry });
    }
    return moved;
  };
  moveMap(localAudio);
  const movedImports = moveMap(imported);
  for (const { from, to, entry } of movedImports) {
    if (entry.blob) await idbPut(to, entry.blob, entry.name);
    await idbDelete(from);
  }

  // 在线歌词缓存迁移
  for (let i = 0; i < oldTracks.length; i++) {
    const j = names.indexOf(oldTracks[i]);
    if (j < 0 || j === i) continue;
    try {
      const from = cacheKey(n, i);
      const raw = localStorage.getItem(from);
      if (raw == null) continue;
      const to = cacheKey(n, j);
      if (localStorage.getItem(to) == null) localStorage.setItem(to, raw);
      localStorage.removeItem(from);
    } catch {
      /* 存储不可用时跳过 */
    }
  }

  return names;
}

export function hasLocalAudio(n, i) {
  const key = keyOf(n, i);
  return imported.has(key) || localAudio.has(key);
}

/** 解析播放源：导入 > 本地文件 > 官方试听（meta 或曲目表缓存） */
export function resolveAudio(n, i, title) {
  const key = keyOf(n, i);
  const imp = imported.get(key);
  if (imp) return { ...imp, source: 'import' };
  const loc = localAudio.get(key);
  if (loc) return { ...loc, source: 'local' };

  const m = getTrackMeta(n, i);
  const url = (m?.trackId && getSongPreview(n, m.trackId)) || m?.previewUrl;
  if (url) {
    const dur = (m?.trackId && getSongDuration(n, m.trackId)) || m?.durationMs || 0;
    return { url, name: `${title} · 官方试听`, source: 'preview', durationHint: Math.min(30, dur / 1000 || 30) };
  }

  // meta 尚未并入时，直接查曲目表缓存
  if (title && albumsRef) {
    const album = albumsRef.find((a) => a.n === n);
    const t = album ? getTracklistMeta(album) : null;
    const hit = t ? t.find((e) => e.name === title) : null;
    if (hit?.previewUrl) {
      return {
        url: hit.previewUrl,
        name: `${title} · 官方试听`,
        source: 'preview',
        durationHint: Math.min(30, (hit.durationMs || 0) / 1000 || 30)
      };
    }
  }
  return null;
}

/** 登记一次会话内导入（并持久化到 IndexedDB） */
export function registerImport(key, url, name, blob) {
  const old = imported.get(key);
  imported.set(key, { url, name });
  if (old?.url && old.url !== url) URL.revokeObjectURL(old.url);
  if (blob) idbPut(key, blob, name);
}

export function getImported(key) {
  return imported.get(key) || null;
}

export function dropImport(key) {
  const old = imported.get(key);
  if (old?.url) URL.revokeObjectURL(old.url);
  imported.delete(key);
  idbDelete(key);
}

/* ── 歌词 ─────────────────────────────────────────────────── */

export function parseLyricData(text) {
  const raw = String(text).replace(/\r\n?/g, '\n');
  const plain = [];
  const timed = [];
  for (const line of raw.split('\n')) {
    if (/^\s*\[[^\]]+\]\s*$/.test(line)) continue;
    const stamps = [...line.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
    const clean = line
      .replace(/\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\]/g, '')
      .replace(/\s+$/, '')
      .trim();
    if (!clean) continue;
    plain.push(clean);
    for (const m of stamps) {
      const min = Number(m[1]);
      const sec = Number(m[2]);
      const frac = m[3] ? Number(`0.${m[3]}`) : 0;
      timed.push({ t: min * 60 + sec + frac, text: clean });
    }
  }
  timed.sort((a, b) => a.t - b.t);
  return {
    text: plain.join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 20000),
    timed: timed.slice(0, 400)
  };
}

async function fetchBundledLyrics(title) {
  const entry = lyricIndex?.[title];
  if (!entry) return null;
  try {
    if (entry.karaoke) {
      const data = await fetchJson(LYRIC_DIR + encodeURIComponent(entry.karaoke));
      if (data?.lines?.length) {
        return {
          text: data.lines.map((l) => l.text).join('\n'),
          timed: data.lines.map((l) => ({ t: l.start, text: l.text })),
          karaoke: data.lines,
          source: 'builtin'
        };
      }
    }
    if (entry.lrc) {
      const res = await fetch(LYRIC_DIR + encodeURIComponent(entry.lrc));
      if (res.ok) {
        const parsed = parseLyricData(await res.text());
        if (parsed.text) return { ...parsed, source: 'builtin' };
      }
    }
    if (entry.txt) {
      const res = await fetch(LYRIC_DIR + encodeURIComponent(entry.txt));
      if (res.ok) {
        const text = (await res.text()).trim();
        if (text) return { text, timed: [], source: 'builtin' };
      }
    }
  } catch {
    /* 内置歌词失败时走在线 */
  }
  return null;
}

const cacheKey = (n, i) => `${LYRIC_CACHE_PREFIX}${n}-${i}`;

function readLyricCache(n, i) {
  try {
    const raw = localStorage.getItem(cacheKey(n, i));
    if (!raw) return null;
    const obj = JSON.parse(raw);
    const ttl = obj.none ? NEG_CACHE_TTL : LYRIC_CACHE_TTL;
    if (Date.now() - (obj.ts || 0) > ttl) return null;
    return obj;
  } catch {
    return null;
  }
}

function writeLyricCache(n, i, payload) {
  try {
    localStorage.setItem(cacheKey(n, i), JSON.stringify({ ...payload, ts: Date.now() }));
  } catch {
    /* 存储满时忽略 */
  }
}

async function fetchRemoteLyrics(n, i, title) {
  const cached = readLyricCache(n, i);
  if (cached) return cached.none ? null : cached;

  const m = getTrackMeta(n, i);
  if (!m?.lrclibId) return searchRemoteLyrics(n, i, title);

  const data = await fetchJson(`https://lrclib.net/api/get/${m.lrclibId}`, 9000);
  if (!data) {
    writeLyricCache(n, i, { none: true });
    return null;
  }
  let result = null;
  if (data.syncedLyrics) {
    const parsed = parseLyricData(data.syncedLyrics);
    if (parsed.text) result = { ...parsed, source: 'lrclib' };
  }
  if (!result && data.plainLyrics) {
    const text = String(data.plainLyrics).trim();
    if (text) result = { text, timed: [], source: 'lrclib' };
  }
  writeLyricCache(n, i, result || { none: true });
  return result;
}

/** 无预置 ID 的曲目：按曲名在线搜索一次，结果同样落本机缓存 */
async function searchRemoteLyrics(n, i, title) {
  if (!title) return null;
  const q = `https://lrclib.net/api/search?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent('Jay Chou')}`;
  const rows = await fetchJson(q, 9000);
  const hit = Array.isArray(rows)
    ? rows.find((r) => String(r.trackName || '').trim().toLowerCase() === String(title).trim().toLowerCase())
    : null;
  if (!hit) {
    writeLyricCache(n, i, { none: true });
    return null;
  }
  let result = null;
  if (hit.syncedLyrics) {
    const parsed = parseLyricData(hit.syncedLyrics);
    if (parsed.text) result = { ...parsed, source: 'lrclib' };
  }
  if (!result && hit.plainLyrics) {
    const text = String(hit.plainLyrics).trim();
    if (text) result = { text, timed: [], source: 'lrclib' };
  }
  writeLyricCache(n, i, result || { none: true });
  return result;
}

/**
 * 歌词解析：内置带时间轴（含逐字）优先，其次在线同步歌词，最后内置纯文本。
 * 用户手动导入的歌词由 app 层（jc-lyric-）优先处理，不经过这里。
 */
export async function getLyrics(n, i, title) {
  const bundled = await fetchBundledLyrics(title);
  if (bundled && (bundled.karaoke || bundled.timed.length)) return bundled;
  const remote = await fetchRemoteLyrics(n, i, title);
  if (remote) return remote;
  return bundled;
}

export function lyricSourceLabel(source) {
  if (source === 'user') return '本机导入';
  if (source === 'builtin') return '内置 · 本机对齐';
  if (source === 'lrclib') return 'lrclib · 本机缓存';
  return '';
}