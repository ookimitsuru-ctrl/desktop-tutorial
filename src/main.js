// OK RACING エントリーポイント
import { buildTrack } from './track.js';
import { computeRacingLine, speedProfile, Driver } from './ai.js';
import { Session, DRIVERS, fmtTime, estimateQualiTime, TEAMS, WEATHERS } from './race.js';
import { buildReference } from './trainer.js';
import { Renderer } from './render.js';
import { Hud } from './hud.js';
import { Input, computeLayout } from './input.js';
import { GameAudio } from './audio.js';
import { UI, MODES } from './ui.js';
import { Store, DEFAULT_SETTINGS } from './storage.js';
import { tyreBaseMu, totalMass, TYRES } from './physics.js';

const canvas = document.getElementById('game');
const T = buildTrack();
const line = computeRacingLine(T);
const R = new Renderer(canvas, T, line);
const hud = new Hud();
let cfg = Store.settings();
const input = new Input(canvas, cfg);
const audio = new GameAudio();
const TYRE_IDS = ['soft', 'medium', 'hard', 'rain'];

let state = 'title';          // title | menu | drive | pause | results
let session = null, demo = null, demoDrv = null;
let lastOpts = null, layout = null, resultsTimer = 0, reviewT = 0, autoT = 0, lastReviewCtx = null;
let assistKey = '', menuStack = [];
let wakeLock = null;
// 60fps を目標とした自動負荷調整 (画質「自動」のとき): 解像度 → 描画品質の順に下げる
const perf = { dprCap: 2.5, low: false, acc: 0, n: 0, level: 0 };
const rcfg = () => (cfg.quality === 'auto' ? (perf.low ? { ...cfg, quality: 'low' } : cfg) : cfg);

// ---------------------------------------------------------------- 画面サイズ
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, cfg.quality === 'low' ? 1.5 : cfg.quality === 'high' ? 3 : perf.dprCap);
  R.resize(w, h, dpr);
  const cs = getComputedStyle(document.getElementById('safe'));
  const safe = { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
  layout = computeLayout(w, h, cfg, safe); input.layout = layout;
}
window.addEventListener('resize', resize); window.addEventListener('orientationchange', () => setTimeout(resize, 200));
resize();

// ---------------------------------------------------------------- デモ走行 (メニュー背景)
function startDemo() {
  demo = new Session(T, line, { mode: 'race', laps: 99, weather: 'dry', setup: 'mid', tyre: 'medium', difficulty: 'hard', damage: false, grid: DRIVERS.map((_, i) => i) });
  demo.env.noWear = true; demo.env.noFuel = true;
  demo.state = 'green'; demo.stateT = 10; demo.lightsOut = false;
  // グリッドではなくコース上に散らして配置
  demo.entries.forEach((e, k) => { e.started = true; });
  demoDrv = new Driver(demo.player.car, T, line, { skill: 0.9 });
  R.clearEffects(); R.cam.init = false;
}
function tickDemo(dt) {
  if (!demo) return;
  const pl = demo.player;
  demoDrv.update(1 / 60, demo.wet, demo.cars, {});
  demo.playerInput.throttle = pl.car.throttle; demo.playerInput.brake = pl.car.brake;
  pl.pitRequest = false;
  demo.update(dt); demo.events.length = 0;
}

// ---------------------------------------------------------------- セッション開始
function buildGrid(mode) {
  const idx = DRIVERS.map((_, i) => i).filter(i => !DRIVERS[i].player);
  const q = Store.quali();
  if (mode === 'quali' && q && q.grid && q.grid.length === DRIVERS.length) return q.grid.slice();
  // AI を予選想定タイム順に並べ、プレイヤーを指定位置へ
  idx.sort((a, b) => estimateQualiTime(DRIVERS[a], TEAMS[DRIVERS[a].team], cfg.difficulty, 0) - estimateQualiTime(DRIVERS[b], TEAMS[DRIVERS[b].team], cfg.difficulty, 0));
  const pos = mode === 'pole' ? 0 : mode === 'last' ? idx.length : 9;
  idx.splice(pos, 0, 0);
  return idx;
}
function startSession(mode, keep) {
  const l = Store.last();
  cfg = Store.settings(); input.cfg = cfg;
  const wetClass = l.weather === 'wet' || l.weather === 'damp';
  const opts = keep && lastOpts ? { ...lastOpts } : {
    mode, laps: l.laps, weather: l.weather, setup: l.setup, tyre: l.tyre, difficulty: cfg.difficulty,
    damage: cfg.damage, assist: cfg.assist, autoShift: cfg.autoShift, qualiLaps: 3,
    grid: mode === 'race' ? buildGrid(l.gridMode) : null,
  };
  if (opts.mode === 'ta') { const g = Store.loadGhost(wetClass); opts.ghost = g; opts.bestTrace = g ? g.trace : null; }
  else { opts.ghost = null; opts.bestTrace = null; }
  if (opts.mode === 'train') { // お手本ラップを (セッティング・タイヤ・路面ごとに) 用意する
    const W = WEATHERS[opts.weather] || WEATHERS.dry;
    opts.damage = false; opts.trainSection = Store.last().trainSec | 0;
    opts.reference = buildReference(T, line, { setup: opts.setup, tyre: opts.tyre, wet: W.wet });
  }
  lastOpts = opts;
  session = new Session(T, line, opts);
  session.gridPos = opts.grid ? opts.grid.indexOf(0) + 1 : 0;
  demo = null;
  hud.reset(); R.clearEffects(); R.cam.init = false; input.reset();
  input.showPit = opts.mode === 'race' || opts.mode === 'free';
  input.showReset = opts.mode !== 'train'; input.showRetry = input.showTrain = opts.mode === 'train'; input.enabled = true;
  assistKey = ''; updateAssist();
  ui.hide(); state = 'drive'; resultsTimer = 0; reviewT = 0; autoT = 0;
  audio.init();
  requestWake();
  if (opts.mode !== 'race' && opts.mode !== 'train') hud.message(MODES[opts.mode].name, '#ffb347', 2.2, true);
}
function updateAssist() {
  if (!session) return;
  const c = session.player.car, key = `${c.tyre.id}|${c.setup.id}|${Math.round(session.wet * 12)}`;
  if (key === assistKey) return; assistKey = key;
  const prof = speedProfile(T, line, { mu: tyreBaseMu(c.tyre, session.wet), use: 0.94, cla: c.setup.cla, cda: c.setup.cda, mass: totalMass(c), power: 1, brake: 0.8 });
  R.setAssist(prof);
}
async function requestWake() { try { if (navigator.wakeLock && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch (e) { /* 無視 */ } }
function goFullscreen() {
  const el = document.documentElement;
  try { const p = el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : el.webkitRequestFullscreen ? el.webkitRequestFullscreen() : null;
    if (p && p.then) p.then(() => { try { screen.orientation.lock('landscape').catch(() => {}); } catch (e) { /* 無視 */ } }).catch(() => {});
  } catch (e) { /* 無視 */ }
}

// ---------------------------------------------------------------- UI アクション
function toMenu() { session = null; state = 'menu'; audio.silence(); if (!demo) startDemo(); menuStack = []; ui.show('menu'); }
const ui = new UI(document.getElementById('ui'), {
  click() { audio.init(); audio.click(); },
  start() {
    audio.init(); audio.setVolume(cfg.volume);
    goFullscreen();
    state = 'menu'; ui.show('menu');
  },
  mode(m) { menuStack.push('menu'); ui.show('config', { mode: m }); },
  open(name) {
    if (name === 'settingsInGame') { ui.show('settings', { inGame: true }); return; }
    menuStack.push('menu'); ui.show(name);
  },
  back() { ui.show(menuStack.pop() || 'menu'); },
  pauseBack() { ui.show('pause', { mode: session.mode }); },
  go(m) { startSession(m); },
  resume() { resume(); },
  restart() { startSession(lastOpts.mode, true); },
  quit() { toMenu(); },
  toRace() { const l = Store.last(); l.gridMode = 'quali'; Store.saveLast(l); menuStack = ['menu']; session = null; state = 'menu'; audio.silence(); startDemo(); ui.show('config', { mode: 'race' }); },
  settingsChanged(s) { cfg = s; input.cfg = s; audio.setVolume(s.volume); resize(); if (session) { const c = session.player.car; c.assistTC = c.assistABS = !!s.assist; c.autoShift = !!s.autoShift; session.env.noDamage = !s.damage; } },
  optionChanged(k, v, ctx) {
    if (state === 'pause' && session && session.mode === 'train') { // トレーニング中のポーズ: 区間・セッティング・タイヤ・路面の変更
      const tr = session.trainer;
      if (k === 'trainSec') { tr.setSection(v); lastOpts.trainSection = v; tr.restart(); return; }
      if (k === 'setup') session.changeConfig(v, null); else if (k === 'tyre') session.changeConfig(null, v); else if (k === 'weather') session.setWeather(v); else return;
      const l = Store.last(); lastOpts[k] = v;
      tr.setReference(buildReference(T, line, { setup: l.setup, tyre: l.tyre, wet: session.wet })); tr.restart(); assistKey = ''; updateAssist();
      return;
    }
    if (state === 'pause' && session && session.mode === 'free') {
      if (k === 'setup') session.changeConfig(v, null); else if (k === 'tyre') session.changeConfig(null, v); else if (k === 'weather') session.setWeather(v);
      lastOpts[k] = v; assistKey = ''; updateAssist();
    }
  },
  resetSettings() { Store.saveSettings({ ...DEFAULT_SETTINGS }); cfg = Store.settings(); input.cfg = cfg; audio.setVolume(cfg.volume); resize(); ui.refresh(); },
  clearRecords() { Store.clearRecords(); ui.refresh(); },
  noticeOk() { ui.show(menuStack.pop() || 'menu'); },
  // --- トレーニング ---
  trainRetry() { trainRestart(); },
  trainNext() { const tr = session.trainer, n = (tr.secIdx + 1) % (tr.prepared.length); const l = Store.last(); l.trainSec = n; Store.saveLast(l); tr.setSection(n); trainRestart(); },
  trainGo() { const tr = session.trainer; tr.setSection(Store.last().trainSec); menuStack.pop(); trainRestart(); },
  trainBackReview() { menuStack.pop(); ui.show('trainReview', { ...lastReviewCtx, auto: false }); },
  trainStopAuto() { autoT = 0; document.getElementById('autoRow')?.remove(); },
});
function trainRestart() {
  if (!session || session.mode !== 'train') return;
  ui.hide(); state = 'drive'; input.enabled = true; input.reset(); autoT = 0; reviewT = 0;
  hud.reset(); R.clearEffects(); R.cam.init = false; assistKey = '';
  session.trainer.restart(); lastOpts.trainSection = session.trainer.secIdx;
  requestWake();
}
function showTrainReview() {
  const S = session, rep = S.trainer.report; if (!rep) return;
  state = 'review'; audio.silence(); input.enabled = false; input.reset();
  if (!rep.aborted) Store.addTrainBest(rep.secId, rep);
  autoT = cfg.trainAuto !== false ? 7 : 0;
  lastReviewCtx = { report: rep, auto: autoT > 0 };
  ui.show('trainReview', lastReviewCtx);
  if (!rep.aborted) { if (rep.stars >= 4) audio.best(); else audio.good(); } else audio.bad();
}
function pause() { if (state !== 'drive') return; state = 'pause'; audio.silence(); input.enabled = false; input.reset(); ui.show('pause', { mode: session.mode }); }
function resume() { if (state !== 'pause') return; state = 'drive'; input.enabled = true; ui.hide(); requestWake(); }
document.addEventListener('visibilitychange', () => { if (document.hidden) { if (state === 'drive') pause(); audio.setMuted(true); } else audio.setMuted(false); });

// ---------------------------------------------------------------- 入力イベント
input.onShift = dir => {
  if (state !== 'drive' || !session) return;
  if (session.player.car.autoShift && session.player.car.gear > 0 && dir > 0) return;
  const ok = session.shift(dir);
  if (ok) audio.shift(); else audio.denied();
};
input.onButton = id => {
  if (id === 'pause') { if (state === 'drive') pause(); else if (state === 'pause') resume(); return; }
  if (state !== 'drive' || !session) return;
  const pl = session.player;
  if (session.mode === 'train') {
    if (id === 'retry' || id === 'reset') { audio.click(); trainRestart(); return; }
    if (id === 'tr0' || id === 'tr1' || id === 'tr2') {
      const key = ['trainAuto', 'trainGuide', 'ghost'][Number(id[2])]; cfg[key] = cfg[key] === false; Store.saveSettings(cfg); audio.click(); return;
    }
  }
  if (id === 'pit' && input.showPit) {
    if (pl.pit) return;
    pl.pitRequest = !pl.pitRequest; audio.click();
    if (pl.pitRequest) hud.message('ピットイン予約', '#ffb347', 1.6);
  } else if (id.startsWith('tyre')) {
    if (input.showPit && (pl.pitRequest || pl.pit)) { pl.nextTyre = TYRE_IDS[Number(id.slice(4))]; audio.click(); }
  } else if (id === 'reset') {
    if (pl.pit || pl.finished || session.state !== 'green') return;
    if (pl.car.speed > 14) { hud.message('減速してから復帰できます', '#ffd23a', 1.4); return; }
    if (pl.car.retired && session.mode !== 'race' && session.mode !== 'quali') session.repairAndReset(pl); else session.resetToTrack(pl);
    R.lastWheel.clear();
  } else if (id === 'camera') {
    const order = ['up', 'right', 'north']; cfg.camera = order[(order.indexOf(cfg.camera) + 1) % 3]; Store.saveSettings(cfg);
  }
};

// ---------------------------------------------------------------- セッションイベント
function handleEvents() {
  const S = session, pl = S.player, wetClass = S.wet > 0.15;
  for (const ev of S.events) {
    switch (ev.type) {
      case 'light': audio.light(); break;
      case 'go': audio.go(); if (S.mode === 'race') hud.message('GO!', '#3fe07f', 1.3, true); break;
      case 'lap': {
        if (S.mode === 'train') break;
        const col = !ev.valid ? '#ffd23a' : ev.sb || ev.pb ? '#d58cff' : '#fff';
        hud.lapFlash = { time: ev.time, col, t0: hud.t };
        hud.secFlash = [null, null, null];
        if (ev.valid) {
          const isRec = Store.addLap({ time: ev.time, tyre: pl.car.tyre.id, setup: pl.car.setup.id, wet: wetClass, mode: MODES[S.mode].name, date: new Date().toLocaleDateString('ja-JP') });
          if (isRec) { hud.message(`新記録！ ${fmtTime(ev.time)}`, '#d58cff', 3, true); audio.best(); }
          else if (ev.pb) { hud.message(`自己ベスト ${fmtTime(ev.time)}`, '#3fe07f', 2.6); audio.good(); }
          else hud.message(fmtTime(ev.time), '#fff', 2.2);
          if (S.newGhost && S.mode === 'ta') { const g = Store.loadGhost(wetClass); if (!g || S.newGhost.lap < g.lap) Store.saveGhost(S.newGhost, wetClass); S.newGhost = null; }
        } else { hud.message(`${fmtTime(ev.time)} (無効)`, '#ffd23a', 2.2); }
        if (S.mode === 'race' && S.laps - pl.lap === 0 && !S.leaderFinished) hud.message('ファイナルラップ', '#fff', 2.5, true);
        break;
      }
      case 'sector': {
        if (S.mode === 'train') break;
        let col = '#f2c230';
        if (ev.valid) { const rec = Store.addSector(ev.k, ev.time, wetClass); col = rec ? '#d58cff' : (ev.pb || ev.best === ev.time) ? '#3fe07f' : '#f2c230'; }
        hud.secFlash[ev.k] = { time: ev.time, col, t0: hud.t };
        break;
      }
      case 'invalid': if (S.mode === 'train') break; hud.message('コースアウト — このラップは無効', '#ffd23a', 2); audio.bad(); break;
      case 'crash': if (ev.e === pl) audio.crash(ev.v); break;
      case 'contact': audio.crash(ev.v * 0.6); break;
      case 'penalty': hud.message(ev.text, '#ff5a4a', 3); audio.bad(); break;
      case 'pitin': hud.message('ピットイン', '#ffb347', 2); break;
      case 'pitstop': audio.shift(); break;
      case 'pitout': hud.message(`タイヤ交換完了: ${pl.car.tyre.name}`, '#3fe07f', 2.4); audio.good(); assistKey = ''; break;
      case 'retire': if (ev.e === pl) { hud.message('リタイア', '#ff5a4a', 3, true); audio.bad(); } else if (S.mode === 'race') hud.message(`${ev.e.d.name} リタイア`, '#ffd23a', 2); break;
      case 'flag': if (ev.e !== pl) hud.message('トップがチェッカー — この周でフィニッシュ', '#fff', 3); break;
      case 'finish': hud.message(`チェッカーフラッグ  ${pl.pos}位`, '#ffb347', 4, true); audio.best(); break;
      case 'fastest': hud.message(`ファステストラップ ${ev.e.d.name} ${fmtTime(ev.time)}`, '#d58cff', 2.4); break;
      case 'weather': hud.message(ev.rain > 0.2 ? '雨が降り始めた' : '雨が上がった', '#7fd6ff', 3.5, true); break;
      case 'reset': hud.message('コースへ復帰', '#fff', 1.4); break;
      case 'results': resultsTimer = 0.01; break;
      case 'trainreport': reviewT = 0.8; break;
      case 'traincue': if (ev.sev === 'urgent') audio.blip(1250, 0.08, 0.2, 'square'); else if (ev.sev === 'good') audio.good(); else audio.blip(700, 0.07, 0.12, 'triangle'); break;
    }
  }
  S.events.length = 0;
}
function showResults() {
  const S = session; state = 'results'; audio.silence(); input.enabled = false;
  if (S.mode === 'race') {
    const me = S.results.find(r => r.player);
    Store.addRace({ date: new Date().toLocaleDateString('ja-JP'), laps: S.laps, weather: S.opts.weather, grid: S.gridPos, pos: me.pos, dnf: !!me.dnf, best: me.best });
    // 未完走車の推定タイム
    const pt = S.player.finishTime;
    for (const r of S.results) if (r.time == null && !r.dnf && pt != null && r.e) r.time = pt + Math.max(0, (S.player.dist - r.e.dist)) / 58, r.est = true;
  } else if (S.mode === 'quali') {
    const me = S.results.find(r => r.player);
    Store.saveQuali({ grid: S.qualiResult, pos: me.pos, time: me.best });
  }
  ui.show('results', { session: S });
}

// ---------------------------------------------------------------- メインループ
let last = performance.now(), fpsAcc = 0, fpsN = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000; last = now;
  if (dt > 0.1) dt = 0.1; if (dt <= 0) return;
  if (window.innerWidth !== R.w || window.innerHeight !== R.h) { if (window.innerWidth > 0 && window.innerHeight > 0) resize(); else return; } // WebView は起動直後のサイズが 0 のことがある
  const ctx = R.ctx;
  if (state === 'drive' && session) {
    input.showTyres = input.showPit && (session.player.pitRequest || (session.player.pit && session.player.pit.state !== 'out'));
    input.update(dt);
    const pi = session.playerInput; pi.throttle = Math.pow(input.throttle, 1.25); pi.brake = input.brake; // アクセルは低開度側を細かく
    if (auto.on) autoDrive(pi);
    session.update(dt);
    for (let k = 1; k < auto.speed && state === 'drive'; k++) { if (auto.on) autoDrive(pi); session.update(dt); handleEvents(); if (resultsTimer > 0) break; }
    handleEvents(); updateAssist();
    R.updateEffects(session, dt);
    R.updateCamera(session.player.car, cfg, dt);
    R.render(session, rcfg(), dt);
    if (cfg.quality === 'auto' && auto.speed === 1) {
      perf.acc += dt; perf.n++;
      if (perf.n >= 180) {
        const avg = perf.acc / perf.n; perf.acc = 0; perf.n = 0;
        if (avg > 1 / 50 && perf.level < 3) { perf.level++; if (perf.level === 1) perf.dprCap = 1.75; else if (perf.level === 2) perf.low = true; else perf.dprCap = 1.25; resize(); }
      }
    }
    ctx.setTransform(R.dpr, 0, 0, R.dpr, 0, 0);
    hud.draw(ctx, layout, session, input, cfg, R, dt);
    audio.update(session, R.cam);
    if (resultsTimer > 0) { resultsTimer += dt; if (resultsTimer > 1.2) { resultsTimer = 0; showResults(); } }
    if (reviewT > 0) { reviewT -= dt; if (reviewT <= 0) { reviewT = 0; showTrainReview(); } }
  } else if ((state === 'pause' || state === 'results' || state === 'review') && session) {
    R.render(session, rcfg(), 0);
    if (state === 'review' && autoT > 0) {
      autoT -= dt; const el = document.getElementById('autoCnt'); if (el) el.textContent = Math.max(1, Math.ceil(autoT));
      if (autoT <= 0) trainRestart();
    }
  } else {
    if (!demo) startDemo();
    tickDemo(dt);
    // デモは先頭集団を北固定カメラで追う
    const tgt = demo.order[Math.min(2, demo.order.length - 1)].car;
    R.updateEffects(demo, dt);
    R.updateCamera({ x: tgt.x, y: tgt.y, yaw: tgt.yaw, speed: 40 }, { camera: 'north', zoom: 'normal' }, dt);
    R.render(demo, { ...cfg, lineAssist: false, camera: 'north' }, dt);
  }
}

// 自動運転 (動作確認用: コンソールで __okr.auto.on = true)
const auto = { on: false, drv: null, car: null, skill: 0.9, speed: 1 };
function autoDrive(pi) {
  const pl = session.player, c = pl.car;
  if (auto.car !== c) { const a = c.assistTC, b = c.autoShift; auto.drv = new Driver(c, T, line, { skill: auto.skill }); auto.car = c; }
  if (session.state !== 'green' || pl.pit || pl.finished) { pi.throttle = 0; pi.brake = 1; return; }
  auto.drv.update(1 / 60, session.wet, session.cars, {});
  pi.throttle = c.throttle; pi.brake = c.brake;
  input.throttle = c.throttle; input.brake = c.brake; input.pedal = c.brake > 0.01 ? c.brake : -c.throttle;
}
// Android の戻るキー (APK 版の WebView から呼ばれる)。処理したら true
window.__okrBack = () => {
  if (state === 'drive') { pause(); return true; }
  if (state === 'pause') { resume(); return true; }
  if (state === 'results' || state === 'review') { toMenu(); return true; }
  if (state === 'menu' && ui.screen && ui.screen !== 'menu') { ui.show(menuStack.pop() || 'menu'); return true; }
  return false;
};
// デバッグ/自動テスト用フック
window.__okr = { auto, get session() { return session; }, get state() { return state; }, T, line, R, input, startSession, Store, ui, hud, get cfg() { return cfg; } };

startDemo();
ui.show('title');
requestAnimationFrame(frame);
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
