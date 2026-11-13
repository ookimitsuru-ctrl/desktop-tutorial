class_name CharDef
extends RefCounted
## キャラクターの不変定義（シミュレーション用・整数のみ）

var index: int = 0
var id: String = ""
var name_ja: String = ""
var name_en: String = ""
var weight_class: int = 1          # 0 軽 1 中 2 重
var push_radius: int = 0           # Q16.16
var float_factor: int = FP.ONE     # Q16.16
var throw_range: int = 0
var hurt_mul: int = FP.ONE        # 喰らい判定の半径倍率 (Q16.16)
var walk_f: int = 0                # m/F (Q16.16)
var walk_b: int = 0
var dash_f_frames: int = 18
var dash_f_dist: int = 0
var dash_b_frames: int = 20
var dash_b_dist: int = 0
var run_max: int = 0
var evade_total: int = 22
var moves: Array[MoveDef] = []
var move_by_id: Dictionary = {}
## コマンド照合の候補（優先度の高い順）
var cmd_moves: Array[MoveDef] = []
## 側面/背後投げの既定
var side_throw: int = -1
var back_throw: int = -1
## 構え: [{id, max_frames, low_profile}]
var stance_ids: PackedStringArray = PackedStringArray()
var stance_max: PackedInt32Array = PackedInt32Array()
var stance_low: PackedInt32Array = PackedInt32Array()
var stance_anim: PackedInt32Array = PackedInt32Array()
## 共通アニメ（PoseRef.A の順）のアニメ番号
var common: PackedInt32Array = PackedInt32Array()
## 共通アニメの番号（名前 → 番号）
var anim_index: Dictionary = {}
var anim_names: PackedStringArray = PackedStringArray()
var baked: BakedChar = null


func anim(n: String) -> int:
	return int(anim_index.get(n, 0))


func move_index(mid: String) -> int:
	var m: MoveDef = move_by_id.get(mid, null)
	return m.index if m != null else -1
