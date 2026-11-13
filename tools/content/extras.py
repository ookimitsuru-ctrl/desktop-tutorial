"""技数を仕様の目標（55 以上）に近づけるための追加技。
各キャラで「まだ使われていないコマンド枠」にだけ、流派に合わせた技を足す。"""
from common import A, ch

HL, HH, ML, MH, LO = "high_light", "high_heavy", "mid_light", "mid_heavy", "low"


def _taken(c, cmd, frm):
    for m in c.moves:
        if m.get("chain_only"):
            continue
        if m["cmd"] != cmd:
            continue
        if m.get("stance"):
            continue
        if set(m.get("from", [])) & set(frm):
            return True
    return False


def _get(c, key):
    for m in c.moves:
        if m["id"] == c.id(key):
            return m
    return None


def _add_chain(c, parent_key, child_key, inp, win, at):
    p = _get(c, parent_key)
    if p is None:
        return False
    for e in p.get("chain", []):
        if e["in"] == inp:
            return False
    p.setdefault("chain", []).append(ch(c.id(child_key), inp, win, at))
    return True


def add_extras(c, fl):
    """fl: 流派の味付け
    kick: 主に使う蹴りのスタイル（round / front / side）、punch: 手技のスタイル（straight / palm / chop / elbow）
    dmg: ダメージ倍率、reach: 蹴りの到達、names: 技名の上書き {key: (ja, en)}"""
    i = c.id
    dm = fl.get("dmg", 1.0)
    names = fl.get("names", {})
    kick = fl.get("kick", "round")
    pst = fl.get("punch", "straight")
    reach = fl.get("reach", 0.82)

    def d(v):
        return int(round(v * dm / 5.0)) * 5

    def nm(key, ja, en):
        return names.get(key, (ja, en))

    def panim(side, h, reach_p=0.62, step=0.1, **kw):
        if pst == "elbow":
            return A("elbow", side=side, style="fwd", h=h, step=max(step, 0.14))
        style = {"palm": "palm", "chop": "chop"}.get(pst, "straight")
        return A("punch", side=side, style=style, h=h, reach=reach_p, step=step, **kw)

    added = 0

    def put(key, cmd, frm, *args, **kw):
        nonlocal added
        if _get(c, key) is not None or _taken(c, cmd, frm):
            return False
        c.S(key, cmd, *args, frm=frm, **kw)
        added += 1
        return True

    # 1P: しゃがみからの下段突き（速い下段）
    put("1p", "1P", ("stand", "crouch"), nm("1p", "下段裏打ち", "Low Backhand"), "low", "punch", d(35), (12, 2, 15), (-5, 3, 5), "light", LO,
        A("punch", side="r", h="low", reach=0.60, crouch=0.42, start="crouch", end="crouch"), flags=["end_crouch"])
    # 6P+K: 踏み込みの重い中段
    put("6pk_x", "6P+K", ("stand",), nm("6pk_x", "踏み込み双掌", "Stepping Twin Palm"), "mid", "punch", d(120), (19, 3, 24), (-8, "KD", "KD"), "heavy",
        "knockback", A("punch", side="r", style="double", h="mid", reach=0.60, step=0.32), cat="special", flags=["can_ringout"])
    # 3P+K: 下段の手技
    put("3pk_x", "3P+K", ("stand",), nm("3pk_x", "下段払い打ち", "Low Sweep Strike"), "low", "punch", d(55), (16, 3, 22), (-8, 1, 3), "medium", LO,
        A("punch", side="r", style="chop", h="low", reach=0.62, crouch=0.36, end="crouch"), cat="special", trk="half_left", flags=["end_crouch"])
    # 2K+G: 回転足払い
    put("2kg_x", "2K+G", ("stand", "crouch"), nm("2kg_x", "回し足払い", "Spinning Sweep"), "low", "kick", d(70), (18, 4, 28), (-16, "KD", "KD"), "heavy", "trip",
        A("kick", side="l", style="sweep", reach=0.92, start="crouch", end="crouch"), cat="special", trk="full", flags=["end_crouch"])
    # K+G: 振り下ろしの蹴り（ガードさせて有利）
    put("kg_x", "K+G", ("stand",), nm("kg_x", "踵落とし", "Heel Drop"), "mid", "kick", d(105), (23, 3, 22), (1, "KD", "KD"), "heavy", "trip",
        A("kick", side="r", style="axe", h="mid", reach=0.74, step=0.12), cat="special", tags=["plus_mid"])
    # 9K: 跳び蹴り（空中）
    put("9k_x", "9K", ("stand",), nm("9k_x", "跳び前蹴り", "Jumping Front Kick"), "mid", "kick", d(110), (20, 4, 25), (-10, "KD", "KD"), "heavy", "knockback",
        A("kick", side="r", style="jump", h="mid", reach=0.84, step=0.30), cat="special", posture=[[6, 20, "airborne"]])
    # 66K: 走り込み蹴り
    put("66k_x", "K", ("dash",), nm("66k_x", "踏み込み蹴り", "Dashing Kick"), "mid", "kick", d(115), (18, 4, 24), (-7, "KD", "WALLSPLAT"), "heavy", "knockback",
        A("kick", side="r", style="push" if kick == "front" else "side", h="mid", reach=0.90, step=0.45), cat="special", chr="wall_splat",
        flags=["wall_splat", "can_ringout"])
    # 66P: 踏み込み突き
    put("66p_x", "P", ("dash",), nm("66p_x", "踏み込み突き", "Dashing Strike"), "mid", "punch", d(105), (16, 3, 22), (-6, "KD", "KD"), "heavy", "knockback",
        panim("r", "mid", 0.66, 0.45), cat="special")
    # 4P+K / 2P+K（構え・当て身で使っていなければ）
    put("4pk_x", "4P+K", ("stand",), nm("4pk_x", "下がり裏拳", "Retreating Backfist"), "high", "punch", d(70), (14, 3, 20), (-4, 4, "KD"), "medium", HH,
        A("punch", side="l", style="back", h="high", reach=0.64, back=-0.25), cat="special", trk="half_right", chr="spin")
    put("2pk_x", "2P+K", ("stand", "crouch"), nm("2pk_x", "低空突き上げ", "Low Rising Strike"), "mid", "punch", d(85), (16, 3, 22), (-6, 3, "STAGGER"), "medium", ML,
        panim("r", "mid", 0.62, 0.15), cat="special", chr="stagger_gut")
    # 背向け下段
    put("bt2p", "2P", ("backturn",), nm("bt2p", "振り向き下段突き", "Turning Low Punch"), "low", "punch", d(40), (13, 2, 18), (-6, 3, 5), "light", LO,
        A("punch", side="l", h="low", reach=0.60, crouch=0.42, start="backturn", end="crouch"), cat="backturn", trk="full", flags=["end_crouch"])
    put("bt2k", "2K", ("backturn",), nm("bt2k", "振り向き下段蹴り", "Turning Low Kick"), "low", "kick", d(55), (15, 2, 20), (-8, 2, "KD"), "medium", LO,
        A("kick", side="r", style="low", reach=0.80, start="backturn", end="crouch"), cat="backturn", trk="full", chr="trip", flags=["end_crouch"])
    # 立ち途中 K の連携（上段→中段の二択）
    # 連携: 6K,K / 3K,P / 2K,K / 4K 系に続き
    if _get(c, "6k") is not None and _get(c, "6kk_x") is None:
        if _add_chain(c, "6k", "6kk_x", "K", (3, 26), 18):
            c.S("6kk_x", "K", nm("6kk_x", "二段蹴り", "Double Kick"), "high", "kick", d(80), (14, 3, 22), (-8, "KD", "KD"), "heavy", "knockback",
                A("kick", side="r", style="round", h="high", reach=reach), frm=None, trk="half_right")
            added += 1
    if _get(c, "3k") is not None and _get(c, "3kp_x") is None:
        if _add_chain(c, "3k", "3kp_x", "P", (3, 26), 19):
            c.S("3kp_x", "P", nm("3kp_x", "蹴り〜突き", "Kick into Strike"), "mid", "punch", d(70), (13, 2, 20), (-7, 3, 5), "medium", ML,
                panim("r", "mid", 0.64, 0.12), frm=None)
            added += 1
    if _get(c, "2k") is not None and _get(c, "2kk_x") is None:
        if _add_chain(c, "2k", "2kk_x", "K", (3, 24), 17):
            c.S("2kk_x", "K", nm("2kk_x", "下段から上段蹴り", "Low-High Kicks"), "high", "kick", d(75), (14, 3, 22), (-8, "KD", "KD"), "heavy", "knockback",
                A("kick", side="r", style="round", h="high", reach=reach, start="crouch"), frm=None, trk="half_right")
            added += 1
    if _get(c, "2p") is not None and _get(c, "2pp_x") is None:
        if _add_chain(c, "2p", "2pp_x", "P", (3, 20), 13):
            c.S("2pp_x", "P", nm("2pp_x", "下段から突き上げ", "Low into Rising Strike"), "mid", "punch", d(60), (13, 2, 18), (-6, 3, 5), "medium", ML,
                panim("r", "mid", 0.60, 0.10, start="crouch"), frm=None)
            added += 1
    if _get(c, "evp") is not None and _get(c, "evpp_x") is None:
        if _add_chain(c, "evp", "evpp_x", "P", (3, 22), 15):
            c.S("evpp_x", "P", nm("evpp_x", "回り込み連打", "Circling Follow-up"), "high", "punch", d(60), (13, 2, 18), (-5, 3, "KD"), "medium", HL,
                A("punch", side="l", style="hook", h="high", reach=0.62), frm=None, trk="half_left", chr="spin")
            added += 1
    if _get(c, "wsk") is not None and _get(c, "wskk_x") is None:
        if _add_chain(c, "wsk", "wskk_x", "K", (3, 24), 18):
            c.S("wskk_x", "K", nm("wskk_x", "追い蹴り", "Follow-up Kick"), "high", "kick", d(80), (14, 3, 22), (-8, "KD", "KD"), "heavy", "knockback",
                A("kick", side="l", style="round", h="high", reach=reach), frm=None, trk="half_left")
            added += 1
    return added
