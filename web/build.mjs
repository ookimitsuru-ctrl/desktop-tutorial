// ゲーム本体をバンドルして Android の assets/game に出力する
import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { buildFonts } from './fonts.mjs';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dev = process.argv.includes('--dev');
const outDir = join(here, '..', 'app', 'src', 'main', 'assets', 'game');

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

await esbuild.build({
  entryPoints: [join(here, 'src', 'main.js')],
  bundle: true,
  format: 'iife',
  target: ['chrome90'],
  minify: !dev,
  sourcemap: dev ? 'inline' : false,
  outfile: join(outDir, 'game.js'),
  define: { __DEV__: dev ? 'true' : 'false' },
  loader: { '.css': 'text' },
  logLevel: 'info',
});

cpSync(join(here, 'index.html'), join(outDir, 'index.html'));
const fontInfo = buildFonts(join(here, 'src'), join(here, 'node_modules'), join(outDir, 'fonts'));
console.log(`fonts: ${fontInfo.files} files, ${(fontInfo.bytes / 1024).toFixed(0)} KB`);

console.log(`built -> ${outDir}`);
