// Kotlin (ネイティブ Android) 版のデータ書き出し:  node tools/export-kotlin-data.mjs
//   Web 版のコース定義 (src/tracks.js, src/variants/original/tracks.js) と版設定を JSON にして
//   android/app/src/<main|original>/assets/ に置く。コースを変えたら実行し直す。
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const strip = h => h.replace(/&nbsp;/g, ' ').replace(/<br>/g, '\n').replace(/<\/p>\s*<p>/g, '\n\n').replace(/<[^>]+>/g, '').replace(/[ \t]+\n/g, '\n').trim();
for (const [v, dir] of [['main', 'main'], ['original', 'original']]) {
  const { TRACKS } = await import(v === 'main' ? '../src/tracks.js' : '../src/variants/original/tracks.js');
  const { VARIANT } = await import(v === 'main' ? '../src/variant.js' : '../src/variants/original/variant.js');
  const out = path.join(root, 'android/app/src', dir, 'assets'); fs.mkdirSync(out, { recursive: true });
  const tracks = Object.values(TRACKS).map(t => ({ ...t, raceline: t.raceline ? Array.from(t.raceline) : null }));
  fs.writeFileSync(path.join(out, 'tracks.json'), JSON.stringify(tracks));
  fs.writeFileSync(path.join(out, 'variant.json'), JSON.stringify({ ...VARIANT, tag: strip(VARIANT.tag), credits: strip(VARIANT.credits) }));
  console.log(v, tracks.map(t => t.id).join(','), (fs.statSync(path.join(out, 'tracks.json')).size / 1024).toFixed(0) + 'KB');
}
