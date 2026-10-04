// Skeletal-muscle fascicle (axis +X): hex-packed striated fibres, capillaries with flowing
// blood, a translucent fascia sheath cut open, tendon ends. Contraction shortens and bulges.
import * as THREE from 'three';
import { M, glow } from '../core/materials.js';
import { flowMaterial } from '../shots/common.js';
import { lathe } from '../core/geo.js';
import { rng } from '../core/timeline.js';

export class Fascicle {
  constructor({ length = 3, fibreR = 0.07 } = {}) {
    this.group = new THREE.Group();
    this.body = new THREE.Group();
    this.group.add(this.body);
    const r = rng(17);
    const centers = [[0, 0]];
    for (let ring = 1; ring <= 3; ring++) {
      for (let k = 0; k < ring * 6; k++) {
        const a = (k / (ring * 6)) * Math.PI * 2 + ring * 0.3;
        centers.push([Math.cos(a) * ring * fibreR * 2.05, Math.sin(a) * ring * fibreR * 2.05]);
      }
    }
    const mat = M.muscle.clone();
    mat.normalMap = M.muscle.normalMap.clone();
    mat.normalMap.repeat.set(1, 7);
    mat.normalMap.wrapS = mat.normalMap.wrapT = THREE.RepeatWrapping;
    mat.normalMap.needsUpdate = true;
    mat.emissive = new THREE.Color(0x3a0508);
    mat.emissiveIntensity = 0.6;
    this.fibreMat = mat;
    this.fibres = [];
    for (const [y, z] of centers) {
      const len = length * (0.96 + r() * 0.06);
      const g = new THREE.CylinderGeometry(fibreR * (0.92 + r() * 0.12), fibreR * (0.92 + r() * 0.12), len, 20, 24);
      // gentle waviness
      const p = g.attributes.position;
      const ph = r() * 6.28;
      for (let i = 0; i < p.count; i++) { const v = p.getY(i); p.setX(i, p.getX(i) + Math.sin(v * 2.1 + ph) * 0.012); }
      g.computeVertexNormals();
      g.rotateZ(Math.PI / 2);
      const m = new THREE.Mesh(g, mat);
      m.position.set((r() - 0.5) * 0.05, y, z);
      m.castShadow = true; m.receiveShadow = true;
      this.body.add(m);
      this.fibres.push(m);
    }
    // capillaries between fibres, blood flowing
    this.blood = [];
    for (let c = 0; c < 9; c++) {
      const a = (c / 9) * Math.PI * 2;
      const rad = fibreR * (1.9 + (c % 3) * 1.6);
      const pts = [];
      for (let i = 0; i <= 24; i++) {
        const u = i / 24;
        const aa = a + u * 1.4 + Math.sin(u * 9 + c) * 0.12;
        pts.push(new THREE.Vector3(-length / 2 + u * length, Math.cos(aa) * rad, Math.sin(aa) * rad));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const wall = new THREE.Mesh(new THREE.TubeGeometry(curve, 96, 0.016, 6), new THREE.MeshPhysicalMaterial({ color: 0x8a1520, roughness: 0.3, transparent: true, opacity: 0.55, clearcoat: 1 }));
      const fm = flowMaterial({ color: 0xff2a3a, intensity: 1.6, dashes: 22, speed: 0.9, duty: 0.45, base: 0.25 });
      const flow = new THREE.Mesh(new THREE.TubeGeometry(curve, 96, 0.011, 6), fm);
      this.body.add(wall, flow);
      this.blood.push(fm);
    }
    // fascia sheath (cut open) and tendons
    const sheath = new THREE.Mesh(new THREE.CylinderGeometry(fibreR * 7.6, fibreR * 7.6, length * 0.92, 64, 1, true, Math.PI * 0.15, Math.PI * 1.25), M.fascia);
    sheath.rotation.z = Math.PI / 2;
    sheath.renderOrder = 3;
    this.body.add(sheath);
    for (const s of [-1, 1]) {
      const t = new THREE.Mesh(lathe([[fibreR * 7, 0], [fibreR * 5, 0.25], [fibreR * 2.2, 0.6], [fibreR * 1.6, 1.2]], 48), M.tendon);
      t.rotation.z = -s * Math.PI / 2;
      t.position.x = s * length * 0.47;
      this.group.add(t);
    }
    // micro-tear: a glowing ring on one outer fibre that closes as it heals
    this.tearMat = glow(0xffb37a, 0, { additive: true, transparent: true });
    this.tear = new THREE.Mesh(new THREE.TorusGeometry(fibreR * 1.15, fibreR * 0.35, 12, 32), this.tearMat);
    this.tear.rotation.y = Math.PI / 2;
    const f = this.fibres[centers.length - 5];
    this.tear.position.copy(f.position).add(new THREE.Vector3(0.3, 0, 0));
    this.body.add(this.tear);
  }

  update(t, { contract = 0, jiggle = 0, heal = 0, tear = 0, bloodSpeed = 1 } = {}) {
    const sx = 1 - 0.07 * contract, sr = 1 + 0.05 * contract;
    this.body.scale.set(sx, sr * (1 + jiggle * 0.06), sr * (1 - jiggle * 0.04));
    this.fibreMat.emissiveIntensity = 0.5 + contract * 0.4;
    for (const b of this.blood) { b.uniforms.uTime.value = t; b.uniforms.uSpeed.value = 0.9 * bloodSpeed; }
    this.tearMat.color.set(0xffb37a).multiplyScalar(tear * 2.5 * (1 - heal));
    this.tear.scale.setScalar(1 - heal * 0.6);
  }
}
