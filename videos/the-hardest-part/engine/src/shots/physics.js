// 0:35–1:05  HOW IT WORKS — inside the motor, torque ∝ current, strain-wave gearing,
// encoder feedback, muscle vs motor under the same load, and I²R heating.
import * as THREE from 'three';
import { M, glow } from '../core/materials.js';
import { makeStage, spot, lens, BokehDust, flowMaterial } from './common.js';
import { Motor, MOTOR } from '../assets/motor.js';
import { HarmonicDrive, HD } from '../assets/harmonic.js';
import { encoderAssembly } from '../assets/actuators.js';
import { Fascicle } from '../assets/muscle.js';
import { lathe } from '../core/geo.js';
import { C, project } from '../core/overlay.js';
import { track, env, ease, smoothstep, clamp, rng, springStep, TAU } from '../core/timeline.js';

const PHASE_COL = { A: 0x6fe3ff, B: 0xffc15a, C: 0xb79cff };
const PHASE_CSS = { A: C.cyan, B: C.amber, C: C.violet };

function scope(o, x, y, w, h, thE, alpha, amp = 1) {
  o.group(alpha, () => {
    o.rect(x, y, w, h, { w: 1, color: 'rgba(255,255,255,0.18)', fill: 'rgba(0,0,0,0.35)', fillAlpha: 1 });
    o.text('PHASE CURRENTS', x + 14, y - 12, { family: 'mono', size: 14, tracking: 0.2, color: C.dim });
    const mid = y + h / 2;
    o.line(x, mid, x + w, mid, { w: 1, color: 'rgba(255,255,255,0.12)' });
    const span = TAU * 1.5;
    [['A', 0], ['B', TAU / 3], ['C', (2 * TAU) / 3]].forEach(([ph, off], j) => {
      const pts = [];
      for (let i = 0; i <= 90; i++) {
        const u = i / 90;
        const e = thE - span + u * span;
        pts.push([x + u * w, mid - Math.sin(e - off) * (h * 0.38) * amp]);
      }
      o.polyline(pts, { w: 2, color: PHASE_CSS[ph] });
      o.text(ph, x + w + 10, mid - Math.sin(thE - off) * h * 0.38 * amp + 5, { family: 'mono', size: 14, color: PHASE_CSS[ph] });
    });
    o.line(x + w, y, x + w, y + h, { w: 1.5, color: C.white, alpha: 0.6 });
  });
}

// ---------------------------------------------------------------- 35.0–46.2  inside the motor
export function buildMotor(ctx) {
  const { scene } = makeStage(ctx, { env: 'studio', envIntensity: 0.9, floor: false, fog: [0x000000, 0.04] });
  const motor = new Motor();
  scene.add(motor.group);
  for (const c of motor.coils) c.fm.uniforms.uColor.value.set(PHASE_COL[c.phase]);
  const cover = new THREE.Mesh(lathe([[0, 0], [1.08, 0], [1.15, 0.03], [1.15, 0.1], [0.3, 0.12], [0.3, 0.16], [0, 0.16]], 96), M.graphite);
  cover.rotation.x = Math.PI / 2;
  scene.add(cover);
  const camera = lens(35, 0.02, 60);
  const key = spot(scene, ctx, { pos: [2.2, 2.6, 3.4], target: [0, 0, 0], intensity: 60, angle: 0.5, penumbra: 0.8, far: 12 });
  spot(scene, ctx, { pos: [-3, 1.5, 1.0], target: [0, 0, 0], color: 0x9cc8ff, intensity: 40, angle: 0.6, penumbra: 1, shadow: false });
  spot(scene, ctx, { pos: [2.5, -2.2, 1.5], target: [0, 0, 0], color: 0xffd2a8, intensity: 26, angle: 0.6, penumbra: 1, shadow: false });
  const rig = {
    pos: [[0, [1.25, 0.95, 1.55]], [3.8, [1.6, 0.9, 2.4]], [6.6, [0.35, 0.28, 3.7]], [8.4, [0.6, 0.22, 4.5]], [11.2, [0.66, 0.2, 4.3]]],
    tgt: [[0, [0.55, 0.45, 0.3]], [3.8, [0.35, 0.25, 0.1]], [6.6, [0, 0, 0]], [8.4, [0.62, 0, 0]], [11.2, [0.66, 0, 0]]],
  };
  const thetaAt = (lt) => (lt < 4.6 ? 0 : lt < 6.6 ? 0.55 * (lt - 4.6) ** 2 : 2.2 + 2.2 * (lt - 6.6) + 0.12 * Math.max(0, lt - 8.6) ** 2);
  const ampAt = (lt) => 0.55 + 0.45 * ease.inOutCubic(clamp((lt - 8.9) / 1.6));
  const dust = new BokehDust({ count: 260, box: [4, 3, 3], center: [0, 0, 1.2], size: 1.2, seed: 13, intensity: 0.45 });
  scene.add(dust.points);
  let st = {};
  return {
    scene, camera,
    update(t, lt) {
      const p = track(rig.pos, lt, { smooth: true }), g = track(rig.tgt, lt, { smooth: true });
      camera.position.set(...p);
      camera.lookAt(...g);
      const off = ease.inCubic(clamp(lt / 1.5));
      cover.position.set(0.2 * off, 2.6 * off, MOTOR.L * 0.62 + 0.02 + 1.6 * off);
      cover.rotation.set(Math.PI / 2 - 1.2 * off, 0.4 * off, 0);
      const theta = thetaAt(lt);
      motor.drive(t, {
        theta, amp: ampAt(lt), currentVisible: smoothstep(0.6, 2.0, lt), fluxVisible: smoothstep(4.0, 5.4, lt),
        flowSpeed: 1, torqueAngle: Math.PI / 2,
      });
      dust.update(t, camera.position.distanceTo(new THREE.Vector3(...g)), 10, ctx.H);
      st = { cam: camera, theta, thE: (MOTOR.poles / 2) * theta + Math.PI / 2, amp: ampAt(lt), focus: camera.position.distanceTo(new THREE.Vector3(...g)) };
    },
    plates: (t, lt) => (lt > 8.3 ? ctx.plates.req('torque', lt - 8.3) : []),
    post: (t, lt) => ({ dof: { focus: st.focus || 2, aperture: 10, maxBlur: 14 }, bloom: { strength: 0.6, radius: 0.5, threshold: 1.3 },
      exposure: 1 + 2.2 * (1 - smoothstep(0, 0.9, lt)), vignette: 0.6 }),
    overlay(o, t, lt, plates) {
      if (!st.cam) return;
      const cam = st.cam;
      // anatomy callouts
      const ca = env(lt, 1.0, 5.2, 0.3, 0.5);
      if (ca > 0) o.group(ca, () => {
        const a = (0.5 * TAU) / 12 * 0;
        const coilP = project(new THREE.Vector3(Math.cos(0.52) * 0.72, Math.sin(0.52) * 0.72, MOTOR.L / 2 + 0.06), cam);
        o.callout(coilP.x, coilP.y, { dx: 120, dy: -90, shelf: 210, progress: clamp((lt - 1.1) / 1.0), color: C.copper, lines: [{ text: 'COPPER WINDING', color: C.copper, size: 16 }, { text: '12 SLOTS · 3 PHASES', size: 14, color: C.dim }] });
        const magP = project(new THREE.Vector3(Math.cos(2.2 + st.theta) * 0.47, Math.sin(2.2 + st.theta) * 0.47, MOTOR.L / 2), cam);
        o.callout(magP.x, magP.y, { dx: -130, dy: -70, shelf: 200, progress: clamp((lt - 1.8) / 1.0), color: C.white, lines: [{ text: 'PERMANENT MAGNETS', size: 16 }, { text: '14 POLES · N/S', size: 14, color: C.dim }] });
      });
      // 3-phase scope
      scope(o, 120, 800, 380, 150, st.thE, env(lt, 1.6, 8.2, 0.5, 0.5), st.amp);
      // Lorentz force inset at a magnet on the rotor rim
      const la = env(lt, 5.2, 8.3, 0.4, 0.4);
      if (la > 0) o.group(la, () => {
        const ang = Math.PI * 0.25 + st.theta;
        const P = project(new THREE.Vector3(Math.cos(ang) * MOTOR.Rro, Math.sin(ang) * MOTOR.Rro, MOTOR.L / 2 + 0.05), cam);
        const Pc = project(new THREE.Vector3(0, 0, MOTOR.L / 2), cam);
        const rx = P.x - Pc.x, ry = P.y - Pc.y, rl = Math.hypot(rx, ry);
        const ux = rx / rl, uy = ry / rl;
        const k = ease.outCubic(clamp((lt - 5.4) / 0.6));
        o.arrow(P.x, P.y, P.x + ux * 90 * k, P.y + uy * 90 * k, { w: 2.5, color: C.cyan, head: 12 });
        o.text('B', P.x + ux * 108, P.y + uy * 108 + 8, { family: 'math', italic: true, size: 30, color: C.cyan, align: 'center', alpha: k });
        o.arrow(P.x, P.y, P.x - uy * 110 * k, P.y + ux * 110 * k, { w: 3, color: C.white, head: 14 });
        o.text('F', P.x - uy * 130, P.y + ux * 130 + 8, { family: 'math', italic: true, size: 30, color: C.white, align: 'center', alpha: k });
        o.text('F = I L × B', 1460, 300, { family: 'math', italic: true, size: 46, alpha: k });
        o.text('LORENTZ FORCE ON EACH TOOTH', 1460, 340, { family: 'mono', size: 15, tracking: 0.18, color: C.dim, alpha: k });
      });
      // torque arc around the rotor
      const ta = env(lt, 6.0, 11.4, 0.5, 0.3);
      if (ta > 0) o.group(ta, () => {
        const Pc = project(new THREE.Vector3(0, 0, MOTOR.L / 2), cam);
        const Pr = project(new THREE.Vector3(MOTOR.Rso * 1.18, 0, MOTOR.L / 2), cam);
        const R = Math.hypot(Pr.x - Pc.x, Pr.y - Pc.y);
        const a0 = -Math.PI * 0.85 - st.theta * 0.02;
        o.arcArrow(Pc.x, Pc.y, R, a0, a0 - 1.1, { w: 2 + 7 * st.amp, color: C.white, head: 18 + 10 * st.amp, progress: ease.outCubic(clamp((lt - 6.0) / 0.8)), glow: 8 });
        o.text('τ', Pc.x + Math.cos(a0 - 0.55) * (R + 40), Pc.y + Math.sin(a0 - 0.55) * (R + 40) + 10, { family: 'math', italic: true, size: 44, align: 'center' });
      });
      if (lt > 8.3 && plates) { const pa = env(lt, 8.3, 11.6, 0.4, 0.3); o.group(pa, () => o.pad(1420, 420, 520, 300, 0.55)); plates.draw(o, 'torque', lt - 8.3, 1010, 250, 820, pa); }
    },
  };
}

// ---------------------------------------------------------------- 46.2–49.6  strain-wave gear
export function buildGear(ctx) {
  const { scene } = makeStage(ctx, { env: 'studio', envIntensity: 1.0, floor: false, fog: [0x000000, 0.04] });
  const hd = new HarmonicDrive();
  scene.add(hd.group);
  hd.group.rotation.set(-0.12, 0.38, 0);
  const camera = lens(40, 0.02, 60);
  spot(scene, ctx, { pos: [2.4, 2.8, 3.6], target: [0, 0, 0], intensity: 70, angle: 0.5, penumbra: 0.8, far: 12 });
  spot(scene, ctx, { pos: [-3, 1.2, 1.4], target: [0, 0, 0], color: 0x9cc8ff, intensity: 40, angle: 0.6, penumbra: 1, shadow: false });
  spot(scene, ctx, { pos: [1.5, -2.6, 2.0], target: [0, 0, 0], color: 0xffd2a8, intensity: 30, angle: 0.6, penumbra: 1, shadow: false });
  const W_IN = TAU * 2.6; // rad/s of the wave generator (displayed slowed)
  let st = {};
  return {
    scene, camera,
    update(t, lt) {
      camera.position.set(2.3 - lt * 0.06, 0.95 - lt * 0.02, 6.1 - lt * 0.12);
      camera.lookAt(1.05, 0.38, 0);
      const alpha = W_IN * lt;
      const out = hd.update(alpha, { engageGlow: 2.2 * smoothstep(0.3, 1.0, lt) });
      st = { cam: camera, alpha, out };
    },
    plates: (t, lt) => (lt > 0.7 ? ctx.plates.req('gear', lt - 0.7) : []),
    post: () => ({ dof: { focus: 6.0, aperture: 10, maxBlur: 12 }, bloom: { strength: 0.55, radius: 0.5, threshold: 1.3 }, vignette: 0.6 }),
    overlay(o, t, lt, plates) {
      if (!st.cam) return;
      const a = env(lt, 0.1, 3.6, 0.3, 0.3);
      const g = hd.group;
      const P = (x, y, z) => project(new THREE.Vector3(x, y, z).applyMatrix4(g.matrixWorld), st.cam);
      g.updateMatrixWorld();
      const c = P(0, 0, 0.15), rIn = P(0.3, 0, 0.15), rOut = P(1.32, 0, 0.15);
      const Ri = Math.hypot(rIn.x - c.x, rIn.y - c.y), Ro = Math.hypot(rOut.x - c.x, rOut.y - c.y);
      o.group(a, () => {
        const k = ease.outCubic(clamp((lt - 0.3) / 0.6));
        o.arcArrow(c.x, c.y, Ri, -0.3 + st.alpha * 0.05, 1.2 + st.alpha * 0.05, { w: 1.6, color: C.cyan, head: 10, progress: k });
        o.arcArrow(c.x, c.y, Ro, -2.0, -3.3, { w: 9, color: C.white, head: 26, progress: ease.outCubic(clamp((lt - 0.8) / 0.7)), glow: 6 });
        o.text('IN', 150, 820, { family: 'mono', size: 16, tracking: 0.24, color: C.cyan });
        o.text(`${(st.alpha / TAU).toFixed(1)} rev`, 150, 870, { family: 'mono', size: 40, color: C.white });
        o.text('fast · weak', 150, 904, { family: 'mono', size: 15, color: C.dim });
        o.text('OUT', 470, 820, { family: 'mono', size: 16, tracking: 0.24, color: C.white });
        o.text(`${(Math.abs(st.out) / TAU).toFixed(3)} rev`, 470, 870, { family: 'mono', size: 40, color: C.white });
        o.text('slow · strong', 470, 904, { family: 'mono', size: 15, color: C.dim });
        o.text('50 : 1', 150, 760, { size: 64, weight: 200, color: C.white, alpha: clamp((lt - 0.5) / 0.5) });
      });
      if (plates) plates.draw(o, 'gear', lt - 0.7, 1080, 280, 760, env(lt, 0.7, 3.7, 0.3, 0.3));
    },
  };
}

// ---------------------------------------------------------------- 49.6–54.2  encoder feedback
export function buildEncoder(ctx) {
  const { scene } = makeStage(ctx, { env: 'studio', envIntensity: 0.35, floor: false, fog: [0x000000, 0.05] });
  const enc = encoderAssembly();
  scene.add(enc.group);
  const camera = lens(40, 0.02, 60);
  spot(scene, ctx, { pos: [-1.2, 1.1, 2.2], target: [0.5, 0, 0], intensity: 16, angle: 0.45, penumbra: 0.9, far: 10 });
  spot(scene, ctx, { pos: [-2.5, 1.2, -1.6], target: [0, 0, 0], color: 0x9cc8ff, intensity: 30, angle: 0.7, penumbra: 1, shadow: false });
  spot(scene, ctx, { pos: [2.6, 0.6, -0.8], target: [0.9, 0, 0], color: 0xffd2a8, intensity: 14, angle: 0.5, penumbra: 1, shadow: false });
  let st = {};
  return {
    scene, camera,
    update(t, lt) {
      const k = ease.inOutSine(clamp(lt / 4.6));
      camera.position.set(2.15 - 0.25 * k, 0.95 - 0.08 * k, 1.55 - 0.2 * k);
      camera.lookAt(0.55, -0.08, 0.0);
      const ang = 0.6 * lt + 0.15 * Math.sin(lt * 2.1);
      enc.set(ang, t, 1);
      st = { cam: camera, ang };
    },
    plates: (t, lt) => (lt > 2.0 ? ctx.plates.req('loop', lt - 2.0) : []),
    post: () => ({ dof: { focus: 1.75, aperture: 12, maxBlur: 16 }, bloom: { strength: 0.6, radius: 0.5, threshold: 1.2 }, vignette: 0.6 }),
    overlay(o, t, lt, plates) {
      if (!st.cam) return;
      const a = env(lt, 0.15, 4.8, 0.3, 0.3);
      o.group(a, () => {
        // quadrature A/B
        const x0 = 120, y0 = 760, w = 520;
        o.text('ENCODER CHANNELS', x0, y0 - 24, { family: 'mono', size: 14, tracking: 0.2, color: C.dim });
        for (const [j, off, col] of [[0, 0, C.red], [1, 0.25, C.amber]]) {
          const pts = [];
          const base = y0 + j * 70;
          for (let i = 0; i <= 260; i++) {
            const u = i / 260;
            const ph = st.ang * 40 - (1 - u) * 6 + off;
            const v = (ph - Math.floor(ph)) < 0.5 ? 1 : 0;
            pts.push([x0 + u * w, base + 40 - v * 36]);
          }
          o.polyline(pts, { w: 1.8, color: col, cap: 'butt' });
          o.text(j ? 'B' : 'A', x0 + w + 14, base + 26, { family: 'mono', size: 15, color: col });
        }
        o.text(`θ = ${st.ang.toFixed(6)} rad`, x0, 950, { family: 'mono', size: 30, color: C.white });
        o.text('19-BIT  ·  524,288 COUNTS / REV  ·  LOOP 10 kHz', x0, 990, { family: 'mono', size: 14, tracking: 0.12, color: C.dim });
      });
      if (plates) { const pa = env(lt, 2.0, 4.8, 0.3, 0.3); o.group(pa, () => o.pad(1440, 420, 520, 300, 0.7)); plates.draw(o, 'loop', lt - 2.0, 1060, 200, 760, pa); }
    },
  };
}

// ---------------------------------------------------------------- 54.2–60.2  muscle vs motor
export function buildMuscle(ctx) {
  const { scene } = makeStage(ctx, { env: 'studio', envIntensity: 0.85, floor: false, fog: [0x000000, 0.03] });
  const mus = new Fascicle();
  mus.group.position.set(-20, 0, 0);
  mus.group.rotation.set(0.25, 0.5, 0.05);
  scene.add(mus.group);
  const motor = new Motor({ housing: false });
  motor.group.position.set(20, 0, 0);
  motor.group.rotation.set(0.15, -0.5, 0);
  scene.add(motor.group);
  const camL = lens(45, 0.02, 60), camR = lens(45, 0.02, 60);
  camL.aspect = camR.aspect = (ctx.W / 2) / ctx.H;
  camL.updateProjectionMatrix(); camR.updateProjectionMatrix();
  spot(scene, ctx, { pos: [-18, 2.5, 3.5], target: [-20, 0, 0], intensity: 70, angle: 0.5, penumbra: 0.8, far: 12, color: 0xfff1ea });
  spot(scene, ctx, { pos: [-23, 1.2, -1.5], target: [-20, 0, 0], color: 0xffb0a0, intensity: 40, angle: 0.6, penumbra: 1, shadow: false });
  spot(scene, ctx, { pos: [22, 2.5, 3.5], target: [20, 0, 0], intensity: 60, angle: 0.5, penumbra: 0.8, far: 12 });
  spot(scene, ctx, { pos: [17, 1.2, -1.5], target: [20, 0, 0], color: 0x9cc8ff, intensity: 36, angle: 0.6, penumbra: 1, shadow: false });
  const S = { cool: 1.3, shock: 2.5, heal: 3.8 };
  let st = { lt: 0 };
  return {
    scene, camera: camL, dofCamera: camL, keepAspect: true,
    update(t, lt) {
      camL.position.set(-20 + 0.6 - lt * 0.05, 1.1, 7.2 - lt * 0.12);
      camL.lookAt(-20, -0.05, 0);
      camR.position.set(20 + 1.1 - lt * 0.04, 1.0, 3.6 - lt * 0.08);
      camR.lookAt(20 + 0.2, 0.15, 0);
      const pulse = 0.5 + 0.5 * Math.sin(lt * 1.6);
      const shock = lt > S.shock ? Math.exp(-(lt - S.shock) * 3.5) * Math.sin((lt - S.shock) * 24) : 0;
      mus.update(t, { contract: 0.5 + 0.3 * pulse, jiggle: shock, tear: smoothstep(S.heal - 0.2, S.heal + 0.1, lt), heal: smoothstep(S.heal + 0.4, S.heal + 1.8, lt), bloodSpeed: 1 + smoothstep(S.cool - 0.2, S.cool + 0.5, lt) * 0.8 });
      const heat = 0.15 + 0.5 * smoothstep(0.5, 6, lt);
      motor.drive(t, { theta: 0.3 * lt, amp: 0.8, currentVisible: 0.7, fluxVisible: 0, heat });
      const jolt = lt > S.shock ? Math.exp(-(lt - S.shock) * 9) * 0.02 * Math.sin((lt - S.shock) * 70) : 0;
      motor.group.position.y = jolt;
      st = { lt, heat, shock, tMotor: 41 + 30 * smoothstep(0.5, 6, lt) };
    },
    render(r, rt) {
      const w = ctx.W, h = ctx.H;
      rt.scissorTest = true;
      rt.viewport.set(0, 0, w / 2, h); rt.scissor.set(0, 0, w / 2, h);
      r.setRenderTarget(rt);
      r.render(scene, camL);
      rt.viewport.set(w / 2, 0, w / 2, h); rt.scissor.set(w / 2, 0, w / 2, h);
      r.setRenderTarget(rt);
      r.render(scene, camR);
      rt.scissorTest = false;
      rt.viewport.set(0, 0, w, h); rt.scissor.set(0, 0, w, h);
      r.setRenderTarget(rt);
    },
    post: () => ({ dof: { focus: 4.4, aperture: 7, maxBlur: 10 }, bloom: { strength: 0.5, radius: 0.5, threshold: 1.4 }, vignette: 0.45 }),
    overlay(o, t, lt) {
      o.line(960, 0, 960, 1080, { w: 1.5, color: 'rgba(255,255,255,0.35)' });
      const a = env(lt, 0.1, 6.2, 0.4, 0.3);
      o.group(a, () => {
        o.text('MUSCLE', 120, 150, { size: 50, weight: 300, tracking: 0.22, color: C.white });
        o.text('MOTOR', 1080, 150, { size: 50, weight: 300, tracking: 0.22, color: C.white });
        o.pad(960, 70, 260, 40, 0.6);
        o.text('SAME LOAD', 960, 80, { family: 'mono', size: 16, tracking: 0.3, color: C.dim, align: 'center' });
        const row = (y, t0, l, r, lc = C.green, rc = C.red) => {
          const k = clamp((lt - t0) / 0.5);
          o.textReveal(l, 120, y, k, { family: 'mono', size: 20, tracking: 0.12, color: lc });
          o.textReveal(r, 1080, y, k, { family: 'mono', size: 20, tracking: 0.12, color: rc });
        };
        row(860, S.cool, 'COOLED BY BLOOD FLOW', 'COOLED BY CONDUCTION ONLY');
        row(900, S.shock, 'COMPLIANT · ABSORBS SHOCK', 'RIGID GEARS TAKE THE HIT');
        row(940, S.heal, 'SELF-REPAIRING', 'WEARS OUT');
        o.text('37.0 °C', 120, 220, { family: 'mono', size: 30, color: C.white, alpha: clamp((lt - S.cool) / 0.4) });
        o.text(`${st.tMotor.toFixed(1)} °C`, 1080, 220, { family: 'mono', size: 30, color: st.tMotor > 60 ? C.amber : C.white, alpha: clamp((lt - S.cool) / 0.4) });
      });
    },
  };
}

// ---------------------------------------------------------------- 60.2–65.6  I²R heat
export function buildHeat(ctx) {
  const { scene } = makeStage(ctx, { env: 'studio', envIntensity: 0.7, floor: false, fog: [0x000000, 0.04] });
  const motor = new Motor({ housing: false });
  scene.add(motor.group);
  motor.group.rotation.set(0.1, -0.35, 0);
  const camera = lens(42, 0.02, 60);
  spot(scene, ctx, { pos: [2.5, 2.4, 3.2], target: [0.6, 0.4, 0], intensity: 40, angle: 0.5, penumbra: 0.8, far: 12 });
  spot(scene, ctx, { pos: [-2.4, 1.6, -1.2], target: [0.5, 0.4, 0], color: 0x9cc8ff, intensity: 26, angle: 0.6, penumbra: 1, shadow: false });
  // rising heat particles
  const N = 500, r = rng(44);
  const seeds = new Float32Array(N * 3).map(() => r());
  const pos = new Float32Array(N * 3);
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pm = new THREE.PointsMaterial({ color: new THREE.Color(0xff8a3a).multiplyScalar(2), size: 0.018, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const heatPts = new THREE.Points(pg, pm);
  heatPts.frustumCulled = false;
  scene.add(heatPts);
  let st = {};
  const heatAt = (lt) => 0.3 + 0.3 * smoothstep(0.3, 1.8, lt) + 0.4 * smoothstep(1.8, 3.4, lt);
  return {
    scene, camera,
    update(t, lt) {
      camera.position.set(1.6 - lt * 0.04, 0.85, 3.3 - lt * 0.08);
      camera.lookAt(0.65, 0.1, 0.1);
      const h = heatAt(lt);
      motor.drive(t, { theta: 0.25 * lt, amp: 0.7 + 0.3 * smoothstep(1.8, 3.0, lt), currentVisible: 0.35, fluxVisible: 0, heat: h });
      for (let i = 0; i < N; i++) {
        const u = (seeds[i * 3] + t * (0.18 + seeds[i * 3 + 1] * 0.2)) % 1;
        pos[i * 3] = 0.25 + seeds[i * 3 + 2] * 0.9 + Math.sin(t * 2 + i) * 0.03;
        pos[i * 3 + 1] = 0.1 + u * 1.4;
        pos[i * 3 + 2] = MOTOR.L / 2 + 0.05 + seeds[(i * 7) % (N * 3)] * 0.3;
      }
      pg.attributes.position.needsUpdate = true;
      pm.opacity = h * 0.8;
      st = { h, T: 60 + 95 * (h - 0.25) / 0.75 };
    },
    plates: (t, lt) => (lt > 0.4 ? ctx.plates.req('heat', lt - 0.4) : []),
    post: () => ({ dof: { focus: 3.1, aperture: 10, maxBlur: 14 }, bloom: { strength: 0.75, radius: 0.6, threshold: 1.1 }, vignette: 0.6, tint: [1.04, 1.0, 0.95] }),
    overlay(o, t, lt, plates) {
      const a = env(lt, 0.2, 5.6, 0.3, 0.3);
      o.group(a, () => {
        o.text('WINDING TEMPERATURE', 120, 820, { family: 'mono', size: 15, tracking: 0.2, color: C.dim });
        o.text(`${st.T.toFixed(0)} °C`, 120, 890, { size: 72, weight: 200, color: st.T > 130 ? C.red : st.T > 95 ? C.amber : C.white });
        o.meter(120, 920, 420, 6, (st.T - 20) / 160, { color: st.T > 130 ? C.red : C.amber, mark: (155 - 20) / 160 });
        o.text('INSULATION LIMIT 155 °C (CLASS F)', 120, 956, { family: 'mono', size: 13, tracking: 0.14, color: C.dim });
      });
      if (plates) { const pa = env(lt, 0.4, 5.6, 0.3, 0.3); o.group(pa, () => o.pad(1420, 500, 560, 420, 0.6)); plates.draw(o, 'heat', lt - 0.4, 1000, 170, 840, pa); }
    },
  };
}
