'use strict';
// ============================================================
//  font.js  5x7 ドットフォント (英数字) と日本語ドット文字
// ============================================================
(function () {
  var RAW = {
    'A': '01110 10001 10001 11111 10001 10001 10001', 'B': '11110 10001 10001 11110 10001 10001 11110',
    'C': '01110 10001 10000 10000 10000 10001 01110', 'D': '11100 10010 10001 10001 10001 10010 11100',
    'E': '11111 10000 10000 11110 10000 10000 11111', 'F': '11111 10000 10000 11110 10000 10000 10000',
    'G': '01110 10001 10000 10111 10001 10001 01111', 'H': '10001 10001 10001 11111 10001 10001 10001',
    'I': '01110 00100 00100 00100 00100 00100 01110', 'J': '00111 00010 00010 00010 00010 10010 01100',
    'K': '10001 10010 10100 11000 10100 10010 10001', 'L': '10000 10000 10000 10000 10000 10000 11111',
    'M': '10001 11011 10101 10101 10001 10001 10001', 'N': '10001 10001 11001 10101 10011 10001 10001',
    'O': '01110 10001 10001 10001 10001 10001 01110', 'P': '11110 10001 10001 11110 10000 10000 10000',
    'Q': '01110 10001 10001 10001 10101 10010 01101', 'R': '11110 10001 10001 11110 10100 10010 10001',
    'S': '01111 10000 10000 01110 00001 00001 11110', 'T': '11111 00100 00100 00100 00100 00100 00100',
    'U': '10001 10001 10001 10001 10001 10001 01110', 'V': '10001 10001 10001 10001 10001 01010 00100',
    'W': '10001 10001 10001 10101 10101 10101 01010', 'X': '10001 10001 01010 00100 01010 10001 10001',
    'Y': '10001 10001 10001 01010 00100 00100 00100', 'Z': '11111 00001 00010 00100 01000 10000 11111',
    '0': '01110 10001 10011 10101 11001 10001 01110', '1': '00100 01100 00100 00100 00100 00100 01110',
    '2': '01110 10001 00001 00010 00100 01000 11111', '3': '11111 00010 00100 00010 00001 10001 01110',
    '4': '00010 00110 01010 10010 11111 00010 00010', '5': '11111 10000 11110 00001 00001 10001 01110',
    '6': '00110 01000 10000 11110 10001 10001 01110', '7': '11111 00001 00010 00100 01000 01000 01000',
    '8': '01110 10001 10001 01110 10001 10001 01110', '9': '01110 10001 10001 01111 00001 00010 01100',
    '.': '00000 00000 00000 00000 00000 01100 01100', ',': '00000 00000 00000 00000 01100 00100 01000',
    ':': '00000 01100 01100 00000 01100 01100 00000', '!': '00100 00100 00100 00100 00100 00000 00100',
    '?': '01110 10001 00001 00010 00100 00000 00100', '-': '00000 00000 00000 11111 00000 00000 00000',
    '+': '00000 00100 00100 11111 00100 00100 00000', "'": '00100 00100 01000 00000 00000 00000 00000',
    '"': '01010 01010 10100 00000 00000 00000 00000', '/': '00001 00010 00010 00100 01000 01000 10000',
    '%': '11000 11001 00010 00100 01000 10011 00011', '(': '00010 00100 01000 01000 01000 00100 00010',
    ')': '01000 00100 00010 00010 00010 00100 01000', '<': '00010 00100 01000 10000 01000 00100 00010',
    '>': '01000 00100 00010 00001 00010 00100 01000', '=': '00000 00000 11111 00000 11111 00000 00000',
    '*': '00000 00100 10101 01110 10101 00100 00000', '#': '01010 01010 11111 01010 11111 01010 01010',
    '&': '01100 10010 10100 01000 10101 10010 01101', ' ': '00000 00000 00000 00000 00000 00000 00000',
    '~': '00000 00000 01000 10101 00010 00000 00000', '@': '01110 10001 10111 10101 10111 10000 01110'
  };
  var GLYPH = {};
  Object.keys(RAW).forEach(function (k) {
    GLYPH[k] = RAW[k].split(' ').map(function (r) { return parseInt(r, 2); });
  });

  var F = G.Font = {};
  var cache = new Map();
  function cacheGet(key, make) {
    var v = cache.get(key);
    if (v) return v;
    if (cache.size > 400) cache.clear();
    v = make();
    cache.set(key, v);
    return v;
  }

  // 文字列 -> 1bit マスク (PX, 白)
  function maskText(str, bold) {
    str = String(str).toUpperCase();
    var cw = bold ? 6 : 5, adv = cw + 1;
    var w = Math.max(1, str.length * adv - 1), h = 7;
    var p = new G.PX(w, h), white = 0xffffffff;
    for (var i = 0; i < str.length; i++) {
      var g = GLYPH[str[i]] || GLYPH['?'];
      for (var y = 0; y < 7; y++) for (var x = 0; x < 5; x++) {
        if (g[y] & (16 >> x)) { p.d[y * w + i * adv + x] = white; if (bold) p.d[y * w + i * adv + x + 1] = white; }
      }
    }
    return p;
  }

  // マスクに色・縁取り・影をつけて canvas に
  //  opt: color | grad:[上, 下] , outline, shadow, scale
  function styleMask(m, opt) {
    var sc = opt.scale || 1;
    var pad = (opt.outline ? 1 : 0) + (opt.shadow ? 1 : 0);
    var w = m.w * sc + pad * 2, h = m.h * sc + pad * 2;
    var p = new G.PX(w, h);
    var off = opt.outline ? 1 : 0;
    var fill = G.col(opt.color || '#ffffff');
    var g0 = opt.grad ? G.col(opt.grad[0]) : 0, g1 = opt.grad ? G.col(opt.grad[1]) : 0;
    var gm = opt.grad && opt.grad[2] ? G.col(opt.grad[2]) : 0;
    for (var y = 0; y < m.h * sc; y++) {
      var c = fill;
      if (opt.grad) {
        var t = y / Math.max(1, m.h * sc - 1);
        if (gm) c = t < 0.5 ? G.mix(g0, gm, t * 2) : G.mix(gm, g1, (t - 0.5) * 2);
        else c = G.mix(g0, g1, t);
        // 段階的に (ドットらしく)
      }
      for (var x = 0; x < m.w * sc; x++) {
        if (G.ca(m.d[Math.floor(y / sc) * m.w + Math.floor(x / sc)])) p.d[(y + off) * w + x + off] = c;
      }
    }
    if (opt.outline) p.outline(G.col(opt.outline), !!opt.outlineDiag);
    if (opt.shadow) {
      var sh = G.col(opt.shadow), src = p.d.slice();
      for (y = h - 1; y >= 1; y--) for (x = w - 1; x >= 1; x--) {
        if (!G.ca(src[y * w + x]) && G.ca(src[(y - 1) * w + x - 1])) p.d[y * w + x] = sh;
      }
    }
    return p.toCanvas();
  }

  function keyOf(str, opt) {
    return str + '|' + (opt.color || '') + '|' + (opt.grad ? opt.grad.join(',') : '') + '|' + (opt.outline || '') + '|' +
      (opt.shadow || '') + '|' + (opt.scale || 1) + '|' + (opt.bold ? 1 : 0) + '|' + (opt.outlineDiag ? 1 : 0);
  }

  F.render = function (str, opt) {
    opt = opt || {};
    return cacheGet('a' + keyOf(String(str), opt), function () { return styleMask(maskText(str, opt.bold), opt); });
  };
  F.width = function (str, opt) {
    opt = opt || {};
    var adv = opt.bold ? 7 : 6;
    return (String(str).length * adv - 1) * (opt.scale || 1);
  };
  // 数字だけの文字列は 1 文字ずつキャッシュから描く (毎フレーム変わる計器用)
  var NUMERIC = /^[0-9'".:+\- ]+$/;
  F.text = function (ctx, str, x, y, opt) {
    opt = opt || {};
    str = String(str);
    if (NUMERIC.test(str) && str.length > 1) {
      var adv = (opt.bold ? 7 : 6) * (opt.scale || 1), tw = F.width(str, opt);
      var sx = opt.align === 'center' ? x - tw / 2 : (opt.align === 'right' ? x - tw : x);
      for (var i = 0; i < str.length; i++) {
        if (str[i] !== ' ') F.text(ctx, str[i], sx + i * adv, y, { scale: opt.scale, bold: opt.bold, color: opt.color, grad: opt.grad, outline: opt.outline, shadow: opt.shadow });
      }
      return tw;
    }
    var cv = F.render(str, opt);
    var pad = (opt.outline ? 1 : 0);
    var dx = Math.round(x) - pad;
    if (opt.align === 'center') dx = Math.round(x - cv.width / 2);
    else if (opt.align === 'right') dx = Math.round(x - cv.width + pad);
    ctx.drawImage(cv, dx, Math.round(y) - pad);
    return cv.width;
  };

  // ---------- 日本語 (システムフォントを2値化してドット化) ----------
  function maskJP(str, size, weight) {
    var cv = G.makeCanvas(Math.ceil(size * (str.length + 1) * 1.1), Math.ceil(size * 1.5));
    var x = cv.getContext('2d');
    x.font = (weight || 'bold') + ' ' + size + 'px "Noto Sans CJK JP","Noto Sans JP","Hiragino Kaku Gothic ProN","Yu Gothic","IPAGothic",sans-serif';
    x.textBaseline = 'top';
    x.fillStyle = '#fff';
    x.fillText(str, 1, Math.round(size * 0.1));
    var id = x.getImageData(0, 0, cv.width, cv.height);
    var d = new Uint32Array(id.data.buffer);
    var p = new G.PX(cv.width, cv.height);
    for (var i = 0; i < d.length; i++) if (G.ca(d[i]) > 110) p.d[i] = 0xffffffff;
    return p.trim();
  }
  F.renderJP = function (str, opt) {
    opt = opt || {};
    return cacheGet('j' + keyOf(str, opt) + '|' + opt.size, function () {
      return styleMask(maskJP(str, opt.size || 12, opt.weight), opt);
    });
  };
  F.jp = function (ctx, str, x, y, opt) {
    var cv = F.renderJP(str, opt);
    var dx = Math.round(x);
    if (opt.align === 'center') dx = Math.round(x - cv.width / 2);
    else if (opt.align === 'right') dx = Math.round(x - cv.width);
    ctx.drawImage(cv, dx, Math.round(y));
    return cv;
  };
})();
