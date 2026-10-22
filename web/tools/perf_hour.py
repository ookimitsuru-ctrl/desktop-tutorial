# 難易度×画質の組み合わせごとに自動プレー試合を1試合ずつ走らせ、区間ごとにローカルLLMが判定を書く。
# 使い方: python3 tools/perf_hour.py 出力ディレクトリ [half(分)] [ラベル] [--rejudge]
# （--rejudge: 計測はせず、保存済み facts.json の判定だけ作り直す。LLM_MODEL でモデルを指定）
# 出力: <dir>/raw.jsonl（全計測行）, <dir>/facts.json（区間ごとの要約）, <dir>/llm_segments.md（LLMの判定）
import json, os, subprocess, sys, time

OUT = sys.argv[1]
HALF = sys.argv[2] if len(sys.argv) > 2 else '3'
LABEL = sys.argv[3] if len(sys.argv) > 3 else 'baseline'
HERE = os.path.dirname(os.path.abspath(__file__))
os.makedirs(OUT, exist_ok=True)
RAW = os.path.join(OUT, 'raw.jsonl')

SEGMENTS = []
i = 0
for diff in ['easy', 'normal', 'hard']:
    for q in ['high', 'medium', 'low']:
        SEGMENTS.append({'difficulty': diff, 'quality': q, 'venue': i % 4, 'weather': 'rain' if i % 3 == 2 else 'clear'})
        i += 1

MODEL = os.environ.get('LLM_MODEL', '/home/user/llm/qwen2.5-7b-instruct-q4_k_m.gguf')

SYSTEM = """あなたはスマホ向けサッカーゲームの性能テスト担当です。ゲームの作者（専門家ではない）に向けて、日本語で短く説明してください。
判定はすでに基準どおりに決まっています。判定を変えず、与えられた数値だけを使って理由を説明してください。新しい数値を作らないこと。
用語: 処理時間 = 1フレーム分のゲーム処理にかかった時間。シェーダ作成 = 試合中に新しい描画プログラムが作られること（その瞬間に画面が一瞬止まる）。
この試験環境にはGPUが無いので fps（滑らかさ）は測れない。"""


def rule_verdict(f):
    """判定基準（LLMに任せず、ここで決める）"""
    problems, cautions, goods = [], [], []
    if not f['finished']:
        problems.append('試合が最後まで終わらなかった')
    if f['shaderCompiles']:
        problems.append(f"試合中にシェーダ作成が{len(f['shaderCompiles'])}回あった（その瞬間に一瞬止まる）")
    if f['stuck']:
        problems.append(f"試合が進まなくなったことが{len(f['stuck'])}回あった")
    if f['errors']:
        problems.append(f"スクリプトエラーが{len(f['errors'])}件あった")
    if f['spikesOver16ms'] >= 3:
        cautions.append(f"処理時間が16msを超えたフレームが{f['spikesOver16ms']}回あった")
    if f['heapStartMB'] is not None and f['heapEndMB'] is not None and f['heapEndMB'] - f['heapStartMB'] >= 30:
        cautions.append(f"メモリが{f['heapStartMB']}MBから{f['heapEndMB']}MBに増えた")
    if f['updP95Ms'] is not None and f['updP95Ms'] >= 4:
        cautions.append(f"処理時間の95%値が{f['updP95Ms']}msと大きい")
    if f['updP95Ms'] is not None and f['updP95Ms'] < 4:
        goods.append(f"処理時間は平均{f['updMeanMs']}ms・95%値{f['updP95Ms']}msで軽い")
    if f['spikesOver16ms'] < 3:
        goods.append(f"16ms超のフレームは{f['spikesOver16ms']}回")
    verdict = '問題' if problems else '要注意' if cautions else '良好'
    return verdict, problems + cautions, goods


def run_segment(seg, idx):
    q = f"difficulty={seg['difficulty']}&quality={seg['quality']}&half={HALF}&fast=1&venue={seg['venue']}&weather={seg['weather']}&label={LABEL}-{idx + 1}"
    tmp = os.path.join(OUT, f'seg{idx + 1}.jsonl')
    if os.path.exists(tmp):
        os.remove(tmp)
    t0 = time.time()
    timeout = int(float(HALF) * 2 * 60 * 2.5 + 240)
    subprocess.run(['node', os.path.join(HERE, 'perfrun.mjs'), tmp, q, str(timeout), '640x288@1'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    rows = [json.loads(l) for l in open(tmp, encoding='utf-8')] if os.path.exists(tmp) else []
    with open(RAW, 'a', encoding='utf-8') as f:
        for r in rows:
            r['segment'] = idx + 1
            f.write(json.dumps(r, ensure_ascii=False) + '\n')
    summ = next((r for r in rows if r['t'] == 'summary'), None)
    wins = [r for r in rows if r['t'] == 'win']
    fact = {
        'segment': idx + 1,
        'difficulty': seg['difficulty'],
        'quality': seg['quality'],
        'venue': summ['venue'] if summ else None,
        'weather': seg['weather'],
        'realMinutes': round((time.time() - t0) / 60, 1),
        'finished': summ is not None,
        'timeout': any(r['t'] == 'timeout' for r in rows),
        'score': summ['score'] if summ else None,
        'shots': summ['shots'] if summ else None,
        'simFrames': summ['simFrames'] if summ else sum(1 for _ in wins),
        'updMeanMs': summ['updMean'] if summ else None,
        'updP95Ms': summ['updP95'] if summ else None,
        'updP99Ms': summ['updP99'] if summ else None,
        'updMaxMs': summ['updMax'] if summ else None,
        'updMaxAt': summ['maxAt'] if summ else None,
        'spikesOver16ms': sum(1 for r in rows if r['t'] == 'spike'),
        'framesOver8ms': summ['upd8'] if summ else None,
        'shaderCompiles': [{'at': r['at'], 'who': r.get('who'), 'renderMs': r.get('renderMs')} for r in rows if r['t'] == 'shader'],
        'stuck': [r for r in rows if r['t'] == 'stuck'],
        'errors': [r.get('msg', '')[:300] for r in rows if r['t'] in ('error', 'pageerror')],
        'heapStartMB': summ['heapStartMB'] if summ else None,
        'heapMaxMB': summ['heapMaxMB'] if summ else None,
        'heapEndMB': summ['heapEndMB'] if summ else None,
        'geometries': summ['geometries'] if summ else None,
        'textures': summ['textures'] if summ else None,
        'simSpeedMedian': sorted([r.get('simSpeed', 0) for r in wins])[len(wins) // 2] if wins else None,
    }
    return fact


def llm_judge(llm, fact):
    verdict, issues, goods = rule_verdict(fact)
    brief = {
        '難易度': fact['difficulty'], '画質': fact['quality'], '天候': fact['weather'],
        'スコア': fact['score'], '処理時間 平均/95%/最大(ms)': [fact['updMeanMs'], fact['updP95Ms'], fact['updMaxMs']],
        '最大になった場面': fact['updMaxAt'], '16ms超の回数': fact['spikesOver16ms'],
        '試合中のシェーダ作成': [s['at'] for s in fact['shaderCompiles']],
        '進行不能': len(fact['stuck']), 'エラー': len(fact['errors']),
        'メモリ 開始/最大/終了(MB)': [fact['heapStartMB'], fact['heapMaxMB'], fact['heapEndMB']],
    }
    user = (f"判定: {verdict}\n判定の根拠: {'; '.join(issues) if issues else 'なし'}\n良い点: {'; '.join(goods)}\n"
            f"計測データ: {json.dumps(brief, ensure_ascii=False)}\n\n"
            "この区間について、判定の理由を2〜3文で説明してください（判定は書き換えないこと）。")
    out = llm.create_chat_completion(messages=[{'role': 'system', 'content': SYSTEM}, {'role': 'user', 'content': user}], temperature=0.1, max_tokens=260)
    return f"判定: {verdict}\n\n{out['choices'][0]['message']['content'].strip()}"


def write_md(facts, path):
    with open(path, 'w', encoding='utf-8') as md:
        md.write(f'# 区間ごとの判定（{LABEL}）\n\n判定は基準どおりにスクリプトで決定し、説明文はローカルLLM（{os.path.basename(MODEL)}）が作成\n\n')
        for f in facts:
            md.write(f"## 区間{f['segment']}: 難易度 {f['difficulty']} / 画質 {f['quality']} / {f['venue']} / {f['weather']}\n\n{f.get('llmVerdict', '')}\n\n")


def main():
    from llama_cpp import Llama
    if '--rejudge' in sys.argv:
        # 計測はやり直さず、保存済みの計測データの判定だけを作り直す
        facts = json.load(open(os.path.join(OUT, 'facts.json'), encoding='utf-8'))
        llm = Llama(model_path=MODEL, n_ctx=4096, n_threads=4, verbose=False, seed=7)
        for f in facts:
            t1 = time.time()
            f['llmVerdict'] = llm_judge(llm, f)
            print(f"区間{f['segment']} {time.time() - t1:.0f}秒: {f['llmVerdict'].splitlines()[0]}", flush=True)
        json.dump(facts, open(os.path.join(OUT, 'facts.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        write_md(facts, os.path.join(OUT, 'llm_segments.md'))
        return
    llm = None
    facts = []
    t_all = time.time()
    for idx, seg in enumerate(SEGMENTS):
        print(f"[{time.strftime('%H:%M:%S')}] 区間{idx + 1}/{len(SEGMENTS)} {seg} 開始", flush=True)
        fact = run_segment(seg, idx)
        facts.append(fact)
        json.dump(facts, open(os.path.join(OUT, 'facts.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        print(f"  終了 {fact['realMinutes']}分 finished={fact['finished']} upd95={fact['updP95Ms']} shader={len(fact['shaderCompiles'])} spikes={fact['spikesOver16ms']} stuck={len(fact['stuck'])} errors={len(fact['errors'])}", flush=True)
        # ブラウザが止まっている間にLLMで判定（計測と同時に動かさない）
        if llm is None:
            llm = Llama(model_path=MODEL, n_ctx=4096, n_threads=4, verbose=False, seed=7)
        t1 = time.time()
        fact['llmVerdict'] = llm_judge(llm, fact)
        json.dump(facts, open(os.path.join(OUT, 'facts.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        write_md(facts, os.path.join(OUT, 'llm_segments.md'))
        print(f"  LLM判定 {time.time() - t1:.0f}秒: {fact['llmVerdict'].splitlines()[0]}", flush=True)
    print(f"全区間終了 {(time.time() - t_all) / 60:.1f}分", flush=True)


main()
