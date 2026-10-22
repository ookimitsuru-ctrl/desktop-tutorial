import * as THREE from 'three';

// 雨: カメラ周辺の箱の中に細長い雨粒をインスタンス描画し、頂点シェーダで落下させる（CPU負荷なし）

const VERT = /* glsl */ `
attribute vec4 aDrop; // xyz = 初期位置(0..1), w = 速度係数
uniform float uTime;
uniform vec3 uBoxMin;
uniform vec3 uBoxSize;
uniform vec3 uWind;
uniform float uLength;
varying float vAlpha;
void main() {
  float speed = 9.0 + aDrop.w * 4.0;
  vec3 p = aDrop.xyz;
  // 落下して箱の下端に来たら上へループ
  p.y = fract(p.y - uTime * speed / uBoxSize.y);
  vec3 wp = uBoxMin + p * uBoxSize;
  wp.xz += uWind.xz * (1.0 - p.y) * 2.0;
  vec3 dir = normalize(vec3(uWind.x, -speed, uWind.z));
  // 長さ方向（下向き）と、カメラに向いた幅方向
  vec3 toCam = cameraPosition - wp;
  float dist = length(toCam);
  vec3 side = normalize(cross(dir, toCam / dist));
  // 遠くでも1ピクセル程度の太さを保つ
  wp += dir * position.y * uLength * (1.0 + dist * 0.006) + side * position.x * max(0.01, dist * 0.0011);
  vAlpha = 1.0 - smoothstep(0.75, 1.0, position.y + 0.5);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vAlpha;
void main() {
  gl_FragColor = vec4(uColor, uOpacity * vAlpha);
}`;

export class Rain {
  constructor(scene, count = 3500) {
    const quad = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.attributes.position = quad.attributes.position;
    const data = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      data[i * 4] = Math.random();
      data[i * 4 + 1] = Math.random();
      data[i * 4 + 2] = Math.random();
      data[i * 4 + 3] = Math.random();
    }
    geo.setAttribute('aDrop', new THREE.InstancedBufferAttribute(data, 4));
    geo.instanceCount = count;
    this.uniforms = {
      uTime: { value: 0 },
      uBoxMin: { value: new THREE.Vector3(-70, 0, -50) },
      uBoxSize: { value: new THREE.Vector3(140, 45, 100) },
      uWind: { value: new THREE.Vector3(1.2, 0, 0.6) },
      uLength: { value: 0.7 },
      uColor: { value: new THREE.Color(0.75, 0.8, 0.9) },
      uOpacity: { value: 0.35 },
    };
    this.mesh = new THREE.Mesh(
      geo,
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: this.uniforms,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.count = count;
  }

  setEnabled(on, night = false) {
    this.mesh.visible = on;
    this.uniforms.uColor.value.setRGB(night ? 0.9 : 0.75, night ? 0.93 : 0.8, night ? 1.0 : 0.9);
    this.uniforms.uOpacity.value = night ? 0.26 : 0.16;
  }

  /** カメラの近くに雨の箱を置く（遠くの雨は見えないので） */
  update(time, camera) {
    if (!this.mesh.visible) return;
    this.uniforms.uTime.value = time;
    const c = camera.position;
    const look = new THREE.Vector3();
    camera.getWorldDirection(look);
    // 箱の中心はカメラ前方
    const cx = c.x + look.x * 45;
    const cz = c.z + look.z * 45;
    const size = this.uniforms.uBoxSize.value;
    this.uniforms.uBoxMin.value.set(cx - size.x / 2, 0, cz - size.z / 2);
  }
}
