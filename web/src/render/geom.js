import * as THREE from 'three';

// 角丸長方形パス（スタジアムのボウル形状）と、断面をパスに沿って押し出すリボン生成

export function rrPerimeter(hx, hz, r) {
  return 4 * (hx - r) + 4 * (hz - r) + 2 * Math.PI * r;
}

/**
 * 角丸長方形上の点を弧長sで返す。s=0 は (hx, 0) から反時計回り（上から見て +x → -z 方向）
 * 戻り値: {x, z, nx, nz}（n は外向き法線）
 */
export function rrPoint(hx, hz, r, s, out = {}) {
  const P = rrPerimeter(hx, hz, r);
  s = ((s % P) + P) % P;
  const sx = 2 * (hx - r);
  const sz = 2 * (hz - r);
  const arc = (Math.PI / 2) * r;
  let acc = 0;
  const pts = [
    // 右辺上半分: (hx, 0) → (hx, -(hz-r))
    { len: hz - r, f: (t) => [hx, -t, 1, 0] },
    // 右上角（中心 (hx-r, -(hz-r))、法線角 0 → -90°）
    { len: arc, f: (t) => { const a = -t / r; return [hx - r + r * Math.cos(a), -(hz - r) + r * Math.sin(a), Math.cos(a), Math.sin(a)]; } },
    // 上辺: (hx-r, -hz) → (-(hx-r), -hz)
    { len: sx, f: (t) => [hx - r - t, -hz, 0, -1] },
    // 左上角（中心 (-(hx-r), -(hz-r))、法線角 -90° → -180°）
    { len: arc, f: (t) => { const a = -Math.PI / 2 - t / r; return [-(hx - r) + r * Math.cos(a), -(hz - r) + r * Math.sin(a), Math.cos(a), Math.sin(a)]; } },
    // 左辺
    { len: sz, f: (t) => [-hx, -(hz - r) + t, -1, 0] },
    // 左下角（法線角 -180° → -270°）
    { len: arc, f: (t) => { const a = -Math.PI - t / r; return [-(hx - r) + r * Math.cos(a), hz - r + r * Math.sin(a), Math.cos(a), Math.sin(a)]; } },
    // 下辺
    { len: sx, f: (t) => [-(hx - r) + t, hz, 0, 1] },
    // 右下角（法線角 -270° → -360°）
    { len: arc, f: (t) => { const a = -Math.PI * 1.5 - t / r; return [hx - r + r * Math.cos(a), hz - r + r * Math.sin(a), Math.cos(a), Math.sin(a)]; } },
    // 右辺下半分
    { len: hz - r, f: (t) => [hx, hz - r - t, 1, 0] },
  ];
  for (const seg of pts) {
    if (s <= acc + seg.len || seg === pts[pts.length - 1]) {
      const [x, z, nx, nz] = seg.f(Math.min(s - acc, seg.len));
      out.x = x;
      out.z = z;
      out.nx = nx;
      out.nz = nz;
      return out;
    }
    acc += seg.len;
  }
  return out;
}

/** 角丸長方形パスのサンプル列（直線部は粗く、角は細かく）。sは弧長 */
export function rrSamples(hx, hz, r, straightStep = 6, cornerSegs = 10) {
  const sx = 2 * (hx - r);
  const sz = 2 * (hz - r);
  const arc = (Math.PI / 2) * r;
  const lens = [hz - r, arc, sx, arc, sz, arc, sx, arc, hz - r];
  const out = [];
  let acc = 0;
  lens.forEach((len, i) => {
    const isArc = i % 2 === 1;
    const n = isArc ? cornerSegs : Math.max(1, Math.ceil(len / straightStep));
    for (let k = 0; k < n; k++) out.push(acc + (len * k) / n);
    acc += len;
  });
  out.push(acc); // 閉じる
  return out;
}

/**
 * 断面(offset, height)の折れ線をパスに沿って押し出したジオメトリを作る
 * @param {object} path {hx,hz,r, samples:number[]}
 * @param {Array<[number,number]>} profile 断面の点列（パスからの外向きオフセット, 高さ）
 * @param {object} opts {uScale, vScale, filter:(s,p)=>bool}
 */
export function sweepRibbon(path, profile, opts = {}) {
  const { uScale = 1, vScale = 1, sRange = null } = opts;
  const samples = sRange ? path.samples.filter((s) => s >= sRange[0] - 1e-6 && s <= sRange[1] + 1e-6) : path.samples;
  const pos = [];
  const nor = [];
  const uv = [];
  const idx = [];
  // 断面に沿った累積長さ
  const vAcc = [0];
  for (let j = 1; j < profile.length; j++) {
    vAcc.push(vAcc[j - 1] + Math.hypot(profile[j][0] - profile[j - 1][0], profile[j][1] - profile[j - 1][1]));
  }
  const pt = {};
  const cols = profile.length;
  for (let i = 0; i < samples.length; i++) {
    rrPoint(path.hx, path.hz, path.r, samples[i], pt);
    for (let j = 0; j < cols; j++) {
      const [o, h] = profile[j];
      pos.push(pt.x + pt.nx * o, h, pt.z + pt.nz * o);
      // 断面の接線から法線（パス内側＋上方向を向くように）
      const j0 = Math.max(0, j - 1);
      const j1 = Math.min(cols - 1, j + 1);
      const dO = profile[j1][0] - profile[j0][0];
      const dH = profile[j1][1] - profile[j0][1];
      const l = Math.hypot(dO, dH) || 1;
      const no = -dH / l;
      const nh = dO / l;
      nor.push(pt.nx * no, nh, pt.nz * no);
      uv.push(samples[i] / uScale, vAcc[j] / vScale);
    }
  }
  for (let i = 0; i < samples.length - 1; i++) {
    for (let j = 0; j < cols - 1; j++) {
      const a = i * cols + j;
      const b = (i + 1) * cols + j;
      const c = (i + 1) * cols + j + 1;
      const d = i * cols + j + 1;
      idx.push(a, b, d, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  fixWinding(g);
  return g;
}

/** 頂点法線と面の向きが合うように三角形の巻き方向を揃える */
export function fixWinding(g) {
  const p = g.attributes.position;
  const n = g.attributes.normal;
  const idx = g.index.array;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const fn = new THREE.Vector3();
  const vn = new THREE.Vector3();
  for (let t = 0; t < idx.length; t += 3) {
    a.fromBufferAttribute(p, idx[t]);
    b.fromBufferAttribute(p, idx[t + 1]);
    c.fromBufferAttribute(p, idx[t + 2]);
    fn.subVectors(b, a).cross(c.sub(a));
    vn.fromBufferAttribute(n, idx[t]);
    if (fn.dot(vn) < 0) {
      const tmp = idx[t + 1];
      idx[t + 1] = idx[t + 2];
      idx[t + 2] = tmp;
    }
  }
  g.index.needsUpdate = true;
  return g;
}
