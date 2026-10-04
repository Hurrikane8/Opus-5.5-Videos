// Procedural geometry helpers: superellipsoid shells, lathe-turned machined parts,
// actuator modules, tubes and gear profiles.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { glow } from './materials.js';

export { mergeGeometries };

const sp = (v, k) => Math.sign(v) * Math.pow(Math.abs(v), k);

/**
 * Superellipsoid (rounded-box ↔ ellipsoid) with optional taper/shape function.
 * e < 1 → boxier.  shape(x, y, z) gets unit-space coords and returns [x, y, z].
 */
export function superellipsoid({ rx = 1, ry = 1, rz = 1, e = 0.5, ew = e, seg = 40, rings = 28, shape = null, uv = false } = {}) {
  let g = new THREE.SphereGeometry(1, seg, rings);
  if (!uv) { g.deleteAttribute('uv'); g.deleteAttribute('normal'); g = mergeVertices(g); }
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = sp(p.getX(i), ew), y = sp(p.getY(i), e), z = sp(p.getZ(i), ew);
    if (shape) [x, y, z] = shape(x, y, z);
    p.setXYZ(i, x * rx, y * ry, z * rz);
  }
  g.computeVertexNormals();
  return g;
}

/** Lathe from [[r, y], ...] around the Y axis. */
export function lathe(profile, segs = 64, phiStart = 0, phiLength = Math.PI * 2) {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.0001), y)), segs, phiStart, phiLength);
}

/** Planar disc with radial UVs centered at (0.5, 0.5) — for groove normal maps. */
export function disc(r, segs = 64, rInner = 0) {
  const g = rInner > 0 ? new THREE.RingGeometry(rInner, r, segs, 1) : new THREE.CircleGeometry(r, segs);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, 0.5 + p.getX(i) / (2 * r), 0.5 + p.getY(i) / (2 * r));
  g.rotateX(-Math.PI / 2); // face +Y
  return g;
}

/** Rotate a +Y-axis geometry/object so its axis points along 'x' | 'y' | 'z'. */
export function alignAxis(obj, axis) {
  if (axis === 'x') obj.rotation.z = -Math.PI / 2;
  else if (axis === 'z') obj.rotation.x = Math.PI / 2;
  else if (axis === '-x') obj.rotation.z = Math.PI / 2;
  else if (axis === '-z') obj.rotation.x = -Math.PI / 2;
  return obj;
}

/**
 * Machined rotary actuator module (axis +Y): anodized housing with chamfers,
 * recessed grooved end caps, bolt circle, output hub and an emissive status ring.
 */
export function actuatorModule({ r = 0.05, len = 0.06, housing, cap, hub, ringColor = 0x6fe3ff, segs = 48, bolts = 8, twoSided = true, hero = false } = {}) {
  const g = new THREE.Group();
  const c = r * 0.09;
  const L = len / 2;
  const prof = [
    [r * 0.64, -L], [r - c, -L], [r, -L + c], [r, -L * 0.18], [r * 0.955, -L * 0.14], [r * 0.955, L * 0.14], [r, L * 0.18],
    [r, L - c], [r - c, L], [r * 0.64, L],
  ];
  const body = new THREE.Mesh(lathe(prof, segs), housing);
  g.add(body);
  // recessed faces
  const ringMat = glow(ringColor, 0.0);
  const faces = twoSided ? [1, -1] : [1];
  const ringGeo = new THREE.TorusGeometry(r * 0.615, r * (hero ? 0.012 : 0.022), 6, segs);
  const capGeo = disc(r * 0.6, segs);
  const stepGeo = lathe([[r * 0.64, 0], [r * 0.6, -r * 0.08]], segs);
  for (const s of faces) {
    const f = new THREE.Group();
    f.position.y = s * L;
    if (s < 0) f.rotation.x = Math.PI;
    const step = new THREE.Mesh(stepGeo, housing);
    f.add(step);
    const capM = new THREE.Mesh(capGeo, cap);
    capM.position.y = -r * 0.08;
    f.add(capM);
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -r * 0.04;
    f.add(ring);
    if (s > 0 || hero) {
      const hubM = new THREE.Mesh(lathe([[0, r * 0.06], [r * 0.2, r * 0.06], [r * 0.24, r * 0.02], [r * 0.24, -r * 0.08]], segs), hub || housing);
      hubM.position.y = -r * 0.08;
      f.add(hubM);
      if (bolts) {
        const bg = [];
        for (let i = 0; i < bolts; i++) {
          const a = (i / bolts) * Math.PI * 2;
          const b = new THREE.CylinderGeometry(r * 0.035, r * 0.035, r * 0.04, 10);
          b.translate(Math.cos(a) * r * 0.42, -r * 0.06, Math.sin(a) * r * 0.42);
          bg.push(b);
        }
        f.add(new THREE.Mesh(mergeGeometries(bg), hub || housing));
      }
    }
    if (hero) {
      const bez = new THREE.Mesh(disc(r - c * 1.2, segs * 2, r * 0.66), bezelMaterial());
      bez.position.y = 0.0004;
      f.add(bez);
    }
    g.add(f);
  }
  g.userData.ringMat = ringMat;
  g.userData.radius = r;
  return g;
}

let _bezel = null;
/** Machined bezel: engraved ticks + small legend, like a watch / instrument ring. */
export function bezelMaterial() {
  if (_bezel) return _bezel;
  const N = 1024, cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const g = cv.getContext('2d');
  g.fillStyle = '#3a3f46'; g.fillRect(0, 0, N, N);
  g.translate(N / 2, N / 2);
  for (let i = 0; i < 120; i++) {
    const a = (i / 120) * Math.PI * 2, major = i % 10 === 0;
    g.strokeStyle = major ? '#d8dde3' : '#9aa1a9';
    g.lineWidth = major ? 3 : 1.6;
    g.beginPath();
    g.moveTo(Math.cos(a) * N * 0.47, Math.sin(a) * N * 0.47);
    g.lineTo(Math.cos(a) * N * (major ? 0.405 : 0.43), Math.sin(a) * N * (major ? 0.405 : 0.43));
    g.stroke();
  }
  g.fillStyle = '#c9ced5';
  g.font = '500 30px "Plex Mono", monospace';
  const legend = 'J07  ·  48 V  ·  STRAIN-WAVE 50:1  ·  ';
  for (let k = 0; k < 2; k++) {
    let a0 = -Math.PI / 2 + k * Math.PI;
    for (const ch of legend) {
      g.save(); g.rotate(a0); g.translate(0, -N * 0.37); g.fillText(ch, 0, 0); g.restore();
      a0 += (g.measureText(ch).width + 2) / (N * 0.37);
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  _bezel = new THREE.MeshStandardMaterial({ map: t, metalness: 0.85, roughness: 0.32 });
  return _bezel;
}

/** Tube along a list of Vector3 points (Catmull-Rom). */
export function tubeAlong(points, radius, tubular = 64, radial = 10, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points, closed, 'centripetal');
  return new THREE.TubeGeometry(curve, tubular, radius, radial, closed);
}

/** Rounded rectangle closed path in XY (for coils around stator teeth). */
export function roundedRectPath(w, h, r, n = 8) {
  const pts = [];
  const corners = [[w / 2 - r, h / 2 - r, 0], [-w / 2 + r, h / 2 - r, Math.PI / 2], [-w / 2 + r, -h / 2 + r, Math.PI], [w / 2 - r, -h / 2 + r, Math.PI * 1.5]];
  for (const [cx, cy, a0] of corners) for (let i = 0; i <= n; i++) { const a = a0 + (i / n) * Math.PI / 2; pts.push(new THREE.Vector3(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0)); }
  return pts;
}

/** Linear actuator (cylinder body + chrome rod + eyelets) along +Y, length = closed length. */
export function linearActuator({ r = 0.018, len = 0.25, ext = 0, body, rod, ringColor = 0x6fe3ff } = {}) {
  const g = new THREE.Group();
  const bodyLen = len * 0.62;
  const b = new THREE.Mesh(lathe([[0, 0], [r * 0.8, 0], [r, r * 0.2], [r, bodyLen - r * 0.2], [r * 0.85, bodyLen], [r * 0.45, bodyLen + r * 0.2], [0, bodyLen + r * 0.2]], 24), body);
  g.add(b);
  const ringMat = glow(ringColor, 0.0);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.0, r * 0.07, 6, 24), ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = bodyLen * 0.2;
  g.add(ring);
  const rodM = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.38, r * 0.38, len * 0.5, 16), rod);
  rodM.position.y = bodyLen + len * 0.25 - len * 0.1;
  const rodG = new THREE.Group();
  rodG.add(rodM);
  const eye = new THREE.Mesh(new THREE.TorusGeometry(r * 0.5, r * 0.18, 8, 16), body);
  eye.position.y = bodyLen + len * 0.5 - len * 0.1;
  rodG.add(eye);
  g.add(rodG);
  const eye0 = new THREE.Mesh(new THREE.TorusGeometry(r * 0.5, r * 0.18, 8, 16), body);
  eye0.position.y = -r * 0.4;
  g.add(eye0);
  g.userData = { ringMat, rod: rodG, setExtension: (e) => { rodG.position.y = e; } };
  return g;
}

/** Toothed ring outline for a gear: returns THREE.Path points (CCW) at radius rp with N teeth. */
export function gearOutline(N, rRoot, rTip, ptsPerTooth = 10, phase = 0) {
  const pts = [];
  const total = N * ptsPerTooth;
  for (let i = 0; i < total; i++) {
    const a = (i / total) * Math.PI * 2 + phase;
    const u = (i % ptsPerTooth) / ptsPerTooth; // 0..1 across one pitch
    // smooth trapezoid-ish involute stand-in: tip plateau, flanks, root
    const s = 0.5 - 0.5 * Math.cos(u * Math.PI * 2);
    const k = Math.min(1, Math.max(0, (s - 0.12) / 0.76));
    const r = rRoot + (rTip - rRoot) * (k * k * (3 - 2 * k));
    pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r));
  }
  return pts;
}
