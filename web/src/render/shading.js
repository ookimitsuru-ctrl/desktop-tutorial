import * as THREE from 'three';
import { BOWL, ROOF } from '../config.js';

// 全マテリアル共通のユニフォームと、標準マテリアルへのシェーダ注入。
// ・スタジアム屋根の影を解析的に計算（巨大なシャドウマップ不要で、くっきりした屋根影が出る）
// ・小さな選手を背景から浮かせるリムライト

export const shared = {
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uRoof: { value: new THREE.Vector4(ROOF.halfX, ROOF.halfZ, ROOF.radius, ROOF.height) },
  uRoofShadow: { value: 1.0 },
  uInsideOnly: { value: 0.0 },
  uBowl: { value: new THREE.Vector3(BOWL.hx, BOWL.hz, BOWL.r) },
  uTime: { value: 0 },
  uRimColor: { value: new THREE.Color(0.25, 0.27, 0.3) },
};

export const STADIUM_SHADOW_GLSL = /* glsl */ `
uniform vec3 uSunDir;
uniform vec4 uRoof;
uniform float uRoofShadow;
uniform float uInsideOnly;
uniform vec3 uBowl;
float sdRoundRect(vec2 p, vec2 h, float r) {
  vec2 q = abs(p) - (h - r);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
float stadiumShadow(vec3 wp) {
  // ナイター: 照明はスタジアムの内側だけを照らす
  if (uInsideOnly > 0.5) {
    float sdb = sdRoundRect(wp.xz, uBowl.xy, uBowl.z);
    return (1.0 - smoothstep(38.0, 42.0, sdb)) * (1.0 - smoothstep(40.5, 41.5, wp.y));
  }
  float sy = max(uSunDir.y, 0.03);
  float t = max(uRoof.w - wp.y, 0.0) / sy;
  vec2 hit = wp.xz + uSunDir.xz * t;
  vec2 q = abs(hit) - (uRoof.xy - uRoof.z);
  float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uRoof.z;
  float pen = 0.25 + 0.012 * t;
  float s = smoothstep(-pen, pen, sd);
  return 1.0 - s * uRoofShadow;
}
`;

/**
 * MeshStandardMaterial 等に屋根影とリムライトを注入する
 * @param {THREE.Material} mat
 * @param {{rim?: number, roofShadow?: boolean, extraFrag?: (sh)=>void, extraVert?: (sh)=>void, key?: string, uniforms?: object}} opts
 */
export function patchMaterial(mat, opts = {}) {
  const { rim = 0, roofShadow = true, key = '', uniforms = {} } = opts;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    Object.assign(sh.uniforms, shared, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPos;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        {
          vec4 wsPos = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
          wsPos = instanceMatrix * wsPos;
          #endif
          wsPos = modelMatrix * wsPos;
          vWorldPos = wsPos.xyz;
        }`,
      );
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <common>',
      `#include <common>\nvarying vec3 vWorldPos;\nuniform float uTime;\nuniform vec3 uRimColor;\n${STADIUM_SHADOW_GLSL}`,
    );
    if (roofShadow) {
      // include は onBeforeCompile の後に展開されるので、ここで展開してから書き換える
      const chunk = THREE.ShaderChunk.lights_fragment_begin.replace(
        'getDirectionalLightInfo( directionalLight, directLight );',
        'getDirectionalLightInfo( directionalLight, directLight );\n\t\tif ( UNROLLED_LOOP_INDEX == 0 ) directLight.color *= stShadow;',
      );
      sh.fragmentShader = sh.fragmentShader.replace(
        '#include <lights_fragment_begin>',
        `float stShadow = stadiumShadow(vWorldPos);\n${chunk}`,
      );
    }
    if (rim > 0) {
      sh.fragmentShader = sh.fragmentShader.replace(
        '#include <opaque_fragment>',
        `{
          vec3 vdir = normalize(vViewPosition);
          float fr = pow(1.0 - clamp(dot(normal, vdir), 0.0, 1.0), 3.0);
          outgoingLight += uRimColor * fr * ${rim.toFixed(3)} * (0.4 + 0.6 * diffuseColor.rgb);
        }
        #include <opaque_fragment>`,
      );
    }
    opts.extraVert?.(sh);
    opts.extraFrag?.(sh);
  };
  const prevKey = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => `${prevKey ? prevKey() : ''}|st${roofShadow ? 1 : 0}r${rim}${key}`;
  return mat;
}
