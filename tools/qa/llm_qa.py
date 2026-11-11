#!/usr/bin/env python3
"""ローカル LLM による QA（指揮役）。Godot のハーネス（tools/validate/llm_play.gd）を起動し、標準入出力で会話する。

LLM の役目（どちらも文法で出力を絞る）:
  1. 次に試す対戦（機体 2 機・ステージ・CPU の強さ）を、これまでの試行回数の少ないものから選ぶ。
  2. 試合中、約 0.4 秒ごとの行動を 3 つずつ選ぶ（投げ・連打・同時押し・横移動・ガードの切り替えなど、壊れやすい操作を狙う）。
Python 側の役目: 試験の準備（衣装・色・画質・設定の乱択）、Godot の出力の監視（スクリプトエラー・クラッシュ・無応答）、
異常の集計と報告書、固まったときの再起動。異常の再現データ（入力列）は Godot が試合ごとに保存する。

使い方: python3 tools/qa/llm_qa.py --minutes 60 --model <gguf> --out <出力ディレクトリ> [--no-llm]
  --no-llm: LLM を使わず乱択（ハーネスの動作確認用）
"""
import argparse
import collections
import json
import os
import pathlib
import random
import re
import subprocess
import sys
import threading
import time

ROOT = pathlib.Path(__file__).resolve().parents[2]
STAGES = ["arena", "harbor", "bamboo", "fort", "ruins", "skyline", "temple", "raft", "lighthouse"]

ACTION_HELP = {
    "PPP": "P,P,P string", "PPK": "P,P,K string", "PK": "P,K string", "KKK": "K,K,K string",
    "6P": "forward+P", "4P": "back+P", "2P": "low punch", "3P": "down-forward+P", "1P": "down-back+P", "8P": "up+P",
    "6K": "forward+K", "4K": "back+K", "2K": "low kick", "3K": "down-forward+K", "1K": "down-back+K", "8K": "up+K (jump kick)",
    "idle": "stand still", "walk_in": "walk toward opponent", "walk_out": "walk away", "crouch": "crouch",
    "guard": "stand guard", "guard_low": "crouching guard", "jump": "jump", "dash_in": "double-tap dash in",
    "dash_out": "double-tap back dash", "run_in": "run at opponent", "step_up": "sidestep up", "step_down": "sidestep down",
    "jab": "P", "kick": "K", "tap_guard": "tap G", "mash": "random mash", "mash_all": "hold P+K+G", "alt_all": "rapid P+K+G re-press",
    "throw": "P+G throw", "throw6": "6P+G throw", "throw4": "4P+G throw",
}
IGNORE = re.compile(r"ALSA|snd_|resources still in use at exit|ObjectDB instances leaked|init_output_device|"
                    r"audio_server|audio_driver_alsa|status < 0|ERR_CANT_OPEN|Orphan StringName|leaked at exit|"
                    r"drivers/alsa|cleanup \(core/object|clear \(core/io/resource|Condition \"status")
ERRLINE = re.compile(r"^(SCRIPT ERROR|ERROR|USER ERROR|WARNING|USER WARNING|Parse Error|Invalid|Cannot)\b")


class Llm:
    def __init__(self, path, threads):
        from llama_cpp import Llama, LlamaGrammar
        self.Grammar = LlamaGrammar
        self.m = Llama(model_path=path, n_ctx=2048, n_threads=threads, n_batch=256, verbose=False)
        self.tokens = 0
        self.secs = 0.0
        self.calls = 0
        self._g = {}

    def grammar(self, text):
        if text not in self._g:
            self._g[text] = self.Grammar.from_string(text)
        return self._g[text]

    def ask(self, system, user, grammar, max_tokens=64, temp=0.9):
        t0 = time.time()
        r = self.m.create_chat_completion(
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            grammar=self.grammar(grammar), max_tokens=max_tokens, temperature=temp, top_p=0.95, seed=random.randint(0, 1 << 30))
        self.secs += time.time() - t0
        self.calls += 1
        self.tokens += r["usage"]["completion_tokens"]
        return r["choices"][0]["message"]["content"]


class Qa:
    def __init__(self, a):
        self.a = a
        self.out = pathlib.Path(a.out)
        (self.out / "repro").mkdir(parents=True, exist_ok=True)
        self.rng = random.Random(a.seed)
        self.llm = None if a.no_llm else Llm(a.model, a.threads)
        self.deadline = time.time() + a.minutes * 60
        self.actions = []
        self.chars = []
        self.use = collections.Counter()
        self.cov_char = collections.Counter()
        self.cov_stage = collections.Counter()
        self.cov_pair = collections.Counter()
        self.matches = []
        self.anoms = []
        self.errors = collections.OrderedDict()
        self.restarts = 0
        self.crashes = []
        self.decisions = 0
        self.llm_fail = 0
        self.scn = None
        self.log = open(self.out / "godot.log", "a", buffering=1)
        self.qlog = open(self.out / "qa.log", "a", buffering=1)
        self.last_line = time.time()
        self.waiting_llm = False
        self.tail = collections.deque(maxlen=60)
        self.cur_match = 0
        if a.carry:
            # 前回の網羅（試行回数）を引き継ぎ、手薄なところから試す
            prev = json.loads(pathlib.Path(a.carry).read_text())
            for m in prev["matches"]:
                sc = m["scenario"]
                for c in sc["chars"]:
                    self.cov_char[c] += 1
                self.cov_stage[sc["stage"]] += 1

    def say(self, *x):
        s = time.strftime("%H:%M:%S ") + " ".join(str(i) for i in x)
        print(s, flush=True)
        self.qlog.write(s + "\n")

    # ---------------------------------------------------------- Godot
    def start_godot(self):
        cmd = ["godot", "--headless", "--path", str(ROOT), "--fixed-fps", "60", "res://tools/validate/llm_play.tscn", "--", "--out", str(self.out)]
        self.p = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
        self.last_line = time.time()

    def send(self, obj):
        self.p.stdin.write(json.dumps(obj, ensure_ascii=False) + "\n")
        self.p.stdin.flush()

    def kill_godot(self):
        try:
            self.p.kill()
        except Exception:
            pass

    def watchdog(self):
        # LLM を待っていない間に 150 秒出力が無ければ無応答
        while not self.done:
            time.sleep(5)
            if not self.waiting_llm and time.time() - self.last_line > 150 and self.p.poll() is None:
                self.hang = True
                self.say("HANG: no output for 150 s, killing godot")
                self.kill_godot()

    # ---------------------------------------------------------- LLM への質問
    def pick_scenario(self):
        r = self.rng
        chars = self.chars
        least = sorted(chars, key=lambda c: (self.cov_char[c], r.random()))[:4]
        least_st = sorted(STAGES, key=lambda s: (self.cov_stage[s], r.random()))[:3]
        a = b = None
        stage = None
        cpu = r.randint(1, 8)
        if self.llm is not None:
            try:
                self.waiting_llm = True
                # 選択肢は試行回数の少ないものに絞る（小さなモデルは「少ないものを選べ」だけでは偏る）
                ch = "(" + "|".join(f'"\\"{c}\\""' for c in least) + ")"
                st = "(" + "|".join(f'"\\"{s}\\""' for s in least_st) + ")"
                g = f'root ::= "{{\\"a\\":" {ch} ",\\"b\\":" {ch} ",\\"stage\\":" {st} ",\\"cpu\\":" [1-8] "}}"'
                sysmsg = "You are the QA lead of a robot fighting game. Pick the next match to test. Prefer the least-tested robots and stages. Reply with JSON only."
                usr = (f"Tests so far - robots: {dict(self.cov_char)}; stages: {dict(self.cov_stage)}.\n"
                       f"Least tested robots: {least}. Least tested stages: {least_st}.\nChoose robots a and b, a stage and the CPU level (1-8) of the opponent.")
                j = json.loads(self.llm.ask(sysmsg, usr, g, 48, 0.8))
                a, b, stage, cpu = j["a"], j["b"], j["stage"], int(j["cpu"])
            except Exception as e:
                self.llm_fail += 1
                self.say("scenario LLM failed:", e)
            finally:
                self.waiting_llm = False
        if a is None or b is None or stage is None:
            a, b = r.sample(least + chars, 2) if False else (least[0], r.choice(chars))
            stage = least_st[0]
        s = {
            "chars": [a, b], "costumes": [r.choice("ab"), r.choice("ab")], "colors": [0, 1 if a == b else r.choice([0, 1])],
            "stage": stage, "cpu": cpu, "seed": r.randint(1, 1 << 30), "rounds": r.choice([1, 2, 2, 3]), "seconds": r.choice([20, 30, 45]),
            "ringout": r.random() < 0.85,
            "settings": {"quality": r.choice(["low", "medium", "high", "ultra"]), "photosensitive": r.random() < 0.25,
                         "comic_words": r.random() < 0.8, "camera_shake": r.choice([0, 50, 100]), "assist_escape": r.random() < 0.2},
        }
        return s

    def decide(self, st):
        # 候補は 8 個: 試用回数の少ないもの 5 個 + ランダム 3 個。LLM は状況に合うものを選ぶ（偏りを防ぎ、まだ試していない操作に誘導する）
        order = sorted(self.actions, key=lambda k: (self.use[k], self.rng.random()))
        cand = order[:5]
        rest = [k for k in self.actions if k not in cand]
        cand += self.rng.sample(rest, min(3, len(rest)))
        self.rng.shuffle(cand)
        plan = None
        if self.llm is not None:
            try:
                self.waiting_llm = True
                act = "(" + "|".join(f'"\\"{k}\\""' for k in cand) + ")"
                g = f'root ::= "{{\\"plan\\":[" {act} "," {act} "," {act} "]}}"'
                sysmsg = ("You control robot P1 in a 3D fighting game to find bugs by trying varied, unusual and rapid inputs. "
                          "Given the state and a list of candidate actions, choose 3 actions to run in sequence (about 0.4 s each). "
                          "Attack when the opponent is close (dist below 1.5), approach when far, guard when the opponent is attacking, "
                          "and try risky things near the ring edge. Reply with JSON only.")
                usr = (f"State: {json.dumps(st, separators=(',', ':'))}\nCandidates: "
                       + "; ".join(f"{k} = {ACTION_HELP.get(k, k)}" for k in cand))
                txt = self.llm.ask(sysmsg, usr, g, 40, 1.0)
                plan = json.loads(txt)["plan"]
            except Exception as e:
                self.llm_fail += 1
                self.say("decide LLM failed:", e)
            finally:
                self.waiting_llm = False
        if not plan:
            plan = [self.rng.choice(cand) for _ in range(3)]
        for k in plan:
            self.use[k] += 1
        self.decisions += 1
        return {"plan": plan, "stop": time.time() > self.deadline}

    # ---------------------------------------------------------- 主ループ
    def handle(self, msg):
        t = msg.get("t")
        if t == "hello":
            self.actions = [k for k in msg["actions"]]
            self.chars = msg["chars"]
            return None
        if t == "scenario":
            if time.time() > self.deadline:
                return {"stop": True}
            self.scn = self.pick_scenario()
            self.cur_match += 1
            for c in self.scn["chars"]:
                self.cov_char[c] += 1
            self.cov_stage[self.scn["stage"]] += 1
            self.cov_pair[tuple(self.scn["chars"])] += 1
            self.say(f"match {self.cur_match}: {self.scn['chars'][0]} vs {self.scn['chars'][1]} on {self.scn['stage']} cpu={self.scn['cpu']} q={self.scn['settings']['quality']}")
            return self.scn
        if t == "decide":
            return self.decide(msg["state"])
        if t == "match_end":
            r = msg["result"]
            r["scenario"] = self.scn
            self.matches.append(r)
            self.say(f"  -> end: frames={r['frames']} winner={r['winner']} anomalies={r['anomalies']} det={r['deterministic']} "
                     f"script_ms p95={r['script_ms_p95']} max={r['script_ms_max']} nodes={r['nodes']} orphans={r['orphans']} mem={r['mem_mb']}MB "
                     f"decisions={self.decisions} left={int(self.deadline - time.time())}s")
            if len(self.matches) % 8 == 0:
                self.report()   # 途中経過（異常終了しても結果が残るように）
            return {"ok": 1, "stop": time.time() > self.deadline}
        return None

    def run(self):
        self.done = False
        self.hang = False
        self.start_godot()
        threading.Thread(target=self.watchdog, daemon=True).start()
        last_err = None
        stopped = False
        while True:
            line = self.p.stdout.readline()
            if line == "":
                code = self.p.poll()
                self.p.wait()
                if stopped or time.time() > self.deadline + 5:
                    break
                kind = "hang" if self.hang else "crash"
                self.hang = False
                self.crashes.append({"kind": kind, "exit": code, "match": self.cur_match, "scenario": self.scn, "tail": list(self.tail)})
                self.say(f"godot ended unexpectedly ({kind}, exit {code}) during match {self.cur_match}; restarting")
                self.restarts += 1
                if self.restarts > 12:
                    self.say("too many restarts, giving up")
                    break
                self.start_godot()
                continue
            self.last_line = time.time()
            line = line.rstrip("\n")
            self.log.write(line + "\n")
            self.tail.append(line)
            if line.startswith("@QA_ANOM "):
                try:
                    self.anoms.append(json.loads(line[9:]))
                except Exception:
                    pass
                continue
            if line.startswith("@QA "):
                try:
                    msg = json.loads(line[4:])
                except Exception:
                    continue
                if msg.get("t") == "bye":
                    stopped = True
                    continue
                rep = self.handle(msg)
                if rep is not None:
                    try:
                        self.send(rep)
                    except BrokenPipeError:
                        pass
                    if rep.get("stop"):
                        stopped = True
                continue
            if ERRLINE.match(line) and not IGNORE.search(line):
                key = re.sub(r"\d+", "N", line)[:240]
                e = self.errors.setdefault(key, {"count": 0, "first": line, "match": self.cur_match, "scenario": self.scn, "context": []})
                e["count"] += 1
                last_err = e
            elif line.startswith(("   at:", "  at:", "   GDScript backtrace", "       [")) and last_err is not None and len(last_err["context"]) < 8:
                last_err["context"].append(line.strip())
        self.done = True
        self.report()

    # ---------------------------------------------------------- 報告書
    def report(self):
        by = collections.defaultdict(list)
        for a in self.anoms:
            by[a["kind"]].append(a)
        tot_frames = sum(m["frames"] for m in self.matches)
        lines = ["# ローカル LLM による QA 報告", ""]
        lines.append(f"- 実行時間: {self.a.minutes} 分（目標）、試合 {len(self.matches)} 試合、合計 {tot_frames} フレーム（{tot_frames / 3600:.1f} 分相当）")
        lines.append(f"- LLM の判断: {self.decisions} 回（行動）、失敗 {self.llm_fail} 回。" + (f"平均 {self.llm.secs / max(1, self.llm.calls):.2f} 秒 / 回、{self.llm.tokens / max(0.001, self.llm.secs):.1f} トークン/秒" if self.llm else "（LLM なし: 乱択）"))
        lines.append(f"- 再起動: {self.restarts} 回、クラッシュ・無応答: {len(self.crashes)} 件")
        lines.append(f"- 異常（不変条件違反）: {len(self.anoms)} 件、エンジンのエラー行（種類）: {len(self.errors)} 件")
        lines.append(f"- 決定論の不一致: {sum(1 for m in self.matches if not m['deterministic'])} 試合")
        lines.append("")
        lines.append("## 網羅")
        lines.append("- 機体: " + ", ".join(f"{k}:{v}" for k, v in sorted(self.cov_char.items())))
        lines.append("- ステージ: " + ", ".join(f"{k}:{v}" for k, v in sorted(self.cov_stage.items())))
        lines.append("- 行動: " + ", ".join(f"{k}:{v}" for k, v in sorted(self.use.items(), key=lambda kv: -kv[1])))
        ev = collections.Counter()
        for m in self.matches:
            ev.update(m["events"])
        lines.append("- 起きた出来事: " + ", ".join(f"{k}:{v}" for k, v in sorted(ev.items(), key=lambda kv: -kv[1])))
        lines.append("")
        lines.append("## 異常")
        if not by and not self.errors and not self.crashes:
            lines.append("なし")
        for k, rows in by.items():
            lines.append(f"### {k}（{len(rows)} 件）")
            for a in rows[:6]:
                m = next((x for x in self.matches if x["match"] == a["match"]), None)
                lines.append(f"- 試合 {a['match']} frame {a['frame']}: `{json.dumps(a['detail'], ensure_ascii=False)}` 再現: `{m['repro'] if m else '-'}`")
        if self.errors:
            lines.append("### エンジンのエラー行")
            for k, e in self.errors.items():
                lines.append(f"- ×{e['count']}（試合 {e['match']}）`{e['first'][:200]}` " + " / ".join(e["context"][:4]))
        for c in self.crashes:
            lines.append(f"### {c['kind']}（試合 {c['match']}、終了コード {c['exit']}）")
            lines.append("```\n" + "\n".join(c["tail"][-25:]) + "\n```")
        slow = sorted(self.matches, key=lambda m: -m["script_ms_p95"])[:3]
        lines.append("")
        lines.append("## 負荷（ヘッドレス、スクリプトのみ）")
        for m in slow:
            lines.append(f"- 試合 {m['match']}: p95 {m['script_ms_p95']} ms / max {m['script_ms_max']} ms（{m['scenario']['stage']}、画質 {m['scenario']['settings']['quality']}）")
        if len(self.matches) >= 6:
            first, last = self.matches[2], self.matches[-1]
            lines.append(f"- 試合ごとの増え方（3 試合目→最終）: ノード {last['nodes'] - first['nodes']:+d}、孤児 {last['orphans'] - first['orphans']:+d}、メモリ {last['mem_mb'] - first['mem_mb']:+.1f} MB")
        (self.out / "report.md").write_text("\n".join(lines), encoding="utf-8")
        (self.out / "summary.json").write_text(json.dumps({"matches": self.matches, "anomalies": self.anoms, "errors": list(self.errors.values()),
                                                           "crashes": self.crashes, "use": self.use}, ensure_ascii=False, indent=1, default=str), encoding="utf-8")
        self.say("report written:", self.out / "report.md")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--minutes", type=float, default=60)
    ap.add_argument("--model", default="")
    ap.add_argument("--out", required=True)
    ap.add_argument("--threads", type=int, default=4)
    ap.add_argument("--seed", type=int, default=20261111)
    ap.add_argument("--no-llm", action="store_true")
    ap.add_argument("--carry", default="", help="前回の summary.json（網羅を引き継ぐ）")
    a = ap.parse_args()
    Qa(a).run()


if __name__ == "__main__":
    main()
