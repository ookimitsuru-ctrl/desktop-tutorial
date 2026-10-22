import * as THREE from 'three';
import { PITCH } from '../config.js';

// 中継カメラ: ピッチ全面が必ず画面に収まるよう、画面比率から位置を自動計算する

const _v = new THREE.Vector3();

/** 画面に収めたい点（ピッチ四隅・ゴール上端など） */
function framePoints() {
  const pts = [];
  const hx = PITCH.HL + 2.6; // ゴールネット分の余白
  const hz = PITCH.HW + 1.2;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) pts.push(new THREE.Vector3(sx * hx, 0, sz * hz));
    pts.push(new THREE.Vector3(sx * hx, PITCH.goalH + 0.4, -PITCH.goalHalfW));
    pts.push(new THREE.Vector3(sx * hx, PITCH.goalH + 0.4, PITCH.goalHalfW));
  }
  // 奥のタッチライン上で選手の頭が切れないよう
  pts.push(new THREE.Vector3(0, 2.2, -hz));
  pts.push(new THREE.Vector3(-hx, 2.2, -hz));
  pts.push(new THREE.Vector3(hx, 2.2, -hz));
  return pts;
}

/**
 * @param {number} aspect 画面の縦横比 (w/h)
 * @param {object} o {fov, elevation(deg), marginX, marginTop, marginBottom}
 */
export function computeBroadcastFrame(aspect, o = {}) {
  const fov = o.fov ?? 30;
  const elev = THREE.MathUtils.degToRad(o.elevation ?? 40);
  const mX = o.marginX ?? 0.02;
  const mTop = o.marginTop ?? 0.1;
  const mBot = o.marginBottom ?? 0.06;
  const cam = new THREE.PerspectiveCamera(fov, aspect, 1, 3000);
  const pts = framePoints();
  const dir = new THREE.Vector3(0, -Math.sin(elev), -Math.cos(elev)); // 視線方向
  let best = null;
  // 注視点のz（奥行き）と距離を探索
  for (let tz = -14; tz <= 10; tz += 0.25) {
    const target = new THREE.Vector3(0, 0, tz);
    let lo = 20;
    let hi = 800;
    for (let it = 0; it < 40; it++) {
      const mid = (lo + hi) / 2;
      cam.position.copy(target).addScaledVector(dir, -mid);
      cam.lookAt(target);
      cam.updateMatrixWorld();
      let ok = true;
      for (const p of pts) {
        _v.copy(p).project(cam);
        if (_v.z > 1 || Math.abs(_v.x) > 1 - mX || _v.y > 1 - mTop || _v.y < -1 + mBot) {
          ok = false;
          break;
        }
      }
      if (ok) hi = mid;
      else lo = mid;
    }
    if (!best || hi < best.dist) best = { dist: hi, tz };
  }
  const target = new THREE.Vector3(0, 0, best.tz);
  const position = target.clone().addScaledVector(dir, -best.dist);
  return { position, target, fov };
}
