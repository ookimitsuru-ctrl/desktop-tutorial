"""レナ・ビョルン・ゾー・月嵐"""
from common import A, Char, ch, palette

HL, HH, ML, MH, LO = "high_light", "high_heavy", "mid_light", "mid_heavy", "low"


# ============================================================ レナ（システマ）
def lena():
    c = Char("lena")
    i = c.id
    c.S("p", "P", ("掌打", "Palm Jab"), "high", "punch", 45, (10, 2, 13), (1, 4, 6), "light", HL,
        A("punch", side="l", style="palm", h="high", reach=0.60), tags=["jab", "fast_high"],
        chain=[ch(i("pp"), "P", (3, 22), 12), ch(i("pk"), "K", (3, 22), 13)])
    c.S("pp", "P", ("肘打ち", "Elbow"), "high", "elbow", 55, (12, 2, 16), (-1, 3, 6), "light", HL,
        A("elbow", side="r", style="fwd", h="high", step=0.10), frm=None,
        chain=[ch(i("ppp"), "P", (3, 34), 14), ch(i("ppk"), "K", (3, 34), 14)])
    c.S("ppp", "P", ("喉突き", "Throat Strike"), "mid", "punch", 70, (14, 3, 22), (-7, 3, "STAGGER"), "medium", ML,
        A("punch", side="l", style="spear", h="mid", reach=0.62, step=0.10), frm=None, chr="stagger_gut", stagger=36)
    c.S("ppk", "K", ("膝刈り", "Knee Reap"), "low", "kick", 60, (15, 3, 22), (-9, 2, "KD"), "medium", LO,
        A("kick", side="r", style="low", reach=0.78), frm=None, chr="trip")
    c.S("pk", "K", ("中段蹴り", "Mid Kick"), "mid", "kick", 75, (15, 3, 20), (-6, 3, 5), "medium", ML,
        A("kick", side="r", style="front", h="mid", reach=0.82), frm=None)
    c.S("6p", "6P", ("縦拳", "Vertical Fist"), "mid", "punch", 70, (13, 2, 16), (-2, 4, 6), "medium", ML,
        A("punch", side="r", h="mid", reach=0.64, step=0.12), tags=["fast_mid"],
        chain=[ch(i("6pp"), "P", (3, 32), 15)])
    c.S("6pp", "P", ("流し掌底", "Flowing Palm"), "high", "punch", 60, (13, 2, 18), (-5, 3, "KD"), "medium", HL,
        A("punch", side="l", style="palm", h="high", reach=0.62, step=0.06), frm=None, chr="knockback")
    c.S("3p", "3P", ("肘突き上げ", "Rising Elbow"), "smid", "elbow", 65, (12, 2, 16), (-1, 3, 6), "light", ML,
        A("elbow", side="r", style="up", h="mid", step=0.12), frm=("stand", "crouch"), tags=["fast_mid"],
        chain=[ch(i("3pp"), "P", (3, 22), 14)])
    c.S("3pp", "P", ("裏掌", "Back Palm"), "high", "punch", 55, (13, 2, 19), (-5, 2, "KD"), "medium", HL,
        A("punch", side="l", style="back", h="high", reach=0.60), frm=None, trk="half_left", chr="spin")
    c.S("4p", "4P", ("払い掌", "Sweeping Palm"), "high", "punch", 60, (13, 3, 18), (-3, 4, 6), "medium", HL,
        A("punch", side="l", style="chop", h="high", reach=0.62), trk="half_left", chr="turn",
        chain=[ch(i("4pk"), "K", (3, 26), 16)])
    c.S("4pk", "K", ("払い足刈り", "Sweep Reap"), "low", "kick", 55, (15, 3, 24), (-10, 1, "KD"), "medium", LO,
        A("kick", side="r", style="low", reach=0.80), frm=None, chr="trip")
    c.S("2p", "2P", ("下段突き", "Low Punch"), "low", "punch", 35, (11, 2, 14), (-4, 3, 5), "light", LO,
        A("punch", side="l", h="low", reach=0.58, crouch=0.40, start="crouch", end="crouch"),
        frm=("stand", "crouch"), flags=["end_crouch"], tags=["fast_low"])
    c.S("wsp", "P", ("掌底突き上げ", "Rising Palm"), "mid", "punch", 90, (15, 3, 24), (-12, "LAUNCH", "LAUNCH"), "launch", "launch",
        A("punch", side="r", style="upper", h="head_high", reach=0.55, step=0.12, start="crouch"), frm=("rise",),
        launch=["0.118", "0.006"], tags=["launcher", "punisher"])
    c.S("wsk", "K", ("跳ね膝", "Rising Knee"), "mid", "knee", 80, (15, 3, 21), (-6, 4, "STAGGER"), "medium", ML,
        A("kick", side="r", style="knee", h="mid", step=0.24, start="crouch"), frm=("rise",), chr="stagger_gut")
    c.S("66p", "P", ("スリップ肘", "Slip Elbow"), "mid", "elbow", 90, (15, 3, 20), (-4, "KD", "KD"), "heavy", "knockback",
        A("elbow", side="r", style="fwd", h="mid", step=0.40), frm=("dash",), cat="special", trk="half_right",
        posture=[[1, 10, "low_profile"]])
    c.S("66k", "K", ("滑り蹴り", "Slide Kick"), "low", "kick", 75, (17, 4, 28), (-16, "KD", "KD"), "heavy", "trip",
        A("kick", side="r", style="sweep", reach=0.90, step=0.40, end="crouch"), frm=("dash",), cat="special",
        posture=[[3, 18, "low_profile"]], flags=["end_crouch"])
    c.S("pk2", "P+K", ("肩当て", "Shoulder Check"), "mid", "body", 80, (14, 3, 18), (1, 5, "KD"), "medium", ML,
        A("shoulder", step=0.30), cat="special", chr="knockback", tags=["plus_mid"], push=["0.35", "0.25"])
    c.S("k", "K", ("上段蹴り", "High Kick"), "high", "kick", 80, (13, 3, 19), (-4, 4, "KD"), "medium", HH,
        A("kick", side="r", style="round", h="high", reach=0.78), trk="half_right", chr="knockback",
        chain=[ch(i("kk"), "K", (3, 30), 17)])
    c.S("kk", "K", ("返し下段", "Return Low"), "low", "kick", 50, (14, 2, 20), (-8, 2, "KD"), "medium", LO,
        A("kick", side="l", style="low", reach=0.78), frm=None, chr="trip")
    c.S("6k", "6K", ("前蹴り押し", "Push Kick"), "mid", "kick", 85, (15, 3, 19), (-3, "KD", "KD"), "heavy", "knockback",
        A("kick", side="l", style="push", h="mid", reach=0.86), push=["0.45", "0.30"], flags=["can_ringout"])
    c.S("3k", "3K", ("膝蹴り", "Knee"), "mid", "knee", 90, (14, 3, 20), (-5, 4, "LAUNCH"), "medium", ML,
        A("kick", side="r", style="knee", h="mid", step=0.26), chr="launch", tags=["ch_launch"])
    c.S("2k", "2K", ("下段蹴り", "Low Kick"), "low", "kick", 45, (14, 2, 17), (-6, 2, 4), "light", LO,
        A("kick", side="l", style="low", reach=0.76, start="crouch", end="crouch"), frm=("stand", "crouch"), flags=["end_crouch"])
    c.S("1k", "1K", ("足刈り倒し", "Leg Reap"), "low", "kick", 75, (19, 3, 26), (-14, "KD", "KD"), "heavy", "trip",
        A("kick", side="r", style="sweep", reach=0.88, start="crouch", end="crouch"), frm=("stand", "crouch"),
        trk="half_left", flags=["end_crouch"], tags=["low_kd"])
    c.S("4k", "4K", ("回転肘落とし", "Spinning Elbow Drop"), "mid", "elbow", 110, (21, 3, 22), (-8, "KD", "KD"), "heavy", "knockback",
        A("elbow", side="r", style="fwd", h="mid", step=0.36, twist=20), trk="full")
    c.S("3pk", "3P+K", ("下段掌", "Low Palm"), "low", "punch", 50, (16, 3, 22), (-8, 1, 3), "medium", LO,
        A("punch", side="r", style="palm", h="low", reach=0.62, crouch=0.36, end="crouch"), cat="special",
        trk="half_left", flags=["end_crouch"])
    c.S("kg", "K+G", ("踵刈り", "Heel Hook"), "mid", "kick", 100, (22, 3, 22), (1, "KD", "KD"), "heavy", "trip",
        A("kick", side="r", style="axe", h="mid", reach=0.74, step=0.12), cat="special", tags=["plus_mid"])
    # 脱力
    c.stance_move("relax", "P+K+G", ("脱力", "Relax"), "relax", f=(1, 1, 7), posture=[[1, 7, "low_profile"]])
    c.S("relax_p", "P", ("掌底", "Relaxed Palm"), "mid", "punch", 80, (14, 3, 20), (-6, "LAUNCH", "LAUNCH"), "launch", "launch",
        A("punch", side="r", style="upper", h="head_high", reach=0.55, step=0.15), frm=("stance",), stance="relax", cat="stance",
        launch=["0.112", "0.006"], tags=["launcher"])
    c.S("relax_k", "K", ("足刈り", "Relaxed Reap"), "low", "kick", 60, (16, 3, 24), (-12, "KD", "KD"), "heavy", "trip",
        A("kick", side="r", style="sweep", reach=0.88, end="crouch"), frm=("stance",), stance="relax", cat="stance",
        trk="half_right", flags=["end_crouch"])
    c.step("relax_6", "6", ("滑り込み", "Slide In"), A("step", dx=0.55, dz=0.30, low=0.15), (1, 1, 17),
           frm=("stance",), from_stance="relax", posture=[[1, 12, "low_profile"]])
    # 回避・背向け・走り
    c.S("evp", "P", ("回り込み掌", "Circling Palm"), "mid", "punch", 65, (14, 2, 18), (-4, 4, 6), "medium", ML,
        A("punch", side="r", style="palm", h="mid", reach=0.62, step=0.10), frm=("evade",), cat="evade", trk="full")
    c.S("evk", "K", ("回り込み蹴り", "Circling Kick"), "high", "kick", 90, (16, 3, 22), (-8, "KD", "KD"), "heavy", "knockback",
        A("kick", side="r", style="round", h="high", reach=0.78), frm=("evade",), cat="evade", trk="full")
    c.S("btp", "P", ("振り向き掌", "Turning Palm"), "high", "punch", 65, (12, 2, 18), (-2, 4, "KD"), "medium", HL,
        A("punch", side="l", style="back", h="high", reach=0.60, start="backturn"), frm=("backturn",), cat="backturn",
        trk="full", chr="spin")
    c.S("btk", "K", ("振り向き足刈り", "Turning Reap"), "low", "kick", 60, (16, 3, 24), (-12, "KD", "KD"), "heavy", "trip",
        A("kick", side="r", style="sweep", reach=0.86, start="backturn", end="crouch"), frm=("backturn",), cat="backturn",
        trk="full", flags=["end_crouch"])
    c.S("runp", "P", ("走り込み掌", "Running Palm"), "mid", "punch", 100, (13, 3, 24), (-8, "KD", "KD"), "heavy", "knockback",
        A("punch", side="r", style="palm", h="mid", reach=0.66, step=0.55), frm=("run",), cat="special")
    c.S("runk", "K", ("滑り込み蹴り", "Running Slide"), "low", "kick", 100, (14, 5, 30), (-16, "KD", "KD"), "heavy", "trip",
        A("kick", side="r", style="sweep", reach=0.92, step=0.60, end="crouch"), frm=("run",), cat="special",
        posture=[[3, 18, "low_profile"]], flags=["end_crouch"])
    # 投げ
    c.T("pg", "P+G", ("喉輪落とし", "Throat Drop"), 240, "N", "trip", length=62, dmgf=40)
    c.T("4pg", "4P+G", ("背後回り", "Circle Behind"), 200, "4", "behind", length=48, dmgf=30, end="backturn", stun=12)
    c.T("6pg", "6P+G", ("腕極め崩し", "Arm Bar Takedown"), 290, "6", "twist", length=70, dmgf=46, end="face")
    c.T("2pg", "2P+G", ("足取り", "Leg Catch"), 230, "2", "lowtrip", lv="lthrow", frm=("stand", "crouch"), length=56, dmgf=36)
    c.T("2pg_down", "2P+G", ("ダウン極め", "Ground Lock"), 120, "none", "down", frm=("opp_down",), f=(12, 1, 24),
        length=54, dmgf=34, vs_down=True, flags=["no_tech"], cat="down_attack")
    c.side_back_wall_run(side=("側面崩し", "Side Takedown", 270, "neck"), back=("背後締め落とし", "Rear Choke Drop", 310, "back"),
                         wall=("壁押さえ", "Wall Pin", 290, "wall"), run=("走り足取り", "Running Leg Take", 200, "tackle"))
    c.down_attacks(("膝落とし", "Knee Drop"), ("追い掌", "Down Palm"))
    ch_json = {
        "schema_version": 1, "id": "lena", "name": ["レナ・ヴォルコワ", "Lena Volkova"], "style": ["システマ", "Systema"],
        "difficulty": 3, "weight_class": "light",
        "body": {"height": "1.68", "shoulder": "0.90", "hip": "1.02", "arm": "0.97", "leg": "1.03", "torso": "0.96",
                 "hair_chain": True, "hair_len": "0.34"},
        "physics": {"push_radius": "0.27", "float_factor": "0.93", "hurt_mul": "0.96", "throw_range": "0.85"},
        "movement": {"walk_f": "1.70", "walk_b": "1.40", "dash_f": [17, "1.55"], "dash_b": [19, "1.30"], "run": "4.7", "evade": 20},
        "stance": {"lead": "l", "width": "0.26", "depth": "0.42", "crouch": "0.09", "turn": "34", "guard": "low", "lean": "4"},
        "stances": [{"id": "relax", "name": ["脱力", "Relax"], "max_frames": 60, "low_profile": True, "crouch": True,
                     "pose": {"chest": [16, 0, 0], "hips": [8, 0, 0], "head": [-10, 0, 0], "hand_l": [0.04, -0.30, 0.02],
                              "hand_r": [-0.02, -0.28, 0.06], "fist_l": 0.1, "fist_r": 0.1}}],
        "model": {"build": "slim", "female": True, "skin": "#EBCDB7", "hair": "ponytail", "face": {"jaw": "0.35", "brow": "0.35", "nose": "0.4"}},
        "colors": [
            palette("#EBCDB7", "#C9CCD1", "#4A4D52", "#1F2124", "#7FC8E8", gloves="#111111", shoes="#222222", tertiary="#141414", metal="#EDEDED"),
            palette("#EBCDB7", "#C9CCD1", "#1E2A44", "#E8E8E8", "#C8372D", gloves="#151515", shoes="#1A1A1A", tertiary="#E2E2E2", metal="#F2F2F2"),
            palette("#EBCDB7", "#C9CCD1", "#6B1E2C", "#151515", "#D9B36A", gloves="#111111", shoes="#1E1E1E", tertiary="#2A0E14", metal="#E8E0D8"),
            palette("#EBCDB7", "#C9CCD1", "#5B6142", "#C9B48A", "#E07B39", gloves="#2F2A20", shoes="#3B3226", tertiary="#3A3D2B", metal="#E6DCC4"),
        ],
        "home_stage": "fort", "rival": "adrien", "voice": {"pitch": "0.92", "type": "female_low", "rough": "0.05"},
        "side_throw": "lena_side_pg", "back_throw": "lena_back_pg",
        "costumes": [
            {"id": "a", "name": ["タクティカル", "Tactical"],
             "model": {"outfit": ["turtleneck", "jacket_short", "cargo", "gloves_open", "boots"]}},
            {"id": "b", "name": ["トレーニング", "Training"], "model": {"outfit": ["tank", "pants", "wraps", "sneakers"], "recolor": {"tank": {"primary": "metal"}, "pants": {"secondary": "tertiary"}}}},
        ],
    }
    c.write(ch_json)


# ============================================================ ビョルン（グレコローマン）
def bjorn():
    c = Char("bjorn")
    i = c.id
    c.S("p", "P", ("ジャブ", "Jab"), "high", "punch", 55, (10, 2, 14), (0, 4, 6), "light", HL,
        A("punch", side="l", h="high", reach=0.64), tags=["jab", "fast_high"],
        chain=[ch(i("pp"), "P", (3, 24), 13), ch(i("pk"), "K", (3, 24), 14)])
    c.S("pp", "P", ("ハンマーパンチ", "Hammer Punch"), "mid", "punch", 80, (15, 3, 20), (-6, 3, "KD"), "heavy", MH,
        A("punch", side="r", style="hammer", h="mid", reach=0.62, step=0.08), frm=None, chr="knockback")
    c.S("pk", "K", ("前蹴り", "Front Kick"), "mid", "kick", 85, (16, 3, 21), (-7, 3, 5), "medium", ML,
        A("kick", side="r", style="front", h="mid", reach=0.84), frm=None)
    c.S("6p", "6P", ("前腕打ち", "Forearm Smash"), "mid", "elbow", 90, (14, 3, 18), (-3, 4, 7), "medium", ML,
        A("elbow", side="r", style="fwd", h="mid", step=0.16), tags=["fast_mid"],
        chain=[ch(i("6pp"), "P", (3, 26), 16)])
    c.S("6pp", "P", ("逆腕振り", "Backhand Swing"), "high", "punch", 80, (15, 3, 20), (-6, 3, "KD"), "heavy", HH,
        A("punch", side="l", style="hook", h="high", reach=0.64), frm=None, trk="half_left", chr="spin")
    c.S("3p", "3P", ("ショートアッパー", "Short Uppercut"), "mid", "punch", 100, (15, 3, 24), (-12, "LAUNCH", "LAUNCH"), "launch", "launch",
        A("punch", side="r", style="upper", h="head_high", reach=0.55, step=0.10), tags=["launcher"],
        launch=["0.110", "0.005"], chain=[ch(i("3pp"), "P", (3, 26), 19)])
    c.S("3pp", "P", ("打ち下ろし", "Downward Hammer"), "mid", "punch", 80, (16, 3, 22), (-8, "KD", "KD"), "heavy", "knockback",
        A("punch", side="l", style="hammer", h="mid", reach=0.60), frm=None)
    c.S("2p", "2P", ("下段突き", "Low Punch"), "low", "punch", 45, (11, 2, 15), (-5, 2, 4), "light", LO,
        A("punch", side="l", h="low", reach=0.62, crouch=0.40, start="crouch", end="crouch"),
        frm=("stand", "crouch"), flags=["end_crouch"], tags=["fast_low"])
    c.S("4p", "4P", ("振り下ろし", "Overhead Smash"), "mid", "punch", 120, (20, 3, 22), (-6, "KD", "CRUMPLE"), "heavy", "knockback",
        A("punch", side="r", style="hammer", h="mid", reach=0.66, step=0.12), trk="half_left", chr="crumple", tags=["ch_crumple"])
    c.S("46p", "46P", ("溜め鉄槌", "Charged Sledge"), "mid", "punch", 150, (24, 3, 26), (-6, "KD", "WALLSPLAT"), "heavy", "knockback",
        A("punch", side="r", style="hammer", h="mid", reach=0.70, step=0.30), cat="special", chr="wall_splat", flags=["wall_splat"])
    c.S("66p", "P", ("ラリアット", "Lariat"), "high", "punch", 140, (17, 4, 26), (-11, "KD", "KD"), "heavy", "spin",
        A("punch", side="r", style="hook", h="high", reach=0.70, step=0.55), frm=("dash",), cat="special", trk="half_right")
    c.S("pk2", "P+K", ("両手押し", "Double Shove"), "mid", "punch", 70, (15, 3, 18), (3, "KD", "KD"), "heavy", "knockback",
        A("punch", side="r", style="double", h="mid", reach=0.60, step=0.20), cat="special", push=["0.70", "0.45"],
        flags=["can_ringout"], tags=["plus_mid", "ringout"])
    c.S("kg", "K+G", ("ショルダータックル", "Shoulder Tackle"), "mid", "body", 120, (18, 3, 24), (-6, "KD", "WALLSPLAT"), "heavy", "knockback",
        A("shoulder", step=0.50), cat="special", chr="wall_splat", flags=["wall_splat", "can_ringout"])
    c.S("k", "K", ("前蹴り", "Front Kick"), "mid", "kick", 85, (15, 3, 18), (-4, 3, 6), "medium", ML,
        A("kick", side="l", style="front", h="mid", reach=0.86))
    c.S("6k", "6K", ("押し蹴り", "Stomp Kick"), "mid", "kick", 95, (16, 3, 20), (-5, "KD", "KD"), "heavy", "knockback",
        A("kick", side="r", style="push", h="mid", reach=0.86, step=0.10), push=["0.45", "0.35"])
    c.S("3k", "3K", ("膝蹴り上げ", "Rising Knee"), "mid", "knee", 100, (16, 3, 21), (-7, 4, "LAUNCH"), "medium", ML,
        A("kick", side="r", style="knee", h="mid", step=0.26), chr="launch", tags=["ch_launch"])
    c.S("2k", "2K", ("ローキック", "Low Kick"), "low", "kick", 55, (15, 2, 18), (-7, 1, 3), "medium", LO,
        A("kick", side="l", style="low", reach=0.80, start="crouch", end="crouch"), frm=("stand", "crouch"), flags=["end_crouch"])
    c.S("1k", "1K", ("足掛け倒し", "Leg Hook Trip"), "low", "kick", 80, (21, 3, 26), (-15, "KD", "KD"), "heavy", "trip",
        A("kick", side="r", style="sweep", reach=0.90, start="crouch", end="crouch"), frm=("stand", "crouch"),
        trk="half_left", flags=["end_crouch"], tags=["low_kd"])
    c.S("4k", "4K", ("回し蹴り", "Spinning Kick"), "high", "kick", 120, (22, 4, 24), (-10, "KD", "KD"), "heavy", "spin",
        A("kick", side="r", style="spin", h="high", reach=0.82), trk="full")
    c.S("wsp", "P", ("突き上げアッパー", "Rising Uppercut"), "mid", "punch", 110, (15, 3, 25), (-13, "LAUNCH", "LAUNCH"), "launch", "launch",
        A("punch", side="r", style="upper", h="head_high", reach=0.55, step=0.12, start="crouch"), frm=("rise",),
        launch=["0.112", "0.005"], tags=["launcher", "punisher"])
    c.S("wsk", "K", ("立ち膝", "Rising Knee Lift"), "mid", "knee", 95, (15, 3, 21), (-7, 4, "STAGGER"), "medium", ML,
        A("kick", side="r", style="knee", h="mid", step=0.24, start="crouch"), frm=("rise",), chr="stagger_gut")
    c.S("evp", "P", ("回り込み前腕", "Circling Forearm"), "mid", "elbow", 80, (15, 3, 19), (-5, 4, 6), "medium", ML,
        A("elbow", side="r", style="fwd", h="mid", step=0.12), frm=("evade",), cat="evade", trk="full")
    c.S("evk", "K", ("回り込み蹴り", "Circling Kick"), "mid", "kick", 100, (17, 3, 23), (-9, "KD", "KD"), "heavy", "knockback",
        A("kick", side="r", style="round", h="mid", reach=0.80), frm=("evade",), cat="evade", trk="full")
    c.S("btp", "P", ("振り向き裏拳", "Turning Backfist"), "high", "punch", 80, (13, 3, 19), (-3, 4, "KD"), "medium", HH,
        A("punch", side="l", style="back", h="high", reach=0.64, start="backturn"), frm=("backturn",), cat="backturn",
        trk="full", chr="spin")
    c.S("btk", "K", ("振り向き後ろ蹴り", "Turning Back Kick"), "mid", "kick", 120, (16, 3, 25), (-11, "KD", "KD"), "heavy", "knockback",
        A("kick", side="r", style="side", h="mid", reach=0.86, start="backturn"), frm=("backturn",), cat="backturn")
    c.S("runp", "P", ("走りラリアット", "Running Lariat"), "high", "punch", 150, (14, 4, 28), (-12, "KD", "KD"), "heavy", "spin",
        A("punch", side="r", style="hook", h="high", reach=0.70, step=0.60), frm=("run",), cat="special", trk="half_right")
    c.S("runk", "K", ("走り込み膝", "Running Knee"), "mid", "knee", 130, (15, 4, 28), (-12, "KD", "KD"), "heavy", "knockback",
        A("kick", side="r", style="jump_knee", h="high", step=0.55), frm=("run",), cat="special", posture=[[4, 18, "airborne"]])
    # 投げ
    c.T("pg", "P+G", ("ボディスラム", "Body Slam"), 270, "N", "slam", length=68, dmgf=44)
    c.T("6pg", "6P+G", ("正面落とし", "Front Drop"), 290, "6", "over", length=66, dmgf=40, flags=["can_ringout"], tags=["ringout"])
    c.T("4pg", "4P+G", ("投げ捨て", "Toss Away"), 260, "4", "push", length=58, dmgf=36, flags=["can_ringout"], tags=["ringout"])
    c.T("46pg", "46P+G", ("腰抱え", "Waist Lock"), 100, "6", "chain1", length=56, dmgf=24, next_window=20,
        next=[{"to": i("swing"), "in": "4P+G"}, {"to": i("lift"), "in": "P+G"}], tags=["chain_throw"])
    c.T("lift", "P+G", ("持ち上げ", "Lift"), 100, "N", "chain_lift", frm=None, length=52, dmgf=16, stage=True, next_window=18,
        next=[{"to": i("tawara_lift"), "in": "6P+G"}])
    c.T("swing", "4P+G", ("振り回し", "Swing"), 90, "4", "chain2", frm=None, length=46, dmgf=26, stage=True, next_window=18,
        next=[{"to": i("tawara"), "in": "6P+G"}])
    c.T("tawara", "6P+G", ("俵返し", "Bale Return"), 180, "6", "chain3", frm=None, length=62, dmgf=40, stage=True,
        flags=["no_tech", "can_ringout"])
    c.T("tawara_lift", "6P+G", ("俵返し", "Bale Return"), 180, "6", "chain3_lift", frm=None, length=58, dmgf=36, stage=True,
        flags=["no_tech", "can_ringout"])
    c.T("41236pg", "41236P+G", ("反り投げ", "Bridging Suplex"), 360, "4", "suplex", f=(12, 1, 20), length=72, dmgf=46,
        flags=["no_tech"])
    c.T("2pg", "2P+G", ("片足タックル", "Single Leg"), 250, "2", "lowtrip", lv="lthrow", frm=("stand", "crouch"), length=58, dmgf=38)
    c.T("66pg", "P+G", ("胴タックル", "Body Tackle"), 220, "N", "tackle", frm=("dash",), f=(12, 1, 24), length=58, dmgf=36, range="1.40")
    c.side_back_wall_run(side=("側面ボディスラム", "Side Slam", 290, "slam"), back=("ジャーマン", "German Suplex", 340, "back"),
                         wall=("壁押し潰し", "Wall Crush", 320, "wall"), run=("走りタックル", "Running Tackle", 230, "tackle"))
    c.down_attacks(("エルボードロップ", "Elbow Drop"), ("踏みつけ", "Stomp"), d8=120, d2=45)
    ch_json = {
        "schema_version": 1, "id": "bjorn", "name": ["ビョルン・ハルヴォルセン", "Bjorn Halvorsen"],
        "style": ["グレコローマン・レスリング", "Greco-Roman Wrestling"], "difficulty": 4, "weight_class": "heavy",
        "body": {"height": "1.96", "shoulder": "1.18", "hip": "1.08", "arm": "1.02", "leg": "0.98", "torso": "1.06"},
        "physics": {"push_radius": "0.34", "float_factor": "1.10", "hurt_mul": "1.08", "throw_range": "1.05"},
        "movement": {"walk_f": "1.30", "walk_b": "1.05", "dash_f": [20, "1.20"], "dash_b": [22, "0.90"], "run": "4.2", "evade": 24},
        "stance": {"lead": "l", "width": "0.36", "depth": "0.40", "crouch": "0.10", "turn": "18", "guard": "wide", "lean": "12"},
        "model": {"build": "heavy", "skin": "#E8C2A8", "hair": "short", "beard": "braided", "face": {"jaw": "0.85", "brow": "0.75", "nose": "0.65"}},
        "colors": [
            palette("#E8C2A8", "#A8452A", "#1F4D33", "#E6DCC4", "#E6DCC4", gloves="#2A2A2A", shoes="#1E1E1E", tertiary="#3B4A2A"),
            palette("#E8C2A8", "#A8452A", "#1E2A4D", "#F0F0F0", "#F0F0F0", gloves="#2A2A2A", shoes="#151515", tertiary="#1E2A4D"),
            palette("#E8C2A8", "#A8452A", "#E0B020", "#1A1A1A", "#1A1A1A", gloves="#2A2A2A", shoes="#222222", tertiary="#E0B020"),
            palette("#E8C2A8", "#A8452A", "#5A3A22", "#B3262B", "#B3262B", gloves="#2A2A2A", shoes="#2A1E14", tertiary="#5A3A22"),
        ],
        "home_stage": "harbor", "rival": "adrien", "voice": {"pitch": "0.78", "type": "male_deep", "rough": "0.25"},
        "side_throw": "bjorn_side_pg", "back_throw": "bjorn_back_pg",
        "costumes": [
            {"id": "a", "name": ["シングレット", "Singlet"], "model": {"outfit": ["singlet", "vest_open", "wrestling_shoes"]}},
            {"id": "b", "name": ["漁師", "Fisherman"], "model": {"outfit": ["overalls", "boots"], "recolor": {"overalls": {"secondary": "tertiary"}}}},
        ],
    }
    c.write(ch_json)


# ============================================================ ゾー（ラウェイ）
def zaw():
    c = Char("zaw")
    i = c.id
    c.S("p", "P", ("直突き", "Straight"), "high", "punch", 50, (10, 2, 13), (1, 4, 6), "light", HL,
        A("punch", side="l", h="high", reach=0.64), tags=["jab", "fast_high"],
        chain=[ch(i("pp"), "P", (3, 22), 12), ch(i("pk"), "K", (3, 22), 13)])
    c.S("pp", "P", ("フック", "Hook"), "high", "punch", 70, (14, 3, 18), (-4, 3, "KD"), "medium", HH,
        A("punch", side="r", style="hook", h="high", reach=0.64), frm=None, trk="half_left", chr="spin",
        chain=[ch(i("ppk"), "K", (3, 26), 16)])
    c.S("ppk", "K", ("膝", "Knee"), "mid", "knee", 90, (15, 3, 22), (-9, "LAUNCH", "LAUNCH"), "launch", "launch",
        A("kick", side="r", style="knee", h="mid", step=0.26), frm=None, launch=["0.105", "0.005"])
    c.S("pk", "K", ("中段回し蹴り", "Mid Roundhouse"), "mid", "kick", 90, (16, 3, 21), (-7, 4, 6), "medium", MH,
        A("kick", side="r", style="round", h="mid", reach=0.82), frm=None, trk="half_right")
    c.S("6p", "6P", ("縦肘", "Vertical Elbow"), "mid", "elbow", 90, (14, 3, 18), (-3, 4, "STAGGER"), "medium", ML,
        A("elbow", side="r", style="down", h="mid", step=0.16), chr="stagger_gut", tags=["fast_mid", "ch_stagger"],
        chain=[ch(i("6pp"), "P", (3, 26), 16)])
    c.S("6pp", "P", ("返し肘", "Return Elbow"), "mid", "elbow", 70, (14, 2, 20), (-6, 3, 5), "medium", ML,
        A("elbow", side="l", style="fwd", h="mid", step=0.10), frm=None)
    c.S("3p", "3P", ("アッパー肘", "Uppercut Elbow"), "smid", "elbow", 80, (13, 2, 17), (-2, 3, 6), "light", ML,
        A("elbow", side="r", style="up", h="mid", step=0.14), frm=("stand", "crouch"), tags=["fast_mid"],
        chain=[ch(i("3pp"), "P", (3, 24), 15)])
    c.S("3pp", "P", ("振り肘", "Swing Elbow"), "high", "elbow", 70, (14, 2, 19), (-5, 3, "KD"), "medium", HH,
        A("elbow", side="l", style="spin", h="high", step=0.05), frm=None, trk="half_left", chr="spin")
    c.S("4p", "4P", ("回転肘", "Spinning Elbow"), "high", "elbow", 110, (17, 3, 22), (-6, "KD", "KD"), "heavy", "spin",
        A("elbow", side="r", style="spin", h="high", step=0.12), trk="full", chr="knockback")
    c.S("2p", "2P", ("下段突き", "Low Punch"), "low", "punch", 40, (11, 2, 14), (-4, 3, 5), "light", LO,
        A("punch", side="l", h="low", reach=0.62, crouch=0.40, start="crouch", end="crouch"),
        frm=("stand", "crouch"), flags=["end_crouch"], tags=["fast_low"])
    c.S("6pk", "6P+K", ("頭突き", "Headbutt"), "mid", "head", 130, (16, 3, 23), (-8, "STAGGER", "CRUMPLE"), "heavy", "stagger_gut",
        A("headbutt", step=0.25), cat="special", chr="crumple", stagger=40, tags=["ch_crumple"])
    c.S("66pk", "P+K", ("飛び込み頭突き", "Diving Headbutt"), "mid", "head", 150, (20, 4, 26), (-10, "KD", "WALLSPLAT"), "heavy", "knockback",
        A("headbutt", step=0.65), frm=("dash",), cat="special", chr="wall_splat", flags=["wall_splat"])
    c.S("pk2", "P+K", ("ダブル肘", "Double Elbow"), "mid", "elbow", 100, (18, 3, 20), (1, 5, "KD"), "heavy", MH,
        A("elbow", side="r", style="down", h="mid", step=0.20), cat="special", chr="knockback", tags=["plus_mid"])
    c.S("k", "K", ("上段回し蹴り", "High Roundhouse"), "high", "kick", 100, (14, 3, 21), (-5, 4, "KD"), "heavy", HH,
        A("kick", side="r", style="round", h="high", reach=0.80), trk="half_right", chr="knockback")
    c.S("6k", "6K", ("前蹴り", "Teep"), "mid", "kick", 85, (15, 3, 18), (-4, 3, 6), "medium", ML,
        A("kick", side="l", style="push", h="mid", reach=0.86))
    c.S("3k", "3K", ("ミドルキック", "Middle Kick"), "mid", "kick", 110, (16, 3, 21), (-6, 5, "STAGGER"), "medium", MH,
        A("kick", side="r", style="round", h="mid", reach=0.82), trk="half_right", chr="stagger_gut", stagger=40, tags=["ch_stagger"])
    c.S("2k", "2K", ("ローキック", "Low Kick"), "low", "kick", 60, (15, 2, 18), (-7, 2, 4), "medium", LO,
        A("kick", side="r", style="low", reach=0.80), trk="half_right")
    c.S("1k", "1K", ("足払い", "Foot Sweep"), "low", "kick", 80, (20, 3, 26), (-15, "KD", "KD"), "heavy", "trip",
        A("kick", side="r", style="sweep", reach=0.90, start="crouch", end="crouch"), frm=("stand", "crouch"),
        trk="half_left", flags=["end_crouch"], tags=["low_kd"])
    c.S("4k", "4K", ("後ろ蹴り", "Back Kick"), "mid", "kick", 120, (19, 3, 24), (-9, "KD", "KD"), "heavy", "knockback",
        A("kick", side="r", style="back", h="mid", reach=0.84), trk="full")
    c.S("9k", "9K", ("跳び膝", "Flying Knee"), "mid", "knee", 130, (20, 4, 25), (-11, "LAUNCH", "LAUNCH"), "launch", "launch",
        A("kick", side="r", style="jump_knee", h="high", step=0.40), cat="special", posture=[[6, 22, "airborne"]],
        launch=["0.135", "0.008"], tags=["launcher"])
    c.S("wsp", "P", ("突き上げ肘", "Rising Elbow"), "mid", "elbow", 100, (15, 3, 24), (-12, "LAUNCH", "LAUNCH"), "launch", "launch",
        A("punch", side="r", style="upper", h="head_high", reach=0.55, step=0.14, start="crouch"), frm=("rise",), launch=["0.118", "0.006"],
        tags=["launcher", "punisher"])
    c.S("wsk", "K", ("膝蹴り上げ", "Rising Knee"), "mid", "knee", 95, (15, 3, 21), (-7, 4, "STAGGER"), "medium", ML,
        A("kick", side="r", style="knee", h="mid", step=0.24, start="crouch"), frm=("rise",), chr="stagger_gut")
    # 首相撲（K+G）
    hold_next = [{"to": i("clinch_pg"), "in": "P+G"}, {"to": i("clinch_p"), "in": "P"}, {"to": i("clinch_k1"), "in": "K"}]
    c.T("kg", "K+G", ("首相撲", "Clinch"), 0, "6", "clinch", length=44, dmgf=8, next_window=34, end="stand", stun=14,
        next=hold_next, mash=14, tags=["clinch"])
    for n, nx in ((1, 2), (2, 3), (3, None)):
        nxt = [{"to": i("clinch_pg"), "in": "P+G"}, {"to": i("clinch_p"), "in": "P"}]
        if nx:
            nxt.append({"to": i("clinch_k%d" % nx), "in": "K"})
        c.T("clinch_k%d" % n, "K", ("首相撲膝", "Clinch Knee"), 40, "none", "clinch_knee", frm=None, length=28, dmgf=11,
            stage=True, next_window=16, next=nxt, end="stagger", stun=24, mash=14)
    c.T("clinch_p", "P", ("首相撲肘", "Clinch Elbow"), 70, "none", "clinch_elbow", frm=None, length=34, dmgf=13, stage=True,
        end="stagger", stun=36)
    c.T("clinch_pg", "P+G", ("首相撲投げ捨て", "Clinch Toss"), 150, "none", "clinch_throw", frm=None, length=52, dmgf=32,
        stage=True, flags=["can_ringout"])
    # 投げ
    c.T("pg", "P+G", ("投げ捨て", "Throw Down"), 250, "N", "trip", length=60, dmgf=38)
    c.T("6pg", "6P+G", ("肘落とし投げ", "Elbow Slam"), 280, "6", "slam", length=66, dmgf=42)
    c.T("4pg", "4P+G", ("首投げ", "Neck Throw"), 270, "4", "neck", length=62, dmgf=40, end="face", flags=["can_ringout"], tags=["ringout"])
    c.T("2pg", "2P+G", ("足すくい", "Leg Scoop"), 220, "2", "lowtrip", lv="lthrow", frm=("stand", "crouch"), length=56, dmgf=36)
    c.side_back_wall_run(side=("側面首投げ", "Side Neck Throw", 280, "neck"), back=("背後落とし", "Rear Drop", 320, "back"),
                         wall=("壁膝", "Wall Knee", 300, "knee"), run=("走り胴タックル", "Running Tackle", 200, "tackle"))
    c.S("evp", "P", ("回り込み肘", "Circling Elbow"), "mid", "elbow", 75, (14, 2, 18), (-4, 4, 6), "medium", ML,
        A("elbow", side="r", style="fwd", h="mid", step=0.10), frm=("evade",), cat="evade", trk="full")
    c.S("evk", "K", ("回り込み蹴り", "Circling Kick"), "high", "kick", 100, (16, 3, 22), (-8, "KD", "KD"), "heavy", "knockback",
        A("kick", side="r", style="round", h="high", reach=0.80), frm=("evade",), cat="evade", trk="full")
    c.S("btp", "P", ("振り向き肘", "Turning Elbow"), "high", "elbow", 80, (12, 2, 18), (-2, 4, "KD"), "medium", HH,
        A("elbow", side="l", style="spin", h="high", start="backturn"), frm=("backturn",), cat="backturn", trk="full", chr="spin")
    c.S("btk", "K", ("振り向き後ろ蹴り", "Turning Back Kick"), "mid", "kick", 110, (15, 3, 24), (-10, "KD", "KD"), "heavy", "knockback",
        A("kick", side="r", style="side", h="mid", reach=0.86, start="backturn"), frm=("backturn",), cat="backturn")
    c.S("runp", "P", ("走り込み肘", "Running Elbow"), "mid", "elbow", 110, (13, 3, 24), (-8, "KD", "KD"), "heavy", "knockback",
        A("elbow", side="r", style="fwd", h="mid", step=0.60), frm=("run",), cat="special")
    c.S("runk", "K", ("走り跳び膝", "Running Flying Knee"), "mid", "knee", 130, (14, 5, 30), (-14, "KD", "KD"), "heavy", "knockback",
        A("kick", side="r", style="jump_knee", h="high", step=0.60), frm=("run",), cat="special", posture=[[4, 18, "airborne"]])
    c.down_attacks(("膝落とし", "Knee Drop"), ("追い突き", "Down Punch"))
    ch_json = {
        "schema_version": 1, "id": "zaw", "name": ["ゾー・ミン", "Zaw Min"], "style": ["ラウェイ", "Lethwei"],
        "difficulty": 2, "weight_class": "middle",
        "body": {"height": "1.72", "shoulder": "1.02", "hip": "0.98", "arm": "1.0", "leg": "0.98", "torso": "1.0"},
        "physics": {"push_radius": "0.30", "float_factor": "1.00", "hurt_mul": "1.00", "throw_range": "0.90"},
        "movement": {"walk_f": "1.50", "walk_b": "1.20", "dash_f": [18, "1.35"], "dash_b": [20, "1.05"], "run": "4.5", "evade": 22},
        "stance": {"lead": "l", "width": "0.30", "depth": "0.38", "crouch": "0.06", "turn": "22", "guard": "high", "lean": "4"},
        "model": {"build": "lean", "skin": "#B9855E", "hair": "buzz", "face": {"jaw": "0.65", "brow": "0.7", "nose": "0.55"}},
        "colors": [
            palette("#B9855E", "#141210", "#7A1F24", "#3A1012", "#D4AF37", gloves="#E8E2D2", shoes="#2A2A2A", tertiary="#1E2A4D"),
            palette("#B9855E", "#141210", "#1F4FA8", "#F0F0F0", "#E8E8E8", gloves="#F0EEE8", shoes="#2A2A2A", tertiary="#F0F0F0"),
            palette("#B9855E", "#141210", "#151515", "#1F6B3A", "#2FA05A", gloves="#D8D2C2", shoes="#2A2A2A", tertiary="#1F6B3A"),
            palette("#B9855E", "#141210", "#EDEDED", "#B3262B", "#B3262B", gloves="#E8E2D2", shoes="#2A2A2A", tertiary="#B3262B"),
        ],
        "home_stage": "temple", "rival": "toma", "voice": {"pitch": "0.88", "type": "male_low", "rough": "0.15"},
        "side_throw": "zaw_side_pg", "back_throw": "zaw_back_pg",
        "costumes": [
            {"id": "a", "name": ["ファイトショーツ", "Fight Shorts"], "model": {"outfit": ["shorts", "wraps"]}},
            {"id": "b", "name": ["トラックジャケット", "Track Jacket"], "model": {"outfit": ["jacket_short", "shorts", "wraps"], "recolor": {"jacket_short": {"primary": "tertiary"}}}},
        ],
    }
    c.write(ch_json)


# ============================================================ 月嵐（形意拳）
def yuelan():
    c = Char("yuelan")
    i = c.id
    c.S("p", "P", ("劈掌", "Splitting Palm"), "high", "punch", 45, (10, 2, 13), (1, 4, 6), "light", HL,
        A("punch", side="l", style="palm", h="high", reach=0.60), tags=["jab", "fast_high"],
        chain=[ch(i("pp"), "P", (3, 22), 12), ch(i("pk"), "K", (3, 22), 13)])
    c.S("pp", "P", ("連珠", "Linked Pearls"), "high", "punch", 55, (13, 2, 17), (-3, 3, 5), "light", HL,
        A("punch", side="r", h="high", reach=0.62, step=0.08), frm=None, chain=[ch(i("ppp"), "P", (3, 26), 16)])
    c.S("ppp", "P", ("連珠崩拳", "Pearl Crushing Fist"), "mid", "punch", 80, (15, 3, 20), (-6, "KD", "KD"), "heavy", "knockback",
        A("punch", side="l", h="mid", reach=0.64, step=0.22), frm=None)
    c.S("pk", "K", ("中段蹴り", "Mid Kick"), "mid", "kick", 75, (15, 3, 20), (-6, 3, 5), "medium", ML,
        A("kick", side="r", style="front", h="mid", reach=0.80), frm=None)
    c.S("6p", "6P", ("崩拳", "Crushing Fist"), "mid", "punch", 90, (13, 3, 17), (-2, 5, "KD"), "medium", MH,
        A("punch", side="r", h="mid", reach=0.64, step=0.24), chr="knockback", tags=["fast_mid"],
        chain=[ch(i("6pp"), "P", (3, 26), 17, just=16, just_to=i("6pp_j"))])
    c.S("6pp", "P", ("連環崩拳", "Linked Crushing Fist"), "mid", "punch", 100, (14, 3, 20), (-6, "KD", "KD"), "heavy", "knockback",
        A("punch", side="l", h="mid", reach=0.64, step=0.24), frm=None)
    c.S("6pp_j", "P", ("連環崩拳・極", "Linked Crushing Fist [J]"), "mid", "punch", 130, (14, 3, 17), (-3, "KD", "KD"), "heavy", "knockback",
        A("punch", side="l", h="mid", reach=0.66, step=0.28, twist=10), frm=None, tags=["just"])
    c.S("3p", "3P", ("鑽拳", "Drilling Fist"), "mid", "punch", 110, (14, 3, 25), (-13, "LAUNCH", "LAUNCH"), "launch", "launch",
        A("punch", side="r", style="upper", h="head_high", reach=0.55, step=0.14), tags=["launcher"], launch=["0.120", "0.006"])
    c.S("4p", "4P", ("横拳", "Crossing Fist"), "high", "punch", 80, (15, 3, 19), (-4, 3, "KD"), "medium", HH,
        A("punch", side="l", style="back", h="high", reach=0.62, step=0.06), trk="half_right", chr="spin")
    c.S("2p", "2P", ("下段突き", "Low Punch"), "low", "punch", 40, (11, 2, 14), (-4, 3, 5), "light", LO,
        A("punch", side="l", h="low", reach=0.58, crouch=0.40, start="crouch", end="crouch"),
        frm=("stand", "crouch"), flags=["end_crouch"], tags=["fast_low"])
    c.S("46p", "46P", ("炮拳", "Cannon Fist"), "mid", "punch", 140, (18, 3, 22), (-5, "KD", "WALLSPLAT"), "heavy", "knockback",
        A("punch", side="r", style="double", h="mid", reach=0.62, step=0.30), cat="special", chr="wall_splat", flags=["wall_splat"])
    c.S("46pk", "46P+K", ("劈拳", "Splitting Fist"), "mid", "punch", 150, (22, 3, 22), (3, "KD", "KD"), "heavy", "trip",
        A("punch", side="r", style="hammer", h="mid", reach=0.66, step=0.30), cat="special", tags=["plus_mid"])
    c.step("step", "3_6", ("進歩", "Advancing Step"), A("step", dz=1.0, low=0.14, hop=0.0), (1, 1, 11), frm=("stand", "crouch"),
           posture=[[1, 10, "low_profile"]], chain=[ch(i("step_p"), "P", (2, 11), 2)])
    c.S("step_p", "P", ("進歩崩拳", "Advancing Crushing Fist"), "mid", "punch", 120, (12, 3, 20), (-6, "KD", "KD"), "heavy", "knockback",
        A("punch", side="r", h="mid", reach=0.66, step=0.30), frm=None, cat="special")
    c.S("wsp", "P", ("鑽拳・昇", "Rising Drill Fist"), "mid", "punch", 100, (14, 3, 25), (-13, "LAUNCH", "LAUNCH"), "launch", "launch",
        A("punch", side="r", style="upper", h="head_high", reach=0.55, step=0.12, start="crouch"), frm=("rise",),
        launch=["0.120", "0.006"], tags=["launcher", "punisher"])
    c.S("wsk", "K", ("鶏形・膝", "Rooster Knee"), "mid", "knee", 90, (15, 3, 20), (-6, 4, "STAGGER"), "medium", ML,
        A("kick", side="r", style="knee", h="mid", step=0.24, start="crouch", kz="0.46"), frm=("rise",), chr="stagger_gut")
    c.S("k", "K", ("上段踢腿", "High Snap Kick"), "high", "kick", 75, (13, 3, 19), (-4, 4, "KD"), "medium", HH,
        A("kick", side="l", style="round", h="high", reach=0.76), trk="half_left", chr="knockback")
    c.S("6k", "6K", ("前蹴り", "Front Kick"), "mid", "kick", 80, (15, 3, 18), (-4, 3, 6), "medium", ML,
        A("kick", side="r", style="front", h="mid", reach=0.82))
    c.S("3k", "3K", ("虎形・膝", "Tiger Knee"), "mid", "knee", 100, (16, 3, 21), (-6, 4, "LAUNCH"), "medium", ML,
        A("kick", side="r", style="knee", h="mid", step=0.26), chr="launch", tags=["ch_launch"])
    c.S("2k", "2K", ("下段蹴り", "Low Kick"), "low", "kick", 45, (14, 2, 17), (-6, 2, 4), "light", LO,
        A("kick", side="l", style="low", reach=0.74, start="crouch", end="crouch"), frm=("stand", "crouch"), flags=["end_crouch"])
    c.S("1k", "1K", ("燕形・払い", "Swallow Sweep"), "low", "kick", 75, (19, 3, 26), (-14, "KD", "KD"), "heavy", "trip",
        A("kick", side="l", style="sweep", reach=0.86, start="crouch", end="crouch"), frm=("stand", "crouch"),
        trk="half_right", flags=["end_crouch"], posture=[[1, 18, "low_profile"]], tags=["low_kd"])
    c.S("4k", "4K", ("鷂形・回し蹴り", "Sparrowhawk Spin Kick"), "high", "kick", 110, (21, 4, 24), (-10, "KD", "KD"), "heavy", "spin",
        A("kick", side="r", style="spin", h="high", reach=0.78), trk="full")
    c.S("pk2", "P+K", ("馬形・双拳", "Horse Twin Fists"), "mid", "punch", 120, (17, 3, 22), (-4, "KD", "KD"), "heavy", "knockback",
        A("punch", side="r", style="double", h="mid", reach=0.60, step=0.25), cat="special", flags=["can_ringout"])
    c.S("kg", "K+G", ("鶴形・踵", "Crane Heel"), "mid", "kick", 110, (23, 3, 22), (1, "KD", "KD"), "heavy", "trip",
        A("kick", side="r", style="axe", h="mid", reach=0.72, step=0.12), cat="special")
    c.S("evp", "P", ("回り込み崩拳", "Circling Fist"), "mid", "punch", 75, (14, 2, 18), (-4, 4, 6), "medium", ML,
        A("punch", side="r", h="mid", reach=0.62, step=0.12), frm=("evade",), cat="evade", trk="full")
    c.S("evk", "K", ("回り込み蹴り", "Circling Kick"), "high", "kick", 95, (16, 3, 22), (-8, "KD", "KD"), "heavy", "knockback",
        A("kick", side="r", style="round", h="high", reach=0.76), frm=("evade",), cat="evade", trk="full")
    c.S("btp", "P", ("回身横拳", "Turning Cross Fist"), "high", "punch", 70, (12, 2, 18), (-2, 4, "KD"), "medium", HL,
        A("punch", side="l", style="back", h="high", reach=0.60, start="backturn"), frm=("backturn",), cat="backturn",
        trk="full", chr="spin")
    c.S("btk", "K", ("回身後ろ蹴り", "Turning Back Kick"), "mid", "kick", 110, (15, 3, 24), (-10, "KD", "KD"), "heavy", "knockback",
        A("kick", side="r", style="side", h="mid", reach=0.82, start="backturn"), frm=("backturn",), cat="backturn")
    c.S("runp", "P", ("走り崩拳", "Running Crushing Fist"), "mid", "punch", 110, (13, 3, 24), (-8, "KD", "KD"), "heavy", "knockback",
        A("punch", side="r", h="mid", reach=0.66, step=0.55), frm=("run",), cat="special")
    c.S("runk", "K", ("走り跳び蹴り", "Running Jump Kick"), "mid", "kick", 120, (14, 5, 30), (-14, "KD", "KD"), "heavy", "knockback",
        A("kick", side="r", style="jump", h="mid", reach=0.84, step=0.60), frm=("run",), cat="special", posture=[[4, 18, "airborne"]])
    c.T("pg", "P+G", ("擒拿崩し", "Seizing Takedown"), 240, "N", "twist", length=64, dmgf=42, end="face")
    c.T("6pg", "6P+G", ("靠撃投げ", "Shoulder Strike Throw"), 300, "6", "push", length=58, dmgf=36, flags=["can_ringout"], tags=["ringout"])
    c.T("4pg", "4P+G", ("反転投げ", "Reversing Throw"), 250, "4", "over", length=64, dmgf=40)
    c.T("2pg", "2P+G", ("足取り崩し", "Leg Seize"), 220, "2", "lowtrip", lv="lthrow", frm=("stand", "crouch"), length=56, dmgf=36)
    c.side_back_wall_run(side=("側面靠撃", "Side Shoulder Throw", 270, "neck"), back=("背後崩拳落とし", "Rear Fist Drop", 310, "back"),
                         wall=("壁炮拳", "Wall Cannon", 300, "wall"), run=("走り足取り", "Running Leg Seize", 200, "tackle"))
    c.down_attacks(("踏み込み劈拳", "Pouncing Split Fist"), ("追い突き", "Down Punch"))
    ch_json = {
        "schema_version": 1, "id": "yuelan", "name": ["蘇 月嵐", "Su Yuelan"], "style": ["形意拳", "Xingyiquan"],
        "difficulty": 4, "weight_class": "light",
        "body": {"height": "1.60", "shoulder": "0.88", "hip": "1.02", "arm": "0.96", "leg": "1.0", "torso": "0.96",
                 "hair_chain": True, "hair_len": "0.32"},
        "physics": {"push_radius": "0.26", "float_factor": "0.94", "hurt_mul": "0.95", "throw_range": "0.85"},
        "movement": {"walk_f": "1.45", "walk_b": "1.20", "dash_f": [18, "1.60"], "dash_b": [20, "1.10"], "run": "4.6", "evade": 22},
        "stance": {"lead": "l", "width": "0.22", "depth": "0.52", "crouch": "0.12", "turn": "40", "guard": "open", "lean": "10"},
        "model": {"build": "slim", "female": True, "skin": "#EED3BC", "hair": "braid", "face": {"jaw": "0.3", "brow": "0.3", "nose": "0.35"}},
        "colors": [
            palette("#EED3BC", "#121212", "#1F5E63", "#F0EEE6", "#D4AF37", shoes="#151515"),
            palette("#EED3BC", "#121212", "#161616", "#C9A548", "#C9A548", shoes="#151515"),
            palette("#EED3BC", "#121212", "#F2F0EA", "#B3262B", "#B3262B", shoes="#151515"),
            palette("#EED3BC", "#121212", "#8C7BB0", "#8A8A8A", "#E0D8F0", shoes="#2A2A2A"),
        ],
        "home_stage": "bamboo", "rival": "mariel", "voice": {"pitch": "1.12", "type": "female_young", "rough": "0.0"},
        "side_throw": "yuelan_side_pg", "back_throw": "yuelan_back_pg",
        "costumes": [
            {"id": "a", "name": ["立ち襟", "High Collar"], "model": {"outfit": ["high_collar_jacket", "pants_loose", "cloth_shoes"]}},
            {"id": "b", "name": ["練習着", "Practice Wear"], "model": {"outfit": ["shirt", "pants", "armbands", "cloth_shoes"]}},
        ],
    }
    c.write(ch_json)
