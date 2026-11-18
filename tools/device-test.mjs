// 実機テスト: adb で Mac などに接続した Android 端末で Formula simulator を長時間動かし、記録とレポートを残す
//
//   node tools/device-test.mjs [オプション]          (Node.js 22 以上。adb が PATH にあること)
//     --minutes 60            テストの長さ (分)
//     --apk <path>            先にインストールする APK (デバッグ版。WebView のリモートデバッグが有効なもの)
//     --variant original      オリジナル版 (jp.okracing.original) をテストする
//     --out <dir>             記録の出力先 (既定: device-test-<日時>)
//     --llm <url>             ローカル LLM (OpenAI 互換 API の .../v1) に結果を分析させる。例: http://127.0.0.1:8080/v1
//     --model <name>          LLM のモデル名
//     --llm-images            スクリーンショットも LLM に送る (画像対応のモデルのとき)
//     --cdp <url>             adb を使わず、この DevTools に直接つなぐ (PC のブラウザでの動作確認用)
//
// 中身: 3 つのサーキットで フリー走行 / トレーニング / 決勝 を自動運転で順に回し、合間に adb のタッチで
// ペダルとシフトを実際に操作する。15 秒ごとにフレームレート・状態・JS エラー、1 分ごとにメモリと端末温度、
// 5 分ごとにスクリーンショットを記録し、最後に report.md / report.json を書き出す。
import { execFileSync } from 'child_process';
import fs from 'fs'; import path from 'path';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const MINUTES = +arg('minutes', 60), VARIANT = arg('variant', ''), CDP = arg('cdp', '');
const PKG = VARIANT === 'original' ? 'jp.okracing.original' : 'jp.okracing.game';
const TRACKS = VARIANT === 'original' ? ['bayside', 'mistral', 'horizon'] : ['suzuka', 'fuji', 'indy'];
const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
const OUT = path.resolve(arg('out', `device-test-${stamp}`)); fs.mkdirSync(OUT, { recursive: true });
const LLM = arg('llm', ''), MODEL = arg('model', 'local');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => { const line = `[${new Date().toLocaleTimeString()}] ${a.join(' ')}`; console.log(line); fs.appendFileSync(path.join(OUT, 'log.txt'), line + '\n'); };
if (typeof WebSocket === 'undefined') { console.error('Node.js 22 以上が必要です (WebSocket を使うため)'); process.exit(1); }

// ---------------- adb ----------------
let SERIAL = '';
const adb = (args, opt = {}) => execFileSync('adb', SERIAL ? ['-s', SERIAL, ...args] : args, { encoding: opt.binary ? 'buffer' : 'utf8', timeout: opt.timeout || 30000, maxBuffer: 64 << 20 });
const sh = cmd => { try { return adb(['shell', cmd]).trim(); } catch (e) { return ''; } };
function pickDevice() {
  const lines = execFileSync('adb', ['devices'], { encoding: 'utf8' }).split('\n').slice(1).filter(l => /\tdevice$/.test(l));
  if (!lines.length) throw new Error('adb で接続された端末が見つかりません (USB デバッグを許可しているか確認してください)');
  SERIAL = lines[0].split('\t')[0];
  log('端末', SERIAL, sh('getprop ro.product.model'), 'Android', sh('getprop ro.build.version.release'));
}
function launchApp() {
  sh(`am force-stop ${PKG}`);
  sh(`am start -n ${PKG}/jp.okracing.game.MainActivity`);
}
const pidOf = () => sh(`pidof ${PKG}`).split(/\s+/)[0] || '';

// ---------------- DevTools (CDP) ----------------
let ws = null, msgId = 0; const pending = new Map(); const jsErrors = [];
async function connect() {
  let base = CDP;
  if (!base) {
    let pid = ''; for (let k = 0; k < 20 && !pid; k++) { await sleep(500); pid = pidOf(); }
    if (!pid) throw new Error('アプリが起動しませんでした');
    adb(['forward', 'tcp:9333', `localabstract:webview_devtools_remote_${pid}`]);
    base = 'http://127.0.0.1:9333';
  }
  let pages = [];
  for (let k = 0; k < 30; k++) { try { pages = await (await fetch(base + '/json')).json(); } catch (e) { pages = []; } if (pages.some(p => p.type === 'page')) break; await sleep(500); }
  const page = pages.find(p => p.type === 'page' && /index\.html/.test(p.url)) || pages.find(p => p.type === 'page');
  if (!page) throw new Error('WebView に接続できません。デバッグ版の APK (WebView のリモートデバッグが有効なもの) を使ってください');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') { const d = m.params.exceptionDetails; jsErrors.push({ t: elapsed(), text: (d.exception && d.exception.description) || d.text }); log('JS例外', jsErrors.at(-1).text.split('\n')[0]); }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') { jsErrors.push({ t: elapsed(), text: m.params.args.map(a => a.value ?? a.description).join(' ') }); log('consoleエラー', jsErrors.at(-1).text); }
  };
  ws.onclose = () => { ws = null; };
  await send('Runtime.enable');
  log('WebView に接続しました', page.url);
}
const send = (method, params = {}) => new Promise((res, rej) => {
  if (!ws) return rej(new Error('接続が切れています'));
  const id = ++msgId; pending.set(id, res); ws.send(JSON.stringify({ id, method, params }));
  setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error('応答なし: ' + method)); } }, 15000);
});
async function js(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result && r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.text);
  return r.result && r.result.result ? r.result.result.value : undefined;
}

// ---------------- 計測 ----------------
const T0 = Date.now(), elapsed = () => +((Date.now() - T0) / 60000).toFixed(2);
const samples = [], device = [], anomalies = [];
const anomaly = (kind, detail) => { anomalies.push({ t: elapsed(), kind, detail }); log('⚠', kind, detail); };
const PROBE = `(() => {
  let first = false;
  if (!window.__dt) { first = true; window.__dt = { f: 0, t: performance.now() }; (function loop() { window.__dt.f++; requestAnimationFrame(loop); })(); }
  const d = window.__dt, now = performance.now(), fps = first ? null : d.f * 1000 / Math.max(1, now - d.t); d.f = 0; d.t = now;
  const o = window.__okr, S = o.session, c = S && S.player.car;
  return { fps: fps == null ? null : +fps.toFixed(1), state: o.state, mode: S && S.mode, track: o.T && o.T.id, sstate: S && S.state,
    kmh: c ? Math.round(c.speed * 3.6) : null, lap: S ? S.player.lap : null, pos: S ? S.player.pos : null, off: c ? c.offCount : null,
    dmg: c ? +(c.dmgF + c.dmgR + c.dmgS).toFixed(2) : null, retired: c ? !!c.retired : null, results: S ? !!S.resultsReady : null,
    heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null, auto: o.auto.on, w: innerWidth, h: innerHeight };
})()`;
let stillSince = null;
async function sample(seg) {
  const s = await js(PROBE); s.t = elapsed(); s.seg = seg; samples.push(s);
  if (s.fps != null && s.fps < 40) anomaly('フレームレート低下', `${s.fps}fps (${s.track} ${s.mode})`);
  if (s.state === 'drive' && s.sstate === 'green' && s.auto && s.kmh != null && s.kmh < 5) { stillSince = stillSince ?? Date.now(); if (Date.now() - stillSince > 20000) { anomaly('停止したまま', `${s.track} ${s.mode} lap ${s.lap}`); stillSince = Date.now(); } } else stillSince = null;
  if (s.retired) anomaly('リタイア', `${s.track} ${s.mode} lap ${s.lap} dmg ${s.dmg}`);
  return s;
}
function deviceSample() {
  if (CDP) return;
  const mem = (sh(`dumpsys meminfo ${PKG}`).match(/TOTAL(?: PSS)?:?\s+(\d+)/) || [])[1];
  const temp = (sh('dumpsys battery').match(/temperature: (\d+)/) || [])[1];
  const lvl = (sh('dumpsys battery').match(/level: (\d+)/) || [])[1];
  const d = { t: elapsed(), pssMB: mem ? Math.round(mem / 1024) : null, batteryC: temp ? temp / 10 : null, battery: lvl ? +lvl : null };
  device.push(d); log('端末', `メモリ ${d.pssMB}MB 温度 ${d.batteryC}℃ 電池 ${d.battery}%`);
  if (d.batteryC > 45) anomaly('端末の温度が高い', `${d.batteryC}℃`);
}
let shotN = 0;
async function screenshot(name) {
  const file = path.join(OUT, `${String(++shotN).padStart(2, '0')}-${name}.png`);
  try {
    if (CDP) { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(file, Buffer.from(r.result.data, 'base64')); }
    else fs.writeFileSync(file, adb(['exec-out', 'screencap', '-p'], { binary: true, timeout: 20000 }));
    log('スクリーンショット', path.basename(file));
  } catch (e) { log('スクリーンショット失敗', e.message); }
}

// ---------------- 実際のタッチ操作 (adb input) ----------------
async function touchDrive(seconds) {
  if (CDP) return;
  const L = await js('(() => { const L = window.__okr.input.layout, r = devicePixelRatio; const f = o => ({ x: o.x * r, y: o.y * r, w: o.w * r, h: o.h * r }); return { pedal: f(L.pedal), up: f(L.shiftUp), down: f(L.shiftDown), right: window.__okr.cfg.pedalAccelRight !== false }; })()');
  const py = Math.round(L.pedal.y + L.pedal.h / 2), mid = L.pedal.x + L.pedal.w / 2;
  const accelX = Math.round(mid + (L.right ? 1 : -1) * L.pedal.w * 0.42), brakeX = Math.round(mid - (L.right ? 1 : -1) * L.pedal.w * 0.42);
  const tap = r => sh(`input tap ${Math.round(r.x + r.w / 2)} ${Math.round(r.y + r.h / 2)}`);
  log('タッチ操作で走行', `${seconds}秒 (パッドとパドルを adb で操作、ステアリングは自動)`);
  await js('window.__okr.auto.on = false');
  const end = Date.now() + seconds * 1000;
  while (Date.now() < end) {
    sh(`input swipe ${Math.round(mid)} ${py} ${accelX} ${py} 2500`);     // 中央からアクセル側へスライドして保持
    tap(L.up);
    sh(`input swipe ${Math.round(mid)} ${py} ${brakeX} ${py} 700`);      // ブレーキ
    tap(L.down);
  }
}

// ---------------- シナリオ ----------------
async function runSegment(track, mode, minutes) {
  const seg = `${track}/${mode}`;
  log('---', seg, `${minutes}分`);
  await js(`(() => { const o = window.__okr; o.loadTrack('${track}'); const l = o.Store.last(); l.track = '${track}'; l.laps = 5; l.trainSec = 0; o.Store.saveLast(l); o.startSession('${mode}'); o.auto.on = true; })()`);
  const end = Date.now() + minutes * 60000; let lastShot = 0, k = 0;
  while (Date.now() < end) {
    await sleep(15000);
    if (!CDP && !pidOf()) { anomaly('アプリが終了した', seg); launchApp(); await connect(); await js(`window.__okr.startSession('${mode}'); window.__okr.auto.on = true`); continue; }
    if (!ws) { anomaly('WebView との接続が切れた', seg); await connect(); continue; }
    const s = await sample(seg);
    if (k++ % 4 === 0) deviceSample();
    if (Date.now() - lastShot > 5 * 60000) { await screenshot(`${track}-${mode}`); lastShot = Date.now(); }
    if (s.results) { log('結果画面', seg); await screenshot(`${track}-${mode}-result`); await js(`window.__okr.startSession('${mode}'); window.__okr.auto.on = true`); }
  }
}

async function main() {
  if (!CDP) {
    pickDevice();
    if (arg('apk', '')) { log('インストール', arg('apk')); adb(['install', '-r', arg('apk')], { timeout: 180000 }); }
    launchApp(); await sleep(3000);
  }
  await connect();
  await js(PROBE);   // フレーム計測を始めておく
  await sleep(2000); await screenshot('title');
  // 1 周期: 各サーキットで フリー走行 → トレーニング → 決勝、最後にタッチ操作
  const plan = []; for (const t of TRACKS) plan.push([t, 'free', 0.15], [t, 'train', 0.15], [t, 'race', 0.7]);
  const cycle = plan.reduce((a, p) => a + p[2], 0), touchShare = 0.06;
  const perUnit = MINUTES * (1 - touchShare) / cycle;
  for (const [t, m, w] of plan) {
    if (elapsed() >= MINUTES) break;
    await runSegment(t, m, Math.max(0.5, w * perUnit));
  }
  if (elapsed() < MINUTES) { await js(`window.__okr.startSession('free')`); await touchDrive(Math.max(20, (MINUTES - elapsed()) * 60)); await sample('touch'); await screenshot('touch'); }
  report();
  if (LLM) await askLLM();
  log('完了', OUT);
  process.exit(0);
}

function report() {
  const by = {}; for (const s of samples) (by[s.seg] = by[s.seg] || []).push(s);
  const rows = Object.entries(by).map(([seg, a]) => { const f = a.map(x => x.fps).filter(x => x != null); if (!f.length) f.push(0); return `| ${seg} | ${a.length} | ${Math.min(...f).toFixed(0)} | ${(f.reduce((x, y) => x + y, 0) / f.length).toFixed(0)} | ${Math.max(...a.map(x => x.lap ?? 0))} | ${a.some(x => x.retired) ? 'あり' : '-'} |`; });
  const heap = samples.filter(s => s.heapMB != null).map(s => s.heapMB);
  const md = `# 実機テスト (${PKG})

- 期間: ${elapsed()} 分 / 予定 ${MINUTES} 分
- JS エラー: ${jsErrors.length} 件
- 異常: ${anomalies.length} 件
- JS ヒープ: ${heap.length ? `${heap[0]}MB → ${heap.at(-1)}MB (最大 ${Math.max(...heap)}MB)` : '取得できず'}
- 端末メモリ (PSS): ${device.length ? `${device[0].pssMB}MB → ${device.at(-1).pssMB}MB` : '-'}  温度: ${device.length ? `${device[0].batteryC}℃ → ${device.at(-1).batteryC}℃ (最大 ${Math.max(...device.map(d => d.batteryC || 0))}℃)` : '-'}

| 区間 | 計測数 | 最低fps | 平均fps | 周回 | リタイア |
|---|---|---|---|---|---|
${rows.join('\n')}

## 異常
${anomalies.map(a => `- ${a.t}分 ${a.kind}: ${a.detail}`).join('\n') || '- なし'}

## JS エラー
${jsErrors.map(e => `- ${e.t}分 ${e.text.split('\n')[0]}`).join('\n') || '- なし'}
`;
  fs.writeFileSync(path.join(OUT, 'report.md'), md);
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ pkg: PKG, minutes: elapsed(), samples, device, anomalies, jsErrors }, null, 1));
  log('レポート', path.join(OUT, 'report.md'));
}

async function askLLM() {
  const md = fs.readFileSync(path.join(OUT, 'report.md'), 'utf8');
  const content = [{ type: 'text', text: `次はスマホ向けレースゲーム (Formula simulator) を実機で ${MINUTES} 分間自動で動かした記録です。\n不具合の可能性があるもの、性能や発熱の問題、追加で確認すべきことを、重要度の高い順に日本語で箇条書きにしてください。推測は推測と書いてください。\n\n${md}` }];
  if (arg('llm-images', false)) for (const f of fs.readdirSync(OUT).filter(f => f.endsWith('.png')).slice(-4)) content.push({ type: 'image_url', image_url: { url: 'data:image/png;base64,' + fs.readFileSync(path.join(OUT, f)).toString('base64') } });
  try {
    const r = await fetch(LLM.replace(/\/$/, '') + '/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: MODEL, messages: [{ role: 'user', content: arg('llm-images', false) ? content : content[0].text }], temperature: 0.2 }) });
    const j = await r.json(); const text = j.choices?.[0]?.message?.content || JSON.stringify(j).slice(0, 2000);
    fs.writeFileSync(path.join(OUT, 'report-llm.md'), text); log('ローカル LLM の分析', path.join(OUT, 'report-llm.md'));
  } catch (e) { log('ローカル LLM に接続できません', e.message); }
}

main().catch(e => { log('中断', e.stack || e.message); try { report(); } catch (e2) { /* 無視 */ } process.exit(1); });
