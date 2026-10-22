// ヘッドレスChromiumでゲームを開いてスクリーンショットを撮るテスト用スクリプト
// usage: node tools/shot.mjs <query> <out.png> [waitMs] [w] [h]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

const root = new URL('../../app/src/main/assets/game/', import.meta.url).pathname;
const [query = '', out = 'shot.png', waitMs = '3000', w = '1200', h = '540', dpr = '2'] = process.argv.slice(2);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png' };
const server = createServer((req, res) => {
  const p = join(root, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream' });
  res.end(readFileSync(p));
}).listen(0);
const port = server.address().port;
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
});
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: +dpr });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto(`http://localhost:${port}/index.html?${query}`);
await page.waitForTimeout(+waitMs);
await page.screenshot({ path: out });
const info = await page.evaluate(() => JSON.stringify(window.__testInfo ?? window.__ok ?? null));
console.log(logs.slice(-40).join('\n'));
console.log('info:', info);
await browser.close();
server.close();
