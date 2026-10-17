// 確認: WebGL コンテキスト喪失でポーズになった時に音も止まり、再開で戻るか (エミュレータの APK で)
const { execFileSync } = require('child_process');
const { connect } = require('./cdp');
const ADB = process.env.ADB || '/root/android-sdk/platform-tools/adb';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  execFileSync(ADB, ['shell', 'am', 'force-stop', 'com.starwire.game']);
  execFileSync(ADB, ['shell', 'am', 'start', '-n', 'com.starwire.game/.MainActivity']);
  let c = null;
  for (let k = 0; k < 40 && !c; k++) {
    await sleep(5000);
    const m = execFileSync(ADB, ['shell', 'cat', '/proc/net/unix']).toString().match(/webview_devtools_remote_(\d+)/);
    if (!m) continue;
    execFileSync(ADB, ['forward', 'tcp:9222', 'localabstract:webview_devtools_remote_' + m[1]]);
    try { c = await connect(9222); if (!(await c.evaluate('!!window.__sw'))) { c.close(); c = null; } } catch (_) { c = null; }
  }
  // 音を有効化して 1 面を開始 (タッチの代わりに初期化を呼ぶ)
  await c.evaluate(`(() => { const { G, startStage } = window.__sw; G.audio.init(); G.audio.resume(); startStage(0, true); })()`);
  await sleep(8000);
  const before = await c.evaluate(`({ state: window.__sw.G.state, audio: window.__sw.G.audio.ctx.state })`);
  const lost = await c.evaluate(`(async () => { const gl = document.getElementById('c').getContext('webgl'); const ext = gl.getExtension('WEBGL_lose_context'); window.__loseExt = ext; ext.loseContext(); await new Promise((r) => setTimeout(r, 4000)); return { state: window.__sw.G.state, audio: window.__sw.G.audio.ctx.state, glLost: window.__sw.G.glLost, ext: !!ext }; })()`);
  const restored = await c.evaluate(`(async () => { const gl = window.__loseExt; window.__loseExt.restoreContext(); await new Promise((r) => setTimeout(r, 6000)); return { state: window.__sw.G.state, glLost: window.__sw.G.glLost }; })()`);
  // RESUME ボタンを実タップ
  const p = await c.evaluate(`(() => { const G = window.__sw.G, b = G.buttons.find((q) => q.id === 'resume'); const a = G.gfx.aspect; return b && [((b.x / a) + 1) / 2 * innerWidth * devicePixelRatio, (1 - b.y) / 2 * innerHeight * devicePixelRatio]; })()`);
  if (p) execFileSync(ADB, ['shell', 'input', 'tap', String(Math.round(p[0])), String(Math.round(p[1]))]);
  await sleep(8000);
  const resumed = await c.evaluate(`({ state: window.__sw.G.state, audio: window.__sw.G.audio.ctx.state, err: window.__lastError || null })`);
  console.log(JSON.stringify({ before, lost, restored, resumed }));
  c.close();
})().catch((e) => { console.log('ERR', e.message); process.exit(1); });
