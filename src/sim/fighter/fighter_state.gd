class_name FighterState
extends RefCounted
## ファイター1人分のシミュレーション状態（整数のみ）。
## FIELDS に列挙したフィールドと入力履歴がスナップショット対象。テストで全変数の網羅を検証する。

const HIST_LEN := 64

var side: int = 0
var char_idx: int = 0
var x: int = 0
var z: int = 0
var y: int = 0
var vx: int = 0
var vz: int = 0
var vy: int = 0
var facing: int = 0
var hp: int = 1000
var state: int = SE.ST_STAND
var sub: int = 0
var sf: int = 0
var stun: int = 0
var stun_len: int = 0
var move: int = -1
var mf: int = 0
var move_ctx: int = 0
var move_contact: int = 0
var move_ch: int = 0
var move_start_frame: int = 0
var chain_next: int = -1
var chain_at: int = 0
var air_hits: int = 0
var gravity: int = 0
var combo_hits: int = 0
var combo_dmg: int = 0
var wall_hits: int = 0
var slide: int = 0
var slide_x: int = 0
var slide_z: int = 0
var no_tech: int = 0
var tech_check: int = 0
var evade_dir: int = 0
var evade_len: int = 22
var evade_success: int = 0
var tap2_frame: int = -100
var rise_window: int = 0
var consumed: int = -1
var throw_move: int = -1
var throw_frame: int = 0
var throw_escape: int = 0
var throw_protect: int = 0
var throw_grab: int = 0
var stagger_min: int = 0
var stance: int = -1
var invuln: int = 0
var reaction: int = -1
var hit_from_back: int = 0
var anim: int = 0
var anim_frame: int = 0
var input_now: int = 0
var hist_head: int = 0
var hist: PackedInt32Array = PackedInt32Array()
var ko: int = 0
var guard_crouch: int = 0
var parry_lock: int = 0
var stat_damage: int = 0
var stat_max_combo: int = 0
var stat_counters: int = 0
var stat_escapes: int = 0
var stat_evades: int = 0
var last_air_kind: int = 0

const FIELDS: Array[String] = [
	"side", "char_idx", "x", "z", "y", "vx", "vz", "vy", "facing", "hp", "state", "sub", "sf",
	"stun", "stun_len", "move", "mf", "move_ctx", "move_contact", "move_ch", "move_start_frame",
	"chain_next", "chain_at", "air_hits", "gravity", "combo_hits", "combo_dmg", "wall_hits",
	"slide", "slide_x", "slide_z", "no_tech", "tech_check", "evade_dir", "evade_len", "evade_success",
	"tap2_frame", "rise_window", "consumed", "throw_move", "throw_frame", "throw_escape", "throw_protect",
	"throw_grab", "stagger_min", "stance", "invuln", "reaction", "hit_from_back", "anim", "anim_frame",
	"input_now", "hist_head", "ko", "guard_crouch", "parry_lock", "stat_damage", "stat_max_combo",
	"stat_counters", "stat_escapes", "stat_evades", "last_air_kind",
]


func _init() -> void:
	hist.resize(HIST_LEN)
	for i: int in range(HIST_LEN):
		hist[i] = InputBits.make(5, 0, 0, 0)


## back フレーム前の入力（0 = 現在）
func h(back: int) -> int:
	return hist[(hist_head - back + HIST_LEN * 4) % HIST_LEN]


func push_input(v: int) -> void:
	hist_head = (hist_head + 1) % HIST_LEN
	hist[hist_head] = v
	input_now = v


func write_to(buf: PackedInt32Array) -> void:
	for f: String in FIELDS:
		buf.append(int(get(f)))
	buf.append_array(hist)


func read_from(buf: PackedInt32Array, offset: int) -> int:
	var o := offset
	for f: String in FIELDS:
		set(f, buf[o])
		o += 1
	for i: int in range(HIST_LEN):
		hist[i] = buf[o + i]
	return o + HIST_LEN


func in_state(s: int) -> bool:
	return state == s


func is_airborne() -> bool:
	return state == SE.ST_AIR


func is_down() -> bool:
	return state == SE.ST_DOWN


func is_crouching() -> bool:
	if state == SE.ST_CROUCH or state == SE.ST_CROUCH_IN and sf >= 2:
		return true
	if state == SE.ST_GUARD and guard_crouch == 1:
		return true
	if state == SE.ST_BLOCKSTUN and guard_crouch == 1:
		return true
	return false
