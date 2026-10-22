// フォーメーション: 自陣ゴール(-1)→相手ゴール(+1) の x、左(-1)→右(+1) の z（攻撃方向を向いて）
// role: GK/DF/MF/FW, line: 守備ラインの所属

export const FORMATIONS = {
  '4-2-3-1': [
    { pos: 'GK', x: -0.97, z: 0 },
    { pos: 'LB', x: -0.6, z: -0.72, role: 'DF' },
    { pos: 'CB', x: -0.7, z: -0.24, role: 'DF' },
    { pos: 'CB', x: -0.7, z: 0.24, role: 'DF' },
    { pos: 'RB', x: -0.6, z: 0.72, role: 'DF' },
    { pos: 'DM', x: -0.42, z: -0.2, role: 'MF' },
    { pos: 'DM', x: -0.42, z: 0.2, role: 'MF' },
    { pos: 'LM', x: -0.1, z: -0.66, role: 'MF' },
    { pos: 'AM', x: -0.12, z: 0, role: 'MF' },
    { pos: 'RM', x: -0.1, z: 0.66, role: 'MF' },
    { pos: 'ST', x: 0.12, z: 0, role: 'FW' },
  ],
  '4-3-3': [
    { pos: 'GK', x: -0.97, z: 0 },
    { pos: 'LB', x: -0.6, z: -0.72, role: 'DF' },
    { pos: 'CB', x: -0.7, z: -0.24, role: 'DF' },
    { pos: 'CB', x: -0.7, z: 0.24, role: 'DF' },
    { pos: 'RB', x: -0.6, z: 0.72, role: 'DF' },
    { pos: 'CM', x: -0.36, z: -0.34, role: 'MF' },
    { pos: 'DM', x: -0.46, z: 0, role: 'MF' },
    { pos: 'CM', x: -0.36, z: 0.34, role: 'MF' },
    { pos: 'LW', x: 0.04, z: -0.66, role: 'FW' },
    { pos: 'ST', x: 0.12, z: 0, role: 'FW' },
    { pos: 'RW', x: 0.04, z: 0.66, role: 'FW' },
  ],
  '4-4-2': [
    { pos: 'GK', x: -0.97, z: 0 },
    { pos: 'LB', x: -0.6, z: -0.72, role: 'DF' },
    { pos: 'CB', x: -0.7, z: -0.24, role: 'DF' },
    { pos: 'CB', x: -0.7, z: 0.24, role: 'DF' },
    { pos: 'RB', x: -0.6, z: 0.72, role: 'DF' },
    { pos: 'LM', x: -0.28, z: -0.68, role: 'MF' },
    { pos: 'CM', x: -0.36, z: -0.22, role: 'MF' },
    { pos: 'CM', x: -0.36, z: 0.22, role: 'MF' },
    { pos: 'RM', x: -0.28, z: 0.68, role: 'MF' },
    { pos: 'ST', x: 0.08, z: -0.2, role: 'FW' },
    { pos: 'ST', x: 0.1, z: 0.2, role: 'FW' },
  ],
  '3-5-2': [
    { pos: 'GK', x: -0.97, z: 0 },
    { pos: 'CB', x: -0.7, z: -0.4, role: 'DF' },
    { pos: 'CB', x: -0.74, z: 0, role: 'DF' },
    { pos: 'CB', x: -0.7, z: 0.4, role: 'DF' },
    { pos: 'LWB', x: -0.32, z: -0.8, role: 'MF' },
    { pos: 'CM', x: -0.4, z: -0.25, role: 'MF' },
    { pos: 'DM', x: -0.48, z: 0, role: 'MF' },
    { pos: 'CM', x: -0.4, z: 0.25, role: 'MF' },
    { pos: 'RWB', x: -0.32, z: 0.8, role: 'MF' },
    { pos: 'ST', x: 0.08, z: -0.18, role: 'FW' },
    { pos: 'ST', x: 0.1, z: 0.18, role: 'FW' },
  ],
};

export const FORMATION_NAMES = Object.keys(FORMATIONS);
