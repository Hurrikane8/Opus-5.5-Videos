// Procedural "Optimus-class" humanoid (generic design — no real product's branding).
// ~1.75 m tall, y-up, facing +Z. 28 structural actuators, each with a status ring.
// Single-DoF joint chains (yaw→roll→pitch) so actuator housings move correctly,
// analytic two-bone leg IK, and articulated hands.
import * as THREE from 'three';
import { M, glow } from '../core/materials.js';
import { superellipsoid, lathe, actuatorModule, alignAxis, linearActuator } from '../core/geo.js';

export const DIM = { hipY: 0.975, hipX: 0.095, hipDrop: 0.06, thigh: 0.42, shin: 0.42, ankleH: 0.075, upper: 0.29, fore: 0.26, shoulderX: 0.215, shoulderY: 0.335 };

const node = (parent, name, pos = [0, 0, 0], order = 'XYZ') => {
  const o = new THREE.Object3D();
  o.name = name;
  o.position.set(...pos);
  o.rotation.order = order;
  parent.add(o);
  return o;
};
const mesh = (parent, geo, mat, pos = [0, 0, 0], rot = null) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...pos);
  if (rot) m.rotation.set(...rot);
  m.castShadow = true; m.receiveShadow = true;
  parent.add(m);
  return m;
};

export function neutralPose() {
  const arm = () => ({ flex: 0.08, abd: 0.1, rot: 0, elbow: 0.25, wflex: 0, wpro: 0, wdev: 0, grip: 0.25, thumb: 0.3 });
  const leg = () => ({ flex: 0, abd: 0, rot: 0, knee: 0, dorsi: 0, inv: 0 });
  return {
    root: { pos: [0, 0, 0], rot: [0, 0, 0] },
    waist: { yaw: 0, pitch: 0, roll: 0 },
    neck: { yaw: 0, pitch: 0, roll: 0 },
    l: { arm: arm(), leg: leg() },
    r: { arm: arm(), leg: leg() },
  };
}

export class Robot {
  constructor({ detail = 1, ringColor = 0x6fe3ff } = {}) {
    this.detail = detail;
    const S = detail >= 1 ? 1 : 0.5; // segment scale
    const sg = (n) => Math.max(8, Math.round(n * S));
    this.root = new THREE.Group();
    this.root.name = 'robot';
    this.actuators = [];
    this.j = {};
    const housing = M.graphite, cap = M.graphiteCap, hub = M.alu;

    const addAct = (parent, name, opts, pos, axis) => {
      const holder = node(parent, name + '_mount', pos);
      const mod = actuatorModule({ housing, cap, hub, ringColor, segs: sg(opts.segs || 40), ...opts });
      alignAxis(mod, axis);
      holder.add(mod);
      mod.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
      this.actuators.push({ name, obj: holder, ringMat: mod.userData.ringMat, kind: 'rotary', module: mod, r: opts.r });
      return mod;
    };
    const addLin = (parent, name, from, to, r = 0.016) => {
      const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
      const holder = node(parent, name + '_mount', from);
      const len = a.distanceTo(b);
      const la = linearActuator({ r, len, body: housing, rod: M.chrome, ringColor });
      // orient +Y from a to b
      la.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      holder.add(la);
      la.traverse((m) => { if (m.isMesh) { m.castShadow = true; } });
      const mid = node(holder, name + '_anchor', b.clone().sub(a).multiplyScalar(0.3).toArray());
      this.actuators.push({ name, obj: mid, ringMat: la.userData.ringMat, kind: 'linear', module: la, r });
      return la;
    };

    // ------------------------------------------------------------ pelvis + torso
    const pelvis = this.j.pelvis = node(this.root, 'pelvis', [0, DIM.hipY, 0], 'YXZ');
    mesh(pelvis, superellipsoid({ rx: 0.145, ry: 0.075, rz: 0.098, e: 0.55, ew: 0.75, seg: sg(40), rings: sg(24),
      shape: (x, y, z) => [x * (0.86 + 0.14 * (y * 0.5 + 0.5)), y, z] }), M.shellBlack, [0, -0.005, 0]);
    // hip side covers
    for (const s of [1, -1]) mesh(pelvis, superellipsoid({ rx: 0.026, ry: 0.06, rz: 0.07, e: 0.6, seg: sg(24), rings: sg(16) }), M.shellWhite, [s * 0.14, -0.025, 0]);

    const waist = this.j.waist = node(pelvis, 'waist', [0, 0.1, 0], 'YXZ');
    addAct(pelvis, 'waist_yaw', { r: 0.085, len: 0.045, bolts: 10, segs: 56 }, [0, 0.075, 0], 'y');
    // exposed spine: stacked rings
    for (let i = 0; i < 3; i++) mesh(waist, lathe([[0, -0.012], [0.082 - i * 0.004, -0.012], [0.09 - i * 0.004, 0], [0.082 - i * 0.004, 0.012], [0, 0.012]], sg(40)), M.structure, [0, 0.0 + i * 0.03, 0]);
    addAct(waist, 'waist_pitch', { r: 0.05, len: 0.235, bolts: 6, segs: 40 }, [0, 0.03, -0.005], 'x');

    const chest = this.j.chest = node(waist, 'chest', [0, 0.075, 0]);
    mesh(chest, superellipsoid({ rx: 0.168, ry: 0.19, rz: 0.11, e: 0.42, ew: 0.62, seg: sg(56), rings: sg(36),
      shape: (x, y, z) => {
        const k = y * 0.5 + 0.5;
        const w = 0.6 + 0.4 * Math.pow(k, 0.85);             // V-taper toward the waist
        const d = (z > 0 ? 1.0 : 0.9) * (0.84 + 0.16 * k);    // deeper chest, flatter back
        return [x * w, y, z * d];
      } }), M.shellWhite, [0, 0.215, 0.006]);
    // dark lower-chest band, collar yoke and back pack
    mesh(chest, superellipsoid({ rx: 0.118, ry: 0.035, rz: 0.098, e: 0.5, ew: 0.8, seg: sg(40), rings: sg(16) }), M.shellBlack, [0, 0.04, 0.004]);
    mesh(chest, superellipsoid({ rx: 0.1, ry: 0.13, rz: 0.05, e: 0.45, seg: sg(32), rings: sg(20) }), M.shellBlack, [0, 0.22, -0.085]);
    mesh(chest, superellipsoid({ rx: 0.075, ry: 0.025, rz: 0.06, e: 0.5, seg: sg(28), rings: sg(12) }), M.shellBlack, [0, 0.405, -0.005]);
    for (const s of [1, -1]) mesh(chest, superellipsoid({ rx: 0.055, ry: 0.03, rz: 0.07, e: 0.45, seg: sg(24), rings: sg(16) }), M.shellBlack, [s * 0.15, 0.375, -0.005]);
    // seam light along the chest (off by default)
    this.seamMat = glow(0x6fe3ff, 0);
    mesh(chest, new THREE.TorusGeometry(0.109, 0.0022, 4, sg(48), Math.PI * 0.7), this.seamMat, [0, 0.06, 0.004], [Math.PI / 2, 0, Math.PI * 0.15]).castShadow = false;

    // neck + head
    const neck = this.j.neck = node(chest, 'neck', [0, 0.41, 0.0], 'YXZ');
    mesh(neck, new THREE.CylinderGeometry(0.036, 0.042, 0.09, sg(24)), M.structure, [0, 0.03, 0]);
    const head = this.j.head = node(neck, 'head', [0, 0.065, 0]);
    mesh(head, superellipsoid({ rx: 0.098, ry: 0.122, rz: 0.11, e: 0.66, ew: 0.8, seg: sg(56), rings: sg(36),
      shape: (x, y, z) => [x * (1 - 0.12 * Math.max(0, -y)), y, z * (1 + 0.06 * y)] }), M.visor, [0, 0.115, 0.014]);
    mesh(head, superellipsoid({ rx: 0.104, ry: 0.128, rz: 0.092, e: 0.62, ew: 0.75, seg: sg(48), rings: sg(32),
      shape: (x, y, z) => [x * (1 - 0.1 * Math.max(0, -y)), y, z] }), M.shellWhite, [0, 0.12, -0.034]);
    for (const s of [1, -1]) mesh(head, new THREE.CylinderGeometry(0.028, 0.028, 0.012, sg(24)), M.alu, [s * 0.103, 0.11, -0.012], [0, 0, Math.PI / 2]);
    this.visorMat = glow(0x9fe9ff, 0);
    const arc = Math.PI * 0.42;
    const vg = new THREE.TorusGeometry(0.095, 0.0026, 6, sg(48), arc);
    vg.rotateZ(Math.PI / 2 - arc / 2);
    vg.rotateX(Math.PI / 2);
    const vis = mesh(head, vg, this.visorMat, [0, 0.128, 0.033]);
    vis.castShadow = false;

    // ------------------------------------------------------------ arms
    for (const side of ['l', 'r']) {
      const s = side === 'l' ? 1 : -1;
      const P = (nm) => side + nm;
      const sp = this.j[P('ShoulderPitch')] = node(chest, P('ShoulderPitch'), [s * DIM.shoulderX, DIM.shoulderY, 0]);
      addAct(chest, P('_shoulder_pitch'), { r: 0.058, len: 0.07, bolts: 8, segs: 48 }, [s * (DIM.shoulderX - 0.035), DIM.shoulderY, 0], 'x');
      const sr = this.j[P('ShoulderRoll')] = node(sp, P('ShoulderRoll'), [0, 0, 0]);
      addAct(sp, P('_shoulder_roll'), { r: 0.05, len: 0.075, bolts: 8, segs: 40 }, [s * 0.025, -0.045, 0], 'z');
      const sy = this.j[P('ShoulderYaw')] = node(sr, P('ShoulderYaw'), [0, 0, 0]);
      addAct(sr, P('_shoulder_yaw'), { r: 0.04, len: 0.05, bolts: 6, segs: 36 }, [0, -0.115, 0], 'y');
      mesh(sy, new THREE.CylinderGeometry(0.03, 0.034, 0.1, sg(20)), M.structure, [0, -0.15, 0]);
      mesh(sy, superellipsoid({ rx: 0.044, ry: 0.072, rz: 0.047, e: 0.6, seg: sg(32), rings: sg(20),
        shape: (x, y, z) => { const k = 1 - 0.12 * (y * 0.5 + 0.5); return [x * k, y, z * k]; } }), M.shellWhite, [0, -0.205, 0]);

      const el = this.j[P('Elbow')] = node(sy, P('Elbow'), [0, -DIM.upper, 0]);
      addAct(sy, P('_elbow'), { r: 0.048, len: 0.088, bolts: 8, segs: 56, hero: true }, [0, -DIM.upper, 0], 'x');
      // forearm
      addAct(el, P('_forearm_roll'), { r: 0.034, len: 0.045, bolts: 6, segs: 36 }, [0, -0.055, 0], 'y');
      mesh(el, superellipsoid({ rx: 0.037, ry: 0.088, rz: 0.03, e: 0.6, seg: sg(32), rings: sg(20),
        shape: (x, y, z) => { const k = 0.78 + 0.22 * (y * 0.5 + 0.5); return [x * k, y, z * k]; } }), M.shellWhite, [s * 0.006, -0.155, 0]);
      mesh(el, new THREE.CylinderGeometry(0.02, 0.026, 0.2, sg(16)), M.structure, [0, -0.15, 0]);
      addLin(el, P('_wrist_a'), [0, -0.075, 0.036], [0, -0.235, 0.03], 0.0125);
      addLin(el, P('_wrist_b'), [0, -0.075, -0.036], [0, -0.235, -0.03], 0.0125);

      const wr = this.j[P('Wrist')] = node(el, P('Wrist'), [0, -DIM.fore, 0], 'XZY');
      mesh(wr, new THREE.SphereGeometry(0.022, sg(16), sg(12)), M.alu);
      this._hand(wr, side, s, sg);
    }

    // ------------------------------------------------------------ legs
    for (const side of ['l', 'r']) {
      const s = side === 'l' ? 1 : -1;
      const P = (nm) => side + nm;
      const hipPos = [s * DIM.hipX, -DIM.hipDrop, 0];
      addAct(pelvis, P('_hip_yaw'), { r: 0.052, len: 0.05, bolts: 6, segs: 40 }, [hipPos[0], hipPos[1] + 0.05, 0], 'y');
      const hy = this.j[P('HipYaw')] = node(pelvis, P('HipYaw'), hipPos);
      addAct(hy, P('_hip_roll'), { r: 0.055, len: 0.1, bolts: 8, segs: 40 }, [0, -0.005, 0.0], 'z');
      const hr = this.j[P('HipRoll')] = node(hy, P('HipRoll'), [0, 0, 0]);
      addAct(hr, P('_hip_pitch'), { r: 0.072, len: 0.075, bolts: 10, segs: 56 }, [s * 0.062, -0.03, 0], 'x');
      const hp = this.j[P('HipPitch')] = node(hr, P('HipPitch'), [0, 0, 0]);
      mesh(hp, superellipsoid({ rx: 0.064, ry: 0.165, rz: 0.074, e: 0.62, seg: sg(40), rings: sg(28),
        shape: (x, y, z) => { const k = 0.78 + 0.22 * (y * 0.5 + 0.5); return [x * k, y, z * (0.85 + 0.15 * (y * 0.5 + 0.5))]; } }), M.shellWhite, [s * 0.006, -0.225, 0.008]);
      mesh(hp, new THREE.CylinderGeometry(0.03, 0.036, 0.36, sg(18)), M.structure, [0, -0.21, -0.02]);

      const kn = this.j[P('Knee')] = node(hp, P('Knee'), [0, -DIM.thigh, 0]);
      addAct(hp, P('_knee'), { r: 0.062, len: 0.11, bolts: 8, segs: 56, hero: true }, [0, -DIM.thigh, 0], 'x');
      // shin: white front plate, dark spine, two ankle linear actuators at the back
      mesh(kn, superellipsoid({ rx: 0.047, ry: 0.165, rz: 0.04, e: 0.62, seg: sg(36), rings: sg(24),
        shape: (x, y, z) => { const k = 0.72 + 0.28 * (y * 0.5 + 0.5); return [x * k, y, z * k]; } }), M.shellWhite, [0, -0.215, 0.022]);
      mesh(kn, new THREE.CylinderGeometry(0.022, 0.03, 0.36, sg(16)), M.structure, [0, -0.215, -0.012]);
      addLin(kn, P('_ankle_a'), [0.028, -0.085, -0.045], [0.026, -0.37, -0.04], 0.015);
      addLin(kn, P('_ankle_b'), [-0.028, -0.085, -0.045], [-0.026, -0.37, -0.04], 0.015);

      const an = this.j[P('Ankle')] = node(kn, P('Ankle'), [0, -DIM.shin, 0], 'XZY');
      mesh(an, new THREE.SphereGeometry(0.026, sg(16), sg(12)), M.alu);
      mesh(an, superellipsoid({ rx: 0.05, ry: 0.03, rz: 0.118, e: 0.4, ew: 0.55, seg: sg(32), rings: sg(16),
        shape: (x, y, z) => [x * (0.85 + 0.15 * (z * 0.5 + 0.5)), y - (z > 0.3 ? (z - 0.3) * 0.25 : 0), z] }), M.shellBlack, [0, -0.043, 0.048]);
      mesh(an, superellipsoid({ rx: 0.052, ry: 0.007, rz: 0.122, e: 0.3, seg: sg(32), rings: sg(8) }), M.rubber, [0, -0.0705, 0.048]);
      mesh(an, superellipsoid({ rx: 0.04, ry: 0.016, rz: 0.06, e: 0.5, seg: sg(24), rings: sg(12) }), M.shellWhite, [0, -0.02, 0.085]);
    }

    this.pose = neutralPose();
    this.setPose(this.pose);
  }

  _hand(wr, side, s, sg) {
    const hand = this.j[side + 'Hand'] = node(wr, side + 'Hand', [0, -0.012, 0]);
    // palm (black) + back plate (white). Palm normal faces -s*X (toward body at rest).
    mesh(hand, superellipsoid({ rx: 0.02, ry: 0.048, rz: 0.042, e: 0.45, seg: sg(24), rings: sg(16) }), M.structure, [0, -0.05, 0]);
    mesh(hand, superellipsoid({ rx: 0.008, ry: 0.044, rz: 0.04, e: 0.45, seg: sg(24), rings: sg(12) }), M.shellWhite, [s * 0.019, -0.05, 0]);
    this[side + 'Fingers'] = [];
    const fz = [0.03, 0.01, -0.01, -0.029];
    const fl = [[0.036, 0.026, 0.021], [0.04, 0.028, 0.022], [0.038, 0.026, 0.021], [0.031, 0.021, 0.018]];
    fz.forEach((z, i) => {
      let parent = node(hand, `${side}f${i}`, [0, -0.096, z], 'XYZ');
      const joints = [];
      fl[i].forEach((L, k) => {
        const jn = k === 0 ? parent : node(parent, `${side}f${i}_${k}`, [0, -fl[i][k - 1], 0]);
        mesh(jn, new THREE.CylinderGeometry(0.0072, 0.0072, 0.012, sg(12)), M.alu, [0, 0, 0], [0, 0, Math.PI / 2]);
        mesh(jn, superellipsoid({ rx: 0.0078, ry: L * 0.5, rz: 0.0085, e: 0.45, seg: sg(16), rings: sg(10) }), M.structure, [0, -L * 0.5, 0]);
        joints.push(jn);
        parent = jn;
      });
      this[side + 'Fingers'].push(joints);
    });
    // thumb: base on the palm side, front edge
    const tb = node(hand, `${side}thumb`, [-s * 0.012, -0.035, 0.038], 'YZX');
    tb.rotation.set(0, 0, 0);
    const tj = [];
    let par = tb;
    [0.03, 0.024, 0.02].forEach((L, k) => {
      const jn = k === 0 ? par : node(par, `${side}t_${k}`, [0, -[0.03, 0.024][k - 1], 0]);
      mesh(jn, new THREE.SphereGeometry(0.0085, sg(12), sg(8)), M.alu);
      mesh(jn, superellipsoid({ rx: 0.0085, ry: L * 0.5, rz: 0.009, e: 0.45, seg: sg(16), rings: sg(10) }), M.structure, [0, -L * 0.5, 0]);
      tj.push(jn);
      par = jn;
    });
    this[side + 'Thumb'] = tj;
  }

  /** Apply a pose (anatomical angles, radians). */
  setPose(p) {
    this.pose = p;
    const j = this.j;
    j.pelvis.position.set(p.root.pos[0], DIM.hipY + p.root.pos[1], p.root.pos[2]);
    j.pelvis.rotation.set(p.root.rot[0], p.root.rot[1], p.root.rot[2]);
    j.waist.rotation.set(p.waist.pitch, p.waist.yaw, p.waist.roll);
    j.neck.rotation.set(p.neck.pitch, p.neck.yaw, p.neck.roll);
    for (const side of ['l', 'r']) {
      const s = side === 'l' ? 1 : -1;
      const a = p[side].arm, g = p[side].leg;
      j[side + 'ShoulderPitch'].rotation.x = -a.flex;
      j[side + 'ShoulderRoll'].rotation.z = s * a.abd;
      j[side + 'ShoulderYaw'].rotation.y = s * a.rot;
      j[side + 'Elbow'].rotation.x = -a.elbow;
      j[side + 'Wrist'].rotation.set(-a.wflex, s * a.wpro, s * a.wdev);
      const fingers = this[side + 'Fingers'];
      fingers.forEach((f, i) => {
        const gi = a.grip * (1 + (i - 1.5) * 0.06);
        f[0].rotation.z = s * -gi * 1.25;
        f[1].rotation.z = s * -gi * 1.45;
        f[2].rotation.z = s * -gi * 1.05;
        f[0].rotation.x = (i - 1.5) * -0.05 * (1 - a.grip);
      });
      const th = this[side + 'Thumb'];
      th[0].rotation.set(0.55 - a.thumb * 0.4, s * (0.4 + a.thumb * 0.5), s * (-0.35 - a.thumb * 0.35));
      th[1].rotation.z = s * -a.thumb * 0.7;
      th[2].rotation.z = s * -a.thumb * 0.6;
      j[side + 'HipYaw'].rotation.y = s * g.rot;
      j[side + 'HipRoll'].rotation.z = s * g.abd;
      j[side + 'HipPitch'].rotation.x = -g.flex;
      j[side + 'Knee'].rotation.x = g.knee;
      j[side + 'Ankle'].rotation.set(-g.dorsi, 0, s * g.inv);
    }
    this.root.updateMatrixWorld(true);
  }

  /**
   * Two-bone IK: place the ankle joint at a world-space target with the foot flat
   * (plus optional foot pitch). Writes hip abd/flex, knee and ankle into pose[side].leg.
   */
  solveLeg(side, targetWorld, footPitch = 0) {
    const s = side === 'l' ? 1 : -1;
    const j = this.j;
    j.pelvis.updateMatrixWorld(true);
    const local = j.pelvis.worldToLocal(targetWorld.clone());
    const d = local.sub(new THREE.Vector3(s * DIM.hipX, -DIM.hipDrop, 0));
    const leg = this.pose[side].leg;
    d.applyAxisAngle(new THREE.Vector3(0, 1, 0), -s * leg.rot);
    const a = DIM.thigh, b = DIM.shin;
    const roll = Math.atan2(d.x, -d.y);
    const dyR = Math.sqrt(d.x * d.x + d.y * d.y);
    let L = Math.sqrt(dyR * dyR + d.z * d.z);
    L = Math.min(L, (a + b) * 0.9995);
    const beta = Math.atan2(-d.z, dyR);
    const gamma = Math.acos(Math.min(1, Math.max(-1, (a * a + L * L - b * b) / (2 * a * L))));
    const knee = Math.PI - Math.acos(Math.min(1, Math.max(-1, (a * a + b * b - L * L) / (2 * a * b))));
    const hx = beta - gamma;
    leg.abd = s * roll;
    leg.flex = -hx;
    leg.knee = knee;
    const pelvisPitch = this.pose.root.rot[0];
    const pelvisRoll = this.pose.root.rot[2];
    leg.dorsi = (hx + knee + pelvisPitch) + footPitch; // footPitch > 0 lifts the toes
    leg.inv = -(roll) * s - pelvisRoll * s;
  }

  /** Solve both legs for given world ankle targets and re-apply the pose. */
  plantFeet(lTarget, rTarget, lPitch = 0, rPitch = 0) {
    this.setPose(this.pose);
    this.solveLeg('l', lTarget, lPitch);
    this.solveLeg('r', rTarget, rPitch);
    this.setPose(this.pose);
  }

  setGlow(i, v, color) {
    const a = this.actuators[i];
    if (!a) return;
    if (color !== undefined) a.ringMat.color.set(color);
    else a.ringMat.color.set(0x6fe3ff);
    a.ringMat.color.multiplyScalar(v);
  }

  setAllGlow(v, color) { for (let i = 0; i < this.actuators.length; i++) this.setGlow(i, v, color); }

  anchorWorld(i, out = new THREE.Vector3()) {
    const o = this.actuators[i].obj;
    o.updateWorldMatrix(true, false);
    return out.setFromMatrixPosition(o.matrixWorld);
  }

  indexOf(name) { return this.actuators.findIndex((a) => a.name === name); }

  /** World position of the foot sole center for a given side (for grounding checks). */
  ankleWorld(side, out = new THREE.Vector3()) {
    const o = this.j[side + 'Ankle'];
    o.updateWorldMatrix(true, false);
    return out.setFromMatrixPosition(o.matrixWorld);
  }
}

/** Interpolate two poses (deep numeric lerp). */
export function lerpPose(a, b, t) {
  const L = (x, y) => (Array.isArray(x) ? x.map((v, i) => v + (y[i] - v) * t) : typeof x === 'object' ? Object.fromEntries(Object.keys(x).map((k) => [k, L(x[k], y[k])])) : x + (y - x) * t);
  return L(a, b);
}

/** Deep-merge partial pose overrides onto a base pose. */
export function withPose(base, over) {
  const out = JSON.parse(JSON.stringify(base));
  const merge = (o, v) => { for (const k of Object.keys(v)) { if (v[k] && typeof v[k] === 'object' && !Array.isArray(v[k])) merge(o[k], v[k]); else o[k] = v[k]; } };
  merge(out, over);
  return out;
}

/** Ankle height above ground when standing (for IK targets). */
export const ANKLE_H = DIM.ankleH;
