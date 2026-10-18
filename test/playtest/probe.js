// ============================================================
//  probe.js  プレイテスト用の見張り役 (ページの読み込み前に注入する)
//   - 毎フレーム: 数値の異常 (NaN・範囲外), 止まったまま動かない, 状態が長すぎる, ポーズ中に進む
//   - 毎秒: fps, BGM が場面に合っているか / 鳴っているか, 配列の増えすぎ (リーク), メモリ
//   - 操作: テスターが選んだ動き (behavior) から, スティックとペダルの入れ方を決める (実際の入力はタッチで送る)
//   見つけた異常は PT.anoms に種類ごとにまとめる (回数・最初と最後の時刻・例)
// ============================================================
(function () {
  var PT = window.PT = {
    anoms: {}, events: [], t0: performance.now(), frames: 0, fps: 60, fpsLow: [], heap: [],
    stats: { stateT: {}, transitions: {}, seasons: {}, goals: 0, timeups: 0, continues: 0, races: 0, scrapes: 0, spins: 0, maxKmh: 0, assistT: 0, sfx: {} },
    beh: 'idle', behT: 0, lane: 0
  };
  function now() { return (performance.now() - PT.t0) / 1000; }
  PT.now = now;
  function anom(type, detail, data) {
    var k = type + '|' + detail, a = PT.anoms[k];
    if (!a) {
      a = PT.anoms[k] = { type: type, detail: detail, count: 0, first: now(), last: 0, example: data || null, ctx: ctxStr() };
      PT.events.push({ t: now(), kind: 'anomaly', type: type, detail: detail });
    }
    a.count++; a.last = now();
  }
  PT.anom = anom;
  function ev(kind, o) { o = o || {}; o.t = now(); o.kind = kind; PT.events.push(o); if (PT.events.length > 4000) PT.events.splice(0, 1000); }
  function ctxStr() {
    try {
      var g = G.Game, p = g.player;
      return g.state + (g.paused ? '(paused)' : '') + ' mode=' + g.mode + ' season=' + g.season + ' kmh=' + Math.round(p.speed / G.MAX_SPEED * 160) + ' x=' + (+p.x).toFixed(2) + ' beh=' + PT.beh;
    } catch (e) { return '?'; }
  }

  // ---------- エラー ----------
  window.addEventListener('error', function (e) { anom('js-error', String(e.message).slice(0, 160), { src: e.filename + ':' + e.lineno }); });
  window.addEventListener('unhandledrejection', function (e) { anom('promise-rejection', String(e.reason && (e.reason.message || e.reason)).slice(0, 160)); });
  var cerr = console.error;
  console.error = function () { anom('console-error', Array.prototype.join.call(arguments, ' ').slice(0, 160)); return cerr.apply(console, arguments); };

  // ---------- 毎フレームの見張り (ゲームの requestAnimationFrame に相乗り) ----------
  var raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = function (cb) {
    return raf(function (ts) {
      cb(ts);
      PT.frames++;
      try { if (window.G && G.Game && G.Game.player) frameCheck(); } catch (e) { anom('probe-error', String(e.message)); }
    });
  };

  var last = { state: null, stateT: 0, z: 0, paused: false, wall: 0, crash: false, obj: null, assist: false };
  var stuckT = 0, secAcc = 0, lastWall = performance.now(), hookDone = false;
  var LIMIT = { countdown: 6, goal: 30, timeup: 25, gameover: 15 };
  function finite(v) { return typeof v === 'number' && isFinite(v); }

  function hook() {
    hookDone = true;
    if (G.Audio) {
      var sfx = G.Audio.sfx;
      G.Audio.sfx = function (n) { PT.stats.sfx[n] = (PT.stats.sfx[n] || 0) + 1; return sfx.apply(this, arguments); };
    }
  }

  function frameCheck() {
    if (!hookDone) hook();
    var g = G.Game, p = g.player, st = g.state, wall = performance.now();
    var dtw = (wall - lastWall) / 1000; lastWall = wall;
    // 状態遷移
    if (st !== last.state) {
      var key = (last.state || 'boot') + '>' + st;
      PT.stats.transitions[key] = (PT.stats.transitions[key] || 0) + 1;
      ev('state', { from: last.state, to: st, mode: g.mode, season: g.season });
      if (st === 'countdown' && last.state === 'title') PT.stats.races++;
      if (st === 'goal') PT.stats.goals++;
      if (st === 'timeup') PT.stats.timeups++;
      if (st === 'countdown' && last.state === 'gameover') PT.stats.continues++;
      last.state = st; last.stateT = 0;
    }
    if (st === 'race') PT.stats.seasons[g.season] = 1;
    PT.stats.stateT[st] = (PT.stats.stateT[st] || 0) + dtw;
    // 数値
    var nums = { 'P.x': p.x, 'P.z': p.z, 'P.speed': p.speed, 'P.rpm': p.rpm, 'Game.time': g.time, 'Game.score': g.score };
    for (var k in nums) if (!finite(nums[k])) anom('nan', k + ' = ' + nums[k]);
    if (p.speed < 0 || p.speed > G.MAX_SPEED * 1.001) anom('range', 'speed out of range', p.speed);
    if (p.rpm < 0 || p.rpm > 1.0001) anom('range', 'rpm out of range', p.rpm);
    if (!(p.gear >= 1 && p.gear <= 6)) anom('range', 'gear out of range', p.gear);
    if (Math.abs(p.x) > 2.4001) anom('range', 'x out of range', p.x);
    if (st === 'race' && g.time < 0) anom('range', 'time negative in race', g.time);
    var kmh = p.speed / G.MAX_SPEED * 160;
    PT.stats.maxKmh = Math.max(PT.stats.maxKmh, kmh);
    // ポーズ中は進まないこと
    if (g.paused && last.paused && (g.stateT !== last.pausedStateT || p.z !== last.pausedZ)) anom('pause', 'game advanced while paused');
    if (g.paused) { last.pausedStateT = g.stateT; last.pausedZ = p.z; }
    if (last.paused && !g.paused) ev('resume', {});
    if (!last.paused && g.paused) ev('pause', {});
    last.paused = g.paused;
    // 状態が長すぎる (固まり)
    if (!g.paused && LIMIT[st] && g.stateT > LIMIT[st]) anom('stuck-state', st + ' longer than ' + LIMIT[st] + 's');
    if (st === 'ending' && g.stateT > 600) anom('stuck-state', 'ending longer than 600s');
    // アクセルを踏んでいるのに止まったまま
    var I = G.Input;
    if (st === 'race' && !g.paused && I.accel && !I.braking && !p.crash && !p.assist && kmh < 4) stuckT += dtw; else stuckT = 0;
    if (stuckT > 6) { anom('stuck-car', 'accelerating but not moving for 6s'); stuckT = 0; }
    // 出来事
    if (p.crash && !last.crash) { PT.stats.spins++; ev('spin', {}); }
    last.crash = !!p.crash;
    if (p.scrapeObj && p.scrapeObj !== last.obj) { PT.stats.scrapes++; ev('scrape', {}); }
    last.obj = p.scrapeObj;
    if (p.assist) PT.stats.assistT += dtw;
    // 毎秒
    secAcc += dtw;
    if (secAcc >= 1) { perSecond(secAcc); secAcc = 0; }
  }

  // ---------- 毎秒 ----------
  var an = null, anBuf = null, musicT = 0, quietT = 0, lastMusic = null, secN = 0;
  PT.musicRms = 0;
  function musicLevel() {
    var A = G.Audio;
    if (!A || !A.ctx || !A.musicBus) return -1;
    if (!an) { an = A.ctx.createAnalyser(); an.fftSize = 2048; A.musicBus.connect(an); anBuf = new Float32Array(an.fftSize); }
    an.getFloatTimeDomainData(anBuf);
    var s = 0; for (var i = 0; i < anBuf.length; i++) s += anBuf[i] * anBuf[i];
    return Math.sqrt(s / anBuf.length);
  }
  function expectedMusic(g) {
    if (g.state === 'title') return 'title';
    if (g.state === 'race') return G.SEASONS[g.season].key;
    if (g.state === 'goal' || g.state === 'ending') return 'victory';
    if (g.state === 'timeup' || g.state === 'gameover') return null;
    return undefined;   // カウントダウン中は問わない
  }
  function perSecond(sec) {
    var g = G.Game, A = G.Audio;
    secN++;
    PT.fps = PT.frames / sec; PT.frames = 0;
    if (PT.fps < 40 && !g.paused && !document.hidden) PT.fpsLow.push({ t: now(), fps: Math.round(PT.fps), state: g.state });
    if (PT.fpsLow.length > 500) PT.fpsLow.shift();
    // BGM: 場面に合った曲か, 実際に鳴っているか
    var exp = expectedMusic(g), cur = G.Music ? G.Music.current : null;
    var rms = musicLevel(); PT.musicRms = rms;
    if (exp !== undefined && !g.paused) {
      if (cur !== exp) { musicT += sec; if (musicT > 3) { anom('music', 'expected ' + exp + ' but current=' + cur); musicT = 0; } } else musicT = 0;
      var audible = A && A.ctx && A.ctx.state === 'running' && !A.muted && exp;
      if (cur !== lastMusic) { quietT = -8; lastMusic = cur; }   // 曲の書き出しを待つ猶予
      if (audible && rms >= 0 && rms < 0.002) { quietT += sec; if (quietT > 6) { anom('music-silent', exp + ' expected but music bus is silent'); quietT = -30; } }
      else if (quietT > 0) quietT = 0; else quietT = Math.min(0, quietT + sec);
    }
    if (A && A.ctx && A.ctx.state !== 'running' && !g.paused && A.ready && !A.paused && !document.hidden) anom('audio', 'AudioContext ' + A.ctx.state + ' while game running');
    // リーク
    var FX = G.FX, I = G.Input;
    var sizes = { 'FX.fw.sparks': FX && FX.fw ? FX.fw.sparks.length : 0, 'FX.weather': FX ? FX.weather.length : 0, 'FX.puffs': FX ? FX.puffs.length : 0, 'Game.cars': g.cars.length, 'Input.taps': I.taps.length, 'Input.pedals': Object.keys(I.pedals).length };
    var LIM = { 'FX.fw.sparks': 900, 'FX.weather': 1500, 'FX.puffs': 600, 'Game.cars': 40, 'Input.taps': 30, 'Input.pedals': 4 };
    for (var k in sizes) if (sizes[k] > LIM[k]) { anom('leak', k + ' over ' + LIM[k], sizes[k]); var la = PT.anoms['leak|' + k + ' over ' + LIM[k]]; la.example = Math.max(la.example, sizes[k]); }
    PT.sizes = sizes;
    if (secN % 30 === 0 && performance.memory) PT.heap.push({ t: now(), mb: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) });
  }

  // ---------- 操作: behavior → スティックの倒し方とペダル ----------
  //  返り値: { stick: -1..1 (スティックの横位置) か null (触らない), pedal: 'accel' | 'brake' | 'both' | null, float: 浮きスティック }
  function steerToStick(s) {
    // input.js の反応曲線 (0.45f + 0.55f², 遊び 0.08) の逆
    var a = Math.min(1, Math.abs(s)); if (a < 1e-3) return 0;
    var f = (-0.45 + Math.sqrt(0.2025 + 2.2 * a)) / 1.1;
    return Math.sign(s) * (0.08 + f * 0.92);
  }
  function aiLane(P, T, R, seg) {
    var lanes = [-0.66, 0, 0.66], best = PT.lane, bestScore = -1e9;
    lanes.forEach(function (l) {
      var clear = 80, beside = false;
      for (var k = -3; k < 80; k++) {
        var s2 = T.segments[seg.index + k]; if (!s2) continue;
        for (var c = 0; c < s2.cars.length; c++) if (Math.abs(s2.cars[c].x - l) < 0.5) { if (k <= 4) beside = true; if (k > 0) clear = Math.min(clear, k); }
      }
      var score = clear * 1.5 + (l === PT.lane ? 14 : 0) - Math.abs(l - P.x) * 6 - (beside && l !== PT.lane ? 1000 : 0);
      if (score > bestScore) { bestScore = score; best = l; }
    });
    PT.lane = best;
    return best;
  }
  PT.control = function (beh, dt) {
    if (beh !== PT.beh) { PT.beh = beh; PT.behT = 0; }
    PT.behT += dt;
    var g = G.Game, P = g.player, T = G.Track, R = G.R;
    var seg = T.findSegment(P.z + R.playerZ), sp = P.speed / G.MAX_SPEED, t = PT.behT;
    var ca = 0; for (var k = 6; k < 26; k++) ca += (T.segments[seg.index + k] || seg).curve; ca /= 20;
    function toward(x, gain) { return G.clamp(0.18 * seg.curve * sp + (x - P.x) * (gain || 2.6), -1, 1); }
    function carAhead(range) {
      var best = null;
      for (var k = 1; k < range; k++) { var s = T.segments[seg.index + k]; if (!s) break; for (var c = 0; c < s.cars.length; c++) if (!best || k < best.k) best = { k: k, x: s.cars[c].x, slow: s.cars[c].speed < P.speed }; if (best) break; }
      return best;
    }
    var out = { stick: null, pedal: null, float: false };
    switch (beh) {
      case 'drive_good': case 'floating_stick': case 'both_pedals': {
        var lane = aiLane(P, T, R, seg), ahead = 99;
        for (var k3 = 0; k3 < 14; k3++) { var s3 = T.segments[seg.index + k3]; if (s3) for (var c3 = 0; c3 < s3.cars.length; c3++) if (Math.abs(s3.cars[c3].x - P.x) < 0.45 && s3.cars[c3].speed < P.speed) ahead = Math.min(ahead, k3); }
        var brake = 0.18 * Math.abs(ca) * sp > 1.0 || ahead < 8;
        out.stick = steerToStick(toward(lane));
        out.pedal = beh === 'both_pedals' ? 'both' : (brake ? 'brake' : 'accel');
        out.float = beh === 'floating_stick';
        break;
      }
      case 'drive_novice': {   // アクセル踏みっぱなし, 中央を走る, 7 割までしか倒さない
        out.stick = steerToStick(G.clamp(toward(0, 1.4), -0.7, 0.7)); out.pedal = 'accel'; break;
      }
      case 'full_throttle': out.stick = steerToStick(toward(aiLane(P, T, R, seg))); out.pedal = 'accel'; break;
      case 'offroad_left': out.stick = steerToStick(toward(-1.9, 1.5)); out.pedal = 'accel'; break;
      case 'offroad_right': out.stick = steerToStick(toward(1.9, 1.5)); out.pedal = 'accel'; break;
      case 'weave': out.stick = steerToStick(toward(Math.sin(t * 1.6) * 0.95, 3)); out.pedal = 'accel'; break;
      case 'ram_car': { var a = carAhead(60); out.stick = steerToStick(toward(a ? a.x : 0, 3)); out.pedal = 'accel'; break; }
      case 'stop_idle': out.stick = null; out.pedal = P.speed > 1 ? 'brake' : null; break;
      case 'full_lock_left': out.stick = -1; out.pedal = 'accel'; break;
      case 'full_lock_right': out.stick = 1; out.pedal = 'accel'; break;
      case 'coast': out.stick = steerToStick(toward(0)); out.pedal = null; break;
      case 'hold_accel': out.stick = null; out.pedal = 'accel'; break;
      default: out.stick = null; out.pedal = null;
    }
    return out;
  };

  // 観測: テスター (LLM) と操縦ループに渡す今の様子
  PT.snap = function () {
    var g = G.Game, p = g.player, I = G.Input, A = G.Audio, L = I.layout();
    return {
      t: now(), state: g.state, paused: !!g.paused, mode: g.mode, season: g.season, stateT: g.stateT,
      kmh: Math.round(p.speed / G.MAX_SPEED * 160), rpm: Math.round(p.rpmVal || 0), gear: p.gear, x: +(+p.x).toFixed(2),
      time: +(+g.time).toFixed(1), score: Math.floor(g.score), hiscore: g.hiscore, cp: g.nextCheckpoint, continues: g.continues,
      offroad: !!p.offroad, scraping: !!p.scrape, spinning: !!p.crash, assist: !!p.assist,
      music: G.Music ? G.Music.current : null, musicRms: +PT.musicRms.toFixed(4), audio: A && A.ctx ? A.ctx.state : 'none', muted: A ? !!A.muted : false,
      fps: Math.round(PT.fps), W: G.R.W, H: G.R.H, layout: L, modeBtns: G.HUD && G.HUD.modeBtns, soundBtn: G.HUD && G.HUD.soundBtn,
      input: { steer: +I.steer.toFixed(2), accel: !!I.accel, brake: !!I.braking, pedals: Object.keys(I.pedals).length, stick: I.steerId !== null }
    };
  };
  PT.drain = function () { var e = PT.events; PT.events = []; return e; };
})();
