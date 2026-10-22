import * as THREE from 'three';
import { patchMaterial } from './shading.js';
import { makePose } from './anim.js';
import { makeCanvas, canvasTexture } from './textures.js';
import { HUMAN_SCALE } from '../config.js';

// 人物描画: 体のパーツごとに InstancedMesh を1つ使い、全員を少ないドローコールで描く。
// 骨格は前方 +z、左 +x、上 +y。各パーツのジオメトリは骨のローカル座標で作ってある。

/** 楕円断面を積み重ねたロフト形状。rings: {y, rx, rz, z?, slot?} 下から上へ */
function loft(rings, segs = 12, capBottom = true, capTop = true) {
  const pos = [];
  const slot = [];
  const idx = [];
  const n = segs + 1;
  rings.forEach((r) => {
    for (let k = 0; k <= segs; k++) {
      const a = (k / segs) * Math.PI * 2;
      pos.push(Math.cos(a) * r.rx + (r.x || 0), r.y, Math.sin(a) * r.rz + (r.z || 0));
      slot.push(r.slot || 0);
    }
  });
  for (let i = 0; i < rings.length - 1; i++) {
    for (let k = 0; k < segs; k++) {
      const a = i * n + k;
      const b = a + n;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const addCap = (ringIndex, dy, flip) => {
    const r = rings[ringIndex];
    const c = pos.length / 3;
    pos.push(r.x || 0, r.y + dy, r.z || 0);
    slot.push(r.slot || 0);
    for (let k = 0; k < segs; k++) {
      const a = ringIndex * n + k;
      if (flip) idx.push(c, a, a + 1);
      else idx.push(c, a + 1, a);
    }
  };
  if (capBottom) addCap(0, -Math.min(rings[0].rx, rings[0].rz) * 0.5, true);
  if (capTop) addCap(rings.length - 1, Math.min(rings[rings.length - 1].rx, rings[rings.length - 1].rz) * 0.5, false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('slot', new THREE.Float32BufferAttribute(slot, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function ellipsoidRings(cy, rx, ry, rz, steps, slot = 0, zOff = 0, from = -1, to = 1) {
  const rings = [];
  for (let i = 0; i <= steps; i++) {
    const t = from + ((to - from) * i) / steps;
    const s = Math.sqrt(Math.max(0, 1 - t * t));
    rings.push({ y: cy + t * ry, rx: Math.max(rx * s, 0.004), rz: Math.max(rz * s, 0.004), z: zOff, slot });
  }
  return rings;
}

function buildGeometries() {
  const G = {};
  // 胴体（ユニフォーム）
  G.torso = loft(
    [
      { y: -0.04, rx: 0.152, rz: 0.104 },
      { y: 0.1, rx: 0.158, rz: 0.108 },
      { y: 0.24, rx: 0.172, rz: 0.118, z: 0.004 },
      { y: 0.35, rx: 0.188, rz: 0.122, z: 0.006 },
      { y: 0.42, rx: 0.192, rz: 0.11 },
      { y: 0.465, rx: 0.15, rz: 0.088 },
      { y: 0.5, rx: 0.075, rz: 0.06 },
    ],
    14,
  );
  // パンツ
  G.shorts = loft(
    [
      { y: -0.17, rx: 0.155, rz: 0.11 },
      { y: -0.1, rx: 0.172, rz: 0.12 },
      { y: 0.0, rx: 0.17, rz: 0.116 },
      { y: 0.12, rx: 0.156, rz: 0.106 },
    ],
    14,
  );
  // 首 + 頭
  G.head = loft(
    [
      { y: -0.01, rx: 0.048, rz: 0.05 },
      { y: 0.06, rx: 0.05, rz: 0.052 },
      ...ellipsoidRings(0.155, 0.09, 0.115, 0.1, 9, 0, 0.012, -0.8, 1),
    ],
    12,
    false,
    true,
  );
  // 髪（頭頂部を覆うキャップ）
  G.hair = loft(ellipsoidRings(0.165, 0.098, 0.112, 0.108, 6, 0, -0.004, 0.15, 1), 12, true, true);
  // 上腕（袖 + 肌）
  G.upperArm = loft(
    [
      { y: -0.3, rx: 0.038, rz: 0.04, slot: 1 },
      { y: -0.15, rx: 0.046, rz: 0.048, slot: 1 },
      { y: -0.135, rx: 0.048, rz: 0.05, slot: 1 },
      { y: -0.135, rx: 0.056, rz: 0.058, slot: 0 },
      { y: -0.02, rx: 0.064, rz: 0.066, slot: 0 },
      { y: 0.04, rx: 0.05, rz: 0.055, slot: 0 },
    ],
    10,
  );
  // 前腕 + 手（slot1 = 手袋/手）
  G.foreArm = loft(
    [
      { y: -0.37, rx: 0.026, rz: 0.018, slot: 1 },
      { y: -0.31, rx: 0.038, rz: 0.024, slot: 1 },
      { y: -0.255, rx: 0.033, rz: 0.026, slot: 1 },
      { y: -0.255, rx: 0.03, rz: 0.03, slot: 0 },
      { y: -0.12, rx: 0.038, rz: 0.04, slot: 0 },
      { y: 0.01, rx: 0.042, rz: 0.044, slot: 0 },
    ],
    10,
  );
  // 太もも（パンツ + 肌）
  G.thigh = loft(
    [
      { y: -0.46, rx: 0.052, rz: 0.056, slot: 1 },
      { y: -0.3, rx: 0.068, rz: 0.074, slot: 1 },
      { y: -0.17, rx: 0.075, rz: 0.082, slot: 1 },
      { y: -0.17, rx: 0.084, rz: 0.09, slot: 0 },
      { y: 0.0, rx: 0.09, rz: 0.096, slot: 0 },
      { y: 0.06, rx: 0.08, rz: 0.086, slot: 0 },
    ],
    10,
  );
  // すね（肌 + ソックス）
  G.shin = loft(
    [
      { y: -0.44, rx: 0.036, rz: 0.04, slot: 1 },
      { y: -0.3, rx: 0.044, rz: 0.05, slot: 1 },
      { y: -0.15, rx: 0.056, rz: 0.064, z: -0.008, slot: 1 },
      { y: -0.06, rx: 0.054, rz: 0.058, slot: 1 },
      { y: -0.06, rx: 0.05, rz: 0.054, slot: 0 },
      { y: 0.03, rx: 0.052, rz: 0.056, slot: 0 },
    ],
    10,
  );
  // スパイク（足首から前方へ）
  const boot = loft(
    [
      { y: -0.06, rx: 0.036, rz: 0.04 },
      { y: 0.0, rx: 0.046, rz: 0.046 },
      { y: 0.08, rx: 0.048, rz: 0.04 },
      { y: 0.16, rx: 0.042, rz: 0.032 },
      { y: 0.2, rx: 0.026, rz: 0.022 },
    ],
    10,
  );
  // y軸方向に作ったものを前方(+z)へ向け、足首の下へ
  boot.rotateX(Math.PI / 2);
  boot.translate(0, -0.06, 0.0);
  G.foot = boot;
  return G;
}

/** 背番号用の数字アトラス（0-9 を横に並べる） */
function makeDigitTexture() {
  const c = makeCanvas(640, 96);
  const g = c.getContext('2d');
  g.clearRect(0, 0, 640, 96);
  g.fillStyle = '#ffffff';
  g.font = '800 84px "BarlowC", "Arial Narrow", Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let i = 0; i < 10; i++) g.fillText(String(i), i * 64 + 32, 50);
  const t = canvasTexture(c, { srgb: false, aniso: 4 });
  return t;
}

// パーツ定義: 骨インデックスと1人あたりの個数
const B = {
  root: 0,
  pelvis: 1,
  spine: 2,
  neck: 3,
  lSh: 4,
  lEl: 5,
  rSh: 6,
  rEl: 7,
  lHip: 8,
  lKnee: 9,
  lAnkle: 10,
  rHip: 11,
  rKnee: 12,
  rAnkle: 13,
};
const PARTS = [
  { name: 'torso', bones: [B.spine] },
  { name: 'shorts', bones: [B.pelvis] },
  { name: 'head', bones: [B.neck] },
  { name: 'hair', bones: [B.neck] },
  { name: 'upperArm', bones: [B.lSh, B.rSh] },
  { name: 'foreArm', bones: [B.lEl, B.rEl] },
  { name: 'thigh', bones: [B.lHip, B.rHip] },
  { name: 'shin', bones: [B.lKnee, B.rKnee] },
  { name: 'foot', bones: [B.lAnkle, B.rAnkle] },
];

const _m = new THREE.Matrix4();
const _r = new THREE.Matrix4();
const _t = new THREE.Matrix4();
const _e = new THREE.Euler();

function rotXYZ(out, x, y, z, order = 'XYZ') {
  _e.set(x, y, z, order);
  return out.makeRotationFromEuler(_e);
}

/** 1人分の見た目 */
export function defaultLook() {
  return {
    shirt: new THREE.Color('#1d4fb0'),
    shirt2: new THREE.Color('#ffffff'),
    sleeve: new THREE.Color('#1d4fb0'),
    shorts: new THREE.Color('#ffffff'),
    socks: new THREE.Color('#1d4fb0'),
    boots: new THREE.Color('#111111'),
    skin: new THREE.Color('#e0b48e'),
    hair: new THREE.Color('#151010'),
    gloves: null,
    pattern: 0,
    hairStyle: 1, // 0=坊主(なし) 1=短髪 2=ボリューム
    height: 1.0,
    build: 1.0,
  };
}

export class Humans {
  constructor(scene, max = 40) {
    this.max = max;
    this.geos = buildGeometries();
    this.meshes = {};
    this.count = 0;
    this.looks = [];
    this.poses = [];
    this.transforms = [];
    this.bones = [];
    for (let i = 0; i < max; i++) {
      this.poses.push(makePose());
      this.transforms.push({ x: 0, z: 0, y: 0, yaw: 0, visible: true });
      this.bones.push(Array.from({ length: 14 }, () => new THREE.Matrix4()));
      this.looks.push(defaultLook());
    }
    const baseMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.62, metalness: 0 });
    this.digits = makeDigitTexture();
    // フォントの読み込み後に背番号を描き直す
    document.fonts?.ready.then(() => {
      const fresh = makeDigitTexture();
      this.digits.image = fresh.image;
      this.digits.needsUpdate = true;
    });
    const colorInject = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nattribute vec3 iColA;\nattribute vec3 iColB;\nattribute float slot;\nattribute float iPattern;\nattribute float iNumber;\nvarying vec3 vColA;\nvarying vec3 vColB;\nvarying float vSlot;\nvarying float vPattern;\nvarying float vNumber;\nvarying vec3 vLocal;',
        )
        .replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvColA = iColA; vColB = iColB; vSlot = slot; vPattern = iPattern; vNumber = iNumber; vLocal = position;',
        );
      sh.fragmentShader = sh.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nvarying vec3 vColA;\nvarying vec3 vColB;\nvarying float vSlot;\nvarying float vPattern;\nvarying float vNumber;\nvarying vec3 vLocal;\nuniform sampler2D uDigits;',
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          {
            float m = vSlot;
            // ユニフォームの柄（胴体のみ vPattern >= 1）
            if (vPattern > 0.5) {
              float p = floor(vPattern + 0.5);
              vec3 L = vLocal;
              if (p == 1.0) m = max(step(0.445, L.y), step(0.172, abs(L.x)) * step(0.05, L.y) * step(L.y, 0.42));
              else if (p == 2.0) m = max(step(0.5, fract(L.x / 0.075 + 0.25)), step(0.455, L.y));
              else if (p == 3.0) m = max(step(0.5, fract((L.y + 0.02) / 0.11)), step(0.455, L.y));
              else if (p == 4.0) m = max(step(abs(L.x * 0.85 + (L.y - 0.24)), 0.055), step(0.455, L.y));
              else if (p == 5.0) m = step(0.0, L.x);
              else if (p == 6.0) m = max(step(abs(L.y - 0.30), 0.045) * step(0.0, L.z), step(0.455, L.y));
            }
            vec3 base = mix(vColA, vColB, m);
            if (vPattern > 0.5 && vPattern < 9.5 && vNumber > 0.5) {
              // 背番号
              vec3 L = vLocal;
              float back = smoothstep(-0.05, -0.08, L.z);
              float n = floor(vNumber + 0.5);
              float tens = floor(n / 10.0);
              float ones = n - tens * 10.0;
              float two = step(9.5, n);
              float w = two > 0.5 ? 0.15 : 0.08;
              // 背中側から見て左→右 = x の正→負
              vec2 uv = vec2((w * 0.5 - L.x) / w, (L.y - 0.13) / 0.22);
              if (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0 && back > 0.0) {
                float digit = two > 0.5 ? (uv.x < 0.5 ? tens : ones) : ones;
                float lx = two > 0.5 ? fract(uv.x * 2.0) : uv.x;
                float a = texture2D(uDigits, vec2((digit + lx) / 10.0, uv.y)).a;
                vec3 numCol = dot(vColA, vec3(0.3, 0.6, 0.1)) > 0.45 ? vec3(0.06, 0.08, 0.14) : vec3(0.96);
                if (m > 0.5) numCol = dot(vColB, vec3(0.3, 0.6, 0.1)) > 0.45 ? vec3(0.06, 0.08, 0.14) : vec3(0.96);
                base = mix(base, numCol, a * back);
              }
            }
            if (vPattern > 19.5) {
              // 顔: 目・眉・口
              vec3 L = vLocal;
              float front = smoothstep(0.05, 0.085, L.z);
              float eye = 1.0 - smoothstep(0.009, 0.014, length(vec2(abs(L.x) - 0.033, (L.y - 0.163) * 1.4)));
              float brow = (1.0 - smoothstep(0.004, 0.008, abs(L.y - 0.188 + abs(L.x) * 0.12))) * step(0.012, abs(L.x)) * step(abs(L.x), 0.056);
              float mouth = (1.0 - smoothstep(0.003, 0.006, abs(L.y - 0.112 + L.x * L.x * 6.0))) * step(abs(L.x), 0.022);
              float nose = (1.0 - smoothstep(0.0, 0.014, length(vec2(L.x, (L.y - 0.135) * 0.8)))) * 0.25;
              base *= 1.0 - front * (eye * 0.88 + brow * 0.65 + mouth * 0.45 + nose);
            }
            diffuseColor.rgb *= base;
          }`,
        );
    };
    for (const part of PARTS) {
      const geo = this.geos[part.name].clone();
      const per = part.bones.length;
      const n = max * per;
      geo.setAttribute('iColA', new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3));
      geo.setAttribute('iColB', new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3));
      geo.setAttribute('iPattern', new THREE.InstancedBufferAttribute(new Float32Array(n), 1));
      geo.setAttribute('iNumber', new THREE.InstancedBufferAttribute(new Float32Array(n), 1));
      if (!geo.attributes.slot) geo.setAttribute('slot', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count), 1));
      const mat = baseMat.clone();
      if (part.name === 'head' || part.name === 'foreArm') mat.roughness = 0.5;
      if (part.name === 'hair') mat.roughness = 0.75;
      if (part.name === 'foot') {
        mat.roughness = 0.35;
        mat.metalness = 0.1;
      }
      patchMaterial(mat, { rim: 0.9, key: `human-${part.name}`, extraVert: colorInject, uniforms: { uDigits: { value: this.digits } } });
      const mesh = new THREE.InstancedMesh(geo, mat, n);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.count = 0;
      mesh.name = `human-${part.name}`;
      scene.add(mesh);
      this.meshes[part.name] = { mesh, part, per };
    }
    this.handPos = Array.from({ length: max }, () => [new THREE.Vector3(), new THREE.Vector3()]);
    this.headPos = Array.from({ length: max }, () => new THREE.Vector3());
    this.footPos = Array.from({ length: max }, () => [new THREE.Vector3(), new THREE.Vector3()]);
    this.buildBlobShadows(scene);
  }

  buildBlobShadows(scene) {
    const c = makeCanvas(64, 64);
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    grad.addColorStop(0, 'rgba(0,0,0,0.75)');
    grad.addColorStop(0.5, 'rgba(0,0,0,0.35)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    const tex = canvasTexture(c, { srgb: false });
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    this.blobMat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      opacity: 0.6,
      color: 0x000000,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.blobs = new THREE.InstancedMesh(geo, this.blobMat, this.max * 5);
    this.blobs.frustumCulled = false;
    this.blobs.renderOrder = 1;
    this.blobs.count = 0;
    scene.add(this.blobs);
    this.blobMode = 1; // 1 = 足元のみ, 4 = ナイター（四方向の影）
  }

  setBlobMode(night, strength) {
    this.blobMode = night ? 5 : 1;
    this.blobMat.opacity = strength;
  }

  setCount(n) {
    this.count = Math.min(n, this.max);
    for (const { mesh, per } of Object.values(this.meshes)) mesh.count = this.count * per;
  }

  /** 見た目（色・体格など）を反映 */
  applyLook(i, look) {
    this.looks[i] = look;
    const set = (name, k, a, b, pattern = 0) => {
      const { mesh } = this.meshes[name];
      const ca = mesh.geometry.attributes.iColA;
      const cb = mesh.geometry.attributes.iColB;
      const pa = mesh.geometry.attributes.iPattern;
      ca.setXYZ(k, a.r, a.g, a.b);
      cb.setXYZ(k, b.r, b.g, b.b);
      pa.setX(k, pattern);
      ca.needsUpdate = true;
      cb.needsUpdate = true;
      pa.needsUpdate = true;
    };
    const hands = look.gloves || look.skin;
    set('torso', i, look.shirt, look.shirt2, look.pattern + 1);
    const num = this.meshes.torso.mesh.geometry.attributes.iNumber;
    num.setX(i, look.number || 0);
    num.needsUpdate = true;
    set('shorts', i, look.shorts, look.shorts);
    set('head', i, look.skin, look.skin, 20);
    set('hair', i, look.hair, look.hair);
    for (let s = 0; s < 2; s++) {
      set('upperArm', i * 2 + s, look.sleeve, look.longSleeve ? look.sleeve : look.skin);
      set('foreArm', i * 2 + s, look.longSleeve ? look.sleeve : look.skin, hands);
      set('thigh', i * 2 + s, look.shorts, look.trousers || look.skin);
      set('shin', i * 2 + s, look.socks, look.socks2 || look.socks);
      set('foot', i * 2 + s, look.boots, look.boots);
    }
  }

  /** 姿勢と位置から骨の行列を計算 */
  solve(i) {
    const p = this.poses[i];
    const tr = this.transforms[i];
    const look = this.looks[i];
    const s = look.height * HUMAN_SCALE;
    const bones = this.bones[i];
    const cy = Math.cos(tr.yaw);
    const sy = Math.sin(tr.yaw);
    // 体の前後/左右オフセット（ローカル）をワールドへ
    const ox = p.bodyFwd * sy + p.bodySide * cy;
    const oz = p.bodyFwd * cy - p.bodySide * sy;
    const root = bones[B.root];
    root.makeTranslation(tr.x + ox, (tr.y || 0) + (1.0 + p.rootY) * s, tr.z + oz);
    root.multiply(_r.makeRotationY(tr.yaw + p.bodyYaw));
    root.multiply(rotXYZ(_r, p.bodyPitch, 0, -p.bodyRoll, 'ZXY'));
    root.multiply(_t.makeScale(s, s, s));
    const w = look.build || 1;
    const pel = bones[B.pelvis].copy(root).multiply(rotXYZ(_r, p.pelvisPitch, p.pelvisYaw, -p.pelvisRoll, 'YXZ'));
    pel.multiply(_t.makeScale(w, 1, w));
    const spine = bones[B.spine].copy(pel).multiply(_t.makeTranslation(0, 0.08, 0)).multiply(rotXYZ(_r, p.spinePitch, p.spineYaw, -p.spineRoll, 'YXZ'));
    bones[B.neck].copy(spine).multiply(_t.makeTranslation(0, 0.49, 0.0)).multiply(rotXYZ(_r, p.neckPitch, p.neckYaw, 0, 'YXZ'));
    // 腕
    const lSh = bones[B.lSh].copy(spine).multiply(_t.makeTranslation(0.205, 0.415, 0));
    lSh.multiply(_r.makeRotationZ(p.lShAbd)).multiply(_r.makeRotationX(-p.lShSwing)).multiply(_r.makeRotationY(p.lShTwist));
    bones[B.lEl].copy(lSh).multiply(_t.makeTranslation(0, -0.29, 0)).multiply(_r.makeRotationX(-p.lElbow));
    const rSh = bones[B.rSh].copy(spine).multiply(_t.makeTranslation(-0.205, 0.415, 0));
    rSh.multiply(_r.makeRotationZ(-p.rShAbd)).multiply(_r.makeRotationX(-p.rShSwing)).multiply(_r.makeRotationY(-p.rShTwist));
    bones[B.rEl].copy(rSh).multiply(_t.makeTranslation(0, -0.29, 0)).multiply(_r.makeRotationX(-p.rElbow));
    // 脚
    const lHip = bones[B.lHip].copy(pel).multiply(_t.makeTranslation(0.092, -0.07, 0));
    lHip.multiply(_r.makeRotationZ(p.lHipAbd)).multiply(_r.makeRotationX(-p.lHipSwing));
    const lKnee = bones[B.lKnee].copy(lHip).multiply(_t.makeTranslation(0, -0.45, 0)).multiply(_r.makeRotationX(p.lKnee));
    bones[B.lAnkle].copy(lKnee).multiply(_t.makeTranslation(0, -0.43, 0)).multiply(_r.makeRotationX(-p.lAnkle + p.lKnee * 0.0));
    const rHip = bones[B.rHip].copy(pel).multiply(_t.makeTranslation(-0.092, -0.07, 0));
    rHip.multiply(_r.makeRotationZ(-p.rHipAbd)).multiply(_r.makeRotationX(-p.rHipSwing));
    const rKnee = bones[B.rKnee].copy(rHip).multiply(_t.makeTranslation(0, -0.45, 0)).multiply(_r.makeRotationX(p.rKnee));
    bones[B.rAnkle].copy(rKnee).multiply(_t.makeTranslation(0, -0.43, 0)).multiply(_r.makeRotationX(-p.rAnkle));

    // 接地補正: 低い方の足の裏を地面に合わせる
    if (p.groundLock > 0) {
      const ly = bones[B.lAnkle].elements[13];
      const ry = bones[B.rAnkle].elements[13];
      const minY = Math.min(ly, ry) - 0.075 * s - (tr.y || 0);
      const off = -minY * p.groundLock;
      if (Math.abs(off) > 1e-5) for (const b of bones) b.elements[13] += off;
    } else {
      // 地面にめり込まないように
      let minY = Infinity;
      for (const b of [B.lAnkle, B.rAnkle, B.lKnee, B.rKnee, B.pelvis, B.neck]) minY = Math.min(minY, bones[b].elements[13]);
      const lim = 0.07 * s;
      if (minY < lim) for (const b of bones) b.elements[13] += lim - minY;
    }
    // 手と頭の位置（ボール保持やヘディングの基準）
    const hp = this.handPos[i];
    hp[0].set(0, -0.32, 0).applyMatrix4(bones[B.lEl]);
    hp[1].set(0, -0.32, 0).applyMatrix4(bones[B.rEl]);
    this.headPos[i].set(0, 0.16, 0.02).applyMatrix4(bones[B.neck]);
    const fp = this.footPos[i];
    fp[0].set(0, -0.06, 0.08).applyMatrix4(bones[B.lAnkle]);
    fp[1].set(0, -0.06, 0.08).applyMatrix4(bones[B.rAnkle]);
  }

  /** 全員の骨を解いてインスタンス行列を更新 */
  update() {
    const n = this.count;
    for (let i = 0; i < n; i++) {
      if (this.transforms[i].visible) this.solve(i);
    }
    for (const { mesh, part, per } of Object.values(this.meshes)) {
      const arr = mesh.instanceMatrix.array;
      for (let i = 0; i < n; i++) {
        const tr = this.transforms[i];
        for (let k = 0; k < per; k++) {
          const idx = (i * per + k) * 16;
          if (!tr.visible || (part.name === 'hair' && this.looks[i].hairStyle === 0)) {
            // 非表示: 縮退行列
            for (let e = 0; e < 16; e++) arr[idx + e] = 0;
            continue;
          }
          let m = this.bones[i][part.bones[k]];
          if (part.name === 'hair' && this.looks[i].hairStyle === 2) {
            _m.copy(m).multiply(_t.makeTranslation(0, 0.02, -0.01)).multiply(_r.makeScale(1.18, 1.12, 1.16));
            m = _m;
          }
          m.toArray(arr, idx);
        }
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
    this.updateBlobs();
  }

  updateBlobs() {
    const n = this.count;
    let k = 0;
    const arr = this.blobs.instanceMatrix.array;
    const put = (x, z, sx, sz, rot) => {
      _m.makeRotationY(rot);
      _m.scale(new THREE.Vector3(sx, 1, sz));
      _m.setPosition(x, 0.015, z);
      _m.toArray(arr, k * 16);
      k++;
    };
    for (let i = 0; i < n; i++) {
      const tr = this.transforms[i];
      if (!tr.visible) continue;
      const pel = this.bones[i][B.pelvis].elements;
      const x = pel[12];
      const z = pel[14];
      const h = Math.max(0, pel[13] - 0.9);
      const sc = 1 / (1 + h * 0.8);
      put(x, z, 0.95 * sc, 0.95 * sc, 0);
      if (this.blobMode > 1) {
        // ナイターの四方向の淡い影
        for (let d = 0; d < 4; d++) {
          const a = Math.PI / 4 + (d * Math.PI) / 2;
          put(x + Math.cos(a) * 0.9, z + Math.sin(a) * 0.9, 0.55, 2.1, -a + Math.PI / 2);
        }
      }
    }
    this.blobs.count = k;
    this.blobs.instanceMatrix.needsUpdate = true;
  }
}
