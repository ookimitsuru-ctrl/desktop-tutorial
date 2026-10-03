// game/ → game/dist (esbuild で 1 ファイルにバンドル)
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'game', 'dist');
const watch = process.argv.includes('--debug');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
esbuild.buildSync({
  entryPoints: [path.join(root, 'game/src/main.js')],
  bundle: true, format: 'iife', target: ['chrome80'],
  minify: !watch, sourcemap: watch ? 'inline' : false,
  outfile: path.join(out, 'game.js'),
  legalComments: 'none',
});
fs.copyFileSync(path.join(root, 'game/index.html'), path.join(out, 'index.html'));
// BGM: file:// でも確実に読めるよう base64 の JS (window.__BGM[name]) として同梱
const assets = path.join(root, 'game/assets');
let bgm = 'window.__BGM={};';
if (fs.existsSync(assets)) {
  for (const f of fs.readdirSync(assets).sort()) {
    const m = f.match(/^bgm_(.+)\.ogg$/);
    if (m) bgm += 'window.__BGM[' + JSON.stringify(m[1]) + ']="' + fs.readFileSync(path.join(assets, f)).toString('base64') + '";';
  }
}
fs.writeFileSync(path.join(out, 'bgm.js'), bgm);
console.log('built', fs.statSync(path.join(out, 'game.js')).size, 'bytes');
