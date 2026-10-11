// PV の撮影: node promo/make_pv.js <出力フォルダ> [every=1] [noAudio]
//   every>1 なら N フレームごとに保存 (確認用), 音は最後にオフライン合成して audio.wav へ
const { chromium } = require(process.env.PLAYWRIGHT || '/opt/node-tools/node_modules/playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const out = process.argv[2], every = +(process.argv[3] || 1), noAudio = process.argv[4] === 'noaudio';
  const FRAMES = 1800;
  fs.mkdirSync(out + '/frames', { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1152, height: 672 } });
  await page.addInitScript(() => {
    window.requestAnimationFrame = () => 0;      // ゲームの自動ループを止めて 1 コマずつ進める
    let s = 20261011;                             // 毎回同じ映像になるよう乱数を固定
    Math.random = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  });
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('console', m.text()); });
  await page.goto('file://' + path.resolve(__dirname, '../app/src/main/assets/index.html'));
  await page.waitForTimeout(600);
  await page.addScriptTag({ path: path.resolve(__dirname, 'pv_director.js') });
  await page.evaluate(() => PV.init());
  const t0 = Date.now();
  for (let i = 0; i < FRAMES; i++) {
    const cap = i % every === 0;
    const url = await page.evaluate(([i, cap]) => PV.frame(i, cap), [i, cap]);
    if (cap) fs.writeFileSync(`${out}/frames/${String(i).padStart(5, '0')}.png`, Buffer.from(url.split(',')[1], 'base64'));
  }
  console.log('frames done', ((Date.now() - t0) / 1000).toFixed(1) + 's');
  const ev = await page.evaluate(() => PV.events);
  fs.writeFileSync(out + '/events.json', JSON.stringify(ev));
  console.log('events', JSON.stringify(ev));
  if (!noAudio) {
    const a = await page.evaluate(() => PV.renderAudio());
    fs.writeFileSync(out + '/audio.wav', Buffer.from(a.wav, 'base64'));
    console.log('audio peak', a.peak.toFixed(3));
  }
  await browser.close();
})();
