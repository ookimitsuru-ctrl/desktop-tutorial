import * as THREE from 'three';
import { makeRng } from '../util/math.js';

// 手続き生成テクスチャ群

function tileableValueNoise(size, cells, rng) {
  const grid = new Float32Array(cells * cells);
  for (let i = 0; i < grid.length; i++) grid[i] = rng();
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const fy = (y / size) * cells;
    const y0 = Math.floor(fy);
    const ty = fy - y0;
    const sy = ty * ty * (3 - 2 * ty);
    const y1 = (y0 + 1) % cells;
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * cells;
      const x0 = Math.floor(fx);
      const tx = fx - x0;
      const sx = tx * tx * (3 - 2 * tx);
      const x1 = (x0 + 1) % cells;
      const a = grid[y0 * cells + x0];
      const b = grid[y0 * cells + x1];
      const c = grid[y1 * cells + x0];
      const d = grid[y1 * cells + x1];
      out[y * size + x] = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    }
  }
  return out;
}

function fbm(size, baseCells, octaves, rng) {
  const out = new Float32Array(size * size);
  let amp = 1;
  let total = 0;
  let cells = baseCells;
  for (let o = 0; o < octaves; o++) {
    const n = tileableValueNoise(size, cells, rng);
    for (let i = 0; i < out.length; i++) out[i] += n[i] * amp;
    total += amp;
    amp *= 0.5;
    cells *= 2;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

function normalize(arr) {
  let mn = Infinity;
  let mx = -Infinity;
  for (const v of arr) {
    if (v < mn) mn = v;
    if (v > mx) mx = v;
  }
  const r = mx - mn || 1;
  for (let i = 0; i < arr.length; i++) arr[i] = (arr[i] - mn) / r;
  return arr;
}

let noiseTex = null;
/** RGBA: R=大きなムラ, G=中くらいのムラ, B=細かい粒, A=ブロッチ */
export function getNoiseTexture() {
  if (noiseTex) return noiseTex;
  const size = 256;
  const rng = makeRng(1234);
  const r = normalize(fbm(size, 4, 4, rng));
  const g = normalize(fbm(size, 16, 3, rng));
  const b = normalize(fbm(size, 64, 2, rng));
  const a = normalize(fbm(size, 8, 5, rng));
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    data[i * 4] = r[i] * 255;
    data[i * 4 + 1] = g[i] * 255;
    data[i * 4 + 2] = b[i] * 255;
    data[i * 4 + 3] = a[i] * 255;
  }
  noiseTex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  noiseTex.wrapS = noiseTex.wrapT = THREE.RepeatWrapping;
  noiseTex.minFilter = THREE.LinearMipmapLinearFilter;
  noiseTex.magFilter = THREE.LinearFilter;
  noiseTex.generateMipmaps = true;
  noiseTex.anisotropy = 4;
  noiseTex.needsUpdate = true;
  return noiseTex;
}

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function canvasTexture(canvas, { srgb = true, repeat = false, aniso = 8, mips = true } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  t.generateMipmaps = mips;
  t.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  return t;
}

/** ゴールネットのアルファテクスチャ（ひし形の網目） */
export function makeNetTexture() {
  const s = 128;
  const c = makeCanvas(s, s);
  const g = c.getContext('2d');
  g.clearRect(0, 0, s, s);
  g.strokeStyle = 'rgba(255,255,255,1)';
  g.lineWidth = 5;
  g.lineCap = 'round';
  // 六角形の網目
  const r = s / 4;
  g.beginPath();
  g.moveTo(0, s / 2);
  g.lineTo(s / 4, s / 2);
  g.lineTo(s / 2, 0);
  g.moveTo(s / 4, s / 2);
  g.lineTo(s / 2, s);
  g.moveTo(s / 2, 0);
  g.lineTo(s * 0.75, 0);
  g.moveTo(s / 2, s);
  g.lineTo(s * 0.75, s);
  g.moveTo(s * 0.75, 0);
  g.lineTo(s, s / 2);
  g.moveTo(s * 0.75, s);
  g.lineTo(s, s / 2);
  g.stroke();
  void r;
  const t = canvasTexture(c, { srgb: false, repeat: true, aniso: 8 });
  return t;
}
