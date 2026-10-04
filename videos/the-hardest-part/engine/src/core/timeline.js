// Deterministic timing helpers. Everything in the film is a pure function of time t
// (seconds) — no Math.random(), no wall clock — so any frame renders identically.

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, x) => clamp((x - a) / (b - a));
export const smoothstep = (a, b, x) => { const t = invLerp(a, b, x); return t * t * (3 - 2 * t); };
export const smootherstep = (a, b, x) => { const t = invLerp(a, b, x); return t * t * t * (t * (t * 6 - 15) + 10); };
export const fract = (x) => x - Math.floor(x);
export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export const ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outQuart: (t) => 1 - Math.pow(1 - t, 4),
  inOutQuart: (t) => (t < 0.5 ? 8 * t ** 4 : 1 - Math.pow(-2 * t + 2, 4) / 2),
  outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inExpo: (t) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
  inOutExpo: (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2),
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  outSine: (t) => Math.sin((t * Math.PI) / 2),
  outBack: (t) => { const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  outElastic: (t) => (t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (TAU / 3)) + 1),
};

/** Normalized progress of t through [a, b], eased. */
export const prog = (t, a, b, e = ease.inOutCubic) => e(invLerp(a, b, t));

/** Fade envelope: 0 → 1 over [a, a+fi], hold, 1 → 0 over [b-fo, b]. */
export function env(t, a, b, fi = 0.4, fo = 0.4) {
  if (t <= a || t >= b) return 0;
  return Math.min(fi > 0 ? smoothstep(a, a + fi, t) : 1, fo > 0 ? 1 - smoothstep(b - fo, b, t) : 1);
}

/**
 * Keyframe track: keys = [[time, value], ...] where value is a number or array.
 * Interpolates with a per-segment ease (default inOutCubic) or Catmull-Rom when smooth=true.
 */
export function track(keys, t, { e = ease.inOutCubic, smooth = false } = {}) {
  if (t <= keys[0][0]) return keys[0][1];
  const n = keys.length;
  if (t >= keys[n - 1][0]) return keys[n - 1][1];
  let i = 0;
  while (i < n - 2 && t > keys[i + 1][0]) i++;
  const [t0, v0] = keys[i], [t1, v1] = keys[i + 1];
  const u = (t - t0) / (t1 - t0);
  if (!smooth) {
    const k = e(u);
    return Array.isArray(v0) ? v0.map((a, j) => lerp(a, v1[j], k)) : lerp(v0, v1, k);
  }
  const vm = keys[Math.max(0, i - 1)][1], vp = keys[Math.min(n - 1, i + 2)][1];
  const cr = (p0, p1, p2, p3) => 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u);
  return Array.isArray(v0) ? v0.map((_, j) => cr(vm[j], v0[j], v1[j], vp[j])) : cr(vm, v0, v1, vp);
}

/** Seeded PRNG (mulberry32). */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stateless hash noise in [0,1). */
export const hash = (n) => fract(Math.sin(n * 127.1 + 311.7) * 43758.5453123);

/** Smooth 1D value noise in [-1, 1]. */
export function noise1(x, seed = 0) {
  const i = Math.floor(x), f = x - i;
  const a = hash(i + seed * 57.0), b = hash(i + 1 + seed * 57.0);
  const u = f * f * (3 - 2 * f);
  return (a + (b - a) * u) * 2 - 1;
}

/** Fractal noise, handy for organic camera shake / idle motion. */
export const fbm1 = (x, seed = 0) => noise1(x, seed) * 0.6 + noise1(x * 2.13, seed + 3) * 0.28 + noise1(x * 4.37, seed + 7) * 0.12;

/** Critically damped spring response to a unit step at t=0 (for settle / overshoot motion). */
export function springStep(t, freq = 4, damping = 0.35) {
  if (t <= 0) return 0;
  const w = TAU * freq, z = damping;
  if (z >= 1) return 1 - (1 + w * t) * Math.exp(-w * t);
  const wd = w * Math.sqrt(1 - z * z);
  return 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + (z / Math.sqrt(1 - z * z)) * Math.sin(wd * t));
}

/** Number formatting with fixed decimals and optional sign. */
export const fmt = (v, d = 1, sign = false) => (sign && v >= 0 ? '+' : '') + v.toFixed(d);
