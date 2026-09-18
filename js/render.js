/* 星の箱庭 — 描画 */
window.Hakoniwa = window.Hakoniwa || {};
(function (H) {
  'use strict';

  var U = H.util, TAU = U.TAU, clamp = U.clamp, rand = U.rand;

  /* 太陽の向き(画面座標・Yは下向き) */
  var L = (function () {
    var v = [-0.52, -0.46, 0.72];
    var n = Math.hypot(v[0], v[1], v[2]);
    return { x: v[0] / n, y: v[1] / n, z: v[2] / n };
  })();

  var MATERIAL_COLOR = {
    rock: [138, 106, 79],
    ice: [206, 233, 245],
    metal: [147, 163, 181],
    life: [134, 169, 106]
  };

  function mix(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }
  function shade(c, k) {
    return [clamp(c[0] * k, 0, 255), clamp(c[1] * k, 0, 255), clamp(c[2] * k, 0, 255)];
  }
  function rgba(c, a) {
    return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + a + ')';
  }

  /* 緯度経度 → 画面上の単位ベクトル */
  function project(lat, lon, rot) {
    var cl = Math.cos(lat), sl = Math.sin(lat);
    var a = lon + rot;
    var x = cl * Math.sin(a), y = sl, z = cl * Math.cos(a);
    var ct = Math.cos(H.AXIAL_TILT), st = Math.sin(H.AXIAL_TILT);
    return { x: x * ct - y * st, y: -(x * st + y * ct), z: z };
  }
  function lightOf(p) { return p.x * L.x + p.y * L.y + p.z * L.z; }

  H.createRenderer = function (canvas) {
    var ctx = canvas.getContext('2d');
    var dpr = 1, W = 0, Hh = 0, stars = [];

    function buildStars() {
      stars = [];
      var n = Math.min(460, Math.round(W * Hh / 5200));
      for (var i = 0; i < n; i++) {
        stars.push({
          x: Math.random() * W, y: Math.random() * Hh,
          r: Math.pow(Math.random(), 2.4) * 1.5 + 0.35,
          p: rand(0, TAU), s: rand(0.35, 1.5),
          c: Math.random() < 0.18 ? '#ffe6c2' : (Math.random() < 0.2 ? '#cfe3ff' : '#ffffff')
        });
      }
    }

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      var rect = canvas.getBoundingClientRect();
      W = Math.max(320, Math.round(rect.width));
      Hh = Math.max(320, Math.round(rect.height));
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(Hh * dpr);
      buildStars();
      return { w: W, h: Hh };
    }

    /* ---------- 背景 ---------- */
    function drawSky(t) {
      var g = ctx.createLinearGradient(0, 0, W * 0.3, Hh);
      g.addColorStop(0, '#080a1a');
      g.addColorStop(0.55, '#0c1029');
      g.addColorStop(1, '#141031');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, Hh);

      var n1 = ctx.createRadialGradient(W * 0.78, Hh * 0.22, 0, W * 0.78, Hh * 0.22, Math.max(W, Hh) * 0.55);
      n1.addColorStop(0, 'rgba(96,74,168,0.20)');
      n1.addColorStop(1, 'rgba(96,74,168,0)');
      ctx.fillStyle = n1; ctx.fillRect(0, 0, W, Hh);

      var n2 = ctx.createRadialGradient(W * 0.14, Hh * 0.82, 0, W * 0.14, Hh * 0.82, Math.max(W, Hh) * 0.5);
      n2.addColorStop(0, 'rgba(38,120,140,0.16)');
      n2.addColorStop(1, 'rgba(38,120,140,0)');
      ctx.fillStyle = n2; ctx.fillRect(0, 0, W, Hh);

      for (var i = 0; i < stars.length; i++) {
        var s = stars[i];
        var a = 0.32 + 0.68 * Math.abs(Math.sin(t * s.s + s.p));
        ctx.globalAlpha = a;
        ctx.fillStyle = s.c;
        ctx.fillRect(s.x, s.y, s.r, s.r);
      }
      ctx.globalAlpha = 1;

      /* 遠い太陽 */
      var sx = W * 0.5 + L.x * Math.max(W, Hh) * 0.62;
      var sy = Hh * 0.5 + L.y * Math.max(W, Hh) * 0.62;
      var sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, Math.max(W, Hh) * 0.42);
      sg.addColorStop(0, 'rgba(255,224,170,0.24)');
      sg.addColorStop(0.35, 'rgba(255,196,120,0.07)');
      sg.addColorStop(1, 'rgba(255,196,120,0)');
      ctx.fillStyle = sg; ctx.fillRect(0, 0, W, Hh);
    }

    /* ---------- 星の表面 ---------- */
    function drawMarks(w, cx, cy, R, base) {
      var dark = shade(base, 0.52), i, m;
      for (i = 0; i < w.marks.length; i++) {
        m = w.marks[i];
        var p = project(m.lat, m.lon, w.rotation);
        if (p.z <= 0.08) continue;
        var jitter = Math.abs(Math.sin(m.lat * 91.7 + m.lon * 43.3));
        var size = clamp(m.rm / w.radius, 0.012, 0.32) * R * (0.78 + jitter * 0.5);
        if (size < 0.5) continue;
        var px = cx + p.x * R, py = cy + p.y * R;
        var ang = Math.atan2(p.y, p.x);
        var rx = Math.max(0.3, size * p.z), ry = size * (0.86 + jitter * 0.24);
        var edge = clamp((p.z - 0.08) / 0.22, 0, 1);

        if (m.kind === 'rock') {
          ctx.beginPath();
          ctx.ellipse(px, py, rx, ry, ang, 0, TAU);
          ctx.fillStyle = rgba(dark, (0.34 + jitter * 0.3) * edge);
          ctx.fill();
          // 太陽に向いた側だけ、ふちを短く光らせる(縁ちかくでは引っかき傷に見えるので描かない)
          if (size > 3 && p.z > 0.42) {
            var la = Math.atan2(L.y * Math.cos(ang) - L.x * Math.sin(ang), L.x * Math.cos(ang) + L.y * Math.sin(ang));
            ctx.beginPath();
            ctx.ellipse(px, py, rx * 0.88, ry * 0.88, ang, la - 0.85, la + 0.85);
            ctx.strokeStyle = rgba(shade(base, 1.3), 0.3 * edge);
            ctx.lineWidth = Math.max(0.6, size * 0.14);
            ctx.stroke();
          }
        } else if (m.kind === 'ice') {
          ctx.beginPath();
          ctx.ellipse(px, py, rx, ry, ang, 0, TAU);
          ctx.fillStyle = 'rgba(214,240,255,' + (0.18 + 0.2 * jitter) * edge + ')';
          ctx.fill();
        } else if (m.kind === 'metal') {
          ctx.beginPath();
          ctx.ellipse(px, py, rx, ry * 0.8, ang, 0, TAU);
          ctx.fillStyle = 'rgba(176,193,212,' + (0.5 * edge) + ')';
          ctx.fill();
          if (size > 2) {
            ctx.beginPath();
            ctx.ellipse(px - rx * 0.25, py - ry * 0.25, rx * 0.28, ry * 0.22, ang, 0, TAU);
            ctx.fillStyle = 'rgba(232,245,255,' + (0.5 * edge) + ')';
            ctx.fill();
          }
        } else {
          ctx.beginPath();
          ctx.ellipse(px, py, rx * 0.7, ry * 0.7, ang, 0, TAU);
          ctx.fillStyle = 'rgba(150,205,120,' + (0.45 * edge) + ')';
          ctx.fill();
        }
      }
    }

    function drawSeas(w, cx, cy, R) {
      for (var i = 0; i < w.features.length; i++) {
        var f = w.features[i];
        if (f.type !== 'sea') continue;
        var p = project(f.lat, f.lon, w.rotation);
        if (p.z <= 0.06) continue;
        var size = R * 0.2 * f.scale;
        var px = cx + p.x * R, py = cy + p.y * R;
        var ang = Math.atan2(p.y, p.x);
        var edge = clamp((p.z - 0.03) / 0.2, 0, 1);
        ctx.beginPath();
        ctx.ellipse(px, py, Math.max(0.4, size * p.z), size * 0.78, ang, 0, TAU);
        ctx.fillStyle = 'rgba(58,124,168,' + (0.72 * edge) + ')';
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(px - size * 0.15, py - size * 0.2, Math.max(0.3, size * 0.3 * p.z), size * 0.16, ang, 0, TAU);
        ctx.fillStyle = 'rgba(190,232,255,' + (0.3 * edge) + ')';
        ctx.fill();
      }
    }

    /* ---------- 地上のものたち ---------- */
    function sprite(f, u, t) {
      switch (f.type) {
        case 'volcano': {
          var h = u * 1.5 * f.scale, b = u * 0.92 * f.scale;
          ctx.beginPath();
          ctx.moveTo(-b, 1); ctx.lineTo(-b * 0.3, -h); ctx.lineTo(b * 0.3, -h); ctx.lineTo(b, 1);
          ctx.closePath();
          ctx.fillStyle = '#4b3a31'; ctx.fill();
          ctx.beginPath();
          ctx.moveTo(-b * 0.3, -h); ctx.lineTo(-b * 0.1, -h * 0.2); ctx.lineTo(b * 0.05, -h);
          ctx.closePath();
          ctx.fillStyle = 'rgba(255,240,220,0.07)'; ctx.fill();
          ctx.beginPath();
          ctx.ellipse(0, -h, b * 0.32, b * 0.12, 0, 0, TAU);
          ctx.fillStyle = f.hot ? '#d9541f' : '#2b231e'; ctx.fill();
          break;
        }
        case 'baobab': {
          var s = f.scale;
          ctx.strokeStyle = '#5b4436';
          ctx.lineWidth = u * 0.22 * s;
          ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -u * 1.0 * s); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0, -u * 0.7 * s); ctx.lineTo(-u * 0.45 * s, -u * 1.15 * s); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0, -u * 0.7 * s); ctx.lineTo(u * 0.45 * s, -u * 1.15 * s); ctx.stroke();
          ctx.fillStyle = '#4f7d4c';
          var pts = [[-0.5, -1.25, 0.45], [0.52, -1.22, 0.42], [0, -1.5, 0.5]];
          for (var k = 0; k < pts.length; k++) {
            ctx.beginPath();
            ctx.arc(pts[k][0] * u * s, pts[k][1] * u * s, pts[k][2] * u * s, 0, TAU);
            ctx.fill();
          }
          break;
        }
        case 'rose': {
          ctx.strokeStyle = '#5f8a4e'; ctx.lineWidth = u * 0.1; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -u * 0.86); ctx.stroke();
          ctx.fillStyle = '#5f8a4e';
          ctx.beginPath(); ctx.ellipse(-u * 0.2, -u * 0.44, u * 0.2, u * 0.09, -0.5, 0, TAU); ctx.fill();
          ctx.beginPath(); ctx.ellipse(u * 0.2, -u * 0.58, u * 0.2, u * 0.09, 0.5, 0, TAU); ctx.fill();
          ctx.fillStyle = '#d94f6e';
          for (var i = 0; i < 5; i++) {
            var a = i * TAU / 5 - 0.4;
            ctx.beginPath();
            ctx.arc(Math.cos(a) * u * 0.15, -u * 0.98 + Math.sin(a) * u * 0.15, u * 0.15, 0, TAU);
            ctx.fill();
          }
          ctx.fillStyle = '#f6b3c3';
          ctx.beginPath(); ctx.arc(0, -u * 0.98, u * 0.11, 0, TAU); ctx.fill();
          ctx.beginPath();
          ctx.arc(0, -u * 0.62, u * 0.66, Math.PI, TAU);
          ctx.lineTo(u * 0.66, 0); ctx.lineTo(-u * 0.66, 0); ctx.closePath();
          ctx.fillStyle = 'rgba(196,228,255,0.07)'; ctx.fill();
          ctx.strokeStyle = 'rgba(214,238,255,0.34)'; ctx.lineWidth = u * 0.05; ctx.stroke();
          break;
        }
        case 'lamp': {
          ctx.strokeStyle = '#7d8a98'; ctx.lineWidth = u * 0.12; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -u * 1.35); ctx.stroke();
          ctx.fillStyle = '#8f9daa';
          ctx.beginPath();
          ctx.moveTo(-u * 0.26, -u * 1.35); ctx.lineTo(u * 0.26, -u * 1.35);
          ctx.lineTo(u * 0.16, -u * 1.72); ctx.lineTo(-u * 0.16, -u * 1.72);
          ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#6d7a88';
          ctx.fillRect(-u * 0.24, -u * 0.12, u * 0.48, u * 0.14);
          break;
        }
        case 'house': {
          ctx.fillStyle = '#8e939d';
          ctx.fillRect(-u * 0.55, -u * 0.78, u * 1.1, u * 0.78);
          ctx.fillStyle = '#5f5149';
          ctx.beginPath();
          ctx.moveTo(-u * 0.72, -u * 0.74); ctx.lineTo(0, -u * 1.3); ctx.lineTo(u * 0.72, -u * 0.74);
          ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#4a4038';
          ctx.fillRect(-u * 0.14, -u * 0.46, u * 0.28, u * 0.46);
          break;
        }
        case 'bench': {
          ctx.fillStyle = '#7a6551';
          ctx.fillRect(-u * 0.45, -u * 0.42, u * 0.9, u * 0.1);
          ctx.fillRect(-u * 0.45, -u * 0.74, u * 0.9, u * 0.08);
          ctx.fillRect(-u * 0.4, -u * 0.42, u * 0.08, u * 0.42);
          ctx.fillRect(u * 0.32, -u * 0.42, u * 0.08, u * 0.42);
          break;
        }
        case 'signpost': {
          ctx.strokeStyle = '#7f7264'; ctx.lineWidth = u * 0.1;
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -u * 1.15); ctx.stroke();
          ctx.fillStyle = '#b9a88f';
          ctx.fillRect(-u * 0.5, -u * 1.3, u * 1.0, u * 0.36);
          ctx.fillStyle = 'rgba(60,48,38,0.55)';
          ctx.fillRect(-u * 0.36, -u * 1.2, u * 0.72, u * 0.05);
          ctx.fillRect(-u * 0.36, -u * 1.09, u * 0.5, u * 0.05);
          break;
        }
        case 'prince': {
          var sw = Math.sin(t * 2.1 + f.seed * 6.2);
          ctx.strokeStyle = '#3b6358'; ctx.lineWidth = u * 0.11; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(-u * 0.11, 0); ctx.lineTo(-u * 0.1, -u * 0.4); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(u * 0.11, 0); ctx.lineTo(u * 0.1, -u * 0.4); ctx.stroke();
          ctx.fillStyle = '#48796b';
          ctx.beginPath();
          ctx.moveTo(-u * 0.24, -u * 0.36); ctx.lineTo(u * 0.24, -u * 0.36);
          ctx.lineTo(u * 0.17, -u * 0.86); ctx.lineTo(-u * 0.17, -u * 0.86);
          ctx.closePath(); ctx.fill();
          ctx.strokeStyle = '#48796b'; ctx.lineWidth = u * 0.09;
          ctx.beginPath(); ctx.moveTo(-u * 0.18, -u * 0.78); ctx.lineTo(-u * 0.34, -u * 0.52); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(u * 0.18, -u * 0.78); ctx.lineTo(u * 0.34, -u * 0.52); ctx.stroke();
          ctx.fillStyle = '#f0d8bd';
          ctx.beginPath(); ctx.arc(0, -u * 1.04, u * 0.22, 0, TAU); ctx.fill();
          ctx.fillStyle = '#f2c14e';
          ctx.beginPath(); ctx.arc(0, -u * 1.09, u * 0.24, Math.PI * 1.05, TAU * 1.02); ctx.fill();
          ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = u * 0.1; ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(0, -u * 0.84);
          ctx.quadraticCurveTo(u * (0.4 + sw * 0.18), -u * (0.9 + sw * 0.1), u * (0.8 + sw * 0.25), -u * (0.74 + sw * 0.22));
          ctx.stroke();
          break;
        }
      }
    }

    var canFilter = false;
    try { canFilter = typeof ctx.filter === 'string'; } catch (e) { canFilter = false; }

    function drawFeatures(w, cx, cy, R, unit, t) {
      for (var i = 0; i < w.features.length; i++) {
        var f = w.features[i];
        if (f.type === 'sea') continue;
        var p = project(f.lat, f.lon, w.rotation);
        if (p.z <= 0.02) continue;
        var fo = 0.35 + 0.65 * p.z;
        var bright = 0.22 + 0.78 * clamp(lightOf(p) * 1.15 + 0.22, 0, 1);
        ctx.save();
        ctx.globalAlpha = clamp((p.z - 0.02) / 0.16, 0, 1) * (canFilter ? 1 : 0.4 + 0.6 * bright);
        if (canFilter) ctx.filter = 'brightness(' + bright.toFixed(3) + ')';
        ctx.translate(cx + p.x * R, cy + p.y * R);
        ctx.rotate(Math.atan2(p.x, -p.y));
        ctx.scale(fo, fo);
        sprite(f, unit, t);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }

    /* 夜側だけ光るもの(大気の影のあとに描く) */
    function drawGlows(w, cx, cy, R, unit, t) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (var i = 0; i < w.features.length; i++) {
        var f = w.features[i];
        if (f.type === 'sea') continue;
        var p = project(f.lat, f.lon, w.rotation);
        if (p.z <= 0.05) continue;
        var lit = lightOf(p);
        var night = clamp((0.16 - lit) / 0.3, 0, 1);
        var fo = 0.35 + 0.65 * p.z;
        var alpha = clamp((p.z - 0.05) / 0.16, 0, 1);
        ctx.save();
        ctx.translate(cx + p.x * R, cy + p.y * R);
        ctx.rotate(Math.atan2(p.x, -p.y));
        ctx.scale(fo, fo);
        ctx.globalAlpha = alpha;

        if (f.type === 'lamp' && night > 0.02) {
          var g = ctx.createRadialGradient(0, -unit * 1.54, 0, 0, -unit * 1.54, unit * 2.2);
          g.addColorStop(0, 'rgba(255,214,130,' + (0.5 * night) + ')');
          g.addColorStop(1, 'rgba(255,190,90,0)');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(0, -unit * 1.54, unit * 2.2, 0, TAU); ctx.fill();
          ctx.fillStyle = 'rgba(255,236,190,' + (0.35 + 0.6 * night) + ')';
          ctx.beginPath(); ctx.arc(0, -unit * 1.54, unit * 0.14, 0, TAU); ctx.fill();
        } else if (f.type === 'house' && night > 0.02) {
          ctx.fillStyle = 'rgba(255,206,124,' + (0.75 * night) + ')';
          ctx.fillRect(-unit * 0.14, -unit * 0.46, unit * 0.28, unit * 0.3);
        } else if (f.type === 'volcano' && f.hot) {
          var h = unit * 1.5 * f.scale, b = unit * 0.92 * f.scale;
          var vg = ctx.createRadialGradient(0, -h, 0, 0, -h, b * 1.6);
          vg.addColorStop(0, 'rgba(255,146,60,' + (0.32 + 0.38 * night) + ')');
          vg.addColorStop(1, 'rgba(255,120,40,0)');
          ctx.fillStyle = vg;
          ctx.beginPath(); ctx.arc(0, -h, b * 1.6, 0, TAU); ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
          for (var k = 0; k < 3; k++) {
            var pr = ((t * 0.22 + f.seed + k / 3) % 1);
            ctx.globalAlpha = alpha * 0.3 * (1 - pr);
            ctx.fillStyle = '#d9d3cc';
            ctx.beginPath();
            ctx.arc(Math.sin(pr * 5 + f.seed * 6) * b * 0.35, -h - pr * unit * 1.9, b * (0.16 + pr * 0.42), 0, TAU);
            ctx.fill();
          }
          ctx.globalCompositeOperation = 'lighter';
        }
        ctx.restore();
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    function drawBirds(w, cx, cy, R, unit, t, front) {
      if (!w.unlocked.prince) return;
      ctx.save();
      ctx.strokeStyle = 'rgba(232,238,255,0.6)';
      ctx.lineWidth = Math.max(0.8, unit * 0.09);
      ctx.lineCap = 'round';
      for (var i = 0; i < 5; i++) {
        var a = t * 0.24 + i * (TAU / 5);
        var z = Math.sin(a);
        if ((z >= 0) !== front) continue;
        var px = cx + Math.cos(a) * R * 1.2;
        var py = cy - R * 0.3 + Math.sin(a) * R * 0.3 + Math.sin(t * 1.6 + i) * R * 0.015;
        var s = unit * (0.26 + 0.12 * z);
        ctx.globalAlpha = 0.2 + 0.3 * (z * 0.5 + 0.5);
        ctx.beginPath();
        ctx.moveTo(px - s, py);
        ctx.quadraticCurveTo(px - s * 0.4, py - s * 0.55, px, py - s * 0.1);
        ctx.quadraticCurveTo(px + s * 0.4, py - s * 0.55, px + s, py);
        ctx.stroke();
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    function drawPlanet(w, cx, cy, t) {
      var R = w.pixelRadius;
      var f = H.fractions(w);
      var base = MATERIAL_COLOR.rock.slice();
      base = mix(base, MATERIAL_COLOR.ice, clamp(f.ice * 0.9, 0, 0.55));
      base = mix(base, MATERIAL_COLOR.metal, clamp(f.metal * 0.8, 0, 0.45));
      if (w.life > 0) base = mix(base, MATERIAL_COLOR.life, clamp(w.life / 400, 0, 0.14));
      if (!w.unlocked.crust) base = shade(base, 0.78);
      var unit = 10 * Math.pow(R / 46, 0.7);

      /* 大気の外側 */
      if (w.unlocked.air) {
        var ag = ctx.createRadialGradient(cx, cy, R * 0.94, cx, cy, R * 1.22);
        ag.addColorStop(0, 'rgba(142,198,255,0.2)');
        ag.addColorStop(0.5, 'rgba(120,180,255,0.08)');
        ag.addColorStop(1, 'rgba(110,170,255,0)');
        ctx.fillStyle = ag;
        ctx.beginPath(); ctx.arc(cx, cy, R * 1.22, 0, TAU); ctx.fill();
      }

      drawBirds(w, cx, cy, R, unit, t, false);

      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.clip();

      var g = ctx.createRadialGradient(cx + L.x * R * 0.5, cy + L.y * R * 0.5, R * 0.04, cx, cy, R * 1.12);
      g.addColorStop(0, rgba(shade(base, 1.2), 1));
      g.addColorStop(0.4, rgba(base, 1));
      g.addColorStop(1, rgba(shade(base, 0.34), 1));
      ctx.fillStyle = g;
      ctx.fillRect(cx - R, cy - R, R * 2, R * 2);

      drawMarks(w, cx, cy, R, base);
      if (w.unlocked.sea) drawSeas(w, cx, cy, R);

      /* 夜(昼夜の境) */
      var ng = ctx.createRadialGradient(cx - L.x * R * 1.3, cy - L.y * R * 1.3, R * 0.12,
        cx - L.x * R * 1.3, cy - L.y * R * 1.3, R * 1.85);
      ng.addColorStop(0, 'rgba(4,6,20,0.84)');
      ng.addColorStop(0.5, 'rgba(6,8,24,0.34)');
      ng.addColorStop(1, 'rgba(8,10,28,0)');
      ctx.fillStyle = ng;
      ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
      ctx.restore();

      /* 明るい側のふち */
      var rim = ctx.createLinearGradient(cx + L.x * R, cy + L.y * R, cx - L.x * R, cy - L.y * R);
      rim.addColorStop(0, 'rgba(255,232,196,0.5)');
      rim.addColorStop(0.45, 'rgba(255,226,180,0.06)');
      rim.addColorStop(1, 'rgba(255,220,170,0)');
      ctx.strokeStyle = rim;
      ctx.lineWidth = Math.max(1, R * 0.028);
      ctx.beginPath(); ctx.arc(cx, cy, R - ctx.lineWidth * 0.4, 0, TAU); ctx.stroke();

      /* 立っているものは球の外にはみ出す(地平線で切らない) */
      drawFeatures(w, cx, cy, R, unit, t);
      drawGlows(w, cx, cy, R, unit, t);

      if (w.unlocked.air) {
        var hg = ctx.createLinearGradient(cx + L.x * R, cy + L.y * R, cx - L.x * R, cy - L.y * R);
        hg.addColorStop(0, 'rgba(168,214,255,0.4)');
        hg.addColorStop(0.55, 'rgba(150,200,255,0.05)');
        hg.addColorStop(1, 'rgba(150,200,255,0)');
        ctx.strokeStyle = hg;
        ctx.lineWidth = Math.max(1.2, R * 0.045);
        ctx.beginPath(); ctx.arc(cx, cy, R + ctx.lineWidth * 0.45, 0, TAU); ctx.stroke();
      }

      drawBirds(w, cx, cy, R, unit, t, true);
    }

    /* ---------- 漂流物 ---------- */
    function drawDebris(w, cx, cy, t) {
      var i, j, d;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (i = 0; i < w.debris.length; i++) {
        d = w.debris[i];
        for (j = d.trail.length - 1; j > 0; j--) {
          var a = (1 - j / d.trail.length) * (d.type === 'dust' ? 0.5 : 0.28);
          ctx.globalAlpha = a;
          ctx.fillStyle = d.glow;
          var s = d.size * (1 - j / d.trail.length) * 0.7;
          ctx.fillRect(cx + d.trail[j].x - s / 2, cy + d.trail[j].y - s / 2, s, s);
        }
      }
      ctx.restore();
      ctx.globalAlpha = 1;

      for (i = 0; i < w.debris.length; i++) {
        d = w.debris[i];
        var x = cx + d.x, y = cy + d.y;
        if (d.type === 'dust') {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = 'rgba(126,198,255,0.16)';
          ctx.beginPath(); ctx.arc(x, y, d.size * 2.6, 0, TAU); ctx.fill();
          ctx.fillStyle = 'rgba(190,230,255,0.4)';
          ctx.beginPath(); ctx.arc(x, y, d.size * 1.3, 0, TAU); ctx.fill();
          ctx.fillStyle = '#eaf7ff';
          ctx.beginPath(); ctx.arc(x, y, d.size * 0.55, 0, TAU); ctx.fill();
          ctx.restore();
          continue;
        }
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(d.spin);
        if (d.type === 'meteor') {
          ctx.beginPath();
          for (j = 0; j < d.shape.length; j++) {
            var ang = j / d.shape.length * TAU;
            var rr = d.size * d.shape[j];
            if (j === 0) ctx.moveTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
            else ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
          }
          ctx.closePath();
          ctx.fillStyle = d.color; ctx.fill();
          ctx.fillStyle = 'rgba(40,26,18,0.5)';
          ctx.beginPath(); ctx.arc(d.size * 0.28, d.size * 0.24, d.size * 0.55, 0, TAU); ctx.fill();
        } else if (d.type === 'wreck') {
          ctx.fillStyle = d.color;
          ctx.fillRect(-d.size, -d.size * 0.45, d.size * 2, d.size * 0.9);
          ctx.fillStyle = 'rgba(28,38,52,0.6)';
          ctx.fillRect(-d.size * 0.2, -d.size * 0.45, d.size * 0.35, d.size * 0.9);
          ctx.strokeStyle = 'rgba(190,208,226,0.8)';
          ctx.lineWidth = Math.max(0.7, d.size * 0.12);
          ctx.beginPath(); ctx.moveTo(d.size, 0); ctx.lineTo(d.size * 1.7, -d.size * 0.5); ctx.stroke();
          ctx.fillStyle = 'rgba(255,120,110,' + (0.35 + 0.65 * Math.abs(Math.sin(t * 3 + d.blink))) + ')';
          ctx.beginPath(); ctx.arc(-d.size * 0.72, 0, Math.max(0.8, d.size * 0.17), 0, TAU); ctx.fill();
        } else {
          ctx.fillStyle = d.color;
          ctx.beginPath();
          ctx.ellipse(0, 0, d.size * 0.7, d.size, 0, 0, TAU);
          ctx.fill();
          ctx.strokeStyle = 'rgba(160,240,120,0.7)';
          ctx.lineWidth = Math.max(0.6, d.size * 0.16);
          ctx.beginPath(); ctx.moveTo(0, -d.size); ctx.lineTo(0, -d.size * 1.9); ctx.stroke();
        }
        ctx.restore();
      }
    }

    function drawComet(w, cx, cy) {
      var c = w.comet;
      if (!c) return;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (var i = c.tail.length - 1; i > 0; i--) {
        var k = 1 - i / c.tail.length;
        ctx.globalAlpha = k * 0.42;
        ctx.fillStyle = '#9fdcff';
        var s = 1 + k * 5;
        ctx.beginPath(); ctx.arc(cx + c.tail[i].x, cy + c.tail[i].y, s, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
      var g = ctx.createRadialGradient(cx + c.x, cy + c.y, 0, cx + c.x, cy + c.y, 20);
      g.addColorStop(0, 'rgba(240,252,255,0.95)');
      g.addColorStop(1, 'rgba(140,215,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx + c.x, cy + c.y, 20, 0, TAU); ctx.fill();
      ctx.restore();
    }

    function drawEffects(w, cx, cy) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (var i = 0; i < w.effects.length; i++) {
        var e = w.effects[i];
        var k = e.life / e.dur;
        if (e.kind === 'ring') {
          ctx.globalAlpha = (1 - k) * 0.75;
          ctx.strokeStyle = e.color;
          ctx.lineWidth = Math.max(0.8, 2.4 * (1 - k));
          ctx.beginPath(); ctx.arc(cx + e.x, cy + e.y, e.max * k, 0, TAU); ctx.stroke();
        } else if (e.kind === 'spark') {
          ctx.globalAlpha = (1 - k) * 0.85;
          ctx.strokeStyle = e.color;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(cx + e.x, cy + e.y);
          ctx.lineTo(cx + e.x - e.vx * 0.03, cy + e.y - e.vy * 0.03);
          ctx.stroke();
        } else if (e.kind === 'bloom') {
          ctx.globalAlpha = (1 - k) * 0.5;
          ctx.strokeStyle = '#ffd98a';
          ctx.lineWidth = Math.max(1, 4 * (1 - k));
          ctx.beginPath(); ctx.arc(cx, cy, w.pixelRadius * (1 + k * 0.5), 0, TAU); ctx.stroke();
        }
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    function drawHand(input, cx, cy, t) {
      if (!input || !input.active) return;
      var x = cx + input.x, y = cy + input.y;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var g = ctx.createRadialGradient(x, y, 0, x, y, 70);
      g.addColorStop(0, 'rgba(255,214,140,0.16)');
      g.addColorStop(1, 'rgba(255,200,120,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, 70, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,224,168,0.55)';
      ctx.lineWidth = 1.1;
      ctx.setLineDash([4, 7]);
      ctx.lineDashOffset = -t * 22;
      var r = 22 + Math.sin(t * 3) * 3;
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    function draw(w, t, input) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawSky(t);
      var sx = 0, sy = 0;
      if (w.shake > 0.05) {
        sx = rand(-w.shake, w.shake);
        sy = rand(-w.shake, w.shake);
      }
      var cx = W / 2 + sx, cy = Hh / 2 + sy;
      drawComet(w, cx, cy);
      drawPlanet(w, cx, cy, t);
      drawDebris(w, cx, cy, t);
      drawEffects(w, cx, cy);
      drawHand(input, cx, cy, t);

      var v = ctx.createRadialGradient(W / 2, Hh / 2, Math.min(W, Hh) * 0.42, W / 2, Hh / 2, Math.max(W, Hh) * 0.78);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(0,0,0,0.42)');
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, W, Hh);
    }

    return { resize: resize, draw: draw };
  };
})(window.Hakoniwa);
