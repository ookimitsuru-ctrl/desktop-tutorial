# 性能テストの最終レポートを作る。数値の表はこのスクリプトが計測データから正確に作り、
# まとめの文章はローカルLLM（Qwen2.5-7B-Instruct）が書く。
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
    spikes = [f"{f['updMaxMs']}ms（{f['updMaxAt'].split(' [')[0]}）" for f in facts if (f['updMaxMs'] or 0) > 16]
    return {
        '試合数': len(facts),
        '最後まで終わった試合': sum(1 for f in facts if f['finished']),
        '処理時間の平均(ms)': f"{min(f['updMeanMs'] for f in facts)}〜{max(f['updMeanMs'] for f in facts)}",
        '処理時間の95%値(ms)': f"{min(f['updP95Ms'] for f in facts)}〜{max(f['updP95Ms'] for f in facts)}",
        '16msを超えたフレームの合計': sum(f['spikesOver16ms'] for f in facts),
        '16msを超えたときの値と場面': spikes,
        '試合中のシェーダ作成の合計': sum(len(f['shaderCompiles']) for f in facts),
        'シェーダ作成の原因': sorted({w.split(' diff')[0] for f in facts for s in f['shaderCompiles'] for w in (s.get('who') or [])}),
        '進行不能の合計': sum(len(f['stuck']) for f in facts),
        'エラーの合計': sum(len(f['errors']) for f in facts),
        'メモリ(MB)の範囲': f"{min(f['heapStartMB'] for f in facts)}〜{max(f['heapMaxMB'] for f in facts)}",
        '試合の最初から最後までのメモリ増加の最大(MB)': round(max((f['heapEndMB'] or 0) - (f['heapStartMB'] or 0) for f in facts), 1),
    }


def phone_summary(d):
    if not d or not os.path.isdir(d):
        return None
    rows = []
    for p in sorted(glob.glob(os.path.join(d, '*.jsonl'))):
        if os.path.basename(p) == 'summary.jsonl':
            continue
        for l in open(p, encoding='utf-8-sig', errors='ignore'):
            l = l.strip().lstrip('\ufeff')
            if '"t":"summary"' in l:
                try:
                    rows.append(json.loads(l))
                except Exception:
                    pass
                break
    dev = open(os.path.join(d, 'device.txt'), encoding='utf-8-sig', errors='ignore').read() if os.path.exists(os.path.join(d, 'device.txt')) else ''
    return {'device': dev, 'rows': rows}


before, after = load(BEFORE), load(AFTER)
tb, ta = totals(before), totals(after)
fixes = open(FIXES, encoding='utf-8').read()
phone = phone_summary(PHONE)

SYSTEM = """あなたはスマホ向けサッカーゲームの性能テストのレポート担当です。与えられたデータだけを根拠に、日本語で、ゲームの作者（専門家ではない）向けに分かりやすく書いてください。
数値はデータにあるものだけを使い、新しい数値を作らないこと。データに無いことは書かないこと。
修正内容に書かれていても、計測データで確かめられていないことを「確認できた」「防がれた」と書かないこと（「対策した」と書く）。
修正前後で変わっていない数値を「改善した」と書かないこと。
用語: 「処理時間」= 1フレーム分のゲーム処理にかかった時間。「シェーダ作成」= 試合中に新しい描画プログラムが作られること（その瞬間に画面が一瞬止まる＝もたつき）。
この試験環境にはGPUが無いので、fps（滑らかさ）はスマホ実機テストでしか分からない、という点を必ず書くこと。"""

facts_for_llm = {'修正前': tb, '修正後': ta, '注記': [
    '処理時間の平均と95%値は、もともと軽く、修正前後でほぼ同じ',
    'メモリは試合中に上下するだけで、増え続けてはいない（メモリリークなし）',
    'このテストの画質は高・中・低の固定で、画質「自動」で途中に下がる場面は測っていない（スマホ実機テストの「自動」で確かめる）',
    '最初のゴールの瞬間の処理時間（19〜26ms→約4ms）は、別に行った計測の結果',
]}
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
llm = Llama(model_path=os.environ.get('LLM_MODEL', '/home/user/llm/qwen2.5-7b-instruct-q4_k_m.gguf'), n_ctx=8192, n_threads=4, verbose=False, seed=7)
import re


def overclaims(text):
    """計測で確かめていないことを確認済みのように書いた文を探す（小さいモデルが書きすぎるため）"""
    bad = []
    for sent in re.split(r'(?<=。)', text):
        if '自動' in sent and re.search(r'解消|防が|防げ|確認でき|改善され', sent) and not re.search(r'確認できていない|確認されていない|確認されていません|確認できていません|まだ|していない|未計測|測っていない', sent):
            bad.append(sent.strip())
        if re.search(r'平均|95%値', sent) and re.search(r'大幅に改善|大きく改善', sent):
            bad.append(sent.strip())
    return bad


t0 = time.time()
extra = []
for attempt in range(4):
    prompt = user + (('\n\n特に注意（前回の書きすぎ）:\n' + '\n'.join(f'- 「{b}」のように書かないこと' for b in extra)) if extra else '')
    res = llm.create_chat_completion(messages=[{'role': 'system', 'content': SYSTEM}, {'role': 'user', 'content': prompt}], temperature=0.2, max_tokens=900, seed=7 + attempt)
    summary = res['choices'][0]['message']['content'].strip()
    bad = overclaims(summary)
    paras = [p for p in re.split(r'\n\s*\n', summary) if p.strip()]
    short = len(paras) < 3 or len(summary) < 250
    print(f"[llm] 試行{attempt + 1} {res['usage']} {time.time() - t0:.0f}s 書きすぎ: {bad} 段落数: {len(paras)}", file=sys.stderr)
    if not bad and not short:
        break
    extra += bad
CHECK_NOTE = '' if not bad else '（注: 自動チェックで書きすぎの可能性がある文が残っています: ' + ' / '.join(bad) + '）'

def segments(d):
    p = os.path.join(d, 'llm_segments.md')
    if not os.path.exists(p):
        return ''
    body = open(p, encoding='utf-8').read().split('\n## ', 1)
    return ('\n#### ' + body[1].replace('\n## ', '\n#### ')) if len(body) > 1 else ''


seg_before = segments(BEFORE)
seg_after = segments(AFTER)

md = f"""# ワールドストライカーズ 性能テスト レポート

作成: {time.strftime('%Y-%m-%d %H:%M')}　／　まとめの文章と区間ごとの説明: ローカルLLM（Qwen2.5-7B-Instruct, llama.cpp, CPU実行）　／　表と判定: 計測データから基準どおりに自動作成

## まとめ（ローカルLLM）

{summary}
{CHECK_NOTE}

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

## 付録: 区間ごとの判定（判定は基準どおりスクリプトで決定、説明文はローカルLLM）

最初は Qwen2.5-3B に判定もさせたが、判定基準を守れず誤判定した（例: 試合中のシェーダ作成が3回あるのに「1回しかなく問題なし」）。そのため、判定は基準どおりにスクリプトで決め、説明文だけを Qwen2.5-7B に書かせている。説明文には言い回しの不正確な箇所が残ることがある。「滑らか」などの表現は1フレームの処理時間についてのもので、fps（画面の滑らかさ）はこの環境では計測していない。

### 修正前
{seg_before}

### 修正後
{seg_after}
"""
open(OUT, 'w', encoding='utf-8').write(md)
print(OUT)
