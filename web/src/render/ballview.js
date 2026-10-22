import * as THREE from 'three';
import { BALL_R, BALL_VISUAL_SCALE } from '../config.js';
import { patchMaterial } from './shading.js';

// ボール: 正二十面体の頂点方向から五角形パネルと縫い目をシェーダで描く。高速時は軌跡を表示。

const ICO_DIRS = (() => {
  const t = (1 + Math.sqrt(5)) / 2;
  const v = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ];
  return v.map(([x, y, z]) => new THREE.Vector3(x, y, z).normalize());
})();

export class BallView {
  constructor(scene) {
    const r = BALL_R * BALL_VISUAL_SCALE;
    this.radius = r;
    const geo = new THREE.SphereGeometry(r, 28, 18);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0 });
    patchMaterial(mat, {
      rim: 0.8,
      key: 'ball',
      uniforms: { uIco: { value: ICO_DIRS } },
      extraVert: (sh) => {
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vObjN;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjN = normalize(position);');
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vObjN;\nuniform vec3 uIco[12];')
          .replace(
            '#include <color_fragment>',
            `#include <color_fragment>
            {
              vec3 n = normalize(vObjN);
              float best = -1.0; float second = -1.0;
              for (int i = 0; i < 12; i++) {
                float d = dot(n, uIco[i]);
                if (d > best) { second = best; best = d; } else if (d > second) { second = d; }
              }
              // 五角形（中心から近い）と、六角形の境目の縫い目
              float pent = smoothstep(0.935, 0.945, best);
              float seam = 1.0 - smoothstep(0.0, 0.018, best - second);
              vec3 c = mix(vec3(0.96), vec3(0.06, 0.07, 0.12), pent);
              c = mix(c, vec3(0.55), seam * 0.6 * (1.0 - pent));
              // アクセントの色帯
              float band = smoothstep(0.86, 0.87, best) * (1.0 - pent);
              c = mix(c, vec3(0.85, 0.12, 0.1), band * 0.85);
              diffuseColor.rgb = c;
            }`,
          );
      },
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = true;
    this.mesh.name = 'ball';
    scene.add(this.mesh);

    // 地面の接地影
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 1, 32, 32, 31);
    grad.addColorStop(0, 'rgba(0,0,0,0.8)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    const shadowGeo = new THREE.PlaneGeometry(1, 1);
    shadowGeo.rotateX(-Math.PI / 2);
    this.shadow = new THREE.Mesh(
      shadowGeo,
      new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(c),
        transparent: true,
        depthWrite: false,
        color: 0x000000,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        polygonOffsetUnits: -3,
      }),
    );
    this.shadow.renderOrder = 2;
    scene.add(this.shadow);

    // 強いシュートの軌跡（加算合成のリボン）
    this.trailLen = 22;
    this.trailPts = [];
    const tg = new THREE.BufferGeometry();
    this.trailPos = new Float32Array(this.trailLen * 2 * 3);
    this.trailAlpha = new Float32Array(this.trailLen * 2);
    tg.setAttribute('position', new THREE.BufferAttribute(this.trailPos, 3).setUsage(THREE.DynamicDrawUsage));
    tg.setAttribute('alpha', new THREE.BufferAttribute(this.trailAlpha, 1).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i < this.trailLen - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    tg.setIndex(idx);
    this.trail = new THREE.Mesh(
      tg,
      new THREE.ShaderMaterial({
        vertexShader: `attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);} `,
        fragmentShader: `uniform vec3 uColor; varying float vA; void main(){ gl_FragColor = vec4(uColor * vA, vA); }`,
        uniforms: { uColor: { value: new THREE.Color(1.6, 1.5, 1.2) } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    );
    this.trail.frustumCulled = false;
    this.trailStrength = 0;
    scene.add(this.trail);
    this.quat = new THREE.Quaternion();
    this.lastPos = new THREE.Vector3();
  }

  /**
   * @param {{x,y,z}} pos ボール中心（物理座標）
   * @param {{x,y,z}} vel
   * @param {THREE.Camera} camera
   */
  update(pos, vel, dt, camera, hidden = false) {
    const m = this.mesh;
    m.visible = !hidden;
    this.shadow.visible = !hidden;
    // 見た目を大きくしている分、地面に埋まらないよう持ち上げる
    const lift = this.radius - BALL_R;
    m.position.set(pos.x, pos.y + lift, pos.z);
    // 転がり回転
    const dx = pos.x - this.lastPos.x;
    const dz = pos.z - this.lastPos.z;
    const d = Math.hypot(dx, dz);
    if (d > 1e-5 && d < 5) {
      const axis = new THREE.Vector3(dz, 0, -dx).normalize();
      const q = new THREE.Quaternion().setFromAxisAngle(axis, d / BALL_R);
      m.quaternion.premultiply(q);
    }
    this.lastPos.set(pos.x, pos.y, pos.z);
    const h = Math.max(0, pos.y - BALL_R);
    const s = (this.radius * 2.6) * (1 + h * 0.25);
    this.shadow.scale.set(s, 1, s);
    this.shadow.position.set(pos.x, 0.02, pos.z);
    this.shadow.material.opacity = 0.75 / (1 + h * 0.6);

    // 軌跡
    const speed = Math.hypot(vel.x, vel.y, vel.z);
    const target = speed > 20 && !hidden ? Math.min(1, (speed - 20) / 10) : 0;
    this.trailStrength += (target - this.trailStrength) * Math.min(1, dt * (target > this.trailStrength ? 20 : 4));
    this.trailPts.unshift(m.position.clone());
    if (this.trailPts.length > this.trailLen) this.trailPts.pop();
    const camPos = camera.position;
    const tmp = new THREE.Vector3();
    const side = new THREE.Vector3();
    for (let i = 0; i < this.trailLen; i++) {
      const p = this.trailPts[Math.min(i, this.trailPts.length - 1)];
      const q = this.trailPts[Math.min(i + 1, this.trailPts.length - 1)];
      tmp.subVectors(p, q);
      if (tmp.lengthSq() < 1e-8) tmp.set(1, 0, 0);
      side.subVectors(camPos, p).cross(tmp).normalize();
      const w = this.radius * 0.8 * (1 - i / this.trailLen);
      this.trailPos.set([p.x + side.x * w, p.y + side.y * w, p.z + side.z * w], i * 6);
      this.trailPos.set([p.x - side.x * w, p.y - side.y * w, p.z - side.z * w], i * 6 + 3);
      const a = this.trailStrength * Math.pow(1 - i / this.trailLen, 1.5) * 0.5;
      this.trailAlpha[i * 2] = a;
      this.trailAlpha[i * 2 + 1] = a;
    }
    this.trail.geometry.attributes.position.needsUpdate = true;
    this.trail.geometry.attributes.alpha.needsUpdate = true;
    this.trail.visible = this.trailStrength > 0.01;
  }

  resetTrail() {
    this.trailPts.length = 0;
    this.trailStrength = 0;
  }
}
