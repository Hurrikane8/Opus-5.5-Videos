"""Manim physics plates for "The Hardest Part".

Each scene renders to a transparent PNG sequence that the film engine composites over the
3D shots (see engine/src/core/plates.js). Build all of them with:

    python manim/build_plates.py            # 30 fps preview plates
    python manim/build_plates.py --fps 60   # final

Pixel sizes are 2x the on-screen design size so plates stay crisp at 4K.
"""
from manim import *

CYAN = ManimColor("#6FE3FF")
AMBER = ManimColor("#FFC15A")
RED = ManimColor("#FF4A3D")
WHITE_ = ManimColor("#F3F5F7")
DIM = ManimColor("#9AA3AD")
MONO = "IBM Plex Mono"
SANS = "Inter"

config.background_opacity = 0.0


def label(text, size=22, color=DIM, font=MONO):
    return Text(text, font=font, color=color).scale(size / 48)


def axes(x_len, y_len, xr=(0, 1), yr=(0, 1)):
    return Axes(
        x_range=[xr[0], xr[1], (xr[1] - xr[0]) / 4], y_range=[yr[0], yr[1], (yr[1] - yr[0]) / 4],
        x_length=x_len, y_length=y_len, tips=True,
        axis_config={"color": DIM, "stroke_width": 2.5, "include_ticks": False, "tip_width": 0.18, "tip_height": 0.18},
    )


class TorquePlate(Scene):
    """τ = k_t · I — torque is linear in current."""

    def construct(self):
        eq = MathTex(r"\tau", r"=", r"k_t", r"\cdot", r"I", font_size=110)
        eq[0].set_color(WHITE_)
        eq[2].set_color(CYAN)
        eq[4].set_color(AMBER)
        eq.to_edge(UP, buff=0.35)
        sub = label("TORQUE IS PROPORTIONAL TO CURRENT", 20).next_to(eq, DOWN, buff=0.22)
        self.play(Write(eq), run_time=0.8)
        self.play(FadeIn(sub, shift=UP * 0.1), run_time=0.3)
        ax = axes(8.4, 3.9).to_edge(DOWN, buff=0.45)
        xl = MathTex("I", font_size=60, color=AMBER).next_to(ax.x_axis.get_end(), RIGHT, buff=0.15)
        yl = MathTex(r"\tau", font_size=60, color=WHITE_).next_to(ax.y_axis.get_end(), UP, buff=0.1)
        self.play(Create(ax), FadeIn(xl), FadeIn(yl), run_time=0.45)
        line = ax.plot(lambda x: 0.9 * x, x_range=[0, 1.0], color=WHITE_, stroke_width=5)
        self.play(Create(line), run_time=0.5)
        k = ValueTracker(0.25)
        dot = always_redraw(lambda: Dot(ax.c2p(k.get_value(), 0.9 * k.get_value()), radius=0.11, color=CYAN))
        vline = always_redraw(lambda: DashedLine(ax.c2p(k.get_value(), 0), ax.c2p(k.get_value(), 0.9 * k.get_value()), color=AMBER, stroke_width=3, dash_length=0.12))
        hline = always_redraw(lambda: DashedLine(ax.c2p(0, 0.9 * k.get_value()), ax.c2p(k.get_value(), 0.9 * k.get_value()), color=WHITE_, stroke_width=3, dash_length=0.12))
        slope = label("slope = kₜ  (N·m / A)", 20, CYAN).move_to(ax.c2p(0.62, 0.3))
        self.add(vline, hline, dot)
        self.play(FadeIn(slope), k.animate.set_value(0.95), run_time=1.25, rate_func=smooth)
        self.wait(0.6)


class GearPlate(Scene):
    """Gear reduction trades speed for torque."""

    def construct(self):
        w = MathTex(r"\omega_{out}", r"=", r"\omega_{in}", r"/", r"N", font_size=76)
        t = MathTex(r"\tau_{out}", r"=", r"N", r"\cdot", r"\eta", r"\cdot", r"\tau_{in}", font_size=76)
        w[2].set_color(CYAN)
        t[6].set_color(CYAN)
        t[2].set_color(WHITE_)
        grp = VGroup(w, t).arrange(DOWN, buff=0.5, aligned_edge=LEFT).move_to(ORIGIN).shift(LEFT * 1.6)
        self.play(Write(w), run_time=0.7)
        self.play(Write(t), run_time=0.7)
        n = MathTex(r"N = 50", font_size=68, color=WHITE_)
        e = MathTex(r"\eta \approx 0.8", font_size=54, color=DIM)
        side = VGroup(n, e).arrange(DOWN, buff=0.3, aligned_edge=LEFT).next_to(grp, RIGHT, buff=1.0)
        box = SurroundingRectangle(n, color=CYAN, buff=0.18, stroke_width=3, corner_radius=0.08)
        self.play(FadeIn(n, shift=LEFT * 0.2), Create(box), run_time=0.5)
        self.play(FadeIn(e), run_time=0.3)
        self.wait(0.8)


class LoopPlate(Scene):
    """Closed-loop position control: the encoder closes the loop."""

    def construct(self):
        def block(txt, w=3.1):
            r = RoundedRectangle(width=w, height=1.0, corner_radius=0.14, stroke_color=WHITE_, stroke_width=2.5, fill_color=BLACK, fill_opacity=0.35)
            return VGroup(r, label(txt, 22, WHITE_).move_to(r))
        tgt = MathTex(r"\theta^{*}", font_size=64, color=CYAN)
        summ = Circle(radius=0.32, stroke_color=WHITE_, stroke_width=2.5)
        sig = MathTex(r"\Sigma", font_size=40, color=WHITE_).move_to(summ)
        ctl = block("CONTROLLER")
        mot = block("MOTOR + GEAR")
        out = MathTex(r"\theta", font_size=64, color=WHITE_)
        row = VGroup(tgt, VGroup(summ, sig), ctl, mot, out).arrange(RIGHT, buff=0.7).shift(UP * 0.9)
        enc = block("ENCODER", 2.6).move_to([mot.get_center()[0] - 1.6, -1.4, 0])
        arrows = VGroup(
            Arrow(tgt.get_right(), summ.get_left(), buff=0.1, stroke_width=4, color=DIM, max_tip_length_to_length_ratio=0.25),
            Arrow(summ.get_right(), ctl.get_left(), buff=0.08, stroke_width=4, color=DIM, max_tip_length_to_length_ratio=0.25),
            Arrow(ctl.get_right(), mot.get_left(), buff=0.08, stroke_width=4, color=DIM, max_tip_length_to_length_ratio=0.25),
            Arrow(mot.get_right(), out.get_left(), buff=0.1, stroke_width=4, color=DIM, max_tip_length_to_length_ratio=0.25),
        )
        p0 = out.get_bottom() + DOWN * 0.1
        fb = VMobject(stroke_color=DIM, stroke_width=4)
        fb.set_points_as_corners([out.get_bottom() + DOWN * 0.1, [p0[0], -1.4, 0], enc.get_right()])
        fb2 = Arrow(enc.get_left(), [summ.get_center()[0], -1.4, 0] + RIGHT * 0.0, buff=0.0, stroke_width=4, color=DIM, max_tip_length_to_length_ratio=0.0)
        up = Arrow([summ.get_center()[0], -1.4, 0], summ.get_bottom(), buff=0.0, stroke_width=4, color=DIM, max_tip_length_to_length_ratio=0.2)
        minus = MathTex("-", font_size=48, color=RED).next_to(summ, DOWN + LEFT, buff=0.02)
        self.play(LaggedStart(FadeIn(tgt), Create(summ), FadeIn(sig), FadeIn(ctl), FadeIn(mot), FadeIn(out), lag_ratio=0.12), run_time=0.7)
        self.play(LaggedStart(*[GrowArrow(a) for a in arrows], lag_ratio=0.15), run_time=0.5)
        self.play(Create(fb), FadeIn(enc), Create(fb2), GrowArrow(up), FadeIn(minus), run_time=0.5)
        rate = label("≈ 10,000 TIMES PER SECOND", 20, CYAN).to_edge(DOWN, buff=0.25)
        yr = summ.get_center()[1]
        path = VMobject().set_points_as_corners([summ.get_right(), [p0[0], yr, 0], [p0[0], -1.4, 0], [summ.get_center()[0], -1.4, 0], summ.get_bottom()])
        pulse = VGroup(Dot(radius=0.2, color=CYAN, fill_opacity=0.25), Dot(radius=0.09, color=WHITE_))
        self.play(FadeIn(rate), MoveAlongPath(pulse, path), run_time=0.5, rate_func=linear)
        for _ in range(3):
            self.play(MoveAlongPath(pulse, path), run_time=0.22, rate_func=linear)
        self.wait(0.3)


class HeatPlate(Scene):
    """Copper loss: P = I²R and τ ∝ I, so heat grows with torque squared."""

    def construct(self):
        eq = MathTex(r"P_{loss}", r"=", r"I^2", r"R", font_size=96)
        eq[0].set_color(AMBER)
        eq.to_edge(UP, buff=0.3).to_edge(LEFT, buff=0.6)
        self.play(Write(eq), run_time=0.6)
        ax = axes(7.2, 4.2, (0, 2.3), (0, 5.6)).to_edge(DOWN, buff=0.6).to_edge(LEFT, buff=1.7)
        xl = label("TORQUE", 20, WHITE_).next_to(ax.x_axis.get_end(), RIGHT, buff=0.15)
        yl = label("HEAT", 20, AMBER).next_to(ax.y_axis.get_end(), RIGHT, buff=0.2)
        self.play(Create(ax), FadeIn(xl), FadeIn(yl), run_time=0.4)
        curve = ax.plot(lambda x: x * x, x_range=[0, 2.22], color=AMBER, stroke_width=6)
        limit = DashedLine(ax.c2p(0, 4.9), ax.c2p(2.3, 4.9), color=RED, stroke_width=3, dash_length=0.15)
        lim_l = label("THERMAL LIMIT", 18, RED).next_to(limit, UP, buff=0.08).align_to(limit, RIGHT)
        self.play(Create(curve), run_time=0.7)
        self.play(Create(limit), FadeIn(lim_l), run_time=0.3)

        def marker(x, txt, color, size):
            d = Dot(ax.c2p(x, x * x), radius=0.12, color=color)
            v = DashedLine(ax.c2p(x, 0), ax.c2p(x, x * x), color=DIM, stroke_width=3, dash_length=0.1)
            h = DashedLine(ax.c2p(0, x * x), ax.c2p(x, x * x), color=DIM, stroke_width=3, dash_length=0.1)
            t = Text(txt, font=SANS, weight=LIGHT, color=color).scale(size / 48).next_to(ax.c2p(0, x * x), LEFT, buff=0.18)
            xt = MathTex(r"\tau" if x < 1.5 else r"2\tau", font_size=52, color=WHITE_).next_to(ax.c2p(x, 0), DOWN, buff=0.18)
            return VGroup(v, h, d, t, xt)
        m1 = marker(1.0, "1×", WHITE_, 40)
        self.play(FadeIn(m1), run_time=0.35)
        self.wait(0.3)
        m2 = marker(2.0, "4×", AMBER, 64)
        self.play(FadeIn(m2, scale=1.1), run_time=0.45)
        prop = MathTex(r"\tau = k_t I", r"\;\Rightarrow\;", r"P_{loss} \propto \tau^2", font_size=64)
        prop[2].set_color(AMBER)
        prop.next_to(eq, DOWN, buff=0.3, aligned_edge=LEFT)
        self.play(FadeIn(prop, shift=LEFT * 0.2), run_time=0.45)
        self.wait(1.2)
