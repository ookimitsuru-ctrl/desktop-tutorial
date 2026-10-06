// 敵・敵弾・ターゲット管理・ダメージ処理
import { G, vib } from './state.js';
import { M, ROCKS_LOW as ROCKS } from './models.js';
import { rand, clamp, lerp, sat, smooth, TAU, PI, sign, pick } from './util.js';
import { explosion, burst, ring, popup, shatter, spark } from './fx.js';

// 難易度: EASY = 旧 NORMAL、NORMAL = 旧 NORMAL と旧 HARD の間、HARD = 旧 HARD より辛く
// fire: 攻撃頻度, spd: 敵の速さ, bspd: 敵弾の速さ, hp: 敵の耐久, n: 編隊の数, dmg: 被ダメージ倍率 (全難易度で旧値の 1.5 倍), inv: 被弾後の無敵時間
export const DIFF = [
  { fire: 1, spd: 1, bspd: 1.15, hp: 1, n: 1, dmg: 1.45 * 1.5, inv: 0.9 },
  { fire: 1.25, spd: 1.1, bspd: 1.35, hp: 1.15, n: 1.12, dmg: 1.65 * 1.5, inv: 0.8 },
  { fire: 1.6, spd: 1.25, bspd: 1.6, hp: 1.4, n: 1.35, dmg: 2.2 * 1.5, inv: 0.65 },
];
export const D = () => DIFF[G.diff];

export const COL = {
  red: [1, 0.22, 0.16], orange: [1, 0.55, 0.12], pink: [1, 0.2, 0.55], amber: [1, 0.78, 0.2], cyan: [0.2, 0.95, 1], white: [1, 1, 1],
  green: [0.3, 1, 0.45], violet: [0.65, 0.35, 1], blue: [0.25, 0.55, 1],
};

const DEF = {
  drone: { mesh: M.drone, r: 3.4, hp: 1, score: 100, col: COL.orange, size: 0.8, w: 1.7, scale: 1.85 },
  fighter: { mesh: M.fighter, r: 4.6, hp: 4, score: 300, col: COL.pink, size: 1.0, w: 1.8, scale: 2.0 },
  mine: { mesh: M.mine, r: 3.8, hp: 2, score: 150, col: COL.amber, size: 0.9, w: 1.7, scale: 1.8 },
  seeker: { mesh: M.seeker, r: 2.8, hp: 1, score: 200, col: COL.red, size: 0.7, w: 1.8, scale: 1.9 },
  turret: { mesh: M.turret, r: 4.4, hp: 6, score: 400, col: COL.orange, size: 1.0, w: 1.8, scale: 1.8 },
  rock: { mesh: null, r: 3, hp: 5, score: 60, col: [0.45, 0.65, 1], size: 0.8, w: 1.5 },
  bomber: { mesh: M.bomber, r: 9, hp: 0, score: 1500, col: COL.red, size: 2.4, w: 2.0, scale: 1.45 },
};

// 種別ごとの拡張 (ボス等)
export const HANDLERS = {};

export function mk(kind, x, y, z, o = {}) {
  const def = DEF[kind] || {};
  const hp = Math.max(1, Math.round((def.hp || 1) * D().hp));
  const e = {
    kind, x, y, z, vx: 0, vy: 0, vz: 0, ox: x, oy: y, zs: z, z0: z, t: 0, hp, maxhp: hp, r: def.r || 2, mesh: def.mesh, col: def.col || COL.orange,
    alive: true, score: def.score || 0, yaw: PI, pitch: 0, roll: 0, spin: 0, parts: null, hitT: 0, fireT: rand(1.0, 2.2), path: 'hover',
    enter: 2.2, life: 99, swA: 5, swF: 1.1, ph: rand(0, TAU), size: def.size || 1, w: def.w || 1.7, lockable: true, isEnemy: true, owner: null,
    scale: def.scale || 1, ...o,
  };
  e.owner = e;
  if (kind === 'rock') { e.mesh = ROCKS[o.m !== undefined ? o.m : (Math.random() * 8) | 0]; e.scale = o.scale || rand(2.4, 4.2); e.r = e.scale * 1.05; e.hp = Math.max(o.hpK ? 1 : 2, Math.round(e.scale * (o.hpK || 1.3))); e.maxhp = e.hp; e.rx = rand(-1, 1); e.ry = rand(-1, 1); e.pitch = rand(0, TAU); e.yaw = rand(0, TAU);
    if (o.comet) { e.hp = e.maxhp = 1; e.col = [1, 0.75, 0.35]; e.w = 2.2; }
    if (o.erratic) { e.col = [0.85, 0.5, 1]; e.w = 1.9; }   // 不規則な岩は紫で見分けられるように
  }
  if (HANDLERS[kind] && HANDLERS[kind].init) HANDLERS[kind].init(e);
  G.enemies.push(e);
  return e;
}

export function addPart(e, ox, oy, oz, hp, r = 1.8, extra = {}) {
  hp = Math.max(1, Math.round(hp * D().hp));
  const p = { isPart: true, owner: e, ox, oy, oz, x: e.x + ox, y: e.y + oy, z: e.z + oz, r, hp, maxhp: hp, alive: true, armored: false, hitT: 0, lockable: true, score: 400, spin: rand(0, TAU), ...extra };
  (e.parts || (e.parts = [])).push(p);
  return p;
}

// ---------- 敵弾 ----------
const BT = {
  bolt: { speed: 54, r: 0.55, hit: 1.9, mesh: M.orb, col: COL.orange, w: 1.8 },
  needle: { speed: 105, r: 0.45, hit: 1.6, mesh: M.needle, col: COL.pink, w: 1.6 },
  plasma: { speed: 30, r: 1.5, hit: 2.9, mesh: M.plasma, col: COL.red, w: 2.0, hp: 3 },
};

export function fireBullet(type, x, y, z, dx, dy, dz, speedMul = 1) {
  if (G.ebul.length > 320) return null;
  const T = BT[type];
  const l = Math.hypot(dx, dy, dz) || 1;
  const sp = T.speed * D().bspd * speedMul;
  const b = { type, x, y, z, vx: dx / l * sp, vy: dy / l * sp, vz: dz / l * sp, r: T.r, hit: T.hit, hp: T.hp || 1, maxhp: T.hp || 1, alive: true, t: 0, friendly: false, grazed: false, isBullet: true, lockable: type === 'plasma', isPart: false, spin: rand(0, TAU), dmg: 1 };
  b.owner = b;
  G.ebul.push(b);
  return b;
}

// プレイヤーへ向けて発射。spread: ラジアン、err: 照準誤差
export function aimShot(e, type, spread = 0, err = 1.5, ox = 0, oy = 0, oz = 0, speedMul = 1) {
  const sx = e.x + ox, sy = e.y + oy, sz = e.z + oz;
  const tx = G.px + rand(-err, err), ty = G.py + rand(-err, err), tz = 0;
  let dx = tx - sx, dy = ty - sy, dz = tz - sz;
  if (spread) {
    const l = Math.hypot(dx, dy, dz);
    dx += rand(-spread, spread) * l; dy += rand(-spread, spread) * l;
  }
  return fireBullet(type, sx, sy, sz, dx, dy, dz, speedMul);
}

// ---------- スポーン ----------
export function spawnBomber(x, y, life = 26) {
  const e = mk('bomber', x, y, 270, { path: 'hover', z0: 100, enter: 3.2, swA: 8, swF: 0.6, life, ox: x, oy: y, score: 1500 });
  addPart(e, -9.5, -0.9, -4.5, 10, 3.6, { score: 700 });
  addPart(e, 9.5, -0.9, -4.5, 10, 3.6, { score: 700 });
  addPart(e, 0, 4.2, 3, 12, 3.8, { score: 900 });
  return e;
}

export function spawn(kind, o = {}) {
  const e = mk(kind, o.x || 0, o.y || 0, o.z !== undefined ? o.z : 260, o);
  return e;
}

// ---------- 敵の移動 ----------
function movePath(e, dt) {
  const px = e.x, py = e.y;
  switch (e.path) {
    case 'hover': {
      const k = 1 - Math.pow(1 - sat(e.t / e.enter), 3);
      let z = lerp(e.zs, e.z0, k);
      let x = e.ox + Math.sin(e.t * e.swF + e.ph) * e.swA * k;
      let y = e.oy + Math.sin(e.t * e.swF * 0.73 + e.ph * 1.3) * e.swA * 0.5 * k;
      if (e.t > e.life) {
        e.leave = (e.leave || 0) + dt;
        const l = e.leave;
        z += l * l * 28; y += l * l * 6; x += sign(e.ox || 1) * l * l * 14;
        if (z > 430) e.gone = true;
      }
      e.x = x; e.y = y; e.z = z;
      break;
    }
    case 'swoop': {
      const u = e.t / e.dur;
      const k = smooth(u);
      e.x = lerp(e.sx, e.ex, k) + Math.sin(clamp(u, 0, 1) * PI) * (e.bulge || 0);
      e.y = lerp(e.sy, e.ey, k) + Math.sin(clamp(u, 0, 1) * PI) * (e.bulgeY || 0);
      e.z = lerp(e.zs, e.zEnd, u < 1 ? Math.pow(u, 0.85) : u);
      if (u > 1.05 || e.z < -25) e.gone = true;
      break;
    }
    case 'loop': {
      const a = e.ph + e.t * e.w0;
      const R = e.R * (1 - 0.35 * sat(e.t / 6));
      e.x = e.cx + Math.cos(a) * R; e.y = e.cy + Math.sin(a) * R * 0.65;
      e.z = e.zs - e.t * e.vzIn;
      if (e.z < -25 || e.z > 480) e.gone = true;
      break;
    }
    case 'charge': {
      e.x += e.vx * dt; e.y += e.vy * dt; e.z += e.vz * dt;
      if (e.z < -30) e.gone = true;
      break;
    }
    case 'world': { // 世界に固定 (レール速度で近づく)
      e.z -= G.V * dt;
      e.x += e.vx * dt; e.y += e.vy * dt;
      if (e.z < -30) e.gone = true;
      break;
    }
  }
  const idt = 1 / Math.max(dt, 1e-4);
  e.vx = lerp(e.vx, (e.x - px) * idt, 0.2);
  e.vy = lerp(e.vy, (e.y - py) * idt, 0.2);
}

// ---------- 種別ごとの更新 ----------
function canFire(e) { return e.z > 14 && e.z < 190 && !e.leave && e.t > 0.6; }

const UPD = {
  drone(e, dt) {
    movePath(e, dt);
    e.spin += dt * 2.4; e.yaw = e.spin; e.pitch = 0.4; e.roll = 0;
    e.fireT -= dt;
    if (e.fireT <= 0 && canFire(e)) {
      e.fireT = (e.fireRate || 3.4) / D().fire * rand(0.8, 1.3);
      if (!e.noFire) aimShot(e, 'bolt', 0.0, 1.8);
    }
  },
  fighter(e, dt) {
    movePath(e, dt);
    e.yaw = PI + clamp(e.vx * 0.012, -0.5, 0.5);
    e.roll = clamp(-e.vx * 0.05, -1.0, 1.0);
    e.pitch = clamp(-e.vy * 0.01, -0.3, 0.3);
    e.fireT -= dt;
    if (e.fireT <= 0 && canFire(e)) {
      e.fireT = 3.0 / D().fire * rand(0.8, 1.3);
      e.burst = 3; e.burstT = 0;
    }
    if (e.burst > 0) {
      e.burstT -= dt;
      if (e.burstT <= 0) { aimShot(e, 'bolt', 0.0, 1.0, 0, 0, 2); e.burst--; e.burstT = 0.18; }
    }
  },
  mine(e, dt) {
    e.z -= G.V * dt * 0.78;
    const dx = G.px - e.x, dy = G.py - e.y;
    const d = Math.hypot(dx, dy) + 0.01;
    const sp = 7 * D().spd;
    e.x += dx / d * sp * dt; e.y += dy / d * sp * dt;
    e.spin += dt * 1.5; e.yaw = e.spin; e.pitch = e.spin * 0.6;
    if (e.z < 7 && d < 8.5) { G.hurt(18, e.x, e.y, e.z); e.alive = false; explosion(e.x, e.y, e.z, 1.6, COL.amber); mineBlast(e, false); }
    if (e.z < -25) e.gone = true;
  },
  seeker(e, dt) {
    if (!e.dirInit) { e.dirInit = true; const l = Math.hypot(G.px - e.x, G.py - e.y, -e.z) || 1; e.dx = (G.px - e.x) / l; e.dy = (G.py - e.y) / l; e.dz = -e.z / l; }
    const sp = (30 + Math.min(e.t * 22, 52)) * D().spd;
    const tx = G.px - e.x, ty = G.py - e.y, tz = -e.z;
    const l = Math.hypot(tx, ty, tz) || 1;
    const k = Math.min(1, (1.6 + e.t * 0.2) * dt);
    e.dx = lerp(e.dx, tx / l, k); e.dy = lerp(e.dy, ty / l, k); e.dz = lerp(e.dz, tz / l, k);
    const dl = Math.hypot(e.dx, e.dy, e.dz) || 1; e.dx /= dl; e.dy /= dl; e.dz /= dl;
    e.x += e.dx * sp * dt; e.y += e.dy * sp * dt; e.z += e.dz * sp * dt - 0 * dt;
    e.yaw = Math.atan2(e.dx, e.dz); e.pitch = -Math.asin(clamp(e.dy, -1, 1)); e.roll += dt * 6;
    if (e.z < 4 && Math.hypot(G.px - e.x, G.py - e.y) < 3.2) { G.hurt(16, e.x, e.y, e.z); e.alive = false; explosion(e.x, e.y, e.z, 1.0, COL.red); }
    if (e.z < -20) e.gone = true;
  },
  turret(e, dt) {
    e.z -= G.V * dt;
    const dx = G.px - e.x, dy = G.py - e.y, dz = -e.z;
    e.yaw = Math.atan2(dx, dz); e.pitch = -Math.atan2(dy, Math.hypot(dx, dz));
    e.fireT -= dt;
    if (e.fireT <= 0 && e.z > 20 && e.z < 170) {
      e.fireT = 2.6 / D().fire * rand(0.8, 1.2);
      if (Math.random() < 0.28) aimShot(e, 'plasma', 0, 0, 0, 0, 3);
      else { e.burst = 3; e.burstT = 0; }
    }
    if (e.burst > 0) { e.burstT -= dt; if (e.burstT <= 0) { aimShot(e, 'bolt', 0.015, 1.2, 0, 0, 3); e.burst--; e.burstT = 0.16; } }
    if (e.z < -25) e.gone = true;
  },
  rock(e, dt) {
    if (e.erratic && e.z > 35) {
      // 不規則に飛ぶ岩: ときどき弾かれたように進路・速さを変える (近づいたら読めるように止める)
      e.jT = (e.jT === undefined ? rand(0.2, 0.5) : e.jT) - dt;
      if (e.jT <= 0) {
        e.jT = rand(0.35, 0.8);
        // ジグザグ: 毎回左右・上下に大きく振る (自機の周辺に寄せる成分つき)
        e.zig = -(e.zig || (Math.random() < 0.5 ? 1 : -1));
        e.tvx = clamp(e.zig * rand(16, 32) + (G.px - e.x) * 0.5, -40, 40);
        e.tvy = clamp((Math.random() < 0.5 ? -1 : 1) * rand(6, 16) + (G.py - e.y) * 0.5, -25, 25);
        e.tvz = rand(-40, 25);
        e.rx = rand(-3, 3); e.ry = rand(-3, 3);
      }
      const k = 1 - Math.exp(-9 * dt);
      e.vx += ((e.tvx || 0) - e.vx) * k; e.vy += ((e.tvy || 0) - e.vy) * k; e.vz = (e.vz || 0) + ((e.tvz || 0) - (e.vz || 0)) * k;
      if (Math.abs(e.x) > 42) e.vx = -Math.sign(e.x) * Math.abs(e.vx);
      if (Math.abs(e.y) > 26) e.vy = -Math.sign(e.y) * Math.abs(e.vy);
    }
    e.z += ((e.vz || 0) - G.V) * dt; e.x += (e.vx || 0) * dt; e.y += (e.vy || 0) * dt;
    e.yaw += e.ry * dt * 0.8; e.pitch += e.rx * dt * 0.8;
    // 衝突
    if (e.z < e.r + 1 && e.z > -e.r) {
      const d = Math.hypot(G.px - e.x, G.py - e.y);
      if (d < e.r + 1.3) {
        if (G.rollT <= 0) { G.hurt(e.hpK ? 15 : 20, e.x, e.y, e.z); }
        e.alive = false; explosion(e.x, e.y, Math.max(e.z, 4), 1.4, COL.blue);
        shatter(e.mesh, e.x, e.y, Math.max(e.z, 4), e.yaw, e.pitch, 0, e.scale, [0.45, 0.65, 1], 22, 0, 0, 0);
      }
    }
    // 破壊できない岩をすれすれで避けたら GRAZE (FLOW とスコア)
    if (e.armored && e.alive && !e.grazed && e.z < 0) {
      e.grazed = true;
      if (Math.hypot(G.px - e.x, G.py - e.y) < e.r + 5) G.graze(e);
    }
    if (e.z < -e.r - 20) e.gone = true;
  },
  bomber(e, dt) {
    movePath(e, dt);
    e.yaw = PI + Math.sin(e.t * 0.6) * 0.1; e.roll = Math.sin(e.t * 0.8 + 1) * 0.12; e.pitch = 0;
    const ca = Math.cos(e.yaw), sa = Math.sin(e.yaw);
    for (const p of e.parts) {
      p.x = e.x + p.ox * ca; p.y = e.y + p.oy; p.z = e.z - p.ox * sa * 0 + p.oz;
    }
    e.fireT -= dt;
    if (e.fireT <= 0 && canFire(e)) {
      e.fireT = 2.6 / D().fire;
      e.n = (e.n || 0) + 1;
      const alive = e.parts.filter((p) => p.alive);
      if (alive.length) {
        const p = alive[e.n % alive.length];
        aimShot({ x: p.x, y: p.y, z: p.z }, 'plasma', 0, 0.5);
        if (e.n % 2 === 0) for (let i = -2; i <= 2; i++) { const b = aimShot(e, 'bolt', 0, 0, 0, 0, 9); if (b) { b.vx += i * 7; } }
      }
    }
  },
};

export function mineBlast(src, byPlayer) {
  // 連鎖爆発: 周囲の敵にダメージ
  for (const o of G.enemies) {
    if (!o.alive || o === src || o.isBoss) continue;
    const d = Math.hypot(o.x - src.x, o.y - src.y, o.z - src.z);
    if (d < 16) {
      if (o.parts) { for (const p of o.parts) if (p.alive && !p.armored && Math.hypot(p.x - src.x, p.y - src.y, p.z - src.z) < 16) damage(p, 4, 'blast'); }
      else damage(o, 4, 'blast');
    }
  }
  if (byPlayer) { popup(src.x, src.y + 3, src.z, 'CHAIN', COL.amber, 0.06, 0.9); }
}

// ---------- ターゲット ----------
export const targets = [];
export function buildTargets() {
  targets.length = 0;
  for (const e of G.enemies) {
    if (!e.alive || e.noTarget) continue;
    if (e.parts) { for (const p of e.parts) if (p.alive) targets.push(p); }
    else targets.push(e);
  }
  for (const b of G.ebul) if (b.alive && b.lockable && !b.friendly) targets.push(b);
}

// ---------- ダメージ・撃破 ----------
export function damage(tg, dmg, src) {
  if (!tg.alive) return false;
  if (tg.armored) {
    spark(tg.x, tg.y, tg.z, rand(-12, 12), rand(-12, 12), rand(-8, 8), 0.3, 0.8, 0.8, 1, 0.04);
    G.audio.reflect(0);
    return false;
  }
  tg.hp -= dmg; tg.hitT = 0.1;
  if (tg.hp <= 0) { killTarget(tg, src); return true; }
  burst(tg.x, tg.y, tg.z, 3, 12, tg.owner && tg.owner.col ? tg.owner.col : COL.orange, 0.3);
  return false;
}

export function awardKill(score, x, y, z, src) {
  G.chain++; G.chainT = 2.2; G.maxChain = Math.max(G.maxChain, G.chain);
  const mult = 1 + Math.min(G.chain, 40) * 0.1;
  const pts = Math.round(score * mult * (src === 'reflect' ? 2 : 1));
  G.score += pts; G.kills++;
  G.addFlow(src === 'reflect' ? 6 : 2.2);
  if (score >= 100) popup(x, y + 2, z, '+' + pts, COL.white, 0.06, 0.9);
  if (G.od > 0) G.od = Math.min(G.odMax + 2, G.od + 0.12);
}

export function killTarget(tg, src) {
  tg.alive = false;
  if (tg.isBullet) {
    explosion(tg.x, tg.y, tg.z, 0.7, COL.red);
    awardKill(80, tg.x, tg.y, tg.z, src);
    return;
  }
  if (tg.isPart) {
    const e = tg.owner;
    explosion(tg.x, tg.y, tg.z, 1.2, e.col);
    shatter(M.octa1, tg.x, tg.y, tg.z, tg.spin, 0.3, 0, tg.r * 1.1, e.col, 18, 0, 0, 0, 1.4, 12);
    awardKill(tg.score, tg.x, tg.y, tg.z, src);
    G.addFlow(3);
    if (e.onPartDead) e.onPartDead(tg);
    if (e.alive && e.parts.every((p) => !p.alive || p.optional)) { if (e.onAllParts) e.onAllParts(); else killTarget(e, src); }
    return;
  }
  // 通常の敵
  const e = tg;
  if (e.onDeath && e.onDeath(src) === false) return;
  const def = DEF[e.kind] || {};
  const sz = e.kind === 'bomber' ? 3 : e.kind === 'rock' ? 0.8 + e.scale * 0.15 : (def.size || 1);
  explosion(e.x, e.y, e.z, sz, e.col, 0);
  if (e.mesh) shatter(e.mesh, e.x, e.y, e.z, e.yaw, e.pitch, e.roll, e.scale * (e.kind === 'rock' ? 1 : 1), e.col, 14 + sz * 5, e.vx * 0.3, e.vy * 0.3, 0, 1.5, e.kind === 'bomber' ? 80 : 40);
  awardKill(e.score, e.x, e.y, e.z, src);
  if (e.kind === 'mine') mineBlast(e, true);
  if (e.kind === 'bomber') {
    G.pickups.push({ type: 'repair', x: e.x, y: e.y, z: e.z, t: 0, vx: 0, vy: 0 });
    vib(30);
  }
  if (e.drop) G.pickups.push({ type: e.drop, x: e.x, y: e.y, z: e.z, t: 0 });
}

// ---------- 反射弾 ----------
export function reflectBullet(b) {
  b.friendly = true; b.lockable = false; b.t = 0;
  let best = null, bd = 1e9;
  for (const tg of targets) {
    if (tg.isBullet || !tg.alive || tg.armored || tg.z < 5) continue;
    const d = Math.hypot(tg.x - b.x, tg.y - b.y, tg.z - b.z * 0.2);
    if (d < bd) { bd = d; best = tg; }
  }
  b.target = best;
  let dx, dy, dz;
  if (best) { dx = best.x - b.x; dy = best.y - b.y; dz = best.z - b.z; } else { dx = rand(-0.2, 0.2); dy = rand(-0.2, 0.2); dz = 1; }
  const l = Math.hypot(dx, dy, dz) || 1;
  const sp = 170;
  b.vx = dx / l * sp; b.vy = dy / l * sp; b.vz = dz / l * sp;
  b.dmg = b.type === 'plasma' ? 8 : 4;
  b.hit = 2.2;
  G.audio.reflect(clamp((b.x - G.px) / 20, -1, 1));
  burst(b.x, b.y, b.z, 8, 22, COL.cyan, 0.4);
  ring(b.x, b.y, b.z, 3.5, 0.3, COL.cyan, 2);
  popup(b.x, b.y + 1.5, b.z, 'REFLECT', COL.cyan, 0.05, 0.8);
  G.addFlow(9);
  G.score += 50;
}

// ---------- 更新 ----------
const _tmp = [0, 0, 0];
export function updateEnemies(dt) {
  // 敵
  for (let i = G.enemies.length - 1; i >= 0; i--) {
    const e = G.enemies[i];
    if (!e.alive) { G.enemies.splice(i, 1); continue; }
    e.t += dt;
    if (e.hitT > 0) e.hitT -= dt;
    const pz0 = e.z;
    const h = HANDLERS[e.kind];
    if (h && h.update) h.update(e, dt); else if (UPD[e.kind]) UPD[e.kind](e, dt);
    if (pz0 > 0 && e.z <= 0 && e.alive && !e.noFlyby && e.kind !== 'wall' && !e.isBoss) {
      const d = Math.hypot(e.x - G.px, e.y - G.py);
      if (d < 45) G.audio.flyby(clamp((e.x - G.px) / 14, -1, 1), 1 - d / 45, (e.size || 1) * (e.kind === 'bomber' ? 2 : 1));
    }
    if (e.parts) for (const p of e.parts) if (p.hitT > 0) p.hitT -= dt;
    if (e.gone) { e.alive = false; G.enemies.splice(i, 1); }
  }
  buildTargets();
  // 敵弾
  for (let i = G.ebul.length - 1; i >= 0; i--) {
    const b = G.ebul[i];
    if (!b.alive) { G.ebul.splice(i, 1); continue; }
    b.t += dt; b.spin += dt * 5;
    const pz = b.z;
    if (b.friendly) {
      // 反射弾: ホーミング
      if (!b.target || !b.target.alive) {
        b.target = null; let bd = 1e9;
        for (const tg of targets) { if (tg.isBullet || tg.armored || !tg.alive) continue; const d = Math.hypot(tg.x - b.x, tg.y - b.y, tg.z - b.z); if (d < bd) { bd = d; b.target = tg; } }
      }
      if (b.target) {
        const tx = b.target.x - b.x, ty = b.target.y - b.y, tz = b.target.z - b.z;
        const l = Math.hypot(tx, ty, tz) || 1;
        const sp = Math.hypot(b.vx, b.vy, b.vz);
        const k = Math.min(1, 6 * dt);
        b.vx = lerp(b.vx, tx / l * sp, k); b.vy = lerp(b.vy, ty / l * sp, k); b.vz = lerp(b.vz, tz / l * sp, k);
        if (l < b.target.r + b.hit * 0.6) {
          const tg = b.target;
          b.alive = false;
          explosion(b.x, b.y, b.z, 0.8, COL.cyan);
          damage(tg, b.dmg * (G.od > 0 ? 1.5 : 1), 'reflect');
          continue;
        }
      }
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      if (b.t > 3.5 || b.z > 460) b.alive = false;
      continue;
    }
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    // ロール反射フィールド
    if (G.rollT > 0 && b.z < 18 && b.z > -3) {
      if (Math.hypot(b.x - G.px, b.y - G.py, b.z * 0.7) < 10) { reflectBullet(b); continue; }
    }
    // z=0 平面通過で命中/かすり判定
    if (pz > 0 && b.z <= 0) {
      const t = pz / (pz - b.z);
      const cx = b.x - b.vx * dt * (1 - t), cy = b.y - b.vy * dt * (1 - t);
      const d = Math.hypot(cx - G.px, cy - G.py);
      if (d < b.hit) {
        b.alive = false;
        G.hurt(b.type === 'plasma' ? 22 : b.type === 'needle' ? 10 : 12, b.x, b.y, 2);
        burst(b.x, b.y, 2, 10, 18, COL.red, 0.4);
      } else {
        if (d < b.hit + 5.0 && !b.grazed) { b.grazed = true; G.graze(b); }
        if (d < 18) G.audio.bulletPass(clamp((cx - G.px) / 12, -1, 1), 1 - d / 18);
      }
    }
    if (b.z < -10 || b.z > 460 || Math.abs(b.x) > 320 || Math.abs(b.y) > 240) b.alive = false;
  }
  // ピックアップ
  for (let i = G.pickups.length - 1; i >= 0; i--) {
    const p = G.pickups[i];
    p.t += dt;
    p.z -= G.V * dt * 0.8;
    const d = Math.hypot(G.px - p.x, G.py - p.y, p.z);
    if (p.z < 60 && p.z > 0) { const k = (1 - p.z / 60) * 3.2 * dt; p.x += (G.px - p.x) * k; p.y += (G.py - p.y) * k; }
    if ((p.z < 3 && Math.hypot(G.px - p.x, G.py - p.y) < 6) || d < 4) {
      if (p.type === 'repair') { G.shield = Math.min(100, G.shield + 30); popup(G.px, G.py + 2, 14, 'SHIELD +30', COL.green, 0.07, 1.2); }
      else { G.addFlow(22); popup(G.px, G.py + 2, 14, 'FLOW +', COL.cyan, 0.07, 1.2); }
      G.audio.pickup(); G.flash[1] = Math.max(G.flash[1], 0.2); G.flash[3] = Math.max(G.flash[3], 0.06);
      G.pickups.splice(i, 1);
    } else if (p.z < -15) G.pickups.splice(i, 1);
  }
}

// ---------- 描画 ----------
export function drawEnemies(g, t) {
  for (const e of G.enemies) {
    if (!e.alive) continue;
    const h = HANDLERS[e.kind];
    let c = e.col;
    const f = e.hitT > 0 ? 1 : 0;
    const r = Math.min(1, c[0] + f), gg = Math.min(1, c[1] + f), b = Math.min(1, c[2] + f);
    if (h && h.draw) h.draw(e, g, r, gg, b, t);
    else if (e.kind === 'wall') drawWall(e, g);
    else if (e.mesh) g.mesh(e.mesh, e.x, e.y, e.z, e.yaw, e.pitch, e.roll, e.scale, r, gg, b, e.w);
    if (e.comet) { // 彗星の尾
      const L = 6 + (G.V - (e.vz || 0)) * 0.12;
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * TAU + t * 3, ox = Math.cos(a) * e.r * 0.6, oy = Math.sin(a) * e.r * 0.6;
        g.line3(e.x + ox, e.y + oy, e.z + 0.5, e.x + ox * 0.3, e.y + oy * 0.3, e.z + L, 1, 0.55, 0.2, 2.0);
      }
      g.mesh(M.octa1, e.x, e.y, e.z, t * 4, t * 3, 0, e.r * 1.6, 1, 0.9, 0.6, 1.6);
    }
    if (e.parts && !(h && h.drawParts === false)) drawParts(e, g, t);
  }
  // 敵弾
  for (const b of G.ebul) {
    if (!b.alive) continue;
    const T = BT[b.type];
    if (b.friendly) {
      g.mesh(M.orb, b.x, b.y, b.z, b.spin, b.spin * 0.7, 0, b.type === 'plasma' ? 2.2 : 1.1, 0.3, 1, 1, 2.0);
      g.line3(b.x, b.y, b.z, b.x - b.vx * 0.06, b.y - b.vy * 0.06, b.z - b.vz * 0.06, 0.2, 0.8, 1, 2);
      continue;
    }
    const col = T.col;
    if (b.type === 'needle') {
      const yaw = Math.atan2(b.vx, b.vz), pitch = -Math.asin(clamp(b.vy / (Math.hypot(b.vx, b.vy, b.vz) || 1), -1, 1));
      g.mesh(T.mesh, b.x, b.y, b.z, yaw, pitch, b.spin, 1.5, col[0], col[1], col[2], T.w);
    } else {
      const hp = b.hp / b.maxhp;
      g.mesh(T.mesh, b.x, b.y, b.z, b.spin, b.spin * 0.7, 0, b.type === 'plasma' ? 1.15 : 1.7, col[0], col[1] * (b.type === 'plasma' ? hp : 1), col[2], T.w);
      if (b.type === 'plasma') g.mesh(M.octa1, b.x, b.y, b.z, -b.spin * 1.3, b.spin, 0, 2.0, col[0] * 0.7, col[1] * 0.3, col[2] * 0.4, 1.4);
    }
    // 残光
    g.line3(b.x, b.y, b.z, b.x - b.vx * 0.045, b.y - b.vy * 0.045, b.z - b.vz * 0.045, col[0] * 0.6, col[1] * 0.4, col[2] * 0.4, 1.5);
  }
  // ピックアップ
  for (const p of G.pickups) {
    const c = p.type === 'repair' ? COL.green : COL.cyan;
    g.mesh(M.cross, p.x, p.y, p.z, p.t * 2, p.t * 1.3, 0, 1.3, c[0], c[1], c[2], 2);
    g.mesh(M.octa1, p.x, p.y, p.z, -p.t * 2, 0, 0, 2.2, c[0] * 0.4, c[1] * 0.4, c[2] * 0.4, 1.3);
  }
}

function drawParts(e, g, t) {
  for (const p of e.parts) {
    if (!p.alive) continue;
    const f = p.hitT > 0 ? 1 : 0;
    const k = 0.75 + 0.25 * Math.sin(t * 8 + p.spin);
    const col = p.armored ? [0.5, 0.6, 0.9] : e.col;
    g.mesh(M.octa1, p.x, p.y, p.z, p.spin + t * 1.8, t * 1.1, 0, p.r * 0.9, Math.min(1, col[0] * k + f), Math.min(1, col[1] * k + f), Math.min(1, col[2] * k + f), 1.9);
    g.mesh(M.cube1, p.x, p.y, p.z, -t * 1.2, t * 0.9, 0, p.r * 0.55, col[0] * 0.5, col[1] * 0.5, col[2] * 0.5, 1.3);
  }
}

// ---------- 壁バリア (隙間をくぐる) ----------
export function spawnWall(gx, gy, gr = 8, z = 300, w = 34, h = 20) {
  const e = mk('wall', 0, 0, z, { path: 'none', gx, gy, gr, ww: w, hh: h, col: [1, 0.35, 0.2], noTarget: true, isEnemy: false });
  e.update = true;
  return e;
}
HANDLERS.wall = {
  update(e, dt) {
    const pz = e.z;
    e.z -= G.V * dt;
    if (pz > 0 && e.z <= 0) {
      const d = Math.hypot(G.px - e.gx, G.py - e.gy);
      if (d > e.gr - 1.3 && G.rollT <= 0) G.hurt(28, G.px, G.py, 3);
      explosion(e.gx, e.gy, 3, 1.0, e.col);
      burst(e.gx, e.gy, 3, 30, 40, e.col, 0.8);
    }
    if (e.z < -30) e.gone = true;
  },
  draw(e, g) { drawWall(e, g); },
};
function drawWall(e, g) {
  const z = e.z, w = e.ww, h = e.hh, col = e.col;
  const N = 14;
  const blink = 0.7 + 0.3 * Math.sin(G.time * 10 + z * 0.1);
  // 枠
  g.line3(-w, -h, z, w, -h, z, col[0], col[1] * 0.6, col[2] * 0.4, 2.4);
  g.line3(w, -h, z, w, h, z, col[0], col[1] * 0.6, col[2] * 0.4, 2.4);
  g.line3(w, h, z, -w, h, z, col[0], col[1] * 0.6, col[2] * 0.4, 2.4);
  g.line3(-w, h, z, -w, -h, z, col[0], col[1] * 0.6, col[2] * 0.4, 2.4);
  // 格子 (隙間の部分は抜く)
  const step = 4;
  for (let x = -w; x <= w; x += step) {
    let y0 = -h;
    // 縦線を隙間で分割
    const dx = x - e.gx;
    if (Math.abs(dx) < e.gr) {
      const dy = Math.sqrt(e.gr * e.gr - dx * dx);
      if (e.gy - dy > -h) g.line3(x, -h, z, x, e.gy - dy, z, col[0] * 0.55, col[1] * 0.3, col[2] * 0.2, 1.3);
      if (e.gy + dy < h) g.line3(x, e.gy + dy, z, x, h, z, col[0] * 0.55, col[1] * 0.3, col[2] * 0.2, 1.3);
    } else g.line3(x, -h, z, x, h, z, col[0] * 0.55, col[1] * 0.3, col[2] * 0.2, 1.3);
  }
  for (let y = -h; y <= h; y += step) {
    const dy = y - e.gy;
    if (Math.abs(dy) < e.gr) {
      const dx = Math.sqrt(e.gr * e.gr - dy * dy);
      if (e.gx - dx > -w) g.line3(-w, y, z, e.gx - dx, y, z, col[0] * 0.55, col[1] * 0.3, col[2] * 0.2, 1.3);
      if (e.gx + dx < w) g.line3(e.gx + dx, y, z, w, y, z, col[0] * 0.55, col[1] * 0.3, col[2] * 0.2, 1.3);
    } else g.line3(-w, y, z, w, y, z, col[0] * 0.55, col[1] * 0.3, col[2] * 0.2, 1.3);
  }
  // 隙間のリング (緑=安全)
  let px = e.gx + e.gr, py = e.gy;
  for (let i = 1; i <= N * 2; i++) {
    const a = (i / (N * 2)) * TAU;
    const X = e.gx + Math.cos(a) * e.gr, Y = e.gy + Math.sin(a) * e.gr;
    g.line3(px, py, z, X, Y, z, 0.2 * blink, 1 * blink, 0.5 * blink, 2.6);
    px = X; py = Y;
  }
}
