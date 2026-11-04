"""キャラデータ作成の補助（技・投げ・共通カテゴリ）。"""
import json
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def _s(v):
    return str(v) if isinstance(v, (float, int)) and not isinstance(v, bool) else v


def A(t, **kw):
    d = {"t": t}
    for k, v in kw.items():
        if k in ("reach", "step", "twist", "crouch", "dx", "dz", "hop", "low", "back") and not isinstance(v, str):
            v = str(v)
        d[k] = v
    return d


def ch(to, inp, win, at, **kw):
    d = {"to": to, "in": inp, "win": list(win), "at": at}
    d.update(kw)
    return d


class Char:
    def __init__(self, cid):
        self.cid = cid
        self.moves = []

    def id(self, key):
        return f"{self.cid}_{key}"

    def add(self, d):
        assert not any(m["id"] == d["id"] for m in self.moves), d["id"]
        self.moves.append(d)
        return d

    def S(self, key, cmd, name, lv, limb, dmg, f, adv, w, hr, anim, frm=("stand",), cat="basic", trk="linear", **kw):
        """打撃。frm=None なら連携専用（chain_only）。"""
        d = {"id": self.id(key), "cmd": cmd}
        if frm is None:
            d["chain_only"] = True
        else:
            d["from"] = list(frm)
        d["name"] = list(name)
        d["cat"] = "string" if frm is None and cat == "basic" else cat
        d["lv"] = lv
        d["limb"] = limb
        d["dmg"] = dmg
        d["f"] = list(f)
        d["adv"] = list(adv)
        d["w"] = w
        d["hr"] = hr
        if "chr" in kw:
            d["chr"] = kw.pop("chr")
        d["trk"] = trk
        for k in ("stagger", "launch", "push", "posture", "flags", "tags", "stance", "end_stance", "charge", "hit", "hit2", "priority", "trk_until"):
            if k in kw:
                d[k] = kw.pop(k)
        # 浮かせの既定値
        if (d["hr"] == "launch" or d.get("chr") == "launch") and "launch" not in d:
            d["launch"] = ["0.115", "0.006"]
        if (d["hr"] == "stagger_gut" or d.get("chr") == "stagger_gut" or d["hr"] == "stagger_leg") and "stagger" not in d:
            d["stagger"] = 36
        d["anim"] = anim
        if "chain" in kw:
            d["chain"] = kw.pop("chain")
        if "parry" in kw:
            d["parry"] = kw.pop("parry")
        assert not kw, (key, kw)
        return self.add(d)

    def T(self, key, cmd, name, dmg, esc, style, lv="throw", frm=("stand",), length=60, dmgf=38, end="up", f=(10, 1, 20), **kw):
        """投げ。frm=None なら連携・自動変化専用。"""
        d = {"id": self.id(key), "cmd": cmd}
        if frm is None:
            d["chain_only"] = True
        else:
            d["from"] = list(frm)
        d["name"] = list(name)
        d["cat"] = kw.pop("cat", "throw")
        d["lv"] = lv
        d["limb"] = "body"
        d["dmg"] = dmg
        d["f"] = list(f)
        d["w"] = "heavy"
        if "flags" in kw:
            d["flags"] = kw.pop("flags")
        if "tags" in kw:
            d["tags"] = kw.pop("tags")
        th = {"esc": esc, "len": length, "dmg_frame": dmgf, "end": end}
        for k in ("range", "stage", "next", "next_window", "stun", "mash", "vs_down", "air"):
            if k in kw:
                th[k] = kw.pop(k)
        d["throw"] = th
        d["anim"] = {"t": "throw", "style": style}
        assert not kw, (key, kw)
        return self.add(d)

    def stance_move(self, key, cmd, name, stance, frm=("stand",), f=(1, 1, 7), from_stance=None, anim=None, **kw):
        d = {"id": self.id(key), "cmd": cmd}
        if frm is None:
            d["chain_only"] = True
        else:
            d["from"] = list(frm)
        if from_stance:
            d["stance"] = from_stance
        d["name"] = list(name)
        d["cat"] = "stance"
        d["lv"] = "none"
        d["limb"] = "body"
        d["dmg"] = 0
        d["f"] = list(f)
        d["adv"] = [0, 0, 0]
        d["w"] = "light"
        d["hr"] = "mid_light"
        d["trk"] = "linear"
        if "posture" in kw:
            d["posture"] = kw.pop("posture")
        if stance:
            d["end_stance"] = stance
        d["anim"] = anim or {"t": "stance", "stance": stance}
        if "chain" in kw:
            d["chain"] = kw.pop("chain")
        assert not kw, (key, kw)
        return self.add(d)

    def step(self, key, cmd, name, anim, f, frm=("stand",), from_stance=None, end_stance=None, **kw):
        d = {"id": self.id(key), "cmd": cmd}
        d["from"] = list(frm)
        if from_stance:
            d["stance"] = from_stance
        d["name"] = list(name)
        d["cat"] = "move"
        d["lv"] = "none"
        d["limb"] = "body"
        d["dmg"] = 0
        d["f"] = list(f)
        d["adv"] = [0, 0, 0]
        d["w"] = "light"
        d["hr"] = "mid_light"
        d["trk"] = "linear"
        if "posture" in kw:
            d["posture"] = kw.pop("posture")
        if end_stance:
            d["end_stance"] = end_stance
        d["anim"] = anim
        if "chain" in kw:
            d["chain"] = kw.pop("chain")
        assert not kw, (key, kw)
        return self.add(d)

    def parry(self, key, cmd, name, win, levels, limbs, success, f, side="l", low=False, frm=("stand",)):
        d = {"id": self.id(key), "cmd": cmd, "from": list(frm), "name": list(name), "cat": "system", "lv": "parry",
             "limb": "punch", "dmg": 0, "f": list(f), "adv": [0, 0, 0], "w": "light", "hr": "mid_light", "trk": "linear",
             "parry": {"win": list(win), "levels": levels, "limbs": limbs, "success": self.id(success)},
             "anim": {"t": "parry", "side": side, "low": low}}
        return self.add(d)

    # ---------------------------------------------------------------- 共通カテゴリ

    def down_attacks(self, n8=("踏み込み下突き", "Pouncing Strike"), n2=("追い突き", "Down Punch"), d8=110, d2=40, stomp=False):
        self.S("8p", "8P", n8, "down", "punch" if not stomp else "kick", d8, (26, 3, 30), (-30, 0, 0), "heavy", "mid_heavy",
               A("down_attack", style="stomp" if stomp else "pounce", reach=0.80), frm=("opp_down",), cat="down_attack", trk="full",
               hit={"seg": "RightFoot" if stomp else "RightHand", "t": "0.5", "r": "0.12"})
        self.S("2p_down", "2P", n2, "down", "punch", d2, (15, 2, 18), (-12, 0, 0), "medium", "mid_light",
               A("down_attack", style="punch", reach=0.70), frm=("opp_down",), cat="down_attack", trk="full",
               hit={"seg": "RightHand", "t": "0.5", "r": "0.12"})

    def side_back_wall_run(self, side=("側面投げ", "Side Throw", 280, "neck"), back=("背後投げ", "Back Throw", 320, "back"),
                           wall=("壁打ち", "Wall Smash", 300, "wall"), run=("走りタックル", "Running Tackle", 200, "tackle")):
        self.T("side_pg", "P+G", side[:2], side[2], "N", side[3], frm=None, length=62, dmgf=40, end="face")
        self.T("back_pg", "P+G", back[:2], back[2], "none", back[3], frm=None, length=64, dmgf=42, flags=["no_tech"])
        self.T("wall_pg", "P+G", wall[:2], wall[2], "N", wall[3], frm=("wall",), length=60, dmgf=36)
        self.T("runpg", "P+G", run[:2], run[2], "N", run[3], frm=("run",), length=56, dmgf=34, f=(10, 1, 24), range="1.20")

    def write(self, character):
        d = os.path.join(ROOT, "data/characters", self.cid)
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, "character.json"), "w") as fp:
            json.dump(character, fp, ensure_ascii=False, indent=2)
            fp.write("\n")
        with open(os.path.join(d, "moves.json"), "w") as fp:
            fp.write('{\n  "schema_version": 1,\n  "character": "%s",\n  "moves": [\n' % self.cid)
            lines = [json.dumps(m, ensure_ascii=False, separators=(", ", ": ")) for m in self.moves]
            fp.write(",\n".join("    " + l for l in lines))
            fp.write("\n  ]\n}\n")
        print(self.cid, len(self.moves), "moves")


def palette(skin, hair, primary, secondary, accent, gloves="#1B1B1B", shoes="#2A2A2A", tertiary="#333333", metal=None):
    d = {"skin": skin, "hair": hair, "primary": primary, "secondary": secondary, "accent": accent,
         "gloves": gloves, "shoes": shoes, "tertiary": tertiary}
    if metal:
        d["metal"] = metal
    return d
