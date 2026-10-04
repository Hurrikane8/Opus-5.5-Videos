// 1:32–1:58  CLOSING — solve the actuator; a body that moves like ours; the final line.
import * as THREE from 'three';
import { M, glow } from '../core/materials.js';
import { makeStage, spot, lens, BokehDust, contactShadow, lightShaft } from './common.js';
import { Robot, neutralPose, withPose, lerpPose, ANKLE_H } from '../assets/robot.js';
import { walk, taichi } from '../assets/motion.js';
import { rotaryActuator } from '../assets/actuators.js';
import { C, project } from '../core/overlay.js';
import { track, env, ease, smoothstep, clamp, fbm1 } from '../core/timeline.js';

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

function horizonGlow({ color = 0xffa860, intensity = 1.6, z = -30, w = 160, h = 50, y = 4 } = {}) {
  const m = new THREE.ShaderMaterial({
    depthWrite: false, fog: false,
    uniforms: { uColor: { value: new THREE.Color(color) }, uI: { value: intensity }, uY0: { value: y }, uH: { value: h } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 uColor; uniform float uI, uY0, uH; varying vec2 vUv;
      void main(){ float wy = uY0 + (vUv.y - 0.5) * uH; float x = vUv.x - 0.5;   // world height above the floor
        float core = exp(-pow((wy - 0.35) / 0.55, 2.0)) * exp(-x * x * 3.0);      // bright dawn line on the horizon
        float halo = exp(-pow((wy - 1.2) / 3.2, 2.0)) * exp(-x * x * 2.0) * 0.4;  // warm glow above it
        float sky = exp(-max(wy, 0.0) / 12.0) * 0.07;
        float g = core * 1.5 + halo + sky;
        gl_FragColor = vec4(uColor * g * uI, 1.0); }`,
  });
  const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  p.position.set(0, y, z);
  return p;
}

// ---------------------------------------------------------------- 92.0–99.0  solve the actuator
export function buildSolved(ctx) {
  const { scene } = makeStage(ctx, { env: 'warm', envIntensity: 0.0, floor: false, fog: [0x000000, 0.05] });
  const act = rotaryActuator();
  act.group.scale.setScalar(0.2);
  // the "solved" actuator: bright machined aluminium instead of dark anodizing
  act.group.traverse((m) => { if (m.isMesh && m.material === M.graphite) m.material = M.alu; });
  scene.add(act.group);
  const sweepMat = glow(0xffd9a8, 0, { additive: true, transparent: true });
  const sweep = new THREE.Mesh(new THREE.TorusGeometry(1.26, 0.02, 8, 128), sweepMat);
  act.group.add(sweep);
  const camera = lens(55, 0.02, 60);
  const key = spot(scene, ctx, { pos: [-1.2, 1.1, -1.4], target: [0, 0, 0], color: 0xffc58a, intensity: 0, angle: 0.5, penumbra: 0.9, far: 8 });
  const fill = spot(scene, ctx, { pos: [1.4, 1.2, 1.4], target: [0, 0, 0], color: 0xfff0e0, intensity: 0, angle: 0.5, penumbra: 1, shadow: false });
  const dust = new BokehDust({ count: 300, box: [2.4, 1.6, 2], center: [0, 0, 0.3], size: 1.2, seed: 41, color: 0xffd7a8, intensity: 0.7 });
  scene.add(dust.points);
  return {
    scene, camera,
    update(t, lt) {
      const rise = smoothstep(0.0, 2.6, lt);
      scene.environmentIntensity = 1.3 * rise;
      key.intensity = 34 * rise;
      fill.intensity = 30 * rise;
      act.group.rotation.set(0.25, -0.6 + lt * 0.12, 0);
      const evolve = ease.inOutCubic(clamp((lt - 1.6) / 2.4));
      act.group.scale.setScalar(0.2 * (1 - 0.1 * evolve));
      act.set(0.0, t, t * 0.8);
      act.ringMat.color.set(0x6fe3ff).multiplyScalar(1.2 + 1.6 * evolve);
      const sw = clamp((lt - 1.8) / 1.6);
      sweep.position.z = -1.1 + 2.3 * ease.inOutSine(sw);
      sweepMat.color.set(0xffd9a8).multiplyScalar(sw > 0 && sw < 1 ? 3 * Math.sin(sw * Math.PI) : 0);
      camera.position.set(0.95 - lt * 0.03, 0.32, 2.05 - lt * 0.05);
      camera.lookAt(0.02, 0.0, 0);
      dust.update(t, 2.2, 12, ctx.H);
    },
    post: (t, lt) => ({ dof: { focus: 2.2, aperture: 12, maxBlur: 16 }, bloom: { strength: 0.55, radius: 0.6, threshold: 1.3 }, vignette: 0.6,
      tint: [1.06, 1.0, 0.92], lift: [0.008, 0.004, 0.0], fade: smoothstep(0.0, 0.8, lt) }),
    overlay(o, t, lt) {
      const words = ['LIGHTER', 'COOLER', 'STRONGER', 'CHEAPER'];
      const a = env(lt, 3.0, 7.2, 0.4, 0.6);
      o.group(a, () => {
        const xs = [600, 840, 1080, 1340];
        words.forEach((w, i) => {
          const k = clamp((lt - 3.0 - i * 0.45) / 0.5);
          o.text(w, xs[i], 960, { size: 30, weight: 300, tracking: 0.3, align: 'center', alpha: k, color: C.white });
          if (i) o.circle((xs[i] + xs[i - 1]) / 2, 951, 2.5, { fill: C.amber, stroke: false, alpha: k });
        });
      });
    },
  };
}

// ---------------------------------------------------------------- 99.0–108.4  grace
export function buildGrace(ctx) {
  const { scene } = makeStage(ctx, { env: 'warm', envIntensity: 0.6, fog: [0x120a05, 0.07], floorMat: new THREE.MeshStandardMaterial({ color: 0x0c0806, roughness: 0.5 }) });
  scene.background = new THREE.Color(0x070402);
  scene.add(horizonGlow({ intensity: 0.9, color: 0xffc58a }));
  const robot = new Robot();
  scene.add(robot.root);
  const shadow = contactShadow(1.4, 1.2, 0.8);
  scene.add(shadow);
  robot.root.position.set(0.6, 0, -1.6);
  robot.root.rotation.y = -0.38;
  const camera = lens(45, 0.02, 120);
  const sun = spot(scene, ctx, { pos: [-3.5, 4.2, -5.5], target: [0, 1.0, 0], color: 0xffb46a, intensity: 140, angle: 0.45, penumbra: 0.8, far: 20 });
  spot(scene, ctx, { pos: [3, 2, 3.5], target: [0, 1, 0], color: 0xffe6cc, intensity: 10, angle: 0.6, penumbra: 1, shadow: false });
  spot(scene, ctx, { pos: [3.2, 1.2, -2.4], target: [0, 1, 0], color: 0x8fbfff, intensity: 14, angle: 0.6, penumbra: 1, shadow: false });
  for (const [x, z, r] of [[-1.6, -4.0, 1.4], [0.6, -5.2, 1.0], [-3.2, -2.8, 0.9]]) {
    const sh = lightShaft({ radiusTop: 0.2, radiusBottom: r, height: 9, color: 0xffc080, intensity: 0.05 });
    sh.position.set(x, 8.5, z);
    sh.rotation.z = -0.32;
    scene.add(sh);
  }
  const dust = new BokehDust({ count: 600, box: [6, 3.2, 6], center: [0, 1.4, -1.2], size: 2.2, seed: 51, color: 0xffd09a, intensity: 0.9 });
  scene.add(dust.points);
  const WALK_END = 4.4;
  let walkEnd = null, st = {};
  const dir = new THREE.Vector3(Math.sin(-0.38), 0, Math.cos(-0.38));
  return {
    scene, camera,
    update(t, lt) {
      const start = v3(0.6, 0, -1.6);
      if (lt < WALK_END) {
        robot.root.position.copy(start);
        walk(robot, Math.max(0, lt), { speed: 0.42, cycle: 1.25, lift: 0.075, armSwing: 0.28 });
      } else {
        const dEnd = 0.42 * WALK_END;
        if (!walkEnd) {
          robot.root.position.copy(start);
          walk(robot, WALK_END, { speed: 0.42, cycle: 1.25 });
          walkEnd = JSON.parse(JSON.stringify(robot.pose));
          walkEnd.root.pos[2] -= dEnd;
        }
        robot.root.position.copy(start).addScaledVector(dir, dEnd);
        taichi(robot, lt - WALK_END - 0.4, { amp: smoothstep(WALK_END, WALK_END + 1.6, lt) });
        const tai = JSON.parse(JSON.stringify(robot.pose));
        const k = ease.inOutSine(clamp((lt - WALK_END) / 1.3));
        robot.setPose(lerpPose(walkEnd, tai, k));
      }
      const pel = robot.j.pelvis.getWorldPosition(new THREE.Vector3());
      shadow.position.set(pel.x, 0.002, pel.z);
      for (let i = 0; i < robot.actuators.length; i++) robot.setGlow(i, 1.4 + 0.9 * Math.sin(t * 1.7 + i * 0.7));
      // camera: low tracking orbit, rising to the head for "the brain is ready"
      const head = robot.j.head.getWorldPosition(new THREE.Vector3());
      const up = ease.inOutCubic(clamp((lt - 6.0) / 2.6));
      const ang = 0.55 + lt * 0.035;
      const R = 5.0 - 3.6 * up;
      camera.position.set(pel.x + Math.sin(ang) * R, 0.62 + 0.88 * up, pel.z + Math.cos(ang) * R);
      const tgt = v3(pel.x, 0.9, pel.z).lerp(head.clone().add(v3(0, 0.08, 0)), up);
      camera.lookAt(tgt);
      robot.visorMat.color.set(0x9fe9ff).multiplyScalar(3.2 * smoothstep(6.4, 7.4, lt));
      robot.seamMat.color.set(0x9fe9ff).multiplyScalar(1.8 * smoothstep(6.6, 7.6, lt));
      dust.update(t, camera.position.distanceTo(tgt), 18, ctx.H);
      st = { focus: camera.position.distanceTo(tgt) };
    },
    post: (t, lt) => ({ dof: { focus: st.focus || 3.5, aperture: 20, maxBlur: 18 }, bloom: { strength: 0.65, radius: 0.65, threshold: 1.1 }, vignette: 0.6,
      tint: [1.07, 1.0, 0.9], lift: [0.01, 0.005, 0.0], contrast: 1.05, saturation: 1.05 }),
    overlay(o, t, lt) {
      const a = env(lt, 6.7, 9.6, 0.6, 0.5);
      o.group(a, () => {
        o.pad(960, 940, 560, 60, 0.45);
        o.textReveal('THE BRAIN IS READY.', 960, 960, clamp((lt - 6.7) / 0.9), { size: 40, weight: 300, tracking: 0.26, align: 'center' });
      });
    },
  };
}

// ---------------------------------------------------------------- 108.4–118.0  the body is still being built
export function buildFinale(ctx) {
  const { scene } = makeStage(ctx, { env: 'warm', envIntensity: 0.35, fog: [0x140b05, 0.05], floorMat: new THREE.MeshStandardMaterial({ color: 0x0a0705, roughness: 0.4, metalness: 0.2 }) });
  scene.background = new THREE.Color(0x080402);
  scene.add(horizonGlow({ intensity: 1.2, color: 0xffc58a, y: 3 }));
  const robot = new Robot();
  scene.add(robot.root, contactShadow(1.3, 1.1, 0.8));
  robot.root.rotation.y = 0.5;
  const camera = lens(35, 0.02, 120);
  spot(scene, ctx, { pos: [0.5, 3.0, -4.5], target: [0, 1.1, 0], color: 0xffb06a, intensity: 90, angle: 0.5, penumbra: 0.8, far: 20 });
  spot(scene, ctx, { pos: [2.5, 1.6, 3.0], target: [0, 1.1, 0], color: 0xffe2c8, intensity: 6, angle: 0.6, penumbra: 1, shadow: false });
  const dust = new BokehDust({ count: 500, box: [7, 3.5, 6], center: [0, 1.4, -0.5], size: 2.2, seed: 61, color: 0xffcf96, intensity: 0.8 });
  scene.add(dust.points);
  return {
    scene, camera,
    update(t, lt) {
      const lift = ease.inOutSine(clamp((lt - 0.2) / 2.6));
      const open = ease.inOutSine(clamp((lt - 1.6) / 2.0));
      const p = withPose(neutralPose(), {
        root: { pos: [0, -0.02, 0] },
        neck: { pitch: 0.18 * lift, yaw: -0.2 * lift },
        waist: { yaw: -0.08 * lift },
        r: { arm: { flex: 0.1 + 0.85 * lift, abd: 0.12 + 0.1 * lift, rot: 0.0, elbow: 0.3 + 0.75 * lift, wpro: -1.45 * lift, wflex: -0.05, grip: 0.7 - 0.66 * open, thumb: 0.6 - 0.5 * open } },
        l: { arm: { flex: 0.06, abd: 0.12, elbow: 0.3 } },
      });
      robot.setPose(p);
      robot.plantFeet(v3(0.12, ANKLE_H, 0), v3(-0.12, ANKLE_H, 0.03));
      for (let i = 0; i < robot.actuators.length; i++) robot.setGlow(i, 1.6);
      robot.visorMat.color.set(0x9fe9ff).multiplyScalar(2.2);
      const k = ease.inOutSine(clamp(lt / 9.6));
      camera.position.set(-1.25 + 0.45 * k, 0.8 + 0.1 * k, 3.6 - 0.7 * k);
      camera.lookAt(0.05, 1.05, 0);
      dust.update(t, 3.4, 18, ctx.H);
    },
    post: (t, lt) => ({ dof: { focus: 3.4, aperture: 16, maxBlur: 16 }, bloom: { strength: 0.7, radius: 0.7, threshold: 1.0 }, vignette: 0.65,
      tint: [1.08, 1.0, 0.88], lift: [0.01, 0.005, 0.0], exposure: 1 - 0.45 * smoothstep(4.2, 5.4, lt), fade: 1 - smoothstep(8.6, 9.5, lt) }),
    overlay(o, t, lt) {
      const a = env(lt, 0.45, 4.4, 0.6, 0.6);
      o.group(a, () => {
        o.pad(960, 940, 640, 60, 0.45);
        o.textReveal('THE BODY IS STILL BEING BUILT.', 960, 960, clamp((lt - 0.5) / 1.3), { size: 40, weight: 300, tracking: 0.24, align: 'center' });
      });
      const ta = env(lt, 4.6, 9.6, 1.0, 0.9);
      o.group(ta, () => {
        o.pad(960, 520, 820, 150, 0.5);
        o.textReveal('THE HARDEST PART', 960, 548, clamp((lt - 4.6) / 1.2), { size: 96, weight: 200, align: 'center', tracking: 0.38, soft: 6, rise: 0 });
        const k = ease.outCubic(clamp((lt - 5.1) / 0.9));
        o.line(960 - 160 * k, 600, 960 + 160 * k, 600, { w: 1, color: C.dim });
        o.textReveal('ACTUATORS  ·  THE HUMANOID BOTTLENECK', 960, 646, clamp((lt - 5.4) / 1.0), { size: 21, family: 'mono', align: 'center', tracking: 0.32, color: C.dim });
      });
    },
  };
}
