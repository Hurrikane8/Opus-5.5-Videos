"""Procedural TEMP score + sound design for "The Hardest Part".

Placeholder for a custom score (brief: deep electronic pulses + subtle low orchestral
swells). Everything is synthesized from code and synced to the shot/cue timing, so the
preview has the intended emotional shape. Writes two stems at 48 kHz:

    audio/stems/music.wav   pulses, drones, string-like swells
    audio/stems/sfx.wav     whooshes, hits, servo/gear/encoder textures, crack, alarms

    python audio/score.py
"""
import json
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy import signal

ROOT = Path(__file__).resolve().parent.parent
SR = 48000
DUR = json.loads((ROOT / "script/cues.json").read_text())["duration"]
N = int(DUR * SR)
rng = np.random.default_rng(7)
t_all = np.arange(N) / SR


def buf():
    return np.zeros((N, 2), dtype=np.float64)


def place(dst, x, at, gain=1.0, pan=0.0):
    """Add mono/stereo clip x into dst at time `at` (s) with equal-power pan."""
    i = int(at * SR)
    if i >= N:
        return
    if x.ndim == 1:
        l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
        x = np.stack([x * l, x * r], axis=1)
    n = min(len(x), N - i)
    dst[i:i + n] += x[:n] * gain


def env_adsr(n, a=0.01, d=0.1, s=0.7, r=0.3):
    t = np.arange(n) / SR
    T = n / SR
    e = np.where(t < a, t / max(a, 1e-6), np.where(t < a + d, 1 - (1 - s) * (t - a) / max(d, 1e-6), s))
    rel = np.clip((T - t) / max(r, 1e-6), 0, 1)
    return e * rel


def lowpass(x, fc, order=4):
    b, a = signal.butter(order, fc / (SR / 2), "low")
    return signal.lfilter(b, a, x, axis=0)


def highpass(x, fc, order=2):
    b, a = signal.butter(order, fc / (SR / 2), "high")
    return signal.lfilter(b, a, x, axis=0)


def bandpass(x, lo, hi, order=2):
    b, a = signal.butter(order, [lo / (SR / 2), hi / (SR / 2)], "band")
    return signal.lfilter(b, a, x, axis=0)


def reverb(x, seconds=3.5, mix=0.35, damp=3000):
    n = int(seconds * SR)
    ir = rng.standard_normal((n, 2)) * np.exp(-np.arange(n) / SR * (6.9 / seconds))[:, None]
    ir = lowpass(ir, damp, 2)
    ir /= np.sqrt((ir ** 2).sum(axis=0, keepdims=True))
    wet = np.stack([signal.fftconvolve(x[:, c], ir[:, c])[: len(x)] for c in range(2)], axis=1)
    return x * (1 - mix) + wet * mix * 2.2


def smooth(keys, t):
    """Piecewise-linear automation from [(time, value), ...]."""
    k = np.array(keys, dtype=float)
    return np.interp(t, k[:, 0], k[:, 1])


def note(name):
    names = {"C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11}
    p, o = name[:-1], int(name[-1])
    return 440.0 * 2 ** ((names[p] + 12 * (o + 1) - 69) / 12)


# ------------------------------------------------------------------ music
def string_pad(freqs, dur, attack=2.0, release=2.5, bright=1200, detune=0.12, voices=5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for f in freqs:
        for v in range(voices):
            d = (v - (voices - 1) / 2) * detune
            ff = f * 2 ** (d / 12)
            ph = rng.uniform(0, 2 * np.pi)
            # band-limited saw via additive harmonics
            for h in range(1, int(min(24, 8000 / ff))):
                out += np.sin(2 * np.pi * ff * h * t + ph * h) / h * (1 / (1 + (ff * h / bright) ** 2))
    out *= env_adsr(n, attack, 0.5, 0.85, release)
    vib = 1 + 0.003 * np.sin(2 * np.pi * 4.8 * t)
    return out / (len(freqs) * voices * 2.5) * vib


def sub_pulse(f0=46, dur=0.9, punch=2.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = f0 * (1 + punch * np.exp(-t * 28))
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = np.sin(ph) * np.exp(-t * 4.2)
    x += 0.15 * np.tanh(3 * np.sin(ph)) * np.exp(-t * 9)
    return x * env_adsr(n, 0.002, 0.05, 1.0, 0.25)


def pluck(f, dur=0.5, bright=3000):
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = sum(np.sin(2 * np.pi * f * h * t) / h ** 1.3 * np.exp(-t * (6 + h * 1.5)) for h in range(1, 9))
    return lowpass(x, bright, 2) * 0.5


music = buf()
# drone bed across the film (E1/B1), shaped by section intensity
inten = smooth([(0, 0.0), (2, 0.55), (12, 0.6), (35, 0.7), (65, 0.85), (87, 1.0), (91.5, 1.0), (92.0, 0.0), (93.5, 0.25), (118, 0.2)], t_all)
drone = (np.sin(2 * np.pi * note("E1") * t_all) * 0.6 + np.sin(2 * np.pi * note("B1") * t_all + 1.0) * 0.35
         + 0.2 * np.sin(2 * np.pi * note("E2") * t_all + 0.3) * (0.5 + 0.5 * np.sin(2 * np.pi * 0.07 * t_all)))
noise = lowpass(rng.standard_normal(N), 220, 4) * 0.6
bed = (drone * 0.22 + noise * 0.12) * inten
music += np.stack([bed, bed], axis=1)

BEAT = 60 / 75  # 75 BPM grid
# pulses: sparse in the hook, steady through the explanation, driving in the bottleneck
def pulses(t0, t1, every, gain, f0=46):
    k = np.ceil(t0 / (BEAT * every))
    while k * BEAT * every < t1:
        place(music, sub_pulse(f0), k * BEAT * every, gain)
        k += 1

pulses(1.6, 9.0, 2, 0.4)
pulses(12.8, 34.6, 1, 0.26)
pulses(35.2, 64.8, 1, 0.3)
pulses(65.8, 87.0, 0.5, 0.32)
pulses(87.0, 91.4, 0.25, 0.3)

# ticking arpeggio during the physics section (E minor pentatonic, filtered)
arp = ["E4", "B4", "G4", "D5", "E5", "B4", "A4", "G4"]
k = 0
tt = 35.2
while tt < 64.8:
    place(music, pluck(note(arp[k % len(arp)]), 0.5, 2400 + 1600 * np.sin(k * 0.3)), tt, 0.09, pan=0.35 * np.sin(k * 1.7))
    tt += BEAT / 2
    k += 1

# string-like swells (low orchestral colour)
swells = [
    (0.5, 11.5, ["E2", "B2", "G3", "F#4"], 0.28, 1400),
    (12.2, 22.0, ["C2", "G2", "E3", "B3"], 0.22, 1300),
    (22.0, 35.0, ["A1", "E2", "C3", "B3"], 0.22, 1300),
    (35.0, 50.0, ["E2", "B2", "G3", "D4"], 0.2, 1600),
    (50.0, 65.4, ["C2", "G2", "E3", "D4"], 0.2, 1600),
    (65.4, 79.0, ["E2", "B2", "F3", "C4"], 0.26, 1800),   # b2 tension
    (79.0, 91.8, ["E2", "A#2", "F3", "B3"], 0.28, 2000),  # tritone pressure
    (93.0, 101.0, ["C2", "G2", "E3", "G4"], 2.2, 1600),   # release into major
    (100.5, 108.6, ["G1", "D2", "B2", "D4", "F#4"], 2.5, 1800),
    (108.4, 118.0, ["C2", "G2", "E3", "G3", "D4"], 2.7, 1600),
]
for (a, b, chord, g, br) in swells:
    place(music, string_pad([note(n) for n in chord], b - a + 2.5, attack=min(3.0, (b - a) * 0.35), release=2.5, bright=br), a, g * 1.6, pan=0.0)

# riser into the bottleneck freeze, then a hard drop to silence at 91.8
r0, r1 = 84.0, 91.6
n = int((r1 - r0) * SR)
tr = np.arange(n) / SR
sweep = np.sin(2 * np.pi * np.cumsum(np.linspace(180, 900, n)) / SR) * 0.15 + bandpass(rng.standard_normal(n), 800, 6000) * 0.25
sweep *= (tr / tr[-1]) ** 2.2
place(music, sweep, r0, 0.35)

music = reverb(music, 4.0, 0.28, 2600)
# hard gate for the beat of silence before the closing
gate = smooth([(0, 1), (91.75, 1), (91.85, 0.0), (92.3, 0.0), (93.4, 1.0), (118, 1)], t_all)
music *= gate[:, None]
fade = smooth([(0, 0), (1.0, 1), (116.6, 1), (118, 0)], t_all)
music *= fade[:, None]

# ------------------------------------------------------------------ sfx
sfx = buf()


def whoosh(dur=1.6, lo=200, hi=4000, rev=False):
    n = int(dur * SR)
    x = rng.standard_normal(n)
    t = np.arange(n) / SR
    fc = np.geomspace(lo, hi, n) if not rev else np.geomspace(hi, lo, n)
    y = np.zeros(n)
    blk = 512
    for i in range(0, n, blk):
        f = fc[i]
        b, a = signal.butter(2, [max(30, f * 0.6) / (SR / 2), min(SR / 2 - 100, f * 1.6) / (SR / 2)], "band")
        y[i:i + blk] = signal.lfilter(b, a, x[i:i + blk])
    return y * np.sin(np.pi * t / dur) ** 2


def hit(f0=38, dur=3.0, noise_amt=0.3):
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = sub_pulse(f0, dur, punch=3.5)[:n] * 1.2
    x += lowpass(rng.standard_normal(n), 1500, 2) * np.exp(-t * 7) * noise_amt
    return x


def servo(dur=1.0, f=900, wob=40):
    n = int(dur * SR)
    t = np.arange(n) / SR
    ff = f + wob * np.sin(2 * np.pi * 3 * t)
    ph = 2 * np.pi * np.cumsum(ff) / SR
    x = (np.sin(ph) + 0.4 * np.sin(2 * ph) + 0.2 * np.sin(3.01 * ph)) * env_adsr(n, 0.08, 0.1, 0.8, 0.25)
    return bandpass(x, 300, 5000) * 0.25


def click(bright=6000):
    n = int(0.012 * SR)
    t = np.arange(n) / SR
    return highpass(rng.standard_normal(n), bright, 2) * np.exp(-t * 600)


def beep(f=1800, dur=0.12):
    n = int(dur * SR)
    t = np.arange(n) / SR
    return np.sin(2 * np.pi * f * t) * env_adsr(n, 0.004, 0.02, 0.8, 0.03) * 0.3


# transitions
for at, g in [(11.6, 0.35), (34.6, 0.45), (65.1, 0.4), (98.4, 0.25)]:
    place(sfx, whoosh(1.4), at, g, pan=-0.3)
# hook: servo hum under the elbow flex + ignite hit + title shimmer
place(sfx, servo(5.5, 620, 25), 1.0, 0.35, pan=-0.2)
place(sfx, servo(2.5, 820, 40), 6.0, 0.25, pan=-0.2)
place(sfx, hit(41, 3.5, 0.25), 9.0, 0.7)
for i in range(28):
    place(sfx, beep(2400 + (i % 7) * 140, 0.05), 9.05 + i * 0.05, 0.08, pan=np.sin(i))
# define: soft current hum
n = int(4.5 * SR)
tt = np.arange(n) / SR
hum = (np.sin(2 * np.pi * 100 * tt) * 0.5 + np.sin(2 * np.pi * 200 * tt) * 0.25 + np.sin(2 * np.pi * 300 * tt) * 0.1) * env_adsr(n, 0.8, 0.2, 0.8, 1.0)
place(sfx, hum, 12.6, 0.06)
# family: hydraulic push, pneumatic hiss + clank, soft inflate
place(sfx, lowpass(rng.standard_normal(int(1.8 * SR)), 400, 2) * env_adsr(int(1.8 * SR), 0.2, 0.3, 0.7, 0.5), 17.8, 0.25)
place(sfx, highpass(rng.standard_normal(int(0.9 * SR)), 3000, 2) * env_adsr(int(0.9 * SR), 0.01, 0.2, 0.4, 0.4), 21.1, 0.22, pan=0.3)
place(sfx, hit(70, 0.6, 0.6), 21.15, 0.18, pan=0.3)
place(sfx, bandpass(rng.standard_normal(int(2.4 * SR)), 150, 900) * env_adsr(int(2.4 * SR), 0.6, 0.4, 0.6, 0.8), 24.2, 0.2, pan=0.5)
# electric: assembly clicks
for i in range(6):
    place(sfx, click(4000), 27.8 + i * 0.22, 0.25, pan=-0.5 + i * 0.2)
# twenty-eight: count ticks
for i in range(28):
    place(sfx, click(7000), 30.35 + i * 0.045, 0.12, pan=np.sin(i * 0.8) * 0.6)
place(sfx, whoosh(1.6, 300, 6000), 33.4, 0.4)
# motor: reveal hit, cover clank, 3-phase whine rising with speed
place(sfx, hit(36, 3.0, 0.5), 35.0, 0.55)
n = int(11.2 * SR)
tt = np.arange(n) / SR
fe = np.interp(tt, [0, 4.6, 6.6, 11.2], [60, 60, 230, 420])
ph = 2 * np.pi * np.cumsum(fe) / SR
whine = (np.sin(ph) * 0.4 + np.sin(2 * ph) * 0.25 + np.sin(6 * ph) * 0.12) * np.interp(tt, [0, 1.0, 4.6, 11.2], [0, 0.5, 0.6, 1.0])
place(sfx, bandpass(whine, 60, 6000) * 0.25, 35.0, 0.6)
# gear: high strain-wave whir
n = int(3.4 * SR)
tt = np.arange(n) / SR
whir = np.sin(2 * np.pi * 2.6 * 102 * tt) * 0.3 + bandpass(rng.standard_normal(n), 2000, 5000) * 0.15
place(sfx, whir * env_adsr(n, 0.3, 0.2, 0.9, 0.5), 46.2, 0.18, pan=0.2)
# encoder: rapid ticks
tt0 = 49.7
while tt0 < 54.1:
    place(sfx, click(9000), tt0, 0.06, pan=0.4)
    tt0 += 0.045
# muscle: heartbeat-ish low thump; motor jolt
for k in range(4):
    place(sfx, sub_pulse(55, 0.4, 1.0), 54.6 + k * 1.05, 0.25, pan=-0.6)
place(sfx, hit(60, 0.8, 0.8), 56.7, 0.3, pan=0.6)
# heat: sizzle rising
n = int(5.4 * SR)
tt = np.arange(n) / SR
sizzle = highpass(rng.standard_normal(n), 4000, 2) * (0.2 + 0.8 * np.clip(tt / 3.5, 0, 1)) * (0.6 + 0.4 * (rng.random(n) > 0.997))
place(sfx, sizzle * env_adsr(n, 0.5, 0.1, 1.0, 0.8), 60.2, 0.06)
# spiral: growing servo strain
place(sfx, servo(6.0, 420, 60) * np.linspace(0.3, 1.0, int(6.0 * SR)), 66.4, 0.45)
# thermal: warning beeps
for k in range(5):
    place(sfx, beep(1400, 0.1), 74.2 + k * 0.25, 0.4)
    place(sfx, beep(1100, 0.1), 74.32 + k * 0.25, 0.4)
# impact: takeoff whoosh, slow-mo landing boom with long tail
place(sfx, whoosh(0.8, 300, 3000), 75.95, 0.3)
place(sfx, hit(30, 5.0, 0.9), 77.05, 1.0)
place(sfx, reverb(np.stack([hit(55, 2.0, 1.2)] * 2, axis=1), 3.0, 0.6), 77.07, 0.35)
# feel: contact click, egg crack (crackle burst)
place(sfx, click(3000), 80.15, 0.4)
n = int(0.6 * SR)
crk = np.zeros(n)
for k in range(40):
    i = int(rng.uniform(0, 0.45) * SR)
    c = click(rng.uniform(1500, 6000))
    crk[i:i + len(c)] += c * rng.uniform(0.3, 1.0)
place(sfx, crk, 80.42, 0.55)
# millions: shimmering swell
n = int(5.0 * SR)
tt = np.arange(n) / SR
shim = sum(np.sin(2 * np.pi * f * tt + rng.uniform(0, 6)) for f in [880, 1320, 1760, 2640]) * env_adsr(n, 2.0, 0.5, 0.8, 1.5) * 0.08
place(sfx, shim, 82.5, 0.5)
# copied: digital blips on each duplication; manufactured: machine clicks
for k, at in enumerate([87.95, 88.27, 88.59, 88.91]):
    place(sfx, beep(1200 * 2 ** (k / 4), 0.07), at, 0.35, pan=0.2 * k)
for k in range(12):
    place(sfx, click(2500), 89.9 + k * 0.17, 0.2, pan=-0.2)
# closing: soft swell whoosh, final title hit
place(sfx, whoosh(3.0, 120, 2000), 92.2, 0.15)
place(sfx, reverb(np.stack([hit(33, 6.0, 0.2)] * 2, axis=1), 5.0, 0.55), 113.0, 0.6)

sfx = reverb(sfx, 2.2, 0.18, 5000)


def norm(x, peak=0.89):
    m = np.abs(x).max()
    return x * (peak / m) if m > 0 else x


out = ROOT / "audio/stems"
out.mkdir(parents=True, exist_ok=True)
sf.write(out / "music.wav", norm(music, 0.7).astype(np.float32), SR, subtype="PCM_24")
sf.write(out / "sfx.wav", norm(sfx, 0.8).astype(np.float32), SR, subtype="PCM_24")
print("wrote", out / "music.wav", out / "sfx.wav")
