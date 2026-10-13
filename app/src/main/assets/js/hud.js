'use strict';
// ============================================================
//  hud.js  計器・メッセージ・タイトル画面・操作UI (スティック/ペダル)
// ============================================================
(function () {
  var C = G.col, F = G.Font;
  var HUD = G.HUD = {};
  var YEL = ['#fffbd0', '#ffd020', '#ff8a00'], OUTL = '#3a1400';

  // ---------- アナログスティック (台座とノブのドット絵) ----------
  var stickBase = null, stickKnob = [];
  function buildStick() {
    var S = 58, c = S / 2, p = new G.PX(S, S);
    var RING = ['#1a1b22', '#2a2c36', '#3e414e', '#5a5e6e', '#8a90a2'].map(function (h) { return C(h); });
    var WELL = ['#0a0b0f', '#111218', '#181a22', '#20232c'].map(function (h) { return C(h); });
    for (var y = 0; y < S; y++) for (var x = 0; x < S; x++) {
      var dx = x + 0.5 - c, dy = y + 0.5 - c, r = Math.hypot(dx, dy), col = 0;
      if (r > 27.5) continue;
      var nx = dx / (r || 1), ny = dy / (r || 1);
      if (r >= 23.5) {
        // 外周の縁: 左上が明るい
        var l = 2 - (nx * 0.6 + ny * 0.8) * 1.6 - Math.abs(r - 25.5) * 0.35, li = Math.floor(l);
        if (G.dither(x, y, l - li)) li++;
        col = RING[G.clamp(li, 0, 4)];
      } else {
        // くぼんだ内側: 左上が影, 右下が少し明るい
        var w = 1.4 + (nx * 0.6 + ny * 0.8) * (r / 23.5) * 1.3, wi = Math.floor(w);
        if (G.dither(x, y, w - wi)) wi++;
        col = WELL[G.clamp(wi, 0, 3)];
        if (Math.abs(r - 15) < 0.6) col = RING[0];   // 中ほどの溝
      }
      p.d[y * S + x] = col;
    }
    // 左右の矢印
    [-1, 1].forEach(function (sd) {
      for (var i = 0; i < 4; i++) p.vline(Math.round(c + sd * (19 - i)), c - i, c + i, C(i === 3 ? '#c8ccd8' : '#8a90a2'));
    });
    p.outline(C('#060608'));
    stickBase = p.toCanvas();

    [false, true].forEach(function (on) {
      var K = 28, k = K / 2, q = new G.PX(K, K);
      var RUB = ['#16171c', '#24262e', '#343742', '#4a4e5c'].map(function (h) { return C(h); });
      var TOP = ['#2a2d36', '#3a3e4a', '#4e5361', '#666b7c', '#8a90a2'].map(function (h) { return C(h); });
      // 影
      q.ellipse(k + 1, k + 2, 12, 12, G.rgba(0, 0, 0, 110));
      for (var yy = 0; yy < K; yy++) for (var xx = 0; xx < K; xx++) {
        var ddx = xx + 0.5 - k, ddy = yy + 0.5 - k, rr = Math.hypot(ddx, ddy), cc = 0;
        if (rr > 12.2) continue;
        var ux = ddx / (rr || 1), uy = ddy / (rr || 1);
        if (rr >= 9.6) {
          // ゴムのグリップ (ぎざぎざ)
          var ang = Math.atan2(ddy, ddx), knurl = Math.floor((ang + Math.PI) / (Math.PI * 2) * 20) & 1;
          var lv = 1.5 - (ux * 0.6 + uy * 0.8) * 1.3 + (knurl ? 0.4 : -0.2), lj = Math.floor(lv);
          cc = RUB[G.clamp(lj, 0, 3)];
          if (on && rr < 10.6) cc = C('#e0353d');   // 押している間は赤いリング
        } else {
          // へこんだ天面: 縁の左上が明るく, 中は右下が明るい
          var tv = 2.2 + (ux * 0.6 + uy * 0.8) * (rr / 9.6) * 1.4 - (rr > 8.2 ? (ux * 0.6 + uy * 0.8) * 2.4 : 0), ti = Math.floor(tv);
          if (G.dither(xx, yy, tv - ti)) ti++;
          cc = TOP[G.clamp(ti, 0, 4)];
          if (rr < 1.6) cc = TOP[1];
        }
        q.set(xx, yy, cc);
      }
      q.outline(C('#060608'));
      stickKnob.push(q.toCanvas());
    });
  }

  // ---------- ブレーキペダル / アクセルペダル ----------
  var pedal = [], pedalA = [];
  function buildAccel() {
    [false, true].forEach(function (on) {
      var W = 30, H = 62, p = new G.PX(W, H);
      // アーム (上から吊り下げ)
      p.rect(W / 2 - 2, 0, 4, 8, C('#6a7080')); p.vline(W / 2 - 2, 0, 7, C('#a0a8b8'));
      p.rrect(3, 6, W - 6, H - 8, 4, 0, function (x, y, i, j) {
        var w = W - 6, h = H - 8;
        if (i < 2 || j < 2) return C('#d8dce6');
        if (i >= w - 2 || j >= h - 2) return C('#6a7080');
        // 縦の滑り止め
        var rib = ((i - 3) % 4) < 2;
        return rib ? (on ? C('#1e6a2a') : C('#24242c')) : (on ? C('#3aa040') : C('#3a3a46'));
      });
      p.outline(on ? C('#60ff70') : C('#0a0a0e'));
      if (on) p.outline(G.rgba(80, 255, 110, 120));
      pedalA.push(p.toCanvas());
    });
  }
  function buildPedal() {
    buildAccel();
    [false, true].forEach(function (on) {
      var W = 40, H = 54, p = new G.PX(W, H);
      // アーム
      p.rect(W / 2 - 2, 0, 4, 10, C('#6a7080')); p.vline(W / 2 - 2, 0, 9, C('#a0a8b8'));
      p.rrect(3, 8, W - 6, H - 12, 5, 0, function (x, y, i, j) {
        var w = W - 6, h = H - 12;
        if (i < 2 || j < 2) return C('#d8dce6');
        if (i >= w - 2 || j >= h - 2) return C('#6a7080');
        // ゴムの滑り止め
        var rub = ((j - 4) % 5) < 3 ? (on ? C('#5a1a1a') : C('#24242c')) : (on ? C('#8a2a2a') : C('#3a3a46'));
        return rub;
      });
      p.outline(on ? C('#ff5040') : C('#0a0a0e'));
      if (on) p.outline(G.rgba(255, 80, 60, 120));
      pedal.push(p.toCanvas());
    });
  }

  // ---------- ロゴ ----------
  var logo = null;
  function buildLogo() {
    var big = F.render('SMART RUN', { scale: 4, bold: true, grad: ['#fff6c0', '#ff4a7a', '#ffb000'], outline: '#2a0a2a', outlineDiag: true });
    var p = new G.PX(big.width + 8, big.height + 6);
    // 影
    var sh = G.pxFromCanvas(big);
    sh.map(function () { return C('#1a0820'); });
    p.blit(sh, 5, 5);
    p.blit(G.pxFromCanvas(big), 1, 1);
    logo = p.toCanvas();
  }

  HUD.resize = function () {
    if (!pedal.length) buildPedal();
    if (!stickBase) buildStick();
    if (!logo) buildLogo();
  };

  function fmtLap(t) {
    t = Math.max(0, t);
    var m = Math.floor(t / 60), s = Math.floor(t % 60), cs = Math.floor((t * 100) % 100);
    return m + "'" + (s < 10 ? '0' : '') + s + '"' + (cs < 10 ? '0' : '') + cs;
  }
  HUD.fmtLap = fmtLap;
  function blink(rate) { return Math.floor((G.time || 0) * rate) % 2 === 0; }

  // 拡大縮小しながら描く (スプライト拡大演出)
  function zoomDraw(ctx, cv, cx, cy, z, alpha) {
    var w = Math.round(cv.width * z), h = Math.round(cv.height * z);
    if (w < 1 || h < 1) return;
    if (alpha !== undefined && alpha < 1) ctx.globalAlpha = Math.max(0, alpha);
    ctx.drawImage(cv, Math.round(cx - w / 2), Math.round(cy - h / 2), w, h);
    ctx.globalAlpha = 1;
  }

  // ---------- 走行中の計器 ----------
  function drawGauges(ctx, Game, P) {
    var W = G.R.W;
    // TIME
    F.text(ctx, 'TIME', 7, 5, { color: '#ffe040', outline: OUTL, bold: true });
    var tv = Math.max(0, Math.ceil(Game.time));
    var low = Game.time <= 10 && Game.state === 'race';
    if (!low || blink(4)) {
      F.text(ctx, String(tv), 7, 15, { scale: 3, bold: true, grad: low ? ['#ffffff', '#ff4040', '#c00000'] : YEL, outline: OUTL });
    }
    // 難易度
    var ez = Game.mode === 'easy';
    F.text(ctx, ez ? 'EASY' : 'HARD', 8, 39, { bold: true, color: ez ? '#80ff80' : '#ff7070', outline: '#101018' });
    // SCORE
    F.text(ctx, 'SCORE', 72, 5, { color: '#7ae0ff', outline: '#002040', bold: true });
    F.text(ctx, String(Math.floor(Game.score)), 72, 15, { color: '#ffffff', outline: '#102030', bold: true });
    // 季節の進行 (夏→秋→冬→春)
    drawCourseMap(ctx, Game, P);
    // 右上: アナログのタコメーター, その左に LAP と速度
    var tx = W - 4 - TACH_S, rx = tx - 4;
    var lapT = Game.state === 'race' ? Game.raceT - Game.lapStart : (Game.lapTimes[Game.season] || 0);
    var lapS = fmtLap(lapT);
    F.text(ctx, 'LAP', rx - F.width(lapS) - 4, 5, { color: '#80ff80', outline: '#003010', bold: true, align: 'right' });
    F.text(ctx, lapS, rx, 5, { color: '#ffffff', outline: '#102030', align: 'right' });
    var kmh = Math.round(P.speed / G.MAX_SPEED * G.KMH_MAX);
    F.text(ctx, String(kmh), rx, 17, { scale: 2, bold: true, grad: ['#ffffff', '#c0f0ff', '#60c0ff'], outline: '#001830', align: 'right' });
    F.text(ctx, 'KM/H', rx, 34, { color: '#ffe040', outline: OUTL, align: 'right' });
    drawTach(ctx, tx, 2, P);
  }

  // ---------- アナログのタコメーター (0〜7000rpm, 目盛りの数字は 1〜7) ----------
  var TACH_R = 27, TACH_S = TACH_R * 2 + 2, tachFace = null;
  var TACH_A0 = Math.PI * 0.75, TACH_SWEEP = Math.PI * 1.5;   // 左下 (0rpm) から時計回りに 270°
  function tachAngle(r) { return TACH_A0 + TACH_SWEEP * G.clamp(r, 0, 1.02); }   // r = rpm / 7000
  function buildTach() {
    var S = TACH_S, c = S / 2, p = new G.PX(S, S);
    var BEZ = ['#2a2c34', '#4a4e5a', '#7a808e', '#b8bec8', '#eef0f4'].map(function (h) { return C(h); });
    var FACE = ['#07080c', '#0c0e14', '#12141c', '#181b24'].map(function (h) { return C(h); });
    var red0 = tachAngle(6 / 7), red1 = tachAngle(1);
    for (var y = 0; y < S; y++) for (var x = 0; x < S; x++) {
      var dx = x + 0.5 - c, dy = y + 0.5 - c, r = Math.hypot(dx, dy), col = 0;
      if (r > TACH_R + 0.4) continue;
      var nx = dx / (r || 1), ny = dy / (r || 1);
      if (r >= TACH_R - 2.2) {
        // メッキの縁: 左上が明るい
        var l = 2 - (nx * 0.6 + ny * 0.8) * 1.8, li = Math.floor(l);
        if (G.dither(x, y, l - li)) li++;
        col = BEZ[G.clamp(li, 0, 4)];
      } else {
        var f = 1.6 - r / TACH_R * 1.2 - (nx * 0.6 + ny * 0.8) * 0.5, fi = Math.floor(f);
        if (G.dither(x, y, f - fi)) fi++;
        col = FACE[G.clamp(fi, 0, 3)];
        // レッドゾーン (6000〜7000rpm) の帯
        var a = Math.atan2(dy, dx); if (a < TACH_A0 - 0.01) a += Math.PI * 2;
        if (r >= TACH_R - 6.5 && r < TACH_R - 3 && a >= red0 && a <= red1) col = C(r < TACH_R - 5 ? '#801010' : '#d02020');
      }
      p.d[y * S + x] = col;
    }
    // 目盛り: 1000rpm ごとに長い線, 500rpm ごとに短い線
    for (var k = 0; k <= 14; k++) {
      var ang = tachAngle(k / 14), major = k % 2 === 0, red = k >= 12;
      var r0 = major ? TACH_R - 8.5 : TACH_R - 5.5, r1 = TACH_R - 2.6;
      for (var t = r0; t <= r1; t += 0.5) {
        p.set(c + Math.cos(ang) * t, c + Math.sin(ang) * t, C(red ? '#ff6a5a' : (major ? '#ffffff' : '#9aa0b0')));
      }
    }
    p.outline(C('#060608'));
    tachFace = p.toCanvas();
    // 数字 1〜7 (6, 7 は赤)
    var g = tachFace.getContext('2d');
    for (k = 1; k <= 7; k++) {
      var a2 = tachAngle(k / 7);
      F.text(g, String(k), Math.round(c + Math.cos(a2) * (TACH_R - 14)), Math.round(c + Math.sin(a2) * (TACH_R - 14)) - 3,
        { color: k >= 6 ? '#ff6a5a' : '#ffffff', align: 'center' });
    }
  }
  function drawTach(ctx, x0, y0, P) {
    if (!tachFace) buildTach();
    ctx.drawImage(tachFace, x0, y0);
    var c = TACH_S / 2, cx = x0 + c, cy = y0 + c;
    // ギア (下の空いた所)
    ctx.fillStyle = '#000'; ctx.fillRect(Math.round(cx - 6), Math.round(cy + 9), 12, 11);
    ctx.fillStyle = '#5a4010'; ctx.fillRect(Math.round(cx - 5), Math.round(cy + 10), 10, 9);
    F.text(ctx, String(P.gear || 1), Math.round(cx), Math.round(cy + 11), { color: '#ffd040', align: 'center', bold: true });
    // 針: 影, 本体の順に 1px ずつ打つ
    var a = tachAngle(P.rpm), ca = Math.cos(a), sa = Math.sin(a), len = TACH_R - 4;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    for (var t = -4; t <= len; t += 0.6) ctx.fillRect(Math.round(cx + ca * t) + 1, Math.round(cy + sa * t) + 1, 1, 1);
    for (t = -4; t <= len; t += 0.6) {
      ctx.fillStyle = t > len - 6 ? '#ffd0a0' : '#ff5a20';
      ctx.fillRect(Math.round(cx + ca * t), Math.round(cy + sa * t), t < len - 6 ? 2 : 1, t < len - 6 ? 2 : 1);
    }
    // 中心のキャップ
    ctx.fillStyle = '#101014'; ctx.fillRect(Math.round(cx) - 2, Math.round(cy) - 2, 5, 5);
    ctx.fillStyle = '#6a707e'; ctx.fillRect(Math.round(cx) - 1, Math.round(cy) - 1, 3, 3);
    ctx.fillStyle = '#c8ccd6'; ctx.fillRect(Math.round(cx) - 1, Math.round(cy) - 1, 1, 1);
  }

  function drawCourseMap(ctx, Game, P) {
    var T = G.Track, W = G.R.W;
    var bw = 16, gap = 18, total = bw * 4 + gap * 3, x0 = Math.round(W / 2 - total / 2), y0 = 4;
    // 狭い画面 (4:3 など) では SCORE と重ならないよう 2 段目へ
    if (W < 360) { gap = 12; total = bw * 4 + gap * 3; x0 = Math.round(W / 2 - total / 2) - 10; y0 = 30; }
    var pz = (P.z + G.R.playerZ) / T.SEG;
    var marks = [T.startIndex, T.checkpoints[0], T.checkpoints[1], T.checkpoints[2], T.goalIndex];
    ctx.fillStyle = '#101018';
    ctx.fillRect(x0 + bw / 2, y0 + 7, total - bw, 3);
    var prog = 0;
    for (var s = 0; s < 4; s++) {
      var a = marks[s], b = marks[s + 1];
      if (pz >= b) prog = s + 1;
      else if (pz > a) prog = s + (pz - a) / (b - a);
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x0 + bw / 2, y0 + 8, Math.round(prog * (bw + gap)), 1);
    for (s = 0; s < 4; s++) {
      var se = G.SEASONS[s], bx = x0 + s * (bw + gap);
      var active = Math.floor(prog) === s || (s === 3 && prog >= 3);
      ctx.fillStyle = '#101018'; ctx.fillRect(bx - 1, y0 - 1, bw + 2, bw + 2);
      ctx.fillStyle = se.color; ctx.fillRect(bx, y0, bw, bw);
      if (!active && prog < s) { ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(bx, y0, bw, bw); }
      var k = F.renderJP(se.jp, { size: 14, color: '#ffffff', outline: '#101018' });
      ctx.drawImage(k, Math.round(bx + bw / 2 - k.width / 2), Math.round(y0 + bw / 2 - k.height / 2));
    }
    // 自車マーカー
    var mx = Math.round(x0 + bw / 2 + prog * (bw + gap));
    if (blink(3)) {
      ctx.fillStyle = '#101018'; ctx.fillRect(mx - 3, y0 + 17, 7, 5);
      ctx.fillStyle = '#ff3a3a'; ctx.fillRect(mx - 2, y0 + 18, 5, 3);
    }
  }

  // ---------- 操作UI ----------
  function drawControls(ctx, Game) {
    var L = G.Input.layout(), I = G.Input;
    var faded = Game.state === 'title';
    ctx.globalAlpha = faded ? 0.55 : 0.9;
    // スティック: 触っている間は指を置いた所が中心
    var o = I.origin || L.stick, held = I.steerId !== null && I.steerId !== 'pv';
    ctx.drawImage(stickBase, Math.round(o.x - stickBase.width / 2), Math.round(o.y - stickBase.height / 2));
    var kimg = stickKnob[held ? 1 : 0];
    ctx.drawImage(kimg, Math.round(o.x + I.stickX * L.stick.r - kimg.width / 2), Math.round(o.y + I.stickY * L.stick.r - kimg.height / 2));
    var assist = Game.player.assist && Game.state === 'race';
    var on = I.braking || assist;
    var pimg = pedal[on ? 1 : 0];
    ctx.drawImage(pimg, L.brake.x, L.brake.y + (on ? 2 : 0));
    var onA = I.accel;
    ctx.drawImage(pedalA[onA ? 1 : 0], L.accel.x, L.accel.y + (onA ? 2 : 0));
    ctx.globalAlpha = 1;
    if (assist && blink(6)) F.text(ctx, 'BRAKE ASSIST', L.brake.x, L.accel.y - 11, { bold: true, color: '#ffe040', outline: '#3a1400' });
    var hint = Game.state === 'countdown';
    if (hint) {
      F.text(ctx, 'BRAKE', L.brake.x + 20, L.brake.y - 9, { color: '#ffffff', outline: '#000000', align: 'center' });
      F.text(ctx, 'ACCEL', L.accel.x + 15, L.accel.y - 9, { color: '#80ff80', outline: '#000000', align: 'center' });
      F.text(ctx, 'STEER', L.stick.x, L.stick.y - 40, { color: '#ffffff', outline: '#000000', align: 'center' });
    }
  }

  // ---------- 各種メッセージ ----------
  function seasonCard(ctx, s, t) {
    var W = G.R.W, se = G.SEASONS[s];
    if (t > 3.6) return;
    var z = t < 0.45 ? 0.15 + (t / 0.45) * 0.85 : 1;
    var a = t > 3.0 ? 1 - (t - 3.0) / 0.6 : 1;
    var k = F.renderJP(se.jp, { size: 36, color: '#ffffff', outline: '#101018', shadow: '#101018' });
    zoomDraw(ctx, k, W / 2, 92, z * 1.6, a);
    if (t > 0.45) {
      ctx.globalAlpha = Math.max(0, a);
      F.text(ctx, se.name, W / 2, 122, { scale: 2, bold: true, color: se.color, outline: '#101018', align: 'center' });
      F.text(ctx, se.title, W / 2, 140, { color: '#ffffff', outline: '#101018', align: 'center', bold: true });
      ctx.globalAlpha = 1;
    }
  }

  function drawCountdown(ctx, Game) {
    var W = G.R.W, t = Game.stateT;
    var n = Math.ceil(3.6 - t);
    var label = n > 3 ? null : (n > 0 ? String(n) : 'GO!');
    if (label && t < 3.6) {
      var frac = 1 - ((3.6 - t) % 1);
      var cv = F.render(label, { scale: 4, bold: true, grad: n > 0 ? YEL : ['#e0ffe0', '#40ff60', '#00a020'], outline: '#101018' });
      zoomDraw(ctx, cv, W / 2, 118, 2.2 - frac * 1.3, 1);
    }
    if (t < 1.2) {
      F.text(ctx, 'READY?', W / 2, 104, { scale: 2, bold: true, color: '#ffffff', outline: '#101018', align: 'center' });
    }
  }
  // スタートシグナル (ゲート上のランプ)
  G.startLightFrame = function () {
    var Game = G.Game;
    if (Game.state === 'countdown') {
      var n = Math.ceil(3.6 - Game.stateT);
      if (n <= 0) return 4;
      return G.clamp(4 - n, 0, 3);
    }
    return Game.state === 'title' ? 0 : 4;
  };

  function drawBanner(ctx, Game) {
    var b = Game.banner, W = G.R.W;
    if (!b) return;
    if (b.kind === 'checkpoint') {
      if (b.t < 2.4 && blink(5)) {
        F.text(ctx, 'CHECK POINT!', W / 2, 46, { scale: 2, bold: true, grad: ['#ffffff', '#ffd040', '#ff6020'], outline: '#301000', align: 'center' });
      }
      if (b.t < 2.4) {
        F.text(ctx, 'EXTENDED TIME  +' + b.ext + ' SEC', W / 2, 66, { color: '#ffffff', outline: '#101018', align: 'center', bold: true });
      } else {
        seasonCard(ctx, b.season, b.t - 2.4);
      }
    } else if (b.kind === 'start') {
      seasonCard(ctx, 0, b.t);
    }
  }

  function panel(ctx, x, y, w, h) {
    ctx.fillStyle = 'rgba(8,10,30,0.78)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y + h - 1, w, 1); ctx.fillRect(x, y, 1, h); ctx.fillRect(x + w - 1, y, 1, h);
  }

  // タイトルの難易度ボタン
  var MODE_BTN = {
    easy: { label: 'EASY', sub: 'ブレーキアシスト付き', grad: ['#ffffff', '#a0ffa0', '#20c040'], edge: '#60ff70', fill: 'rgba(10,50,20,0.82)' },
    hard: { label: 'HARD', sub: 'アーケード仕様', grad: ['#ffffff', '#ffb0a0', '#ff3a2a'], edge: '#ff6050', fill: 'rgba(60,10,10,0.82)' }
  };
  function modeButtons(W) {
    var bw = 104, bh = 34, gap = 12, x0 = Math.round(W / 2 - bw - gap / 2), y = 85;
    return { easy: { x: x0, y: y, w: bw, h: bh }, hard: { x: x0 + bw + gap, y: y, w: bw, h: bh } };
  }

  function drawTitle(ctx, Game) {
    var W = G.R.W, t = Game.stateT;
    // ロゴは拡大しながら登場
    var z = t < 0.6 ? 0.2 + (t / 0.6) * 0.8 : 1 + Math.sin(t * 2) * 0.015;
    zoomDraw(ctx, logo, W / 2, 44, z);
    if (t > 0.6) {
      var y = 72;
      var names = G.SEASONS.map(function (s) { return s.name; });
      var tot = 0, gap = 14;
      names.forEach(function (n) { tot += F.width(n, { bold: true }) + gap; });
      var x = W / 2 - (tot - gap) / 2;
      names.forEach(function (n, i) {
        F.text(ctx, n, x, y, { bold: true, color: G.SEASONS[i].color, outline: '#101018' });
        x += F.width(n, { bold: true });
        if (i < 3) F.text(ctx, '>', x + 4, y, { color: '#ffffff', outline: '#101018' });
        x += gap;
      });
    }
    // 難易度ボタン (押すとそのモードでスタート)
    var btns = modeButtons(W);
    HUD.modeBtns = btns;
    ['easy', 'hard'].forEach(function (m) {
      var b = btns[m], d = MODE_BTN[m], sel = Game.mode === m;
      ctx.fillStyle = d.fill; ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = sel ? d.edge : '#5a5e6e';
      ctx.fillRect(b.x, b.y, b.w, 1); ctx.fillRect(b.x, b.y + b.h - 1, b.w, 1); ctx.fillRect(b.x, b.y, 1, b.h); ctx.fillRect(b.x + b.w - 1, b.y, 1, b.h);
      if (sel) { ctx.fillRect(b.x - 1, b.y - 1, b.w + 2, 1); ctx.fillRect(b.x - 1, b.y + b.h, b.w + 2, 1); ctx.fillRect(b.x - 1, b.y - 1, 1, b.h + 2); ctx.fillRect(b.x + b.w, b.y - 1, 1, b.h + 2); }
      if (!sel) ctx.globalAlpha = 0.6;
      F.text(ctx, d.label, b.x + b.w / 2, b.y + 4, { scale: 2, bold: true, grad: d.grad, outline: '#101018', align: 'center' });
      var sub = F.renderJP(d.sub, { size: 10, color: '#ffffff', outline: '#101018' });
      ctx.drawImage(sub, Math.round(b.x + b.w / 2 - sub.width / 2), b.y + 21);
      ctx.globalAlpha = 1;
      if (sel && blink(2)) F.text(ctx, '>', b.x - 9, b.y + 11, { scale: 2, bold: true, grad: YEL, outline: OUTL });
    });
    if (blink(2)) F.text(ctx, 'TAP A MODE TO START', W / 2, 123, { bold: true, grad: YEL, outline: OUTL, align: 'center' });
    // 操作の説明はスティックの台座 (下から 79px) より上に収める
    var help = F.renderJP('右のスティックで操作 / 左のペダルでブレーキ・アクセル', { size: W < 360 ? 10 : 11, color: '#ffffff', outline: '#101018' });
    ctx.drawImage(help, Math.round(W / 2 - help.width / 2), 133);
    F.text(ctx, 'HI-SCORE ' + (Game.mode === 'easy' ? '(EASY) ' : '(HARD) ') + Game.hiscore, W / 2, 150, { color: '#7ae0ff', outline: '#002040', align: 'center', bold: true });
    // サウンド切替ボタン
    var on = G.Audio ? !G.Audio.muted : false;
    var bx = W - 64, by = 6;
    panel(ctx, bx, by, 58, 14);
    F.text(ctx, on ? 'SOUND ON' : 'SOUND OFF', bx + 29, by + 4, { color: on ? '#80ff80' : '#ff8080', align: 'center' });
    HUD.soundBtn = { x: bx, y: by, w: 58, h: 14 };
    F.text(ctx, 'CAR: SMART ROADSTER COUPE', 6, 8, { color: '#ffffff', outline: '#101018' });
  }
  function hitBox(tap, b, pad) { return b && tap.x >= b.x - pad && tap.x <= b.x + b.w + pad && tap.y >= b.y - pad && tap.y <= b.y + b.h + pad; }
  // タイトルのタップ: 'sound' (切り替えただけ) / 'start' (スタート)。難易度ボタンならそのモードを選んでスタート
  HUD.titleTap = function (tap) {
    if (hitBox(tap, HUD.soundBtn, 6)) {
      if (G.Audio) G.Audio.setMuted(!G.Audio.muted);
      return 'sound';
    }
    var btns = HUD.modeBtns;
    if (btns && !tap.key) {
      if (hitBox(tap, btns.easy, 4)) G.Game.setMode('easy');
      else if (hitBox(tap, btns.hard, 4)) G.Game.setMode('hard');
    }
    return 'start';
  };

  function drawGameOver(ctx, Game) {
    var W = G.R.W;
    if (Game.state === 'timeup') {
      if (blink(3)) F.text(ctx, 'TIME UP', W / 2, 70, { scale: 3, bold: true, grad: ['#ffffff', '#ff5050', '#a00000'], outline: '#200000', align: 'center' });
      return;
    }
    panel(ctx, W / 2 - 110, 48, 220, 92);
    F.text(ctx, 'GAME OVER', W / 2, 58, { scale: 2, bold: true, grad: ['#ffffff', '#ff6060', '#c00000'], outline: '#200000', align: 'center' });
    F.text(ctx, 'SCORE ' + Math.floor(Game.score), W / 2, 82, { color: '#ffffff', align: 'center', bold: true });
    var left = Math.max(0, Math.ceil(10 - Game.stateT));
    F.text(ctx, 'CONTINUE? ' + left, W / 2, 98, { scale: 2, bold: true, grad: YEL, outline: OUTL, align: 'center' });
    var jp = F.renderJP(G.SEASONS[Game.season].jp + 'のコースからやり直し — タップ', { size: 11, color: '#ffffff', outline: '#101018' });
    ctx.drawImage(jp, Math.round(W / 2 - jp.width / 2), 120);
  }

  function drawGoal(ctx, Game) {
    var W = G.R.W, t = Game.stateT;
    if (Game.state === 'goal') {
      var z = t < 0.5 ? 0.2 + t / 0.5 * 1.0 : 1.2 + Math.sin(t * 6) * 0.04;
      var cv = F.render('GOAL!!', { scale: 4, bold: true, grad: ['#ffffff', '#ff8ac0', '#ff2a7a'], outline: '#3a0020' });
      zoomDraw(ctx, cv, W / 2, 64, z);
      if (t > 1) F.text(ctx, 'CONGRATULATIONS!', W / 2, 96, { scale: 2, bold: true, grad: YEL, outline: OUTL, align: 'center' });
      return;
    }
    // ending: リザルト
    panel(ctx, W / 2 - 120, 18, 240, 168);
    var jp = F.renderJP('おつかれさまでした!', { size: 16, color: '#ffd0e4', outline: '#3a0020' });
    ctx.drawImage(jp, Math.round(W / 2 - jp.width / 2), 26);
    F.text(ctx, Game.mode === 'easy' ? 'EASY' : 'HARD', W / 2 + 114, 22, { bold: true, color: Game.mode === 'easy' ? '#80ff80' : '#ff7070', align: 'right' });
    var y = 52;
    for (var s = 0; s < 4; s++) {
      var se = G.SEASONS[s];
      if (t > 0.4 + s * 0.3) {
        var k = F.renderJP(se.jp, { size: 13, color: '#ffffff', outline: '#101018' });
        ctx.drawImage(k, W / 2 - 98, y - 4);
        F.text(ctx, se.name, W / 2 - 80, y, { color: se.color, bold: true, outline: '#101018' });
        F.text(ctx, fmtLap(Game.lapTimes[s] || 0), W / 2 + 96, y, { color: '#ffffff', align: 'right' });
      }
      y += 14;
    }
    var total = 0; for (s = 0; s < 4; s++) total += Game.lapTimes[s] || 0;
    if (t > 1.8) F.text(ctx, 'TOTAL  ' + fmtLap(total), W / 2 + 96, y + 4, { color: '#ffe040', bold: true, align: 'right', outline: OUTL });
    if (t > 2.2) {
      F.text(ctx, 'SCORE', W / 2 - 96, y + 22, { color: '#7ae0ff', bold: true });
      F.text(ctx, String(Math.floor(Game.score)), W / 2 + 96, y + 20, { scale: 2, bold: true, grad: YEL, outline: OUTL, align: 'right' });
    }
    if (t > 2.6 && Game.score >= Game.hiscore && blink(3)) F.text(ctx, 'NEW RECORD!', W / 2, y + 44, { bold: true, color: '#ff80c0', outline: '#3a0020', align: 'center' });
    if (t > 3 && blink(2)) F.text(ctx, 'TAP TO TITLE', W / 2, y + 60, { bold: true, color: '#ffffff', outline: '#101018', align: 'center' });
  }

  HUD.draw = function (ctx, Game, P) {
    if (G.noHud) return;
    var st = Game.state;
    if (st === 'title') {
      drawTitle(ctx, Game);
      drawControls(ctx, Game);
    } else {
      if (st !== 'ending') drawGauges(ctx, Game, P);
      if (st === 'countdown') drawCountdown(ctx, Game);
      if (st === 'race' && Game.stateT < 0.8 && Game.raceT < 1) {
        var go = F.render('GO!', { scale: 4, bold: true, grad: ['#e0ffe0', '#40ff60', '#00a020'], outline: '#101018' });
        zoomDraw(ctx, go, G.R.W / 2, 118, 1.0 + Game.stateT * 1.2, 1 - Game.stateT / 0.8);
      }
      if (st === 'race' || st === 'countdown') drawBanner(ctx, Game);
      if (st === 'timeup' || st === 'gameover') drawGameOver(ctx, Game);
      if (st === 'goal' || st === 'ending') drawGoal(ctx, Game);
      if (st === 'countdown' || st === 'race' || st === 'timeup') drawControls(ctx, Game);
      // 発進のヒント (止まっていてアクセルを踏んでいない時)
      if ((st === 'race' && P.speed < 60 && !G.Input.accel && Game.stateT > 0.5) && blink(2)) {
        var L = G.Input.layout();
        var hj = F.renderJP('アクセルを押して発進!', { size: 13, color: '#80ff80', outline: '#002000' });
        ctx.drawImage(hj, Math.round(G.R.W / 2 - hj.width / 2), 150);
        F.text(ctx, '<', L.accel.x + 34, L.accel.y + 26, { scale: 2, bold: true, color: '#80ff80', outline: '#002000' });
      }
    }
    if (Game.paused) {
      var W = G.R.W, H = G.R.H;
      ctx.fillStyle = 'rgba(0,0,20,0.55)'; ctx.fillRect(0, 0, W, H);
      F.text(ctx, 'PAUSE', W / 2, H / 2 - 20, { scale: 3, bold: true, grad: YEL, outline: OUTL, align: 'center' });
      F.text(ctx, 'TAP TO RESUME', W / 2, H / 2 + 12, { bold: true, color: '#ffffff', outline: '#101018', align: 'center' });
    }
  };
})();
