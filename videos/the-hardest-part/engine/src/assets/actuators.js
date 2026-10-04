// The actuator family for the comparison lineup (all stand upright along +Y, base at y = 0),
// plus exploded electric actuators and an optical encoder.
import * as THREE from 'three';
import { M, glow } from '../core/materials.js';
import { lathe, disc, tubeAlong, mergeGeometries, superellipsoid, actuatorModule, alignAxis } from '../core/geo.js';
import { Motor } from './motor.js';
import { HarmonicDrive } from './harmonic.js';
import { rng } from '../core/timeline.js';

const shadowed = (o) => { o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); return o; };
const cutMat = (base) => { const m = base.clone(); m.side = THREE.DoubleSide; return m; };

// ------------------------------------------------------------------ hydraulic
export function hydraulicCylinder() {
  const g = new THREE.Group();
  const R = 0.07, H = 0.44, y0 = 0.07;
  // clevis base
  g.add(new THREE.Mesh(lathe([[0, 0], [0.05, 0], [0.055, 0.01], [0.055, y0], [0, y0]], 48), M.darkSteel));
  // barrel cut away (270°) to reveal piston + oil
  const barrel = new THREE.Mesh(lathe([[R - 0.008, y0], [R, y0], [R + 0.006, y0 + 0.01], [R + 0.006, y0 + H - 0.01], [R, y0 + H], [R - 0.008, y0 + H]], 96, Math.PI * 0.35, Math.PI * 1.5), cutMat(M.alu));
  g.add(barrel);
  // end caps (full) with tie-rod nuts
  for (const y of [y0, y0 + H]) {
    const cap = new THREE.Mesh(lathe([[0.02, y - 0.018], [R + 0.016, y - 0.018], [R + 0.02, y - 0.012], [R + 0.02, y + 0.012], [R + 0.016, y + 0.018], [0.02, y + 0.018]], 64), M.darkSteel);
    g.add(cap);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const nut = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.05, 6), M.steel);
      nut.position.set(Math.cos(a) * (R + 0.01), y, Math.sin(a) * (R + 0.01));
      g.add(nut);
    }
  }
  // oil (pressurized, amber) and piston
  const oilMat = new THREE.MeshPhysicalMaterial({ color: 0x7a3608, roughness: 0.1, metalness: 0.0, clearcoat: 1, emissive: new THREE.Color(0xff6a10), emissiveIntensity: 0.1 });
  const oil = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.009, R - 0.009, 1, 48), oilMat);
  g.add(oil);
  const piston = new THREE.Group();
  piston.add(new THREE.Mesh(lathe([[0, -0.02], [R - 0.01, -0.02], [R - 0.009, 0.02], [0, 0.02]], 48), M.steel));
  piston.add(new THREE.Mesh(new THREE.TorusGeometry(R - 0.01, 0.004, 6, 48).rotateX(Math.PI / 2), M.rubber));
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 32), M.chrome);
  rod.position.y = 0.25;
  piston.add(rod);
  const eye = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.012, 12, 32), M.darkSteel);
  eye.position.y = 0.52;
  piston.add(eye);
  g.add(piston);
  // hoses to a pump/valve block
  const block = new THREE.Mesh(superellipsoid({ rx: 0.09, ry: 0.06, rz: 0.07, e: 0.25 }), M.darkSteel);
  block.position.set(0.2, 0.06, 0.02);
  g.add(block);
  const h1 = new THREE.Mesh(tubeAlong([new THREE.Vector3(R + 0.02, y0 + 0.02, 0), new THREE.Vector3(0.13, 0.08, 0.04), new THREE.Vector3(0.18, 0.12, 0.03)], 0.012, 32, 8), M.hose);
  const h2 = new THREE.Mesh(tubeAlong([new THREE.Vector3(R + 0.02, y0 + H - 0.02, 0), new THREE.Vector3(0.16, y0 + H - 0.1, 0.05), new THREE.Vector3(0.21, 0.22, 0.05), new THREE.Vector3(0.22, 0.12, 0.04)], 0.012, 48, 8), M.hose);
  g.add(h1, h2);
  shadowed(g);
  const api = {
    group: g, R, y0, H,
    set(ext, pressure = 1) { // ext 0..1
      const py = y0 + 0.06 + ext * (H - 0.14);
      piston.position.y = py;
      oil.scale.y = py - y0 - 0.02;
      oil.position.y = y0 + 0.01 + (py - y0 - 0.02) / 2;
      oilMat.emissiveIntensity = 0.04 + pressure * 0.22;
      return py + 0.52; // rod tip height
    },
  };
  api.set(0.3, 0.3);
  return api;
}

// ------------------------------------------------------------------ pneumatic
export function pneumaticCylinder() {
  const g = new THREE.Group();
  const W = 0.055, H = 0.4, y0 = 0.05;
  // translucent extruded profile body
  const bodyMat = new THREE.MeshPhysicalMaterial({ color: 0xb8c4cf, roughness: 0.15, metalness: 0.0, transparent: true, opacity: 0.24, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false });
  const body = new THREE.Mesh(superellipsoid({ rx: W, ry: H / 2, rz: W, e: 0.12, ew: 0.3, seg: 32, rings: 24 }), bodyMat);
  body.position.y = y0 + H / 2;
  body.renderOrder = 2;
  g.add(body);
  const frameMat = M.alu;
  for (const y of [y0, y0 + H]) {
    const cap = new THREE.Mesh(superellipsoid({ rx: W + 0.006, ry: 0.02, rz: W + 0.006, e: 0.3, ew: 0.3, seg: 24, rings: 8 }), frameMat);
    cap.position.y = y;
    g.add(cap);
  }
  for (let i = 0; i < 4; i++) { // tie rods
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, H, 8), M.steel);
    tr.position.set(Math.cos(a) * W * 1.25, y0 + H / 2, Math.sin(a) * W * 1.25);
    g.add(tr);
  }
  const piston = new THREE.Group();
  piston.add(new THREE.Mesh(new THREE.CylinderGeometry(W * 0.92, W * 0.92, 0.03, 32), M.alu));
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.45, 24), M.chrome);
  rod.position.y = 0.225;
  piston.add(rod);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.022, 16, 12), M.alu);
  tip.position.y = 0.46;
  piston.add(tip);
  g.add(piston);
  // fittings + air line
  const fit = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.03, 12), M.alu);
  fit.rotation.z = Math.PI / 2; fit.position.set(W + 0.012, y0 + 0.04, 0);
  g.add(fit);
  const line = new THREE.Mesh(tubeAlong([new THREE.Vector3(W + 0.025, y0 + 0.04, 0), new THREE.Vector3(0.12, 0.05, 0.02), new THREE.Vector3(0.16, 0.005, 0.06)], 0.008, 24, 6), new THREE.MeshStandardMaterial({ color: 0x2a7fd4, roughness: 0.4 }));
  g.add(line);
  // air molecules
  const N = 700, r = rng(21);
  const base = new Float32Array(N * 3), pos = new Float32Array(N * 3), seed = new Float32Array(N);
  for (let i = 0; i < N; i++) { base[i * 3] = (r() - 0.5) * 1.7 * W; base[i * 3 + 1] = r(); base[i * 3 + 2] = (r() - 0.5) * 1.7 * W; seed[i] = r(); }
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pm = new THREE.PointsMaterial({ color: new THREE.Color(0xd8f2ff).multiplyScalar(2.2), size: 0.006, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const air = new THREE.Points(pg, pm);
  air.frustumCulled = false;
  g.add(air);
  shadowed(g);
  const api = {
    group: g,
    set(ext, t = 0, agitation = 1) {
      const py = y0 + 0.05 + ext * (H - 0.12);
      piston.position.y = py;
      const h = py - y0 - 0.03;
      for (let i = 0; i < N; i++) {
        const s = seed[i] * 50;
        pos[i * 3] = base[i * 3] + Math.sin(t * 9 * agitation + s) * 0.006;
        pos[i * 3 + 1] = y0 + 0.01 + base[i * 3 + 1] * h + Math.sin(t * 11 * agitation + s * 1.3) * 0.004;
        pos[i * 3 + 2] = base[i * 3 + 2] + Math.cos(t * 10 * agitation + s * 0.7) * 0.006;
      }
      pg.attributes.position.needsUpdate = true;
      return py + 0.46;
    },
  };
  api.set(0.4);
  return api;
}

// ------------------------------------------------------------------ soft (McKibben)
export function softMuscle() {
  const g = new THREE.Group();
  const L0 = 0.42, r0 = 0.032, y0 = 0.06;
  const bladderMat = new THREE.MeshPhysicalMaterial({ color: 0xd9825a, roughness: 0.35, metalness: 0.0, transparent: true, opacity: 0.85, clearcoat: 0.6, sheen: 0.8, sheenColor: new THREE.Color(0xffc0a0) });
  const bladder = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 48, 40, true), bladderMat);
  const bBase = bladder.geometry.attributes.position.array.slice();
  g.add(bladder);
  const braidMat = new THREE.MeshStandardMaterial({ color: 0xe8e4dc, roughness: 0.55, metalness: 0.1 });
  const braid = new THREE.Mesh(new THREE.BufferGeometry(), braidMat);
  g.add(braid);
  const fittings = [0, 1].map(() => {
    const f = new THREE.Mesh(lathe([[0, -0.03], [r0 * 1.25, -0.03], [r0 * 1.35, -0.02], [r0 * 1.35, 0.02], [r0 * 1.2, 0.03], [0, 0.03]], 40), M.alu);
    g.add(f);
    return f;
  });
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.005, 8, 24), M.alu);
  g.add(hook);
  const weight = new THREE.Mesh(lathe([[0, 0], [0.045, 0], [0.05, 0.008], [0.05, 0.06], [0.045, 0.068], [0.01, 0.068], [0.01, 0.09], [0, 0.09]], 40), M.darkSteel);
  g.add(weight);
  const base = new THREE.Mesh(lathe([[0, 0], [0.06, 0], [0.065, 0.01], [0.065, 0.03], [0, 0.03]], 40), M.darkSteel);
  shadowed(g);
  bladder.castShadow = false;
  const api = {
    group: g,
    set(k) { // inflation 0..1 → contraction up to ~25%, bulge
      const L = L0 * (1 - 0.25 * k);
      const top = y0 + 0.62;
      const yb = top - L; // muscle hangs from the top fitting
      fittings[0].position.y = top + 0.03;
      fittings[1].position.y = yb - 0.03;
      const prof = (u) => r0 * (1 + k * 0.9 * Math.pow(Math.sin(Math.PI * u), 0.8));
      const arr = bladder.geometry.attributes.position.array;
      for (let i = 0; i < bBase.length; i += 3) {
        const u = bBase[i + 1] + 0.5; // 0..1 bottom→top
        const r = prof(u) * 0.94;
        const a = Math.atan2(bBase[i + 2], bBase[i]);
        arr[i] = Math.cos(a) * r; arr[i + 1] = yb + u * L; arr[i + 2] = Math.sin(a) * r;
      }
      bladder.geometry.attributes.position.needsUpdate = true;
      bladder.geometry.computeVertexNormals();
      // braid: two families of helical fibres; braid angle grows as it inflates
      const geos = [];
      const nThreads = 10, segs = 70, turns = 1.6 - 0.35 * k;
      for (const hand of [1, -1]) for (let j = 0; j < nThreads; j++) {
        const pts = [];
        for (let s = 0; s <= segs; s++) {
          const u = s / segs;
          const a = (j / nThreads) * Math.PI * 2 + hand * u * turns * Math.PI * 2;
          const r = prof(u) + 0.0035 + 0.0012 * Math.sin(u * 60 + j);
          pts.push(new THREE.Vector3(Math.cos(a) * r, yb + u * L, Math.sin(a) * r));
        }
        geos.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), segs, 0.0022, 4, false));
      }
      braid.geometry.dispose();
      braid.geometry = mergeGeometries(geos);
      hook.position.y = yb - 0.075;
      weight.position.y = yb - 0.18;
      return { top, bottom: yb, weightY: yb - 0.18 };
    },
  };
  api.set(0);
  return api;
}

// ------------------------------------------------------------------ encoder
export function codeDiskMaterial() {
  const N = 2048, cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, N, N);
  g.translate(N / 2, N / 2);
  const track = (r0, r1, count, duty, phase = 0) => {
    for (let i = 0; i < count; i++) {
      const a0 = ((i + phase) / count) * Math.PI * 2, a1 = a0 + (duty / count) * Math.PI * 2;
      g.beginPath(); g.arc(0, 0, r1, a0, a1); g.arc(0, 0, r0, a1, a0, true); g.closePath(); g.fill();
    }
  };
  g.fillStyle = 'rgba(200,215,230,0.9)';
  track(N * 0.44, N * 0.48, 360, 0.5);
  track(N * 0.39, N * 0.425, 180, 0.5, 0.25);
  for (let b = 0; b < 6; b++) track(N * (0.2 + b * 0.028), N * (0.22 + b * 0.028), 2 ** (b + 2), 0.5, 0);
  g.beginPath(); g.arc(0, 0, N * 0.495, 0, Math.PI * 2); g.lineWidth = 3; g.strokeStyle = 'rgba(220,230,240,0.8)'; g.stroke();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return new THREE.MeshStandardMaterial({ map: tex, transparent: true, metalness: 0.6, roughness: 0.25, side: THREE.DoubleSide, depthWrite: false, emissive: new THREE.Color(0x5fb8e0), emissiveMap: tex, emissiveIntensity: 0.9 });
}

export function encoderAssembly() {
  const g = new THREE.Group();
  const glass = new THREE.Mesh(disc(1.0, 128), new THREE.MeshPhysicalMaterial({ color: 0x9fb8c8, transparent: true, opacity: 0.12, roughness: 0.05, metalness: 0, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false }));
  const code = new THREE.Mesh(disc(1.0, 128), codeDiskMaterial());
  code.position.y = 0.002;
  const diskG = new THREE.Group();
  diskG.add(glass, code);
  const hub = new THREE.Mesh(lathe([[0.1, -0.05], [0.18, -0.05], [0.18, 0.05], [0.1, 0.05]], 48), M.alu);
  diskG.add(hub);
  g.add(diskG);
  // read head straddling the tracks
  const head = new THREE.Group();
  const yoke = new THREE.Mesh(superellipsoid({ rx: 0.16, ry: 0.2, rz: 0.12, e: 0.2, ew: 0.3 }), M.graphite);
  yoke.position.set(0.97, 0, 0);
  head.add(yoke);
  const ledMat = glow(0xff3b2f, 0);
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.025, 16, 12), ledMat);
  led.position.set(0.86, 0.14, 0);
  head.add(led);
  const beamMat = glow(0xff4a3d, 0, { additive: true, transparent: true });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.03, 0.28, 16, 1, true), beamMat);
  beam.position.set(0.86, 0, 0);
  head.add(beam);
  const sensMat = glow(0xff6a5a, 0);
  const sensor = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.012, 0.06), sensMat);
  sensor.position.set(0.86, -0.13, 0);
  head.add(sensor);
  g.add(head);
  // PCB below
  const pcb = new THREE.Mesh(new THREE.CylinderGeometry(1.08, 1.08, 0.03, 96), new THREE.MeshStandardMaterial({ color: 0x0d2a1c, roughness: 0.5, metalness: 0.2 }));
  pcb.position.y = -0.22;
  g.add(pcb);
  shadowed(g);
  return {
    group: g, disk: diskG,
    set(angle, t, active = 1) {
      diskG.rotation.y = angle;
      const slot = 0.5 + 0.5 * Math.sign(Math.sin((angle * 360) + 0.3));
      ledMat.color.set(0xff3b2f).multiplyScalar(3 * active);
      beamMat.color.set(0xff4a3d).multiplyScalar(0.8 * active * (0.35 + 0.65 * slot));
      sensMat.color.set(0xff6a5a).multiplyScalar(4 * active * slot);
    },
  };
}

// ------------------------------------------------------------------ electric rotary (exploded)
/** Rotary actuator built from the real mechanism assets (unit radius ~1.2, axis +Z). */
export function rotaryActuator({ detail = 1 } = {}) {
  const g = new THREE.Group();
  const parts = [];
  const add = (obj, z, explodeZ) => { obj.position.z = z; g.add(obj); parts.push({ obj, z, ez: explodeZ }); return obj; };
  const rear = new THREE.Mesh(lathe([[0, -0.06], [1.08, -0.06], [1.2, 0.0], [1.22, 0.12], [1.18, 0.16], [0.3, 0.16], [0, 0.1]], 96), M.graphite);
  rear.rotation.x = -Math.PI / 2;
  add(shadowed(rear), -0.95, -3.2);
  const enc = encoderAssembly();
  enc.group.scale.setScalar(0.85);
  enc.group.rotation.x = Math.PI / 2;
  add(enc.group, -0.7, -2.35);
  const motor = new Motor({ detail, housing: false });
  add(motor.group, -0.1, -1.1);
  const sleeve = new THREE.Mesh(lathe([[1.02, -0.55], [1.18, -0.55], [1.22, -0.5], [1.22, 0.5], [1.18, 0.55], [1.02, 0.55]], 128), M.graphite);
  sleeve.rotation.x = Math.PI / 2;
  add(shadowed(sleeve), -0.1, 0.2);
  const hd = new HarmonicDrive({ detail, cupLength: 0.35 });
  hd.group.scale.setScalar(0.95);
  add(hd.group, 0.75, 1.5);
  const flange = new THREE.Mesh(lathe([[0, 0], [0.92, 0], [1.0, 0.04], [1.0, 0.14], [0.6, 0.16], [0.6, 0.22], [0, 0.22]], 96), M.alu);
  flange.rotation.x = Math.PI / 2;
  add(shadowed(flange), 1.05, 2.55);
  const ringMat = glow(0x6fe3ff, 0);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.13, 0.012, 6, 128), ringMat);
  add(ring, 0.98, 2.2);
  return {
    group: g, parts, motor, hd, enc, ringMat,
    labels: [
      { name: 'ENCODER', part: 1 }, { name: 'STATOR + ROTOR', part: 2 }, { name: 'STRAIN-WAVE GEAR', part: 4 }, { name: 'OUTPUT FLANGE', part: 5 },
    ],
    set(explode, t, theta = 0) {
      for (const p of parts) p.obj.position.z = p.z + (p.ez - p.z) * explode * 0.62;
      motor.drive(t, { theta, amp: 0.6, fluxVisible: 0.4 * explode, currentVisible: explode });
      hd.update(theta * 0.5);
      enc.set(theta, t, explode);
    },
  };
}

// ------------------------------------------------------------------ electric linear (roller screw)
export function linearScrewActuator() {
  const g = new THREE.Group();
  const parts = [];
  const add = (obj, y, ey) => { obj.position.y = y; g.add(obj); parts.push({ obj, y, ey }); return obj; };
  // motor can
  const motorCan = new THREE.Group();
  motorCan.add(new THREE.Mesh(lathe([[0, 0], [0.055, 0], [0.06, 0.008], [0.06, 0.13], [0.055, 0.138], [0.02, 0.138], [0.02, 0.15], [0, 0.15]], 64), M.graphite));
  const mr = new THREE.Mesh(new THREE.TorusGeometry(0.061, 0.0025, 6, 64).rotateX(Math.PI / 2), glow(0x6fe3ff, 2.5));
  mr.position.y = 0.03;
  motorCan.add(mr);
  add(shadowed(motorCan), 0.0, -0.08);
  // threaded screw shaft (helical ridge)
  const screw = new THREE.Group();
  screw.add(new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.34, 32), M.thread));
  const helix = [];
  for (let i = 0; i <= 400; i++) { const u = i / 400; helix.push(new THREE.Vector3(Math.cos(u * 60 * Math.PI) * 0.017, -0.17 + u * 0.34, Math.sin(u * 60 * Math.PI) * 0.017)); }
  screw.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(helix), 800, 0.0028, 5), M.chrome));
  add(shadowed(screw), 0.33, 0.36);
  // nut with planetary rollers
  const nut = new THREE.Group();
  nut.add(new THREE.Mesh(lathe([[0.03, -0.04], [0.048, -0.04], [0.05, -0.035], [0.05, 0.035], [0.048, 0.04], [0.03, 0.04]], 48, 0, Math.PI * 1.4), cutMat(M.alu)));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.07, 12), M.thread);
    r.position.set(Math.cos(a) * 0.025, 0, Math.sin(a) * 0.025);
    nut.add(r);
  }
  add(shadowed(nut), 0.3, 0.5);
  // push tube + rod end
  const tube = new THREE.Mesh(lathe([[0.022, 0], [0.03, 0], [0.03, 0.26], [0.024, 0.27], [0.012, 0.27], [0.012, 0.3], [0, 0.3]], 48), M.chrome);
  add(shadowed(tube), 0.36, 0.72);
  // outer housing (cut away)
  const housing = new THREE.Mesh(lathe([[0.05, 0.15], [0.058, 0.15], [0.062, 0.16], [0.062, 0.5], [0.056, 0.51], [0.04, 0.51]], 64, Math.PI * 0.4, Math.PI * 1.4), cutMat(M.graphite));
  add(shadowed(housing), 0.0, 0.0);
  return {
    group: g, parts,
    set(explode, t) {
      for (const p of parts) p.obj.position.y = p.y + (p.ey - p.y) * explode;
      screw.rotation.y = t * 9;
      nut.children.slice(1).forEach((r, i) => { r.rotation.y = -t * 30; });
      nut.rotation.y = t * 9 * 0.35;
    },
  };
}
