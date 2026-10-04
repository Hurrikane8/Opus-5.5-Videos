// Brushless (BLDC / PMSM) motor, 12 slots / 14 poles, axis +Z, stator outer radius 1.
// - laminated stator with 12 wound teeth, 3-phase concentrated windings
// - rotor with 14 alternating surface magnets (N/S)
// - per-coil current flow (dashes along the winding) and switching flux loops
//   between adjacent teeth — the stator field rotates electronically, the rotor follows.
import * as THREE from 'three';
import { M, glow, heatColor } from '../core/materials.js';
import { flowMaterial } from '../shots/common.js';
import { lathe, roundedRectPath, mergeGeometries } from '../core/geo.js';

export const MOTOR = { slots: 12, poles: 14, Rso: 1.0, Rbi: 0.82, Rti: 0.535, Rro: 0.5, Rmi: 0.435, L: 0.62, toothW: 0.13 };

// Concentrated-winding pattern for 12s/14p: A a b B C c a A B b c C (lowercase = reversed)
const PATTERN = [['A', 1], ['A', -1], ['B', -1], ['B', 1], ['C', 1], ['C', -1], ['A', -1], ['A', 1], ['B', 1], ['B', -1], ['C', -1], ['C', 1]];
const PHASE = { A: 0, B: (2 * Math.PI) / 3, C: (4 * Math.PI) / 3 };

function statorShape() {
  const { slots, Rso, Rbi, Rti, toothW } = MOTOR;
  const s = new THREE.Shape();
  s.absarc(0, 0, Rso, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  const pts = [];
  const pitch = (Math.PI * 2) / slots;
  for (let k = 0; k < slots; k++) {
    const c = k * pitch;
    const half = Math.asin(toothW / 2 / Rbi);
    const shoe = pitch * 0.4;
    // back-iron arc between teeth (from previous tooth's edge to this tooth's edge)
    const a0 = c - pitch + half, a1 = c - half;
    for (let i = 0; i <= 8; i++) { const a = a0 + (a1 - a0) * (i / 8); pts.push([Math.cos(a) * Rbi, Math.sin(a) * Rbi]); }
    // tooth flank down to the shoe
    const flank = (sgn, r) => { const off = sgn * toothW / 2; const dir = [Math.cos(c), Math.sin(c)], nrm = [-Math.sin(c), Math.cos(c)]; return [dir[0] * r + nrm[0] * off, dir[1] * r + nrm[1] * off]; };
    pts.push(flank(-1, Rbi - 0.01));
    pts.push(flank(-1, Rti + 0.06));
    // shoe
    const sa0 = c - shoe, sa1 = c + shoe;
    pts.push([Math.cos(sa0) * (Rti + 0.035), Math.sin(sa0) * (Rti + 0.035)]);
    for (let i = 0; i <= 10; i++) { const a = sa0 + (sa1 - sa0) * (i / 10); pts.push([Math.cos(a) * Rti, Math.sin(a) * Rti]); }
    pts.push([Math.cos(sa1) * (Rti + 0.035), Math.sin(sa1) * (Rti + 0.035)]);
    pts.push(flank(1, Rti + 0.06));
    pts.push(flank(1, Rbi - 0.01));
  }
  hole.setFromPoints(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  s.holes.push(hole);
  return s;
}

export class Motor {
  constructor({ detail = 1, housing = true } = {}) {
    const { slots, poles, Rso, Rro, Rmi, L } = MOTOR;
    this.group = new THREE.Group();
    this.rotor = new THREE.Group();
    this.group.add(this.rotor);

    // stator (laminated steel)
    const sg = new THREE.ExtrudeGeometry(statorShape(), { depth: L, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.006, bevelSegments: 1, curveSegments: 96 });
    sg.translate(0, 0, -L / 2);
    this.stator = new THREE.Mesh(sg, M.lamination);
    this.stator.castShadow = this.stator.receiveShadow = true;
    this.group.add(this.stator);

    // windings: 4 radial layers of turns around each tooth
    this.coils = [];
    this.coilMats = [];
    const pitch = (Math.PI * 2) / slots;
    for (let k = 0; k < slots; k++) {
      const c = k * pitch;
      const holder = new THREE.Group();
      holder.rotation.z = c;
      const mat = M.copper.clone();
      mat.emissive = new THREE.Color(0x000000);
      const geos = [];
      for (let layer = 0; layer < 4; layer++) {
        const r = 0.6 + layer * 0.048;
        const w = MOTOR.toothW + 0.05 + layer * 0.018, h = L + 0.05 + layer * 0.03;
        const path = roundedRectPath(w, h, 0.035 + layer * 0.01, 6);
        // path lies in the plane perpendicular to the tooth (tangential × axial) at radius r
        const pts3 = path.map((p) => new THREE.Vector3(r, p.x, p.y));
        const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts3, true, 'centripetal'), 48, 0.024, 8, true);
        geos.push(g);
      }
      const coil = new THREE.Mesh(mergeGeometries(geos), mat);
      coil.castShadow = true;
      holder.add(coil);
      // current flow overlay (slightly larger, outermost layer path)
      const flowPath = roundedRectPath(MOTOR.toothW + 0.11, L + 0.14, 0.07, 8).map((p) => new THREE.Vector3(0.76, p.x, p.y));
      const fm = flowMaterial({ color: 0x6fe3ff, intensity: 0, dashes: 6, speed: 1.5, duty: 0.4, base: 0.05 });
      const flow = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(flowPath, true, 'centripetal'), 96, 0.012, 6, true), fm);
      flow.renderOrder = 5;
      holder.add(flow);
      this.group.add(holder);
      this.coils.push({ holder, coil, mat, flow, fm, phase: PATTERN[k][0], pol: PATTERN[k][1], angle: c });
    }

    // flux loops between adjacent teeth (stator frame)
    this.loops = [];
    for (let k = 0; k < slots; k++) {
      const a0 = k * pitch, a1 = (k + 1) * pitch;
      for (let depth = 0; depth < 3; depth++) {
        const rIn = 0.43 - depth * 0.045, rOut = 0.86 + depth * 0.04, spread = 0.18 + depth * 0.1;
        const P = (a, r) => new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0);
        const am = (a0 + a1) / 2;
        const pts = [
          P(a0, 0.7), P(a0 + 0.02, 0.56), P(a0 + 0.05, rIn + 0.04), P(am - spread * 0.3, rIn), P(am + spread * 0.3, rIn),
          P(a1 - 0.05, rIn + 0.04), P(a1 - 0.02, 0.56), P(a1, 0.7), P(a1 - 0.03, rOut), P(am, rOut + 0.02), P(a0 + 0.03, rOut),
        ];
        const zoff = (depth - 1) * 0.12;
        pts.forEach((p) => { p.z = L / 2 + 0.03 + Math.abs(zoff) * 0.2; });
        const fm = flowMaterial({ color: 0x8fd8ff, intensity: 0, dashes: 5, speed: 0.8, duty: 0.5, base: 0.12 });
        const mesh = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.5), 80, 0.006 + 0.002 * (2 - depth), 5, true), fm);
        mesh.renderOrder = 6;
        this.group.add(mesh);
        this.loops.push({ k, depth, fm, mesh });
      }
    }

    // rotor: back iron, magnets, shaft
    const backIron = new THREE.Mesh(lathe([[0.13, -L / 2], [Rmi, -L / 2], [Rmi, L / 2], [0.13, L / 2]], 96), M.darkSteel);
    backIron.rotation.x = Math.PI / 2;
    this.rotor.add(backIron);
    this.magnets = [];
    const mp = (Math.PI * 2) / poles;
    for (let i = 0; i < poles; i++) {
      const sh = new THREE.Shape();
      const a0 = i * mp - mp * 0.43, a1 = i * mp + mp * 0.43;
      sh.absarc(0, 0, Rro, a0, a1, false);
      sh.absarc(0, 0, Rmi, a1, a0, true);
      const g = new THREE.ExtrudeGeometry(sh, { depth: L * 0.98, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.005, bevelSegments: 1, curveSegments: 16 });
      g.translate(0, 0, -L * 0.49);
      const m = new THREE.Mesh(g, i % 2 === 0 ? M.magnetN : M.magnetS);
      m.castShadow = true;
      this.rotor.add(m);
      this.magnets.push(m);
    }
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, L * 2.2, 48), M.alu);
    shaft.rotation.x = Math.PI / 2;
    this.rotor.add(shaft);

    if (housing) {
      // outer housing sleeve + rear end bell
      const H = new THREE.Mesh(lathe([[1.02, -L * 0.62], [1.12, -L * 0.62], [1.14, -L * 0.58], [1.14, L * 0.58], [1.12, L * 0.62], [1.02, L * 0.62]], 128), M.graphite);
      H.rotation.x = Math.PI / 2;
      H.receiveShadow = true;
      this.housing = H;
      this.group.add(H);
      const bell = new THREE.Mesh(lathe([[0.15, -L * 0.62 - 0.08], [1.0, -L * 0.62 - 0.08], [1.08, -L * 0.62 - 0.02], [1.08, -L * 0.6]], 96), M.graphite);
      bell.rotation.x = Math.PI / 2;
      this.group.add(bell);
    }
    this.rotorAngle = 0;
    this.state = { currents: new Array(slots).fill(0) };
  }

  /**
   * Drive the motor. theta = mechanical rotor angle; amp = current amplitude (0..1);
   * torqueAngle = electrical lead of the stator field (π/2 = max torque per amp).
   */
  drive(t, { theta = 0, amp = 1, flowSpeed = 1, fluxVisible = 1, heat = 0, currentVisible = 1, torqueAngle = Math.PI / 2 } = {}) {
    const { poles } = MOTOR;
    this.rotor.rotation.z = theta;
    const thE = (poles / 2) * theta + torqueAngle;
    for (let k = 0; k < this.coils.length; k++) {
      const c = this.coils[k];
      const i = c.pol * amp * Math.sin(thE - PHASE[c.phase]);
      this.state.currents[k] = i;
      c.fm.uniforms.uIntensity.value = Math.abs(i) * 3.2 * currentVisible;
      c.fm.uniforms.uSpeed.value = Math.sign(i) * 1.6 * flowSpeed;
      c.fm.uniforms.uTime.value = t;
      // copper heating: I²R
      heatColor(0.2 + 0.55 * heat * (0.85 + 0.3 * i * i), c.mat.emissive).multiplyScalar(1.1 * heat);
    }
    const n = this.coils.length;
    for (const L of this.loops) {
      const a = this.state.currents[L.k], b = this.state.currents[(L.k + 1) % n];
      const s = (a - b) / 2;
      L.fm.uniforms.uIntensity.value = Math.max(0, Math.abs(s) - 0.15 * L.depth) * 1.5 * fluxVisible;
      L.fm.uniforms.uSpeed.value = Math.sign(s) * 0.7;
      L.fm.uniforms.uTime.value = t;
    }
  }
}
