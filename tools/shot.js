// ヘッドレス Chromium で動作確認 (スクリーンショット + エラー収集)
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');
const OUT = process.env.SHOTS || '/tmp/shots';
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const exe = fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined;
  const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--enable-webgl'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 600 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await page.goto('file://' + path.resolve(__dirname, '../game/dist/index.html'));
  await page.waitForTimeout(1500);
  const script = process.argv[2] ? require(path.resolve(process.argv[2])) : null;
  const shot = async (name) => { await page.screenshot({ path: path.join(OUT, name + '.png') }); };
  if (script) await script({ page, shot, errs });
  else { await shot('title'); }
  const le = await page.evaluate(() => window.__lastError || null);
  console.log('lastError:', le);
  console.log('errors:', errs.slice(0, 10));
  await browser.close();
})();
