# 周杰伦 · 黑胶典藏 — JAY CHOU THE VINYL ARCHIVE

十五张录音室专辑的沉浸式黑胶陈列：Three.js 唱机、原版封面、双面封套、同步歌词与真实黑胶反光。

## 运行

ES Module 需要通过 HTTP 服务打开（不能直接双击 file://）：

```powershell
cd D:\HuaweiMoveData\Users\14627\Desktop\MV\gallery
python -m http.server 8080
```

浏览器打开 http://localhost:8080 。

## 音频来源（三层）

1. **本机导入**：歌词内页“放入本地音频 / 批量导入”，或直接拖拽文件。按文件名匹配曲目，保存在浏览器 IndexedDB，刷新后仍在。
2. **项目内本地文件**：`assets/audio/` 下的 MP3（如 `晴天.mp3` 或 `晴天-周杰伦.mp3`）。放入后重跑 `python tools/scan-audio.py` 生成清单即可识别。已内置《暗号》《手写的从前》《我落泪情绪零碎》三首完整版。
3. **官方试听兜底**：其余曲目自动播放 Apple iTunes 公开目录的 30 秒官方试听（只缓存 URL，不打包音频）。

完整版优先级：导入 > 项目内文件 > 官方试听。曲目列表会标注“完整版 / 试听”。

## 歌词来源

- 播放时自动匹配：内置歌词（`assets/lyrics/`，含《我落泪情绪零碎》逐字卡拉OK对齐）→ lrclib 在线同步歌词（缓存在本机 localStorage，离线可看）。
- 手动导入 LRC / TXT 永远优先，可点“移除”恢复自动匹配。
- 《手写的从前》内置纯文本歌词（lrclib 暂无该曲同步歌词）。

## 工具脚本

- `tools/build-meta.py`：重新抓取 iTunes 曲目元数据（试听 URL / 时长）并匹配 lrclib 歌词 ID，生成 `assets/track-meta.json`。只存 URL 与 ID。
- `tools/scan-audio.py`：扫描 `assets/audio/` 与 `assets/lyrics/`，生成 `manifest.json` 与歌词索引。

## 键盘

- 空格：播放 / 暂停　·　← / →：沉浸模式切歌，听音室切换专辑
- F：沉浸模式　·　M：静音　·　L：歌词内页　·　Esc：返回

## 版权说明

非官方粉丝项目。封面与 30 秒试听来自 Apple Music 公开目录，版权归原权利人；
完整版音频仅来自使用者本机文件；歌词在线匹配自 lrclib 并仅缓存于本机；
黑胶底噪 / 落针 / 抽片音效为程序合成。请勿将本项目用于商业用途。
## 复古融合层（rubber-hose-ui × pixel-worlds）

概念：**纸面 = 1930s 橡胶管卡通**（所有"人手操作"的控件），**暗面 = 8-bit 像素机器**（所有"机器在干活"的状态），
转场用 iris 圆收放 × Bayer 抖动边缘把两层缝在一起。右上角"复古"按钮可整体关闭（`localStorage jc-retro`），
关闭后所有控件重新挂回回原位，回到纯净原版界面；`prefers-reduced-motion` 下卡通直落端态、像素房减速、iris 跳过。

- 纸面控制 bench（舞台底部全宽纸条）：年代文件夹 tabs（4 个年代脊导航）+ 15 张唱片脊架 + 播放控制（上一首/播放/下一首/曲名/音源/时间）+ 长号滑杆（拖动 seek）+ 烤面包机通知（英文短词写在吐司上，中文全文供读屏）。
- 歌词内页：灯泡开关 = 逐字卡拉OK填色开关（`jc-karaoke`）；温度计 = 本曲进度；红色按钮 = 导入 LRC/TXT；酒馆进度条 = 批量导入进度；龙长按 1.7s = 清除本专辑本机导入与缓存（不可撤销）；巫师状态 = 歌词匹配状态（searching/reading/done/failed）。
- 暗面像素：门禁法阵 = 封面/曲目筹备进度；唱片柜酒馆 = 封面加载进度（完成后淡出）；渡鸦 = "那年的话"记忆寄出（点击即存本机）；像素听音室 = 沉浸模式背景（192×108 夜房间：窗/月/雨、15 脊架、唱盘进度驱动标记与唱臂、灯随播放闪烁、猫、尘、像素标题与百分比），沉浸时隐藏 3D 画布避免双唱盘。
- 事件桥：app 派发 `jc:covers/progress/playstate/album/view/sheet/lyricstate/batch/notify`；融合层派发 `jc-retro:seek/toggle`。组件脚本懒加载（bench 三件首次进舞台、内页三件首次开内页、像素五件 boot、pixel-room 首次进沉浸）。
- 实现注意：自定义元素 upgrade 前禁止对 host 直接赋值（会留下 own property 遮蔽原型 accessor），统一走 `retro.js setProp()`；融合层 CSS 变量独立命名空间 `--rp/--rp2/--ri/--ris/--rbr`，不污染原版 `--ink` 等。
- vendor：`assets/vendor/rubber-hose-ui/`（button/toggle/toast/progress/slider/tabs）与 `assets/vendor/pixel-worlds/`（sigil/sage/round/raven/hoard），均 MIT，各附 LICENSE；`assets/vendor/pixel-worlds-skill/` 为绘图 kit 与规则副本。
- `tools/build-pixel-room.py`：由 kit.js + `tools/pixel-room-part2.js` 重新合成单文件 `js/pixel-room.js`。
