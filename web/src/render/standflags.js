import * as THREE from 'three';
import { BOWL } from '../config.js';
import { rrPerimeter, rrPoint } from './geom.js';
import { TIERS } from './stadium.js';
import { patchMaterial, shared } from './shading.js';
import { makeRng } from '../util/math.js';

// スタンドで振られる国旗（布の揺れは頂点シェーダで計算）

export class StandFlags {
  constructor(scene, count = 64) {
    this.count = count;
    this.canvas = document.createElement('canvas');
    this.canvas.width = 512;
    this.canvas.height = 340;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    const geo = new THREE.PlaneGeometry(1.6, 1.05, 10, 4);
    geo.translate(0.8, 0, 0);
    const n = count;
    const info = new Float32Array(n * 2);
    geo.setAttribute('aFlag', new THREE.InstancedBufferAttribute(info, 2));
    const mat = new THREE.MeshStandardMaterial({ map: this.tex, side: THREE.DoubleSide, roughness: 0.8 });
    patchMaterial(mat, {
      key: 'standflag',
      extraVert: (sh) => {
        sh.uniforms.uTimeF = shared.uTime;
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nattribute vec2 aFlag;\nuniform float uTimeF;')
          .replace(
            '#include <uv_vertex>',
            `#include <uv_vertex>
            #ifdef USE_MAP
            vMapUv = vMapUv * 0.5 + vec2(mod(aFlag.x, 2.0), floor(aFlag.x / 2.0)) * 0.5;
            #endif`,
          )
          .replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
            {
              float u = transformed.x / 1.6;
              float t = uTimeF * 3.2 + aFlag.y * 6.2831;
              transformed.z += sin(t - u * 5.0) * 0.18 * u + sin(t * 1.7 - u * 9.0) * 0.05 * u;
              transformed.y += sin(t * 0.8 - u * 3.0) * 0.06 * u - u * 0.08;
            }`,
          );
      },
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, n);
    this.mesh.frustumCulled = false;
    const poleGeo = new THREE.CylinderGeometry(0.015, 0.015, 1.9, 5);
    poleGeo.translate(0, -0.45, 0);
    this.poles = new THREE.InstancedMesh(poleGeo, new THREE.MeshStandardMaterial({ color: 0x777777 }), n);
    this.poles.frustumCulled = false;
    scene.add(this.mesh, this.poles);
    this.place();
  }

  place() {
    const rng = makeRng(42);
    const tier = TIERS.lower;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pt = {};
    const info = this.mesh.geometry.attributes.aFlag;
    for (let i = 0; i < this.count; i++) {
      const f = 0.15 + rng() * 0.75;
      const o = tier.o0 + (tier.o1 - tier.o0) * f;
      const hgt = tier.h0 + (tier.h1 - tier.h0) * f + 1.9;
      const hx = BOWL.hx + o;
      const hz = BOWL.hz + o;
      const rr = BOWL.r + o;
      const P = rrPerimeter(hx, hz, rr);
      const s = rng() * P;
      rrPoint(hx, hz, rr, s, pt);
      // ホーム側(-x)はホームの旗、アウェイ側はアウェイの旗が多い
      const homeSide = pt.x < 0;
      const own = rng() < 0.75 ? (homeSide ? 0 : 1) : homeSide ? 1 : 0;
      const ang = Math.atan2(-pt.nx, -pt.nz) + (rng() - 0.5) * 0.8;
      q.setFromEuler(new THREE.Euler(0, ang + Math.PI / 2, 0));
      m.compose(new THREE.Vector3(pt.x, hgt, pt.z), q, new THREE.Vector3(1, 1, 1));
      this.mesh.setMatrixAt(i, m);
      this.poles.setMatrixAt(i, m);
      info.setXY(i, own, rng());
    }
    info.needsUpdate = true;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.poles.instanceMatrix.needsUpdate = true;
  }

  /** 対戦する2チームの旗を描く（アトラスの0=ホーム, 1=アウェイ） */
  setTeams(homeCanvas, awayCanvas) {
    const g = this.canvas.getContext('2d');
    g.clearRect(0, 0, 512, 340);
    g.drawImage(homeCanvas, 0, 170, 256, 170);
    g.drawImage(awayCanvas, 256, 170, 256, 170);
    g.drawImage(homeCanvas, 0, 0, 256, 170);
    g.drawImage(awayCanvas, 256, 0, 256, 170);
    this.tex.needsUpdate = true;
  }

  setVisible(v) {
    this.mesh.visible = v;
    this.poles.visible = v;
  }
}
