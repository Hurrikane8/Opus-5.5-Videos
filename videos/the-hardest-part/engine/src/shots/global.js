// Overlays that span shots: chapter markers and (optional) preview subtitles.
import { env } from '../core/timeline.js';
import { C } from '../core/overlay.js';

const params = new URLSearchParams(location.search);

export const CHAPTERS = [
  { t0: 12.5, t1: 17.0, num: 'I', title: 'What an actuator is' },
  { t0: 35.3, t1: 40.0, num: 'II', title: 'How it works' },
  { t0: 65.7, t1: 70.5, num: 'III', title: 'The bottleneck' },
  { t0: 92.5, t1: 97.5, num: 'IV', title: 'What comes next' },
];

export function drawGlobalOverlay(o, t, ctx) {
  for (const c of CHAPTERS) {
    const a = env(t, c.t0, c.t1, 0.6, 0.8);
    if (a > 0) o.chapter(c.num, c.title, a);
  }
  if (params.has('subs') && ctx) {
    const cue = [...ctx.cues.cues].reverse().find((c) => t >= c.start);
    if (cue && t < cue.start + Math.max(2.2, cue.text.split(' ').length * 0.42)) {
      o.pad(960, 1000, 700, 46, 0.55);
      o.text(cue.text, 960, 1010, { size: 30, weight: 400, align: 'center', color: C.white, alpha: 0.92 });
    }
  }
  if (params.has('guides')) {
    o.rect(96, 54, 1728, 972, { w: 1, color: 'rgba(255,0,255,0.5)' });
    o.text(t.toFixed(2), 1820, 40, { family: 'mono', size: 18, align: 'right', color: '#f0f' });
  }
}
