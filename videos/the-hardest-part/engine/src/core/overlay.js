// 2D vector overlay layer ("3Blue1Brown clarity"): typography, animated strokes, arrows,
// 3D-anchored callouts, graphs and pre-rendered Manim plates. Drawn on a canvas in a
// 1920×1080 design space, uploaded as a texture and composited in the final grade pass.
import * as THREE from 'three';
import { clamp, ease, invLerp, smoothstep } from './timeline.js';

export const C = {
  white: '#F3F5F7', dim: '#9AA3AD', faint: '#5C646E', cyan: '#6FE3FF', cyanDeep: '#2FB6E8',
  copper: '#FF9A4D', amber: '#FFC15A', red: '#FF4A3D', green: '#8DFFB8', muscle: '#FF6B7A', violet: '#B79CFF',
};

const FAMILY = { sans: '"Inter", sans-serif', mono: '"Plex Mono", monospace', math: '"Garamond", serif' };

export class Overlay {
  constructor(width, height) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width; this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d');
    this.s = width / 1920;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.NoColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
    this.alphaStack = [1];
  }

  begin() {
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    c.setTransform(this.s, 0, 0, this.s, 0, 0);
    c.globalAlpha = 1;
    this.alphaStack = [1];
  }

  end() { this.texture.needsUpdate = true; }

  /** Run fn with a multiplied global alpha (nestable). */
  group(alpha, fn) {
    if (alpha <= 0.001) return;
    const a = this.alphaStack[this.alphaStack.length - 1] * alpha;
    this.alphaStack.push(a);
    this.ctx.save();
    this.ctx.globalAlpha = a;
    fn();
    this.ctx.restore();
    this.alphaStack.pop();
  }

  get a() { return this.alphaStack[this.alphaStack.length - 1]; }

  _font(o) {
    const fam = FAMILY[o.family || 'sans'] || o.family;
    const style = o.italic ? 'italic ' : '';
    return `${style}${o.weight || 400} ${o.size || 24}px ${fam}`;
  }

  text(str, x, y, o = {}) {
    const c = this.ctx;
    c.save();
    c.font = this._font(o);
    c.letterSpacing = `${o.tracking || 0}em`;
    c.textAlign = o.align || 'left';
    c.textBaseline = o.baseline || 'alphabetic';
    c.globalAlpha = this.a * (o.alpha ?? 1);
    if (o.glow) { c.shadowColor = o.glowColor || o.color || C.white; c.shadowBlur = o.glow * this.s; }
    c.fillStyle = o.color || C.white;
    c.fillText(str, x, y);
    c.restore();
  }

  measure(str, o = {}) {
    const c = this.ctx;
    c.save();
    c.font = this._font(o);
    c.letterSpacing = `${o.tracking || 0}em`;
    const w = c.measureText(str).width;
    c.restore();
    return w;
  }

  /** Characters fade/slide in left→right as p goes 0→1. */
  textReveal(str, x, y, p, o = {}) {
    if (p <= 0) return;
    const align = o.align || 'left';
    const total = this.measure(str, o);
    let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
    const n = str.length;
    const soft = o.soft ?? 4; // characters of softness
    for (let i = 0; i < n; i++) {
      const ch = str[i];
      const k = clamp((p * (n + soft) - i) / soft);
      const w = this.measure(ch, o);
      if (k > 0) this.text(ch, cx, y + (1 - ease.outCubic(k)) * (o.rise ?? 10), { ...o, align: 'left', alpha: (o.alpha ?? 1) * k });
      cx += w;
    }
  }

  /** Words appear one by one starting at times[i] (or evenly from t0 with step). */
  words(str, x, y, t, t0, step, o = {}) {
    const ws = str.split(' ');
    const space = this.measure(' ', o);
    const widths = ws.map((w) => this.measure(w, o));
    const total = widths.reduce((a, b) => a + b, 0) + space * (ws.length - 1);
    let cx = o.align === 'center' ? x - total / 2 : o.align === 'right' ? x - total : x;
    ws.forEach((w, i) => {
      const k = smoothstep(t0 + i * step, t0 + i * step + (o.fadeIn ?? 0.35), t);
      if (k > 0) this.text(w, cx, y + (1 - k) * (o.rise ?? 8), { ...o, align: 'left', alpha: (o.alpha ?? 1) * k, color: (o.colors && o.colors[i]) || o.color });
      cx += widths[i] + space;
    });
  }

  _stroke(o) {
    const c = this.ctx;
    c.lineWidth = o.w ?? 2;
    c.strokeStyle = o.color || C.white;
    c.lineCap = o.cap || 'round';
    c.lineJoin = 'round';
    c.globalAlpha = this.a * (o.alpha ?? 1);
    if (o.glow) { c.shadowColor = o.glowColor || o.color || C.white; c.shadowBlur = o.glow * this.s; }
    if (o.dash) c.setLineDash(o.dash);
  }

  /** Polyline drawn progressively (p ∈ [0,1]) — the classic "Create" animation. */
  polyline(pts, o = {}) {
    const p = o.progress ?? 1;
    if (p <= 0 || pts.length < 2) return null;
    let L = 0;
    const seg = [];
    for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(d); L += d; }
    const target = L * clamp(p);
    const c = this.ctx;
    c.save();
    this._stroke(o);
    c.beginPath();
    c.moveTo(pts[0][0], pts[0][1]);
    let acc = 0, end = pts[0];
    for (let i = 1; i < pts.length; i++) {
      if (acc + seg[i - 1] >= target) {
        const k = (target - acc) / seg[i - 1];
        end = [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k];
        c.lineTo(end[0], end[1]);
        break;
      }
      acc += seg[i - 1];
      end = pts[i];
      c.lineTo(end[0], end[1]);
    }
    if (o.fill) { c.fillStyle = o.fill; c.fill(); }
    c.stroke();
    c.restore();
    return end;
  }

  line(x1, y1, x2, y2, o = {}) { return this.polyline([[x1, y1], [x2, y2]], o); }

  _head(x, y, ang, size, o) {
    const c = this.ctx;
    c.save();
    c.globalAlpha = this.a * (o.alpha ?? 1);
    c.fillStyle = o.color || C.white;
    if (o.glow) { c.shadowColor = o.glowColor || o.color || C.white; c.shadowBlur = o.glow * this.s; }
    c.translate(x, y);
    c.rotate(ang);
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(-size, -size * 0.42);
    c.lineTo(-size * 0.78, 0);
    c.lineTo(-size, size * 0.42);
    c.closePath();
    c.fill();
    c.restore();
  }

  arrow(x1, y1, x2, y2, o = {}) {
    const p = o.progress ?? 1;
    if (p <= 0) return;
    const ex = x1 + (x2 - x1) * p, ey = y1 + (y2 - y1) * p;
    const ang = Math.atan2(y2 - y1, x2 - x1);
    const head = o.head ?? 16;
    const len = Math.hypot(ex - x1, ey - y1);
    const back = Math.min(head * 0.7, len);
    this.line(x1, y1, ex - Math.cos(ang) * back, ey - Math.sin(ang) * back, o);
    if (len > 2) this._head(ex, ey, ang, Math.min(head, len), o);
  }

  /** Circular arrow from angle a0 to a1 (radians, canvas convention). */
  arcArrow(cx, cy, r, a0, a1, o = {}) {
    const p = o.progress ?? 1;
    if (p <= 0) return;
    const a = a0 + (a1 - a0) * p;
    const n = 48;
    const pts = [];
    const dir = Math.sign(a1 - a0) || 1;
    const headAng = (o.head ?? 16) / r * 0.7;
    const aEnd = a - dir * Math.min(headAng, Math.abs(a - a0));
    for (let i = 0; i <= n; i++) { const t = a0 + (aEnd - a0) * (i / n); pts.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r]); }
    this.polyline(pts, o);
    const hx = cx + Math.cos(a) * r, hy = cy + Math.sin(a) * r;
    this._head(hx, hy, a + dir * Math.PI / 2, o.head ?? 16, o);
  }

  circle(cx, cy, r, o = {}) {
    const c = this.ctx;
    const p = o.progress ?? 1;
    if (p <= 0) return;
    c.save();
    this._stroke(o);
    c.beginPath();
    c.arc(cx, cy, r, o.start ?? -Math.PI / 2, (o.start ?? -Math.PI / 2) + Math.PI * 2 * p);
    if (o.fill) { c.fillStyle = o.fill; c.fill(); }
    if (o.stroke !== false) c.stroke();
    c.restore();
  }

  rect(x, y, w, h, o = {}) {
    const c = this.ctx;
    c.save();
    this._stroke(o);
    c.beginPath();
    if (o.r) c.roundRect(x, y, w, h, o.r); else c.rect(x, y, w, h);
    if (o.fill) { c.fillStyle = o.fill; c.globalAlpha = this.a * (o.fillAlpha ?? o.alpha ?? 1); c.fill(); }
    if (o.stroke !== false) { c.globalAlpha = this.a * (o.alpha ?? 1); c.stroke(); }
    c.restore();
  }

  /** Soft radial gradient blob (for text legibility pads, glows). */
  pad(x, y, rx, ry, alpha = 0.6, color = '0,0,0') {
    const c = this.ctx;
    c.save();
    c.globalAlpha = this.a;
    c.translate(x, y);
    c.scale(1, ry / rx);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, `rgba(${color},${alpha})`);
    g.addColorStop(1, `rgba(${color},0)`);
    c.fillStyle = g;
    c.fillRect(-rx, -rx, rx * 2, rx * 2);
    c.restore();
  }

  /**
   * Leader-line callout anchored at (ax, ay): ring at anchor, elbow line, stacked text.
   * lines: [{ text, size, color, family, weight, tracking }]
   */
  callout(ax, ay, o = {}) {
    const p = o.progress ?? 1;
    if (p <= 0) return;
    const dx = o.dx ?? 120, dy = o.dy ?? -80;
    const side = Math.sign(dx) || 1;
    const shelf = o.shelf ?? 140;
    const col = o.color || C.white;
    const k1 = clamp(p / 0.25), k2 = clamp((p - 0.15) / 0.35), k3 = clamp((p - 0.4) / 0.6);
    this.circle(ax, ay, (o.ring ?? 7) * ease.outBack(k1), { w: 1.6, color: col, alpha: k1, progress: 1 });
    if (o.dot !== false) this.circle(ax, ay, 2.2, { fill: col, stroke: false, alpha: k1 });
    const ex = ax + dx, ey = ay + dy;
    const r = o.ring ?? 7;
    const len = Math.hypot(dx, dy);
    const sx = ax + (dx / len) * r * 1.4, sy = ay + (dy / len) * r * 1.4;
    this.polyline([[sx, sy], [ex, ey], [ex + side * shelf, ey]], { w: o.w ?? 1.4, color: col, progress: k2, alpha: 0.9 });
    let ty = ey - 12;
    const tx = side > 0 ? ex + 4 : ex + side * shelf - 4;
    const lines = o.lines || [];
    // first line sits above the shelf, others below
    lines.forEach((ln, i) => {
      const lo = { size: 17, family: 'mono', weight: 400, tracking: 0.12, color: C.white, ...ln };
      const y = i === 0 ? ty : ey + 8 + i * ((lo.size || 17) + 8) + (lo.size || 17) * 0.55 - 6;
      const align = side > 0 ? 'left' : 'left';
      this.textReveal(ln.text, tx, y, clamp(k3 * 1.2 - i * 0.12), { ...lo, align, rise: 6 });
    });
  }

  /** Chapter marker: small roman numeral + title, top-left. */
  chapter(num, title, alpha = 1) {
    if (alpha <= 0) return;
    this.group(alpha, () => {
      this.text(num, 96, 92, { family: 'mono', size: 15, tracking: 0.3, color: C.cyan });
      this.line(140, 87, 180, 87, { w: 1, color: C.dim, alpha: 0.8 });
      this.text(title.toUpperCase(), 194, 92, { family: 'mono', size: 15, tracking: 0.3, color: C.dim });
    });
  }

  /** Horizontal meter bar. */
  meter(x, y, w, h, v, o = {}) {
    this.rect(x, y, w, h, { stroke: false, fill: o.bg || 'rgba(255,255,255,0.12)', fillAlpha: 1 });
    if (v > 0) this.rect(x, y, w * clamp(v), h, { stroke: false, fill: o.color || C.cyan, fillAlpha: 1 });
    if (o.mark != null) this.line(x + w * o.mark, y - 5, x + w * o.mark, y + h + 5, { w: 1.5, color: o.markColor || C.red });
  }

  /** Function plot in rect {x,y,w,h} mapping domain [x0,x1]×[y0,y1]. */
  plot(fn, rect, dom, o = {}) {
    const n = o.samples ?? 120;
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const xv = dom.x0 + (dom.x1 - dom.x0) * u;
      const yv = fn(xv);
      pts.push([rect.x + rect.w * u, rect.y + rect.h * (1 - (yv - dom.y0) / (dom.y1 - dom.y0))]);
    }
    return this.polyline(pts, o);
  }

  map(rect, dom, xv, yv) {
    return [rect.x + rect.w * (xv - dom.x0) / (dom.x1 - dom.x0), rect.y + rect.h * (1 - (yv - dom.y0) / (dom.y1 - dom.y0))];
  }

  axes(rect, o = {}) {
    const p = o.progress ?? 1;
    const col = o.color || C.dim;
    this.arrow(rect.x, rect.y + rect.h, rect.x + rect.w + 24, rect.y + rect.h, { w: 1.6, color: col, progress: p, head: 11 });
    this.arrow(rect.x, rect.y + rect.h, rect.x, rect.y - 24, { w: 1.6, color: col, progress: p, head: 11 });
    const k = clamp((p - 0.6) / 0.4);
    if (o.xlabel) this.text(o.xlabel, rect.x + rect.w + 30, rect.y + rect.h + 6, { family: 'mono', size: 16, tracking: 0.12, color: col, alpha: k, baseline: 'middle' });
    if (o.ylabel) this.text(o.ylabel, rect.x, rect.y - 40, { family: 'mono', size: 16, tracking: 0.12, color: col, alpha: k, align: 'center' });
  }

  image(img, x, y, w, h, alpha = 1) {
    if (!img || alpha <= 0) return;
    const c = this.ctx;
    c.save();
    c.globalAlpha = this.a * alpha;
    c.drawImage(img, x, y, w, h);
    c.restore();
  }
}

/** Project a world-space point into the 1920×1080 design space. */
const _v = new THREE.Vector3();
export function project(p, camera) {
  _v.copy(p).project(camera);
  return { x: (_v.x * 0.5 + 0.5) * 1920, y: (-_v.y * 0.5 + 0.5) * 1080, behind: _v.z > 1 };
}

/** World position of an object's local point. */
export function worldOf(obj, local = [0, 0, 0]) {
  obj.updateWorldMatrix(true, false);
  return new THREE.Vector3(...local).applyMatrix4(obj.matrixWorld);
}

export { invLerp };
