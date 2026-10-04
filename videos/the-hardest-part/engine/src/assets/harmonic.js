// Strain-wave (harmonic) gear, axis +Z. Kinematically faithful:
//   circular spline (fixed, 102 internal teeth), flexspline (100 external teeth, output),
//   elliptical wave generator (input). Ratio = Nf / (Nc − Nf) = 50 : 1, output counter-rotates.
// The flexspline is deformed per frame: radial deflection w = m·cos 2(φ − α), coning to the cup.
import * as THREE from 'three';
import { M, glow } from '../core/materials.js';
import { gearOutline, lathe } from '../core/geo.js';

export const HD = { Nc: 102, Nf: 100, rc: 1.0 };
HD.m = (2 * HD.rc) / HD.Nc;       // module
HD.rf = (HD.m * HD.Nf) / 2;        // flexspline pitch radius
HD.ratio = HD.Nf / (HD.Nc - HD.Nf);

export class HarmonicDrive {
  constructor({ detail = 1, cupLength = 0.55 } = {}) {
    const { Nc, Nf, rc, m, rf } = HD;
    this.group = new THREE.Group();
    const ppt = detail >= 1 ? 10 : 6;

    // circular spline: thick ring with internal teeth
    const cs = new THREE.Shape();
    cs.absarc(0, 0, 1.22, 0, Math.PI * 2, false);
    const csHole = new THREE.Path(gearOutline(Nc, rc + 1.15 * m, rc - 0.95 * m, ppt, Math.PI / Nc).reverse());
    cs.holes.push(csHole);
    const csG = new THREE.ExtrudeGeometry(cs, { depth: 0.22, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.008, bevelSegments: 1, curveSegments: 128 });
    csG.translate(0, 0, -0.11);
    this.circular = new THREE.Mesh(csG, M.darkSteel);
    this.circular.castShadow = this.circular.receiveShadow = true;
    this.group.add(this.circular);
    // bolt holes ring (decor)
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.012, 16), M.chrome);
      b.rotation.x = Math.PI / 2;
      b.position.set(Math.cos(a) * 1.13, Math.sin(a) * 1.13, 0.116);
      this.group.add(b);
    }

    // flexspline: toothed thin band + cup (deformed on CPU)
    const fs = new THREE.Shape(gearOutline(Nf, rf - 1.1 * m, rf + 0.9 * m, ppt, 0));
    const wall = 0.035;
    fs.holes.push(new THREE.Path().absarc(0, 0, rf - 1.1 * m - wall, 0, Math.PI * 2, true));
    const band = new THREE.ExtrudeGeometry(fs, { depth: 0.2, bevelEnabled: false, curveSegments: 128 });
    band.translate(0, 0, -0.1);
    const rIn = rf - 1.1 * m - wall;
    const cup = lathe([[rf - 1.1 * m, -0.1], [rf - 1.1 * m, -0.1 - cupLength], [0.25, -0.1 - cupLength - 0.04], [0.25, -0.1 - cupLength - 0.08], [rIn, -0.1 - cupLength + 0.02], [rIn, -0.1]], 160);
    cup.rotateX(Math.PI / 2);
    this.flexBand = new THREE.Mesh(band, M.steel);
    this.flexCup = new THREE.Mesh(cup, M.steel);
    this.flex = new THREE.Group();
    this.flex.add(this.flexBand, this.flexCup);
    this.flexBand.castShadow = this.flexCup.castShadow = true;
    this.group.add(this.flex);
    this.cupLength = cupLength;
    for (const mesh of [this.flexBand, this.flexCup]) mesh.userData.base = mesh.geometry.attributes.position.array.slice();

    // wave generator: elliptical cam + thin flexible bearing with balls
    this.wg = new THREE.Group();
    const camR = rIn - 0.075;
    const camShape = new THREE.Shape();
    const camPts = [];
    for (let i = 0; i < 128; i++) { const a = (i / 128) * Math.PI * 2; const r = camR + m * Math.cos(2 * a); camPts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r)); }
    camShape.setFromPoints(camPts);
    camShape.holes.push(new THREE.Path().absarc(0, 0, 0.16, 0, Math.PI * 2, true));
    const camG = new THREE.ExtrudeGeometry(camShape, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2, curveSegments: 64 });
    camG.translate(0, 0, -0.08);
    this.cam = new THREE.Mesh(camG, M.graphite);
    this.cam.castShadow = true;
    this.wg.add(this.cam);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.3, 48), M.alu);
    hub.rotation.x = Math.PI / 2;
    this.wg.add(hub);
    this.group.add(this.wg);
    this.balls = [];
    const ballG = new THREE.SphereGeometry(0.03, 16, 12);
    for (let i = 0; i < 28; i++) { const b = new THREE.Mesh(ballG, M.chrome); this.group.add(b); this.balls.push(b); }
    this.camR = camR;
    this.rIn = rIn;

    // engagement glow at both ends of the major axis
    this.engageMat = glow(0x6fe3ff, 0, { additive: true, transparent: true });
    this.engage = [0, 1].map(() => {
      const g = new THREE.Mesh(new THREE.TorusGeometry(rc, 0.012, 6, 32, 0.36), this.engageMat);
      g.position.z = 0.12;
      this.group.add(g);
      return g;
    });
    this.alpha = 0;
  }

  /** alpha = wave-generator angle (input). Output (flexspline) rotates by −alpha / ratio. */
  update(alpha, { engageGlow = 0 } = {}) {
    const { m, ratio } = HD;
    this.alpha = alpha;
    const out = -alpha / ratio;
    this.wg.rotation.z = alpha;
    this.flex.rotation.z = out;
    // deform the flexspline in its rotating frame
    const c2 = Math.cos(2 * out), s2 = Math.sin(2 * out);
    for (const mesh of [this.flexBand, this.flexCup]) {
      const base = mesh.userData.base, pos = mesh.geometry.attributes.position, arr = pos.array;
      for (let i = 0; i < base.length; i += 3) {
        const x = base[i], y = base[i + 1], z = base[i + 2];
        const r = Math.hypot(x, y);
        if (r < 1e-5) continue;
        const k = z >= -0.1 ? 1 : Math.max(0, 1 + (z + 0.1) / this.cupLength);
        // cos(2(φ_local + out − alpha)) using angle addition (avoid atan2 per vertex)
        const cl = x / r, sl = y / r;
        const c2l = cl * cl - sl * sl, s2l = 2 * sl * cl;
        const ca = Math.cos(2 * alpha), sa = Math.sin(2 * alpha);
        const cs = c2l * c2 - s2l * s2, sn = s2l * c2 + c2l * s2;   // cos/sin 2(φl + out)
        const w = m * (cs * ca + sn * sa) * k;                     // cos(2(φ − α))
        const f = (r + w) / r;
        arr[i] = x * f; arr[i + 1] = y * f; arr[i + 2] = z;
      }
      pos.needsUpdate = true;
      mesh.geometry.computeVertexNormals();
    }
    // balls ride the ellipse and orbit at roughly half the cam speed
    const n = this.balls.length;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + alpha * 0.48;
      const r = this.camR + 0.04 + m * Math.cos(2 * (a - alpha));
      this.balls[i].position.set(Math.cos(a) * r, Math.sin(a) * r, 0);
    }
    this.engage.forEach((g, i) => { g.rotation.z = alpha + i * Math.PI - 0.18; });
    this.engageMat.color.set(0x6fe3ff).multiplyScalar(engageGlow);
    return out;
  }
}
