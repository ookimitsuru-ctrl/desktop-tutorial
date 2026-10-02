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
console.log('built', fs.statSync(path.join(out, 'game.js')).size, 'bytes');
