// Loader for pre-rendered Manim plates (transparent PNG sequences).
// assets/plates/manifest.json: { "<name>": { "frames": N, "fps": 30, "width": W, "height": H } }
export class Plates {
  constructor(base) {
    this.base = base;
    this.manifest = {};
    this.cache = new Map();
  }

  async loadManifest() {
    try {
      const r = await fetch(this.base + 'manifest.json');
      this.manifest = r.ok ? await r.json() : {};
    } catch { this.manifest = {}; }
  }

  has(name) { return !!this.manifest[name]; }

  /** Frame index for a plate that started lt seconds ago (holds the last frame). */
  frame(name, lt) {
    const m = this.manifest[name];
    if (!m) return -1;
    return Math.min(m.frames - 1, Math.max(0, Math.floor(lt * m.fps + 1e-6)));
  }

  req(name, lt) { const f = this.frame(name, lt); return f >= 0 ? [{ name, frame: f }] : []; }

  async ensure(list) {
    await Promise.all(list.map(async ({ name, frame }) => {
      const key = `${name}/${frame}`;
      if (this.cache.has(key)) return;
      const url = `${this.base}${name}/${String(frame).padStart(4, '0')}.png`;
      const r = await fetch(url);
      if (!r.ok) { this.cache.set(key, null); return; }
      this.cache.set(key, await createImageBitmap(await r.blob()));
    }));
    // bounded cache: drop oldest entries
    while (this.cache.size > 48) {
      const k = this.cache.keys().next().value;
      const bmp = this.cache.get(k);
      if (bmp && bmp.close) bmp.close();
      this.cache.delete(k);
    }
  }

  get(name, frame) { return this.cache.get(`${name}/${frame}`) || null; }

  /** Draw a plate into the overlay at design-space rect, scaled to width w (keeps aspect). */
  draw(o, name, lt, x, y, w, alpha = 1) {
    const m = this.manifest[name];
    if (!m) return;
    const img = this.get(name, this.frame(name, lt));
    if (!img) return;
    o.image(img, x, y, w, (w * m.height) / m.width, alpha);
  }
}
