import * as THREE from 'three';

// HDRシーン → ブルーム(ミップチェーン) → トーンマップ/カラーグレーディング/ビネット の自前ポストプロセス。
// モバイルでも軽いように、ブルームは縮小バッファ上でのみ処理する。

const FS_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const PREFILTER_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel;
uniform float uThreshold;
uniform float uKnee;
varying vec2 vUv;
vec3 prefilter(vec3 c) {
  float br = max(c.r, max(c.g, c.b));
  float rq = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee);
  rq = (rq * rq) / (4.0 * uKnee + 1e-4);
  float contrib = max(rq, br - uThreshold) / max(br, 1e-4);
  return c * contrib;
}
void main() {
  // 4タップのボックスフィルタで1/2に縮小しながら輝度抽出
  vec3 a = texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
  vec3 b = texture2D(tSrc, vUv + uTexel * vec2( 1.0, -1.0)).rgb;
  vec3 c = texture2D(tSrc, vUv + uTexel * vec2(-1.0,  1.0)).rgb;
  vec3 d = texture2D(tSrc, vUv + uTexel * vec2( 1.0,  1.0)).rgb;
  vec3 col = (a + b + c + d) * 0.25;
  col = min(col, vec3(64.0));
  gl_FragColor = vec4(prefilter(col), 1.0);
}`;

const DOWN_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  // Call of Duty: Advanced Warfare 方式の13タップダウンサンプル
  vec2 t = uTexel;
  vec3 a = texture2D(tSrc, vUv + t * vec2(-2.0, -2.0)).rgb;
  vec3 b = texture2D(tSrc, vUv + t * vec2( 0.0, -2.0)).rgb;
  vec3 c = texture2D(tSrc, vUv + t * vec2( 2.0, -2.0)).rgb;
  vec3 d = texture2D(tSrc, vUv + t * vec2(-2.0,  0.0)).rgb;
  vec3 e = texture2D(tSrc, vUv).rgb;
  vec3 f = texture2D(tSrc, vUv + t * vec2( 2.0,  0.0)).rgb;
  vec3 g = texture2D(tSrc, vUv + t * vec2(-2.0,  2.0)).rgb;
  vec3 h = texture2D(tSrc, vUv + t * vec2( 0.0,  2.0)).rgb;
  vec3 i = texture2D(tSrc, vUv + t * vec2( 2.0,  2.0)).rgb;
  vec3 j = texture2D(tSrc, vUv + t * vec2(-1.0, -1.0)).rgb;
  vec3 k = texture2D(tSrc, vUv + t * vec2( 1.0, -1.0)).rgb;
  vec3 l = texture2D(tSrc, vUv + t * vec2(-1.0,  1.0)).rgb;
  vec3 m = texture2D(tSrc, vUv + t * vec2( 1.0,  1.0)).rgb;
  vec3 col = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  gl_FragColor = vec4(col, 1.0);
}`;

const UP_FRAG = /* glsl */ `
uniform sampler2D tSrc;   // 1段小さいアップサンプル結果
uniform sampler2D tBase;  // 同じ解像度のダウンサンプル結果
uniform vec2 uTexel;
uniform float uRadius;
uniform float uMix;
varying vec2 vUv;
void main() {
  vec2 t = uTexel * uRadius;
  vec3 s = texture2D(tSrc, vUv + vec2(-t.x, -t.y)).rgb;
  s += texture2D(tSrc, vUv + vec2(0.0, -t.y)).rgb * 2.0;
  s += texture2D(tSrc, vUv + vec2(t.x, -t.y)).rgb;
  s += texture2D(tSrc, vUv + vec2(-t.x, 0.0)).rgb * 2.0;
  s += texture2D(tSrc, vUv).rgb * 4.0;
  s += texture2D(tSrc, vUv + vec2(t.x, 0.0)).rgb * 2.0;
  s += texture2D(tSrc, vUv + vec2(-t.x, t.y)).rgb;
  s += texture2D(tSrc, vUv + vec2(0.0, t.y)).rgb * 2.0;
  s += texture2D(tSrc, vUv + vec2(t.x, t.y)).rgb;
  s *= 1.0 / 16.0;
  gl_FragColor = vec4(texture2D(tBase, vUv).rgb + s * uMix, 1.0);
}`;

const COMPOSITE_FRAG = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform float uBloom;
uniform float uExposure;
uniform float uSaturation;
uniform float uContrast;
uniform vec3 uLift;
uniform vec3 uGain;
uniform float uVignette;
uniform float uTime;
uniform float uFade;
uniform vec3 uFadeColor;
uniform float uDesat;
uniform vec2 uResolution;
uniform float uLetterbox;
varying vec2 vUv;

// ACES (Stephen Hill のフィット)
vec3 RRTAndODTFit(vec3 v) {
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}
vec3 ACESFitted(vec3 color) {
  const mat3 ACESInputMat = mat3(
    0.59719, 0.07600, 0.02840,
    0.35458, 0.90834, 0.13383,
    0.04823, 0.01566, 0.83777);
  const mat3 ACESOutputMat = mat3(
     1.60475, -0.10208, -0.00327,
    -0.53108,  1.10813, -0.07276,
    -0.07367, -0.00605,  1.07602);
  color = ACESInputMat * color;
  color = RRTAndODTFit(color);
  color = ACESOutputMat * color;
  return clamp(color, 0.0, 1.0);
}
vec3 toSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
float hash(vec2 p) {
  p = fract(p * vec2(443.897, 441.423));
  p += dot(p, p.yx + 19.19);
  return fract((p.x + p.y) * p.x);
}
void main() {
  vec3 col = texture2D(tScene, vUv).rgb;
  vec3 bloom = texture2D(tBloom, vUv).rgb;
  col += bloom * uBloom;
  col *= uExposure;
  col = ACESFitted(col);
  // グレーディング（リニア空間に近い表示域で軽く）
  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(luma), col, uSaturation * (1.0 - uDesat));
  col = (col - 0.5) * uContrast + 0.5;
  col = col * uGain + uLift * (1.0 - col);
  col = clamp(col, 0.0, 1.0);
  // ビネット
  vec2 d = vUv - 0.5;
  d.x *= uResolution.x / uResolution.y * 0.6;
  float v = 1.0 - dot(d, d) * uVignette;
  col *= clamp(v, 0.0, 1.0);
  col = toSRGB(col);
  col = mix(col, uFadeColor, uFade);
  // シネマ用レターボックス（リプレイ時）
  float lb = step(vUv.y, uLetterbox) + step(1.0 - uLetterbox, vUv.y);
  col = mix(col, vec3(0.0), lb);
  // ディザでバンディング防止
  col += (hash(gl_FragCoord.xy + fract(uTime) * 61.0) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}`;

export class PostFX {
  constructor(renderer) {
    this.renderer = renderer;
    this.enabled = true;
    this.msaa = 4;
    this.bloom = true;
    this.bloomLevels = 5;
    // ブルームなし（低画質）のときに仕上げへ渡す黒
    this.noBloom = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    this.noBloom.needsUpdate = true;
    this.width = 1;
    this.height = 1;

    const gl = renderer.getContext();
    this.hdrType = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float')
      ? THREE.HalfFloatType
      : THREE.UnsignedByteType;
    this.maxSamples = gl.getParameter(gl.MAX_SAMPLES) || 0;

    this.quadGeo = new THREE.BufferGeometry();
    this.quadGeo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.quad = new THREE.Mesh(this.quadGeo);
    this.quad.frustumCulled = false;
    this.quadScene = new THREE.Scene();
    this.quadScene.add(this.quad);
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const mk = (frag, uniforms) =>
      new THREE.ShaderMaterial({
        vertexShader: FS_VERT,
        fragmentShader: frag,
        uniforms,
        depthTest: false,
        depthWrite: false,
      });
    this.prefilterMat = mk(PREFILTER_FRAG, {
      tSrc: { value: null },
      uTexel: { value: new THREE.Vector2() },
      uThreshold: { value: 1.0 },
      uKnee: { value: 0.5 },
    });
    this.downMat = mk(DOWN_FRAG, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.upMat = mk(UP_FRAG, {
      tSrc: { value: null },
      tBase: { value: null },
      uTexel: { value: new THREE.Vector2() },
      uRadius: { value: 1.0 },
      uMix: { value: 1.0 },
    });
    this.compositeMat = mk(COMPOSITE_FRAG, {
      tScene: { value: null },
      tBloom: { value: null },
      uBloom: { value: 0.12 },
      uExposure: { value: 1.0 },
      uSaturation: { value: 1.08 },
      uContrast: { value: 1.04 },
      uLift: { value: new THREE.Vector3(0, 0, 0) },
      uGain: { value: new THREE.Vector3(1, 1, 1) },
      uVignette: { value: 0.35 },
      uTime: { value: 0 },
      uFade: { value: 0 },
      uFadeColor: { value: new THREE.Color(0, 0, 0) },
      uDesat: { value: 0 },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uLetterbox: { value: 0 },
    });

    this.sceneRT = null;
    this.downRTs = [];
    this.upRTs = [];
  }

  get uniforms() {
    return this.compositeMat.uniforms;
  }

  setSize(w, h) {
    w = Math.max(1, Math.floor(w));
    h = Math.max(1, Math.floor(h));
    if (w === this.width && h === this.height && this.sceneRT) return;
    this.width = w;
    this.height = h;
    this.disposeTargets();
    const samples = Math.min(this.msaa, this.maxSamples);
    this.sceneRT = new THREE.WebGLRenderTarget(w, h, {
      type: this.hdrType,
      samples,
      depthBuffer: true,
      stencilBuffer: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    let bw = Math.max(1, w >> 1);
    let bh = Math.max(1, h >> 1);
    for (let i = 0; i < (this.bloom ? this.bloomLevels : 0); i++) {
      const opts = { type: this.hdrType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
      this.downRTs.push(new THREE.WebGLRenderTarget(bw, bh, opts));
      this.upRTs.push(new THREE.WebGLRenderTarget(bw, bh, opts));
      bw = Math.max(1, bw >> 1);
      bh = Math.max(1, bh >> 1);
    }
    this.compositeMat.uniforms.uResolution.value.set(w, h);
  }

  disposeTargets() {
    this.sceneRT?.dispose();
    this.downRTs.forEach((r) => r.dispose());
    this.upRTs.forEach((r) => r.dispose());
    this.downRTs = [];
    this.upRTs = [];
  }

  pass(material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quadScene, this.quadCam);
  }

  render(scene, camera, time) {
    const r = this.renderer;
    r.setRenderTarget(this.sceneRT);
    r.render(scene, camera);

    const cu = this.compositeMat.uniforms;
    cu.tScene.value = this.sceneRT.texture;
    cu.uTime.value = time;
    const n = this.downRTs.length;
    if (!n) {
      // 低画質: ブルームを省いて仕上げだけ
      cu.tBloom.value = this.noBloom;
      this.pass(this.compositeMat, null);
      return;
    }
    // ブルーム
    this.prefilterMat.uniforms.tSrc.value = this.sceneRT.texture;
    this.prefilterMat.uniforms.uTexel.value.set(0.5 / this.width, 0.5 / this.height);
    this.pass(this.prefilterMat, this.downRTs[0]);
    for (let i = 1; i < n; i++) {
      const src = this.downRTs[i - 1];
      this.downMat.uniforms.tSrc.value = src.texture;
      this.downMat.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
      this.pass(this.downMat, this.downRTs[i]);
    }
    let prev = this.downRTs[n - 1];
    for (let i = n - 2; i >= 0; i--) {
      this.upMat.uniforms.tSrc.value = prev.texture;
      this.upMat.uniforms.tBase.value = this.downRTs[i].texture;
      this.upMat.uniforms.uTexel.value.set(1 / prev.width, 1 / prev.height);
      this.upMat.uniforms.uMix.value = 0.9;
      this.pass(this.upMat, this.upRTs[i]);
      prev = this.upRTs[i];
    }

    cu.tBloom.value = prev.texture;
    this.pass(this.compositeMat, null);
  }
}
