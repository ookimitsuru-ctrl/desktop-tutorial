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

// ---------------------------------------------------------------- 追従カメラ

/**
 * ボールを追ってスクロールする中継カメラの設定。
 * width = 注視点の位置で画面に映る横幅[m]（画面比率から距離を決める）
 */
export const FOLLOW_MODES = {
  close: { width: 30, elevation: 33, fov: 30 },
  normal: { width: 40, elevation: 36, fov: 30 },
};

/** 臨界減衰ばね（Unity の SmoothDamp と同じ式） */
function smoothDamp(cur, target, st, smoothTime, dt) {
  const omega = 2 / smoothTime;
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = cur - target;
  const temp = (st.v + omega * change) * dt;
  st.v = (st.v - omega * temp) * exp;
  return target + (change + temp) * exp;
}

export class FollowCamera {
  constructor() {
    this.fx = 0;
    this.fz = 0;
    this.sx = { v: 0 };
    this.sz = { v: 0 };
    this.ready = false;
    this.configure(16 / 9, 'normal');
  }

  configure(aspect, mode) {
    const c = FOLLOW_MODES[mode] || FOLLOW_MODES.normal;
    this.mode = mode;
    const e = THREE.MathUtils.degToRad(c.elevation);
    const halfV = THREE.MathUtils.degToRad(c.fov / 2);
    this.dist = c.width / (2 * Math.tan(halfV) * aspect);
    this.elev = e;
    this.fov = c.fov;
    this.height = this.dist * Math.sin(e);
    this.back = this.dist * Math.cos(e);
    // 画面の上端・下端が地面と交わる位置（注視点からのz）
    this.zTop = this.back - this.height / Math.tan(e - halfV);
    this.zBot = this.back - this.height / Math.tan(e + halfV);
    this.halfW = (2 * this.dist * Math.tan(halfV) * aspect) / 2;
  }

  /**
   * @param {number} dt
   * @param {{tx:number,tz:number,bx:number,bz:number,by:number,snap?:boolean}} f 追う目標と、必ず画面に入れるボール位置
   * @param {THREE.PerspectiveCamera} cam
   */
  update(dt, f, cam) {
    if (f.snap || !this.ready) {
      this.fx = f.tx;
      this.fz = f.tz;
      this.sx.v = 0;
      this.sz.v = 0;
      this.ready = true;
    } else {
      this.fx = smoothDamp(this.fx, f.tx, this.sx, 0.45, dt);
      this.fz = smoothDamp(this.fz, f.tz, this.sz, 0.65, dt);
    }
    // ボールは必ず画面の内側に（浮き球は高さの分だけ上に映る）
    const bz = f.bz - f.by / Math.tan(this.elev);
    const kx = this.halfW * 0.7;
    this.fx = Math.min(Math.max(this.fx, f.bx - kx), f.bx + kx);
    this.fz = Math.min(Math.max(this.fz, bz - this.zBot * 0.62), bz - this.zTop * 0.8);
    // ピッチの外を映しすぎない
    const maxX = PITCH.HL + 6 - this.halfW;
    this.fx = maxX > 0 ? Math.min(Math.max(this.fx, -maxX), maxX) : 0;
    const lo = -(PITCH.HW + 7) - this.zTop;
    const hi = PITCH.HW + 4.5 - this.zBot;
    this.fz = lo <= hi ? Math.min(Math.max(this.fz, lo), hi) : (lo + hi) / 2;
    this.pose(this.fx, this.fz, cam);
  }

  /** 注視点(x,z)のときのカメラ姿勢。ゴール前では少しだけゴール側へ振る */
  pose(x, z, cam) {
    cam.position.set(x * 0.84, this.height, z + this.back);
    cam.lookAt(x, 0, z);
    cam.fov = this.fov;
    cam.updateProjectionMatrix();
    return cam;
  }
}

const _ndc = new THREE.Vector3();
const _org = new THREE.Vector3();
/** 画面の四隅から地面(y=0)へ下ろした点。地面に当たらない方向は maxDist で打ち切る */
export function groundFootprint(cam, maxDist = 120) {
  const out = [];
  cam.updateMatrixWorld();
  _org.setFromMatrixPosition(cam.matrixWorld);
  for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    _ndc.set(x, y, 0.5).unproject(cam).sub(_org).normalize();
    let t = _ndc.y < -1e-3 ? -_org.y / _ndc.y : maxDist;
    t = Math.min(t, maxDist);
    out.push({ x: _org.x + _ndc.x * t, z: _org.z + _ndc.z * t });
  }
  return out;
}
