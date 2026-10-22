# 難易度×画質の組み合わせごとに自動プレー試合を1試合ずつ走らせ、区間ごとにローカルLLMが判定を書く。
# 使い方: python3 tools/perf_hour.py 出力ディレクトリ [half(分)] [ラベル]
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

SYSTEM = """あなたはスマホ向けサッカーゲームの性能テスト担当です。与えられた計測データだけを根拠に、日本語で簡潔に判定してください。
推測で数値を作らないこと。データに無いことは書かないこと。
判定基準:
- upd = 1フレーム分のゲーム処理時間(ms)。p95が4ms未満なら良好。16msを超えた回数(spike)が多いと一瞬もたつく原因。
- shader = 試合中に新しいシェーダが作られた回数。1回でもあれば、その瞬間に画面が一瞬止まる（もたつき）ので「問題」。
- stuck = 試合が進まなくなった回数。1回でもあれば「問題」。
- errors = スクリプトエラーの数。1以上なら「問題」。
- heap = メモリ使用量(MB)。試合の最初から最後まで30MB以上増えたら「要注意」。
- この環境はGPUが無いため、fps（滑らかさ）はここでは測れない。fpsはスマホ実機テストで確認する。
出力形式（この形だけ）:
判定: 良好 / 要注意 / 問題 のどれか
理由:
- 箇条書きで2〜4行（数値を引用する）"""


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
    brief = {k: fact[k] for k in ['difficulty', 'quality', 'weather', 'finished', 'score', 'updMeanMs', 'updP95Ms', 'updMaxMs', 'updMaxAt', 'spikesOver16ms', 'heapStartMB', 'heapEndMB']}
    brief['shader'] = len(fact['shaderCompiles'])
    brief['shaderWhen'] = [s['at'] for s in fact['shaderCompiles']]
    brief['stuck'] = len(fact['stuck'])
    brief['errors'] = len(fact['errors'])
    user = '次の区間の計測データを判定してください。\n' + json.dumps(brief, ensure_ascii=False, indent=1)
    out = llm.create_chat_completion(messages=[{'role': 'system', 'content': SYSTEM}, {'role': 'user', 'content': user}], temperature=0.1, max_tokens=300)
    return out['choices'][0]['message']['content'].strip()


def main():
    from llama_cpp import Llama
    llm = None
    facts = []
    md = open(os.path.join(OUT, 'llm_segments.md'), 'w', encoding='utf-8')
    md.write(f'# 区間ごとの判定（ローカルLLM: Qwen2.5-3B-Instruct / {LABEL}）\n\n')
    t_all = time.time()
    for idx, seg in enumerate(SEGMENTS):
        print(f"[{time.strftime('%H:%M:%S')}] 区間{idx + 1}/{len(SEGMENTS)} {seg} 開始", flush=True)
        fact = run_segment(seg, idx)
        facts.append(fact)
        json.dump(facts, open(os.path.join(OUT, 'facts.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        print(f"  終了 {fact['realMinutes']}分 finished={fact['finished']} upd95={fact['updP95Ms']} shader={len(fact['shaderCompiles'])} spikes={fact['spikesOver16ms']} stuck={len(fact['stuck'])} errors={len(fact['errors'])}", flush=True)
        # ブラウザが止まっている間にLLMで判定（計測と同時に動かさない）
        if llm is None:
            llm = Llama(model_path='/home/user/llm/qwen2.5-3b-instruct-q4_k_m.gguf', n_ctx=4096, n_threads=4, verbose=False, seed=7)
        t1 = time.time()
        verdict = llm_judge(llm, fact)
        fact['llmVerdict'] = verdict
        json.dump(facts, open(os.path.join(OUT, 'facts.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        md.write(f"## 区間{idx + 1}: 難易度 {seg['difficulty']} / 画質 {seg['quality']} / {fact['venue']} / {seg['weather']}\n\n{verdict}\n\n")
        md.flush()
        print(f"  LLM判定 {time.time() - t1:.0f}秒: {verdict.splitlines()[0] if verdict else ''}", flush=True)
    print(f"全区間終了 {(time.time() - t_all) / 60:.1f}分", flush=True)


main()
