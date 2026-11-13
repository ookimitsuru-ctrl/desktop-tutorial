// 配布用ビルド:  node tools/build.mjs
//   dist/index.html      … JS/CSS を1ファイルに埋め込んだ単体版 (WebView / file:// でも動作)
//   dist/ 以下にマニフェスト・アイコン・Service Worker をコピー
import { build } from 'esbuild'; import fs from 'fs'; import path from 'path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..'), dist = path.join(root, 'dist');
fs.rmSync(dist, { recursive: true, force: true }); fs.mkdirSync(path.join(dist, 'icons'), { recursive: true });
const r = await build({ entryPoints: [path.join(root, 'src/main.js')], bundle: true, minify: true, format: 'iife', target: ['es2017'], write: false, legalComments: 'none' });
const js = r.outputFiles[0].text.replace(/<\/script/g, '<\\/script');
const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
html = html.replace('<link rel="stylesheet" href="style.css">', () => `<style>${css}</style>`).replace('<script type="module" src="src/main.js"></script>', () => `<script>${js}</script>`);
fs.writeFileSync(path.join(dist, 'index.html'), html);
for (const f of ['manifest.webmanifest', 'sw.js']) fs.copyFileSync(path.join(root, f), path.join(dist, f));
for (const f of fs.readdirSync(path.join(root, 'icons'))) fs.copyFileSync(path.join(root, 'icons', f), path.join(dist, 'icons', f));
console.log('dist/index.html', (html.length / 1024).toFixed(0), 'KB');
