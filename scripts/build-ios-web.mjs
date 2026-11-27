/**
 * 生成可部署的 Web 包：默认 www/，也可传入 _site 等输出目录。
 * Pages 与 iOS 共用同一份资源清单、压缩与部署检查。
 */
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { transform } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, process.argv[2] || 'www');

const FILES = ['index.html', 'styles.css', 'manifest.webmanifest', 'sw.js'];
const DIRS = [
  'js',
  'assets/fonts',
  'assets/vendor',
  'assets/audio',
  'assets/lyrics',
  'assets/icons'
];
const OPTIONAL_FILES = ['assets/track-meta.json', 'assets/vinyl-profiles.json', 'assets/social-card.jpg'];

const exists = async (p) => {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
};

async function minifyVendor(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      await minifyVendor(path);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      const source = await readFile(path, 'utf8');
      const result = await transform(source, {
        format: 'esm',
        target: 'esnext',
        minify: true,
        legalComments: 'inline',
        sourcefile: path
      });
      await writeFile(path, result.code);
    }
  }
}

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

for (const f of FILES) await cp(resolve(root, f), resolve(out, f), { recursive: true });
for (const d of DIRS) {
  if (await exists(resolve(root, d))) await cp(resolve(root, d), resolve(out, d), { recursive: true });
}
for (const f of OPTIONAL_FILES) {
  if (await exists(resolve(root, f))) await cp(resolve(root, f), resolve(out, f));
}

const audioDir = resolve(out, 'assets/audio');
for (const file of await readdir(audioDir)) {
  if (file.toLowerCase().endsWith('.mp3')) await rm(join(audioDir, file));
}
await minifyVendor(resolve(out, 'assets/vendor'));

const check = spawnSync(process.execPath, ['tests/deploy-check.mjs', out], { cwd: root, stdio: 'inherit' });
if (check.status !== 0) process.exit(check.status ?? 1);

console.log(`[build:web] → ${out}`);
