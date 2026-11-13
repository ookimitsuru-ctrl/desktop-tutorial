"""マリエル・アドリアン・ラヴィ・玄斎"""
from common import A, Char, ch, palette

HL, HH, ML, MH, LO = "high_light", "high_heavy", "mid_light", "mid_heavy", "low"


# ============================================================ マリエル（カリ／パナントゥカン）
def mariel():
    c = Char("mariel")
    i = c.id
    c.S("p", "P", ("ジャブ", "Jab"), "high", "punch", 45, (10, 2, 12), (2, 5, 7), "light", HL,
        A("punch", side="l", h="high", reach=0.60), tags=["jab", "fast_high"],
        chain=[ch(i("pp"), "P", (3, 20), 11)])
    c.S("pp", "P", ("裏打ち", "Backhand"), "high", "punch", 45, (11, 2, 14), (0, 4, 6), "light", HL,
        A("punch", side="r", style="back", h="high", reach=0.60), frm=None,
        chain=[ch(i("ppp"), "P", (3, 22), 12), ch(i("pp2p"), "2P", (3, 22), 13)])
    c.S("ppp", "P", ("肘打ち", "Elbow"), "mid", "elbow", 55, (12, 2, 16), (-3, 3, 5), "light", ML,
        A("elbow", side="l", style="fwd", h="mid", step=0.10), frm=None, trk="half_left",
        chain=[ch(i("pppp"), "P", (3, 24), 14)])
    c.S("pppp", "P", ("ハンマー", "Hammerfist"), "mid", "punch", 80, (14, 3, 22), (-8, "KD", "KD"), "heavy", "knockback",
        A("punch", side="r", style="hammer", h="mid", reach=0.60, step=0.10), frm=None)
    c.S("pp2p", "2P", ("下段打ち", "Low Strike"), "low", "punch", 40, (14, 2, 18), (-6, 2, 4), "medium", LO,
        A("punch", side="l", h="low", reach=0.60, crouch=0.40, end="crouch"), frm=None, flags=["end_crouch"])
    c.S("6p", "6P", ("肘突き", "Elbow Thrust"), "mid", "elbow", 65, (13, 2, 15), (1, 4, 6), "light", ML,
        A("elbow", side="r", style="fwd", h="mid", step=0.16), tags=["fast_mid", "plus_mid"],
        chain=[ch(i("6pp"), "P", (3, 22), 14)])
    c.S("6pp", "P", ("返しフック", "Return Hook"), "high", "punch", 55, (13, 2, 17), (-4, 3, "KD"), "medium", HL,
        A("punch", side="l", style="hook", h="high", reach=0.58), frm=None, trk="half_left", chr="spin")
    c.S("3p", "3P", ("突き上げ肘", "Rising Elbow"), "smid", "elbow", 60, (12, 2, 15), (-1, 3, 5), "light", ML,
        A("elbow", side="r", style="up", h="mid", step=0.12), frm=("stand", "crouch"), tags=["fast_mid"])
    c.parry("4p", "4P", ("トラップ", "Trap"), (2, 10), ["high", "mid", "smid"], ["punch", "elbow"], "trap", (2, 9, 16), side="l")
    c.T("trap", "P", ("腕取り", "Arm Trap"), 0, "none", "trap", frm=None, length=34, dmgf=4, next_window=28, stage=True,
        end="stand", stun=8, cat="system",
        next=[{"to": i("trap_pg"), "in": "P+G"}, {"to": i("trap_p"), "in": "P"}, {"to": i("trap_k"), "in": "K"}])
    c.T("trap_p", "P", ("肘連打", "Elbow Flurry"), 120, "none", "trap_elbows", frm=None, length=44, dmgf=30, stage=True,
        end="stagger", stun=32, cat="system")
    c.T("trap_k", "K", ("膝裏蹴り崩し", "Knee Break"), 100, "none", "trap_knee", frm=None, length=48, dmgf=24, stage=True, cat="system")
    c.T("trap_pg", "P+G", ("関節極め投げ", "Joint Lock Throw"), 180, "none", "trap_lock", frm=None, length=60, dmgf=40, stage=True,
        end="face", flags=["can_ringout"], cat="system")
    c.S("2p", "2P", ("下段突き", "Low Punch"), "low", "punch", 40, (11, 2, 13), (-3, 3, 5), "light", LO,
        A("punch", side="l", h="low", reach=0.58, crouch=0.40, start="crouch", end="crouch"),
        frm=("stand", "crouch"), flags=["end_crouch"], tags=["fast_low"])
    c.S("wsp", "P", ("突き上げ", "Rising Uppercut"), "mid", "punch", 100, (15, 3, 24), (-12, "LAUNCH", "LAUNCH"), "launch", "launch",
        A("punch", side="r", style="upper", h="head_high", reach=0.55, step=0.12, start="crouch"), frm=("rise",),
        launch=["0.118", "0.006"], tags=["launcher", "punisher"])
    c.S("wsk", "K", ("膝連打", "Rising Knee"), "mid", "knee", 80, (15, 3, 20), (-6, 4, "STAGGER"), "medium", ML,
        A("kick", side="r", style="knee", h="mid", step=0.24, start="crouch"), frm=("rise",), chr="stagger_gut")
    c.S("66p", "P", ("ダッキング肘", "Ducking Elbow"), "mid", "elbow", 80, (14, 3, 20), (-5, "KD", "KD"), "heavy", "knockback",
        A("elbow", side="r", style="fwd", h="mid", step=0.40), frm=("dash",), cat="special", trk="half_right",
        posture=[[1, 8, "low_profile"]])
    c.S("pk2", "P+K", ("双肘", "Twin Elbows"), "mid", "elbow", 90, (16, 3, 20), (-4, "KD", "KD"), "heavy", "knockback",
        A("elbow", side="l", style="fwd", h="mid", step=0.28), cat="special")
    c.S("k", "K", ("ハイキック", "High Kick"), "high", "kick", 80, (13, 3, 19), (-4, 4, "KD"), "medium", HH,
        A("kick", side="r", style="round", h="high", reach=0.76), trk="half_right", chr="knockback",
        chain=[ch(i("kk"), "K", (3, 28), 17)])
    c.S("kk", "K", ("返しロー", "Return Low Kick"), "low", "kick", 50, (14, 2, 20), (-8, 2, "KD"), "medium", LO,
        A("kick", side="l", style="low", reach=0.74), frm=None, chr="trip")
    c.S("6k", "6K", ("前蹴り", "Front Kick"), "mid", "kick", 75, (15, 3, 18), (-4, 3, 6), "medium", ML,
        A("kick", side="l", style="front", h="mid", reach=0.80))
    c.S("3k", "3K", ("膝", "Knee"), "mid", "knee", 95, (14, 3, 20), (-6, 4, "LAUNCH"), "medium", ML,
        A("kick", side="r", style="knee", h="mid", step=0.26), chr="launch", tags=["ch_launch"])
    c.S("2k", "2K", ("下段蹴り", "Low Kick"), "low", "kick", 40, (13, 2, 16), (-5, 2, 4), "light", LO,
        A("kick", side="l", style="low", reach=0.72, start="crouch", end="crouch"), frm=("stand", "crouch"), flags=["end_crouch"])
    c.S("1k", "1K", ("刈り蹴り", "Reaping Kick"), "low", "kick", 80, (18, 3, 26), (-14, "KD", "KD"), "heavy", "trip",
        A("kick", side="r", style="sweep", reach=0.84, start="crouch", end="crouch"), frm=("stand", "crouch"),
        trk="half_left", flags=["end_crouch"], tags=["low_kd"])
    c.S("4k", "4K", ("回転裏蹴り", "Spinning Back Kick"), "mid", "kick", 110, (20, 3, 22), (-8, "KD", "KD"), "heavy", "knockback",
        A("kick", side="r", style="back", h="mid", reach=0.80), trk="full", flags=["wall_splat"])
    c.S("evp", "P", ("サイド肘", "Side Elbow"), "mid", "elbow", 70, (13, 2, 17), (-3, 4, 6), "medium", ML,
        A("elbow", side="r", style="fwd", h="mid", step=0.10), frm=("evade",), cat="evade", trk="full")
    c.S("evk", "K", ("サイドロー", "Side Low Kick"), "low", "kick", 50, (15, 3, 20), (-8, 2, "KD"), "medium", LO,
        A("kick", side="r", style="low", reach=0.76), frm=("evade",), cat="evade", trk="full", chr="trip")
    c.S("btp", "P", ("振り向き裏打ち", "Turning Backhand"), "high", "punch", 60, (11, 2, 17), (-1, 4, "KD"), "medium", HL,
        A("punch", side="l", style="back", h="high", reach=0.58, start="backturn"), frm=("backturn",), cat="backturn",
        trk="full", chr="spin")
    c.S("btk", "K", ("振り向き刈り", "Turning Reap"), "low", "kick", 60, (15, 3, 24), (-12, "KD", "KD"), "heavy", "trip",
        A("kick", side="r", style="sweep", reach=0.84, start="backturn", end="crouch"), frm=("backturn",), cat="backturn",
        trk="full", flags=["end_crouch"])
    c.S("runp", "P", ("走り込み肘", "Running Elbow"), "mid", "elbow", 100, (13, 3, 24), (-8, "KD", "KD"), "heavy", "knockback",
        A("elbow", side="r", style="fwd", h="mid", step=0.60), frm=("run",), cat="special")
    c.S("runk", "K", ("スタント・ドロップキック", "Stunt Dropkick"), "mid", "kick", 120, (14, 5, 30), (-14, "KD", "KD"), "heavy", "knockback",
        A("kick", side="r", style="jump", h="mid", reach=0.84, step=0.60), frm=("run",), cat="special", posture=[[4, 18, "airborne"]])
    c.T("pg", "P+G", ("腕絡み", "Arm Wrap"), 240, "N", "twist", length=64, dmgf=42, end="face")
    c.T("6pg", "6P+G", ("首投げ", "Neck Throw"), 270, "6", "neck", length=62, dmgf=40, end="face")
    c.T("4pg", "4P+G", ("背後取り", "Take the Back"), 200, "4", "behind", length=48, dmgf=30, end="backturn", stun=12)
    c.T("2pg", "2P+G", ("足取り", "Leg Grab"), 220, "2", "lowtrip", lv="lthrow", frm=("stand", "crouch"), length=56, dmgf=36)
    c.side_back_wall_run(side=("側面腕絡み", "Side Arm Wrap", 270, "neck"), back=("背後落とし", "Back Drop", 310, "back"),
                         wall=("壁打ち連打", "Wall Flurry", 290, "wall"), run=("走りタックル", "Running Tackle", 200, "tackle"))
    c.down_attacks(("飛び込み肘", "Diving Elbow"), ("追い打ち", "Down Strike"), d8=100, d2=35)
    # バランス調整: 打撃ダメージを 14% 上げる（手数型で 1 発が軽すぎたため）
    for m in c.moves:
        if m["lv"] not in ("throw", "lthrow", "none", "parry"):
            m["dmg"] = int(round(m["dmg"] * 1.14 / 5.0)) * 5
    ch_json = {
        "schema_version": 1, "id": "mariel", "name": ["マリエル・サントス", "Mariel Santos"],
        "style": ["カリ／パナントゥカン", "Kali / Panantukan"], "difficulty": 3, "weight_class": "light",
        "body": {"height": "1.63", "shoulder": "0.90", "hip": "1.0", "arm": "0.97", "leg": "1.0", "torso": "0.96",
                 "hair_chain": True, "hair_len": "0.22"},
        "physics": {"push_radius": "0.27", "float_factor": "0.96", "hurt_mul": "0.88", "throw_range": "0.85"},
        "movement": {"walk_f": "1.65", "walk_b": "1.35", "dash_f": [17, "1.45"], "dash_b": [19, "1.25"], "run": "4.8", "evade": 20},
        "stance": {"lead": "l", "width": "0.28", "depth": "0.40", "crouch": "0.08", "turn": "26", "guard": "high", "lean": "5"},
        "model": {"build": "lean", "female": True, "skin": "#C99A74", "hair": "short", "face": {"jaw": "0.35", "brow": "0.35", "nose": "0.45"}},
        "colors": [
            palette("#C99A74", "#1A1410", "#E8C020", "#1A1A1A", "#C8372D", gloves="#222222", shoes="#151515", metal="#222222", tertiary="#151515"),
            palette("#C99A74", "#1A1410", "#F2F2F2", "#1F4FA8", "#1F4FA8", gloves="#222222", shoes="#F0F0F0", metal="#333333", tertiary="#1F4FA8"),
            palette("#C99A74", "#1A1410", "#3D7A3A", "#5A3A22", "#E0B020", gloves="#2A2A2A", shoes="#3A2A1A", metal="#2A2A2A", tertiary="#3D3A22"),
            palette("#C99A74", "#1A1410", "#E87FA8", "#7A7A7A", "#F2F2F2", gloves="#333333", shoes="#DDDDDD", metal="#444444", tertiary="#5A5A5E"),
        ],
        "home_stage": "raft", "rival": "adrien", "voice": {"pitch": "1.08", "type": "female_bright", "rough": "0.02"},
        "side_throw": "mariel_side_pg", "back_throw": "mariel_back_pg",
        "costumes": [
            {"id": "a", "name": ["タンクトップ", "Tank Top"], "model": {"outfit": ["tank", "cargo", "bandana", "pads", "sneakers"]}},
            {"id": "b", "name": ["スタントスーツ", "Stunt Suit"], "model": {"outfit": ["rashguard", "pants", "pads", "sneakers"], "recolor": {"rashguard": {"primary": "tertiary"}, "pants": {"secondary": "tertiary"}}}},
        ],
    }
    c.write(ch_json)


# ============================================================ アドリアン（サバット）
def adrien():
    c = Char("adrien")
    i = c.id
    c.S("p", "P", ("ディレクト", "Direct"), "high", "punch", 50, (10, 2, 13), (1, 4, 6), "light", HL,
        A("punch", side="l", h="high", reach=0.66), tags=["jab", "fast_high"],
        chain=[ch(i("pp"), "P", (3, 22), 12), ch(i("pk"), "K", (3, 22), 13)])
    c.S("pp", "P", ("クロシェ", "Crochet"), "high", "punch", 65, (14, 3, 18), (-4, 3, "KD"), "medium", HH,
        A("punch", side="r", style="hook", h="high", reach=0.66), frm=None, trk="half_left", chr="spin")
    c.S("pk", "K", ("フェッテ・オ", "Fouetté Haut"), "high", "kick", 90, (16, 3, 22), (-8, "KD", "KD"), "heavy", "knockback",
        A("kick", side="r", style="round", h="high", reach=0.88), frm=None, trk="half_right")
    c.S("6p", "6P", ("中段ディレクト", "Body Direct"), "mid", "punch", 75, (14, 2, 17), (-3, 4, 6), "medium", ML,
        A("punch", side="r", h="mid", reach=0.68, step=0.14), tags=["fast_mid"])
    c.S("3p", "3P", ("ユペルキュ", "Uppercut"), "mid", "punch", 95, (15, 3, 24), (-12, "LAUNCH", "LAUNCH"), "launch", "launch",
        A("punch", side="r", style="upper", h="head_high", reach=0.58, step=0.12), tags=["launcher"], launch=["0.115", "0.006"])
    c.S("4p", "4P", ("裏拳", "Backfist"), "high", "punch", 70, (14, 3, 18), (-2, 5, 7), "medium", HL,
        A("punch", side="l", style="back", h="high", reach=0.68, step=0.05), trk="half_right", chr="turn")
    c.S("2p", "2P", ("下段突き", "Low Punch"), "low", "punch", 40, (11, 2, 14), (-4, 3, 5), "light", LO,
        A("punch", side="l", h="low", reach=0.62, crouch=0.40, start="crouch", end="crouch"),
        frm=("stand", "crouch"), flags=["end_crouch"], tags=["fast_low"])
    c.S("k", "K", ("フェッテ・メディアン", "Fouetté Médian"), "mid", "kick", 100, (16, 3, 20), (-5, 4, "STAGGER"), "medium", MH,
        A("kick", side="r", style="round", h="mid", reach=0.88), trk="half_right", chr="stagger_gut", stagger=38,
        tags=["ch_stagger"], chain=[ch(i("kk"), "K", (3, 28), 19)])
    c.S("kk", "K", ("フェッテ・ドゥブル", "Double Fouetté"), "high", "kick", 90, (15, 3, 22), (-8, "KD", "KD"), "heavy", "knockback",
        A("kick", side="l", style="round", h="high", reach=0.86), frm=None, trk="half_left")
    c.S("6k", "6K", ("シャッセ・メディアン", "Chassé Médian"), "mid", "kick", 110, (17, 3, 20), (-4, "KD", "KD"), "heavy", "knockback",
        A("kick", side="l", style="side", h="mid", reach=1.02, step=0.15), push=["0.45", "0.30"], flags=["can_ringout"], tags=["ringout"])
    c.S("3k", "3K", ("シャッセ・バ", "Chassé Bas"), "low", "kick", 70, (17, 3, 22), (-9, 1, "KD"), "medium", LO,
        A("kick", side="l", style="low", reach=1.00, step=0.10), chr="trip")
    c.S("2k", "2K", ("クー・ド・ピエ・バ", "Coup de Pied Bas"), "low", "kick", 50, (14, 2, 17), (-6, 2, 4), "light", LO,
        A("kick", side="l", style="low", reach=0.84, start="crouch", end="crouch"), frm=("stand", "crouch"), flags=["end_crouch"])
    c.S("1k", "1K", ("バレイヤージュ", "Balayage"), "low", "kick", 80, (20, 3, 26), (-15, "KD", "KD"), "heavy", "trip",
        A("kick", side="r", style="sweep", reach=0.98, start="crouch", end="crouch"), frm=("stand", "crouch"),
        trk="half_left", flags=["end_crouch"], tags=["low_kd"])
    c.S("4k", "4K", ("ルヴェール", "Revers"), "high", "kick", 130, (21, 4, 24), (-10, "KD", "KD"), "heavy", "spin",
        A("kick", side="r", style="spin", h="high", reach=0.90), trk="full")
    c.S("9k", "9K", ("跳びフェッテ", "Jumping Fouetté"), "mid", "kick", 120, (20, 4, 25), (-10, "LAUNCH", "LAUNCH"), "launch", "launch",
        A("kick", side="r", style="jump", h="mid", reach=0.88, step=0.30), cat="special", trk="half_right",
        posture=[[6, 20, "airborne"]], launch=["0.125", "0.007"], tags=["launcher"])
    c.S("wsp", "P", ("突き上げ", "Rising Uppercut"), "mid", "punch", 95, (15, 3, 24), (-12, "LAUNCH", "LAUNCH"), "launch", "launch",
        A("punch", side="r", style="upper", h="head_high", reach=0.58, step=0.12, start="crouch"), frm=("rise",),
        launch=["0.115", "0.006"], tags=["launcher", "punisher"])
    c.S("wsk", "K", ("シャッセ・オ", "Chassé Haut"), "mid", "kick", 90, (15, 3, 24), (-12, "LAUNCH", "LAUNCH"), "launch", "launch",
        A("kick", side="r", style="front", h="1.30", reach=0.88, start="crouch"), frm=("rise",), launch=["0.115", "0.006"], tags=["launcher"])
    c.S("66k", "K", ("跳び込みシャッセ", "Leaping Chassé"), "mid", "kick", 130, (19, 4, 24), (-6, "KD", "WALLSPLAT"), "heavy", "knockback",
        A("kick", side="r", style="side", h="mid", reach=1.00, step=0.50), frm=("dash",), cat="special", chr="wall_splat",
        flags=["wall_splat", "can_ringout"])
    # ガルド
    c.stance_move("kg", "K+G", ("ガルド", "Garde"), "garde", f=(1, 1, 5))
    c.S("garde_p", "P", ("ガルド・ディレクト", "Garde Direct"), "high", "punch", 50, (11, 2, 13), (1, 4, 6), "light", HL,
        A("punch", side="l", h="high", reach=0.68, step=0.08, end="stand"), frm=("stance",), stance="garde", cat="stance")
    c.S("garde_k", "K", ("シャッセ", "Chassé"), "mid", "kick", 110, (15, 3, 20), (1, "KD", "KD"), "heavy", "knockback",
        A("kick", side="l", style="side", h="mid", reach=1.02, step=0.12), frm=("stance",), stance="garde", cat="stance",
        push=["0.60", "0.40"], flags=["can_ringout"], tags=["plus_mid", "ringout"])
    c.S("garde_2k", "2K", ("ガルド・クー・ド・ピエ・バ", "Garde Low Kick"), "low", "kick", 60, (14, 2, 18), (-6, 2, "KD"), "medium", LO,
        A("kick", side="l", style="low", reach=0.86), frm=("stance",), stance="garde", cat="stance", chr="trip")
    c.S("garde_6k", "6K", ("ガルド・フェッテ", "Garde Fouetté"), "high", "kick", 100, (15, 3, 21), (-6, "KD", "KD"), "heavy", "knockback",
        A("kick", side="r", style="round", h="high", reach=0.88), frm=("stance",), stance="garde", cat="stance", trk="half_right")
    c.step("garde_6", "6", ("ガルド前進", "Garde Advance"), A("step", dz=0.45, hop=0.05, stance="garde"), (1, 1, 13),
           frm=("stance",), from_stance="garde", end_stance="garde")
    c.step("garde_4", "4", ("ガルド後退", "Garde Retreat"), A("step", dz=-0.45, hop=0.05, stance="garde"), (1, 1, 13),
           frm=("stance",), from_stance="garde", end_stance="garde")
    c.S("evp", "P", ("回り込みディレクト", "Circling Direct"), "mid", "punch", 70, (14, 2, 18), (-4, 4, 6), "medium", ML,
        A("punch", side="r", h="mid", reach=0.66, step=0.10), frm=("evade",), cat="evade", trk="full")
    c.S("evk", "K", ("回り込みフェッテ", "Circling Fouetté"), "high", "kick", 100, (16, 3, 22), (-8, "KD", "KD"), "heavy", "knockback",
        A("kick", side="r", style="round", h="high", reach=0.88), frm=("evade",), cat="evade", trk="full")
    c.S("btp", "P", ("振り向き裏拳", "Turning Backfist"), "high", "punch", 70, (12, 2, 18), (-2, 4, "KD"), "medium", HL,
        A("punch", side="l", style="back", h="high", reach=0.66, start="backturn"), frm=("backturn",), cat="backturn",
        trk="full", chr="spin")
    c.S("btk", "K", ("振り向きルヴェール", "Turning Revers"), "mid", "kick", 120, (15, 3, 24), (-10, "KD", "KD"), "heavy", "knockback",
        A("kick", side="r", style="side", h="mid", reach=0.96, start="backturn"), frm=("backturn",), cat="backturn")
    c.S("runp", "P", ("走りディレクト", "Running Direct"), "mid", "punch", 100, (13, 3, 24), (-8, "KD", "KD"), "heavy", "knockback",
        A("punch", side="r", h="mid", reach=0.70, step=0.55), frm=("run",), cat="special")
    c.S("runk", "K", ("走り跳び蹴り", "Running Flying Kick"), "mid", "kick", 130, (14, 5, 30), (-14, "KD", "KD"), "heavy", "knockback",
        A("kick", side="r", style="jump", h="mid", reach=0.92, step=0.60), frm=("run",), cat="special", posture=[[4, 18, "airborne"]])
    c.T("pg", "P+G", ("襟投げ", "Collar Throw"), 240, "N", "neck", length=60, dmgf=38, end="face")
    c.T("6pg", "6P+G", ("押し蹴り投げ", "Push Kick Throw"), 260, "6", "push", length=58, dmgf=36, flags=["can_ringout"], tags=["ringout"])
    c.T("4pg", "4P+G", ("足掛け回し", "Hooking Turn"), 260, "4", "over", length=64, dmgf=40)
    c.T("2pg", "2P+G", ("足首取り", "Ankle Pick"), 220, "2", "lowtrip", lv="lthrow", frm=("stand", "crouch"), length=56, dmgf=36)
    c.side_back_wall_run(side=("側面足掛け", "Side Hook Throw", 270, "trip"), back=("背後投げ", "Back Throw", 310, "back"),
                         wall=("壁シャッセ", "Wall Chassé", 300, "wall"), run=("走り足取り", "Running Leg Take", 200, "tackle"))
    c.down_attacks(("踏み下ろし", "Stomp"), ("追い突き", "Down Punch"), stomp=True)
    ch_json = {
        "schema_version": 1, "id": "adrien", "name": ["アドリアン・ルフェーヴル", "Adrien Lefèvre"], "style": ["サバット", "Savate"],
        "difficulty": 3, "weight_class": "middle",
        "body": {"height": "1.88", "shoulder": "1.0", "hip": "0.98", "arm": "1.02", "leg": "1.07", "torso": "0.98"},
        "physics": {"push_radius": "0.30", "float_factor": "1.02", "hurt_mul": "1.00", "throw_range": "0.90"},
        "movement": {"walk_f": "1.55", "walk_b": "1.35", "dash_f": [18, "1.50"], "dash_b": [20, "1.35"], "run": "4.7", "evade": 22},
        "stance": {"lead": "l", "width": "0.24", "depth": "0.48", "crouch": "0.04", "turn": "36", "guard": "mid", "lean": "2"},
        "stances": [{"id": "garde", "name": ["ガルド", "Garde"], "max_frames": 0, "low_profile": False,
                     "pose": {"root": [0, 0.015, 0], "hand_l": [0.0, 0.04, 0.05], "hand_r": [0.0, 0.03, 0.03],
                              "foot_l": [0, 0.03, 0.04], "chest": [-3, 0, 0]}}],
        "model": {"build": "lean", "skin": "#EAC7AE", "hair": "short", "face": {"jaw": "0.55", "brow": "0.5", "nose": "0.7"}},
        "colors": [
            palette("#EAC7AE", "#3A2A1E", "#F2F2F2", "#1E2A4D", "#B3262B", shoes="#141414"),
            palette("#EAC7AE", "#3A2A1E", "#9A9A9A", "#1A1A1A", "#1A1A1A", shoes="#101010"),
            palette("#EAC7AE", "#3A2A1E", "#E6D7B8", "#6B4A2E", "#3A2A1E", shoes="#3A2414"),
            palette("#EAC7AE", "#3A2A1E", "#F2EEE8", "#5E1A2A", "#151515", shoes="#151515"),
        ],
        "home_stage": "skyline", "rival": "bjorn", "voice": {"pitch": "0.95", "type": "male_mid", "rough": "0.08"},
        "side_throw": "adrien_side_pg", "back_throw": "adrien_back_pg",
        "costumes": [
            {"id": "a", "name": ["シャツとサスペンダー", "Shirt & Suspenders"], "model": {"outfit": ["shirt", "pants", "suspenders", "shoes"]}},
            {"id": "b", "name": ["競技スーツ", "Competition Suit"], "model": {"outfit": ["singlet", "pants", "shoes"]}},
        ],
    }
    c.write(ch_json)


# ============================================================ ラヴィ（カラリパヤット）
def ravi():
    c = Char("ravi")
    i = c.id
    c.S("p", "P", ("掌打", "Palm Strike"), "high", "punch", 45, (10, 2, 13), (1, 4, 6), "light", HL,
        A("punch", side="l", style="palm", h="high", reach=0.62), tags=["jab", "fast_high"],
        chain=[ch(i("pp"), "P", (3, 22), 12), ch(i("pk"), "K", (3, 22), 13)])
    c.S("pp", "P", ("肘返し", "Return Elbow"), "high", "elbow", 60, (13, 2, 17), (-3, 3, 5), "light", HL,
        A("elbow", side="r", style="spin", h="high", step=0.08), frm=None, trk="half_right",
        chain=[ch(i("pp_lion"), "P+K", (6, 26), 17)])
    c.stance_move("pp_lion", "P+K", ("獅子へ", "Into Lion"), "lion", frm=None, f=(1, 1, 8))
    c.S("pk", "K", ("蹴り上げ", "Rising Kick"), "mid", "kick", 80, (15, 3, 20), (-6, 3, 5), "medium", ML,
        A("kick", side="r", style="front", h="mid", reach=0.84), frm=None)
    c.S("6p", "6P", ("突き掌", "Thrusting Palm"), "mid", "punch", 85, (14, 2, 17), (-3, 4, 6), "medium", ML,
        A("punch", side="r", style="palm", h="mid", reach=0.64, step=0.14), tags=["fast_mid"])
    c.S("3p", "3P", ("突き上げ", "Uppercut"), "mid", "punch", 105, (16, 3, 24), (-12, "LAUNCH", "LAUNCH"), "launch", "launch",
        A("punch", side="r", style="upper", h="head_high", reach=0.55, step=0.12), tags=["launcher"], launch=["0.115", "0.006"])
    c.S("2p", "2P", ("下段突き", "Low Punch"), "low", "punch", 40, (11, 2, 14), (-4, 3, 5), "light", LO,
        A("punch", side="l", h="low", reach=0.60, crouch=0.40, start="crouch", end="crouch"),
        frm=("stand", "crouch"), flags=["end_crouch"], tags=["fast_low"])
    c.S("wsp", "P", ("蛇昇", "Rising Serpent"), "mid", "punch", 110, (14, 3, 25), (-13, "LAUNCH", "LAUNCH"), "launch", "launch",
        A("punch", side="r", style="upper", h="head_high", reach=0.55, step=0.12, start="crouch"), frm=("rise",),
        launch=["0.118", "0.006"], tags=["launcher", "punisher"])
    c.S("k", "K", ("蹴り上げ", "Vertical Kick"), "high", "kick", 100, (14, 3, 20), (-5, 4, "KD"), "medium", HH,
        A("kick", side="r", style="front", h="1.62", reach=0.70), chr="knockback")
    c.S("6k", "6K", ("前蹴り", "Front Kick"), "mid", "kick", 95, (15, 3, 18), (-4, 3, 6), "medium", ML,
        A("kick", side="l", style="front", h="mid", reach=0.86))
    c.S("3k", "3K", ("弧蹴り", "Arc Kick"), "mid", "kick", 115, (17, 3, 21), (-6, 4, "STAGGER"), "medium", MH,
        A("kick", side="l", style="round", h="mid", reach=0.82), trk="half_left", chr="stagger_gut", tags=["ch_stagger"])
    c.S("2k", "2K", ("下段蹴り", "Low Kick"), "low", "kick", 45, (14, 2, 17), (-6, 2, 4), "light", LO,
        A("kick", side="l", style="low", reach=0.78, start="crouch", end="crouch"), frm=("stand", "crouch"), flags=["end_crouch"])
    c.S("1k", "1K", ("地這い払い", "Ground Sweep"), "low", "kick", 90, (19, 3, 26), (-15, "KD", "KD"), "heavy", "trip",
        A("kick", side="r", style="sweep", reach=0.94, start="crouch", end="crouch"), frm=("stand", "crouch"),
        trk="full", flags=["end_crouch"], tags=["low_kd"])
    c.S("4k", "4K", ("後方宙返り蹴り", "Backflip Kick"), "mid", "kick", 120, (18, 4, 28), (-12, "LAUNCH", "LAUNCH"), "launch", "launch",
        A("kick", side="r", style="flip", h="mid", back=-0.35), cat="special", posture=[[3, 16, "airborne"]],
        launch=["0.120", "0.006"], tags=["launcher"])
    c.S("pk2_g", "6P+K", ("象鼻打ち", "Trunk Swing"), "mid", "punch", 100, (17, 3, 22), (1, "KD", "KD"), "heavy", "knockback",
        A("punch", side="r", style="hammer", h="mid", reach=0.64, step=0.18), cat="special", tags=["plus_mid"],
        flags=["wall_splat"])
    # 三獣の構え
    c.stance_move("lion", "P+K", ("獅子の構え", "Lion Stance"), "lion", f=(1, 1, 8))
    c.stance_move("snake", "2P+K", ("蛇の構え", "Serpent Stance"), "snake", frm=("stand", "crouch"), f=(1, 1, 8),
                  posture=[[1, 8, "low_profile"]])
    c.stance_move("elephant", "4P+K", ("象の構え", "Elephant Stance"), "elephant", f=(1, 1, 8))
    for frm_s, to_s, cmd in (("lion", "snake", "2P+K"), ("lion", "elephant", "4P+K"), ("snake", "lion", "P+K"),
                             ("snake", "elephant", "4P+K"), ("elephant", "lion", "P+K"), ("elephant", "snake", "2P+K")):
        names = {"lion": ("獅子", "Lion"), "snake": ("蛇", "Serpent"), "elephant": ("象", "Elephant")}
        nm = ("%s→%s" % (names[frm_s][0], names[to_s][0]), "%s to %s" % (names[frm_s][1], names[to_s][1]))
        if to_s == "snake":
            c.stance_move("%s_to_%s" % (frm_s, to_s), cmd, nm, to_s, frm=("stance",), from_stance=frm_s, f=(1, 1, 6),
                          posture=[[1, 8, "low_profile"]])
        else:
            c.stance_move("%s_to_%s" % (frm_s, to_s), cmd, nm, to_s, frm=("stance",), from_stance=frm_s, f=(1, 1, 6))
    c.S("lion_p", "P", ("獅子爪", "Lion Claw"), "mid", "punch", 110, (18, 3, 22), (-4, "KD", "KD"), "heavy", "knockback",
        A("punch", side="r", style="chop", h="mid", reach=0.66, step=0.35), frm=("stance",), stance="lion", cat="stance", trk="half_right")
    c.S("lion_k", "K", ("獅子跳び蹴り", "Lion Leap Kick"), "mid", "kick", 130, (21, 4, 24), (-8, "LAUNCH", "LAUNCH"), "launch", "launch",
        A("kick", side="r", style="jump", h="mid", reach=0.86, step=0.40), frm=("stance",), stance="lion", cat="stance",
        posture=[[4, 20, "airborne"]], launch=["0.125", "0.007"])
    c.S("snake_p", "P", ("蛇牙", "Serpent Fang"), "mid", "punch", 90, (15, 3, 24), (-12, "LAUNCH", "LAUNCH"), "launch", "launch",
        A("punch", side="r", style="upper", h="head_high", reach=0.55, step=0.14), frm=("stance",), stance="snake", cat="stance",
        launch=["0.115", "0.006"])
    c.S("snake_k", "K", ("蛇尾払い", "Serpent Tail"), "low", "kick", 70, (16, 3, 24), (-12, "KD", "KD"), "heavy", "trip",
        A("kick", side="r", style="sweep", reach=0.94, end="crouch"), frm=("stance",), stance="snake", cat="stance", trk="full",
        flags=["end_crouch"])
    c.step("snake_6", "6", ("這い進み", "Serpent Crawl"), A("step", dz=0.50, low=0.10, hop=0.0, stance="snake"), (1, 1, 15),
           frm=("stance",), from_stance="snake", end_stance="snake", posture=[[1, 15, "low_profile"]])
    c.S("elephant_p", "P", ("象掌", "Elephant Palm"), "mid", "punch", 120, (24, 3, 22), (4, "KD", "KD"), "heavy", "knockback",
        A("punch", side="r", style="double", h="mid", reach=0.62, step=0.25), frm=("stance",), stance="elephant", cat="stance",
        flags=["guard_crush"], push=["0.40", "0.35"], tags=["plus_mid"])
    c.S("elephant_k", "K", ("象踏み", "Elephant Stomp"), "mid", "kick", 100, (22, 3, 22), (-6, "KD", "KD"), "heavy", "trip",
        A("kick", side="r", style="stomp", reach=0.70), frm=("stance",), stance="elephant", cat="stance", flags=["hits_down"])
    c.S("evp", "P", ("回り込み掌", "Circling Palm"), "mid", "punch", 70, (14, 2, 18), (-4, 4, 6), "medium", ML,
        A("punch", side="r", style="palm", h="mid", reach=0.62, step=0.10), frm=("evade",), cat="evade", trk="full")
    c.S("evk", "K", ("回り込み蹴り", "Circling Kick"), "high", "kick", 100, (16, 3, 22), (-8, "KD", "KD"), "heavy", "knockback",
        A("kick", side="r", style="round", h="high", reach=0.80), frm=("evade",), cat="evade", trk="full")
    c.S("btp", "P", ("振り向き掌", "Turning Palm"), "high", "punch", 70, (12, 2, 18), (-2, 4, "KD"), "medium", HL,
        A("punch", side="l", style="back", h="high", reach=0.62, start="backturn"), frm=("backturn",), cat="backturn",
        trk="full", chr="spin")
    c.S("btk", "K", ("振り向き蹴り上げ", "Turning Scorpion"), "mid", "kick", 110, (15, 3, 24), (-10, "KD", "KD"), "heavy", "knockback",
        A("kick", side="r", style="side", h="mid", reach=0.86, start="backturn"), frm=("backturn",), cat="backturn")
    c.S("runp", "P", ("走り掌打", "Running Palm"), "mid", "punch", 100, (13, 3, 24), (-8, "KD", "KD"), "heavy", "knockback",
        A("punch", side="r", style="palm", h="mid", reach=0.66, step=0.55), frm=("run",), cat="special")
    c.S("runk", "K", ("走り跳び蹴り", "Running Leap Kick"), "mid", "kick", 120, (14, 5, 30), (-14, "KD", "KD"), "heavy", "knockback",
        A("kick", side="r", style="jump", h="mid", reach=0.86, step=0.60), frm=("run",), cat="special", posture=[[4, 18, "airborne"]])
    c.T("pg", "P+G", ("腕絡み", "Arm Wrap"), 240, "N", "twist", length=64, dmgf=42, end="face")
    c.T("6pg", "6P+G", ("肩車落とし", "Shoulder Wheel Drop"), 290, "6", "over", length=66, dmgf=40)
    c.T("4pg", "4P+G", ("捻り倒し", "Twisting Takedown"), 260, "4", "neck", length=62, dmgf=40, end="face")
    c.T("2pg", "2P+G", ("膝固め", "Knee Lock"), 230, "2", "lowtrip", lv="lthrow", frm=("stand", "crouch"), length=56, dmgf=36)
    c.side_back_wall_run(side=("側面捻り", "Side Twist", 270, "neck"), back=("背後落とし", "Back Drop", 310, "back"),
                         wall=("壁掌打", "Wall Palm", 290, "wall"), run=("走り足取り", "Running Leg Take", 200, "tackle"))
    c.down_attacks(("跳びかかり掌", "Pouncing Palm"), ("追い掌", "Down Palm"))
    # バランス調整: 打撃ダメージを 8% 上げる（構えの移行で手数が減るため）
    for m in c.moves:
        if m["lv"] not in ("throw", "lthrow", "none", "parry"):
            m["dmg"] = int(round(m["dmg"] * 1.08 / 5.0)) * 5
    ch_json = {
        "schema_version": 1, "id": "ravi", "name": ["ラヴィ・ナーヤル", "Ravi Nair"], "style": ["カラリパヤット", "Kalaripayattu"],
        "difficulty": 5, "weight_class": "middle",
        "body": {"height": "1.75", "shoulder": "0.98", "hip": "0.98", "arm": "1.0", "leg": "1.02", "torso": "0.98", "sash_chain": True},
        "physics": {"push_radius": "0.29", "float_factor": "0.98", "hurt_mul": "0.92", "throw_range": "0.90"},
        "movement": {"walk_f": "1.40", "walk_b": "1.20", "dash_f": [19, "1.30"], "dash_b": [20, "1.15"], "run": "4.5", "evade": 22},
        "stance": {"lead": "l", "width": "0.32", "depth": "0.50", "crouch": "0.14", "turn": "30", "guard": "open", "lean": "8"},
        "stances": [
            {"id": "lion", "name": ["獅子", "Lion"], "max_frames": 0, "low_profile": False, "crouch": True,
             "pose": {"chest": [22, 0, 0], "head": [-14, 0, 0], "hand_l": [-0.04, -0.18, 0.16], "hand_r": [0.06, -0.24, 0.14],
                      "fist_l": 0.1, "fist_r": 0.1}},
            {"id": "snake", "name": ["蛇", "Serpent"], "max_frames": 0, "low_profile": True, "crouch": True,
             "pose": {"root": [0, -0.42, 0], "hips": [22, 0, 0], "chest": [30, 0, 0], "head": [-30, 0, 0],
                      "hand_l": [-0.02, -0.80, 0.30], "hand_r": [0.10, -0.76, 0.12], "fist_l": 0.0, "fist_r": 0.0}},
            {"id": "elephant", "name": ["象", "Elephant"], "max_frames": 0, "low_profile": False,
             "pose": {"root": [0, -0.12, 0], "foot_l": [-0.10, 0, 0], "foot_r": [0.10, 0, 0], "hand_l": [-0.10, -0.22, 0.06],
                      "hand_r": [0.12, -0.24, 0.10], "chest": [-4, 0, 0], "fist_l": 0.0, "fist_r": 0.0}},
        ],
        "model": {"build": "lean", "skin": "#9C6B47", "hair": "short", "beard": "short", "face": {"jaw": "0.55", "brow": "0.55", "nose": "0.6"}},
        "colors": [
            palette("#9C6B47", "#16120F", "#F0ECE2", "#F0ECE2", "#D2452A", metal="#C9A548"),
            palette("#9C6B47", "#16120F", "#151515", "#151515", "#C9A548", metal="#C9A548"),
            palette("#9C6B47", "#16120F", "#1E3A6B", "#F2F2F2", "#F2F2F2", metal="#B0B0B0"),
            palette("#9C6B47", "#16120F", "#9AC46A", "#E6DCC4", "#E6DCC4", metal="#C9A548"),
        ],
        "home_stage": "ruins", "rival": "toma", "voice": {"pitch": "0.92", "type": "male_calm", "rough": "0.05"},
        "side_throw": "ravi_side_pg", "back_throw": "ravi_back_pg",
        "costumes": [
            {"id": "a", "name": ["腰布", "Training Wrap"], "model": {"outfit": ["dhoti", "sash", "armbands"]}},
            {"id": "b", "name": ["クルタ", "Kurta"], "model": {"outfit": ["kurta", "pants_loose", "sash"]}},
        ],
    }
    c.write(ch_json)


# ============================================================ 玄斎（古流柔術）
def gensai():
    c = Char("gensai")
    i = c.id
    c.S("p", "P", ("当身突き", "Vital Strike"), "high", "punch", 50, (10, 2, 13), (1, 4, 6), "light", HL,
        A("punch", side="l", style="spear", h="high", reach=0.60), tags=["jab", "fast_high"],
        chain=[ch(i("pp"), "P", (3, 24), 13), ch(i("pk"), "K", (3, 24), 14)])
    c.S("pp", "P", ("手刀", "Knife Hand"), "mid", "punch", 75, (15, 3, 20), (-6, 3, "STAGGER"), "medium", ML,
        A("punch", side="r", style="chop", h="mid", reach=0.60, step=0.08), frm=None, chr="stagger_gut",
        chain=[ch(i("ppp"), "P", (3, 28), 19)])
    c.S("ppp", "P", ("掌底", "Palm Heel"), "mid", "punch", 80, (16, 3, 22), (-8, "KD", "KD"), "heavy", "knockback",
        A("punch", side="l", style="palm", h="mid", reach=0.62, step=0.18), frm=None)
    c.S("pk", "K", ("前蹴り", "Front Kick"), "mid", "kick", 80, (16, 3, 20), (-6, 3, 5), "medium", ML,
        A("kick", side="r", style="front", h="mid", reach=0.80), frm=None)
    c.S("6p", "6P", ("掌打", "Palm Strike"), "mid", "punch", 90, (14, 3, 18), (-3, 4, "KD"), "medium", ML,
        A("punch", side="r", style="palm", h="mid", reach=0.62, step=0.14), chr="knockback", tags=["fast_mid"],
        chain=[ch(i("6pp"), "P", (3, 26), 17)])
    c.S("6pp", "P", ("返し手刀", "Return Knife Hand"), "high", "punch", 60, (13, 2, 18), (-5, 3, "KD"), "medium", HL,
        A("punch", side="l", style="chop", h="high", reach=0.58), frm=None, trk="half_left", chr="spin")
    c.S("3p", "3P", ("突き上げ掌", "Rising Palm"), "mid", "punch", 100, (16, 3, 25), (-13, "LAUNCH", "LAUNCH"), "launch", "launch",
        A("punch", side="r", style="upper", h="head_high", reach=0.55, step=0.12), tags=["launcher"], launch=["0.115", "0.006"],
        chain=[ch(i("3pp"), "P", (3, 28), 20)])
    c.S("3pp", "P", ("打ち下ろし手刀", "Descending Knife Hand"), "mid", "punch", 70, (15, 3, 22), (-8, "KD", "KD"), "heavy", "trip",
        A("punch", side="l", style="hammer", h="mid", reach=0.60), frm=None)
    c.S("4p", "4P", ("払い手刀", "Sweeping Knife Hand"), "high", "punch", 70, (14, 3, 18), (-3, 4, 6), "medium", HL,
        A("punch", side="l", style="chop", h="high", reach=0.60), trk="half_left", chr="turn")
    c.S("2p", "2P", ("下段突き", "Low Punch"), "low", "punch", 40, (11, 2, 14), (-4, 3, 5), "light", LO,
        A("punch", side="l", h="low", reach=0.58, crouch=0.40, start="crouch", end="crouch"),
        frm=("stand", "crouch"), flags=["end_crouch"], tags=["fast_low"])
    c.S("wsp", "P", ("昇掌", "Ascending Palm"), "mid", "punch", 100, (15, 3, 24), (-12, "LAUNCH", "LAUNCH"), "launch", "launch",
        A("punch", side="r", style="upper", h="head_high", reach=0.55, step=0.12, start="crouch"), frm=("rise",),
        launch=["0.118", "0.006"], tags=["launcher", "punisher"])
    c.S("k", "K", ("前蹴り", "Front Kick"), "mid", "kick", 80, (15, 3, 18), (-4, 3, 6), "medium", ML,
        A("kick", side="r", style="front", h="mid", reach=0.80))
    c.S("6k", "6K", ("中段足刀", "Mid Blade Kick"), "mid", "kick", 90, (16, 3, 20), (-5, "KD", "KD"), "heavy", "knockback",
        A("kick", side="l", style="side", h="mid", reach=0.86, step=0.10), push=["0.40", "0.30"])
    c.S("1k", "1K", ("刈り足", "Reaping Foot"), "low", "kick", 75, (20, 3, 26), (-15, "KD", "KD"), "heavy", "trip",
        A("kick", side="r", style="sweep", reach=0.86, start="crouch", end="crouch"), frm=("stand", "crouch"), trk="half_left",
        flags=["end_crouch"])
    c.S("pk2", "P+K", ("両手当身", "Twin Vital Strike"), "mid", "punch", 80, (15, 3, 18), (1, 4, "KD"), "medium", ML,
        A("punch", side="r", style="double", h="mid", reach=0.58, step=0.18), cat="special", chr="knockback", tags=["plus_mid"])
    c.S("3k", "3K", ("膝当て", "Knee Strike"), "mid", "knee", 100, (16, 3, 21), (-6, 4, "STAGGER"), "medium", ML,
        A("kick", side="r", style="knee", h="mid", step=0.26), chr="stagger_gut", tags=["ch_stagger"])
    c.S("2k", "2K", ("足刀払い", "Blade Foot Sweep"), "low", "kick", 60, (15, 2, 18), (-7, 2, "KD"), "medium", LO,
        A("kick", side="l", style="low", reach=0.76, start="crouch", end="crouch"), frm=("stand", "crouch"),
        trk="half_right", chr="trip", flags=["end_crouch"])
    c.S("4k", "4K", ("回り足払い", "Circular Sweep"), "low", "kick", 90, (21, 3, 26), (-14, "KD", "KD"), "heavy", "trip",
        A("kick", side="r", style="sweep", reach=0.86, start="crouch", end="crouch"), trk="full", flags=["end_crouch"], tags=["low_kd"])
    c.S("3pk", "3P+K", ("足元崩し", "Ankle Strike"), "low", "punch", 55, (16, 3, 22), (-8, 1, 3), "medium", LO,
        A("punch", side="r", style="chop", h="low", reach=0.60, crouch=0.36, end="crouch"), cat="special",
        trk="half_left", flags=["end_crouch"])
    c.S("6pk", "6P+K", ("発勁", "Fajin Palm"), "mid", "punch", 110, (19, 3, 22), (2, "KD", "KD"), "heavy", "knockback",
        A("punch", side="r", style="double", h="mid", reach=0.58, step=0.20), cat="special", push=["0.55", "0.40"],
        flags=["can_ringout", "wall_splat"], tags=["plus_mid", "ringout"])
    c.S("kg", "K+G", ("踵踏み", "Heel Drop"), "mid", "kick", 100, (22, 3, 22), (1, "KD", "KD"), "heavy", "trip",
        A("kick", side="r", style="axe", h="mid", reach=0.70, step=0.10), cat="special")
    c.S("66p", "P", ("踏み込み当身", "Stepping Strike"), "mid", "punch", 100, (16, 3, 22), (-6, "KD", "KD"), "heavy", "knockback",
        A("punch", side="r", style="palm", h="mid", reach=0.64, step=0.45), frm=("dash",), cat="special")
    # 当て身
    c.parry("4pk", "4P+K", ("当て身・上中", "Reversal High/Mid"), (2, 12), ["high", "mid", "smid"],
            ["punch", "elbow", "kick", "knee", "head"], "rev_hi", (2, 11, 20), side="l")
    c.T("rev_hi", "P", ("当て身投げ", "Reversal Throw"), 185, "none", "flip", frm=None, length=56, dmgf=34, stage=True, cat="system")
    c.parry("1pk", "1P+K", ("当て身・下", "Reversal Low"), (2, 10), ["low"], ["punch", "kick", "elbow", "knee"], "rev_lo",
            (2, 9, 22), side="r", low=True, frm=("stand", "crouch"))
    c.T("rev_lo", "P", ("足取り返し", "Leg Catch Reversal"), 150, "none", "trip", frm=None, length=52, dmgf=32, stage=True, cat="system")
    c.S("evp", "P", ("回り込み当身", "Circling Strike"), "mid", "punch", 70, (14, 2, 18), (-4, 4, 6), "medium", ML,
        A("punch", side="r", style="palm", h="mid", reach=0.60, step=0.10), frm=("evade",), cat="evade", trk="full")
    c.S("evk", "K", ("回り込み蹴り", "Circling Kick"), "mid", "kick", 90, (16, 3, 22), (-8, "KD", "KD"), "heavy", "knockback",
        A("kick", side="r", style="round", h="mid", reach=0.76), frm=("evade",), cat="evade", trk="full")
    c.S("btp", "P", ("振り向き手刀", "Turning Knife Hand"), "high", "punch", 70, (12, 2, 18), (-2, 4, "KD"), "medium", HL,
        A("punch", side="l", style="chop", h="high", reach=0.58, start="backturn"), frm=("backturn",), cat="backturn",
        trk="full", chr="spin")
    c.S("btk", "K", ("振り向き足払い", "Turning Sweep"), "low", "kick", 70, (15, 3, 24), (-12, "KD", "KD"), "heavy", "trip",
        A("kick", side="r", style="sweep", reach=0.84, start="backturn", end="crouch"), frm=("backturn",), cat="backturn",
        trk="full", flags=["end_crouch"])
    c.S("runp", "P", ("走り当身", "Running Strike"), "mid", "punch", 100, (13, 3, 24), (-8, "KD", "KD"), "heavy", "knockback",
        A("punch", side="r", style="palm", h="mid", reach=0.64, step=0.55), frm=("run",), cat="special")
    c.S("runk", "K", ("走り足払い", "Running Sweep"), "low", "kick", 90, (14, 4, 30), (-16, "KD", "KD"), "heavy", "trip",
        A("kick", side="r", style="sweep", reach=0.90, step=0.55, end="crouch"), frm=("run",), cat="special",
        posture=[[3, 16, "low_profile"]], flags=["end_crouch"])
    c.T("pg", "P+G", ("小手返し", "Wrist Turn"), 260, "N", "flip", length=58, dmgf=36)
    c.T("6pg", "6P+G", ("四方投げ", "Four Direction Throw"), 300, "6", "twist", length=70, dmgf=46, end="face")
    c.T("4pg", "4P+G", ("隅落とし", "Corner Drop"), 280, "4", "trip", length=60, dmgf=38, flags=["can_ringout"], tags=["ringout"])
    c.T("2pg", "2P+G", ("膝崩し", "Knee Collapse"), 240, "2", "lowtrip", lv="lthrow", frm=("stand", "crouch"), length=56, dmgf=36)
    c.T("46pg", "46P+G", ("鷹落とし", "Hawk Drop"), 340, "6", "over", f=(12, 1, 20), length=70, dmgf=44, flags=["no_tech"])
    c.side_back_wall_run(side=("側面小手返し", "Side Wrist Turn", 280, "flip"), back=("背後崩し", "Rear Collapse", 320, "back"),
                         wall=("壁当て", "Wall Strike", 300, "wall"), run=("走り隅落とし", "Running Corner Drop", 200, "trip"))
    c.down_attacks(("踏み下ろし当身", "Downward Strike"), ("追い当身", "Down Strike"))
    # バランス調整: 打撃ダメージを 6% 上げる（当て身頼みで打撃が控えめだったため）
    for m in c.moves:
        if m["lv"] not in ("throw", "lthrow", "none", "parry"):
            m["dmg"] = int(round(m["dmg"] * 1.06 / 5.0)) * 5
    ch_json = {
        "schema_version": 1, "id": "gensai", "name": ["鷹司 玄斎", "Gensai Takatsukasa"], "style": ["鷹司流 古流柔術", "Takatsukasa-ryu Jujutsu"],
        "difficulty": 4, "weight_class": "middle",
        "body": {"height": "1.65", "shoulder": "0.94", "hip": "0.96", "arm": "1.0", "leg": "0.97", "torso": "0.98"},
        "physics": {"push_radius": "0.28", "float_factor": "1.00", "hurt_mul": "0.98", "throw_range": "0.95"},
        "movement": {"walk_f": "1.35", "walk_b": "1.20", "dash_f": [18, "1.30"], "dash_b": [20, "1.10"], "run": "4.3", "evade": 21},
        "stance": {"lead": "l", "width": "0.24", "depth": "0.40", "crouch": "0.05", "turn": "24", "guard": "open", "lean": "0"},
        "model": {"build": "old", "skin": "#E3C2A6", "hair": "bun", "beard": "short", "face": {"jaw": "0.5", "brow": "0.8", "nose": "0.6"}},
        "colors": [
            palette("#E3C2A6", "#D8D8D4", "#151515", "#4A4A4E", "#B8B8BC", shoes="#F2F2F2", tertiary="#E8E6DE"),
            palette("#E3C2A6", "#D8D8D4", "#F2F0EA", "#1E2A4D", "#1E2A4D", shoes="#F2F2F2", tertiary="#9AA4B8"),
            palette("#E3C2A6", "#D8D8D4", "#5A3A22", "#C9A548", "#C9A548", shoes="#F2F2F2", tertiary="#E6DCC4"),
            palette("#E3C2A6", "#D8D8D4", "#7A1018", "#151515", "#C9A548", shoes="#F2F2F2", tertiary="#E8E6DE"),
        ],
        "home_stage": "lighthouse", "rival": "yuelan", "voice": {"pitch": "0.85", "type": "male_old", "rough": "0.35"},
        "side_throw": "gensai_side_pg", "back_throw": "gensai_back_pg",
        "costumes": [
            {"id": "a", "name": ["羽織袴", "Haori & Hakama"], "model": {"outfit": ["gi_top", "haori", "hakama", "tabi"], "recolor": {"gi_top": {"primary": "tertiary"}}}},
            {"id": "b", "name": ["稽古着", "Practice Gi"], "model": {"outfit": ["gi_top", "hakama", "tabi"], "recolor": {"gi_top": {"primary": "tertiary"}}}},
        ],
    }
    c.write(ch_json)
