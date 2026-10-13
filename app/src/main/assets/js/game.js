'use strict';
// ============================================================
//  game.js  メインループ / 自車の物理 / 交通 / ゲーム進行
// ============================================================
(function () {
  var R = G.R, T = G.Track, I = G.Input;
  var STEP = 1 / 60;
  var SEG = T.SEG;
  var MAX_SPEED = SEG * 60;         // 1 フレーム 1 セグメント
  var KMH_MAX = 160;                // 速度計の最高速 (画面の流れる速さとは別)
  var SCORE_KMH = 236;              // スコア計算用の速度の目盛り (ハイスコアの基準を変えないため)

  // ---------- 6 速トランスミッション ----------
  //  ギアごとの 1000rpm あたりの速度 (km/h)。6300rpm でシフトアップ, 2600rpm を切るとシフトダウン
  //  6 速・最高速 160km/h で約 6200rpm
  var GEAR_KMH = [0, 7.1, 11.4, 15.9, 19.7, 23.0, 25.8];
  var IDLE_RPM = 900, SHIFT_UP = 6300, SHIFT_DOWN = 2600, MAX_RPM = 7000;
  G.MAX_RPM = MAX_RPM;
  var ACCEL = MAX_SPEED / 4.6;
  var BRAKE = -MAX_SPEED * 1.05;
  var DECEL = -MAX_SPEED / 3.5;
  var ENGINE_BRAKE = -MAX_SPEED / 9;   // アクセルを離した時の軽い減速
  var OFFROAD_DECEL = -MAX_SPEED / 1.5;
  var OFFROAD_LIMIT = MAX_SPEED / 3.2;
  var SCRAPE_DECEL = -MAX_SPEED * 0.9;   // 木や岩を擦っている間の減速
  var SCRAPE_MIN = MAX_SPEED * 0.18;     // 擦っても これより下までは落とさない
  var SCRAPE_HOLD = 0.2;                 // 1 回当たると この秒数は擦り続ける
  var CENTRIFUGAL = 0.3;
  var STEER_GAIN = 1.65;
  var TIME_PACE = 0.74;             // 制限時間の目安: 最高速の何割で走る想定か

  // ---------- 難易度 ----------
  //  HARD: アーケードそのまま
  //  EASY: 他車が半分, ブレーキアシスト (カーブの手前と前の車) を標準装備
  var MODES = {
    easy: { traffic: 0.5, assist: true, pace: 0.64, hiKey: 'shiki_hiscore_easy' },   // 時間も少し長め
    hard: { traffic: 1, assist: false, pace: TIME_PACE, hiKey: 'shiki_hiscore' }
  };
  var ASSIST_STEER = 0.6;   // アシストは「スティックを 6 割倒せば曲がれる」速さまで落とす

  var Game = G.Game = {
    state: 'boot', stateT: 0, paused: false,
    time: 60, score: 0, hiscore: 0, lapTimes: [], lapStart: 0,
    season: 0, nextCheckpoint: 0, continues: 0,
    banner: null, cars: [], shake: 0, demo: false
  };
  G.MAX_SPEED = MAX_SPEED;
  G.KMH_MAX = KMH_MAX;

  var P = Game.player = {
    x: 0, z: 0, speed: 0, y: 0, turn: 0, turnF: 0,
    crash: null, offroad: false, bounce: 0, wheelT: 0, braking: false,
    skid: 0, rpm: 0, rpmVal: IDLE_RPM, gear: 1, rev: 0, scrape: 0, scrapeT: 0, scrapeObj: null
  };

  function mode() { return MODES[Game.mode] || MODES.hard; }
  function loadHi() {
    try { Game.hiscore = +(localStorage.getItem(mode().hiKey) || 0); } catch (e) { Game.hiscore = 0; }
  }
  Game.setMode = function (m) {
    if (!MODES[m]) return;
    Game.mode = m;
    try { localStorage.setItem('smartrun_mode', m); } catch (e) { /* ignore */ }
    loadHi();
  };
  Game.mode = 'easy';
  try { var savedMode = localStorage.getItem('smartrun_mode'); if (MODES[savedMode]) Game.mode = savedMode; } catch (e) { /* ignore */ }
  loadHi();
  function trafficCount() { return Math.round((G.TRAFFIC_COUNT || 12) * mode().traffic); }

  // ---------- 時間設定 ----------
  function seasonSegs(s) {
    var a = s === 0 ? T.startIndex : T.checkpoints[s - 1];
    var b = s < 3 ? T.checkpoints[s] : T.goalIndex;
    return b - a;
  }
  function seasonTime(s) {
    var t = seasonSegs(s) / (60 * mode().pace);
    return Math.ceil(t / 5) * 5 + (s === 0 ? 5 : 0);
  }
  Game.seasonTime = seasonTime;

  // ---------- 状態遷移 ----------
  function setState(s) {
    Game.state = s; Game.stateT = 0;
    I.clearTaps();
  }
  Game.setState = setState;

  function resetPlayerAt(segIndex) {
    P.z = segIndex * SEG - R.playerZ;
    P.x = 0; P.speed = 0; P.crash = null; P.turnF = 0; P.skid = 0; P.scrape = 0; P.scrapeT = 0; P.scrapeObj = null;
    P.gear = 1; P.rev = 0; P.rpmVal = IDLE_RPM; P.rpm = IDLE_RPM / MAX_RPM;
    I.reset();
  }

  function initCars(count, near) {
    Game.cars.forEach(function (c) { removeCar(c); });
    Game.cars = [];
    for (var i = 0; i < count; i++) {
      var c = { z: 0, x: 0, speed: 0, def: null, seg: null, percent: 0 };
      spawnCar(c, near ? 1 : 0, i / count);
      Game.cars.push(c);
    }
  }
  function removeCar(c) {
    if (c.seg) { var a = c.seg.cars, k = a.indexOf(c); if (k >= 0) a.splice(k, 1); c.seg = null; }
  }
  function placeCar(c) {
    var seg = T.findSegment(c.z);
    if (seg !== c.seg) { removeCar(c); seg.cars.push(c); c.seg = seg; }
    c.percent = (c.z % SEG) / SEG;
  }
  // mode 0: 視界全体に散らす / 1: 遠くに出現
  function spawnCar(c, mode, frac) {
    var pz = P.z + R.playerZ;
    var dist = mode === 0 ? (30 + frac * (R.DRAW_DIST - 40)) * SEG : (R.DRAW_DIST - 10 - Math.random() * 30) * SEG;
    c.z = pz + dist;
    var seg = T.findSegment(c.z);
    if (c.z > T.goalIndex * SEG - SEG * 30 || seg.zone === 'start') { c.z = -1e9; removeCar(c); c.hidden = true; return; }
    c.hidden = false;
    var lane = Math.floor(Math.random() * R.LANES);
    c.x = -1 + (2 * lane + 1) / R.LANES + (Math.random() - 0.5) * 0.1;
    c.tx = Math.random() < 0.25 ? -1 + (2 * Math.floor(Math.random() * R.LANES) + 1) / R.LANES : undefined;
    c.speed = MAX_SPEED * (0.36 + Math.random() * 0.26);
    c.def = G.pickTraffic ? G.pickTraffic(seg.season) : null;
    c.w = c.def ? c.def.img.width * R.UNIT * c.def.zoom / R.ROAD_W : 0.28;
    placeCar(c);
  }

  function updateCars(dt) {
    var pz = P.z + R.playerZ;
    for (var i = 0; i < Game.cars.length; i++) {
      var c = Game.cars[i];
      if (c.hidden) {
        if (Math.random() < dt * 0.8) spawnCar(c, 1, 0);
        continue;
      }
      // ゆっくり車線変更する車もいる (予測しやすいように遠くでだけ)
      var ahead = c.z - pz;
      if (c.tx !== undefined && ahead > SEG * 60) {
        var dl = c.tx - c.x;
        c.x += G.clamp(dl, -dt * 0.25, dt * 0.25);
      }
      c.x = G.clamp(c.x, -0.85, 0.85);
      c.z += c.speed * dt;
      if (c.z < pz - SEG * 6 || c.z > pz + (R.DRAW_DIST + 5) * SEG) spawnCar(c, 1, 0);
      else placeCar(c);
    }
  }

  // ---------- 自車更新 ----------
  function overlap(x1, w1, x2, w2, pct) {
    var half = (pct || 1) / 2;
    return !((x1 + w1 * half) < (x2 - w2 * half) || (x1 - w1 * half) > (x2 + w2 * half));
  }
  var PLAYER_W = G.CAR_BODY_W * R.UNIT / R.ROAD_W;   // 当たり判定は見た目の車幅に合わせる

  // 他車に追突した時のスピン
  function crash(type) {
    if (P.crash) return;
    P.crash = { type: type, t: 0, dur: 1.3, dir: P.x > 0 ? -1 : 1, x0: P.x };
    Game.shake = 0.35;
    if (G.Audio) G.Audio.sfx('hit');
    if (G.FX) G.FX.burst('smoke', R.W / 2, R.H - 12, 8);
  }

  // ブレーキアシストが要るか: 先のカーブを「スティックを少し倒せば曲がれる」速さで迎えられるか,
  // 同じ車線の前の車にぶつからないかを見る
  var ASSIST_DECEL = -BRAKE * 0.8;
  function needAssist(playerSeg) {
    var v = P.speed;
    if (v < MAX_SPEED * 0.3) return false;
    var off = (P.z + R.playerZ) - playerSeg.index * SEG;
    for (var n = 1; n <= 70; n++) {
      var sg = T.segments[playerSeg.index + n];
      if (!sg) break;
      var c = Math.abs(sg.curve);
      if (c < 1) continue;
      var vs = MAX_SPEED * Math.min(1, ASSIST_STEER * STEER_GAIN / (CENTRIFUGAL * c));
      var d = n * SEG - off;
      if (v * v > vs * vs + 2 * ASSIST_DECEL * d) return true;
    }
    for (n = 0; n <= 14; n++) {
      var sc = T.segments[playerSeg.index + n];
      if (!sc) break;
      for (var k = 0; k < sc.cars.length; k++) {
        var car = sc.cars[k], rel = v - car.speed, gap = car.z - (P.z + R.playerZ);
        if (rel <= 0 || gap < 0 || !overlap(P.x, PLAYER_W * 1.15, car.x, car.w, 1)) continue;
        if (gap / rel < 0.9) return true;
      }
    }
    return false;
  }

  function updatePlayer(dt, controlled) {
    var playerSeg = T.findSegment(P.z + R.playerZ);
    var speedPct = P.speed / MAX_SPEED;
    var dx = dt * 2 * speedPct;
    var steer = controlled ? I.steer : 0;
    var braking = controlled && I.braking;
    var throttle = controlled && I.accel;

    // ブレーキアシスト (EASY): 曲がりきれない速さでカーブに近づいた時と, 前の車に追突しそうな時
    P.assist = controlled && !Game.demo && mode().assist && !P.crash && needAssist(playerSeg);
    if (P.assist) { braking = true; throttle = false; }

    if (Game.demo) {
      // デモ走行の自動操縦
      var look = T.findSegment(P.z + R.playerZ + SEG * 18);
      var want = -P.x * 1.8 + look.curve * 0.22;
      steer = G.clamp(want, -1, 1);
      braking = look.curve * look.curve > 30 && speedPct > 0.8;
      throttle = !braking;
    }

    if (P.crash) {
      var cr = P.crash;
      cr.t += dt;
      P.speed = Math.max(0, P.speed - MAX_SPEED * 1.1 * dt);
      P.x += cr.dir * dt * 0.4 * (1 - cr.t / cr.dur);
      if (cr.t >= cr.dur) P.crash = null;
      steer = 0; braking = false; throttle = false;
    } else {
      P.x += steer * dx * STEER_GAIN;
      P.x -= dx * speedPct * playerSeg.curve * CENTRIFUGAL;
      if (Game.state === 'race' || Game.demo || Game.state === 'goal') {
        if (braking) P.speed += BRAKE * dt;
        else if (Game.state === 'goal') P.speed += DECEL * 0.6 * dt;
        else if (throttle) P.speed += ACCEL * dt * (1.12 - speedPct * 0.55);
        else P.speed += ENGINE_BRAKE * dt * (0.4 + speedPct * 0.6);   // エンジンブレーキ
      } else {
        P.speed += DECEL * dt;
      }
    }

    // オフロード
    P.offroad = Math.abs(P.x) > 1.08;
    if (P.offroad && P.speed > OFFROAD_LIMIT) P.speed += OFFROAD_DECEL * dt;
    P.x = G.clamp(P.x, -2.4, 2.4);
    P.speed = G.clamp(P.speed, 0, MAX_SPEED);
    P.braking = braking && P.speed > 1;
    P.throttle = throttle || (Game.state === 'countdown' && I.accel);

    // 路肩の障害物 (木・岩・看板): 壁のように通り抜けられず, ガガガッと擦って減速する
    var scrape = 0, hitObj = null;
    if (Math.abs(P.x) > 1.0) {
      for (var n = 0; n < 2; n++) {
        var sg = T.segments[playerSeg.index + n];
        if (!sg) break;
        for (var k = 0; k < sg.sprites.length; k++) {
          var sp = sg.sprites[k], def = G.SPR[sp.key];
          if (!def || !def.hit) continue;
          var sw = def.img.width * R.UNIT * def.zoom * (sp.zoom || 1) / R.ROAD_W;
          var cxs = sp.offset + (sp.ox || 0) * sw, ow = sw * def.hit;
          if (overlap(P.x, PLAYER_W, cxs, ow, 1)) {
            // 車の中心がある側へ押し出して, 横に接したところで止める (大きな物は数フレームかけて滑り出る)
            scrape = P.x > cxs ? 1 : -1;
            var edge = cxs + scrape * ((PLAYER_W + ow) / 2 + 0.004);
            P.x += G.clamp(edge - P.x, -4 * dt, 4 * dt);
            hitObj = sp;
          }
        }
      }
    }
    if (scrape) {
      if (hitObj !== P.scrapeObj) {   // 新しい木や岩に当たった瞬間
        if (G.Audio) G.Audio.sfx('scrape');
        Game.shake = Math.max(Game.shake, 0.22);
        P.scrapeObj = hitObj;
      }
      P.scrape = scrape;
      P.scrapeT = SCRAPE_HOLD;
    } else if (P.scrapeT > 0) {
      P.scrapeT -= dt;
      if (P.scrapeT <= 0) { P.scrape = 0; P.scrapeObj = null; }
    }
    if (P.scrape) {
      if (P.speed > SCRAPE_MIN) P.speed = Math.max(SCRAPE_MIN, P.speed + SCRAPE_DECEL * dt);
      Game.shake = Math.max(Game.shake, 0.08);
    }
    // 他車と衝突
    if (!P.crash) {
      for (n = 0; n < 2; n++) {
        var sc = T.segments[playerSeg.index + n];
        if (!sc) break;
        for (k = 0; k < sc.cars.length; k++) {
          var car = sc.cars[k];
          if (P.speed > car.speed && overlap(P.x, PLAYER_W, car.x, car.w, 0.85)) {
            var rel = (P.speed - car.speed) / MAX_SPEED;
            if (rel > 0.42) crash('spin');
            else if (G.Audio) G.Audio.sfx('bump');
            P.speed = car.speed * (rel > 0.42 ? 0.5 : 0.8);
            P.x += (P.x >= car.x ? 1 : -1) * 0.04;
            P.z = car.z - R.playerZ - SEG * 0.7;
            Game.shake = Math.max(Game.shake, 0.15);
            break;
          }
        }
      }
    }

    P.z += P.speed * dt;
    if (P.z + R.playerZ > (T.segments.length - 2) * SEG) { P.z = (T.segments.length - 2) * SEG - R.playerZ; P.speed = 0; }

    // 見た目の向き / スキッド / ロール
    var tv = steer * 2.2 + (P.crash ? 0 : 0);
    P.turnF += (tv - P.turnF) * Math.min(1, dt * 12);
    var slip = Math.abs(playerSeg.curve) * speedPct * speedPct;
    P.skid = (!P.crash && !P.offroad && (slip > 3.2 || (braking && speedPct > 0.45))) ? Math.min(1, P.skid + dt * 4) : Math.max(0, P.skid - dt * 5);
    P.wheelT += dt * (1 + speedPct * 18);
    // 起伏で車体が跳ねる
    P.bounce = P.offroad && P.speed > 200 ? (Math.random() * 2 - 1) * 1.2 * speedPct : 0;
    if (P.scrape) P.bounce = (Math.random() * 2 - 1) * 1.6;

    updateEngine(dt, speedPct);

    var pct = (P.z + R.playerZ) % SEG / SEG;
    P.y = G.lerp(playerSeg.p1.world.y, playerSeg.p2.world.y, pct);
    P.seg = playerSeg;
    return playerSeg;
  }

  // ---------- ギアと回転数 (計器とエンジン音) ----------
  function updateEngine(dt, speedPct) {
    var kmh = speedPct * KMH_MAX, g = P.gear || 1;
    function rpmIn(n) { return kmh / GEAR_KMH[n] * 1000; }
    while (g < 6 && rpmIn(g) > SHIFT_UP) g++;
    while (g > 1 && rpmIn(g) < SHIFT_DOWN && rpmIn(g - 1) < SHIFT_UP - 400) g--;
    P.gear = g;
    var target = Math.max(IDLE_RPM, rpmIn(g));
    if (Game.state === 'countdown') {
      // スタート前の空ぶかし
      P.rev = G.clamp(P.rev + (P.throttle ? dt * 2.5 : -dt * 1.5), 0, 1);
      target = IDLE_RPM + P.rev * (6500 - IDLE_RPM);
    } else {
      P.rev = 0;
      // 発進は半クラッチで回転を保つ
      if (g === 1 && P.throttle && !P.crash) target = Math.max(target, 2400 + speedPct * 4000);
    }
    if (P.crash) target = Math.min(target, 1600);
    target = Math.min(target, MAX_RPM);
    P.rpmVal += (target - P.rpmVal) * Math.min(1, dt * 12);
    P.rpm = P.rpmVal / MAX_RPM;
  }

  // ---------- 進行 ----------
  function startRace() {
    Game.demo = false;
    Game.season = 0;
    Game.score = 0;
    Game.lapTimes = [];
    Game.continues = 0;
    Game.time = seasonTime(0);
    Game.nextCheckpoint = 0;
    resetPlayerAt(T.startIndex - 14);
    initCars(trafficCount(), false);
    setState('countdown');
    if (G.Music) G.Music.play(null);
    if (G.Audio) G.Audio.engineOn(true);
  }
  Game.startRace = startRace;

  function startTitle() {
    Game.demo = true;
    Game.demoStart = T.startIndex + 30;
    resetPlayerAt(Game.demoStart);
    P.speed = MAX_SPEED * 0.7;
    Game.score = 0;
    initCars(10, false);
    setState('title');
    if (G.Music) G.Music.play('title');
    if (G.Audio) G.Audio.engineOn(false);
  }
  Game.startTitle = startTitle;

  function continueRace() {
    Game.continues++;
    var s = Game.season;
    var idx = s === 0 ? T.startIndex - 14 : T.checkpoints[s - 1] + 2;
    resetPlayerAt(idx);
    Game.time = seasonTime(s);
    Game.score = 0;
    Game.lapStart = Game.raceT;
    initCars(trafficCount(), false);
    setState('countdown');
    if (G.Music) G.Music.play(null);
    if (G.Audio) G.Audio.engineOn(true);
  }

  function checkProgress() {
    var idx = Math.floor((P.z + R.playerZ) / SEG);
    if (Game.nextCheckpoint < T.checkpoints.length && idx >= T.checkpoints[Game.nextCheckpoint]) {
      var s = Game.nextCheckpoint;
      Game.lapTimes[s] = Game.raceT - Game.lapStart;
      Game.lapStart = Game.raceT;
      Game.nextCheckpoint++;
      Game.season = s + 1;
      var ext = seasonTime(s + 1);
      Game.time += ext;
      Game.banner = { kind: 'checkpoint', t: 0, ext: ext, season: s + 1 };
      if (G.Audio) G.Audio.sfx('checkpoint');
      if (G.Music) G.Music.play(G.SEASONS[s + 1].key);
    }
    if (idx >= T.goalIndex && Game.state === 'race') {
      Game.lapTimes[3] = Game.raceT - Game.lapStart;
      Game.timeBonus = Math.floor(Game.time) * 10000;
      Game.banner = { kind: 'goal', t: 0 };
      setState('goal');
      if (G.Audio) G.Audio.sfx('goal');
      if (G.Music) G.Music.play('victory');   // ファンファーレからビクトリーの曲へ
      if (G.FX) G.FX.setStorm(1);
    }
  }

  // ---------- メイン更新 ----------
  Game.raceT = 0;
  function update(dt) {
    G.time = (G.time || 0) + dt;
    Game.stateT += dt;
    I.update(dt);
    if (Game.shake > 0) Game.shake = Math.max(0, Game.shake - dt);
    if (Game.banner) {
      Game.banner.t += dt;
      var life = Game.banner.kind === 'checkpoint' ? 6.2 : (Game.banner.kind === 'start' ? 3.8 : 1e9);
      if (Game.banner.t > life) Game.banner = null;
    }

    var st = Game.state;
    if (st === 'title') {
      updatePlayer(dt, false);
      updateCars(dt);
      // デモ走行がシーズン終盤まで行ったら最初に戻す
      if (P.z > (Game.demoStart + 2600) * SEG) { resetPlayerAt(Game.demoStart); P.speed = MAX_SPEED * 0.7; }
      // キーボードの ←→ で難易度を選ぶ
      if (I.keyL && Game.mode !== 'easy') Game.setMode('easy');
      if (I.keyR && Game.mode !== 'hard') Game.setMode('hard');
      var tap = I.consumeTap();
      if (tap && Game.stateT > 0.4) {
        if (!G.HUD || !G.HUD.titleTap || G.HUD.titleTap(tap) === 'start') startRace();
      }
    } else if (st === 'countdown') {
      updatePlayer(dt, false);
      var prev = Math.ceil(3.6 - (Game.stateT - dt));
      var cur = Math.ceil(3.6 - Game.stateT);
      if (cur !== prev && cur >= 0 && cur <= 3 && G.Audio) G.Audio.sfx(cur === 0 ? 'go' : 'beep');
      if (Game.stateT >= 3.6) {
        setState('race');
        if (Game.season === 0 && Game.continues === 0) { Game.raceT = 0; Game.lapStart = 0; }
        Game.banner = { kind: Game.season === 0 ? 'start' : 'checkpoint', t: Game.season === 0 ? 0 : 2.4, season: Game.season, ext: 0 };
        if (G.Music) G.Music.play(G.SEASONS[Game.season].key);
      }
    } else if (st === 'race') {
      Game.raceT += dt;
      updatePlayer(dt, true);
      updateCars(dt);
      Game.time -= dt;
      var kmh = P.speed / MAX_SPEED * SCORE_KMH;
      Game.score += Math.pow(kmh, 1.5) * dt * 0.45;
      if (Game.time <= 10 && Math.ceil(Game.time) !== Math.ceil(Game.time + dt) && Game.time > 0 && G.Audio) G.Audio.sfx('tick');
      checkProgress();
      if (Game.time <= 0 && Game.state === 'race') {
        Game.time = 0;
        setState('timeup');
        if (G.Audio) G.Audio.sfx('timeup');
        if (G.Music) G.Music.play(null);
      }
    } else if (st === 'timeup') {
      updatePlayer(dt, false);
      updateCars(dt);
      if (Game.stateT > 3 && P.speed < 1) {
        setState('gameover');
        saveHi();
      }
    } else if (st === 'gameover') {
      updateCars(dt);
      var tp = I.consumeTap();
      if (tp && Game.stateT > 0.8) continueRace();
      else if (Game.stateT > 10.5) startTitle();
    } else if (st === 'goal') {
      updatePlayer(dt, false);
      Game.raceT += 0; // タイマー停止
      if (P.speed < 30 && Game.stateT > 3) {
        P.speed = 0;
        Game.score += Game.timeBonus; Game.timeBonus = 0;
        saveHi();
        setState('ending');
      }
    } else if (st === 'ending') {
      updatePlayer(dt, false);
      var tq = I.consumeTap();
      if (tq && Game.stateT > 3) startTitle();
    }

    // 演出
    if (G.BG && P.seg) G.BG.update(dt, P, P.seg);
    if (G.FX) G.FX.update(dt, Game, P);
    if (G.Audio) G.Audio.update(dt, Game, P);
  }

  function saveHi() {
    if (Game.score > Game.hiscore) {
      Game.hiscore = Math.floor(Game.score);
      try { localStorage.setItem(mode().hiKey, String(Game.hiscore)); } catch (e) { /* ignore */ }
    }
  }

  // ---------- 描画 ----------
  function render() {
    var ctx = R.ctx, W = R.W, H = R.H;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    var shx = 0, shy = 0;
    if (Game.shake > 0) { shx = Math.round((Math.random() * 2 - 1) * 3 * Game.shake / 0.3); shy = Math.round((Math.random() * 2 - 1) * 2 * Game.shake / 0.3); }
    if (shx || shy) ctx.setTransform(1, 0, 0, 1, shx, shy);
    var segNow = T.findSegment(P.z + R.playerZ);
    var sa = T.seasonAt(P.z + R.playerZ);
    if (G.BG) G.BG.draw(ctx, sa, P, segNow);
    else { ctx.fillStyle = '#4af'; ctx.fillRect(0, 0, W, H); }
    if (G.FX && G.FX.drawFireworks) G.FX.drawFireworks(ctx);   // ゴール後の花火 (空に)
    R.renderRoad({ z: P.z, x: P.x, y: P.y });
    R.renderSprites(drawCars);
    if (G.FX) G.FX.drawBehind(ctx, Game, P);
    drawPlayer(ctx);
    if (G.FX) G.FX.drawFront(ctx, Game, P, sa);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (G.HUD) G.HUD.draw(ctx, Game, P);
    // 結果画面の手前にも花びらを舞わせる
    if (G.FX && Game.state === 'ending') G.FX.drawFront(ctx, Game, P, sa, true);
  }

  function drawCars(seg) {
    var UNIT = R.UNIT;
    for (var i = 0; i < seg.cars.length; i++) {
      var c = seg.cars[i];
      if (!c.def) continue;
      var sc = G.lerp(seg.p1.scale, seg.p2.scale, c.percent);
      if (sc <= 0) continue;
      var sx = G.lerp(seg.p1.sx, seg.p2.sx, c.percent) + sc * c.x * R.ROAD_W;
      var sy = G.lerp(seg.p1.sy, seg.p2.sy, c.percent);
      var img = c.def.img;
      var dw = img.width * UNIT * c.def.zoom * sc, dh = img.height * UNIT * c.def.zoom * sc;
      // 遠近で左右どちらに見えるか (道路中心からのずれでフレーム選択)
      var frames = c.def.frames;
      if (frames) {
        var rel = (sx - R.W / 2) / (R.W / 2);
        img = rel < -0.35 ? frames[2] : (rel > 0.35 ? frames[1] : frames[0]);
      }
      R.drawScaled(img, sx, sy, dw, dh, seg.clip);
    }
  }

  var carArt = null;
  function drawPlayer(ctx) {
    if (!carArt) carArt = G.buildPlayerCar();
    var t = Math.round(G.clamp(P.turnF, -2, 2));
    var xoff = 0;
    if (P.crash) {   // スピン
      var seq = [0, 1, 2, 1, 0, -1, -2, -1];
      t = seq[Math.floor(P.crash.t * 16) % seq.length];
      xoff = Math.sin(P.crash.t * 10) * 3;
    } else if (P.scrape) {   // 擦っている間は小刻みに揺れる
      xoff = Math.round(Math.random() * 2 - 1);
    }
    var wf = Math.floor(P.wheelT) & 1;
    var img = carArt.frames[t][wf][P.braking ? 1 : 0];
    var cx = Math.round(R.W / 2 + xoff), by = R.H - 1 + Math.round(P.bounce);
    ctx.drawImage(img, cx - (img.width >> 1), by - carArt.groundY);
    Game.carScreen = { x: cx, y: by, w: img.width };
  }

  // ---------- 画面サイズ ----------
  function resize() {
    var rc = R.canvas.getBoundingClientRect();
    var vw = rc.width || window.innerWidth, vh = rc.height || window.innerHeight;
    var rot = document.getElementById('rotate');
    if (rot) rot.className = vh > vw ? 'on' : '';
    var aspect = Math.max(vw, 1) / Math.max(vh, 1);
    var W = Math.round(R.H * aspect);
    W = G.clamp(W, 300, 560);
    if (W !== R.W || !Game.sized) {
      R.resize(W);
      Game.sized = true;
      if (G.BG) G.BG.resize(W, R.H);
      if (G.HUD && G.HUD.resize) G.HUD.resize(W, R.H);
    }
  }

  // ---------- ループ ----------
  var acc = 0, last = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    if (!last) last = now;
    var dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (Game.paused) {
      if (I.taps.length) { Game.pause(false); I.clearTaps(); }
      render(); return;
    }
    acc += dt;
    var stepped = false;
    while (acc >= STEP) { update(STEP); acc -= STEP; stepped = true; }
    if (stepped) render();
  }

  // Android の戻るボタン: タイトルなら終了 / 走行中はポーズ / ポーズ中ならタイトルへ
  Game.back = function () {
    if (Game.state === 'title') return 'exit';
    if (Game.paused) { Game.pause(false); startTitle(); return 'title'; }
    Game.pause(true);
    return 'pause';
  };

  Game.pause = function (on) {
    Game.paused = on;
    if (G.Audio) G.Audio.suspend(on);
    // 押しっぱなしのまま中断されたタッチを解除
    I.releaseAll();
    if (!on) { I.clearTaps(); last = 0; }
  };

  function boot() {
    R.init(document.getElementById('game'));
    I.init();
    if (G.buildScenery) G.buildScenery();
    if (G.buildTraffic) G.buildTraffic();
    if (G.BG && G.BG.build) G.BG.build();
    T.build();
    resize();
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) Game.pause(true);
    });
    startTitle();
    // Android アプリ (WebView) では触る前から音を出せるので, タイトル曲をすぐ鳴らす (ブラウザでは最初のタップまで待つ)
    if (G.Audio && /; wv\)/.test(navigator.userAgent)) G.Audio.unlock();
    // デバッグ: #seg=1234 でその位置からデモ走行
    var m = /seg=(\d+)/.exec(location.hash);
    if (m) { Game.demoStart = +m[1]; resetPlayerAt(+m[1]); P.speed = MAX_SPEED * 0.8; initCars(10, false); }
    if (/race/.test(location.hash)) { startRace(); if (m) { resetPlayerAt(+m[1]); Game.state = 'race'; P.speed = MAX_SPEED * 0.8; } }
    if (/nohud/.test(location.hash)) G.noHud = true;
    requestAnimationFrame(frame);
  }
  Game.update = update; Game.render = render; Game.resize = resize;
  // 動画 (PV) 撮影用のフック
  Game.resetPlayerAt = resetPlayerAt; Game.initCars = initCars;
  window.addEventListener('load', boot);
})();
