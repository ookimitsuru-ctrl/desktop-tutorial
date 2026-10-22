// 大会を最初から最後まで通しでプレーする（短い試合時間・高速）
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
const root = new URL('../../app/src/main/assets/game/', import.meta.url).pathname;
const out = process.argv[2] || '.';
const server = createServer((req, res) => {
  const p = join(root, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' }[extname(p)] || 'application/octet-stream' });
  res.end(readFileSync(p));
}).listen(0);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 800, height: 360 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(`${e.message}\n${e.stack}`));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
await page.goto(`http://localhost:${server.address().port}/index.html?test=1&quality=low&half=0.3&replays=0`);
await page.waitForTimeout(2500);
const clickBtn = async (text) => {
  const ok = await page.evaluate((t) => {
    const els = [...document.querySelectorAll('.btn, .mbtn')].filter((e) => e.textContent.includes(t));
    const el = els[els.length - 1];
    if (!el) return false;
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 }));
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }));
    return true;
  }, text);
  await page.waitForTimeout(400);
  return ok;
};
const info = () => page.evaluate(() => window.__test.info());
await page.evaluate(() => { localStorage.clear(); window.__app.showMenu(); });
await page.waitForTimeout(500);
console.log('wc', await clickBtn('ワールドカップ'));
console.log('pick', await clickBtn('このチームで出場'));
for (let match = 0; match < 4; match++) {
  console.log('--- match', match + 1, 'play', await clickBtn('試合へ'), 'kick', await clickBtn('キックオフ'));
  await page.evaluate(() => { window.__test.step(20); window.__test.skipIntro(); });
  let guard = 0;
  while (guard++ < 400) {
    await page.evaluate(() => window.__test.step(300));
    const i = await info();
    if (i.overlay) {
      const txt = await page.evaluate(() => document.querySelector('.overlay')?.innerText.slice(0, 30).replace(/\s+/g, ' '));
      if (txt.includes('ハーフタイム')) { await clickBtn('後半開始'); continue; }
      if (txt.includes('FULL TIME')) { console.log('  FT', JSON.stringify(i.score)); await page.screenshot({ path: `${out}/t-ft${match}.png` }); await clickBtn('次へ'); break; }
    }
    if (i.shootout) {
      // PK: ユーザーのキックは中央付近へ
      const st = await page.evaluate(() => { const s = window.__app.shootout; return s ? s.state + (s.userKick ? ':kick' : '') : null; });
      if (st === 'aim:kick') await page.evaluate(() => { window.__test.button('shoot', true); window.__test.button('shoot', false, 0.3); });
      continue;
    }
    if (i.mode !== 'match') break;
  }
  await page.waitForTimeout(800);
  const scr = await page.evaluate(() => document.querySelector('.screen')?.className + ' ' + (document.querySelector('.overlay')?.innerText.slice(0, 40) ?? ''));
  console.log('  after:', scr.replace(/\s+/g, ' '));
  if (scr.includes('champion')) {
    await page.evaluate(() => window.__test.step(200));
    await page.evaluate(() => window.__test.render());
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${out}/t-champ.png` });
    await clickBtn('次へ');
    await page.waitForTimeout(800);
  }
  const hubTxt = await page.evaluate(() => document.querySelector('table.standings')?.innerText.replace(/\s+/g, ' ') ?? '');
  if (hubTxt) console.log('  table:', hubTxt.slice(0, 160));
}
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/t-end.png` });
console.log('end overlay:', await page.evaluate(() => document.querySelector('.overlay')?.innerText.replace(/\s+/g, ' ') ?? 'none'));
console.log('errors:', errors.length ? errors.slice(0, 5).join('\n') : 'none');
await browser.close();
server.close();
