import * as THREE from 'three';
import { FIELD, PITCH } from '../config.js';
import { getNoiseTexture } from './textures.js';
import { patchMaterial } from './shading.js';

// ピッチ: ライン・芝目・摩耗・刈り込みパターンを全てシェーダで解析的に描画。
// ラインは距離関数 + fwidth によるアンチエイリアスで、どの解像度でもくっきり。

const PITCH_GLSL = /* glsl */ `
uniform sampler2D uNoise;
uniform vec3 uGrassA;
uniform vec3 uGrassB;
uniform vec3 uDirt;
uniform vec3 uLineColor;
uniform float uPattern;
uniform float uStripeW;
uniform float uWear;
uniform float uWet;

float sdBox(vec2 p, vec2 c, vec2 b) {
  vec2 q = abs(p - c) - b;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
}

// 白線までの距離 (m)。ピッチは x,z とも対称なので第一象限に折り返して評価
float lineDist(vec2 p) {
  vec2 q = abs(p);
  const float HL = ${PITCH.HL.toFixed(3)};
  const float HW = ${PITCH.HW.toFixed(3)};
  float d = abs(sdBox(q, vec2(0.0), vec2(HL, HW)));
  // ハーフウェーライン
  d = min(d, max(abs(p.x), q.y - HW));
  // センターサークルとスポット
  d = min(d, abs(length(p) - ${PITCH.circleR.toFixed(3)}));
  d = min(d, max(length(p) - 0.15, 0.0));
  // ペナルティエリア / ゴールエリア
  d = min(d, abs(sdBox(q, vec2(HL - ${(PITCH.boxDepth / 2).toFixed(3)}, 0.0), vec2(${(PITCH.boxDepth / 2).toFixed(3)}, ${PITCH.boxHalfW.toFixed(3)}))));
  d = min(d, abs(sdBox(q, vec2(HL - ${(PITCH.sixDepth / 2).toFixed(3)}, 0.0), vec2(${(PITCH.sixDepth / 2).toFixed(3)}, ${PITCH.sixHalfW.toFixed(3)}))));
  // ペナルティスポットとアーク
  vec2 spot = vec2(HL - ${PITCH.spot.toFixed(3)}, 0.0);
  d = min(d, max(length(q - spot) - 0.15, 0.0));
  float arc = abs(length(q - spot) - ${PITCH.circleR.toFixed(3)});
  arc = max(arc, q.x - (HL - ${PITCH.boxDepth.toFixed(3)}));
  d = min(d, arc);
  // コーナーアーク
  float corner = abs(length(q - vec2(HL, HW)) - 1.0);
  corner = max(corner, max(q.x - HL, q.y - HW));
  d = min(d, corner);
  return d;
}

vec4 pitchSurface(vec2 p, vec3 viewDirW) {
  vec4 n1 = texture2D(uNoise, p * 0.011);
  vec4 n2 = texture2D(uNoise, p * 0.07 + 0.37);
  vec4 n3 = texture2D(uNoise, p * 0.9);
  vec4 n4 = texture2D(uNoise, p * 4.3 + 0.11);

  // 刈り込みパターン
  float fx = p.x / uStripeW;
  float stripe = step(0.5, fract(fx * 0.5));
  if (uPattern > 0.5 && uPattern < 1.5) {
    // チェッカー
    float sz = step(0.5, fract(p.y / uStripeW * 0.5));
    stripe = abs(stripe - sz);
  } else if (uPattern > 1.5) {
    // 同心円 + ストライプ
    float rr = length(p);
    float ring = step(0.5, fract(rr / uStripeW * 0.5));
    stripe = rr < 30.0 ? ring : stripe;
  }
  // ストライプの境界をわずかにぼかす
  float edge = abs(fract(fx * 0.5) - 0.5);
  float fw = fwidth(fx) + 0.02;
  stripe = mix(stripe, 0.5, (1.0 - smoothstep(0.0, fw, edge)) * 0.5);
  // 芝目の向きで見る方向により明るさが変わる
  float lean = (stripe * 2.0 - 1.0);
  float sheen = lean * dot(normalize(viewDirW.xz + 1e-4), vec2(0.6, 0.8)) * 0.05;

  vec3 col = mix(uGrassA, uGrassB, stripe);
  col *= 0.86 + 0.24 * n1.r;
  col *= 0.92 + 0.14 * n2.g;
  col *= 0.88 + 0.22 * n3.b;
  col *= 0.94 + 0.10 * n4.b;
  col = mix(col, col * vec3(1.06, 1.1, 0.9), smoothstep(0.55, 0.85, n1.a) * 0.6);
  col *= 1.0 + sheen;

  // 摩耗（ゴール前・センター・ペナルティスポット周辺）
  vec2 q = abs(p);
  float wear = 0.0;
  wear += smoothstep(9.0, 0.0, length((q - vec2(${PITCH.HL.toFixed(2)} - 2.5, 0.0)) * vec2(1.4, 0.55)));
  wear += smoothstep(4.5, 0.0, length(q - vec2(${(PITCH.HL - PITCH.spot).toFixed(2)}, 0.0))) * 0.6;
  wear += smoothstep(7.0, 0.0, length(p * vec2(0.8, 1.0))) * 0.35;
  wear += smoothstep(3.0, 0.0, q.y - ${PITCH.HW.toFixed(2)} + 1.5) * smoothstep(0.0, 30.0, 52.0 - q.x) * 0.2;
  wear *= uWear * smoothstep(0.25, 0.75, n2.r * 0.6 + n3.g * 0.6);
  col = mix(col, uDirt * (0.8 + 0.4 * n3.b), clamp(wear, 0.0, 0.85));

  // 白線
  float d = lineDist(p);
  float w = 0.06;
  float aa = fwidth(d) * 0.75 + 1e-4;
  float line = 1.0 - smoothstep(w - aa, w + aa, d);
  line *= 0.85 + 0.15 * n4.r;
  // ピッチ外の芝はやや暗め
  float outside = smoothstep(0.0, 1.0, max(q.x - ${PITCH.HL.toFixed(2)}, q.y - ${PITCH.HW.toFixed(2)}));
  col *= 1.0 - outside * 0.06;
  col = mix(col, uLineColor * (0.92 + 0.08 * n2.g), line);
  return vec4(col, line);
}
`;

export function createPitch() {
  const geo = new THREE.PlaneGeometry(FIELD.halfX * 2, FIELD.halfZ * 2, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const uniforms = {
    uNoise: { value: getNoiseTexture() },
    uGrassA: { value: new THREE.Color('#3d6e2f') },
    uGrassB: { value: new THREE.Color('#4c8238') },
    uDirt: { value: new THREE.Color('#6b5a3a') },
    uLineColor: { value: new THREE.Color('#f4f6f0') },
    uPattern: { value: 0 },
    uStripeW: { value: PITCH.L / 20 },
    uWear: { value: 0.6 },
    uWet: { value: 0 },
  };
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0 });
  patchMaterial(mat, {
    key: 'pitch',
    uniforms,
    extraFrag: (sh) => {
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>\n${PITCH_GLSL}`)
        .replace(
          '#include <map_fragment>',
          `vec3 vdw = normalize(cameraPosition - vWorldPos);
           vec4 surf = pitchSurface(vWorldPos.xz, vdw);
           diffuseColor.rgb = surf.rgb;
           float lineMask = surf.a;`,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `float roughnessFactor = mix(roughness, 0.75, lineMask) - uWet * 0.45;`,
        );
    },
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'pitch';
  mesh.userData.uniforms = uniforms;
  return mesh;
}

export const PITCH_STYLES = [
  { pattern: 0, a: '#3b6c2e', b: '#4b8137', stripeW: PITCH.L / 20 },
  { pattern: 1, a: '#3a6e30', b: '#4a8239', stripeW: PITCH.L / 14 },
  { pattern: 2, a: '#386a2c', b: '#487f36', stripeW: 5.0 },
  { pattern: 0, a: '#40712f', b: '#52883a', stripeW: PITCH.L / 16 },
];

export function applyPitchStyle(mesh, style) {
  const u = mesh.userData.uniforms;
  u.uPattern.value = style.pattern;
  u.uGrassA.value.set(style.a);
  u.uGrassB.value.set(style.b);
  u.uStripeW.value = style.stripeW;
}
