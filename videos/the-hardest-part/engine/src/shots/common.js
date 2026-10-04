// Shared stage / lighting / camera / FX building blocks for shots.
import * as THREE from 'three';
import { M } from '../core/materials.js';
import { track, ease, rng } from '../core/timeline.js';

export function makeStage(ctx, { env = 'studio', envIntensity = 0.8, fog = null, floor = true, floorY = 0, floorSize = 60, floorMat = null } = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  scene.environment = ctx.env[env];
  scene.environmentIntensity = envIntensity;
  if (fog) scene.fog = new THREE.FogExp2(fog[0], fog[1]);
  let floorMesh = null;
  if (floor) {
    floorMesh = new THREE.Mesh(new THREE.CircleGeometry(floorSize, 64), floorMat || M.floor);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = floorY;
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);
  }
  return { scene, floor: floorMesh };
}

export function spot(scene, ctx, { pos, target = [0, 1, 0], color = 0xffffff, intensity = 60, angle = 0.5, penumbra = 0.7, shadow = true, distance = 0, decay = 2, bias = -0.0004, near = 0.3, far = 20 } = {}) {
  const l = new THREE.SpotLight(color, intensity, distance, angle, penumbra, decay);
  l.position.set(...pos);
  l.target.position.set(...target);
  scene.add(l, l.target);
  if (shadow) {
    l.castShadow = true;
    l.shadow.mapSize.set(ctx.Q.shadow, ctx.Q.shadow);
    l.shadow.bias = bias;
    l.shadow.normalBias = 0.01;
    l.shadow.camera.near = near;
    l.shadow.camera.far = far;
    l.shadow.radius = 4;
  }
  return l;
}

export function dirLight(scene, { pos, target = [0, 0, 0], color = 0xffffff, intensity = 2 } = {}) {
  const l = new THREE.DirectionalLight(color, intensity);
  l.position.set(...pos);
  l.target.position.set(...target);
  scene.add(l, l.target);
  return l;
}

/** Camera driven by keyframed position / target / focal length tracks (Catmull-Rom smoothed). */
export function camRig(camera, { pos, target, focal = null, roll = null, smooth = true, e = ease.inOutCubic } = {}) {
  const tv = new THREE.Vector3();
  return {
    update(lt, extra = {}) {
      const p = track(pos, lt, { smooth, e });
      camera.position.set(p[0], p[1], p[2]);
      const tg = track(target, lt, { smooth, e });
      tv.set(tg[0], tg[1], tg[2]);
      if (extra.offset) { camera.position.add(extra.offset); }
      camera.up.set(0, 1, 0);
      camera.lookAt(tv);
      if (roll) camera.rotateZ(track(roll, lt, { smooth }));
      if (focal) { camera.setFocalLength(track(focal, lt, { smooth: false, e })); }
      camera.updateMatrixWorld();
      return tv;
    },
  };
}

export function lens(mm = 50, near = 0.01, far = 200) {
  const c = new THREE.PerspectiveCamera(30, 16 / 9, near, far);
  c.filmGauge = 36;
  c.setFocalLength(mm);
  return c;
}

// ------------------------------------------------------------------ FX

/** Floating dust with fake per-particle bokeh (size grows with defocus). */
export class BokehDust {
  constructor({ count = 400, box = [2, 2, 2], center = [0, 1, 0], color = 0xcfe8ff, size = 2.2, seed = 3, intensity = 1.2 } = {}) {
    const r = rng(seed);
    const pos = new Float32Array(count * 3), seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = center[0] + (r() - 0.5) * box[0];
      pos[i * 3 + 1] = center[1] + (r() - 0.5) * box[1];
      pos[i * 3 + 2] = center[2] + (r() - 0.5) * box[2];
      seeds[i] = r();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uFocus: { value: 1 }, uAperture: { value: 0 }, uSize: { value: size }, uScale: { value: 1 },
        uColor: { value: new THREE.Color(color).multiplyScalar(intensity) }, uOpacity: { value: 1 } },
      vertexShader: /* glsl */`
        attribute float aSeed; uniform float uTime, uFocus, uAperture, uSize, uScale; varying float vA; varying float vS;
        void main() {
          vec3 p = position;
          float s = aSeed * 6.2831;
          p += vec3(sin(uTime * 0.17 + s) * 0.05, sin(uTime * 0.11 + s * 2.0) * 0.04 + uTime * 0.006, cos(uTime * 0.13 + s * 3.0) * 0.05);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          float z = max(-mv.z, 0.01);
          float coc = uAperture * abs(1.0 / uFocus - 1.0 / z);
          float sz = (uSize * (0.5 + aSeed)) * (1.0 / z) * 0.6 + coc;
          gl_PointSize = clamp(sz, 1.0, 90.0) * uScale;
          vA = (0.35 + 0.65 * fract(aSeed * 13.7)) / (1.0 + coc * coc * 0.012);
          vS = sz;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uColor; uniform float uOpacity; varying float vA; varying float vS;
        void main() {
          vec2 c = gl_PointCoord - 0.5; float d = length(c) * 2.0;
          if (d > 1.0) discard;
          float disk = smoothstep(1.0, 0.82, d);
          float rim = smoothstep(0.7, 0.95, d) * disk * clamp((vS - 6.0) / 20.0, 0.0, 1.0);
          float core = vS < 6.0 ? exp(-d * d * 3.0) : disk * 0.55 + rim * 0.6;
          gl_FragColor = vec4(uColor * core * vA * uOpacity, 1.0);
        }`,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    if (new URLSearchParams(location.search).has('nodust')) this.points.visible = false;
  }
  update(t, focus, aperture, H) {
    const u = this.mat.uniforms;
    u.uTime.value = t; u.uFocus.value = focus; u.uAperture.value = aperture * (H / 1080); u.uScale.value = H / 1080;
  }
}

/** Additive material with dashes flowing along the tube's U coordinate (current, flux, energy). */
export function flowMaterial({ color = 0x6fe3ff, intensity = 3, dashes = 8, speed = 1, duty = 0.35, base = 0.15 } = {}) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uIntensity: { value: intensity }, uDashes: { value: dashes },
      uSpeed: { value: speed }, uDuty: { value: duty }, uBase: { value: base }, uReveal: { value: 1 }, uOffset: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uIntensity, uDashes, uSpeed, uDuty, uBase, uReveal, uOffset; uniform vec3 uColor; varying vec2 vUv;
      void main() {
        if (vUv.x > uReveal) discard;
        float d = fract(vUv.x * uDashes - uTime * uSpeed + uOffset);
        float a = smoothstep(0.0, uDuty * 0.3, d) * smoothstep(uDuty, uDuty * 0.5, d);
        float head = smoothstep(uReveal - 0.02, uReveal, vUv.x) * step(uReveal, 0.999);
        float ends = smoothstep(0.0, 0.03, vUv.x) * smoothstep(1.0, 0.97, vUv.x);
        gl_FragColor = vec4(uColor * uIntensity * (uBase + a + head * 2.0) * ends, 1.0);
      }`,
  });
}

/** Soft volumetric light shaft (additive cone, fades with distance and at silhouette). */
export function lightShaft({ radiusTop = 0.05, radiusBottom = 1.2, height = 5, color = 0xffffff, intensity = 0.08 } = {}) {
  const g = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 48, 1, true);
  g.translate(0, -height / 2, 0);
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color(color) }, uIntensity: { value: intensity }, uHeight: { value: height } },
    vertexShader: `varying float vY; varying vec3 vN; varying vec3 vV;
      void main(){ vY = position.y; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uIntensity, uHeight; varying float vY; varying vec3 vN; varying vec3 vV;
      void main(){ float f = pow(abs(dot(vN, vV)), 2.0); float along = smoothstep(-uHeight, -uHeight*0.1, vY) * smoothstep(0.0, -uHeight*0.08, vY);
        float fall = 1.0 - (-vY / uHeight) * 0.6; gl_FragColor = vec4(uColor * uIntensity * f * along * fall, 1.0); }`,
  });
  return new THREE.Mesh(g, m);
}

/** Ring of light expanding on the floor (impact shock). */
export function shockRing(color = 0xbfe8ff) {
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uR: { value: 0 }, uW: { value: 0.05 }, uI: { value: 0 }, uColor: { value: new THREE.Color(color) } },
    vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform float uR, uW, uI; uniform vec3 uColor; varying vec2 vP;
      void main(){ float d = length(vP); float a = exp(-pow((d - uR) / uW, 2.0)); gl_FragColor = vec4(uColor * a * uI, 1.0); }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), m);
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

/** Soft blob contact shadow (cheap ambient occlusion under objects). */
export function contactShadow(w = 1, d = 1, opacity = 0.7) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, `rgba(0,0,0,${opacity})`);
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.002;
  return m;
}
