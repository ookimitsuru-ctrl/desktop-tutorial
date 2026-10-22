// フィールド寸法などの共通定数（単位: メートル / 秒）
// 座標系: x = ピッチ長手方向(右が+), z = 幅方向(手前=メインカメラ側が+), y = 上

export const PITCH = {
  L: 105,
  W: 68,
  HL: 52.5, // half length
  HW: 34, // half width
  goalHalfW: 3.66,
  goalH: 2.44,
  goalDepth: 2.2,
  postR: 0.06,
  boxDepth: 16.5,
  boxHalfW: 20.16,
  sixDepth: 5.5,
  sixHalfW: 9.16,
  spot: 11,
  circleR: 9.15,
  cornerR: 1,
};

// 芝生が敷かれている範囲（ピッチ外の余白を含む）
export const FIELD = { halfX: 61, halfZ: 42.5 };

// スタジアムのボウル（スタンド最前列の角丸長方形）
export const BOWL = { hx: 61.5, hz: 43.5, r: 16 };
export const ROOF_INSET = 10; // 屋根の内側の縁はボウルから10m外
// スタジアムの屋根開口部（解析的な屋根の影計算にも使う）
export const ROOF = { halfX: BOWL.hx + ROOF_INSET, halfZ: BOWL.hz + ROOF_INSET, radius: BOWL.r + ROOF_INSET, height: 39.5 };

export const BALL_R = 0.11;
export const BALL_VISUAL_SCALE = 1.9; // 遠景でも見えるよう大きめに描画
export const HUMAN_SCALE = 1.12; // 同上（選手）

export const SIM_HZ = 60;
export const SIM_DT = 1 / SIM_HZ;
