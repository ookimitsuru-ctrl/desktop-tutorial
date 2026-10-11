'use strict';
// ============================================================
//  hud.js  計器・メッセージ・タイトル画面・操作UI (ハンドル/ブレーキ)
// ============================================================
(function () {
  var C = G.col, F = G.Font;
  var HUD = G.HUD = {};
  var YEL = ['#fffbd0', '#ffd020', '#ff8a00'], OUTL = '#3a1400';

  // ---------- ハンドル (回転ごとにドット絵を生成してキャッシュ) ----------
  var wheelCache = new Map();
  function wheelImg(deg) {
    var key = Math.round(deg / 3) * 3;
    var hit = wheelCache.get(key);
    if (hit) return hit;
    var S = 66, c = S / 2, p = new G.PX(S, S), a = key * Math.PI / 180;
    var ca = Math.cos(a), sa = Math.sin(a);
    var RIM = ['#0e0e12', '#1c1c24', '#2e2e3a', '#464656', '#6a6a80'].map(function (h) { return C(h); });
    var SIL = ['#4a5060', '#7a8294', '#a8b0c0', '#d4dae4', '#f4f6fa'].map(function (h) { return C(h); });
    for (var y = 0; y < S; y++) for (var x = 0; x < S; x++) {
      var dx = x + 0.5 - c, dy = y + 0.5 - c, r = Math.hypot(dx, dy);
      if (r > 30.5) continue;
      // ハンドル座標系 (u: 右, v: 下)
      var u = dx * ca + dy * sa, v = -dx * sa + dy * ca;
      var col = 0;
      if (r >= 24.5) {
        var nx = dx / r, ny = dy / r;
        var depth = (r - 24.5) / 6; // 0..1 (内→外)
        var l = -(nx * -0.6 + ny * -0.8) * 0.6 + (0.5 - Math.abs(depth - 0.5)) * 0.9;
        var li = G.clamp(Math.floor(l * 4 + 1.5), 0, 4);
        if (G.dither(x, y, (l * 4 + 1.5) % 1) && li < 4) li++;
        col = RIM[G.clamp(li, 0, 4)];
        // 12時の目印
        if (v < 0 && Math.abs(u) < 2.6) col = Math.abs(u) < 1.2 ? C('#ffffff') : C('#e82a2a');
        // グリップの縫い目
        if ((Math.abs(u) > 18) && Math.abs(v) < 12 && ((Math.round(r * 3 + v) & 3) === 0)) col = RIM[1];
      } else if (r < 9) {
        col = r < 4.5 ? (r < 2.5 ? C('#ffd040') : C('#e02828')) : (r < 5.5 ? SIL[3] : SIL[1]);
        if (r >= 5.5 && dx + dy < -2) col = SIL[2];
      } else if ((Math.abs(v) < 3.2 && Math.abs(u) > 8) || (v > 7 && Math.abs(u) < 3.6)) {
        var shade = Math.abs(u) > 8 ? (v < -1 ? 3 : (v < 1.2 ? 2 : 1)) : (u < -1 ? 3 : (u < 1.2 ? 2 : 1));
        col = SIL[shade];
      }
      if (col) p.d[y * S + x] = col;
    }
    p.outline(C('#060608'));
    var cv = p.toCanvas();
    wheelCache.set(key, cv);
    return cv;
  }

  // ---------- ブレーキペダル ----------
  var pedal = [];
  function buildPedal() {
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
    var big = F.render('SHIKI DRIVE', { scale: 4, bold: true, grad: ['#fff6c0', '#ff4a7a', '#ffb000'], outline: '#2a0a2a', outlineDiag: true });
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
    // SCORE
    F.text(ctx, 'SCORE', 72, 5, { color: '#7ae0ff', outline: '#002040', bold: true });
    F.text(ctx, String(Math.floor(Game.score)), 72, 15, { color: '#ffffff', outline: '#102030', bold: true });
    // 季節の進行 (夏→秋→冬→春)
    drawCourseMap(ctx, Game, P);
    // LAP
    var lapT = Game.state === 'race' ? Game.raceT - Game.lapStart : (Game.lapTimes[Game.season] || 0);
    F.text(ctx, 'LAP', W - 74, 5, { color: '#80ff80', outline: '#003010', bold: true });
    F.text(ctx, fmtLap(lapT), W - 6, 5, { color: '#ffffff', outline: '#102030', align: 'right' });
    // 速度
    var kmh = Math.round(P.speed / G.MAX_SPEED * G.KMH_MAX);
    F.text(ctx, String(kmh), W - 34, 16, { scale: 2, bold: true, grad: ['#ffffff', '#c0f0ff', '#60c0ff'], outline: '#001830', align: 'right' });
    F.text(ctx, 'KM/H', W - 6, 23, { color: '#ffe040', outline: OUTL, align: 'right' });
    // タコメーター
    var n = 16, lit = Math.round(P.rpm * n), x0 = W - 6 - n * 4 + 1;
    for (var i = 0; i < n; i++) {
      var on = i < lit;
      var col = i < 9 ? (on ? '#40ff60' : '#0a3010') : (i < 13 ? (on ? '#ffe030' : '#3a3008') : (on ? '#ff3030' : '#3a0808'));
      ctx.fillStyle = '#000';
      ctx.fillRect(x0 + i * 4 - 1, 33 - Math.floor(i / 3), 5, 6 + Math.floor(i / 3) + 1);
      ctx.fillStyle = col;
      ctx.fillRect(x0 + i * 4, 34 - Math.floor(i / 3), 3, 5 + Math.floor(i / 3));
    }
    F.text(ctx, 'GEAR ' + P.gear, x0 - 4, 33, { color: '#c0c8d8', outline: '#101018', align: 'right' });
  }

  function drawCourseMap(ctx, Game, P) {
    var T = G.Track, W = G.R.W;
    var bw = 16, gap = 18, total = bw * 4 + gap * 3, x0 = Math.round(W / 2 - total / 2), y0 = 4;
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
    var wimg = wheelImg(I.wheel);
    ctx.drawImage(wimg, Math.round(L.wheel.x - wimg.width / 2), Math.round(L.wheel.y - wimg.height / 2));
    var on = I.braking;
    var pimg = pedal[on ? 1 : 0];
    ctx.drawImage(pimg, L.brake.x, L.brake.y + (on ? 2 : 0));
    ctx.globalAlpha = 1;
    var hint = Game.state === 'countdown';
    if (hint) {
      F.text(ctx, 'BRAKE', L.brake.x + 20, L.brake.y - 9, { color: '#ffffff', outline: '#000000', align: 'center' });
      F.text(ctx, 'STEER', L.wheel.x, L.wheel.y - 42, { color: '#ffffff', outline: '#000000', align: 'center' });
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

  function drawTitle(ctx, Game) {
    var W = G.R.W, H = G.R.H, t = Game.stateT;
    // ロゴは拡大しながら登場
    var z = t < 0.6 ? 0.2 + (t / 0.6) * 0.8 : 1 + Math.sin(t * 2) * 0.015;
    zoomDraw(ctx, logo, W / 2, 50, z);
    if (t > 0.6) {
      var jp = F.renderJP('四季ドライブ', { size: 14, color: '#ffffff', outline: '#2a0a2a' });
      ctx.drawImage(jp, Math.round(W / 2 - jp.width / 2), 74);
      var y = 96;
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
    if (blink(2)) F.text(ctx, 'TAP TO START', W / 2, 124, { scale: 2, bold: true, grad: YEL, outline: OUTL, align: 'center' });
    var help = F.renderJP('右のハンドルで操作 / 左でブレーキ / アクセルは自動', { size: 11, color: '#ffffff', outline: '#101018' });
    ctx.drawImage(help, Math.round(W / 2 - help.width / 2), 146);
    F.text(ctx, 'HI-SCORE ' + Game.hiscore, W / 2, 162, { color: '#7ae0ff', outline: '#002040', align: 'center', bold: true });
    // サウンド切替ボタン
    var on = G.Audio ? !G.Audio.muted : false;
    var bx = W - 64, by = 6;
    panel(ctx, bx, by, 58, 14);
    F.text(ctx, on ? 'SOUND ON' : 'SOUND OFF', bx + 29, by + 4, { color: on ? '#80ff80' : '#ff8080', align: 'center' });
    HUD.soundBtn = { x: bx, y: by, w: 58, h: 14 };
    F.text(ctx, 'CAR: SMART ROADSTER COUPE', 6, 8, { color: '#ffffff', outline: '#101018' });
  }
  HUD.titleTap = function (tap) {
    var b = HUD.soundBtn;
    if (b && tap.x >= b.x - 6 && tap.x <= b.x + b.w + 6 && tap.y >= b.y - 6 && tap.y <= b.y + b.h + 6) {
      if (G.Audio) G.Audio.setMuted(!G.Audio.muted);
      return true;
    }
    return false;
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
      if (st === 'race' || st === 'countdown') drawBanner(ctx, Game);
      if (st === 'timeup' || st === 'gameover') drawGameOver(ctx, Game);
      if (st === 'goal' || st === 'ending') drawGoal(ctx, Game);
      if (st === 'countdown' || st === 'race' || st === 'timeup') drawControls(ctx, Game);
    }
    if (Game.paused) {
      var W = G.R.W, H = G.R.H;
      ctx.fillStyle = 'rgba(0,0,20,0.55)'; ctx.fillRect(0, 0, W, H);
      F.text(ctx, 'PAUSE', W / 2, H / 2 - 20, { scale: 3, bold: true, grad: YEL, outline: OUTL, align: 'center' });
      F.text(ctx, 'TAP TO RESUME', W / 2, H / 2 + 12, { bold: true, color: '#ffffff', outline: '#101018', align: 'center' });
    }
  };
})();
