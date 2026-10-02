// WebGL ワイヤーフレーム描画エンジン
//  - 太さ付きの発光ライン (CPU で投影 + クアッド展開)
//  - 残光(フォスファ)トレイル / ブルーム / 色収差 / グリッチ のポストエフェクト
//  - 世界を湾曲させる "bend" でレールの曲がりを表現
import { clamp, sat } from './util.js';

const MAX_Q = 12000; // 1バッチあたりの最大クアッド数 (4*12000 < 65536)
const FLOATS = 8; // pos2 uv2 inner1 col3

const VS_LINE = `
attribute vec2 aPos; attribute vec2 aUV; attribute float aInner; attribute vec3 aCol;
varying vec2 vUV; varying float vInner; varying vec3 vCol;
void main(){ vUV=aUV; vInner=aInner; vCol=aCol; gl_Position=vec4(aPos,0.0,1.0); }`;
const FS_LINE = `
precision mediump float;
varying vec2 vUV; varying float vInner; varying vec3 vCol;
void main(){
  float dv = max((abs(vUV.y)-vInner)/max(1.0-vInner,0.0001),0.0);
  float r2 = vUV.x*vUV.x + dv*dv;
  float p = exp(-r2*3.4);
  float core = exp(-r2*16.0);
  vec3 c = vCol*(0.55*p + 0.75*core) + vec3(core*0.28)*max(vCol.r,max(vCol.g,vCol.b));
  gl_FragColor = vec4(c,1.0);
}`;

const VS_QUAD = `
attribute vec2 aPos; varying vec2 vUv;
void main(){ vUv=aPos*0.5+0.5; gl_Position=vec4(aPos,0.0,1.0); }`;

const FS_TRAIL = `
precision mediump float; varying vec2 vUv;
uniform sampler2D uWorld, uPrev; uniform float uDecay;
void main(){
  vec3 w=texture2D(uWorld,vUv).rgb;
  vec3 p=texture2D(uPrev,vUv).rgb*uDecay-vec3(1.6/255.0);
  gl_FragColor=vec4(max(w,max(p,vec3(0.0))),1.0);
}`;

const FS_PRE = `
precision mediump float; varying vec2 vUv;
uniform sampler2D uT, uH; uniform vec2 uTexel; uniform float uThr, uDim;
vec3 s(vec2 uv){ return texture2D(uT,uv).rgb*uDim+texture2D(uH,uv).rgb; }
void main(){
  vec3 c = s(vUv+uTexel*vec2(-1.0,-1.0))+s(vUv+uTexel*vec2(1.0,-1.0))+s(vUv+uTexel*vec2(-1.0,1.0))+s(vUv+uTexel*vec2(1.0,1.0));
  c*=0.25;
  float br=max(c.r,max(c.g,c.b));
  c*=max(br-uThr,0.0)/max(br,0.0001);
  gl_FragColor=vec4(c*1.6,1.0);
}`;

const FS_BLUR = `
precision mediump float; varying vec2 vUv;
uniform sampler2D uTex; uniform vec2 uDir;
void main(){
  vec3 c=texture2D(uTex,vUv).rgb*0.2270270270;
  c+=(texture2D(uTex,vUv+uDir*1.3846153846).rgb+texture2D(uTex,vUv-uDir*1.3846153846).rgb)*0.3162162162;
  c+=(texture2D(uTex,vUv+uDir*3.2307692308).rgb+texture2D(uTex,vUv-uDir*3.2307692308).rgb)*0.0702702703;
  gl_FragColor=vec4(c,1.0);
}`;

const FS_DOWN = `
precision mediump float; varying vec2 vUv;
uniform sampler2D uTex; uniform vec2 uTexel;
void main(){
  vec3 c=texture2D(uTex,vUv+uTexel*vec2(-1.0,-1.0)).rgb+texture2D(uTex,vUv+uTexel*vec2(1.0,-1.0)).rgb
        +texture2D(uTex,vUv+uTexel*vec2(-1.0,1.0)).rgb+texture2D(uTex,vUv+uTexel*vec2(1.0,1.0)).rgb;
  gl_FragColor=vec4(c*0.25,1.0);
}`;

const FS_FINAL = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vUv;
uniform sampler2D uT, uH, uB0, uB1, uB2;
uniform vec4 uFlash; uniform vec3 uTint, uBgA, uBgB;
uniform float uAber, uGlitch, uTime, uVig, uBloom, uRes, uDim;
float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
void main(){
  vec2 uv=vUv;
  float tk=floor(uTime*20.0);
  if(uGlitch>0.001){
    float row=floor(uv.y*46.0);
    float h=hash(vec2(row,tk));
    uv.x+=(hash(vec2(row*1.7,tk+3.0))-0.5)*uGlitch*0.09*step(0.78,h);
  }
  vec2 d=uv-0.5;
  float r2=dot(d,d);
  vec2 off=d*(uAber*(0.35+r2*2.2));
  vec3 base;
  base.r=texture2D(uT,uv+off).r*uDim+texture2D(uH,uv+off).r;
  base.g=texture2D(uT,uv).g*uDim+texture2D(uH,uv).g;
  base.b=texture2D(uT,uv-off).b*uDim+texture2D(uH,uv-off).b;
  vec3 bl=texture2D(uB0,uv).rgb*0.9+texture2D(uB1,uv).rgb*1.05+texture2D(uB2,uv).rgb*1.25;
  vec3 col=base+bl*uBloom;
  // 背景の淡いグラデーション (ステージ色)
  col+=mix(uBgA,uBgB,smoothstep(0.0,1.0,uv.y))*(1.0-r2*1.3);
  col*=uTint;
  col*=1.0-uVig*smoothstep(0.25,0.95,length(d*vec2(1.0,1.15))*1.5);
  col*=0.965+0.035*sin(uv.y*uRes*3.14159);
  col+=uFlash.rgb*uFlash.a;
  col+=(hash(uv*uRes+tk)-0.5)*0.012;
  col=1.0-exp(-col*1.35);
  gl_FragColor=vec4(col,1.0);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(s) + '\n' + src);
  return s;
}
function program(gl, vs, fs, attribs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  attribs.forEach((a, i) => gl.bindAttribLocation(p, i, a));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    u[info.name] = gl.getUniformLocation(p, info.name);
  }
  return { p, u };
}

export class Gfx {
  constructor(canvas) {
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    if (!gl) throw new Error('WebGL not available');
    this.gl = gl;
    this.canvas = canvas;
    this.W = 2; this.H = 2;
    this.aspect = 2;
    this.scale = 1; // 解像度スケール (自動調整)
    this.dpr = 1;
    this.designScale = 1; // 1080px基準 → 実ピクセル

    this.prgLine = program(gl, VS_LINE, FS_LINE, ['aPos', 'aUV', 'aInner', 'aCol']);
    this.prgTrail = program(gl, VS_QUAD, FS_TRAIL, ['aPos']);
    this.prgPre = program(gl, VS_QUAD, FS_PRE, ['aPos']);
    this.prgBlur = program(gl, VS_QUAD, FS_BLUR, ['aPos']);
    this.prgDown = program(gl, VS_QUAD, FS_DOWN, ['aPos']);
    this.prgFinal = program(gl, VS_QUAD, FS_FINAL, ['aPos']);

    // 動的ライン頂点バッファ
    this.vbuf = new Float32Array(MAX_Q * 4 * FLOATS);
    this.n = 0; // クアッド数
    this.vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.vbuf.byteLength, gl.DYNAMIC_DRAW);
    const idx = new Uint16Array(MAX_Q * 6);
    for (let i = 0; i < MAX_Q; i++) {
      const b = i * 4, o = i * 6;
      idx[o] = b; idx[o + 1] = b + 1; idx[o + 2] = b + 2;
      idx[o + 3] = b + 2; idx[o + 4] = b + 1; idx[o + 5] = b + 3;
    }
    this.ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);

    // フルスクリーンクアッド
    this.qbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.qbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    this.targets = {};
    this.trailIdx = 0;
    this.curTarget = null;

    // カメラ
    this.cam = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, fov: 1.0 };
    this.m = new Float32Array(9);
    this.tanH = 0.6;
    this.near = 0.6;
    this.bendX = 0; this.bendY = 0;
    this.fogNear = 60; this.fogFar = 420;
    this.lineScale = 1;

    // ポスト設定
    this.fx = {
      flash: [0, 0, 0, 0], aber: 0.0016, glitch: 0, vig: 0.55, bloom: 1.0, tint: [1, 1, 1],
      bgA: [0, 0, 0], bgB: [0, 0, 0], time: 0, decay: 0.8, dim: 1,
    };
    this.tmpP = [0, 0, 0];
    this.lineCount = 0;
  }

  // ---------- ターゲット (FBO) ----------
  _target(name, w, h) {
    const gl = this.gl;
    w = Math.max(2, w | 0); h = Math.max(2, h | 0);
    let t = this.targets[name];
    if (t && t.w === w && t.h === h) return t;
    if (t) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); }
    t = { w, h, tex: gl.createTexture(), fbo: gl.createFramebuffer() };
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.tex, 0);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.targets[name] = t;
    return t;
  }

  // CSSサイズ・DPR・スケールから内部解像度を決定
  resize(cssW, cssH, dpr) {
    this.cssW = cssW; this.cssH = cssH; this.dpr = dpr;
    this._applySize();
  }
  setScale(s) { this.scale = s; this._applySize(); }
  _applySize() {
    const pw = Math.max(2, Math.round(this.cssW * this.dpr));
    const ph = Math.max(2, Math.round(this.cssH * this.dpr));
    if (this.canvas.width !== pw || this.canvas.height !== ph) { this.canvas.width = pw; this.canvas.height = ph; }
    this.W = Math.max(2, Math.round(pw * this.scale));
    this.H = Math.max(2, Math.round(ph * this.scale));
    this.aspect = this.W / this.H;
    this.designScale = this.H / 1080;
    this.tanH = Math.tan(this.cam.fov / 2);
    const W = this.W, H = this.H;
    this._target('world', W, H);
    this._target('hud', W, H);
    this._target('trail0', W, H);
    this._target('trail1', W, H);
    const hw = Math.max(2, W >> 1), hh = Math.max(2, H >> 1);
    this._target('b0a', hw, hh); this._target('b0b', hw, hh);
    this._target('b1a', hw >> 1, hh >> 1); this._target('b1b', hw >> 1, hh >> 1);
    this._target('b2a', hw >> 2, hh >> 2); this._target('b2b', hw >> 2, hh >> 2);
  }

  _bind(t) {
    const gl = this.gl;
    if (t) { gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo); gl.viewport(0, 0, t.w, t.h); }
    else { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, this.canvas.width, this.canvas.height); }
  }

  // ---------- フレーム制御 ----------
  beginWorld() {
    const gl = this.gl;
    this.n = 0; this.lineCount = 0;
    this._bind(this.targets.world);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.curTarget = 'world';
  }
  beginHud() {
    this.flush();
    const gl = this.gl;
    this._bind(this.targets.hud);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.curTarget = 'hud';
  }

  flush() {
    if (this.n === 0) return;
    const gl = this.gl;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(this.prgLine.p);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.vbuf.subarray(0, this.n * 4 * FLOATS));
    const st = FLOATS * 4;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, st, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, st, 8);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, st, 16);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 3, gl.FLOAT, false, st, 20);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.drawElements(gl.TRIANGLES, this.n * 6, gl.UNSIGNED_SHORT, 0);
    gl.disableVertexAttribArray(1); gl.disableVertexAttribArray(2); gl.disableVertexAttribArray(3);
    gl.disable(gl.BLEND);
    this.n = 0;
  }

  // ---------- ライン出力 (NDC) ----------
  // wa/wb: 端点の半幅(実ピクセル)
  _quad(ax, ay, bx, by, wa, wb, r0, g0, b0, r1, g1, b1) {
    if (this.n >= MAX_Q) this.flush();
    const W2 = this.W * 0.5, H2 = this.H * 0.5;
    let dx = (bx - ax) * W2, dy = (by - ay) * H2;
    let len = Math.sqrt(dx * dx + dy * dy);
    let ux, uy;
    if (len < 0.001) { ux = 1; uy = 0; len = 0; } else { ux = dx / len; uy = dy / len; }
    const ext = Math.max(wa, wb);
    const nx = -uy, ny = ux;
    const ix = 1 / W2, iy = 1 / H2;
    // 端点を拡張
    const ax2 = (ax * W2 - ux * ext), ay2 = (ay * H2 - uy * ext);
    const bx2 = (bx * W2 + ux * ext), by2 = (by * H2 + uy * ext);
    const half = len * 0.5 + ext;
    const inner = len * 0.5 / half;
    const o = this.n * 4 * FLOATS;
    const f = this.vbuf;
    let k = o;
    // v0: A側 -n
    f[k++] = (ax2 - nx * wa) * ix; f[k++] = (ay2 - ny * wa) * iy; f[k++] = -1; f[k++] = -1; f[k++] = inner; f[k++] = r0; f[k++] = g0; f[k++] = b0;
    f[k++] = (ax2 + nx * wa) * ix; f[k++] = (ay2 + ny * wa) * iy; f[k++] = 1; f[k++] = -1; f[k++] = inner; f[k++] = r0; f[k++] = g0; f[k++] = b0;
    f[k++] = (bx2 - nx * wb) * ix; f[k++] = (by2 - ny * wb) * iy; f[k++] = -1; f[k++] = 1; f[k++] = inner; f[k++] = r1; f[k++] = g1; f[k++] = b1;
    f[k++] = (bx2 + nx * wb) * ix; f[k++] = (by2 + ny * wb) * iy; f[k++] = 1; f[k++] = 1; f[k++] = inner; f[k++] = r1; f[k++] = g1; f[k++] = b1;
    this.n++;
    this.lineCount++;
  }

  // ---------- HUD (2D) ライン: x∈[-aspect,aspect], y∈[-1,1] ----------
  // w: 1080p基準のピクセル幅, a: 明るさ
  line2(x0, y0, x1, y1, r, g, b, w = 2, a = 1) {
    const asp = this.aspect;
    const ax = x0 / asp, bx = x1 / asp;
    if ((ax < -1.3 && bx < -1.3) || (ax > 1.3 && bx > 1.3) || (y0 < -1.3 && y1 < -1.3) || (y0 > 1.3 && y1 > 1.3)) return;
    const pw = w * this.designScale * 0.9 + 0.35;
    this._quad(ax, y0, bx, y1, pw, pw, r * a, g * a, b * a, r * a, g * a, b * a);
  }
  dot2(x, y, r, g, b, w = 4, a = 1) { this.line2(x, y, x + 0.0004, y, r, g, b, w, a); }

  // ---------- カメラ (3D) ----------
  setCamera(x, y, z, yaw, pitch, roll, fov) {
    const c = this.cam;
    c.x = x; c.y = y; c.z = z; c.yaw = yaw; c.pitch = pitch; c.roll = roll; c.fov = fov;
    this.tanH = Math.tan(fov / 2);
    // M = Rz(-roll) * Rx(pitch) * Ry(-yaw)
    const cy = Math.cos(-yaw), sy = Math.sin(-yaw);
    const cx = Math.cos(pitch), sx = Math.sin(pitch);
    const cz = Math.cos(-roll), sz = Math.sin(-roll);
    // Ry
    const a00 = cy, a01 = 0, a02 = sy, a10 = 0, a11 = 1, a12 = 0, a20 = -sy, a21 = 0, a22 = cy;
    // Rx * Ry
    const b00 = a00, b01 = a01, b02 = a02;
    const b10 = cx * a10 - sx * a20, b11 = cx * a11 - sx * a21, b12 = cx * a12 - sx * a22;
    const b20 = sx * a10 + cx * a20, b21 = sx * a11 + cx * a21, b22 = sx * a12 + cx * a22;
    // Rz * (..)
    const m = this.m;
    m[0] = cz * b00 - sz * b10; m[1] = cz * b01 - sz * b11; m[2] = cz * b02 - sz * b12;
    m[3] = sz * b00 + cz * b10; m[4] = sz * b01 + cz * b11; m[5] = sz * b02 + cz * b12;
    m[6] = b20; m[7] = b21; m[8] = b22;
  }

  // ワールド座標 → ビュー座標 (out配列)
  toView(x, y, z, out) {
    const c = this.cam, m = this.m;
    const dx = x - c.x, dy = y - c.y, dz = z - c.z;
    out[0] = m[0] * dx + m[1] * dy + m[2] * dz;
    out[1] = m[3] * dx + m[4] * dy + m[5] * dz;
    out[2] = m[6] * dx + m[7] * dy + m[8] * dz;
    return out;
  }

  // ビュー座標にbend(湾曲)を適用して投影。HUD座標を返す。z<=nearならfalse
  projectView(vx, vy, vz, out) {
    if (vz < this.near) return false;
    const zz = vz * vz;
    vx += this.bendX * zz; vy += this.bendY * zz;
    const k = 1 / (vz * this.tanH);
    out[0] = vx * k; // ndc x * aspect (= HUD x)
    out[1] = vy * k;
    out[2] = vz;
    return true;
  }
  // 世界座標 → HUD座標 (ロックオン表示等)
  project(x, y, z, out) {
    const t = this.tmpP;
    this.toView(x, y, z, t);
    if (!this.projectView(t[0], t[1], t[2], out)) return false;
    return true;
  }

  _fog(z) {
    const f = 1 - (z - this.fogNear) / (this.fogFar - this.fogNear);
    return f <= 0 ? 0 : f >= 1 ? 1 : f * f;
  }
  _wd(z) { return clamp(0.5 + 9 / (z + 5), 0.5, 3.2); }

  // ビュー空間の線分を描画
  lineView(x0, y0, z0, x1, y1, z1, r, g, b, w = 1.6) {
    const near = this.near;
    if (z0 < near && z1 < near) return;
    if (z0 < near) { const t = (near - z0) / (z1 - z0); x0 += (x1 - x0) * t; y0 += (y1 - y0) * t; z0 = near; }
    else if (z1 < near) { const t = (near - z1) / (z0 - z1); x1 += (x0 - x1) * t; y1 += (y0 - y1) * t; z1 = near; }
    const bx = this.bendX, by = this.bendY;
    const zz0 = z0 * z0, zz1 = z1 * z1;
    x0 += bx * zz0; y0 += by * zz0; x1 += bx * zz1; y1 += by * zz1;
    const k0 = 1 / (z0 * this.tanH), k1 = 1 / (z1 * this.tanH);
    const asp = this.aspect;
    const ax = x0 * k0 / asp, ay = y0 * k0, bxn = x1 * k1 / asp, byn = y1 * k1;
    if ((ax < -1.4 && bxn < -1.4) || (ax > 1.4 && bxn > 1.4) || (ay < -1.4 && byn < -1.4) || (ay > 1.4 && byn > 1.4)) return;
    const f0 = this._fog(z0), f1 = this._fog(z1);
    if (f0 <= 0.002 && f1 <= 0.002) return;
    const s = this.designScale * this.lineScale;
    const w0 = (w * this._wd(z0)) * s * 0.9 + 0.3, w1 = (w * this._wd(z1)) * s * 0.9 + 0.3;
    this._quad(ax, ay, bxn, byn, w0, w1, r * f0, g * f0, b * f0, r * f1, g * f1, b * f1);
  }

  // 世界空間の線分
  line3(x0, y0, z0, x1, y1, z1, r, g, b, w = 1.6) {
    const c = this.cam, m = this.m;
    let dx = x0 - c.x, dy = y0 - c.y, dz = z0 - c.z;
    const ax = m[0] * dx + m[1] * dy + m[2] * dz, ay = m[3] * dx + m[4] * dy + m[5] * dz, az = m[6] * dx + m[7] * dy + m[8] * dz;
    dx = x1 - c.x; dy = y1 - c.y; dz = z1 - c.z;
    const bx = m[0] * dx + m[1] * dy + m[2] * dz, by = m[3] * dx + m[4] * dy + m[5] * dz, bz = m[6] * dx + m[7] * dy + m[8] * dz;
    this.lineView(ax, ay, az, bx, by, bz, r, g, b, w);
  }

  // 発光ドット (ワールド)
  dot3(x, y, z, r, g, b, w = 4) {
    this.line3(x, y, z, x + 0.001, y, z, r, g, b, w);
  }

  // メッシュ描画
  mesh(mesh, x, y, z, yaw, pitch, roll, s, r, g, b, w = 1.6, edgeMask = null) {
    const c = this.cam, m = this.m;
    // R_obj = Ry(yaw) * Rx(pitch) * Rz(roll)
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cx = Math.cos(pitch), sx = Math.sin(pitch), cz = Math.cos(roll), sz = Math.sin(roll);
    // Rx*Rz
    const p00 = cz, p01 = -sz, p02 = 0;
    const p10 = cx * sz, p11 = cx * cz, p12 = -sx;
    const p20 = sx * sz, p21 = sx * cz, p22 = cx;
    // Ry*(Rx*Rz)
    const o00 = cy * p00 + sy * p20, o01 = cy * p01 + sy * p21, o02 = cy * p02 + sy * p22;
    const o10 = p10, o11 = p11, o12 = p12;
    const o20 = -sy * p00 + cy * p20, o21 = -sy * p01 + cy * p21, o22 = -sy * p02 + cy * p22;
    // C = M * R_obj  (スケール込み)
    const c00 = (m[0] * o00 + m[1] * o10 + m[2] * o20) * s, c01 = (m[0] * o01 + m[1] * o11 + m[2] * o21) * s, c02 = (m[0] * o02 + m[1] * o12 + m[2] * o22) * s;
    const c10 = (m[3] * o00 + m[4] * o10 + m[5] * o20) * s, c11 = (m[3] * o01 + m[4] * o11 + m[5] * o21) * s, c12 = (m[3] * o02 + m[4] * o12 + m[5] * o22) * s;
    const c20 = (m[6] * o00 + m[7] * o10 + m[8] * o20) * s, c21 = (m[6] * o01 + m[7] * o11 + m[8] * o21) * s, c22 = (m[6] * o02 + m[7] * o12 + m[8] * o22) * s;
    const dx = x - c.x, dy = y - c.y, dz = z - c.z;
    const tx = m[0] * dx + m[1] * dy + m[2] * dz, ty = m[3] * dx + m[4] * dy + m[5] * dz, tz = m[6] * dx + m[7] * dy + m[8] * dz;
    // 遠すぎ/後ろすぎは早期除外
    const rad = mesh.r * s;
    if (tz + rad < this.near || tz - rad > this.fogFar) return;
    const v = mesh.v, e = mesh.e, n = v.length / 3;
    const buf = this._vb || (this._vb = new Float32Array(3 * 512));
    for (let i = 0, j = 0; i < n; i++, j += 3) {
      const px = v[j], py = v[j + 1], pz = v[j + 2];
      buf[j] = c00 * px + c01 * py + c02 * pz + tx;
      buf[j + 1] = c10 * px + c11 * py + c12 * pz + ty;
      buf[j + 2] = c20 * px + c21 * py + c22 * pz + tz;
    }
    for (let i = 0, k = 0; i < e.length; i += 2, k++) {
      if (edgeMask && (edgeMask[k >> 5] & (1 << (k & 31)))) continue;
      const a = e[i] * 3, bb = e[i + 1] * 3;
      this.lineView(buf[a], buf[a + 1], buf[a + 2], buf[bb], buf[bb + 1], buf[bb + 2], r, g, b, w);
    }
  }

  // ---------- ポスト処理 & 表示 ----------
  _fs(prg, tex = null) {
    const gl = this.gl;
    gl.useProgram(prg.p);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.qbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  }
  _tex(unit, t) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
  }
  _draw() { this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4); }

  present(dt) {
    this.flush();
    const gl = this.gl, T = this.targets, fx = this.fx;
    gl.disable(gl.BLEND);
    // 1) トレイル更新
    const prev = T['trail' + this.trailIdx], next = T['trail' + (1 - this.trailIdx)];
    this._bind(next);
    this._fs(this.prgTrail);
    this._tex(0, T.world); this._tex(1, prev);
    gl.uniform1i(this.prgTrail.u.uWorld, 0); gl.uniform1i(this.prgTrail.u.uPrev, 1);
    gl.uniform1f(this.prgTrail.u.uDecay, Math.pow(fx.decay, dt * 60)); // decay: 60fps換算の1フレーム減衰率
    this._draw();
    this.trailIdx = 1 - this.trailIdx;
    // 2) ブルーム
    const b0a = T.b0a, b0b = T.b0b, b1a = T.b1a, b1b = T.b1b, b2a = T.b2a, b2b = T.b2b;
    this._bind(b0a);
    this._fs(this.prgPre);
    this._tex(0, next); this._tex(1, T.hud);
    gl.uniform1i(this.prgPre.u.uT, 0); gl.uniform1i(this.prgPre.u.uH, 1);
    gl.uniform2f(this.prgPre.u.uTexel, 0.5 / b0a.w, 0.5 / b0a.h);
    gl.uniform1f(this.prgPre.u.uThr, 0.12);
    gl.uniform1f(this.prgPre.u.uDim, fx.dim);
    this._draw();
    this._blur(b0a, b0b, 1.0);
    this._down(b0a, b1a);
    this._blur(b1a, b1b, 1.0);
    this._down(b1a, b2a);
    this._blur(b2a, b2b, 1.0);
    // 3) 合成して画面へ
    this._bind(null);
    this._fs(this.prgFinal);
    const u = this.prgFinal.u;
    this._tex(0, next); this._tex(1, T.hud); this._tex(2, b0a); this._tex(3, b1a); this._tex(4, b2a);
    gl.uniform1i(u.uT, 0); gl.uniform1i(u.uH, 1); gl.uniform1i(u.uB0, 2); gl.uniform1i(u.uB1, 3); gl.uniform1i(u.uB2, 4);
    gl.uniform4f(u.uFlash, fx.flash[0], fx.flash[1], fx.flash[2], fx.flash[3]);
    gl.uniform3f(u.uTint, fx.tint[0], fx.tint[1], fx.tint[2]);
    gl.uniform3f(u.uBgA, fx.bgA[0], fx.bgA[1], fx.bgA[2]);
    gl.uniform3f(u.uBgB, fx.bgB[0], fx.bgB[1], fx.bgB[2]);
    gl.uniform1f(u.uAber, fx.aber);
    gl.uniform1f(u.uGlitch, fx.glitch);
    gl.uniform1f(u.uTime, fx.time);
    gl.uniform1f(u.uVig, fx.vig);
    gl.uniform1f(u.uBloom, fx.bloom);
    gl.uniform1f(u.uDim, fx.dim);
    gl.uniform1f(u.uRes, this.canvas.height);
    this._draw();
  }
  _blur(a, b, spread) {
    const gl = this.gl;
    this._fs(this.prgBlur);
    gl.uniform1i(this.prgBlur.u.uTex, 0);
    this._bind(b); this._tex(0, a);
    gl.uniform2f(this.prgBlur.u.uDir, spread / a.w, 0);
    this._draw();
    this._bind(a); this._tex(0, b);
    gl.uniform2f(this.prgBlur.u.uDir, 0, spread / a.h);
    this._draw();
  }
  _down(src, dst) {
    const gl = this.gl;
    this._bind(dst);
    this._fs(this.prgDown);
    this._tex(0, src);
    gl.uniform1i(this.prgDown.u.uTex, 0);
    gl.uniform2f(this.prgDown.u.uTexel, 0.5 / src.w, 0.5 / src.h);
    this._draw();
  }
  clearTrails() {
    const gl = this.gl;
    for (const n of ['trail0', 'trail1']) { this._bind(this.targets[n]); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); }
  }
}
