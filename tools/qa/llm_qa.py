#!/usr/bin/env python3
"""ローカル LLM による QA（指揮役）。Godot のハーネス（tools/validate/llm_play.gd）を起動し、標準入出力で会話する。

LLM の役目（どちらも文法で出力を絞る）:
  1. 次に試す対戦（機体 2 機・ステージ・CPU の強さ）を、これまでの試行回数の少ないものから選ぶ。
  2. 試合中、約 0.4 秒ごとの行動を 3 つずつ選ぶ（投げ・連打・同時押し・横移動・ガードの切り替えなど、壊れやすい操作を狙う）。
Python 側の役目: 試験の準備（衣装・色・画質・設定の乱択）、Godot の出力の監視（スクリプトエラー・クラッシュ・無応答）、
異常の集計と報告書、固まったときの再起動。異常の再現データ（入力列）は Godot が試合ごとに保存する。

使い方（どれか 1 つ）:
  # この環境: GGUF を直接読む（llama-cpp-python が必要）。描画あり（仮想ディスプレイ + ソフトウェア Vulkan）
  python3 tools/qa/llm_qa.py --minutes 60 --model <gguf> --render xvfb --ticks 3 --plan-len 6 --out <出力先>
  # 手元の Mac など: すでに動いている OpenAI 互換サーバー（LM Studio / Ollama / llama-server）を使い、手元の画面と GPU で描画
  python3 tools/qa/llm_qa.py --minutes 60 --endpoint http://localhost:1234/v1 --llm-model qwen3.6-35b-a3b \
      --godot /Applications/Godot.app/Contents/MacOS/Godot --render native --ticks 2 --plan-len 6 --out qa_out
  # LLM なし（ハーネスの動作確認）: --no-llm
  --render headless は描画なし（速い）。--carry <前回の summary.json> で網羅を引き継ぐ。
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
IGNORE = re.compile(r"All audio drivers failed|ALSA|snd_|resources still in use at exit|ObjectDB instances leaked|init_output_device|"
                    r"audio_server|audio_driver_alsa|status < 0|ERR_CANT_OPEN|Orphan StringName|leaked at exit|"
                    r"drivers/alsa|cleanup \(core/object|clear \(core/io/resource|Condition \"status")
ERRLINE = re.compile(r"^(SCRIPT ERROR|ERROR|USER ERROR|WARNING|USER WARNING|Parse Error|Invalid|Cannot)\b")


LETTERS = "ABCDEFGHIJKLMNOP"


def extract_json(text):
    """思考ブロックや前後の文字を除いて、最初の JSON オブジェクトを取り出す"""
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.S)
    i = text.find("{")
    if i < 0:
        raise ValueError("no json: " + text[:80])
    depth = 0
    for j in range(i, len(text)):
        if text[j] == "{":
            depth += 1
        elif text[j] == "}":
            depth -= 1
            if depth == 0:
                return json.loads(text[i:j + 1])
    raise ValueError("unterminated json: " + text[:80])


class Llm:
    """llama-cpp-python で GGUF を直接読む（この環境用）。出力は GBNF の文法で絞る"""

    def __init__(self, path, threads, ctx=2048):
        from llama_cpp import Llama, LlamaGrammar
        self.Grammar = LlamaGrammar
        self.m = Llama(model_path=path, n_ctx=ctx, n_threads=threads, n_batch=256, verbose=False)
        self.tokens = 0
        self.secs = 0.0
        self.calls = 0
        self.prompt_tokens = 0
        self._g = {}
        self.name = pathlib.Path(path).name

    def _grammar(self, gbnf):
        if gbnf not in self._g:
            self._g[gbnf] = self.Grammar.from_string(gbnf)
        return self._g[gbnf]

    def ask(self, system, user, spec, max_tokens=64, temp=0.9):
        """spec = {"gbnf": 文法, "schema": JSON スキーマ}"""
        # ChatML を自前で組む。Qwen3.x は思考が既定なので、空の思考ブロックを置いて飛ばす
        prompt = (f"<|im_start|>system\n{system}<|im_end|>\n<|im_start|>user\n{user}<|im_end|>\n"
                  "<|im_start|>assistant\n<think>\n\n</think>\n\n")
        # ハイブリッド（再帰状態をもつ）モデルは途中からの再利用が使えないので、毎回まっさらにする
        try:
            self.m.reset()
            self.m._ctx.kv_cache_clear()
        except Exception:
            try:
                self.m._ctx.memory_clear(True)
            except Exception:
                pass
        t0 = time.time()
        r = self.m.create_completion(prompt, grammar=self._grammar(spec["gbnf"]), max_tokens=max_tokens, temperature=temp, top_p=0.95,
                                     seed=random.randint(0, 1 << 30), stop=["<|im_end|>"])
        self.secs += time.time() - t0
        self.calls += 1
        self.tokens += r["usage"]["completion_tokens"]
        self.prompt_tokens += r["usage"]["prompt_tokens"]
        return extract_json(r["choices"][0]["text"])


class RemoteLlm:
    """OpenAI 互換のサーバー（LM Studio / Ollama / llama-server など）につなぐ。出力は response_format の JSON スキーマで絞る"""

    def __init__(self, endpoint, model, api_key="", timeout=180):
        self.url = endpoint.rstrip("/") + "/chat/completions"
        self.model = model
        self.key = api_key
        self.timeout = timeout
        self.tokens = 0
        self.secs = 0.0
        self.calls = 0
        self.prompt_tokens = 0
        self.name = f"{model} @ {endpoint}"
        # 受け付けられた組み合わせを覚える（サーバーによって未対応の項目がある）
        self.variants = [("schema", True), ("schema", False), ("none", False)]
        self.variant = 0

    def _post(self, body):
        import urllib.request
        req = urllib.request.Request(self.url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
        if self.key:
            req.add_header("Authorization", "Bearer " + self.key)
        with urllib.request.urlopen(req, timeout=self.timeout) as r:
            return json.loads(r.read())

    def ask(self, system, user, spec, max_tokens=64, temp=0.9):
        t0 = time.time()
        last = None
        for vi in range(self.variant, len(self.variants)):
            kind, think_off = self.variants[vi]
            body = {"model": self.model, "temperature": temp, "top_p": 0.95, "max_tokens": max(max_tokens, 64) if kind == "none" else max_tokens,
                    "messages": [{"role": "system", "content": system + (" /no_think" if think_off or kind == "none" else "")},
                                 {"role": "user", "content": user}]}
            if kind == "schema":
                body["response_format"] = {"type": "json_schema", "json_schema": {"name": "answer", "strict": True, "schema": spec["schema"]}}
            if think_off:
                body["chat_template_kwargs"] = {"enable_thinking": False}
            try:
                r = self._post(body)
                msg = r["choices"][0]["message"]
                text = msg.get("content") or ""
                out = extract_json(text)
                self.variant = vi
                u = r.get("usage", {})
                self.tokens += u.get("completion_tokens", 0)
                self.prompt_tokens += u.get("prompt_tokens", 0)
                self.secs += time.time() - t0
                self.calls += 1
                return out
            except Exception as e:   # 400 や未対応の項目、JSON でない返事 → 次の組み合わせへ
                last = e
        raise RuntimeError(f"all request variants failed: {last}")


class Qa:
    def __init__(self, a):
        self.a = a
        self.out = pathlib.Path(a.out)
        (self.out / "repro").mkdir(parents=True, exist_ok=True)
        self.rng = random.Random(a.seed)
        if a.no_llm:
            self.llm = None
        elif a.endpoint:
            self.llm = RemoteLlm(a.endpoint, a.llm_model, a.api_key)
        else:
            self.llm = Llm(a.model, a.threads)
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
        g = self.a.godot
        scene = ["res://tools/validate/llm_play.tscn", "--", "--out", str(self.out), "--ticks", str(self.a.ticks)]
        if self.a.render == "headless":
            cmd = [g, "--headless", "--path", str(ROOT), "--fixed-fps", "60"] + scene
        elif self.a.render == "xvfb":
            # 仮想ディスプレイ + ソフトウェアの Vulkan（実機と同じモバイル描画の経路を通す。GPU の実測にはならない）
            cmd = ["xvfb-run", "-a", "-s", "-screen 0 640x360x24", g, "--path", str(ROOT), "--rendering-driver", "vulkan",
                   "--rendering-method", "mobile", "--resolution", "640x360", "--fixed-fps", "60"] + scene
        else:   # native: 手元の画面と GPU でそのまま描画する（Mac など）
            cmd = [g, "--path", str(ROOT), "--rendering-method", "mobile", "--resolution", "960x540", "--fixed-fps", "60"] + scene
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
                alt = lambda xs: "(" + "|".join(f'"\\"{x}\\""' for x in xs) + ")"
                gbnf = f'root ::= "{{\\"a\\":" {alt(least)} ",\\"b\\":" {alt(least)} ",\\"stage\\":" {alt(least_st)} ",\\"cpu\\":" [1-8] "}}"'
                schema = {"type": "object", "properties": {"a": {"type": "string", "enum": least}, "b": {"type": "string", "enum": least},
                                                           "stage": {"type": "string", "enum": least_st}, "cpu": {"type": "integer", "minimum": 1, "maximum": 8}},
                          "required": ["a", "b", "stage", "cpu"], "additionalProperties": False}
                sysmsg = "You are the QA lead of a robot fighting game. Pick the next match to test. Prefer the least-tested robots and stages. Reply with JSON only."
                usr = (f"Tests so far - robots: {dict(self.cov_char)}; stages: {dict(self.cov_stage)}.\n"
                       f"Choose robots a and b from {least}, a stage from {least_st} and the CPU level (1-8) of the opponent.")
                j = self.llm.ask(sysmsg, usr, {"gbnf": gbnf, "schema": schema}, 48, 0.8)
                a, b, stage, cpu = j["a"], j["b"], j["stage"], int(j["cpu"])
                if a not in chars or b not in chars or stage not in STAGES:
                    raise ValueError("out of range")
            except Exception as e:
                a = b = stage = None
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
        n = self.a.plan_len
        if self.llm is not None:
            try:
                self.waiting_llm = True
                letters = LETTERS[:len(cand)]
                lt = '"\\"" [' + letters[0] + "-" + letters[-1] + '] "\\""'
                gbnf = 'root ::= "{\\"plan\\":[" ' + " \",\" ".join([lt] * n) + ' "]}"'
                schema = {"type": "object", "properties": {"plan": {"type": "array", "minItems": n, "maxItems": n,
                                                                    "items": {"type": "string", "enum": list(letters)}}},
                          "required": ["plan"], "additionalProperties": False}
                sysmsg = ("You control robot P1 in a 3D fighting game to find bugs by trying varied, unusual and rapid inputs. "
                          f"Given the state and lettered candidate actions, choose {n} letters: the actions run in sequence (about 0.4 s each). "
                          "Attack when the opponent is close (dist below 1.5), approach when far, guard when the opponent is attacking, "
                          "and try risky things near the ring edge. Reply with JSON only, like {\"plan\":[\"A\",\"C\"]}.")
                usr = (f"State: {json.dumps(st, separators=(',', ':'))}\nCandidates: "
                       + "; ".join(f"{LETTERS[i]} = {ACTION_HELP.get(k, k)}" for i, k in enumerate(cand)))
                j = self.llm.ask(sysmsg, usr, {"gbnf": gbnf, "schema": schema}, 12 + 5 * n, 1.0)
                plan = [cand[LETTERS.index(x)] for x in j["plan"] if x in LETTERS[:len(cand)]]
            except Exception as e:
                self.llm_fail += 1
                self.say("decide LLM failed:", e)
            finally:
                self.waiting_llm = False
        if not plan:
            plan = [self.rng.choice(cand) for _ in range(n)]
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
            self.gpu = msg.get("gpu", "")
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
        lines.append(f"- LLM の判断: {self.decisions} 回（行動）、失敗 {self.llm_fail} 回。" + (f"モデル {self.llm.name}、平均 {self.llm.secs / max(1, self.llm.calls):.2f} 秒 / 回、出力 {self.llm.tokens / max(0.001, self.llm.secs):.1f} トークン/秒、入力 平均 {self.llm.prompt_tokens / max(1, self.llm.calls):.0f} トークン" if self.llm else "（LLM なし: 乱択）"))
        lines.append(f"- 描画: {self.a.render}、1 フレームあたり {self.a.ticks} tick" + (f"、{self.gpu}" if getattr(self, 'gpu', '') else ""))
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
    ap.add_argument("--endpoint", default="", help="OpenAI 互換サーバーの URL（例 http://localhost:1234/v1）。指定すると --model は使わない")
    ap.add_argument("--llm-model", default="", help="サーバー側のモデル名（例 qwen3.6-35b-a3b）")
    ap.add_argument("--api-key", default=os.environ.get("QA_API_KEY", ""))
    ap.add_argument("--godot", default="godot", help="Godot の実行ファイル")
    ap.add_argument("--render", choices=["headless", "xvfb", "native"], default="headless")
    ap.add_argument("--ticks", type=int, default=1, help="1 描画フレームあたりの tick 数（描画ありでは 2 が目安）")
    ap.add_argument("--plan-len", type=int, default=3, help="LLM 1 回の判断で選ぶ行動の数")
    ap.add_argument("--carry", default="", help="前回の summary.json（網羅を引き継ぐ）")
    a = ap.parse_args()
    Qa(a).run()


if __name__ == "__main__":
    main()
