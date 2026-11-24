/**
 * 黑胶噪声发生器：运行在 AudioWorklet 音频线程，不依赖主线程定时器。
 * 分层：hiss / crackle / pops / rumble / hum。
 *
 * 爆豆不是逐样本随机触发，而是由唱片 seed 生成一张固定的「沟槽缺陷图」：
 * 同一首曲重播时，爆豆会落在相同的播放进度；越靠内圈事件越密，
 * 并在引入槽 / 导出槽附近保留少量标记性划痕。
 */
class VinylNoiseProcessor extends AudioWorkletProcessor {
  constructor(options = {}) {
    super();
    this.seed = options?.processorOptions?.seed || 0x9e3779b9;
    this._resetRng(this.seed);
    this._buildGrooveMap();
    this.crackleL = 0;
    this.crackleR = 0;
    this.popL = 0;
    this.popR = 0;
    this.scratchL = 0;
    this.scratchR = 0;
    this.rumbleL = 0;
    this.rumbleR = 0;
    this.hissL = 0;
    this.hissR = 0;
    this.hissPrevL = 0;
    this.hissPrevR = 0;
    this.humPhase = 0;
    this.port.onmessage = (event) => {
      if (event.data?.type === 'seed') {
        this.seed = event.data.seed >>> 0;
        this._resetRng(this.seed);
        this._buildGrooveMap();
        this.crackleL = this.crackleR = 0;
        this.popL = this.popR = 0;
        this.scratchL = this.scratchR = 0;
      }
    };
  }

  static get parameterDescriptors() {
    return [
      { name: 'crackleLevel', defaultValue: 0.05, minValue: 0, maxValue: 0.25, automationRate: 'k-rate' },
      { name: 'hissLevel', defaultValue: 0.009, minValue: 0, maxValue: 0.05, automationRate: 'k-rate' },
      { name: 'rumbleLevel', defaultValue: 0.4, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'humLevel', defaultValue: 0, minValue: 0, maxValue: 0.01, automationRate: 'k-rate' },
      { name: 'progress', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' }
    ];
  }

  _makeRng(seed) {
    let a = seed >>> 0;
    return () => {
      a += 0x6D2B79F5;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  _resetRng(seed) {
    this._rng = this._makeRng(seed);
  }

  _buildGrooveMap() {
    const rng = this._makeRng((this.seed ^ 0x85ebca6b) >>> 0);
    const events = [];
    const add = (r, kind, gate, amp, ch, both, sign) => {
      events.push({ r, kind, gate, amp, ch, both, sign });
    };

    // r = sqrt(u) 让事件密度随内圈半径线性增加；kind 0 细碎、1 低频爆豆、2 划痕
    for (let i = 0; i < 1600; i++) {
      const r = Math.sqrt(rng());
      const roll = rng();
      const kind = roll < 0.86 ? 0 : roll < 0.98 ? 1 : 2;
      const gate = rng();
      const amp = kind === 0
        ? 0.16 + rng() * 0.55
        : kind === 1
          ? 0.22 + rng() * 0.62
          : 0.10 + rng() * 0.30;
      const ch = rng() < 0.5 ? 0 : 1;
      const both = rng() < 0.08;
      const sign = rng() > 0.5 ? 1 : -1;
      add(r, kind, gate, amp, ch, both, sign);
    }

    // 引入槽 / 导出槽的标记性划痕：只在开头和结尾各一次
    add(0.0008, 1, 0.14, 0.48, 0, true, 1);
    add(0.0016, 0, 0.20, 0.42, 1, false, -1);
    add(0.9920, 1, 0.18, 0.52, 0, true, -1);
    add(0.9970, 2, 0.25, 0.38, 1, false, 1);

    events.sort((a, b) => a.r - b.r);
    this._events = events;
    this._eventCursor = 0;
    this._lastProgress = 0;
  }

  _lowerBound(progress) {
    let lo = 0;
    let hi = this._events.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this._events[mid].r < progress) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  _triggerEvent(event) {
    const amount = event.amp * event.sign;
    const channels = event.both ? [0, 1] : [event.ch];
    for (const ch of channels) {
      const value = amount * (ch === event.ch ? 1 : 0.9);
      if (event.kind === 0) {
        if (ch === 0) this.crackleL += value;
        else this.crackleR += value;
      } else if (event.kind === 1) {
        if (ch === 0) this.popL += value;
        else this.popR += value;
      } else {
        if (ch === 0) this.scratchL += value;
        else this.scratchR += value;
      }
    }
  }

  _processGroove(progress, density) {
    if (!this._events.length) return;

    // 拖动进度条或换曲时直接跳到对应位置，不补触发中间所有事件
    if (progress < this._lastProgress - 0.001 || progress > this._lastProgress + 0.06) {
      this._lastProgress = progress;
      this._eventCursor = this._lowerBound(progress);
      return;
    }
    if (progress <= this._lastProgress) return;

    const previous = this._lastProgress;
    let triggered = 0;
    while (this._eventCursor < this._events.length) {
      const event = this._events[this._eventCursor];
      if (event.r > progress) break;
      this._eventCursor++;
      if (event.r <= previous) continue;
      if (triggered < 4 && event.gate <= density) {
        this._triggerEvent(event);
        triggered++;
      }
    }
    this._lastProgress = progress;
  }

  process(inputs, outputs, parameters) {
    const out = outputs[0];
    if (!out || !out[0]) return true;
    const left = out[0];
    const right = out[1] || out[0];
    const crackleLevel = parameters.crackleLevel[0] ?? 0;
    const hissLevel = parameters.hissLevel[0] ?? 0;
    const rumbleLevel = parameters.rumbleLevel[0] ?? 0;
    const humLevel = parameters.humLevel[0] ?? 0;
    const progress = parameters.progress[0] ?? 0;
    const crackleScale = 1 + progress * 0.35;
    // 当前噪底档位决定哪些固定缺陷会响：洁净只露出一部分，磨损几乎全露
    const density = Math.min(1.25, crackleLevel / 0.052);
    this._processGroove(progress, density);

    for (let i = 0; i < left.length; i++) {
      const whiteL = this._rng() * 2 - 1;
      const whiteR = this._rng() * 2 - 1;

      // 磁带/黑胶嘶声偏高頻，先做一阶高通，避免低频“沙沙”糊住人声
      this.hissL = 0.82 * (this.hissL + whiteL - this.hissPrevL);
      this.hissR = 0.82 * (this.hissR + whiteR - this.hissPrevR);
      this.hissPrevL = whiteL;
      this.hissPrevR = whiteR;

      // 固定的爆豆 / 划痕由 _processGroove 注入，这里只负责衰减
      this.crackleL *= 0.9975;
      this.crackleR *= 0.9975;
      this.popL *= 0.9996;
      this.popR *= 0.9996;
      this.scratchL *= 0.9985;
      this.scratchR *= 0.9985;

      // 结构传导 rumble：低频噪声，左右共享一部分，少量去相关
      this.rumbleL = this.rumbleL * 0.985 + whiteL * 0.015;
      this.rumbleR = this.rumbleR * 0.985 + whiteR * 0.015;

      // 50Hz 市电嗡声与二次谐波，只在状态需要时抬到可闻
      this.humPhase += 2 * Math.PI * 50 / sampleRate;
      if (this.humPhase > Math.PI * 2) this.humPhase -= Math.PI * 2;
      const hum = Math.sin(this.humPhase) * 0.62
        + Math.sin(this.humPhase * 2) * 0.24
        + Math.sin(this.humPhase * 3) * 0.09;

      let l = this.hissL * hissLevel
        + this.crackleL * crackleLevel * crackleScale
        + this.popL * crackleLevel * 0.9
        + this.scratchL * crackleLevel * 0.7
        + this.rumbleL * 0.2 * rumbleLevel
        + hum * humLevel;
      let r = this.hissR * hissLevel
        + this.crackleR * crackleLevel * crackleScale
        + this.popR * crackleLevel * 0.9
        + this.scratchR * crackleLevel * 0.7
        + this.rumbleR * 0.2 * rumbleLevel
        + hum * humLevel;

      // 软限幅：保护瞬态，不把噪声压成硬块
      left[i] = Math.max(-0.95, Math.min(0.95, l));
      right[i] = Math.max(-0.95, Math.min(0.95, r));
    }
    return true;
  }
}

registerProcessor('vinyl-noise', VinylNoiseProcessor);
