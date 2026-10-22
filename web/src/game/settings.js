import { load, save } from '../platform.js';

export const DEFAULT_SETTINGS = {
  halfMinutes: 3,
  difficulty: 'normal',
  quality: 'auto',
  offside: true,
  sound: 0.8,
  music: 0.6,
  haptics: true,
  autoSwitch: true,
  replays: true,
  camera: 'normal',
  radar: true,
  seenHint: false,
  v: 2,
};

export function loadSettings() {
  const saved = load('settings', {});
  // v1 は既定がピッチ全体のワイドだった。ボールを追うカメラを既定にしたので一度だけ戻す
  if ((saved.v || 1) < 2) {
    delete saved.camera;
    saved.v = 2;
  }
  if (saved.camera === 'zoom') saved.camera = 'normal';
  return { ...DEFAULT_SETTINGS, ...saved };
}

export function saveSettings(s) {
  save('settings', s);
}

export const VENUES = [
  { id: 0, name: 'ルミナス・スタジアム', city: 'ネオ東京', preset: 'night', pitch: 0, cap: '68,000' },
  { id: 1, name: 'サンセット・アレーナ', city: 'ポルト・ソル', preset: 'sunset', pitch: 1, cap: '61,500' },
  { id: 2, name: 'グランパーク・スタジアム', city: 'ヴァルデン', preset: 'day', pitch: 2, cap: '72,000' },
  { id: 3, name: 'ワールド・スタジアム', city: 'ノルドハーフェン', preset: 'night', pitch: 3, cap: '88,000' },
];
