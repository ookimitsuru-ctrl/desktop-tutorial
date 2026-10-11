'use strict';
// ============================================================
//  core.js  共通ユーティリティ / ピクセルアート描画ヘルパー
// ============================================================
var G = window.G = window.G || {};

G.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
G.lerp = function (a, b, t) { return a + (b - a) * t; };
G.easeIn = function (a, b, t) { return a + (b - a) * t * t; };
G.easeOut = function (a, b, t) { return a + (b - a) * (1 - (1 - t) * (1 - t)); };
G.easeInOut = function (a, b, t) { return a + (b - a) * ((-Math.cos(t * Math.PI) / 2) + 0.5); };
G.sign = function (v) { return v > 0 ? 1 : (v < 0 ? -1 : 0); };

// 再現性のある乱数 (mulberry32)
G.rng = function (seed) {
  var s = seed | 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    var t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// ---------- 色 (ImageData の Uint32 = 0xAABBGGRR, little endian) ----------
G.col = function (hex, a) {
  if (typeof hex === 'number') return hex;
  var h = hex.replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  var r = parseInt(h.substr(0, 2), 16), g = parseInt(h.substr(2, 2), 16), b = parseInt(h.substr(4, 2), 16);
  var al = (h.length >= 8) ? parseInt(h.substr(6, 2), 16) : (a === undefined ? 255 : a);
  return ((al << 24) | (b << 16) | (g << 8) | r) >>> 0;
};
G.rgba = function (r, g, b, a) {
  return (((a === undefined ? 255 : a) << 24) | (b << 16) | (g << 8) | r) >>> 0;
};
G.cr = function (c) { return c & 255; };
G.cg = function (c) { return (c >>> 8) & 255; };
G.cb = function (c) { return (c >>> 16) & 255; };
G.ca = function (c) { return (c >>> 24) & 255; };
G.mix = function (c1, c2, t) {
  c1 = G.col(c1); c2 = G.col(c2);
  return G.rgba(
    Math.round(G.cr(c1) + (G.cr(c2) - G.cr(c1)) * t),
    Math.round(G.cg(c1) + (G.cg(c2) - G.cg(c1)) * t),
    Math.round(G.cb(c1) + (G.cb(c2) - G.cb(c1)) * t),
    Math.round(G.ca(c1) + (G.ca(c2) - G.ca(c1)) * t));
};
G.css = function (c) {
  c = G.col(c);
  return 'rgba(' + G.cr(c) + ',' + G.cg(c) + ',' + G.cb(c) + ',' + (G.ca(c) / 255).toFixed(3) + ')';
};
G.withAlpha = function (c, a) { c = G.col(c); return ((c & 0x00ffffff) | (a << 24)) >>> 0; };
G.darken = function (c, t) { return G.mix(c, G.withAlpha(0x000000, G.ca(G.col(c))), t); };
G.lighten = function (c, t) { return G.mix(c, G.withAlpha(0xffffff, G.ca(G.col(c))), t); };

// Bayer 4x4 ディザ行列 (0..15)
G.BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
G.dither = function (x, y, t) { // t:0..1 -> true なら「次の色」
  return t * 16 > G.BAYER[(y & 3) * 4 + (x & 3)] + 0.5;
};

G.makeCanvas = function (w, h) {
  var c = document.createElement('canvas');
  c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0);
  return c;
};
G.ctx2d = function (cv) {
  var x = cv.getContext('2d');
  x.imageSmoothingEnabled = false;
  return x;
};

// ============================================================
//  PX : ドット絵を 1px 単位で描くための小さなラスタライザ
// ============================================================
function PX(w, h) {
  this.w = w | 0; this.h = h | 0;
  this.d = new Uint32Array(this.w * this.h);
}
G.PX = PX;
PX.prototype.inb = function (x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; };
PX.prototype.get = function (x, y) {
  x |= 0; y |= 0;
  return this.inb(x, y) ? this.d[y * this.w + x] : 0;
};
PX.prototype.set = function (x, y, c) {
  x = Math.floor(x); y = Math.floor(y);
  if (!this.inb(x, y)) return;
  if (G.ca(c) === 255 || G.ca(c) === 0) { this.d[y * this.w + x] = c; return; }
  // 半透明は下地にブレンド
  var o = this.d[y * this.w + x];
  if (G.ca(o) === 0) { this.d[y * this.w + x] = c; return; }
  var a = G.ca(c) / 255;
  this.d[y * this.w + x] = G.rgba(
    Math.round(G.cr(o) + (G.cr(c) - G.cr(o)) * a),
    Math.round(G.cg(o) + (G.cg(c) - G.cg(o)) * a),
    Math.round(G.cb(o) + (G.cb(c) - G.cb(o)) * a), Math.max(G.ca(o), G.ca(c)));
};
// 透明部分にだけ描く
PX.prototype.under = function (x, y, c) {
  x = Math.floor(x); y = Math.floor(y);
  if (!this.inb(x, y)) return;
  if (G.ca(this.d[y * this.w + x]) === 0) this.d[y * this.w + x] = c;
};
// 不透明部分にだけ描く
PX.prototype.over = function (x, y, c) {
  x = Math.floor(x); y = Math.floor(y);
  if (!this.inb(x, y)) return;
  if (G.ca(this.d[y * this.w + x]) !== 0) this.set(x, y, c);
};
PX.prototype.rect = function (x, y, w, h, c) {
  for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) this.set(x + i, y + j, c);
};
PX.prototype.hline = function (x0, x1, y, c) {
  if (x1 < x0) { var t = x0; x0 = x1; x1 = t; }
  for (var x = Math.round(x0); x <= Math.round(x1); x++) this.set(x, y, c);
};
PX.prototype.vline = function (x, y0, y1, c) {
  if (y1 < y0) { var t = y0; y0 = y1; y1 = t; }
  for (var y = Math.round(y0); y <= Math.round(y1); y++) this.set(x, y, c);
};
PX.prototype.line = function (x0, y0, x1, y1, c) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  var dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
  var dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  var err = dx + dy;
  for (;;) {
    this.set(x0, y0, c);
    if (x0 === x1 && y0 === y1) break;
    var e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
};
// 太線
PX.prototype.thick = function (x0, y0, x1, y1, r, c) {
  var n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
  for (var i = 0; i <= n; i++) {
    var t = i / n;
    this.disc(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r, c);
  }
};
// 楕円 (中心は実数, ピクセル中心で判定)
PX.prototype.ellipse = function (cx, cy, rx, ry, c, fn) {
  var x0 = Math.floor(cx - rx - 1), x1 = Math.ceil(cx + rx + 1);
  var y0 = Math.floor(cy - ry - 1), y1 = Math.ceil(cy + ry + 1);
  for (var y = y0; y <= y1; y++) {
    for (var x = x0; x <= x1; x++) {
      var nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
      var d = nx * nx + ny * ny;
      if (d <= 1) {
        if (fn) { var cc = fn(x, y, nx, ny, d); if (cc) this.set(x, y, cc); }
        else this.set(x, y, c);
      }
    }
  }
};
PX.prototype.disc = function (cx, cy, r, c, fn) { this.ellipse(cx, cy, r, r, c, fn); };
// ポリゴン塗りつぶし (偶奇規則, ピクセル中心サンプリング)
PX.prototype.poly = function (pts, c, fn) {
  var minY = Infinity, maxY = -Infinity, i;
  for (i = 0; i < pts.length; i++) { minY = Math.min(minY, pts[i][1]); maxY = Math.max(maxY, pts[i][1]); }
  for (var y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
    var sy = y + 0.5, xs = [];
    for (i = 0; i < pts.length; i++) {
      var a = pts[i], b = pts[(i + 1) % pts.length];
      if ((a[1] <= sy && b[1] > sy) || (b[1] <= sy && a[1] > sy)) {
        xs.push(a[0] + (sy - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
      }
    }
    xs.sort(function (p, q) { return p - q; });
    for (i = 0; i + 1 < xs.length; i += 2) {
      for (var x = Math.ceil(xs[i] - 0.5); x <= Math.floor(xs[i + 1] - 0.5); x++) {
        if (fn) { var cc = fn(x, y); if (cc) this.set(x, y, cc); }
        else this.set(x, y, c);
      }
    }
  }
};
// 角丸矩形
PX.prototype.rrect = function (x, y, w, h, r, c, fn) {
  for (var j = 0; j < h; j++) {
    for (var i = 0; i < w; i++) {
      var dx = 0, dy = 0;
      if (i < r) dx = r - i - 0.5; else if (i >= w - r) dx = i - (w - r) + 0.5;
      if (j < r) dy = r - j - 0.5; else if (j >= h - r) dy = j - (h - r) + 0.5;
      if (dx * dx + dy * dy <= r * r + 0.3) {
        if (fn) { var cc = fn(x + i, y + j, i, j); if (cc) this.set(x + i, y + j, cc); }
        else this.set(x + i, y + j, c);
      }
    }
  }
};
// 不透明領域の外周に輪郭線
PX.prototype.outline = function (c, diag) {
  var w = this.w, h = this.h, src = this.d.slice(), self = this;
  function op(x, y) { return x >= 0 && y >= 0 && x < w && y < h && G.ca(src[y * w + x]) > 100; }
  for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
    if (op(x, y)) continue;
    if (op(x - 1, y) || op(x + 1, y) || op(x, y - 1) || op(x, y + 1) ||
      (diag && (op(x - 1, y - 1) || op(x + 1, y - 1) || op(x - 1, y + 1) || op(x + 1, y + 1)))) {
      self.d[y * w + x] = c;
    }
  }
  return this;
};
// 内側の輪郭 (不透明部の縁を指定色に)
PX.prototype.innerEdge = function (c, onlyIf) {
  var w = this.w, h = this.h, src = this.d.slice();
  function tr(x, y) { return x < 0 || y < 0 || x >= w || y >= h || G.ca(src[y * w + x]) < 100; }
  for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
    if (tr(x, y)) continue;
    if (onlyIf && !onlyIf(src[y * w + x])) continue;
    if (tr(x - 1, y) || tr(x + 1, y) || tr(x, y - 1) || tr(x, y + 1)) this.d[y * w + x] = c;
  }
  return this;
};
PX.prototype.flipX = function () {
  var o = new PX(this.w, this.h);
  for (var y = 0; y < this.h; y++) for (var x = 0; x < this.w; x++) o.d[y * this.w + x] = this.d[y * this.w + (this.w - 1 - x)];
  return o;
};
// 左半分を右に鏡写し
PX.prototype.mirrorLeft = function () {
  var w = this.w;
  for (var y = 0; y < this.h; y++) for (var x = 0; x < (w >> 1); x++) this.d[y * w + (w - 1 - x)] = this.d[y * w + x];
  return this;
};
PX.prototype.replace = function (a, b) {
  a = G.col(a); b = G.col(b);
  for (var i = 0; i < this.d.length; i++) if (this.d[i] === a) this.d[i] = b;
  return this;
};
PX.prototype.map = function (fn) {
  for (var y = 0; y < this.h; y++) for (var x = 0; x < this.w; x++) {
    var i = y * this.w + x, c = this.d[i];
    if (G.ca(c)) { var n = fn(c, x, y); if (n !== undefined) this.d[i] = n; }
  }
  return this;
};
PX.prototype.blit = function (src, dx, dy) {
  for (var y = 0; y < src.h; y++) for (var x = 0; x < src.w; x++) {
    var c = src.d[y * src.w + x];
    if (G.ca(c)) this.set(dx + x, dy + y, c);
  }
  return this;
};
PX.prototype.clone = function () { var o = new PX(this.w, this.h); o.d.set(this.d); return o; };
PX.prototype.toCanvas = function () {
  var cv = G.makeCanvas(this.w, this.h);
  var cx = cv.getContext('2d');
  var id = cx.createImageData(this.w, this.h);
  new Uint32Array(id.data.buffer).set(this.d);
  cx.putImageData(id, 0, 0);
  return cv;
};
// 不透明部分のバウンディングでトリミング
PX.prototype.trim = function () {
  var minX = this.w, minY = this.h, maxX = -1, maxY = -1;
  for (var y = 0; y < this.h; y++) for (var x = 0; x < this.w; x++) {
    if (G.ca(this.d[y * this.w + x])) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return new PX(1, 1);
  var o = new PX(maxX - minX + 1, maxY - minY + 1);
  for (y = minY; y <= maxY; y++) for (x = minX; x <= maxX; x++) o.d[(y - minY) * o.w + (x - minX)] = this.d[y * this.w + x];
  return o;
};

// 球体ディザシェーディング:  ramp = 暗→明 の色配列
// lx,ly: 光源方向 (左上なら -0.6,-0.8)
G.shadeRamp = function (ramp, nx, ny, x, y, lx, ly, bias) {
  var nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
  var l = -(nx * lx + ny * ly) * 0.75 + nz * 0.45 + (bias || 0);
  l = G.clamp(l, 0, 0.999) * (ramp.length - 1);
  var i = Math.floor(l), f = l - i;
  if (i < ramp.length - 1 && G.dither(x, y, f)) i++;
  return ramp[i];
};

// ---------- 値ノイズ (背景生成用) ----------
G.noise1 = function (seed) {
  var r = G.rng(seed), tbl = [];
  for (var i = 0; i < 512; i++) tbl.push(r());
  return function (x) {
    var i0 = Math.floor(x), f = x - i0;
    var a = tbl[((i0 % 512) + 512) % 512], b = tbl[(((i0 + 1) % 512) + 512) % 512];
    var t = f * f * (3 - 2 * f);
    return a + (b - a) * t;
  };
};
// 周期的 fBm (幅 period で継ぎ目なし)
G.fbmLoop = function (seed, period, octaves) {
  var ns = [];
  for (var o = 0; o < octaves; o++) ns.push(G.noise1(seed + o * 101));
  return function (x) {
    var v = 0, amp = 1, tot = 0, freq = 1;
    for (var o = 0; o < octaves; o++) {
      var p = period * freq, xx = ((x * freq) % p + p) % p;
      // 周期化: 端で 2 点を補間
      var a = ns[o](xx), b = ns[o](xx - p);
      var t = xx / p;
      v += (a * (1 - t) + b * t) * amp;
      tot += amp; amp *= 0.5; freq *= 2;
    }
    return v / tot;
  };
};
