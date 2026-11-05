"""キャラデータ（灯真以外の 8 人）を生成し、全キャラに追加技（extras.py）を足す。
使い方: python3 tools/content/build.py [id ...]"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import chars_a  # noqa: E402
import chars_b  # noqa: E402
import extras  # noqa: E402
from common import ROOT, Char  # noqa: E402

FLAVOR = {
    "toma": {"kick": "round", "punch": "straight",
             "names": {"1p": ("下段裏拳", "Low Backfist"), "9k_x": ("跳び前蹴り", "Flying Front Kick")}},
    "lena": {"kick": "front", "punch": "palm",
             "names": {"6pk_x": ("流水双掌", "Flowing Twin Palms"), "9k_x": ("跳び膝払い", "Leaping Knee Sweep"), "2pk_x": ("沈み掌", "Sinking Palm")}},
    "bjorn": {"kick": "front", "punch": "straight", "dmg": 0.9,
              "names": {"6pk_x": ("ダブルハンマー", "Double Hammer"), "9k_x": ("ドロップキック", "Dropkick"), "2pk_x": ("アッパーカット", "Uppercut")}},
    "zaw": {"kick": "round", "punch": "elbow",
            "names": {"9k_x_": ("跳び蹴り", "Jump Kick"), "2pk_x": ("突き上げ肘", "Rising Elbow"), "66p_x": ("踏み込み肘", "Stepping Elbow")}},
    "yuelan": {"kick": "front", "punch": "straight",
               "names": {"6pk_x": ("虎撲", "Tiger Pounce"), "9k_x": ("燕形・跳び蹴り", "Swallow Leap Kick"), "66p_x": ("鑽拳・踏み込み", "Stepping Drill Fist"), "2pk_x": ("鼉形・突き上げ", "Alligator Rise")}},
    "mariel": {"kick": "round", "punch": "elbow",
               "names": {"6pk_x": ("ダブルスティック", "Double Stick"), "kg_x": ("スタント・アックス", "Stunt Axe Kick"), "9k_x": ("ワイヤー・キック", "Wire Kick"), "2pk_x": ("突き上げ肘", "Rising Elbow")}},
    "adrien": {"kick": "side", "punch": "straight", "reach": 0.90,
               "names": {"6pk_x": ("クー・ド・ポワン", "Coup de Poing"), "kg_x": ("クー・ド・タロン", "Coup de Talon"), "66p_x": ("ディレクト・アン・アヴァン", "Direct en Avant")}},
    "ravi": {"kick": "front", "punch": "palm",
             "names": {"kg_x": ("象の踵", "Elephant Heel"), "9k_x": ("鳥の跳び蹴り", "Bird Leap Kick"), "66p_x": ("馬の突進", "Horse Charge")}},
    "gensai": {"kick": "front", "punch": "palm",
               "names": {"9k_x": ("飛燕蹴り", "Swallow Kick"), "2pk_x": ("下段当身", "Low Vital Strike"), "66k_x": ("踏み込み足刀", "Stepping Blade Kick")}},
}

Char.pre_write = lambda c: extras.add_extras(c, FLAVOR.get(c.cid, {}))


def toma():
    """灯真は moves.json が正（手書き）。追加技だけを足して書き戻す"""
    p = os.path.join(ROOT, "data/characters/toma/moves.json")
    d = json.load(open(p, encoding="utf-8"))
    c = Char("toma")
    c.moves = d["moves"]
    n = extras.add_extras(c, FLAVOR["toma"])
    with open(p, "w", encoding="utf-8") as fp:
        fp.write('{\n  "schema_version": 1,\n  "character": "toma",\n  "moves": [\n')
        fp.write(",\n".join("    " + json.dumps(m, ensure_ascii=False, separators=(", ", ": ")) for m in c.moves))
        fp.write("\n  ]\n}\n")
    print("toma", len(c.moves), "moves (+%d)" % n)


want = sys.argv[1:]
for f in (toma, chars_a.lena, chars_a.bjorn, chars_a.zaw, chars_a.yuelan, chars_b.mariel, chars_b.adrien, chars_b.ravi, chars_b.gensai):
    if not want or f.__name__ in want:
        f()
