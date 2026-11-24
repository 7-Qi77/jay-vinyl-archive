/**
 * 用户导入歌词的持久化存储：IndexedDB 为主、localStorage 双写兜底。
 * 键与业务一致（`${专辑号}-${曲目索引}`），向 app.js 提供同步读（内存 Map）。
 */
const DB_NAME = 'jc-vinyl-lyrics';
const STORE = 'lyrics';
const LS_PREFIX = 'jc-lyric-';

const mem = new Map(); // `${n}-${t}` -> { text, timed }
let readyPromise = null;
let db = null;

const keyOf = (n, t) => `${n}-${t}`;

function withDB(mode, fn) {
  return new Promise((resolve) => {
    if (!db) return resolve(null);
    let st = null;
    try {
      st = db.transaction(STORE, mode).objectStore(STORE);
    } catch {
      return resolve(null);
    }
    let req = null;
    try {
      req = fn(st);
    } catch {
      return resolve(null);
    }
    if (!req) return resolve(null);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

const lsRead = (key) => {
  try {
    return localStorage.getItem(LS_PREFIX + key);
  } catch {
    return null;
  }
};
const lsWrite = (key, v) => {
  try {
    localStorage.setItem(LS_PREFIX + key, v);
    return true;
  } catch {
    return false;
  }
};
const lsRemove = (key) => {
  try {
    localStorage.removeItem(LS_PREFIX + key);
  } catch {
    /* 忽略 */
  }
};

function parseEntry(raw) {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj === 'object' && typeof obj.text === 'string') {
      return { text: obj.text, timed: Array.isArray(obj.timed) ? obj.timed : [] };
    }
  } catch {
    /* 旧版纯文本 */
  }
  return { text: String(raw), timed: [] };
}

function putEntry(key, value) {
  mem.set(key, value);
  const raw = JSON.stringify(value);
  withDB('readwrite', (st) => st.put(raw, key));
  lsWrite(key, raw);
}

function deleteEntry(key) {
  mem.delete(key);
  withDB('readwrite', (st) => st.delete(key));
  lsRemove(key);
}

function openDB() {
  return new Promise((resolve) => {
    if (!('indexedDB' in window)) return resolve(null);
    let req;
    try {
      req = indexedDB.open(DB_NAME, 1);
    } catch {
      return resolve(null);
    }
    req.onupgradeneeded = () => {
      try {
        req.result.createObjectStore(STORE);
      } catch {
        /* 已存在 */
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
}

export function initLyricStore() {
  if (readyPromise) return readyPromise;
  readyPromise = (async () => {
    db = await openDB();

    // IndexedDB 载入
    if (db) {
      const keys = await withDB('readonly', (st) => st.getAllKeys());
      const values = await withDB('readonly', (st) => st.getAll());
      if (Array.isArray(keys) && Array.isArray(values)) {
        keys.forEach((k, i) => {
          const e = parseEntry(values[i]);
          if (e && e.text) mem.set(k, e);
        });
      }
    }

    // localStorage 旧数据兜底载入（同一键格式，天然兼容）
    const legacy = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(LS_PREFIX)) legacy.push(k.slice(LS_PREFIX.length));
    }
    for (const key of legacy) {
      if (mem.has(key)) continue;
      const e = parseEntry(lsRead(key));
      if (e && e.text) {
        mem.set(key, e);
        withDB('readwrite', (st) => st.put(JSON.stringify(e), key));
      }
    }
  })();
  return readyPromise;
}

export function readLyricData(n, t) {
  const v = mem.get(keyOf(n, t));
  return v ? { text: v.text, timed: v.timed || [] } : { text: '', timed: [] };
}

export function readLyric(n, t) {
  return readLyricData(n, t).text;
}

export function writeLyric(n, t, data) {
  const payload = typeof data === 'string' ? { text: data, timed: [] } : data;
  const text = String((payload && payload.text) || '').trim();
  if (!text) {
    deleteEntry(keyOf(n, t));
    return true;
  }
  putEntry(keyOf(n, t), { text, timed: Array.isArray(payload && payload.timed) ? payload.timed : [] });
  return true;
}

export function removeLyric(n, t) {
  deleteEntry(keyOf(n, t));
}

/** 曲目表扩展后，把旧索引上的歌词搬到新索引（按曲名对位） */
export function migrateLyricIndices(n, oldTracks, newTracks) {
  oldTracks.forEach((title, i) => {
    const j = newTracks.indexOf(title);
    if (j < 0 || j === i) return;
    const from = keyOf(n, i);
    const entry = mem.get(from);
    if (!entry) return;
    const to = keyOf(n, j);
    deleteEntry(from);
    putEntry(to, entry);
  });
}
