// サーキット定義: コースごとに異なるデータと設定をここに集約する
//  距離はすべてコントロールラインからの距離 [m]。side は進行方向に対して -1=左, +1=右。
import { SUZUKA_POINTS, SUZUKA_LENGTH } from './data/suzuka.js';
import { RACELINE_OFF as SUZUKA_LINE } from './data/raceline.js';
import { FUJI_POINTS, FUJI_LENGTH, FUJI_ELEVATION } from './data/fuji.js';
import { RACELINE_OFF as FUJI_LINE } from './data/raceline-fuji.js';

export const TRACKS = {
  // ------------------------------------------------------------------ 鈴鹿サーキット
  suzuka: {
    id: 'suzuka', name: '鈴鹿サーキット', short: 'SUZUKA', country: '三重県',
    points: SUZUKA_POINTS, length: SUZUKA_LENGTH, raceline: SUZUKA_LINE,
    smooth: true,                                   // OSM由来の折れを均す
    width: { min: 10, max: 16, scale: 1.05 },
    // 高低差キーポイント (最低点=2コーナー付近, 最高点=スプーン)。range: この高低差[m]に正規化
    elevation: { range: 52, keys: [
      [0, 8], [200, 4.5], [400, 1.2], [540, 0], [700, 1.2], [820, 3.5], [1000, 9], [1250, 16],
      [1450, 22], [1850, 33], [2030, 34], [2180, 32], [2275, 30], [2500, 31], [2650, 33],
      [3000, 38.5], [3350, 46.5], [3500, 51], [3650, 52], [3800, 49], [4200, 43], [4648, 37],
      [4780, 34.5], [5100, 30], [5300, 22.5], [5537, 13.5],
    ] },
    sections: [
      { name: '1コーナー', from: 360, to: 480, no: 1 },
      { name: '2コーナー', from: 500, to: 680, no: 2 },
      { name: 'S字', from: 780, to: 1200, no: 3 },
      { name: '逆バンク', from: 1200, to: 1390, no: 6 },
      { name: 'ダンロップ', from: 1410, to: 1900, no: 7 },
      { name: 'デグナー1', from: 1980, to: 2080, no: 8 },
      { name: 'デグナー2', from: 2120, to: 2230, no: 9 },
      { name: '立体交差', from: 2240, to: 2310, no: 0 },
      { name: '110R', from: 2430, to: 2570, no: 10 },
      { name: 'ヘアピン', from: 2590, to: 2740, no: 11 },
      { name: '200R', from: 2800, to: 3400, no: 12 },
      { name: 'スプーン', from: 3480, to: 3840, no: 13 },
      { name: '西ストレート', from: 3860, to: 4640, no: 0 },
      { name: '130R', from: 4660, to: 4900, no: 15 },
      { name: 'シケイン', from: 5060, to: 5210, no: 16 },
      { name: '最終コーナー', from: 5220, to: 5510, no: 18 },
      { name: 'メインストレート', from: 5520, to: 5807, no: 0 },
      { name: 'メインストレート', from: 0, to: 350, no: 0 },
    ],
    sectorSplits: [1950, 3950],
    pit: { sEntry: 5222, sEntryEnd: 5330, sExitStart: 262, sExit: 372, boxStart: 5560, garage: [5548, 236], apron: [5540, 250], paddock: [5520, 262] },
    standWall: [5560, 330],                         // グランドスタンド側 (左) のバリアが近い区間
    stands: [
      [5575, 318, -1, 3.5, 26, '#6d7682'], [392, 470, -1, 4, 13, '#77808b'], [520, 640, -1, 4, 13, '#77808b'], [1640, 1820, 1, 4, 11, '#7b8590'],
      [2625, 2700, 1, 4, 12, '#77808b'], [3580, 3740, 1, 4, 11, '#7b8590'], [4960, 5050, -1, 4, 12, '#77808b'], [5260, 5440, -1, 4, 14, '#6d7682'],
    ],
    park: { wheel: 5380, from: 5270, len: 260, clear: [5200, 5560] },   // 遊園地 (観覧車)
    boards: [[395, -1], [2612, 1], [5078, -1], [3500, 1], [2010, -1], [4680, 1]],   // ブレーキング看板 [コーナー位置, 外側]
    train: [
      { id: 'lap', name: 'ラップ全体', short: '全周' },
      { id: 'c12', name: '1〜2コーナー', short: '1-2', n0: 300, n1: 700 },
      { id: 'esses', name: 'S字・逆バンク', short: 'S字', n0: 760, n1: 1400 },
      { id: 'dunlop', name: 'ダンロップ', short: 'ダンロップ', n0: 1400, n1: 1960 },
      { id: 'degner', name: 'デグナー', short: 'デグナー', n0: 1960, n1: 2330 },
      { id: 'hairpin', name: 'ヘアピン', short: 'ヘアピン', n0: 2400, n1: 2820 },
      { id: 'spoon', name: '200R〜スプーン', short: 'スプーン', n0: 2900, n1: 3950 },
      { id: 'chicane', name: '130R・シケイン', short: 'シケイン', n0: 4560, n1: 5300 },
      { id: 'final', name: '最終コーナー', short: '最終', n0: 5300, n1: 5650 },
    ],
    fullLaps: 53, baseLap: 102.3,                   // baseLap: 最速AIの想定ラップ [s] (予選タイムの基準)
  },

  // ------------------------------------------------------------------ 富士スピードウェイ
  fuji: {
    id: 'fuji', name: '富士スピードウェイ', short: 'FUJI', country: '静岡県',
    points: FUJI_POINTS, length: FUJI_LENGTH, raceline: FUJI_LINE,
    smooth: false,                                  // 生成時に半径を合わせてあるので均さない
    width: { min: 15, max: 25, scale: 1 },
    elevation: { range: null, keys: FUJI_ELEVATION },   // 標高グラフの値をそのまま使う
    sections: [
      { name: 'TGRコーナー', from: 630, to: 800, no: 1 },
      { name: '2コーナー', from: 810, to: 940, no: 2 },
      { name: 'コカ・コーラコーナー', from: 1190, to: 1370, no: 3 },
      { name: 'トヨペット100Rコーナー', from: 1390, to: 1840, no: 4 },
      { name: 'アドバンコーナー', from: 1900, to: 2140, no: 6 },
      { name: '300R', from: 2200, to: 2710, no: 7 },
      { name: 'ダンロップコーナー', from: 2730, to: 3010, no: 10 },
      { name: '第13コーナー', from: 3030, to: 3190, no: 13 },
      { name: 'レクサスコーナー', from: 3200, to: 3460, no: 15 },
      { name: 'パナソニックコーナー', from: 3480, to: 3740, no: 16 },
      { name: 'メインストレート', from: 3750, to: 4563, no: 0 },
      { name: 'メインストレート', from: 0, to: 620, no: 0 },
    ],
    sectorSplits: [1380, 2740],
    pit: { sEntry: 4270, sEntryEnd: 4380, sExitStart: 410, sExit: 520, boxStart: 4420, garage: [4408, 386], apron: [4400, 398], paddock: [4385, 410] },
    standWall: [3800, 560],
    stands: [
      [3830, 540, -1, 3.5, 28, '#6d7682'], [650, 790, -1, 4, 13, '#77808b'], [1230, 1330, 1, 4, 12, '#7b8590'], [1960, 2090, 1, 4, 12, '#77808b'],
      [2760, 2900, -1, 4, 12, '#7b8590'], [3530, 3700, -1, 4, 13, '#6d7682'],
    ],
    park: null,
    boards: [[672, -1], [1225, 1], [1939, 1], [2776, -1], [3047, -1], [3303, 1], [3493, -1]],
    train: [
      { id: 'lap', name: 'ラップ全体', short: '全周' },
      { id: 'tgr', name: 'TGR〜2コーナー', short: 'TGR', n0: 560, n1: 960 },
      { id: 'coca', name: 'コカ・コーラコーナー', short: 'コカコーラ', n0: 1150, n1: 1400 },
      { id: 'r100', name: 'トヨペット100R', short: '100R', n0: 1400, n1: 1880 },
      { id: 'advan', name: 'アドバンコーナー', short: 'アドバン', n0: 1880, n1: 2200 },
      { id: 'r300', name: '300R', short: '300R', n0: 2200, n1: 2720 },
      { id: 'dunlop', name: 'ダンロップコーナー', short: 'ダンロップ', n0: 2720, n1: 3020 },
      { id: 's3', name: '第13〜レクサス', short: '13-レクサス', n0: 3020, n1: 3470 },
      { id: 'pana', name: 'パナソニックコーナー', short: 'パナソニック', n0: 3470, n1: 3830 },
    ],
    fullLaps: 67, baseLap: 82.4,
  },
};
export const TRACK_IDS = Object.keys(TRACKS);

// 現在選択中のサーキット (メニュー・保存先の切替に使う)
let current = 'suzuka';
export function setCurrentTrack(id) { if (TRACKS[id]) current = id; return TRACKS[current]; }
export function currentTrack() { return TRACKS[current]; }
// 保存キーの接尾辞: 鈴鹿は従来のキーをそのまま使う (既存の記録を引き継ぐため)
export function trackSuffix(id = current) { return id === 'suzuka' ? '' : '_' + id; }
