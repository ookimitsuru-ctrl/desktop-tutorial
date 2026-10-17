#!/usr/bin/env python3
"""ソークテストの記録 (metrics.jsonl / events.jsonl / history.json) を集計し、
ローカル LLM (llama.cpp などの OpenAI 互換サーバ) に日本語のテストレポートを書かせる。

使い方:
  python3 tools/soak/llm_report.py <記録フォルダ> --llm http://127.0.0.1:8080 [--fixes fixes.md] [--out report.md]
  python3 tools/soak/llm_report.py <記録フォルダ> --summary-only      # 集計 (summary.json) だけ作る
"""
import sys, os, json, argparse, statistics as st, collections, urllib.request

ap = argparse.ArgumentParser()
ap.add_argument('dir')
ap.add_argument('--llm')
ap.add_argument('--fixes')
ap.add_argument('--out')
ap.add_argument('--summary-only', action='store_true')
a = ap.parse_args()

ms = [json.loads(l) for l in open(os.path.join(a.dir, 'metrics.jsonl'))]
ev = [json.loads(l) for l in open(os.path.join(a.dir, 'events.jsonl'))]
hist_p = os.path.join(a.dir, 'history.json')
hist = json.load(open(hist_p)) if os.path.exists(hist_p) else []
dev = [e for e in ev if e['kind'] == 'device' and e.get('pssMB')]
play = [m for m in ms if m['state'] == 'play' and m.get('fps') is not None]
heap = [m['heapMB'] for m in ms if m.get('heapMB')]
ISSUE = ('js_error', 'js_lastError', 'logcat', 'nan_detected', 'stuck', 'scenario_error', 'harness_crash', 'pageerror', 'console_error', 'portrait_detected', 'app_closed_by_back', 'attach_failed')
summary = {
    'duration_min': round(ms[-1]['t'] / 60, 1) if ms else 0,
    'samples': len(ms),
    'scenarios': [{'name': h['name'], 'actions': h.get('actions'), 'chosen_by': h.get('by')} for h in hist],
    'event_counts': dict(collections.Counter(e['kind'] for e in ev)),
    'issues': [e for e in ev if e['kind'] in ISSUE][:30],
    'states': dict(collections.Counter(m['state'] for m in ms)),
    'stages_seen': sorted(set(m['stage'] for m in ms)),
    'fps_play': {'median': st.median([m['fps'] for m in play]), 'min': min(m['fps'] for m in play), 'max': max(m['fps'] for m in play)} if play else None,
    'cpu_ms_per_frame_median': st.median([m['cpu'] for m in ms]) if ms else None,
    'js_heap_mb': {'first': heap[0], 'last': heap[-1], 'max': max(heap)} if heap else None,
    'device_pss_mb': {'first': dev[0]['pssMB'], 'last': dev[-1]['pssMB'], 'max': max(d['pssMB'] for d in dev)} if dev else None,
    'logcat_issue_lines': sum(e.get('logcatIssues', 0) for e in ev if e['kind'] == 'device'),
    'max_stuck_sec': max((m.get('stuckSec', 0) for m in ms), default=0),
    'non_finite_samples': sum(1 for m in ms if not m.get('finite', True)),
    'audio_by_state': {f'{k[0]}/{k[1]}': v for k, v in collections.Counter((m['state'], m['audio']) for m in ms).items()},
    'lifecycle': [e for e in ev if e['kind'] == 'lifecycle'][:6],
    'back_key': [e for e in ev if e['kind'] == 'back_key'][:8],
    'rotation_sizes': sorted({tuple(e['size'][:2]) for e in ev if e['kind'] == 'rotation' and e.get('size')}),
    'context_loss': [e.get('result') for e in ev if e['kind'] == 'context_loss'],
    'max_arrays': {k: max((m.get(k, 0) for m in ms), default=0) for k in ('enemies', 'ebul', 'missiles', 'pickups')},
}
json.dump(summary, open(os.path.join(a.dir, 'summary.json'), 'w'), ensure_ascii=False, indent=1, default=list)
print('summary.json written')
if a.summary_only:
    sys.exit(0)
if not a.llm:
    sys.exit('--llm が必要です')

fixes = open(a.fixes).read() if a.fixes else '(修正なし)'
prompt = f"""あなたはゲームの品質保証エンジニアです。Android 向けシューティングゲーム "WIRED" (WebView + WebGL) を
Android エミュレータで 1 時間の自動動作テストにかけた記録の集計と、見つかった問題に対する修正内容を渡します。
これを読み、開発者向けの日本語のテストレポートを Markdown で書いてください。

構成:
1. 概要 (テスト環境・時間・結論を 3〜5 行)
2. 実施したシナリオ (表)
3. 結果 (エラー・クラッシュ・メモリ・進行停止・数値異常・ライフサイクル・回転・戻るキー・WebGL 喪失)
4. 見つかった問題と修正
5. この環境では評価できなかった点と、実機で確認すべきこと
6. 総合評価

注意: 集計にない事実は書かないこと。エミュレータはハードウェア仮想化なしの完全ソフトウェア実行で、
FPS が非常に低いのは環境の制約でありゲームの性能ではないことを明記すること。

## 集計 (JSON)
{json.dumps(summary, ensure_ascii=False, default=list)}

## 修正内容
{fixes}
"""
req = urllib.request.Request(a.llm.rstrip('/') + '/v1/chat/completions', method='POST', headers={'content-type': 'application/json'},
                             data=json.dumps({'messages': [{'role': 'user', 'content': prompt}], 'temperature': 0.2, 'max_tokens': 2500}).encode())
res = json.load(urllib.request.urlopen(req, timeout=3600))
text = res['choices'][0]['message']['content']
out = a.out or os.path.join(a.dir, 'report.md')
open(out, 'w').write(text)
print('report written:', out)
