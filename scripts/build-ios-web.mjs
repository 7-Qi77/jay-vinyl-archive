/**
 * 生成 Capacitor 的 webDir（www/）。
 * 只拷贝运行时需要的资源，排除 node_modules、测试脚本、iOS 图标源文件与构建产物。
 */
import { cp, mkdir, rm, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'www');

const FILES = ['index.html', 'styles.css'];
const DIRS = [
  'js',
  'assets/fonts',
  'assets/vendor',
  'assets/audio',
  'assets/lyrics'
];
const OPTIONAL_FILES = ['assets/track-meta.json'];

const exists = async (p) => {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
};

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

for (const f of FILES) await cp(resolve(root, f), resolve(out, f), { recursive: true });
for (const d of DIRS) {
  if (await exists(resolve(root, d))) await cp(resolve(root, d), resolve(out, d), { recursive: true });
}
for (const f of OPTIONAL_FILES) {
  if (await exists(resolve(root, f))) await cp(resolve(root, f), resolve(out, f));
}

console.log(`[build:ios-web] → ${out}`);
