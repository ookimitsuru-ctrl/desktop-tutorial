// ============================================================
//  summarize.js  テスト結果をローカル LLM に日本語でまとめさせる
//    node test/playtest/summarize.js <テストの出力フォルダ> <修正メモ.md> <出力.md> [LLM の URL] [モデル名]
//  集計 (数字) はここで作り, 文章にするのは LLM に任せる。LLM の文章には手を加えない
// ============================================================
const fs = require('fs');
const { chat } = require('./llm');

const [dir, fixesPath, outPath] = process.argv.slice(2, 5);
const LLM = process.argv[5] || 'http://127.0.0.1:8080';
const MODEL = process.argv[6] || 'local LLM';
const report = JSON.parse(fs.readFileSync(dir + '/report.json', 'utf8'));
const log = fs.readFileSync(dir + '/log.jsonl', 'utf8').trim().split('\n').map(l => JSON.parse(l));
const fixes = fixesPath && fs.existsSync(fixesPath) ? fs.readFileSync(fixesPath, 'utf8') : '(なし)';

const SEAS = ['夏', '秋', '冬', '春'];
const st = report.stats;
const anoms = Object.values(report.anoms).sort((a, b) => a.first - b.first);
const llmBugs = log.filter(l => l.kind === 'llm-bug');
const actions = log.filter(l => l.kind === 'action');
const fallbacks = log.filter(l => l.kind === 'llm-fallback').length;
const heap = report.heap || [];
const facts = [
  `テスト時間: ${report.minutes} 分 / テスターの判断回数: ${report.steps} 回 (1 回の判断に平均 ${report.llmAvgSec} 秒, 失敗 ${report.llmFail} 回, 選べない動きを選んで置き換えた回数 ${fallbacks})`,
  `レース開始: ${st.races} 回, ゴール: ${st.goals} 回, タイムアップ: ${st.timeups} 回, コンティニュー: ${st.continues} 回`,
  `走った季節: ${Object.keys(st.seasons).map(k => SEAS[k]).join('・') || 'なし'}`,
  `最高速度: ${Math.round(st.maxKmh)} km/h, 木や岩を擦った回数: ${st.scrapes}, スピン: ${st.spins}, ブレーキアシストが効いた時間: ${Math.round(st.assistT)} 秒`,
  `画面ごとの時間 (秒): ${Object.entries(st.stateT).map(([k, v]) => `${k} ${Math.round(v)}`).join(', ')}`,
  `試した動き (回数): ${Object.entries(report.tried).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')}`,
  `fps が 40 を下回った秒数: ${report.fpsLow}`,
  heap.length ? `JS のメモリ: 最初 ${heap[0].mb} MB → 最後 ${heap[heap.length - 1].mb} MB (最大 ${Math.max(...heap.map(h => h.mb))} MB)` : 'JS のメモリ: 記録なし',
  '',
  `自動チェックが見つけた異常 (${anoms.length} 種類):`,
  ...(anoms.length ? anoms.map(a => `- [${a.type}] ${a.detail} (${a.count} 回, 最初 ${Math.round(a.first)} 秒目, 状況: ${a.ctx})`) : ['- なし']),
  '',
  `テスター (LLM) が「おかしい」と判定したもの (${llmBugs.length} 件):`,
  ...(llmBugs.length ? llmBugs.slice(0, 25).map(b => `- 動き ${b.action}: ${b.note}`) : ['- なし'])
].join('\n');

const SYSTEM = 'あなたはゲームの品質テストの報告書を書く担当者です。与えられた事実だけを使い, 数字は書き換えず, 推測で事実を足さないでください。日本語で, 読みやすい Markdown で書いてください。';
const PROMPT = `スマホ向けドライブゲーム「Smart Run」を, ローカル LLM がテスターになって自動で遊ぶテストをしました。
下の「テストの記録」と「修正の記録」をもとに, 開発者向けの報告書を書いてください。

構成:
# Smart Run 1時間テスト報告
## 概要 (3〜4 行)
## テストの内容 (何をどれだけ試したか)
## 見つかった問題 (自動チェックとテスターの判定。本当の不具合と, テスト側の誤検知を分けて)
## 修正した内容 (修正の記録から)
## 修正後の確認
## 残っている課題・次にやること

--- テストの記録 ---
${facts}

--- 修正の記録 (Claude が書いたメモ) ---
${fixes}
`;

(async () => {
  const t0 = Date.now();
  const r = await chat(LLM, [{ role: 'system', content: SYSTEM }, { role: 'user', content: PROMPT }], { temperature: 0.3, maxTokens: 2000, timeoutMs: 1800000 });
  const sec = ((Date.now() - t0) / 1000).toFixed(0);
  const head = `<!-- このファイルはローカル LLM (${MODEL}) が書いた文章です (${sec} 秒)。下の「入力した記録」は summarize.js が集計したものです -->\n\n`;
  fs.writeFileSync(outPath, head + r.text.trim() + '\n\n---\n\n<details><summary>入力した記録</summary>\n\n```\n' + facts + '\n```\n</details>\n');
  fs.writeFileSync(outPath.replace(/\.md$/, '') + '_prompt.txt', SYSTEM + '\n\n' + PROMPT);
  console.log('written', outPath, sec + 's', JSON.stringify(r.usage || {}));
})().catch(e => { console.error('FATAL', e); process.exit(1); });
