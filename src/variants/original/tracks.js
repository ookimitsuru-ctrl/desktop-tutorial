// オリジナル版の架空サーキット定義。src/tracks.js と同じ形式 (tools/build.mjs --variant original で差し替わる)。
//  中心線は tools/build-original.mjs が生成 (data/courses.js)。距離はすべてコントロールラインからの距離 [m]。
//  side は進行方向に対して -1=左, +1=右。
import { BAYSIDE, MISTRAL, HORIZON } from './data/courses.js';
import { RACELINE_OFF as BAYSIDE_LINE } from './data/raceline-bayside.js';
import { RACELINE_OFF as MISTRAL_LINE } from './data/raceline-mistral.js';
import { RACELINE_OFF as HORIZON_LINE } from './data/raceline-horizon.js';

const r1 = v => Math.round(v);
// コーナー一覧から区間名 (メインストレートを含む) を作る
function sections(C) {
  const L = C.length, cs = C.corners, out = cs.map(c => ({ name: c.name, from: c.from, to: c.to, no: c.no }));
  out.push({ name: 'メインストレート', from: cs[cs.length - 1].to, to: L, no: 0 }, { name: 'メインストレート', from: 0, to: cs[0].from, no: 0 });
  return out;
}
const corner = (C, no) => C.corners.find(c => c.no === no);
// 練習区間: コーナー番号 a〜b を、手前 pre m・後 post m 含めて切り出す
const trainSec = (C, id, name, short, a, b, pre = 200, post = 100) => ({ id, name, short, n0: r1(Math.max(5, corner(C, a).from - pre)), n1: r1(Math.min(C.length - 5, corner(C, b).to + post)) });
// コーナーの外側 (右コーナーなら左)
const outside = c => (c.angle > 0 ? -1 : 1);
const boards = (C, nos) => nos.map(n => { const c = corner(C, n); return [c.from, outside(c)]; });
const stands = (C, nos, depth = 13) => nos.map((n, k) => { const c = corner(C, n); return [r1(c.from - 40), r1(c.to + 40), outside(c), 4, depth, ['#77808b', '#7b8590', '#6d7682'][k % 3]]; });

const elev = (L, keys) => keys.map(([f, z]) => [r1(f * L), z]);

const BL = BAYSIDE.length, ML = MISTRAL.length, HL = HORIZON.length;
export const TRACKS = {
  // ------------------------------------------------------------------ ホームベース形の変形オーバル (左回り・バンク付き)
  bayside: {
    id: 'bayside', name: 'ベイサイド・スーパースピードウェイ', short: 'BAYSIDE', country: '架空のサーキット',
    points: BAYSIDE.points, length: BL, raceline: BAYSIDE_LINE,
    smooth: false,
    width: { min: 15, max: 20, scale: 1 },
    elevation: { range: null, keys: elev(BL, [[0, 1.5], [0.25, 0], [0.5, 2.5], [0.75, 3], [1, 1.5]]) },   // 高低差 3m
    banking: { deg: 9.2, radius: 260 },               // 90度ターンで約9度、45度ターンで約5度のバンク
    aero: { cl: 0.35, cd: 0.5, final: 0.8, spread: 0.4 },   // スーパースピードウェイ仕様: 薄いウイングと長いギヤ比
    runoff: { l: 13, r: 2.2 },                        // 内側は芝、外側はすぐ壁
    sections: sections(BAYSIDE),
    sectorSplits: [r1(BL / 3), r1(BL * 2 / 3)],
    pit: { side: -1, sEntry: r1(BL - 470), sEntryEnd: r1(BL - 380), sExitStart: 120, sExit: 230, boxStart: r1(BL - 350), garage: [r1(BL - 362), 96], apron: [r1(BL - 370), 108], paddock: [r1(BL - 385), 120] },
    standWall: [r1(BL - 490), 280],
    stands: [[r1(BL - 480), 270, 1, 3.5, 28, '#6d7682'], ...stands(BAYSIDE, [1, 3, 5], 16)],
    park: null,
    boards: boards(BAYSIDE, [1, 3]),
    train: [
      { id: 'lap', name: 'ラップ全体', short: '全周' },
      trainSec(BAYSIDE, 't12', 'ターン1〜2', 'T1-2', 1, 2, 250, 100),
      trainSec(BAYSIDE, 't3', 'ターン3', 'T3', 3, 3, 250, 150),
      trainSec(BAYSIDE, 't45', 'ターン4〜5', 'T4-5', 4, 5, 250, 120),
    ],
    fullLaps: 180, baseLap: 44.8,
  },

  // ------------------------------------------------------------------ 低速コーナー主体のテクニカルコース (右回り)
  mistral: {
    id: 'mistral', name: 'ミストラル・テクニカルパーク', short: 'MISTRAL', country: '架空のサーキット',
    points: MISTRAL.points, length: ML, raceline: MISTRAL_LINE,
    smooth: false,
    width: { min: 11, max: 14, scale: 1 },
    elevation: { range: null, keys: elev(ML, [[0, 10], [0.1, 6], [0.25, 2], [0.4, 0], [0.55, 8], [0.7, 16], [0.85, 18], [1, 10]]) },
    sections: sections(MISTRAL),
    sectorSplits: [r1(ML / 3), r1(ML * 2 / 3)],
    pit: { sEntry: r1(ML - 470), sEntryEnd: r1(ML - 380), sExitStart: 120, sExit: 230, boxStart: r1(ML - 350), garage: [r1(ML - 362), 96], apron: [r1(ML - 370), 108], paddock: [r1(ML - 385), 120] },
    standWall: [r1(ML - 480), 280],
    stands: [[r1(ML - 475), 270, -1, 3.5, 24, '#6d7682'], ...stands(MISTRAL, [1, 4, 9, 15])],
    park: null,
    boards: boards(MISTRAL, [1, 4, 7, 9, 12]),
    train: [
      { id: 'lap', name: 'ラップ全体', short: '全周' },
      trainSec(MISTRAL, 'c13', '1〜3コーナー', '1-3', 1, 3),
      trainSec(MISTRAL, 'c46', '4〜6コーナー', '4-6', 4, 6),
      trainSec(MISTRAL, 'hp', 'シケイン〜ヘアピン', 'ヘアピン', 7, 9),
      trainSec(MISTRAL, 'c1012', '10〜12コーナー', '10-12', 10, 12),
      trainSec(MISTRAL, 'fin', '13〜最終コーナー', '最終', 13, 15, 150, 60),
    ],
    fullLaps: 86, baseLap: 79.1,
  },

  // ------------------------------------------------------------------ 長いストレートを持つ高・中速コース (右回り)
  horizon: {
    id: 'horizon', name: 'ホライゾン・ハイスピードサーキット', short: 'HORIZON', country: '架空のサーキット',
    points: HORIZON.points, length: HL, raceline: HORIZON_LINE,
    smooth: false,
    width: { min: 14, max: 18, scale: 1 },
    elevation: { range: null, keys: elev(HL, [[0, 30], [0.15, 22], [0.3, 10], [0.45, 0], [0.6, 6], [0.75, 20], [0.88, 34], [1, 30]]) },
    sections: sections(HORIZON),
    sectorSplits: [r1(HL / 3), r1(HL * 2 / 3)],
    pit: { sEntry: r1(HL - 560), sEntryEnd: r1(HL - 450), sExitStart: 400, sExit: 510, boxStart: r1(HL - 410), garage: [r1(HL - 422), 150], apron: [r1(HL - 430), 162], paddock: [r1(HL - 445), 175] },
    standWall: [r1(HL - 780), 560],
    stands: [[r1(HL - 770), 550, -1, 3.5, 28, '#6d7682'], ...stands(HORIZON, [1, 3, 6, 10])],
    park: null,
    boards: boards(HORIZON, [1, 4, 6, 8, 10]),
    train: [
      { id: 'lap', name: 'ラップ全体', short: '全周' },
      trainSec(HORIZON, 'c13', '1〜3コーナー', '1-3', 1, 3, 250, 100),
      trainSec(HORIZON, 'c46', '4〜6コーナー', '4-6', 4, 6),
      trainSec(HORIZON, 'c78', '7〜8コーナー', '7-8', 7, 8),
      trainSec(HORIZON, 'fin', '9〜最終コーナー', '最終', 9, 10, 200, 80),
    ],
    fullLaps: 53, baseLap: 77.8,
  },
};
export const TRACK_IDS = Object.keys(TRACKS);

let current = TRACK_IDS[0];
export function setCurrentTrack(id) { if (TRACKS[id]) current = id; return TRACKS[current]; }
export function currentTrack() { return TRACKS[current]; }
export function trackSuffix(id = current) { return id === TRACK_IDS[0] ? '' : '_' + id; }
