/**
 * 程序合成的黑胶音效：表面噪声、机械声、电机声与播放链音色。
 * 不含任何原曲片段。
 *
 * 设计原则：
 * 1. 噪声分层（hiss / crackle / pops / rumble / hum），不再用一段 7 秒 mono
 *    噪声循环充当全部底噪；
 * 2. 优先使用 AudioWorklet 在音频线程生成噪声，避免主线程定时器抖动；
 *    不支持时自动回退到预生成立体声缓冲；
 * 3. 只用 DelayNode 做 wow/flutter，绝不反复修改 HTMLAudio 的 playbackRate；
 * 4. 所有增益变化都走 setTargetAtTime，避免切换状态时出现咔哒。
 */

const CONDITION_PRESETS = {
  clean: { crackle: 0.030, hiss: 0.0065, rumble: 0.25, hum: 0, ios: 0.05 },
  daily: { crackle: 0.050, hiss: 0.0090, rumble: 0.40, hum: 0.00004, ios: 0.07 },
  worn: { crackle: 0.075, hiss: 0.0130, rumble: 0.55, hum: 0.00016, ios: 0.09 }
};

const CONDITION_NAMES = ['clean', 'daily', 'worn'];
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function hashSeed(value) {
  const str = String(value ?? 'vinyl');
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6D2B79F5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class VinylAudio {
  constructor(options = {}) {
    this.ctx = null;
    this.master = null;
    this.limiter = null;
    this.noiseBus = null;
    this.sfxBus = null;
    this.musicGain = null;
    this.enabled = true;
    this.started = false;
    this.iosFallback = Boolean(options.iosFallback);
    this._iosWebAudio = Boolean(options.iosWebAudio);
    this._iosSessionReady = false;
    this.iosNoise = null;
    this.iosStarted = false;
    this.ducking = false;
    this.cue = false;
    this.progress = 0;
    this._iosNoiseUrl = null;
    this._music = null;
    this._bufferGain = null;
    this._bufferSources = [];
    this._crackleBuffer = null;
    this._hissBuffer = null;
    this._rumbleBuffer = null;
    this._humBuffer = null;
    this._bufferGains = {};
    this._workletNode = null;
    this._workletGain = null;
    this._workletStarted = false;
    this._workletReady = false;
    this._workletSeed = 0;
    this._recordSeed = hashSeed('jay-vinyl');
    this._wear = 0;
    this._condition = 'daily';
    this._motorGain = null;
    this._motorOsc = [];
    this._rpm = 100 / 3;
    this._wowLfo = null;
    this._rippleLfo = null;
    this._flutterLfo = null;
    this._driftSource = null;
    this._lastNoiseError = null;
  }

  /**
   * iOS 17+ 在顶层页面允许把 Audio Session 声明为 playback，
   * 这样 Web Audio 可以穿过静音拨片；声明失败或旧 Safari 仍走媒体元素兜底。
   */
  claimPlaybackSession() {
    if (this.iosFallback) return false;
    if (typeof navigator === 'undefined' || !navigator.audioSession) return false;
    try {
      if (navigator.audioSession.type !== 'playback') {
        navigator.audioSession.type = 'playback';
      }
      this._iosSessionReady = navigator.audioSession.type === 'playback';
      return this._iosSessionReady;
    } catch {
      this._iosSessionReady = false;
      return false;
    }
  }

  async unlock() {
    // 必须在用户手势内先声明播放会话，再创建 / 恢复 AudioContext
    if (this._iosWebAudio) {
      const claimed = this.claimPlaybackSession();
      if (!claimed) this.iosFallback = true;
    }
    if (this.ctx) {
      this.claimPlaybackSession();
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;

    // playback 缓冲更从容，避免主线程忙时出现 underrun 式的断续
    this.ctx = new Ctx({ latencyHint: 'playback' });
    this.master = this.ctx.createGain();
    this.master.gain.value = this.enabled ? 0.9 : 0;
    this.master.connect(this.ctx.destination);

    // 总线限幅：噪声层和音乐层都经过这里，防止爆豆叠峰值削波
    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -6;
    this.limiter.knee.value = 6;
    this.limiter.ratio.value = 4;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.25;
    this.limiter.connect(this.master);

    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = 1;
    this.sfxBus.connect(this.limiter);

    this.noiseBus = this.ctx.createGain();
    this.noiseBus.gain.value = 1;
    this.noiseBus.connect(this.limiter);

    this._bufferGain = this.ctx.createGain();
    this._bufferGain.gain.value = 1;
    this._bufferGain.connect(this.noiseBus);

    this._buildNoiseBuffers();
    this._startBufferNoise();
    this._buildMotor();
    this.started = true;
    this._applyNoiseLevels();

    if (this.iosFallback) this._startIosBed();
    else this._startWorkletNoise();

    if (this.ctx.state === 'suspended') await this.ctx.resume();
  }

  setEnabled(on) {
    this.enabled = Boolean(on);
    if (this.iosNoise) {
      if (!this.enabled) {
        this.iosNoise.pause();
        this.iosNoise.volume = 0;
      } else if (!this.ducking && this.iosStarted) {
        this.iosNoise.volume = this._iosBedVolume();
        if (this.iosNoise.paused) this.iosNoise.play().catch(() => {});
      }
    }
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(this.enabled ? 0.9 : 0, now, 0.08);
  }

  /** 音乐播放状态：播放时压低底噪；iOS 播放时暂停独立底噪，避免双音频抢会话 */
  setDucking(on) {
    this.ducking = Boolean(on);
    if (this.iosNoise) {
      if (this.ducking) {
        this.iosNoise.pause();
        this.iosNoise.volume = 0;
      } else if (this.enabled) {
        this.iosStarted = true;
        this.iosNoise.volume = this._iosBedVolume();
        this.iosNoise.play().catch(() => {});
      }
    }
    if (!this.ctx) return;
    this._applyNoiseLevels();
    this._setMotor(this.ducking);
  }

  /** 手动 cue：只抬高沟槽噪声，不改变音乐播放状态 */
  setCue(on) {
    this.cue = Boolean(on);
    this._applyNoiseLevels();
  }

  /** 唱片状态：clean / daily / worn */
  setCondition(condition) {
    this._condition = CONDITION_NAMES.includes(condition) ? condition : 'daily';
    this._applyNoiseLevels();
    this._applyIosBedVolume();
  }

  /** 换唱片/换曲：确定性种子 + 累计磨损，决定噪底图案和密度 */
  setRecord({ seed, wear, condition } = {}) {
    if (seed !== undefined) {
      const nextSeed = hashSeed(seed);
      if (nextSeed !== this._recordSeed) {
        this._recordSeed = nextSeed;
        this._workletSeed = 0;
      }
    }
    if (wear !== undefined) this._wear = clamp(Number(wear) || 0, 0, 1);
    if (condition !== undefined) {
      this._condition = CONDITION_NAMES.includes(condition) ? condition : this._condition;
    }
    if (this._workletNode && this._workletSeed !== this._recordSeed) {
      this._workletSeed = this._recordSeed;
      this._workletNode.port.postMessage({ type: 'seed', seed: this._recordSeed });
    }
    this._applyNoiseLevels();
    this._applyIosBedVolume();
  }

  /* ── 噪声层 ───────────────────────────────────────────── */

  _buildNoiseBuffers() {
    if (!this.ctx || this._crackleBuffer) return;
    this._crackleBuffer = this._buildCrackleBuffer(this.ctx);
    this._hissBuffer = this._buildHissBuffer(this.ctx);
    this._rumbleBuffer = this._buildRumbleBuffer(this.ctx);
    this._humBuffer = this._buildHumBuffer(this.ctx);
  }

  _startBufferNoise() {
    const ctx = this.ctx;
    const crackle = ctx.createBufferSource();
    crackle.buffer = this._crackleBuffer;
    crackle.loop = true;
    const crackleHp = ctx.createBiquadFilter();
    crackleHp.type = 'highpass';
    crackleHp.frequency.value = 190;
    const crackleLp = ctx.createBiquadFilter();
    crackleLp.type = 'lowpass';
    crackleLp.frequency.value = 6800;
    const crackleGain = ctx.createGain();
    crackleGain.gain.value = 0.05;
    crackle.connect(crackleHp).connect(crackleLp).connect(crackleGain).connect(this._bufferGain);
    this._bufferGains.crackle = crackleGain;

    const hiss = ctx.createBufferSource();
    hiss.buffer = this._hissBuffer;
    hiss.loop = true;
    const hissBp = ctx.createBiquadFilter();
    hissBp.type = 'bandpass';
    hissBp.frequency.value = 10500;
    hissBp.Q.value = 0.55;
    const hissGain = ctx.createGain();
    hissGain.gain.value = 0.009;
    hiss.connect(hissBp).connect(hissGain).connect(this._bufferGain);
    this._bufferGains.hiss = hissGain;

    const rumble = ctx.createBufferSource();
    rumble.buffer = this._rumbleBuffer;
    rumble.loop = true;
    const rumbleLp = ctx.createBiquadFilter();
    rumbleLp.type = 'lowpass';
    rumbleLp.frequency.value = 140;
    const rumbleGain = ctx.createGain();
    rumbleGain.gain.value = 0.4;
    rumble.connect(rumbleLp).connect(rumbleGain).connect(this._bufferGain);
    this._bufferGains.rumble = rumbleGain;

    const hum = ctx.createBufferSource();
    hum.buffer = this._humBuffer;
    hum.loop = true;
    const humLp = ctx.createBiquadFilter();
    humLp.type = 'lowpass';
    humLp.frequency.value = 420;
    const humGain = ctx.createGain();
    humGain.gain.value = 0;
    hum.connect(humLp).connect(humGain).connect(this._bufferGain);
    this._bufferGains.hum = humGain;

    // 确定性种子：从 0..1 的相位开始，循环图案相同也能错开听感
    const phase = (this._recordSeed % 1000) / 1000;
    const startAt = this._crackleBuffer.duration * phase * 0.82;
    this._bufferSources = [crackle, hiss, rumble, hum];
    crackle.start(0, startAt);
    hiss.start(0, (this._hissBuffer.duration * phase * 0.7));
    rumble.start(0, (this._rumbleBuffer.duration * phase * 0.7));
    hum.start(0);
  }

  _stopBufferNoise() {
    for (const src of this._bufferSources) {
      try { src.stop(); } catch { /* already stopped */ }
    }
    this._bufferSources = [];
  }

  async _startWorkletNoise() {
    if (this._workletStarted || this.iosFallback || !this.ctx?.audioWorklet) {
      this._workletStarted = true;
      return;
    }
    this._workletStarted = true;
    try {
      const moduleUrl = new URL('./vinyl-worklet.js', import.meta.url);
      await this.ctx.audioWorklet.addModule(moduleUrl);
      if (!window.AudioWorkletNode) throw new Error('AudioWorkletNode unavailable');
      const node = new AudioWorkletNode(this.ctx, 'vinyl-noise', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        processorOptions: { seed: this._recordSeed }
      });
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      node.connect(gain).connect(this.noiseBus);
      this._workletNode = node;
      this._workletGain = gain;
      this._workletSeed = this._recordSeed;
      this._workletReady = true;
      this._applyNoiseLevels();

      const now = this.ctx.currentTime;
      gain.gain.setTargetAtTime(1, now, 0.12);
      this._bufferGain.gain.setTargetAtTime(0, now, 0.12);
      setTimeout(() => {
        if (this._workletReady) this._stopBufferNoise();
      }, 420);
    } catch (err) {
      this._lastNoiseError = String(err?.message || err);
      this._workletReady = false;
      // 回退到已经启动的立体声缓冲，不重新开始音乐
      console.info('AudioWorklet 不可用，使用缓冲噪底回退。', err);
    }
  }

  _applyNoiseLevels() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const preset = CONDITION_PRESETS[this._condition] || CONDITION_PRESETS.daily;
    const wear = clamp(this._wear, 0, 1);
    const progress = clamp(this.progress, 0, 1);
    const scale = this.cue ? 0.88 : this.ducking ? 0.56 : 1;
    const crackle = (preset.crackle + wear * 0.014 + progress * 0.009) * scale;
    const hiss = (preset.hiss + wear * 0.0018 + progress * 0.0010) * scale;
    const rumble = (preset.rumble + wear * 0.050) * scale;
    const hum = preset.hum + (this._condition === 'worn' ? 0.00010 : 0);

    const setGain = (gain, value, tau = 0.28) => {
      if (gain) gain.gain.setTargetAtTime(value, now, tau);
    };
    setGain(this._bufferGains.crackle, crackle);
    setGain(this._bufferGains.hiss, hiss);
    setGain(this._bufferGains.rumble, rumble);
    setGain(this._bufferGains.hum, hum);

    if (this._workletNode) {
      const setParam = (name, value, tau = 0.28) => {
        const param = this._workletNode?.parameters.get(name);
        if (param) param.setTargetAtTime(value, now, tau);
      };
      setParam('crackleLevel', crackle);
      setParam('hissLevel', hiss);
      setParam('rumbleLevel', rumble);
      setParam('humLevel', hum);
      setParam('progress', progress, 0.4);
    }
  }

  _buildCrackleBuffer(ctx) {
    const seconds = 16;
    const rate = ctx.sampleRate;
    const len = Math.floor(seconds * rate);
    const buffer = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      const rng = makeRng(this._recordSeed + ch * 7919);
      // 极低的表面底噪，真正的颗粒由稀疏爆豆和 burst 负责
      for (let i = 0; i < len; i++) data[i] = (rng() * 2 - 1) * 0.0025;

      // 细碎爆豆：约 5 次/秒，短、尖、左右独立
      const pops = 84;
      for (let p = 0; p < pops; p++) {
        const pos = Math.floor(rng() * (len - 2400));
        const amp = 0.10 + rng() * 0.42;
        const decay = 18 + rng() * 150;
        const sign = rng() > 0.5 ? 1 : -1;
        for (let i = 0; i < decay * 5 && pos + i < len; i++) {
          data[pos + i] += sign * amp * Math.exp(-i / decay) * (0.3 + rng() * 0.7);
        }
      }

      // 偶发划痕 burst：比单颗爆豆长，音量更克制
      for (let s = 0; s < 9; s++) {
        const pos = Math.floor(rng() * (len - 5000));
        const decay = 80 + rng() * 260;
        const amp = 0.03 + rng() * 0.10;
        for (let i = 0; i < decay * 6 && pos + i < len; i++) {
          data[pos + i] += (rng() * 2 - 1) * amp * Math.exp(-i / decay);
        }
      }

      // 首尾交叉淡化，循环接缝不出现“咔哒”
      const fade = Math.floor(rate * 0.22);
      for (let i = 0; i < fade; i++) {
        const t = i / fade;
        data[len - fade + i] = data[len - fade + i] * (1 - t) + data[i] * t;
      }
    }
    return buffer;
  }

  _buildHissBuffer(ctx) {
    const seconds = 8;
    const rate = ctx.sampleRate;
    const len = Math.floor(seconds * rate);
    const buffer = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      const rng = makeRng(this._recordSeed + 0x51ed + ch * 7919);
      for (let i = 0; i < len; i++) data[i] = rng() * 2 - 1;
      const fade = Math.floor(rate * 0.12);
      for (let i = 0; i < fade; i++) {
        const t = i / fade;
        data[len - fade + i] = data[len - fade + i] * (1 - t) + data[i] * t;
      }
    }
    return buffer;
  }

  _buildRumbleBuffer(ctx) {
    const seconds = 12;
    const rate = ctx.sampleRate;
    const len = Math.floor(seconds * rate);
    const buffer = ctx.createBuffer(2, len, rate);
    const rng = makeRng(this._recordSeed + 0x2b7e);
    let common = 0;
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const white = rng() * 2 - 1;
        common = common * 0.985 + white * 0.015;
        lp = lp * 0.985 + white * 0.015;
        data[i] = (common * 0.55 + lp * 0.45) * 0.20;
      }
      const fade = Math.floor(rate * 0.3);
      for (let i = 0; i < fade; i++) {
        const t = i / fade;
        data[len - fade + i] = data[len - fade + i] * (1 - t) + data[i] * t;
      }
    }
    return buffer;
  }

  _buildHumBuffer(ctx) {
    const seconds = 4;
    const rate = ctx.sampleRate;
    const len = Math.floor(seconds * rate);
    const buffer = ctx.createBuffer(2, len, rate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const t = i / rate;
      data[i] = (Math.sin(2 * Math.PI * 50 * t) * 0.62
        + Math.sin(2 * Math.PI * 100 * t) * 0.24
        + Math.sin(2 * Math.PI * 150 * t) * 0.09) * 0.02;
    }
    buffer.copyToChannel(data, 1);
    return buffer;
  }

  _buildMotor() {
    if (!this.ctx || this._motorGain) return;
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.noiseBus);
    this._motorGain = gain;
    // 低转速电机的低频嗡声，不作为主音色，只在播放时极轻地托住底盘
    for (const [freq, amp] of [[47, 0.55], [94, 0.20], [141, 0.08]]) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = amp;
      osc.connect(g).connect(gain);
      osc.start();
      this._motorOsc.push(osc);
    }
  }

  _setMotor(on) {
    if (!this._motorGain || !this.ctx) return;
    const now = this.ctx.currentTime;
    this._motorGain.gain.setTargetAtTime(on ? 0.0011 : 0.00018, now, 0.32);
  }

  /* ── 沟槽声学：唱针越靠内圈，表面噪声越明显、高频越收 ── */
  setNeedleProgress(p) {
    this.progress = clamp(Number(p) || 0, 0, 1);
    const now = this.ctx?.currentTime;
    if (now !== undefined) {
      if (this._music?.innerLp) {
        this._music.innerLp.frequency.setTargetAtTime(16000 - this.progress * 2100, now, 0.4);
      }
      if (this._music?.highShelf) {
        this._music.highShelf.gain.setTargetAtTime(-1.2 - this.progress * 1.1, now, 0.4);
      }
    }
    this._applyNoiseLevels();
  }

  /** 与唱盘转速锁定：33⅓ 转约 0.5556Hz，45 转 0.75Hz */
  setRpm(rpm) {
    this._rpm = Number(rpm) === 45 ? 45 : 100 / 3;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const base = this._rpm / 60;
    if (this._wowLfo) this._wowLfo.frequency.setTargetAtTime(base, now, 0.2);
    if (this._rippleLfo) this._rippleLfo.frequency.setTargetAtTime(base * 2, now, 0.2);
  }

  /* ── 音频接入：RIAA 近似倾斜 + 轻饱和 + wow/flutter，不用实时变速 ── */
  attachElement(el) {
    if (!this.ctx || this._elemSrc || !this.limiter) return;
    try {
      const src = this.ctx.createMediaElementSource(el);
      // 去超低频与直流；RIAA 只做回放端近似倾斜，不改动母带整体亮度
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 32;
      hp.Q.value = 0.6;
      const lowShelf = this.ctx.createBiquadFilter();
      lowShelf.type = 'lowshelf';
      lowShelf.frequency.value = 90;
      lowShelf.gain.value = 1.2;
      const highShelf = this.ctx.createBiquadFilter();
      highShelf.type = 'highshelf';
      highShelf.frequency.value = 12000;
      highShelf.gain.value = -1.2;
      const innerLp = this.ctx.createBiquadFilter();
      innerLp.type = 'lowpass';
      innerLp.frequency.value = 16000;
      innerLp.Q.value = 0.5;
      const warmth = this.ctx.createWaveShaper();
      const curve = new Float32Array(1024);
      for (let i = 0; i < curve.length; i++) {
        const x = (i / (curve.length - 1)) * 2 - 1;
        curve[i] = Math.tanh(x * 1.05) / 1.05;
      }
      warmth.curve = curve;
      warmth.oversample = 'none';

      // wow + flutter：主 wow 与唱盘转速锁定，叠加二次旋转纹波、慢速随机漂移
      // 和固定 flutter；全部只调制 DelayNode，不修改 playbackRate。
      const wow = this.ctx.createDelay(0.05);
      wow.delayTime.value = 0.015;
      const wowLfo = this.ctx.createOscillator();
      wowLfo.type = 'sine';
      wowLfo.frequency.value = this._rpm / 60;
      const wowDepth = this.ctx.createGain();
      wowDepth.gain.value = 0.00028;
      wowLfo.connect(wowDepth).connect(wow.delayTime);
      wowLfo.start();

      // 唱盘每转一次的二次谐波，让 wow 不再是完美正弦
      const rippleLfo = this.ctx.createOscillator();
      rippleLfo.type = 'sine';
      rippleLfo.frequency.value = (this._rpm / 60) * 2;
      const rippleDepth = this.ctx.createGain();
      rippleDepth.gain.value = 0.000035;
      rippleLfo.connect(rippleDepth).connect(wow.delayTime);
      rippleLfo.start();

      // 很慢的机械漂移：24 秒周期内的三个低频分量，幅度极小
      const driftBuffer = this.ctx.createBuffer(1, 8000 * 24, 8000);
      const driftData = driftBuffer.getChannelData(0);
      const phase = (this._recordSeed >>> 0) % 3600 / 3600 * Math.PI * 2;
      for (let i = 0; i < driftData.length; i++) {
        const t = i / 8000;
        driftData[i] = Math.sin(2 * Math.PI * t / 24 + phase) * 0.55
          + Math.sin(2 * Math.PI * t * 2 / 24 + phase * 1.7) * 0.30
          + Math.sin(2 * Math.PI * t * 3 / 24 + phase * 2.3) * 0.15;
      }
      const driftSource = this.ctx.createBufferSource();
      driftSource.buffer = driftBuffer;
      driftSource.loop = true;
      const driftDepth = this.ctx.createGain();
      driftDepth.gain.value = 0.000065;
      driftSource.connect(driftDepth).connect(wow.delayTime);
      driftSource.start();

      const flutterLfo = this.ctx.createOscillator();
      flutterLfo.type = 'sine';
      flutterLfo.frequency.value = 7.2;
      const flutterDepth = this.ctx.createGain();
      flutterDepth.gain.value = 0.000045;
      flutterLfo.connect(flutterDepth).connect(wow.delayTime);
      flutterLfo.start();

      this._wowLfo = wowLfo;
      this._rippleLfo = rippleLfo;
      this._flutterLfo = flutterLfo;
      this._driftSource = driftSource;

      const dry = this.ctx.createGain();
      dry.gain.value = 0.96;

      src.connect(hp).connect(lowShelf).connect(highShelf).connect(innerLp)
        .connect(warmth).connect(wow).connect(dry).connect(this.limiter);
      this._music = {
        src, hp, lowShelf, highShelf, innerLp, warmth, wow, wowLfo,
        rippleLfo, flutterLfo, driftSource, dry
      };
      this.musicGain = dry;
      this._elemSrc = src;
      this.setNeedleProgress(this.progress);
      this.setRpm(this._rpm);
    } catch (err) {
      // 不支持时元素直出（iOS 静音拨片路径也走这里）
      console.info('Web Audio 播放链接入失败，使用元素直出。', err);
    }
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
    src.connect(bp).connect(gain).connect(this.sfxBus);
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

    // 低频落地 + 高频点击
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
    src.connect(lp).connect(gain).connect(this.sfxBus);
    src.start(t);

    // 针尖摩擦：取同一份立体声噪底，不额外生成第三套噪声
    if (this._crackleBuffer) {
      const hiss = ctx.createBufferSource();
      hiss.buffer = this._crackleBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2400;
      bp.Q.value = 0.7;
      const hg = ctx.createGain();
      hg.gain.setValueAtTime(0.0001, t);
      hg.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
      hg.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      hiss.connect(bp).connect(hg).connect(this.sfxBus);
      hiss.start(t);
      hiss.stop(t + 0.55);
    }
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
    src.connect(bp).connect(gain).connect(this.sfxBus);
    src.start(t);
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
    el.volume = 0;
    el.style.display = 'none';
    document.body.appendChild(el);
    this.iosNoise = el;
  }

  _iosBedVolume() {
    const preset = CONDITION_PRESETS[this._condition] || CONDITION_PRESETS.daily;
    return preset.ios;
  }

  _applyIosBedVolume() {
    if (!this.iosNoise || !this.enabled) return;
    this.iosNoise.volume = this.ducking ? 0 : this._iosBedVolume();
  }

  _buildIosNoiseUrl() {
    const rate = 16000;
    const seconds = 8;
    const frames = rate * seconds;
    const channels = 2;
    const bytes = frames * channels * 2;
    const buffer = new ArrayBuffer(44 + bytes);
    const view = new DataView(buffer);
    const write = (off, str) => {
      for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i));
    };
    write(0, 'RIFF');
    view.setUint32(4, 36 + bytes, true);
    write(8, 'WAVE');
    write(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, rate, true);
    view.setUint32(28, rate * channels * 2, true);
    view.setUint16(32, channels * 2, true);
    view.setUint16(34, 16, true);
    write(36, 'data');
    view.setUint32(40, bytes, true);
    const pcm = new Int16Array(buffer, 44, frames * channels);
    const rng = makeRng(this._recordSeed + 0x10ad);
    const lows = [0, 0];
    for (let i = 0; i < frames; i++) {
      const t = i / rate;
      for (let ch = 0; ch < channels; ch++) {
        const white = rng() * 2 - 1;
        lows[ch] = lows[ch] * 0.985 + white * 0.015;
        const rumble = lows[ch] * 0.2;
        const hiss = white * 0.006;
        const hum = Math.sin(2 * Math.PI * 50 * t) * 0.0002;
        pcm[i * channels + ch] = Math.max(-32767, Math.min(32767,
          Math.round((hiss + rumble + hum) * 32767)));
      }
    }
    // 稀疏爆豆
    for (let k = 0; k < 80; k++) {
      const pos = Math.floor(rng() * (frames - 1400));
      const amp = (0.04 + rng() * 0.20) * 32767 * (rng() > 0.5 ? 1 : -1);
      const decay = 18 + rng() * 120;
      const ch = rng() > 0.5 ? 0 : 1;
      for (let j = 0; j < decay * 5 && pos + j < frames; j++) {
        const idx = (pos + j) * channels + ch;
        const v = pcm[idx] + amp * Math.exp(-j / decay);
        pcm[idx] = Math.max(-32767, Math.min(32767, v));
      }
    }
    // 首尾 0.25 秒交叉淡化
    const fade = Math.floor(rate * 0.25);
    for (let ch = 0; ch < channels; ch++) {
      for (let j = 0; j < fade; j++) {
        const t = j / fade;
        const tail = (frames - fade + j) * channels + ch;
        const head = j * channels + ch;
        pcm[tail] = Math.round(pcm[tail] * (1 - t) + pcm[head] * t);
      }
    }
    return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
  }

  get debug() {
    const params = this._workletNode?.parameters;
    return {
      engine: this._workletReady ? 'audioworklet' : 'buffer',
      workletReady: this._workletReady,
      workletError: this._lastNoiseError,
      condition: this._condition,
      wear: this._wear,
      progress: this.progress,
      rpm: this._rpm,
      iosFallback: this.iosFallback,
      iosSessionReady: this._iosSessionReady,
      ducking: this.ducking,
      cue: this.cue,
      levels: this._bufferGains.crackle ? {
        crackle: this._bufferGains.crackle.gain.value,
        hiss: this._bufferGains.hiss?.gain.value,
        rumble: this._bufferGains.rumble?.gain.value,
        hum: this._bufferGains.hum?.gain.value
      } : null,
      workletLevels: params ? {
        crackle: params.get('crackleLevel')?.value,
        hiss: params.get('hissLevel')?.value,
        rumble: params.get('rumbleLevel')?.value,
        hum: params.get('humLevel')?.value,
        progress: params.get('progress')?.value
      } : null
    };
  }
}
