// 使用している文字を含むフォントのスライスだけを選んで assets に入れる
import { readFileSync, readdirSync, statSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function collectChars(dir, set = new Set()) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) collectChars(p, set);
    else if (/\.(js|css|html)$/.test(f)) for (const ch of readFileSync(p, 'utf8')) set.add(ch.codePointAt(0));
  }
  return set;
}

function parseFaces(css) {
  const faces = [];
  const re = /@font-face\s*{([^}]*)}/g;
  let m;
  while ((m = re.exec(css))) {
    const body = m[1];
    const file = /url\(\.\/files\/([^)]+\.woff2)\)/.exec(body)?.[1];
    const range = /unicode-range:\s*([^;]+);/.exec(body)?.[1];
    if (!file || !range) continue;
    const ranges = range.split(',').map((r) => {
      const s = r.trim().replace(/^U\+/i, '');
      const [a, b] = s.split('-');
      return [parseInt(a, 16), parseInt(b ?? a, 16)];
    });
    faces.push({ file, range: range.trim(), ranges });
  }
  return faces;
}

export function buildFonts(srcDir, nodeModules, outDir) {
  const used = collectChars(srcDir);
  for (let c = 0x20; c < 0x7f; c++) used.add(c);
  mkdirSync(outDir, { recursive: true });
  const specs = [
    { pkg: '@fontsource/m-plus-1p', family: 'MPLUS1p', weights: [500, 800], css: (w) => `${w}.css` },
    { pkg: '@fontsource/barlow-condensed', family: 'BarlowC', weights: [600, 800], css: (w) => `latin-${w}.css` },
  ];
  let out = '';
  let bytes = 0;
  let files = 0;
  for (const spec of specs) {
    const base = join(nodeModules, spec.pkg);
    for (const w of spec.weights) {
      const faces = parseFaces(readFileSync(join(base, spec.css(w)), 'utf8'));
      for (const f of faces) {
        const hit = [...used].some((c) => f.ranges.some(([a, b]) => c >= a && c <= b));
        if (!hit) continue;
        copyFileSync(join(base, 'files', f.file), join(outDir, f.file));
        bytes += statSync(join(outDir, f.file)).size;
        files++;
        out += `@font-face{font-family:'${spec.family}';font-style:normal;font-display:swap;font-weight:${w};src:url(./${f.file}) format('woff2');unicode-range:${f.range};}\n`;
      }
    }
  }
  writeFileSync(join(outDir, 'fonts.css'), out);
  return { files, bytes };
}
