// メニューを操作して試合まで進み、各段階のスクリーンショットを撮る
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
const root = new URL('../../app/src/main/assets/game/', import.meta.url).pathname;
const out = process.argv[2] || '.';
const script = process.argv[3] || 'wc';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };
const server = createServer((req, res) => {
  const p = join(root, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream' });
  res.end(readFileSync(p));
}).listen(0);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 900, height: 405 }, deviceScaleFactor: 2, hasTouch: false });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto(`http://localhost:${server.address().port}/index.html`);
const wait = (ms) => page.waitForTimeout(ms);
const shot = async (name) => { await page.screenshot({ path: `${out}/${name}.png` }); console.log('shot', name); };
const clickText = async (t) => { await page.getByText(t, { exact: false }).first().click(); await wait(700); };
await wait(5000);
await shot('f1-title');
await page.mouse.click(450, 200);
await wait(1200);
await shot('f2-menu');
if (script === 'wc') {
  await clickText('ワールドカップ');
  await shot('f3-select');
  await clickText('このチームで出場');
  await wait(800);
  await shot('f4-hub');
  await clickText('試合へ');
  await shot('f5-lineup');
  await clickText('キックオフ');
  await wait(2500);
  await shot('f6-intro');
  await wait(3000);
  await shot('f7-kickoff');
  // キックオフ（パス）→ 右へドリブル
  await page.keyboard.down('KeyJ'); await wait(100); await page.keyboard.up('KeyJ');
  await wait(2500);
  await page.keyboard.down('KeyD');
  await wait(2500);
  await shot('f8-play');
  await page.keyboard.up('KeyD');
  await wait(4000);
  await shot('f9-play2');
}
console.log(logs.slice(0, 30).join('\n'));
await browser.close();
server.close();
