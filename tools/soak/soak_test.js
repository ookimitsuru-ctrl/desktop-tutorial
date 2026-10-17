// 長時間の動作テスト (ソークテスト)
//  実時間でゲームを動かし続け、シナリオ (通しプレイ・タッチ連打・ポーズ連打・画面回転・
//  WebGL コンテキスト喪失・設定変更・わざと被弾してリトライ…) を切り替えながら、
//  5 秒ごとに状態・FPS・メモリ・配列の大きさ・エラーを記録する。
//  --llm を指定すると、次のシナリオの選択をローカル LLM (llama.cpp の OpenAI 互換サーバ) に任せる。
//
// 使い方: node tools/soak/soak_test.js --minutes 60 --out <フォルダ> [--segment 4] [--llm http://127.0.0.1:8080]
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? a.concat([[v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]]) : a), []));
const MINUTES = +(args.minutes || 60);
const SEGMENT = +(args.segment || 4);          // 1 シナリオの長さ (分)
const OUT = args.out || '/tmp/soak';
const LLM = args.llm || null;
const VW = 960, VH = 540;
fs.mkdirSync(OUT, { recursive: true });
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
  if (kind !== 'metric') console.log(`[${e.t.toFixed(0).padStart(5)}s] ${kind} ${JSON.stringify(data).slice(0, 200)}`);
}

// ---------------------------------------------------------------- シナリオ
const SCENARIOS = {
  campaign: '自動操縦で 1 面から通しプレイ (クリア → NEXT STAGE → … → エンディング → タイトル)',
  stage_select: 'ランダムな面と難易度を選んで自動操縦でプレイ',
  monkey: '自動操縦なしで画面のランダムな位置をタッチ・ドラッグ・長押し・ボタン連打 (実際の入力経路)',
  pause_spam: 'プレイ中にポーズ/再開・戻るボタン・アプリの裏/表 (visibilitychange) を高速に繰り返す',
  resize: 'プレイ中に画面サイズ・縦横を切り替える (端末の回転やウィンドウ変更)',
  context_loss: 'プレイ中に WebGL コンテキストを失わせて復帰させる',
  options: 'オプション画面で全設定 (音量・振動・難易度・画質・エイム・左利き) を何周も切り替えてからプレイ',
  retry_loop: '無敵なし・自動操縦なしで撃墜される → MISSION FAILED → RETRY を繰り返す',
};

async function main() {
  const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const browser = await chromium.launch({
    executablePath: fs.existsSync(exe) ? exe : undefined,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--enable-precise-memory-info', '--js-flags=--expose-gc'],
  });
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') { errors.push({ t: now(), type: m.type(), text: m.text() }); event('console_' + m.type(), { text: m.text().slice(0, 300) }); } });
  page.on('pageerror', (e) => { errors.push({ t: now(), type: 'pageerror', text: e.message }); event('pageerror', { text: e.message.slice(0, 300) }); });
  page.on('crash', () => event('page_crash'));
  // 実際の描画フレーム数を数える (rAF をフック)
  await page.addInitScript(() => {
    window.__frames = 0;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => raf((t) => { window.__frames++; cb(t); });
  });
  await page.goto('file://' + path.resolve(__dirname, '../../game/dist/index.html'));
  await sleep(1500);

  const ev = (fn, a) => page.evaluate(fn, a);
  // HUD ボタンを実際のポインタでクリック (ボタンの位置は G.buttons から求める)
  const clickButton = async (id) => {
    const p = await ev((id) => {
      const G = window.__sw.G, b = G.buttons.find((q) => q.id === id);
      if (!b) return null;
      const a = G.gfx.aspect;
      return [((b.x / a) + 1) / 2 * innerWidth, (1 - b.y) / 2 * innerHeight];
    }, id);
    if (!p) return false;
    await page.mouse.click(p[0], p[1]);
    return true;
  };
  const state = () => ev(() => window.__sw.G.state);
  const waitState = async (st, ms) => { const t = Date.now(); while (Date.now() - t < ms) { if (await state() === st) return true; await sleep(250); } return false; };

  // 起動: タッチで接続 → OP をタップで飛ばす
  await page.mouse.click(VW / 2, VH / 2); await sleep(800);
  await page.mouse.click(VW / 2, VH / 2); await sleep(1500);
  event('boot', { state: await state() });

  // ---- 計測 (5 秒ごと)
  let lastFrames = 0, lastT = now(), lastSt = null, stuckFor = 0;
  const sample = async (scenario) => {
    const m = await ev(() => {
      const G = window.__sw.G, g = G.gfx;
      const fin = [G.px, G.py, G.score, G.shield, G.V, G.st].every((v) => v === undefined || Number.isFinite(v));
      return {
        state: G.state, stage: G.stageIdx + 1, st: +(G.st || 0).toFixed(1), boss: G.bossState, score: Math.round(G.score || 0), shield: Math.round(G.shield || 0),
        cpu: +(G.cpu || 0).toFixed(2), lines: g.lineCount, scale: +g.scale.toFixed(2), res: g.W + 'x' + g.H,
        heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
        enemies: G.enemies.length, ebul: G.ebul.length, missiles: G.missiles.length, lasers: G.lasers.length, pickups: G.pickups.length, locks: G.locks.length,
        audio: G.audio.ctx ? G.audio.ctx.state : 'none', glLost: !!G.glLost, finite: fin, frames: window.__frames, lastError: window.__lastError || null, diff: G.diff,
      };
    });
    const t = now();
    m.fps = +((m.frames - lastFrames) / Math.max(0.001, t - lastT)).toFixed(1);
    lastFrames = m.frames; lastT = t;
    // 進行が止まっていないか (プレイ中なのにステージ時刻が進まない)
    if (m.state === 'play' && lastSt !== null && m.st === lastSt) stuckFor += 5; else stuckFor = 0;
    lastSt = m.state === 'play' ? m.st : null;
    m.stuckSec = stuckFor;
    m.scenario = scenario;
    m.t = +t.toFixed(1);
    metricsFile.write(JSON.stringify(m) + '\n');
    if (m.lastError) { event('lastError', { text: m.lastError.slice(0, 300) }); await ev(() => { window.__lastError = null; }); }
    if (!m.finite) event('nan_detected', m);
    if (stuckFor >= 30) event('stuck', { st: m.st, state: m.state });
    return m;
  };
  let curScenario = 'boot';
  let sampling = true;
  (async () => { while (sampling) { try { await sample(curScenario); } catch (e) { event('sample_failed', { err: String(e).slice(0, 200) }); } await sleep(5000); } })();

  // ---- 各シナリオ
  const autoOn = (on, inv = true) => ev(([on, inv]) => { const G = window.__sw.G; G.auto = on; G.soakInv = inv; }, [on, inv]);
  // 無敵 (自動操縦のテスト中に撃墜で止まらないように) — 毎フレームではなく 0.5 秒ごとに補充
  (async () => { while (sampling) { try { await ev(() => { const G = window.__sw.G; if (G.soakInv && G.state === 'play') { G.invuln = Math.max(G.invuln || 0, 1); G.shield = Math.max(G.shield, 40); } }); } catch (_) {} await sleep(500); } })();
  const toTitle = async () => {
    for (let i = 0; i < 6; i++) {
      const s = await state();
      if (s === 'title') return;
      if (s === 'play') { await ev(() => window.__onBack()); await sleep(300); }
      if (!(await clickButton('quit')) && !(await clickButton('title'))) await ev(() => window.__onBack());
      await sleep(600);
    }
    await ev(() => window.__sw.setState('title'));
  };
  const ensurePlay = async (idx = 0) => {
    if (await state() === 'play') return;
    await toTitle(); await sleep(400);
    if (idx === 0) await clickButton('start'); else await ev((i) => { window.__sw.G.save.reached = 4; }, idx);
    if (idx > 0) { await sleep(300); await clickButton('s' + (idx + 1)); }
    await waitState('play', 4000);
  };

  async function runScenario(name, endAt) {
    curScenario = name;
    event('scenario_start', { name });
    const stats = { name, actions: 0 };
    try {
      if (name === 'campaign') {
        await autoOn(true); await ensurePlay(0); await autoOn(true);
        while (now() < endAt) {
          const s = await state();
          if (s === 'clear') { await sleep(1200); await clickButton('next'); stats.actions++; event('stage_clear', {}); }
          else if (s === 'ending') { const ct = await ev(() => window.__sw.G.cine.t); if (ct > 27) { event('ending_reached', {}); await clickButton('title'); await sleep(800); await clickButton('start'); stats.actions++; } }
          else if (s === 'title') { await clickButton('start'); }
          else if (s === 'over') { await clickButton('retry'); }
          else if (s === 'pause') { await clickButton('resume'); }
          await autoOn(true);
          await sleep(1000);
        }
      } else if (name === 'stage_select') {
        while (now() < endAt) {
          const idx = (Math.random() * 4) | 0, diff = (Math.random() * 3) | 0;
          await toTitle(); await ev(([d]) => { const G = window.__sw.G; G.settings.diff = d; G.diff = d; G.save.reached = 4; }, [diff]);
          await sleep(500); await clickButton('s' + (idx + 1)); await waitState('play', 3000); await autoOn(true);
          event('stage_select', { stage: idx + 1, diff });
          const until = Math.min(endAt, now() + rnd(40, 90));
          while (now() < until) { const s = await state(); if (s === 'clear' || s === 'ending') break; await sleep(1000); }
          stats.actions++;
        }
      } else if (name === 'monkey') {
        await autoOn(false, true); await ensurePlay((Math.random() * 4) | 0); await autoOn(false, true);
        while (now() < endAt) {
          const r = Math.random();
          if (r < 0.3) { // 左半分をドラッグ (移動)
            const x0 = rnd(40, VW * 0.45), y0 = rnd(VH * 0.3, VH - 30);
            await page.mouse.move(x0, y0); await page.mouse.down();
            for (let k = 0; k < 6; k++) await page.mouse.move(x0 + rnd(-120, 120), y0 + rnd(-90, 90), { steps: 3 });
            await page.mouse.up();
          } else if (r < 0.55) { // 右半分を長押し → ドラッグ (ロックオン) → 離す
            const x0 = rnd(VW * 0.55, VW - 40), y0 = rnd(40, VH - 40);
            await page.mouse.move(x0, y0); await page.mouse.down();
            for (let k = 0; k < 8; k++) { await page.mouse.move(x0 + rnd(-200, 200), y0 + rnd(-120, 120), { steps: 4 }); await sleep(60); }
            await page.mouse.up();
          } else if (r < 0.7) { // 右半分をちょん押し (レーザー)
            await page.mouse.click(rnd(VW * 0.55, VW - 40), rnd(40, VH - 40));
          } else if (r < 0.8) { // タッチ (複数指)
            await page.touchscreen.tap(rnd(20, VW - 20), rnd(20, VH - 20));
          } else if (r < 0.9) { // 表示中のボタンを適当に押す
            const ids = await ev(() => window.__sw.G.buttons.map((b) => b.id));
            if (ids.length) { const id = pick(ids); await clickButton(id); event('monkey_button', { id }); }
          } else { // キーボード
            await page.keyboard.press(pick(['Space', 'KeyF', 'KeyP', 'Enter', 'ArrowLeft', 'ArrowUp', 'Escape']));
          }
          stats.actions++;
          const s = await state();
          if (s === 'title' && Math.random() < 0.3) await clickButton('start');
          await sleep(rnd(50, 300));
        }
      } else if (name === 'pause_spam') {
        await autoOn(true); await ensurePlay((Math.random() * 4) | 0); await autoOn(true);
        while (now() < endAt) {
          const r = Math.random();
          if (r < 0.35) { await clickButton('pause'); await sleep(rnd(50, 400)); await clickButton('resume'); }
          else if (r < 0.6) { await ev(() => window.__onBack()); await sleep(rnd(50, 300)); await ev(() => window.__onBack()); }
          else if (r < 0.85) { // アプリの裏/表
            await ev(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
            await sleep(rnd(100, 1500));
            await ev(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
            await sleep(200);
            if (await state() === 'pause') await clickButton('resume');
          } else { await page.keyboard.press('KeyP'); await sleep(200); await page.keyboard.press('KeyP'); }
          stats.actions++;
          const s = await state();
          if (s !== 'play' && s !== 'pause') await ensurePlay((Math.random() * 4) | 0);
          await autoOn(true);
          await sleep(rnd(300, 1500));
        }
      } else if (name === 'resize') {
        await autoOn(true); await ensurePlay((Math.random() * 4) | 0); await autoOn(true);
        const sizes = [[960, 540], [1280, 720], [800, 360], [2400 / 2, 1080 / 2], [540, 960], [1920 / 2, 1200 / 2], [640, 300]];
        while (now() < endAt) {
          const [w, h] = pick(sizes);
          await page.setViewportSize({ width: Math.round(w), height: Math.round(h) });
          await ev(() => window.dispatchEvent(new Event('orientationchange')));
          event('resize', { w, h });
          stats.actions++;
          await sleep(rnd(1500, 5000));
          if (await state() !== 'play') await ensurePlay((Math.random() * 4) | 0);
        }
        await page.setViewportSize({ width: VW, height: VH });
      } else if (name === 'context_loss') {
        await autoOn(true); await ensurePlay((Math.random() * 4) | 0); await autoOn(true);
        while (now() < endAt) {
          const ok = await ev(async () => {
            const c = document.getElementById('c');
            const gl = c.getContext('webgl'); const ext = gl && gl.getExtension('WEBGL_lose_context');
            if (!ext) return 'no_ext';
            ext.loseContext();
            await new Promise((r) => setTimeout(r, 800));
            ext.restoreContext();
            await new Promise((r) => setTimeout(r, 800));
            return window.__sw.G.glLost ? 'still_lost' : 'restored';
          });
          event('context_loss', { result: ok });
          stats.actions++;
          await sleep(1000);
          if (await state() === 'pause') await clickButton('resume');
          await sleep(rnd(8000, 15000));
          if (await state() !== 'play') await ensurePlay((Math.random() * 4) | 0);
        }
      } else if (name === 'options') {
        await toTitle(); await sleep(500);
        while (now() < endAt) {
          await clickButton('options'); await sleep(300);
          for (let k = 0; k < 30 && now() < endAt; k++) { await clickButton(pick(['music', 'sfx', 'vib', 'diff', 'gfx', 'aim', 'lefty'])); stats.actions++; await sleep(rnd(80, 250)); }
          await clickButton('back'); await sleep(300);
          await clickButton('start'); await waitState('play', 3000); await autoOn(true);
          await sleep(rnd(15000, 30000));
          await toTitle(); await sleep(400);
        }
        // 設定を初期値へ戻す
        await ev(() => { const G = window.__sw.G; Object.assign(G.settings, { music: 0.7, sfx: 0.9, vib: true, diff: 1, gfx: 0, aim: 1, lefty: false }); G.diff = 1; });
      } else if (name === 'retry_loop') {
        await autoOn(false, false); await ensurePlay((Math.random() * 4) | 0); await autoOn(false, false);
        while (now() < endAt) {
          const s = await state();
          if (s === 'over') { event('game_over', {}); await sleep(800); await clickButton('retry'); stats.actions++; await autoOn(false, false); }
          else if (s !== 'play') { await ensurePlay((Math.random() * 4) | 0); await autoOn(false, false); }
          await sleep(1000);
        }
      }
    } catch (e) {
      event('scenario_error', { name, err: String(e).slice(0, 300) });
    }
    await autoOn(true, true);
    event('scenario_end', stats);
    return stats;
  }

  // ---- シナリオ選択 (LLM またはローテーション)
  const history = [];
  const rotation = Object.keys(SCENARIOS);
  async function chooseNext(recent) {
    if (!LLM) return { scenario: rotation[history.length % rotation.length], reason: 'rotation', by: 'rotation' };
    const done = history.map((h) => h.name);
    const prompt = `あなたはゲームの品質保証エンジニアです。Android 向けシューティングゲーム "WIRED" を 1 時間の自動テストで検証しています。
次に実行するテストシナリオを 1 つ選んでください。まだ実行していないもの、問題が見つかった領域、長時間で効いてくる問題 (メモリ増加など) を優先します。

シナリオ一覧:
${Object.entries(SCENARIOS).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

これまでに実行したシナリオ: ${done.join(', ') || 'なし'}
直近の計測: ${JSON.stringify(recent)}

JSON だけで答えてください: {"scenario": "<名前>", "reason": "<日本語で短く>"}`;
    const t0 = now();
    try {
      const res = await fetch(LLM + '/v1/chat/completions', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], temperature: 0.3, max_tokens: 160, response_format: { type: 'json_object' } }),
      });
      const j = await res.json();
      const txt = j.choices[0].message.content;
      const m = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1));
      if (!SCENARIOS[m.scenario]) throw new Error('unknown scenario ' + m.scenario);
      event('llm_choice', { scenario: m.scenario, reason: m.reason, sec: +(now() - t0).toFixed(1) });
      return { scenario: m.scenario, reason: m.reason, by: 'llm' };
    } catch (e) {
      event('llm_choice_failed', { err: String(e).slice(0, 200), sec: +(now() - t0).toFixed(1) });
      return { scenario: rotation[history.length % rotation.length], reason: 'LLM の応答が使えなかったのでローテーション', by: 'fallback' };
    }
  }

  const END = MINUTES * 60;
  let recent = {};
  while (now() < END - 20) {
    const c = await chooseNext(recent);
    const endAt = Math.min(END, now() + SEGMENT * 60);
    const st = await runScenario(c.scenario, endAt);
    history.push({ name: c.scenario, by: c.by, reason: c.reason, actions: st.actions, at: +now().toFixed(0) });
    recent = await sample(c.scenario);
  }
  sampling = false;
  await sleep(500);
  const final = await sample('final');
  fs.writeFileSync(path.join(OUT, 'history.json'), JSON.stringify(history, null, 1));
  fs.writeFileSync(path.join(OUT, 'errors.json'), JSON.stringify(errors, null, 1));
  await page.screenshot({ path: path.join(OUT, 'final.png') });
  event('finished', { minutes: MINUTES, scenarios: history.length, errors: errors.length, final });
  await browser.close();
  metricsFile.end(); eventsFile.end();
}

main().catch((e) => { event('harness_crash', { err: String(e.stack || e).slice(0, 500) }); process.exit(1); });
