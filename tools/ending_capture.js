// エンディング動画用: 最終ボス撃破の直前からエンディング映像の終わりまでを 30fps でコマ送り撮影
// 使い方: node tools/ending_capture.js <出力フォルダ>   → frames/*.jpg と timeline.json
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');
const OUT = process.argv[2] || '/tmp/ending';
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
  // 4 面のボス戦: 発生器を壊してコア露出まで早送り
  await page.evaluate(() => {
    const { G, startStage, spawnBoss, step, damage } = window.__sw;
    G.freeze = true; G.gfx.setScale(1); G.settings.vib = false;
    startStage(3, true); G.auto = true; G.hintT = 0; G.tutorialDone = true; G.banner = null; G.stage.events.length = 0; G.stage.bossAt = 1e9; G.warp = 0; G.bossState = 2;
    spawnBoss('core');
    for (let k = 0; k < 60 * 9; k++) { G.invuln = 99; G.shield = 100; step(1, 1 / 60, 0); }
    for (const p of G.boss.parts) if (!p.core) damage(p, 9999, 'x');
    for (let k = 0; k < 60 * 2.5; k++) { G.invuln = 99; G.shield = 100; step(1, 1 / 60, 0); }
    G.gfx.clearTrails();
  });
  let idx = 0;
  const tl = { fps: FPS };
  const grabFrame = async () => {
    const r = await page.evaluate(() => {
      const { G, step } = window.__sw;
      if (G.state === 'play') { G.invuln = 99; G.shield = 100; G.hintT = 0; }
      step(1, 1 / 30, 1);
      return { url: document.getElementById('c').toDataURL('image/jpeg', 0.93), state: G.state, bs: G.bossState, cine: G.cine && G.state === 'ending' ? G.cine.t : -1, dying: G.boss ? G.boss.dying : undefined };
    });
    fs.writeFileSync(path.join(OUT, 'frames', String(idx++).padStart(5, '0') + '.jpg'), Buffer.from(r.url.split(',')[1], 'base64'));
    return r;
  };
  // 1) 撃破直前の攻防 1.5 秒
  for (let i = 0; i < 1.5 * FPS; i++) await grabFrame();
  // 2) とどめ
  tl.kill = idx / FPS;
  await page.evaluate(() => { const { G, damage } = window.__sw; const c = G.boss.parts.find((p) => p.core); c.armored = false; damage(c, 9999, 'missile'); });
  // 3) 爆散 → ワープアウト → エンディング映像 (曲が鳴り終わるまで)
  for (let guard = 0; guard < 60 * FPS; guard++) {
    const r = await grabFrame();
    if (tl.defeat === undefined && r.bs === 3) tl.defeat = idx / FPS;
    if (tl.ending === undefined && r.state === 'ending') tl.ending = (idx - 1) / FPS;
    if (r.cine >= 40.8) break;  // エンディング曲の最後の和音が鳴り終わるまで
  }
  tl.frames = idx;
  fs.writeFileSync(path.join(OUT, 'timeline.json'), JSON.stringify(tl, null, 1));
  console.log(JSON.stringify(tl), (idx / FPS).toFixed(2), 's');
  await browser.close();
})();
