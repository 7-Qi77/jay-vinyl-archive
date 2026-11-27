class TruePeakLimiterProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.lookahead = Math.max(4, Math.round(sampleRate * 0.005));
    let size = 1;
    while (size < this.lookahead + 4) size <<= 1;
    this.mask = size - 1;
    this.left = new Float32Array(size);
    this.right = new Float32Array(size);
    this.prevL = 0;
    this.prevPrevL = 0;
    this.prevR = 0;
    this.prevPrevR = 0;
    this.gainL = 1;
    this.gainR = 1;
    this.pos = 0;
    this.headL = 0;
    this.tailL = 0;
    this.headR = 0;
    this.tailR = 0;
    this.idxL = new Int32Array(this.lookahead + 2);
    this.valL = new Float32Array(this.lookahead + 2);
    this.idxR = new Int32Array(this.lookahead + 2);
    this.valR = new Float32Array(this.lookahead + 2);
    this.attack = 1 / Math.max(1, this.lookahead * 0.12);
  }

  static get parameterDescriptors() {
    return [
      { name: 'ceiling', defaultValue: 0.891250938, minValue: 0.1, maxValue: 1, automationRate: 'k-rate' },
      { name: 'releaseMs', defaultValue: 80, minValue: 20, maxValue: 500, automationRate: 'k-rate' }
    ];
  }

  _peak(p0, p1, p2) {
    const p3 = p2 + (p2 - p1);
    let peak = Math.max(Math.abs(p1), Math.abs(p2));
    for (let i = 1; i < 4; i++) {
      const t = i * 0.25;
      const t2 = t * t;
      const t3 = t2 * t;
      const v = 0.5 * (2 * p1 + (-p0 + p2) * t
        + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
        + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
      const a = Math.abs(v);
      if (a > peak) peak = a;
    }
    return peak;
  }

  _push(index, peak, head, tail, indices, values) {
    while (tail > head && values[(tail - 1) % indices.length] <= peak) tail--;
    const slot = tail % indices.length;
    indices[slot] = index;
    values[slot] = peak;
    return tail + 1;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!output?.[0]) return true;
    const left = output[0];
    const right = output[1] || left;
    const inL = input?.[0];
    const inR = input?.[1] || inL;
    const ceiling = Math.min(1, Math.max(0.1, parameters.ceiling[0] ?? 0.891250938));
    const release = Math.exp(-1000 / ((parameters.releaseMs[0] ?? 80) * sampleRate));

    for (let i = 0; i < left.length; i++) {
      const ml = inL ? inL[i] : 0;
      const mr = inR ? inR[i] : ml;
      const peakL = this._peak(this.prevPrevL, this.prevL, ml);
      const peakR = this._peak(this.prevPrevR, this.prevR, mr);
      this.prevPrevL = this.prevL;
      this.prevL = ml;
      this.prevPrevR = this.prevR;
      this.prevR = mr;

      this.left[this.pos & this.mask] = ml;
      this.right[this.pos & this.mask] = mr;
      this.tailL = this._push(this.pos, peakL, this.headL, this.tailL, this.idxL, this.valL);
      this.tailR = this._push(this.pos, peakR, this.headR, this.tailR, this.idxR, this.valR);

      const delayed = this.pos - this.lookahead;
      while (this.headL < this.tailL && this.idxL[this.headL % this.idxL.length] < delayed) this.headL++;
      while (this.headR < this.tailR && this.idxR[this.headR % this.idxR.length] < delayed) this.headR++;
      const maxL = this.valL[this.headL % this.valL.length] || 0;
      const maxR = this.valR[this.headR % this.valR.length] || 0;
      const targetL = maxL > ceiling ? ceiling / maxL : 1;
      const targetR = maxR > ceiling ? ceiling / maxR : 1;
      this.gainL = targetL < this.gainL
        ? this.gainL + (targetL - this.gainL) * this.attack
        : targetL + (this.gainL - targetL) * release;
      this.gainR = targetR < this.gainR
        ? this.gainR + (targetR - this.gainR) * this.attack
        : targetR + (this.gainR - targetR) * release;

      const slot = delayed & this.mask;
      left[i] = this.left[slot] * this.gainL;
      right[i] = this.right[slot] * this.gainR;
      this.pos++;
    }
    return true;
  }
}

registerProcessor('true-peak-limiter', TruePeakLimiterProcessor);
