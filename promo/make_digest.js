// ゲーム画面のダイジェスト PV (字幕なし, 30 秒) を撮る: node promo/make_digest.js <出力フォルダ> [乱数の種]
//   <出力フォルダ>/frames/*.png (384x224) と audio.wav, plan.json を書き出す
//   動画にするには: 上 3 行・下 5 行を切って 384x216 にし, 5 倍に拡大して 1920x1080 にする (README 参照)
const { chromium } = require(process.env.PLAYWRIGHT || '/opt/node-tools/node_modules/playwright');
const fs = require('fs'), path = require('path');

async function openPage(browser, seed) {
  const page = await browser.newPage({ viewport: { width: 1152, height: 672 } });   // 内部解像度 384x224
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('console', m.text()); });
  await page.addInitScript(seed => {
    window.requestAnimationFrame = () => 0;      // ゲームの自動ループを止めて 1 コマずつ進める
    let s = seed;                                 // 2 回走っても同じ展開になるよう乱数を固定
    Math.random = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }, seed);
  await page.goto('file://' + path.resolve(__dirname, '../app/src/main/assets/index.html'));
  await page.waitForTimeout(600);
  await page.addScriptTag({ path: path.resolve(__dirname, 'pv_director.js') });
  await page.addScriptTag({ path: path.resolve(__dirname, 'digest_director.js') });
  return page;
}

(async () => {
  const out = process.argv[2], seed = +(process.argv[3] || 20261013);
  fs.mkdirSync(out + '/frames', { recursive: true });
  const browser = await chromium.launch();

  // 1 回目: 最後まで走って見どころを探す
  let page = await openPage(browser, seed);
  const t0 = Date.now();
  const plan = await page.evaluate(() => { const s = DG.scan(); const p = DG.plan(s); p.scan = { cps: s.cps, goF: s.goF, goalF: s.goalF, frames: s.frames, incidents: s.incidents }; return p; });
  console.log('scan', ((Date.now() - t0) / 1000).toFixed(1) + 's', JSON.stringify(plan.scan), 'starts', JSON.stringify(plan.starts));
  await page.close();
  if (plan.scan.goalF < 0) { console.log('ゴールまで走れなかった'); process.exit(1); }

  // 2 回目: 同じ走りでカットの区間だけ書き出す
  page = await openPage(browser, seed);
  await page.evaluate(p => DG.begin(p), { starts: plan.starts, B: plan.B });
  let n = 0;
  for (;;) {
    const r = await page.evaluate(() => DG.run(240));
    for (const f of r.frames) {
      fs.writeFileSync(`${out}/frames/${String(f.v).padStart(5, '0')}.png`, Buffer.from(f.url.split(',')[1], 'base64'));
      n++;
    }
    if (r.done) break;
  }
  const ev = await page.evaluate(() => DG.events());
  fs.writeFileSync(out + '/plan.json', JSON.stringify({ seed, plan, events: ev }, null, 1));
  console.log('frames', n, 'events', JSON.stringify(ev.map(e => [e.t.toFixed(2), e.name])));
  const a = await page.evaluate(() => DG.renderAudio());
  fs.writeFileSync(out + '/audio.wav', Buffer.from(a.wav, 'base64'));
  console.log('audio peak', a.peak.toFixed(3), 'total', ((Date.now() - t0) / 1000).toFixed(1) + 's');
  await browser.close();
})();
