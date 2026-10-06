// モーショングラフィック PV 用の素材クリップを一括撮影 (1280x720, 30fps)
// 使い方: node tools/mg_capture.js <出力フォルダ>   → <出力>/<クリップ名>/00000.jpg ...
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');
const OUT = process.argv[2] || '/tmp/mg';
const FPS = 30;
(async () => {
  const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const browser = await chromium.launch({ executablePath: fs.existsSync(exe) ? exe : undefined, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })).newPage();
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.goto('file://' + path.resolve(__dirname, '../game/dist/index.html'));
  await page.waitForTimeout(800);
  await page.mouse.click(10, 10);
  await page.waitForTimeout(2500);
  await page.evaluate(() => { const G = window.__sw.G; G.freeze = true; G.gfx.setScale(1); G.settings.vib = false; G.diff = 1; });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  // 描画せずに早送り (残光を整えるため最後の 1 秒は描画)
  const ff = (sec) => ev((s) => {
    const { G, step } = window.__sw;
    const n = Math.round(s * 60);
    for (let k = 0; k < n; k++) { if (G.state === 'play') { G.invuln = 99; G.shield = 100; } step(1, 1 / 60, k > n - 60 ? 1 : 0); }
  }, sec);
  const grab = async (name, sec, perFrame) => {
    const dir = path.join(OUT, name);
    fs.mkdirSync(dir, { recursive: true });
    const n = Math.round(sec * FPS);
    for (let i = 0; i < n; i++) {
      const url = await page.evaluate(([i, pf]) => {
        const { G, step } = window.__sw;
        if (G.state === 'play') { G.invuln = 99; G.shield = 100; G.hintT = 0; G.banner = null; }  // ゲーム側の見出しは PV の文字と重なるので消す
        if (pf) (0, eval)(pf)(G, i);
        step(1, 1 / 30, 1);
        return document.getElementById('c').toDataURL('image/jpeg', 0.92);
      }, [i, perFrame ? perFrame.toString() : null]);
      fs.writeFileSync(path.join(dir, String(i).padStart(5, '0') + '.jpg'), Buffer.from(url.split(',')[1], 'base64'));
    }
    console.log(name, n);
  };
  const stage = (idx, opts = {}) => ev(([idx, o]) => {
    const { G, startStage } = window.__sw;
    startStage(idx, true); G.auto = true; G.hintT = 0; G.tutorialDone = true; G.noFlow = !o.flow; G.noFire = !!o.nofire;
  }, [idx, opts]);
  const boss = (idx, name) => ev(([idx, name]) => {
    const { G, startStage, spawnBoss } = window.__sw;
    startStage(idx, true); G.auto = true; G.hintT = 0; G.banner = null; G.noFlow = true; G.noFire = false;
    G.stage.events.length = 0; G.stage.bossAt = 1e9; G.warp = 0; G.bossState = 2; spawnBoss(name);
  }, [idx, name]);

  // オープニング (ロゴ一筆書き → 着地)
  await ev(() => { const { G, setState } = window.__sw; setState('title'); G.titleReady = true; G.opT = 0.5; G.opSlammed = false; G.opStroke = -1; G.menu = 'main'; });
  await grab('op', 3.9);
  // 各面
  await stage(0); await ff(50.5); await grab('s1', 3.2);
  await stage(0); await ff(93.5); await grab('s1b', 3.2);
  await stage(1, { flow: true }); await ff(59); await ev(() => { const G = window.__sw.G; G.flow = 100; G.pendingFlow = true; }); await grab('s2od', 3.2);
  await stage(1); await ff(30.5); await grab('s2', 3.2);
  await stage(2); await grab('warp', 3.2);
  await stage(2, { nofire: true }); await ff(68.4); await grab('err', 3.2);
  await stage(2); await ff(45.4); await grab('wall', 3.2);
  await stage(3); await ff(81.8); await grab('s4', 3.2);
  // ロール反射 (ボスの弾幕中に周期的にロール)
  await boss(3, 'core'); await ff(9);
  await grab('roll', 3.2, (G, i) => { if (i % 22 === 0) G.pendingRoll = (i / 22) % 2 ? 1 : -1; });
  // ボス 4 体
  await boss(0, 'warden'); await ff(6.5); await grab('warden', 2.6);
  await boss(1, 'leviathan'); await ff(6.5); await grab('leviathan', 2.6);
  await boss(2, 'maelstrom'); await ff(6.5); await grab('maelstrom', 2.6);
  await boss(3, 'core'); await ff(7); await grab('core', 2.6);
  // 撃破
  await ev(() => { const { G, damage } = window.__sw; for (const p of G.boss.parts) if (!p.core) damage(p, 9999, 'x'); });
  await ff(2);
  await ev(() => { const { G, damage } = window.__sw; const c = G.boss.parts.find((p) => p.core); c.armored = false; damage(c, 9999, 'missile'); });
  await grab('kill', 3.4);
  // エンディング映像 (船腹の並走 / 加速して通過)
  await ev(() => { const { G, startStage, finishStage } = window.__sw; startStage(3, true); finishStage(); });
  await ev(() => { const { G, step } = window.__sw; while (G.cine.t < 0.6) step(1, 1 / 60, 0); while (G.cine.t < 1.2) step(1, 1 / 60, 1); });
  await grab('hull', 3.6);
  await ev(() => { const { G, step } = window.__sw; while (G.cine.t < 18.6) step(1, 1 / 60, 0); while (G.cine.t < 19.2) step(1, 1 / 60, 1); });
  await grab('flyby', 3.4);
  await browser.close();
})();
