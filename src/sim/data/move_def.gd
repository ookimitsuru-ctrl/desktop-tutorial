class_name MoveDef
extends RefCounted
## 技の不変定義（整数のみ）。読み込みは app 層の DataLoader が行う。

var index: int = -1
var id: String = ""
var name_ja: String = ""
var name_en: String = ""
var category: String = "basic"
var tags: PackedStringArray = PackedStringArray()

# コマンド
var cmd: CommandSpec = null
var from_mask: int = 0
var stance_from: int = -1
var chain_only: bool = false
var priority: int = 0

# 判定・フレーム
var level: int = SE.LV_MID
var limb: int = SE.LIMB_PUNCH
var damage: int = 0
var startup: int = 10
var active: int = 2
var recovery: int = 12
var adv_block: int = 0
var adv_hit: int = 0
var adv_ch: int = 0
var hit_reaction: int = SE.R_MID_LIGHT
var ch_reaction: int = SE.R_MID_LIGHT
var block_reaction: int = SE.R_NONE  # guard_crush 等
var weight: int = SE.W_LIGHT
var tracking: int = SE.TRK_LINEAR
var track_until: int = 4
var stagger_frames: int = 36
var launch_vy: int = 0        # Q16.16 m/F
var launch_vx: int = 0
var air_vy: int = 0           # 空中ヒット時の再浮き
var push_block: int = 0       # Q16.16 m
var push_hit: int = 0
var flags: int = 0
var posture_from: PackedInt32Array = PackedInt32Array()
var posture_to: PackedInt32Array = PackedInt32Array()
var posture_flag: PackedInt32Array = PackedInt32Array()
var anim_index: int = -1
var end_stance: int = -1      # 技の後に移る構え
var reach: int = 0            # 参考値（ベイクから）

# 連携
var chain_to: PackedInt32Array = PackedInt32Array()
var chain_btn: PackedInt32Array = PackedInt32Array()   # 必要ボタン（InputBits のビット）
var chain_dir: PackedInt32Array = PackedInt32Array()   # 0=任意, 1-9
var chain_from: PackedInt32Array = PackedInt32Array()  # 受付開始フレーム
var chain_to_f: PackedInt32Array = PackedInt32Array()  # 受付終了フレーム
var chain_at: PackedInt32Array = PackedInt32Array()    # 次段の開始フレーム（最速）
var chain_cond: PackedInt32Array = PackedInt32Array()
var chain_just: PackedInt32Array = PackedInt32Array()  # ジャスト入力フレーム（0=なし）
var chain_just_to: PackedInt32Array = PackedInt32Array()

# 溜め
var charge_btn: int = 0
var charge_at: int = 0
var charge_to: int = -1

# 投げ
var is_throw: bool = false
var throw_range: int = 0       # 0 ならキャラの投げ間合い
var throw_escape: int = SE.ESC_N
var throw_dmg_frame: int = 0
var throw_len: int = 0
var throw_anim: int = -1      # 投げ成立後のアニメ（被投げ側の位置トラック付き）
var throw_end_down: int = SE.DOWN_UP
var throw_swap: bool = false
var throw_angle: int = SE.TA_FRONT
var throw_side_variant: int = -1
var throw_back_variant: int = -1
var throw_next_to: PackedInt32Array = PackedInt32Array()
var throw_next_btn: PackedInt32Array = PackedInt32Array()
var throw_next_dir: PackedInt32Array = PackedInt32Array()
var throw_next_window: int = 18
var throw_stage: bool = false   # 連続投げの2段目以降（成立判定なしで開始）
var throw_vs_down: bool = false
var throw_end_air: bool = false
var throw_end_kind: int = SE.TE_DOWN   # 投げ終了時の被投げ側（ダウン / よろけ / 立ち硬直 / 背向け）
var throw_end_stun: int = 30
var throw_mash: int = 0       # >0: 被投げ側のレバガチャ累計がこの値に達すると脱出（首相撲など）

# 当て身
var parry_from: int = 0
var parry_to: int = 0
var parry_levels: int = 0      # ビット: 1<<LV
var parry_limbs: int = 0       # ビット: 1<<LIMB
var parry_success: int = -1


func total() -> int:
	return startup + active - 1 + recovery


func active_end() -> int:
	return startup + active - 1


func has_flag(f: int) -> bool:
	return (flags & f) != 0


func posture_at(frame: int) -> int:
	var r := 0
	for i: int in range(posture_flag.size()):
		if frame >= posture_from[i] and frame <= posture_to[i]:
			r |= posture_flag[i]
	return r


func is_strike() -> bool:
	return level == SE.LV_HIGH or level == SE.LV_MID or level == SE.LV_LOW or level == SE.LV_SMID or level == SE.LV_DOWN


func is_parry() -> bool:
	return level == SE.LV_PARRY
