// プレイヤー: 移動・ロール(弾反射)・照準・ロックオン・ビート同期ミサイル・フロー/オーバードライブ
import { G, vib } from './state.js';
import { M } from './models.js';
import { clamp, lerp, damp, easeInOut, TAU, rand, PI } from './util.js';
import { explosion, burst, ring, popup, spark } from './fx.js';
import { targets, damage, COL } from './enemies.js';

export const XL = 15, YL = 8.5;
const ROLL_T = 0.5, ROLL_CD = 0.9;
const _a = [0, 0, 0], _p = [0, 0, 0];

export function resetPlayer(keepScore) {
  G.px = 0; G.py = 0; G.pvx = 0; G.pvy = 0;
  G.shield = 100; G.flow = 0; G.od = 0; G.flowIdle = 0; G.flowReady = false;
  G.rollT = 0; G.rollDir = 0; G.rollCd = 0; G.rollAngle = 0; G.invuln = 1.5; G.hits = 0; G.dead = false; G.deadT = 0;
  G.locks.length = 0; G.volley.length = 0; G.locking = false; G.lockCd = 0; G.laserT = 0; G.vstep = 0; G.vcount = 0;
  G.lasers.length = 0; G.missiles.length = 0; G.tapBurst = 0;
  G.chain = 0; G.chainT = 0; G.trauma = 0; G.glitch = 0; G.slowT = 0;
  G.ts = 1; G.tsTarget = 1;
  G.ret.x = 0; G.ret.y = 0; G.ret.dx = 0; G.ret.dy = 0;
  if (!keepScore) { G.score = 0; G.kills = 0; G.maxChain = 0; G.dmgTaken = 0; G.shotsFired = 0; G.grazes = 0; G.reflects = 0; }
}

export function addFlow(n) {
  G.flowIdle = 0;
  if (G.od > 0) { G.od = Math.min(G.odMax + 3, G.od + n * 0.035); return; }
  const was = G.flow;
  G.flow = Math.min(100, G.flow + n);
  if (was < 100 && G.flow >= 100) {
    G.flowReady = true;
    G.audio.pickup();
    popup(G.px, G.py + 4, 24, 'FLOW READY', COL.cyan, 0.07, 1.6);
    vib(40);
  }
}
G.addFlow = addFlow;

export function hurt(dmg, x, y, z) {
  if (G.dead || G.rollT > 0 || G.invuln > 0) return;
  const m = G.diff === 0 ? 0.9 : G.diff === 2 ? 1.8 : 1.45; // 被ダメージ倍率
  G.shield -= dmg * m; G.dmgTaken += dmg * m; G.invuln = 0.9; G.chain = 0; G.chainT = 0;
  if (G.od <= 0) G.flow = Math.max(0, G.flow - 14);
  G.flowReady = G.flow >= 100;
  G.trauma = Math.min(1, G.trauma + 0.65);
  G.flash[0] = 1; G.flash[1] = 0.08; G.flash[2] = 0.04; G.flash[3] = 0.4;
  G.glitch = 1;
  G.audio.hit(); vib(100);
  for (let i = 0; i < 14; i++) spark(G.px + rand(-2, 2), G.py + rand(-2, 2), rand(2, 8), rand(-30, 30), rand(-30, 30), rand(-10, 30), 0.5, 1, 0.3, 0.1, 0.05);
  if (G.shield <= 0) {
    G.shield = 0; G.dead = true; G.deadT = 0; G.locking = false; G.locks.length = 0;
    explosion(G.px, G.py, 10, 2.5, COL.red);
    G.flash[3] = 0.9; G.flash[0] = 1; G.flash[1] = 0.3; G.flash[2] = 0.2;
    G.tsTarget = 0.3; vib(300);
  }
}
G.hurt = hurt;

export function graze(b) {
  G.grazes = (G.grazes || 0) + 1;
  addFlow(G.od > 0 ? 14 : 6);
  G.score += 25;
  G.audio.graze();
  if (G.rollT <= 0) popup(b.x, b.y + 1.2, Math.max(b.z, 6), 'GRAZE', COL.cyan, 0.04, 0.6);
}
G.graze = graze;

export function activateOverdrive() {
  if (G.od > 0 || G.flow < 100 || G.dead) return false;
  G.od = G.odMax; G.flowReady = false;
  G.tsTarget = 0.42;
  G.audio.overdrive(true);
  G.audio.setTimeScale(0.72);
  G.flash[0] = 0.1; G.flash[1] = 0.8; G.flash[2] = 1; G.flash[3] = 0.5;
  G.trauma = Math.min(1, G.trauma + 0.4);
  G.banner = { text: 'OVERDRIVE', sub: 'TIME SLIP', t: 0, dur: 1.4, col: COL.cyan };
  vib(60);
  return true;
}

// 画面座標から指定深度のレール空間座標を求める
export function aimPoint(hx, hy, depth, out) {
  const g = G.gfx, m = g.m;
  const vx = hx * depth * g.tanH - g.bendX * depth * depth, vy = hy * depth * g.tanH - g.bendY * depth * depth, vz = depth;
  out[0] = g.cam.x + m[0] * vx + m[3] * vy + m[6] * vz;
  out[1] = g.cam.y + m[1] * vx + m[4] * vy + m[7] * vz;
  out[2] = g.cam.z + m[2] * vx + m[5] * vy + m[8] * vz;
  return out;
}

// ---------- 移動・照準 (カメラ更新前) ----------
export function updatePlayerMove(dt, wdt, ctrl) {
  const asp = G.gfx.aspect;
  if (G.dead) { G.pvx *= 0.98; G.pvy *= 0.98; }
  else {
    // 移動
    const maxV = 27;
    G.pvx = damp(G.pvx, ctrl.moveX * maxV, 8.5, dt);
    G.pvy = damp(G.pvy, ctrl.moveY * maxV * 0.78, 8.5, dt);
    // ロール
    if (G.rollCd > 0) G.rollCd -= dt;
    if (ctrl.roll && G.rollCd <= 0 && G.rollT <= 0) {
      G.rollT = ROLL_T; G.rollCd = ROLL_CD; G.rollDir = ctrl.roll;
      G.pvx += ctrl.roll * 36;
      G.audio.roll();
      G.invuln = Math.max(G.invuln, 0);
      vib(12);
    }
  }
  if (G.rollT > 0) {
    G.rollT -= dt;
    const u = 1 - Math.max(0, G.rollT) / ROLL_T;
    G.rollAngle = G.rollDir * TAU * easeInOut(u);
    if (G.rollT <= 0) { G.rollT = 0; G.rollAngle = 0; G.invuln = Math.max(G.invuln, 0.18); }
  }
  if (G.invuln > 0) G.invuln -= dt;
  G.px += G.pvx * dt; G.py += G.pvy * dt;
  // ソフト境界
  if (Math.abs(G.px) > XL) { G.px = lerp(G.px, Math.sign(G.px) * XL, 1 - Math.exp(-18 * dt)); if (G.px * G.pvx > 0) G.pvx *= 0.8; }
  if (Math.abs(G.py) > YL) { G.py = lerp(G.py, Math.sign(G.py) * YL, 1 - Math.exp(-18 * dt)); if (G.py * G.pvy > 0) G.pvy *= 0.8; }

  // 照準
  const R = G.ret;
  const bx = asp * 0.8, by = 0.8;
  if (ctrl.aimAbs) { R.x = clamp(ctrl.aimAbs[0], -bx, bx); R.y = clamp(ctrl.aimAbs[1], -by, by); }
  else { R.x = clamp(R.x + ctrl.aimDX, -bx, bx); R.y = clamp(R.y + ctrl.aimDY, -by, by); }
  const old = R.dx;
  R.dx = damp(R.dx, R.x, 30, dt); R.dy = damp(R.dy, R.y, 30, dt);
  R.vx = (R.dx - old) / Math.max(dt, 1e-4);

  // フロー: 時間減衰
  if (G.od > 0) {
    G.od -= dt;
    G.flow = clamp(G.od / G.odMax * 100, 0, 100);
    if (G.od <= 0) { G.od = 0; G.flow = 0; G.tsTarget = 1; G.audio.overdrive(false); G.audio.setTimeScale(1); G.banner = null; }
  } else {
    G.flowIdle += dt;
    if (G.flowIdle > 3.5 && G.flow < 100) G.flow = Math.max(0, G.flow - 2.2 * dt);
    if (ctrl.flow) activateOverdrive();
  }
  G.chainT -= wdt;
  if (G.chainT <= 0) G.chain = 0;
}

// ---------- 武器 (カメラ更新後) ----------
export function updateWeapons(dt, wdt, ctrl) {
  const g = G.gfx, asp = g.aspect;
  const dead = G.dead;
  const od = G.od > 0;
  const maxLocks = od ? 16 : 8;
  const R = G.ret;
  if (G.lockCd > 0) G.lockCd -= dt;

  // --- ロックオン ---
  const wantLock = ctrl.fire && !dead && G.lockCd <= 0 && G.state === 'play';
  if (wantLock) {
    if (!G.locking) { G.locking = true; G.lockStart = G.time; }
    const lockR = od ? 0.17 : 0.13;
    for (let i = 0; i < targets.length && G.locks.length < maxLocks; i++) {
      const tg = targets[i];
      if (!tg.alive || tg.armored || tg.z < 6 || tg.z > 340) continue;
      if (!g.project(tg.x, tg.y, tg.z, _p)) continue;
      if (Math.abs(_p[0]) > asp * 0.99 || Math.abs(_p[1]) > 0.99) continue;
      const rad = tg.r / (tg.z * g.tanH);
      const d = Math.hypot(_p[0] - R.dx, _p[1] - R.dy);
      if (d > lockR + rad) continue;
      let ex = null, cnt = 0;
      for (const l of G.locks) if (l.tg === tg) { cnt++; ex = l; }
      if (!ex) {
        G.locks.push({ tg, t: 0, n: 1, addT: G.time });
        G.audio.lockNote(G.locks.length - 1);
        if (tg.isBullet) G.flash[1] = Math.max(G.flash[1], 0.05);
      } else if ((tg.maxhp >= 8) && cnt < 5 && G.time - ex.addT > 0.26) {
        ex.addT = G.time; ex.n++;
        G.locks.push({ tg, t: 0, n: 0, dup: true });
        G.audio.lockNote(G.locks.length - 1);
      }
    }
  } else if (G.locking) {
    G.locking = false;
    if (G.locks.length > 0 && !dead) {
      G.volley = G.locks.slice(); G.vcount = 0; G.vstep = 0;
      G.volleyBonus = G.volley.length;
      G.lockCd = 0.3;
      // ビートに合わせてリリース → ON BEAT ボーナス (威力1.5倍 + FLOW)
      const perfect = G.audio.beatOffset() < 0.08 && G.volley.length >= 2;
      if (perfect) {
        for (const l of G.volley) l.perfect = true;
        aimPoint(R.dx, R.dy, 34, _a);
        popup(_a[0], _a[1] + 2, _a[2], 'ON BEAT', COL.pink, 0.07, 1.0);
        addFlow(4 + G.volley.length);
        G.audio.perfect();
        G.flash[0] = Math.max(G.flash[0], 1); G.flash[1] = Math.max(G.flash[1], 0.3); G.flash[2] = Math.max(G.flash[2], 0.7); G.flash[3] = Math.max(G.flash[3], 0.06);
        G.perfects = (G.perfects || 0) + 1;
        vib(25);
      } else if (G.volley.length >= 4) { aimPoint(R.dx, R.dy, 34, _a); popup(_a[0], _a[1] + 2, _a[2], 'x' + G.volley.length, COL.amber, 0.06, 0.8); }
    }
    G.locks.length = 0;
  }
  // 無効なロックを除去
  for (let i = G.locks.length - 1; i >= 0; i--) {
    const l = G.locks[i];
    l.t += dt;
    if (!l.tg.alive || l.tg.z < 3) G.locks.splice(i, 1);
  }

  // --- ビート同期ミサイル発射 ---
  if (G.volley.length) {
    let steps = G.audio.running ? G.audio.pollSteps() : 0;
    if (!G.audio.running) { G.vstep += dt; while (G.vstep > 0.11) { G.vstep -= 0.11; steps++; } }
    const per = od ? Math.ceil(G.volley.length / 5) : G.volley.length > 8 ? 2 : 1;
    for (let s = 0; s < steps && G.volley.length; s++) {
      for (let k = 0; k < per && G.volley.length; k++) {
        const l = G.volley.shift();
        if (l.tg.alive) launchMissile(l.tg, G.vcount++, l.perfect);
      }
    }
  } else if (G.audio.running) G.audio.pollSteps();

  // --- レーザー: 長押し中でロックが無い間はストリーム、タップで3連射 ---
  G.laserT -= dt;
  const rate = od ? 0.06 : 0.1;
  if (!dead && G.state === 'play') {
    if (ctrl.fireTap) { G.tapBurst = 3; G.laserT = Math.min(G.laserT, 0); }
    if (G.laserT <= 0) {
      if (G.tapBurst > 0) { G.tapBurst--; G.laserT = 0.055; fireLaser(); }
      else if (ctrl.fire && G.locks.length === 0) { G.laserT = rate; fireLaser(); }
    }
  }
  updateLasers(dt);
  updateMissiles(dt);
}

let side = 1;
function fireLaser() {
  const g = G.gfx, R = G.ret;
  side = -side;
  // 自動補正: レティクル近傍の敵があればその深度に合わせる
  let depth = 130, best = 0.22, bt = null;
  for (let i = 0; i < targets.length; i++) {
    const tg = targets[i];
    if (!tg.alive || tg.z < 5 || tg.z > 330 || tg.isBullet) continue;
    if (!g.project(tg.x, tg.y, tg.z, _p)) continue;
    const d = Math.hypot(_p[0] - R.dx, _p[1] - R.dy);
    if (d < best) { best = d; bt = tg; }
  }
  const mx = G.px + side * 2.6, my = G.py - 1.7, mz = 3;
  let ax, ay, az;
  if (bt) { ax = bt.x; ay = bt.y; az = bt.z; }
  else { aimPoint(R.dx, R.dy, depth, _a); ax = _a[0]; ay = _a[1]; az = _a[2]; }
  let dx = ax - mx, dy = ay - my, dz = az - mz;
  const l = Math.hypot(dx, dy, dz) || 1;
  const sp = 320;
  G.lasers.push({ x: mx, y: my, z: mz, vx: dx / l * sp, vy: dy / l * sp, vz: dz / l * sp, t: 0 });
  G.shotsFired++;
  G.muzzle[side > 0 ? 1 : 0] = 1;
  G.audio.laser(side * 0.3);
}

function updateLasers(dt) {
  const od = G.od > 0 ? 1.5 : 1;
  for (let i = G.lasers.length - 1; i >= 0; i--) {
    const b = G.lasers[i];
    const px = b.x, py = b.y, pz = b.z;
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.t += dt;
    let hit = false;
    // ターゲットとの交差 (線分-球)
    const sx = b.x - px, sy = b.y - py, sz = b.z - pz;
    const sl = sx * sx + sy * sy + sz * sz || 1e-6;
    for (let k = 0; k < targets.length; k++) {
      const tg = targets[k];
      if (!tg.alive) continue;
      const tx = tg.x - px, ty = tg.y - py, tz = tg.z - pz;
      let u = (tx * sx + ty * sy + tz * sz) / sl; u = u < 0 ? 0 : u > 1 ? 1 : u;
      const cx = px + sx * u - tg.x, cy = py + sy * u - tg.y, cz = pz + sz * u - tg.z;
      const rr = tg.r + 0.7;
      if (cx * cx + cy * cy + cz * cz < rr * rr) {
        hit = true;
        G.hits++;
        const killed = damage(tg, 1 * od, 'laser');
        if (!killed) spark(b.x, b.y, b.z, rand(-10, 10), rand(-10, 10), rand(0, 12), 0.25, 0.4, 1, 1, 0.04);
        break;
      }
    }
    if (!hit) {
      // 敵の小弾を撃ち落とす
      for (let k = 0; k < G.ebul.length; k++) {
        const e = G.ebul[k];
        if (!e.alive || e.friendly || e.lockable) continue;
        const tx = e.x - px, ty = e.y - py, tz = e.z - pz;
        let u = (tx * sx + ty * sy + tz * sz) / sl; u = u < 0 ? 0 : u > 1 ? 1 : u;
        const cx = px + sx * u - e.x, cy = py + sy * u - e.y, cz = pz + sz * u - e.z;
        if (cx * cx + cy * cy + cz * cz < 2.2) {
          e.alive = false; hit = true;
          burst(e.x, e.y, e.z, 5, 14, COL.orange, 0.3);
          G.score += 10;
          break;
        }
      }
    }
    if (hit || b.t > 1.3 || b.z > 480) G.lasers.splice(i, 1);
  }
}

function launchMissile(tg, idx, perfect) {
  if (G.missiles.length > 60) return;
  const s = idx % 2 ? 1 : -1;
  const m = { x: G.px + s * 3, y: G.py - 1.6, z: 3, vx: 0, vy: 0, vz: 0, tg, t: 0, sp: 70, dx: 0, dy: 0, dz: 1, trail: [], idx, mul: perfect ? 1.5 : 1, perfect };
  // 外へ弧を描くよう初期方向を散らす
  const a = rand(0, TAU);
  const spread = 0.9 + Math.random() * 0.6;
  let dx = Math.cos(a) * spread + s * 0.5, dy = Math.sin(a) * spread * 0.8 + 0.3, dz = 0.7;
  const l = Math.hypot(dx, dy, dz);
  m.dx = dx / l; m.dy = dy / l; m.dz = dz / l;
  G.missiles.push(m);
  G.audio.missileNote(idx, clamp((m.x - G.px) / 6, -1, 1) * 0.5);
  G.shotsFired++;
  spark(m.x, m.y, m.z, 0, 0, 20, 0.2, 1, 0.7, 0.3, 0.05);
}

function updateMissiles(dt) {
  const od = G.od > 0 ? 1.5 : 1;
  for (let i = G.missiles.length - 1; i >= 0; i--) {
    const m = G.missiles[i];
    m.t += dt;
    // 追尾対象
    if (!m.tg.alive) {
      let best = null, bd = 1e9;
      for (const tg of targets) {
        if (!tg.alive || tg.armored) continue;
        const d = Math.hypot(tg.x - m.x, tg.y - m.y, tg.z - m.z);
        if (d < bd && tg.z > m.z - 8) { bd = d; best = tg; }
      }
      m.tg = best || m.tg;
    }
    const tg = m.tg;
    if (tg.alive) {
      const tx = tg.x - m.x, ty = tg.y - m.y, tz = tg.z - m.z;
      const l = Math.hypot(tx, ty, tz) || 1;
      const k = Math.min(1, (3.2 + m.t * 14) * dt);
      m.dx = lerp(m.dx, tx / l, k); m.dy = lerp(m.dy, ty / l, k); m.dz = lerp(m.dz, tz / l, k);
      const dl = Math.hypot(m.dx, m.dy, m.dz) || 1; m.dx /= dl; m.dy /= dl; m.dz /= dl;
      m.sp = Math.min(260, 70 + m.t * 330);
      if (l < tg.r + 1.4) {
        // 命中
        const killed = damage(tg, 3 * od * m.mul, 'missile');
        G.hits++;
        if (!killed) { explosion(m.x, m.y, m.z, 0.45, COL.amber); }
        G.missiles.splice(i, 1);
        continue;
      }
    } else if (m.t > 2.5) { G.missiles.splice(i, 1); continue; }
    m.trail.push(m.x, m.y, m.z);
    if (m.trail.length > 30) m.trail.splice(0, 3);
    m.x += m.dx * m.sp * dt; m.y += m.dy * m.sp * dt; m.z += m.dz * m.sp * dt;
    if (m.t > 4 || m.z > 480) G.missiles.splice(i, 1);
  }
}

// ---------- 描画 (ワールド空間) ----------
export function drawPlayerWorld(g, t) {
  for (const b of G.lasers) {
    const k = 0.045;
    g.line3(b.x, b.y, b.z, b.x - b.vx * k, b.y - b.vy * k, b.z - b.vz * k, 0.35, 1, 1, 2.6);
  }
  for (const m of G.missiles) {
    const yaw = Math.atan2(m.dx, m.dz), pitch = -Math.asin(clamp(m.dy, -1, 1));
    const pc = m.perfect;
    g.mesh(M.missile, m.x, m.y, m.z, yaw, pitch, m.t * 12, pc ? 1.3 : 1, 1, pc ? 0.5 : 0.85, pc ? 0.9 : 0.4, 1.8);
    const tr = m.trail;
    for (let i = 3; i < tr.length; i += 3) {
      const f = i / tr.length;
      g.line3(tr[i - 3], tr[i - 2], tr[i - 1], tr[i], tr[i + 1], tr[i + 2], 1 * f, (m.perfect ? 0.35 : 0.7) * f, (m.perfect ? 0.85 : 0.25) * f, 2.0);
    }
    if (tr.length >= 3) g.line3(tr[tr.length - 3], tr[tr.length - 2], tr[tr.length - 1], m.x, m.y, m.z, 1, 0.8, 0.3, 2.2);
  }
}
