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
      const title = (st.titleEn || '').slice(0, 18);
      k.ptext(title, 8, 99, '#8fa3c4');
      k.ptext(`${Math.round(st.progress * 100)}%`, 168, 99, st.playing ? '#fbe88a' : '#54688c');
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