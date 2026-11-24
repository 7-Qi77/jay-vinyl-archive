import * as THREE from 'three';
import { RoundedBoxGeometry } from '../assets/vendor/RoundedBoxGeometry.js';

const TAU = Math.PI * 2;
const SRGB = THREE.SRGBColorSpace;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutQuint = (t) => 1 - Math.pow(1 - t, 5);
const easeOutSoftBack = (t) => {
  const c = 1.02;
  const c3 = c + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};

function canvas2d(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, g: c.getContext('2d') };
}

function makeWoodTexture(renderer) {
  const S = 512;
  const { c, g } = canvas2d(S, S);

  const base = g.createLinearGradient(0, 0, S, S);
  base.addColorStop(0, '#3a2416');
  base.addColorStop(0.4, '#24150d');
  base.addColorStop(0.72, '#312015');
  base.addColorStop(1, '#1a0f09');
  g.fillStyle = base;
  g.fillRect(0, 0, S, S);

  for (let i = 0; i < 240; i++) {
    const x = Math.random() * S;
    const width = Math.random() * 2.2 + 0.3;
    const alpha = Math.random() * 0.09 + 0.02;
    g.strokeStyle = Math.random() > 0.45 ? `rgba(12,6,3,${alpha})` : `rgba(220,170,115,${alpha * 0.5})`;
    g.lineWidth = width;
    g.beginPath();
    for (let y = 0; y <= S; y += 8) {
      const waves = Math.sin(y * 0.018 + i * 0.7) * 7 + Math.sin(y * 0.052 + i) * 2.2;
      if (y === 0) g.moveTo(x + waves, y);
      else g.lineTo(x + waves, y);
    }
    g.stroke();
  }

  for (let k = 0; k < 5; k++) {
    const cx = Math.random() * S;
    const cy = Math.random() * S;
    const rx = 4 + Math.random() * 16;
    const ry = 10 + Math.random() * 32;
    const grd = g.createRadialGradient(cx, cy, 1, cx, cy, rx * 1.8);
    grd.addColorStop(0, 'rgba(10,5,2,0.4)');
    grd.addColorStop(1, 'rgba(10,5,2,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.ellipse(cx, cy, rx * 1.8, ry, Math.random() * 0.4, 0, TAU);
    g.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = SRGB;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1.5, 1);
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

function makeBrushedTexture(renderer) {
  const S = 512;
  const { c, g } = canvas2d(S, S);
  g.fillStyle = '#c2ad88';
  g.fillRect(0, 0, S, S);

  for (let i = 0; i < 1600; i++) {
    const a = Math.random() * TAU;
    const r1 = Math.random() * S * 0.1;
    const r2 = S * 0.5;
    g.strokeStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
    g.lineWidth = Math.random() * 1.2;
    g.beginPath();
    g.moveTo(S / 2 + Math.cos(a) * r1, S / 2 + Math.sin(a) * r1);
    g.lineTo(S / 2 + Math.cos(a) * r2, S / 2 + Math.sin(a) * r2);
    g.stroke();
  }
  for (let r = 8; r < S * 0.5; r += 4) {
    g.strokeStyle = `rgba(60,48,30,${Math.random() * 0.05 + 0.02})`;
    g.lineWidth = 1;
    g.beginPath();
    g.arc(S / 2, S / 2, r, 0, TAU);
    g.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = SRGB;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

function makePlateTexture() {
  const W = 1024;
  const H = 160;
  const { c, g } = canvas2d(W, H);
  g.clearRect(0, 0, W, H);
  g.strokeStyle = 'rgba(214, 180, 126, 0.5)';
  g.lineWidth = 2;
  g.strokeRect(2, 2, W - 4, H - 4);
  g.textAlign = 'center';
  g.fillStyle = 'rgba(228, 197, 143, 0.9)';
  g.font = "600 46px 'Cormorant Garamond', Georgia, serif";
  g.letterSpacing = '10px';
  g.fillText('JAY CHOU', W / 2, 70);
  g.font = "400 20px Inter, sans-serif";
  g.letterSpacing = '9px';
  g.fillStyle = 'rgba(216, 184, 130, 0.62)';
  g.fillText('THE VINYL ARCHIVE', W / 2, 112);
  g.strokeStyle = 'rgba(214, 180, 126, 0.35)';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(W / 2 - 120, 130);
  g.lineTo(W / 2 + 120, 130);
  g.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = SRGB;
  tex.anisotropy = 8;
  return tex;
}

function makeShadowTexture() {
  const S = 512;
  const { c, g } = canvas2d(S, S);
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0, 'rgba(0,0,0,0.92)');
  grd.addColorStop(0.45, 'rgba(0,0,0,0.55)');
  grd.addColorStop(0.75, 'rgba(0,0,0,0.16)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(c);
}

/* ── 唱片伤痕：按专辑号做种，磨损度提升划痕密度与不透明度 ── */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeWearTexture(seed, wear) {
  const S = 1024;
  const { c, g } = canvas2d(S, S);
  const rnd = mulberry32(seed * 2654435761 + 7);
  const cx = S / 2;
  const cy = S / 2;
  const labelR = S * 0.305;
  const outerR = S * 0.495;

  // 发丝划痕：随机半径上的弧段（分段微抖动，避免完美圆弧的数字感），
  // 外缘与内圈引出槽附近更易受伤，故半径分带采样；亮暗两色
  const hairlines = Math.round(60 + wear * 90);
  for (let i = 0; i < hairlines; i++) {
    const a0 = rnd() * TAU;
    const span = 0.06 + rnd() * (0.3 + wear * 0.55);
    const band = rnd();
    const r = S * (band < 0.3 ? 0.42 + rnd() * 0.075 : band < 0.55 ? 0.315 + rnd() * 0.05 : 0.34 + rnd() * 0.14);
    const light = rnd() > 0.4;
    const alpha = light ? 0.09 + rnd() * (0.13 + wear * 0.16) : 0.08 + rnd() * (0.1 + wear * 0.14);
    g.strokeStyle = light ? `rgba(255,244,222,${alpha})` : `rgba(0,0,0,${alpha})`;
    g.lineWidth = 0.7 + rnd() * 1.5;
    const segs = 5 + Math.floor(rnd() * 6);
    g.beginPath();
    for (let s = 0; s <= segs; s++) {
      const a = a0 + (span * s) / segs;
      const rr = r + (rnd() - 0.5) * 2.4;
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr;
      if (s === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }

  // 深划痕：亮弧 + 紧贴其上的阴影线，读出立体凹槽感（每张 1-2 道，磨损后更多）
  const gouges = 1 + Math.floor(wear * 3 + rnd() * 1.7);
  for (let i = 0; i < gouges; i++) {
    const a0 = rnd() * TAU;
    const span = 0.18 + rnd() * 0.42;
    const r = S * (0.33 + rnd() * 0.15);
    const lw = 1.8 + rnd() * 1.6;
    g.strokeStyle = `rgba(255,246,226,${0.2 + rnd() * 0.18})`;
    g.lineWidth = lw;
    g.beginPath();
    g.arc(cx, cy, r, a0, a0 + span);
    g.stroke();
    g.strokeStyle = `rgba(0,0,0,${0.24 + rnd() * 0.2})`;
    g.lineWidth = lw * 0.7;
    g.beginPath();
    g.arc(cx, cy, r + lw * 0.85, a0 + 0.004, a0 + span - 0.004);
    g.stroke();
  }

  // 径向抽拉痕：取放唱片时被纸套边缘划过的直线痕
  const slides = Math.round(3 + wear * 5);
  for (let i = 0; i < slides; i++) {
    const a = rnd() * TAU;
    const r0 = labelR + rnd() * (outerR - labelR) * 0.5;
    const r1 = Math.min(outerR, r0 + S * (0.08 + rnd() * 0.12));
    const drift = (rnd() - 0.5) * 0.05;
    const tone = rnd() > 0.5 ? '255,244,222' : '0,0,0';
    g.strokeStyle = `rgba(${tone},${0.08 + rnd() * 0.12})`;
    g.lineWidth = 0.8 + rnd() * 0.9;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    g.lineTo(cx + Math.cos(a + drift) * r1, cy + Math.sin(a + drift) * r1);
    g.stroke();
  }

  // 软性擦痕斑：低频径向渐变
  const scuffs = Math.round(2 + wear * 5);
  for (let i = 0; i < scuffs; i++) {
    const a = rnd() * TAU;
    const r = S * (0.32 + rnd() * 0.17);
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    const rr = 26 + rnd() * 60;
    const grd = g.createRadialGradient(x, y, 1, x, y, rr);
    grd.addColorStop(0, `rgba(255,240,214,${0.07 + rnd() * 0.08})`);
    grd.addColorStop(1, 'rgba(255,240,214,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(x, y, rr, 0, TAU);
    g.fill();
  }

  // 指纹油渍：外缘附近的椭圆暖斑
  const prints = Math.round(rnd() * 1.6 + wear * 1.5);
  for (let i = 0; i < prints; i++) {
    const a = rnd() * TAU;
    const r = S * (0.4 + rnd() * 0.085);
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    const rr = 20 + rnd() * 34;
    g.save();
    g.translate(x, y);
    g.rotate(rnd() * TAU);
    g.scale(1, 0.55 + rnd() * 0.35);
    const grd = g.createRadialGradient(0, 0, 2, 0, 0, rr);
    grd.addColorStop(0, `rgba(255,236,205,${0.06 + rnd() * 0.06})`);
    grd.addColorStop(1, 'rgba(255,236,205,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(0, 0, rr, 0, TAU);
    g.fill();
    g.restore();
  }

  // 微尘颗粒
  const specks = Math.round(170 + wear * 300);
  for (let i = 0; i < specks; i++) {
    const a = rnd() * TAU;
    const r = labelR + rnd() * (outerR - labelR);
    g.fillStyle = `rgba(255,240,214,${0.06 + rnd() * 0.12})`;
    g.fillRect(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 1.1, 1.1);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = SRGB;
  tex.anisotropy = 8;
  return tex;
}

function makeEnvTexture(renderer) {
  const W = 1024;
  const H = 512;
  const { c, g } = canvas2d(W, H);

  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#1a130d');
  grad.addColorStop(0.42, '#0a0806');
  grad.addColorStop(0.62, '#050403');
  grad.addColorStop(1, '#020202');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);

  const blob = (x, y, rx, ry, color) => {
    const grd = g.createRadialGradient(x, y, 1, x, y, Math.max(rx, ry));
    grd.addColorStop(0, color);
    grd.addColorStop(0.5, color.replace(/[\d.]+\)$/, '0.18)'));
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.save();
    g.translate(x, y);
    g.scale(1, ry / rx);
    g.translate(-x, -y);
    g.fillStyle = grd;
    g.beginPath();
    g.arc(x, y, rx, 0, TAU);
    g.fill();
    g.restore();
  };

  blob(250, 150, 250, 110, 'rgba(255,208,150,0.85)');
  blob(700, 190, 170, 70, 'rgba(255,186,120,0.55)');
  blob(520, 90, 320, 90, 'rgba(140,168,200,0.25)');
  blob(900, 300, 120, 60, 'rgba(255,220,170,0.25)');

  // 一条柔和的灯带
  const strip = g.createLinearGradient(0, 230, 0, 300);
  strip.addColorStop(0, 'rgba(255,225,180,0)');
  strip.addColorStop(0.5, 'rgba(255,225,180,0.55)');
  strip.addColorStop(1, 'rgba(255,225,180,0)');
  g.fillStyle = strip;
  g.fillRect(0, 230, W, 70);

  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = SRGB;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(tex).texture;
  pmrem.dispose();
  tex.dispose();
  return env;
}

function makeGrooveBump(trackCount = 4) {
  const S = 1024;
  const { c, g } = canvas2d(S, S);
  g.fillStyle = '#000';
  g.fillRect(0, 0, S, S);
  const cx = S / 2;
  const cy = S / 2;

  // 细密沟槽（避开引入槽 / 导出槽）
  for (let r = S * 0.33; r < S * 0.49; r += 1.7) {
    const v = 70 + Math.sin(r * 0.6) * 40 + Math.random() * 18;
    g.strokeStyle = `rgb(${v},${v},${v})`;
    g.lineWidth = 1;
    g.beginPath();
    g.arc(cx, cy, r, 0, TAU);
    g.stroke();
  }
  // 曲目之间的分轨宽槽
  const bands = grooveBandRadii(trackCount);
  for (const r of bands) {
    g.strokeStyle = 'rgba(0,0,0,0.85)';
    g.lineWidth = 4;
    g.beginPath();
    g.arc(cx, cy, r * S, 0, TAU);
    g.stroke();
  }
  // 导出槽 / 引入槽的平滑区
  g.strokeStyle = 'rgba(40,40,40,0.5)';
  g.lineWidth = 2;
  for (const r of [0.318, 0.324, 0.492, 0.496]) {
    g.beginPath();
    g.arc(cx, cy, r * S, 0, TAU);
    g.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 8;
  return tex;
}

/** 分轨半径（纹理归一化，0.5 = 唱片外缘），供沟槽纹理与反光着色器共用 */
function grooveBandRadii(trackCount = 4) {
  const n = Math.max(1, trackCount);
  const bands = [];
  for (let k = 1; k < n; k++) bands.push(0.33 + (0.16 * k) / n);
  return bands;
}

function fitFont(g, text, maxWidth, size, family, weight, min = 12) {
  let s = size;
  do {
    g.font = `${weight} ${Math.round(s)}px ${family}`;
    if (g.measureText(text).width <= maxWidth) break;
    s -= 2;
  } while (s > min);
  return Math.round(s);
}

function makeLabelTexture(album, coverImage = null) {
  const S = 1024;
  const { c, g } = canvas2d(S, S);
  const cx = S / 2;
  const cy = S / 2;
  const pal = album.palette;

  g.fillStyle = '#080808';
  g.fillRect(0, 0, S, S);

  // 跑马槽 / 锁槽
  for (let r = S * 0.306; r < S * 0.316; r += 0.9) {
    g.strokeStyle = 'rgba(255,255,255,0.045)';
    g.lineWidth = 1;
    g.beginPath();
    g.arc(cx, cy, r, 0, TAU);
    g.stroke();
  }
  g.strokeStyle = 'rgba(0,0,0,0.7)';
  g.lineWidth = 2;
  g.beginPath();
  g.arc(cx, cy, S * 0.312, 0, TAU);
  g.stroke();

  // 沟槽
  for (let r = S * 0.33; r < S * 0.49; r += 1.6) {
    const alpha = 0.012 + Math.abs(Math.sin(r * 1.9)) * 0.02;
    g.strokeStyle = `rgba(255,255,255,${alpha})`;
    g.lineWidth = 1;
    g.beginPath();
    g.arc(cx, cy, r, 0, TAU);
    g.stroke();
  }
  // 分轨宽槽（与 bump / 反光着色器一致）
  for (const br of grooveBandRadii(album.tracks?.length || 4)) {
    g.strokeStyle = 'rgba(0,0,0,0.55)';
    g.lineWidth = 4;
    g.beginPath();
    g.arc(cx, cy, br * S, 0, TAU);
    g.stroke();
  }

  // 斜向柔光（弱化：动态各向异性反光由 sheen 着色器负责）
  g.save();
  g.beginPath();
  g.arc(cx, cy, S * 0.499, 0, TAU);
  g.clip();

  const sheen = g.createLinearGradient(S * 0.04, S * 0.14, S * 0.96, S * 0.88);
  sheen.addColorStop(0, 'rgba(255,248,232,0)');
  sheen.addColorStop(0.3, 'rgba(255,244,220,0.02)');
  sheen.addColorStop(0.44, 'rgba(255,248,232,0.055)');
  sheen.addColorStop(0.56, 'rgba(255,244,220,0.012)');
  sheen.addColorStop(0.73, 'rgba(255,248,232,0.04)');
  sheen.addColorStop(0.86, 'rgba(255,244,220,0.008)');
  sheen.addColorStop(1, 'rgba(255,248,232,0)');
  g.fillStyle = sheen;
  g.fillRect(0, 0, S, S);

  // 细微的径向划痕
  for (let i = 0; i < 46; i++) {
    const a = Math.random() * TAU;
    const r1 = S * (0.33 + Math.random() * 0.12);
    const r2 = r1 + S * (0.04 + Math.random() * 0.1);
    g.strokeStyle = `rgba(255,255,255,${0.012 + Math.random() * 0.03})`;
    g.lineWidth = Math.random() * 1.1;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    g.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
    g.stroke();
  }
  g.restore();

  // 外缘高光，让唱片边界从深色绒垫上浮出来
  g.strokeStyle = 'rgba(255,246,228,0.26)';
  g.lineWidth = 2.5;
  g.beginPath();
  g.arc(cx, cy, S * 0.496, 0, TAU);
  g.stroke();
  g.strokeStyle = 'rgba(255,246,228,0.06)';
  g.lineWidth = 8;
  g.beginPath();
  g.arc(cx, cy, S * 0.487, 0, TAU);
  g.stroke();

  // 中心标签
  const R = S * 0.305;
  const serif = "'Noto Serif SC', 'Songti SC', serif";
  const sans = 'Inter, sans-serif';
  const display = "'Cormorant Garamond', Georgia, serif";

  if (coverImage) {
    const iw = coverImage.naturalWidth;
    const ih = coverImage.naturalHeight;
    const side = Math.min(iw, ih);
    const sx = (iw - side) / 2;
    const sy = (ih - side) / 2;

    g.save();
    g.beginPath();
    g.arc(cx, cy, R, 0, TAU);
    g.clip();
    g.filter = 'brightness(1.08) saturate(1.04)';
    g.drawImage(coverImage, sx, sy, side, side, cx - R, cy - R, R * 2, R * 2);
    g.filter = 'none';

    const topShade = g.createLinearGradient(0, cy - R, 0, cy - R * 0.5);
    topShade.addColorStop(0, 'rgba(0,0,0,0.64)');
    topShade.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = topShade;
    g.fillRect(cx - R, cy - R, R * 2, R * 0.6);

    const bottomShade = g.createLinearGradient(0, cy + R, 0, cy + R * 0.42);
    bottomShade.addColorStop(0, 'rgba(0,0,0,0.7)');
    bottomShade.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = bottomShade;
    g.fillRect(cx - R, cy + R * 0.42, R * 2, R * 0.58);

    const vig = g.createRadialGradient(cx, cy, R * 0.52, cx, cy, R);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.42)');
    g.fillStyle = vig;
    g.fillRect(cx - R, cy - R, R * 2, R * 2);
    g.restore();

    g.strokeStyle = 'rgba(8,6,4,0.55)';
    g.lineWidth = 5;
    g.beginPath();
    g.arc(cx, cy, R + 1, 0, TAU);
    g.stroke();
    g.strokeStyle = 'rgba(255,246,228,0.76)';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(cx, cy, R - 4, 0, TAU);
    g.stroke();
    g.strokeStyle = 'rgba(255,246,228,0.3)';
    g.lineWidth = 1;
    g.beginPath();
    g.arc(cx, cy, R - 12, 0, TAU);
    g.stroke();

    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * TAU;
      g.strokeStyle = `rgba(255,246,228,${i % 4 === 0 ? 0.24 : 0.09})`;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * (R + 10), cy + Math.sin(a) * (R + 10));
      g.lineTo(cx + Math.cos(a) * (R + 22), cy + Math.sin(a) * (R + 22));
      g.stroke();
    }

    g.textAlign = 'center';
    g.fillStyle = 'rgba(255,248,235,0.95)';
    g.shadowColor = 'rgba(0,0,0,0.7)';
    g.shadowBlur = 7;
    g.font = `500 19px ${sans}`;
    g.letterSpacing = '8px';
    g.fillText('JAY CHOU', cx, cy - R + 58);

    g.textAlign = 'right';
    g.font = `400 14px ${sans}`;
    g.letterSpacing = '3px';
    g.fillText(`NO.${String(album.n).padStart(2, '0')}`, cx + R - 54, cy - R + 57);

    g.textAlign = 'center';
    g.globalAlpha = 0.82;
    g.font = `400 14px ${sans}`;
    g.letterSpacing = '5px';
    g.fillText('SIDE A  ·  33⅓ RPM', cx, cy + R - 40);
    g.globalAlpha = 1;
    g.shadowBlur = 0;
  } else {
  g.save();
  g.beginPath();
  g.arc(cx, cy, R, 0, TAU);
  g.clip();

  const lb = g.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
  lb.addColorStop(0, pal.bg);
  lb.addColorStop(0.55, pal.deep);
  lb.addColorStop(1, pal.bg);
  g.fillStyle = lb;
  g.fillRect(cx - R, cy - R, R * 2, R * 2);

  const halo = g.createRadialGradient(cx - R * 0.35, cy - R * 0.45, 10, cx, cy, R * 1.3);
  halo.addColorStop(0, 'rgba(255,255,255,0.13)');
  halo.addColorStop(0.55, 'rgba(255,255,255,0)');
  halo.addColorStop(1, 'rgba(0,0,0,0.32)');
  g.fillStyle = halo;
  g.fillRect(cx - R, cy - R, R * 2, R * 2);

  g.globalAlpha = 0.06;
  g.fillStyle = pal.ink;
  for (let i = 0; i < 2200; i++) {
    g.fillRect(cx - R + Math.random() * R * 2, cy - R + Math.random() * R * 2, 1, 1);
  }
  g.globalAlpha = 1;
  g.restore();

  g.strokeStyle = pal.accent;
  g.globalAlpha = 0.85;
  g.lineWidth = 3;
  g.beginPath();
  g.arc(cx, cy, R - 3, 0, TAU);
  g.stroke();
  g.globalAlpha = 0.32;
  g.lineWidth = 1;
  g.beginPath();
  g.arc(cx, cy, R - 14, 0, TAU);
  g.stroke();
  g.globalAlpha = 1;

  // 标签外圈刻度
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * TAU;
    g.strokeStyle = `rgba(255,255,255,${i % 4 === 0 ? 0.2 : 0.08})`;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * (R + 10), cy + Math.sin(a) * (R + 10));
    g.lineTo(cx + Math.cos(a) * (R + 22), cy + Math.sin(a) * (R + 22));
    g.stroke();
  }

  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  const ink = pal.ink;

  g.fillStyle = ink;
  g.globalAlpha = 0.7;
  g.font = `500 20px ${sans}`;
  g.letterSpacing = '8px';
  g.fillText('JAY CHOU', cx, cy - R + 62);
  g.textAlign = 'right';
  g.font = `400 15px ${sans}`;
  g.letterSpacing = '3px';
  g.fillText(`NO.${String(album.n).padStart(2, '0')}`, cx + R - 54, cy - R + 61);
  g.textAlign = 'center';
  g.globalAlpha = 0.46;
  g.font = `400 13px ${sans}`;
  g.letterSpacing = '4px';
  g.fillText('33⅓ RPM  ·  STEREO', cx, cy - R + 92);
  g.globalAlpha = 1;

  const titleSize = fitFont(g, album.title, R * 1.58, 92, serif, 900, 26);
  g.fillStyle = ink;
  g.letterSpacing = '1px';
  g.font = `900 ${titleSize}px ${serif}`;
  g.fillText(album.title, cx, cy + 96);

  const enSize = fitFont(g, album.en, R * 1.62, 19, sans, 400, 10);
  g.globalAlpha = 0.72;
  g.font = `400 ${enSize}px ${sans}`;
  g.letterSpacing = '4px';
  g.fillText(album.en, cx, cy + 134);
  g.globalAlpha = 1;

  g.strokeStyle = pal.accent;
  g.globalAlpha = 0.55;
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(cx - 42, cy + 154);
  g.lineTo(cx + 42, cy + 154);
  g.stroke();
  g.globalAlpha = 1;

  g.fillStyle = ink;
  g.globalAlpha = 0.9;
  g.font = `400 38px ${display}`;
  g.letterSpacing = '6px';
  g.fillText(String(album.year), cx, cy + 214);

  g.globalAlpha = 0.55;
  g.font = `400 14px ${sans}`;
  g.letterSpacing = '5px';
  g.fillText('SIDE A  ·  33⅓ RPM', cx, cy + 252);
  g.globalAlpha = 1;
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = SRGB;
  tex.anisotropy = 8;
  // 圆柱顶面的 UV 轴与世界 X/Z 交换，旋转纹理让标签文字保持正向
  tex.center.set(0.5, 0.5);
  tex.rotation = Math.PI / 2;
  return tex;
}

function makeDustSprite() {
  const S = 64;
  const { c, g } = canvas2d(S, S);
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0, 'rgba(255,240,214,1)');
  grd.addColorStop(0.4, 'rgba(255,230,190,0.5)');
  grd.addColorStop(1, 'rgba(255,230,190,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(c);
}

export function createTurntable(canvas, options = {}) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const onNeedleDrop = options.onNeedleDrop || (() => {});
  const getCoverImage = typeof options.getCoverImage === 'function' ? options.getCoverImage : null;
  const getAudioProgress =
    typeof options.getAudioProgress === 'function'
      ? options.getAudioProgress
      : () => ({ cued: false, playing: false, progress: 0 });
  const canSeek = typeof options.canSeek === 'function' ? options.canSeek : () => false;
  const onSeek = typeof options.onSeek === 'function' ? options.onSeek : () => {};
  const canSeekDisc = typeof options.canSeekDisc === 'function' ? options.canSeekDisc : () => false;
  const onDiscSeek = typeof options.onDiscSeek === 'function' ? options.onDiscSeek : () => {};
  const onDiscSeekEnd = typeof options.onDiscSeekEnd === 'function' ? options.onDiscSeekEnd : () => {};
  const getWear = typeof options.getWear === 'function' ? options.getWear : () => 0;

  let dprCap = Math.min(window.devicePixelRatio || 1, 2);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance'
  });
  renderer.setPixelRatio(dprCap);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = SRGB;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  /* ── 单趟后处理：阈值 bloom + 渐晕 + 胶片颗粒（替代 CSS grain） ── */
  const rtSize = new THREE.Vector2();
  let rt = null;
  const postScene = new THREE.Scene();
  const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const postMat = new THREE.ShaderMaterial({
    uniforms: {
      tScene: { value: null },
      uTexel: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      uGrain: { value: 0.05 },
      uBloom: { value: 0.72 },
      uHDR: { value: 1 },
      uTH: { value: 0.85 }
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform sampler2D tScene;
      uniform vec2 uTexel;
      uniform float uTime;
      uniform float uGrain;
      uniform float uBloom;
      uniform float uHDR;
      uniform float uTH;

      float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

      // ACES 近似（Narkowicz）
      vec3 aces(vec3 x) {
        return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
      }

      vec3 lin2srgb(vec3 c) {
        c = max(c, vec3(0.0));
        vec3 hi = 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055;
        vec3 lo = 12.92 * c;
        return mix(hi, lo, vec3(lessThanEqual(c, vec3(0.0031308))));
      }

      void main() {
        vec4 base = texture2D(tScene, vUv);
        vec3 col;

        // 双环 8 采样 + 亮通阈值，近似 bloom（HDR 路在线性空间取值）
        const float R1 = 2.0;
        const float R2 = 5.5;
        vec3 bl = vec3(0.0);
        for (int i = 0; i < 8; i++) {
          float a = float(i) * 0.7853981634;
          vec2 dir = vec2(cos(a), sin(a));
          vec3 s1 = texture2D(tScene, vUv + dir * uTexel * R1).rgb;
          vec3 s2 = texture2D(tScene, vUv + dir * uTexel * R2).rgb;
          bl += max(s1 - uTH, 0.0) * 0.6 + max(s2 - uTH, 0.0) * 0.4;
        }
        bl /= 8.0;

        if (uHDR > 0.5) {
          // HDR：线性域加 bloom → 曝光 → ACES → sRGB
          col = lin2srgb(aces((base.rgb + bl * uBloom) * 1.08));
        } else {
          col = base.rgb + bl * uBloom;
        }

        // 渐晕
        float d = distance(vUv, vec2(0.5));
        col *= 1.0 - smoothstep(0.42, 0.88, d) * 0.32;

        // 胶片颗粒（亮度加权，保护暗部）
        float n = fract(sin(dot(gl_FragCoord.xy + fract(uTime) * 61.7, vec2(12.9898, 78.233))) * 43758.5453);
        col += (n - 0.5) * uGrain * (0.35 + 0.65 * lum(col));

        // alpha 透传 + bloom 微光晕，输出预乘
        float alpha = clamp(base.a + min(lum(bl) * 0.55, 0.5), 0.0, 1.0);
        gl_FragColor = vec4(max(col, 0.0) * alpha, alpha);
      }
    `,
    depthTest: false,
    depthWrite: false
  });
  postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat));

  function ensureRT(w, h) {
    if (!rt) {
      const hdr = renderer.capabilities.isWebGL2;
      rt = new THREE.WebGLRenderTarget(w, h, {
        type: hdr ? THREE.HalfFloatType : THREE.UnsignedByteType,
        samples: hdr ? 4 : 0
      });
      rt.texture.colorSpace = hdr ? THREE.NoColorSpace : SRGB;
      postMat.uniforms.tScene.value = rt.texture;
      postMat.uniforms.uHDR.value = hdr ? 1 : 0;
      postMat.uniforms.uTH.value = hdr ? 0.85 : 0.6;
    } else {
      rt.setSize(w, h);
    }
  }

  const scene = new THREE.Scene();
  scene.environment = makeEnvTexture(renderer);

  const camera = new THREE.PerspectiveCamera(33, 1, 0.1, 100);
  const camBase = new THREE.Vector3(0.15, 4.15, 10.1);
  const camLook = new THREE.Vector3(0.15, 0.58, 0.1);
  const camLookCurrent = camLook.clone();
  camera.position.copy(camBase);
  camera.lookAt(camLook);

  /* ── 灯光 ─────────────────────────────────────────────── */

  scene.add(new THREE.AmbientLight(0x453829, 0.55));
  const hemi = new THREE.HemisphereLight(0x5c6a7a, 0x0a0705, 0.45);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xffd6a2, 2.6);
  key.position.set(3.6, 8.2, 4.6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 24;
  key.shadow.camera.left = -7;
  key.shadow.camera.right = 7;
  key.shadow.camera.top = 7;
  key.shadow.camera.bottom = -7;
  key.shadow.bias = -0.0005;
  key.shadow.radius = 4;
  scene.add(key);

  const rim = new THREE.PointLight(0xb77f42, 42, 18, 2);
  rim.position.set(-4.2, 2.4, -4.6);
  scene.add(rim);

  const fill = new THREE.PointLight(0x93a7bd, 16, 16, 2);
  fill.position.set(3.8, 2.2, 5.2);
  scene.add(fill);

  const accentLight = new THREE.PointLight(0xc9a86a, 8, 8, 2);
  accentLight.position.set(-2.4, 1.8, 2.2);
  scene.add(accentLight);

  const spot = new THREE.SpotLight(0xffcf96, 240, 22, 0.52, 1, 2);
  spot.position.set(2.6, 8.4, 1.4);
  spot.target.position.set(0, 0.2, 0.2);
  spot.castShadow = true;
  spot.shadow.mapSize.set(2048, 2048);
  spot.shadow.bias = -0.0004;
  scene.add(spot);
  scene.add(spot.target);

  /* ── 唱机 ─────────────────────────────────────────────── */

  const root = new THREE.Group();
  scene.add(root);

  const woodTex = makeWoodTexture(renderer);
  const woodMat = new THREE.MeshStandardMaterial({
    map: woodTex,
    roughness: 0.52,
    metalness: 0.08,
    envMapIntensity: 0.55
  });

  const PLINTH_W = 6.6;
  const PLINTH_D = 4.8;
  const PLINTH_H = 0.5;

  const plinth = new THREE.Mesh(
    new RoundedBoxGeometry(PLINTH_W, PLINTH_H, PLINTH_D, 6, 0.13),
    woodMat
  );
  plinth.position.y = 0.28;
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  root.add(plinth);

  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xc7a56b,
    metalness: 1,
    roughness: 0.28,
    envMapIntensity: 1.35
  });
  const darkMetalMat = new THREE.MeshStandardMaterial({
    color: 0x1a1917,
    metalness: 0.75,
    roughness: 0.36,
    envMapIntensity: 0.8
  });

  // 机脚
  const footGeo = new THREE.CylinderGeometry(0.18, 0.2, 0.12, 24);
  for (const [x, z] of [[-2.9, 2.05], [2.9, 2.05], [-2.9, -2.05], [2.9, -2.05]]) {
    const foot = new THREE.Mesh(footGeo, darkMetalMat);
    foot.position.set(x, 0.06, z);
    foot.castShadow = true;
    root.add(foot);
  }

  // 面板铭牌
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(2.5, 0.39),
    new THREE.MeshBasicMaterial({
      map: makePlateTexture(),
      transparent: true,
      depthWrite: false
    })
  );
  plate.position.set(0, 0.3, PLINTH_D / 2 + 0.002);
  root.add(plate);

  // 转盘
  const platterMat = new THREE.MeshStandardMaterial({
    map: makeBrushedTexture(renderer),
    color: 0x8f7d5e,
    metalness: 0.9,
    roughness: 0.36,
    envMapIntensity: 0.95
  });
  // 转盘组：盘体 + 黄铜圈 + 毡垫 + 频闪测速点，与唱片同速旋转
  const platterGroup = new THREE.Group();
  const platter = new THREE.Mesh(new THREE.CylinderGeometry(2.42, 2.5, 0.16, 128), platterMat);
  platter.position.y = 0.61;
  platter.castShadow = true;
  platter.receiveShadow = true;
  platterGroup.add(platter);

  const rimRing = new THREE.Mesh(new THREE.TorusGeometry(2.455, 0.022, 12, 128), brassMat);
  rimRing.rotation.x = Math.PI / 2;
  rimRing.position.y = 0.695;
  rimRing.castShadow = true;
  platterGroup.add(rimRing);

  const felt = new THREE.Mesh(
    new THREE.CylinderGeometry(2.27, 2.27, 0.02, 96),
    new THREE.MeshStandardMaterial({ color: 0x12100d, roughness: 0.96, metalness: 0.05 })
  );
  felt.position.y = 0.705;
  felt.receiveShadow = true;
  platterGroup.add(felt);

  const strobeMat = new THREE.MeshStandardMaterial({
    color: 0xe8d5ae,
    metalness: 0.55,
    roughness: 0.35,
    emissive: 0x3a2f1c,
    emissiveIntensity: 0.3
  });
  const strobeDotGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.015, 8);
  const STROBE_DOTS = 36;
  for (let i = 0; i < STROBE_DOTS; i++) {
    const a = (i / STROBE_DOTS) * TAU;
    const dot = new THREE.Mesh(strobeDotGeo, strobeMat);
    dot.position.set(Math.cos(a) * 2.38, 0.7, Math.sin(a) * 2.38);
    platterGroup.add(dot);
  }
  root.add(platterGroup);

  // 唱片
  let grooveBump = makeGrooveBump(4);
  const discSideMat = new THREE.MeshPhysicalMaterial({
    color: 0x090909,
    roughness: 0.3,
    metalness: 0.12,
    clearcoat: 0.7,
    clearcoatRoughness: 0.25,
    envMapIntensity: 0.6,
    transparent: true,
    opacity: 1
  });
  const discTopMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.28,
    metalness: 0.04,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
    specularIntensity: 0.45,
    bumpMap: grooveBump,
    bumpScale: 0.02,
    envMapIntensity: 0.3,
    transparent: true,
    opacity: 1
  });
  const discBottomMat = discTopMat.clone();
  discBottomMat.map = null;

  const discGeo = new THREE.CylinderGeometry(2.26, 2.26, 0.038, 160, 1, false);
  const disc = new THREE.Mesh(discGeo, [discSideMat, discTopMat, discBottomMat]);
  disc.castShadow = true;
  disc.receiveShadow = true;

  const recordGroup = new THREE.Group();
  disc.position.y = 0.735;
  recordGroup.add(disc);

  const spindle = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.045, 0.24, 24), brassMat);
  spindle.position.y = 0.83;
  spindle.castShadow = true;
  root.add(spindle);

  root.add(recordGroup);

  // 唱片外缘倒角，勾出黑胶边界
  const discEdgeMat = new THREE.MeshPhysicalMaterial({
    color: 0x0a0a0a,
    roughness: 0.22,
    metalness: 0.15,
    clearcoat: 1,
    clearcoatRoughness: 0.12,
    envMapIntensity: 0.8,
    transparent: true,
    opacity: 1
  });
  const discEdge = new THREE.Mesh(new THREE.TorusGeometry(2.258, 0.014, 10, 160), discEdgeMat);
  discEdge.rotation.x = Math.PI / 2;
  discEdge.position.y = 0.735;
  recordGroup.add(discEdge);

  // 各向异性沟槽反光：光带相对光源固定，沟槽在下面转（真实黑胶的标志性观感）
  const sheenMat = new THREE.ShaderMaterial({
    uniforms: {
      uKeyDir: { value: new THREE.Vector3(3.6, 8.2, 4.6).normalize() },
      uFillDir: { value: new THREE.Vector3(3.8, 2.2, 5.2).normalize() },
      uCamPos: { value: new THREE.Vector3() },
      uSpin: { value: 0 },
      uOpacity: { value: 1 },
      uBands: { value: [0.7, 0.78, 0.86, 0.9, 0.94, 0.98] },
      uBandCount: { value: 3 }
    },
    vertexShader: `
      varying vec3 vWorld;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      varying vec3 vWorld;
      uniform vec3 uKeyDir;
      uniform vec3 uFillDir;
      uniform vec3 uCamPos;
      uniform float uSpin;
      uniform float uOpacity;
      uniform float uBands[6];
      uniform int uBandCount;

      // Kajiya-Kay：沟槽切线方向的各向异性高光
      float grooveSpec(vec3 T, vec3 H, float exp) {
        float tdh = dot(T, H);
        float sinTH = sqrt(max(0.0, 1.0 - tdh * tdh));
        return pow(sinTH, exp);
      }

      void main() {
        vec2 rp = vWorld.xz;
        float r = length(rp) / 2.258;
        if (r > 1.0) discard;

        vec3 radial = vec3(rp.x, 0.0, rp.y) / max(length(rp), 1e-4);
        vec3 T = vec3(-radial.z, 0.0, radial.x);
        vec3 V = normalize(uCamPos - vWorld);
        vec3 Hk = normalize(uKeyDir + V);
        vec3 Hf = normalize(uFillDir + V);

        float specK = grooveSpec(T, Hk, 110.0);
        float specK2 = grooveSpec(T, Hk, 26.0);
        float specF = grooveSpec(T, Hf, 48.0);

        // 沟槽细环结构 + 随唱片旋转的细微划痕闪动
        float ang = atan(rp.y, rp.x);
        float rings = 0.72 + 0.28 * sin(r * 1900.0);
        float scratches = 0.93 + 0.07 * sin(ang * 7.0 + uSpin) * sin(ang * 13.0 - uSpin * 0.5);

        // 播放区掩码：纸标签外 → 引入槽内
        float mask = smoothstep(0.62, 0.66, r) * (1.0 - smoothstep(0.96, 0.995, r));
        // 分轨宽槽处高光断开
        for (int i = 0; i < 6; i++) {
          if (i >= uBandCount) break;
          mask *= smoothstep(0.004, 0.016, abs(r - uBands[i]));
        }

        float edge = smoothstep(0.955, 0.985, r) * (1.0 - smoothstep(0.985, 1.0, r));
        float a = (specK * 0.42 + specK2 * 0.08 + specF * 0.11) * rings * scratches * mask
                + edge * 0.05;
        vec3 warm = vec3(1.0, 0.93, 0.78);
        vec3 cool = vec3(0.72, 0.80, 0.94);
        vec3 col = (warm * (specK * 0.42 + specK2 * 0.08) + cool * specF * 0.11)
                 / max(specK * 0.42 + specK2 * 0.08 + specF * 0.11, 1e-4);
        gl_FragColor = vec4(col, a * uOpacity);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide
  });
  const sheen = new THREE.Mesh(new THREE.CircleGeometry(2.258, 160), sheenMat);
  sheen.rotation.x = -Math.PI / 2;
  sheen.position.y = 0.7595;
  root.add(sheen);

  // 伤痕贴花：随唱片旋转，密度/透明度随播放磨损增长
  const wearMat = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0.42,
    depthWrite: false
  });
  const wearMesh = new THREE.Mesh(new THREE.CircleGeometry(2.256, 128), wearMat);
  wearMesh.rotation.x = -Math.PI / 2;
  wearMesh.position.y = 0.7568;
  wearMesh.renderOrder = 1;
  let wearTex = null;
  let wearStep = -1;
  recordGroup.add(wearMesh);

  // 唱臂
  const pivotX = 2.45;
  const pivotZ = -1.5;
  const baseGroup = new THREE.Group();
  baseGroup.position.set(pivotX, 0.53, pivotZ);
  root.add(baseGroup);

  const baseDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.16, 48), darkMetalMat);
  baseDisc.position.y = 0.08;
  baseDisc.castShadow = true;
  baseGroup.add(baseDisc);

  const baseRing = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.035, 48), brassMat);
  baseRing.position.y = 0.17;
  baseRing.castShadow = true;
  baseGroup.add(baseRing);

  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.42, 32), darkMetalMat);
  pillar.position.y = 0.38;
  pillar.castShadow = true;
  baseGroup.add(pillar);

  const gimbal = new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 18), brassMat);
  gimbal.position.y = 0.6;
  gimbal.castShadow = true;
  baseGroup.add(gimbal);

  const armGroup = new THREE.Group();
  armGroup.position.set(pivotX, 1.13, pivotZ);
  armGroup.rotation.order = 'YXZ';
  armGroup.rotation.y = 0.2;
  armGroup.rotation.x = 0.09;
  root.add(armGroup);

  const ARM_LEN = 2.72;
  const armTube = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.038, ARM_LEN, 20), brassMat);
  armTube.rotation.x = Math.PI / 2;
  armTube.position.z = ARM_LEN / 2;
  armTube.castShadow = true;
  armGroup.add(armTube);

  const armInset = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, ARM_LEN, 12), darkMetalMat);
  armInset.rotation.x = Math.PI / 2;
  armInset.position.set(0, 0.035, ARM_LEN / 2);
  armGroup.add(armInset);

  const counterWeight = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.15, 0.3, 32), darkMetalMat);
  counterWeight.rotation.x = Math.PI / 2;
  counterWeight.position.z = -0.34;
  counterWeight.castShadow = true;
  armGroup.add(counterWeight);

  const cwRing = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.012, 8, 32), brassMat);
  cwRing.position.z = -0.2;
  armGroup.add(cwRing);

  const headshell = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.055, 0.34), darkMetalMat);
  headshell.position.set(0, -0.035, ARM_LEN - 0.12);
  headshell.rotation.y = -0.16;
  headshell.castShadow = true;
  armGroup.add(headshell);

  const headShellPlate = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.008, 0.24), brassMat);
  headShellPlate.position.set(0.035, -0.005, ARM_LEN - 0.11);
  headShellPlate.rotation.y = -0.16;
  armGroup.add(headShellPlate);

  const stylus = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.09, 12), new THREE.MeshStandardMaterial({
    color: 0xd8c8a8,
    metalness: 0.9,
    roughness: 0.25
  }));
  stylus.position.set(0.045, -0.1, ARM_LEN - 0.06);
  stylus.rotation.x = Math.PI;
  stylus.castShadow = true;
  armGroup.add(stylus);

  // 针尖微光
  const glintMat = new THREE.SpriteMaterial({
    map: makeDustSprite(),
    color: 0xfff0d4,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const stylusGlint = new THREE.Sprite(glintMat);
  stylusGlint.scale.set(0.13, 0.13, 1);
  stylusGlint.position.set(0.045, -0.13, ARM_LEN - 0.04);
  armGroup.add(stylusGlint);

  // 电源指示灯
  const led = new THREE.Mesh(
    new THREE.CylinderGeometry(0.026, 0.026, 0.012, 16),
    new THREE.MeshStandardMaterial({
      color: 0x26150a,
      emissive: 0xff9a4d,
      emissiveIntensity: 2.4,
      roughness: 0.4,
      metalness: 0.1
    })
  );
  led.position.set(2.62, 0.548, 1.95);
  root.add(led);

  // 黄铜大喇叭：右后方立式古典留声机号角——底座、立管、弯头、指数展开号筒。
  // 静态装饰几何一次构建，无逐帧开销；位置经取景核算，不遮挡唱盘与唱臂视线。
  const hornGroup = new THREE.Group();
  root.add(hornGroup);
  const hornBrass = brassMat.clone();
  hornBrass.side = THREE.DoubleSide;
  const hornInner = darkMetalMat.clone();
  hornInner.side = THREE.DoubleSide;

  const HORN_X = 3.02;
  const HORN_Z = -2.12;
  const HORN_TOP = 1.12;

  const hornFoot = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.23, 0.09, 32), darkMetalMat);
  hornFoot.position.set(HORN_X, 0.575, HORN_Z);
  hornFoot.castShadow = true;
  hornGroup.add(hornFoot);

  const hornFootRing = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.014, 10, 40), brassMat);
  hornFootRing.rotation.x = Math.PI / 2;
  hornFootRing.position.set(HORN_X, 0.622, HORN_Z);
  hornGroup.add(hornFootRing);

  const hornTube = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.082, 0.5, 24), brassMat);
  hornTube.position.set(HORN_X, 0.87, HORN_Z);
  hornTube.castShadow = true;
  hornGroup.add(hornTube);

  const hornJoint = new THREE.Mesh(new THREE.SphereGeometry(0.105, 24, 18), brassMat);
  hornJoint.position.set(HORN_X, HORN_TOP, HORN_Z);
  hornJoint.castShadow = true;
  hornGroup.add(hornJoint);

  // 弯头之后朝前上方扬起：喉管 + 指数展开号筒
  const hornDir = new THREE.Vector3(0, 0.88, 0.474).normalize();
  const THROAT = 0.5;
  const FLARE = 1.0;
  const YUP = new THREE.Vector3(0, 1, 0);
  const throatPos = new THREE.Vector3(HORN_X, HORN_TOP, HORN_Z).addScaledVector(hornDir, THROAT);

  const hornNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.078, 0.084, THROAT, 24), hornBrass);
  hornNeck.position.copy(new THREE.Vector3(HORN_X, HORN_TOP, HORN_Z).addScaledVector(hornDir, THROAT / 2));
  hornNeck.quaternion.setFromUnitVectors(YUP, hornDir);
  hornNeck.castShadow = true;
  hornGroup.add(hornNeck);

  const bellGroup = new THREE.Group();
  const bellPts = [];
  const BELL_SEGS = 16;
  for (let i = 0; i <= BELL_SEGS; i++) {
    const t = i / BELL_SEGS;
    bellPts.push(new THREE.Vector2(0.085 * Math.pow(10, t), t * FLARE));
  }
  const bell = new THREE.Mesh(new THREE.LatheGeometry(bellPts, 72), hornBrass);
  bell.castShadow = true;
  bellGroup.add(bell);

  // 内胆暗色：从喇叭口望进去有纵深
  const bellInner = new THREE.Mesh(
    new THREE.LatheGeometry(bellPts.map((p) => new THREE.Vector2(p.x * 0.96, p.y)), 72),
    hornInner
  );
  bellGroup.add(bellInner);

  // 三道古典铆接环纹
  for (const t of [0.3, 0.56, 0.8]) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(0.085 * Math.pow(10, t) + 0.01, 0.015, 10, 64), brassMat);
    rib.rotation.x = Math.PI / 2;
    rib.position.y = t * FLARE;
    bellGroup.add(rib);
  }

  const bellRim = new THREE.Mesh(new THREE.TorusGeometry(0.86, 0.026, 12, 72), brassMat);
  bellRim.rotation.x = Math.PI / 2;
  bellRim.position.y = FLARE;
  bellGroup.add(bellRim);

  bellGroup.position.copy(throatPos);
  bellGroup.quaternion.setFromUnitVectors(YUP, hornDir);
  hornGroup.add(bellGroup);

  // 落地阴影
  const shadowTex = makeShadowTexture();
  const contact = new THREE.Mesh(
    new THREE.PlaneGeometry(10.5, 8),
    new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      opacity: 0.9,
      depthWrite: false
    })
  );
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = 0.001;
  contact.renderOrder = 1;
  root.add(contact);

  // 机脚接触阴影：四个紧贴脚座的紧凑暗斑
  const footShadowGeo = new THREE.PlaneGeometry(1.5, 1.1);
  for (const [fx, fz] of [[-2.9, 2.05], [2.9, 2.05], [-2.9, -2.05], [2.9, -2.05]]) {
    const fs = new THREE.Mesh(
      footShadowGeo,
      new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        opacity: 0.62,
        depthWrite: false
      })
    );
    fs.rotation.x = -Math.PI / 2;
    fs.position.set(fx, 0.004, fz);
    fs.renderOrder = 2;
    root.add(fs);
  }

  // 悬浮微尘
  const DUST = 240;
  const positions = new Float32Array(DUST * 3);
  const speeds = new Float32Array(DUST);
  for (let i = 0; i < DUST; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 8.5;
    positions[i * 3 + 1] = Math.random() * 4.2 + 0.2;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 7;
    speeds[i] = 0.02 + Math.random() * 0.06;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const dustMat = new THREE.PointsMaterial({
    size: 0.035,
    map: makeDustSprite(),
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    color: 0xffe4b8
  });
  const dust = new THREE.Points(dustGeo, dustMat);
  root.add(dust);

  /* ── 动画状态 ─────────────────────────────────────────── */

  const REST_ANGLE = 0.2;
  // 唱臂几何：由针尖位置数值求解外圈 / 内圈落针角
  const STYLUS_X = 0.045;
  const STYLUS_Z_RAW = ARM_LEN - 0.06;
  const ARM_TILT = 0.09;
  const STYLUS_Z = -0.1 * Math.sin(ARM_TILT) + STYLUS_Z_RAW * Math.cos(ARM_TILT);
  function stylusRadius(theta) {
    const x = pivotX + STYLUS_X * Math.cos(theta) + STYLUS_Z * Math.sin(theta);
    const z = pivotZ - STYLUS_X * Math.sin(theta) + STYLUS_Z * Math.cos(theta);
    return Math.hypot(x, z);
  }
  function angleForRadius(target) {
    let lo = -1.2;
    let hi = 0.3;
    for (let i = 0; i < 42; i++) {
      const mid = (lo + hi) / 2;
      if (stylusRadius(mid) > target) hi = mid;
      else lo = mid;
    }
    return (lo + hi) / 2;
  }
  const PLAY_ANGLE = angleForRadius(2.12); // 引入槽
  const INNER_ANGLE = angleForRadius(0.88); // 导出槽
  let trackProgress = 0;
  const angleForProgress = (p) => PLAY_ANGLE + (INNER_ANGLE - PLAY_ANGLE) * clamp(p, 0, 1);

  const tweens = new Set();
  let active = false;
  let raf = 0;
  let spin = 0;
  let spinSpeed = 0;
  let spinTarget = 0;
  let baseSpin = 1.08;
  let needleDown = false;
  let immersive = false;
  let armAngle = REST_ANGLE;
  let discOpacity = 1;
  let pointerX = 0;
  let pointerY = 0;
  let last = performance.now();
  let currentAlbum = null;
  let discTex = null;
  let firstShown = false;
  let seeking = false;
  let pointerAt = 0;
  let forceUntil = 0;
  let frameEMA = 16;
  let lowCount = 0;
  let highCount = 0;
  let orbitA = 0;

  function tween(duration, { delay = 0, ease = easeOutCubic, group = 'default', update, complete } = {}) {
    const t = { elapsed: -delay, duration, ease, group, update, complete, done: false };
    tweens.add(t);
    return t;
  }

  function clearGroup(group) {
    for (const t of Array.from(tweens)) {
      if (t.group === group) tweens.delete(t);
    }
  }

  function applyDiscOpacity(v) {
    discOpacity = clamp(v, 0, 1);
    discSideMat.opacity = discOpacity;
    discTopMat.opacity = discOpacity;
    discBottomMat.opacity = discOpacity;
    disc.visible = discOpacity > 0.001;
    discEdgeMat.opacity = discOpacity;
    discEdge.visible = discOpacity > 0.001;
    sheenMat.uniforms.uOpacity.value = discOpacity;
    sheen.visible = discOpacity > 0.001;
  }

  function setAccent(album) {
    const col = new THREE.Color(album.palette.accent);
    accentLight.color.lerp(col, 0.85);
    accentLight.intensity = 10;
    key.color.lerp(new THREE.Color(0xffd6a2), 0.65);
  }

  function refreshWear() {
    if (!currentAlbum) return;
    const wear = clamp(getWear(currentAlbum), 0, 1);
    const step = Math.floor(wear * 4);
    if (wearTex) {
      wearTex.dispose();
      wearTex = null;
    }
    wearTex = makeWearTexture(currentAlbum.n, wear);
    wearMat.map = wearTex;
    /* 层不透明度只做温和增益：高磨损靠纹理自身密度与笔触透明度表达，
       过高的层不透明度会让浅色元素把黑胶洗灰、划痕糊掉 */
    wearMat.opacity = 0.42 + wear * 0.18;
    wearMat.needsUpdate = true;
    wearStep = step;
  }

  function setWear() {
    if (!currentAlbum) return;
    const wear = clamp(getWear(currentAlbum), 0, 1);
    wearMat.opacity = 0.42 + wear * 0.18;
    const step = Math.floor(wear * 4);
    if (step !== wearStep) refreshWear();
  }

  function installDiscTexture(album) {
    const cover = getCoverImage ? getCoverImage(album) : null;
    const usable = cover && cover.complete && cover.naturalWidth > 0;

    if (discTex) discTex.dispose();
    discTex = makeLabelTexture(album, usable ? cover : null);
    discTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    discTopMat.map = discTex;
    discTopMat.needsUpdate = true;

    // 按曲目数重刻沟槽与分轨
    const trackCount = album.tracks?.length || 4;
    grooveBump.dispose();
    grooveBump = makeGrooveBump(trackCount);
    discTopMat.bumpMap = grooveBump;
    discTopMat.needsUpdate = true;
    const bands = grooveBandRadii(trackCount).map((r) => r / 0.5);
    const padded = [...bands, 0.98, 0.98, 0.98, 0.98, 0.98, 0.98].slice(0, 6);
    sheenMat.uniforms.uBands.value = padded;
    sheenMat.uniforms.uBandCount.value = bands.length;

    // 封面还在加载时，等它就绪后再升级成 picture disc
    if (cover && !usable && !cover.__jcLabelBound) {
      cover.__jcLabelBound = true;
      cover.addEventListener(
        'load',
        () => {
          if (currentAlbum && currentAlbum.n === album.n) installDiscTexture(album);
        },
        { once: true }
      );
    }

    refreshWear();
  }

  function refreshCover(album) {
    if (currentAlbum && album.n === currentAlbum.n) installDiscTexture(album);
  }

  function setSpeed(rpm) {
    // 视觉转速与音频解耦：播放时缓慢旋转，更符合沉浸观感
    baseSpin = rpm === 45 ? 1.62 : 1.08;
    if (needleDown) spinTarget = baseSpin;
  }

  /** 播放进度 0..1：驱动唱臂从引入槽走向导出槽 */
  function setProgress(p) {
    trackProgress = clamp(p, 0, 1);
  }

  function setPlaying(on) {
    if (on) {
      if (!needleDown) animateNeedleIn(0.05);
      else spinTarget = baseSpin;
    } else {
      spinTarget = 0;
      animateNeedleOut(0.45);
    }
  }

  function setImmersive(on) {
    immersive = on;
    clearGroup('cam');
    forceUntil = performance.now() + 1200;
    camBase.y = on ? 3.35 : 4.15;
    camLook.set(0.15, on ? 0.55 : 0.58, 0.1);
    resize();
  }

  function needleDrop() {
    onNeedleDrop();
  }

  /* ── 镜头语言：落针时的电影式慢推（推进 → 停留 → 缓回） ── */
  function cinematicPush() {
    if (reduced) return;
    clearGroup('cam');
    const z0 = camBase.z;
    const y0 = camBase.y;
    const lx0 = camLook.x;
    const ly0 = camLook.y;
    const lz0 = camLook.z;
    const tz = z0 - 0.85;
    const ty = Math.max(2.6, y0 - 0.2);
    const tlx = 0.55;
    const tly = 0.5;
    const tlz = 0.0;
    forceUntil = performance.now() + 4600;

    tween(1.6, {
      ease: easeInOutCubic,
      group: 'cam',
      update: (p) => {
        camBase.z = z0 + (tz - z0) * p;
        camBase.y = y0 + (ty - y0) * p;
        camLook.x = lx0 + (tlx - lx0) * p;
        camLook.y = ly0 + (tly - ly0) * p;
        camLook.z = lz0 + (tlz - lz0) * p;
      }
    });
    tween(1.6, {
      delay: 2.5,
      ease: easeInOutCubic,
      group: 'cam',
      update: (p) => {
        camBase.z = tz + (z0 - tz) * p;
        camBase.y = ty + (y0 - ty) * p;
        camLook.x = tlx + (lx0 - tlx) * p;
        camLook.y = tly + (ly0 - tly) * p;
        camLook.z = tlz + (lz0 - tlz) * p;
      }
    });
  }

  function animateNeedleIn(delay = 0) {
    clearGroup('arm');
    armAngle = armGroup.rotation.y;
    const from = armAngle;
    const target = angleForProgress(trackProgress);
    tween(0.9, {
      delay,
      ease: easeInOutCubic,
      group: 'arm',
      update: (p) => {
        armGroup.rotation.y = from + (target - from) * p;
        armGroup.position.y = 1.13 - Math.sin(p * Math.PI) * 0.02;
      },
      complete: () => {
        armGroup.position.y = 1.13;
        needleDown = true;
        spinTarget = baseSpin;

        // 落针后唱片极轻微地回弹
        clearGroup('bounce');
        tween(0.7, {
          ease: easeOutCubic,
          group: 'bounce',
          update: (p) => {
            recordGroup.position.y = Math.sin(p * Math.PI * 2.2) * 0.004 * (1 - p);
          },
          complete: () => {
            recordGroup.position.y = 0;
          }
        });

        // 针尖闪一下
        clearGroup('glint');
        glintMat.opacity = 0.8;
        tween(0.9, {
          ease: easeOutCubic,
          group: 'glint',
          update: (p) => {
            glintMat.opacity = 0.8 * (1 - p) + 0.12 * p;
          },
          complete: () => {
            glintMat.opacity = 0.12;
          }
        });

        needleDrop();
        cinematicPush();
      }
    });
    // 抬臂的悬停动作
    tween(0.35, {
      delay: Math.max(0, delay - 0.25),
      ease: easeOutCubic,
      group: 'arm',
      update: (p) => {
        armGroup.position.y = 1.13 + (1 - p) * 0.05;
      }
    });
  }

  function animateNeedleOut(duration = 0.4) {
    needleDown = false;
    clearGroup('bounce');
    clearGroup('glint');
    glintMat.opacity = 0;
    recordGroup.position.y = 0;
    clearGroup('arm');
    const from = armGroup.rotation.y;
    tween(duration, {
      ease: easeInOutCubic,
      group: 'arm',
      update: (p) => {
        armGroup.rotation.y = from + (REST_ANGLE - from) * p;
        armGroup.position.y = 1.13 + Math.sin(p * Math.PI) * 0.07;
      },
      complete: () => {
        armGroup.position.y = 1.13;
      }
    });
  }

  function setAlbum(album, { first = false } = {}) {
    currentAlbum = album;
    needleDown = false;
    trackProgress = 0;
    forceUntil = performance.now() + 1600;
    glintMat.opacity = 0;
    setAccent(album);
    clearGroup('disc');
    clearGroup('arm');
    const immediate = reduced;

    if (!firstShown) {
      // 首次落片：唱臂归位，唱片从上方落下
      firstShown = true;
      armGroup.rotation.y = REST_ANGLE;
      armGroup.position.y = 1.13;
      installDiscTexture(album);
      recordGroup.position.y = 1.05;
      applyDiscOpacity(0);
      tween(immediate ? 0.2 : 0.85, {
        delay: immediate ? 0 : 0.35,
        ease: easeOutQuint,
        group: 'disc',
        update: (p) => {
          recordGroup.position.y = 1.05 * (1 - p);
          applyDiscOpacity(Math.min(1, p * 1.8));
        },
        complete: () => {
          recordGroup.position.y = 0;
          applyDiscOpacity(1);
          animateNeedleIn(0.1);
        }
      });
      return;
    }

    if (first) {
      installDiscTexture(album);
      applyDiscOpacity(1);
      animateNeedleIn(0.1);
      return;
    }

    // 换片：抬臂 → 旧片淡出 → 新片落下 → 落针
    animateNeedleOut(0.42);
    spinTarget = 0;

    tween(0.3, {
      delay: 0.3,
      ease: easeOutCubic,
      group: 'disc',
      update: (p) => {
        applyDiscOpacity(1 - p);
        recordGroup.position.y = p * 0.16;
      },
      complete: () => {
        installDiscTexture(album);
        spin = 0;
        recordGroup.rotation.y = 0;
        recordGroup.position.y = 0.95;
        applyDiscOpacity(0);
        tween(0.72, {
          ease: easeOutQuint,
          group: 'disc',
          update: (p) => {
            recordGroup.position.y = 0.95 * (1 - p);
            applyDiscOpacity(Math.min(1, p * 1.9));
          },
          complete: () => {
            recordGroup.position.y = 0;
            applyDiscOpacity(1);
            animateNeedleIn(0.12);
          }
        });
      }
    });
  }

  function setActive(on) {
    active = on;
    forceUntil = performance.now() + 1200;
    if (on) {
      spinTarget = 0;
      last = performance.now();
    } else {
      spinTarget = 0;
      needleDown = false;
      clearGroup('arm');
      clearGroup('disc');
      animateNeedleOut(0.5);
      recordGroup.position.x = 0;
      recordGroup.position.z = 0;
    }
  }

  function resize() {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    renderer.getDrawingBufferSize(rtSize);
    ensureRT(Math.max(2, rtSize.x), Math.max(2, rtSize.y));
    postMat.uniforms.uTexel.value.set(1 / rtSize.x, 1 / rtSize.y);
    const aspect = w / h;
    camera.aspect = aspect;
    const needZ = 7.4 / (0.592 * Math.max(aspect, 0.7));
    camBase.z = Math.max(9.7, Math.min(16.5, needZ));
    if (immersive) {
      const width = aspect < 1 ? 5.8 : 7.4;
      camBase.z = Math.max(8.2, Math.min(30, width / (0.592 * Math.max(aspect, 0.38))));
    }
    camera.updateProjectionMatrix();
    forceUntil = performance.now() + 600;
  }

  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  window.addEventListener('pointermove', (e) => {
    pointerX = (e.clientX / window.innerWidth) * 2 - 1;
    pointerY = (e.clientY / window.innerHeight) * 2 - 1;
    pointerAt = performance.now();
  }, { passive: true });

  // ── 拖动唱片跳转：径向位置 ↔ 播放进度 ──────────────────
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const OUTER_R = 2.12; // 引入槽半径（与唱臂几何一致）
  const INNER_R = 0.88; // 导出槽半径

  const discProgress = (e) => {
    const rect = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObject(disc, false)[0];
    if (!hit) return null;
    const r = Math.hypot(hit.point.x, hit.point.z);
    return Math.min(1, Math.max(0, (OUTER_R - r) / (OUTER_R - INNER_R)));
  };

  canvas.addEventListener('pointerdown', (e) => {
    if (reduced || !canSeekDisc()) return;
    const p = discProgress(e);
    if (p === null) return;
    seeking = true;
    if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
    onDiscSeek(p);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!seeking) return;
    const p = discProgress(e);
    if (p !== null) onDiscSeek(p);
  });
  const endDiscSeek = () => {
    if (!seeking) return;
    seeking = false;
    onDiscSeekEnd();
  };
  canvas.addEventListener('pointerup', endDiscSeek);
  canvas.addEventListener('pointercancel', endDiscSeek);

  resize();

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
    last = now;

    // 补间
    for (const t of Array.from(tweens)) {
      t.elapsed += dt;
      if (t.elapsed < 0) continue;
      const p = Math.min(1, t.duration <= 0 ? 1 : t.elapsed / t.duration);
      t.update(t.ease(p), p);
      if (p >= 1) {
        tweens.delete(t);
        t.complete && t.complete();
      }
    }

    if (!active || document.hidden) return;

    // 唱片转动：起转有一点惯性；转盘组（含频闪测速点）同速旋转
    spinSpeed += (spinTarget - spinSpeed) * Math.min(1, dt * 1.8);
    spin += spinSpeed * dt;
    recordGroup.rotation.y = spin;
    platterGroup.rotation.y = spin;
    recordGroup.position.x = Math.sin(spin * 0.5) * 0.0022;
    recordGroup.position.z = Math.cos(spin * 0.5) * 0.0022;

    // 唱臂随播放进度向盘心循迹（拖动跳转时快速跟上）
    const armTarget = needleDown ? angleForProgress(trackProgress) : null;
    const armDelta = armTarget !== null ? Math.abs(armGroup.rotation.y - armTarget) : 0;

    // 闲置时极缓环绕：无指针输入且仍在播放，镜头慢慢绕盘心漂移
    if (!reduced && now - pointerAt > 9000 && spinSpeed > 0.05) {
      orbitA += dt * 0.045;
    } else if (orbitA > 0) {
      orbitA = Math.max(0, orbitA - dt * 0.12);
      if (orbitA < 0.003) orbitA = 0;
    }
    if (orbitA > 0) camBase.x = 0.15 + Math.sin(orbitA) * 0.5;
    else if (camBase.x !== 0.15) camBase.x = 0.15;

    // 按需渲染：完全静止时跳过渲染与微尘更新
    const camIdle =
      Math.abs(camera.position.x - camBase.x) < 0.004 &&
      Math.abs(camera.position.y - camBase.y) < 0.004 &&
      Math.abs(camera.position.z - camBase.z) < 0.004;
    const moving =
      tweens.size > 0 ||
      spinSpeed > 0.02 ||
      seeking ||
      armDelta > 0.0015 ||
      !camIdle ||
      now - pointerAt < 1600 ||
      now < forceUntil;
    if (!moving) return;

    if (armTarget !== null) {
      const rate = armDelta > 0.06 ? 8 : 1.6;
      armGroup.rotation.y += (armTarget - armGroup.rotation.y) * Math.min(1, dt * rate);
    }

    // 极轻微的唱片翘曲：随转动呼吸
    const wob = Math.min(1, spinSpeed / 1.08);
    recordGroup.rotation.x = Math.sin(spin * 0.5) * 0.0015 * wob;
    recordGroup.rotation.z = Math.cos(spin * 0.37) * 0.0015 * wob;

    // 各向异性反光：光源固定，光带随视角自然移动
    sheenMat.uniforms.uCamPos.value.copy(camera.position);
    sheenMat.uniforms.uSpin.value = spin;

    // 灰尘
    const pos = dustGeo.attributes.position;
    for (let i = 0; i < DUST; i++) {
      let y = pos.getY(i) + speeds[i] * dt;
      let x = pos.getX(i) + Math.sin(now * 0.0002 + i) * 0.0007;
      if (y > 4.4) {
        y = 0.1;
        x = (Math.random() - 0.5) * 8.5;
      }
      pos.setY(i, y);
      pos.setX(i, x);
    }
    pos.needsUpdate = true;

    // 镜头轻微呼吸
    const px = reduced ? 0 : pointerX;
    const py = reduced ? 0 : pointerY;
    const drift = reduced ? 0 : Math.sin(now * 0.00042) * 0.045;
    camera.position.x += (camBase.x + px * 0.42 + drift - camera.position.x) * Math.min(1, dt * 2.2);
    camera.position.y += (camBase.y - py * 0.2 - camera.position.y) * Math.min(1, dt * 2.2);
    camera.position.z += (camBase.z - camera.position.z) * Math.min(1, dt * 2.2);
    camLookCurrent.lerp(camLook, Math.min(1, dt * 2.2));
    camera.lookAt(camLookCurrent);

    dustMat.opacity = 0.3 + Math.sin(now * 0.0006) * 0.05;

    // 自适应 DPR：帧时间吃紧时降档，富余时升回
    frameEMA = frameEMA * 0.94 + (dt * 1000) * 0.06;
    const dprMax = Math.min(window.devicePixelRatio || 1, 2);
    if (frameEMA > 21.5) {
      lowCount++;
      highCount = 0;
      if (lowCount > 80 && dprCap > 1.05) {
        dprCap = Math.max(1, dprCap - 0.25);
        renderer.setPixelRatio(dprCap);
        resize();
        lowCount = 0;
      }
    } else if (frameEMA < 11 && dprCap < dprMax - 0.01) {
      highCount++;
      lowCount = 0;
      if (highCount > 200) {
        dprCap = Math.min(dprMax, dprCap + 0.25);
        renderer.setPixelRatio(dprCap);
        resize();
        highCount = 0;
      }
    } else {
      lowCount = 0;
      highCount = 0;
    }

    renderer.setRenderTarget(rt);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    postMat.uniforms.uTime.value = (now % 100000) / 1000;
    renderer.render(postScene, postCam);
  }

  raf = requestAnimationFrame(frame);

  return {
    setAlbum,
    setActive,
    setSpeed,
    setPlaying,
    setProgress,
    setImmersive,
    resize,
    refreshCover,
    setWear,
    get album() { return currentAlbum; },
    get spinning() { return needleDown; },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      if (rt) rt.dispose();
      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        const m = obj.material;
        if (Array.isArray(m)) {
          m.forEach((x) => {
            if (x.map) x.map.dispose();
            x.dispose();
          });
        } else if (m) {
          if (m.map) m.map.dispose();
          m.dispose();
        }
      });
      postMat.dispose();
      renderer.dispose();
    }
  };
}
