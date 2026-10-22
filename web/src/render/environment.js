import * as THREE from 'three';
import { getNoiseTexture } from './textures.js';
import { shared } from './shading.js';

// 空・太陽/照明・環境マップ・時間帯プリセット

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const SKY_FRAG = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uSunColor;
uniform float uSunDisk;
uniform float uClouds;
uniform vec3 uCloudColor;
uniform float uStars;
uniform float uTime;
uniform vec3 uGlow;
uniform sampler2D uNoise;
varying vec3 vDir;
float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.45));
  // 地平線付近の街明かり/大気のグロー
  col += uGlow * exp(-max(h, 0.0) * 9.0);
  col = mix(col, uGround, smoothstep(0.0, -0.08, h));
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunColor * (pow(sd, 6.0) * 0.18 + pow(sd, 64.0) * 0.6);
  col += uSunColor * smoothstep(0.9994, 0.9997, sd) * uSunDisk;
  // 雲
  if (uClouds > 0.0 && h > 0.0) {
    vec2 uv = d.xz / (h + 0.12) * 0.08 + vec2(uTime * 0.0015, 0.0);
    float n = texture2D(uNoise, uv).r * 0.6 + texture2D(uNoise, uv * 3.1).g * 0.3 + texture2D(uNoise, uv * 7.3).b * 0.1;
    float c = smoothstep(0.55 - uClouds * 0.3, 0.85, n) * smoothstep(0.0, 0.2, h);
    vec3 cc = uCloudColor * (0.75 + 0.5 * pow(sd, 3.0));
    col = mix(col, cc, c * 0.85);
  }
  // 星
  if (uStars > 0.0 && h > 0.0) {
    vec3 sp = floor(d * 380.0);
    float s = step(0.9975, hash(sp));
    col += vec3(s) * uStars * smoothstep(0.05, 0.4, h) * (0.6 + 0.4 * sin(uTime * 3.0 + hash(sp + 1.0) * 30.0));
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export const PRESETS = {
  day: {
    name: 'デイゲーム',
    sunEl: 56,
    sunAz: -34,
    sunColor: '#fff1dd',
    sunIntensity: 3.4,
    hemiSky: '#cfe0ff',
    hemiGround: '#6f7d55',
    hemiIntensity: 2.3,
    envIntensity: 0.55,
    exposure: 0.95,
    zenith: '#2f6dcc',
    horizon: '#bcd8f0',
    ground: '#5b6b4a',
    glow: '#000000',
    clouds: 0.55,
    cloudColor: '#ffffff',
    stars: 0,
    sunDisk: 30,
    roofShadow: 0.92,
    flood: 0.0,
    bloom: 0.07,
    bloomThreshold: 2.2,
    saturation: 1.1,
    contrast: 1.05,
    lift: [0.0, 0.0, 0.01],
    gain: [1.0, 1.0, 1.0],
    fog: '#b9cde0',
    fogDensity: 0.0012,
    blobShadows: 0.0,
  },
  sunset: {
    name: 'サンセット',
    sunEl: 17,
    sunAz: -78,
    sunColor: '#ffb470',
    sunIntensity: 3.2,
    hemiSky: '#ffc4a6',
    hemiGround: '#4a3c36',
    hemiIntensity: 2.0,
    envIntensity: 0.6,
    exposure: 1.0,
    zenith: '#28407a',
    horizon: '#ff9a5a',
    ground: '#3b3030',
    glow: '#ff7a3a',
    clouds: 0.65,
    cloudColor: '#ffb08a',
    stars: 0,
    sunDisk: 25,
    roofShadow: 0.8,
    flood: 0.55,
    floodFill: 1.9,
    bloom: 0.12,
    bloomThreshold: 1.6,
    saturation: 1.12,
    contrast: 1.06,
    lift: [0.015, 0.0, 0.02],
    gain: [1.04, 1.0, 0.95],
    fog: '#e8a07a',
    fogDensity: 0.0016,
    blobShadows: 0.25,
  },
  night: {
    name: 'ナイトゲーム',
    sunEl: 62,
    sunAz: 12,
    sunColor: '#eef3ff',
    sunIntensity: 3.8,
    hemiSky: '#4a62a0',
    hemiGround: '#2a3a24',
    hemiIntensity: 1.5,
    envIntensity: 0.45,
    exposure: 1.05,
    zenith: '#03060f',
    horizon: '#0f1d3a',
    ground: '#080a10',
    glow: '#22314f',
    clouds: 0.25,
    cloudColor: '#1a2235',
    stars: 0.9,
    sunDisk: 0,
    roofShadow: 0.0,
    flood: 1.0,
    bloom: 0.2,
    bloomThreshold: 1.1,
    saturation: 1.1,
    contrast: 1.08,
    lift: [0.0, 0.005, 0.02],
    gain: [0.98, 1.0, 1.04],
    fog: '#0d1424',
    fogDensity: 0.0018,
    blobShadows: 0.55,
  },
};

export class Environment {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.preset = PRESETS.day;

    this.skyUniforms = {
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uZenith: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uGround: { value: new THREE.Color() },
      uSunColor: { value: new THREE.Color() },
      uSunDisk: { value: 20 },
      uClouds: { value: 0.5 },
      uCloudColor: { value: new THREE.Color() },
      uStars: { value: 0 },
      uTime: { value: 0 },
      uGlow: { value: new THREE.Color() },
      uNoise: { value: getNoiseTexture() },
    };
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(1500, 48, 24),
      new THREE.ShaderMaterial({
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        uniforms: this.skyUniforms,
        side: THREE.BackSide,
        depthWrite: false,
      }),
    );
    sky.frustumCulled = false;
    sky.renderOrder = -10;
    sky.name = 'sky';
    this.sky = sky;
    scene.add(sky);

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -66;
    sc.right = 66;
    sc.top = 48;
    sc.bottom = -48;
    sc.near = 10;
    sc.far = 400;
    this.sunDirVec = new THREE.Vector3(0, 1, 0);
    this.shadowFocus = null;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.radius = 2;
    scene.add(this.sun);
    scene.add(this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    scene.add(this.hemi);

    // 照明塔/屋根照明の補助光（影なし。屋根の影の影響を受けない2番目の平行光源）
    this.flood = new THREE.DirectionalLight(0xf4f6ff, 0);
    this.flood.position.set(-30, 120, 60);
    scene.add(this.flood);

    this.fog = new THREE.FogExp2(0xffffff, 0.001);
    scene.fog = this.fog;
    this.envRT = null;
  }

  setShadowQuality(size) {
    if (size <= 0) {
      this.sun.castShadow = false;
      return;
    }
    this.sun.castShadow = true;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
  }

  apply(name, post, weather = 'clear') {
    let p = PRESETS[name] || PRESETS.day;
    if (weather === 'rain') {
      // 曇天・雨: 直射光を弱め、霧を濃く、雲を厚く
      const night = name === 'night';
      p = {
        ...p,
        sunIntensity: p.sunIntensity * (night ? 0.85 : 0.45),
        hemiIntensity: p.hemiIntensity * (night ? 1.0 : 1.05),
        hemiSky: night ? p.hemiSky : '#b8c2cf',
        clouds: 1.4,
        cloudColor: night ? '#202838' : '#8a929c',
        zenith: night ? p.zenith : '#5d6672',
        horizon: night ? p.horizon : '#9aa3ad',
        stars: 0,
        sunDisk: 0,
        roofShadow: p.roofShadow * 0.35,
        fog: night ? '#1a2230' : '#9aa4ae',
        fogDensity: p.fogDensity * 2.6,
        saturation: p.saturation * 0.9,
        contrast: p.contrast * 0.97,
        bloom: p.bloom * 1.2,
      };
    }
    this.sun.shadow.intensity = weather === 'rain' ? (name === 'night' ? 0.8 : 0.45) : 1;
    this.preset = p;
    this.presetName = name;
    const el = THREE.MathUtils.degToRad(p.sunEl);
    const az = THREE.MathUtils.degToRad(p.sunAz);
    const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).normalize();
    shared.uSunDir.value.copy(dir);
    shared.uRoofShadow.value = p.roofShadow;
    shared.uInsideOnly.value = name === 'night' ? 1 : 0;
    this.sunDirVec.copy(dir);
    this.sun.position.copy(dir).multiplyScalar(200);
    this.sun.target.position.set(0, 0, 0);
    this.shadowFocus = null;
    this.resetShadowBounds();
    this.sun.color.set(p.sunColor);
    this.sun.intensity = p.sunIntensity;
    this.hemi.color.set(p.hemiSky);
    this.hemi.groundColor.set(p.hemiGround);
    this.hemi.intensity = p.hemiIntensity;
    this.flood.intensity = p.floodFill ?? 0;
    this.fog.color.set(p.fog);
    this.fog.density = p.fogDensity;

    const su = this.skyUniforms;
    // 夜は照明方向ではなく月の方向にしておく
    su.uSunDir.value.copy(name === 'night' ? new THREE.Vector3(-0.4, 0.5, -0.75).normalize() : dir);
    su.uZenith.value.set(p.zenith);
    su.uHorizon.value.set(p.horizon);
    su.uGround.value.set(p.ground);
    su.uSunColor.value.set(name === 'night' ? '#8090b0' : p.sunColor);
    su.uSunDisk.value = p.sunDisk;
    su.uClouds.value = p.clouds;
    su.uCloudColor.value.set(p.cloudColor);
    su.uStars.value = p.stars;
    su.uGlow.value.set(p.glow);

    if (post) {
      const u = post.uniforms;
      u.uExposure.value = p.exposure;
      u.uBloom.value = p.bloom;
      u.uSaturation.value = p.saturation;
      u.uContrast.value = p.contrast;
      u.uLift.value.set(...p.lift);
      u.uGain.value.set(...p.gain);
      post.prefilterMat.uniforms.uThreshold.value = p.bloomThreshold;
    }
    this.buildEnvMap();
  }

  buildEnvMap() {
    // 空だけのシーンからPMREM環境マップを生成（PBRの映り込み用）
    const pm = new THREE.PMREMGenerator(this.renderer);
    const envScene = new THREE.Scene();
    const skyClone = new THREE.Mesh(this.sky.geometry, this.sky.material);
    envScene.add(skyClone);
    // スタジアムの暗い外周を簡易的に表現する帯
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(400, 400, 160, 32, 1, true),
      new THREE.MeshBasicMaterial({ color: this.presetName === 'night' ? 0x0a0c12 : 0x3a3f48, side: THREE.BackSide }),
    );
    band.position.y = 40;
    envScene.add(band);
    if (this.preset.flood > 0) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(260, 6, 6, 48),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 6, 6) }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 130;
      envScene.add(ring);
    }
    this.envRT?.dispose();
    this.envRT = pm.fromScene(envScene, 0.02, 1, 2000);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = this.preset.envIntensity;
    pm.dispose();
    band.geometry.dispose();
    band.material.dispose();
  }

  update(time) {
    this.skyUniforms.uTime.value = time;
  }

  resetShadowBounds() {
    const sc = this.sun.shadow.camera;
    sc.left = -SHADOW_FULL.hr;
    sc.right = SHADOW_FULL.hr;
    sc.top = SHADOW_FULL.hu;
    sc.bottom = -SHADOW_FULL.hu;
    sc.updateProjectionMatrix();
  }

  /**
   * 影を描く範囲を画面に映っている地面に絞り、影の解像度を上げる。null でピッチ全体に戻す。
   * 範囲の大きさは段階的にしか変えず、中心はシャドウマップの1テクセル単位で動かす（影のちらつき防止）。
   * @param {{x:number,z:number}[]|null} pts 画面に映る地面の四隅
   */
  focusShadow(pts) {
    const sun = this.sun;
    const sc = sun.shadow.camera;
    const dir = this.sunDirVec;
    if (!pts) {
      if (this.shadowFocus) {
        this.shadowFocus = null;
        sun.position.copy(dir).multiplyScalar(200);
        sun.target.position.set(0, 0, 0);
        this.resetShadowBounds();
      }
      return;
    }
    // 光源カメラの座標軸（Camera.lookAt と同じ作り方）
    _ax.crossVectors(_up, dir);
    if (_ax.lengthSq() < 1e-6) _ax.set(1, 0, 0);
    _ax.normalize();
    _ay.crossVectors(dir, _ax);
    let r0 = Infinity;
    let r1 = -Infinity;
    let u0 = Infinity;
    let u1 = -Infinity;
    for (const p of pts) {
      for (const y of [0, 2.6]) {
        _p.set(p.x, y, p.z);
        const r = _p.dot(_ax);
        const u = _p.dot(_ay);
        r0 = Math.min(r0, r);
        r1 = Math.max(r1, r);
        u0 = Math.min(u0, u);
        u1 = Math.max(u1, u);
      }
    }
    const step = 6;
    const hr = Math.ceil(((r1 - r0) / 2 + 3) / step) * step;
    const hu = Math.ceil(((u1 - u0) / 2 + 3) / step) * step;
    if (hr * hu >= SHADOW_FULL.hr * SHADOW_FULL.hu) {
      this.focusShadow(null);
      return;
    }
    const size = sun.shadow.mapSize.x;
    const tr = (2 * hr) / size;
    const tu = (2 * hu) / size;
    const cr = Math.round((r0 + r1) / 2 / tr) * tr;
    const cu = Math.round((u0 + u1) / 2 / tu) * tu;
    _p.copy(_ax).multiplyScalar(cr).addScaledVector(_ay, cu);
    sun.target.position.copy(_p);
    sun.position.copy(_p).addScaledVector(dir, 200);
    const f = this.shadowFocus;
    if (!f || f.hr !== hr || f.hu !== hu) {
      this.shadowFocus = { hr, hu };
      sc.left = -hr;
      sc.right = hr;
      sc.top = hu;
      sc.bottom = -hu;
      sc.updateProjectionMatrix();
    }
  }
}

const SHADOW_FULL = { hr: 66, hu: 48 };
const _up = new THREE.Vector3(0, 1, 0);
const _ax = new THREE.Vector3();
const _ay = new THREE.Vector3();
const _p = new THREE.Vector3();
