// Procedural motion for the humanoid: walking with planted feet (IK), squats, jumps,
// a flowing tai-chi sequence, plus a thermal-camera override material.
import * as THREE from 'three';
import { neutralPose, withPose, ANKLE_H } from './robot.js';
import { smoothstep, clamp, ease, fract, lerp } from '../core/timeline.js';

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

/**
 * Walk along the robot root's local +Z. Returns the pelvis distance travelled.
 * Feet stay planted during stance (no skating): stride = speed × cycle.
 */
export function walk(robot, time, { speed = 0.55, cycle = 1.15, width = 0.105, lift = 0.07, bob = 0.016, armSwing = 0.32, lean = 0.04, base = null } = {}) {
  const phase = time / cycle;
  const stride = speed * cycle;
  const dist = speed * time;
  const duty = 0.62;
  const p = withPose(base || neutralPose(), {});
  const sw = Math.sin(phase * Math.PI * 2);
  p.root.pos = [0.016 * sw, -0.035 - bob * Math.cos(phase * Math.PI * 4), dist];
  p.root.rot = [lean, 0.06 * sw, -0.02 * sw];
  p.waist.yaw = -0.08 * sw;
  p.neck.yaw = 0.06 * sw;
  for (const [side, off, s] of [['l', 0.0, 1], ['r', 0.5, -1]]) {
    const a = p[side].arm;
    const swing = Math.sin((phase + off) * Math.PI * 2);
    a.flex = 0.05 - armSwing * swing;
    a.elbow = 0.35 + 0.18 * Math.max(0, -swing);
    a.abd = 0.1;
    a.grip = 0.3;
  }
  robot.setPose(p);
  const foot = (off, s) => {
    const u = phase + off, k = Math.floor(u), f = u - k;
    // planted under the pelvis at mid-stance; swing carries it one stride forward
    let z = stride * (k - off + duty / 2), y = ANKLE_H, pitch = 0;
    if (f >= duty) {
      const sN = (f - duty) / (1 - duty);
      z += stride * ease.inOutSine(sN);
      y += lift * Math.sin(Math.PI * sN);
      pitch = 0.25 * Math.sin(Math.PI * sN);
    }
    return { pos: robot.root.localToWorld(v3(s * width, y, z)), pitch };
  };
  robot.root.updateMatrixWorld(true);
  const L = foot(0.0, 1), R = foot(0.5, -1);
  robot.solveLeg('l', L.pos, L.pitch);
  robot.solveLeg('r', R.pos, R.pitch);
  robot.setPose(robot.pose);
  return dist;
}

/** Flowing "cloud hands" sequence: weight shifts, waist turns, hands sweep. */
export function taichi(robot, time, { amp = 1, stance = 0.19, depth = 0.08 } = {}) {
  const ph = time * 0.55;
  const s = Math.sin(ph * Math.PI * 2), c = Math.cos(ph * Math.PI * 2);
  const p = withPose(neutralPose(), {});
  p.root.pos = [0.06 * s * amp, -depth - 0.015 * (1 - Math.abs(s)), 0];
  p.root.rot = [0.02, 0.0, -0.03 * s];
  p.waist.yaw = 0.42 * s * amp;
  p.waist.pitch = 0.04;
  p.neck.yaw = 0.25 * s * amp;
  p.neck.pitch = 0.05;
  // upper hand sweeps at face height, lower hand drifts at hip height, swapping smoothly
  const up = 0.5 + 0.5 * s;       // 1 = left hand high
  for (const [side, w] of [['l', up], ['r', 1 - up]]) {
    const a = p[side].arm;
    a.flex = lerp(0.35, 1.25, w) * amp;
    a.abd = lerp(0.22, 0.35, w);
    a.rot = lerp(0.1, 0.6, w);
    a.elbow = lerp(0.6, 1.25, w);
    a.wflex = lerp(0.1, -0.25, w);
    a.wpro = lerp(0.2, -0.5, w);
    a.grip = 0.12;
    a.thumb = 0.15;
  }
  robot.setPose(p);
  robot.root.updateMatrixWorld(true);
  robot.solveLeg('l', robot.root.localToWorld(v3(stance, ANKLE_H, 0.02)));
  robot.solveLeg('r', robot.root.localToWorld(v3(-stance, ANKLE_H, -0.02)));
  robot.setPose(robot.pose);
}

/** Thermal-camera material: iron palette driven by hot spots in world space. */
export function thermalMaterial(maxSpots = 12) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uHot: { value: Array.from({ length: maxSpots }, () => new THREE.Vector3(0, -99, 0)) },
      uHeat: { value: new Array(maxSpots).fill(0) },
      uSigma: { value: 0.09 }, uBase: { value: 0.12 }, uTime: { value: 0 },
    },
    vertexShader: /* glsl */`
      varying vec3 vW; varying vec3 vN; varying vec3 vV;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */`
      #define N ${maxSpots}
      uniform vec3 uHot[N]; uniform float uHeat[N]; uniform float uSigma, uBase, uTime;
      varying vec3 vW; varying vec3 vN; varying vec3 vV;
      vec3 iron(float t) {
        t = clamp(t, 0.0, 1.0);
        vec3 c0 = vec3(0.02, 0.0, 0.08), c1 = vec3(0.28, 0.02, 0.5), c2 = vec3(0.78, 0.06, 0.4), c3 = vec3(0.98, 0.4, 0.05), c4 = vec3(1.0, 0.82, 0.25), c5 = vec3(1.0, 1.0, 0.92);
        if (t < 0.2) return mix(c0, c1, t / 0.2);
        if (t < 0.4) return mix(c1, c2, (t - 0.2) / 0.2);
        if (t < 0.6) return mix(c2, c3, (t - 0.4) / 0.2);
        if (t < 0.8) return mix(c3, c4, (t - 0.6) / 0.2);
        return mix(c4, c5, (t - 0.8) / 0.2);
      }
      void main() {
        float T = uBase + 0.04 * (vW.y > 1.4 ? 1.0 : 0.0);
        for (int i = 0; i < N; i++) { vec3 d = vW - uHot[i]; T += uHeat[i] * exp(-dot(d, d) / (uSigma * uSigma)); }
        float facing = abs(dot(normalize(vN), normalize(vV)));
        T *= 0.82 + 0.25 * facing;               // emissivity falls off at grazing angles
        if (vW.y < 0.003) T = max(0.0, T - uBase) * 0.5;   // floor: black except heat spill near the feet
        gl_FragColor = vec4(iron(T) * 1.15, 1.0);
      }`,
  });
}
