// テスト用フックで時間を進めながら、実際の操作を注入して試合をプレーする
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
const root = new URL('../../app/src/main/assets/game/', import.meta.url).pathname;
const out = process.argv[2] || '.';
const q = process.argv[3] || 'quality=low&half=1&test=1';
const scenario = process.argv[4] || 'basic';
const server = createServer((req, res) => {
  const p = join(root, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' }[extname(p)] || 'application/octet-stream' });
  res.end(readFileSync(p));
}).listen(0);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 900, height: 405 }, deviceScaleFactor: 2 });
const logs = [];
page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !m.text().includes('404')) logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto(`http://localhost:${server.address().port}/index.html?${q}`);
const wait = (ms) => page.waitForTimeout(ms);
await wait(2500);
const T = {
  step: (n) => page.evaluate((n) => window.__test.step(n), n),
  input: (x, y, mag, sprint) => page.evaluate(([x, y, m, s]) => window.__test.input(x, y, m, s), [x, y, mag, !!sprint]),
  btn: (name, down, hold) => page.evaluate(([n, d, h]) => window.__test.button(n, d, h), [name, down, hold || 0]),
  info: () => page.evaluate(() => window.__test.info()),
  shot: async (name) => { await page.evaluate(() => window.__test.render()); await wait(300); await page.screenshot({ path: `${out}/${name}.png` }); },
};
const tapBtn = async (n) => { await T.btn(n, true); await T.step(2); await T.btn(n, false, 0.05); };
const log = async (tag) => { const i = await T.info(); console.log(tag, JSON.stringify({ ph: i.phase, cl: i.clock, h: i.half, sc: i.score, ctrl: i.ctrl, own: i.owner, ot: i.ownerTeam, ball: i.ball, cp: i.ctrlPos })); return i; };
const knockout = scenario === 'pk';
await page.evaluate((k) => { window.__test.quick('JPN', 'NDG', 2, k); }, knockout);
await T.step(30);
await page.evaluate(() => window.__test.skipIntro());
await log('start');
await T.step(100); // 笛を待つ
await tapBtn('pass'); // キックオフ
await T.step(60);
await log('after kickoff');
if (scenario === 'basic') {
  // 右(攻撃方向)へドリブル → パス → シュート を繰り返す
  for (let r = 0; r < 14; r++) {
    const i = await T.info();
    if (i.phase !== 'play') { await T.step(60); continue; }
    if (i.ownerTeam === 0) {
      await T.input(1, (Math.random() - 0.5) * 0.6, 1, true);
      await T.step(70);
      const j = await T.info();
      if (j.ownerTeam === 0 && j.ball[0] > 30) { await T.btn('shoot', true); await T.step(30); await T.btn('shoot', false, 0.5); await log(`shoot r${r}`); }
      else if (j.ownerTeam === 0) { await tapBtn(r % 3 === 0 ? 'through' : 'pass'); await log(`pass r${r}`); }
      await T.step(40);
    } else {
      // 守備: ボールへ向かう
      const k = await T.info();
      const dx = k.ball[0] - (k.ctrlPos?.[0] ?? 0);
      const dz = k.ball[2] - (k.ctrlPos?.[1] ?? 0);
      const l = Math.hypot(dx, dz) || 1;
      await T.input(dx / l, -dz / l, 1, true);
      await T.step(50);
      if (r % 4 === 3) { await tapBtn('shoot'); await log(`slide r${r}`); }
      else if (r % 2) await tapBtn('through');
    }
    if (r === 5) await T.shot('p1');
  }
  await T.input(0, 0, 0);
  await T.shot('p2');
  // 前半終了まで進める
  for (let k = 0; k < 40; k++) { await T.step(120); const i = await T.info(); if (i.phase === 'halftime' || i.overlay) break; }
  await log('half');
  await wait(800);
  await T.shot('p3');
}
if (scenario === 'goal') {
  // ゴール前で強制的にシュート → ゴール → セレブレーション → リプレイ
  await page.evaluate(() => {
    const m = window.__app.mv.match;
    const st = m.teams[0].players[10];
    const gk = m.teams[1].players[0];
    st.x = 40; st.z = 4; st.facing = 0;
    for (const p of m.teams[1].players) if (!p.isGK) p.x = Math.min(p.x, 20);
    gk.x = 50; gk.z = -3;
    m.ball.owner = null; m.ball.place(40.6, 4);
    m.giveBall(st, true);
    m.setControlled(st);
  });
  await T.step(2);
  await T.btn('shoot', true); await T.step(20); await T.btn('shoot', false, 0.4);
  for (let k = 0; k < 6; k++) { await T.step(10); }
  await log('after shot');
  await T.shot('g0-shot');
  await T.step(60); await log('goal+1s'); await T.shot('g1-goal');
  await T.step(90); await T.shot('g2-celebrate');
  await T.step(120); await log('replay?'); await T.shot('g3-replay');
  await T.step(150); await T.shot('g4-replay2');
  for (let k = 0; k < 12; k++) { await T.step(60); const i = await T.info(); if (i.phase === 'kickoff') break; }
  await log('back to kickoff'); await T.shot('g5-kickoff');
}
if (scenario === 'pk') {
  // 試合終了まで進めて PK 戦
  await page.evaluate(() => { const m = window.__app.mv.match; m.half = 2; m.clock = m.settings.halfLength + 30; m.addedTime = 1; });
  for (let k = 0; k < 20; k++) { await T.step(60); const i = await T.info(); if (i.shootout) break; }
  await wait(2500);
  await log('shootout');
  await T.step(80); await T.shot('k1-setup');
  for (let kick = 0; kick < 12; kick++) {
    const st = await page.evaluate(() => { const s = window.__app.shootout; return s ? { state: s.state, user: s.userKick, keep: s.userKeep, res: s.results } : null; });
    if (!st) break;
    if (st.state === 'aim') {
      await T.input(kick % 2 ? 1 : -1, 0.3, 1);
      await T.step(25);
      await T.input(0, 0, 0);
      if (kick === 0) await T.shot('k2-aim');
      await T.btn('shoot', true); await T.btn('shoot', false, 0.4);
    } else if (st.keep && st.state === 'runup') {
      await T.input(kick % 3 ? 1 : -1, 0, 1);
    }
    await T.step(40);
    if (kick === 1) await T.shot('k3-flight');
    await T.step(160);
    console.log('pk', JSON.stringify(st.res));
  }
  await wait(1500);
  await log('after pk'); await T.shot('k4-result');
}
if (scenario === 'ceremony') {
  await page.evaluate(() => { const a = window.__app; a.startCeremony(a.mv.match.teams[0].data); });
  await T.step(120); await T.shot('c1');
  await T.step(240); await T.shot('c2');
}
console.log(logs.slice(0, 20).join('\n'));
await browser.close();
server.close();
