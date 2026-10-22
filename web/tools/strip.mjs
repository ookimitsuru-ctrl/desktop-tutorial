// 実際の3D画面で、ボール周辺を一定間隔で切り出して並べる（動きの確認用）
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
const root = new URL('../../app/src/main/assets/game/', import.meta.url).pathname;
const [out = '.', startSec = '20', n = '12', interval = '0.4', venue = '2', prefix = 'strip'] = process.argv.slice(2);
const server = createServer((req, res) => {
  const p = join(root, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' }[extname(p)] || 'application/octet-stream' });
  res.end(readFileSync(p));
}).listen(0);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 900, height: 405 }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(`http://localhost:${server.address().port}/index.html?test=1&quality=high&half=3`);
await page.waitForTimeout(2500);
await page.evaluate((v) => { window.__test.quick('SOL', 'VAL', v, false, null); }, +venue);
await page.evaluate(() => { window.__test.step(30); window.__test.skipIntro(); window.__test.step(Math.round(60 * 1)); });
await page.evaluate((s) => window.__test.step(Math.round(60 * s)), +startSec);
await page.evaluate(() => { const c = window.__app.controls; if (c) c.setVisible(false); window.__app.hud.setVisible(false); });
for (let i = 0; i < +n; i++) {
  await page.evaluate((k) => window.__test.step(k), Math.round(60 * +interval));
  await page.evaluate(() => window.__test.render());
  const b = await page.evaluate(() => { const m = window.__app.mv.match; const p = window.__test.project(m.ball.x, m.ball.y, m.ball.z); return { p, phase: m.phase }; });
  await page.screenshot({ path: `${out}/${prefix}${i}.png` });
  console.log(i, JSON.stringify(b));
}
await browser.close();
server.close();
