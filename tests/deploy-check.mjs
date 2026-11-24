import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] || '_site');
const errors = [];
const rel = (p) => path.join(root, p);
const exists = (p) => fs.existsSync(rel(p));
const text = (p) => fs.readFileSync(rel(p), 'utf8');
const kb = (p) => fs.statSync(rel(p)).size / 1024;

const required = [
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'sw.js',
  'js/app.js',
  'js/audio.js',
  'js/scene.js',
  'js/data.js',
  'js/media.js',
  'js/covers.js',
  'js/lyricstore.js',
  'js/vinyl-worklet.js',
  'assets/vendor/three.module.js',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/apple-touch-icon.png',
  'assets/social-card.jpg'
];
for (const p of required) if (!exists(p)) errors.push(`missing ${p}`);

const html = exists('index.html') ? text('index.html') : '';
const css = exists('styles.css') ? text('styles.css') : '';
const app = exists('js/app.js') ? text('js/app.js') : '';
if (/user-scalable=no|maximum-scale=1/i.test(html)) errors.push('viewport still blocks zoom');
if ((html.match(/<h1\b/gi) || []).length !== 1) errors.push('expected exactly one h1');
for (const token of ['manifest.webmanifest', 'apple-touch-icon', 'og:image', 'canonical', 'twitter:card']) {
  if (!html.includes(token)) errors.push(`index missing ${token}`);
}
if (!/serviceWorker/.test(app) || !/sw\.js/.test(app)) errors.push('service worker registration missing');
if (!css.includes(':focus-visible')) errors.push('focus-visible styles missing');
if (!/preload="none"/.test(html)) errors.push('local audio preload should be none');

if (exists('assets/audio/manifest.json')) {
  const manifest = JSON.parse(text('assets/audio/manifest.json'));
  let total = 0;
  for (const f of manifest.files || []) {
    const p = `assets/audio/${f.file}`;
    if (!exists(p)) {
      errors.push(`missing audio ${p}`);
      continue;
    }
    if (!/\.m4a$/i.test(f.file)) errors.push(`audio not m4a: ${f.file}`);
    total += fs.statSync(rel(p)).size;
  }
  if (total > 18 * 1024 * 1024) errors.push(`audio payload too large: ${(total / 1024 / 1024).toFixed(1)}MB`);
} else {
  errors.push('missing assets/audio/manifest.json');
}

if (exists('assets/fonts/NotoSerifSC-900.woff2') && kb('assets/fonts/NotoSerifSC-900.woff2') > 130) {
  errors.push('900 font subset too large');
}

if (errors.length) {
  console.error('DEPLOY CHECK FAILED');
  for (const e of errors) console.error('-', e);
  process.exit(1);
}
const m4aCount = fs.readdirSync(rel('assets/audio')).filter((f) => /\.m4a$/i.test(f)).length;
console.log(`DEPLOY CHECK OK · ${root} · ${m4aCount} m4a tracks`);
