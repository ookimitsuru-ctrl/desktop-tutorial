// ゲーム全体の共有状態。モジュール間の循環参照を避けるため関数も G 経由で呼ぶ。
export const G = {
  gfx: null, audio: null, input: null,
  state: 'boot', stateT: 0,
  time: 0, dt: 0.016, wdt: 0.016, ts: 1, tsTarget: 1,
  V: 62, // レール速度
  diff: 1, // 0 easy / 1 normal / 2 hard
  settings: { music: 0.7, sfx: 0.9, vib: true, gfx: 0, diff: 1 },
  save: { hi: 0, reached: 1 },

  // プレイヤー
  px: 0, py: 0, pvx: 0, pvy: 0,
  shield: 100, flow: 0, flowIdle: 0, od: 0, odMax: 7,
  rollT: 0, rollDir: 0, rollCd: 0, rollAngle: 0,
  invuln: 0, dead: false,
  score: 0, kills: 0, chain: 0, chainT: 0, maxChain: 0, dmgTaken: 0, shotsFired: 0, hits: 0,
  ret: { x: 0, y: 0, dx: 0, dy: 0, vx: 0, vy: 0 }, // 照準(HUD座標)
  locking: false, locks: [], lockCd: 0, volley: [], volleyT: 0,
  trauma: 0, shakeX: 0, shakeY: 0, shakeR: 0,

  // 世界
  stage: null, stageIdx: 0, st: 0,
  enemies: [], ebul: [], lasers: [], missiles: [], pickups: [], walls: [],
  boss: null,
  flash: [0, 0, 0, 0],
  banner: null,
  hintT: 0,
  camYaw: 0, camPitch: 0, camRoll: 0, fov: 0.92,
  bend: { x: 0, y: 0 },
};

export function vib(ms) {
  if (!G.settings.vib) return;
  try {
    if (window.AndroidBridge && window.AndroidBridge.vibrate) window.AndroidBridge.vibrate(ms);
    else if (navigator.vibrate) navigator.vibrate(ms);
  } catch (_) { /* noop */ }
}
