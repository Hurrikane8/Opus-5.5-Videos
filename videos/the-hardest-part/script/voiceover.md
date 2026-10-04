# The Hardest Part — Voiceover Script

**Runtime:** 1:58 · **Narration:** 173 words · **Lines:** 26 (one clip per line)
**Voice:** deep, clear, authoritative male; calm, precise, slightly awe-struck. High-end tech documentary, not a YouTube explainer.

Times are when each line **starts** (mm:ss.s). They come from `script/cues.json`, which also drives the on-screen overlays, captions and the mix. Every line has 0.5–6 s of headroom before the next one, so a slower ElevenLabs read still fits.

---

## 0:00 – 0:12 · HOOK
*Extreme close-up of the elbow actuator → one continuous pull-back → the 28 rings ignite → title.*

| Cue | Start | Line | Delivery |
|---|---|---|---|
| C01 | 0:01.4 | This is the hardest part of the robot. | Close and quiet, almost a secret. Lean slightly on "hardest". |
| C02 | 0:05.6 | Not the brain. Not the battery. | Two even beats, with a clean stop between them. |
| C03 | 0:09.0 | The actuator. | Land it. Pitch drops a little on the last word. (The rings ignite as he says it.) |

## 0:12 – 0:35 · WHAT AN ACTUATOR IS
*Energy → controlled motion (P = V·I → P = τ·ω) · the family: hydraulic, pneumatic, soft · electric, exploded · 28 numbered actuators.*

| Cue | Start | Line | Delivery |
|---|---|---|---|
| C04 | 0:12.6 | An actuator turns energy into controlled motion. | A clear definition, unhurried. |
| C05 | 0:17.4 | Hydraulics are strong, but heavy. | Contrast phrasing: up on "strong", down on "heavy". |
| C06 | 0:20.6 | Pneumatics are fast, but springy. | Same shape. A little lift on "springy". |
| C07 | 0:23.8 | Soft actuators are safe, but weak. | Same shape. Let "weak" fall. |
| C08 | 0:28.0 | Humanoids run on electric motors. Twenty-eight of them. | Matter-of-fact, then a beat before the number. |

## 0:35 – 1:05 · HOW IT WORKS
*Inside the motor: 3-phase currents, rotating field, rotor follows · τ = kₜ·I · strain-wave gear 50:1 · encoder and control loop · muscle vs motor · P = I²R.*

| Cue | Start | Line | Delivery |
|---|---|---|---|
| C09 | 0:35.3 | Inside, current flows through copper coils. | Wonder, kept quiet. |
| C10 | 0:39.1 | The field pulls the magnets. The rotor turns. | Two short sentences that feel like cause and effect. |
| C11 | 0:43.3 | Torque rises with current. | Plain fact. The equation writes on screen as he speaks. |
| C12 | 0:46.4 | Gears trade speed for force. | Crisp. |
| C13 | 0:49.8 | Encoders read the angle, thousands of times a second. | A little faster here, to suggest speed. |
| C14 | 0:54.4 | Now, a muscle. Blood cools it. It absorbs shock. It heals. | Warmer. Three short beats with small pauses. |
| C15 | 1:00.3 | Copper only heats. Double the torque, four times the heat. | Cooler again. Lean on "four times". |

## 1:05 – 1:32 · THE BOTTLENECK
*The torque↔mass spiral · thermal camera and derating · slow-motion landing (≈3.5× body weight) · the egg · 28 × 1,000,000 · copied vs manufactured.*

| Cue | Start | Line | Delivery |
|---|---|---|---|
| C16 | 1:05.6 | Every joint is a trade. | A thesis line. Slow. |
| C17 | 1:08.0 | More torque needs more mass. More mass needs more torque. | A mirrored loop. Keep the rhythm identical both times. |
| C18 | 1:12.6 | Push hard, and motors overheat. | Tighter, with some tension. |
| C19 | 1:15.7 | Land a jump, and the gears take the blow. | "Blow" lands on the impact hit. |
| C20 | 1:19.1 | Gear down, and the joint loses its feel. | Softer, close to regretful. |
| C21 | 1:22.5 | Now build millions. Precise. Durable. Cheap. | Scale rising. Three single-word beats. |
| C22 | 1:27.6 | Intelligence can be copied. Muscle must be manufactured. | The key line of the film. Slow, with a pause in the middle. |

## 1:32 – 1:58 · CLOSING
*Dawn light on the actuator · the robot walks and flows through tai-chi · the visor wakes · palm up · title.*

| Cue | Start | Line | Delivery |
|---|---|---|---|
| C23 | 1:33.0 | Solve the actuator, and everything changes. | Hopeful, grounded, not salesy. |
| C24 | 1:39.0 | Machines that move like we do. | Gentle awe. |
| C25 | 1:45.6 | The brain is ready. | Quiet confidence. |
| C26 | 1:48.8 | The body is still being built. | The last line. Slow, and leave silence after it. |

---

## Voice recommendation (ElevenLabs)

Checked against the ElevenLabs voice library from this account:

| Pick | Voice | voice_id | Why |
|---|---|---|---|
| **1st** | **Atlas, Deep Gravelly Narrator** (US) | `3YzGaTGef0x5PLEK9yGq` | Built for documentary narration. A low register with unhurried authority, which fits "calm, precise, slightly awe-struck". |
| 2nd | Timothy, American Narrator | `lfBVYbXnblkOddWFfEIg` | Use this if Atlas sounds too gravelly. It is cleaner and brighter, with broadcast polish. |
| 3rd | Orion, Warm Authoritative (UK) | `VuLPiW02W0Qm8465ksBZ` | A British option with calm gravity and an intimate delivery. |
| alt | Connery, Deep & Immersive Documentary | `vLZJLcQMJCqxjrHGEVDO` | Richer and warmer. Works for the closing in particular. |

**Model:** `eleven_multilingual_v2`. It is the most stable model for narration, and it supports request stitching (`previous_text`, `next_text`, `previous_request_ids`), so separate clips still sound like one continuous read. `eleven_v3` is more expressive but less consistent from take to take. If you try it, generate each line 2–3 times and pick the best take.

**Settings** (the defaults in `audio/elevenlabs_vo.py`):

| Setting | Value | Notes |
|---|---|---|
| Stability | 0.55 | Lower (0.45) gives more drama. Higher (0.65) gives more even takes. |
| Similarity | 0.82 | |
| Style | 0.18 | Keep this low. High style values start to sound like a performance. |
| Speaker boost | on | |
| Speed | 0.96 | Slightly slower than natural. Use 0.92 for Atlas if it rushes. |
| Output | `pcm_44100` | Uncompressed WAV. Use `mp3_44100_192` if your plan doesn't include PCM. |
| Seed | fixed (7) | Takes are reproducible. Use `--seed` to re-roll a single line. |

```bash
export ELEVENLABS_API_KEY=...
python audio/elevenlabs_vo.py --voice atlas                    # all 26 lines → audio/vo/elevenlabs/
python audio/elevenlabs_vo.py --voice atlas --only C22 --seed 3 # re-roll one line
python audio/mix.py --vo audio/vo/elevenlabs --fit --video renders/<render>.mov --out renders/the-hardest-part.mp4
```

### Why this script suits TTS
- **Short, rhythmic sentences.** There are no subordinate clauses, the longest line is 10 words, and parallel structures (C05–C07, C17) give the model a clear prosody to follow.
- **Few consonant pile-ups.** Phrases like "strength-specific" and "backdrivability" were rewritten as plain words ("gear down", "loses its feel").
- **Numbers are spelled out** ("Twenty-eight"). There are no symbols or abbreviations for the model to verbalize.
- **Pronunciation checks:** *actuator* (AK-choo-ay-ter) and *pneumatics* (silent p) read correctly in Multilingual v2. If a voice stumbles, respell the word as "new-matics" in that clip only.
- **One clip per line.** Each clip lands on its frame regardless of read speed, and you can re-roll one bad take without touching the rest.

### Single-take alternative
If you would rather generate one continuous file, use Multilingual v2 with break tags (up to 3 s each). Then split the file at silences, or place it at 0:01.4 and adjust with `--offsets`.

```
This is the hardest part of the robot. <break time="1.6s" /> Not the brain. Not the battery. <break time="1.0s" /> The actuator.
<break time="2.8s" /> An actuator turns energy into controlled motion. <break time="1.0s" /> Hydraulics are strong, but heavy.
<break time="0.5s" /> Pneumatics are fast, but springy. <break time="0.5s" /> Soft actuators are safe, but weak. <break time="1.2s" />
Humanoids run on electric motors. Twenty-eight of them. <break time="3.0s" /> Inside, current flows through copper coils.
<break time="0.5s" /> The field pulls the magnets. The rotor turns. <break time="0.5s" /> Torque rises with current. <break time="1.0s" />
Gears trade speed for force. <break time="1.0s" /> Encoders read the angle, thousands of times a second. <break time="0.8s" />
Now, a muscle. Blood cools it. It absorbs shock. It heals. <break time="0.8s" /> Copper only heats. Double the torque, four times the heat.
<break time="1.0s" /> Every joint is a trade. <break time="0.4s" /> More torque needs more mass. More mass needs more torque.
<break time="0.6s" /> Push hard, and motors overheat. <break time="0.5s" /> Land a jump, and the gears take the blow. <break time="0.5s" />
Gear down, and the joint loses its feel. <break time="0.6s" /> Now build millions. Precise. Durable. Cheap. <break time="0.6s" />
Intelligence can be copied. Muscle must be manufactured. <break time="3.0s" /> Solve the actuator, and everything changes.
<break time="2.8s" /> Machines that move like we do. <break time="3.0s" /> <break time="1.5s" /> The brain is ready. <break time="1.2s" />
The body is still being built.
```

## Music brief (custom score)
Deep electronic pulses (sub-heavy, felt more than heard, around 75 BPM) under subtle low orchestral swells: celli, basses and soft brass pads. Tension builds through the bottleneck with a ♭2 then tritone colour over a constant E pedal. Everything drops to **total silence at 1:31.8** for one breath, then resolves into an open major (C → G/B → C) for the closing, with a single low, reverberant hit under the title at 1:53. Leave space between 1–4 kHz for the voice.

The temp score in `audio/score.py` follows this same shape, so a composer can match timings 1:1.
