/**
 * 沟槽处理器：运行在 AudioWorklet 音频线程。
 * 输入 = 经过刻纹预加重、wow/flutter 与沟槽 trim 的音乐；输出三条总线：
 *   总线 0 = 纯音乐，直接汇沟槽总线；
 *   总线 2 = 沟槽域噪声（嘶声/隆隆/摩擦/嗡声），经统一 trim 后汇沟槽总线，
 *   之后才过 RIAA 回放 EQ：嘶声自然被去加重滚降、隆隆自然被抬升；
 *   总线 1 = 机械冲击（微爆/爆豆/划痕 burst/每转 tick），属唱针接触域，
 *   绕过 RIAA 去加重、只经唱头谐振与磨损滚降，保留点击瞬态。
 *
 * 表面缺陷两条来源：
 * 1. 唱片 seed 生成的固定「沟槽缺陷图」：同一首曲重播爆豆落在相同进度，越内圈越密；
 * 2. 泊松事件调度：micro-crackle / pop / burst 的速率、幅度范围、衰减全可调
 *    （参数分类借鉴 vinyl-scratch 的滑杆 taxonomy，独立实现）。
 * 另含：针尖摩擦噪声（随节目电平调制）、偏心 warp 的每转划痕 tick、
 * 电机换向纹波对隆隆的幅度调制、轴承隆隆慢 AM、市电嗡声。
 */
class VinylNoiseProcessor extends AudioWorkletProcessor {
  constructor(options = {}) {
    super();
    this.seed = options?.processorOptions?.seed || 0x9e3779b9;
    this._resetRng(this.seed);
    this._buildGrooveMap();
    this.crackleL = 0; this.crackleR = 0;
    this.popL = 0; this.popR = 0;
    this.scratchL = 0; this.scratchR = 0;
    this.microL = 0; this.microR = 0;
    this.burstL = 0; this.burstR = 0;
    this.rumbleL = 0; this.rumbleR = 0;
    this.bearL = 0; this.bearR = 0;
    this.hissL = 0; this.hissR = 0;
    this.hissPrevL = 0; this.hissPrevR = 0;
    this.fricL = 0; this.fricR = 0;
    this.fricPrevL = 0; this.fricPrevR = 0;
    this.humPhase = 0;
    this.revPhase = 0;
    this.env = 0;
    this.rpm = options?.processorOptions?.rpm === 45 ? 45 : 100 / 3;
    this.port.onmessage = (event) => {
      const d = event.data || {};
      if (d.type === 'seed') {
        this.seed = d.seed >>> 0;
        this._resetRng(this.seed);
        this._buildGrooveMap();
        this.crackleL = this.crackleR = 0;
        this.popL = this.popR = 0;
        this.scratchL = this.scratchR = 0;
        this.microL = this.microR = 0;
        this.burstL = this.burstR = 0;
      } else if (d.type === 'rpm') {
        this.rpm = Number(d.rpm) === 45 ? 45 : 100 / 3;
      }
    };
  }

  static get parameterDescriptors() {
    return [
      { name: 'crackleLevel', defaultValue: 0.05, minValue: 0, maxValue: 0.25, automationRate: 'k-rate' },
      { name: 'hissLevel', defaultValue: 0.009, minValue: 0, maxValue: 0.05, automationRate: 'k-rate' },
      { name: 'rumbleLevel', defaultValue: 0.4, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'humLevel', defaultValue: 0, minValue: 0, maxValue: 0.01, automationRate: 'k-rate' },
      { name: 'progress', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'frictionLevel', defaultValue: 0.004, minValue: 0, maxValue: 0.05, automationRate: 'k-rate' },
      { name: 'tickLevel', defaultValue: 0, minValue: 0, maxValue: 0.2, automationRate: 'k-rate' },
      { name: 'microRate', defaultValue: 6, minValue: 0, maxValue: 60, automationRate: 'k-rate' },
      { name: 'popRate', defaultValue: 0.8, minValue: 0, maxValue: 8, automationRate: 'k-rate' },
      { name: 'burstRate', defaultValue: 0.12, minValue: 0, maxValue: 2, automationRate: 'k-rate' },
      { name: 'popAmp', defaultValue: 0.35, minValue: 0.05, maxValue: 1, automationRate: 'k-rate' },
      { name: 'decayMs', defaultValue: 12, minValue: 1, maxValue: 60, automationRate: 'k-rate' }
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

  _resetRng(seed) { this._rng = this._makeRng(seed); }

  _buildGrooveMap() {
    const rng = this._makeRng((this.seed ^ 0x85ebca6b) >>> 0);
    const events = [];
    const add = (r, kind, gate, amp, ch, both, sign) => {
      events.push({ r, kind, gate, amp, ch, both, sign });
    };
    // r = sqrt(u)：事件密度随内圈半径线性增加；kind 0 细碎、1 低频爆豆、2 划痕
    for (let i = 0; i < 1600; i++) {
      const r = Math.sqrt(rng());
      const roll = rng();
      const kind = roll < 0.86 ? 0 : roll < 0.98 ? 1 : 2;
      const gate = rng();
      const amp = kind === 0 ? 0.16 + rng() * 0.55
        : kind === 1 ? 0.22 + rng() * 0.62
          : 0.10 + rng() * 0.30;
      const ch = rng() < 0.5 ? 0 : 1;
      const both = rng() < 0.08;
      const sign = rng() > 0.5 ? 1 : -1;
      add(r, kind, gate, amp, ch, both, sign);
    }
    // 引入槽 / 导出槽的标记性划痕
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
    let lo = 0, hi = this._events.length;
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
      if (event.kind === 0) { if (ch === 0) this.crackleL += value; else this.crackleR += value; }
      else if (event.kind === 1) { if (ch === 0) this.popL += value; else this.popR += value; }
      else { if (ch === 0) this.scratchL += value; else this.scratchR += value; }
    }
  }

  _processGroove(progress, density) {
    if (!this._events.length) return;
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
      if (triggered < 4 && event.gate <= density) { this._triggerEvent(event); triggered++; }
    }
    this._lastProgress = progress;
  }

  process(inputs, outputs, parameters) {
    const out = outputs[0];
    if (!out || !out[0]) return true;
    const left = out[0];
    const right = out[1] || out[0];
    // 总线 1 = 机械冲击（微爆/爆豆/划痕/每转 tick）：唱针接触域，绕过 RIAA 去加重，
    // 只经唱头谐振与磨损滚降，保持点击的瞬态；
    // 总线 2 = 沟槽域噪声（嘶声/隆隆/摩擦/嗡声），与 trimmed 音乐同域汇合后过回放 EQ；
    // 总线 0 = 纯音乐（已刻纹预加重 + trim），避免噪声被音乐通路重复缩放。
    const imp = outputs[1] || [];
    const impL = imp[0];
    const impR = imp[1] || imp[0];
    const gbus = outputs[2] || [];
    const gL = gbus[0];
    const gR = gbus[1] || gbus[0];
    const inp = inputs[0] || [];
    const inL = inp[0];
    const inR = inp[1] || inL;

    const crackleLevel = parameters.crackleLevel[0] ?? 0;
    const hissLevel = parameters.hissLevel[0] ?? 0;
    const rumbleLevel = parameters.rumbleLevel[0] ?? 0;
    const humLevel = parameters.humLevel[0] ?? 0;
    const progress = parameters.progress[0] ?? 0;
    const frictionLevel = parameters.frictionLevel[0] ?? 0;
    const tickLevel = parameters.tickLevel[0] ?? 0;
    const microRate = parameters.microRate[0] ?? 0;
    const popRate = parameters.popRate[0] ?? 0;
    const burstRate = parameters.burstRate[0] ?? 0;
    const popAmp = parameters.popAmp[0] ?? 0.35;
    const decayMs = parameters.decayMs[0] ?? 12;

    const crackleScale = 1 + progress * 0.35;
    const density = Math.min(1.25, crackleLevel / 0.052);
    this._processGroove(progress, density);

    // 衰减系数由 decayMs 换算（每样本），爆豆/划痕/微爆共用族系
    const decCrackle = Math.exp(-1000 / (decayMs * 0.55 * sampleRate));
    const decPop = Math.exp(-1000 / (decayMs * 2.4 * sampleRate));
    const decScratch = Math.exp(-1000 / (decayMs * 1.3 * sampleRate));
    const decMicro = Math.exp(-1000 / (decayMs * 0.30 * sampleRate));
    const decBurst = Math.exp(-1000 / (decayMs * 6.0 * sampleRate));
    const pMicro = microRate / sampleRate;
    const pPop = popRate / sampleRate;
    const pBurst = burstRate / sampleRate;
    const revInc = (this.rpm / 60) / sampleRate;

    for (let i = 0; i < left.length; i++) {
      const ml = inL ? inL[i] : 0;
      const mr = inR ? inR[i] : ml;
      const whiteL = this._rng() * 2 - 1;
      const whiteR = this._rng() * 2 - 1;

      // 节目电平包络：针尖摩擦随电平起伏（大声段沟槽扰动更大）
      const rect = Math.abs(ml) + Math.abs(mr);
      this.env += (rect - this.env) * (rect > this.env ? 0.02 : 0.0015);

      // 嘶声：一阶高通，避免低频沙沙糊住人声
      this.hissL = 0.82 * (this.hissL + whiteL - this.hissPrevL);
      this.hissR = 0.82 * (this.hissR + whiteR - this.hissPrevR);
      this.hissPrevL = whiteL; this.hissPrevR = whiteR;

      // 针尖摩擦：带通白噪 × 包络
      const fL = whiteL - this.fricPrevL; this.fricPrevL = whiteL;
      const fR = whiteR - this.fricPrevR; this.fricPrevR = whiteR;
      this.fricL = 0.55 * this.fricL + 0.45 * fL;
      this.fricR = 0.55 * this.fricR + 0.45 * fR;
      const fric = frictionLevel * (0.25 + Math.min(1.6, this.env * 2.2));

      // 泊松事件：微爆 / 爆豆 / 划痕 burst，左右独立
      if (this._rng() < pMicro) {
        const a = (0.05 + this._rng() * 0.16) * (this._rng() > 0.5 ? 1 : -1);
        if (this._rng() < 0.5) this.microL += a; else this.microR += a;
      }
      if (this._rng() < pPop) {
        const a = popAmp * (0.35 + this._rng() * 0.65) * (this._rng() > 0.5 ? 1 : -1);
        if (this._rng() < 0.5) this.popL += a; else this.popR += a;
      }
      if (this._rng() < pBurst) {
        const a = popAmp * 0.3 * (0.3 + this._rng() * 0.7);
        if (this._rng() < 0.5) this.burstL += a; else this.burstR += a;
      }

      // 偏心 warp：每转一次的划痕 tick（worn 才露出）
      this.revPhase += revInc;
      let tick = 0;
      if (this.revPhase >= 1) {
        this.revPhase -= 1;
        if (tickLevel > 0 && this._rng() < 0.85) tick = tickLevel * (0.5 + this._rng() * 0.5);
      }

      this.crackleL *= decCrackle; this.crackleR *= decCrackle;
      this.popL *= decPop; this.popR *= decPop;
      this.scratchL *= decScratch; this.scratchR *= decScratch;
      this.microL *= decMicro; this.microR *= decMicro;
      this.burstL *= decBurst; this.burstR *= decBurst;

      // 结构传导隆隆 + 轴承慢 AM + 换向纹波（8 极电机每转 8 次）
      this.rumbleL = this.rumbleL * 0.985 + whiteL * 0.015;
      this.rumbleR = this.rumbleR * 0.985 + whiteR * 0.015;
      this.bearL = this.bearL * 0.9995 + whiteL * 0.0005;
      this.bearR = this.bearR * 0.9995 + whiteR * 0.0005;
      const comm = 1 + 0.18 * Math.sin(this.revPhase * Math.PI * 2 * 8);
      const bearAM = 1 + 0.35 * Math.sin(this.revPhase * Math.PI * 2 * 0.5);

      this.humPhase += 2 * Math.PI * 50 / sampleRate;
      if (this.humPhase > Math.PI * 2) this.humPhase -= Math.PI * 2;
      const hum = Math.sin(this.humPhase) * 0.62
        + Math.sin(this.humPhase * 2) * 0.24
        + Math.sin(this.humPhase * 3) * 0.09;

      const surfL = this.crackleL * crackleLevel * crackleScale
        + this.popL * crackleLevel * 0.9
        + this.scratchL * crackleLevel * 0.7
        + this.microL * crackleLevel * 1.5
        + this.burstL * crackleLevel * 0.8;
      const surfR = this.crackleR * crackleLevel * crackleScale
        + this.popR * crackleLevel * 0.9
        + this.scratchR * crackleLevel * 0.7
        + this.microR * crackleLevel * 1.5
        + this.burstR * crackleLevel * 0.8;
      const lowL = (this.rumbleL * 0.2 * comm + this.bearL * 0.6 * bearAM) * rumbleLevel;
      const lowR = (this.rumbleR * 0.2 * comm + this.bearR * 0.6 * bearAM) * rumbleLevel;

      const tickL = tick * (this._rng() > 0.5 ? 1 : -1);
      const tickR = tick * (this._rng() > 0.5 ? 1 : -1);
      const grooveL = this.hissL * hissLevel + this.fricL * fric + lowL + hum * humLevel;
      const grooveR = this.hissR * hissLevel + this.fricR * fric + lowR + hum * humLevel;

      left[i] = Math.max(-0.95, Math.min(0.95, ml));
      right[i] = Math.max(-0.95, Math.min(0.95, mr));
      if (impL) impL[i] = Math.max(-0.95, Math.min(0.95, surfL + tickL));
      if (impR) impR[i] = Math.max(-0.95, Math.min(0.95, surfR + tickR));
      if (gL) gL[i] = Math.max(-0.95, Math.min(0.95, grooveL));
      if (gR) gR[i] = Math.max(-0.95, Math.min(0.95, grooveR));
    }
    return true;
  }
}

registerProcessor('vinyl-noise', VinylNoiseProcessor);