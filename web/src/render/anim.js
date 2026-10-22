// 手続き的アニメーション: 状態（走る・蹴る・スライディング・ダイブ等）から関節角を求める
// 角度はラジアン。swing は前方向が正、abd は体の外側へ開く方向が正。

import { clamp, lerp, smoothstep } from '../util/math.js';

export const POSE_KEYS = [
  'rootY', 'bodyPitch', 'bodyRoll', 'bodyYaw', 'bodyFwd', 'bodySide',
  'pelvisPitch', 'pelvisRoll', 'pelvisYaw',
  'spinePitch', 'spineRoll', 'spineYaw',
  'neckPitch', 'neckYaw',
  'lShSwing', 'lShAbd', 'lShTwist', 'lElbow',
  'rShSwing', 'rShAbd', 'rShTwist', 'rElbow',
  'lHipSwing', 'lHipAbd', 'lKnee', 'lAnkle',
  'rHipSwing', 'rHipAbd', 'rKnee', 'rAnkle',
  'groundLock',
];

export function makePose() {
  const p = {};
  for (const k of POSE_KEYS) p[k] = 0;
  p.groundLock = 1;
  return p;
}

export function resetPose(p) {
  for (const k of POSE_KEYS) p[k] = 0;
  p.groundLock = 1;
  return p;
}

export function blendPose(out, a, b, t) {
  for (const k of POSE_KEYS) out[k] = a[k] + (b[k] - a[k]) * t;
  return out;
}

/** 腕を自然に下ろした基本姿勢 */
function base(p) {
  resetPose(p);
  p.lShAbd = 0.12;
  p.rShAbd = 0.12;
  p.lElbow = 0.25;
  p.rElbow = 0.25;
  p.lKnee = 0.05;
  p.rKnee = 0.05;
  return p;
}

/** 立ち/歩き/走り（速度と歩行位相から） */
export function locomotion(p, speed, phase, time, opts = {}) {
  base(p);
  const run = smoothstep(1.8, 4.5, speed);
  const sprint = smoothstep(6.5, 8.5, speed);
  const moving = smoothstep(0.15, 0.8, speed);
  const ph = phase * Math.PI * 2;
  const sL = Math.sin(ph);
  const sR = Math.sin(ph + Math.PI);
  const cL = Math.cos(ph);
  const cR = Math.cos(ph + Math.PI);

  // 待機時の呼吸と重心移動
  const idle = 1 - moving;
  const breathe = Math.sin(time * 1.7 + (opts.seed || 0)) * 0.015;
  p.spinePitch = 0.03 + breathe * idle;
  p.lShAbd += idle * 0.05;
  p.rShAbd += idle * 0.05;

  const hipAmp = lerp(0.42, 0.78 + sprint * 0.18, run) * moving;
  p.lHipSwing = sL * hipAmp + run * 0.12 * moving;
  p.rHipSwing = sR * hipAmp + run * 0.12 * moving;
  // 遊脚で膝を大きく曲げる（前に振り出す局面 = cos>0）
  const kneeSwing = lerp(0.6, 1.55 + sprint * 0.35, run) * moving;
  const kneeStance = lerp(0.08, 0.32, run) * moving;
  p.lKnee = 0.05 + kneeStance + kneeSwing * Math.pow(Math.max(0, cL * 0.8 + sL * 0.3), 1.4);
  p.rKnee = 0.05 + kneeStance + kneeSwing * Math.pow(Math.max(0, cR * 0.8 + sR * 0.3), 1.4);
  p.lAnkle = (-0.2 * cL - 0.1) * moving * run;
  p.rAnkle = (-0.2 * cR - 0.1) * moving * run;

  // 腕振り（脚と逆位相）
  const armAmp = lerp(0.35, 0.75 + sprint * 0.2, run) * moving;
  p.lShSwing = -sL * armAmp * (opts.carry ? 0.3 : 1);
  p.rShSwing = -sR * armAmp * (opts.carry ? 0.3 : 1);
  p.lElbow = lerp(0.3, 1.35, run * moving) + Math.max(0, -sL) * 0.25 * run;
  p.rElbow = lerp(0.3, 1.35, run * moving) + Math.max(0, -sR) * 0.25 * run;
  p.lShAbd = lerp(p.lShAbd, 0.18, run);
  p.rShAbd = lerp(p.rShAbd, 0.18, run);

  // 体の上下動と前傾
  p.rootY = -Math.abs(Math.cos(ph)) * 0.05 * run * moving + 0.025 * run * moving - lerp(0, 0.04, run) * moving;
  p.bodyPitch = (0.05 + 0.13 * run + 0.08 * sprint) * moving + (opts.accel || 0) * 0.04;
  p.pelvisYaw = sL * 0.12 * moving;
  p.spineYaw = -sL * 0.18 * moving;
  p.spineRoll = 0;
  p.neckPitch = -p.bodyPitch * 0.6;
  // 旋回中は内側へ傾ける
  p.bodyRoll = clamp(opts.turnLean || 0, -0.35, 0.35);
  return p;
}

/** GKの構え */
export function keeperReady(p, time, crouch = 1, seed = 0) {
  base(p);
  const b = Math.sin(time * 4 + seed) * 0.01;
  p.rootY = -0.14 * crouch + b;
  p.bodyPitch = 0.28 * crouch;
  p.lHipSwing = 0.45 * crouch;
  p.rHipSwing = 0.45 * crouch;
  p.lHipAbd = 0.18;
  p.rHipAbd = 0.18;
  p.lKnee = 0.75 * crouch;
  p.rKnee = 0.75 * crouch;
  p.lAnkle = -0.25 * crouch;
  p.rAnkle = -0.25 * crouch;
  p.lShSwing = 0.55 * crouch;
  p.rShSwing = 0.55 * crouch;
  p.lShAbd = 0.45;
  p.rShAbd = 0.45;
  p.lElbow = 0.7;
  p.rElbow = 0.7;
  p.neckPitch = -0.3 * crouch;
  return p;
}

/** キック。t=0..1, foot=+1(右足)/-1(左足), kind: 'pass'|'shot'|'lob'|'cross' */
export function kick(p, t, foot, kind) {
  base(p);
  const power = kind === 'shot' ? 1 : kind === 'pass' ? 0.6 : 0.85;
  // キーフレーム: 0 構え → 0.35 引き → 0.5 インパクト → 0.75 フォロー → 1 戻り
  const k = (a, b, c, d, e) => {
    if (t < 0.35) return lerp(a, b, smoothstep(0, 0.35, t));
    if (t < 0.5) return lerp(b, c, (t - 0.35) / 0.15);
    if (t < 0.75) return lerp(c, d, smoothstep(0.5, 0.75, t));
    return lerp(d, e, smoothstep(0.75, 1, t));
  };
  const swing = k(0.1, -0.75 * power, 0.55 * power, (kind === 'lob' ? 1.5 : 1.15) * power, 0.15);
  const knee = k(0.2, 1.6 * power, 0.25, 0.3, 0.15);
  const plantKnee = k(0.15, 0.45, 0.4, 0.35, 0.1);
  const lean = kind === 'lob' || kind === 'cross' ? -0.12 : 0.12;
  const kickSide = foot > 0 ? 'r' : 'l';
  const plantSide = foot > 0 ? 'l' : 'r';
  p[`${kickSide}HipSwing`] = swing;
  p[`${kickSide}Knee`] = knee;
  p[`${kickSide}Ankle`] = k(0, 0.3, 0.45, 0.2, 0);
  p[`${plantSide}HipSwing`] = k(0.1, 0.25, 0.1, -0.1, 0);
  p[`${plantSide}Knee`] = plantKnee;
  // 腕でバランス（キック脚と反対の腕を広げる）
  const armOpp = foot > 0 ? 'l' : 'r';
  const armSame = foot > 0 ? 'r' : 'l';
  p[`${armOpp}ShAbd`] = k(0.2, 1.1, 1.25, 0.9, 0.2);
  p[`${armOpp}ShSwing`] = k(0, 0.4, 0.2, -0.2, 0);
  p[`${armSame}ShSwing`] = k(0, -0.5, 0.4, 0.6, 0);
  p[`${armSame}ShAbd`] = k(0.15, 0.5, 0.4, 0.3, 0.15);
  p.lElbow = 0.6;
  p.rElbow = 0.6;
  p.bodyPitch = k(0.05, lean - 0.05, lean + 0.05, lean, 0.05);
  p.spineYaw = k(0, 0.35 * foot, -0.25 * foot, -0.35 * foot, 0);
  p.bodyRoll = k(0, -0.12 * foot, -0.08 * foot, 0, 0);
  p.rootY = k(0, -0.06, -0.08, -0.03, 0);
  p.neckPitch = 0.25;
  return p;
}

/** スライディングタックル t=0..1 */
export function slide(p, t) {
  base(p);
  const down = smoothstep(0, 0.18, t) * (1 - smoothstep(0.72, 1, t));
  p.rootY = -0.62 * down;
  p.bodyPitch = -1.05 * down;
  p.bodyRoll = 0.35 * down;
  p.rHipSwing = lerp(0, 1.55, down);
  p.rKnee = lerp(0.1, 0.05, down);
  p.lHipSwing = lerp(0, 0.75, down);
  p.lKnee = lerp(0.1, 1.9, down);
  p.lHipAbd = 0.25 * down;
  p.lShSwing = -0.9 * down;
  p.rShSwing = -0.4 * down;
  p.lShAbd = 0.6 * down;
  p.rShAbd = 0.9 * down;
  p.lElbow = 0.3;
  p.rElbow = 0.5;
  p.neckPitch = 0.8 * down;
  p.groundLock = 0;
  return p;
}

/** GKダイブ t=0..1, dir=+1(左へ)/-1(右へ), height 0..1 */
export function dive(p, t, dir, height) {
  base(p);
  const air = smoothstep(0, 0.25, t);
  const land = smoothstep(0.45, 0.65, t);
  p.groundLock = 0;
  // 体ごと横に倒れる
  p.bodyRoll = dir * lerp(0, 1.45 - height * 0.25, air);
  p.bodySide = dir * (air * 1.2 + land * 0.3);
  p.rootY = lerp(0, 0.1 + height * 0.5, air) * (1 - land) + land * -0.72;
  p.bodyPitch = 0.1;
  // 両腕を伸ばす
  const reach = smoothstep(0.05, 0.3, t);
  p.lShSwing = 0.3 * reach;
  p.rShSwing = 0.3 * reach;
  const up = dir > 0 ? 'l' : 'r';
  const dn = dir > 0 ? 'r' : 'l';
  p[`${up}ShAbd`] = lerp(0.1, 2.9, reach);
  p[`${dn}ShAbd`] = lerp(0.1, 2.5, reach);
  p.lElbow = 0.15;
  p.rElbow = 0.15;
  p[`${up}HipAbd`] = 0.25 * air;
  p[`${dn}HipAbd`] = -0.05 * air;
  p.lKnee = 0.25 + 0.4 * land;
  p.rKnee = 0.2 + 0.5 * land;
  p.lHipSwing = 0.2 * air;
  p.rHipSwing = 0.35 * air;
  p.neckYaw = 0;
  p.neckPitch = 0;
  return p;
}

/** 倒れる/横たわる/起き上がる t=0..1 (0.0-0.25 倒れる, 0.25-0.75 寝ている, 0.75-1 起き上がる) */
export function fall(p, t) {
  base(p);
  p.groundLock = 0;
  const down = smoothstep(0, 0.22, t) * (1 - smoothstep(0.78, 1, t));
  p.bodyPitch = lerp(0, 1.42, down);
  p.rootY = lerp(0, -0.8, down);
  p.bodyFwd = 0.6 * down;
  p.lShSwing = lerp(0, 2.4, down);
  p.rShSwing = lerp(0, 2.2, down);
  p.lShAbd = 0.4 * down;
  p.rShAbd = 0.5 * down;
  p.lElbow = 0.6 * down;
  p.rElbow = 0.9 * down;
  p.lKnee = 0.3 * down;
  p.rKnee = 0.7 * down;
  p.neckPitch = -0.6 * down;
  return p;
}

/** ジャンプ（ヘディング）t=0..1, h: 跳躍高さ */
export function header(p, t, h) {
  base(p);
  p.groundLock = 0;
  const air = Math.sin(clamp(t, 0, 1) * Math.PI);
  p.rootY = air * h;
  const snap = smoothstep(0.35, 0.55, t);
  p.bodyPitch = lerp(-0.25, 0.3, snap) * air;
  p.neckPitch = lerp(-0.4, 0.35, snap) * air;
  p.lShAbd = 0.9 * air;
  p.rShAbd = 0.9 * air;
  p.lShSwing = 0.5 * air;
  p.rShSwing = 0.5 * air;
  p.lElbow = 1.1;
  p.rElbow = 1.1;
  p.lHipSwing = 0.15 * air;
  p.rHipSwing = -0.1 * air;
  p.lKnee = 0.9 * air;
  p.rKnee = 0.6 * air;
  return p;
}

/** ゴールセレブレーション kind: 0=飛行機, 1=ニースライド, 2=ガッツポーズジャンプ, 3=両手を挙げて走る */
export function celebrate(p, kind, t, speed, phase, time) {
  if (kind === 1 && t > 0.2) {
    base(p);
    const k = smoothstep(0.2, 0.35, t);
    p.groundLock = 0;
    p.rootY = -0.5 * k;
    p.lHipSwing = -0.1 * k;
    p.rHipSwing = -0.1 * k;
    p.lKnee = 1.75 * k;
    p.rKnee = 1.75 * k;
    p.lAnkle = 0.6 * k;
    p.rAnkle = 0.6 * k;
    p.bodyPitch = -0.45 * k;
    p.neckPitch = -0.5 * k;
    p.lShAbd = 2.4 * k;
    p.rShAbd = 2.4 * k;
    p.lElbow = 0.3;
    p.rElbow = 0.3;
    p.lShSwing = 0.3 * k;
    p.rShSwing = 0.3 * k;
    return p;
  }
  locomotion(p, speed, phase, time);
  if (kind === 0) {
    p.lShAbd = 1.45;
    p.rShAbd = 1.45;
    p.lShSwing = 0.1;
    p.rShSwing = 0.1;
    p.lElbow = 0.1;
    p.rElbow = 0.1;
    p.bodyRoll = Math.sin(time * 2.5) * 0.3;
  } else if (kind === 2) {
    const j = Math.max(0, Math.sin(time * 7));
    p.rootY += j * 0.25;
    p.groundLock = 0;
    p.rShSwing = 0.4;
    p.rShAbd = 2.7;
    p.rElbow = 0.4 + j * 0.6;
    p.lShAbd = 0.6;
    p.lElbow = 1.6;
    p.lShSwing = 0.9;
  } else {
    p.lShAbd = 2.6;
    p.rShAbd = 2.6;
    p.lShSwing = 0.4;
    p.rShSwing = 0.4;
    p.lElbow = 0.3 + Math.sin(time * 9) * 0.2;
    p.rElbow = 0.3 + Math.cos(time * 9) * 0.2;
  }
  return p;
}

/** 失点後などの落胆（頭に手） */
export function dejected(p, time, seed = 0) {
  base(p);
  p.bodyPitch = 0.12;
  p.neckPitch = 0.45;
  p.lShAbd = 1.2;
  p.rShAbd = 1.2;
  p.lShSwing = 1.4;
  p.rShSwing = 1.4;
  p.lElbow = 2.3;
  p.rElbow = 2.3;
  p.spineYaw = Math.sin(time * 0.6 + seed) * 0.15;
  return p;
}

/** 膝に手をついて休む */
export function tired(p, time, seed = 0) {
  base(p);
  p.bodyPitch = 0.75;
  p.rootY = -0.1;
  p.lHipSwing = 0.5;
  p.rHipSwing = 0.5;
  p.lKnee = 0.45;
  p.rKnee = 0.45;
  p.lShSwing = 0.95;
  p.rShSwing = 0.95;
  p.lElbow = 0.2;
  p.rElbow = 0.2;
  p.neckPitch = -0.5 + Math.sin(time * 2.2 + seed) * 0.04;
  return p;
}

/** スローイン / GKのスロー（ボールを頭上に） t=0..1 */
export function throwBall(p, t, overhead = true) {
  base(p);
  if (overhead) {
    const back = smoothstep(0, 0.5, t) * (1 - smoothstep(0.55, 0.75, t));
    const fwd = smoothstep(0.55, 0.75, t);
    p.lShSwing = lerp(2.9, 3.3, back) - fwd * 1.6;
    p.rShSwing = p.lShSwing;
    p.lShAbd = 0.25;
    p.rShAbd = 0.25;
    p.lElbow = lerp(0.6, 1.5, back) * (1 - fwd);
    p.rElbow = p.lElbow;
    p.bodyPitch = -0.25 * back + 0.25 * fwd;
    p.lHipSwing = 0.3;
    p.rHipSwing = -0.2;
    p.lKnee = 0.2;
  } else {
    // 下手投げ（GK）
    const w = smoothstep(0, 0.45, t);
    const r = smoothstep(0.45, 0.7, t);
    p.rShSwing = lerp(0.3, -1.2, w) + r * 2.4;
    p.rElbow = 0.2;
    p.lShSwing = 0.6;
    p.lShAbd = 0.6;
    p.bodyPitch = 0.3;
    p.rootY = -0.1;
    p.lHipSwing = 0.6;
    p.lKnee = 0.6;
    p.rKnee = 0.3;
  }
  return p;
}

/** ボールを胸に抱える（GKキャッチ後） */
export function holdBall(p, time) {
  base(p);
  p.lShSwing = 0.75;
  p.rShSwing = 0.75;
  p.lShAbd = 0.15;
  p.rShAbd = 0.15;
  p.lElbow = 1.7;
  p.rElbow = 1.7;
  p.lShTwist = -0.3;
  p.rShTwist = 0.3;
  p.spinePitch = 0.05 + Math.sin(time * 1.5) * 0.01;
  return p;
}

/** 副審のフラッグアップ */
export function flagUp(p, side = 1) {
  base(p);
  const s = side > 0 ? 'r' : 'l';
  p[`${s}ShSwing`] = 0.2;
  p[`${s}ShAbd`] = 2.9;
  p[`${s}Elbow`] = 0.05;
  return p;
}

/** 主審が手を伸ばして方向を示す / ファウルの笛 */
export function pointArm(p, side = 1, up = 0) {
  base(p);
  const s = side > 0 ? 'r' : 'l';
  p[`${s}ShSwing`] = 0.5 + up * 1.8;
  p[`${s}ShAbd`] = 1.2 - up * 0.6;
  p[`${s}Elbow`] = 0.05;
  return p;
}

/** ベンチに座る */
export function seated(p, time, seed = 0) {
  base(p);
  p.groundLock = 0;
  p.rootY = -0.46;
  p.bodyPitch = -0.05 + Math.sin(time * 0.7 + seed) * 0.03;
  p.lHipSwing = 1.5;
  p.rHipSwing = 1.5;
  p.lKnee = 1.55;
  p.rKnee = 1.55;
  p.lHipAbd = 0.12;
  p.rHipAbd = 0.12;
  p.lShSwing = 0.5;
  p.rShSwing = 0.5;
  p.lElbow = 0.9;
  p.rElbow = 0.9;
  p.neckYaw = Math.sin(time * 0.4 + seed * 2) * 0.4;
  return p;
}

/** 監督: 腕組み / 指示を出す */
export function coach(p, time, seed = 0, shout = 0) {
  base(p);
  const k = Math.sin(time * 0.5 + seed);
  if (shout > 0.5) {
    p.rShSwing = 1.2 + Math.sin(time * 6) * 0.2;
    p.rShAbd = 0.5;
    p.rElbow = 0.3;
    p.lShAbd = 0.4;
  } else {
    p.lShSwing = 0.9;
    p.rShSwing = 0.9;
    p.lShTwist = -0.8;
    p.rShTwist = 0.8;
    p.lElbow = 1.9;
    p.rElbow = 1.9;
  }
  p.neckYaw = k * 0.3;
  p.bodyPitch = 0.04;
  return p;
}

/** 整列（入場時）: 手を後ろで組む */
export function lineupStand(p, time, seed = 0) {
  base(p);
  p.lShSwing = -0.25;
  p.rShSwing = -0.25;
  p.lShAbd = 0.08;
  p.rShAbd = 0.08;
  p.lElbow = 0.5;
  p.rElbow = 0.5;
  p.spinePitch = Math.sin(time * 1.3 + seed) * 0.01;
  p.neckYaw = Math.sin(time * 0.3 + seed * 3) * 0.12;
  return p;
}
