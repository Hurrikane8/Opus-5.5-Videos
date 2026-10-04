"""Mix narration + temp score + SFX and (optionally) mux onto the rendered video.

Each narration line is a separate clip (C01…C26) placed at its cue time from
script/cues.json, so the voice is frame-accurate no matter how fast or slow the TTS
reads. Leading silence is trimmed, overruns are reported (and can be fixed with
--fit), music is ducked under speech, and the result is loudness-normalized.

    python audio/mix.py --vo audio/vo/elevenlabs --video renders/the-hardest-part_final.mov --out renders/the-hardest-part.mp4
    python audio/mix.py --vo audio/vo/scratch    # temp mix with the scratch voice

Options:
    --lufs -14         integrated loudness target (YouTube/Vimeo −14, broadcast −23/−24)
    --tp -1.0          true-peak ceiling (dBTP)
    --fit              time-compress (≤ 8 %) any clip that would overrun the next cue
    --music 1.0        music stem gain     --sfx 1.0   sfx stem gain
    --offsets FILE     JSON {"C07": 0.15, …} per-cue nudges in seconds
"""
import argparse, json, subprocess, sys, tempfile
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy import signal

ROOT = Path(__file__).resolve().parent.parent
SR = 48000

ap = argparse.ArgumentParser()
ap.add_argument("--vo", default=str(ROOT / "audio/vo/scratch"))
ap.add_argument("--video")
ap.add_argument("--out")
ap.add_argument("--lufs", type=float, default=-14.0)
ap.add_argument("--tp", type=float, default=-1.0)
ap.add_argument("--fit", action="store_true")
ap.add_argument("--music", type=float, default=1.0)
ap.add_argument("--sfx", type=float, default=1.0)
ap.add_argument("--offsets")
a = ap.parse_args()

meta = json.loads((ROOT / "script/cues.json").read_text())
DUR = meta["duration"]
N = int(DUR * SR)
offsets = json.loads(Path(a.offsets).read_text()) if a.offsets else {}
vo_dir = Path(a.vo)


def decode(path, tempo=1.0):
    with tempfile.NamedTemporaryFile(suffix=".wav") as tmp:
        af = ["-af", f"atempo={tempo:.4f}"] if abs(tempo - 1) > 1e-3 else []
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(path), *af, "-ac", "1", "-ar", str(SR), "-c:a", "pcm_f32le", tmp.name], check=True)
        x, _ = sf.read(tmp.name, dtype="float64")
    return x


def trim(x, thresh_db=-45, pre=0.02, post=0.12):
    env = np.abs(x)
    th = 10 ** (thresh_db / 20) * max(env.max(), 1e-9)
    idx = np.where(env > th)[0]
    if len(idx) == 0:
        return x
    s = max(0, idx[0] - int(pre * SR))
    e = min(len(x), idx[-1] + int(post * SR))
    return x[s:e]


def find_clip(cid):
    for ext in (".wav", ".mp3", ".flac", ".m4a"):
        p = vo_dir / f"{cid}{ext}"
        if p.exists():
            return p
    return None


cues = meta["cues"]
vo = np.zeros(N)
captions = []
problems = 0
print(f"VO source: {vo_dir}")
for i, c in enumerate(cues):
    p = find_clip(c["id"])
    if not p:
        print(f"  {c['id']}: MISSING ({c['text']})")
        problems += 1
        continue
    start = c["start"] + float(offsets.get(c["id"], 0.0))
    nxt = cues[i + 1]["start"] if i + 1 < len(cues) else DUR - 0.5
    slot = nxt - start - 0.12
    x = trim(decode(p))
    d = len(x) / SR
    tempo = 1.0
    if d > slot:
        if a.fit and d / slot <= 1.08:
            tempo = d / slot
            x = trim(decode(p, tempo))
            d = len(x) / SR
            print(f"  {c['id']}: fitted ×{tempo:.3f} → {d:.2f}s / slot {slot:.2f}s")
        else:
            print(f"  {c['id']}: OVERRUN {d:.2f}s > slot {slot:.2f}s by {d - slot:.2f}s — nudge via --offsets or use --fit")
            problems += 1
    i0 = int(start * SR)
    n = min(len(x), N - i0)
    vo[i0:i0 + n] += x[:n]
    captions.append((start, start + d, c["text"]))

# narration polish: high-pass, gentle compression, a touch of room
b, aa = signal.butter(2, 70 / (SR / 2), "high")
vo = signal.lfilter(b, aa, vo)
rms = np.sqrt(signal.lfilter([0.002], [1, -0.998], vo ** 2) + 1e-12)
thr = 10 ** (-24 / 20)
gain = np.where(rms > thr, (thr / rms) ** (1 - 1 / 2.5), 1.0)
vo = vo * gain
peak = np.abs(vo).max()
vo = vo / peak * 0.5 if peak > 0 else vo

# stems
def load_stem(name):
    p = ROOT / "audio/stems" / name
    if not p.exists():
        print(f"  (no {name}; run audio/score.py)")
        return np.zeros((N, 2))
    x, sr = sf.read(p, dtype="float64", always_2d=True)
    if sr != SR:
        x = signal.resample_poly(x, SR, sr, axis=0)
    out = np.zeros((N, 2))
    out[: min(N, len(x))] = x[:N]
    return out

music = load_stem("music.wav") * 0.42 * a.music
sfx = load_stem("sfx.wav") * 0.5 * a.sfx

# ducking envelope from narration presence (attack 40 ms, release 450 ms)
lvl = np.abs(vo)
att, rel = np.exp(-1 / (0.04 * SR)), np.exp(-1 / (0.45 * SR))
envv = np.zeros(N)
e = 0.0
for i in range(0, N, 64):  # block-wise follower (fast enough in numpy-less loop at 64-sample hops)
    v = lvl[i:i + 64].max()
    e = v + (e - v) * (att ** 64 if v > e else rel ** 64)
    envv[i:i + 64] = e
duck = 1 - 0.55 * np.clip(envv / 0.05, 0, 1)
music *= duck[:, None]
sfx *= (1 - 0.25 * np.clip(envv / 0.05, 0, 1))[:, None]

mix = music + sfx + vo[:, None]
mix = np.tanh(mix * 1.1) / 1.1  # soft safety clip before loudness normalization

out_dir = ROOT / "audio/mix"
out_dir.mkdir(parents=True, exist_ok=True)
raw = out_dir / "mix_raw.wav"
sf.write(raw, mix.astype(np.float32), SR, subtype="FLOAT")
sf.write(out_dir / "vo_track.wav", vo.astype(np.float32), SR, subtype="PCM_24")

# two-pass EBU R128 loudness normalization
m = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(raw), "-af", f"loudnorm=I={a.lufs}:TP={a.tp}:LRA=11:print_format=json", "-f", "null", "-"],
                   capture_output=True, text=True).stderr
js = json.loads(m[m.rindex("{"): m.rindex("}") + 1])
final = out_dir / "mix.wav"
flt = (f"loudnorm=I={a.lufs}:TP={a.tp}:LRA=11:measured_I={js['input_i']}:measured_TP={js['input_tp']}:"
       f"measured_LRA={js['input_lra']}:measured_thresh={js['input_thresh']}:offset={js['target_offset']}:linear=true")
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(raw), "-af", flt, "-ar", str(SR), "-c:a", "pcm_s24le", str(final)], check=True)
print(f"mix → {final.relative_to(ROOT)}  (input {js['input_i']} LUFS → target {a.lufs} LUFS, TP ≤ {a.tp} dBTP)")

# captions (SRT) from actual clip timings
def ts(x):
    h, r = divmod(x, 3600); mm, s = divmod(r, 60)
    return f"{int(h):02d}:{int(mm):02d}:{int(s):02d},{int(round((s % 1) * 1000)):03d}"
srt = "\n".join(f"{k + 1}\n{ts(s)} --> {ts(e + 0.25)}\n{txt}\n" for k, (s, e, txt) in enumerate(captions))
(ROOT / "script/captions.srt").write_text(srt)
print("captions → script/captions.srt")

if a.video:
    out = Path(a.out or str(Path(a.video).with_name(Path(a.video).stem + "_mixed.mp4")))
    src_is_prores = a.video.endswith(".mov")
    vcodec = ["-c:v", "libx264", "-preset", "slow", "-crf", "14", "-pix_fmt", "yuv420p"] if (src_is_prores and out.suffix == ".mp4") else ["-c:v", "copy"]
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", a.video, "-i", str(final), "-map", "0:v:0", "-map", "1:a:0", *vcodec,
                    "-c:a", "aac", "-b:a", "320k", "-shortest", "-movflags", "+faststart", str(out)], check=True)
    print(f"video → {out}")
sys.exit(1 if problems and not a.fit else 0)
