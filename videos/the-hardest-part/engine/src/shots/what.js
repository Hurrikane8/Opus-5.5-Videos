// 0:12–0:35  WHAT AN ACTUATOR IS — energy → controlled motion; the family; humanoids go electric.
import * as THREE from 'three';
import { M, glow } from '../core/materials.js';
import { makeStage, spot, lens, BokehDust, contactShadow, flowMaterial } from './common.js';
import { rotaryActuator, hydraulicCylinder, pneumaticCylinder, softMuscle, linearScrewActuator } from '../assets/actuators.js';
import { Robot, neutralPose, withPose, ANKLE_H } from '../assets/robot.js';
import { C, project } from '../core/overlay.js';
import { track, env, ease, smoothstep, clamp, rng, springStep, invLerp, prog } from '../core/timeline.js';

/** Reflective-ish dark floor with a faint measurement grid. */
function gridFloor(size = 30, opacity = 0.35) {
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uOpacity: { value: opacity }, uFade: { value: 6 } },
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float uOpacity, uFade; varying vec3 vW;
      float line(float x, float w){ float d = abs(fract(x - 0.5) - 0.5) / fwidth(x); return 1.0 - clamp(d / w, 0.0, 1.0); }
      void main(){ float g = max(line(vW.x * 4.0, 1.0), line(vW.z * 4.0, 1.0)) * 0.35 + max(line(vW.x, 1.2), line(vW.z, 1.2)) * 0.65;
        float f = exp(-dot(vW.xz, vW.xz) / (uFade * uFade));
        gl_FragColor = vec4(vec3(0.55, 0.75, 0.9) * g * f * uOpacity, 1.0); }`,
    blending: THREE.AdditiveBlending,
  });
  const p = new THREE.Mesh(new THREE.PlaneGeometry(size, size), m);
  p.rotation.x = -Math.PI / 2;
  p.position.y = 0.001;
  return p;
}

/** Particles streaming along a curve (energy / current). */
class Stream {
  constructor(points, { count = 700, radius = 0.03, color = 0x6fe3ff, size = 0.012, speed = 0.22, seed = 4, intensity = 2.2 } = {}) {
    this.curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
    const r = rng(seed);
    this.n = count;
    this.seed = new Float32Array(count).map(() => r());
    this.off = new Float32Array(count * 3).map(() => (r() - 0.5) * 2 * radius);
    this.pos = new Float32Array(count * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.mat = new THREE.PointsMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), size, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.speed = speed;
    this._v = new THREE.Vector3();
  }
  update(t, density = 1) {
    for (let i = 0; i < this.n; i++) {
      const u = (this.seed[i] + t * this.speed * (0.8 + 0.4 * this.seed[(i * 7) % this.n])) % 1;
      const vis = this.seed[(i * 13) % this.n] < density;
      this.curve.getPointAt(u, this._v);
      const k = Math.sin(u * Math.PI);
      this.pos[i * 3] = vis ? this._v.x + this.off[i * 3] * k : 1e5;
      this.pos[i * 3 + 1] = this._v.y + this.off[i * 3 + 1] * k;
      this.pos[i * 3 + 2] = this._v.z + this.off[i * 3 + 2] * k;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- 12.2–17.2  energy → controlled motion
export function buildDefine(ctx) {
  const { scene } = makeStage(ctx, { env: 'studio', envIntensity: 1.0, fog: [0x000000, 0.08] });
  scene.add(gridFloor(30, 0.25));
  const act = rotaryActuator();
  act.group.scale.setScalar(0.16);
  act.group.position.set(0, 0.36, 0);
  act.group.rotation.y = Math.PI / 2; // axis along +X
  scene.add(act.group);
  // output lever on the flange
  const lever = new THREE.Group();
  lever.position.set(0.215, 0.36, 0);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.36, 0.05), M.alu);
  bar.position.y = 0.15;
  bar.castShadow = true;
  lever.add(bar);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.032, 24, 16), M.chrome);
  tip.position.y = 0.32;
  lever.add(tip);
  scene.add(lever);
  scene.add(contactShadow(0.7, 0.5, 0.8));
  const cable = [new THREE.Vector3(-2.4, 0.02, 0.6), new THREE.Vector3(-1.2, 0.03, 0.4), new THREE.Vector3(-0.55, 0.12, 0.1), new THREE.Vector3(-0.25, 0.3, 0.0), new THREE.Vector3(-0.17, 0.36, 0.0)];
  const cableMesh = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cable), 120, 0.012, 8), M.hose);
  scene.add(cableMesh);
  const stream = new Stream(cable, { count: 1400, radius: 0.03, size: 0.02, speed: 0.35, intensity: 3.5 });
  scene.add(stream.points);
  const camera = lens(45, 0.02, 60);
  spot(scene, ctx, { pos: [0.9, 2.4, 1.4], target: [0, 0.38, 0], intensity: 40, angle: 0.4, penumbra: 0.8, far: 8 });
  spot(scene, ctx, { pos: [-1.6, 1.4, -1.8], target: [0, 0.4, 0], color: 0x9cc8ff, intensity: 30, angle: 0.6, penumbra: 1, shadow: false });
  spot(scene, ctx, { pos: [1.8, 0.9, -1.2], target: [0, 0.4, 0], color: 0xffd2a8, intensity: 18, angle: 0.6, penumbra: 1, shadow: false });
  const dust = new BokehDust({ count: 300, box: [4, 1.6, 3], center: [0, 0.8, 0], size: 1.6, seed: 9, intensity: 0.5 });
  scene.add(dust.points);
  let leverAng = 0, omega = 0;
  const angAt = (lt) => -1.25 * ease.inOutCubic(clamp((lt - 1.4) / 1.6)) + 0.9 * ease.inOutCubic(clamp((lt - 3.4) / 1.2));
  return {
    scene, camera,
    update(t, lt) {
      camera.position.set(0.95 - lt * 0.05, 0.78 - lt * 0.01, 1.55 - lt * 0.06);
      camera.lookAt(0.02, 0.42, 0);
      stream.update(t, smoothstep(0.0, 0.8, lt));
      leverAng = angAt(lt);
      omega = (angAt(lt + 0.02) - angAt(lt - 0.02)) / 0.04;
      lever.rotation.x = leverAng;
      act.set(0, t, leverAng * 50);
      act.ringMat.color.set(0x6fe3ff).multiplyScalar(1.5 + Math.min(4, Math.abs(omega) * 3));
      dust.update(t, 1.8, 12, ctx.H);
    },
    post: () => ({ dof: { focus: 1.8, aperture: 12, maxBlur: 16 }, bloom: { strength: 0.5, radius: 0.5, threshold: 1.4 }, vignette: 0.6, exposure: 1.05 }),
    overlay(o, t, lt) {
      // headline
      const h = env(lt, 0.5, 5.6, 0.5, 0.5);
      o.group(h, () => {
        o.textReveal('ENERGY', 760, 200, clamp((lt - 0.6) / 0.6), { size: 46, weight: 300, align: 'right', tracking: 0.2 });
        o.arrow(800, 186, 900, 186, { progress: ease.outCubic(clamp((lt - 1.4) / 0.5)), w: 2, color: C.cyan, head: 14 });
        o.textReveal('CONTROLLED MOTION', 940, 200, clamp((lt - 2.0) / 0.9), { size: 46, weight: 300, tracking: 0.2 });
      });
      // power labels
      const a1 = env(lt, 1.0, 5.6, 0.5, 0.4), a2 = env(lt, 2.4, 5.6, 0.5, 0.4);
      o.group(a1, () => {
        o.text('ELECTRICAL POWER', 300, 780, { family: 'mono', size: 18, tracking: 0.2, color: C.cyan });
        o.text('P = V · I', 300, 830, { family: 'math', italic: true, size: 44, color: C.white });
      });
      o.group(a2, () => {
        o.text('MECHANICAL POWER', 1450, 780, { family: 'mono', size: 18, tracking: 0.2, color: C.white });
        o.text('P = τ · ω', 1450, 830, { family: 'math', italic: true, size: 44, color: C.white });
        o.text(`ω  ${omega >= 0 ? '+' : '−'}${Math.abs(omega).toFixed(2)} rad/s`, 1450, 880, { family: 'mono', size: 18, color: C.dim });
      });
    },
  };
}

// ---------------------------------------------------------------- 17.2–27.6  the family
export function buildFamily(ctx) {
  const { scene } = makeStage(ctx, { env: 'studio', envIntensity: 0.9, fog: [0x000000, 0.07] });
  scene.add(gridFloor(40, 0.18));
  const X = [0, 1.25, 2.5];
  const hyd = hydraulicCylinder(); hyd.group.position.x = X[0]; hyd.group.scale.setScalar(1.25);
  const pne = pneumaticCylinder(); pne.group.position.x = X[1];
  const soft = softMuscle(); soft.group.position.x = X[2];
  scene.add(hyd.group, pne.group, soft.group);
  // heavy block on the hydraulic rod
  const block = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.24, 0.32), M.steel);
  block.castShadow = true;
  scene.add(block);
  // gantry for the soft muscle
  const gantry = new THREE.Group();
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.75, 0.03), M.structure);
  post.position.set(-0.16, 0.375, 0);
  const beam = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.03, 0.03), M.structure);
  beam.position.set(-0.06, 0.74, 0);
  gantry.add(post, beam);
  gantry.position.x = X[2];
  scene.add(gantry);
  for (const x of X) { const c = contactShadow(0.6, 0.6, 0.85); c.position.x = x; scene.add(c); }
  const keys = X.map((x) => spot(scene, ctx, { pos: [x + 0.7, 2.3, 1.3], target: [x, 0.5, 0], intensity: 0, angle: 0.42, penumbra: 0.85, far: 6 }));
  spot(scene, ctx, { pos: [1.2, 1.6, -2.2], target: [1.2, 0.5, 0], color: 0x9cc8ff, intensity: 40, angle: 0.9, penumbra: 1, shadow: false });
  spot(scene, ctx, { pos: [3.6, 1.2, 0.4], target: [1.2, 0.5, 0], color: 0xffd2a8, intensity: 14, angle: 0.9, penumbra: 1, shadow: false });
  const camera = lens(38, 0.02, 60);
  const focusX = (lt) => track([[0, X[0]], [2.9, X[0]], [3.7, X[1]], [6.1, X[1]], [6.9, X[2]], [10.4, X[2]]], lt, { e: ease.inOutCubic });
  const dust = new BokehDust({ count: 400, box: [5, 1.6, 3], center: [1.25, 0.8, 0.2], size: 1.4, seed: 2, intensity: 0.5 });
  scene.add(dust.points);
  let st = {};
  return {
    scene, camera,
    update(t, lt) {
      const fx = focusX(lt);
      const hy = 1 - clamp(Math.abs(fx - X[0]) / 1.25);
      camera.position.set(fx + 0.62 + 0.25 * hy, 0.72 + 0.3 * hy, 2.05 + 0.85 * hy);
      camera.lookAt(fx + 0.12, 0.56 + 0.32 * hy, 0);
      keys.forEach((k, i) => { k.intensity = 42 * Math.max(0.1, 1 - Math.abs(fx - X[i]) / 0.9); });
      // hydraulic: lifts a heavy block with authority
      const he = 0.05 + 0.5 * ease.inOutCubic(clamp((lt - 0.6) / 1.6));
      const tipY = hyd.set(he, he);
      block.position.set(X[0], (tipY + 0.1 + 0.02) * 1.25, 0);
      // pneumatic: step command → fast but springy (underdamped)
      const step = (lt - 3.9);
      const pe = 0.15 + 0.6 * springStep(step, 2.2, 0.12);
      st.pneuTip = pne.set(clamp(pe, 0, 1), t, 1 + 2 * Math.abs(pe - 0.75));
      st.pneuX = pe;
      // soft: inflate, contract, lift weakly with a wobble
      const k = 0.85 * ease.inOutSine(clamp((lt - 7.0) / 1.8)) + 0.03 * Math.sin(lt * 7) * smoothstep(7.5, 9, lt);
      st.soft = soft.set(clamp(k, 0, 1));
      st.hydTip = tipY * 1.25;
      dust.update(t, 2.1, 14, ctx.H);
      st.cam = camera;
      st.lt = lt;
    },
    post: (t, lt) => ({ dof: { focus: 2.12, aperture: 14, maxBlur: 16 }, bloom: { strength: 0.45, radius: 0.5, threshold: 1.6 }, vignette: 0.6 }),
    overlay(o, t, lt) {
      const card = (name, plus, minus, a0, a1, x = 1240) => {
        const a = env(lt, a0, a1, 0.35, 0.35);
        o.group(a, () => {
          o.textReveal(name, x, 300, clamp((lt - a0) / 0.6), { size: 54, weight: 300, tracking: 0.22 });
          o.line(x, 330, x + 120 * ease.outCubic(clamp((lt - a0 - 0.2) / 0.5)), 330, { w: 1.5, color: C.cyan });
          o.textReveal(plus, x, 382, clamp((lt - a0 - 0.5) / 0.6), { family: 'mono', size: 20, tracking: 0.16, color: C.green });
          o.textReveal(minus, x, 418, clamp((lt - a0 - 0.9) / 0.7), { family: 'mono', size: 20, tracking: 0.16, color: C.red });
        });
        return a;
      };
      // HYDRAULIC
      const ha = card('HYDRAULIC', '+  FORCE', '−  HEAVY · PUMPS · LEAKS', 0.15, 3.3);
      if (ha > 0 && st.cam) {
        const p0 = project(new THREE.Vector3(X[0], st.hydTip + 0.24, 0), st.cam);
        o.group(ha, () => {
          o.arrow(p0.x, p0.y, p0.x, p0.y - 150, { progress: ease.outCubic(clamp((lt - 1.0) / 0.8)), w: 4, color: C.white, head: 22, glow: 6 });
          o.text('F = p · A', p0.x + 22, p0.y - 110, { family: 'math', italic: true, size: 34, alpha: clamp((lt - 1.5) / 0.5) });
          o.text('p ≈ 200 bar', p0.x + 22, p0.y - 76, { family: 'mono', size: 16, color: C.dim, alpha: clamp((lt - 1.7) / 0.5) });
        });
      }
      // PNEUMATIC with a live position trace
      const pa = card('PNEUMATIC', '+  FAST', '−  SPRINGY · HARD TO CONTROL', 3.35, 6.5);
      if (pa > 0) o.group(pa, () => {
        const R = { x: 1240, y: 480, w: 380, h: 150 };
        o.axes(R, { progress: clamp((lt - 3.6) / 0.5), xlabel: 't', ylabel: 'x' });
        const dom = { x0: 0, x1: 2.4, y0: 0, y1: 1.2 };
        const tgt = o.map(R, dom, 0, 0.75)[1];
        o.line(R.x, tgt, R.x + R.w, tgt, { w: 1, color: C.dim, dash: [6, 6], alpha: clamp((lt - 3.8) / 0.4) });
        const now = clamp(lt - 3.9, 0, 2.4);
        if (now > 0) o.plot((x) => 0.15 + 0.6 * springStep(x, 2.2, 0.12), R, dom, { progress: now / 2.4, w: 2.5, color: C.amber, samples: 160 });
        o.text('target', R.x + R.w + 8, tgt + 5, { family: 'mono', size: 14, color: C.dim, alpha: clamp((lt - 3.8) / 0.4) });
      });
      // SOFT
      const sa = card('SOFT', '+  SAFE · COMPLIANT', '−  WEAK', 6.55, 10.6);
      if (sa > 0 && st.soft) o.group(sa, () => {
        const pT = project(new THREE.Vector3(X[2] + 0.07, st.soft.top - 0.02, 0), st.cam);
        const pB = project(new THREE.Vector3(X[2] + 0.07, st.soft.bottom, 0), st.cam);
        const k = clamp((lt - 7.4) / 0.6);
        o.line(pT.x + 30, pT.y, pT.x + 30, pB.y, { w: 1.2, color: C.white, progress: k });
        o.line(pT.x + 22, pT.y, pT.x + 38, pT.y, { w: 1.2, color: C.white, alpha: k });
        o.line(pB.x + 22, pB.y, pB.x + 38, pB.y, { w: 1.2, color: C.white, alpha: k });
        o.text('contracts ≈ 25%', pT.x + 48, (pT.y + pB.y) / 2, { family: 'mono', size: 16, color: C.dim, alpha: k, baseline: 'middle' });
      });
    },
  };
}

// ---------------------------------------------------------------- 27.6–30.2  electric: rotary + linear
export function buildElectric(ctx) {
  const { scene } = makeStage(ctx, { env: 'studio', envIntensity: 1.2, fog: [0x000000, 0.06] });
  const act = rotaryActuator();
  act.group.scale.setScalar(0.13);
  act.group.position.set(-0.05, 0.42, 0);
  act.group.rotation.set(0, -0.9, 0);
  scene.add(act.group);
  const lin = linearScrewActuator();
  lin.group.position.set(0.62, 0.05, -0.15);
  lin.group.scale.setScalar(1.25);
  scene.add(lin.group);
  scene.add(gridFloor(30, 0.15));
  const camera = lens(40, 0.02, 60);
  spot(scene, ctx, { pos: [-0.3, 2.4, 2.0], target: [0.1, 0.4, 0], intensity: 60, angle: 0.5, penumbra: 0.8, far: 8 });
  spot(scene, ctx, { pos: [1.8, 1.2, -1.6], target: [0.2, 0.45, 0], color: 0xffd2a8, intensity: 40, angle: 0.7, penumbra: 1, shadow: false });
  spot(scene, ctx, { pos: [-1.8, 1.0, -1.2], target: [0, 0.4, 0], color: 0x9cc8ff, intensity: 36, angle: 0.7, penumbra: 1, shadow: false });
  let st = {};
  return {
    scene, camera,
    update(t, lt) {
      camera.position.set(0.3 - lt * 0.04, 0.66, 1.45 - lt * 0.05);
      camera.lookAt(0.2, 0.42, 0);
      const ex = ease.inOutCubic(clamp((lt - 0.1) / 1.3));
      act.set(ex, t, t * 2.2);
      act.ringMat.color.set(0x6fe3ff).multiplyScalar(3);
      lin.set(ease.inOutCubic(clamp((lt - 0.35) / 1.3)), t);
      st = { cam: camera, act };
    },
    post: () => ({ dof: { focus: 1.5, aperture: 9, maxBlur: 14 }, bloom: { strength: 0.5, radius: 0.5, threshold: 1.4 }, vignette: 0.6 }),
    overlay(o, t, lt) {
      const a = env(lt, 0.0, 2.75, 0.3, 0.3);
      o.group(a, () => {
        o.textReveal('ELECTRIC', 120, 210, clamp(lt / 0.5), { size: 54, weight: 300, tracking: 0.22 });
        o.textReveal('ROTARY  +  LINEAR', 120, 252, clamp((lt - 0.2) / 0.5), { family: 'mono', size: 18, tracking: 0.24, color: C.dim });
        o.textReveal('+  PRECISE · EFFICIENT · CLEAN', 120, 300, clamp((lt - 0.5) / 0.6), { family: 'mono', size: 20, tracking: 0.16, color: C.green });
      });
      if (st.act) {
        const names = ['ENCODER', 'MOTOR', 'STRAIN-WAVE GEAR', 'OUTPUT'];
        const idx = [1, 2, 4, 5];
        idx.forEach((pi, i) => {
          const p = new THREE.Vector3();
          st.act.parts[pi].obj.getWorldPosition(p);
          p.y += 0.13 * 1.05;
          const s = project(p, st.cam);
          const k = clamp((lt - 0.9 - i * 0.18) / 0.6);
          o.group(a, () => o.callout(s.x, s.y, { dx: 40, dy: -70 - (i % 2) * 40, shelf: 150, progress: k, color: C.white, ring: 5, lines: [{ text: names[i], size: 15 }] }));
        });
      }
    },
  };
}

// ---------------------------------------------------------------- 30.2–35.0  twenty-eight
export function buildTwentyEight(ctx) {
  const { scene } = makeStage(ctx, { env: 'studio', envIntensity: 0.45, fog: [0x000000, 0.06] });
  const robot = new Robot();
  scene.add(robot.root, contactShadow(1.2, 1.0, 0.85));
  const pose = withPose(neutralPose(), { root: { pos: [0, -0.012, 0] }, l: { arm: { abd: 0.2, elbow: 0.2 } }, r: { arm: { abd: 0.2, elbow: 0.2 } } });
  robot.setPose(pose);
  robot.plantFeet(new THREE.Vector3(0.12, ANKLE_H, 0), new THREE.Vector3(-0.12, ANKLE_H, 0));
  const camera = lens(40, 0.02, 60);
  spot(scene, ctx, { pos: [0.4, 3.4, 3.2], target: [0, 1.0, 0], intensity: 34, angle: 0.5, penumbra: 0.9, far: 10 });
  spot(scene, ctx, { pos: [2.4, 2.4, -2.6], target: [0, 1.1, 0], color: 0x9cc8ff, intensity: 28, angle: 0.6, penumbra: 1, shadow: false });
  spot(scene, ctx, { pos: [-2.6, 2.0, -2.2], target: [0, 1.1, 0], color: 0xffd2a8, intensity: 18, angle: 0.6, penumbra: 1, shadow: false });
  // order rings top→bottom for the count-up
  const order = robot.actuators.map((a, i) => ({ i, y: robot.anchorWorld(i).y, x: robot.anchorWorld(i).x })).sort((a, b) => b.y - a.y || a.x - b.x).map((o) => o.i);
  const rank = new Map(order.map((i, k) => [i, k]));
  const target = robot.anchorWorld(robot.indexOf('l_shoulder_pitch'));
  const dust = new BokehDust({ count: 300, box: [4, 2.6, 3], center: [0, 1.2, 0.5], size: 2, seed: 8, intensity: 0.5 });
  scene.add(dust.points);
  let st = {};
  return {
    scene, camera,
    update(t, lt) {
      const push = ease.inExpo(clamp((lt - 3.0) / 1.8));
      const p0 = new THREE.Vector3(0.0, 1.0, 4.15), p1 = target.clone().add(new THREE.Vector3(0.12, 0.0, 0.18));
      camera.position.lerpVectors(p0, p1, push);
      const l0 = new THREE.Vector3(0, 0.93, 0);
      camera.lookAt(l0.lerp(target, Math.min(1, push * 1.4)));
      for (let i = 0; i < robot.actuators.length; i++) {
        const k = rank.get(i);
        const on = 0.15 + k * 0.045;
        const v = lt > on ? 2.4 + 5 * Math.exp(-(lt - on) * 6) : 0.25;
        robot.setGlow(i, v);
      }
      dust.update(t, camera.position.distanceTo(l0), 18, ctx.H);
      st = { cam: camera, push };
    },
    post: (t, lt) => ({ dof: { focus: 3.5 - 3.2 * ease.inExpo(clamp((lt - 3.0) / 1.8)), aperture: 16, maxBlur: 18 }, bloom: { strength: 0.5, radius: 0.55, threshold: 1.5 },
      exposure: 1 + 2.5 * ease.inExpo(clamp((lt - 4.2) / 0.6)), vignette: 0.65 }),
    overlay(o, t, lt) {
      if (!st.cam) return;
      const fade = 1 - smoothstep(2.9, 3.4, lt);
      o.group(fade, () => {
        let count = 0;
        for (let i = 0; i < robot.actuators.length; i++) {
          const k = rank.get(i);
          const on = 0.15 + k * 0.045;
          if (lt < on) continue;
          count++;
          const s = project(robot.anchorWorld(i), st.cam);
          const right = s.x >= 960;
          const a = clamp((lt - on) / 0.2);
          o.line(s.x + (right ? 10 : -10), s.y, s.x + (right ? 34 : -34), s.y, { w: 1, color: C.cyan, alpha: a * 0.8 });
          o.text(String(k + 1).padStart(2, '0'), s.x + (right ? 38 : -38), s.y + 6, { family: 'mono', size: 16, color: C.white, align: right ? 'left' : 'right', alpha: a });
        }
        const n = Math.min(28, count);
        o.text(String(n), 1500, 520, { size: 150, weight: 200, align: 'left', color: C.white });
        o.text('STRUCTURAL ACTUATORS', 1506, 568, { family: 'mono', size: 18, tracking: 0.24, color: C.cyan, alpha: clamp((lt - 0.3) / 0.4) });
        o.text('OPTIMUS-CLASS HUMANOID · EXCLUDING HANDS', 1506, 600, { family: 'mono', size: 13, tracking: 0.2, color: C.dim, alpha: clamp((lt - 0.6) / 0.4) });
      });
    },
  };
}
