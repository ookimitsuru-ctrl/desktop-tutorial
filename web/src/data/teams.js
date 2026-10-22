import { makeRng } from '../util/math.js';

// 架空の4チーム（日本 + 架空の3か国）。選手もすべて架空。

const RAW = [
  {
    id: 'JPN',
    name: '日本',
    nameEn: 'NIPPON',
    nickname: 'サムライ・ブルー',
    formation: '4-2-3-1',
    style: { tempo: 0.8, directness: 0.35, width: 0.7, pressing: 0.75, shootiness: 0.45 },
    rating: { att: 80, mid: 84, def: 79, gk: 79 },
    kits: {
      home: { shirt: '#1b3f9e', shirt2: '#ffffff', shorts: '#ffffff', socks: '#1b3f9e', pattern: 5 },
      away: { shirt: '#f4f5f7', shirt2: '#1b3f9e', shorts: '#1b3f9e', socks: '#f4f5f7', pattern: 5 },
      gk: { shirt: '#ff7a1a', shirt2: '#1a1a1a', shorts: '#1a1a1a', socks: '#ff7a1a', pattern: 0 },
    },
    skin: ['#f1c9a5', '#e8bd96', '#f5d2b3', '#deb08a'],
    hair: ['#141010', '#1c1410', '#2a1d14', '#3a2616'],
    heights: [0.96, 1.02],
    crowdColors: ['#1b3f9e', '#ffffff'],
    flag: 'jpn',
    players: [
      ['高峰 蒼一', '高峰', 1, 'GK', { gk: 82 }],
      ['青葉 涼介', '青葉', 5, 'LB', { pace: 84 }],
      ['真壁 大和', '真壁', 3, 'CB', { defending: 82, physical: 78 }],
      ['黒川 剛志', '黒川', 4, 'CB', { defending: 80 }],
      ['早瀬 隼', '早瀬', 2, 'RB', { pace: 86 }],
      ['白石 陸', '白石', 6, 'DM', { passing: 84 }],
      ['柳 悠真', '柳', 8, 'DM', { passing: 85, stamina: 90 }],
      ['朝比奈 湊', '朝比奈', 14, 'LM', { pace: 88, dribbling: 84 }],
      ['天城 翔', '天城', 10, 'AM', { dribbling: 90, passing: 89, shooting: 84 }],
      ['風見 蓮', '風見', 7, 'RM', { pace: 89, dribbling: 86 }],
      ['神谷 颯', '神谷', 9, 'ST', { shooting: 86, pace: 85 }],
    ],
    bench: ['藤堂 光', '水城 健太', '桐生 樹', '小日向 暖', '宮守 泰河'],
  },
  {
    id: 'VAL',
    name: 'ヴァルドリア',
    nameEn: 'VALDORIA',
    nickname: 'ロッソ・レオーネ',
    formation: '4-3-3',
    style: { tempo: 0.65, directness: 0.55, width: 0.6, pressing: 0.6, shootiness: 0.6 },
    rating: { att: 85, mid: 83, def: 84, gk: 85 },
    kits: {
      home: { shirt: '#c41e2a', shirt2: '#f3c641', shorts: '#141414', socks: '#c41e2a', pattern: 1 },
      away: { shirt: '#14213d', shirt2: '#f3c641', shorts: '#14213d', socks: '#14213d', pattern: 0 },
      gk: { shirt: '#2ecc71', shirt2: '#0b3d20', shorts: '#0b3d20', socks: '#2ecc71', pattern: 0 },
    },
    skin: ['#e8bd96', '#d9a77d', '#f0c9a6', '#c68863'],
    hair: ['#1a120c', '#3a2616', '#5a3a22', '#141010'],
    heights: [0.98, 1.05],
    crowdColors: ['#c41e2a', '#f3c641'],
    flag: 'val',
    players: [
      ['ステファノ・ベランディ', 'ベランディ', 1, 'GK', { gk: 87 }],
      ['ニコラ・ファルコ', 'ファルコ', 3, 'LB', { pace: 80, defending: 82 }],
      ['ダリオ・コスタンツィ', 'コスタンツィ', 4, 'CB', { defending: 89, physical: 86 }],
      ['ロレンツォ・ヴァレンテ', 'ヴァレンテ', 5, 'CB', { defending: 86, physical: 88 }],
      ['エンツォ・マリーノ', 'マリーノ', 2, 'RB', { pace: 82 }],
      ['マッテオ・リッツァ', 'リッツァ', 8, 'CM', { passing: 86, stamina: 88 }],
      ['ジャコモ・ブレッサン', 'ブレッサン', 6, 'DM', { defending: 84, physical: 85 }],
      ['フィリッポ・オルシーニ', 'オルシーニ', 10, 'CM', { passing: 90, dribbling: 86 }],
      ['アレッシオ・カルダーノ', 'カルダーノ', 11, 'LW', { pace: 87, dribbling: 87 }],
      ['ルチアーノ・ドラーゴ', 'ドラーゴ', 9, 'ST', { shooting: 91, physical: 87 }],
      ['サンドロ・ペッレ', 'ペッレ', 7, 'RW', { pace: 88, shooting: 84 }],
    ],
    bench: ['ジーノ・タルディ', 'ピエトロ・ロンバ', 'ヴィットリオ・セッラ', 'ブルーノ・カッシ', 'エミリオ・ガッロ'],
  },
  {
    id: 'SOL',
    name: 'ソレスタ',
    nameEn: 'SOLESTA',
    nickname: 'ラ・カナリーナ',
    formation: '4-3-3',
    style: { tempo: 0.75, directness: 0.45, width: 0.85, pressing: 0.55, shootiness: 0.65 },
    rating: { att: 87, mid: 82, def: 78, gk: 80 },
    kits: {
      home: { shirt: '#ffd11a', shirt2: '#0b8a43', shorts: '#163d9c', socks: '#ffffff', pattern: 3 },
      away: { shirt: '#163d9c', shirt2: '#ffd11a', shorts: '#ffffff', socks: '#163d9c', pattern: 3 },
      gk: { shirt: '#8e2de2', shirt2: '#2a0845', shorts: '#2a0845', socks: '#8e2de2', pattern: 0 },
    },
    skin: ['#c68863', '#8d5a3b', '#e0ac85', '#5c3a26', '#a8714b'],
    hair: ['#120d0a', '#2a1d14', '#1a120c', '#3a2616'],
    heights: [0.95, 1.03],
    crowdColors: ['#ffd11a', '#0b8a43'],
    flag: 'sol',
    players: [
      ['エウゼビオ・カブラル', 'カブラル', 1, 'GK', { gk: 80 }],
      ['ジョルジ・ヴェラス', 'ヴェラス', 6, 'LB', { pace: 88, dribbling: 80 }],
      ['ティアゴ・モンテイロ', 'モンテイロ', 3, 'CB', { defending: 81 }],
      ['ラウール・バロス', 'バロス', 4, 'CB', { defending: 80, physical: 84 }],
      ['ダニーロ・パス', 'パス', 2, 'RB', { pace: 86 }],
      ['ヘナト・アルメイダ', 'アルメイダ', 8, 'CM', { passing: 84 }],
      ['フリオ・ベガ', 'ベガ', 5, 'DM', { defending: 82 }],
      ['イサック・ドラード', 'ドラード', 10, 'CM', { dribbling: 92, passing: 88, shooting: 86 }],
      ['カイオ・ルナ', 'ルナ', 11, 'LW', { pace: 92, dribbling: 91 }],
      ['マテウス・ソリアーノ', 'ソリアーノ', 9, 'ST', { shooting: 90, pace: 86 }],
      ['エミリオ・トレンテ', 'トレンテ', 7, 'RW', { pace: 90, dribbling: 88 }],
    ],
    bench: ['ガブリエル・ミラ', 'ルーカス・オンダ', 'ネルソン・クルース', 'ディエゴ・サラス', 'ヴィトール・ヘイス'],
  },
  {
    id: 'NDG',
    name: 'ノルデンガルド',
    nameEn: 'NORDENGARD',
    nickname: 'ヴァイキングス',
    formation: '4-4-2',
    style: { tempo: 0.55, directness: 0.75, width: 0.75, pressing: 0.65, shootiness: 0.55 },
    rating: { att: 79, mid: 78, def: 82, gk: 81 },
    kits: {
      home: { shirt: '#f2f4f7', shirt2: '#0d2b52', shorts: '#0d2b52', socks: '#f2f4f7', pattern: 2 },
      away: { shirt: '#111418', shirt2: '#2ec4b6', shorts: '#111418', socks: '#2ec4b6', pattern: 2 },
      gk: { shirt: '#f5c400', shirt2: '#1a1a1a', shorts: '#1a1a1a', socks: '#f5c400', pattern: 0 },
    },
    skin: ['#f5d6bc', '#f1c9a5', '#f8dcc4', '#e8bd96'],
    hair: ['#c9a35e', '#d9b77a', '#8a6a3a', '#5a3a22', '#e3c690'],
    heights: [1.0, 1.08],
    crowdColors: ['#f2f4f7', '#0d2b52'],
    flag: 'ndg',
    players: [
      ['ヘンリク・ダール', 'ダール', 1, 'GK', { gk: 83, physical: 85 }],
      ['ラスムス・フィエル', 'フィエル', 3, 'LB', { pace: 80 }],
      ['マグヌス・ホルム', 'ホルム', 4, 'CB', { defending: 85, physical: 90 }],
      ['トルビョルン・ヴィーク', 'ヴィーク', 5, 'CB', { defending: 84, physical: 89 }],
      ['ステン・ルンデ', 'ルンデ', 2, 'RB', { pace: 79 }],
      ['ヨーナス・リンド', 'リンド', 11, 'LM', { pace: 84, passing: 79 }],
      ['アクセル・ベルグ', 'ベルグ', 8, 'CM', { passing: 82, stamina: 90 }],
      ['イーヴァル・ソルハイム', 'ソルハイム', 6, 'CM', { defending: 82, physical: 86 }],
      ['ニルス・アーケルン', 'アーケルン', 7, 'RM', { pace: 83, dribbling: 80 }],
      ['エリク・ストランド', 'ストランド', 9, 'ST', { shooting: 87, physical: 90 }],
      ['オスカル・ニーダル', 'ニーダル', 10, 'ST', { shooting: 83, pace: 85 }],
    ],
    bench: ['ビョルン・セーテル', 'クヌート・ハーゲン', 'ペール・リュング', 'ウルフ・ノルド', 'ローアル・ベック'],
  },
];

const ROLE_OF = { GK: 'GK', LB: 'DF', CB: 'DF', RB: 'DF', LWB: 'MF', RWB: 'MF', DM: 'MF', CM: 'MF', LM: 'MF', RM: 'MF', AM: 'MF', LW: 'FW', RW: 'FW', ST: 'FW' };

function buildAttrs(team, pos, overrides, rng) {
  const r = team.rating;
  const role = ROLE_OF[pos];
  const base = role === 'FW' ? r.att : role === 'MF' ? r.mid : role === 'DF' ? r.def : r.gk;
  const v = (bias, spread = 5) => Math.round(Math.max(40, Math.min(97, base + bias + rng.gauss() * spread)));
  const a = {
    pace: v(role === 'FW' ? 2 : role === 'DF' ? -3 : 0),
    shooting: v(role === 'FW' ? 3 : role === 'MF' ? -6 : -22),
    passing: v(role === 'MF' ? 2 : role === 'FW' ? -4 : -7),
    dribbling: v(role === 'FW' ? 2 : role === 'MF' ? 0 : -12),
    defending: v(role === 'DF' ? 3 : role === 'MF' ? -8 : -35),
    physical: v(role === 'DF' ? 2 : 0),
    stamina: v(0, 6),
    gk: role === 'GK' ? v(2, 3) : 20,
  };
  if (role === 'GK') {
    a.shooting = 30;
    a.dribbling = 40;
    a.defending = 40;
    a.passing = v(-14);
  }
  Object.assign(a, overrides);
  return a;
}

export function overall(p) {
  const a = p.attrs;
  if (p.role === 'GK') return Math.round(a.gk * 0.85 + a.physical * 0.1 + a.passing * 0.05);
  if (p.role === 'DF') return Math.round(a.defending * 0.45 + a.physical * 0.2 + a.pace * 0.15 + a.passing * 0.2);
  if (p.role === 'MF') return Math.round(a.passing * 0.35 + a.dribbling * 0.2 + a.defending * 0.15 + a.stamina * 0.1 + a.shooting * 0.1 + a.pace * 0.1);
  return Math.round(a.shooting * 0.4 + a.pace * 0.2 + a.dribbling * 0.25 + a.physical * 0.15);
}

export const TEAMS = RAW.map((t, ti) => {
  const rng = makeRng(1000 + ti * 77);
  const players = t.players.map(([name, short, num, pos, ov], i) => {
    const p = {
      id: `${t.id}-${num}`,
      name,
      short,
      num,
      pos,
      role: ROLE_OF[pos],
      attrs: buildAttrs(t, pos, ov, rng),
      look: {
        skin: t.skin[Math.floor(rng() * t.skin.length)],
        hair: t.hair[Math.floor(rng() * t.hair.length)],
        hairStyle: rng() < 0.12 ? 0 : rng() < 0.75 ? 1 : 2,
        height: t.heights[0] + rng() * (t.heights[1] - t.heights[0]) + (pos === 'GK' || pos === 'CB' ? 0.03 : 0),
        build: 0.96 + rng() * 0.1,
        boots: ['#111111', '#f5f5f5', '#ff4fa3', '#22d3ee', '#f97316', '#a3e635', '#facc15'][Math.floor(rng() * 7)],
      },
      index: i,
    };
    p.ovr = overall(p);
    return p;
  });
  const team = { ...t, players };
  const ovr = players.reduce((s, p) => s + p.ovr, 0) / players.length;
  team.ovr = Math.round(ovr);
  team.att = Math.round(players.filter((p) => p.role === 'FW').reduce((s, p) => s + p.ovr, 0) / players.filter((p) => p.role === 'FW').length);
  team.mid = Math.round(players.filter((p) => p.role === 'MF').reduce((s, p) => s + p.ovr, 0) / players.filter((p) => p.role === 'MF').length);
  team.def = Math.round(players.filter((p) => p.role === 'DF' || p.role === 'GK').reduce((s, p) => s + p.ovr, 0) / players.filter((p) => p.role === 'DF' || p.role === 'GK').length);
  team.star = players.reduce((a, b) => (b.ovr > a.ovr && b.role !== 'GK' ? b : a), players[1]);
  return team;
});

export const teamById = (id) => TEAMS.find((t) => t.id === id);

/** 色の近さ（キットの衝突判定用） */
function colorDist(a, b) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const dr = ((pa >> 16) & 255) - ((pb >> 16) & 255);
  const dg = ((pa >> 8) & 255) - ((pb >> 8) & 255);
  const db = (pa & 255) - (pb & 255);
  return Math.sqrt(dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11);
}

/** ホーム/アウェイのキットを決める（色が近ければアウェイ側を変更） */
export function chooseKits(home, away) {
  const hk = home.kits.home;
  let ak = away.kits.home;
  if (colorDist(hk.shirt, ak.shirt) < 90 || colorDist(hk.shorts, ak.shorts) + colorDist(hk.shirt, ak.shirt) < 160) ak = away.kits.away;
  return [hk, ak];
}
