// オリジナル版 (架空サーキット) の設定。tools/build.mjs --variant original で src/variant.js の代わりに使われる。
export const VARIANT = {
  id: 'original',
  tag: 'BAYSIDE &nbsp;·&nbsp; MISTRAL &nbsp;·&nbsp; HORIZON &nbsp;·&nbsp; 1990 F1 &nbsp;·&nbsp; OK-90',
  storageKey: 'okracing.original.v1',
  orientation: 'landscape',
  // 自車 (OK RACING) は水色のカラーリング。似た色のチーム (ミラージュ) は入れ替える
  teams: {
    ok: { c1: '#4fc3ea', c2: '#10304f', c3: '#ffffff' },
    mrg: { c1: '#ff8a3d', c2: '#1d1d1d', c3: '#ffffff' },
  },
  credits: `
    <p><b>Formula simulator Original</b> — 架空のサーキットを舞台にした見下ろし型F1レーシングシミュレーター。チーム「OK RACING」、マシン「OK-90」および登場するチーム名・ドライバー名はすべて架空のものです。</p>
    <p><b>サーキット</b><br>ベイサイド・スーパースピードウェイ、ミストラル・テクニカルパーク、ホライゾン・ハイスピードサーキットはすべて本作のための架空のコースです。実在のサーキットの図面・測量データ・地図データは使用しておらず、直線と曲線を組み合わせて本作で設計しました。</p>
    <p>本作はいかなる実在のサーキット、レース主催者・チームとも関係ありません。</p>`,
};
