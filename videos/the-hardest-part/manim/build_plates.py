"""Render all Manim plates to transparent PNG sequences + manifest for the film engine.

    python manim/build_plates.py [--fps 30] [--only torque,heat]

Output: assets/plates/<name>/0000.png … and assets/plates/manifest.json
"""
import argparse, json, shutil, subprocess, sys, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PLATES = {  # name: (Scene class, pixel width, pixel height) — 2x the design-space size
    "torque": ("TorquePlate", 1640, 1000),
    "gear": ("GearPlate", 1520, 680),
    "loop": ("LoopPlate", 1520, 900),
    "heat": ("HeatPlate", 1680, 1360),
}

ap = argparse.ArgumentParser()
ap.add_argument("--fps", type=int, default=30)
ap.add_argument("--only", default="")
a = ap.parse_args()
only = set(filter(None, a.only.split(",")))
out_root = ROOT / "assets/plates"
out_root.mkdir(parents=True, exist_ok=True)
man_path = out_root / "manifest.json"
manifest = json.loads(man_path.read_text()) if man_path.exists() else {}
manim = shutil.which("manim") or str(Path(sys.executable).parent / "manim")

for name, (cls, w, h) in PLATES.items():
    if only and name not in only:
        continue
    with tempfile.TemporaryDirectory() as tmp:
        cmd = [manim, "-r", f"{w},{h}", "--fps", str(a.fps), "--transparent", "--format", "png",
               "--media_dir", tmp, "--disable_caching", "-v", "WARNING", "--progress_bar", "none", str(ROOT / "manim/plates.py"), cls]
        print(" ".join(cmd))
        subprocess.run(cmd, check=True)
        frames = sorted(Path(tmp).rglob(f"{cls}*.png"))
        dst = out_root / name
        if dst.exists():
            shutil.rmtree(dst)
        dst.mkdir(parents=True)
        for i, f in enumerate(frames):
            shutil.move(str(f), dst / f"{i:04d}.png")
        manifest[name] = {"frames": len(frames), "fps": a.fps, "width": w, "height": h}
        print(f"  {name}: {len(frames)} frames")
man_path.write_text(json.dumps(manifest, indent=1))
print("manifest →", man_path)
