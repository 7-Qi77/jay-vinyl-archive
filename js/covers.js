/**
 * 原版封面与曲目解析：iTunes 公共目录（台湾区）。
 * 只保存封面 / 试听 URL 到本机缓存，不下载/打包任何封面或音频文件。
 */
const CACHE_KEY = 'jc-cover-urls-v3';
const TTL = 7 * 24 * 60 * 60 * 1000;
const STAGE_SIZE = 1000;
const CRATE_SIZE = 300;

const urlCache = new Map();
const imageCache = new Map();
const songCache = new Map(); // albumN -> Map(trackId -> { p, d })
let initPromise = null;

const safeRead = () => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const safeWrite = (value) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(value));
  } catch {
    /* 隐私模式下忽略 */
  }
};

const sized = (art, size) => art.replace(/\/\d+x\d+bb\./, `/${size}x${size}bb.`);

/* 封面与曲目表共用同一个 lookup 响应，避免首屏对同一专辑请求两次。 */
const lookupCache = new Map(); // itunesId -> Promise<{ art, songs, tracklist }>

async function lookupAlbum(id) {
  const key = String(id);
  if (lookupCache.has(key)) return lookupCache.get(key);

  const task = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);
    try {
      const res = await fetch(
        `https://itunes.apple.com/lookup?id=${encodeURIComponent(id)}&entity=song&country=tw&limit=100`,
        { signal: controller.signal, headers: { Accept: 'application/json' } }
      );
      if (!res.ok) throw new Error(`iTunes ${res.status}`);
      const data = await res.json();
      const results = data.results || [];
      const art = results[0]?.artworkUrl100;
      const rawSongs = results.filter((r) => r.kind === 'song' && r.trackId);
      const songs = rawSongs.map((r) => ({ id: r.trackId, p: r.previewUrl || null, d: r.trackTimeMillis || 0 }));
      const tracklist = rawSongs
        .filter((r) => r.trackName)
        .sort((a, b) => (a.trackNumber || 0) - (b.trackNumber || 0))
        .map((s) => ({
          name: toSimplified(s.trackName),
          trackId: s.trackId || null,
          previewUrl: s.previewUrl || null,
          durationMs: s.trackTimeMillis || null
        }));
      return {
        art: typeof art === 'string' && art.startsWith('https://is') ? art : null,
        songs,
        tracklist
      };
    } finally {
      clearTimeout(timer);
    }
  })();

  lookupCache.set(key, task);
  try {
    return await task;
  } catch (err) {
    lookupCache.delete(key); // 失败不留下毒缓存，下一次还可重试
    throw err;
  }
}

function installSongs(n, songs) {
  if (!Array.isArray(songs) || !songs.length) return;
  const map = new Map();
  for (const s of songs) map.set(s.id, s);
  songCache.set(n, map);
}

export function getSongPreview(n, trackId) {
  return songCache.get(n)?.get(trackId)?.p || null;
}

export function getSongDuration(n, trackId) {
  return songCache.get(n)?.get(trackId)?.d || 0;
}

export function getCoverUrls(n) {
  return urlCache.get(n) || null;
}

/**
 * 解析 15 张封面 URL；命中缓存时立即返回。
 * onResolve 会在每张封面 URL 就绪时调用，用来渐进填充页面。
 */
export function initCovers(albums, onResolve) {
  if (initPromise) return initPromise;

  const cache = safeRead();
  const now = Date.now();

  const jobs = albums.map(async (album) => {
    if (!album.itunesId) return;
    const key = String(album.itunesId);
    let entry = cache[key];

    if (!entry || !entry.art || now - entry.ts > TTL) {
      try {
        const { art, songs } = await lookupAlbum(album.itunesId);
        if (art) {
          entry = { art, ts: now, songs };
          cache[key] = entry;
        } else if (songs?.length && entry) {
          entry = { ...entry, songs };
          cache[key] = entry;
        }
      } catch {
        /* 网络失败时保留旧缓存 */
      }
    }

    if (entry?.songs) installSongs(album.n, entry.songs);
    if (!entry?.art) return;

    const urls = {
      small: sized(entry.art, CRATE_SIZE),
      large: sized(entry.art, STAGE_SIZE)
    };
    urlCache.set(album.n, urls);
    onResolve?.(album, urls);
  });

  initPromise = Promise.allSettled(jobs).then(() => {
    safeWrite(cache);
    return urlCache;
  });

  return initPromise;
}

/**
 * 给唱片标签使用的 CORS 图片对象。
 * 画面未就绪时由 scene 监听 load 后重绘。
 */
export function getStageImage(album) {
  const urls = urlCache.get(album.n);
  if (!urls) return null;

  if (!imageCache.has(album.n)) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.src = urls.large;
    imageCache.set(album.n, img);
  }
  return imageCache.get(album.n);
}

/* ── 完整曲目表：同一 iTunes 目录，entity=song ─────────────── */

/* 台湾区目录返回繁体曲名，站点使用简体：按需映射（字符集取自全部 162 首曲名） */
const T2S = {
  愛: '爱', 義: '义', 鬥: '斗', 鳩: '鸠', 龍: '龙', 捲: '卷', 風: '风', 鐘: '钟', 來: '来', 簡: '简',
  單: '单', 開: '开', 對: '对', 雙: '双', 靜: '静', 獸: '兽', 島: '岛', 鐵: '铁', 號: '号', 車: '车',
  爺: '爷', 過: '过', 蘭: '兰', 後: '后', 戰: '战', 東: '东', 聽: '听', 種: '种', 調: '调', 懸: '悬',
  盤: '盘', 藉: '借', 將: '将', 軍: '军', 擱: '搁', 淺: '浅', 亂: '乱', 園: '园', 遊: '游', 會: '会',
  殤: '殇', 藍: '蓝', 髮: '发', 楓: '枫', 機: '机', 鱗: '鳞', 麥: '麦', 頤: '颐', 飄: '飘', 媽: '妈',
  話: '话', 費: '费', 綱: '纲', 紅: '红', 陽: '阳', 約: '约', 無: '无', 長: '长', 電: '电', 騎: '骑',
  給: '给', 時: '时', 間: '间', 術: '术', 說: '说', 詩: '诗', 喬: '乔', 説: '说', 見: '见', 煙: '烟',
  學: '学', 錄: '录', 帶: '带', 緒: '绪', 飛: '飞', 記: '记', 楊: '杨', 導: '导', 驚: '惊', 嘆: '叹',
  嗎: '吗', 療: '疗', 傷: '伤', 燒: '烧', 戲: '戏', 語: '语', 頭: '头', 詠: '咏', 較: '较', 沒: '没',
  塵: '尘', 棧: '栈', 夢: '梦', 啓: '启', 動: '动', 裡: '里', 烏: '乌', 麗: '丽', 竊: '窃', 麼: '么',
  氣: '气', 唸: '念', 寫: '写', 從: '从', 魚: '鱼', 聲: '声', 邊: '边', 點: '点', 該: '该', 張: '张',
  廢: '废', 偉: '伟', 還: '还', 顏: '颜', 錯: '错', 課: '课'
};

function toSimplified(name) {
  let out = '';
  let touched = false;
  for (const ch of String(name)) {
    const s = T2S[ch];
    if (s) {
      out += s;
      touched = true;
    } else {
      out += ch;
    }
  }
  return touched ? out : name;
}

const TRACKS_CACHE_KEY = 'jc-tracklists-v1';
const TRACKS_TTL = 7 * 24 * 60 * 60 * 1000;
const trackCache = new Map(); // itunesId -> [{ name, trackId, previewUrl, durationMs }]
const trackNames = new Map(); // itunesId -> [name]

export function getTracklist(album) {
  if (!album.itunesId) return null;
  return trackNames.get(album.itunesId) || null;
}

export function getTracklistMeta(album) {
  if (!album.itunesId) return null;
  return trackCache.get(album.itunesId) || null;
}

async function lookupTracklist(id) {
  const data = await lookupAlbum(id);
  return Array.isArray(data.tracklist) ? data.tracklist : [];
}

export function initTracklists(albums, onReady) {
  let cache = null;
  try {
    cache = JSON.parse(localStorage.getItem(TRACKS_CACHE_KEY) || 'null');
  } catch {
    cache = null;
  }
  const store = cache && Date.now() - cache.ts < TRACKS_TTL && cache.data ? cache.data : {};
  let writing = false;
  const flush = () => {
    if (writing) return;
    writing = true;
    setTimeout(() => {
      writing = false;
      try {
        localStorage.setItem(TRACKS_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: store }));
      } catch {
        /* 配额不足时放弃缓存 */
      }
    }, 600);
  };

  const jobs = albums.map(async (album) => {
    if (!album.itunesId) return;
    const id = album.itunesId;
    let list = store[id];
    if (!Array.isArray(list) || !list.length) {
      list = null;
      try {
        const fetched = await lookupTracklist(id);
        // 与精选曲目等量或更全即采用（新专辑 data 已含全表）
        if (Array.isArray(fetched) && fetched.length >= album.tracks.length) {
          list = fetched;
          store[id] = list;
          flush();
        }
      } catch {
        /* 离线时沿用精选回退 */
      }
    }
    if (Array.isArray(list) && list.length >= album.tracks.length) {
      // 兼容历史缓存里的繁体曲名
      list.forEach((e) => {
        e.name = toSimplified(e.name);
      });
      trackCache.set(id, list);
      trackNames.set(id, list.map((e) => e.name));
      onReady && onReady(album, list);
    }
  });

  return Promise.allSettled(jobs).then(() => trackCache);
}
