// Film runtime: deterministic renderFrame(t) for the offline renderer, plus a scrub UI.
//
//   ?t=12.5          render a single frame at 12.5 s
//   ?scrub=1         interactive timeline (play / drag) — realtime on a GPU machine
//   ?w=1920&h=1080   output size          ?q=preview|final   quality preset
import * as THREE from 'three';
import { Post, resolvePost, mixPost, DEFAULT_POST } from './core/post.js';
import { Overlay } from './core/overlay.js';
import { buildMaterials, makeEnvironment } from './core/materials.js';
import { Plates } from './core/plates.js';
import { SHOTS as ALL_SHOTS } from './shots/index.js';
import { DEBUG_SHOTS } from './shots/debug.js';
import { drawGlobalOverlay } from './shots/global.js';

const params = new URLSearchParams(location.search);
const W = +params.get('w') || 1920;
const H = +params.get('h') || Math.round((W * 9) / 16);
const QUALITY = params.get('q') || 'preview';
const PRESETS = {
  preview: { msaa: 0, samples: 1, shadow: 1024, dofRadScale: 1.6, fxaa: true },
  final: { msaa: 4, samples: 8, shadow: 2048, dofRadScale: 0.8, fxaa: false },
};
const Q = { ...PRESETS[QUALITY], ...(params.get('samples') ? { samples: +params.get('samples') } : {}), ...(params.has('nofxaa') ? { fxaa: false } : {}) };
const FPS = +params.get('fps') || 30;
const SHUTTER = 0.5; // 180° shutter

// ?only=<shotId> renders a single shot across the whole timeline (debug / look-dev)
const ONLY = params.get('only');
const SHOTS = ONLY ? [{ ...([...ALL_SHOTS, ...DEBUG_SHOTS].find((s) => s.id === ONLY)), start: 0, end: 1e9, transitionIn: null }] : ALL_SHOTS;
const canvas = document.getElementById('c');
canvas.width = W; canvas.height = H;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance', alpha: false });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.shadowMap.enabled = !params.has('noshadow');
renderer.shadowMap.type = QUALITY === 'final' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
renderer.toneMapping = THREE.NoToneMapping;
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.localClippingEnabled = true;

const post = new Post(renderer, W, H, Q);
const overlay = new Overlay(W, H);
const plates = new Plates('../assets/plates/');

async function loadFonts() {
  const F = (fam, file, weight, style = 'normal') => new FontFace(fam, `url(../assets/fonts/${file})`, { weight: String(weight), style });
  const faces = [
    F('Inter', 'inter-latin-200-normal.woff2', 200), F('Inter', 'inter-latin-300-normal.woff2', 300),
    F('Inter', 'inter-latin-400-normal.woff2', 400), F('Inter', 'inter-latin-500-normal.woff2', 500),
    F('Inter', 'inter-latin-600-normal.woff2', 600), F('Inter', 'inter-latin-700-normal.woff2', 700),
    F('Plex Mono', 'ibm-plex-mono-latin-400-normal.woff2', 400), F('Plex Mono', 'ibm-plex-mono-latin-500-normal.woff2', 500),
    F('Garamond', 'eb-garamond-latin-400-italic.woff2', 400, 'italic'),
  ];
  await Promise.all(faces.map(async (f) => { await f.load(); document.fonts.add(f); }));
}

let ctx = null;
const instances = new Map();

function instance(shot) {
  let inst = instances.get(shot.id);
  if (!inst) {
    inst = shot.build(ctx);
    if (!inst.keepAspect) { inst.camera.aspect = W / H; inst.camera.updateProjectionMatrix(); }
    instances.set(shot.id, inst);
  }
  return inst;
}

/** Which shots contribute at time t, with weights (handles dissolves / fades). */
function activeShots(t) {
  let i = SHOTS.findIndex((s) => t >= s.start && t < s.end);
  if (i < 0) i = t < SHOTS[0].start ? 0 : SHOTS.length - 1;
  const cur = SHOTS[i];
  const tr = cur.transitionIn;
  if (tr && i > 0 && t < cur.start + tr.dur) {
    const k = (t - cur.start) / tr.dur;
    const prev = SHOTS[i - 1];
    if (tr.type === 'dissolve') return [[prev, 1 - k], [cur, k]];
    if (tr.type === 'fade') return k < 0.5 ? [[prev, 1 - k * 2]] : [[cur, (k - 0.5) * 2]];
  }
  return [[cur, 1]];
}

const DBG = { nodof: params.has('nodof'), nobloom: params.has('nobloom') };
function postAt(inst, t, lt) {
  const p = resolvePost(typeof inst.post === 'function' ? inst.post(t, lt) : inst.post || {});
  if (DBG.nodof) p.dof = null;
  if (DBG.nobloom) p.bloom.strength = 0;
  return p;
}

async function renderFrame(t) {
  const list = activeShots(t);
  const S = Q.samples;
  post.beginFrame();
  for (let s = 0; s < S; s++) {
    const ts = S > 1 ? t + ((s + 0.5) / S - 0.5) * (SHUTTER / FPS) : t;
    for (const [shot, w] of list) {
      const inst = instance(shot);
      const lt = ts - shot.start;
      inst.update(ts, lt);
      if (S > 1 && !params.has('nojitter')) { // sub-pixel jitter doubles as anti-aliasing
        const jx = ((s * 0.618034) % 1) - 0.5, jy = ((s * 0.754877) % 1) - 0.5;
        inst.camera.setViewOffset(W, H, jx, jy, W, H);
      }
      post.addShot(inst, w / S, postAt(inst, ts, lt));
      if (S > 1) inst.camera.clearViewOffset();
    }
  }
  // final-pass params (blend across a dissolve)
  let P = postAt(instance(list[0][0]), t, t - list[0][0].start);
  if (list.length > 1) P = mixPost(P, postAt(instance(list[1][0]), t, t - list[1][0].start), list[1][1]);
  if (list.length === 1 && list[0][1] < 1) P.fade *= list[0][1];

  // overlays
  const need = [];
  for (const [shot] of list) { const inst = instance(shot); if (inst.plates) need.push(...inst.plates(t, t - shot.start)); }
  await plates.ensure(need);
  overlay.begin();
  for (const [shot, w] of list) {
    const inst = instance(shot);
    if (inst.overlay) overlay.group(list.length > 1 ? w : 1, () => inst.overlay(overlay, t, t - shot.start, plates));
  }
  drawGlobalOverlay(overlay, t, ctx);
  overlay.end();
  post.finish(P, overlay.texture, t);
  renderer.getContext().finish();
  return true;
}

async function boot() {
  buildMaterials();
  await loadFonts();
  const cues = await (await fetch('../script/cues.json')).json();
  await plates.loadManifest();
  ctx = {
    renderer, W, H, quality: QUALITY, Q, cues, plates,
    env: { studio: makeEnvironment(renderer, 'studio'), warm: makeEnvironment(renderer, 'warm'), cold: makeEnvironment(renderer, 'cold') },
  };
  window.__film = { renderFrame, duration: cues.duration, fps: FPS, shots: SHOTS.map((s) => ({ id: s.id, start: s.start, end: s.end })), W, H };
  // pre-build every shot so the first frame of each doesn't stall the renderer
  if (params.get('prebuild') !== '0') for (const s of SHOTS) instance(s);
  if (params.has('scrub')) startScrub(cues.duration);
  else await renderFrame(+params.get('t') || 0);
  window.__ready = true;
}

function startScrub(duration) {
  const ui = document.getElementById('ui');
  ui.style.display = 'flex';
  const slider = document.getElementById('time');
  const label = document.getElementById('label');
  const play = document.getElementById('play');
  slider.max = duration;
  let playing = false, t = +params.get('t') || 0, last = performance.now(), busy = false;
  const draw = async () => {
    if (busy) return;
    busy = true;
    await renderFrame(t);
    label.textContent = `${t.toFixed(2)}s  ${SHOTS.find((s) => t >= s.start && t < s.end)?.id || ''}`;
    busy = false;
  };
  slider.oninput = () => { t = +slider.value; draw(); };
  play.onclick = () => { playing = !playing; play.textContent = playing ? 'Pause' : 'Play'; last = performance.now(); };
  const loop = (now) => {
    if (playing && !busy) { t = (t + (now - last) / 1000) % duration; slider.value = t; draw(); }
    last = now;
    requestAnimationFrame(loop);
  };
  draw();
  requestAnimationFrame(loop);
}

boot().catch((e) => { console.error(e); window.__error = String(e && e.stack || e); });
export { DEFAULT_POST };
