// ゲームプレイの一部を 30fps でコマ送り撮影 (自動操縦)
// 使い方: node tools/clip_capture.js <出力フォルダ> <面 0-3> <開始秒 (ステージ時刻)> <長さ秒> [難易度 0-2] [nofire]
//   nofire: 自動操縦は撃たずに避けるだけ (敵や岩の動きを見せたい時)
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');
const [OUT, SIDX, FROM, LEN, DIFF, NOFIRE] = [process.argv[2], +process.argv[3], +process.argv[4], +process.argv[5], +(process.argv[6] || 1), process.argv[7] === 'nofire'];
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
  // 時間を減速させるオーバードライブは使わない (曲と映像の時刻を一致させるため)
  const st0 = await page.evaluate(([idx, from, diff, nofire]) => {
    const { G, startStage, step } = window.__sw;
    G.freeze = true; G.gfx.setScale(1); G.settings.vib = false; G.diff = diff;
    startStage(idx, true); G.auto = true; G.hintT = 0; G.tutorialDone = true; G.noFlow = true; G.noFire = nofire;
    while (G.st < from - 1.0) { G.invuln = 99; G.shield = 100; step(1, 1 / 60, 0); }
    while (G.st < from) { G.invuln = 99; G.shield = 100; step(1, 1 / 60, 1); }   // 残光を整える
    G.banner = null;
    return G.st;
  }, [SIDX, FROM, DIFF, NOFIRE]);
  const n = Math.round(LEN * FPS);
  for (let i = 0; i < n; i++) {
    const url = await page.evaluate(() => {
      const { G, step } = window.__sw;
      if (G.state === 'play') { G.invuln = 99; G.shield = 100; G.hintT = 0; }
      step(1, 1 / 30, 1);
      return document.getElementById('c').toDataURL('image/jpeg', 0.93);
    });
    fs.writeFileSync(path.join(OUT, 'frames', String(i).padStart(5, '0') + '.jpg'), Buffer.from(url.split(',')[1], 'base64'));
  }
  fs.writeFileSync(path.join(OUT, 'clip.json'), JSON.stringify({ fps: FPS, from: st0, frames: n }));
  console.log('from', st0.toFixed(3), 'frames', n);
  await browser.close();
})();
