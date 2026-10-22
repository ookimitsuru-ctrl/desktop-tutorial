import * as THREE from 'three';
import { BOWL, ROOF_INSET, PITCH } from '../config.js';
import { rrSamples, rrPoint, rrPerimeter, sweepRibbon } from './geom.js';
import { patchMaterial, shared } from './shading.js';
import { makeCanvas, canvasTexture } from './textures.js';

// スタジアム: 角丸ボウルの2層スタンド、VIPボックス、LEDリボン、屋根と照明、広告看板、コーナーフラッグ

export const TIERS = {
  lower: { o0: 0.6, h0: 1.4, o1: 22, h1: 12.4, rows: 26 },
  upper: { o0: 18, h0: 18.6, o1: 40, h1: 34.6, rows: 26 },
};

export const SPONSORS = [
  { name: 'NOVA COLA', bg: ['#c8102e', '#7a0019'], fg: '#ffffff', mark: 'wave' },
  { name: 'HIKARI MOBILE', bg: ['#0b3d91', '#06215a'], fg: '#ffffff', mark: 'dot' },
  { name: 'SKYRAIL AIRWAYS', bg: ['#f2f4f8', '#c9d3e3'], fg: '#0b2a5b', mark: 'wing' },
  { name: 'KAIZEN MOTORS', bg: ['#111111', '#2b2b2b'], fg: '#ff3b30', mark: 'k' },
  { name: 'AURORA BANK', bg: ['#00805a', '#004d36'], fg: '#ffffff', mark: 'arc' },
  { name: 'STRIKER SPORTS', bg: ['#ff6a00', '#c64a00'], fg: '#111111', mark: 'swoosh' },
  { name: 'SAKURA FOODS', bg: ['#ffd1e1', '#f59ab8'], fg: '#8a1640', mark: 'flower' },
  { name: 'ZENITH WATCHES', bg: ['#1a1a2e', '#000000'], fg: '#e6c068', mark: 'ring' },
  { name: 'WORLD STRIKERS 2026', bg: ['#0a1f4a', '#123a8c'], fg: '#ffd84a', mark: 'star' },
];

function drawMark(g, kind, x, y, s, color) {
  g.save();
  g.translate(x, y);
  g.fillStyle = color;
  g.strokeStyle = color;
  g.lineWidth = s * 0.14;
  switch (kind) {
    case 'wave':
      g.beginPath();
      g.arc(0, 0, s * 0.5, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#c8102e';
      g.beginPath();
      g.moveTo(-s * 0.45, s * 0.05);
      g.bezierCurveTo(-s * 0.15, -s * 0.3, s * 0.15, s * 0.3, s * 0.45, -s * 0.05);
      g.stroke();
      break;
    case 'dot':
      for (let i = 0; i < 3; i++) {
        g.beginPath();
        g.arc(0, 0, s * (0.18 + i * 0.16), -0.9, 0.9);
        g.stroke();
      }
      break;
    case 'wing':
      g.beginPath();
      g.moveTo(-s * 0.5, s * 0.25);
      g.quadraticCurveTo(0, -s * 0.5, s * 0.55, -s * 0.2);
      g.quadraticCurveTo(0, -s * 0.05, -s * 0.5, s * 0.25);
      g.fill();
      break;
    case 'k':
      g.font = `900 italic ${s}px Arial, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('K', 0, 0);
      break;
    case 'arc':
      g.beginPath();
      g.arc(0, s * 0.3, s * 0.55, Math.PI, 0);
      g.stroke();
      g.beginPath();
      g.arc(0, s * 0.3, s * 0.3, Math.PI, 0);
      g.stroke();
      break;
    case 'swoosh':
      g.beginPath();
      g.moveTo(-s * 0.55, s * 0.1);
      g.quadraticCurveTo(-s * 0.2, s * 0.45, s * 0.6, -s * 0.35);
      g.quadraticCurveTo(-s * 0.1, s * 0.2, -s * 0.55, s * 0.1);
      g.fill();
      break;
    case 'flower':
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        g.beginPath();
        g.ellipse(Math.cos(a) * s * 0.22, Math.sin(a) * s * 0.22, s * 0.2, s * 0.12, a, 0, Math.PI * 2);
        g.fill();
      }
      break;
    case 'ring':
      g.beginPath();
      g.arc(0, 0, s * 0.42, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(0, -s * 0.3);
      g.moveTo(0, 0);
      g.lineTo(s * 0.2, 0);
      g.stroke();
      break;
    case 'star': {
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 ? s * 0.22 : s * 0.5;
        g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      g.closePath();
      g.fill();
      break;
    }
    default:
      break;
  }
  g.restore();
}

/** 広告パネルを横に並べたテクスチャ */
export function makeAdTexture(order, panelW = 512, h = 64, extra = null) {
  const list = order.map((i) => SPONSORS[i % SPONSORS.length]);
  const c = makeCanvas(panelW * list.length, h);
  const g = c.getContext('2d');
  list.forEach((sp, i) => {
    const x = i * panelW;
    const grad = g.createLinearGradient(x, 0, x, h);
    grad.addColorStop(0, sp.bg[0]);
    grad.addColorStop(1, sp.bg[1]);
    g.fillStyle = grad;
    g.fillRect(x, 0, panelW, h);
    drawMark(g, sp.mark, x + h * 0.7, h / 2, h * 0.7, sp.fg);
    g.fillStyle = sp.fg;
    g.font = `900 italic ${Math.round(h * 0.52)}px "Arial Black", Arial, sans-serif`;
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    const tw = g.measureText(sp.name).width;
    const maxW = panelW - h * 1.6;
    g.save();
    g.translate(x + h * 1.3, h / 2 + 2);
    if (tw > maxW) g.scale(maxW / tw, 1);
    g.fillText(sp.name, 0, 0);
    g.restore();
    // LEDの画素感
    g.fillStyle = 'rgba(0,0,0,0.18)';
    for (let yy = 0; yy < h; yy += 4) g.fillRect(x, yy, panelW, 1);
  });
  extra?.(g, c);
  return canvasTexture(c, { repeat: true, aniso: 8 });
}

function makeSeatTexture(color1, color2) {
  const w = 64;
  const h = 64;
  const c = makeCanvas(w, h);
  const g = c.getContext('2d');
  // 段差（踏面と蹴上げ）
  g.fillStyle = '#4a4d55';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#2b2d33';
  g.fillRect(0, h * 0.72, w, h * 0.28);
  // 座席
  g.fillStyle = color1;
  g.fillRect(6, 8, w - 12, h * 0.5);
  g.fillStyle = color2;
  g.fillRect(6, 8 + h * 0.36, w - 12, h * 0.14);
  g.fillStyle = 'rgba(255,255,255,0.15)';
  g.fillRect(6, 8, w - 12, 4);
  const t = canvasTexture(c, { repeat: true, aniso: 8 });
  return t;
}

function makeLampTexture() {
  const c = makeCanvas(256, 32);
  const g = c.getContext('2d');
  g.fillStyle = '#15171c';
  g.fillRect(0, 0, 256, 32);
  for (let i = 0; i < 8; i++) {
    const x = i * 32 + 4;
    const grad = g.createRadialGradient(x + 12, 16, 1, x + 12, 16, 14);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.5, '#f4f7ff');
    grad.addColorStop(1, '#8a93a8');
    g.fillStyle = grad;
    g.fillRect(x, 5, 24, 22);
  }
  return canvasTexture(c, { repeat: true, aniso: 8 });
}

function makeGlassTexture() {
  const c = makeCanvas(128, 64);
  const g = c.getContext('2d');
  g.fillStyle = '#0d1520';
  g.fillRect(0, 0, 128, 64);
  for (let i = 0; i < 4; i++) {
    const x = i * 32;
    const grad = g.createLinearGradient(0, 0, 0, 64);
    grad.addColorStop(0, '#3a4a5c');
    grad.addColorStop(1, '#141c26');
    g.fillStyle = grad;
    g.fillRect(x + 2, 4, 28, 56);
    // 室内の灯り
    g.fillStyle = `rgba(255,214,150,${0.25 + 0.3 * ((i * 7) % 3) / 2})`;
    g.fillRect(x + 4, 38, 24, 18);
  }
  g.fillStyle = '#9aa4b0';
  for (let i = 0; i < 4; i++) g.fillRect(i * 32, 0, 2, 64);
  return canvasTexture(c, { repeat: true, aniso: 8 });
}

function makeFacadeTexture() {
  const c = makeCanvas(128, 256);
  const g = c.getContext('2d');
  g.fillStyle = '#9aa1ab';
  g.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? '#7f8792' : '#b3b9c2';
    g.fillRect(i * 16, 0, 12, 256);
  }
  g.fillStyle = '#26303d';
  for (let y = 30; y < 256; y += 56) g.fillRect(0, y, 128, 10);
  const map = canvasTexture(c, { repeat: true, aniso: 4 });
  // 夜に光るLEDライン
  const e = makeCanvas(128, 256);
  const ge = e.getContext('2d');
  ge.fillStyle = '#000';
  ge.fillRect(0, 0, 128, 256);
  ge.fillStyle = '#3a8bff';
  for (let y = 30; y < 256; y += 56) ge.fillRect(0, y + 3, 128, 4);
  const emissive = canvasTexture(e, { repeat: true, aniso: 4 });
  return { map, emissive };
}

function makeRoofTexture() {
  const c = makeCanvas(256, 256);
  const g = c.getContext('2d');
  g.fillStyle = '#e8ebef';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#b8bec8';
  g.lineWidth = 3;
  for (let i = 0; i <= 256; i += 32) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i, 256);
    g.stroke();
  }
  g.lineWidth = 1;
  for (let i = 0; i <= 256; i += 64) {
    g.beginPath();
    g.moveTo(0, i);
    g.lineTo(256, i);
    g.stroke();
  }
  return canvasTexture(c, { repeat: true, aniso: 4 });
}

function makeUndersideTexture() {
  const c = makeCanvas(128, 128);
  const g = c.getContext('2d');
  g.fillStyle = '#3a3f47';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#555c66';
  g.lineWidth = 4;
  for (let i = 0; i <= 128; i += 32) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i, 128);
    g.stroke();
  }
  g.strokeStyle = '#2a2e34';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(128, 128);
  g.moveTo(128, 0);
  g.lineTo(0, 128);
  g.stroke();
  return canvasTexture(c, { repeat: true, aniso: 4 });
}

/** LEDリボン（スタンドの帯状ディスプレイ）用テクスチャ */
export function makeRibbonTexture(text, colors) {
  const w = 2048;
  const h = 64;
  const c = makeCanvas(w, h);
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, colors[0]);
  grad.addColorStop(0.5, colors[1]);
  grad.addColorStop(1, colors[0]);
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  g.font = '900 italic 40px "Arial Black", Arial, sans-serif';
  g.textBaseline = 'middle';
  g.fillStyle = colors[2];
  let x = 20;
  while (x < w) {
    g.fillText(text, x, h / 2 + 2);
    x += g.measureText(text).width + 60;
    g.fillText('★', x - 45, h / 2 + 2);
  }
  g.fillStyle = 'rgba(0,0,0,0.25)';
  for (let yy = 0; yy < h; yy += 3) g.fillRect(0, yy, w, 1);
  return canvasTexture(c, { repeat: true, aniso: 8 });
}

export class Stadium {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'stadium';
    scene.add(this.group);
    this.perimeter = rrPerimeter(BOWL.hx, BOWL.hz, BOWL.r);
    // カメラ手前側（+z）のスタンドの範囲（中継カメラ視点では視界を遮る屋根を非表示にする）
    this.nearRange = this.sideRange('south');
    const samples = rrSamples(BOWL.hx, BOWL.hz, BOWL.r, 4, 14);
    samples.push(...this.nearRange);
    samples.sort((a, b) => a - b);
    this.path = { hx: BOWL.hx, hz: BOWL.hz, r: BOWL.r, samples: samples.filter((s, i) => i === 0 || s - samples[i - 1] > 1e-4) };
    this.nearMeshes = [];
    this.animated = [];
    this.emissives = [];
    this.build();
  }

  /** 弧長で表したスタンドの区間。north=奥(-z), south=手前(+z), east=+x, west=-x（角は半分ずつ） */
  sideRange(side) {
    const { hx, hz, r } = BOWL;
    const arc = (Math.PI / 2) * r;
    const e1 = hz - r;
    const north0 = e1 + arc / 2;
    const north1 = e1 + arc + 2 * (hx - r) + arc / 2;
    const west1 = north1 + arc / 2 + 2 * (hz - r) + arc / 2;
    const south1 = west1 + arc / 2 + 2 * (hx - r) + arc / 2;
    switch (side) {
      case 'north':
        return [north0, north1];
      case 'west':
        return [north1, west1];
      case 'south':
        return [west1, south1];
      default:
        return [south1, north0 + this.perimeter];
    }
  }

  std(params, opts = {}) {
    const m = new THREE.MeshStandardMaterial(params);
    return patchMaterial(m, opts);
  }

  addRibbon(profile, material, opts = {}) {
    if (opts.split) {
      // 手前側(south)とそれ以外に分割して作る
      const [a, b] = this.nearRange;
      const parts = [
        [0, a, false],
        [a, b, true],
        [b, this.perimeter, false],
      ];
      return parts.map(([s0, s1, near]) => {
        const mesh = this.addRibbon(profile, material, { ...opts, split: false, sRange: [s0, s1] });
        if (near) this.nearMeshes.push(mesh);
        return mesh;
      });
    }
    const geo = sweepRibbon(this.path, profile, opts);
    const mesh = new THREE.Mesh(geo, material);
    mesh.receiveShadow = false;
    mesh.castShadow = false;
    this.group.add(mesh);
    return mesh;
  }

  /** 中継カメラ視点では手前の屋根を隠す */
  setBroadcastView(on) {
    for (const m of this.nearMeshes) m.visible = !on;
  }

  build() {
    const concrete = this.std({ color: 0x9aa0a8, roughness: 0.9 });
    const darkConcrete = this.std({ color: 0x4a4f57, roughness: 0.95 });
    const seatTex = makeSeatTexture('#1d4fa8', '#163a7a');
    const rowLenLower = Math.hypot(TIERS.lower.o1 - TIERS.lower.o0, TIERS.lower.h1 - TIERS.lower.h0) / TIERS.lower.rows;
    const rowLenUpper = Math.hypot(TIERS.upper.o1 - TIERS.upper.o0, TIERS.upper.h1 - TIERS.upper.h0) / TIERS.upper.rows;
    const seatsLower = this.std({ map: seatTex, roughness: 0.8 });
    const seatsUpper = this.std({ map: seatTex, roughness: 0.8 });
    this.seatMaterials = [seatsLower, seatsUpper];

    // ピッチ際の壁
    const padTex = makeAdTexture([8, 2, 4, 0, 6, 1, 3, 5, 7], 256, 32);
    this.addRibbon(
      [
        [0, 0],
        [0, 1.4],
      ],
      this.std({ map: padTex, emissiveMap: padTex, emissive: 0xffffff, emissiveIntensity: 0.25, roughness: 0.7 }),
      { uScale: -70, vScale: 1.4 },
    );
    // 最前列の通路
    this.addRibbon(
      [
        [0, 1.4],
        [0.6, 1.4],
      ],
      darkConcrete,
    );
    // 下層スタンド
    this.addRibbon(
      [
        [TIERS.lower.o0, TIERS.lower.h0],
        [TIERS.lower.o1, TIERS.lower.h1],
      ],
      seatsLower,
      { uScale: 0.55, vScale: rowLenLower },
    );
    // 下層スタンド上端のLEDリボン
    this.ribbonTexLower = makeRibbonTexture('WORLD STRIKERS  ワールドカップ 2026', ['#06122e', '#0d2a6b', '#ffd84a']);
    const ribbonLower = this.std({
      map: this.ribbonTexLower,
      emissiveMap: this.ribbonTexLower,
      emissive: 0xffffff,
      emissiveIntensity: 1.2,
      roughness: 0.5,
    });
    this.emissives.push({ mat: ribbonLower, base: 1.0 });
    this.addRibbon(
      [
        [TIERS.lower.o1, TIERS.lower.h1],
        [TIERS.lower.o1, TIERS.lower.h1 + 1.2],
      ],
      ribbonLower,
      { uScale: -80, vScale: 1.2 },
    );
    // VIPボックスのガラス
    const glassTex = makeGlassTexture();
    const glass = this.std({
      map: glassTex,
      emissiveMap: glassTex,
      emissive: 0xffffff,
      emissiveIntensity: 0.35,
      roughness: 0.15,
      metalness: 0.4,
    });
    this.emissives.push({ mat: glass, base: 0.35, night: 0.9 });
    this.addRibbon(
      [
        [TIERS.lower.o1, TIERS.lower.h1 + 1.2],
        [TIERS.lower.o1 + 0.6, 16.8],
      ],
      glass,
      { uScale: -6, vScale: 3.2 },
    );
    // 上層の床裏
    this.addRibbon(
      [
        [TIERS.lower.o1 + 0.6, 16.8],
        [TIERS.upper.o0 - 0.5, 17.2],
      ],
      this.std({ map: makeUndersideTexture(), roughness: 0.9 }, { roofShadow: true }),
      { uScale: 8, vScale: 8 },
    );
    // 上層前面（チームカラーのLED帯）
    this.ribbonTexUpper = makeRibbonTexture('NIPPON  •  VALDORIA  •  SOLESTA  •  NORDENGARD', ['#1a0a2e', '#3a0d5c', '#ffffff']);
    const ribbonUpper = this.std({
      map: this.ribbonTexUpper,
      emissiveMap: this.ribbonTexUpper,
      emissive: 0xffffff,
      emissiveIntensity: 1.0,
      roughness: 0.5,
    });
    this.emissives.push({ mat: ribbonUpper, base: 0.9 });
    this.addRibbon(
      [
        [TIERS.upper.o0 - 0.5, 17.2],
        [TIERS.upper.o0 - 0.5, TIERS.upper.h0],
      ],
      ribbonUpper,
      { uScale: -90, vScale: 1.4 },
    );
    this.addRibbon(
      [
        [TIERS.upper.o0 - 0.5, TIERS.upper.h0],
        [TIERS.upper.o0, TIERS.upper.h0],
      ],
      darkConcrete,
    );
    // 上層スタンド
    this.addRibbon(
      [
        [TIERS.upper.o0, TIERS.upper.h0],
        [TIERS.upper.o1, TIERS.upper.h1],
      ],
      seatsUpper,
      { uScale: 0.55, vScale: rowLenUpper },
    );
    // 最上部の背面壁
    this.addRibbon(
      [
        [TIERS.upper.o1, TIERS.upper.h1],
        [TIERS.upper.o1, 41.3],
      ],
      concrete,
    );

    // 屋根
    const ri = ROOF_INSET;
    const roofUnder = this.std({ map: makeUndersideTexture(), roughness: 0.85, metalness: 0.2 });
    const under = this.addRibbon(
      [
        [46, 41.6],
        [ri, 39.0],
      ],
      roofUnder,
      { uScale: 6, vScale: 6, split: true },
    );
    const lampTex = makeLampTexture();
    this.lampMat = new THREE.MeshStandardMaterial({
      map: lampTex,
      emissiveMap: lampTex,
      emissive: 0xffffff,
      emissiveIntensity: 2,
      roughness: 0.4,
    });
    const lamps = this.addRibbon(
      [
        [ri, 38.4],
        [ri, 40.2],
      ],
      this.lampMat,
      { uScale: 4, vScale: 1.8, split: true },
    );
    // 照明が並ぶ屋根先端の下向き面
    const lampsDown = this.addRibbon(
      [
        [ri + 1.6, 38.4],
        [ri, 38.4],
      ],
      this.lampMat,
      { uScale: 4, vScale: 1.6, split: true },
    );
    const roofTop = this.std({ map: makeRoofTexture(), roughness: 0.55, metalness: 0.1 });
    const top = this.addRibbon(
      [
        [ri, 40.2],
        [46, 42.8],
      ],
      roofTop,
      { uScale: 10, vScale: 12, split: true },
    );
    const facadeTex = makeFacadeTexture();
    this.addRibbon(
      [
        [46, 42.8],
        [46, 41.6],
      ],
      concrete,
    );
    this.facadeMat = this.std({ map: facadeTex.map, emissiveMap: facadeTex.emissive, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.7 });
    this.addRibbon(
      [
        [46, 41.6],
        [44, 0],
      ],
      this.facadeMat,
      { uScale: 8, vScale: 20 },
    );
    this.roofMeshes = [under, lamps, lampsDown, top].flat();

    this.buildTrusses();
    this.buildAdBoards();
    this.buildCornerFlags();
    this.buildSurroundings();
  }

  buildTrusses() {
    // 屋根下の放射状トラス（インスタンス描画）
    const P = this.perimeter;
    const count = Math.floor(P / 11);
    const geo = new THREE.BoxGeometry(0.5, 1.6, 36);
    geo.translate(0, -0.8, 18);
    const mat = this.std({ color: 0x8c939e, roughness: 0.6, metalness: 0.5 });
    const inst = new THREE.InstancedMesh(geo, mat, count);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pt = {};
    const nearInst = new THREE.InstancedMesh(geo, mat, count);
    let nFar = 0;
    let nNear = 0;
    for (let i = 0; i < count; i++) {
      const s = (i / count) * P;
      const near = s > this.nearRange[0] && s < this.nearRange[1];
      rrPoint(BOWL.hx, BOWL.hz, BOWL.r, s, pt);
      const ang = Math.atan2(pt.nx, pt.nz);
      q.setFromEuler(new THREE.Euler(-Math.atan2(2.6, 36), ang, 0, 'YXZ'));
      m.compose(new THREE.Vector3(pt.x + pt.nx * ROOF_INSET, 39.0, pt.z + pt.nz * ROOF_INSET), q, new THREE.Vector3(1, 1, 1));
      if (near) nearInst.setMatrixAt(nNear++, m);
      else inst.setMatrixAt(nFar++, m);
    }
    inst.count = nFar;
    nearInst.count = nNear;
    inst.computeBoundingSphere();
    nearInst.computeBoundingSphere();
    this.group.add(inst, nearInst);
    this.nearMeshes.push(nearInst);
  }

  buildAdBoards() {
    // 電光広告看板（タッチライン沿い・ゴール裏）
    const boardH = 0.95;
    const mk = (order) => {
      const t = makeAdTexture(order);
      const mat = new THREE.MeshStandardMaterial({
        map: t,
        emissiveMap: t,
        emissive: 0xffffff,
        emissiveIntensity: 1.1,
        roughness: 0.45,
      });
      this.emissives.push({ mat, base: 1.0 });
      this.animated.push({ tex: t, speed: 0.012 });
      return mat;
    };
    const back = patchMaterial(new THREE.MeshStandardMaterial({ color: 0x59606b, roughness: 0.6, metalness: 0.3 }));
    const boards = [];
    const addBoard = (len, x, z, rotY, order) => {
      const geo = new THREE.BoxGeometry(len, boardH, 0.18);
      // 正面(+z面)以外は黒
      const front = mk(order);
      const mats = [back, back, back, back, front, back];
      const mesh = new THREE.Mesh(geo, mats);
      mesh.position.set(x, boardH / 2, z);
      mesh.rotation.y = rotY;
      // 面のUVを長さに合わせる（テクスチャ1枚 = 9パネル ≒ 54m）
      const uv = geo.attributes.uv;
      for (let i = 16; i < 20; i++) uv.setX(i, uv.getX(i) * (len / 54));
      mesh.castShadow = true;
      this.group.add(mesh);
      boards.push(mesh);
      return mesh;
    };
    const tz = PITCH.HW + 4.6;
    addBoard(54, -28, -tz, 0, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
    addBoard(54, 28, -tz, 0, [4, 5, 6, 7, 8, 0, 1, 2, 3]);
    const gx = PITCH.HL + 5.2;
    addBoard(26, gx, -16, -Math.PI / 2, [8, 0, 3, 5, 1, 2, 4, 6, 7]);
    addBoard(26, gx, 16, -Math.PI / 2, [1, 8, 2, 7, 3, 6, 4, 5, 0]);
    addBoard(26, -gx, -16, Math.PI / 2, [3, 5, 8, 0, 2, 4, 6, 1, 7]);
    addBoard(26, -gx, 16, Math.PI / 2, [7, 6, 5, 4, 8, 3, 2, 1, 0]);
    this.boards = boards;
  }

  buildCornerFlags() {
    const poleGeo = new THREE.CylinderGeometry(0.025, 0.025, 1.6, 6);
    poleGeo.translate(0, 0.8, 0);
    const poleMat = this.std({ color: 0xf2f2f2, roughness: 0.4 });
    const flagGeo = new THREE.PlaneGeometry(0.5, 0.36, 6, 3);
    flagGeo.translate(0.25, 1.4, 0);
    const flagMat = this.std(
      { color: 0xffd400, roughness: 0.7, side: THREE.DoubleSide },
      {
        key: 'flag',
        extraVert: (sh) => {
          sh.vertexShader = sh.vertexShader.replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
             float fw = transformed.x / 0.5;
             transformed.z += sin(uTimeV * 6.0 + transformed.x * 9.0) * 0.06 * fw;
             transformed.y += sin(uTimeV * 4.0 + transformed.x * 7.0) * 0.02 * fw;`,
          ).replace('#include <common>', '#include <common>\nuniform float uTimeV;');
          sh.uniforms.uTimeV = shared.uTime;
        },
      },
    );
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.set(sx * PITCH.HL, 0, sz * PITCH.HW);
        pole.castShadow = true;
        const flag = new THREE.Mesh(flagGeo, flagMat);
        flag.castShadow = true;
        pole.add(flag);
        flag.rotation.y = sx > 0 ? Math.PI : 0;
        this.group.add(pole);
      }
    }
  }

  buildSurroundings() {
    // ピッチ外周の地面（スタンドとの間）
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(2000, 2000),
      this.std({ color: 0x2a3326, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    this.group.add(ground);
    // 遠景の街並み（タイトル画面などの俯瞰用）
    const count = 260;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    const winTex = (() => {
      const c = makeCanvas(64, 128);
      const g = c.getContext('2d');
      g.fillStyle = '#20252e';
      g.fillRect(0, 0, 64, 128);
      for (let y = 4; y < 128; y += 8) {
        for (let x = 4; x < 64; x += 8) {
          const lit = Math.random() < 0.45;
          g.fillStyle = lit ? `rgba(255,${200 + Math.random() * 40},${130 + Math.random() * 60},1)` : '#2c333e';
          g.fillRect(x, y, 4, 5);
        }
      }
      return canvasTexture(c, { repeat: true });
    })();
    const mat = this.std({ map: winTex, emissiveMap: winTex, emissive: 0xffffff, emissiveIntensity: 0.0, roughness: 0.8 }, { roofShadow: false });
    this.cityMat = mat;
    const inst = new THREE.InstancedMesh(geo, mat, count);
    const m = new THREE.Matrix4();
    let n = 0;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 420 + Math.random() * 600;
      const w = 18 + Math.random() * 30;
      const h = 12 + Math.pow(Math.random(), 2.5) * 110;
      m.makeScale(w, h, w);
      m.setPosition(Math.cos(a) * r * 1.2, 0, Math.sin(a) * r);
      inst.setMatrixAt(n++, m);
    }
    inst.count = n;
    inst.computeBoundingSphere();
    this.group.add(inst);
  }

  /** 時間帯に応じた発光の強さ */
  setLighting(preset) {
    const night = preset.flood;
    this.lampMat.emissiveIntensity = 0.3 + night * 9;
    for (const e of this.emissives) {
      e.mat.emissiveIntensity = e.base * (0.6 + night * 0.9) + (e.night ? e.night * night : 0);
    }
    this.cityMat.emissiveIntensity = night * 1.2;
    this.facadeMat.emissiveIntensity = night > 0.9 ? 2.5 : night * 1.5;
  }

  update(dt) {
    for (const a of this.animated) a.tex.offset.x = (a.tex.offset.x + dt * a.speed) % 1;
    this.ribbonTexLower.offset.x = (this.ribbonTexLower.offset.x - dt * 0.01) % 1;
    this.ribbonTexUpper.offset.x = (this.ribbonTexUpper.offset.x + dt * 0.008) % 1;
  }
}
