// Look-dev shots (not part of the film): ?only=turntable&t=<angle index>
import * as THREE from 'three';
import { Robot, neutralPose, withPose, ANKLE_H } from '../assets/robot.js';
import { makeStage, spot, lens, contactShadow } from './common.js';
import { C } from '../core/overlay.js';

function turntable(ctx) {
  const { scene } = makeStage(ctx, { env: 'studio', envIntensity: 0.7 });
  const robot = new Robot();
  scene.add(robot.root, contactShadow(1.2, 1.0, 0.8));
  const camera = lens(35, 0.05, 50);
  spot(scene, ctx, { pos: [-2.2, 3.6, 3.0], target: [0, 1, 0], intensity: 40, angle: 0.5, penumbra: 0.8 });
  spot(scene, ctx, { pos: [2.6, 2.4, -2.6], target: [0, 1.1, 0], color: 0x9cc8ff, intensity: 30, angle: 0.6, penumbra: 1, shadow: false });
  const poses = [
    withPose(neutralPose(), {}),
    withPose(neutralPose(), { r: { arm: { flex: 0.6, abd: 0.3, elbow: 1.5, grip: 0.95, thumb: 0.9 } }, l: { arm: { flex: -0.3, elbow: 0.4, grip: 0.0, thumb: 0.0 } } }),
  ];
  return {
    scene, camera,
    update(t) {
      const i = Math.floor(t) % 8;
      const ang = [0, 0.8, Math.PI / 2, Math.PI, -0.8, 0.5, 0, -0.5][i];
      robot.setPose(poses[i >= 5 ? 1 : 0]);
      robot.plantFeet(new THREE.Vector3(0.11, ANKLE_H, 0), new THREE.Vector3(-0.11, ANKLE_H, 0));
      const close = i >= 5;
      const d = close ? 1.2 : 3.6, y = close ? 1.3 : 0.92;
      camera.position.set(Math.sin(ang) * d, y + (close ? 0.1 : 0.15), Math.cos(ang) * d);
      camera.lookAt(0, y, 0);
      robot.setAllGlow(1.5);
    },
    post: { exposure: 1.0 },
    overlay(o, t) { o.text(`turntable ${Math.floor(t) % 8}`, 60, 60, { family: 'mono', size: 18, color: C.dim }); },
  };
}

export const DEBUG_SHOTS = [{ id: 'turntable', start: 0, end: 1e9, build: turntable }];
