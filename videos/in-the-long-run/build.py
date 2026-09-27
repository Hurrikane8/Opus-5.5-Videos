"""Generate index.html for "In the Long Run" from narration word timings.

Run: python3 build.py   (reads ../../keynes/audio/words.json and ../../keynes/vo.txt)
"""
import json, re, html
from pathlib import Path

ROOT = Path(__file__).parent
KEY = ROOT.parent.parent / "keynes"
W = json.load(open(KEY / "audio/words.json"))["words"]
TOTAL = 178.5

# ---------- captions: re-attach punctuation from the script ----------
src = open(KEY / "vo.txt").read().split()
words, si = [], 0
for w in W:
    n = len(w["text"].split())
    words.append({**w, "text": " ".join(src[si:si + n])})
    si += n


def cue_groups():
    cues, cur = [], []
    for i, w in enumerate(words):
        cur.append(w)
        nxt = words[i + 1] if i + 1 < len(words) else None
        end_sent = re.search(r"[.!?:]['’\"]?$", w["text"])
        gap = nxt and nxt["start"] - w["end"] > 0.35
        long_ = len(cur) >= 7 or sum(len(x["text"]) + 1 for x in cur) > 44
        comma = w["text"].endswith(",") and len(cur) >= 4
        if not nxt or end_sent or gap or long_ or comma:
            cues.append(cur)
            cur = []
    return cues


def T(word, after=0.0):
    """Start time of the first spoken token matching `word` at/after `after`."""
    for w in W:
        if w["start"] >= after - 1e-6 and w["text"].lower().strip() == word.lower():
            return w["start"]
    raise KeyError(f"{word} after {after}")


esc = html.escape
H = []   # scene markup
J = []   # timeline code
A = []   # audio elements
uid = [0]


def nid(p="e"):
    uid[0] += 1
    return f"{p}{uid[0]}"


def clip(start, end, inner, cls="", track=1, style=""):
    i = nid("c")
    H.append(f'<div id="{i}" class="clip scene {cls}" data-start="{start:.3f}" '
             f'data-duration="{end - start:.3f}" data-track-index="{track}" style="{style}">{inner}</div>')
    return i


# ---------- reusable visual builders ----------
def photo(start, end, img, label="", pos="center", w=900, h=None, push=1.07, fade=0.6, x=0, y=0, dim=False):
    """Archival photo floating on black: grayscale + halftone + slow push."""
    fid = nid("p")
    hs = f"height:{h}px;" if h else ""
    lab = f'<div class="plabel">{esc(label)}</div>' if label else ""
    wrap = "photo-full" if pos == "full" else "photo-frame"
    style = f"width:{w}px;{hs}" if pos != "full" else ""
    inner = (f'<div class="pwrap" style="transform:translate({x}px,{y}px)"><div id="{fid}" class="{wrap}{" dim" if dim else ""}" style="{style}">'
             f'<img src="assets/img/{img}.jpg" alt=""><div class="halftone"></div></div>{lab}</div>')
    clip(start, end, inner, "center")
    J.append(f'tl.fromTo("#{fid}",{{opacity:0,scale:1.0,filter:"blur(10px)"}},{{opacity:1,filter:"blur(0px)",duration:{fade},ease:"power2.out"}},{start:.3f});')
    J.append(f'tl.fromTo("#{fid} img",{{scale:1.0}},{{scale:{push},duration:{end - start:.3f},ease:"none"}},{start:.3f});')
    J.append(f'tl.to("#{fid}",{{opacity:0,duration:0.4,ease:"power1.in"}},{end - 0.4:.3f});')
    return fid


def kinetic(start, end, text, size=64, hl=None, y=0, serif=False, color="#f4f4f5"):
    """Words blur in one by one on black, timed to their spoken start."""
    toks = text.split()
    spans, t0 = [], start
    for k, tok in enumerate(toks):
        sid = nid("k")
        cls = "hl" if hl and re.sub(r"\W", "", tok).lower() in hl else ""
        spans.append(f'<span id="{sid}" class="kw {cls}">{esc(tok)}</span>')
        bare = re.sub(r"[^\w'’%.-]", "", tok).rstrip(".")
        try:
            ts = T(bare, t0 - 0.05) if bare else t0
            if ts - t0 > 3:
                ts = t0 + 0.12
        except KeyError:
            ts = t0 + 0.12
        t0 = ts
        J.append(f'tl.fromTo("#{sid}",{{opacity:0,filter:"blur(12px)",y:8}},{{opacity:1,filter:"blur(0px)",y:0,duration:0.35,ease:"power2.out"}},{ts:.3f});')
    fam = "serif" if serif else ""
    kid = nid("kb")
    clip(start, end, f'<div id="{kid}" class="kinetic {fam}" style="font-size:{size}px;margin-top:{y}px;color:{color}">{" ".join(spans)}</div>', "center")
    J.append(f'tl.to("#{kid}",{{opacity:0,filter:"blur(8px)",duration:0.35}},{end - 0.35:.3f});')


def glitch(start, end, text, size=72, sub="", sfx="glitch-1"):
    gid = nid("g")
    subh = f'<div class="gsub">{esc(sub)}</div>' if sub else ""
    clip(start, end, f'<div class="gwrap"><div id="{gid}" class="glitch" style="font-size:{size}px" data-text="{esc(text)}">{esc(text)}</div>{subh}</div>', "center")
    J.append(f'tl.fromTo("#{gid}",{{opacity:0,scaleX:1.35}},{{opacity:1,scaleX:1,duration:0.5,ease:"expo.out"}},{start:.3f});')
    J.append(f'tl.fromTo("#{gid}",{{x:-14,skewX:12}},{{x:0,skewX:0,duration:0.45,ease:"steps(6)"}},{start:.3f});')
    J.append(f'tl.to("#{gid}",{{x:10,duration:0.18,ease:"steps(3)",yoyo:true,repeat:1}},{start + 1.1:.3f});')
    J.append(f'tl.to("#{gid}",{{opacity:0,duration:0.3}},{end - 0.3:.3f});')
    if sfx:
        sound(sfx, start, 0.22)


def book(start, end, lines, hl=None, tag="", size=78, hl_at=None, hl_color="red"):
    """Macro book-page text, shallow depth of field, a highlighted phrase."""
    bid = nid("b")
    rows = []
    for k, ln in enumerate(lines):
        is_hl = hl is not None and k == hl
        cls = "brow hlrow" if is_hl else "brow"
        blur = 0 if is_hl else min(abs(k - (hl if hl is not None else len(lines) // 2)) * 1.6, 5)
        mark = f'<span class="mark {hl_color}" id="{bid}m"></span>' if is_hl else ""
        rows.append(f'<div class="{cls}" style="filter:blur({blur}px)">{mark}<span class="btxt">{esc(ln)}</span></div>')
    tagh = f'<div class="btag">{esc(tag)}</div>' if tag else ""
    clip(start, end, f'<div id="{bid}" class="book" style="font-size:{size}px">{"".join(rows)}</div>{tagh}', "center")
    J.append(f'tl.fromTo("#{bid}",{{opacity:0,scale:1.12,rotation:-2}},{{opacity:1,scale:1.0,rotation:-2,duration:0.8,ease:"power2.out"}},{start:.3f});')
    J.append(f'tl.to("#{bid}",{{x:-60,duration:{end - start:.3f},ease:"none"}},{start:.3f});')
    if hl is not None:
        J.append(f'tl.fromTo("#{bid}m",{{scaleX:0}},{{scaleX:1,duration:0.6,ease:"power3.inOut"}},{(hl_at or start + 0.6):.3f});')
    J.append(f'tl.to("#{bid}",{{opacity:0,duration:0.4}},{end - 0.4:.3f});')


def sound(name, at, vol=0.25):
    dur = {"whoosh-cinematic": 5.5, "whoosh-short": 0.57, "impact-bass-1": 2.1, "impact-bass-2": 2.59,
           "glitch-1": 2.6, "glitch-2": 3.5, "riser": 10.0, "key-press": 0.43, "typing": 1.54}[name]
    dur = min(dur, TOTAL - at)
    A.append(f'<audio id="{nid("s")}" src="assets/audio/{name}.mp3" data-start="{at:.3f}" data-duration="{dur:.3f}" '
             f'data-track-index="{11 + len(A) % 4}" data-volume="{vol}"></audio>')


def chart(start, end, series, xr, yr, draw_at, draw_dur, labels=(), title="", unit="%", yticks=(), xticks=(), note=""):
    """SVG line chart drawn progressively."""
    cid = nid("ch")
    Wd, Ht, L, R, Tp, B = 1400, 640, 90, 40, 30, 60
    def px(x): return L + (x - xr[0]) / (xr[1] - xr[0]) * (Wd - L - R)
    def py(y): return Tp + (1 - (y - yr[0]) / (yr[1] - yr[0])) * (Ht - Tp - B)
    g = []
    for yt in yticks:
        g.append(f'<line x1="{L}" x2="{Wd - R}" y1="{py(yt):.1f}" y2="{py(yt):.1f}" class="grid"/>'
                 f'<text x="{L - 16}" y="{py(yt) + 8:.1f}" class="ax" text-anchor="end">{yt}{unit}</text>')
    for xt in xticks:
        g.append(f'<text x="{px(xt):.1f}" y="{Ht - 18}" class="ax" text-anchor="middle">{xt}</text>')
    paths, ends = [], []
    for k, (pts, color, name) in enumerate(series):
        d = "M" + " L".join(f"{px(x):.1f},{py(y):.1f}" for x, y in pts)
        paths.append(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>')
        lx, ly = pts[-1]
        ends.append(f'<text x="{px(lx) + 14:.1f}" y="{py(ly) + 8:.1f}" class="lab" fill="{color}">{esc(name)}</text>')
    J.append(f'tl.fromTo("#{cid}ln",{{clipPath:"inset(-40px 100% -40px -40px)"}},{{clipPath:"inset(-40px 0% -40px -40px)",duration:{draw_dur},ease:"power1.inOut"}},{draw_at:.3f});')
    J.append(f'tl.fromTo("#{cid}en",{{opacity:0}},{{opacity:1,duration:0.4}},{draw_at + draw_dur - 0.2:.3f});')
    ann = []
    for (x, y, txt, at, color) in labels:
        aid = nid("an")
        ann.append(f'<div id="{aid}" class="clayer"><svg viewBox="0 0 {Wd} {Ht}" width="{Wd}" height="{Ht}"><circle cx="{px(x):.1f}" cy="{py(y):.1f}" r="9" fill="{color}"/>'
                   f'<text x="{px(x):.1f}" y="{py(y) - 24:.1f}" class="annot" text-anchor="middle" fill="#fff">{esc(txt)}</text></svg></div>')
        J.append(f'tl.fromTo("#{aid}",{{opacity:0}},{{opacity:1,duration:0.4}},{at:.3f});')
    sv = lambda body: f'<svg viewBox="0 0 {Wd} {Ht}" width="{Wd}" height="{Ht}">{body}</svg>'
    plot = (f'<div class="cplot" style="width:{Wd}px;height:{Ht}px">{sv("".join(g))}'
            f'<div id="{cid}ln" class="clayer">{sv("".join(paths))}</div><div id="{cid}en" class="clayer">{sv("".join(ends))}</div>{"".join(ann)}</div>')
    noteh = f'<div class="cnote">{esc(note)}</div>' if note else ""
    clip(start, end, f'<div id="{cid}" class="chart"><div class="ctitle">{esc(title)}</div>{plot}{noteh}</div>', "center")
    J.append(f'tl.fromTo("#{cid}",{{opacity:0,y:30}},{{opacity:1,y:0,duration:0.6,ease:"power2.out"}},{start:.3f});')
    J.append(f'tl.to("#{cid}",{{opacity:0,duration:0.4}},{end - 0.4:.3f});')


def stat(start, end, value, label, sub="", count_from=None, fmt="{:.1f}", prefix="", suffix="", at=None, dur=1.2, bg=None, color="#fff"):
    sid = nid("st")
    bgh = f'<div class="statbg"><img src="assets/img/{bg}.jpg" alt=""></div>' if bg else ""
    clip(start, end, f'{bgh}<div class="stat"><div class="sval" style="color:{color}"><span>{esc(prefix)}</span><span id="{sid}">{esc(fmt.format(value))}</span><span>{esc(suffix)}</span></div>'
         f'<div class="slab">{esc(label)}</div><div class="ssub">{esc(sub)}</div></div>', "center")
    at = at if at is not None else start
    J.append(f'tl.fromTo("#{sid}",{{opacity:0}},{{opacity:1,duration:0.3}},{at:.3f});')
    if count_from is not None:
        J.append(f'(function(){{var o={{v:{count_from}}};var el=document.getElementById("{sid}");'
                 f'tl.to(o,{{v:{value},duration:{dur},ease:"power2.out",onUpdate:function(){{el.textContent=fmtN(o.v,"{fmt}");}}}},{at:.3f});}})();')


# =====================================================================
#  SCENES
# =====================================================================
S = [0.0, 12.45, 33.2, 52.5, 73.1, 94.1, 113.1, 133.1, 159.1, TOTAL]

# --- S0 hook -------------------------------------------------------------
kinetic(0.05, 2.75, "Bury banknotes in old bottles.", 72)
kinetic(2.75, 5.15, "Pay men to dig them up again.", 72)
book(5.15, 9.0, ["If the Treasury were to fill old bottles", "with banknotes, bury them at suitable depths",
                 "in disused coalmines which are then filled up", "to the surface with town rubbish, and leave it",
                 "to private-enterprise ... to dig the notes up again"], hl=0, hl_at=5.6,
     tag="J. M. KEYNES · THE GENERAL THEORY · 1936 · CH. 10")
photo(9.0, 11.3, "keynes_1933", "JOHN MAYNARD KEYNES · 1883–1946", w=520)
glitch(11.3, 12.45, "IN THE LONG RUN", 110, sfx="impact-bass-1")
sound("glitch-2", 11.25, 0.12)

# --- S1 Keynes & the General Theory --------------------------------------
photo(12.45, 15.75, "soup_kitchen", "DEPRESSION SOUP KITCHEN · CHICAGO · 1931", pos="full", push=1.1)
glitch(12.6, 15.6, "1936", 150, sfx=None)
clip(15.75, 21.0,
     '<div class="cover" id="cov"><div class="cv1">THE GENERAL THEORY</div><div class="cv2">OF EMPLOYMENT, INTEREST</div><div class="cv2" style="margin-top:4px">AND MONEY</div>'
     '<div class="cvrule"></div><div class="cv3">JOHN MAYNARD KEYNES</div><div class="cv4">MACMILLAN · LONDON · 1936</div></div>'
     '<div class="side-photo" id="covp"><img src="assets/img/keynes.jpg" alt=""><div class="halftone"></div></div>', "center", style="gap:110px")
J.append('tl.fromTo("#cov",{opacity:0,y:30},{opacity:1,y:0,duration:0.9,ease:"power3.out"},15.8);')
J.append('tl.fromTo("#covp",{opacity:0,y:30},{opacity:1,y:0,duration:0.9,ease:"power3.out"},16.4);')
J.append('tl.to("#cov,#covp",{opacity:0,duration:0.4},20.6);')
sound("whoosh-cinematic", 15.5, 0.18)
photo(21.0, 27.95, "eccles_1937", "FEDERAL RESERVE BUILDING · 1937", w=880, x=-420, dim=True) if Path(ROOT / "assets/img/eccles_1937.jpg").exists() else None
clip(21.0, 27.95, '<div class="triad"><div id="tr1">SPEND</div><div id="tr2">BORROW</div><div id="tr3">CREATE DEMAND</div></div>', "center", track=2,
     style="justify-content:flex-end;padding-right:180px" if Path(ROOT / "assets/img/eccles_1937.jpg").exists() else "")
for k, wd in ((1, "spend"), (2, "borrow"), (3, "demand")):
    J.append(f'tl.fromTo("#tr{k}",{{opacity:0,x:40,filter:"blur(10px)"}},{{opacity:1,x:0,filter:"blur(0px)",duration:0.4,ease:"power2.out"}},{T(wd, 21):.3f});')
J.append('tl.to(".triad",{opacity:0,duration:0.35},27.6);')
kinetic(27.95, 33.2, "Recessions were no longer corrections to endure, but failures to manage from the center.", 60, hl={"center"})

# --- S2 Hayek -------------------------------------------------------------
if Path(ROOT / "assets/img/hayek_1981.jpg").exists():
    photo(33.2, 37.35, "hayek_1981", "FRIEDRICH A. HAYEK · LSE · 1981", w=1300)
else:
    photo(33.2, 37.35, "hayek_portrait", "FRIEDRICH A. HAYEK · 1899–1992", w=560)
nodes = [("CHEAP CREDIT", "falsifies"), ("FALSE PRICE SIGNALS", "interest"), ("MALINVESTMENT", "businesses"), ("BUST", "bust")]
nh = "".join(f'<div class="node" id="nd{k}">{"<i id=nd3r></i>" if k == 3 else ""}<span>{esc(n)}</span></div>' + ('<div class="arrow" id="ar%d">→</div>' % k if k < 3 else "") for k, (n, _) in enumerate(nodes))
clip(37.35, 45.75, f'<div class="flow">{nh}</div><div class="flowsrc">HAYEK · PRICES AND PRODUCTION · 1931</div>', "center")
for k, (_, wd) in enumerate(nodes):
    t = T(wd, 37)
    J.append(f'tl.fromTo("#nd{k}",{{opacity:0,y:20}},{{opacity:1,y:0,duration:0.4,ease:"power2.out"}},{t:.3f});')
    if k < 3:
        J.append(f'tl.fromTo("#ar{k}",{{opacity:0}},{{opacity:1,duration:0.3}},{t + 0.3:.3f});')
J.append(f'tl.fromTo("#nd3r",{{opacity:0}},{{opacity:1,duration:0.2}},{T("bust", 43):.3f});')
J.append(f'tl.to(".flow",{{opacity:0,duration:0.35}},45.4);')
sound("impact-bass-2", T("bust", 43), 0.2)
book(45.75, 52.5, ["Prices and Production — 1931", "The Road to Serfdom — 1944", "The Constitution of Liberty — 1960"],
     hl=1, hl_at=46.2, tag="F. A. HAYEK", size=84)

# --- S3 post-war triumph -------------------------------------------------
photo(52.5, 55.15, "white_keynes", "HARRY DEXTER WHITE & J. M. KEYNES · 1946", w=520)
book(55.15, 61.25, ["The Economy:", "“We Are All Keynesians Now”", "Time magazine cover story"], hl=1, hl_at=59.0,
     tag="TIME · DECEMBER 31, 1965", size=92, hl_color="blue")
if Path(ROOT / "assets/img/nixon.jpg").exists():
    photo(61.25, 67.45, "nixon", "", w=560, x=-460)
clip(61.25, 67.45, '<div class="nquote" id="nq"><div class="glitch small" data-text="“I AM NOW A KEYNESIAN IN ECONOMICS.”">“I AM NOW A KEYNESIAN IN ECONOMICS.”</div>'
     '<div class="gsub">RICHARD NIXON · JANUARY 1971</div></div>', "center", track=2, style="justify-content:flex-end;padding-right:150px")
J.append(f'tl.fromTo("#nq",{{opacity:0}},{{opacity:1,duration:0.5}},{T("I", 64):.3f});')
J.append('tl.to("#nq",{opacity:0,duration:0.3},67.1);')
clip(67.45, 73.1, '<div class="gold"><div class="gdate" id="gd">AUGUST 15, 1971</div>'
     '<div class="peg" id="pg"><span>US $</span><span class="chain" id="chn"></span><span id="pgg">GOLD · $35 / OZ</span></div>'
     '<div class="gone" id="gn">THE LAST ANCHOR — GONE</div></div>', "center")
J.append('tl.fromTo("#gd",{opacity:0,scaleX:1.3},{opacity:1,scaleX:1,duration:0.6,ease:"expo.out"},67.5);')
J.append('tl.fromTo("#pg",{opacity:0},{opacity:1,duration:0.4},67.9);')
J.append(f'tl.fromTo("#chn",{{scaleX:1}},{{scaleX:0,duration:0.25,ease:"power4.in",immediateRender:false}},{T("window", 68):.3f});')
J.append(f'tl.fromTo("#pgg",{{x:0,opacity:1}},{{x:220,opacity:0.25,duration:1.2,ease:"power2.out",immediateRender:false}},{T("window", 68) + 0.2:.3f});')
J.append(f'tl.fromTo("#gn",{{opacity:0,y:20}},{{opacity:1,y:0,duration:0.5}},{T("anchor", 70):.3f});')
sound("impact-bass-1", T("window", 68), 0.22)

# --- S4 stagflation ------------------------------------------------------
cpi = [(1965, 1.9), (1966, 3.5), (1967, 3.0), (1968, 4.7), (1969, 6.2), (1970, 5.6), (1971, 3.3), (1972, 3.4), (1973, 8.7), (1974, 12.3),
       (1975, 6.9), (1976, 4.9), (1977, 6.7), (1978, 9.0), (1979, 13.3), (1980, 12.5), (1981, 8.9), (1982, 3.8), (1983, 3.8), (1984, 3.9), (1985, 3.8)]
un = [(1965, 4.5), (1966, 3.8), (1967, 3.8), (1968, 3.6), (1969, 3.5), (1970, 4.9), (1971, 5.9), (1972, 5.6), (1973, 4.9), (1974, 5.6),
      (1975, 8.5), (1976, 7.7), (1977, 7.1), (1978, 6.1), (1979, 5.8), (1980, 7.1), (1981, 7.6), (1982, 9.7), (1983, 9.6), (1984, 7.5), (1985, 7.2)]
chart(73.1, 79.15, [(cpi, "#ff4d4d", "INFLATION"), (un, "#e8e8e8", "UNEMPLOYMENT")], (1965, 1985), (0, 15),
      draw_at=T("1970s", 75.5) - 0.3, draw_dur=2.6, title="INFLATION AND UNEMPLOYMENT WERE SUPPOSED TO TRADE OFF",
      yticks=(0, 5, 10, 15), xticks=(1965, 1970, 1975, 1980, 1985), note="SOURCE: BLS VIA FRED (CPIAUCSL, UNRATE) · ANNUAL")
stat(79.15, 84.25, 14.8, "CONSUMER PRICE INFLATION", "MARCH 1980 · YEAR OVER YEAR", count_from=0, suffix="%",
     at=T("14.8 percent", 79) - 0.6, dur=1.0, bg="gas_line", color="#ff4d4d")
sound("impact-bass-2", T("14.8 percent", 79), 0.18)
if Path(ROOT / "assets/img/reagan_volcker.jpg").exists():
    photo(84.25, 89.75, "reagan_volcker", "PAUL VOLCKER & RONALD REAGAN · 1981", w=1000, x=-330, dim=True)
clip(84.25, 89.75, f'<div class="twostat"><div id="ts1"><b>~20%</b><span>FED FUNDS RATE · 1981</span></div>'
     f'<div id="ts2"><b>10.8%</b><span>UNEMPLOYMENT · 1982</span></div></div>', "center", track=2, style="justify-content:flex-end;padding-right:170px")
J.append(f'tl.fromTo("#ts1",{{opacity:0,x:40}},{{opacity:1,x:0,duration:0.4}},{T("20 percent", 85):.3f});')
J.append(f'tl.fromTo("#ts2",{{opacity:0,x:40}},{{opacity:1,x:0,duration:0.4}},{T("10.8 percent", 85):.3f});')
J.append('tl.to(".twostat",{opacity:0,duration:0.3},89.4);')
photo(89.75, 94.1, "friedman", "MILTON FRIEDMAN · PREDICTED THE BREAKDOWN IN 1967", w=560)

# --- S5 the quote ----------------------------------------------------------
book(94.1, 97.45, ["A TRACT ON", "MONETARY REFORM", "J. M. KEYNES · 1923"], hl=1, hl_at=94.6, tag="MACMILLAN · LONDON", size=96)
qlines = [("But this long run is a misleading guide to current affairs.", "But", 97), ("In the long run we are all dead.", "In", 101),
          ("Economists set themselves too easy, too useless a task if in", "Economists", 103.5),
          ("tempestuous seasons they can only tell us that when the storm", "tempestuous", 107), ("is long past the ocean is flat again.", "is", 110)]
QM = '<span class="mark red" id="qm"></span>'
qh = "".join(f'<div class="ql{" qhl" if k == 1 else ""}" id="ql{k}">{QM if k == 1 else ""}<span class="btxt">{esc(t)}</span></div>' for k, (t, _, _) in enumerate(qlines))
clip(97.45, 113.1, f'<div class="quote">{qh}<div class="qsrc">— JOHN MAYNARD KEYNES, <i>A TRACT ON MONETARY REFORM</i> (1923), CH. 3</div></div>', "center")
for k, (_, wd, af) in enumerate(qlines):
    J.append(f'tl.fromTo("#ql{k}",{{opacity:0,filter:"blur(10px)"}},{{opacity:1,filter:"blur(0px)",duration:0.6}},{T(wd, af) - 0.1:.3f});')
J.append(f'tl.fromTo("#qm",{{scaleX:0}},{{scaleX:1,duration:0.8,ease:"power3.inOut"}},{T("dead", 101) - 0.4:.3f});')
J.append('tl.fromTo(".qsrc",{opacity:0},{opacity:1,duration:0.6},104.2);')
J.append('tl.to(".quote",{opacity:0,duration:0.4},112.7);')
sound("impact-bass-1", T("dead", 101), 0.16)

# --- S6 short-run politics -------------------------------------------------
kinetic(113.1, 118.85, "Whatever he meant by it, the long run became something politics could safely ignore.", 60, hl={"ignore"})
if Path(ROOT / "assets/img/capitol.jpg").exists():
    photo(118.85, 125.25, "capitol", "", pos="full", push=1.08, dim=True)
book(118.85, 125.25, ["Democracy in Deficit:", "The Political Legacy of Lord Keynes", "James M. Buchanan & Richard E. Wagner"], hl=1, hl_at=122.2,
     tag="1977 · BUCHANAN: NOBEL PRIZE IN ECONOMICS, 1986", size=80)
clip(125.25, 133.1, '<div class="arrowline"><div class="al-now" id="aln"><b>NOW</b><span>SPENDING WINS VOTES</span></div>'
     '<div class="al-bar" id="alb"></div><div class="al-later" id="all"><b>LATER</b><span>THE BILL ARRIVES</span></div></div>'
     '<div class="al-who" id="alw">ADDRESSED TO PEOPLE TOO YOUNG TO VOTE — OR NOT YET BORN</div>', "center")
J.append(f'tl.fromTo("#aln",{{opacity:0,y:20}},{{opacity:1,y:0,duration:0.4}},{T("Spending", 125):.3f});')
J.append(f'tl.fromTo("#alb",{{scaleX:0}},{{scaleX:1,duration:1.0,ease:"power2.inOut"}},{T("bill", 127):.3f});')
J.append(f'tl.fromTo("#all",{{opacity:0,y:20}},{{opacity:1,y:0,duration:0.4}},{T("later", 127):.3f});')
J.append(f'tl.fromTo("#alw",{{opacity:0}},{{opacity:1,duration:0.5}},{T("addressed", 128):.3f});')
J.append('tl.to(".arrowline,#alw",{opacity:0,duration:0.35},132.7);')

# --- S7 the bill -----------------------------------------------------------
sq = "".join(f'<div class="yr{" surplus" if y == 2001 else ""}" id="y{y}"><i></i><span>{y}</span></div>' for y in range(1998, 2026))
clip(133.1, 136.95, f'<div class="years">{sq}</div><div class="ylab"><span class="sw"></span>SURPLUS <span class="dw"></span>DEFICIT · SOURCE: OMB HISTORICAL TABLE 1.1</div>', "center")
for k, y in enumerate(range(1998, 2026)):
    J.append(f'tl.fromTo("#y{y}",{{opacity:0,y:14}},{{opacity:1,y:0,duration:0.25}},{133.3 + k * 0.08:.3f});')
J.append('tl.to(".years,.ylab",{opacity:0,duration:0.3},136.6);')
debt = [(1940, 50.4), (1943, 79.1), (1946, 118.9), (1950, 92.1), (1955, 69.6), (1960, 54.3), (1965, 45.9), (1970, 36.2), (1974, 31.7),
        (1980, 31.8), (1985, 42.6), (1990, 54.2), (1995, 64.4), (2000, 55.4), (2005, 61.8), (2008, 67.7), (2010, 90.4), (2015, 99.8),
        (2020, 126.1), (2022, 119.8), (2025, 121.0)]
chart(136.95, 142.95, [(debt, "#ff4d4d", "DEBT / GDP")], (1940, 2025), (0, 140), draw_at=137.0, draw_dur=1.5,
      title="FEDERAL DEBT AS A SHARE OF THE ECONOMY", yticks=(0, 50, 100), xticks=(1940, 1960, 1980, 2000, 2020),
      labels=[(1946, 118.9, "WWII PEAK", 137.4, "#ff4d4d"), (1974, 31.7, "1974 LOW", 137.9, "#ff4d4d"), (2025, 121.0, "$37 TRILLION", 138.6, "#ff4d4d")],
      note="SOURCE: OMB HISTORICAL TABLE 7.1; FRED GFDEGDQ188S · GROSS FEDERAL DEBT")
clip(142.95, 148.05, '<div class="bars"><div class="bar"><div class="bfill red" id="bi"></div><b>$881B</b><span>NET INTEREST</span></div>'
     '<div class="bar"><div class="bfill" id="bd"></div><b>$874B</b><span>NATIONAL DEFENSE</span></div></div><div class="bsrc">FISCAL YEAR 2024 · SOURCE: CBO MONTHLY BUDGET REVIEW</div>', "center")
J.append(f'tl.fromTo("#bi",{{scaleY:0}},{{scaleY:1,duration:1.0,ease:"power3.out"}},{T("interest", 143):.3f});')
J.append(f'tl.fromTo("#bd",{{scaleY:0}},{{scaleY:1,duration:1.0,ease:"power3.out"}},{T("defense", 145) - 0.3:.3f});')
J.append('tl.to(".bars,.bsrc",{opacity:0,duration:0.3},147.7);')
if Path(ROOT / "assets/img/bep_printing.jpg").exists():
    photo(148.05, 155.35, "bep_printing", "", pos="full", push=1.08, dim=True)
stat(148.05, 155.35, 0.13, "WHAT A 1971 DOLLAR BUYS TODAY", "SOURCE: BLS CPI-U VIA FRED · AUG 1971 → 2025", count_from=1.0, fmt="{:.2f}", prefix="$",
     at=T("lost", 150), dur=2.2, color="#fff")
kinetic(155.35, 159.1, "A tax on savings no one ever voted for.", 76, hl={"tax", "savings"})

# --- S8 close ----------------------------------------------------------------
if Path(ROOT / "assets/img/hayek_1981.jpg").exists():
    photo(159.1, 165.95, "hayek_1981", "", pos="full", push=1.06, dim=True)
clip(159.1, 165.95, '<div class="quote closing"><div class="ql" id="hq">“The curious task of economics is to demonstrate to men how little they really know about what they imagine they can design.”</div>'
     '<div class="qsrc">— F. A. HAYEK, <i>THE FATAL CONCEIT</i> (1988)</div></div>', "center", track=2)
J.append('tl.fromTo("#hq",{opacity:0,filter:"blur(10px)"},{opacity:1,filter:"blur(0px)",duration:0.8},159.3);')
J.append('tl.to(".closing",{opacity:0,duration:0.4},165.5);')
kinetic(165.95, 168.75, "Keynes promised to manage the storm.", 68)
kinetic(168.75, 171.55, "Instead, we inherited the debt.", 68, hl={"debt"})
glitch(171.55, 173.6, "THE LONG RUN IS HERE.", 96, sfx="impact-bass-1")
kinetic(173.6, 176.2, "And we are the ones living in it.", 60)
clip(176.2, TOTAL, '<div class="endcard" id="ec"><div>IN THE LONG RUN</div><span>SOURCES IN DESCRIPTION</span></div>', "center")
J.append('tl.fromTo("#ec",{opacity:0},{opacity:1,duration:0.8},176.3);')
sound("riser", 161.4, 0.1)

# scene-change whooshes (subtle)
for t in (12.45, 33.2, 52.5, 73.1, 94.1, 133.1, 159.1):
    sound("whoosh-short", t - 0.15, 0.2)

# ---------- captions ----------
C = []
for k, cue in enumerate(cue_groups()):
    st, en = cue[0]["start"] - 0.05, cue[-1]["end"] + 0.25
    nxt_start = None
    spans = []
    for w in cue:
        sid = nid("w")
        spans.append(f'<span id="{sid}">{esc(w["text"])}</span>')
        J.append(f'tl.fromTo("#{sid}",{{opacity:0.28}},{{opacity:1,duration:0.08}},{w["start"]:.3f});')
    C.append((st, en, " ".join(spans)))
for k, (st, en, sp) in enumerate(C):
    if k + 1 < len(C):
        en = min(en, C[k + 1][0])
    H.append(f'<div class="clip cap" data-start="{st:.3f}" data-duration="{en - st:.3f}" data-track-index="6"><div class="capt">{sp}</div></div>')

# ---------- assemble ----------
css = (ROOT / "style.css").read_text()
page = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=1920, height=1080" />
<script src="assets/js/gsap.min.js"></script>
<style>
{css}
</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="{TOTAL}" data-width="1920" data-height="1080">
<div id="bg"></div>
{chr(10).join(H)}
<div id="grain" class="clip" data-start="0" data-duration="{TOTAL}" data-track-index="8"></div>
<div id="vignette" class="clip" data-start="0" data-duration="{TOTAL}" data-track-index="9"></div>
<audio id="vo" src="assets/audio/vo.mp3" data-start="0" data-duration="176.112" data-track-index="10" data-volume="1"></audio>
{chr(10).join(A)}
</div>
<script>
function fmtN(v,f){{var d=(f.match(/\\.(\\d)f/)||[0,0])[1]|0;return v.toFixed(d);}}
const tl = gsap.timeline({{ paused: true }});
tl.to("#grain",{{backgroundPosition:"317px 211px",duration:{TOTAL},ease:"steps({int(TOTAL * 12)})"}},0);
{chr(10).join(J)}
window.__timelines["main"] = tl;
tl.seek(0);
</script>
</body>
</html>
"""
(ROOT / "index.html").write_text(page)
print("wrote index.html", len(H), "clips,", len(C), "caption cues,", len(A), "sfx")
