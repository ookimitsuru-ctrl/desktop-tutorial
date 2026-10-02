// ボス: WARDEN (ステージ1) / LEVIATHAN (ステージ2) / CORE (ステージ3)
import { G, vib } from './state.js';
import { M } from './models.js';
import { rand, clamp, lerp, sat, smooth, TAU, PI, sign } from './util.js';
import { mk, addPart, HANDLERS, fireBullet, aimShot, D, COL, killTarget, awardKill, spawn } from './enemies.js';
import { explosion, shatter, burst, ring, popup } from './fx.js';

// ---- 共通 ----
function rotY(x, y, z, a) { const c = Math.cos(a), s = Math.sin(a); return [x * c + z * s, y, -x * s + z * c]; }
function rotX(x, y, z, a) { const c = Math.cos(a), s = Math.sin(a); return [x, y * c - z * s, y * s + z * c]; }
function rotZ(x, y, z, a) { const c = Math.cos(a), s = Math.sin(a); return [x * c - y * s, x * s + y * c, z]; }

// 発射方向を基準に円錐状に弾を撃つ
function coneShot(type, ox, oy, oz, angle, half, speedMul = 1) {
  let dx = G.px - ox, dy = G.py - oy, dz = 0 - oz;
  const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
  // 基底
  let ux = dz, uy = 0, uz = -dx; // cross(d, up(0,1,0)) = (dz*1 - dy*0, ..., ) 近似
  const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
  const vx = dy * uz - dz * uy, vy = dz * ux - dx * uz, vz = dx * uy - dy * ux;
  const t = Math.tan(half), c = Math.cos(angle) * t, s = Math.sin(angle) * t;
  return fireBullet(type, ox, oy, oz, dx + ux * c + vx * s, dy + uy * c + vy * s, dz + uz * c + vz * s, speedMul);
}

export function bossRatio(e) {
  if (!e || !e.parts) return 0;
  let cur = 0, max = 0;
  for (const p of e.parts) { max += p.maxhp; if (p.alive) cur += Math.max(0, p.hp); }
  return max ? cur / max : 0;
}

function startDying(e, dur) {
  e.dying = dur; e.dyingMax = dur;
  G.audio.boom();
  G.tsTarget = 0.35; G.slowT = dur + 0.6;
  for (const b of G.ebul) if (!b.friendly) { b.alive = false; explosion(b.x, b.y, b.z, 0.5, COL.red); }
}

function updateDying(e, dt, big) {
  e.dying -= dt;
  e.dieAcc = (e.dieAcc || 0) - dt;
  if (e.dieAcc <= 0) {
    e.dieAcc = 0.09;
    const r = e.bossR || 8;
    explosion(e.x + rand(-r, r), e.y + rand(-r, r) * 0.7, e.z + rand(-r, r) * 0.5, rand(0.8, 1.8), e.col);
    vib(15);
  }
  e.shake = 1.5;
  if (e.dying <= 0) {
    explosion(e.x, e.y, e.z, 4.5, [1, 1, 1]);
    explosion(e.x, e.y, e.z, 3.5, e.col);
    if (big) big(e);
    G.flash = [1, 1, 1, 0.9];
    G.trauma = 1;
    vib(200);
    awardKill(e.score, e.x, e.y, e.z, 'boss');
    e.alive = false;
    G.boss = null;
    G.tsTarget = 1;
    G.onBossDefeated();
  }
}

// =========================================================
// WARDEN
// =========================================================
HANDLERS.warden = {
  init(e) {
    e.isBoss = true; e.bossR = 11; e.name = 'WARDEN'; e.col = COL.orange; e.mesh = null;
    e.score = 12000; e.phase = 1; e.cy = 0; e.cageYaw = 0; e.cagePitch = 0; e.atkT = 3; e.ringT = 7; e.sT = 0;
    e.z0 = 78; e.zs = 320; e.enter = 4; e.bs = 1.35;
    for (let i = 0; i < 4; i++) addPart(e, 0, 0, 0, 22, 3.4, { score: 800, pod: true, k: i });
    e.core = addPart(e, 0, 0, 0, 40, 4.6, { score: 3000, armored: true, core: true });
    e.onPartDead = (p) => {
      if (p.pod && e.parts.filter((q) => q.pod && q.alive).length === 0) {
        e.phase = 2; e.core.armored = false; e.atkT = 2; e.spiral = 0;
        explosion(e.x, e.y, e.z, 3.2, e.col);
        shatter(M.bossCage, e.x, e.y, e.z, e.cageYaw, e.cagePitch, 0, e.bs, e.col, 30, 0, 0, 0, 2.2, 40);
        popup(e.x, e.y + 8, e.z, 'CORE EXPOSED', COL.cyan, 0.08, 2.0);
        G.audio.warn();
      }
    };
    e.onAllParts = () => startDying(e, 3.2);
  },
  update(e, dt) {
    if (e.dying !== undefined && e.dying > 0) {
      updateDying(e, dt, (b) => { shatter(M.bossCore, b.x, b.y, b.z, b.yaw, b.pitch, 0, b.bs, b.col, 40, 0, 0, 0, 2.5, 30); });
      e.yaw += dt * 3; return;
    }
    const k = 1 - Math.pow(1 - sat(e.t / e.enter), 3);
    e.z = lerp(e.zs, e.z0, k);
    e.x = Math.sin(e.t * 0.45) * 12 * k; e.y = Math.sin(e.t * 0.7 + 1) * 6 * k;
    if (e.phase === 2) { e.z = e.z0 + Math.sin(e.t * 0.5) * 14; e.x = Math.sin(e.t * 0.6) * 18; e.y = Math.sin(e.t * 0.9) * 8; }
    e.yaw += dt * 0.7; e.pitch += dt * 0.35;
    e.cageYaw += dt * (e.phase === 1 ? 0.55 : 0); e.cagePitch += dt * 0.3;
    // 弱点位置
    let i = 0;
    const verts = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0]];
    for (const p of e.parts) {
      if (p.pod) {
        const v = verts[p.k];
        let q = rotZ(v[0] * 11 * e.bs, v[1] * 11 * e.bs, 0, e.cageYaw);
        q = rotY(q[0], q[1], q[2], 0); q = rotX(q[0], q[1], q[2], 0.5 * Math.sin(e.cageYaw * 0.5));
        p.x = e.x + q[0]; p.y = e.y + q[1]; p.z = e.z + q[2] - 2; p.spin += dt * 2;
      } else { p.x = e.x; p.y = e.y; p.z = e.z; p.spin += dt; }
    }
    if (e.t < e.enter) return;
    const rage = bossRatio(e) < 0.4 ? 1.35 : 1;
    const f = D().fire * rage;
    e.atkT -= dt;
    if (e.phase === 1) {
      if (e.atkT <= 0) {
        e.atkT = 2.1 / f;
        const alive = e.parts.filter((p) => p.pod && p.alive);
        const p = alive[(e.sT++) % alive.length];
        for (let j = -1; j <= 1; j++) {
          const b = aimShot({ x: p.x, y: p.y, z: p.z }, 'needle', 0, 1.0);
          if (b) { b.vx += j * 6; b.vy += j * 0; }
        }
      }
      e.ringT -= dt;
      if (e.ringT <= 0) {
        e.ringT = 6.5 / f;
        const n = 14, a0 = rand(0, TAU);
        for (let j = 0; j < n; j++) coneShot('bolt', e.x, e.y, e.z - 4, a0 + (j / n) * TAU, 0.36, 0.7);
        ring(e.x, e.y, e.z - 4, 12, 0.6, COL.orange, 2.5);
        G.audio.warn();
      }
    } else {
      // フェーズ2: コアが露出。螺旋弾 + プラズマ
      e.spiral = (e.spiral || 0) + dt;
      e.burstT = (e.burstT || 0) - dt;
      const cyc = e.spiral % 7;
      if (cyc < 3.4 && e.burstT <= 0) {
        e.burstT = 0.1 / f;
        e.sa = (e.sa || 0) + 0.62;
        coneShot('bolt', e.x, e.y, e.z - 4, e.sa, 0.34, 0.85);
        coneShot('bolt', e.x, e.y, e.z - 4, e.sa + PI, 0.34, 0.85);
      }
      if (e.atkT <= 0) {
        e.atkT = 3.0 / f;
        aimShot({ x: e.x, y: e.y, z: e.z - 4 }, 'plasma', 0, 0.3);
        if (rage > 1) { const b = aimShot({ x: e.x, y: e.y, z: e.z - 4 }, 'plasma', 0.08, 0.3); }
      }
      e.seekT = (e.seekT === undefined ? 5 : e.seekT) - dt;
      if (e.seekT <= 0) {
        e.seekT = 9;
        for (let j = 0; j < 2; j++) spawn('seeker', { x: e.x + (j ? 9 : -9), y: e.y, z: e.z - 6, path: 'seeker' });
      }
    }
  },
  draw(e, g, r, gg, b, t) {
    const col = e.col, pulse = 0.7 + 0.3 * Math.sin(t * 6);
    const hit = e.parts.some((p) => p.hitT > 0) ? 0.5 : 0;
    const S = e.bs;
    g.mesh(M.bossCore, e.x, e.y, e.z, e.yaw, e.pitch, 0, S, Math.min(1, 0.5 + hit), 0.3 + hit, 0.1 + hit, 2.4);
    g.mesh(M.icosa1, e.x, e.y, e.z, -e.yaw * 1.6, e.pitch, 0, 2.4 * S, 1, 0.7 * pulse, 0.3, 1.9);
    if (e.phase === 1) {
      g.mesh(M.bossCage, e.x, e.y, e.z, e.cageYaw * 0.3, e.cagePitch * 0.2, e.cageYaw, S, col[0] * 0.8, col[1] * 0.6, col[2] * 0.4, 1.9);
    }
    g.mesh(M.ring24, e.x, e.y, e.z, e.yaw * 0.5, PI / 2 + Math.sin(t) * 0.2, t * 0.8, 15 * S, 0.6, 0.25, 0.1, 1.5);
    g.mesh(M.ring24, e.x, e.y, e.z, 0, Math.sin(t * 0.7) * 0.5, -t * 0.6, 19 * S, 0.4, 0.2, 0.1, 1.3);
  },
};

// =========================================================
// LEVIATHAN
// =========================================================
const SEGS = 17;
HANDLERS.leviathan = {
  init(e) {
    e.isBoss = true; e.bossR = 14; e.name = 'LEVIATHAN'; e.col = COL.pink; e.mesh = null; e.score = 18000;
    e.trail = []; e.phase = 1; e.atkT = 3; e.lunge = 0; e.lungeT = 8; e.z0 = 72; e.zs = 340; e.enter = 4.5;
    e.head = addPart(e, 0, 0, 0, 40, 5.4, { score: 3500, armored: true, headPart: true });
    for (const si of [4, 8, 12]) addPart(e, 0, 0, 0, 18, 3.8, { score: 1200, node: true, si });
    e.segPos = []; for (let i = 0; i < SEGS; i++) e.segPos.push([0, 0, 300]);
    e.onPartDead = (p) => {
      if (p.node && e.parts.filter((q) => q.node && q.alive).length === 0) {
        e.phase = 2; e.head.armored = false; e.lungeT = 2;
        popup(e.x, e.y + 9, e.z, 'HEAD EXPOSED', COL.cyan, 0.08, 2);
        G.audio.warn();
      }
    };
    e.onAllParts = () => startDying(e, 3.6);
  },
  update(e, dt) {
    // 履歴
    const tr = e.trail;
    if (e.dying !== undefined && e.dying > 0) {
      updateDying(e, dt, (b) => { for (let i = 0; i < 6; i++) { const s = b.segPos[i * 2]; shatter(M.serpentSeg, s[0], s[1], s[2], 0, 0, 0, 1, b.col, 24, 0, 0, 0, 2.2, 20); } });
      return;
    }
    const kEnter = 1 - Math.pow(1 - sat(e.t / e.enter), 3);
    const rage = e.phase === 2 ? 1.3 : 1;
    let hx, hy, hz;
    if (e.lunge > 0) {
      // 突進: 予告 → 突っ込み → 離脱
      e.lunge += dt;
      const T = e.lunge;
      if (T < 1.1) { // 予告 (後ろへ引いて照準)
        hz = lerp(e.hz, e.z0 + 25, smooth(T / 1.1)); hx = lerp(e.hx, G.px * 1.0, smooth(T / 1.1) * 0.6); hy = lerp(e.hy, G.py, smooth(T / 1.1) * 0.6);
        e.tx = G.px; e.ty = G.py;
      } else if (T < 2.0) { // 突進
        const u = smooth((T - 1.1) / 0.9);
        hz = lerp(e.z0 + 25, -12, u); hx = lerp(e.hx * 0.4 + e.tx * 0.6, e.tx, u); hy = lerp(e.hy * 0.4 + e.ty * 0.6, e.ty, u);
        // 追尾補正
        hx += (G.px - e.tx) * 0.25 * u; hy += (G.py - e.ty) * 0.25 * u;
        e.cx = hx; e.cy2 = hy;
      } else if (T < 3.4) { // 離脱
        const u = smooth((T - 2.0) / 1.4);
        hz = lerp(-12, e.z0, u); hx = lerp(e.cx, Math.sin(e.t * 0.5) * 18, u); hy = lerp(e.cy2, Math.sin(e.t * 0.8) * 8, u);
      } else { e.lunge = 0; hz = e.z0; hx = e.hx; hy = e.hy; e.lungeT = (e.phase === 2 ? 5.5 : 8.5); }
    } else {
      hx = Math.sin(e.t * 0.55 * rage) * 22 * kEnter; hy = Math.sin(e.t * 0.83 * rage + 1) * 10 * kEnter;
      hz = lerp(e.zs, e.z0 + Math.sin(e.t * 0.4) * 12, kEnter);
      if (e.t > e.enter) {
        e.lungeT -= dt;
        if (e.lungeT <= 0) { e.lunge = 0.0001; e.hx = hx; e.hy = hy; e.hz = hz; G.audio.warn(); popup(hx, hy + 5, hz, 'CHARGE!', COL.red, 0.07, 1.2); }
      }
    }
    e.x = hx; e.y = hy; e.z = hz;
    tr.push([e.t, hx, hy, hz]);
    while (tr.length > 2 && e.t - tr[0][0] > 6) tr.shift();
    // 節の位置
    const delay = 0.2;
    for (let i = 0; i < SEGS; i++) {
      const tt = e.t - (i + 1) * delay;
      let a = tr[0], b = tr[0];
      for (let j = tr.length - 1; j >= 0; j--) { if (tr[j][0] <= tt) { a = tr[j]; b = tr[Math.min(j + 1, tr.length - 1)]; break; } }
      const f = b[0] > a[0] ? clamp((tt - a[0]) / (b[0] - a[0]), 0, 1) : 0;
      const sp = e.segPos[i];
      sp[0] = lerp(a[1], b[1], f); sp[1] = lerp(a[2], b[2], f); sp[2] = lerp(a[3], b[3], f) + i * 2.4;
    }
    // パーツ
    for (const p of e.parts) {
      if (p.headPart) { p.x = hx; p.y = hy; p.z = hz + 2; }
      else { const s = e.segPos[p.si]; p.x = s[0]; p.y = s[1]; p.z = s[2]; }
      p.spin += dt * 2;
    }
    // 衝突 (突進中)
    if (e.lunge > 1.1 && G.rollT <= 0) {
      for (let i = -1; i < SEGS; i += 1) {
        const p = i < 0 ? [hx, hy, hz] : e.segPos[i];
        if (Math.abs(p[2]) < 4 && Math.hypot(p[0] - G.px, p[1] - G.py) < 4.4 && !e.hitCool) { G.hurt(26, G.px, G.py, 3); e.hitCool = 0.8; }
      }
    }
    if (e.hitCool) e.hitCool = Math.max(0, e.hitCool - dt);
    if (e.t < e.enter || e.lunge > 0) return;
    // 攻撃
    const f = D().fire * (bossRatio(e) < 0.35 ? 1.3 : 1) * rage;
    e.atkT -= dt;
    if (e.atkT <= 0) {
      e.atkT = 2.4 / f;
      e.n = (e.n || 0) + 1;
      const nodes = e.parts.filter((p) => p.node && p.alive);
      if (nodes.length && e.n % 2 === 0) {
        const p = nodes[(e.n >> 1) % nodes.length];
        aimShot({ x: p.x, y: p.y, z: p.z }, 'plasma', 0, 0.3);
      } else {
        for (let j = -2; j <= 2; j++) { const b = aimShot({ x: hx, y: hy, z: hz + 4 }, 'bolt', 0, 0.5, 0, 0, 0, 0.9); if (b) b.vx += j * 9; }
      }
    }
    if (e.phase === 2) {
      e.spT = (e.spT || 0) - dt;
      if (e.spT <= 0) { e.spT = 0.16 / D().fire; e.sa = (e.sa || 0) + 0.7; coneShot('needle', hx, hy, hz + 4, e.sa, 0.3, 0.7); }
    }
  },
  draw(e, g, r, gg, b, t) {
    const col = e.col;
    const hit = e.parts.some((p) => p.hitT > 0) ? 0.5 : 0;
    const tint = (k) => [Math.min(1, col[0] * k + hit), Math.min(1, col[1] * k + hit), Math.min(1, col[2] * k + hit)];
    // 節 (尾から頭へ)
    for (let i = SEGS - 1; i >= 0; i--) {
      const s = e.segPos[i], prev = i === 0 ? [e.x, e.y, e.z] : e.segPos[i - 1];
      const dx = prev[0] - s[0], dy = prev[1] - s[1], dz = prev[2] - s[2];
      const yaw = Math.atan2(dx, dz), pitch = -Math.atan2(dy, Math.hypot(dx, dz));
      const sc = lerp(1.6, 0.8, i / SEGS);
      const c = tint(0.6 + 0.4 * (0.5 + 0.5 * Math.sin(t * 3 - i * 0.5)));
      g.mesh(M.serpentSeg, s[0], s[1], s[2], yaw, pitch, i * 0.4 + t * 0.5, sc, c[0], c[1], c[2], 1.7);
    }
    const hc = tint(1);
    const hyaw = PI + clamp((G.px - e.x) * -0.01, -0.3, 0.3);
    g.mesh(M.serpentHead, e.x, e.y, e.z, hyaw, 0, 0, 1.4, hc[0], hc[1], hc[2], 2.1);
    if (e.lunge > 0 && e.lunge < 1.1) { // 予告線
      g.line3(e.x, e.y, e.z, e.tx, e.ty, 0, 1, 0.15 + 0.5 * Math.sin(t * 30), 0.1, 2.2);
    }
  },
};

// =========================================================
// CORE (最終ボス)
// =========================================================
HANDLERS.core = {
  init(e) {
    e.isBoss = true; e.bossR = 16; e.name = 'CORE'; e.col = COL.violet; e.mesh = null; e.score = 30000;
    e.phase = 1; e.z0 = 115; e.zs = 380; e.enter = 5; e.atkT = 3; e.armT = 2; e.mineT = 8;
    e.core = addPart(e, 0, 0, 0, 100, 6, { score: 8000, armored: true, core: true });
    for (let i = 0; i < 6; i++) addPart(e, 0, 0, 0, 16, 2.8, { score: 1000, gen: true, k: i });
    e.onPartDead = (p) => {
      if (p.gen && e.parts.filter((q) => q.gen && q.alive).length === 0) {
        e.phase = 2; e.core.armored = false; e.ringT = 2.5; e.atkT = 2;
        explosion(e.x, e.y, e.z, 4, e.col);
        shatter(M.reactor, e.x, e.y, e.z, e.yaw, e.pitch, 0, 1, e.col, 36, 0, 0, 0, 2.6, 60);
        popup(e.x, e.y + 14, e.z, 'CORE EXPOSED', COL.cyan, 0.09, 2.2);
        G.audio.warn();
      }
    };
    e.onAllParts = () => startDying(e, 4.2);
  },
  update(e, dt) {
    if (e.dying !== undefined && e.dying > 0) {
      updateDying(e, dt, (b) => { shatter(M.icosa1, b.x, b.y, b.z, b.yaw, b.pitch, 0, 8, [1, 1, 1], 50, 0, 0, 0, 3, 30); });
      e.yaw += dt * 4; return;
    }
    const k = 1 - Math.pow(1 - sat(e.t / e.enter), 3);
    const prog = 1 - bossRatio(e);
    e.z = lerp(e.zs, e.z0 - prog * 30, k) + Math.sin(e.t * 0.4) * 6 * k;
    e.x = Math.sin(e.t * 0.35) * 14 * k; e.y = Math.sin(e.t * 0.5 + 2) * 6 * k;
    e.yaw += dt * 0.5; e.pitch += dt * 0.23;
    const gens = e.parts.filter((p) => p.gen);
    for (const p of e.parts) {
      p.spin += dt * 1.5;
      if (p.core) { p.x = e.x; p.y = e.y; p.z = e.z; }
      else {
        const a = e.t * 0.8 + (p.k / 6) * TAU;
        p.x = e.x + Math.cos(a) * 24; p.y = e.y + Math.sin(a) * 24 * 0.6 + Math.sin(e.t + p.k) * 3; p.z = e.z + Math.sin(a) * 10 - 8;
      }
    }
    if (e.t < e.enter) return;
    const rage = (e.phase === 2 && bossRatio(e) < 0.4 ? 1.35 : 1) * D().fire;
    e.atkT -= dt;
    if (e.phase === 1) {
      // 螺旋弾
      e.spT = (e.spT || 0) - dt;
      e.spiral = (e.spiral || 0) + dt;
      if (e.spiral % 8 < 4.5 && e.spT <= 0) {
        e.spT = 0.12 / rage; e.sa = (e.sa || 0) + 0.55;
        coneShot('bolt', e.x, e.y, e.z - 8, e.sa, 0.4, 0.75);
      }
      if (e.atkT <= 0) {
        e.atkT = 3.2 / rage;
        const alive = gens.filter((p) => p.alive);
        if (alive.length) { const p = alive[(e.n = (e.n || 0) + 1) % alive.length]; aimShot({ x: p.x, y: p.y, z: p.z }, 'plasma', 0, 0.3); }
      }
      e.mineT -= dt;
      if (e.mineT <= 0) { e.mineT = 9; spawn('mine', { x: e.x + rand(-14, 14), y: e.y + rand(-6, 6), z: e.z - 12, path: 'worldmine' }); }
    } else {
      // 壁リング (隙間あり) + プラズマ + 螺旋
      e.ringT = (e.ringT === undefined ? 2.5 : e.ringT) - dt;
      if (e.ringT <= 0) {
        e.ringT = 3.4 / rage;
        const n = 30, gap = rand(0, TAU), gw = 4;
        for (let j = 0; j < n; j++) {
          const a = (j / n) * TAU;
          let dd = Math.abs(((a - gap + PI) % TAU + TAU) % TAU - PI);
          if (dd < (gw / n) * TAU * 0.5) continue;
          coneShot('bolt', e.x, e.y, e.z - 8, a, 0.34, 0.62);
        }
        ring(e.x, e.y, e.z - 8, 16, 0.7, COL.violet, 3);
        G.audio.warn();
      }
      if (e.atkT <= 0) {
        e.atkT = 3.6 / rage;
        aimShot({ x: e.x, y: e.y, z: e.z - 8 }, 'plasma', 0, 0.3);
        if (bossRatio(e) < 0.4) { aimShot({ x: e.x, y: e.y, z: e.z - 8 }, 'plasma', 0.1, 0.3); aimShot({ x: e.x, y: e.y, z: e.z - 8 }, 'plasma', -0.1, 0.3); }
      }
      if (bossRatio(e) < 0.45) {
        e.spT = (e.spT || 0) - dt;
        if (e.spT <= 0) { e.spT = 0.2 / rage; e.sa = (e.sa || 0) - 0.8; coneShot('needle', e.x, e.y, e.z - 8, e.sa, 0.3, 0.65); }
      }
    }
  },
  draw(e, g, r, gg, b, t) {
    const col = e.col;
    const hit = e.parts.some((p) => p.hitT > 0) ? 0.5 : 0;
    const pulse = 0.6 + 0.4 * Math.sin(t * 5);
    if (e.phase === 1) {
      g.mesh(M.reactor, e.x, e.y, e.z, e.yaw, e.pitch, 0, 1, Math.min(1, col[0] * 0.8 + hit), col[1] * 0.6 + hit, Math.min(1, col[2] + hit), 1.9);
    }
    g.mesh(M.icosa1, e.x, e.y, e.z, -e.yaw * 2, e.pitch * 2, 0, 6, 1, 0.5 * pulse + hit, 1, 2.4);
    g.mesh(M.icosa1, e.x, e.y, e.z, e.yaw * 3, 0.5, 0, 3.4, 1, 1, 1, 2);
    g.mesh(M.ring24, e.x, e.y, e.z, 0, 0.4 + Math.sin(t * 0.5) * 0.3, t * 0.7, 20, 0.7, 0.3, 1, 1.6);
    g.mesh(M.ring24, e.x, e.y, e.z, 1.2, 0, -t * 0.5, 24, 0.4, 0.2, 0.8, 1.4);
    if (e.phase === 2) g.mesh(M.ring24, e.x, e.y, e.z, 0, 0, t * 2.4, 9, 1, 0.8, 1, 2.0);
  },
};

export function spawnBoss(name) {
  const e = mk(name, 0, 0, 340, { path: 'none', noTarget: false });
  e.isBoss = true;
  G.boss = e;
  G.audio.boom();
  return e;
}

// seeker / worldmine の軌道を HANDLERS 経由で上書きしないよう path を通常扱いに
