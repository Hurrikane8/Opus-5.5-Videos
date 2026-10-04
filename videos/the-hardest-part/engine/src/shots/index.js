// Master shot list (times in seconds, matched to script/cues.json).
import * as THREE from 'three';
import { buildHook } from './hook.js';
import { buildDefine, buildFamily, buildElectric, buildTwentyEight } from './what.js';
import { buildMotor, buildGear, buildEncoder, buildMuscle, buildHeat } from './physics.js';
import { buildSpiral, buildThermal, buildImpact, buildFeel, buildMillions, buildCopied } from './bottleneck.js';
import { buildSolved, buildGrace, buildFinale } from './closing.js';
import { C } from '../core/overlay.js';

function slate(label) {
  return () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 10);
    return { scene, camera, update() {}, overlay(o, t) { o.text(label, 960, 540, { size: 40, align: 'center', color: C.dim, family: 'mono' }); o.text(t.toFixed(2), 960, 600, { size: 24, align: 'center', color: C.faint, family: 'mono' }); } };
  };
}

export const SHOTS = [
  { id: 'hook', start: 0.0, end: 12.2, build: buildHook },
  { id: 'define', start: 12.2, end: 17.2, build: buildDefine, transitionIn: { type: 'dissolve', dur: 0.8 } },
  { id: 'family', start: 17.2, end: 27.6, build: buildFamily },
  { id: 'electric', start: 27.6, end: 30.2, build: buildElectric },
  { id: 'twentyeight', start: 30.2, end: 35.0, build: buildTwentyEight },
  { id: 'motor', start: 35.0, end: 46.2, build: buildMotor, transitionIn: { type: 'dissolve', dur: 0.5 } },
  { id: 'gear', start: 46.2, end: 49.6, build: buildGear },
  { id: 'encoder', start: 49.6, end: 54.2, build: buildEncoder },
  { id: 'muscle', start: 54.2, end: 60.2, build: buildMuscle },
  { id: 'heat', start: 60.2, end: 65.6, build: buildHeat },
  { id: 'spiral', start: 65.6, end: 72.4, build: buildSpiral },
  { id: 'thermal', start: 72.4, end: 75.6, build: buildThermal },
  { id: 'impact', start: 75.6, end: 79.0, build: buildImpact },
  { id: 'feel', start: 79.0, end: 82.4, build: buildFeel },
  { id: 'millions', start: 82.4, end: 87.4, build: buildMillions },
  { id: 'copied', start: 87.4, end: 92.0, build: buildCopied },
  { id: 'solved', start: 92.0, end: 99.0, build: buildSolved },
  { id: 'grace', start: 99.0, end: 108.4, build: buildGrace, transitionIn: { type: 'dissolve', dur: 1.2 } },
  { id: 'finale', start: 108.4, end: 118.0, build: buildFinale, transitionIn: { type: 'dissolve', dur: 0.9 } },
];
