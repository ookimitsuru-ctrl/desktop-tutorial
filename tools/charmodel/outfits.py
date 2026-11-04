"""衣装と髪型の SDF 部品。gen_model.py から呼ばれる。

costume["outfit"] は部品名のリスト。各部品は Prim を返す。
"""
import math

import numpy as np

import sdf

SKIN, HAIR, PRIMARY, SECONDARY, ACCENT, GLOVES, SHOES, EYE_WHITE, DARK, LIPS, METAL, TERTIARY = range(12)
MT_SKIN, MT_CLOTH, MT_HAIR, MT_LEATHER, MT_EYE = 0.0, 0.25, 0.5, 0.75, 1.0

UP = np.array([0, 1, 0], dtype=np.float32)
DOWN = -UP


def _cut(p, cuts):
    p.cut = None
    if cuts:
        # 複数の切断面を順に適用するため、eval をラップ
        base_eval = p.eval
        cs = [(np.asarray(n, dtype=np.float32), np.asarray(o, dtype=np.float32)) for n, o in cuts]

        def ev(P, base_eval=base_eval, cs=cs):
            d = base_eval(P)
            for n, o in cs:
                d = np.maximum(d, np.sum((P - o) * n, axis=-1))
            return d
        p.eval = ev
    return p


def torso_shell(B, Prim, v3, slot, grow, top_y, bottom_y, cuts=(), mtype=MT_CLOTH, k=0.03):
    s, p = B.s, B.p
    T = p["torso"]
    F = p["fat"]
    M = p["mus"]
    hips, spine, chest, neck = B.j("Hips"), B.j("Spine"), B.j("Chest"), B.j("Neck")
    sw = abs(B.j("RightUpperArm")[0]) / (0.185 * s)
    # 筋肉・脂肪の多い体型は服の余裕を足す（体の形状が服の外にはみ出さないように）
    g = grow + 0.032 * s * max(0.0, M - 1.0) + 0.035 * s * F
    pr = [
        Prim("ell", [v3(chest + [0, 0.10 * s, 0.005]), v3([0.150 * s * sw * T + g, 0.150 * s + g, 0.105 * s * T + g])], B.b("Chest"), slot, mtype, k=k, layer="cloth"),
        Prim("ell", [v3(spine + [0, 0.05 * s, 0.0]), v3([(0.125 + 0.05 * F) * s * T + g, 0.13 * s + g, (0.090 + 0.05 * F) * s * T + g])], B.b("Spine"), slot, mtype, k=k, layer="cloth"),
        Prim("ell", [v3(hips + [0, -0.02 * s, 0.005]), v3([(0.140 + 0.03 * F) * s * T + g, 0.10 * s + g, 0.095 * s * T + g])], B.b("Hips"), slot, mtype, k=k, layer="cloth"),
        Prim("ell", [v3(neck + [0, -0.035 * s, 0.025 * s]), v3([0.12 * s * M * sw + g, 0.045 * s + g, 0.05 * s + g])], B.b("Chest"), slot, mtype, k=k, layer="cloth"),
    ]
    for sx in (-1, 1):
        if B.female:
            pr.append(Prim("ell", [v3(chest + [sx * 0.058 * s, 0.075 * s, -0.075 * s]), v3([0.060 * s + g, 0.058 * s + g, 0.050 * s + g])], B.b("Chest"), slot, mtype, k=k, layer="cloth"))
        else:
            pr.append(Prim("ell", [v3(chest + [sx * 0.062 * s, 0.10 * s, -0.070 * s]), v3([0.070 * s * M + g, 0.050 * s + g, 0.040 * s * M + g])], B.b("Chest"), slot, mtype, k=k, layer="cloth"))
        pr.append(Prim("ell", [v3(chest + [sx * 0.10 * s, 0.03 * s, 0.03 * s]), v3([0.055 * s * M + g, 0.11 * s + g, 0.065 * s + g])], B.b("Chest"), slot, mtype, k=k, layer="cloth"))
        pr.append(Prim("ell", [v3(hips + [sx * 0.065 * s, -0.06 * s, 0.055 * s]), v3([0.075 * s + g, 0.08 * s + g, 0.065 * s + g])], B.b("Hips"), slot, mtype, k=k, layer="cloth"))
    allc = [((0, 1, 0), (0, top_y, 0)), ((0, -1, 0), (0, bottom_y, 0))] + list(cuts)
    return [_cut(x, allc) for x in pr]


def sleeve(B, Prim, v3, nm, slot, grow, length, flare=0.0, mtype=MT_CLOTH, k=0.02):
    """length: 0..1 = 肩→手首の割合"""
    s, L = B.s, B.p["limb"]
    sh, el, wr = B.j(nm + "UpperArm"), B.j(nm + "LowerArm"), B.j(nm + "Hand")
    ua, la = B.b(nm + "UpperArm"), B.b(nm + "LowerArm")
    pr = [Prim("sphere", [v3(sh + (el - sh) * 0.08 + [0, 0.012 * s, 0]), 0.060 * s * B.p["mus"] * L + grow], ua, slot, mtype, k=k, layer="cloth")]
    if length <= 0.55:
        t = length / 0.55
        end = sh + (el - sh) * t
        pr.append(Prim("cone", [sh, v3(end), 0.050 * s * L + grow, 0.045 * s * L + grow + flare], ua, slot, mtype, k=k, layer="cloth"))
    else:
        pr.append(Prim("cone", [sh, el, 0.050 * s * L + grow, 0.042 * s * L + grow + flare * 0.5], ua, slot, mtype, k=k, layer="cloth"))
        t = (length - 0.55) / 0.45
        end = el + (wr - el) * t
        pr.append(Prim("cone", [el, v3(end), 0.043 * s * L + grow + flare * 0.5, 0.034 * s * L + grow + flare], la, slot, mtype, k=k, layer="cloth"))
    return pr


def pant_leg(B, Prim, v3, nm, slot, grow, length, flare=0.0, mtype=MT_CLOTH, k=0.02):
    """length: 0..1 = 股関節→足首の割合"""
    s, L, F = B.s, B.p["limb"], B.p["fat"]
    grow = grow + 0.03 * s * F + 0.012 * s * max(0.0, B.p["mus"] - 1.0)
    hp, kn, an = B.j(nm + "UpperLeg"), B.j(nm + "LowerLeg"), B.j(nm + "Foot")
    ul, ll = B.b(nm + "UpperLeg"), B.b(nm + "LowerLeg")
    pr = []
    if length <= 0.5:
        t = length / 0.5
        end = hp + (kn - hp) * t
        pr.append(Prim("cone", [hp + [0, 0.03 * s, 0], v3(end), 0.090 * s * L * (1 + 0.15 * F) + grow, 0.07 * s * L + grow + flare], ul, slot, mtype, k=k, layer="cloth"))
    else:
        pr.append(Prim("cone", [hp + [0, 0.03 * s, 0], kn, 0.090 * s * L * (1 + 0.15 * F) + grow, 0.056 * s * L + grow + flare * 0.4], ul, slot, mtype, k=k, layer="cloth"))
        t = (length - 0.5) / 0.5
        end = kn + (an - kn) * t
        pr.append(Prim("cone", [kn, v3(end), 0.055 * s * L + grow + flare * 0.4, 0.040 * s * L + grow + flare], ll, slot, mtype, k=k, layer="cloth"))
    # 太ももの筋肉（体の形状と同じ楕円 + 余裕）を覆う
    M = B.p["mus"]
    if length >= 0.3 and M > 1.05:
        R = sdf.frame_from(kn - hp)
        q = Prim("ell", [v3(hp + (kn - hp) * 0.38 + [0, 0, -0.02 * s]), v3([0.072 * s * M * L + grow, 0.17 * s, 0.070 * s * L + grow]), R],
                 ul, slot, mtype, k=k, layer="cloth")
        if length < 0.5:
            cut_y = (hp + (kn - hp) * (length / 0.5))
            q = _cut(q, [((0, -1, 0), (0, cut_y[1], 0))])
        pr.append(q)
    return pr


def foot_shell(B, Prim, v3, nm, slot, grow, high=0.0, mtype=MT_LEATHER):
    s = B.s
    an, to = B.j(nm + "Foot"), B.j(nm + "Toes")
    tt = B.t(nm + "Toes")
    fb, tb = B.b(nm + "Foot"), B.b(nm + "Toes")
    d = to - an
    d[1] = 0
    d /= np.linalg.norm(d)
    mid = (an + to) * 0.5
    mid[1] = 0.037 * s
    R = sdf.frame_from(d, (0, 1, 0)) @ np.array([[1, 0, 0], [0, 0, 1], [0, 1, 0]], dtype=np.float32)
    pr = [Prim("box", [v3(mid), v3([0.046 * s + grow, 0.034 * s + grow, 0.086 * s + grow]), 0.028 * s, R], fb, slot, mtype, k=0.02, layer="cloth"),
          Prim("sphere", [v3(an + [0, -0.035 * s, 0.03 * s]), 0.044 * s + grow], fb, slot, mtype, k=0.02, layer="cloth"),
          Prim("ell", [v3((to + tt) * 0.5 + [0, -0.004, -0.006]), v3([0.048 * s + grow, 0.024 * s + grow, 0.048 * s + grow])], tb, slot, mtype, k=0.015, layer="cloth")]
    if high > 0:
        kn = B.j(nm + "LowerLeg")
        top = an + (kn - an) * high
        pr.append(Prim("cone", [an + [0, -0.02 * s, 0], v3(top), 0.048 * s + grow, 0.047 * s + grow], B.b(nm + "LowerLeg"), slot, mtype, k=0.015, layer="cloth"))
    return pr


def hand_shell(B, Prim, v3, nm, slot, grow, fingers=True, forearm=0.0, mtype=MT_CLOTH):
    s = B.s
    hd, fi = B.j(nm + "Hand"), B.j(nm + "Fingers")
    d = (fi - hd) / np.linalg.norm(fi - hd)
    hb = B.b(nm + "Hand")
    pr = [Prim("ell", [v3(hd + d * 0.045 * s), v3([0.048 * s + grow, 0.050 * s + grow, 0.048 * s + grow]), sdf.frame_from(d)], hb, slot, mtype, k=0.01, layer="cloth")]
    pr[0].args[1][2] = 0.024 * s + grow
    if fingers:
        pr.append(Prim("ell", [v3(fi + d * 0.012 * s), v3([0.045 * s + grow, 0.018 * s + grow, 0.022 * s + grow]), sdf.frame_from(d)], B.b(nm + "Fingers"), slot, mtype, k=0.01, layer="cloth"))
    if forearm > 0:
        el, wr = B.j(nm + "LowerArm"), B.j(nm + "Hand")
        st = wr + (el - wr) * forearm
        pr.append(Prim("cone", [v3(st), wr, 0.036 * s + grow, 0.030 * s + grow], B.b(nm + "LowerArm"), slot, mtype, k=0.01, layer="cloth"))
    return pr


def belt(B, Prim, v3, slot, y_off=0.04, tails=True, width=0.020):
    s, T, F = B.s, B.p["torso"], B.p["fat"]
    hips = B.j("Hips")
    c = hips + v3([0, y_off * s, 0.008 * s])
    rx = (0.150 + 0.03 * F) * s * T
    # 楕円のトーラス（x 方向に引き伸ばし）
    R = np.diag([1.0, 1.0, 1.25]).astype(np.float32)
    pr = [Prim("torus", [v3(c), rx, width * s, R], B.b("Hips"), slot, MT_CLOTH, k=0.006, layer="cloth", bias=0.004)]
    knot = c + v3([-0.06 * s, -0.005 * s, -0.115 * s])
    pr.append(Prim("ell", [v3(knot), v3([0.035 * s, 0.025 * s, 0.022 * s])], B.b("Hips"), slot, MT_CLOTH, k=0.006, layer="cloth", bias=0.004))
    if tails:
        s1, s2, t2 = B.j("Sash1"), B.j("Sash2"), B.t("Sash2")
        pr.append(Prim("capsule", [v3(knot), v3(s2), 0.016 * s], B.b("Sash1"), slot, MT_CLOTH, k=0.004, layer="cloth", own_bone=True))
        pr.append(Prim("capsule", [v3(s2), v3(t2), 0.015 * s], B.b("Sash2"), slot, MT_CLOTH, k=0.004, layer="cloth", own_bone=True))
        pr.append(Prim("capsule", [v3(knot + [0.03 * s, 0, 0]), v3(s2 + [0.04 * s, 0.02, -0.01]), 0.014 * s], B.b("Sash1"), slot, MT_CLOTH, k=0.004, layer="cloth", own_bone=True))
    return pr


def clothes(B, c, Prim, v3):
    s = B.s
    pieces = c.get("outfit", [])
    if isinstance(pieces, str):
        pieces = [pieces]
    hips, chest, neck = B.j("Hips"), B.j("Chest"), B.j("Neck")
    top_neck = neck[1] - 0.02 * s
    pr = []
    # 衣装ごとの色スロット差し替え: {"部位名": {"primary": "tertiary", ...}}
    slot_names = {"skin": SKIN, "hair": HAIR, "primary": PRIMARY, "secondary": SECONDARY, "accent": ACCENT, "gloves": GLOVES,
                  "shoes": SHOES, "metal": METAL, "tertiary": TERTIARY}
    recolor = c.get("recolor", {})
    for pc in pieces:
        n0 = len(pr)
        _piece(B, c, Prim, v3, pc, pr, s, hips, chest, neck, top_neck)
        rc = recolor.get(pc)
        if rc:
            mp = {slot_names[a]: slot_names[b] for a, b in rc.items()}
            for q in pr[n0:]:
                q.slot = mp.get(q.slot, q.slot)
    return pr


def _piece(B, c, Prim, v3, pc, pr, s, hips, chest, neck, top_neck):
    if True:
        if pc == "gi_top":
            g = 0.016 * s
            pr += torso_shell(B, Prim, v3, PRIMARY, g, top_neck, hips[1] - 0.20 * s,
                              cuts=[((0.0, 0.62, -0.79), v3([0, chest[1] + 0.16 * s, -0.04 * s]))])
            rolled = c.get("sleeves", "full")
            for nm in ("Left", "Right"):
                ln = 0.80
                if rolled == "rolled_one" and nm == "Right":
                    ln = 0.22
                elif rolled == "rolled":
                    ln = 0.40
                pr += sleeve(B, Prim, v3, nm, PRIMARY, 0.020 * s, ln, flare=0.012 * s)
            # 襟（V字の重なり）
            for sx in (-1, 1):
                a = neck + v3([sx * 0.055 * s, -0.01 * s, -0.04 * s])
                b = hips + v3([-sx * 0.05 * s, 0.10 * s, -0.125 * s])
                pr.append(Prim("capsule", [v3(a), v3(b), 0.016 * s], B.b("Chest"), SECONDARY if c.get("lapel_dark") else PRIMARY, MT_CLOTH, k=0.008, layer="cloth", bias=0.003))
        elif pc == "gi_pants" or pc == "pants_loose":
            for nm in ("Left", "Right"):
                pr += pant_leg(B, Prim, v3, nm, PRIMARY if pc == "gi_pants" else SECONDARY, 0.024 * s, 0.92, flare=0.022 * s)
            pr += torso_shell(B, Prim, v3, PRIMARY if pc == "gi_pants" else SECONDARY, 0.014 * s, hips[1] + 0.06 * s, hips[1] - 0.25 * s)
        elif pc == "pants":
            for nm in ("Left", "Right"):
                pr += pant_leg(B, Prim, v3, nm, SECONDARY, 0.012 * s, 0.97, flare=0.006 * s)
            pr += torso_shell(B, Prim, v3, SECONDARY, 0.010 * s, hips[1] + 0.07 * s, hips[1] - 0.25 * s)
        elif pc == "cargo":
            for nm, sx in (("Left", -1), ("Right", 1)):
                pr += pant_leg(B, Prim, v3, nm, SECONDARY, 0.020 * s, 0.95, flare=0.010 * s)
                hp, kn = B.j(nm + "UpperLeg"), B.j(nm + "LowerLeg")
                mid = hp + (kn - hp) * 0.55 + v3([sx * 0.085 * s, 0, 0])
                pr.append(Prim("box", [v3(mid), v3([0.022 * s, 0.065 * s, 0.050 * s]), 0.012 * s], B.b(nm + "UpperLeg"), SECONDARY, MT_CLOTH, k=0.008, layer="cloth"))
            pr += torso_shell(B, Prim, v3, SECONDARY, 0.014 * s, hips[1] + 0.07 * s, hips[1] - 0.25 * s)
        elif pc == "shorts":
            for nm in ("Left", "Right"):
                pr += pant_leg(B, Prim, v3, nm, PRIMARY, 0.018 * s, 0.40, flare=0.02 * s)
            pr += torso_shell(B, Prim, v3, PRIMARY, 0.012 * s, hips[1] + 0.08 * s, hips[1] - 0.25 * s)
            pr += belt(B, Prim, v3, ACCENT, y_off=0.07, tails=False, width=0.016)
        elif pc == "singlet":
            pr += torso_shell(B, Prim, v3, PRIMARY, 0.006 * s, top_neck - 0.02 * s, hips[1] - 0.25 * s,
                              cuts=[((0.0, 0.55, -0.83), v3([0, chest[1] + 0.12 * s, -0.06 * s]))])
            for nm in ("Left", "Right"):
                pr += pant_leg(B, Prim, v3, nm, PRIMARY, 0.006 * s, 0.30)
        elif pc == "tank":
            pr += torso_shell(B, Prim, v3, PRIMARY, 0.008 * s, top_neck - 0.03 * s, hips[1] + 0.02 * s,
                              cuts=[((0.0, 0.6, -0.8), v3([0, chest[1] + 0.12 * s, -0.06 * s]))])
        elif pc in ("shirt", "rashguard", "turtleneck", "jacket", "jacket_short", "kurta"):
            g = {"shirt": 0.012, "rashguard": 0.005, "turtleneck": 0.008, "jacket": 0.020, "jacket_short": 0.020, "kurta": 0.016}[pc] * s
            slot = {"shirt": PRIMARY, "rashguard": PRIMARY, "turtleneck": TERTIARY, "jacket": PRIMARY, "jacket_short": PRIMARY, "kurta": PRIMARY}[pc]
            bottom = {"jacket_short": hips[1] + 0.05 * s, "kurta": hips[1] - 0.32 * s}.get(pc, hips[1] - 0.05 * s)
            cuts = []
            if pc == "jacket_short":
                cuts = [((0.0, 0.0, -1.0), v3([0, 0, -0.10 * s]))]
            pr += torso_shell(B, Prim, v3, slot, g, top_neck + (0.03 * s if pc == "turtleneck" else 0), bottom, cuts=cuts)
            ln = {"shirt": 0.50, "rashguard": 0.95, "turtleneck": 0.95, "jacket": 0.95, "jacket_short": 0.92, "kurta": 0.75}[pc]
            for nm in ("Left", "Right"):
                pr += sleeve(B, Prim, v3, nm, slot, g + 0.004 * s, ln, flare=0.004 * s)
            if pc == "turtleneck":
                pr.append(Prim("cone", [v3(neck - [0, 0.04 * s, 0]), v3(neck + [0, 0.06 * s, 0]), 0.068 * s, 0.062 * s], B.b("Neck"), TERTIARY, MT_CLOTH, k=0.01, layer="cloth"))
        elif pc == "high_collar_jacket":
            pr += torso_shell(B, Prim, v3, PRIMARY, 0.018 * s, top_neck, hips[1] - 0.10 * s)
            pr.append(Prim("cone", [v3(neck - [0, 0.03 * s, 0]), v3(neck + [0, 0.06 * s, 0]), 0.07 * s, 0.066 * s], B.b("Neck"), PRIMARY, MT_CLOTH, k=0.01, layer="cloth"))
            for nm in ("Left", "Right"):
                pr += sleeve(B, Prim, v3, nm, PRIMARY, 0.020 * s, 0.88, flare=0.008 * s)
            # 前垂れ
            apron = hips + v3([0, -0.25 * s, -0.115 * s])
            pr.append(Prim("box", [v3(apron), v3([0.11 * s, 0.24 * s, 0.012 * s]), 0.008 * s], B.b("Hips"), PRIMARY, MT_CLOTH, k=0.008, layer="cloth"))
            pr.append(Prim("box", [v3(apron + [0, 0, 0.0]), v3([0.115 * s, 0.012 * s, 0.016 * s]), 0.006 * s], B.b("Hips"), ACCENT, MT_CLOTH, k=0.004, layer="cloth", bias=0.003))
        elif pc == "vest_open":
            pr += torso_shell(B, Prim, v3, ACCENT, 0.030 * s, top_neck - 0.01 * s, hips[1] + 0.05 * s,
                              cuts=[((0.0, 0.0, -1.0), v3([0, 0, -0.07 * s]))], k=0.02)
        elif pc == "overalls":
            for nm in ("Left", "Right"):
                pr += pant_leg(B, Prim, v3, nm, SECONDARY, 0.024 * s, 0.95, flare=0.016 * s)
            pr += torso_shell(B, Prim, v3, SECONDARY, 0.018 * s, chest[1] + 0.02 * s, hips[1] - 0.25 * s)
            a = chest + v3([0.06 * s, 0.08 * s, -0.10 * s])
            b = neck + v3([0.09 * s, -0.04 * s, 0.06 * s])
            pr.append(Prim("capsule", [v3(a), v3(b), 0.014 * s], B.b("Chest"), SECONDARY, MT_CLOTH, k=0.006, layer="cloth"))
        elif pc == "suspenders":
            for sx in (-1, 1):
                a = hips + v3([sx * 0.07 * s, 0.08 * s, -0.115 * s])
                m = neck + v3([sx * 0.08 * s, -0.03 * s, -0.02 * s])
                b = hips + v3([sx * 0.05 * s, 0.08 * s, 0.11 * s])
                pr.append(Prim("capsule", [v3(a), v3(m), 0.011 * s], B.b("Chest"), ACCENT, MT_LEATHER, k=0.004, layer="cloth", bias=0.004))
                pr.append(Prim("capsule", [v3(m), v3(b), 0.011 * s], B.b("Chest"), ACCENT, MT_LEATHER, k=0.004, layer="cloth", bias=0.004))
        elif pc == "haori":
            pr += torso_shell(B, Prim, v3, PRIMARY, 0.026 * s, top_neck, hips[1] - 0.42 * s,
                              cuts=[((0.0, 0.3, -0.95), v3([0, chest[1] + 0.05 * s, -0.08 * s]))])
            for nm in ("Left", "Right"):
                pr += sleeve(B, Prim, v3, nm, PRIMARY, 0.030 * s, 0.80, flare=0.045 * s)
        elif pc == "hakama":
            for nm in ("Left", "Right"):
                pr += pant_leg(B, Prim, v3, nm, SECONDARY, 0.05 * s, 0.97, flare=0.09 * s, k=0.04)
            pr += torso_shell(B, Prim, v3, SECONDARY, 0.03 * s, hips[1] + 0.10 * s, hips[1] - 0.30 * s)
            pr += belt(B, Prim, v3, ACCENT, y_off=0.09, tails=False, width=0.018)
        elif pc == "dhoti":
            for nm in ("Left", "Right"):
                pr += pant_leg(B, Prim, v3, nm, PRIMARY, 0.035 * s, 0.75, flare=0.05 * s, k=0.035)
            pr += torso_shell(B, Prim, v3, PRIMARY, 0.022 * s, hips[1] + 0.06 * s, hips[1] - 0.28 * s)
            pr += belt(B, Prim, v3, ACCENT, y_off=0.06, tails=False, width=0.022)
        elif pc == "belt":
            pr += belt(B, Prim, v3, SECONDARY, tails=True)
        elif pc == "sash":
            pr += belt(B, Prim, v3, ACCENT, tails=True)
        elif pc == "gloves_open":
            for nm in ("Left", "Right"):
                pr += hand_shell(B, Prim, v3, nm, GLOVES, 0.004 * s, fingers=False, forearm=0.15)
        elif pc == "wraps":
            for nm in ("Left", "Right"):
                pr += hand_shell(B, Prim, v3, nm, GLOVES, 0.003 * s, fingers=True, forearm=0.30, mtype=MT_CLOTH)
        elif pc == "gloves":
            for nm in ("Left", "Right"):
                pr += hand_shell(B, Prim, v3, nm, GLOVES, 0.004 * s, fingers=True, forearm=0.10, mtype=MT_LEATHER)
        elif pc in ("shoes", "sneakers", "boots", "wrestling_shoes", "cloth_shoes", "tabi"):
            high = {"boots": 0.45, "wrestling_shoes": 0.35}.get(pc, 0.0)
            slot = SHOES
            for nm in ("Left", "Right"):
                pr += foot_shell(B, Prim, v3, nm, slot, 0.005 * s, high=high, mtype=MT_CLOTH if pc in ("cloth_shoes", "tabi", "sneakers") else MT_LEATHER)
        elif pc == "pads":
            for nm in ("Left", "Right"):
                pr.append(Prim("sphere", [v3(B.j(nm + "LowerArm")), 0.050 * s], B.b(nm + "LowerArm"), ACCENT, MT_LEATHER, k=0.01, layer="cloth"))
                pr.append(Prim("sphere", [v3(B.j(nm + "LowerLeg") + [0, 0, -0.025 * s]), 0.060 * s], B.b(nm + "UpperLeg"), ACCENT, MT_LEATHER, k=0.01, layer="cloth"))
        elif pc == "armbands":
            for nm in ("Left", "Right"):
                sh, el = B.j(nm + "UpperArm"), B.j(nm + "LowerArm")
                cpos = sh + (el - sh) * 0.62
                R = sdf.frame_from(el - sh)
                pr.append(Prim("torus", [v3(cpos), 0.045 * s, 0.009 * s, R], B.b(nm + "UpperArm"), METAL, MT_LEATHER, k=0.004, layer="cloth", bias=0.003))
        elif pc == "bandana":
            hj = B.j("Head")
            c2 = hj + v3([0, 0.155 * s, -0.008 * s])
            R = np.diag([1.0, 1.0, 1.0]).astype(np.float32)
            pr.append(Prim("torus", [v3(c2), 0.088 * s, 0.014 * s, R], B.b("Head"), ACCENT, MT_CLOTH, k=0.005, layer="cloth", bias=0.004))
            pr.append(Prim("capsule", [v3(c2 + [0, 0, 0.09 * s]), v3(B.j("Hair2")), 0.016 * s], B.b("Hair1"), ACCENT, MT_CLOTH, k=0.004, layer="cloth", own_bone=True))
            pr.append(Prim("capsule", [v3(B.j("Hair2")), v3(B.j("Hair3")), 0.014 * s], B.b("Hair2"), ACCENT, MT_CLOTH, k=0.004, layer="cloth", own_bone=True))


def hair(B, c, Prim, v3):
    s = B.s
    style = c.get("hair", "short")
    hj = B.j("Head")
    hb = B.b("Head")
    hc = hj + v3([0, 0.105 * s, -0.008 * s])
    pr = []
    if style in ("bald", "none"):
        pass
    else:
        thick = {"buzz": 0.004, "short": 0.012, "short_spiky": 0.014, "ponytail": 0.012, "braid": 0.012, "bun": 0.012, "swept": 0.016, "long_tied": 0.016}.get(style, 0.012) * s
        cap = Prim("ell", [v3(hc + [0, 0.012 * s, 0.006 * s]), v3([0.083 * s + thick, 0.108 * s + thick, 0.100 * s + thick])], hb, HAIR, MT_HAIR, k=0.008, layer="hair", own_bone=True, bias=0.002)
        # 生え際より下と顔の前を削る
        _cut(cap, [((0, -1, 0), v3(hc + [0, -0.035 * s, 0])),
                   ((0, -0.35, -0.94), v3(hc + [0, 0.05 * s, -0.060 * s]))])
        pr.append(cap)
        # もみあげ・後頭部
        back = Prim("ell", [v3(hc + [0, -0.02 * s, 0.045 * s]), v3([0.080 * s + thick, 0.085 * s, 0.065 * s + thick])], hb, HAIR, MT_HAIR, k=0.01, layer="hair", own_bone=True, bias=0.002)
        _cut(back, [((0, -1, 0), v3(hc + [0, -0.075 * s, 0])), ((0, 0, -1), v3(hc + [0, 0, 0.0]))])
        pr.append(back)
    if style == "short_spiky":
        rng = np.random.default_rng(7)
        for k in range(22):
            th = rng.uniform(-1.2, 1.2)
            ph = rng.uniform(0.25, 1.35)
            d = v3([math.sin(th) * math.sin(ph), math.cos(ph), math.cos(th) * math.sin(ph) * 0.8 + 0.25])
            d /= np.linalg.norm(d)
            base = hc + d * 0.082 * s + v3([0, 0.01 * s, 0.005 * s])
            sweep = v3([0, 0.10, 0.9])
            tip = base + (d * 0.55 + sweep) / np.linalg.norm(d * 0.55 + sweep) * (0.030 + rng.uniform(0, 0.022)) * s
            pr.append(Prim("cone", [v3(base), v3(tip), 0.020 * s, 0.006 * s], hb, HAIR, MT_HAIR, k=0.014, layer="hair", own_bone=True))
        # 前髪
        for sx in (-0.03, 0.0, 0.03):
            base = hc + v3([sx * s, 0.085 * s, -0.065 * s])
            pr.append(Prim("cone", [v3(base), v3(base + v3([sx * 0.3 * s, -0.035 * s, -0.025 * s])), 0.016 * s, 0.005 * s], hb, HAIR, MT_HAIR, k=0.012, layer="hair", own_bone=True))
    elif style in ("ponytail", "braid", "long_tied"):
        h1, h2, h3, t3 = B.j("Hair1"), B.j("Hair2"), B.j("Hair3"), B.t("Hair3")
        tie = h1 + v3([0, 0.0, 0.0])
        pr.append(Prim("sphere", [v3(tie), 0.024 * s], B.b("Hair1"), HAIR, MT_HAIR, k=0.01, layer="hair", own_bone=True))
        pr.append(Prim("torus", [v3(tie + [0, -0.005, 0.01 * s]), 0.020 * s, 0.006 * s, sdf.frame_from([0, 0.3, 1])], B.b("Hair1"), ACCENT, MT_CLOTH, k=0.003, layer="hair", own_bone=True, bias=0.003))
        if style == "braid":
            pts = [h1 + (h2 - h1) * t for t in np.linspace(0.2, 1.0, 4)] + [h2 + (h3 - h2) * t for t in np.linspace(0.25, 1.0, 4)] + [h3 + (t3 - h3) * t for t in np.linspace(0.25, 1.0, 4)]
            bones = [B.b("Hair1")] * 4 + [B.b("Hair2")] * 4 + [B.b("Hair3")] * 4
            for k, (pt, bn) in enumerate(zip(pts, bones)):
                r = (0.020 - 0.0008 * k) * s
                pr.append(Prim("sphere", [v3(pt), r], bn, HAIR, MT_HAIR, k=0.008, layer="hair", own_bone=True))
        else:
            r0 = 0.030 if style == "ponytail" else 0.022
            pr.append(Prim("cone", [v3(h1), v3(h2), r0 * s, r0 * 0.9 * s], B.b("Hair1"), HAIR, MT_HAIR, k=0.012, layer="hair", own_bone=True))
            pr.append(Prim("cone", [v3(h2), v3(h3), r0 * 0.9 * s, r0 * 0.7 * s], B.b("Hair2"), HAIR, MT_HAIR, k=0.012, layer="hair", own_bone=True))
            pr.append(Prim("cone", [v3(h3), v3(t3), r0 * 0.7 * s, 0.006 * s], B.b("Hair3"), HAIR, MT_HAIR, k=0.012, layer="hair", own_bone=True))
    elif style == "bun":
        pr.append(Prim("sphere", [v3(hc + [0, 0.07 * s, 0.085 * s]), 0.040 * s], hb, HAIR, MT_HAIR, k=0.015, layer="hair", own_bone=True))
    elif style == "swept":
        pr.append(Prim("ell", [v3(hc + [0, 0.07 * s, -0.02 * s]), v3([0.07 * s, 0.035 * s, 0.09 * s])], hb, HAIR, MT_HAIR, k=0.02, layer="hair", own_bone=True))
    beard = c.get("beard", "")
    if beard:
        jaw = hj + v3([0, 0.03 * s, -0.06 * s])
        pr.append(Prim("ell", [v3(jaw), v3([0.07 * s, 0.055 * s, 0.055 * s])], hb, HAIR, MT_HAIR, k=0.015, layer="hair", own_bone=True, bias=0.002))
        pr.append(Prim("ell", [v3(hc + [0, -0.045 * s, -0.098 * s]), v3([0.035 * s, 0.010 * s, 0.012 * s])], hb, HAIR, MT_HAIR, k=0.01, layer="hair", own_bone=True, bias=0.004))
        if beard == "braided":
            tip = jaw + v3([0, -0.09 * s, -0.04 * s])
            for k, t in enumerate(np.linspace(0.0, 1.0, 5)):
                pr.append(Prim("sphere", [v3(jaw + (tip - jaw) * t + [0, -0.03 * s, -0.01 * s]), (0.022 - 0.003 * k) * s], hb, HAIR, MT_HAIR, k=0.008, layer="hair", own_bone=True))
    return pr
