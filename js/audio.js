/**
 * 程序合成的黑胶音效：底噪、落针、抽片。
 * 不含任何原曲片段。
 */
export class VinylAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.crackleGain = null;
    this.enabled = true;
    this.started = false;
    this._noiseBuffer = null;
  }

  async unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;

    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.enabled ? 0.9 : 0;
    this.master.connect(this.ctx.destination);

    this.startCrackle();
    this.started = true;
    if (this.ctx.state === 'suspended') await this.ctx.resume();
  }

  setEnabled(on) {
    this.enabled = on;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(on ? 0.9 : 0, now, 0.08);
  }

  /** 音乐播放时压低底噪，让原曲浮出来 */
  setDucking(on) {
    if (!this.ctx || !this.crackleGain) return;
    const now = this.ctx.currentTime;
    this.crackleGain.gain.setTargetAtTime(on ? 0.024 : 0.055, now, 0.3);
    if (this.rumbleGain) this.rumbleGain.gain.setTargetAtTime(on ? 0.22 : 0.5, now, 0.3);
  }

  /* ── 连续底噪 ─────────────────────────────────────────── */

  startCrackle() {
    const ctx = this.ctx;
    if (!this._noiseBuffer) this._noiseBuffer = this._buildCrackleBuffer(ctx);

    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuffer;
    src.loop = true;

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 190;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 6800;

    const gain = ctx.createGain();
    gain.gain.value = 0.055;
    this.crackleGain = gain;

    src.connect(hp).connect(lp).connect(gain).connect(this.master);
    src.start();

    // 极低频的房间底噪
    const rumble = ctx.createBufferSource();
    rumble.buffer = this._buildRumbleBuffer(ctx);
    rumble.loop = true;
    const rumbleLp = ctx.createBiquadFilter();
    rumbleLp.type = 'lowpass';
    rumbleLp.frequency.value = 140;
    const rumbleGain = ctx.createGain();
    rumbleGain.gain.value = 0.5;
    this.rumbleGain = rumbleGain;
    rumble.connect(rumbleLp).connect(rumbleGain).connect(this.master);
    rumble.start();
  }

  _buildCrackleBuffer(ctx) {
    const seconds = 7;
    const rate = ctx.sampleRate;
    const len = Math.floor(seconds * rate);
    const buffer = ctx.createBuffer(1, len, rate);
    const data = buffer.getChannelData(0);

    // 细密底噪
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.011;
    }

    // 随机爆豆
    const pops = 88;
    for (let p = 0; p < pops; p++) {
      const pos = Math.floor(Math.random() * (len - 2000));
      const amp = 0.12 + Math.random() * 0.55;
      const decay = 30 + Math.random() * 340;
      const sign = Math.random() > 0.5 ? 1 : -1;
      for (let i = 0; i < decay * 4 && pos + i < len; i++) {
        data[pos + i] += sign * amp * Math.exp(-i / decay) * (Math.random() * 0.7 + 0.3);
      }
    }

    // 周期性的轻微划痕
    for (let s = 0; s < 5; s++) {
      const pos = Math.floor((s + 0.35 + Math.random() * 0.3) * rate);
      for (let i = 0; i < 900 && pos + i < len; i++) {
        data[pos + i] += (Math.random() * 2 - 1) * 0.16 * Math.exp(-i / 90);
      }
    }

    return buffer;
  }

  _buildRumbleBuffer(ctx) {
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * 4);
    const buffer = ctx.createBuffer(1, len, rate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = last * 0.985 + (Math.random() * 2 - 1) * 0.015;
      data[i] = last;
    }
    return buffer;
  }

  /* ── 落针 ─────────────────────────────────────────────── */

  playNeedle() {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const rate = ctx.sampleRate;
    const dur = 0.9;
    const buffer = ctx.createBuffer(1, Math.floor(rate * dur), rate);
    const data = buffer.getChannelData(0);

    // 低频落地
    for (let i = 0; i < data.length; i++) {
      const time = i / rate;
      const thump = Math.sin(2 * Math.PI * 46 * time) * Math.exp(-time * 13) * 0.55;
      const click = (Math.random() * 2 - 1) * Math.exp(-time * 55) * 0.3;
      data[i] = thump + click;
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1500;
    const gain = ctx.createGain();
    gain.gain.value = 0.5;
    src.connect(lp).connect(gain).connect(this.master);
    src.start(t);

    // 针尖摩擦
    const hiss = ctx.createBufferSource();
    hiss.buffer = this._noiseBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2400;
    bp.Q.value = 0.7;
    const hg = ctx.createGain();
    hg.gain.setValueAtTime(0.0001, t);
    hg.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
    hg.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    hiss.connect(bp).connect(hg).connect(this.master);
    hiss.start(t);
    hiss.stop(t + 0.55);
  }

  /* ── 抽出唱片 ─────────────────────────────────────────── */

  playSleeve() {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const rate = ctx.sampleRate;
    const dur = 0.55;
    const buffer = ctx.createBuffer(1, Math.floor(rate * dur), rate);
    const data = buffer.getChannelData(0);

    let smooth = 0;
    for (let i = 0; i < data.length; i++) {
      const time = i / rate;
      const n = Math.random() * 2 - 1;
      smooth = smooth * 0.84 + n * 0.16;
      const env = Math.sin(Math.min(1, time / dur) * Math.PI);
      data[i] = smooth * env * 0.32;
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(900, t);
    bp.frequency.linearRampToValueAtTime(2100, t + dur);
    bp.Q.value = 0.9;
    const gain = ctx.createGain();
    gain.gain.value = 0.18;
    src.connect(bp).connect(gain).connect(this.master);
    src.start(t);
  }

  /* ── 沟槽声学：唱针越靠内圈，表面噪声越明显 ───────────── */
  setNeedleProgress(p) {
    if (!this.ctx || !this.crackleGain) return;
    const v = Math.min(1, Math.max(0, p || 0));
    const now = this.ctx.currentTime;
    this.crackleGain.gain.setTargetAtTime(0.055 + v * 0.042, now, 0.4);
  }

  /* ── 本地音频接入：干湿两路 + 生成式房间混响 ──────────── */
  attachElement(el) {
    if (!this.ctx || this._elemSrc) return;
    try {
      const src = this.ctx.createMediaElementSource(el);
      const dry = this.ctx.createGain();
      dry.gain.value = 0.94;
      const wet = this.ctx.createGain();
      wet.gain.value = 0.12;
      const conv = this.ctx.createConvolver();
      conv.buffer = this._buildRoomIR(1.7, 2.6);
      src.connect(dry).connect(this.master);
      src.connect(conv).connect(wet).connect(this.master);
      this._elemSrc = src;
    } catch {
      /* 不支持时元素直出 */
    }
  }

  _buildRoomIR(seconds, decay) {
    const rate = this.ctx.sampleRate;
    const len = Math.max(1, Math.floor(rate * seconds));
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }
}
