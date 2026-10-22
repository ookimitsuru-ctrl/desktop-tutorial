# 性能テストの最終レポートを作る。数値の表はこのスクリプトが計測データから正確に作り、
# まとめの文章はローカルLLM（Qwen2.5-3B-Instruct）が書く。
# 使い方: python3 tools/perf_report.py 修正前のdir 修正後のdir 修正内容.md 出力.md [スマホ結果dir]
import json, os, sys, glob, time

BEFORE, AFTER, FIXES, OUT = sys.argv[1:5]
PHONE = sys.argv[5] if len(sys.argv) > 5 else None
JA_DIFF = {'easy': 'やさしい', 'normal': 'ふつう', 'hard': 'むずかしい'}
JA_Q = {'high': '高', 'medium': '中', 'low': '低', 'auto': '自動'}


def load(d):
    p = os.path.join(d, 'facts.json')
    return json.load(open(p, encoding='utf-8')) if os.path.exists(p) else []


def table(facts):
    rows = ['| 区間 | 難易度 | 画質 | 天候 | 完走 | スコア | 処理 平均/95%/最大 (ms) | 16ms超 | 試合中のシェーダ作成 | 進行不能 | エラー | メモリ 開始→終了 (MB) |',
            '|---|---|---|---|---|---|---|---|---|---|---|---|']
    for f in facts:
        sc = f"{f['score'][0]}-{f['score'][1]}" if f.get('score') else '-'
        rows.append(f"| {f['segment']} | {JA_DIFF.get(f['difficulty'], f['difficulty'])} | {JA_Q.get(f['quality'], f['quality'])} | {'雨' if f['weather'] == 'rain' else '晴'} | {'○' if f['finished'] else '×'} | {sc} | {f['updMeanMs']} / {f['updP95Ms']} / {f['updMaxMs']} | {f['spikesOver16ms']} | {len(f['shaderCompiles'])} | {len(f['stuck'])} | {len(f['errors'])} | {f['heapStartMB']} → {f['heapEndMB']} |")
    return '\n'.join(rows)


def totals(facts):
    if not facts:
        return {}
    return {
        '区間数': len(facts),
        '完走': sum(1 for f in facts if f['finished']),
        '実時間(分)': round(sum(f['realMinutes'] for f in facts), 1),
        '処理時間の95%値の最大(ms)': max((f['updP95Ms'] or 0) for f in facts),
        '処理時間の最大(ms)': max((f['updMaxMs'] or 0) for f in facts),
        '16ms超の合計': sum(f['spikesOver16ms'] for f in facts),
        '試合中のシェーダ作成の合計': sum(len(f['shaderCompiles']) for f in facts),
        'シェーダ作成の原因': sorted({w for f in facts for s in f['shaderCompiles'] for w in (s.get('who') or [])}),
        '進行不能の合計': sum(len(f['stuck']) for f in facts),
        'エラーの合計': sum(len(f['errors']) for f in facts),
        'メモリ増加の最大(MB)': max(((f['heapEndMB'] or 0) - (f['heapStartMB'] or 0)) for f in facts),
    }


def phone_summary(d):
    if not d or not os.path.isdir(d):
        return None
    rows = []
    for p in sorted(glob.glob(os.path.join(d, '*.jsonl'))):
        for l in open(p, encoding='utf-8', errors='ignore'):
            l = l.strip()
            if '"t":"summary"' in l:
                try:
                    rows.append(json.loads(l))
                except Exception:
                    pass
                break
    dev = open(os.path.join(d, 'device.txt'), encoding='utf-8', errors='ignore').read() if os.path.exists(os.path.join(d, 'device.txt')) else ''
    return {'device': dev, 'rows': rows}


before, after = load(BEFORE), load(AFTER)
tb, ta = totals(before), totals(after)
fixes = open(FIXES, encoding='utf-8').read()
phone = phone_summary(PHONE)

SYSTEM = """あなたはスマホ向けサッカーゲームの性能テストのレポート担当です。与えられたデータだけを根拠に、日本語で、ゲームの作者（専門家ではない）向けに分かりやすく書いてください。
数値はデータにあるものだけを使い、新しい数値を作らないこと。データに無いことは書かないこと。
用語: 「処理時間」= 1フレーム分のゲーム処理にかかった時間。「シェーダ作成」= 試合中に新しい描画プログラムが作られること（その瞬間に画面が一瞬止まる＝もたつき）。
この試験環境にはGPUが無いので、fps（滑らかさ）はスマホ実機テストでしか分からない、という点を必ず書くこと。"""

facts_for_llm = {'修正前': tb, '修正後': ta}
user = f"""次のデータから、レポートの「まとめ」を書いてください。見出しは付けず、次の3つの段落だけを書いてください。
1段落目: テストの結果、どんな問題が見つかったか（修正前の数値を引用）
2段落目: 何を修正し、修正後どうなったか（修正後の数値を引用）
3段落目: まだ確認できていないことと、次にやること

データ:
{json.dumps(facts_for_llm, ensure_ascii=False, indent=1)}

修正内容（Claudeが行ったもの）:
{fixes}
"""
if phone:
    user += f"\nスマホ実機テストの結果（ゲーム内計測のsummary行）:\n{json.dumps(phone, ensure_ascii=False)[:3000]}\n"
else:
    user += '\nスマホ実機テスト: まだ実施していない（ユーザーのPCで tools/phone_test.sh または phone_test.ps1 を実行する必要がある）。\n'

from llama_cpp import Llama
llm = Llama(model_path='/home/user/llm/qwen2.5-3b-instruct-q4_k_m.gguf', n_ctx=8192, n_threads=4, verbose=False, seed=7)
t0 = time.time()
res = llm.create_chat_completion(messages=[{'role': 'system', 'content': SYSTEM}, {'role': 'user', 'content': user}], temperature=0.2, max_tokens=900)
summary = res['choices'][0]['message']['content'].strip()
print(f"[llm] {res['usage']} {time.time() - t0:.0f}s", file=sys.stderr)

seg_before = open(os.path.join(BEFORE, 'llm_segments.md'), encoding='utf-8').read() if os.path.exists(os.path.join(BEFORE, 'llm_segments.md')) else ''
seg_after = open(os.path.join(AFTER, 'llm_segments.md'), encoding='utf-8').read() if os.path.exists(os.path.join(AFTER, 'llm_segments.md')) else ''

md = f"""# ワールドストライカーズ 性能テスト レポート

作成: {time.strftime('%Y-%m-%d %H:%M')}　／　まとめの文章と区間ごとの判定: ローカルLLM（Qwen2.5-3B-Instruct, llama.cpp, CPU実行）　／　表: 計測データから自動作成

## まとめ（ローカルLLM）

{summary}

## テストの方法

- ボットがユーザーチーム（日本）を、実際のボタン操作と同じ経路で操作して1試合（前後半）を自動でプレー
- 難易度（やさしい / ふつう / むずかしい）× 画質（高 / 中 / 低）の9区間。スタジアムと天候（雨を含む）も区間ごとに変更
- 試験環境はクラウド上のChromium（GPUなし・ソフトウェア描画）。描画が非常に遅いため、試合の処理は1/60秒刻みで全て実行し、描画だけ間引く「早送り」で計測
- 計測項目: 1フレーム分の処理時間、16msを超えた回数、試合中のシェーダ作成（一瞬止まる原因）、進行不能、スクリプトエラー、メモリ
- fps（滑らかさ）とカクつきの実測は、スマホ実機テスト（tools/phone_test.sh / phone_test.ps1）で行う

## 修正前の結果

{table(before)}

## Claude が行った修正

{fixes}

## 修正後の結果

{table(after) if after else '（未実施）'}

## スマホ実機テスト

{('端末: ' + phone['device'].replace(chr(10), ' / ') + chr(10) + chr(10) + json.dumps(phone['rows'], ensure_ascii=False, indent=1)) if phone else 'まだ実施していません。スマホをつないだPCで `tools/phone_test.sh`（Mac/Linux）または `tools/phone_test.ps1`（Windows）を実行すると、難易度×画質（高/中/低/自動）の12試合を自動でプレーし、実機のfps・カクつきを記録します。'}

## 付録: 区間ごとの判定（ローカルLLM）

### 修正前
{seg_before.split(chr(10), 2)[-1] if seg_before else ''}

### 修正後
{seg_after.split(chr(10), 2)[-1] if seg_after else ''}
"""
open(OUT, 'w', encoding='utf-8').write(md)
print(OUT)
