// Film post pipeline:
//   scene (HDR, linear) ─► bokeh DOF ─► weighted accumulation (motion blur + dissolves)
//   ─► bloom ─► grade (ACES, lift/gamma/gain, CA, vignette, grain) + 2D overlay ─► screen
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// Single-pass "scatter-as-gather" bokeh (after Dennis Gustafsson), golden-angle spiral.
const DOF_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 resolution;
uniform float cameraNear, cameraFar;
uniform float focus;      // focus distance (world units)
uniform float aperture;   // CoC scale (px * world units)
uniform float maxBlur;    // px
uniform float radScale;   // spiral step (smaller = more samples)
const float GOLDEN = 2.39996323;
float viewZ(float d) {
  float z = d * 2.0 - 1.0;
  return 2.0 * cameraNear * cameraFar / (cameraFar + cameraNear - z * (cameraFar - cameraNear));
}
float coc(float z) { return clamp(aperture * abs(1.0 / focus - 1.0 / z), 0.0, maxBlur); }
void main() {
  vec2 px = 1.0 / resolution;
  float zc = viewZ(texture2D(tDepth, vUv).r);
  float cc = coc(zc);
  vec3 col = texture2D(tColor, vUv).rgb;
  float tot = 1.0;
  float radius = radScale;
  float ang = 0.0;
  for (int i = 0; i < 160; i++) {
    if (radius >= maxBlur) break;
    vec2 tc = vUv + vec2(cos(ang), sin(ang)) * px * radius;
    vec3 sc = texture2D(tColor, tc).rgb;
    float sz = viewZ(texture2D(tDepth, tc).r);
    float ss = coc(sz);
    if (sz > zc) ss = clamp(ss, 0.0, cc * 2.0);
    float m = smoothstep(radius - 0.5, radius + 0.5, ss);
    col += mix(col / tot, sc, m);
    tot += 1.0;
    radius += radScale / radius;
    ang += GOLDEN;
  }
  gl_FragColor = vec4(col / tot, 1.0);
}`;

const ACCUM_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tSrc;
uniform float weight;
void main() { gl_FragColor = vec4(texture2D(tSrc, vUv).rgb * weight, weight); }`;

const FINAL_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tHDR;
uniform sampler2D tOverlay;
uniform vec2 resolution;
uniform float exposure, saturation, contrast, vignette, grain, ca, time, fade, letterbox, overlayOpacity, fxaa;
uniform vec3 lift, gammaV, gain, tint;

vec3 RRTAndODTFit(vec3 v) {
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}
vec3 aces(vec3 c) {   // Stephen Hill's fitted ACES
  const mat3 IN = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
  const mat3 OUT = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
  return clamp(OUT * RRTAndODTFit(IN * c), 0.0, 1.0);
}
vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
float hash(vec2 p) { p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }

vec3 hdrAt(vec2 uv) {
  if (ca <= 0.0) return texture2D(tHDR, uv).rgb;
  vec2 d = (uv - 0.5) * ca;
  return vec3(texture2D(tHDR, uv - d).r, texture2D(tHDR, uv).g, texture2D(tHDR, uv + d).b);
}
vec3 grade(vec3 c) {
  c *= exposure * tint;
  c = aces(c);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, saturation);
  c = (c - 0.5) * contrast + 0.5;
  c = clamp(c, 0.0, 1.0);
  c = gain * (c + lift * (1.0 - c));             // lift / gain
  c = pow(max(c, 0.0), 1.0 / gammaV);            // gamma
  return clamp(c, 0.0, 1.0);
}
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

void main() {
  vec2 uv = vUv;
  vec3 c = grade(hdrAt(uv));
  if (fxaa > 0.5) {  // light FXAA on graded signal
    vec2 px = 1.0 / resolution;
    vec3 nw = grade(texture2D(tHDR, uv + vec2(-1.0, -1.0) * px).rgb);
    vec3 ne = grade(texture2D(tHDR, uv + vec2(1.0, -1.0) * px).rgb);
    vec3 sw = grade(texture2D(tHDR, uv + vec2(-1.0, 1.0) * px).rgb);
    vec3 se = grade(texture2D(tHDR, uv + vec2(1.0, 1.0) * px).rgb);
    float lNW = luma(nw), lNE = luma(ne), lSW = luma(sw), lSE = luma(se), lM = luma(c);
    float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
    float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
    vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));
    float red = max((lNW + lNE + lSW + lSE) * 0.03125, 0.0078125);
    float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + red);
    dir = clamp(dir * rcp, -8.0, 8.0) * px;
    vec3 a = 0.5 * (grade(texture2D(tHDR, uv + dir * (1.0 / 3.0 - 0.5)).rgb) + grade(texture2D(tHDR, uv + dir * (2.0 / 3.0 - 0.5)).rgb));
    vec3 b = a * 0.5 + 0.25 * (grade(texture2D(tHDR, uv - dir * 0.5).rgb) + grade(texture2D(tHDR, uv + dir * 0.5).rgb));
    float lB = luma(b);
    c = (lB < lMin || lB > lMax) ? a : b;
  }
  // vignette (optical falloff)
  vec2 q = uv - 0.5; q.x *= resolution.x / resolution.y;
  c *= mix(1.0, smoothstep(1.25, 0.25, length(q)), vignette);
  // overlay (straight alpha, display space)
  vec4 o = texture2D(tOverlay, uv);
  c = mix(c, o.rgb, clamp(o.a * overlayOpacity, 0.0, 1.0));
  c *= fade;
  // film grain, strongest in mid-tones
  float n = hash(uv * resolution + fract(time * 17.13) * 1000.0) - 0.5;
  float l = luma(c);
  c += n * grain * (1.0 - abs(l - 0.45) * 1.4);
  // letterbox
  float lb = letterbox * 0.5;
  if (uv.y < lb || uv.y > 1.0 - lb) c = vec3(0.0);
  vec3 outc = toSRGB(clamp(c, 0.0, 1.0));
  outc += (hash(uv * resolution * 1.37 + 3.1) - 0.5) / 255.0;  // dither
  gl_FragColor = vec4(outc, 1.0);
}`;

export const DEFAULT_POST = {
  exposure: 1.0,
  bloom: { strength: 0.4, radius: 0.45, threshold: 1.6 },
  dof: null, // { focus, aperture, maxBlur }
  saturation: 1.0, contrast: 1.04,
  lift: [0.0, 0.0, 0.0], gamma: [1.0, 1.0, 1.0], gain: [1.0, 1.0, 1.0], tint: [1.0, 1.0, 1.0],
  vignette: 0.55, grain: 0.035, ca: 0.0025, fade: 1.0, letterbox: 0.0, overlayOpacity: 1.0,
};

export class Post {
  constructor(renderer, width, height, opts = {}) {
    this.renderer = renderer;
    this.w = width; this.h = height;
    this.opts = { msaa: 0, dofRadScale: 1.0, fxaa: true, ...opts };
    const hf = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, colorSpace: THREE.LinearSRGBColorSpace };
    const depthTexture = new THREE.DepthTexture(width, height);
    depthTexture.type = THREE.UnsignedIntType;
    this.rtScene = new THREE.WebGLRenderTarget(width, height, { ...hf, samples: this.opts.msaa, depthTexture });
    this.rtDof = new THREE.WebGLRenderTarget(width, height, hf);
    this.rtAccum = new THREE.WebGLRenderTarget(width, height, hf);

    this.dofMat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: DOF_FRAG, depthTest: false, depthWrite: false,
      uniforms: {
        tColor: { value: this.rtScene.texture }, tDepth: { value: depthTexture },
        resolution: { value: new THREE.Vector2(width, height) }, cameraNear: { value: 0.1 }, cameraFar: { value: 100 },
        focus: { value: 5 }, aperture: { value: 0 }, maxBlur: { value: 1 }, radScale: { value: this.opts.dofRadScale },
      },
    });
    this.accumMat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: ACCUM_FRAG, depthTest: false, depthWrite: false, transparent: true,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
      uniforms: { tSrc: { value: null }, weight: { value: 1 } },
    });
    this.finalMat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FINAL_FRAG, depthTest: false, depthWrite: false,
      uniforms: {
        tHDR: { value: this.rtAccum.texture }, tOverlay: { value: null }, resolution: { value: new THREE.Vector2(width, height) },
        exposure: { value: 1 }, saturation: { value: 1 }, contrast: { value: 1 }, vignette: { value: 0.5 }, grain: { value: 0.03 },
        ca: { value: 0 }, time: { value: 0 }, fade: { value: 1 }, letterbox: { value: 0 }, overlayOpacity: { value: 1 },
        fxaa: { value: this.opts.fxaa ? 1 : 0 },
        lift: { value: new THREE.Vector3() }, gammaV: { value: new THREE.Vector3(1, 1, 1) }, gain: { value: new THREE.Vector3(1, 1, 1) },
        tint: { value: new THREE.Vector3(1, 1, 1) },
      },
    });
    this.quad = new FullScreenQuad(this.dofMat);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.6, 0.5, 0.85);
  }

  beginFrame() {
    const r = this.renderer;
    r.setRenderTarget(this.rtAccum);
    r.setClearColor(0x000000, 0);
    r.clear(true, true, true);
  }

  /** Render one shot sample and add it into the accumulation buffer with the given weight. */
  addShot(shot, weight, post) {
    const r = this.renderer;
    r.setRenderTarget(this.rtScene);
    r.setClearColor(shot.clearColor ?? 0x000000, 1);
    r.clear(true, true, true);
    if (shot.render) shot.render(r, this.rtScene);
    else r.render(shot.scene, shot.camera);

    let src = this.rtScene.texture;
    const dof = post.dof;
    if (dof && dof.aperture > 0) {
      const cam = shot.dofCamera || shot.camera;
      const u = this.dofMat.uniforms;
      u.cameraNear.value = cam.near; u.cameraFar.value = cam.far;
      u.focus.value = dof.focus; u.aperture.value = dof.aperture * (this.w / 1920);
      u.maxBlur.value = (dof.maxBlur ?? 18) * (this.w / 1920);
      this.quad.material = this.dofMat;
      r.setRenderTarget(this.rtDof);
      this.quad.render(r);
      src = this.rtDof.texture;
    }
    this.accumMat.uniforms.tSrc.value = src;
    this.accumMat.uniforms.weight.value = weight;
    this.quad.material = this.accumMat;
    r.setRenderTarget(this.rtAccum);
    const autoClear = r.autoClear;
    r.autoClear = false;          // accumulate: never clear between sub-frames / dissolve layers
    this.quad.render(r);
    r.autoClear = autoClear;
  }

  finish(post, overlayTexture, time) {
    const r = this.renderer;
    const b = post.bloom;
    if (b && b.strength > 0) {
      this.bloom.strength = b.strength; this.bloom.radius = b.radius; this.bloom.threshold = b.threshold;
      this.bloom.render(r, null, this.rtAccum, 0, false);
    }
    const u = this.finalMat.uniforms;
    u.tOverlay.value = overlayTexture;
    u.exposure.value = post.exposure; u.saturation.value = post.saturation; u.contrast.value = post.contrast;
    u.vignette.value = post.vignette; u.grain.value = post.grain; u.ca.value = post.ca; u.time.value = time;
    u.fade.value = post.fade; u.letterbox.value = post.letterbox; u.overlayOpacity.value = post.overlayOpacity;
    u.lift.value.fromArray(post.lift); u.gammaV.value.fromArray(post.gamma); u.gain.value.fromArray(post.gain);
    u.tint.value.fromArray(post.tint);
    this.quad.material = this.finalMat;
    r.setRenderTarget(null);
    this.quad.render(r);
  }
}

/** Blend two post-parameter sets (used for dissolves between shots). */
export function mixPost(a, b, k) {
  const out = {};
  for (const key of Object.keys(DEFAULT_POST)) {
    const va = a[key], vb = b[key];
    if (key === 'dof') continue;
    if (Array.isArray(va)) out[key] = va.map((x, i) => x + (vb[i] - x) * k);
    else if (va && typeof va === 'object') out[key] = Object.fromEntries(Object.keys(va).map((kk) => [kk, va[kk] + (vb[kk] - va[kk]) * k]));
    else out[key] = va + (vb - va) * k;
  }
  return out;
}

export function resolvePost(p) {
  const out = { ...DEFAULT_POST, ...p };
  out.bloom = { ...DEFAULT_POST.bloom, ...(p.bloom || {}) };
  return out;
}
