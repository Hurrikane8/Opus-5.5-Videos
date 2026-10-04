// 1:05–1:32  THE BOTTLENECK — the torque/mass spiral, heat, impact, loss of feel,
// manufacturing at scale, and "intelligence can be copied; muscle must be manufactured".
import * as THREE from 'three';
import { M, glow } from '../core/materials.js';
import { makeStage, spot, lens, BokehDust, contactShadow, shockRing } from './common.js';
import { Robot, neutralPose, withPose, ANKLE_H, DIM } from '../assets/robot.js';
import { thermalMaterial } from '../assets/motion.js';
import { rotaryActuator } from '../assets/actuators.js';
import { superellipsoid, lathe, mergeGeometries } from '../core/geo.js';
import { C, project } from '../core/overlay.js';
import { track, env, ease, smoothstep, clamp, rng, springStep, fbm1, TAU } from '../core/timeline.js';

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const stand = (robot, pose, w = 0.12) => { robot.setPose(pose); robot.plantFeet(v3(w, ANKLE_H, 0), v3(-w, ANKLE_H, 0)); };

// ---------------------------------------------------------------- 65.6–72.4  the spiral
export function buildSpiral(ctx) {
  const { scene } = makeStage(ctx, { env: 'studio', envIntensity: 0.5, fog: [0x000000, 0.06] });
  const robot = new Robot();
  scene.add(robot.root, contactShadow(1.2, 1.0, 0.85));
  const legs = ['l_knee', 'r_knee', 'l_hip_pitch', 'r_hip_pitch', 'l_ankle_a', 'l_ankle_b', 'r_ankle_a', 'r_ankle_b'].map((n) => robot.indexOf(n));
  const camera = lens(40, 0.02, 60);
  spot(scene, ctx, { pos: [-2.2, 3.4, 2.4], target: [0, 0.9, 0], intensity: 34, angle: 0.5, penumbra: 0.85, far: 12 });
  spot(scene, ctx, { pos: [2.4, 2.4, -2.6], target: [0, 1.0, 0], color: 0x9cc8ff, intensity: 30, angle: 0.6, penumbra: 1, shadow: false });
  spot(scene, ctx, { pos: [-2.6, 1.4, -2.2], target: [0, 0.8, 0], color: 0xffd2a8, intensity: 18, angle: 0.6, penumbra: 1, shadow: false });
  const dust = new BokehDust({ count: 300, box: [4, 2.6, 3], center: [0, 1.2, 0.3], size: 2, seed: 31, intensity: 0.5 });
  scene.add(dust.points);
  let st = {};
  return {
    scene, camera,
    update(t, lt) {
      const g = ease.inOutSine(clamp((lt - 2.4) / 4.2));
      const p = withPose(neutralPose(), { root: { pos: [0, -0.02 - 0.03 * g, 0] }, waist: { pitch: 0.03 * g }, neck: { pitch: 0.08 + 0.06 * g } });
      stand(robot, p);
      for (const i of legs) {
        const a = robot.actuators[i];
        a.module.scale.setScalar(1 + 0.42 * g);
        robot.setGlow(i, 1.2 + 2.5 * g, 0xffa040);
      }
      for (let i = 0; i < robot.actuators.length; i++) if (!legs.includes(i)) robot.setGlow(i, 0.6);
      const ang = -0.7 + lt * 0.07;
      camera.position.set(Math.sin(ang) * 3.9 + 0.5, 1.1, Math.cos(ang) * 3.9);
      camera.lookAt(0.55, 0.86, 0);
      dust.update(t, 3.9, 16, ctx.H);
      st = { cam: camera, g, lt, knee: robot.anchorWorld(robot.indexOf('r_knee')) };
    },
    post: () => ({ dof: { focus: 3.9, aperture: 18, maxBlur: 16 }, bloom: { strength: 0.5, radius: 0.5, threshold: 1.5 }, vignette: 0.65 }),
    overlay(o, t, lt) {
      if (!st.cam) return;
      const a = env(lt, 2.2, 7.0, 0.5, 0.3);
      const cx = 1330, cy = 540, R = 165;
      const nodes = [['TORQUE', -Math.PI / 2], ['MOTOR MASS', Math.PI / 6], ['LIMB INERTIA', (5 * Math.PI) / 6]];
      o.group(a, () => {
        const k = st.g;
        nodes.forEach(([name, ang], i) => {
          const na = clamp((lt - 2.4 - i * 0.35) / 0.4);
          const x = cx + Math.cos(ang) * R, y = cy + Math.sin(ang) * R;
          o.circle(x, y, 7, { fill: C.amber, stroke: false, alpha: na });
          const right = Math.cos(ang) > 0.1, left = Math.cos(ang) < -0.1;
          o.text(`${name}  ↑`, x + (right ? 22 : left ? -22 : 0), y + (right || left ? 6 : -22), { family: 'mono', size: 19, tracking: 0.14, align: right ? 'left' : left ? 'right' : 'center', alpha: na, color: C.white });
          const a0 = ang + 0.2, a1 = nodes[(i + 1) % 3][1] + (i === 2 ? TAU : 0) - 0.2;
          o.arcArrow(cx, cy, R, a0, a1, { w: 2, color: C.amber, head: 12, progress: clamp((lt - 2.7 - i * 0.35) / 0.5), alpha: 0.85 });
        });
        // runaway pulse speeding up around the loop
        const sp = 0.6 + 2.8 * k;
        const ph = (lt - 3.2) * sp;
        if (lt > 3.2) for (let j = 0; j < 4; j++) {
          const aa = -Math.PI / 2 + (ph - j * 0.05) * TAU / 1.0;
          o.circle(cx + Math.cos(aa) * R, cy + Math.sin(aa) * R, 5 - j, { fill: C.white, stroke: false, alpha: 1 - j * 0.25 });
        }
        // leader to the knee
        const kn = project(st.knee, st.cam);
        o.line(kn.x + 14, kn.y, cx - R - 30, cy + 40, { w: 1, color: C.amber, alpha: 0.5, dash: [4, 6] });
        o.circle(kn.x, kn.y, 18 + 8 * k, { w: 1.5, color: C.amber, alpha: 0.9 });
        // counters
        o.text('KNEE PEAK TORQUE', 1180, 820, { family: 'mono', size: 14, tracking: 0.2, color: C.dim });
        o.text(`${(150 + 46 * k).toFixed(0)} N·m`, 1180, 862, { family: 'mono', size: 34, color: C.white });
        o.text('ROBOT MASS', 1480, 820, { family: 'mono', size: 14, tracking: 0.2, color: C.dim });
        o.text(`${(57.0 + 6.8 * k).toFixed(1)} kg`, 1480, 862, { family: 'mono', size: 34, color: k > 0.5 ? C.amber : C.white });
      });
    },
  };
}

// ---------------------------------------------------------------- 72.4–75.6  thermal
export function buildThermal(ctx) {
  const { scene } = makeStage(ctx, { env: 'studio', envIntensity: 0.4, fog: [0x000000, 0.05] });
  const robot = new Robot();
  scene.add(robot.root);
  const thermal = thermalMaterial(12);
  scene.overrideMaterial = thermal;
  const spots = ['l_knee', 'r_knee', 'l_hip_pitch', 'r_hip_pitch', 'l_ankle_a', 'r_ankle_a', 'l_ankle_b', 'r_ankle_b', 'waist_pitch', 'l_hip_roll', 'r_hip_roll', 'waist_yaw'].map((n) => robot.indexOf(n));
  const camera = lens(38, 0.02, 60);
  const phaseAt = (lt) => { // squats slow down once the drives derate
    const p1 = lt / 1.25;
    return lt < 1.9 ? p1 : 1.9 / 1.25 + (lt - 1.9) / 2.3;
  };
  let st = {};
  return {
    scene, camera,
    update(t, lt) {
      const ph = phaseAt(lt + 0.35);
      const sq = 0.5 - 0.5 * Math.cos(ph * TAU);
      const p = withPose(neutralPose(), {
        root: { pos: [0, -0.03 - 0.3 * sq, 0], rot: [0.18 * sq, 0, 0] },
        waist: { pitch: 0.12 * sq },
        l: { arm: { flex: 0.5 + 0.8 * sq, abd: 0.15, elbow: 0.45, grip: 0.4 } },
        r: { arm: { flex: 0.5 + 0.8 * sq, abd: 0.15, elbow: 0.45, grip: 0.4 } },
      });
      robot.setPose(p);
      robot.plantFeet(v3(0.15, ANKLE_H, 0), v3(-0.15, ANKLE_H, 0));
      const heat = smoothstep(-0.2, 2.6, lt);
      const vals = [1.0, 1.0, 0.75, 0.75, 0.6, 0.6, 0.6, 0.6, 0.45, 0.4, 0.4, 0.3];
      spots.forEach((idx, j) => {
        thermal.uniforms.uHot.value[j].copy(robot.anchorWorld(idx));
        thermal.uniforms.uHeat.value[j] = vals[j] * (0.35 + 0.65 * heat) * (0.9 + 0.1 * Math.sin(t * 3 + j));
      });
      camera.position.set(2.1, 1.05 - 0.05 * sq, 3.1);
      camera.lookAt(0, 0.8 - 0.1 * sq, 0);
      st = { cam: camera, heat, knee: robot.anchorWorld(robot.indexOf('l_knee')), T: 52 + 46 * heat };
    },
    post: () => ({ bloom: { strength: 0.35, radius: 0.5, threshold: 0.9 }, vignette: 0.7, grain: 0.06, ca: 0.004, saturation: 1.1, contrast: 1.05 }),
    overlay(o, t, lt) {
      if (!st.cam) return;
      o.text('THERMAL  ·  LWIR 8–14 µm', 96, 140, { family: 'mono', size: 15, tracking: 0.22, color: C.white, alpha: 0.85 });
      o.text(`REC ● ${(72.4 + lt).toFixed(2)}`, 1824, 140, { family: 'mono', size: 15, tracking: 0.18, color: C.red, align: 'right' });
      // crosshair
      o.line(940, 540, 980, 540, { w: 1, color: C.white, alpha: 0.5 });
      o.line(960, 520, 960, 560, { w: 1, color: C.white, alpha: 0.5 });
      // scale bar
      const g = o.ctx.createLinearGradient(0, 300, 0, 780);
      [['#fffde8', 0], ['#ffd040', 0.2], ['#fa6a0c', 0.4], ['#c71066', 0.6], ['#470880', 0.8], ['#050014', 1]].forEach(([c, s]) => g.addColorStop(s, c));
      o.ctx.save(); o.ctx.fillStyle = g; o.ctx.fillRect(1770, 300, 14, 480); o.ctx.restore();
      o.text('110°', 1760, 310, { family: 'mono', size: 13, align: 'right', color: C.dim });
      o.text('20°', 1760, 784, { family: 'mono', size: 13, align: 'right', color: C.dim });
      const kn = project(st.knee, st.cam);
      o.callout(kn.x, kn.y, { dx: -170, dy: -120, shelf: 220, progress: clamp((lt - 0.3) / 0.8), color: st.T > 85 ? C.red : C.amber,
        lines: [{ text: 'KNEE · J09', color: C.white, size: 16 }, { text: `${st.T.toFixed(1)} °C  ▲`, size: 26, color: st.T > 85 ? C.red : C.amber, family: 'mono' }] });
      if (lt > 1.8) {
        const blink = Math.floor(lt * 4) % 2 === 0 ? 1 : 0.55;
        o.group(clamp((lt - 1.8) / 0.2) * blink, () => {
          o.rect(1180, 860, 560, 92, { w: 2, color: C.red, fill: 'rgba(60,0,0,0.55)', fillAlpha: 1 });
          o.text('THERMAL DERATE', 1210, 898, { family: 'mono', size: 22, tracking: 0.2, color: C.red });
          o.text('TORQUE LIMIT  −40%   ·   SPEED ↓', 1210, 932, { family: 'mono', size: 16, tracking: 0.12, color: C.white });
        });
      }
    },
  };
}

// ---------------------------------------------------------------- 75.6–79.0  impact
export function buildImpact(ctx) {
  const { scene } = makeStage(ctx, { env: 'studio', envIntensity: 0.5, fog: [0x000000, 0.05] });
  const robot = new Robot();
  scene.add(robot.root);
  const shadow = contactShadow(1.2, 1.0, 0.85);
  scene.add(shadow);
  const ring = shockRing(0xbfe8ff);
  ring.position.y = 0.004;
  scene.add(ring);
  const ring2 = shockRing(0xffffff);
  ring2.position.y = 0.005;
  scene.add(ring2);
  const camera = lens(32, 0.02, 60);
  spot(scene, ctx, { pos: [-1.8, 3.2, 2.2], target: [0, 0.6, 0], intensity: 36, angle: 0.55, penumbra: 0.8, far: 12 });
  spot(scene, ctx, { pos: [2.4, 1.6, -2.6], target: [0, 0.7, 0], color: 0x9cc8ff, intensity: 32, angle: 0.6, penumbra: 1, shadow: false });
  spot(scene, ctx, { pos: [-2.4, 0.6, -1.6], target: [0, 0.4, 0], color: 0xffd2a8, intensity: 18, angle: 0.6, penumbra: 1, shadow: false });
  const LAND = 1.15;
  const tauAt = (lt) => (lt < 1.05 ? lt : lt < 2.9 ? 1.05 + (lt - 1.05) * 0.18 : 1.383 + (lt - 2.9) * 0.85);
  const pelvisY = (tau) => {
    if (tau < 0.45) return -0.03 - 0.19 * ease.inOutSine(tau / 0.45);
    if (tau < 0.62) return -0.22 + 0.29 * ease.outQuad((tau - 0.45) / 0.17);
    if (tau < LAND) { const s = tau - 0.62; return 0.07 + 2.49 * s - 0.5 * 9.81 * s * s; }
    const s = tau - LAND;
    return -0.03 - 0.21 * Math.exp(-s * 5) * Math.sin(Math.min(s * 9, Math.PI * 0.5) + (s > 0.17 ? (s - 0.17) * 2 : 0)) - 0.0 * s;
  };
  const order = ['l_ankle_a', 'r_ankle_a', 'l_ankle_b', 'r_ankle_b', 'l_knee', 'r_knee', 'l_hip_pitch', 'r_hip_pitch', 'l_hip_roll', 'r_hip_roll', 'waist_pitch'].map((n) => robot.indexOf(n));
  let st = {};
  return {
    scene, camera,
    update(t, lt) {
      const tau = tauAt(lt);
      const py = pelvisY(tau);
      const air = tau > 0.62 && tau < LAND;
      const armUp = tau < 0.45 ? -0.6 * (tau / 0.45) : tau < 0.62 ? -0.6 + 2.3 * ((tau - 0.45) / 0.17) : tau < LAND ? 1.7 - 1.0 * ((tau - 0.62) / 0.53) : 0.7 - 0.4 * clamp((tau - LAND) / 0.6);
      const p = withPose(neutralPose(), {
        root: { pos: [0, py, 0], rot: [0.12 + (air ? -0.05 : 0.12 * clamp(-py / 0.2)), 0, 0] },
        waist: { pitch: 0.1 * clamp(-py / 0.2) },
        l: { arm: { flex: armUp, abd: 0.25, elbow: 0.5, grip: 0.5 } },
        r: { arm: { flex: armUp, abd: 0.25, elbow: 0.5, grip: 0.5 } },
      });
      robot.setPose(p);
      let fy = ANKLE_H;
      if (air) { const pw = robot.j.pelvis.position.y; fy = Math.max(ANKLE_H, pw - 0.86 + 0.12 * Math.sin(((tau - 0.62) / 0.53) * Math.PI)); }
      robot.plantFeet(v3(0.13, fy, 0.02), v3(-0.13, fy, -0.02), air ? -0.15 : 0, air ? -0.15 : 0);
      // impact FX
      const s = tau - LAND;
      ring.material.uniforms.uR.value = s > 0 ? 0.15 + s * 9 : 0;
      ring.material.uniforms.uI.value = s > 0 ? 2.5 * Math.exp(-s * 6) : 0;
      ring.material.uniforms.uW.value = 0.03 + Math.max(0, s) * 0.3;
      ring2.material.uniforms.uR.value = s > 0 ? 0.1 + s * 4 : 0;
      ring2.material.uniforms.uI.value = s > 0 ? 1.6 * Math.exp(-s * 9) : 0;
      shadow.scale.setScalar(1 - 0.3 * clamp((py - 0.0) / 0.35));
      order.forEach((idx, k) => {
        const tk = LAND + k * 0.012;
        const v = tau > tk ? 7 * Math.exp(-(tau - tk) * 7) : 0;
        robot.setGlow(idx, 0.7 + v, v > 0.8 ? 0xff4a3d : 0x6fe3ff);
      });
      const shake = s > 0 ? Math.exp(-s * 12) * 0.012 : 0;
      camera.position.set(1.45 + Math.sin(lt * 80) * shake, 0.5 + Math.cos(lt * 93) * shake, 2.75);
      camera.lookAt(0, 0.82, 0);
      st = { cam: camera, tau, s, knee: robot.anchorWorld(robot.indexOf('r_knee')), lt };
    },
    post: (t, lt) => ({ dof: { focus: 3.1, aperture: 12, maxBlur: 14 }, bloom: { strength: 0.6, radius: 0.55, threshold: 1.3 }, vignette: 0.65,
      exposure: 1 + 0.6 * (st.s > 0 ? Math.exp(-st.s * 25) : 0), saturation: st.tau > 1.05 && st.tau < 1.42 ? 0.85 : 1 }),
    overlay(o, t, lt) {
      if (!st.cam) return;
      if (st.tau > 1.0 && lt < 2.95) o.text('0.18×  SLOW MOTION', 96, 140, { family: 'mono', size: 15, tracking: 0.22, color: C.dim });
      const a = env(lt, 1.35, 3.5, 0.3, 0.3);
      o.group(a, () => {
        // ground reaction force trace, revealed in sync with the landing
        const R = { x: 1160, y: 300, w: 560, h: 260 };
        o.axes(R, { progress: clamp((lt - 1.35) / 0.3), xlabel: 't', ylabel: 'GROUND FORCE' });
        const dom = { x0: 0, x1: 0.4, y0: 0, y1: 4.2 };
        const f = (x) => (x < 0.05 ? 1 : 1 + 2.6 * Math.exp(-Math.pow((x - 0.09) / 0.018, 2)) + 0.6 * Math.exp(-Math.pow((x - 0.15) / 0.05, 2)));
        const prog = clamp((st.tau - (LAND - 0.05)) / 0.3);
        o.line(R.x, o.map(R, dom, 0, 1)[1], R.x + R.w, o.map(R, dom, 0, 1)[1], { w: 1, color: C.dim, dash: [5, 6] });
        o.text('1× BODY WEIGHT', R.x + R.w + 8, o.map(R, dom, 0, 1)[1] + 5, { family: 'mono', size: 13, color: C.dim });
        o.plot(f, R, dom, { progress: prog, w: 2.5, color: C.red, samples: 200 });
        if (prog > 0.35) {
          const [px, py] = o.map(R, dom, 0.09, f(0.09));
          o.circle(px, py, 5, { fill: C.red, stroke: false });
          o.text('≈ 3.5× BODY WEIGHT', px + 14, py - 6, { family: 'mono', size: 18, color: C.white });
          o.text('IN ~30 ms', px + 14, py + 18, { family: 'mono', size: 14, color: C.dim });
        }
        const kn = project(st.knee, st.cam);
        o.callout(kn.x, kn.y, { dx: -160, dy: -90, shelf: 210, progress: clamp((lt - 1.7) / 0.6), color: C.red,
          lines: [{ text: 'GEAR TEETH · SHOCK LOAD', color: C.red, size: 15 }, { text: 'no compliance to absorb it', size: 14, color: C.dim }] });
      });
    },
  };
}

// ---------------------------------------------------------------- 79.0–82.4  loses its feel
function crackableEgg() {
  const prof = [];
  for (let i = 0; i <= 40; i++) {
    const u = i / 40, a = u * Math.PI;
    const r = Math.sin(a) * (0.021 + 0.004 * Math.cos(a));
    prof.push([Math.max(r, 0.0001), -Math.cos(a) * 0.029]);
  }
  const g = lathe(prof, 64);
  const mat = new THREE.MeshPhysicalMaterial({ color: 0xefe4d2, roughness: 0.55, metalness: 0, clearcoat: 0.15, sheen: 0.3, sheenColor: new THREE.Color(0xffffff) });
  const U = { uCrack: { value: 0 }, uDent: { value: 0 }, uContact: { value: new THREE.Vector3(0, 0.029, 0) } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uDent; uniform vec3 uContact; varying vec3 vObj;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n vObj = position; float dd = distance(position, uContact); transformed -= normal * uDent * exp(-dd*dd/0.00008);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      uniform float uCrack; uniform vec3 uContact; varying vec3 vObj;
      vec3 h3(vec3 p){ p = vec3(dot(p,vec3(127.1,311.7,74.7)), dot(p,vec3(269.5,183.3,246.1)), dot(p,vec3(113.5,271.9,124.6))); return fract(sin(p)*43758.5453); }
      float edge(vec3 p){ vec3 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0;
        for(int x=-1;x<=1;x++) for(int y=-1;y<=1;y++) for(int z=-1;z<=1;z++){ vec3 g = vec3(x,y,z); vec3 o = h3(i+g); float d = length(g+o-f); if(d<d1){d2=d1;d1=d;} else if(d<d2){d2=d;} }
        return d2 - d1; }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float dc = distance(vObj, uContact);
        float reach = uCrack * 0.05;
        float e = edge(vObj * 260.0);
        float lines = (1.0 - smoothstep(0.0, 0.07, e)) * (1.0 - smoothstep(reach * 0.7, reach, dc));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.12, 0.08, 0.05), clamp(lines * 1.4, 0.0, 1.0));`);
  };
  const egg = new THREE.Mesh(g, mat);
  egg.castShadow = egg.receiveShadow = true;
  return { mesh: egg, U };
}

export function buildFeel(ctx) {
  const { scene } = makeStage(ctx, { env: 'studio', envIntensity: 0.7, floor: false, fog: [0x000000, 0.08] });
  const robot = new Robot();
  scene.add(robot.root);
  const pedestal = new THREE.Mesh(lathe([[0, 0], [0.09, 0], [0.095, 0.006], [0.095, 0.7], [0.09, 0.706], [0, 0.706]], 64), M.darkSteel);
  pedestal.receiveShadow = true;
  scene.add(pedestal);
  const cup = new THREE.Mesh(lathe([[0, 0], [0.016, 0], [0.02, 0.012], [0.018, 0.014], [0, 0.004]], 48), M.alu);
  scene.add(cup);
  const egg = crackableEgg();
  scene.add(egg.mesh);
  const armAt = (k) => withPose(neutralPose(), {
    root: { pos: [0, -0.04, 0], rot: [0.06, 0, 0] }, waist: { pitch: 0.12 }, neck: { pitch: 0.35 },
    r: { arm: { flex: 0.62 + 0.1 * k, abd: 0.05, rot: -0.1, elbow: 1.05 - 0.08 * k, wflex: 1.05, wpro: 0.0, grip: 0.05, thumb: 0.15 } },
  });
  const tipOf = (k) => {
    robot.setPose(armAt(k));
    robot.plantFeet(v3(0.12, ANKLE_H, 0), v3(-0.12, ANKLE_H, 0));
    const f = robot.rFingers[1][2];
    f.updateWorldMatrix(true, false);
    return v3(0, -0.024, 0).applyMatrix4(f.matrixWorld);
  };
  const contact = tipOf(0.45);
  egg.mesh.position.set(contact.x, contact.y - 0.029, contact.z);
  pedestal.position.set(contact.x, contact.y - 0.058 - 0.706 - 0.004, contact.z);
  cup.position.set(contact.x, contact.y - 0.058 - 0.004, contact.z);
  const camera = lens(85, 0.01, 30);
  spot(scene, ctx, { pos: [contact.x - 0.9, contact.y + 1.0, contact.z + 1.0], target: contact.toArray(), intensity: 14, angle: 0.4, penumbra: 0.9, near: 0.1, far: 5 });
  spot(scene, ctx, { pos: [contact.x + 1.2, contact.y + 0.4, contact.z - 0.8], target: contact.toArray(), color: 0x9cc8ff, intensity: 12, angle: 0.5, penumbra: 1, shadow: false });
  spot(scene, ctx, { pos: [contact.x - 0.6, contact.y - 0.2, contact.z - 1.0], target: contact.toArray(), color: 0xffd2a8, intensity: 8, angle: 0.5, penumbra: 1, shadow: false });
  const CONTACT = 1.15, CRACK = 1.45;
  const kAt = (lt) => (lt < CONTACT ? 0.45 * ease.inOutSine(lt / CONTACT) : 0.45 + 0.5 * ease.outCubic(clamp((lt - CONTACT) / 0.35)));
  let st = {};
  return {
    scene, camera,
    update(t, lt) {
      const k = kAt(lt);
      robot.setPose(armAt(k));
      robot.plantFeet(v3(0.12, ANKLE_H, 0), v3(-0.12, ANKLE_H, 0));
      const crack = smoothstep(CRACK - 0.05, CRACK + 0.5, lt);
      egg.U.uCrack.value = crack;
      egg.U.uDent.value = 0.004 * smoothstep(CRACK, CRACK + 0.3, lt);
      robot.setGlow(robot.indexOf('r_elbow'), 1.2 + (lt > CONTACT ? 3 * Math.exp(-(lt - CONTACT) * 3) : 0), lt > CONTACT ? 0xff4a3d : 0x6fe3ff);
      camera.position.set(contact.x + 0.42 - lt * 0.01, contact.y + 0.1, contact.z + 0.56 - lt * 0.01);
      camera.lookAt(contact.x + 0.0, contact.y + 0.03, contact.z);
      st = { cam: camera, lt, crack, f: lt < CONTACT ? 0 : lt < CRACK ? (lt - CONTACT) / (CRACK - CONTACT) * 3.4 : 3.4 * Math.exp(-(lt - CRACK) * 6) };
    },
    post: () => ({ dof: { focus: 0.71, aperture: 9, maxBlur: 18 }, bloom: { strength: 0.45, radius: 0.5, threshold: 1.5 }, vignette: 0.6 }),
    overlay(o, t, lt) {
      if (!st.cam) return;
      const a = env(lt, 0.3, 3.6, 0.3, 0.3);
      o.group(a, () => {
        const R = { x: 1180, y: 690, w: 520, h: 200 };
        o.axes(R, { progress: clamp((lt - 0.3) / 0.4), xlabel: 't', ylabel: 'CONTACT FORCE' });
        const dom = { x0: 0, x1: 3.2, y0: 0, y1: 4 };
        const want = o.map(R, dom, 0, 0.6)[1];
        o.line(R.x, want, R.x + R.w, want, { w: 1.5, color: C.green, dash: [6, 6] });
        o.text('needed', R.x + R.w + 8, want + 5, { family: 'mono', size: 13, color: C.green });
        const fz = (x) => (x < CONTACT ? 0 : x < CRACK ? (x - CONTACT) / (CRACK - CONTACT) * 3.4 : 0.2 + 3.2 * Math.exp(-(x - CRACK) * 6));
        o.plot(fz, R, dom, { progress: clamp(lt / 3.2), w: 2.5, color: C.red, samples: 200 });
        o.text('HIGH GEAR RATIO  →  THE JOINT CAN\'T FEEL', 1180, 280, { family: 'mono', size: 18, tracking: 0.12, color: C.white, alpha: clamp((lt - 0.4) / 0.5) });
        o.text('reflected inertia ∝ N²   ·   N = 100 → 10,000×', 1180, 314, { family: 'mono', size: 15, color: C.dim, alpha: clamp((lt - 0.8) / 0.5) });
      });
    },
  };
}

// ---------------------------------------------------------------- 82.4–87.4  millions
function proxyGeometry(detail) {
  // crude standing silhouette for the crowd (white shell + dark parts)
  const W = [], D = [];
  const P = (g, x, y, z) => { g.translate(x, y, z); return g; };
  const s = detail ? { seg: 10, rings: 8 } : { seg: 6, rings: 4 };
  W.push(P(superellipsoid({ rx: 0.16, ry: 0.19, rz: 0.11, e: 0.45, ew: 0.62, ...s }), 0, 1.39, 0));
  D.push(P(superellipsoid({ rx: 0.098, ry: 0.122, rz: 0.11, e: 0.66, ...s }), 0, 1.68, 0.01));
  D.push(P(superellipsoid({ rx: 0.14, ry: 0.07, rz: 0.1, e: 0.55, ...s }), 0, 0.97, 0));
  D.push(P(superellipsoid({ rx: 0.09, ry: 0.07, rz: 0.09, e: 0.6, ...s }), 0, 1.13, 0));
  for (const x of [-1, 1]) {
    W.push(P(superellipsoid({ rx: 0.064, ry: 0.19, rz: 0.074, e: 0.62, ...s }), x * 0.1, 0.69, 0));
    W.push(P(superellipsoid({ rx: 0.047, ry: 0.19, rz: 0.042, e: 0.62, ...s }), x * 0.1, 0.27, 0.01));
    D.push(P(superellipsoid({ rx: 0.05, ry: 0.03, rz: 0.12, e: 0.4, ...s }), x * 0.1, 0.03, 0.05));
    if (detail) {
      W.push(P(superellipsoid({ rx: 0.044, ry: 0.11, rz: 0.047, e: 0.6, ...s }), x * 0.235, 1.38, 0));
      W.push(P(superellipsoid({ rx: 0.037, ry: 0.11, rz: 0.03, e: 0.6, ...s }), x * 0.24, 1.1, 0.02));
      D.push(P(superellipsoid({ rx: 0.022, ry: 0.05, rz: 0.04, e: 0.5, ...s }), x * 0.245, 0.91, 0.03));
    } else {
      W.push(P(superellipsoid({ rx: 0.045, ry: 0.25, rz: 0.045, e: 0.6, ...s }), x * 0.235, 1.22, 0));
    }
  }
  return { white: mergeGeometries(W), dark: mergeGeometries(D) };
}

export function buildMillions(ctx) {
  const { scene } = makeStage(ctx, { env: 'cold', envIntensity: 0.45, fog: [0x02040a, 0.028], floorSize: 200 });
  const hero = new Robot();
  scene.add(hero.root);
  stand(hero, withPose(neutralPose(), { root: { pos: [0, -0.015, 0] } }));
  hero.setAllGlow(2.4);
  // ring anchor offsets from the hero for the crowd's light points
  const anchors = hero.actuators.map((_, i) => hero.anchorWorld(i).clone());
  const r = rng(77);
  const near = [], far = [];
  for (let iz = -70; iz <= 3; iz++) for (let ix = -34; ix <= 34; ix++) {
    if (iz > -2 || (iz > -4 && Math.abs(ix) < 2)) continue;
    const x = ix * 1.15 + (r() - 0.5) * 0.08, z = iz * 1.35 + (r() - 0.5) * 0.08;
    const d = Math.hypot(x, z);
    if (d > 85) continue;
    (d < 11 ? near : far).push([x, z, (r() - 0.5) * 0.06]);
  }
  const mkInst = (geo, mat, list) => {
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion();
    list.forEach(([x, z, yaw], i) => { q.setFromEuler(new THREE.Euler(0, yaw, 0)); m.compose(v3(x, 0, z), q, v3(1, 1, 1)); im.setMatrixAt(i, m); });
    im.castShadow = false; im.receiveShadow = false;
    scene.add(im);
    return im;
  };
  const gN = proxyGeometry(true), gF = proxyGeometry(false);
  mkInst(gN.white, M.shellWhite, near); mkInst(gN.dark, M.shellBlack, near);
  mkInst(gF.white, M.shellWhite, far); mkInst(gF.dark, M.shellBlack, far);
  const all = [...near, ...far];
  const pts = new Float32Array(all.length * anchors.length * 3);
  let k = 0;
  for (const [x, z] of all) for (const a of anchors) { pts[k++] = a.x + x; pts[k++] = a.y; pts[k++] = a.z + z; }
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(pts, 3));
  const pm = new THREE.PointsMaterial({ color: new THREE.Color(0x6fe3ff).multiplyScalar(2.6), size: 0.035, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const lights = new THREE.Points(pg, pm);
  lights.frustumCulled = false;
  scene.add(lights);
  const camera = lens(35, 0.05, 400);
  spot(scene, ctx, { pos: [-3, 6, 5], target: [0, 1, 0], intensity: 60, angle: 0.5, penumbra: 0.9, far: 30 });
  const sky = new THREE.DirectionalLight(0x9cc8ff, 0.6);
  sky.position.set(-5, 10, -10);
  scene.add(sky);
  let st = {};
  return {
    scene, camera,
    update(t, lt) {
      const k = ease.inOutCubic(clamp((lt - 0.2) / 4.6));
      const p = track([[0, [0.9, 1.45, 2.0]], [1.6, [1.6, 2.6, 4.2]], [4.8, [2.0, 13.5, 21]]], lt, { smooth: true });
      const g = track([[0, [0, 1.15, 0]], [1.6, [0, 1.0, -1]], [4.8, [0, 0, -24]]], lt, { smooth: true });
      camera.position.set(...p);
      camera.lookAt(...g);
      pm.size = 0.035 + 0.05 * k;
      st = { k, lt };
    },
    post: (t, lt) => ({ dof: { focus: 2.2 + 26 * ease.inOutCubic(clamp(lt / 4.5)), aperture: 18, maxBlur: 14 }, bloom: { strength: 0.7, radius: 0.6, threshold: 1.1 }, vignette: 0.6, tint: [0.96, 1.0, 1.06] }),
    overlay(o, t, lt) {
      const a = env(lt, 0.4, 5.2, 0.4, 0.3);
      o.group(a, () => {
        o.pad(960, 190, 760, 110, 0.6);
        const n = Math.round(1_000_000 * Math.pow(clamp((lt - 0.6) / 2.2), 3));
        const tot = 28 * n;
        o.text('28', 600, 210, { size: 64, weight: 200, align: 'right', color: C.cyan });
        o.text('×', 650, 206, { size: 44, weight: 200, align: 'center', color: C.dim });
        o.text(n.toLocaleString('en-US'), 700, 210, { size: 64, weight: 200, color: C.white });
        o.text('=', 1120, 206, { size: 44, weight: 200, align: 'center', color: C.dim });
        o.text(tot.toLocaleString('en-US'), 1170, 210, { size: 64, weight: 200, color: C.white });
        o.text('ACTUATORS / ROBOT', 600, 246, { family: 'mono', size: 13, tracking: 0.2, align: 'right', color: C.dim });
        o.text('ROBOTS', 700, 246, { family: 'mono', size: 13, tracking: 0.2, color: C.dim });
        o.text('PRECISION ACTUATORS', 1170, 246, { family: 'mono', size: 13, tracking: 0.2, color: C.dim });
        o.words('PRECISE.  DURABLE.  CHEAP.', 960, 960, lt, 2.2, 0.62, { size: 46, weight: 300, tracking: 0.24, align: 'center' });
      });
    },
  };
}

// ---------------------------------------------------------------- 87.4–92.0  copied vs manufactured
export function buildCopied(ctx) {
  const { scene } = makeStage(ctx, { env: 'warm', envIntensity: 0.8, floor: false, fog: [0x000000, 0.06] });
  const act = rotaryActuator();
  act.group.scale.setScalar(0.15);
  act.group.rotation.set(0.3, -0.75, 0);
  scene.add(act.group);
  const camera = lens(50, 0.02, 60);
  const key = spot(scene, ctx, { pos: [0.6, 2.2, 1.4], target: [0, 0, 0], color: 0xffe2c0, intensity: 0, angle: 0.35, penumbra: 0.7, far: 8 });
  const rimC = spot(scene, ctx, { pos: [-1.6, 0.6, -1.2], target: [0, 0, 0], color: 0x9cc8ff, intensity: 0, angle: 0.6, penumbra: 1, shadow: false });
  // network glyph
  const layers = [4, 6, 6, 3];
  let st = {};
  return {
    scene, camera,
    update(t, lt) {
      camera.position.set(0.15, 0.25, 2.0 - lt * 0.05);
      camera.lookAt(0.05, -0.02, 0);
      scene.environmentIntensity = 0.8 * smoothstep(2.0, 2.8, lt);
      const e = 1 - ease.inOutCubic(clamp((lt - 2.3) / 2.1));
      act.set(0.15 + 0.85 * e, t, t * 0.6);
      act.ringMat.color.set(0x6fe3ff).multiplyScalar(3 * smoothstep(4.0, 4.4, lt));
      key.intensity = 26 * smoothstep(2.0, 2.6, lt);
      rimC.intensity = 18 * smoothstep(2.0, 2.6, lt);
      st = { lt };
    },
    post: (t, lt) => ({ dof: { focus: 1.95, aperture: 10, maxBlur: 14 }, bloom: { strength: 0.5, radius: 0.5, threshold: 1.4 }, vignette: 0.6, fade: 1 - smoothstep(4.25, 4.6, lt) }),
    overlay(o, t, lt) {
      // INTELLIGENCE CAN BE COPIED — a network glyph duplicating exponentially
      const a1 = env(lt, 0.0, 2.35, 0.25, 0.3);
      o.group(a1, () => {
        o.textReveal('INTELLIGENCE CAN BE COPIED.', 960, 150, clamp((lt - 0.1) / 0.7), { size: 40, weight: 300, tracking: 0.2, align: 'center' });
        const gen = Math.floor(clamp((lt - 0.55) / 0.32, 0, 4.999));
        const n = 2 ** gen;               // n × n tiles
        const size = 520 / n;
        const ox = 960 - (n * size) / 2, oy = 580 - (n * size) / 2;
        for (let gx = 0; gx < n; gx++) for (let gy = 0; gy < n; gy++) {
          const cx = ox + (gx + 0.5) * size, cy = oy + (gy + 0.5) * size;
          const sc = size / 520;
          const nodes = layers.map((m, li) => Array.from({ length: m }, (_, j) => [cx + (li - 1.5) * 120 * sc, cy + (j - (m - 1) / 2) * 62 * sc]));
          for (let li = 0; li < nodes.length - 1; li++) for (const p0 of nodes[li]) for (const p1 of nodes[li + 1]) o.line(p0[0], p0[1], p1[0], p1[1], { w: Math.max(0.4, 1.2 * sc * 2), color: C.cyan, alpha: 0.35 });
          for (const L of nodes) for (const [x, y] of L) o.circle(x, y, Math.max(1, 7 * sc), { fill: C.white, stroke: false });
        }
        o.text(`× ${(n * n).toLocaleString('en-US')}`, 960, 900, { family: 'mono', size: 22, align: 'center', color: C.dim });
      });
      const a2 = env(lt, 2.3, 4.7, 0.3, 0.35);
      o.group(a2, () => {
        o.textReveal('MUSCLE MUST BE MANUFACTURED.', 960, 150, clamp((lt - 2.4) / 0.8), { size: 40, weight: 300, tracking: 0.2, align: 'center' });
        o.words('MACHINED · GROUND · WOUND · ASSEMBLED · TESTED', 960, 960, lt, 2.8, 0.22, { family: 'mono', size: 17, tracking: 0.14, align: 'center', color: C.dim });
      });
    },
  };
}
