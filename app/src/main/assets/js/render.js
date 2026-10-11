'use strict';
// ============================================================
//  render.js  疑似3D道路 (走査線レンダラ) とスプライト拡大縮小描画
// ============================================================
(function () {
  var R = G.R = {};
  R.H = 224;            // 内部解像度 (高さ固定, 幅は画面比で決定)
  R.W = 400;
  R.HOR = 100;          // 地平線の y
  R.F = 262;            // 焦点距離 (px)
  R.CAM_H = 1000;       // カメラ高さ
  R.ROAD_W = 2000;      // 道路の半幅 (ワールド単位)
  R.DRAW_DIST = 260;    // 描画セグメント数
  R.LANES = 3;
  R.playerZ = R.F * R.CAM_H / (R.H - R.HOR);  // カメラ→自車 の距離 (= 画面最下段の奥行き)
  R.UNIT = R.playerZ / R.F;                    // 自車位置での 1px あたりのワールド単位
  R.NEAR = 40;
  R.pitch = 0;          // 坂道でのカメラの傾き (px)

  var buf, buf32, roadCv, roadCtx, imgData;

  R.init = function (canvas) {
    R.canvas = canvas;
    R.ctx = G.ctx2d(canvas);
  };
  R.resize = function (W) {
    R.W = W;
    R.canvas.width = W; R.canvas.height = R.H;
    R.ctx = G.ctx2d(R.canvas);
    roadCv = G.makeCanvas(W, R.H);
    roadCtx = roadCv.getContext('2d');
    imgData = roadCtx.createImageData(W, R.H);
    buf32 = new Uint32Array(imgData.data.buffer);
  };

  function project(p, camX, camY, camZ) {
    var cz = p.world.z - camZ;
    p.cz = cz;
    if (cz <= 1) { p.scale = 0; return; }
    var sc = R.F / cz;
    p.scale = sc;
    p.sx = R.W / 2 + sc * (p.world.x - camX);
    p.sy = R.HOR + R.pitch - sc * (p.world.y - camY);
    p.sw = sc * R.ROAD_W;
  }

  // 霧レベル (0..15)
  function fogLevel(cz) {
    var start = R.SEG * R.DRAW_DIST * 0.22, end = R.SEG * R.DRAW_DIST * 0.98;
    var f = (cz - start) / (end - start);
    if (f <= 0) return 0;
    if (f >= 1) return G.FOG_LEVELS - 1;
    return Math.round(Math.pow(f, 1.15) * (G.FOG_LEVELS - 1));
  }

  function fillRow(row, x0, x1, c) {
    x0 = x0 | 0; x1 = x1 | 0;
    if (x0 < 0) x0 = 0;
    if (x1 > R.W) x1 = R.W;
    if (x1 > x0) buf32.fill(c, row + x0, row + x1);
  }

  // ---------------------------------------------------------
  //  カメラからセグメントを投影し、道路を走査線で描く
  //  cam = { z, x(playerX), y(world y of player), curveOffset }
  // ---------------------------------------------------------
  R.renderRoad = function (cam) {
    var T = G.Track, segs = T.segments, SEG = T.SEG;
    R.SEG = SEG;
    var W = R.W, H = R.H;
    buf32.fill(0);
    var baseSeg = T.findSegment(cam.z);
    var basePercent = (cam.z % SEG) / SEG;
    var camX = cam.x * R.ROAD_W, camY = cam.y + R.CAM_H;
    var x = 0, dx = -(baseSeg.curve * basePercent);
    var maxy = H;  // これより下の行は描画済み
    R.visible = [];
    var sparkleT = (G.time || 0);

    for (var n = 0; n < R.DRAW_DIST; n++) {
      var seg = segs[baseSeg.index + n];
      if (!seg) break;
      seg.p1.world.x = 0; seg.p2.world.x = 0;
      project(seg.p1, camX - x, camY, cam.z);
      project(seg.p2, camX - x - dx, camY, cam.z);
      x += dx; dx += seg.curve;
      seg.clip = maxy;
      seg.visible = true;
      seg.n = n;
      R.visible.push(seg);
      if (seg.p1.cz <= R.NEAR || seg.p2.sy >= seg.p1.sy - 0.0001 || seg.p2.sy >= maxy) continue;

      var y1 = seg.p1.sy, y2 = seg.p2.sy;
      var rTop = Math.max(0, Math.ceil(y2 - 0.5)), rBot = Math.min(maxy, Math.ceil(y1 - 0.5), H) - 1;
      var alt = Math.floor(seg.index / T.RUMBLE) & 1;
      var lineOn = Math.floor(seg.index / (T.RUMBLE * 2)) & 1;
      var P = seg.pal;
      var gL = P.grounds[seg.gl] || P.grounds.grass, gR = P.grounds[seg.gr] || P.grounds.grass;
      var gLa = gL[alt], gRa = gR[alt];
      var road = P.road[alt], rumble = P.rumble[alt], sh = P.shoulder[alt], line = P.line;
      var seaL = seg.gl === 'sea', seaR = seg.gr === 'sea';
      var petals = seg.zone === 'final' || seg.zone === 'finale' ? (seg.zone === 'finale' ? 0.55 : G.clamp((seg.index - (T.goalIndex - 260)) / 260, 0, 1) * 0.5) : (seg.zone === 'sakura' ? 0.12 : 0);
      var petalCol = P.grounds.petals ? P.grounds.petals[0] : null;
      var dy = y1 - y2;
      for (var row = rBot; row >= rTop; row--) {
        var t = (y1 - (row + 0.5)) / dy;
        if (t < 0) t = 0; else if (t > 1) t = 1;
        var cx = seg.p1.sx + (seg.p2.sx - seg.p1.sx) * t;
        var w = seg.p1.sw + (seg.p2.sw - seg.p1.sw) * t;
        var sc = seg.p1.scale + (seg.p2.scale - seg.p1.scale) * t;
        var lv = fogLevel(R.F / sc);
        var o = row * W;
        var cxi = Math.round(cx);
        fillRow(o, 0, cxi, gLa[lv]);
        fillRow(o, cxi, W, gRa[lv]);
        var L = cx - w, Rr = cx + w, rw = w * 0.13;
        // 海のきらめき
        if (seaL || seaR) {
          var hsh = (seg.index * 73 + row * 31 + ((sparkleT * 4) | 0) * 17) % 97;
          if (hsh < 9) {
            var spx = ((seg.index * 131 + row * 57) % 1000) / 1000;
            var sx0 = seaL ? spx * (L - rw - w * seg.sl) : Rr + rw + w * seg.sr + spx * (W - Rr);
            fillRow(o, sx0, sx0 + 1 + (w > 60 ? 2 : (w > 20 ? 1 : 0)), line[lv]);
          }
        }
        // 路肩
        if (seg.sl > 0) fillRow(o, Math.round(L - rw - w * seg.sl), Math.round(L - rw), sh[lv]);
        if (seg.sr > 0) fillRow(o, Math.round(Rr + rw), Math.round(Rr + rw + w * seg.sr), sh[lv]);
        // ゼブラ (縁石)
        fillRow(o, Math.round(L - rw), Math.round(L), rumble[lv]);
        fillRow(o, Math.round(Rr), Math.round(Rr + rw), rumble[lv]);
        // 路面
        fillRow(o, Math.round(L), Math.round(Rr), road[lv]);
        // 路面に散った花びら
        if (petals > 0 && petalCol) {
          var nP = Math.floor(petals * 6 + 0.5);
          for (var pp = 0; pp < nP; pp++) {
            var hv = ((seg.index * 977 + row * 131 + pp * 7919) % 1009) / 1009;
            if (hv > petals) continue;
            var px = L + hv / petals * 2 * w;
            fillRow(o, px, px + Math.max(1, Math.round(w / 90)), petalCol[Math.max(0, lv - 2)]);
          }
        }
        // 白線 (外側ライン)
        var lw = w * 0.028;
        if (lw > 0.35) {
          var lwp = Math.max(1, Math.round(lw));
          var e1 = Math.round(L + w * 0.035);
          fillRow(o, e1, e1 + lwp, line[lv]);
          var e2 = Math.round(Rr - w * 0.035) - lwp;
          fillRow(o, e2, e2 + lwp, line[lv]);
          // 車線 (破線)
          if (lineOn) {
            for (var ln = 1; ln < R.LANES; ln++) {
              var lx = Math.round(L + 2 * w * ln / R.LANES - lwp / 2);
              fillRow(o, lx, lx + lwp, line[lv]);
            }
          }
        }
      }
      maxy = Math.min(maxy, rTop);
    }
    roadCtx.putImageData(imgData, 0, 0);
    R.ctx.drawImage(roadCv, 0, 0);
  };

  // ---------------------------------------------------------
  //  スプライト (拡大縮小) : 下端中央アンカー, clipY より下は隠す
  // ---------------------------------------------------------
  R.drawScaled = function (img, cx, by, dw, dh, clipY, flip, alpha) {
    if (dw < 1 || dh < 1) return;
    var x0 = Math.round(cx - dw / 2), y0 = Math.round(by - dh);
    var w = Math.round(dw), h = Math.round(by) - y0;
    if (h < 1 || w < 1) return;
    if (x0 > R.W || x0 + w < 0 || y0 > R.H) return;
    var hidden = clipY !== undefined ? Math.max(0, y0 + h - Math.round(clipY)) : 0;
    if (hidden >= h) return;
    var srcH = img.height * (h - hidden) / h;
    var ctx = R.ctx;
    if (alpha !== undefined && alpha < 1) ctx.globalAlpha = alpha;
    if (flip) {
      ctx.save();
      ctx.translate(x0 + w, y0); ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0, img.width, srcH, 0, 0, w, h - hidden);
      ctx.restore();
    } else {
      ctx.drawImage(img, 0, 0, img.width, srcH, x0, y0, w, h - hidden);
    }
    if (alpha !== undefined && alpha < 1) ctx.globalAlpha = 1;
  };

  // 道路上のスプライトと他車 (奥から手前へ)
  R.renderSprites = function (drawCarsFn) {
    var vis = R.visible, ROAD_W = R.ROAD_W, UNIT = R.UNIT;
    var cull = R.playerZ * 0.5;
    for (var i = vis.length - 1; i >= 0; i--) {
      var seg = vis[i];
      if (seg.p1.cz <= cull) continue;
      var sc = seg.p1.scale;
      for (var k = 0; k < seg.sprites.length; k++) {
        var sp = seg.sprites[k];
        var def = G.SPR[sp.key];
        if (!def) continue;
        var img = def.frameFn ? def.frames[def.frameFn()] : (def.anim ? def.frames[Math.floor((G.time || 0) * def.anim + k) % def.frames.length] : def.img);
        var zoom = (sp.zoom || 1) * def.zoom;
        var dw = img.width * UNIT * zoom * sc, dh = img.height * UNIT * zoom * sc;
        var sx = seg.p1.sx + sc * sp.offset * ROAD_W;
        var sy = seg.p1.sy;
        if (sp.ox) sx += sp.ox * dw;
        R.drawScaled(img, sx, sy, dw, dh, seg.clip, sp.flip);
      }
      if (drawCarsFn && seg.cars.length) drawCarsFn(seg);
    }
  };
})();
