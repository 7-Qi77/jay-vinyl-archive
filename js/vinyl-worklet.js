/**
 * 黑胶噪声发生器：运行在 AudioWorklet 音频线程，不依赖主线程定时器。
 * 分层：hiss / crackle / pops / rumble / hum。
 * 输出增益由主线程通过 AudioParam 平滑控制，避免切换状态时出现咔哒。
 */
class VinylNoiseProcessor extends AudioWorkletProcessor {
  constructor(options = {}) {
    super();
    this.seed = options?.processorOptions?.seed || 0x9e3779b9;
    this._resetRng(this.seed);
    this.crackleL = 0;
    this.crackleR = 0;
    this.popL = 0;
    this.popR = 0;
    this.rumbleL = 0;
    this.rumbleR = 0;
    this.humPhase = 0;
    this.port.onmessage = (event) => {
      if (event.data?.type === 'seed') {
        this.seed = event.data.seed >>> 0;
        this._resetRng(this.seed);
        this.crackleL = this.crackleR = 0;
        this.popL = this.popR = 0;
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

  _resetRng(seed) {
    let a = seed >>> 0;
    this._rng = () => {
      a += 0x6D2B79F5;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
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

    for (let i = 0; i < left.length; i++) {
      const whiteL = this._rng() * 2 - 1;
      const whiteR = this._rng() * 2 - 1;

      // 细碎爆豆：左右独立触发，短衰减
      if (this._rng() < 0.000085) {
        this.crackleL = (0.25 + this._rng() * 0.75) * (this._rng() > 0.5 ? 1 : -1);
      }
      if (this._rng() < 0.000085) {
        this.crackleR = (0.25 + this._rng() * 0.75) * (this._rng() > 0.5 ? 1 : -1);
      }
      this.crackleL *= 0.9975;
      this.crackleR *= 0.9975;

      // 更长的低频爆豆，频率更低
      if (this._rng() < 0.0000055) {
        this.popL = (0.15 + this._rng() * 0.55) * (this._rng() > 0.5 ? 1 : -1);
      }
      if (this._rng() < 0.0000055) {
        this.popR = (0.15 + this._rng() * 0.55) * (this._rng() > 0.5 ? 1 : -1);
      }
      this.popL *= 0.9996;
      this.popR *= 0.9996;

      // 结构传导 rumble：低频噪声，左右共享一部分，少量去相关
      this.rumbleL = this.rumbleL * 0.985 + whiteL * 0.015;
      this.rumbleR = this.rumbleR * 0.985 + whiteR * 0.015;

      // 50Hz 市电嗡声与二次谐波，只在状态需要时抬到可闻
      this.humPhase += 2 * Math.PI * 50 / sampleRate;
      if (this.humPhase > Math.PI * 2) this.humPhase -= Math.PI * 2;
      const hum = Math.sin(this.humPhase) * 0.62
        + Math.sin(this.humPhase * 2) * 0.24
        + Math.sin(this.humPhase * 3) * 0.09;

      let l = whiteL * hissLevel
        + this.crackleL * crackleLevel * crackleScale
        + this.popL * crackleLevel * 0.9
        + this.rumbleL * 0.2 * rumbleLevel
        + hum * humLevel;
      let r = whiteR * hissLevel
        + this.crackleR * crackleLevel * crackleScale
        + this.popR * crackleLevel * 0.9
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
