// Material library + procedural textures + studio lighting environments.
// Everything is generated in code (no external texture files), deterministically.
import * as THREE from 'three';
import { rng, fract } from './timeline.js';

// ---------------------------------------------------------------- procedural textures
function heightToNormal(size, heightFn, strength = 2.0, repeat = true) {
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) h[y * size + x] = heightFn(x / size, y / size);
  const data = new Uint8Array(size * size * 4);
  const at = (x, y) => {
    if (repeat) { x = (x + size) % size; y = (y + size) % size; } else { x = Math.min(size - 1, Math.max(0, x)); y = Math.min(size - 1, Math.max(0, y)); }
    return h[y * size + x];
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
    const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
    const nz = 1 / Math.sqrt(dx * dx + dy * dy + 1);
    const i = (y * size + x) * 4;
    data[i] = (-dx * nz * 0.5 + 0.5) * 255;
    data[i + 1] = (-dy * nz * 0.5 + 0.5) * 255;
    data[i + 2] = (nz * 0.5 + 0.5) * 255;
    data[i + 3] = 255;
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

function valueNoise2(seed) {
  const r = rng(seed);
  const N = 256, tab = new Float32Array(N * N);
  for (let i = 0; i < tab.length; i++) tab[i] = r();
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const g = (a, b) => tab[((b & 255) * N) + (a & 255)];
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return (g(xi, yi) * (1 - u) + g(xi + 1, yi) * u) * (1 - v) + (g(xi, yi + 1) * (1 - u) + g(xi + 1, yi + 1) * u) * v;
  };
}

export const TEX = {};
export function buildTextures() {
  const n2 = valueNoise2(7);
  // Machined concentric grooves (for faces with planar radial UVs centered at 0.5,0.5)
  TEX.grooves = heightToNormal(512, (u, v) => {
    const r = Math.hypot(u - 0.5, v - 0.5);
    return 0.5 + 0.5 * Math.sin(r * 2 * Math.PI * 46) * 0.5 + 0.25 * Math.sin(r * 2 * Math.PI * 9.0 + 1.0) * (r > 0.33 && r < 0.36 ? 1 : 0);
  }, 3.0, false);
  // Brushed / bead-blasted anodizing (tileable, streaks along U)
  TEX.brushed = heightToNormal(256, (u, v) => n2(u * 4, v * 256) * 0.6 + n2(u * 20, v * 64) * 0.4, 0.9);
  // Copper wire turns: rounded ridges across U
  TEX.wire = heightToNormal(256, (u, v) => Math.sqrt(Math.abs(Math.sin(u * Math.PI * 24))) + n2(u * 8, v * 8) * 0.05, 4.0);
  // Electrical steel laminations: fine stripes across V
  TEX.lamination = heightToNormal(256, (u, v) => (fract(v * 48) > 0.88 ? 0 : 1) + n2(u * 32, v * 32) * 0.05, 1.5);
  // Fine thread / knurl for screws: diagonal ridges
  TEX.thread = heightToNormal(256, (u, v) => Math.abs(Math.sin((u * 1 + v * 16) * Math.PI)), 3.0);
  // Muscle striation (sarcomere banding) across V, fibre direction along V
  TEX.striation = heightToNormal(256, (u, v) => 0.5 + 0.5 * Math.sin(v * Math.PI * 2 * 40) * (0.7 + 0.3 * n2(u * 30, v * 4)) + n2(u * 60, v * 2) * 0.3, 1.6);
  // Carbon-ish composite weave for black parts
  TEX.weave = heightToNormal(256, (u, v) => {
    const a = Math.sin(u * Math.PI * 32), b = Math.sin(v * Math.PI * 32);
    return (fract(u * 16) < 0.5) !== (fract(v * 16) < 0.5) ? 0.5 + 0.5 * a : 0.5 + 0.5 * b;
  }, 0.6);
}

// ---------------------------------------------------------------- materials
export const M = {};
export function buildMaterials() {
  buildTextures();
  const phys = (o) => new THREE.MeshPhysicalMaterial(o);
  const std = (o) => new THREE.MeshStandardMaterial(o);

  M.shellWhite = phys({ color: 0xe4e6e9, roughness: 0.42, metalness: 0.0, clearcoat: 0.55, clearcoatRoughness: 0.22 });
  M.shellGrey = phys({ color: 0x9ea3aa, roughness: 0.5, metalness: 0.1, clearcoat: 0.3, clearcoatRoughness: 0.3 });
  M.shellBlack = phys({ color: 0x0c0d10, roughness: 0.22, metalness: 0.1, clearcoat: 1.0, clearcoatRoughness: 0.06 });
  M.visor = phys({ color: 0x050608, roughness: 0.08, metalness: 0.3, clearcoat: 1.0, clearcoatRoughness: 0.02 });
  M.structure = std({ color: 0x15171b, roughness: 0.55, metalness: 0.5, normalMap: TEX.weave, normalScale: new THREE.Vector2(0.25, 0.25) });
  M.graphite = std({ color: 0x2a2e34, roughness: 0.34, metalness: 0.92, normalMap: TEX.brushed, normalScale: new THREE.Vector2(0.18, 0.18) });
  M.graphiteCap = std({ color: 0x30353c, roughness: 0.3, metalness: 0.95, normalMap: TEX.grooves, normalScale: new THREE.Vector2(0.35, 0.35) });
  M.alu = std({ color: 0xc9ced6, roughness: 0.24, metalness: 1.0, normalMap: TEX.brushed, normalScale: new THREE.Vector2(0.12, 0.12) });
  M.aluCap = std({ color: 0xd4d8de, roughness: 0.2, metalness: 1.0, normalMap: TEX.grooves, normalScale: new THREE.Vector2(0.6, 0.6) });
  M.steel = std({ color: 0x8c9198, roughness: 0.3, metalness: 1.0 });
  M.darkSteel = std({ color: 0x3a3e45, roughness: 0.38, metalness: 1.0, normalMap: TEX.brushed, normalScale: new THREE.Vector2(0.1, 0.1) });
  M.chrome = std({ color: 0xf0f2f5, roughness: 0.06, metalness: 1.0 });
  M.copper = std({ color: 0xc8733f, roughness: 0.28, metalness: 1.0, normalMap: TEX.wire, normalScale: new THREE.Vector2(0.9, 0.9), emissive: 0x000000 });
  M.lamination = std({ color: 0x4a4f57, roughness: 0.42, metalness: 0.9, normalMap: TEX.lamination, normalScale: new THREE.Vector2(0.6, 0.6) });
  M.magnetN = std({ color: 0xb8424a, roughness: 0.3, metalness: 0.75 });
  M.magnetS = std({ color: 0x3f63b8, roughness: 0.3, metalness: 0.75 });
  M.rubber = std({ color: 0x0b0b0c, roughness: 0.85, metalness: 0.0 });
  M.hose = std({ color: 0x101113, roughness: 0.55, metalness: 0.0, normalMap: TEX.brushed, normalScale: new THREE.Vector2(0.4, 0.4) });
  M.thread = std({ color: 0xbfc4cb, roughness: 0.22, metalness: 1.0, normalMap: TEX.thread, normalScale: new THREE.Vector2(1.2, 1.2) });
  M.floor = std({ color: 0x07080a, roughness: 0.62, metalness: 0.0 });
  M.section = std({ color: 0x8a6a52, roughness: 0.5, metalness: 0.6 }); // cut faces
  M.muscle = phys({ color: 0x8f2433, roughness: 0.38, metalness: 0.0, clearcoat: 0.8, clearcoatRoughness: 0.25, normalMap: TEX.striation, normalScale: new THREE.Vector2(0.7, 0.7), sheen: 0.6, sheenColor: new THREE.Color(0xff8a8a), sheenRoughness: 0.4 });
  M.fascia = phys({ color: 0xe8d6cf, roughness: 0.3, metalness: 0.0, transparent: true, opacity: 0.12, clearcoat: 1, clearcoatRoughness: 0.1, depthWrite: false });
  M.tendon = phys({ color: 0xe9e2d6, roughness: 0.35, metalness: 0.0, sheen: 1.0, sheenColor: new THREE.Color(0xffffff), clearcoat: 0.5 });
}

/** Unlit HDR emissive (blooms). intensity > 1 pushes into HDR. */
export function glow(color, intensity = 3, opts = {}) {
  const c = new THREE.Color(color).multiplyScalar(intensity);
  return new THREE.MeshBasicMaterial({ color: c, toneMapped: false, transparent: opts.transparent ?? false, opacity: opts.opacity ?? 1,
    blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: opts.depthWrite ?? !opts.additive, side: opts.side ?? THREE.FrontSide });
}

/** Black-body-ish temperature color (0 = cold … 1 = white-hot). */
export function heatColor(k, out = new THREE.Color()) {
  const stops = [[0, [0, 0, 0]], [0.25, [0.35, 0.02, 0.0]], [0.5, [1.0, 0.18, 0.02]], [0.75, [1.0, 0.55, 0.12]], [1.0, [1.0, 0.92, 0.75]]];
  k = Math.min(1, Math.max(0, k));
  let i = 0;
  while (i < stops.length - 2 && k > stops[i + 1][0]) i++;
  const [k0, c0] = stops[i], [k1, c1] = stops[i + 1];
  const u = (k - k0) / (k1 - k0);
  return out.setRGB(c0[0] + (c1[0] - c0[0]) * u, c0[1] + (c1[1] - c0[1]) * u, c0[2] + (c1[2] - c0[2]) * u);
}

// ---------------------------------------------------------------- studio environments
// Product-film lighting: black room, long softbox strips → crisp specular streaks on metal.
export function makeEnvironment(renderer, preset = 'studio') {
  const scene = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.MeshBasicMaterial({ color: preset === 'warm' ? 0x0d0a08 : 0x040506, side: THREE.BackSide }));
  scene.add(room);
  const strip = (w, h, color, intensity, pos, look) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }));
    m.position.set(...pos);
    m.lookAt(...look);
    scene.add(m);
  };
  if (preset === 'studio') {
    strip(24, 2.2, 0xffffff, 3.2, [0, 14, 4], [0, 0, 0]);       // overhead key strip
    strip(2.2, 18, 0xbfd9ff, 2.2, [-16, 4, -4], [0, 2, 0]);    // cool rim left
    strip(2.2, 18, 0xffe2c4, 1.7, [16, 4, -6], [0, 2, 0]);     // warm rim right
    strip(10, 6, 0xffffff, 0.9, [4, 3, 18], [0, 1, 0]);        // soft front fill
    strip(30, 30, 0x101418, 1.0, [0, -14, 0], [0, 0, 0]);      // floor bounce
  } else if (preset === 'warm') {
    strip(30, 14, 0xffc894, 2.6, [-14, 8, -14], [0, 2, 0]);    // low sun-like source
    strip(2.2, 18, 0x9ccfff, 1.2, [16, 5, 4], [0, 2, 0]);
    strip(24, 2.2, 0xfff0e0, 1.2, [0, 14, 4], [0, 0, 0]);
    strip(30, 30, 0x1a120c, 1.0, [0, -14, 0], [0, 0, 0]);
  } else if (preset === 'cold') {
    strip(24, 2.0, 0xdfeaff, 2.6, [0, 14, 2], [0, 0, 0]);
    strip(2.0, 18, 0x7fb8ff, 2.4, [-16, 4, -2], [0, 2, 0]);
    strip(2.0, 18, 0x7fb8ff, 1.6, [16, 4, -2], [0, 2, 0]);
    strip(30, 30, 0x0a0d12, 1.0, [0, -14, 0], [0, 0, 0]);
  }
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(scene, 0.02).texture;
  pm.dispose();
  return tex;
}
