'use strict';
// ============================================================
//  pv_director.js  30 秒 PV の撮影台本 (ゲームのページに読み込んで使う)
//  ゲームを 1/60 秒ずつ進めて 1 コマずつ撮影し, ドット絵のテロップを重ねる。
//  カットは夏の BGM (140BPM のハードロック) の小節の頭に合わせる。
// ============================================================
(function () {
  var PV = window.PV = {};
  var FPS = 60, BAR = G.Music.songBar('summer'), OY = 8;   // BAR: 夏の曲の 1 小節。上 8 行は切り落として 384x216 (x5 = 1920x1080)
  var SCRAPE_STEER = 0.3;   // 擦るカット: 並木に当たった後もこの強さで右に押しつける
  var F, R, T, Game, P, I;
  var events = PV.events = [];   // 音のためのイベント {t, type}
  var log = PV.log = [];         // 毎フレーム [t, rpm, 速度割合, skid, throttle, shot]
  function b(n) { return n * BAR; }

  // ---------- 小物 ----------
  function jp(str, size, o) {
    o = o || {};
    return F.renderJP(str, { size: size, color: o.color || '#ffffff', grad: o.grad, outline: o.outline || '#101018', shadow: o.shadow === undefined ? '#101018' : o.shadow, weight: 'bold' });
  }
  function px(str, scale, o) {
    o = o || {};
    return F.render(str, { scale: scale, bold: true, color: o.color, grad: o.grad, outline: o.outline || '#101018', shadow: o.shadow, outlineDiag: o.diag });
  }
  function zdraw(cv, cx, cy, z, a) {
    var ctx = R.ctx, w = Math.round(cv.width * z), h = Math.round(cv.height * z);
    if (w < 1 || h < 1) return;
    ctx.globalAlpha = G.clamp(a === undefined ? 1 : a, 0, 1);
    ctx.drawImage(cv, Math.round(cx - w / 2), Math.round(cy - h / 2), w, h);
    ctx.globalAlpha = 1;
  }
  // ドンと拡大から着地する出し方 (スプライト拡大)
  function slam(cv, cx, cy, lt, end) {
    if (lt < 0) return;
    var z = lt < 0.16 ? 1 + 2.4 * Math.pow(1 - lt / 0.16, 2) : 1 + 0.025 * Math.sin((lt - 0.16) * 9);
    var a = lt < 0.06 ? lt / 0.06 : 1;
    if (end !== undefined && lt > end - 0.12) a = Math.max(0, (end - lt) / 0.12);
    zdraw(cv, cx, cy, z, a);
  }
  var YEL = ['#fffbd0', '#ffd020', '#ff8a00'], PINK = ['#ffffff', '#ff9ac8', '#ff3a8a'], GRN = ['#e0ffe0', '#40ff60', '#00a020'];

  // ---------- 自動運転 (車線を選んで追い越す) ----------
  PV.lane = 0;
  function ai(o) {
    o = o || {};
    var seg = T.findSegment(P.z + R.playerZ), sp = P.speed / G.MAX_SPEED;
    var lanes = [-0.66, 0, 0.66], best = PV.lane, bestScore = -1e9;
    lanes.forEach(function (l) {
      var clear = 80, beside = false;
      for (var k = -3; k < 80; k++) {
        var s2 = T.segments[seg.index + k];
        if (!s2) continue;
        for (var c = 0; c < s2.cars.length; c++) {
          if (Math.abs(s2.cars[c].x - l) < 0.5) {
            if (k <= 4) beside = true;
            if (k > 0) clear = Math.min(clear, k);
          }
        }
      }
      // 隣に車がいる車線へは移らない
      var score = clear * 1.5 + (l === PV.lane ? 14 : 0) - Math.abs(l - P.x) * 6 - (beside && l !== PV.lane ? 1000 : 0);
      if (score > bestScore) { bestScore = score; best = l; }
    });
    PV.lane = best;
    var ca = 0;
    for (var k2 = 6; k2 < 26; k2++) ca += (T.segments[seg.index + k2] || seg).curve;
    ca /= 20;
    var steer = G.clamp(0.18 * seg.curve * sp + (PV.lane - P.x) * 2.6, -1, 1);
    if (o.steer !== undefined) steer = o.steer;
    I.steerId = 'pv';
    I.direct = steer;
    var ahead = 99;
    for (var k3 = 0; k3 < 14; k3++) {
      var s3 = T.segments[seg.index + k3];
      if (s3) for (var c3 = 0; c3 < s3.cars.length; c3++) if (Math.abs(s3.cars[c3].x - P.x) < 0.45 && s3.cars[c3].speed < P.speed) ahead = Math.min(ahead, k3);
    }
    var brake = o.brake !== undefined ? o.brake : (0.18 * Math.abs(ca) * sp > 1.0 || ahead < 8);
    I.keyB = brake; I.keyA = o.accel !== undefined ? o.accel : !brake;
  }

  function step(o) {
    if (!o || !o.noAi) ai(o);
    Game.update(1 / FPS);
  }

  function place(seg, o) {
    o = o || {};
    Game.setState('race');
    Game.demo = false; Game.paused = false; Game.banner = null;
    Game.time = 99; Game.raceT = o.raceT || 40; Game.lapStart = 0;
    Game.nextCheckpoint = o.cp || 0; Game.season = o.season || 0;
    Game.score = o.score || 0;
    var pre = o.pre === undefined ? 90 : o.pre;
    Game.resetPlayerAt(Math.round(seg - pre * 0.95));
    P.speed = G.MAX_SPEED * (o.speed === undefined ? 0.95 : o.speed);
    P.x = o.x || 0;
    PV.lane = o.x || 0;
    G.FX.reset();
    Game.initCars(o.cars === undefined ? 9 : o.cars, false);
    G.noHud = !o.hud;
    for (var i = 0; i < pre; i++) step(o.ai);
  }

  // ---------- テロップ ----------
  function watermark() {
    var cv = px('SMART RUN', 1, { grad: ['#fff6c0', '#ff4a7a', '#ffb000'], outline: '#2a0a2a' });
    R.ctx.drawImage(cv, R.W - cv.width - 6, OY + 5);
  }
  function seasonCard(s, lt, dur, copy) {
    var se = G.SEASONS[s];
    var cols = [['#ffffff', '#7ac8ff', '#1a5ad8'], ['#ffffff', '#ffb070', '#e04a10'], ['#ffffff', '#e0f0ff', '#7aa0e0'], ['#ffffff', '#ffb0d0', '#ff4a90']][s];
    var k = jp(se.jp, 44, { grad: cols });
    var e = Math.min(1, lt / 0.22), out = lt > dur - 0.2 ? (lt - (dur - 0.2)) / 0.2 : 0;
    var x = Math.round(12 - (1 - (1 - (1 - e) * (1 - e))) * 140 - out * 160);
    var y = OY + 22;
    R.ctx.drawImage(k, x, y);
    R.ctx.drawImage(px(se.name, 2, { color: se.color }), x + k.width + 6, y + 6);
    R.ctx.drawImage(px(se.title, 1, { color: '#ffffff' }), x + k.width + 7, y + 26);
    if (copy && lt > 0.3) {
      var c = jp(copy, 16, {});
      R.ctx.globalAlpha = Math.min(1, (lt - 0.3) / 0.15) * (1 - out);
      R.ctx.drawImage(c, x + 2, y + k.height + 6);
      R.ctx.globalAlpha = 1;
    }
  }
  function callout(text, x, y, ax, ay, lt) {
    if (lt < 0) return;
    var c = jp(text, 14, { color: '#ffffff' });
    var w = c.width + 10, h = c.height + 6, bx = Math.round(x - w / 2), by = Math.round(y - h / 2);
    var a = Math.min(1, lt / 0.12);
    var ctx = R.ctx;
    ctx.globalAlpha = a;
    ctx.fillStyle = '#101830'; ctx.fillRect(bx, by, w, h);
    ctx.fillStyle = '#ffd020'; ctx.fillRect(bx, by, w, 1); ctx.fillRect(bx, by + h - 1, w, 1); ctx.fillRect(bx, by, 1, h); ctx.fillRect(bx + w - 1, by, 1, h);
    ctx.drawImage(c, bx + 5, by + 3);
    // 矢印 (点滅)
    if (Math.floor(lt * 6) % 2 === 0) {
      ctx.fillStyle = '#ffd020';
      var steps = 6;
      for (var i = 0; i <= steps; i++) {
        var px2 = Math.round(G.lerp(x, ax, i / steps)), py2 = Math.round(G.lerp(by + h, ay, i / steps));
        ctx.fillRect(px2 - 1, py2 - 1, 3, 3);
      }
    }
    ctx.globalAlpha = 1;
  }
  function flash(lt) {
    if (lt > 0.06) return;
    R.ctx.fillStyle = 'rgba(255,255,255,' + (0.75 * (1 - lt / 0.06)).toFixed(2) + ')';
    R.ctx.fillRect(0, 0, R.W, R.H);
  }

  // ---------- 撮影台本 ----------
  var scrapeT = null, goalT = null, cpT = null;
  var SHOTS = [
    { // 0: つかみ — 海沿いを全開で
      t0: 0, t1: b(2),
      setup: function () { place(178); },
      over: function (lt) {
        var W = R.W;
        if (lt < BAR) slam(jp('アクセル全開で', 26, { grad: YEL }), W / 2, OY + 62, lt, BAR);
        else slam(jp('四季をかけぬけろ！', 28, { grad: PINK }), W / 2, OY + 62, lt - BAR);
        watermark();
      }
    },
    { // 1: スタート — 3, 2, 1, GO! を拍に合わせて
      t0: b(2), t1: b(3),
      setup: function () { Game.startRace(); G.noHud = true; G.FX.reset(); Game.time = 99; },
      before: function (lt) {
        var beat = BAR / 4;
        if (lt < beat * 3) Game.stateT = 0.6 + (lt / (beat * 3)) * 3.0;
        else if (Game.state === 'countdown') Game.stateT = 3.6;
      },
      over: function (lt) {
        var beat = BAR / 4, n = Math.floor(lt / beat), W = R.W;
        var lab = ['3', '2', '1', 'GO!'][Math.min(3, n)];
        slam(px(lab, 6, { grad: n < 3 ? YEL : GRN, diag: true }), W / 2, OY + 92, lt - n * beat);
        watermark();
      }
    },
    { // 2: 夏 — 海沿いの S 字
      t0: b(3), t1: b(5),
      setup: function () { place(2048, { cars: 6 }); },
      over: function (lt) { seasonCard(0, lt - 0.1, b(2) - 0.1, '海沿いのハイウェイを、かっとばせ！'); watermark(); }
    },
    { // 3: チェックポイント → 秋へ (景色が変わる)
      t0: b(5), t1: b(7),
      setup: function () { place(3266, { cp: 0, season: 0, cars: 5 }); },
      over: function (lt) {
        var W = R.W;
        if (cpT !== null) {
          var c = PV.t - cpT;
          if (c < 1.3 && Math.floor(c * 8) % 2 === 0) slam(px('CHECK POINT!', 3, { grad: YEL }), W / 2, OY + 52, c);
          if (c > 0.5 && c < 2.0) slam(jp('季節が、変わる。', 18, {}), W / 2, OY + 84, c - 0.5, 1.5);
          if (c > 1.9) seasonCard(1, c - 1.9, 99, '紅葉の峠へ');
        }
        watermark();
      }
    },
    { // 4: 秋 — 紅葉の S 字と鳥居
      t0: b(7), t1: b(8),
      setup: function () { place(4436, { cp: 1, season: 1 }); },
      over: function (lt) { seasonCard(1, lt + 1, b(1), '紅葉の峠へ'); watermark(); }
    },
    { // 5: 冬 — 雪の壁と村の灯り
      t0: b(8), t1: b(10),
      setup: function () { place(7560, { cp: 2, season: 2 }); },
      over: function (lt) { seasonCard(2, lt - 0.1, b(2) - 0.1, '雪の夜を、駆けぬけろ。'); watermark(); }
    },
    { // 6: 春 — 桜とお城
      t0: b(10), t1: b(12),
      setup: function () { place(9645, { cp: 3, season: 3 }); },
      over: function (lt) { seasonCard(3, lt - 0.1, b(2) - 0.1, '満開の桜並木を一直線！'); watermark(); }
    },
    { // 7: 操作の紹介 (計器と操作 UI を表示)
      t0: b(12), t1: b(13),
      setup: function () { place(2440, { score: 1284560 }); },
      before: function (lt) { PV.override = (lt > 0.9 && lt < 1.2) ? { brake: true } : null; },
      over: function (lt) {
        var L = I.layout(), W = R.W, ctx = R.ctx;
        // 計器と操作 UI は 16:9 の切り抜きに収まるよう少し下げて描く
        ctx.save(); ctx.translate(0, OY); G.noHud = false; G.HUD.draw(ctx, Game, P); G.noHud = true; ctx.restore();
        slam(jp('スマホ横持ちで、直感操作！', 18, { grad: YEL }), W / 2, OY + 74, lt);
        callout('右手でスティック', L.stick.x - 40, L.stick.y + OY - 54, L.stick.x - 8, L.stick.y + OY - 30, lt - 0.25);
        callout('左手でアクセル・ブレーキ', 98, L.accel.y + OY - 24, 64, L.accel.y + OY + 4, lt - 0.45);
      }
    },
    { // 8: 木にぶつかっても……ガガガッ!! 擦って減速するだけ
      t0: b(13), t1: b(14),
      setup: function () { place(2596, { x: 0.55, cars: 0 }); PV.override = null; },
      before: function (lt) {
        // 右の並木に寄せて, 当たったら軽く押しつけたまま擦りつづける
        if (lt < 0.12) PV.override = { steer: 0.3 };
        else PV.override = { steer: scrapeT === null ? 1 : SCRAPE_STEER, accel: true, brake: false };
      },
      over: function (lt) {
        var W = R.W;
        if (scrapeT === null) slam(jp('木にぶつかっても……', 18, {}), W / 2, OY + 60, lt);
        else {
          var g = PV.t - scrapeT;
          slam(jp('ガガガッ!!', 30, { grad: ['#ffffff', '#ffc040', '#e04010'] }), W / 2, OY + 58, g);
          if (g > 0.3) slam(jp('擦って減速するだけ。走りつづけろ！', 14, {}), W / 2, OY + 94, g - 0.3);
        }
        watermark();
      }
    },
    { // 9: ゴール — 花吹雪の中へ
      t0: b(14), t1: b(16),
      setup: function () { place(11594, { cp: 3, season: 3, cars: 0 }); PV.override = null; },
      over: function (lt) {
        var W = R.W;
        if (goalT === null) slam(jp('ゴールは、花吹雪の中へ。', 18, { grad: PINK }), W / 2, OY + 70, lt);
        else {
          var g = PV.t - goalT;
          slam(px('GOAL!!', 6, { grad: ['#ffffff', '#ff8ac0', '#ff2a7a'], diag: true }), W / 2, OY + 62, g);
          if (g > 0.5) slam(jp('おめでとう！', 16, { grad: YEL }), W / 2, OY + 100, g - 0.5);
        }
      }
    },
    { // 10: エンドカード — ロゴと「いますぐ走りだそう！」
      t0: b(16), t1: 30.01,
      setup: function () { /* ゴール後の花吹雪をそのまま続ける */ },
      over: function (lt) {
        var ctx = R.ctx, W = R.W;
        ctx.fillStyle = 'rgba(20,0,30,' + Math.min(0.42, lt * 1.2).toFixed(2) + ')';
        ctx.fillRect(0, 0, W, R.H);
        var logo = px('SMART RUN', 5, { grad: ['#fff6c0', '#ff4a7a', '#ffb000'], outline: '#2a0a2a', diag: true });
        slam(logo, W / 2, OY + 56, lt);
        if (lt > 0.45) slam(jp('四季をかけぬける、ドット絵ドライブ。', 14, {}), W / 2, OY + 100, lt - 0.45);
        if (lt > 0.85) slam(px('ANDROID  /  BROWSER', 1, { color: '#7ae0ff' }), W / 2, OY + 124, lt - 0.85);
        if (lt > 1.3) {
          var pulse = 1 + 0.06 * Math.sin((lt - 1.3) * 9);
          zdraw(jp('いますぐ、走りだそう！', 20, { grad: YEL }), W / 2, OY + 156, Math.min(1, (lt - 1.3) / 0.15) * pulse, 1);
        }
        G.FX.drawFront(ctx, Game, P, null, true);
      }
    }
  ];

  var cur = -1, shot = null;
  PV.init = function () {
    F = G.Font; R = G.R; T = G.Track; Game = G.Game; P = Game.player; I = G.Input;
    Game.mode = 'hard';   // PV はアーケード仕様 (HARD) で撮る
    G.noHud = true;
  };
  PV.frame = function (i, capture) {
    var t = PV.t = i / FPS;
    var si = 0;
    while (si < SHOTS.length - 1 && t >= SHOTS[si + 1].t0) si++;
    if (si !== cur) {
      cur = si; shot = SHOTS[si];
      shot.setup();
      shot.start = t;
    }
    var lt = t - shot.t0;
    if (shot.before) shot.before(lt);
    // 1 フレーム進める
    var prevCp = Game.nextCheckpoint, prevState = Game.state, hadCrash = !!P.crash, prevObj = P.scrapeObj;
    step(PV.override || undefined);
    if (Game.nextCheckpoint !== prevCp && cur === 3) { cpT = t; events.push({ t: t, type: 'checkpoint' }); }
    if (!hadCrash && P.crash) events.push({ t: t, type: 'crash', kind: P.crash.type, x: +P.x.toFixed(2), shot: cur, seg: Math.floor((P.z + R.playerZ) / T.SEG) });
    if (P.scrapeObj && P.scrapeObj !== prevObj) { if (cur === 8 && scrapeT === null) scrapeT = t; events.push({ t: t, type: 'scrape', shot: cur }); }
    if (prevState !== 'goal' && Game.state === 'goal') { goalT = t; events.push({ t: t, type: 'goal' }); }
    if (cur === 1 && prevState === 'countdown' && Game.state === 'race') events.push({ t: t, type: 'go' });
    log.push([t, P.rpm, P.speed / G.MAX_SPEED, P.skid, (P.throttle ? 1 : 0), cur, P.offroad ? 1 : 0, P.scrape ? 1 : 0]);
    Game.render();
    shot.over(lt);
    if (lt < 0.07 && cur > 0 && cur !== 10) flash(lt);
    if (capture === false) return null;
    // 上 8 行を切り落として返す
    if (!PV.out) { PV.out = G.makeCanvas(R.W, R.H - OY); PV.octx = PV.out.getContext('2d'); }
    PV.octx.drawImage(R.canvas, 0, -OY);
    return PV.out.toDataURL('image/png');
  };
  PV.BAR = BAR;
  PV.step = step;   // ダイジェスト PV (digest_director.js) も同じ自動運転を使う

  // ============================================================
  //  サウンドトラック: ゲームの FM 音源 BGM と効果音をオフラインで合成し WAV (base64) で返す
  // ============================================================
  PV.renderAudio = function () {
    var SR = 44100, DUR = 30;
    var oc = new OfflineAudioContext(2, SR * DUR, SR);
    var master = oc.createGain(); master.gain.value = 0.95;
    var comp = oc.createDynamicsCompressor();
    comp.threshold.value = -12; comp.knee.value = 6; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.2;
    master.connect(comp); comp.connect(oc.destination);
    var M = G.Music;
    var gT = goalT !== null ? goalT : b(14) + 1.0;

    // 1) 夏の BGM: 最初からゴールの瞬間まで
    var m1 = oc.createGain(); m1.connect(master);
    m1.gain.setValueAtTime(1.3, 0);
    M.renderOffline(oc, m1, 'summer', 0, gT);
    m1.gain.setValueAtTime(1.3, gT - 0.03); m1.gain.linearRampToValueAtTime(0, gT + 0.06);
    // 2) エンドカード: タイトル曲で締める
    var m2 = oc.createGain(); m2.connect(master);
    M.renderOffline(oc, m2, 'title', b(16), DUR + 0.5);
    m2.gain.setValueAtTime(1.3, 0); m2.gain.setValueAtTime(1.3, DUR - 0.9); m2.gain.linearRampToValueAtTime(0, DUR - 0.02);

    // 3) 効果音
    var sfx = oc.createGain(); sfx.gain.value = 1.0; sfx.connect(master);
    function hzm(m) { return 440 * Math.pow(2, (m - 69) / 12); }
    function fm(pt, m, t, d, v) { M.fmCtx(oc, sfx, pt, hzm(m), t, d, v); }
    var nb = oc.createBuffer(1, SR * 2, SR), nd = nb.getChannelData(0);
    for (var i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    function nsrc() { var s = oc.createBufferSource(); s.buffer = nb; s.loop = true; return s; }
    function tone(type, f, t, d, v, f2) {
      var o = oc.createOscillator(), g = oc.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(sfx); o.start(t); o.stop(t + d + 0.05);
    }
    function noise(t, d, v, type, f0, f1) {
      var s = nsrc(), f = oc.createBiquadFilter(), g = oc.createGain();
      f.type = type; f.frequency.setValueAtTime(f0, t); if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + d);
      g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      s.connect(f); f.connect(g); g.connect(sfx); s.start(t); s.stop(t + d + 0.05);
    }
    var beat = BAR / 4;
    for (var k = 0; k < 3; k++) tone('square', 440, b(2) + k * beat, 0.22, 0.16);
    tone('square', 880, b(2) + 3 * beat, 0.6, 0.18); tone('square', 1760, b(2) + 3 * beat, 0.3, 0.05);
    events.forEach(function (e) {
      if (e.type === 'checkpoint') {
        [72, 76, 79, 84, 88, 91].forEach(function (m, i) { fm('brass', m, e.t + i * 0.07, 0.22, 0.42); });
        fm('bass', 48, e.t, 0.5, 0.5); fm('bass', 60, e.t + 0.42, 0.3, 0.42);
      } else if (e.type === 'crash') {   // 追突してスピン
        noise(e.t, 0.4, 0.7, 'lowpass', 2500, 200); tone('sine', 140, e.t, 0.3, 0.6, 50);
      } else if (e.type === 'scrape') {   // 木に当たった瞬間 (ゲームの効果音と同じ)
        noise(e.t, 0.3, 0.7, 'bandpass', 2400, 500); noise(e.t, 0.12, 0.55, 'lowpass', 1500); tone('square', 92, e.t, 0.16, 0.28, 46);
      } else if (e.type === 'goal') {
        var seq = [[72, 0, 0.1], [72, 0.12, 0.1], [72, 0.24, 0.12], [77, 0.4, 0.26], [81, 0.7, 0.26], [84, 1.0, 0.18], [81, 1.2, 0.18], [84, 1.4, 1.2]];
        seq.forEach(function (n) { fm('brass', n[0], e.t + n[1], n[2], 0.36); fm('brass', n[0] - 5, e.t + n[1], n[2], 0.16); });
        fm('bass', 41, e.t + 0.4, 0.6, 0.55); fm('bass', 48, e.t + 1.4, 1.2, 0.55);
        [60, 64, 67, 72].forEach(function (m) { fm('strings', m, e.t + 1.4, b(16) - (e.t + 1.4), 0.2); });
        noise(e.t, 1.2, 0.12, 'highpass', 6000, 9000);   // シャラーン
      }
    });

    // 4) エンジン (3 気筒ターボ風) と走行音: 撮影ログの回転数に追従
    var eng = oc.createGain(); eng.gain.value = 0; eng.connect(master);
    var flt = oc.createBiquadFilter(); flt.type = 'lowpass'; flt.Q.value = 2.5;
    var am = oc.createGain(); am.gain.value = 0.6;
    flt.connect(am); am.connect(eng);
    var o1 = oc.createOscillator(); o1.type = 'sawtooth';
    var o2 = oc.createOscillator(); o2.type = 'square';
    var g2 = oc.createGain(); g2.gain.value = 0.5;
    o1.connect(flt); o2.connect(g2); g2.connect(flt);
    var lfo = oc.createOscillator(); lfo.type = 'triangle';
    var lfoG = oc.createGain(); lfoG.gain.value = 0.35; lfo.connect(lfoG); lfoG.connect(am.gain);
    var tb = oc.createOscillator(), tbG = oc.createGain(); tbG.gain.value = 0; tb.connect(tbG); tbG.connect(master);
    function noiseChain(type, f, q) {
      var s = nsrc(), fl = oc.createBiquadFilter(), g = oc.createGain();
      fl.type = type; fl.frequency.value = f; fl.Q.value = q; g.gain.value = 0;
      s.connect(fl); fl.connect(g); g.connect(master); s.start(0);
      return g;
    }
    var skG = noiseChain('bandpass', 1100, 3), wdG = noiseChain('bandpass', 700, 0.6), rbG = noiseChain('lowpass', 180, 1);
    // 擦る音 「ガガガ」 (ゲームと同じ組み方)
    var scS = nsrc(), scBp = oc.createBiquadFilter(); scBp.type = 'bandpass'; scBp.frequency.value = 1300; scBp.Q.value = 0.9;
    var scGr = oc.createOscillator(); scGr.type = 'sawtooth';
    var scLp = oc.createBiquadFilter(); scLp.type = 'lowpass'; scLp.frequency.value = 420;
    var scGrG = oc.createGain(); scGrG.gain.value = 0.55;
    var scAM = oc.createGain(); scAM.gain.value = 0.5;
    var scLfo = oc.createOscillator(); scLfo.type = 'square';
    var scLfoG = oc.createGain(); scLfoG.gain.value = 0.5; scLfo.connect(scLfoG); scLfoG.connect(scAM.gain);
    var scG = oc.createGain(); scG.gain.value = 0;
    scS.connect(scBp); scBp.connect(scAM); scGr.connect(scLp); scLp.connect(scGrG); scGrG.connect(scAM); scAM.connect(scG); scG.connect(master);
    scS.start(0);
    [o1, o2, lfo, tb, scGr, scLfo].forEach(function (o) { o.start(0); });
    var revBeat = BAR / 4;
    log.forEach(function (L) {
      var t = L[0], rpm = L[1], sp = L[2], skid = L[3], thr = L[4], sh = L[5], off = L[6], scr = L[7];
      if (sh === 1 && t < b(2) + 3 * revBeat) {   // スタート前の空ぶかし (拍ごと)
        var lt = (t - b(2)) % revBeat;
        rpm = 0.13 + 0.8 * Math.exp(-lt / 0.14); thr = 1;
      }
      var f = 16 + rpm * 100;   // ゲームと同じ: rpm / 7000 に比例
      o1.frequency.setValueAtTime(f, t); o2.frequency.setValueAtTime(f * 0.5, t); lfo.frequency.setValueAtTime(f * 0.5, t);
      flt.frequency.setValueAtTime(200 + rpm * 1150 + sp * 300, t);
      var vol = (0.06 + rpm * 0.05) * (thr ? 1.15 : 0.85);
      if (sh === 10) vol *= Math.max(0, 1 - (t - b(16)) / 0.6);
      eng.gain.setValueAtTime(vol, t);
      tb.frequency.setValueAtTime(1600 + rpm * 2400, t);
      tbG.gain.setValueAtTime(thr && sp > 0.1 && sh !== 10 ? 0.003 + rpm * 0.005 : 0, t);
      skG.gain.setValueAtTime(sh === 10 ? 0 : skid * 0.08, t);
      wdG.gain.setValueAtTime(sh === 10 ? 0 : sp * sp * 0.04, t);
      rbG.gain.setValueAtTime(off && sp > 0.05 && sh !== 10 ? 0.3 : 0, t);
      scG.gain.setValueAtTime(scr ? 0.34 + sp * 0.4 : 0, t);
      scLfo.frequency.setValueAtTime(15 + sp * 20, t); scGr.frequency.setValueAtTime(48 + sp * 40, t);
    });

    return oc.startRendering().then(function (buf) {
      var Lc = buf.getChannelData(0), Rc = buf.getChannelData(1), n = Lc.length, peak = 0;
      for (var j = 0; j < n; j++) peak = Math.max(peak, Math.abs(Lc[j]), Math.abs(Rc[j]));
      var gn = peak > 0 ? 0.89 / peak : 1;
      var ab = new ArrayBuffer(44 + n * 4), dv = new DataView(ab);
      function str(o, s2) { for (var q = 0; q < s2.length; q++) dv.setUint8(o + q, s2.charCodeAt(q)); }
      str(0, 'RIFF'); dv.setUint32(4, 36 + n * 4, true); str(8, 'WAVE'); str(12, 'fmt ');
      dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true); dv.setUint32(24, SR, true);
      dv.setUint32(28, SR * 4, true); dv.setUint16(32, 4, true); dv.setUint16(34, 16, true); str(36, 'data'); dv.setUint32(40, n * 4, true);
      for (j = 0; j < n; j++) {
        dv.setInt16(44 + j * 4, Math.max(-1, Math.min(1, Lc[j] * gn)) * 32767, true);
        dv.setInt16(46 + j * 4, Math.max(-1, Math.min(1, Rc[j] * gn)) * 32767, true);
      }
      var bytes = new Uint8Array(ab), out = '', CH = 0x8000;
      for (j = 0; j < bytes.length; j += CH) out += String.fromCharCode.apply(null, bytes.subarray(j, j + CH));
      return { wav: btoa(out), peak: peak };
    });
  };
})();
