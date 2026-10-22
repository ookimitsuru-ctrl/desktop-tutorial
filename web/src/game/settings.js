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
};

export function loadSettings() {
  return { ...DEFAULT_SETTINGS, ...load('settings', {}) };
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
