"""Generate the final narration with ElevenLabs — one clip per cue, prosody stitched.

    export ELEVENLABS_API_KEY=...
    python audio/elevenlabs_vo.py                          # Atlas (recommended), Multilingual v2
    python audio/elevenlabs_vo.py --voice lfBVYbXnblkOddWFfEIg --speed 0.94
    python audio/elevenlabs_vo.py --only C07,C15 --seed 11 # re-roll specific lines

Writes audio/vo/elevenlabs/C01.wav … plus C01.json (character timestamps), then
`python audio/mix.py --vo audio/vo/elevenlabs` places every clip on its cue.

Why per-cue clips: each line lands exactly on its visual beat, a single bad read can be
re-rolled without touching the rest, and previous_text / next_text + previous_request_ids
keep intonation continuous across clips (request stitching). Standard library only.
"""
import argparse, base64, json, os, sys, time, urllib.request, urllib.error, wave
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VOICES = {  # library voices that fit the brief (deep, clear, authoritative, documentary)
    "atlas": "3YzGaTGef0x5PLEK9yGq",    # Atlas — Deep, Gravelly Narrator (US) — recommended
    "timothy": "lfBVYbXnblkOddWFfEIg",  # Timothy — deep, resonant American documentary narrator
    "orion": "VuLPiW02W0Qm8465ksBZ",    # Orion — warm authoritative British, calm gravity
    "connery": "vLZJLcQMJCqxjrHGEVDO",  # Connery — deep & immersive documentary
}

ap = argparse.ArgumentParser()
ap.add_argument("--voice", default="atlas", help="name from VOICES or a raw voice_id")
ap.add_argument("--model", default="eleven_multilingual_v2")
ap.add_argument("--stability", type=float, default=0.55)
ap.add_argument("--similarity", type=float, default=0.82)
ap.add_argument("--style", type=float, default=0.18)
ap.add_argument("--speed", type=float, default=0.96)
ap.add_argument("--seed", type=int, default=7)
ap.add_argument("--format", default="pcm_44100", help="pcm_44100 (needs Pro tier) or mp3_44100_192")
ap.add_argument("--only", default="")
ap.add_argument("--out", default=str(ROOT / "audio/vo/elevenlabs"))
a = ap.parse_args()

key = os.environ.get("ELEVENLABS_API_KEY")
if not key:
    sys.exit("Set ELEVENLABS_API_KEY first.")
voice_id = VOICES.get(a.voice.lower(), a.voice)
cues = json.loads((ROOT / "script/cues.json").read_text())["cues"]
only = set(filter(None, a.only.split(",")))
out = Path(a.out)
out.mkdir(parents=True, exist_ok=True)
prev_ids = []

for i, c in enumerate(cues):
    if only and c["id"] not in only:
        continue
    body = {
        "text": c["text"],
        "model_id": a.model,
        "voice_settings": {"stability": a.stability, "similarity_boost": a.similarity, "style": a.style,
                           "use_speaker_boost": True, "speed": a.speed},
        "previous_text": " ".join(x["text"] for x in cues[max(0, i - 2):i]) or None,
        "next_text": cues[i + 1]["text"] if i + 1 < len(cues) else None,
        "seed": a.seed,
    }
    if prev_ids and a.model.startswith("eleven_multilingual"):
        body["previous_request_ids"] = prev_ids[-3:]
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/with-timestamps?output_format={a.format}"
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"xi-api-key": key, "Content-Type": "application/json"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                rid = r.headers.get("request-id")
                js = json.loads(r.read())
            break
        except urllib.error.HTTPError as e:
            msg = e.read().decode(errors="replace")
            if e.code in (429, 500, 502, 503) and attempt < 3:
                time.sleep(2 ** attempt * 2)
                continue
            sys.exit(f"{c['id']}: HTTP {e.code} {msg}")
    audio = base64.b64decode(js["audio_base64"])
    if a.format.startswith("pcm_"):
        sr = int(a.format.split("_")[1])
        with wave.open(str(out / f"{c['id']}.wav"), "wb") as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes(audio)
    else:
        (out / f"{c['id']}.mp3").write_bytes(audio)
    (out / f"{c['id']}.json").write_text(json.dumps(js.get("alignment") or js.get("normalized_alignment"), indent=0))
    if rid:
        prev_ids.append(rid)
    al = js.get("alignment") or {}
    dur = (al.get("character_end_times_seconds") or [0])[-1]
    print(f"{c['id']}  {dur:5.2f}s  {c['text']}")

print(f"\nDone → {out}\nNext: python audio/mix.py --vo {out} --video <render> --out <final.mp4>")
