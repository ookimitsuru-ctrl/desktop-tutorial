// 配布用ビルド:  node tools/build.mjs [--variant original]
//   dist/index.html      … JS/CSS を1ファイルに埋め込んだ単体版 (WebView / file:// でも動作)
//   dist/ 以下にマニフェスト・アイコン・Service Worker をコピー
//   --variant original   … 架空サーキットのオリジナル版を dist-original/ に書き出す
//                          (src/tracks.js と src/variant.js を src/variants/original/ の同名ファイルに差し替え、
//                           アクセント色・タイトル・アイコンを水色の版に置き換える)
import { build } from 'esbuild'; import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vi = process.argv.indexOf('--variant'), variant = vi > 0 ? process.argv[vi + 1] : '';
const VARIANTS = {
  original: {
    title: 'Formula simulator Original',
    accent: ['#2fb3e3', '47,179,227'],                 // UI のアクセント色 (標準版はオレンジ #f47a1f)
    icons: 'src/variants/original/icons',
    manifest: { name: 'Formula simulator Original', short_name: 'Formula Original', description: '架空のサーキットを舞台にした見下ろし型F1レーシングシミュレーター' },
    cache: 'okracing-original',
  },
};
const V = variant ? VARIANTS[variant] : null;
if (variant && !V) throw new Error('不明な版: ' + variant);
const dist = path.join(root, variant ? 'dist-' + variant : 'dist');
fs.rmSync(dist, { recursive: true, force: true }); fs.mkdirSync(path.join(dist, 'icons'), { recursive: true });

// 版の差し替え: src/ 直下からの './tracks.js' と './variant.js' の読み込みを、版のディレクトリの同名ファイルへ向ける
const swap = {
  name: 'variant-swap',
  setup(b) {
    if (!variant) return;
    b.onResolve({ filter: /^\.\/(tracks|variant)\.js$/ }, args => {
      if (path.dirname(args.importer) !== path.join(root, 'src')) return undefined;
      return { path: path.join(root, 'src/variants', variant, path.basename(args.path)) };
    });
  },
};
const r = await build({ entryPoints: [path.join(root, 'src/main.js')], bundle: true, minify: true, format: 'iife', target: ['es2017'], write: false, legalComments: 'none', charset: 'utf8', plugins: [swap] });
const js = r.outputFiles[0].text.replace(/<\/script/g, '<\\/script');
let css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
if (V) {
  css = css.split('#f47a1f').join(V.accent[0]).replace(/rgba\(244, ?122, ?31/g, `rgba(${V.accent[1]}`);
  html = html.replace('<title>Formula simulator</title>', `<title>${V.title}</title>`);
}
html = html.replace('<link rel="stylesheet" href="style.css">', () => `<style>${css}</style>`).replace('<script type="module" src="src/main.js"></script>', () => `<script>${js}</script>`);
fs.writeFileSync(path.join(dist, 'index.html'), html);
if (V) {
  const m = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
  Object.assign(m, V.manifest); fs.writeFileSync(path.join(dist, 'manifest.webmanifest'), JSON.stringify(m));
  fs.writeFileSync(path.join(dist, 'sw.js'), fs.readFileSync(path.join(root, 'sw.js'), 'utf8').replace(/const CACHE = '([^']*)'/, (_, c) => `const CACHE = '${V.cache}-${c}'`));
} else for (const f of ['manifest.webmanifest', 'sw.js']) fs.copyFileSync(path.join(root, f), path.join(dist, f));
const iconDir = path.join(root, V ? V.icons : 'icons');
for (const f of fs.readdirSync(iconDir)) if (/\.(png|svg)$/.test(f)) fs.copyFileSync(path.join(iconDir, f), path.join(dist, 'icons', f));
// 版の取り違え防止: オリジナル版に実在サーキットの名前が残っていないか確認する
if (V) { const bad = ['鈴鹿', 'SUZUKA', '富士', 'FUJI', 'インディ', 'INDY', 'TUMFTM'].filter(w => html.includes(w)); if (bad.length) throw new Error('オリジナル版に実在の名称が含まれている: ' + bad.join(', ')); }
console.log(path.relative(root, path.join(dist, 'index.html')), (html.length / 1024).toFixed(0), 'KB');
