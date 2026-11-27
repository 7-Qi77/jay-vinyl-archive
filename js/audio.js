/**
 * 程序合成的黑胶物理链：刻纹预加重 → wow/flutter → 沟槽（追踪失真/表面事件/摩擦/隆隆/嗡声）
 * → RIAA 回放去加重 → 唱头谐振 → 限幅。不含任何原曲片段。
 *
 * 设计原则：
 * 1. 噪声在「沟槽级」注入、之后才过 RIAA 回放 EQ：嘶声被去加重滚降、隆隆被抬升，
 *    与真实唱针拾取顺序一致（vinyl-simulator 的 recording/playback round-trip 思路）；
 * 2. RIAA 用 50/500/2122Hz 三时间常数的精确一阶节级联（IIRFilterNode），
 *    刻纹节与回放节互为逆 → 往返幅频平直，色染只来自沟槽非线性；
 * 3. 优先 AudioWorklet 在音频线程生成噪声与表面事件；不支持时回退预生成立体声缓冲；
 * 4. wow/flutter/偏心 warp 只调制 DelayNode 与增益，绝不改 HTMLAudio 的 playbackRate；
 * 5. 所有增益变化走 setTargetAtTime，避免切换咔哒；
 * 6. 参数可由「压碟档案」(setProfile) 逐曲驱动，clean/daily/worn 保留为全局偏移。
 * 7. 原声模式绕过 RIAA、噪声、机械调制与限幅；黑胶模式才启用完整物理链。
 */

const CONDITION_PRESETS = {
  clean: { crackle: 0.030, hiss: 0.0065, rumble: 0.25, hum: 0, ios: 0.05 },
  daily: { crackle: 0.050, hiss: 0.0090, rumble: 0.40, hum: 0.00004, ios: 0.07 },
  worn: { crackle: 0.075, hiss: 0.0130, rumble: 0.55, hum: 0.00016, ios: 0.09 }
};

const CONDITION_NAMES = ['clean', 'daily', 'worn'];
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/* RIAA 时间常数：3180µs(50Hz) / 318µs(500Hz) / 75µs(2122Hz)；
   τp 为刻纹高频节的补充极点(~21kHz)，保证真 Proper 且与回放节严格互逆。 */
const T1 = 3180e-6, T2 = 318e-6, T3 = 75e-6, TP = 7.5e-6;

function riaaSections(ctx) {
  const k = 2 * ctx.sampleRate;
  const sec = (ta, tb) => {
    const d = 1 + k * tb;
    return { b: [(1 + k * ta) / d, (1 - k * ta) / d], a: [1, (1 - k * tb) / d] };
  };
  return {
    rec: [sec(T1, T2), sec(T3, TP)],
    play: [sec(T2, T1), sec(TP, T3)]
  };
}

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
    this._directGain = null;
    this._vinylGain = null;
    this.mode = options.mode === 'vinyl' ? 'vinyl' : 'reference';
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
    this._profile = null;
    this._motorGain = null;
    this._motorOsc = [];
    this._rpm = 100 / 3;
    this._wowLfo = null;
    this._rippleLfo = null;
    this._flutterLfo = null;
    this._eccLfo = null;
    this._warpLfo = null;
    this._driftSource = null;
    this._depths = {};
    this._grooveBus = null;
    this._musicPathGain = null;
    this._warpAmp = null;
    this._tracing = null;
    this._innerLp = null;
    this._cart = null;
    this._wearShelf = null;
    this._innerOuter = 16000;
    this._innerInner = 11000;
    this._hfLoss = 1.2;
    this._lastNoiseError = null;
  }

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

    this.ctx = new Ctx({ latencyHint: 'playback' });
    this.master = this.ctx.createGain();
    this.master.gain.value = this.enabled ? 1 : 0;
    this.master.connect(this.ctx.destination);

    this._directGain = this.ctx.createGain();
    this._directGain.gain.value = this.mode === 'reference' ? 1 : 0;
    this._directGain.connect(this.master);

    this._vinylGain = this.ctx.createGain();
    this._vinylGain.gain.value = this.mode === 'vinyl' ? 1 : 0;
    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -1;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.12;
    this.limiter.connect(this._vinylGain);
    this._vinylGain.connect(this.master);

    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = this.mode === 'vinyl' ? 1 : 0;
    this.sfxBus.connect(this.limiter);

    // 沟槽总线：音乐（worklet 携带或直连）+ 噪底 + 电机都汇到这里，之后才过回放 EQ。
    // 沟槽总线：trimmed 音乐 + 沟槽噪声（噪底/worklet 总线 2）汇流，之后过回放 EQ。
    // 音乐在追踪失真前已 trim 0.05（预加重峰值 ~×14，防 waveshaper 硬夹）；
    // 噪声统一经 grooveTrim 0.05 进入同域；回放端 makeup ×20 复原，净增益 1。
    this._grooveTrim = this.ctx.createGain();
    this._grooveTrim.gain.value = 0.05;
    this._grooveBus = this.ctx.createGain();
    this._grooveBus.gain.value = 1;
    this._grooveTrim.connect(this._grooveBus);
    this._warpAmp = this.ctx.createGain();
    this._warpAmp.gain.value = 1;
    this._grooveBus.connect(this._warpAmp);
    this._makeup = this.ctx.createGain();
    this._makeup.gain.value = 20;
    this._warpAmp.connect(this._makeup);
    this._buildPlaybackEq(this.ctx, this._makeup, this.limiter);

    this.noiseBus = this.ctx.createGain();
    this.noiseBus.gain.value = 1;
    this.noiseBus.connect(this._grooveTrim);

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

  /* 回放端：RIAA 去加重 → 唱头谐振峰 → 磨损高频滚降 */
  _buildPlaybackEq(ctx, input, output) {
    let node = input;
    if (ctx.createIIRFilter) {
      const { play } = riaaSections(ctx);
      for (const s of play) {
        const f = ctx.createIIRFilter(s.b, s.a);
        node.connect(f);
        node = f;
      }
    } else {
      // 老浏览器回退：两段 shelf 近似
      const ls = ctx.createBiquadFilter();
      ls.type = 'lowshelf'; ls.frequency.value = 90; ls.gain.value = 1.2;
      const hs = ctx.createBiquadFilter();
      hs.type = 'highshelf'; hs.frequency.value = 12000; hs.gain.value = -1.2;
      node.connect(ls); ls.connect(hs); node = hs;
    }
    this._cart = ctx.createBiquadFilter();
    this._cart.type = 'peaking';
    this._cart.frequency.value = 9500;
    this._cart.Q.value = 0.9;
    this._cart.gain.value = 1.2;
    this._wearShelf = ctx.createBiquadFilter();
    this._wearShelf.type = 'highshelf';
    this._wearShelf.frequency.value = 10000;
    this._wearShelf.gain.value = -this._hfLoss;
    node.connect(this._cart);
    this._cart.connect(this._wearShelf);
    this._wearShelf.connect(output);
    this.musicGain = this._wearShelf;
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
    this.master.gain.setTargetAtTime(this.enabled ? 1 : 0, now, 0.08);
  }

  setMode(mode) {
    this.mode = mode === 'vinyl' ? 'vinyl' : 'reference';
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const ramp = (param, value, tau = 0.045) => {
      param.cancelScheduledValues(now);
      param.setTargetAtTime(value, now, tau);
    };
    ramp(this._directGain.gain, this.mode === 'reference' ? 1 : 0);
    ramp(this._vinylGain.gain, this.mode === 'vinyl' ? 1 : 0);
    ramp(this.sfxBus.gain, this.mode === 'vinyl' ? 1 : 0);
    this._setMotor(this.mode === 'vinyl' && this.ducking);
    this._applyIosBedVolume();
  }

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

  setCue(on) {
    this.cue = Boolean(on);
    this._applyNoiseLevels();
  }

  setCondition(condition) {
    this._condition = CONDITION_NAMES.includes(condition) ? condition : 'daily';
    this._applyNoiseLevels();
    this._applyIosBedVolume();
  }

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
    this._applyProfileTone();
  }

  /** 压碟档案：逐曲驱动噪声 taxonomy / 机械深度 / 唱头 / 磨损音色 */
  setProfile(profile) {
    this._profile = profile || null;
    if (profile) {
      this.setRecord({
        seed: profile.seed ?? profile.id,
        wear: profile.wear,
        condition: profile.condition
      });
    }
    this._applyNoiseLevels();
    this._applyProfileTone();
    this._applyMechanics();
  }

  _noiseBase() {
    const preset = CONDITION_PRESETS[this._condition] || CONDITION_PRESETS.daily;
    const p = this._profile?.noise;
    return p ? { ...preset, ...p } : preset;
  }

  _applyNoiseLevels() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const base = this._noiseBase();
    const wear = clamp(this._wear, 0, 1);
    const progress = clamp(this.progress, 0, 1);
    const scale = this.cue ? 0.88 : this.ducking ? 0.56 : 1;
    const crackle = (base.crackle + wear * 0.014 + progress * 0.009) * scale;
    const hiss = (base.hiss + wear * 0.0018 + progress * 0.0010) * scale;
    const rumble = (base.rumble + wear * 0.050) * scale;
    const hum = base.hum + (this._condition === 'worn' ? 0.00010 : 0);

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
      setParam('frictionLevel', (base.friction ?? 0.004) * scale);
      setParam('microRate', base.microRate ?? 6);
      setParam('popRate', base.popRate ?? 0.8);
      setParam('burstRate', base.burstRate ?? 0.12);
      setParam('popAmp', base.popAmp ?? 0.35);
      setParam('decayMs', base.decayMs ?? 12);
      const tick = base.tick ?? 0;
      setParam('tickLevel', tick + (wear > 0.45 ? (wear - 0.45) * 0.10 : 0));
    }
  }

  /* 唱头/磨损/内圈/追踪失真：档案 + 磨损 + 唱针位置共同决定 */
  _applyProfileTone() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const p = this._profile || {};
    const wear = clamp(this._wear, 0, 1);
    const progress = clamp(this.progress, 0, 1);
    if (this._cart) {
      const c = p.cartridge || {};
      this._cart.frequency.setTargetAtTime(c.freq ?? 9500, now, 0.3);
      this._cart.gain.setTargetAtTime(c.gain ?? 1.2, now, 0.3);
      this._cart.Q.setTargetAtTime(c.q ?? 0.9, now, 0.3);
    }
    this._hfLoss = (p.hfLoss ?? 1.2) + wear * 1.4;
    if (this._wearShelf) {
      this._wearShelf.gain.setTargetAtTime(-this._hfLoss - progress * 1.1, now, 0.4);
    }
    const inner = p.inner || {};
    this._innerOuter = inner.outer ?? 16000;
    this._innerInner = inner.inner ?? 11000;
    if (this._innerLp) {
      this._innerLp.frequency.setTargetAtTime(
        this._innerOuter - progress * (this._innerOuter - this._innerInner), now, 0.4);
    }
    if (this._tracing) {
      const drive = 1.05 + wear * 0.6 + progress * 0.45 + (p.glare ?? 0) * 0.6;
      const curve = new Float32Array(1024);
      for (let i = 0; i < curve.length; i++) {
        const x = (i / (curve.length - 1)) * 2 - 1;
        curve[i] = Math.tanh(x * drive) / drive;
      }
      this._tracing.curve = curve;
    }
  }

  /* 机械深度：wow / 二次纹波 / 漂移 / flutter / 偏心 warp，全部只调制 Delay 与增益 */
  _applyMechanics() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const p = this._profile?.mechanics || {};
    const base = this._rpm / 60;
    const depthFor = (pct, freq) => pct / (2 * Math.PI * freq);
    const set = (key, pct, freq) => {
      const g = this._depths[key];
      if (g) g.gain.setTargetAtTime(depthFor(pct, freq), now, 0.3);
    };
    set('wow', p.wowPct ?? 0.0009, base);
    set('ripple', p.ripplePct ?? 0.00012, base * 2);
    set('drift', p.driftPct ?? 0.00022, 1 / 24);
    set('flutter', p.flutterPct ?? 0.00030, 7.2);
    set('ecc', p.eccPct ?? 0.0004, base);
    if (this._warpAmp && this._depths.warpAmp) {
      this._depths.warpAmp.gain.setTargetAtTime((p.eccPct ?? 0.0004) * 0.45, now, 0.3);
    }
  }

  setNeedleProgress(p) {
    const v = Number(p);
    this.progress = Number.isFinite(v) ? clamp(v, 0, 1) : this.progress;
    this._applyNoiseLevels();
    this._applyProfileTone();
  }

  setRpm(rpm) {
    this._rpm = Number(rpm) === 45 ? 45 : 100 / 3;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const base = this._rpm / 60;
    for (const [lfo, mult] of [[this._wowLfo, 1], [this._rippleLfo, 2], [this._eccLfo, 1], [this._warpLfo, 1]]) {
      if (lfo) lfo.frequency.setTargetAtTime(base * mult, now, 0.2);
    }
    this._workletNode?.port.postMessage({ type: 'rpm', rpm: this._rpm });
    this._applyMechanics();
  }

  /* ── 音乐接入：刻纹预加重 → wow → 沟槽带限/追踪 → 沟槽总线 ── */
  attachElement(el) {
    if (!this.ctx || this._elemSrc || !this.limiter) return;
    try {
      const ctx = this.ctx;
      const src = ctx.createMediaElementSource(el);
      src.connect(this._directGain);
      let node = src;
      if (ctx.createIIRFilter) {
        const { rec } = riaaSections(ctx);
        for (const s of rec) {
          const f = ctx.createIIRFilter(s.b, s.a);
          node.connect(f);
          node = f;
        }
      } else {
        const hp0 = ctx.createBiquadFilter();
        hp0.type = 'highpass'; hp0.frequency.value = 32; hp0.Q.value = 0.6;
        node.connect(hp0); node = hp0;
      }

      const wow = ctx.createDelay(0.05);
      wow.delayTime.value = 0.015;
      const mkLfo = (freq, key) => {
        const lfo = ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = freq;
        const g = ctx.createGain();
        g.gain.value = 0;
        lfo.connect(g).connect(wow.delayTime);
        lfo.start();
        this._depths[key] = g;
        return lfo;
      };
      const base = this._rpm / 60;
      this._wowLfo = mkLfo(base, 'wow');
      this._rippleLfo = mkLfo(base * 2, 'ripple');
      this._eccLfo = mkLfo(base, 'ecc');
      this._flutterLfo = mkLfo(7.2, 'flutter');

      // 慢速机械漂移：24 秒周期三个低频分量
      const driftBuffer = ctx.createBuffer(1, 8000 * 24, 8000);
      const driftData = driftBuffer.getChannelData(0);
      const phase = (this._recordSeed >>> 0) % 3600 / 3600 * Math.PI * 2;
      for (let i = 0; i < driftData.length; i++) {
        const t = i / 8000;
        driftData[i] = Math.sin(2 * Math.PI * t / 24 + phase) * 0.55
          + Math.sin(2 * Math.PI * t * 2 / 24 + phase * 1.7) * 0.30
          + Math.sin(2 * Math.PI * t * 3 / 24 + phase * 2.3) * 0.15;
      }
      const driftSource = ctx.createBufferSource();
      driftSource.buffer = driftBuffer;
      driftSource.loop = true;
      const driftDepth = ctx.createGain();
      driftDepth.gain.value = 0;
      driftSource.connect(driftDepth).connect(wow.delayTime);
      driftSource.start();
      this._depths.drift = driftDepth;
      this._driftSource = driftSource;

      // 偏心 warp 的幅度端：每转一次的轻微音量起伏
      const warpLfo = ctx.createOscillator();
      warpLfo.type = 'sine';
      warpLfo.frequency.value = base;
      const warpDepth = ctx.createGain();
      warpDepth.gain.value = 0;
      warpLfo.connect(warpDepth).connect(this._warpAmp.gain);
      warpLfo.start();
      this._depths.warpAmp = warpDepth;
      this._warpLfo = warpLfo;

      // 沟槽带限 + 追踪失真 + 内圈滚降
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 28; hp.Q.value = 0.6;
      const cutLp = ctx.createBiquadFilter();
      cutLp.type = 'lowpass'; cutLp.frequency.value = 16500; cutLp.Q.value = 0.5;
      // 沟槽 trim 放在追踪失真之前：预加重峰值 ~×14，不衰减会让 waveshaper 硬夹
      const musicTrim = ctx.createGain();
      musicTrim.gain.value = 0.05;
      const tracing = ctx.createWaveShaper();
      tracing.oversample = '2x';
      this._tracing = tracing;
      const innerLp = ctx.createBiquadFilter();
      innerLp.type = 'lowpass'; innerLp.frequency.value = this._innerOuter; innerLp.Q.value = 0.5;
      this._innerLp = innerLp;

      node.connect(wow).connect(hp).connect(cutLp).connect(musicTrim).connect(tracing).connect(innerLp);

      this._musicPathGain = ctx.createGain();
      this._musicPathGain.gain.value = this._workletReady ? 0 : 1;
      innerLp.connect(this._musicPathGain).connect(this._grooveBus);
      if (this._workletNode) innerLp.connect(this._workletNode);
      this._pendingWorkletInput = innerLp;

      this._music = { src, wow, hp, cutLp, tracing, innerLp };
      this._elemSrc = src;
      this._applyMechanics();
      this._applyProfileTone();
      this.setRpm(this._rpm);
    } catch (err) {
      console.info('Web Audio 播放链接入失败，使用元素直出。', err);
    }
  }

  /* ── 噪底缓冲（回退路径 / 离线渲染共用） ── */
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
    crackleHp.type = 'highpass'; crackleHp.frequency.value = 190;
    const crackleLp = ctx.createBiquadFilter();
    crackleLp.type = 'lowpass'; crackleLp.frequency.value = 6800;
    const crackleGain = ctx.createGain();
    crackleGain.gain.value = 0.05;
    crackle.connect(crackleHp).connect(crackleLp).connect(crackleGain).connect(this._bufferGain);
    this._bufferGains.crackle = crackleGain;

    const hiss = ctx.createBufferSource();
    hiss.buffer = this._hissBuffer;
    hiss.loop = true;
    const hissBp = ctx.createBiquadFilter();
    hissBp.type = 'bandpass'; hissBp.frequency.value = 10500; hissBp.Q.value = 0.55;
    const hissGain = ctx.createGain();
    hissGain.gain.value = 0.009;
    hiss.connect(hissBp).connect(hissGain).connect(this._bufferGain);
    this._bufferGains.hiss = hissGain;

    const rumble = ctx.createBufferSource();
    rumble.buffer = this._rumbleBuffer;
    rumble.loop = true;
    const rumbleLp = ctx.createBiquadFilter();
    rumbleLp.type = 'lowpass'; rumbleLp.frequency.value = 140;
    const rumbleGain = ctx.createGain();
    rumbleGain.gain.value = 0.4;
    rumble.connect(rumbleLp).connect(rumbleGain).connect(this._bufferGain);
    this._bufferGains.rumble = rumbleGain;

    const hum = ctx.createBufferSource();
    hum.buffer = this._humBuffer;
    hum.loop = true;
    const humLp = ctx.createBiquadFilter();
    humLp.type = 'lowpass'; humLp.frequency.value = 420;
    const humGain = ctx.createGain();
    humGain.gain.value = 0;
    hum.connect(humLp).connect(humGain).connect(this._bufferGain);
    this._bufferGains.hum = humGain;

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
        numberOfInputs: 1,
        numberOfOutputs: 3,
        outputChannelCount: [2, 2, 2],
        processorOptions: { seed: this._recordSeed }
      });
      node.connect(this._grooveBus);
      // 冲击总线 → 唱头谐振（绕过 RIAA 去加重）；沟槽噪声总线 → 统一 trim
      node.connect(this._cart, 1);
      node.connect(this._grooveTrim, 2);
      this._workletNode = node;
      this._workletSeed = this._recordSeed;
      this._workletReady = true;
      if (this._pendingWorkletInput) this._pendingWorkletInput.connect(node);
      if (this._musicPathGain) {
        this._musicPathGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.12);
      }
      node.port.postMessage({ type: 'rpm', rpm: this._rpm });
      this._applyNoiseLevels();
      this._bufferGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.12);
      setTimeout(() => {
        if (this._workletReady) this._stopBufferNoise();
      }, 420);
    } catch (err) {
      this._lastNoiseError = String(err?.message || err);
      this._workletReady = false;
      if (this._musicPathGain) this._musicPathGain.gain.value = 1;
      console.info('AudioWorklet 不可用，使用缓冲噪底回退。', err);
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
      for (let i = 0; i < len; i++) data[i] = (rng() * 2 - 1) * 0.0025;
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
      for (let s = 0; s < 9; s++) {
        const pos = Math.floor(rng() * (len - 5000));
        const decay = 80 + rng() * 260;
        const amp = 0.03 + rng() * 0.10;
        for (let i = 0; i < decay * 6 && pos + i < len; i++) {
          data[pos + i] += (rng() * 2 - 1) * amp * Math.exp(-i / decay);
        }
      }
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

  /* ── 离线渲染：与实时链同构图，供 A/B 与确定性自检 ── */
  async renderOffline(sourceBuffer, { profile = null, noise = true, seconds = 0, from = 0, progress = 0.35 } = {}) {
    const rate = 44100;
    const dur = seconds > 0 ? seconds : sourceBuffer.duration - from;
    const frames = Math.max(1, Math.floor(dur * rate));
    const ctx = new OfflineAudioContext(2, frames, rate);
    const master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -1; limiter.knee.value = 0; limiter.ratio.value = 20;
    limiter.attack.value = 0.003; limiter.release.value = 0.12;
    limiter.connect(master);

    const grooveTrim = ctx.createGain();
    grooveTrim.gain.value = 0.05;
    const grooveBus = ctx.createGain();
    grooveTrim.connect(grooveBus);
    const warpAmp = ctx.createGain();
    warpAmp.gain.value = 1;
    grooveBus.connect(warpAmp);
    const makeup = ctx.createGain();
    makeup.gain.value = 20;
    warpAmp.connect(makeup);
    // 回放 EQ（独立实例，不碰实时字段）
    let node = makeup;
    const { rec, play } = riaaSections(ctx);
    for (const s of play) {
      const f = ctx.createIIRFilter(s.b, s.a);
      node.connect(f); node = f;
    }
    const cart = ctx.createBiquadFilter();
    cart.type = 'peaking';
    cart.frequency.value = profile?.cartridge?.freq ?? 9500;
    cart.Q.value = profile?.cartridge?.q ?? 0.9;
    cart.gain.value = profile?.cartridge?.gain ?? 1.2;
    const wearShelf = ctx.createBiquadFilter();
    wearShelf.type = 'highshelf'; wearShelf.frequency.value = 10000;
    wearShelf.gain.value = -((profile?.hfLoss ?? 1.2) + (profile?.wear ?? 0) * 1.4 + progress * 1.1);
    node.connect(cart); cart.connect(wearShelf); wearShelf.connect(limiter);

    const src = ctx.createBufferSource();
    src.buffer = sourceBuffer;
    let m = src;
    for (const s of rec) {
      const f = ctx.createIIRFilter(s.b, s.a);
      m.connect(f); m = f;
    }
    const wow = ctx.createDelay(0.05);
    wow.delayTime.value = 0.015;
    const mech = profile?.mechanics || {};
    const base = (100 / 3) / 60;
    const mk = (freq, pct) => {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = pct / (2 * Math.PI * freq);
      lfo.connect(g).connect(wow.delayTime);
      lfo.start();
    };
    mk(base, mech.wowPct ?? 0.0009);
    mk(base * 2, mech.ripplePct ?? 0.00012);
    mk(base, mech.eccPct ?? 0.0004);
    mk(1 / 24, mech.driftPct ?? 0.00022);
    mk(7.2, mech.flutterPct ?? 0.00030);
    const wl = ctx.createOscillator();
    wl.frequency.value = base;
    const wg = ctx.createGain();
    wg.gain.value = (mech.eccPct ?? 0.0004) * 0.45;
    wl.connect(wg).connect(warpAmp.gain);
    wl.start();

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 28; hp.Q.value = 0.6;
    const cutLp = ctx.createBiquadFilter();
    cutLp.type = 'lowpass'; cutLp.frequency.value = 16500; cutLp.Q.value = 0.5;
    const musicTrim = ctx.createGain();
    musicTrim.gain.value = 0.05;
    const tracing = ctx.createWaveShaper();
    const drive = 1.05 + (profile?.wear ?? 0) * 0.6 + progress * 0.45 + (profile?.glare ?? 0) * 0.6;
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * drive) / drive;
    }
    tracing.curve = curve;
    const innerLp = ctx.createBiquadFilter();
    innerLp.type = 'lowpass';
    innerLp.frequency.value = (profile?.inner?.outer ?? 16000)
      - progress * ((profile?.inner?.outer ?? 16000) - (profile?.inner?.inner ?? 11000));
    innerLp.Q.value = 0.5;
    const musicPath = ctx.createGain();
    musicPath.gain.value = 1;
    m.connect(wow).connect(hp).connect(cutLp).connect(musicTrim).connect(tracing).connect(innerLp);
    innerLp.connect(musicPath).connect(grooveBus);

    if (noise) {
      const seed = hashSeed(profile?.seed ?? profile?.id ?? 'jay-vinyl');
      const savedSeed = this._recordSeed;
      this._recordSeed = seed;
      const crackleB = this._buildCrackleBuffer(ctx);
      const hissB = this._buildHissBuffer(ctx);
      const rumbleB = this._buildRumbleBuffer(ctx);
      const humB = this._buildHumBuffer(ctx);
      this._recordSeed = savedSeed;
      const nb = profile?.noise || CONDITION_PRESETS[profile?.condition || 'daily'];
      const beds = [];
      const mkSrc = (buf, type, freq, q, gainVal) => {
        const s = ctx.createBufferSource();
        s.buffer = buf; s.loop = true;
        const f = ctx.createBiquadFilter();
        f.type = type; f.frequency.value = freq; if (q) f.Q.value = q;
        const g = ctx.createGain();
        g.gain.value = gainVal;
        s.connect(f).connect(g).connect(grooveTrim);
        s.start(0, (seed % 1000) / 1000 * buf.duration * 0.8);
        beds.push(g);
        return g;
      };
      mkSrc(crackleB, 'highpass', 190, 0, nb.crackle ?? 0.05);
      mkSrc(hissB, 'bandpass', 10500, 0.55, nb.hiss ?? 0.009);
      mkSrc(rumbleB, 'lowpass', 140, 0, nb.rumble ?? 0.4);
      mkSrc(humB, 'lowpass', 420, 0, nb.hum ?? 0);
      // 事件化表面噪声：离线同走 worklet（泊松 micro/pop/burst + 固定沟槽缺陷图）
      try {
        await ctx.audioWorklet.addModule(new URL('./vinyl-worklet.js', import.meta.url));
        const wn = new AudioWorkletNode(ctx, 'vinyl-noise', {
          numberOfInputs: 1,
          numberOfOutputs: 3,
          outputChannelCount: [2, 2, 2],
          processorOptions: { seed, rpm: 100 / 3 }
        });
        const wear = profile?.wear ?? 0;
        const setP = (name, v) => { const p = wn.parameters.get(name); if (p) p.value = v; };
        setP('crackleLevel', (nb.crackle ?? 0.05) + wear * 0.014 + progress * 0.009);
        setP('hissLevel', (nb.hiss ?? 0.009) + wear * 0.0018 + progress * 0.0010);
        setP('rumbleLevel', (nb.rumble ?? 0.4) + wear * 0.05);
        setP('humLevel', nb.hum ?? 0);
        setP('progress', progress);
        setP('frictionLevel', nb.friction ?? 0.004);
        setP('microRate', nb.microRate ?? 6);
        setP('popRate', nb.popRate ?? 0.8);
        setP('burstRate', nb.burstRate ?? 0.12);
        setP('popAmp', nb.popAmp ?? 0.35);
        setP('decayMs', nb.decayMs ?? 12);
        setP('tickLevel', (nb.tick ?? 0) + (wear > 0.45 ? (wear - 0.45) * 0.10 : 0));
        innerLp.connect(wn);
        wn.connect(grooveBus);
        wn.connect(cart, 1);
        wn.connect(grooveTrim, 2);
        musicPath.gain.value = 0;
        beds.forEach((g) => { g.gain.value = 0; g.disconnect(); });
      } catch { /* 离线 worklet 不可用时保留缓冲噪底与直通音乐 */ }
    }
    src.start(0, from, dur);
    return ctx.startRendering();
  }

  /* ── 机械声 SFX ── */
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
    bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 1.1;
    const gain = ctx.createGain();
    gain.gain.value = 0.28;
    src.connect(bp).connect(gain).connect(this.sfxBus);
    src.start(t);
  }

  playNeedle() {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const rate = ctx.sampleRate;
    const dur = 0.9;
    const buffer = ctx.createBuffer(1, Math.floor(rate * dur), rate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const time = i / rate;
      const thump = Math.sin(2 * Math.PI * 46 * time) * Math.exp(-time * 13) * 0.55;
      const click = (Math.random() * 2 - 1) * Math.exp(-time * 55) * 0.3;
      data[i] = thump + click;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 1500;
    const gain = ctx.createGain();
    gain.gain.value = 0.5;
    // 落针是沟槽机械声：走沟槽总线，经回放 EQ 抬低频
    src.connect(lp).connect(gain).connect(this._grooveBus || this.sfxBus);
    src.start(t);

    if (this._crackleBuffer) {
      const hiss = ctx.createBufferSource();
      hiss.buffer = this._crackleBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 0.7;
      const hg = ctx.createGain();
      hg.gain.setValueAtTime(0.0001, t);
      hg.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
      hg.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      hiss.connect(bp).connect(hg).connect(this.sfxBus);
      hiss.start(t);
      hiss.stop(t + 0.55);
    }
  }

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

  /* ── iOS 兜底底噪 ── */
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
    return this.mode === 'reference' ? 0 : (this._noiseBase().ios ?? 0.07);
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
      mode: this.mode,
      directGain: this._directGain?.gain.value ?? null,
      vinylGain: this._vinylGain?.gain.value ?? null,
      workletReady: this._workletReady,
      workletError: this._lastNoiseError,
      condition: this._condition,
      profile: this._profile?.id ?? null,
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
        friction: params.get('frictionLevel')?.value,
        tick: params.get('tickLevel')?.value,
        microRate: params.get('microRate')?.value,
        popRate: params.get('popRate')?.value,
        progress: params.get('progress')?.value
      } : null
    };
  }
}