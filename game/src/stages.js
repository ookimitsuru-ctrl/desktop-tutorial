// ステージスクリプト: 時刻つきイベントで敵を配置する
import { G } from './state.js';
import { spawn, spawnBomber, spawnWall } from './enemies.js';
import { rand, randi, pick, PI, TAU } from './util.js';

const dn = (n) => Math.max(1, Math.round(n * [0.8, 1, 1.2][G.diff]));

// ---- 編隊ヘルパー ----
function hoverV(kind, n, cx, cy, z0 = 90, o = {}) {
  for (let i = 0; i < n; i++) {
    const k = i === 0 ? 0 : Math.ceil(i / 2) * (i % 2 ? 1 : -1);
    spawn(kind, { x: cx + k * 9, y: cy - Math.abs(k) * 3, z: 270 + Math.abs(k) * 12, z0: z0 + Math.abs(k) * 7, path: 'hover', enter: 2.4 + Math.abs(k) * 0.2, swA: 5, swF: 1.0, life: 13, ...o });
  }
}
function swoop(kind, n, side, y, gap = 0.45, o = {}) {
  for (let i = 0; i < n; i++) {
    setTimeout0(i * gap, () => {
      spawn(kind, { x: side * 85, y: y + rand(-3, 3), z: 240, path: 'swoop', sx: side * 85, sy: y + rand(-3, 3), ex: -side * rand(10, 30), ey: y + rand(-12, 12), zEnd: -15, dur: 6.2, bulge: side * rand(10, 30), bulgeY: rand(-12, 12), ...o });
    });
  }
}
function ringLoop(kind, n, cx, cy, R = 22, o = {}) {
  for (let i = 0; i < n; i++) {
    spawn(kind, { x: cx, y: cy, z: 250, path: 'loop', cx, cy, R, ph: (i / n) * TAU, w0: 1.15, vzIn: 30, ...o });
  }
}
function charge(kind, n, gap = 0.5, o = {}) {
  for (let i = 0; i < n; i++) {
    setTimeout0(i * gap, () => {
      const x = rand(-45, 45), y = rand(-22, 22);
      const T = 4.6;
      spawn(kind, { x, y, z: 300, path: 'charge', vx: (G.px - x) / T * 0.9 + rand(-2, 2), vy: (G.py - y) / T * 0.9, vz: -300 / T, ...o });
    });
  }
}
function mines(n, spread = 26) {
  for (let i = 0; i < n; i++) spawn('mine', { x: rand(-spread, spread), y: rand(-spread * 0.5, spread * 0.5), z: 230 + i * 28, path: 'world' });
}
function seekers(n, gap = 0.35, o = {}) {
  for (let i = 0; i < n; i++) setTimeout0(i * gap, () => spawn('seeker', { x: rand(-60, 60), y: rand(-30, 30), z: 230, ...o }));
}
function rocks(n, z0 = 200, span = 220, big = false) {
  for (let i = 0; i < n; i++) {
    const x = rand(-26, 26), y = rand(-14, 14);
    spawn('rock', { x, y, z: z0 + rand(0, span), vx: rand(-1.5, 1.5), vy: rand(-1, 1), path: 'world', scale: big ? rand(3.6, 5.2) : undefined });
  }
}
function turrets(n, gap = 0.9) {
  for (let i = 0; i < n; i++) setTimeout0(i * gap, () => {
    const side = i % 2 ? 1 : -1;
    spawn('turret', { x: side * 25, y: rand(-14, 14), z: 290, path: 'world' });
  });
}
function wall(gx, gy, gr = 8.5) { spawnWall(gx, gy, gr, 300); }

// ステージ時間依存の遅延実行
let pending = [];
export function setTimeout0(delay, fn) { if (delay <= 0) fn(); else pending.push({ t: G.st + delay, fn }); }
export function updatePending() {
  for (let i = pending.length - 1; i >= 0; i--) if (G.st >= pending[i].t) { const p = pending.splice(i, 1)[0]; p.fn(); }
}
export function clearPending() { pending = []; }

function E(list, t, fn) { list.push({ t, fn }); }

const BENDS = [
  (t) => [0.00026 * Math.sin(t * 0.11) + 0.00008 * Math.sin(t * 0.31), -0.00014 * Math.sin(t * 0.07 + 1)],
  (t) => [0.00034 * Math.sin(t * 0.13 + 1) , -0.00006 * Math.sin(t * 0.2)],
  (t) => [0.0003 * Math.sin(t * 0.09 + 2), -0.0002 * Math.sin(t * 0.1) - 0.00004],
];

export function buildStage(idx) {
  const ev = [];
  const st = { idx, events: ev, bend: BENDS[idx], boss: ['warden', 'leviathan', 'core'][idx], bossAt: 0 };
  if (idx === 0) {
    Object.assign(st, { name: 'STAGE 1', sub: 'OUTER BELT', theme: 'belt', music: 1 });
    E(ev, 3, () => hoverV('drone', dn(5), 0, 5, 80, { noFire: true }));
    E(ev, 9, () => swoop('drone', dn(5), -1, 6));
    E(ev, 15, () => rocks(dn(7), 220, 160));
    E(ev, 19, () => { swoop('drone', dn(4), 1, 8, 0.4); swoop('drone', dn(4), -1, -4, 0.4); });
    E(ev, 27, () => hoverV('fighter', 2, 0, 4, 90));
    E(ev, 34, () => mines(dn(4)));
    E(ev, 40, () => ringLoop('drone', dn(6), 0, 2, 22));
    E(ev, 48, () => { rocks(dn(10), 200, 220); swoop('drone', dn(3), 1, 5); });
    E(ev, 56, () => { hoverV('fighter', dn(3), 0, 5, 95); seekers(dn(2)); });
    E(ev, 66, () => spawnBomber(0, 4, 28));
    E(ev, 80, () => { charge('fighter', dn(4), 0.6); });
    E(ev, 86, () => mines(dn(5)));
    E(ev, 94, () => { swoop('drone', dn(5), 1, 8); swoop('drone', dn(5), -1, 0); seekers(dn(3), 0.5); });
    st.bossAt = 106;
  } else if (idx === 1) {
    Object.assign(st, { name: 'STAGE 2', sub: 'STATION TRENCH', theme: 'trench', music: 2 });
    E(ev, 2, () => turrets(dn(4)));
    E(ev, 8, () => hoverV('drone', dn(5), 0, 3, 85));
    E(ev, 14, () => wall(rand(-8, 8), rand(-4, 4), 9));
    E(ev, 18, () => { turrets(dn(5), 0.7); seekers(dn(2), 0.5); });
    E(ev, 25, () => { hoverV('fighter', dn(3), 0, 4, 95); });
    E(ev, 31, () => { wall(-9, 3, 8.5); setTimeout0(2.2, () => wall(9, -3, 8.5)); });
    E(ev, 38, () => { mines(dn(5), 22); });
    E(ev, 44, () => spawnBomber(0, 3, 30));
    E(ev, 52, () => { turrets(dn(6), 0.6); });
    E(ev, 60, () => { wall(0, 5, 8); setTimeout0(2, () => wall(-6, -5, 8)); setTimeout0(4, () => wall(7, 2, 8)); });
    E(ev, 68, () => { charge('fighter', dn(5), 0.5); seekers(dn(3), 0.4); });
    E(ev, 78, () => ringLoop('drone', dn(8), 0, 0, 24));
    E(ev, 86, () => { turrets(dn(4), 0.5); mines(dn(4), 20); });
    E(ev, 94, () => spawnBomber(0, 2, 28));
    E(ev, 104, () => { wall(8, 4, 8); setTimeout0(1.8, () => wall(-8, -4, 8)); seekers(dn(4), 0.4); });
    st.bossAt = 118;
  } else {
    Object.assign(st, { name: 'STAGE 3', sub: 'DREADNOUGHT', theme: 'city', music: 3 });
    E(ev, 2, () => { swoop('fighter', dn(3), -1, 6, 0.7); swoop('fighter', dn(3), 1, 6, 0.7); });
    E(ev, 10, () => ringLoop('drone', dn(8), 0, 3, 24));
    E(ev, 17, () => { seekers(dn(5), 0.3); wall(6, 3, 8.5); });
    E(ev, 25, () => spawnBomber(0, 4, 30));
    E(ev, 34, () => { charge('fighter', dn(6), 0.45); });
    E(ev, 41, () => { mines(dn(6), 24); });
    E(ev, 48, () => { hoverV('fighter', dn(5), 0, 5, 95); seekers(dn(3), 0.5); });
    E(ev, 57, () => { wall(-8, 2, 8); setTimeout0(1.8, () => wall(8, -3, 8)); setTimeout0(3.6, () => wall(0, 5, 8)); });
    E(ev, 66, () => { swoop('drone', dn(6), 1, 8, 0.3); swoop('drone', dn(6), -1, -3, 0.3); ringLoop('drone', dn(6), 0, 2, 20); });
    E(ev, 76, () => { spawnBomber(-14, 4, 28); spawnBomber(14, 2, 28); });
    E(ev, 92, () => { charge('fighter', dn(5), 0.4); seekers(dn(5), 0.3); });
    E(ev, 100, () => { mines(dn(6), 22); wall(rand(-8, 8), rand(-4, 4), 8.5); });
    E(ev, 108, () => { hoverV('fighter', dn(5), 0, 5, 95); swoop('drone', dn(5), 1, 6); });
    st.bossAt = 120;
  }
  ev.sort((a, b) => a.t - b.t);
  return st;
}
