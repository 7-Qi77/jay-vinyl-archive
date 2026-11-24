(() => {
const kitRoot = {};
// kit.js: the painter these components are made with, as one file with no dependencies.
//
//   const k = PixelKit({ w: 96, h: 40, palette: ['#04050a', ...] });   // spread (default 10) is how far the dither reaches; lower it if flat areas speckle
//   k.begin();                                   // clear the smooth canvas and draw on it
//   const L = k.layer(() => k.ell(20, 20, 8, 8, '#f0c49c'));   // paint something in its own colours
//   k.lit(L, { amb: 'rgb(60,64,110)', lights: [[70, 10, 80, '255,180,100', 1]] });   // multiply it by the light
//   k.g.drawImage(L, 0, 0); k.release(L);
//   const art = k.crush();                       // every pixel to the nearest palette colour, with a 4 x 4 ordered dither
//
// The rules that go with it are in SKILL.md. The short version: paint smooth, light it, crush it, and look at the result before you believe it.
(function (root) {
'use strict';
function PixelKit(opts) {
  const W = opts.w, H = opts.h, PAL = opts.palette, SPREAD = opts.spread ?? 10;
  const mk = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });
  const soft = mk(W, H), sctx = soft.getContext('2d', { willReadFrequently: true });
  let g = sctx;

  // ───────── noise and small maths ─────────
  function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function hash(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function vnoise(x, y) { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), l = (a, b, t) => a + (b - a) * t; return l(l(hash(xi, yi), hash(xi + 1, yi), sx), l(hash(xi, yi + 1), hash(xi + 1, yi + 1), sx), sy); }
  const fbm = (x, y) => 0.55 * vnoise(x, y) + 0.3 * vnoise(x * 2.1, y * 2.1 + 7) + 0.15 * vnoise(x * 4.3, y * 4.3 + 19);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v), mix = (a, b, t) => a + (b - a) * t, smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  // ───────── drawing, on whichever canvas is current ─────────
  const POOL = [];
  function scratch() { const c = POOL.pop() || mk(W, H), x = c.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.filter = 'none'; x.clearRect(0, 0, W, H); return c; }
  const release = (...cs) => { for (const c of cs) if (c) POOL.push(c); };
  // paint onto a spare canvas and get it back; give it to release() when you have drawn it
  function layer(draw) { const L = scratch(), prev = g; g = L.getContext('2d'); g.save(); draw(); g.restore(); g = prev; return L; }
  // draw with these helpers on a canvas of your own
  function on(ctx, draw) { const prev = g; g = ctx; g.save(); draw(); g.restore(); g = prev; }
  function begin() { g = sctx; g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, W, H); }
  const rc = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  function glow(x, y, r, rgb, a) { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(1, `rgba(${rgb},0)`); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
  const lin = (x0, y0, x1, y1, ...st) => { const gr = g.createLinearGradient(x0, y0, x1, y1); st.forEach((c, i) => gr.addColorStop(i / (st.length - 1), c)); return gr; };
  const rad = (x, y, r, ...st) => { const gr = g.createRadialGradient(x, y, 0.5, x, y, r); st.forEach((c, i) => gr.addColorStop(i / (st.length - 1), c)); return gr; };
  const ell = (x, y, rx, ry, c, a0 = 0, a1 = 7, rot = 0) => { g.fillStyle = c; g.beginPath(); g.ellipse(x, y, rx, ry, rot, a0, a1); g.fill(); };
  const fillP = (c, fn) => { g.fillStyle = c; g.beginPath(); fn(g); g.fill(); };
  const strokeP = (c, w, fn) => { g.strokeStyle = c; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); fn(g); g.stroke(); };
  const poly = (pts, c) => fillP(c, (k) => pts.forEach(([x, y], i) => (i ? k.lineTo(x, y) : k.moveTo(x, y))));
  function limb(ax, ay, ra, bx, by, rb, col) {   // a tapered capsule: thick at one joint, thinner at the next
    const a = Math.atan2(by - ay, bx - ax), nx = -Math.sin(a), ny = Math.cos(a), q = Math.PI / 2;
    fillP(col, (k) => { k.moveTo(ax + nx * ra, ay + ny * ra); k.lineTo(bx + nx * rb, by + ny * rb); k.arc(bx, by, rb, a + q, a - q, true); k.lineTo(ax - nx * ra, ay - ny * ra); k.arc(ax, ay, ra, a - q, a + q, true); });
  }
  // An arm or a leg: two bones of fixed length from S toward T, so however far it reaches it stays a limb.
  // Returns [elbow, hand]. The hand stops short if T is out of reach. bend is +1 or -1 for which way the joint folds.
  function reach(S, T, U, F, bend = 1) {
    let dx = T[0] - S[0], dy = T[1] - S[1], d = Math.hypot(dx, dy) || 1; const m = U + F - 0.4, lo = Math.abs(U - F) + 0.4, k = d > m ? m / d : d < lo ? lo / d : 1; dx *= k; dy *= k; d *= k;
    const e = Math.atan2(dy, dx) + bend * Math.acos(clamp((U * U + d * d - F * F) / (2 * U * d), -1, 1));
    return [[S[0] + U * Math.cos(e), S[1] + U * Math.sin(e)], [S[0] + dx, S[1] + dy]];
  }

  // ───────── light ─────────
  // Paint each thing in its own colours on its own layer, then multiply it by the light:
  // S = { amb: 'rgb(...)', lights: [[x, y, radius, 'r,g,b', strength], ...] }. Things that glow are drawn after, straight onto k.g.
  function lit(L, S) {
    const k = L.getContext('2d'), M = scratch(), m = M.getContext('2d');
    m.fillStyle = S.amb; m.fillRect(0, 0, W, H); m.globalCompositeOperation = 'lighter';
    for (const [x, y, r, rgb, a] of S.lights) {
      const s = Math.min(1, a), gr = m.createRadialGradient(x, y, 2, x, y, r); gr.addColorStop(0, `rgba(${rgb},${s})`); gr.addColorStop(0.42, `rgba(${rgb},${s * 0.5})`); gr.addColorStop(1, `rgba(${rgb},0)`);
      m.fillStyle = gr; m.fillRect(0, 0, W, H);
    }
    m.globalCompositeOperation = 'destination-in'; m.drawImage(L, 0, 0);
    k.globalCompositeOperation = 'multiply'; k.drawImage(M, 0, 0); k.globalCompositeOperation = 'source-over'; release(M);
    return L;
  }
  // A strip of light along one side of everything on a layer. dx, dy say how far to shave off the far side, so the strip is left on the side
  // facing (-dx, -dy): rim(L, -1.2, 0, ...) lights right-hand edges, rim(L, 0, 1.2, ...) lights top edges. x, y, r place a falloff, so the rim
  // fades away from the lamp; rgb is 'r,g,b' and a is its strength from 0 to 1. Pass another layer as occ to leave out edges that sit on top of it.
  // Call it after lit(), and use a colour brighter than the surface or you will not see it.
  function rim(L, dx, dy, x, y, r, rgb, a, occ) {
    if (a <= 0) return;
    const k = L.getContext('2d'), R = scratch(), q = R.getContext('2d');
    q.drawImage(L, 0, 0); q.globalCompositeOperation = 'source-in';
    const gr = q.createRadialGradient(x, y, 2, x, y, r); gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(0.5, `rgba(${rgb},${a * 0.6})`); gr.addColorStop(1, `rgba(${rgb},0)`);
    q.fillStyle = gr; q.fillRect(0, 0, W, H); q.globalCompositeOperation = 'destination-out'; q.drawImage(L, dx, dy); if (occ) q.drawImage(occ, 0, 0);
    k.globalCompositeOperation = 'source-atop'; k.drawImage(R, 0, 0); k.globalCompositeOperation = 'source-over'; release(R);
  }
  // the soft dark shape a layer throws on whatever is behind it; draw it before the layer
  function shadow(L, dx, dy, blur, a) {
    const Sd = scratch(), s = Sd.getContext('2d'); s.filter = `blur(${blur}px)`; s.drawImage(L, dx, dy); s.filter = 'none'; s.globalCompositeOperation = 'source-in'; s.fillStyle = '#03030a'; s.fillRect(0, 0, W, H);
    g.save(); g.globalAlpha = a; g.drawImage(Sd, 0, 0); g.restore(); release(Sd);
  }

  // ───────── crush ─────────
  const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const RGB = PAL.map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
  const PAL32 = new Uint32Array(RGB.map((c) => (255 << 24) | (c[2] << 16) | (c[1] << 8) | c[0])), LUT = new Uint8Array(32768);
  for (let r = 0; r < 32; r++) for (let gg = 0; gg < 32; gg++) for (let b = 0; b < 32; b++) {
    let best = 0, bd = 1e9; const R = r * 8 + 4, G = gg * 8 + 4, Bv = b * 8 + 4;
    for (let q = 0; q < RGB.length; q++) { const c = RGB[q], e = 2 * (R - c[0]) ** 2 + 4 * (G - c[1]) ** 2 + 3 * (Bv - c[2]) ** 2; if (e < bd) { bd = e; best = q; } }
    LUT[(r << 10) | (gg << 5) | b] = best;
  }
  const art = mk(W, H), actx = art.getContext('2d'), artImg = actx.createImageData(W, H), art32 = new Uint32Array(artImg.data.buffer);
  // The smooth canvas, snapped to the palette. Returns the art canvas. Anything drawn after this with rc() and ptext() stays exact.
  function crush() {
    const d = sctx.getImageData(0, 0, W, H).data;
    for (let y = 0, i = 0, j = 0; y < H; y++) for (let x = 0; x < W; x++, i += 4, j++) {
      const nz = ((B4[(y & 3) * 4 + (x & 3)] + 0.5) / 16 - 0.5) * SPREAD;
      let r = d[i] + nz, gg = d[i + 1] + nz, b = d[i + 2] + nz;
      r = r < 0 ? 0 : r > 255 ? 255 : r; gg = gg < 0 ? 0 : gg > 255 ? 255 : gg; b = b < 0 ? 0 : b > 255 ? 255 : b;
      art32[j] = PAL32[LUT[((r >> 3) << 10) | ((gg >> 3) << 5) | (b >> 3)]];
    }
    actx.putImageData(artImg, 0, 0);
    return art;
  }
  // a 4 x 4 threshold for hand-placed dither: bayer(x, y) < t is true for a fraction t of pixels, in a fixed pattern
  const bayer = (x, y) => (B4[(y & 3) * 4 + (x & 3)] + 0.5) / 16;

  // ───────── lettering, in the same pixels as the art ─────────
  const FONT = {   // 5 x 7, caps only
    A: '.###. #...# #...# ##### #...# #...# #...#', B: '####. #...# #...# ####. #...# #...# ####.', C: '.###. #...# #.... #.... #.... #...# .###.', D: '####. #...# #...# #...# #...# #...# ####.',
    E: '##### #.... #.... ####. #.... #.... #####', F: '##### #.... #.... ####. #.... #.... #....', G: '.###. #...# #.... #.### #...# #...# .###.', H: '#...# #...# #...# ##### #...# #...# #...#',
    I: '### .#. .#. .#. .#. .#. ###', J: '..### ...#. ...#. ...#. ...#. #..#. .##..', K: '#...# #..#. #.#.. ##... #.#.. #..#. #...#', L: '#.... #.... #.... #.... #.... #.... #####',
    M: '#...# ##.## #.#.# #.#.# #...# #...# #...#', N: '#...# ##..# #.#.# #..## #...# #...# #...#', O: '.###. #...# #...# #...# #...# #...# .###.', P: '####. #...# #...# ####. #.... #.... #....',
    Q: '.###. #...# #...# #...# #.#.# #..#. .##.#', R: '####. #...# #...# ####. #.#.. #..#. #...#', S: '.#### #.... #.... .###. ....# ....# ####.', T: '##### ..#.. ..#.. ..#.. ..#.. ..#.. ..#..',
    U: '#...# #...# #...# #...# #...# #...# .###.', V: '#...# #...# #...# #...# #...# .#.#. ..#..', W: '#...# #...# #...# #.#.# #.#.# ##.## #...#', X: '#...# #...# .#.#. ..#.. .#.#. #...# #...#',
    Y: '#...# #...# .#.#. ..#.. ..#.. ..#.. ..#..', Z: '##### ....# ...#. ..#.. .#... #.... #####', 0: '.###. #...# #..## #.#.# ##..# #...# .###.', 1: '.#. ##. .#. .#. .#. .#. ###',
    2: '.###. #...# ....# ...#. ..#.. .#... #####', 3: '####. ....# ....# .###. ....# ....# ####.', 4: '...#. ..##. .#.#. #..#. ##### ...#. ...#.', 5: '##### #.... ####. ....# ....# #...# .###.',
    6: '.###. #.... #.... ####. #...# #...# .###.', 7: '##### ....# ...#. ..#.. ..#.. ..#.. ..#..', 8: '.###. #...# #...# .###. #...# #...# .###.', 9: '.###. #...# #...# .#### ....# ....# .###.',
    '.': '. . . . . . #', "'": '# # . . . . .', '"': '#.# #.# ... ... ... ... ...', '-': '.... .... .... #### .... .... ....',
    '?': '.###. #...# ....# ...#. ..#.. ..... ..#..', '!': '# # # # # . #', ' ': '... ... ... ... ... ... ...',
  };
  for (const k in FONT) FONT[k] = FONT[k].split(' ');
  const glyphs = (str) => [...str.toUpperCase().replace(/[“”]/g, '"').replace(/’/g, "'")].map((ch) => FONT[ch] || FONT[' ']);
  function ptext(str, x, y, c, bold) { for (const gl of glyphs(str)) { for (let r = 0; r < 7; r++) for (let q = 0; q < gl[r].length; q++) if (gl[r][q] === '#') rc(x + q, y + r, bold ? 2 : 1, 1, c); x += gl[0].length + (bold ? 2 : 1); } }
  const ptextW = (str, bold) => glyphs(str).reduce((a, gl) => a + gl[0].length + (bold ? 2 : 1), -1);
  function ptext2(str, x, y, splitX, cA, cB, w, h) {
    g.save(); g.beginPath(); g.rect(0, 0, splitX, h); g.clip(); ptext(str, x, y, cA, 1); g.restore();
    g.save(); g.beginPath(); g.rect(splitX, 0, w, h); g.clip(); ptext(str, x, y, cB, 1); g.restore();
  }
  Object.assign(FONT, { ':': '. . # . # . .'.split(' '), '/': '..# ..# .#. .#. .#. #.. #..'.split(' '), '_': '.... .... .... .... .... .... ####'.split(' '), ',': '.. .. .. .. .. .# #.'.split(' '), '%': '#..# ...# ..#. ..#. .#.. #... #..#'.split(' ') });

  // ───────── a clock you can stop ─────────
  // run(frame) calls frame(dt) every animation frame. With ?film=1 in the address it does not: it exposes window.__film
  // so a script can step the same frames one at a time, which is how you look at an animation properly.
  function run(frame, duration = 10) {
    const q = new URLSearchParams(location.search);
    if (q.get('film') === '1') {
      let t = 0; const step = (fps = 60) => { t += 1 / fps; frame(1 / fps); };
      root.__film = { duration, step, seek(to, fps = 60) { while (t < to) step(fps); } };
      root.__film.seek(parseFloat(q.get('seek')) || 1 / 60);
    } else { let last = performance.now(); const loop = (now) => { frame(Math.min(0.05, (now - last) / 1000)); last = now; requestAnimationFrame(loop); }; requestAnimationFrame(loop); }
  }
  // put the art on a visible canvas at a whole number of screen pixels per art pixel
  function show(canvas, src = art, scale = 3) { if (canvas.width !== src.width * scale) { canvas.width = src.width * scale; canvas.height = src.height * scale; } const v = canvas.getContext('2d'); v.imageSmoothingEnabled = false; v.clearRect(0, 0, canvas.width, canvas.height); v.drawImage(src, 0, 0, canvas.width, canvas.height); }

  return {
    w: W, h: H, get g() { return g; }, soft, art, actx,
    mulberry, hash, vnoise, fbm, clamp, mix, smooth,
    begin, layer, on, release, rc, glow, lin, rad, ell, fillP, strokeP, poly, limb, reach,
    lit, rim, shadow, crush, bayer, ptext, ptextW, ptext2, run, show,
  };
}
root.PixelKit = PixelKit;
})(kitRoot);

// ── pixel-room：沉浸模式背景 · 夜里的听音室 ─────────────────
// 一个数（播放进度）驱动唱盘旋转/唱臂/百分比；playing 驱动灯与猫；环境（雨/尘/尾）走时钟。
const PixelKit = kitRoot.PixelKit;
const RW = 192, RH = 108;
const PAL = [
  '#05060c', '#0b0e1a', '#141a2c', '#1e2740', '#2a3552', '#3a4a6e', '#54688c', '#8fa3c4', '#dfe8f4',
  '#24160c', '#4a2c12', '#6b421c', '#8a5a28', '#b07c3a', '#d4a02c',
  '#f0ca4a', '#fbe88a', '#fffbd4', '#7c1e12', '#e0641e',
];
const hexRgb = (h) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(h || '');
  if (!m) return '255,190,110';
  const v = parseInt(m[1], 16);
  return `${(v >> 16) & 255},${(v >> 8) & 255},${v & 255}`;
};

const LIVE = new Set();
class PixelRoom extends HTMLElement {
  constructor() {
    super();
    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('aria-hidden', 'true');
    this.appendChild(this.canvas);
    this.st = { progress: 0, playing: false, accent: '#c9a86a', spines: [], active: 0, titleEn: 'JAY CHOU' };
    this.time = 0;
    this.k = PixelKit({ w: RW, h: RH, palette: PAL, spread: 8 });
    this.bake();
    this._resize = () => this.resize();
  }
  connectedCallback() {
    LIVE.add(this);
    window.addEventListener('resize', this._resize);
    this.resize();
  }
  disconnectedCallback() {
    LIVE.delete(this);
    window.removeEventListener('resize', this._resize);
  }
  setRoom(o) { Object.assign(this.st, o || {}); }
  resize() {
    const r = this.getBoundingClientRect();
    const scale = Math.max(1, Math.ceil(Math.max((r.width || innerWidth) / RW, (r.height || innerHeight) / RH)));
    this.canvas.width = RW * scale;
    this.canvas.height = RH * scale;
    this.scale = scale;
  }
  bake() {
    const k = this.k;
    this.room = document.createElement('canvas');
    this.room.width = RW; this.room.height = RH;
    k.on(this.room.getContext('2d'), () => {
      const g = k.g;
      g.fillStyle = '#1a2136'; g.fillRect(0, 0, RW, RH);
      for (let y = 6; y < 78; y += 9) { k.rc(0, y, RW, 1, '#0b0e1a'); for (let x = (y & 9 ? 10 : 0) + 6; x < RW; x += 22) k.rc(x, y - 8, 1, 8, '#0b0e1a'); }
      k.rc(0, 78, RW, 2, '#24160c');
      g.fillStyle = '#24160c'; g.fillRect(0, 92, RW, 16);
      for (let x = 0; x < RW; x += 26) k.rc(x, 92, 1, 16, '#0b0e1a');
      k.rc(0, 92, RW, 1, '#4a2c12');
      // 窗
      k.rc(130, 8, 48, 40, '#24160c');
      k.rc(133, 11, 42, 34, '#05060c');
      k.rc(153, 11, 2, 34, '#24160c');
      k.rc(133, 27, 42, 2, '#24160c');
      // 城市剪影
      k.rc(134, 36, 8, 9, '#0b0e1a'); k.rc(144, 32, 6, 13, '#0b0e1a'); k.rc(158, 38, 9, 7, '#0b0e1a'); k.rc(169, 34, 5, 11, '#0b0e1a');
      // 唱片架板
      k.rc(6, 20, 60, 3, '#6b421c'); k.rc(6, 23, 60, 1, '#24160c');
      // 唱机木座
      k.rc(62, 70, 68, 22, '#4a2c12'); k.rc(62, 70, 68, 2, '#8a5a28'); k.rc(62, 90, 68, 2, '#24160c');
      // 灯罩
      k.poly([[14, 26], [26, 26], [23, 32], [17, 32]], '#8a5a28');
      k.rc(19, 20, 2, 6, '#6b421c');
    });
  }
  advance(dt) {
    if (this.closest('[hidden]')) return;
    const k = this.k, st = this.st;
    const slow = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.4 : 1;
    this.time += dt * slow;
    const t = this.time;
    const flick = 0.86 + 0.14 * k.vnoise(t * 8, 3);
    const lampA = (st.playing ? 0.95 : 0.5) * flick;
    const acc = hexRgb(st.accent);
    k.begin();
    const S = {
      amb: 'rgb(52,58,88)',
      lights: [
        [20, 34, 96, '255,190,110', lampA],
        [96, 70, 54, '255,190,110', st.playing ? 0.55 : 0.3],
        [160, 20, 56, '150,180,220', 0.6],
        [96, 74, 26, acc, st.playing ? 0.6 : 0.3],
      ],
    };
    const wall = k.lit(k.layer(() => k.g.drawImage(this.room, 0, 0)), S);
    k.g.drawImage(wall, 0, 0);
    // 猫（剪影层，受光）
    const tail = Math.round(Math.sin(t * 1.7) * 3);
    const cat = k.layer(() => {
      k.ell(158, 98, 9, 5, '#05060c');
      k.ell(166, 93, 4, 4, '#05060c');
      k.poly([[163, 90], [164, 86], [166, 90]], '#05060c');
      k.poly([[167, 90], [169, 86], [170, 90]], '#05060c');
      k.strokeP('#05060c', 2, (c) => { c.moveTo(150, 98); c.quadraticCurveTo(146, 96 + tail, 147, 90 + tail); });
    });
    k.lit(cat, S); k.g.drawImage(cat, 0, 0);
    k.release(wall, cat);
    const art = k.crush();
    // 精确像素：唱片脊 / 沟槽 / 标签 / 唱臂 / 雨 / 月 / 猫眼 / 尘 / 字
    k.on(k.actx, () => {
      const sp = st.spines || [];
      for (let i = 0; i < 15; i++) {
        const c = sp[i] || '#3a4a6e';
        k.rc(8 + i * 4, 6, 3, 14, c);
        if (i === st.active) { k.rc(8 + i * 4, 6, 3, 1, '#fbe88a'); k.rc(8 + i * 4, 19, 3, 1, '#fbe88a'); }
      }
      // 唱盘
      k.ell(96, 74, 29, 8, '#0b0e1a');
      k.ell(96, 74, 27, 7, '#05060c');
      k.strokeP('#1e2740', 1, (c) => { c.ellipse(96, 74, 22, 5.6, 0, 0, 7); });
      k.strokeP('#1e2740', 1, (c) => { c.ellipse(96, 74, 16, 4.1, 0, 0, 7); });
      k.ell(96, 74, 8, 2.6, st.accent);
      const ang = st.progress * Math.PI * 2 * 6;
      k.rc(Math.round(96 + Math.cos(ang) * 6), Math.round(74 + Math.sin(ang) * 1.8), 1, 1, '#fffbd4');
      k.rc(96, 73, 1, 2, '#b07c3a');
      // 唱臂：外圈→内圈
      const r = 24 - st.progress * 14;
      const ax = Math.round(96 + Math.cos(-0.5) * r), ay = Math.round(74 + Math.sin(-0.5) * r * 0.28);
      k.strokeP('#b07c3a', 1, (c) => { c.moveTo(126, 62); c.lineTo(ax, ay); });
      k.rc(125, 60, 3, 3, '#8a5a28');
      // 月与雨
      k.ell(161, 19, 4, 4, '#dfe8f4');
      k.ell(159, 18, 3, 3, '#05060c');
      for (let i = 0; i < 10; i++) {
        const rx = 134 + ((i * 17 + Math.floor(t * 26)) % 40);
        const ry = 12 + ((i * 11 + Math.floor(t * 34)) % 32);
        k.rc(rx, ry, 1, 3, '#54688c');
      }
      for (let i = 0; i < 5; i++) if ((i * 7 + Math.floor(t * 2)) % 3 === 0) k.rc(136 + i * 8, 39 + (i % 3), 1, 1, '#f0ca4a');
      // 猫眼 / 灯芯 / 尘
      if (st.playing || Math.floor(t * 0.7) % 4 !== 0) { k.rc(165, 92, 1, 1, '#f0ca4a'); k.rc(168, 92, 1, 1, '#f0ca4a'); }
      k.rc(19, 32, 2, 2, '#fffbd4');
      for (let i = 0; i < 6; i++) {
        const dx = 16 + ((i * 13 + Math.floor(t * 5)) % 26);
        const dy = 36 + ((i * 9 + Math.floor(t * 3)) % 30);
        k.rc(dx, dy, 1, 1, i % 2 ? '#fbe88a' : '#8fa3c4');
      }
      const title = (st.titleEn || '').slice(0, 26);
      const pct = `${Math.round(st.progress * 100)}%`;
      k.ptext(title, 8, 99, '#8fa3c4');
      k.ptext(pct, 172 - k.ptextW(pct), 99, st.playing ? '#fbe88a' : '#54688c');
    });
    const v = this.canvas.getContext('2d');
    v.imageSmoothingEnabled = false;
    v.clearRect(0, 0, this.canvas.width, this.canvas.height);
    v.drawImage(art, 0, 0, this.canvas.width, this.canvas.height);
  }
}
customElements.define('pixel-room', PixelRoom);
let last = performance.now();
requestAnimationFrame(function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!PixelRoom.paused) for (const el of LIVE) el.advance(dt);
  requestAnimationFrame(loop);
});
})();
