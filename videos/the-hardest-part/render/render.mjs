// Offline renderer: drives engine/index.html in headless Chromium frame-by-frame
// (deterministic renderFrame(t)) and pipes frames into ffmpeg.
//
//   node render/render.mjs --preset preview                 # 1280×720 @30, 1 sample, H.264
//   node render/render.mjs --preset final                   # 3840×2160 @60, 8-sample motion blur, ProRes 4444 XQ
//   node render/render.mjs --preset stills --times 2,9.5,40 # PNG stills
//   options: --from S --to S --w W --fps N --samples N --out FILE --gpu --segment 4 --workers N
//
// Rendering is split into segments (default 4 s) written to renders/segments/<tag>/ so an
// interrupted render resumes where it stopped; segments are concatenated at the end.
import { chromium } from 'playwright-core';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from './serve.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
  return acc;
}, []));

const PRESETS = {
  preview: { w: 1280, fps: 30, q: 'preview', samples: 1, codec: 'h264', crf: 16 },
  hd: { w: 1920, fps: 30, q: 'preview', samples: 1, codec: 'h264', crf: 14 },
  final: { w: 3840, fps: 60, q: 'final', samples: 8, codec: 'prores' },
  stills: { w: 1920, fps: 30, q: 'preview', samples: 1 },
};
const P = { ...PRESETS[args.preset || 'preview'] };
if (args.w) P.w = +args.w;
if (args.fps) P.fps = +args.fps;
if (args.samples) P.samples = +args.samples;
if (args.q) P.q = args.q;
if (args.codec) P.codec = args.codec;
P.h = Math.round((P.w * 9) / 16);

const CHROME = process.env.CHROME_PATH || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => fs.existsSync(p));
const GPU = !!args.gpu;
const launchArgs = GPU
  ? ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--use-angle=default', '--enable-unsafe-webgpu']
  : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

async function openPage(server, startT = 0) {
  const browser = await chromium.launch({ executablePath: CHROME, headless: !args.headed, args: launchArgs });
  const page = await browser.newPage({ viewport: { width: Math.min(P.w, 1920), height: Math.min(P.h, 1080) }, deviceScaleFactor: 1 });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.type(), m.text()); });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/engine/?w=${P.w}&h=${P.h}&q=${P.q}&fps=${P.fps}&samples=${P.samples}&t=${startT}${args.params ? '&' + args.params : ''}`;
  await page.goto(url);
  await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 0, polling: 200 });
  const err = await page.evaluate(() => window.__error);
  if (err) throw new Error(err);
  return { browser, page };
}

async function grab(page, type = 'png') {
  const b64 = await page.evaluate(async (type) => {
    const c = document.getElementById('c');
    const blob = await new Promise((r) => c.toBlob(r, type === 'png' ? 'image/png' : 'image/jpeg', 0.96));
    const buf = new Uint8Array(await blob.arrayBuffer());
    let s = '';
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return btoa(s);
  }, type);
  return Buffer.from(b64, 'base64');
}

function encoderArgs(out) {
  const common = ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(P.fps), '-i', '-'];
  if (P.codec === 'prores') return [...common, '-c:v', 'prores_ks', '-profile:v', '4', '-pix_fmt', 'yuv444p10le', '-vendor', 'apl0', out];
  return [...common, '-c:v', 'libx264', '-preset', 'slow', '-crf', String(P.crf ?? 16), '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out];
}

async function renderStills(server) {
  const times = String(args.times || '1,9.5').split(',').map(Number);
  const outDir = path.join(ROOT, 'renders/stills');
  fs.mkdirSync(outDir, { recursive: true });
  const { browser, page } = await openPage(server, times[0]);
  for (const t of times) {
    const t0 = Date.now();
    await page.evaluate((t) => window.__film.renderFrame(t), t);
    const file = path.join(outDir, `${args.tag ? args.tag + '_' : ''}t${t.toFixed(2).padStart(6, '0')}.png`);
    fs.writeFileSync(file, await grab(page, 'png'));
    console.log(`still ${t}s → ${path.relative(ROOT, file)} (${Date.now() - t0} ms)`);
  }
  await browser.close();
}

async function renderVideo(server) {
  const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'script/cues.json'), 'utf8'));
  const from = +(args.from ?? 0), to = +(args.to ?? meta.duration);
  const segLen = +(args.segment ?? 4);
  const tag = args.tag || `${args.preset || 'preview'}_${P.w}x${P.h}_${P.fps}`;
  const segDir = path.join(ROOT, 'renders/segments', tag);
  fs.mkdirSync(segDir, { recursive: true });
  const ext = P.codec === 'prores' ? 'mov' : 'mp4';
  const totalFrames = Math.round((to - from) * P.fps);
  const framesPerSeg = Math.round(segLen * P.fps);
  const segs = [];
  for (let f = 0; f < totalFrames; f += framesPerSeg) segs.push({ f0: f, f1: Math.min(totalFrames, f + framesPerSeg) });
  const todo = segs.filter((s) => !fs.existsSync(path.join(segDir, `seg_${String(Math.round(from * P.fps) + s.f0).padStart(6, '0')}.${ext}`)));
  console.log(`${tag}: ${totalFrames} frames in ${segs.length} segments (${todo.length} to render)`);

  const workers = Math.max(1, +(args.workers ?? 1));
  const queue = [...todo];
  const t0 = Date.now();
  let done = 0;
  const worker = async () => {
    let ctx = null;
    while (queue.length) {
      const s = queue.shift();
      const g0 = Math.round(from * P.fps) + s.f0;
      if (!ctx) ctx = await openPage(server, g0 / P.fps);
      const file = path.join(segDir, `seg_${String(g0).padStart(6, '0')}.${ext}`);
      const tmp = file + '.part.' + ext;
      const ff = spawn('ffmpeg', encoderArgs(tmp), { stdio: ['pipe', 'inherit', 'inherit'] });
      for (let f = s.f0; f < s.f1; f++) {
        const t = from + f / P.fps;
        await ctx.page.evaluate((t) => window.__film.renderFrame(t), t);
        const img = await grab(ctx.page, P.codec === 'prores' ? 'png' : (args.jpeg ? 'jpeg' : 'png'));
        if (!ff.stdin.write(img)) await new Promise((r) => ff.stdin.once('drain', r));
        done++;
        if (done % 10 === 0) {
          const el = (Date.now() - t0) / 1000;
          const rate = el / done;
          const left = (todo.reduce((a, x) => a + (x.f1 - x.f0), 0) - done) * rate / workers;
          process.stdout.write(`\r  frame ${done}  t=${t.toFixed(2)}s  ${(rate * 1000).toFixed(0)} ms/frame  ETA ${(left / 60).toFixed(1)} min   `);
        }
      }
      ff.stdin.end();
      await new Promise((r) => ff.on('close', r));
      fs.renameSync(tmp, file);
    }
    if (ctx) await ctx.browser.close();
  };
  await Promise.all(Array.from({ length: workers }, worker));
  console.log('\nconcatenating…');
  const list = segs.map((s) => `file '${path.join(segDir, `seg_${String(Math.round(from * P.fps) + s.f0).padStart(6, '0')}.${ext}`)}'`).join('\n');
  const listFile = path.join(segDir, 'list.txt');
  fs.writeFileSync(listFile, list);
  const out = path.resolve(ROOT, args.out || `renders/the-hardest-part_${tag}.${ext}`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', out]);
  console.log(`→ ${path.relative(ROOT, out)}  (${((Date.now() - t0) / 60000).toFixed(1)} min)`);
}

const server = await serve(0);
try {
  if (args.preset === 'stills') await renderStills(server);
  else await renderVideo(server);
} finally {
  server.close();
}
