import * as THREE from 'three';
import { PITCH } from '../config.js';
import { makeNetTexture } from './textures.js';
import { patchMaterial } from './shading.js';

// ゴール: ポスト/バー、背面フレーム、ボールが入ると波打つネット

const NET_CELL = 0.12;

function gridGeometry(corners, nu, nv) {
  // corners: [p00, p10, p01, p11] の双線形パッチ。uvはメートル単位/網目サイズ
  const [p00, p10, p01, p11] = corners;
  const pos = [];
  const uv = [];
  const idx = [];
  const lu = p00.distanceTo(p10);
  const lv = p00.distanceTo(p01);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  for (let j = 0; j <= nv; j++) {
    const v = j / nv;
    for (let i = 0; i <= nu; i++) {
      const u = i / nu;
      a.lerpVectors(p00, p10, u);
      b.lerpVectors(p01, p11, u);
      a.lerp(b, v);
      pos.push(a.x, a.y, a.z);
      uv.push((u * lu) / NET_CELL / 2, (v * lv) / NET_CELL / 2);
    }
  }
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const k = j * (nu + 1) + i;
      idx.push(k, k + 1, k + nu + 1, k + 1, k + nu + 2, k + nu + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export class Goals {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = 'goals';
    scene.add(this.group);
    this.impacts = [
      { pos: new THREE.Vector3(), time: -100, strength: 0 },
      { pos: new THREE.Vector3(), time: -100, strength: 0 },
    ];
    this.netUniforms = [];
    this.build(-1);
    this.build(1);
  }

  build(side) {
    const { HL, goalHalfW: gw, goalH: gh, postR } = PITCH;
    const depth = 2.0;
    const g = new THREE.Group();
    const postMat = patchMaterial(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.22, metalness: 0.0 }), { rim: 0.6 });
    const frameMat = patchMaterial(new THREE.MeshStandardMaterial({ color: 0xd9dde3, roughness: 0.4, metalness: 0.3 }));
    const x0 = side * (HL + postR);
    const post = new THREE.CylinderGeometry(postR, postR, gh + postR, 16);
    post.translate(0, (gh + postR) / 2, 0);
    for (const sz of [-1, 1]) {
      const m = new THREE.Mesh(post, postMat);
      m.position.set(x0, 0, sz * (gw + postR));
      m.castShadow = true;
      g.add(m);
    }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(postR, postR, (gw + postR) * 2 + postR * 2, 16), postMat);
    bar.rotation.x = Math.PI / 2;
    bar.position.set(x0, gh + postR, 0);
    bar.castShadow = true;
    g.add(bar);

    // 背面フレーム
    const xb = side * (HL + depth + 0.15);
    const tube = (a, b, r = 0.03) => {
      const d = new THREE.Vector3().subVectors(b, a);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 8), frameMat);
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
      m.castShadow = true;
      g.add(m);
    };
    const backTop = 1.9;
    const topBackX = side * (HL + 0.9);
    for (const sz of [-1, 1]) {
      const z = sz * (gw + postR);
      tube(new THREE.Vector3(xb, 0, z), new THREE.Vector3(xb, backTop - 0.6, z));
      tube(new THREE.Vector3(xb, backTop - 0.6, z), new THREE.Vector3(topBackX, gh + postR, z));
      tube(new THREE.Vector3(x0, 0.02, z), new THREE.Vector3(xb, 0.02, z), 0.025);
    }
    tube(new THREE.Vector3(xb, 0.02, -(gw + postR)), new THREE.Vector3(xb, 0.02, gw + postR), 0.025);

    // ネット
    const netTex = makeNetTexture();
    const uniforms = {
      uImpact: { value: new THREE.Vector3(0, -100, 0) },
      uImpactTime: { value: -100 },
      uImpactStrength: { value: 0 },
      uNetTime: { value: 0 },
    };
    this.netUniforms.push(uniforms);
    const netMat = new THREE.MeshStandardMaterial({
      color: 0xf4f4f4,
      alphaMap: netTex,
      alphaTest: 0.08,
      alphaToCoverage: true,
      side: THREE.DoubleSide,
      roughness: 0.85,
      transparent: false,
    });
    patchMaterial(netMat, {
      key: 'net',
      uniforms,
      extraVert: (sh) => {
        sh.vertexShader = sh.vertexShader
          .replace(
            '#include <common>',
            `#include <common>
             uniform vec3 uImpact; uniform float uImpactTime; uniform float uImpactStrength; uniform float uNetTime;`,
          )
          .replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
             {
               vec3 wp0 = (modelMatrix * vec4(transformed, 1.0)).xyz;
               float age = uNetTime - uImpactTime;
               float d = distance(wp0, uImpact);
               float env = exp(-age * 2.2) * step(0.0, age);
               float wave = sin(age * 18.0 - d * 6.0) * exp(-d * 0.9);
               float bulge = exp(-d * d * 1.2) * (1.0 - exp(-age * 12.0));
               float disp = uImpactStrength * env * (bulge * 0.55 + wave * 0.12);
               // 外側（ゴールの奥方向）へ膨らむ
               vec3 outward = normalize(vec3(sign(wp0.x) * 1.0, 0.15, 0.0));
               transformed += outward * disp;
               // 静的なたるみ
               transformed.y -= 0.04 * sin(clamp((abs(wp0.x) - ${HL.toFixed(2)}) / 2.0, 0.0, 1.0) * 3.14159);
             }`,
          );
      },
    });
    const zL = -(gw + postR);
    const zR = gw + postR;
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const top = gridGeometry([V(x0, gh + postR, zL), V(x0, gh + postR, zR), V(topBackX, gh + postR, zL), V(topBackX, gh + postR, zR)], 24, 4);
    const slope = gridGeometry([V(topBackX, gh + postR, zL), V(topBackX, gh + postR, zR), V(xb, backTop - 0.6, zL), V(xb, backTop - 0.6, zR)], 24, 5);
    const back = gridGeometry([V(xb, backTop - 0.6, zL), V(xb, backTop - 0.6, zR), V(xb, 0, zL), V(xb, 0, zR)], 24, 6);
    const sides = [zL, zR].map((z) =>
      gridGeometry([V(x0, gh + postR, z), V(topBackX, gh + postR, z), V(x0, 0, z), V(xb, 0, z)], 8, 8),
    );
    const sideTri = [zL, zR].map((z) =>
      gridGeometry([V(topBackX, gh + postR, z), V(xb, backTop - 0.6, z), V(xb, 0, z), V(xb, 0, z)], 6, 6),
    );
    for (const geo of [top, slope, back, ...sides, ...sideTri]) {
      const m = new THREE.Mesh(geo, netMat);
      m.castShadow = true;
      m.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, alphaMap: netTex, alphaTest: 0.3 });
      g.add(m);
    }
    this.group.add(g);
  }

  /** ボールがネットに当たったとき */
  hitNet(side, point, strength, time) {
    const u = this.netUniforms[side > 0 ? 1 : 0];
    u.uImpact.value.copy(point);
    u.uImpactTime.value = time;
    u.uImpactStrength.value = strength;
  }

  update(time) {
    for (const u of this.netUniforms) u.uNetTime.value = time;
  }
}
