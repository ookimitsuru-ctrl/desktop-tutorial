// ============================================================
//  playtest.js  ローカル LLM がテスターになって Smart Run を遊ぶ長時間テスト
//    node test/playtest/playtest.js <出力フォルダ> [分=60] [LLM の URL=http://127.0.0.1:8080]
//  - ゲームはスマホ横画面 (Android WebView と同じ UA) で実時間で動かし, 入力は本物のタッチ (CDP) で送る
//  - LLM は「次に何を試すか」を選び, 前の結果がおかしくなかったかを判定する (JSON で答えさせる)
//  - 自動の見張り (probe.js) が JS エラー, NaN, 固まり, BGM, リーク, fps, メモリを記録する
//  出力: log.jsonl (判断と結果), report.json (集計), shots/*.png (異常の時と定期の画面)
// ============================================================
const { chromium } = require(process.env.PLAYWRIGHT || '/opt/node-tools/node_modules/playwright');
const fs = require('fs'), path = require('path');
const { ask } = require('./llm');

const OUT = process.argv[2] || 'playtest_out';
const MINUTES = +(process.argv[3] || 60);
const LLM = process.argv[4] || 'http://127.0.0.1:8080';
const GAME = 'file://' + path.resolve(__dirname, '../../app/src/main/assets/index.html');
const PROBE = fs.readFileSync(path.join(__dirname, 'probe.js'), 'utf8');
const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36';
const VIEW = { width: 915, height: 412 };   // Pixel 7 の横画面 (CSS px)

fs.mkdirSync(OUT + '/shots', { recursive: true });
const logf = fs.createWriteStream(OUT + '/log.jsonl');
function log(o) { o.wall = +((Date.now() - T0) / 1000).toFixed(1); logf.write(JSON.stringify(o) + '\n'); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
let T0 = Date.now();

// ---------- テスターが選べる動き ----------
const ACTIONS = {
  title: {
    start_easy: 'tap the EASY button (starts a race in EASY: brake assist, half traffic)',
    start_hard: 'tap the HARD button (starts a race in HARD)',
    toggle_sound: 'tap the SOUND ON/OFF button on the title screen',
    tap_random: 'tap a random spot on the title screen',
    wait: 'do nothing (watch the title demo)',
    back_button: 'press Android BACK (on title this exits the app; harness relaunches it)',
    relaunch_app: 'kill and relaunch the app (checks saved mode / hi-score / sound setting)',
    rotate_portrait: 'rotate the phone to portrait for some seconds, then back to landscape'
  },
  countdown: {
    wait: 'do nothing during the 3-2-1 countdown',
    hold_accel: 'hold the accelerator during the countdown (engine rev)',
    both_pedals: 'press brake and accelerator together',
    back_button: 'press Android BACK (pause)'
  },
  race: {
    drive_good: 'skilled driving: overtakes, brakes for sharp curves (use this a lot to make progress to later seasons and the goal)',
    drive_novice: 'beginner driving: accelerator always held, never brakes, small steering',
    full_throttle: 'never brake, keep lane',
    offroad_left: 'steer off the road to the left into trees/rocks',
    offroad_right: 'steer off the road to the right into trees/rocks',
    weave: 'zig-zag across all lanes',
    ram_car: 'aim at the car ahead and hit it',
    stop_idle: 'brake to a full stop and stay stopped',
    full_lock_left: 'hold the stick fully left with accelerator',
    full_lock_right: 'hold the stick fully right with accelerator',
    coast: 'release the pedals (engine braking), keep lane',
    both_pedals: 'drive while holding brake and accelerator together',
    floating_stick: 'drive using the floating stick (touch the right half away from the stick)',
    chaos_touch: 'many random multi-finger taps and drags all over the screen',
    pause_resume: 'press BACK to pause, wait, then tap to resume',
    pause_to_title: 'press BACK twice (pause, then back to title)',
    background_app: 'send the app to background (home button) for some seconds, then return and tap to resume',
    rotate_portrait: 'rotate to portrait for some seconds, then back'
  },
  timeup: { wait: 'do nothing', tap_screen: 'tap the screen', back_button: 'press Android BACK' },
  gameover: {
    tap_continue: 'tap to CONTINUE from the start of this season',
    wait_no_tap: 'do not tap (should return to title after ~10 s)',
    back_button: 'press Android BACK'
  },
  goal: { wait: 'watch the goal (fireworks, applause, victory music)', tap_screen: 'tap the screen (should be ignored here)', back_button: 'press Android BACK' },
  ending: { wait: 'watch the results screen', tap_screen: 'tap the screen (after 3 s it goes back to the title)', back_button: 'press Android BACK' },
  paused: { tap_screen: 'tap to resume', back_button: 'press BACK again (go to title)', wait: 'stay paused' }
};
const ALL = [...new Set(Object.values(ACTIONS).flatMap(o => Object.keys(o)))];
const DRIVE = new Set(['drive_good', 'drive_novice', 'full_throttle', 'offroad_left', 'offroad_right', 'weave', 'ram_car', 'stop_idle', 'full_lock_left', 'full_lock_right', 'coast', 'both_pedals', 'floating_stick', 'hold_accel']);

const SYSTEM = `You are a QA tester for "Smart Run", an OutRun-style pixel-art driving game for Android phones (landscape).
The course has 4 seasons in order: summer -> autumn -> winter -> spring, then the goal (fireworks, applause, victory music) and a results screen.
Controls: analog stick on the right, brake and accelerator pedals on the left. Hitting trees/rocks only scrapes and slows the car; hitting a car from behind makes it spin.
Modes: EASY (brake assist, half traffic, more time) and HARD. If time runs out you can CONTINUE from the start of the season within 10 s.
Expected music: title=title song, each season its own song, goal/results=victory, time up=silence.

Your job for this session is to find bugs: errors, freezes, stuck controls, wrong screen/state, wrong music, numbers out of range, performance drops, anything odd.
Each turn you get the current game state and the result of your previous action. Then you:
1) judge the previous result: "ok" or "bug" (only "bug" when something really looks wrong; explain in "note"),
2) choose the next action from the list for the current state, how many seconds to run it, and your intent.
Balance: spend about half of the race time on drive_good so the run reaches later seasons and the goal (coverage), and use the rest for edge cases. Prefer actions you have not tried yet; do not repeat the same edge case many times in a row.
Answer with JSON only.`;

const SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['ok', 'bug'] },
    note: { type: 'string' },
    action: { type: 'string', enum: ALL },
    seconds: { type: 'integer', minimum: 2, maximum: 60 },
    intent: { type: 'string' }
  },
  required: ['verdict', 'note', 'action', 'seconds', 'intent']
};

// ---------- ブラウザ ----------
let browser, ctx, page, cdp;
async function launch() {
  if (page) await page.close().catch(() => {});
  page = await ctx.newPage();
  page.on('pageerror', e => log({ kind: 'pageerror', msg: e.message }));
  page.on('crash', () => log({ kind: 'page-crash' }));
  await page.addInitScript(PROBE);
  await page.goto(GAME);
  cdp = await ctx.newCDPSession(page);
  touches.clear();
  await page.waitForFunction(() => window.G && G.Game && G.Game.state === 'title' && G.HUD && G.HUD.modeBtns, null, { timeout: 20000 });
}
async function snap() { return page.evaluate(() => PT.snap()); }

// ---------- タッチ (CDP で本物のタッチイベントを送る) ----------
const touches = new Map();   // 指 (STICK / ACC / BRK / 数字) -> {x, y, tid} (CSS px)
let nextId = 10;             // 置くたびに新しいタッチ ID (同じ ID で置き直すと, 指を動かしただけと扱われる)
let geo = null;              // 内部座標 → CSS px
function css(ix, iy) { return { x: ix / geo.W * geo.cw, y: iy / geo.H * geo.ch }; }
// CDP のタッチ: touchStart は置いた指, touchMove は動いた指, touchEnd は離した指だけを並べる
function tp(p) { return { x: p.x, y: p.y, id: p.tid, radiusX: 6, radiusY: 6, force: 1 }; }
async function sendTouch(type, p) { await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: [tp(p)] }); }
async function touchDown(id, p) { const t = { x: p.x, y: p.y, tid: nextId++ }; touches.set(id, t); await sendTouch('touchStart', t); }
async function touchMove(id, p) { const t = touches.get(id); if (!t) return touchDown(id, p); t.x = p.x; t.y = p.y; await sendTouch('touchMove', t); }
async function touchUp(id) { const t = touches.get(id); if (!t) return; touches.delete(id); await sendTouch('touchEnd', t); }
async function releaseAll() { for (const id of [...touches.keys()]) await touchUp(id); }
async function tap(ix, iy) { const id = 'tap'; const p = css(ix, iy); await touchDown(id, p); await sleep(60); await touchUp(id); }

// スティックとペダルを「こうしたい」状態に合わせる
const STICK = 1, ACC = 2, BRK = 3;
let stickFloat = false;
async function applyControl(c, s) {
  const L = s.layout;
  if (c.stick === null) await touchUp(STICK);
  else {
    if (touches.has(STICK) && stickFloat !== !!c.float) await touchUp(STICK);   // 指を置き直す
    stickFloat = !!c.float;
    const o = c.float ? { x: s.W * 0.66, y: s.H * 0.55 } : { x: L.stick.x, y: L.stick.y };
    if (!touches.has(STICK)) await touchDown(STICK, css(o.x, o.y));
    await touchMove(STICK, css(o.x + c.stick * L.stick.r, o.y));
  }
  const wantA = c.pedal === 'accel' || c.pedal === 'both', wantB = c.pedal === 'brake' || c.pedal === 'both';
  if (wantA && !touches.has(ACC)) await touchDown(ACC, css(L.accel.x + L.accel.w / 2, L.accel.y + L.accel.h / 2));
  if (!wantA) await touchUp(ACC);
  if (wantB && !touches.has(BRK)) await touchDown(BRK, css(L.brake.x + L.brake.w / 2, L.brake.y + L.brake.h / 2));
  if (!wantB) await touchUp(BRK);
}

// ---------- 1 つの動きを実行 ----------
let shotN = 0;
async function shot(tag) {
  const f = `${OUT}/shots/${String(++shotN).padStart(4, '0')}_${tag}.png`;
  await page.screenshot({ path: f }).catch(() => {});
  return path.basename(f);
}
async function setGeo() {
  const s = await snap();
  const vp = page.viewportSize();
  geo = { W: s.W, H: s.H, cw: vp.width, ch: vp.height };
  return s;
}
async function anom(type, detail) { await page.evaluate(([a, b]) => PT.anom(a, b), [type, detail]); }
async function backButton() {
  const r = await page.evaluate(() => (window.G && G.Game && G.Game.back) ? G.Game.back() : 'exit');
  if (r === 'exit') { log({ kind: 'app-exit' }); await sleep(1500); await launch(); await setGeo(); }
  if (r === 'pause') {   // ポーズになったら, タップするまでそのまま止まっているはず
    await sleep(400);
    const s = await snap();
    if (!s.paused) await anom('pause', 'BACK paused the game but it resumed by itself without a tap (state ' + s.state + ')');
  }
  if (r === 'title') { await sleep(400); const s = await snap(); if (s.state !== 'title' || s.paused) await anom('pause', 'BACK from pause did not reach a running title screen'); }
  return r;
}

async function drive(beh, sec, stop) {
  const end = Date.now() + sec * 1000;
  let lastT = Date.now();
  while (Date.now() < end) {
    const now = Date.now(), dt = (now - lastT) / 1000; lastT = now;
    const s = await setGeo();
    if (stop && stop(s)) break;
    if (s.paused || (s.state !== 'race' && s.state !== 'countdown')) { await releaseAll(); if (s.state !== 'countdown') break; }
    if (s.state === 'countdown' && beh !== 'hold_accel' && beh !== 'both_pedals') { await releaseAll(); await sleep(50); continue; }
    const c = await page.evaluate(([b, d]) => PT.control(b, d), [beh, dt]);
    await applyControl(c, s);
    await sleep(50);
  }
}

async function chaos(sec) {
  const end = Date.now() + sec * 1000;
  while (Date.now() < end) {
    const s = await setGeo();
    if (s.state !== 'race' && s.state !== 'countdown') break;
    const r = Math.random();
    const id = 'chaos' + Math.floor(Math.random() * 4);
    const p = css(Math.random() * s.W, Math.random() * s.H);
    if (touches.has(id) && r < 0.4) await touchUp(id);
    else if (touches.has(id)) await touchMove(id, p);
    else await touchDown(id, p);
    await sleep(30 + Math.random() * 120);
  }
  await releaseAll();
}

async function run(action, sec) {
  let s = await setGeo();
  switch (action) {
    case 'start_easy': case 'start_hard': {
      const b = s.modeBtns[action === 'start_easy' ? 'easy' : 'hard'];
      await tap(b.x + b.w / 2, b.y + b.h / 2); await sleep(500); break;
    }
    case 'toggle_sound': { const b = s.soundBtn; await tap(b.x + b.w / 2, b.y + b.h / 2); await sleep(Math.min(sec, 5) * 1000); break; }
    case 'tap_random': await tap(Math.random() * s.W, Math.random() * s.H); await sleep(1000); break;
    case 'tap_screen': case 'tap_continue': await tap(s.W / 2, s.H / 2); await sleep(Math.min(sec, 4) * 1000); break;
    case 'back_button': { const r = await backButton(); log({ kind: 'back', result: r }); await sleep(Math.min(sec, 4) * 1000); break; }
    case 'relaunch_app': await launch(); await setGeo(); await sleep(2000); break;
    case 'rotate_portrait': {
      await releaseAll();
      await page.setViewportSize({ width: VIEW.height, height: VIEW.width });
      await sleep(Math.min(sec, 8) * 1000);
      await page.setViewportSize(VIEW); await sleep(800); await setGeo();
      break;
    }
    case 'pause_resume': {
      await releaseAll(); await backButton(); await sleep(Math.min(sec, 6) * 1000);
      await tap(s.W / 2, s.H / 2); await sleep(800);
      { const s2 = await snap(); if (s2.paused) await anom('pause', 'tap did not resume from pause'); }
      break;
    }
    case 'pause_to_title': await releaseAll(); await backButton(); await sleep(1500); await backButton(); await sleep(2000); break;
    case 'background_app': {
      await releaseAll();
      // Android の onPause と同じ: ゲームをポーズして画面を隠す
      await page.evaluate(() => { G.Game.pause(true); Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
      await sleep(Math.min(sec, 15) * 1000);
      await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: false, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
      await sleep(800);
      { const s2 = await snap(); if (!s2.paused && ['race', 'countdown'].includes(s2.state)) await anom('pause', 'after returning from background the race resumed by itself without a tap'); }
      await tap(s.W / 2, s.H / 2); await sleep(800);
      { const s3 = await snap(); if (s3.paused) await anom('pause', 'tap did not resume after returning from background'); }
      break;
    }
    case 'chaos_touch': await chaos(Math.min(sec, 20)); break;
    case 'wait': case 'wait_no_tap': await releaseAll(); await sleep(sec * 1000); break;
    default:
      if (DRIVE.has(action)) await drive(action, sec);
      else { log({ kind: 'unknown-action', action }); await sleep(1000); }
  }
  await releaseAll();
}

// 結果の要約 (LLM に渡す)
function summarize(before, after, events, anomNew) {
  const ev = {};
  events.forEach(e => { const k = e.kind === 'state' ? `state:${e.from}->${e.to}` : e.kind; if (e.kind !== 'anomaly') ev[k] = (ev[k] || 0) + 1; });
  const lines = [];
  lines.push(`before: ${before.state}${before.paused ? '(paused)' : ''} ${before.kmh}km/h; after: ${after.state}${after.paused ? '(paused)' : ''} ${after.kmh}km/h x=${after.x} time=${after.time}`);
  if (Object.keys(ev).length) lines.push('events: ' + Object.entries(ev).map(([k, v]) => `${k} x${v}`).join(', '));
  lines.push(anomNew.length ? 'AUTOMATIC CHECKS FOUND: ' + anomNew.map(a => `${a.type}: ${a.detail}`).join('; ') : 'automatic checks: nothing new');
  return lines.join('\n');
}
function stateLine(s) {
  const SEAS = ['summer', 'autumn', 'winter', 'spring'];
  let t = `state=${s.paused ? 'paused (' + s.state + ')' : s.state} mode=${s.mode}`;
  if (['race', 'countdown', 'timeup', 'gameover', 'goal'].includes(s.state)) t += ` season=${SEAS[s.season]} speed=${s.kmh}km/h gear=${s.gear} rpm=${s.rpm} x=${s.x}${s.offroad ? ' (off road)' : ''} time_left=${s.time}s checkpoints_passed=${s.cp}/3 score=${s.score}`;
  if (s.state === 'title') t += ` hiscore=${s.hiscore} sound=${s.muted ? 'off' : 'on'}`;
  t += `\nmusic now=${s.music} (bus level ${s.musicRms}) audio=${s.audio} fps=${s.fps}`;
  return t;
}

(async () => {
  T0 = Date.now();
  browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--enable-precise-memory-info'] });
  ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA });
  await launch();
  await setGeo();
  const tried = {}, history = [];
  let prev = null, steps = 0, llmMs = 0, llmFail = 0, seenAnom = new Set();
  const deadline = T0 + MINUTES * 60000;
  let periodic = Date.now();

  while (Date.now() < deadline) {
    const s = await setGeo();
    const stKey = s.paused ? 'paused' : s.state;
    const menu = ACTIONS[stKey] || { wait: 'do nothing' };
    const cov = await page.evaluate(() => PT.stats);
    const prompt = [
      `Elapsed ${((Date.now() - T0) / 60000).toFixed(1)} of ${MINUTES} min. Step ${steps + 1}.`,
      'NOW: ' + stateLine(s),
      `Coverage so far: races started ${cov.races}, seasons reached [${Object.keys(cov.seasons).map(k => ['summer', 'autumn', 'winter', 'spring'][k]).join(', ')}], goals ${cov.goals}, time-ups ${cov.timeups}, continues ${cov.continues}.`,
      'Actions tried (count): ' + (Object.entries(tried).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'),
      prev ? `PREVIOUS ACTION: ${prev.action} for ${prev.seconds}s, intent "${prev.intent}".\nRESULT:\n${prev.result}` : 'PREVIOUS ACTION: none (session start). Use verdict "ok" and note "start".',
      'Recent actions: ' + history.slice(-6).join(' | '),
      'AVAILABLE ACTIONS NOW (state ' + stKey + '):\n' + Object.entries(menu).map(([k, v]) => `- ${k}: ${v}`).join('\n'),
      'Reply JSON: {"verdict":"ok|bug","note":"...","action":"<one of the available actions>","seconds":2-60,"intent":"..."}'
    ].join('\n');

    // LLM が考えている間もゲームは進むので, レース中は上手な運転を続けさせる
    const t1 = Date.now();
    const thinking = ask(LLM, SYSTEM, prompt, SCHEMA);
    let done = false; thinking.finally(() => { done = true; });
    while (!done) {
      const s2 = await setGeo();
      if (s2.state === 'race' && !s2.paused) await drive('drive_good', 0.5, () => done);
      else { await releaseAll(); await sleep(200); }
    }
    let d;
    try { d = await thinking; } catch (e) { d = null; llmFail++; log({ kind: 'llm-error', msg: String(e.message || e) }); }
    llmMs += Date.now() - t1;
    const sNow = await setGeo();
    const menuNow = ACTIONS[sNow.paused ? 'paused' : sNow.state] || { wait: 1 };
    if (!d || !menuNow[d.action]) {
      const fallback = sNow.state === 'race' && !sNow.paused ? 'drive_good' : Object.keys(menuNow)[0];
      log({ kind: 'llm-fallback', wanted: d && d.action, state: sNow.state, used: fallback });
      d = Object.assign({ verdict: 'ok', note: '', intent: 'fallback' }, d || {}, { action: fallback, seconds: (d && d.seconds) || 10 });
    }
    if (prev) log({ kind: 'verdict', step: steps, action: prev.action, verdict: d.verdict, note: d.note });
    if (prev && d.verdict === 'bug') log({ kind: 'llm-bug', step: steps, action: prev.action, note: d.note, result: prev.result, shot: await shot('llmbug') });

    // 実行
    const before = sNow;
    await page.evaluate(() => PT.drain());
    log({ kind: 'action', step: ++steps, state: before.state, paused: before.paused, action: d.action, seconds: d.seconds, intent: d.intent });
    await run(d.action, d.seconds);
    const after = await setGeo().catch(() => null);
    if (!after) { await launch(); continue; }
    const events = await page.evaluate(() => PT.drain());
    const anoms = await page.evaluate(() => PT.anoms);
    const anomNew = Object.entries(anoms).filter(([k]) => !seenAnom.has(k)).map(([k, a]) => (seenAnom.add(k), a));
    for (const a of anomNew) log({ kind: 'anomaly', step: steps, action: d.action, ...a, shot: await shot('anom_' + a.type) });
    const result = summarize(before, after, events, anomNew);
    log({ kind: 'result', step: steps, result, input: after.input });
    tried[d.action] = (tried[d.action] || 0) + 1;
    history.push(`${d.action}(${before.state})`);
    prev = { action: d.action, seconds: d.seconds, intent: d.intent, result };
    if (Date.now() - periodic > 300000) { periodic = Date.now(); await shot('periodic_' + after.state); }
  }

  // 集計
  const fin = await page.evaluate(() => ({ stats: PT.stats, anoms: PT.anoms, heap: PT.heap, fpsLow: PT.fpsLow.length, fpsLowSample: PT.fpsLow.slice(-20) }));
  const report = { minutes: MINUTES, steps, tried, llmAvgSec: +(llmMs / Math.max(1, steps) / 1000).toFixed(1), llmFail, ...fin };
  fs.writeFileSync(OUT + '/report.json', JSON.stringify(report, null, 1));
  log({ kind: 'end', steps });
  console.log(JSON.stringify({ steps, races: fin.stats.races, goals: fin.stats.goals, anomalies: Object.keys(fin.anoms).length }));
  await browser.close();
  logf.end();
})().catch(e => { console.error('FATAL', e); log({ kind: 'fatal', msg: String(e.stack || e) }); process.exit(1); });
