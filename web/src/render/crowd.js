import * as THREE from 'three';
import { BOWL } from '../config.js';
import { rrPerimeter, rrPoint } from './geom.js';
import { TIERS } from './stadium.js';
import { STADIUM_SHADOW_GLSL, shared } from './shading.js';
import { makeCanvas, canvasTexture } from './textures.js';
import { makeRng } from '../util/math.js';

// 観客: 数万人をビルボードのインスタンス描画で。チームカラーのアトラスを試合ごとに生成し、
// 盛り上がり度合いに応じて立ち上がる・跳ねる・腕を上げる。夜はカメラのフラッシュも光る。

const COLS = 32;
const CELL_W = 64;
const CELL_H = 128;

const VERT = /* glsl */ `
attribute vec3 aPos;
attribute vec4 aInfo;
uniform float uTime;
uniform vec3 uExcite;
uniform vec3 uSunColor;
uniform vec3 uAmbient;
uniform float uFlood;
uniform float uFogDensity;
uniform float uFlashRate;
${STADIUM_SHADOW_GLSL}
varying vec2 vUv;
varying vec3 vLight;
varying float vFog;
varying float vFlash;
float hash1(float n) { return fract(sin(n) * 43758.5453123); }
void main() {
  float aff = aInfo.y;
  float ex = aff < 0.5 ? uExcite.x : (aff < 1.5 ? uExcite.y : uExcite.z);
  float ph = aInfo.z * 6.2831853;
  float t = uTime;
  float stand = smoothstep(0.25, 0.6, ex + 0.12 * sin(ph * 3.0 + t * 0.4));
  float jump = max(0.0, sin(t * 7.5 + ph)) * 0.28 * smoothstep(0.6, 1.0, ex);
  float sway = sin(t * 1.3 + ph) * 0.02 + sin(t * 5.0 + ph) * 0.03 * ex;
  vec3 toCam = cameraPosition - aPos;
  vec3 right = normalize(vec3(toCam.z, 0.0, -toCam.x));
  float sc = aInfo.w;
  vec3 wp = aPos + right * (position.x * 0.62 * sc + sway)
          + vec3(0.0, position.y * 1.24 * sc + stand * 0.28 + jump, 0.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);

  float armsUp = step(fract(aInfo.z * 13.7), ex * 1.15 - 0.35);
  vUv = vec2((aInfo.x + position.x + 0.5) / ${COLS.toFixed(1)}, (armsUp + position.y) * 0.5);

  vec2 inward = -normalize(aPos.xz);
  vec3 n = normalize(vec3(inward.x * 0.75, 0.66, inward.y * 0.75));
  float sunTerm = max(dot(n, uSunDir), 0.0) * stadiumShadow(aPos + vec3(0.0, 1.0, 0.0));
  // スタンド奥ほど屋根の陰で暗い
  float depth = clamp((length(aPos.xz) - 50.0) / 50.0, 0.0, 1.0);
  float ao = 1.0 - depth * 0.35;
  vLight = uSunColor * sunTerm * 0.35 + uAmbient * ao + vec3(uFlood * 0.55 * (1.0 - depth * 0.4));
  float dist = length(toCam);
  vFog = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
  // カメラのフラッシュ
  float slot = floor(t * 6.0);
  float h = hash1(aInfo.z * 1000.0 + slot * 1.37);
  vFlash = step(1.0 - uFlashRate, h) * smoothstep(0.35, 0.5, position.y) * (1.0 - smoothstep(0.85, 1.0, position.y));
}`;

const FRAG = /* glsl */ `
uniform sampler2D uAtlas;
uniform vec3 uFogColor;
varying vec2 vUv;
varying vec3 vLight;
varying float vFog;
varying float vFlash;
void main() {
  vec4 c = texture2D(uAtlas, vUv);
  if (c.a < 0.5) discard;
  vec3 col = c.rgb * vLight * 0.8;
  col += vec3(vFlash * 12.0);
  col = mix(col, uFogColor, vFog);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const SKIN = ['#f1c9a5', '#e0ac85', '#c68863', '#8d5a3b', '#5c3a26', '#f5d6bc', '#d9a07a'];
const HAIR = ['#1b1410', '#2e1f16', '#4a3020', '#7a5a35', '#c9a35e', '#101010', '#5b2a1a'];
const NEUTRAL = ['#d9d9db', '#2b2f38', '#4d5866', '#6b3030', '#2e4a3a', '#a89a7a', '#33365e', '#9a6a3c', '#4a3a58', '#1d1d1d', '#3a3a3a', '#5a5048'];

function drawPerson(g, x, y, opts, armsUp) {
  const { shirt, shirt2, skin, hair, hat, scarf } = opts;
  const cx = x + CELL_W / 2;
  // 胴体
  g.fillStyle = shirt;
  g.beginPath();
  g.moveTo(cx - 19, y + CELL_H);
  g.lineTo(cx - 18, y + 52);
  g.quadraticCurveTo(cx - 17, y + 41, cx - 6, y + 40);
  g.lineTo(cx + 6, y + 40);
  g.quadraticCurveTo(cx + 17, y + 41, cx + 18, y + 52);
  g.lineTo(cx + 19, y + CELL_H);
  g.closePath();
  g.fill();
  if (shirt2) {
    g.fillStyle = shirt2;
    g.fillRect(cx - 18, y + 58, 36, 8);
  }
  // 腕
  g.strokeStyle = shirt;
  g.lineCap = 'round';
  g.lineWidth = 9;
  g.beginPath();
  if (armsUp) {
    g.moveTo(cx - 14, y + 48);
    g.lineTo(cx - 23, y + 22);
    g.moveTo(cx + 14, y + 48);
    g.lineTo(cx + 23, y + 22);
  } else {
    g.moveTo(cx - 16, y + 50);
    g.lineTo(cx - 21, y + 84);
    g.moveTo(cx + 16, y + 50);
    g.lineTo(cx + 21, y + 84);
  }
  g.stroke();
  // 手
  g.fillStyle = skin;
  const hands = armsUp
    ? [
        [cx - 24, y + 16],
        [cx + 24, y + 16],
      ]
    : [
        [cx - 21, y + 88],
        [cx + 21, y + 88],
      ];
  for (const [hx, hy] of hands) {
    g.beginPath();
    g.arc(hx, hy, 4.5, 0, Math.PI * 2);
    g.fill();
  }
  // マフラーを掲げる
  if (armsUp && scarf) {
    const w = 52;
    for (let i = 0; i < 6; i++) {
      g.fillStyle = i % 2 ? scarf[0] : scarf[1];
      g.fillRect(cx - w / 2 + (i * w) / 6, y + 6, w / 6 + 0.5, 9);
    }
  }
  // 首と頭
  g.fillStyle = skin;
  g.fillRect(cx - 4, y + 34, 8, 8);
  g.beginPath();
  g.ellipse(cx, y + 27, 9, 10.5, 0, 0, Math.PI * 2);
  g.fill();
  if (hat) {
    g.fillStyle = hat;
    g.beginPath();
    g.ellipse(cx, y + 21, 10, 7, 0, Math.PI, 0);
    g.fill();
    g.fillRect(cx - 10, y + 20, 20, 3);
  } else if (hair) {
    g.fillStyle = hair;
    g.beginPath();
    g.ellipse(cx, y + 21, 9.5, 6.5, 0, Math.PI, 0);
    g.fill();
  }
  // 影でわずかに立体感
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.fillRect(cx - 19, y + 100, 38, 28);
}

export class Crowd {
  constructor(scene, density = 1) {
    this.scene = scene;
    this.canvas = makeCanvas(COLS * CELL_W, CELL_H * 2);
    this.atlas = canvasTexture(this.canvas, { aniso: 4 });
    this.uniforms = {
      uAtlas: { value: this.atlas },
      uTime: shared.uTime,
      uSunDir: shared.uSunDir,
      uRoof: shared.uRoof,
      uRoofShadow: shared.uRoofShadow,
      uInsideOnly: shared.uInsideOnly,
      uBowl: shared.uBowl,
      uExcite: { value: new THREE.Vector3(0.1, 0.1, 0.1) },
      uSunColor: { value: new THREE.Color(1, 1, 1) },
      uAmbient: { value: new THREE.Color(0.5, 0.5, 0.5) },
      uFlood: { value: 0 },
      uFogDensity: { value: 0.001 },
      uFogColor: { value: new THREE.Color() },
      uFlashRate: { value: 0.0004 },
    };
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: this.uniforms,
      alphaToCoverage: true,
    });
    this.meshes = [];
    this.excite = { neutral: 0.1, home: 0.1, away: 0.1 };
    this.target = { neutral: 0.1, home: 0.1, away: 0.1 };
    this.build(density);
    this.setTeams(['#1d3fa0', '#ffffff'], ['#c8102e', '#ffffff']);
  }

  build(density) {
    for (const m of this.meshes) {
      this.scene.remove(m);
      m.geometry.dispose();
    }
    this.meshes = [];
    const rng = makeRng(77);
    const quad = new THREE.PlaneGeometry(1, 1);
    quad.translate(0, 0.5, 0);
    const sections = { north: [], south: [], east: [], west: [] };
    const pt = {};
    for (const [tierName, tier] of Object.entries(TIERS)) {
      const tierDensity = tierName === 'upper' ? Math.min(1, density * 1.0) : 1;
      for (let r = 0; r < tier.rows; r++) {
        const f = (r + 0.5) / tier.rows;
        const o = tier.o0 + (tier.o1 - tier.o0) * f;
        const h = tier.h0 + (tier.h1 - tier.h0) * f - 0.05;
        const hx = BOWL.hx + o;
        const hz = BOWL.hz + o;
        const rr = BOWL.r + o;
        const P = rrPerimeter(hx, hz, rr);
        const count = Math.floor(P / 0.56);
        for (let k = 0; k < count; k++) {
          if (k % 30 === 0) continue; // 階段通路
          if (rng() > 0.93 * tierDensity) continue; // 空席
          const s = ((k + (rng() - 0.5) * 0.15) / count) * P;
          rrPoint(hx, hz, rr, s, pt);
          const x = pt.x - pt.nx * 0.18;
          const z = pt.z - pt.nz * 0.18;
          // ホーム側(-x)とアウェイ側(+x)でサポーターの比率を変える
          const homeBias = 0.5 - Math.tanh(x / 28) * 0.42;
          const u = rng();
          let aff;
          if (u < 0.28) aff = 0;
          else aff = rng() < homeBias ? 1 : 2;
          const col = aff === 0 ? 24 + Math.floor(rng() * 8) : aff === 1 ? Math.floor(rng() * 12) : 12 + Math.floor(rng() * 12);
          const side = Math.abs(pt.nz) > 0.707 ? (pt.nz < 0 ? 'north' : 'south') : pt.nx > 0 ? 'east' : 'west';
          sections[side].push(x, h, z, col, aff, rng(), 0.92 + rng() * 0.16);
        }
      }
    }
    for (const [name, arr] of Object.entries(sections)) {
      const n = arr.length / 7;
      if (!n) continue;
      const geo = new THREE.InstancedBufferGeometry();
      geo.index = quad.index;
      geo.attributes.position = quad.attributes.position;
      const pos = new Float32Array(n * 3);
      const info = new Float32Array(n * 4);
      const box = new THREE.Box3();
      const v = new THREE.Vector3();
      for (let i = 0; i < n; i++) {
        pos[i * 3] = arr[i * 7];
        pos[i * 3 + 1] = arr[i * 7 + 1];
        pos[i * 3 + 2] = arr[i * 7 + 2];
        info[i * 4] = arr[i * 7 + 3];
        info[i * 4 + 1] = arr[i * 7 + 4];
        info[i * 4 + 2] = arr[i * 7 + 5];
        info[i * 4 + 3] = arr[i * 7 + 6];
        box.expandByPoint(v.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]));
      }
      box.max.y += 2;
      geo.setAttribute('aPos', new THREE.InstancedBufferAttribute(pos, 3));
      geo.setAttribute('aInfo', new THREE.InstancedBufferAttribute(info, 4));
      geo.instanceCount = n;
      geo.boundingBox = box;
      geo.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
      const mesh = new THREE.Mesh(geo, this.material);
      mesh.name = `crowd-${name}`;
      this.scene.add(mesh);
      this.meshes.push(mesh);
    }
    this.count = this.meshes.reduce((a, m) => a + m.geometry.instanceCount, 0);
  }

  /** 両チームのカラーで観客アトラスを描き直す */
  setTeams(home, away) {
    const g = this.canvas.getContext('2d');
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const rng = makeRng(99);
    for (let c = 0; c < COLS; c++) {
      let opts;
      const skin = rng.pick(SKIN);
      const hair = rng() < 0.85 ? rng.pick(HAIR) : null;
      if (c < 24) {
        const kit = c < 12 ? home : away;
        const alt = rng() < 0.3;
        opts = {
          shirt: alt ? kit[1] : kit[0],
          shirt2: rng() < 0.35 ? (alt ? kit[0] : kit[1]) : null,
          skin,
          hair,
          hat: rng() < 0.15 ? kit[rng() < 0.5 ? 0 : 1] : null,
          scarf: rng() < 0.6 ? kit : null,
        };
      } else {
        opts = { shirt: rng.pick(NEUTRAL), shirt2: null, skin, hair, hat: rng() < 0.1 ? rng.pick(NEUTRAL) : null, scarf: null };
      }
      // 下段: 通常 / 上段: 腕を上げる
      drawPerson(g, c * CELL_W, CELL_H, opts, false);
      drawPerson(g, c * CELL_W, 0, opts, true);
    }
    this.atlas.needsUpdate = true;
  }

  setLighting(env) {
    const p = env.preset;
    const u = this.uniforms;
    u.uSunColor.value.set(p.sunColor).multiplyScalar(p.sunIntensity);
    u.uAmbient.value.set(p.hemiSky).multiplyScalar(p.hemiIntensity * 0.3);
    u.uFlood.value = p.flood * 0.6;
    u.uFogDensity.value = p.fogDensity;
    u.uFogColor.value.set(p.fog);
    u.uFlashRate.value = p.flood > 0.5 ? 0.0006 : 0.0;
  }

  /** 盛り上がり度合いの目標値（0..1） */
  setExcitement(neutral, home, away) {
    this.target.neutral = neutral;
    this.target.home = home;
    this.target.away = away;
  }

  update(dt) {
    const k = 1 - Math.exp(-dt * 2.5);
    for (const key of ['neutral', 'home', 'away']) this.excite[key] += (this.target[key] - this.excite[key]) * k;
    this.uniforms.uExcite.value.set(this.excite.neutral, this.excite.home, this.excite.away);
  }
}
