"""Scratch (temp) narration for timing checks — NOT the final voice.

Generates one clip per cue with Microsoft Edge neural TTS so the preview render
has narration to judge sync against. The final track is generated with
ElevenLabs (see elevenlabs_vo.py) and dropped in with mix.py using the same
per-cue layout.

    python audio/scratch_vo.py          # -> audio/vo/scratch/C01.mp3 ... + durations.json
"""
import asyncio, json, subprocess, sys
from pathlib import Path

try:  # route TLS through the sandbox proxy CA when present
    import certifi
    if Path('/root/.ccr/ca-bundle.crt').exists():
        certifi.where = lambda: '/root/.ccr/ca-bundle.crt'
except ImportError:
    pass
import edge_tts

ROOT = Path(__file__).resolve().parent.parent
CUES = json.loads((ROOT / 'script/cues.json').read_text())
OUT = ROOT / 'audio/vo/scratch'
VOICE, RATE, PITCH = 'en-US-AndrewNeural', '-7%', '-6Hz'


def dur(p):
    return float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                                          '-of', 'csv=p=0', str(p)]))


async def main():
    OUT.mkdir(parents=True, exist_ok=True)
    report = {}
    cues = CUES['cues']
    for i, c in enumerate(cues):
        p = OUT / f"{c['id']}.mp3"
        if not p.exists() or '--force' in sys.argv:
            await edge_tts.Communicate(c['text'], VOICE, rate=RATE, pitch=PITCH).save(str(p))
        d = dur(p)
        nxt = cues[i + 1]['start'] if i + 1 < len(cues) else CUES['duration']
        slot = nxt - c['start']
        report[c['id']] = {'duration': round(d, 3), 'slot': round(slot, 3), 'headroom': round(slot - d, 3)}
        flag = '  <-- TIGHT' if slot - d < 0.5 else ''
        print(f"{c['id']}  {d:5.2f}s / slot {slot:5.2f}s{flag}")
    (OUT / 'durations.json').write_text(json.dumps(report, indent=1))


asyncio.run(main())
