// 自動プレーモード（?autoplay=1）をブラウザで動かし、WSPERF の計測ログを JSONL に保存する
// 使い方: node tools/perfrun.mjs 出力.jsonl "difficulty=hard&quality=high&half=1" [タイムアウト秒] [幅x高さ@倍率]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { createServer } from 'node:http';
import { readFileSync, existsSync, appendFileSync } from 'node:fs';
import { join, extname } from 'node:path';

const root = new URL('../../app/src/main/assets/game/', import.meta.url).pathname;
const [out, query = 'quality=high&half=1', timeoutS = '900', view = '900x405@2'] = process.argv.slice(2);
const [, vw, vh, dpr] = view.match(/(\d+)x(\d+)@([\d.]+)/);
const server = createServer((req, res) => {
  const p = join(root, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!existsSync(p)) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, { 'content-type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' }[extname(p)] || 'application/octet-stream' });
  res.end(readFileSync(p));
}).listen(0);
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: +vw, height: +vh }, deviceScaleFactor: +dpr });
let done = false;
page.on('console', (m) => {
  const t = m.text();
  if (t.startsWith('WSPERF ')) {
    const o = JSON.parse(t.slice(7));
    appendFileSync(out, `${JSON.stringify({ query, ...o })}\n`);
    if (o.t === 'summary' || o.t === 'error' || o.t === 'stuck' || o.t === 'done' || o.t === 'shader') console.log(t.slice(7, 400));
    if (o.t === 'done') done = true;
  } else if (m.type() === 'error' && !t.includes('404')) {
    appendFileSync(out, `${JSON.stringify({ query, t: 'console-error', msg: t })}\n`);
    console.log('[console error]', t);
  }
});
page.on('pageerror', (e) => {
  appendFileSync(out, `${JSON.stringify({ query, t: 'pageerror', msg: `${e.message}\n${e.stack}` })}\n`);
  console.log('[pageerror]', e.message);
});
await page.goto(`http://localhost:${server.address().port}/index.html?autoplay=1&${query}`);
const t0 = Date.now();
while (!done && Date.now() - t0 < +timeoutS * 1000) await page.waitForTimeout(1000);
if (!done) appendFileSync(out, `${JSON.stringify({ query, t: 'timeout', seconds: +timeoutS })}\n`);
await browser.close();
server.close();
