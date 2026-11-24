/**
 * cap sync 之后修补 iOS 工程：
 * - Info.plist：后台音频、横屏锁定、隐藏状态栏、全屏、导出合规
 * - AppDelegate.swift：AVAudioSession 设为 playback，锁屏 / 切后台不断音
 * 需在 macOS 上运行（依赖 plutil；CI 的 macos runner 自带）。
 */
import { readFileSync, writeFileSync, existsSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PLIST = 'ios/App/App/Info.plist';
const APP_DELEGATE = 'ios/App/App/AppDelegate.swift';

if (!existsSync(PLIST)) {
  console.error('[ios-postsync] 找不到 Info.plist，请先执行 npx cap add ios');
  process.exit(1);
}

// plist → JSON → 合并 → 写回，避免 -replace 对不存在的键报错
const readPlist = () =>
  JSON.parse(execFileSync('plutil', ['-convert', 'json', '-o', '-', PLIST], { encoding: 'utf8' }));

const writePlist = (obj) => {
  const dir = mkdtempSync(join(tmpdir(), 'plist-'));
  const tmp = join(dir, 'Info.json');
  writeFileSync(tmp, JSON.stringify(obj, null, 2));
  execFileSync('plutil', ['-convert', 'xml1', '-o', PLIST, tmp]);
};

const plist = readPlist();
const patch = {
  // 后台音频
  UIBackgroundModes: ['audio'],
  // iPhone 仅横屏；iPad 四向
  UISupportedInterfaceOrientations: [
    'UIInterfaceOrientationLandscapeLeft',
    'UIInterfaceOrientationLandscapeRight'
  ],
  'UISupportedInterfaceOrientations~ipad': [
    'UIInterfaceOrientationLandscapeLeft',
    'UIInterfaceOrientationLandscapeRight',
    'UIInterfaceOrientationPortrait',
    'UIInterfaceOrientationPortraitUpsideDown'
  ],
  // 全屏沉浸
  UIStatusBarHidden: true,
  UIViewControllerBasedStatusBarAppearance: false,
  UIRequiresFullScreen: true,
  // 无自定义加密，跳过出口合规问询
  ITSAppUsesNonExemptEncryption: false
};
Object.assign(plist, patch);
writePlist(plist);
console.log('[ios-postsync] Info.plist 已更新：', Object.keys(patch).join(', '));

// AppDelegate：音频会话
if (existsSync(APP_DELEGATE)) {
  let src = readFileSync(APP_DELEGATE, 'utf8');
  if (!src.includes('import AVFoundation')) {
    src = src.replace('import Capacitor', 'import Capacitor\nimport AVFoundation');
  }
  if (!src.includes('AVAudioSession.sharedInstance')) {
    const snippet = [
      '    // 后台播放：会话分类设为 playback，锁屏与切后台不中断',
      '    do {',
      '      try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [])',
      '      try AVAudioSession.sharedInstance().setActive(true)',
      '    } catch {',
      '      print("AVAudioSession error: \\(error)")',
      '    }',
      ''
    ].join('\n');
    src = src.replace(
      '// Override point for customization after application launch.',
      snippet + '    // Override point for customization after application launch.'
    );
  }
  writeFileSync(APP_DELEGATE, src);
  console.log('[ios-postsync] AppDelegate 已注入 AVAudioSession');
} else {
  console.error('[ios-postsync] 找不到 AppDelegate.swift');
  process.exitCode = 1;
}
