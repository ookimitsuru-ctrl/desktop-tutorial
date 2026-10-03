// PV 用: ゲームを 30fps でコマ送り撮影して JPEG 連番を書き出す
// 使い方: node tools/pv_capture.js <出力フォルダ>
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');
const OUT = process.argv[2] || '/tmp/pv';
const FPS = 30;
fs.mkdirSync(path.join(OUT, 'frames'), { recursive: true });
(async () => {
  const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const browser = await chromium.launch({ executablePath: fs.existsSync(exe) ? exe : undefined, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })).newPage();
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.goto('file://' + path.resolve(__dirname, '../game/dist/index.html'));
  await page.waitForTimeout(800);
  await page.mouse.click(10, 10);
  await page.waitForTimeout(2500);
  await page.evaluate(() => { const G = window.__sw.G; G.freeze = true; G.gfx.setScale(1); G.settings.vib = false; });
  let idx = 0;
  const segs = [];
  const grab = async (sec, label) => {
    const n = Math.round(sec * FPS);
    for (let i = 0; i < n; i++) {
      const url = await page.evaluate(() => {
        const { G, step } = window.__sw;
        if (G.state === 'play') { G.invuln = 99; G.shield = 100; G.hintT = 0; }
        step(1, 1 / 30, 1);
        return document.getElementById('c').toDataURL('image/jpeg', 0.93);
      });
      fs.writeFileSync(path.join(OUT, 'frames', String(idx++).padStart(5, '0') + '.jpg'), Buffer.from(url.split(',')[1], 'base64'));
    }
    segs.push({ label, frames: n });
    console.log(label, n, 'frames');
  };
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const ff = (sec) => ev((s) => { const { G, step } = window.__sw; for (let k = 0; k < s * 60; k++) { if (G.state === 'play') { G.invuln = 99; G.shield = 100; } step(1, 1 / 60, 0); } G.gfx.clearTrails(); }, sec);

  // 1) オープニング (ブートログ → ロゴ一筆書き → 着地)
  await ev(() => { const { G, setState } = window.__sw; setState('title'); G.titleReady = true; G.opT = 0.5; G.opSlammed = false; G.opStroke = -1; G.menu = 'main'; });
  await grab(3.7, 'op');
  // 2) ステージ1: ワープイン → 戦闘
  const stage = async (idx, intro, jump, fight, label) => {
    await ev((i) => { const { G, startStage } = window.__sw; startStage(i, true); G.auto = true; G.hintT = 0; G.tutorialDone = true; }, idx);
    await grab(intro, label + '_intro');
    await ff(jump);
    await grab(fight, label);
  };
  await stage(0, 1.4, 51.4, 3.0, 's1');
  await stage(1, 1.2, 89.8, 2.6, 's2');
  await stage(2, 1.2, 81.8, 2.4, 's3');
  // 3) 最終ボス
  await ev(() => { const { G, startStage, spawnBoss } = window.__sw; startStage(2, true); G.auto = true; G.hintT = 0; G.banner = null; G.stage.events.length = 0; G.stage.bossAt = 1e9; G.warp = 0; G.bossState = 2; spawnBoss('core'); });
  await ff(9);
  await grab(2.8, 'boss');
  await ev(() => { const { G, damage } = window.__sw; for (const p of G.boss.parts) { p.armored = false; damage(p, 9999, 'x'); } });
  await grab(2.2, 'boss_die');
  // 4) エンドカード: ロゴ着地
  await ev(() => { const { G, setState } = window.__sw; setState('title'); G.titleReady = true; G.opT = 2.95; G.opSlammed = false; G.opStroke = -1; G.menu = 'main'; });
  await grab(1.4, 'end');
  fs.writeFileSync(path.join(OUT, 'segments.json'), JSON.stringify({ fps: FPS, segs }, null, 1));
  console.log('total', idx, 'frames', (idx / FPS).toFixed(2), 's');
  await browser.close();
})();
