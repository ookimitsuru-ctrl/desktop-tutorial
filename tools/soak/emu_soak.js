// Android エミュレータ上の APK (デバッグ版) を長時間動かす動作テスト
//  入力は adb (実際のタッチ・戻るキー・ホーム・画面回転)、状態の読み出しは WebView の DevTools (CDP)。
//  エミュレータの画面出力が取れない環境でも確認できるよう、ゲームの描画結果を WebView 内で読み出して保存する。
//
// 使い方: node tools/soak/emu_soak.js --minutes 60 --out <フォルダ> [--segment 6] [--llm http://127.0.0.1:8080]
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const { connect } = require('./cdp');

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? a.concat([[v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]]) : a), []));
const MINUTES = +(args.minutes || 60);
const SEGMENT = +(args.segment || 6);
const OUT = args.out || '/tmp/emu_soak';
const LLM = args.llm || null;
const ADB = process.env.ADB || '/root/android-sdk/platform-tools/adb';
const PKG = 'com.starwire.game';
fs.mkdirSync(path.join(OUT, 'frames'), { recursive: true });
const metricsFile = fs.createWriteStream(path.join(OUT, 'metrics.jsonl'));
const eventsFile = fs.createWriteStream(path.join(OUT, 'events.jsonl'));
const T0 = Date.now();
const now = () => (Date.now() - T0) / 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
function event(kind, data = {}) {
  const e = { t: +now().toFixed(1), kind, ...data };
  eventsFile.write(JSON.stringify(e) + '\n');
  console.log(`[${e.t.toFixed(0).padStart(5)}s] ${kind} ${JSON.stringify(data).slice(0, 220)}`);
}
const adb = (...a) => new Promise((res) => execFile(ADB, a, { timeout: 180000, maxBuffer: 64 << 20 }, (err, out, errOut) => res({ ok: !err, out: String(out || ''), err: String(errOut || err || '') })));
const sh = (cmd) => adb('shell', cmd);

const SCENARIOS = {
  campaign: '自動操縦で通しプレイ (クリア → NEXT STAGE → … → エンディング → タイトル)',
  monkey: '自動操縦なしで adb の実タッチ (タップ・スワイプ・長押し) を画面のランダムな位置へ',
  back_key: 'Android の戻るキーを連打 (プレイ中 → ポーズ → 再開 / タイトル / 終了確認)',
  lifecycle: 'ホームボタンでアプリを裏へ → 待つ → 再び起動 (onPause / onResume・音の停止と再開)',
  rotation: '端末の向きを横 ↔ 逆向きの横に回転',
  options: 'オプション画面の全設定を実タップで切り替えてからプレイ',
  retry_loop: '無敵なし・自動操縦なしで撃墜 → RETRY を繰り返す',
  context_loss: 'WebGL コンテキストを失わせて復帰させる',
};

let c = null;          // CDP 接続
let dpr = 2.75, cssW = 830, cssH = 393;
async function attach() {
  for (let k = 0; k < 40; k++) {
    const r = await sh('cat /proc/net/unix');
    const m = r.out.match(/webview_devtools_remote_(\d+)/);
    if (m) {
      await adb('forward', 'tcp:9222', 'localabstract:webview_devtools_remote_' + m[1]);
      try {
        c = await connect(9222);
        const ok = await c.evaluate('!!window.__sw');
        if (ok) {
          const d = await c.evaluate('[devicePixelRatio, innerWidth, innerHeight]');
          [dpr, cssW, cssH] = d;
          await installHooks();
          event('attached', { pid: m[1], dpr, cssW, cssH });
          return true;
        }
        c.close(); c = null;
      } catch (e) { c = null; }
    }
    await sleep(5000);
  }
  event('attach_failed');
  return false;
}
const ev = async (expr) => {
  try { return await c.evaluate(expr); } catch (e) {
    event('cdp_error', { err: String(e.message).slice(0, 160) });
    if (/closed|not open|timeout|ECONNRESET/i.test(e.message)) { try { c.close(); } catch (_) {} c = null; await attach(); }
    return null;
  }
};
// ゲームの描画結果を読み出す仕掛け (present 直後に toDataURL) と、エラーの記録
async function installHooks() {
  await c.evaluate(`(() => {
    if (window.__soakHooked) return; window.__soakHooked = true;
    window.__soakErrors = [];
    addEventListener('error', (e) => window.__soakErrors.push(String(e.message || e)));
    addEventListener('unhandledrejection', (e) => window.__soakErrors.push('rejection ' + String(e.reason)));
    const g = window.__sw.G.gfx, P = Object.getPrototypeOf(g), orig = P.present;
    P.present = function (dt) { orig.call(this, dt); if (window.__grabReq) { window.__grabReq = false; try { window.__grabbed = this.canvas.toDataURL('image/jpeg', 0.7); } catch (e) { window.__grabbed = 'ERR ' + e; } } };
    window.__frames = 0; const raf = requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => raf((t) => { window.__frames++; cb(t); });
  })()`);
}
async function grab(name) {
  await ev('window.__grabbed = null; window.__grabReq = true');
  for (let k = 0; k < 40; k++) {
    const d = await ev('window.__grabbed');
    if (d) {
      if (d.startsWith('data:')) { fs.writeFileSync(path.join(OUT, 'frames', name + '.jpg'), Buffer.from(d.split(',')[1], 'base64')); event('frame_saved', { name }); }
      else event('frame_failed', { name, d: d.slice(0, 100) });
      return;
    }
    await sleep(1000);
  }
  event('frame_timeout', { name });
}

// HUD 座標 → 画面のピクセル (WebView は全画面・横向き)
async function buttonPx(id) {
  const p = await ev(`(() => { const G = window.__sw.G, b = G.buttons.find((q) => q.id === ${JSON.stringify(id)}); if (!b) return null; const a = G.gfx.aspect; return [((b.x / a) + 1) / 2 * innerWidth, (1 - b.y) / 2 * innerHeight]; })()`);
  return p && [Math.round(p[0] * dpr), Math.round(p[1] * dpr)];
}
async function tapButton(id) {
  const p = await buttonPx(id);
  if (!p) return false;
  await sh(`input tap ${p[0]} ${p[1]}`);
  return true;
}
const W = () => Math.round(cssW * dpr), H = () => Math.round(cssH * dpr);
const state = async () => ev('window.__sw.G.state');
async function waitState(st, ms) { const t = Date.now(); while (Date.now() - t < ms) { if (await state() === st) return true; await sleep(1500); } return false; }
const setAuto = (on, inv) => ev(`(() => { const G = window.__sw.G; G.auto = ${!!on}; G.soakInv = ${!!inv}; if (!window.__invLoop) { window.__invLoop = setInterval(() => { if (G.soakInv && G.state === 'play') { G.invuln = Math.max(G.invuln || 0, 1); G.shield = Math.max(G.shield, 40); } }, 500); } })()`);
async function toTitle() {
  for (let i = 0; i < 6; i++) {
    const s = await state();
    if (s === 'title') return;
    if (s === 'play') { await sh('input keyevent KEYCODE_BACK'); await sleep(2500); }
    if (!(await tapButton('quit')) && !(await tapButton('title'))) await sh('input keyevent KEYCODE_BACK');
    await sleep(3000);
  }
}
async function ensurePlay(idx = 0) {
  if (await state() === 'play') return;
  await toTitle(); await sleep(1500);
  if (await ev('window.__sw.G.titleReady') === false) { await sh(`input tap ${W() >> 1} ${H() >> 1}`); await sleep(4000); await sh(`input tap ${W() >> 1} ${H() >> 1}`); await sleep(3000); }
  if (idx === 0) await tapButton('start');
  else { await ev('window.__sw.G.save.reached = 4'); await sleep(1500); await tapButton('s' + (idx + 1)); }
  await waitState('play', 20000);
}

// ---------------------------------------------------------------- 計測
let lastFrames = 0, lastT = 0, lastSt = null, stuckFor = 0, curScenario = 'boot';
async function sample() {
  const m = await ev(`(() => { const G = window.__sw.G, g = G.gfx;
    const fin = [G.px, G.py, G.score, G.shield, G.V, G.st].every((v) => v === undefined || Number.isFinite(v));
    const errs = window.__soakErrors.splice(0);
    return { state: G.state, stage: G.stageIdx + 1, st: +(G.st || 0).toFixed(1), boss: G.bossState, score: Math.round(G.score || 0), shield: Math.round(G.shield || 0),
      cpu: +(G.cpu || 0).toFixed(2), scale: +g.scale.toFixed(2), res: g.W + 'x' + g.H, heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
      enemies: G.enemies.length, ebul: G.ebul.length, missiles: G.missiles.length, pickups: G.pickups.length, audio: G.audio.ctx ? G.audio.ctx.state : 'none',
      glLost: !!G.glLost, finite: fin, frames: window.__frames, lastError: window.__lastError || null, errs, hidden: document.hidden, w: innerWidth, h: innerHeight }; })()`);
  if (!m) return null;
  const t = now();
  m.fps = lastT ? +((m.frames - lastFrames) / Math.max(0.001, t - lastT)).toFixed(2) : null;
  lastFrames = m.frames; lastT = t;
  if (m.state === 'play' && lastSt !== null && m.st === lastSt && !m.hidden) stuckFor += 20; else stuckFor = 0;
  lastSt = m.state === 'play' ? m.st : null;
  m.stuckSec = stuckFor; m.scenario = curScenario; m.t = +t.toFixed(1);
  metricsFile.write(JSON.stringify(m) + '\n');
  if (m.lastError) { event('js_lastError', { text: m.lastError.slice(0, 300) }); await ev('window.__lastError = null'); }
  for (const e of m.errs) event('js_error', { text: e.slice(0, 300) });
  if (!m.finite) event('nan_detected', { state: m.state, stage: m.stage });
  if (stuckFor >= 120) event('stuck', { st: m.st, state: m.state });
  return m;
}
async function deviceStats() {
  const mi = await sh(`dumpsys meminfo ${PKG} | grep -E "TOTAL PSS|TOTAL:"`);
  const pss = (mi.out.match(/TOTAL PSS:\s+(\d+)/) || mi.out.match(/TOTAL:\s+(\d+)/) || [])[1];
  const lc = await adb('logcat', '-d', '-v', 'time', '-s', 'WIRED:*', 'AndroidRuntime:E', 'ActivityManager:E', 'chromium:E', 'DEBUG:*');
  await adb('logcat', '-c');
  const lines = lc.out.split('\n').filter((l) => /WIRED|FATAL|ANR|crash|Exception|E\/chromium/.test(l) && !/beginning of/.test(l));
  for (const l of lines.slice(0, 20)) event('logcat', { line: l.trim().slice(0, 300) });
  const top = await sh(`dumpsys activity activities | grep -E "mResumedActivity|topResumedActivity" | head -1`);
  const d = { t: +now().toFixed(1), kind: 'device', pssMB: pss ? +(pss / 1024).toFixed(1) : null, logcatIssues: lines.length, top: top.out.trim().slice(0, 160) };
  eventsFile.write(JSON.stringify(d) + '\n');
  return d;
}

// ---------------------------------------------------------------- シナリオ
async function runScenario(name, endAt) {
  curScenario = name;
  event('scenario_start', { name });
  const stats = { name, actions: 0 };
  try {
    if (name === 'campaign') {
      await setAuto(true, true); await ensurePlay(0); await setAuto(true, true);
      while (now() < endAt) {
        const s = await state();
        if (s === 'clear') { await sleep(3000); await tapButton('next'); stats.actions++; event('stage_clear'); }
        else if (s === 'ending') { const ct = await ev('window.__sw.G.cine ? window.__sw.G.cine.t : 0'); if (ct > 26) { event('ending_reached'); await tapButton('title'); stats.actions++; } else await sh('input keyevent KEYCODE_BACK'); }
        else if (s === 'title') await tapButton('start');
        else if (s === 'over') await tapButton('retry');
        else if (s === 'pause') await tapButton('resume');
        await setAuto(true, true);
        await sleep(5000);
      }
    } else if (name === 'monkey') {
      await setAuto(false, true); await ensurePlay((Math.random() * 4) | 0); await setAuto(false, true);
      while (now() < endAt) {
        const r = Math.random(), w = W(), h = H();
        if (r < 0.3) await sh(`input swipe ${Math.round(rnd(60, w * 0.45))} ${Math.round(rnd(h * 0.3, h - 60))} ${Math.round(rnd(60, w * 0.45))} ${Math.round(rnd(h * 0.3, h - 60))} ${Math.round(rnd(300, 1200))}`);
        else if (r < 0.55) { const x = Math.round(rnd(w * 0.55, w - 60)), y = Math.round(rnd(60, h - 60)); await sh(`input swipe ${x} ${y} ${x + Math.round(rnd(-300, 300))} ${y + Math.round(rnd(-200, 200))} ${Math.round(rnd(800, 2500))}`); }
        else if (r < 0.75) await sh(`input tap ${Math.round(rnd(20, w - 20))} ${Math.round(rnd(20, h - 20))}`);
        else { const ids = (await ev('window.__sw.G.buttons.map((b) => b.id)')) || []; if (ids.length) { const id = pick(ids); await tapButton(id); event('monkey_button', { id }); } }
        stats.actions++;
        const s = await state();
        if (s === 'title' && Math.random() < 0.4) await tapButton('start');
        if (s === 'pause' && Math.random() < 0.5) await tapButton('resume');
        await sleep(rnd(300, 1500));
      }
    } else if (name === 'back_key') {
      await setAuto(true, true); await ensurePlay((Math.random() * 4) | 0); await setAuto(true, true);
      while (now() < endAt) {
        const before = await state();
        await sh('input keyevent KEYCODE_BACK');
        await sleep(2500);
        const after = await state();
        event('back_key', { before, after });
        stats.actions++;
        // 戻るでアプリが閉じた (タイトルで戻る → 終了) ら再起動
        const top = await sh('dumpsys activity activities | grep -E "mResumedActivity|topResumedActivity" | head -1');
        if (!top.out.includes(PKG)) { event('app_closed_by_back'); await sh(`am start -n ${PKG}/.MainActivity`); await sleep(15000); c = null; await attach(); }
        const s = await state();
        if (s === 'pause' && Math.random() < 0.6) await tapButton('resume');
        if (s === 'title' && Math.random() < 0.7) await ensurePlay((Math.random() * 4) | 0);
        await setAuto(true, true);
        await sleep(rnd(3000, 8000));
      }
    } else if (name === 'lifecycle') {
      await setAuto(true, true); await ensurePlay((Math.random() * 4) | 0); await setAuto(true, true);
      while (now() < endAt) {
        await sh('input keyevent KEYCODE_HOME');
        await sleep(rnd(5000, 20000));
        const bg = await ev('({ hidden: document.hidden, state: window.__sw.G.state, audio: window.__sw.G.audio.ctx && window.__sw.G.audio.ctx.state })');
        await sh(`am start -n ${PKG}/.MainActivity`);
        await sleep(8000);
        if (!c) await attach();
        const fg = await ev('({ hidden: document.hidden, state: window.__sw.G.state, audio: window.__sw.G.audio.ctx && window.__sw.G.audio.ctx.state })');
        event('lifecycle', { background: bg, foreground: fg });
        stats.actions++;
        if (fg && fg.state === 'pause') await tapButton('resume');
        await setAuto(true, true);
        await sleep(rnd(10000, 20000));
      }
    } else if (name === 'rotation') {
      await setAuto(true, true); await ensurePlay((Math.random() * 4) | 0); await setAuto(true, true);
      await sh('settings put system accelerometer_rotation 0');
      let rot = 1;
      while (now() < endAt) {
        rot = rot === 1 ? 3 : 1;
        await sh(`settings put system user_rotation ${rot}`);
        await sleep(6000);
        const sz = await ev('[innerWidth, innerHeight, window.__sw.G.gfx.W, window.__sw.G.gfx.H, window.__sw.G.state]');
        event('rotation', { rot, size: sz });
        stats.actions++;
        if (sz && sz[0] < sz[1]) event('portrait_detected', { size: sz });
        await sleep(rnd(8000, 15000));
      }
      await sh('settings put system user_rotation 1');
    } else if (name === 'options') {
      await toTitle(); await sleep(2000);
      while (now() < endAt) {
        if (await ev('window.__sw.G.titleReady') === false) { await sh(`input tap ${W() >> 1} ${H() >> 1}`); await sleep(5000); }
        await tapButton('options'); await sleep(2000);
        for (let k = 0; k < 14 && now() < endAt; k++) { await tapButton(pick(['music', 'sfx', 'vib', 'diff', 'gfx', 'aim', 'lefty'])); stats.actions++; await sleep(1200); }
        await tapButton('back'); await sleep(2000);
        await tapButton('start'); await waitState('play', 15000); await setAuto(true, true);
        await sleep(rnd(30000, 50000));
        await toTitle(); await sleep(2000);
      }
      await ev(`(() => { const G = window.__sw.G; Object.assign(G.settings, { music: 0.7, sfx: 0.9, vib: true, diff: 1, gfx: 0, aim: 1, lefty: false }); G.diff = 1; })()`);
    } else if (name === 'retry_loop') {
      await setAuto(false, false); await ensurePlay((Math.random() * 4) | 0); await setAuto(false, false);
      while (now() < endAt) {
        const s = await state();
        if (s === 'over') { event('game_over'); await sleep(3000); await tapButton('retry'); stats.actions++; await setAuto(false, false); }
        else if (s !== 'play') { await ensurePlay((Math.random() * 4) | 0); await setAuto(false, false); }
        await sleep(5000);
      }
    } else if (name === 'context_loss') {
      await setAuto(true, true); await ensurePlay((Math.random() * 4) | 0); await setAuto(true, true);
      while (now() < endAt) {
        const r = await ev(`(async () => { const cv = document.getElementById('c'); const gl = cv.getContext('webgl'); const ext = gl && gl.getExtension('WEBGL_lose_context'); if (!ext) return 'no_ext';
          ext.loseContext(); await new Promise((r) => setTimeout(r, 3000)); ext.restoreContext(); await new Promise((r) => setTimeout(r, 5000));
          return window.__sw.G.glLost ? 'still_lost' : 'restored'; })()`);
        event('context_loss', { result: r });
        stats.actions++;
        await sleep(3000);
        if (await state() === 'pause') await tapButton('resume');
        await sleep(rnd(30000, 50000));
      }
    }
  } catch (e) {
    event('scenario_error', { name, err: String(e && e.stack || e).slice(0, 300) });
  }
  await setAuto(true, true);
  await grab(`${String(Math.round(now())).padStart(5, '0')}_${name}`);
  event('scenario_end', stats);
  return stats;
}

const history = [];
const rotation = Object.keys(SCENARIOS);
async function chooseNext(recent) {
  if (!LLM) return { scenario: rotation[history.length % rotation.length], reason: 'rotation', by: 'rotation' };
  const prompt = `あなたはゲームの品質保証エンジニアです。Android 向けシューティングゲーム "WIRED" を Android エミュレータ上で 1 時間の自動テストにかけています。
次に実行するテストシナリオを 1 つ選んでください。まだ実行していないもの、問題が見つかった領域を優先します。
シナリオ一覧:
${Object.entries(SCENARIOS).map(([k, v]) => `- ${k}: ${v}`).join('\n')}
これまでに実行したシナリオ: ${history.map((h) => h.name).join(', ') || 'なし'}
直近の計測: ${JSON.stringify(recent)}
JSON だけで答えてください: {"scenario": "<名前>", "reason": "<日本語で短く>"}`;
  try {
    const res = await fetch(LLM + '/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], temperature: 0.3, max_tokens: 160, response_format: { type: 'json_object' } }) });
    const j = await res.json(); const txt = j.choices[0].message.content;
    const m = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1));
    if (!SCENARIOS[m.scenario]) throw new Error('unknown scenario ' + m.scenario);
    event('llm_choice', m);
    return { scenario: m.scenario, reason: m.reason, by: 'llm' };
  } catch (e) {
    event('llm_choice_failed', { err: String(e).slice(0, 200) });
    return { scenario: rotation[history.length % rotation.length], reason: 'fallback', by: 'fallback' };
  }
}

async function main() {
  await adb('logcat', '-c');
  await sh('settings put system accelerometer_rotation 0'); await sh('settings put system user_rotation 1');
  await sh(`am start -n ${PKG}/.MainActivity`);
  await sleep(10000);
  if (!(await attach())) process.exit(1);
  await grab('00000_boot');
  let sampling = true;
  (async () => { while (sampling) { if (c) await sample(); await sleep(20000); } })();
  (async () => { while (sampling) { await deviceStats(); await sleep(120000); } })();
  const END = MINUTES * 60;
  let recent = {};
  while (now() < END - 60) {
    const ch = await chooseNext(recent);
    const endAt = Math.min(END, now() + SEGMENT * 60);
    const st = await runScenario(ch.scenario, endAt);
    history.push({ name: ch.scenario, by: ch.by, reason: ch.reason, actions: st.actions, at: +now().toFixed(0) });
    recent = (await sample()) || {};
  }
  sampling = false;
  const dev = await deviceStats();
  const final = await sample();
  await grab('99999_final');
  fs.writeFileSync(path.join(OUT, 'history.json'), JSON.stringify(history, null, 1));
  event('finished', { minutes: MINUTES, scenarios: history.length, final, device: dev });
  metricsFile.end(); eventsFile.end();
  setTimeout(() => process.exit(0), 1000);
}
main().catch((e) => { event('harness_crash', { err: String(e.stack || e).slice(0, 500) }); process.exit(1); });
