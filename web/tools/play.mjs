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
if (scenario === 'basic' || scenario === 'pk') {
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
console.log(logs.slice(0, 20).join('\n'));
await browser.close();
server.close();
