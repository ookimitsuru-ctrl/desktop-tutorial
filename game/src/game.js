// メインループ・状態遷移・カメラ・各画面
import { G, vib } from './state.js';
import { Gfx } from './gfx.js';
import { AudioEngine } from './audio.js';
import { Input } from './input.js';
import { M } from './models.js';
import { drawText, textWidth, drawTextProgress } from './font.js';
import { clamp, damp, lerp, sat, TAU, PI, rand, fmtScore, easeOut } from './util.js';
import { initWorld, updateWorld, drawWorld, THEMES } from './world.js';
import { clearFx, updateFx, drawFx, drawPops, explosion, popup } from './fx.js';
import { updateEnemies, drawEnemies, targets, buildTargets, COL, spawn, spawnBomber, spawnWall, damage } from './enemies.js';
import { spawnBoss } from './bosses.js';
import { buildStage, updatePending, clearPending } from './stages.js';
import { resetPlayer, updatePlayerMove, updateWeapons, drawPlayerWorld, activateOverdrive, aimPoint } from './player.js';
import * as H from './hud.js';
import { startCine, updateCine, skipCine, drawCineWorld, drawCineHud, CINE_END, CINE_CARD } from './cine.js';

const SAVE_KEY = 'starwire.save.v1'; // 互換のためキー名は据え置き
let last = 0, evIdx = 0, fpsAvg = 16.7, fpsN = 0, startScale = 1, lowCount = 0;
let stageStartScore = 0;

// ---------- 起動 ----------
export function boot(canvas) {
  G.gfx = new Gfx(canvas);
  G.audio = new AudioEngine();
  G.input = new Input(canvas, G.gfx);
  G.debug = /[?&]debug/.test(location.search);
  G.buttons = []; G.pressed = {}; G.scoreShown = 0; G.titleReady = false; G.menu = 'main';
  loadSave();
  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 200));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (G.state === 'play') setState('pause'); G.audio.suspend(); }
    else if (G.state !== 'pause') G.audio.resume();
  });
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); G.glLost = true; if (G.state === 'play') { setState('pause'); } });
  canvas.addEventListener('webglcontextrestored', () => {
    G.gfx = new Gfx(canvas); G.input.gfx = G.gfx; resize();
    initWorld(G.stage && G.state !== 'title' ? G.stage.theme : 'belt');
    G.glLost = false;
  });
  G.input.ui = {
    hit: (x, y) => H.hitButton(x, y),
    press: (id) => { G.pressed[id] = true; onButton(id); },
    release: (id) => { G.pressed[id] = false; },
  };
  window.__onBack = onBack;
  initWorld('belt');
  setState('title');
  window.__sw = { G, startStage, setState, spawn, spawnBomber, spawnWall, spawnBoss, finishStage, damage, step: debugStep }; // デバッグ用
  requestAnimationFrame((t) => { last = t; loop(t); });
}

function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}');
    if (s.hi) G.save.hi = s.hi;
    if (s.reached) G.save.reached = s.reached;
    if (s.settings) Object.assign(G.settings, s.settings);
  } catch (_) { /* noop */ }
  G.diff = G.settings.diff;
}
function writeSave() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ hi: G.save.hi, reached: G.save.reached, settings: G.settings })); } catch (_) { /* noop */ }
}

export function resize() {
  const g = G.gfx;
  measureSafeArea();
  const w = window.innerWidth, h = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  g.canvas.style.width = w + 'px'; g.canvas.style.height = h + 'px';
  const pw = w * dpr, ph = h * dpr;
  const mode = G.settings.gfx;
  let sc = mode === 1 ? 0.6 : mode === 2 ? 0.8 : mode === 3 ? 1 : clamp(Math.sqrt(1.9e6 / (pw * ph)), 0.5, 1);
  startScale = sc;
  g.scale = sc;
  g.resize(w, h, dpr);
}

// ---------- 状態 ----------
export function setState(s) {
  G.state = s; G.stateT = 0;
  if (s === 'title' || s === 'clear' || s === 'ending' || s === 'over') { G.V = s === 'title' || s === 'over' ? 62 : G.V; }
  if (s !== 'play' && s !== 'pause') { G.lasers.length = 0; G.missiles.length = 0; G.locks.length = 0; G.volley.length = 0; G.locking = false; }
  G.pressed = {};
  G.input.reset && G.input.reset();
  if (s === 'title') {
    G.menu = 'main'; G.titleReady = G.titleReady || false;
    clearArrays(); G.hyper = 0; G.VS = 0; initWorld('belt'); G.gfx.fx.tint = [1, 1, 1];
    G.tsTarget = 1; G.ts = 1; G.od = 0;
    if (G.audio.ctx) { G.audio.startMusic(0); G.audio.setIntensity(2); }
    G.audio.setTimeScale(1);
    if (G.opT === undefined) G.opT = -1; else G.opT = 99; // 2回目以降はOPを省略
  }
}

function clearArrays() {
  G.enemies.length = 0; G.ebul.length = 0; G.lasers.length = 0; G.missiles.length = 0; G.pickups.length = 0;
  G.locks.length = 0; G.volley.length = 0; G.boss = null; clearFx(); clearPending();
}

export function startStage(idx, fresh) {
  G.audio.resume();
  clearArrays();
  if (fresh) { G.score = 0; G.scoreShown = 0; }
  G.stageIdx = idx;
  G.stage = buildStage(idx);
  G.st = 0; evIdx = 0; G.bossState = 0; G.bossT = 0; G.clearT = 0;
  resetPlayer(!fresh);
  stageStartScore = G.score;
  G.stageKills0 = G.kills; G.stageDmg0 = G.dmgTaken;
  initWorld(G.stage.theme);
  G.audio.startMusic(G.stage.music);
  G.audio.setIntensity(1);
  G.audio.setTimeScale(1);
  G.gfx.clearTrails();
  G.banner = { text: G.stage.name, sub: G.stage.sub, t: 0, dur: 2.8, col: H.C.cyan };
  G.hintT = idx === 0 && !G.tutorialDone ? 14 : 0;
  G.camRoll = 0; G.camYaw = 0; G.camPitch = 0;
  G.warp = G.stage.hyper ? 0 : 1; G.warpOut = 0;
  G.hyper = 0; G.VS = 0; G.hyperKick = 0; G.hyperStep = 0;
  setState('play');
}

function retryStage() {
  G.score = stageStartScore;
  G.scoreShown = G.score;
  startStage(G.stageIdx, false);
}

G.onBossDefeated = () => {
  G.bossState = 3; G.clearT = 0;
  G.audio.fadeOutMusic(1.2);
  if (G.stageIdx >= 3) G.audio.preloadTrack('ending');
};

function finishStage() {
  const idx = G.stageIdx;
  G.save.reached = Math.max(G.save.reached, Math.min(4, idx + 2));
  G.save.hi = Math.max(G.save.hi, Math.floor(G.score));
  writeSave();
  G.audio.clear();
  G.tsTarget = 1; G.od = 0;
  // ランク
  const pts = 100 - (G.dmgTaken - G.stageDmg0) * 0.5 + G.maxChain * 1.0 + (G.grazes || 0) * 0.15;
  G.rank = pts >= 105 ? 'S' : pts >= 85 ? 'A' : pts >= 65 ? 'B' : 'C';
  G.stageKills = G.kills - G.stageKills0;
  setState(idx >= 3 ? 'ending' : 'clear');
  if (idx >= 3) startCine();
}

function gameOver() {
  G.save.hi = Math.max(G.save.hi, Math.floor(G.score));
  writeSave();
  G.audio.gameOver();
  G.audio.stopMusic();
  setState('over');
}

// ---------- ボタン処理 ----------
function cycle(arr, v) { return arr[(arr.indexOf(v) + 1) % arr.length]; }

function onButton(id) {
  const A = G.audio;
  if (id === 'rollL' || id === 'rollR') { G.pendingRoll = id === 'rollL' ? -1 : 1; return; }
  if (id === 'flow') { G.pendingFlow = true; return; }
  if (id === 'pause') { if (G.state === 'play') { setState('pause'); A.suspend(); } return; }
  if (!G.titleReady && G.state === 'title') return;
  A.uiClick();
  switch (id) {
    case 'start': startStage(0, true); A.uiStart(); break;
    case 's1': startStage(0, true); break;
    case 's2': if (G.save.reached >= 2) startStage(1, true); break;
    case 's3': if (G.save.reached >= 3) startStage(2, true); break;
    case 's4': if (G.save.reached >= 4) startStage(3, true); break;
    case 'options': G.menu = 'options'; break;
    case 'howto': showHowTo(true); break;
    case 'back': G.menu = 'main'; writeSave(); break;
    case 'music': G.settings.music = cycle([0, 0.35, 0.7, 1], G.settings.music); A.setVolumes(G.settings.music, G.settings.sfx); writeSave(); break;
    case 'sfx': G.settings.sfx = cycle([0, 0.45, 0.9, 1], G.settings.sfx); A.setVolumes(G.settings.music, G.settings.sfx); writeSave(); break;
    case 'vib': G.settings.vib = !G.settings.vib; vib(40); writeSave(); break;
    case 'diff': G.settings.diff = (G.settings.diff + 1) % 3; G.diff = G.settings.diff; writeSave(); break;
    case 'gfx': G.settings.gfx = (G.settings.gfx + 1) % 4; resize(); writeSave(); break;
    case 'aim': G.settings.aim = (G.settings.aim + 1) % 3; writeSave(); break;
    case 'lefty': G.settings.lefty = !G.settings.lefty; writeSave(); break;
    case 'resume': setState('play'); A.resume(); break;
    case 'restart': retryStage(); break;
    case 'quit': A.stopMusic(); A.resume(); setState('title'); break;
    case 'next': startStage(G.stageIdx + 1, false); break;
    case 'retry': retryStage(); break;
    case 'title': setState('title'); break;
    case 'popt': G.menu = G.menu === 'options' ? 'main' : 'options'; break;
  }
}

function onBack() {
  if (G.state === 'play') { setState('pause'); G.audio.suspend(); return true; }
  if (G.state === 'pause') { onButton('resume'); return true; }
  if (G.state === 'title' && G.menu === 'options') { G.menu = 'main'; return true; }
  if (G.state === 'ending' && G.cine && G.cine.t < CINE_END - 0.1) { skipCine(); return true; }
  if (G.state === 'clear' || G.state === 'over' || G.state === 'ending') { onButton('title'); return true; }
  if (window.AndroidBridge && window.AndroidBridge.exit) window.AndroidBridge.exit();
  return false;
}

function showHowTo(on) {
  const el = document.getElementById('howto');
  if (el) el.hidden = !on;
}
window.__closeHowTo = () => showHowTo(false);

// ---------- メインループ ----------
function loop(ts) {
  requestAnimationFrame(loop);
  let raw = (ts - last) / 1000; last = ts;
  if (raw <= 0) raw = 1 / 60;
  const dt = clamp(raw, 0.001, 0.05);
  // 軽い平滑化 (ヌルヌル感): 急な dt の揺れを緩和
  G.dt = G.dt + (dt - G.dt) * 0.5;
  G.time += G.dt;
  if (G.glLost || G.freeze) return; // freeze: PV 撮影などで外部からコマ送りする時
  try {
    const c0 = performance.now();
    update(G.dt);
    render(G.dt);
    G.cpu = (G.cpu || 0) * 0.95 + (performance.now() - c0) * 0.05;
  } catch (err) {
    console.error(err);
    window.__lastError = String(err && err.stack || err);
  }
  adaptResolution(raw);
}

function adaptResolution(raw) {
  fpsAvg += (raw * 1000 - fpsAvg) * 0.05;
  if (++fpsN % 60 !== 0) return;
  if (G.settings.gfx !== 0) return;
  const g = G.gfx;
  if (fpsAvg > 21 && g.scale > 0.5) { lowCount++; if (lowCount >= 2) { g.setScale(Math.max(0.5, g.scale - 0.08)); lowCount = 0; } }
  else lowCount = 0;
}

function update(dt) {
  G.stateT += dt;
  const ctrl = G.input.poll(dt);
  const taps = G.input.takeTaps();
  switch (G.state) {
    case 'title': updateTitle(dt, ctrl, taps); break;
    case 'play': updatePlay(dt, ctrl); break;
    case 'pause': break;
    case 'ending': updateEnding(dt, taps); break;
    case 'clear': case 'over': updateEnd(dt, ctrl, taps); break;
  }
  // フラッシュ・グリッチ減衰 (実時間)
  G.flash[3] *= Math.exp(-6 * dt);
  G.glitch = Math.max(0, (G.glitch || 0) - dt * 2.4);
  G.trauma = Math.max(0, G.trauma - dt * 1.5);
  if (G.hintT > 0) G.hintT -= dt;
}

const OP_SLAM = 3.2, OP_END = 4.4;
function opSlam() {
  G.opSlammed = true;
  G.flash = [1, 1, 1, 0.85]; G.glitch = 1; G.trauma = 0.9;
  G.audio.cancelOpening(); G.audio.slam();
  G.audio.startMusic(0); G.audio.setIntensity(2);
  vib(80);
}
function updateTitle(dt, ctrl, taps) {
  const pressed = taps.length || G.input.takeAnyPress();
  if (!G.titleReady) {
    if (pressed) {
      G.titleReady = true;
      G.audio.init(); G.audio.resume();
      G.audio.setVolumes(G.settings.music, G.settings.sfx);
      G.audio.stopMusic();
      G.audio.opening();
      G.opT = 0; G.opSlammed = false; G.opStroke = -1;
      G.input.reset();
    }
  } else if (G.opT >= 0 && G.opT < OP_END) {
    G.opT += dt;
    if (pressed && G.opT > 0.15) { // タップでスキップ
      if (!G.opSlammed) opSlam();
      G.opT = OP_END; G.input.reset(); G.pressed = {};
    }
    if (G.opT >= OP_SLAM && !G.opSlammed) opSlam();
  }
  // OP中はワープで突き進み、ロゴ着地で減速
  const op = G.opT >= 0 && G.opT < OP_SLAM ? Math.min(1, G.opT / 1.2) : 0;
  G.warp = op; G.V = 62 * (1 + 6 * op * op);
  G.wdt = dt; G.ts = 1;
  updateWorld(dt);
  const t = G.time;
  G.px = Math.sin(t * 0.3) * 3; G.py = Math.sin(t * 0.21) * 1.6; G.pvx = Math.cos(t * 0.3) * 0.9; G.pvy = 0;
  G.bend.x = 0.0002 * Math.sin(t * 0.17); G.bend.y = -0.00008;
  setCamera(dt, 0.4);
  if (G.audio.running) G.audio.pollSteps();
}

function updateEnd(dt, ctrl, taps) {
  G.wdt = dt;
  updateWorld(dt * 0.3); updateFx(dt);
  updateEnemies(dt * 0.3);
  setCamera(dt, 0.4);
  G.input.takeAnyPress();
}

// エンディング映像: タップで THE END まで飛ばす
function updateEnding(dt, taps) {
  G.wdt = dt;
  const pressed = taps.length || G.input.takeAnyPress();
  if (pressed && G.cine && G.cine.t < CINE_END - 0.1) skipCine();
  updateCine(dt);
  updateWorld(dt); updateFx(dt);
}

// 自動操縦 (テスト・デモ用)
function autopilot(ctrl) {
  const g = G.gfx;
  let best = null, bd = 1e9;
  for (const tg of targets) {
    if (!tg.alive || tg.armored || tg.z < 8) continue;
    const d = tg.z + (tg.isBullet ? 40 : 0);
    if (d < bd) { bd = d; best = tg; }
  }
  const p = [0, 0, 0];
  if (best && g.project(best.x, best.y, best.z, p)) { ctrl.aimAbs = [clamp(p[0], -1.5, 1.5), clamp(p[1], -0.8, 0.8)]; }
  else ctrl.aimAbs = [0, 0];
  ctrl.fire = (Math.floor(G.time * 0.6) % 3) !== 2;
  // ロックした目標が近づいたら早めに撃つ (ワープ面の高速な岩向け)
  if (G.locks.length && (G.locks.length >= 8 || G.locks.some((l) => l.tg.z < 150))) ctrl.fire = false;
  if (G.noFire) ctrl.fire = false;   // 動画撮影用: 避けるだけ
  // 近い弾を避ける
  let dx = 0, dy = 0;
  for (const b of G.ebul) {
    if (b.friendly || !b.alive || b.z > 40 || b.z < 0) continue;
    const ex = b.x + b.vx * (b.z / -b.vz || 0) - G.px, ey = b.y + b.vy * (b.z / -b.vz || 0) - G.py;
    if (Math.hypot(ex, ey) < 7) { dx -= Math.sign(ex || 1) * 1; dy -= Math.sign(ey || 1) * 0.5; if (G.rollCd <= 0 && b.z < 14) ctrl.roll = Math.sign(dx || 1); }
  }
  // 迫る岩を避ける
  for (const e of G.enemies) {
    if (!e.alive || e.kind !== 'rock' || e.z > 70 || e.z < 0) continue;
    const tt = e.z / Math.max(1, G.V - (e.vz || 0));
    const ex = e.x + e.vx * tt - G.px, ey = e.y + e.vy * tt - G.py;
    if (Math.hypot(ex, ey) < e.r + 3) { dx -= Math.sign(ex || 1) * 1.2; dy -= Math.sign(ey || 1) * 0.8; }
  }
  ctrl.moveX = clamp(dx - G.px * 0.04, -1, 1); ctrl.moveY = clamp(dy - G.py * 0.05, -1, 1);
  if (G.flow >= 100 && !G.noFlow) ctrl.flow = true;
  return ctrl;
}

function updatePlay(dt, ctrl) {
  if (G.auto) autopilot(ctrl);
  if (ctrl.pause) { setState('pause'); G.audio.suspend(); return; }
  if (G.pendingRoll) { ctrl.roll = G.pendingRoll; G.pendingRoll = 0; }
  if (G.pendingFlow) { ctrl.flow = true; G.pendingFlow = false; }
  if (G.hintT > 0 && (ctrl.fire || ctrl.moveX)) { G.tutorialSeen = (G.tutorialSeen || 0) + dt; if (G.tutorialSeen > 7) { G.tutorialDone = true; G.hintT = Math.min(G.hintT, 1.5); } }

  // 時間スケール (オーバードライブ・ボス撃破のスロー)
  if (G.slowT > 0) { G.slowT -= dt; if (G.slowT <= 0 && G.od <= 0) { G.tsTarget = 1; } }
  G.ts += (G.tsTarget - G.ts) * (1 - Math.exp(-5.5 * dt));
  const wdt = dt * G.ts;
  G.wdt = wdt;

  updatePlayerMove(dt, wdt, ctrl);

  // ステージ進行
  G.st += wdt;
  const ev = G.stage.events;
  while (evIdx < ev.length && ev[evIdx].t <= G.st) { ev[evIdx].fn(); evIdx++; }
  updatePending();
  updateBossFlow(dt, wdt);

  // 世界
  const bend = G.stage.bend(G.st);
  G.bend.x = damp(G.bend.x, bend[0], 1.5, dt); G.bend.y = damp(G.bend.y, bend[1], 1.5, dt);
  updateWorld(wdt);
  updateEnemies(wdt);
  updateFx(wdt);

  // ワープ演出: 開始時はワープイン、ボス撃破後はワープアウト
  G.warp = Math.max(0, (G.warp || 0) - dt / 2.4);
  G.warpOut = G.bossState === 3 ? clamp((G.clearT - 1.8) / 1.5, 0, 1) : 0;
  if (G.stage.hyper) updateHyper(dt);
  else {
    const wk = Math.max(G.warp * G.warp, G.warpOut * G.warpOut);
    G.V = 62 * (1 + 5 * wk);
  }
  setCamera(dt, 1);
  updateWeapons(dt, wdt, ctrl);

  // 音: エンジン・強度
  if (G.audio.ctx) {
    const inten = G.bossState === 2 ? 3 : G.od > 0 ? 3 : G.st < 14 ? 1 : G.st < 50 ? 2 : 3;
    if (G.audio.intensity !== inten) G.audio.setIntensity(inten);
  }

  if (G.dead) {
    G.deadT += dt;
    if (G.deadT > 2.1) gameOver();
  }
  if (G.bossState === 3) {
    G.clearT += dt;
    if (G.clearT > 3.4) finishStage();
  }
}

// ワープ面: 開始 0.35 秒で突入 → 1.38 秒 (曲の 2 小節目の頭) で最高速に達して「ドン」。
// 岩が迫る速さ (V) と星が流れる見かけの速さ (VS) を分けて、反応できる速さのまま景色だけ超高速にする。
const HY_ON = 0.35, HY_TOP = 1.38;
function updateHyper(dt) {
  const st = G.st;
  if (G.hyperStep === 0 && st >= HY_ON) { G.hyperStep = 1; G.audio.warpEngage(); vib(30); }
  if (G.hyperStep === 1 && st >= HY_TOP) {
    G.hyperStep = 2;
    G.flash = [0.7, 0.85, 1, 0.55]; G.glitch = 0.7; G.trauma = Math.max(G.trauma, 0.65); G.hyperKick = 0.35;
    vib(70);
  }
  if (G.hyperStep === 2 && G.bossState === 3 && G.clearT > 1.8) { G.hyperStep = 3; G.audio.warpExit(); }
  let u = clamp((st - HY_ON) / (HY_TOP - HY_ON), 0, 1);
  u = u * u * u;                                   // ギュイーン: ゆっくり → 一気に
  const out = G.bossState === 3 ? clamp((G.clearT - 1.8) / 1.4, 0, 1) : 0;
  const h = u * (1 - out * out * (3 - 2 * out));    // ボス撃破後はワープアウト (減速)
  G.hyper = h;
  G.hyperKick = Math.max(0, G.hyperKick - dt * 0.6);
  G.V = 62 + 88 * h;
  G.VS = 62 + 820 * h + 900 * G.hyperKick;
  G.trauma = Math.max(G.trauma, 0.2 * h);           // 高速域の微振動
}

function updateBossFlow(dt, wdt) {
  const s = G.stage;
  if (G.bossState === 0 && G.st >= s.bossAt) {
    let n = 0;
    for (const e of G.enemies) if (e.alive && e.isEnemy && e.kind !== 'rock') n++;
    if (n <= 1 || G.st >= s.bossAt + 14) {
      G.bossState = 1; G.bossT = 3.4;
      G.banner = { text: 'WARNING', sub: 'BOSS APPROACHING', t: 0, dur: 3.2, col: H.C.red };
      G.audio.bossWarning();
      G.audio.playBoss();
      vib(80);
    }
  } else if (G.bossState === 1) {
    G.bossT -= dt;
    if (G.bossT <= 0) { spawnBoss(s.boss); G.bossState = 2; }
  }
}

// ---------- カメラ ----------
function setCamera(dt, strength) {
  const g = G.gfx, R = G.ret, A = g.aspect;
  const t = G.time;
  const sh = G.trauma * G.trauma;
  const swayX = Math.sin(t * 0.7) * 0.12 + Math.sin(t * 1.9) * 0.04, swayY = Math.sin(t * 0.53 + 1) * 0.09;
  G.shakeX = sh * (Math.sin(t * 43) + Math.sin(t * 71 + 1.3)) * 0.55;
  G.shakeY = sh * (Math.sin(t * 51 + 2) + Math.sin(t * 67)) * 0.45;
  G.shakeR = sh * Math.sin(t * 37) * 0.04;
  const tyaw = (R.dx / A) * 0.09 * strength - G.pvx * 0.0016;
  const tpit = R.dy * 0.07 * strength + G.pvy * 0.0009;
  G.camYaw = damp(G.camYaw, tyaw, 7, dt);
  G.camPitch = damp(G.camPitch, tpit, 7, dt);
  const lean = -G.pvx * 0.0042 * strength - G.bend.x * 90 * 0.12;
  G.camLean = damp(G.camLean || 0, lean, 6, dt);
  G.camRoll = G.camLean - G.rollAngle + G.shakeR + Math.sin(t * 0.41) * 0.004;
  const od = G.od > 0 ? 1 : 0;
  const wv = G.stage && G.stage.hyper ? 0 : Math.max((G.warp || 0) * (G.warp || 0), (G.warpOut || 0) * (G.warpOut || 0));
  const fovT = 0.92 + (G.state === 'play' || G.state === 'title' ? 0.42 * wv : 0) + (G.state === 'play' ? 0.2 * (G.hyper || 0) + 0.5 * (G.hyperKick || 0) : 0) + od * 0.14 + clamp(Math.abs(G.pvx) * 0.0016, 0, 0.05) + (G.rollT > 0 ? 0.07 : 0);
  G.fov = damp(G.fov, fovT, 5, dt);
  // カメラ位置は機体位置にやや遅れて追従 (滑らかさ)
  G.camX = damp(G.camX === undefined ? G.px : G.camX, G.px, 16, dt);
  G.camY = damp(G.camY === undefined ? G.py : G.camY, G.py, 16, dt);
  g.setCamera(G.camX + G.shakeX + swayX, G.camY + G.shakeY + swayY, 0, G.camYaw, G.camPitch, G.camRoll, G.fov);
  g.bendX = G.bend.x; g.bendY = G.bend.y;
}

// ---------- 描画 ----------
function render(dt) {
  const g = G.gfx;
  const fx = g.fx;
  const t = G.time;
  fx.time = t % 400; // シェーダ側 (mediump) の桁あふれ防止
  const st = G.state;
  // ポスト
  const th = THEMES[(G.stage && st !== 'title') ? G.stage.theme : 'belt'];
  fx.bgA = th.bgA; fx.bgB = th.bgB;
  const od = G.od > 0;
  G.beat = G.audio.beatPulse();
  fx.tint = [od ? 0.8 : 1, od ? 1.0 : 1, od ? 1.3 : 1];
  fx.bloom = (od ? 1.45 : 1.05) + G.beat * 0.28;
  fx.decay = od ? 0.9 : G.ts < 0.9 ? 0.86 : 0.78;
  if (G.V > 70 && st === 'play') fx.decay = 0.92;
  if (G.hyper > 0.05 && st === 'play') { fx.decay = 0.8; fx.bloom += 0.1 * G.hyper; }
  fx.aber = 0.0013 + G.trauma * 0.004 + (G.hyper || 0) * 0.0015 + (od ? 0.0025 : 0) + (G.rollT > 0 ? 0.002 : 0);
  fx.glitch = G.glitch;
  fx.vig = 0.55 + (G.shield < 30 && !G.dead ? 0.25 + 0.15 * Math.sin(t * 8) : 0);
  const fl = G.flash;
  fx.flash = [fl[0], fl[1], fl[2], fl[3]];
  // メニュー系の画面では背景を減光して文字を読みやすく
  const menuLike = st === 'pause' || st === 'over' || st === 'clear' || (st === 'title' && G.menu === 'options');
  const dimT = menuLike ? 0.38 : st === 'ending' ? (G.cine && G.cine.t > CINE_CARD ? 0.55 : 1) : 1;
  if (st === 'ending') { fx.decay = 0.8; fx.aber = 0.0012 + G.trauma * 0.004; fx.vig = 0.7; }
  fx.dim += (dimT - fx.dim) * Math.min(1, 10 * dt);

  g.beginWorld();
  g.lineScale = 1;
  drawWorld(g, t);
  if (st === 'title') drawTitleWorld(g, t);
  if (st === 'ending') { drawCineWorld(g, t); drawFx(g, dt); }
  else if (st !== 'title') {
    drawEnemies(g, t);
    drawPlayerWorld(g, t);
    drawFx(g, dt);
  }
  g.beginHud();
  G.buttons.length = 0;
  switch (st) {
    case 'title': drawTitle(g, t); break;
    case 'play': drawPlay(g, t, dt); break;
    case 'pause': drawPlay(g, t, 0, true); drawPauseMenu(g, t); break;
    case 'clear': drawPlay(g, t, 0, true); drawClear(g, t); break;
    case 'ending': drawEnding(g, t); break;
    case 'over': drawPlay(g, t, 0, true); drawOver(g, t); break;
  }
  if (G.debug) {
    drawText(g, `FPS ${(1 / G.dt).toFixed(0)}  CPU ${(G.cpu || 0).toFixed(1)}MS  LINES ${g.lineCount}  RES ${g.W}X${g.H} S${g.scale.toFixed(2)}`, -g.aspect + 0.05, -0.62, 0.035, 0.6, 1, 0.6, 1.4, 0.9, 'l');
  }
  g.present(dt);
}

function drawPlay(g, t, dt, quiet) {
  drawPops(g);
  H.drawCockpit(g, t);
  H.drawGauges(g, t);
  if (!quiet) {
    H.drawHud(g, t, dt || 0.016);
    H.drawLocks(g, t);
    if (!G.dead) H.drawReticle(g, t);
    H.drawControls(g, t);
    H.drawHints(g, t);
  } else {
    H.drawHud(g, t, 0.016);
  }
  if (!quiet) H.drawBanner(g, t, dt || 0);
}

// ---------- タイトル ----------
function drawTitleWorld(g, t) {
  // 巨大な回転ワイヤー多面体
  g.mesh(M.icosa1, 0, 6, 150, t * 0.2, t * 0.12, 0, 34, 0.1, 0.45, 0.9, 1.6);
  g.mesh(M.icosa1, 0, 6, 150, -t * 0.3, t * 0.2, 0, 22, 0.9, 0.2, 0.6, 1.5);
  g.mesh(M.ring24, 0, 6, 150, 0.3, t * 0.2, t * 0.3, 52, 0.2, 0.7, 1, 1.4);
  g.mesh(M.ring24, 0, 6, 150, 1.2, -t * 0.15, 0, 60, 0.9, 0.5, 0.2, 1.2);
  // 通り過ぎる敵機
  for (let i = 0; i < 3; i++) {
    const u = ((t * 0.12 + i / 3) % 1);
    const z = 320 - u * 340;
    g.mesh(M.fighter, Math.sin(i * 2.1 + t * 0.2) * 38, Math.cos(i * 1.7) * 14 + 6, z, PI + Math.sin(t + i) * 0.2, 0, Math.sin(t * 0.8 + i) * 0.5, 1.1, 1, 0.3, 0.5, 1.7);
  }
}

function drawTitle(g, t) {
  const A = g.aspect;
  const ready = G.titleReady;
  if (ready && G.menu === 'options') { drawOptions(g, t); return; }
  // 起動前: 接続待ち
  if (!ready) {
    const b = 0.5 + 0.5 * Math.sin(t * 4);
    drawText(g, 'TOUCH TO CONNECT' + (Math.sin(t * 6) > 0 ? '_' : ' '), 0, -0.05, 0.075, 0.3, 1, 1, 2.6, 0.35 + 0.65 * b, 'c');
    g.line2(-0.6, -0.16, 0.6, -0.16, 0.2, 0.9, 1, 1.5, 0.4);
    drawText(g, 'HI ' + fmtScore(G.save.hi), 0, -0.85, 0.045, 0.5, 0.8, 1, 1.8, 0.8, 'c');
    return;
  }
  const T = G.opT;
  const ly = 0.42, s = 0.42;
  // ブートログ
  if (T < OP_SLAM) {
    const lines = ['> LINK ESTABLISHED', '> WIREFRAME CORE ONLINE', '> SYNCING TO THE BEAT', '> ARMING LOCK SYSTEM'];
    lines.forEach((ln, i) => {
      const n = Math.floor(Math.max(0, (T - i * 0.3) * 40));
      if (n > 0) drawText(g, ln.slice(0, n), -A + 0.15 + G.safeL, 0.82 - i * 0.08, 0.045, 0.3, 1, 0.6, 1.8, 0.85, 'l');
    });
  }
  // ロゴを一筆ずつ描く → 着地
  const prog = T >= OP_SLAM ? 1 : Math.max(0, (T - 1.2) / (OP_SLAM - 1.2 - 0.15));
  if (T < OP_SLAM) {
    const tip = drawTextProgress(g, 'WIRED', 0, ly, s, prog, 0.3, 1, 1, 3.2, 1);
    if (tip) {
      g.dot2(tip[0], tip[1], 1, 1, 1, 18, 1);
      g.dot2(tip[0], tip[1], 0.3, 0.9, 1, 40, 0.4);
      if (tip[2] !== G.opStroke) { G.opStroke = tip[2]; G.audio.tick(); }
    }
    return;
  }
  const k = easeOut((T - OP_SLAM) / 0.5);
  const sc = 1 + 0.25 * (1 - k); // 着地時に少し大きい → 締まる
  const jit = (Math.sin(t * 31) > 0.985) ? 0.012 : 0;
  drawText(g, 'WIRED', jit, ly, s * sc, 0.25, 0.95, 1, 4.4, 1, 'c');
  drawText(g, 'WIRED', 0.008 - jit, ly - 0.008, s * sc, 1, 0.2, 0.6, 2.2, 0.4, 'c');
  const w = textWidth('WIRED', s) / 2 + 0.12;
  const wl = w * easeOut((T - OP_SLAM) / 0.8);
  g.line2(-wl, ly - 0.28, wl, ly - 0.28, 0.2, 0.9, 1, 2, 0.85);
  g.line2(-wl * 0.8, ly + 0.28, wl * 0.8, ly + 0.28, 1, 0.3, 0.7, 1.4, 0.5);
  const tag = 'WIREFRAME COCKPIT COMBAT';
  const tn = Math.floor(Math.max(0, (T - OP_SLAM - 0.3) * 40));
  if (tn > 0) drawText(g, tag.slice(0, tn), 0, ly - 0.37, 0.05, 0.7, 0.9, 1, 2, 0.9, 'c');
  if (T < OP_END) return; // メニューはOP後に出す
  if (G.menu === 'main') {
    H.button(g, 'start', 'START', 0, -0.12, 0.42, 0.075, { size: 0.075 });
    H.button(g, 'options', 'OPTIONS', -0.5, -0.36, 0.42, 0.06, { size: 0.055, col: H.C.cyan });
    H.button(g, 'howto', 'HOW TO PLAY', 0.5, -0.36, 0.42, 0.06, { size: 0.055, col: H.C.cyan });
    // ステージ選択
    drawText(g, 'STAGE SELECT', 0, -0.6, 0.04, 0.5, 0.8, 1, 1.8, 0.8, 'c');
    for (let i = 0; i < 4; i++) {
      const un = G.save.reached >= i + 1;
      H.button(g, 's' + (i + 1), String(i + 1), (i - 1.5) * 0.28, -0.73, 0.1, 0.06, { dim: !un, size: 0.06, col: H.C.amber });
    }
    drawText(g, 'HI ' + fmtScore(G.save.hi), 0, -0.9, 0.045, 0.5, 0.8, 1, 1.8, 0.8, 'c');
  } else {
    drawOptions(g, t);
  }
}

const LV = (v) => Math.round(v * 100) + '%';
function drawOptions(g, t) {
  const s = G.settings;
  drawText(g, 'OPTIONS', 0, 0.68, 0.09, 0.2, 0.9, 1, 3, 1, 'c');
  const L = [['music', 'MUSIC  ' + LV(s.music)], ['sfx', 'SOUND FX  ' + LV(s.sfx)], ['vib', 'VIBRATION  ' + (s.vib ? 'ON' : 'OFF')], ['diff', 'DIFFICULTY  ' + ['EASY', 'NORMAL', 'HARD'][s.diff]]];
  const R = [['gfx', 'GRAPHICS  ' + ['AUTO', 'LOW', 'MID', 'HIGH'][s.gfx]], ['aim', 'AIM SPEED  ' + ['SLOW', 'NORMAL', 'FAST'][s.aim === undefined ? 1 : s.aim]], ['lefty', 'LAYOUT  ' + (s.lefty ? 'LEFT-HAND' : 'RIGHT-HAND')]];
  L.forEach((r, i) => H.button(g, r[0], r[1], -0.75, 0.38 - i * 0.2, 0.68, 0.07, { size: 0.05 }));
  R.forEach((r, i) => H.button(g, r[0], r[1], 0.75, 0.38 - i * 0.2, 0.68, 0.07, { size: 0.05 }));
  drawText(g, s.lefty ? 'LEFT HAND: AIM   RIGHT HAND: MOVE' : 'LEFT HAND: MOVE   RIGHT HAND: AIM', 0.75, -0.26, 0.04, 0.5, 0.8, 1, 1.6, 0.8, 'c');
  H.button(g, 'back', 'BACK', 0, -0.72, 0.3, 0.065, { size: 0.06, col: H.C.amber });
}

// ---------- ポーズ ----------
function drawPauseMenu(g, t) {
  const A = g.aspect;
  g.line2(-A, 0, A, 0, 0, 0, 0, 1, 0);
  drawText(g, 'PAUSED', 0, 0.55, 0.12, 0.2, 0.9, 1, 3.4, 1, 'c');
  H.button(g, 'resume', 'RESUME', 0, 0.2, 0.42, 0.07, { size: 0.065 });
  H.button(g, 'restart', 'RESTART STAGE', 0, -0.02, 0.42, 0.06, { size: 0.052, col: H.C.amber });
  H.button(g, 'quit', 'QUIT TO TITLE', 0, -0.22, 0.42, 0.06, { size: 0.052, col: H.C.red });
}

// ---------- ステージクリア ----------
function drawClear(g, t) {
  const k = easeOut(G.stateT / 0.6);
  drawText(g, 'STAGE ' + (G.stageIdx + 1) + ' CLEAR', 0, 0.62, 0.12, 0.2, 1, 0.8, 3.4, k, 'c');
  statRows(g, k);
  if (G.stateT > 0.8) H.button(g, 'next', 'NEXT STAGE', 0, -0.6, 0.4, 0.07, { size: 0.062, pulse: true });
}
function statRows(g, k) {
  const rows = [
    ['SCORE', fmtScore(G.score)], ['ENEMIES', String(G.stageKills || 0)], ['MAX CHAIN', String(G.maxChain)],
    ['GRAZE', String(G.grazes || 0)], ['DAMAGE', String(Math.round(G.dmgTaken - (G.stageDmg0 || 0)))],
  ];
  rows.forEach((r, i) => {
    const a = k * sat((G.stateT - 0.2 - i * 0.12) * 4);
    drawText(g, r[0], -0.55, 0.36 - i * 0.14, 0.055, 0.5, 0.85, 1, 2, a, 'l');
    drawText(g, r[1], 0.55, 0.36 - i * 0.14, 0.065, 1, 1, 1, 2.2, a, 'r');
  });
  const ra = sat((G.stateT - 1.0) * 3);
  const rc = G.rank === 'S' ? H.C.pink : G.rank === 'A' ? H.C.amber : H.C.cyan;
  drawText(g, 'RANK', 1.1, 0.34, 0.05, 0.5, 0.85, 1, 2, ra, 'c');
  drawText(g, G.rank || 'C', 1.1, 0.08, 0.3, rc[0], rc[1], rc[2], 4, ra, 'c');
}

function drawEnding(g, t) {
  drawCineHud(g, t);
  const ct = G.cine ? G.cine.t : 99;
  if (ct < CINE_CARD + 0.5) return;
  // 戦績 (statRows は stateT 基準でフェードインするので、カード表示からの経過時間を渡す)
  const st0 = G.stateT; G.stateT = ct - CINE_CARD - 0.5;
  const k = easeOut(G.stateT / 0.8);
  statRows(g, k);
  drawText(g, 'THANK YOU FOR PLAYING', 0, -0.46, 0.055, 0.8, 0.9, 1, 2, k, 'c');
  if (G.score >= G.save.hi) drawText(g, 'NEW RECORD', 0, -0.54, 0.05, 1, 0.8, 0.2, 2, 0.6 + 0.4 * Math.sin(t * 6), 'c');
  if (G.stateT > 1) H.button(g, 'title', 'TITLE', 0, -0.66, 0.3, 0.065, { size: 0.06, pulse: true });
  G.stateT = st0;
}

function drawOver(g, t) {
  const k = easeOut(G.stateT / 0.8);
  drawText(g, 'MISSION FAILED', 0, 0.5, 0.13, 1, 0.25, 0.2, 3.6, k, 'c');
  drawText(g, 'SCORE ' + fmtScore(G.score), 0, 0.28, 0.07, 1, 1, 1, 2.4, k, 'c');
  drawText(g, 'HI ' + fmtScore(G.save.hi), 0, 0.17, 0.05, 0.5, 0.85, 1, 2, k, 'c');
  if (G.stateT > 0.6) {
    H.button(g, 'retry', 'RETRY STAGE', 0, -0.12, 0.42, 0.07, { size: 0.062, pulse: true });
    H.button(g, 'title', 'TITLE', 0, -0.34, 0.42, 0.06, { size: 0.055, col: H.C.cyan });
  }
}

// デバッグ: 描画なしで n ステップ進める (自動テスト用)
function debugStep(n, dt = 1 / 60, renderEvery = 0) {
  for (let i = 0; i < n; i++) {
    G.time += dt; G.dt = dt;
    update(dt);
    if (renderEvery && i % renderEvery === 0) render(dt);
  }
}

// ノッチ等のセーフエリア(横画面の左右)を HUD 単位で求める
function measureSafeArea() {
  try {
    let p = document.getElementById('safeprobe');
    if (!p) {
      p = document.createElement('div');
      p.id = 'safeprobe';
      p.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;padding-left:env(safe-area-inset-left,0px);padding-right:env(safe-area-inset-right,0px)';
      document.body.appendChild(p);
    }
    const cs = getComputedStyle(p);
    const l = parseFloat(cs.paddingLeft) || 0, r = parseFloat(cs.paddingRight) || 0;
    const h = window.innerHeight || 1;
    G.safeL = Math.min(0.35, l / (h / 2)); G.safeR = Math.min(0.35, r / (h / 2));
  } catch (_) { G.safeL = 0; G.safeR = 0; }
}
