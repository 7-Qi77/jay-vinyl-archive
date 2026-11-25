"""A/B 频谱与瞬态对照：python tools/analyze-ab.py [dry.wav vinyl.wav]
纯标准库（wave + cmath FFT），输出分带能量差、峰值因子与冲击事件计数。"""
import cmath
import math
import sys
import wave


def read_mono(path):
    with wave.open(path, 'rb') as w:
        n, ch, fs = w.getnframes(), w.getnchannels(), w.getframerate()
        raw = w.readframes(n)
    ints = memoryview(raw).cast('h')
    x = [0.0] * n
    for i in range(n):
        s = 0
        for c in range(ch):
            s += ints[i * ch + c]
        x[i] = s / ch / 32768.0
    return x, fs


def fft(a):
    n = len(a)
    if n & (n - 1):
        raise ValueError('len must be power of two')
    j = 0
    for i in range(1, n):
        bit = n >> 1
        while j & bit:
            j ^= bit
            bit >>= 1
        j |= bit
        if i < j:
            a[i], a[j] = a[j], a[i]
    length = 2
    while length <= n:
        ang = -2 * math.pi / length
        wl = cmath.exp(1j * ang)
        for i in range(0, n, length):
            w = 1 + 0j
            for k in range(length // 2):
                u = a[i + k]
                v = a[i + k + length // 2] * w
                a[i + k] = u + v
                a[i + k + length // 2] = u - v
                w *= wl
        length <<= 1
    return a


def bands(x, fs):
    n = 1 << (len(x).bit_length() - 1)
    spec = fft([complex(v, 0) for v in x[:n]])
    edges = [(20, 60), (60, 200), (200, 2000), (2000, 6000), (6000, 12000), (12000, 20000)]
    out = {}
    for lo, hi in edges:
        e = 0.0
        for k in range(max(1, int(lo * n / fs)), min(n // 2, int(hi * n / fs))):
            e += abs(spec[k]) ** 2
        out[f'{lo}-{hi}'] = e
    return out


def stats(x):
    rms = math.sqrt(sum(v * v for v in x) / len(x))
    peak = max(abs(v) for v in x)
    return rms, peak, peak / max(1e-9, rms)


def main():
    dry_p = sys.argv[1] if len(sys.argv) > 2 else 'ab/woluolei-dry.wav'
    vin_p = sys.argv[2] if len(sys.argv) > 2 else 'ab/woluolei-vinyl.wav'
    dry, fs = read_mono(dry_p)
    vin, _ = read_mono(vin_p)
    bd, bv = bands(dry, fs), bands(vin, fs)
    print(f'{"band Hz":>12} {"dry dB":>9} {"vinyl dB":>9} {"delta dB":>9}')
    for k in bd:
        d = 10 * math.log10(max(1e-12, bd[k]))
        v = 10 * math.log10(max(1e-12, bv[k]))
        print(f'{k:>12} {d:9.2f} {v:9.2f} {v - d:9.2f}')
    for name, x in (('dry', dry), ('vinyl', vin)):
        rms, peak, crest = stats(x)
        print(f'{name:>6}: rms={rms:.4f} peak={peak:.4f} crest={crest:.2f}')
    print('注：表面事件密度由 tools/verify-vinyl.js 的 crackleDensity 项在静音源上单独计量。')


if __name__ == '__main__':
    main()