# 周杰伦 · 黑胶典藏 — JAY CHOU THE VINYL ARCHIVE

十六张录音室专辑的沉浸式黑胶陈列：Three.js 唱机、原版封面、双面封套、同步歌词与真实黑胶反光。

## 运行

ES Module 需要通过 HTTP 服务打开（不能直接双击 file://）：

```powershell
cd D:\HuaweiMoveData\Users\14627\Desktop\MV\gallery
python -m http.server 8080
```

浏览器打开 http://localhost:8080 。

## 线上部署

- 站点：https://7-Qi77.github.io/jay-vinyl-archive/
- 仓库：https://github.com/7-Qi77/jay-vinyl-archive （公共仓库 + GitHub Pages 免费额度）
- 发布流程：`.github/workflows/pages.yml` 只把 `index.html`、`styles.css`、`sw.js`、`manifest.webmanifest`、`js/`、`assets/` 装进 `_site` 再上传，`tools/`、`tests/`、`scripts/`、`README.md` 不在线上暴露；发布前会压缩 vendor JS 并运行 `tests/deploy-check.mjs`。
- 更新：改完执行 `git add -A && git commit -m "..." && git push`，推送到 `main` 后约 1 分钟自动重建。
- 注意：`assets/audio/*.m4a`（AAC 160k）随公开仓库一起发布，任何访客都可直接下载，仅适合非商业粉丝用途；`*.github.io` 在部分网络下较慢，可后续绑定自有域名改善。

## 性能与移动端

- 首屏：三首完整版改为 AAC 160k + `faststart`，`<audio>` 使用 `preload="none"`；单曲由约 10.6MB 降到约 5.36MB，且不占首屏请求。
- 字体：900 标题字重按站点实际字符子集化（约 96KB，原 179KB），400 正文保留全量并按需加载。
- iTunes：封面和曲目表共用同一次 `lookup` 响应，首屏由 32 次请求降到 16 次；失败时沿用 `assets/track-meta.json` 与档案占位。
- 3D：阴影 1024（手机 512）并按需 12Hz 刷新；MSAA 4→2（iOS 关闭）；bloom 采样减半；移动端 DPR 上限 1.5；静态网格关闭矩阵自动更新；手机隐藏一盏辅助灯并关闭聚光灯阴影。
- 移动端：竖屏唱机画布由 264px 提升到 321px 左右，恢复页面双指缩放，唱臂隐形拾取体加大。
- 分享 / PWA：manifest、192/512 图标、apple-touch-icon、OG 卡片、canonical、Service Worker 离线壳。

## 音频来源（三层）

1. **本机导入**：歌词内页“放入本地音频 / 批量导入”，或直接拖拽文件。按文件名匹配曲目，保存在浏览器 IndexedDB，刷新后仍在。
2. **项目内本地文件**：`assets/audio/` 下的音频（如 `晴天.m4a` 或 `晴天-周杰伦.m4a`；也兼容 MP3）。放入后重跑 `python tools/scan-audio.py` 生成清单即可识别。已内置《暗号》《手写的从前》《我落泪情绪零碎》三首完整版（AAC 160k，`faststart` 流式加载）。
3. **官方试听兜底**：其余曲目自动播放 Apple iTunes 公开目录的 30 秒官方试听（只缓存 URL，不打包音频）。

完整版优先级：导入 > 项目内文件 > 官方试听。曲目列表会标注“完整版 / 试听”。

## 歌词来源

- 播放时自动匹配：内置歌词（`assets/lyrics/`，含《我落泪情绪零碎》逐字卡拉OK对齐）→ lrclib 在线同步歌词（缓存在本机 localStorage，离线可看）。
- 手动导入 LRC / TXT 永远优先，可点“移除”恢复自动匹配。
- 《手写的从前》内置纯文本歌词（lrclib 暂无该曲同步歌词）。

## 黑胶音频引擎（四层物理建模）

实时 Web Audio / AudioWorklet 链，30s 试听与本机完整版走**同一条链**，零新增音频文件：

1. **精确 RIAA 往返**：3180µs / 318µs / 75µs 三时间常数 + 21kHz 补充极点，双线性一阶节级联；
   刻纹预加重（rec）→ 沟槽域 → 回放去加重（play）严格互逆（自检残差 6.6e-8）。
   沟槽域统一 trim 0.05 / 回放 makeup ×20：预加重峰值约 ×14，不衰减会让追踪失真 waveshaper 硬夹。
2. **角度域机械**：偏心 warp（每转一次音高 + 幅度调制）、电机换向纹波（每转 8 极）、轴承 20–60Hz 慢 AM、
   wow / flutter / 慢漂移全部只调制 DelayNode 与增益，不改 `playbackRate`；worn 唱片出现与转速锁定的每转 tick。
3. **唱头 / 针尖接触**：MM 唱头谐振峰（档案 8.8–10.8kHz 可调）、针尖摩擦噪声随节目电平调制、
   内圈追踪失真（高频饱和随半径收紧）替代静态低通。
4. **表面噪声事件化**：worklet 内泊松调度 micro-crackle / pop / burst（速率、幅度范围、衰减全可调，
   参数分类借鉴 vinyl-scratch 的滑杆 taxonomy，独立实现），种子确定、随唱针内移变脏。

worklet 输出**三条总线**，对应真实拾取顺序：总线 0 纯音乐汇沟槽总线；总线 2 沟槽域噪声
（嘶声 / 隆隆 / 摩擦 / 嗡声）经统一 trim 汇流后才过 RIAA 去加重（嘶声被滚降、隆隆被抬升）；
总线 1 机械冲击（微爆 / 爆豆 / 划痕 / tick）属唱针接触域，绕过 RIAA、只经唱头谐振与磨损滚降，保留点击瞬态。
老浏览器无 `createIIRFilter` / Worklet 时回退两段 shelf 近似 + 预生成缓冲噪底；iPhone 旧 Safari 退回 `<audio>` 直出 + 独立底噪。

唱片状态分「洁净 / 日常 / 磨损」按专辑保存；播放累计磨损与档案卡「附加磨损」滑杆同步作用于物理链。

### 压碟档案（周杰伦逐曲黑胶音质提示词）

`assets/vinyl-profiles.json`：16 张专辑各一段「压碟档案」提示词 + 12 首签名曲增量档
（晴天 / 东风破 / 七里香 / 夜曲 / 青花瓷 / 稻香 / 简单爱 / 安静 / 手写的从前 / 告白气球 / 最伟大的作品 / 我落泪情绪零碎）。
每段 prompt 文本即参数叙事：年代决定基础磨损与噪声密度，签名曲叠加增量（如《晴天》微爆 +3/s、偏心 +0.02%）。
曲目以**曲名归一化**匹配（`normTitle`：繁简 / 空格 / feat 差异），不依赖曲目索引——Apple 目录顺序与本机 meta 顺序不同。
内页左栏顶部「PRESSING DOSSIER · 压碟档案」卡展示当前曲提示词、压碟版本、播放次数与磨损，附附加磨损滑杆（长号）。

### 物理自检与 A/B

- `tools/verify-vinyl.js`：页内注入后 `await __verifyVinyl(__jc.audio)`，六项确定性自检
  （RIAA 往返恒等 / 回放倾斜 / wow 边带 / 事件密度 worn>clean / 同 seed 事件图一致 / 内圈高频衰减）。
  实测：往返残差 6.6e-8；回放倾斜 +14.9dB@40–80Hz、-9.7dB@6–10kHz；worn 192 事件/10s vs clean 18；
  同 seed 事件位置逐一对位；内圈 10–14kHz 衰减 -4.2dB。另附 `__wavEncode` 供 A/B 下载。
- `tools/analyze-ab.py`：纯标准库分带 FFT 对照 `ab/woluolei-dry.wav` 与 `ab/woluolei-vinyl.wav`
  （《我落泪情绪零碎》本机完整版 60s 起 12s，同一条链离线渲染）。实测电平差 <0.1dB，
  20–60Hz +0.37dB（隆隆）、6–12kHz +1.16dB（唱头峰）、12–20kHz -2.31dB（磨损 / 内圈滚降）。
- 设计参考：`Riyoway/vinyl-simulator`（源码 MIT，3D 模型与视觉资产不在 MIT 范围）的 RIAA 往返 / 机械 / 接触建模思路；
  `gemify-tools/vinyl-scratch`（GPL-3.0-only）仅借参数分类，未复制其代码。

## 工具脚本

- `tools/build-meta.py`：重新抓取 iTunes 曲目元数据（试听 URL / 时长）并匹配 lrclib 歌词 ID，生成 `assets/track-meta.json`。只存 URL 与 ID。
- `tools/scan-audio.py`：扫描 `assets/audio/` 与 `assets/lyrics/`，生成 `manifest.json` 与歌词索引。
- `tools/verify-vinyl.js`：黑胶物理链六项确定性自检（页内运行）。
- `tools/analyze-ab.py`：A/B WAV 分带能量与峰值因子对照（纯标准库）。

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

- 纸面控制 bench（舞台底部全宽纸条）：年代文件夹 tabs（4 个年代脊导航）+ 16 张唱片脊架 + 播放控制（上一首/播放/下一首/曲名/音源/时间）+ 长号滑杆（拖动 seek）+ 烤面包机通知（英文短词写在吐司上，中文全文供读屏）。
- 歌词内页：灯泡开关 = 逐字卡拉OK填色开关（`jc-karaoke`）；温度计 = 本曲进度；红色按钮 = 导入 LRC/TXT；酒馆进度条 = 批量导入进度；龙长按 1.7s = 清除本专辑本机导入与缓存（不可撤销）；巫师状态 = 歌词匹配状态（searching/reading/done/failed）。
- 暗面像素：门禁法阵 = 封面/曲目筹备进度；唱片柜酒馆 = 封面加载进度（完成后淡出）；渡鸦 = "那年的话"记忆寄出（点击即存本机）；像素听音室 = 沉浸模式背景（192×108 夜房间：窗/月/雨、15 脊架、唱盘进度驱动标记与唱臂、灯随播放闪烁、猫、尘、像素标题与百分比），沉浸时隐藏 3D 画布避免双唱盘。
- 事件桥：app 派发 `jc:covers/progress/playstate/album/view/sheet/lyricstate/batch/notify`；融合层派发 `jc-retro:seek/toggle`。组件脚本懒加载（bench 三件首次进舞台、内页三件首次开内页、像素五件 boot、pixel-room 首次进沉浸）。
- 实现注意：自定义元素 upgrade 前禁止对 host 直接赋值（会留下 own property 遮蔽原型 accessor），统一走 `retro.js setProp()`；融合层 CSS 变量独立命名空间 `--rp/--rp2/--ri/--ris/--rbr`，不污染原版 `--ink` 等。
- vendor：`assets/vendor/rubber-hose-ui/`（button/toggle/toast/progress/slider/tabs）与 `assets/vendor/pixel-worlds/`（sigil/sage/round/raven/hoard），均 MIT，各附 LICENSE；`assets/vendor/pixel-worlds-skill/` 为绘图 kit 与规则副本。
- `tools/build-pixel-room.py`：由 kit.js + `tools/pixel-room-part2.js` 重新合成单文件 `js/pixel-room.js`。
