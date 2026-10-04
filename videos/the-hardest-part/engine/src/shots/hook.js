// 0:00–0:12  HOOK — extreme close-up of an elbow actuator, single continuous pull-back
// to the full robot; the 28 actuator rings ignite in a cascade; title card.
import * as THREE from 'three';
import { Robot, withPose, neutralPose, ANKLE_H } from '../assets/robot.js';
import { makeStage, spot, lens, BokehDust, contactShadow } from './common.js';
import { C, project } from '../core/overlay.js';
import { track, env, ease, smoothstep, clamp, fbm1, invLerp, prog } from '../core/timeline.js';

export function buildHook(ctx) {
  const { scene } = makeStage(ctx, { env: 'studio', envIntensity: 0.5, fog: [0x000000, 0.05] });
  const robot = new Robot({ detail: 1 });
  scene.add(robot.root);
  scene.add(contactShadow(1.2, 1.0, 0.85));

  const base = withPose(neutralPose(), {
    root: { pos: [0, -0.018, 0] },
    r: { arm: { flex: 0.42, abd: 0.28, rot: 0.15, elbow: 1.3, grip: 0.3, thumb: 0.3, wpro: -0.2 } },
    l: { arm: { flex: 0.05, abd: 0.12, elbow: 0.32, grip: 0.3 } },
  });
  const posed = (t) => {
    const elbow = track([[0, 1.18], [5.5, 1.5], [8.0, 1.86], [12.2, 1.95]], t, { smooth: true }) + fbm1(t * 0.6, 2) * 0.02;
    const grip = track([[0, 0.25], [5.8, 0.28], [7.2, 0.95], [12.2, 0.95]], t, { e: ease.inOutCubic });
    const p = withPose(base, {
      r: { arm: { elbow, grip, thumb: 0.3 + grip * 0.6, wflex: -0.1 + 0.15 * smoothstep(5, 8, t), flex: 0.42 + 0.06 * smoothstep(6, 10, t) } },
      waist: { yaw: -0.06 * smoothstep(6, 11, t), pitch: 0.0 },
      neck: { yaw: -0.25 * smoothstep(7.5, 10.5, t), pitch: 0.06 },
      root: { pos: [0, -0.018 + Math.sin(t * 1.3) * 0.002, 0] },
    });
    robot.setPose(p);
    robot.plantFeet(new THREE.Vector3(0.115, ANKLE_H, 0.0), new THREE.Vector3(-0.115, ANKLE_H, 0.02));
  };
  posed(0);

  // elbow frame (static: only the forearm moves)
  const ei = robot.indexOf('r_elbow');
  const E = robot.anchorWorld(ei);
  const q = new THREE.Quaternion();
  robot.j.rElbow.getWorldQuaternion(q);
  const out = new THREE.Vector3(-1, 0, 0).applyQuaternion(q).normalize(); // outer cap normal
  const up = new THREE.Vector3(0, 1, 0);
  const fwd = new THREE.Vector3().crossVectors(out, up).normalize().negate();
  const at = (a, b, c) => E.clone().addScaledVector(out, a).addScaledVector(fwd, b).addScaledVector(up, c).toArray();

  const camera = lens(55, 0.005, 60);
  const posKeys = [
    [0.0, at(0.31, 0.23, 0.085)],
    [4.3, at(0.33, 0.27, 0.11)],
    [7.2, at(1.25, 1.05, 0.3)],
    [9.8, [-2.15, 1.3, 2.75]],
    [12.4, [-2.45, 1.26, 3.15]],
  ];
  const chest = new THREE.Vector3(0, 1.2, 0);
  const tgtKeys = [
    [0.0, at(0.028, -0.004, 0.0)],
    [4.3, at(0.02, -0.01, -0.005)],
    [7.2, E.clone().lerp(chest, 0.5).toArray()],
    [9.8, [0, 0.98, 0]],
    [12.4, [0, 0.95, 0]],
  ];
  const focalKeys = [[0, 100], [4.3, 92], [7.2, 50], [9.8, 42], [12.4, 40]];
  const tv = new THREE.Vector3();

  // lights: a macro key that sweeps across the cap, then a body key for the reveal
  const keyMacro = spot(scene, ctx, { pos: at(0.3, -0.24, -0.06), target: E.toArray(), intensity: 0, angle: 0.45, penumbra: 1.0, near: 0.05, far: 3 });
  const keyBody = spot(scene, ctx, { pos: [-2.2, 3.4, 2.4], target: [0, 1.0, 0], intensity: 0, angle: 0.55, penumbra: 0.8, far: 12 });
  const rimL = spot(scene, ctx, { pos: [2.4, 2.4, -2.6], target: [0, 1.1, 0], color: 0x9cc8ff, intensity: 70, angle: 0.6, penumbra: 1, shadow: false });
  const rimR = spot(scene, ctx, { pos: [-2.6, 2.0, -2.2], target: [0, 1.1, 0], color: 0xffd2a8, intensity: 40, angle: 0.6, penumbra: 1, shadow: false });

  const dustMacro = new BokehDust({ count: 220, box: [0.5, 0.35, 0.5], center: at(0.2, 0.14, 0.05), size: 0.5, seed: 11, intensity: 0.8 });
  const dustBody = new BokehDust({ count: 360, box: [4, 2.6, 4], center: [0, 1.3, 0.4], size: 2.4, seed: 5, intensity: 0.7 });
  scene.add(dustMacro.points, dustBody.points);

  // ignition order: distance from the elbow
  const order = robot.actuators.map((a, i) => ({ i, d: robot.anchorWorld(i).distanceTo(E) })).sort((a, b) => a.d - b.d);
  const igniteAt = new Map(order.map(({ i, d }) => [i, 9.0 + d * 1.05]));

  let dof = { focus: 0.1, aperture: 6, maxBlur: 22 };
  let callout = null;

  return {
    scene, camera,
    update(t, lt) {
      posed(lt);
      const tg = (() => {
        const p = track(posKeys, lt, { smooth: true });
        camera.position.set(...p);
        const g = track(tgtKeys, lt, { smooth: true });
        tv.set(...g);
        camera.lookAt(tv);
        camera.setFocalLength(track(focalKeys, lt, { e: ease.inOutSine }));
        camera.updateMatrixWorld();
        return tv;
      })();
      // light sweep + crossfade
      const sweep = ease.inOutSine(clamp(lt / 4.2));
      keyMacro.position.copy(E).addScaledVector(out, 0.3).addScaledVector(fwd, -0.55 + 0.6 * sweep).addScaledVector(up, 0.16 - 0.42 * sweep);
      keyMacro.target.position.copy(E).addScaledVector(out, 0.03);
      keyMacro.intensity = (0.75 + 0.35 * smoothstep(3.2, 4.4, lt)) * smoothstep(0.0, 1.6, lt) * (1 - smoothstep(6.0, 8.5, lt));
      scene.environmentIntensity = 0.5 + 0.5 * (1 - smoothstep(4.5, 8, lt));
      keyBody.intensity = 26 * smoothstep(5.0, 8.5, lt);
      rimL.intensity = 6 + 22 * smoothstep(5, 9, lt);
      rimR.intensity = 4 + 14 * smoothstep(5, 9, lt);
      // focus: rack across the grooves early, then follow the subject
      const dist = camera.position.distanceTo(tg);
      const rack = lt < 4.3 ? (1 + 0.18 * Math.sin(lt * 0.9 + 0.6)) : 1;
      dof = {
        focus: dist * rack,
        aperture: track([[0, 16], [4.3, 18], [7.2, 18], [9.8, 22], [12.4, 20]], lt, { smooth: true }),
        maxBlur: 24,
      };
      dustMacro.update(t, dof.focus, dof.aperture * 1.2, ctx.H);
      dustBody.update(t, dof.focus, dof.aperture * 1.2, ctx.H);
      dustMacro.mat.uniforms.uOpacity.value = 1 - smoothstep(4.5, 7, lt);
      dustBody.mat.uniforms.uOpacity.value = smoothstep(5, 8, lt);
      // rings: ignite cascade, elbow pre-glows softly from the start
      for (let i = 0; i < robot.actuators.length; i++) {
        const ta = igniteAt.get(i);
        let v = 0;
        if (i === ei) v = 0.8 + 0.5 * smoothstep(1.2, 3.0, lt);
        if (lt > ta) { const k = lt - ta; v = Math.max(v, 2.6 + 6 * Math.exp(-k * 5)); }
        robot.setGlow(i, v);
      }
      callout = project(robot.anchorWorld(ei).addScaledVector(out, 0.045), camera);
    },
    post(t, lt) {
      return {
        exposure: 1.0 + 0.1 * smoothstep(8.8, 9.6, lt), fade: smoothstep(0.0, 1.6, lt),
        bloom: { strength: 0.45, radius: 0.5, threshold: 1.8 },
        dof, vignette: 0.65, grain: 0.04, ca: 0.003, contrast: 1.06,
        lift: [0.0, 0.004, 0.01], gain: [0.98, 1.0, 1.03],
      };
    },
    overlay(o, t, lt) {
      // hook line (sound-off viewers)
      const a = env(lt, 1.3, 5.0, 0.3, 0.6);
      if (a > 0) o.group(a, () => {
        o.pad(960, 948, 640, 60, 0.5);
        o.words('This is the hardest part of the robot.', 960, 962, lt, 1.45, 0.24, { size: 40, weight: 300, align: 'center', tracking: 0.01, color: C.white });
      });
      // live telemetry callout on the elbow
      const ca = env(lt, 2.2, 6.4, 0.2, 0.6);
      if (ca > 0 && callout && !callout.behind) {
        const ang = track([[0, 1.18], [5.5, 1.5], [8.0, 1.86]], lt, { smooth: true });
        const tau = (1.6 * 0.14) * 9.81 * Math.sin(Math.PI - ang - 0.42);
        o.group(ca, () => o.callout(callout.x, callout.y, {
          dx: 150, dy: -110, shelf: 230, progress: clamp((lt - 2.2) / 1.2), color: C.cyan,
          lines: [
            { text: 'R ELBOW · J07', color: C.cyan, size: 17 },
            { text: `θ  ${(ang * 57.2958).toFixed(1)}°`, size: 22, family: 'mono', color: C.white },
            { text: `τ  ${Math.abs(tau).toFixed(2)} N·m`, size: 22, family: 'mono', color: C.white },
            { text: `T  ${(38.2 + lt * 0.11).toFixed(1)} °C`, size: 22, family: 'mono', color: C.white },
          ],
        }));
      }
      // title card
      const ta = env(lt, 10.0, 13.0, 0.9, 0.7);
      if (ta > 0) o.group(ta, () => {
        o.pad(960, 520, 820, 150, 0.45);
        o.textReveal('THE HARDEST PART', 960, 548, clamp((lt - 10.0) / 1.1), { size: 96, weight: 200, align: 'center', tracking: 0.38, soft: 6, rise: 0 });
        o.line(960 - 160 * ease.outCubic(clamp((lt - 10.5) / 0.8)), 600, 960 + 160 * ease.outCubic(clamp((lt - 10.5) / 0.8)), 600, { w: 1, color: C.dim });
        o.textReveal('ACTUATORS  ·  THE HUMANOID BOTTLENECK', 960, 646, clamp((lt - 10.8) / 1.0), { size: 21, family: 'mono', align: 'center', tracking: 0.32, color: C.dim });
      });
    },
  };
}
