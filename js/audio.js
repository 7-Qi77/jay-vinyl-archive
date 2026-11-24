/**
 * 程序合成的黑胶音效：底噪、落针、抽片。
 * 不含任何原曲片段。
 */
export class VinylAudio {
  constructor(options = {}) {
    this.ctx = null;
    this.master = null;
    this.crackleGain = null;
    this.hissGain = null;
    this.musicGain = null;
    this.enabled = true;
    this.started = false;
    this._noiseBuffer = null;
    this.iosFallback = Boolean(options.iosFallback);
    this.iosNoise = null;
    this._iosNoiseUrl = null;
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
    if (this.iosFallback) this._startIosBed();
    this.started = true;
    if (this.ctx.state === 'suspended') await this.ctx.resume();
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.iosNoise) {
      this.iosNoise.volume = on ? 0.05 : 0;
      if (on) this.iosNoise.play().catch(() => {});
      else this.iosNoise.pause();
    }
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(on ? 0.9 : 0, now, 0.08);
  }

  /** 音乐播放时压低底噪，让原曲浮出来 */
  setDucking(on) {
    if (this.iosNoise) {
      this.iosNoise.volume = on ? 0.05 : 0.08;
      if (on && this.enabled) this.iosNoise.play().catch(() => {});
    }
    if (!this.ctx || !this.crackleGain) return;
    const now = this.ctx.currentTime;
    this.crackleGain.gain.setTargetAtTime(on ? 0.032 : 0.06, now, 0.3);
    if (this.hissGain) this.hissGain.gain.setTargetAtTime(on ? 0.006 : 0.012, now, 0.3);
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

    // 极轻的高频“磁带嘶”，给数字音源一点颗粒
    const hiss = ctx.createBufferSource();
    hiss.buffer = this._buildHissBuffer(ctx);
    hiss.loop = true;
    const hissBp = ctx.createBiquadFilter();
    hissBp.type = 'bandpass';
    hissBp.frequency.value = 10500;
    hissBp.Q.value = 0.55;
    const hissGain = ctx.createGain();
    hissGain.gain.value = 0.01;
    this.hissGain = hissGain;
    hiss.connect(hissBp).connect(hissGain).connect(this.master);
    hiss.start();

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

  _buildHissBuffer(ctx) {
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * 4);
    const buffer = ctx.createBuffer(1, len, rate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.02;
    }
    return buffer;
  }

  /* ── 抬臂：轻微机械声 ─────────────────────────────────── */

  playArmLift() {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const rate = ctx.sampleRate;
    const dur = 0.16;
    const buffer = ctx.createBuffer(1, Math.floor(rate * dur), rate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const time = i / rate;
      data[i] = (Math.random() * 2 - 1) * Math.exp(-time * 40) * 0.35
        + Math.sin(2 * Math.PI * 120 * time) * Math.exp(-time * 24) * 0.12;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1800;
    bp.Q.value = 1.1;
    const gain = ctx.createGain();
    gain.gain.value = 0.28;
    src.connect(bp).connect(gain).connect(this.master);
    src.start(t);
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
    this.crackleGain.gain.setTargetAtTime(0.032 + v * 0.03, now, 0.4);
    if (this.hissGain) this.hissGain.gain.setTargetAtTime(0.006 + v * 0.004, now, 0.4);
  }

  /* ── 本地音频接入：干湿两路 + 生成式房间混响 ──────────── */
  attachElement(el) {
    if (!this.ctx || this._elemSrc) return;
    try {
      const src = this.ctx.createMediaElementSource(el);
      // 黑胶化：去超低频、轻收高频、极轻饱和，保留原曲清晰度
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 30;
      hp.Q.value = 0.6;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 15800;
      lp.Q.value = 0.5;
      const warmth = this.ctx.createWaveShaper();
      const curve = new Float32Array(1024);
      for (let i = 0; i < curve.length; i++) {
        const x = (i / (curve.length - 1)) * 2 - 1;
        curve[i] = Math.tanh(x * 1.1) / 1.1;
      }
      warmth.curve = curve;
      warmth.oversample = '2x';

      const dry = this.ctx.createGain();
      dry.gain.value = 0.94;
      const wet = this.ctx.createGain();
      wet.gain.value = 0.12;
      const conv = this.ctx.createConvolver();
      conv.buffer = this._buildRoomIR(1.7, 2.6);

      src.connect(hp).connect(lp).connect(warmth);
      warmth.connect(dry).connect(this.master);
      warmth.connect(conv).connect(wet).connect(this.master);
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

  /* ── iOS 兜底底噪：Web Audio 会被静音拨片整体静音，改走独立 <audio> ── */
  _startIosBed() {
    if (this.iosNoise || !this.enabled) return;
    if (!this._iosNoiseUrl) this._iosNoiseUrl = this._buildIosNoiseUrl();
    const el = document.createElement('audio');
    el.loop = true;
    el.preload = 'auto';
    el.playsInline = true;
    el.setAttribute('playsinline', '');
    el.setAttribute('aria-hidden', 'true');
    el.src = this._iosNoiseUrl;
    el.volume = 0.05;
    el.style.display = 'none';
    document.body.appendChild(el);
    this.iosNoise = el;
  }

  _buildIosNoiseUrl() {
    const rate = 16000;
    const seconds = 6;
    const n = rate * seconds;
    const buffer = new ArrayBuffer(44 + n * 2);
    const view = new DataView(buffer);
    const write = (off, str) => {
      for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i));
    };
    write(0, 'RIFF');
    view.setUint32(4, 36 + n * 2, true);
    write(8, 'WAVE');
    write(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, rate, true);
    view.setUint32(28, rate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    write(36, 'data');
    view.setUint32(40, n * 2, true);
    const pcm = new Int16Array(buffer, 44, n);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const base = (Math.random() * 2 - 1) * 0.012;
      lp = lp * 0.985 + base * 0.015;
      pcm[i] = Math.max(-32767, Math.min(32767, Math.round((base + lp * 0.8) * 32767 * 0.6)));
    }
    // 稀疏爆豆，模拟针尖过沟槽
    for (let k = 0; k < 72; k++) {
      const pos = Math.floor(Math.random() * (n - 1200));
      const amp = (0.06 + Math.random() * 0.32) * 32767 * (Math.random() > 0.5 ? 1 : -1);
      const decay = 24 + Math.random() * 180;
      for (let j = 0; j < decay * 4 && pos + j < n; j++) {
        const v = pcm[pos + j] + amp * Math.exp(-j / decay);
        pcm[pos + j] = Math.max(-32767, Math.min(32767, v));
      }
    }
    // 首尾 0.25s 交叉淡化，循环接缝不咔哒
    const fade = Math.floor(rate * 0.25);
    for (let j = 0; j < fade; j++) {
      const t = j / fade;
      pcm[n - fade + j] = Math.round(pcm[n - fade + j] * (1 - t) + pcm[j] * t);
    }
    return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
  }
}
