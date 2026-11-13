class_name PoseRef
extends RefCounted
## 状態 → (アニメ番号, フレーム) の対応。シミュレーション（喰らい判定）と描画が同じ対応を使う。

## 共通アニメの名前（AnimLibrary とベイカーもこの名前で作る）
const NAMES: Array[String] = [
	"idle", "walk_f", "walk_b", "dash_f", "dash_b", "run", "run_stop",
	"crouch", "crouch_in", "stand_up", "evade_l", "evade_r",
	"guard_s", "guard_c", "block_s", "block_c",
	"hit_high", "hit_high_heavy", "hit_mid", "hit_mid_heavy", "hit_low", "hit_crouch", "hit_turn", "guard_crush",
	"stagger_gut", "stagger_leg", "crumple",
	"air_launch", "air_spin", "air_knock", "air_trip",
	"down_up", "down_face", "getup_up", "getup_face", "roll_l", "roll_r", "roll_back",
	"tech", "tech_l", "tech_r", "tech_back",
	"backturn", "turn", "wall_stagger", "wall_splat",
	"clash", "parried", "ringout", "win", "lose", "intro",
]

enum A {
	IDLE, WALK_F, WALK_B, DASH_F, DASH_B, RUN, RUN_STOP,
	CROUCH, CROUCH_IN, STAND_UP, EVADE_L, EVADE_R,
	GUARD_S, GUARD_C, BLOCK_S, BLOCK_C,
	HIT_HIGH, HIT_HIGH_HEAVY, HIT_MID, HIT_MID_HEAVY, HIT_LOW, HIT_CROUCH, HIT_TURN, GUARD_CRUSH,
	STAGGER_GUT, STAGGER_LEG, CRUMPLE,
	AIR_LAUNCH, AIR_SPIN, AIR_KNOCK, AIR_TRIP,
	DOWN_UP, DOWN_FACE, GETUP_UP, GETUP_FACE, ROLL_L, ROLL_R, ROLL_BACK,
	TECH, TECH_L, TECH_R, TECH_BACK,
	BACKTURN, TURN, WALL_STAGGER, WALL_SPLAT,
	CLASH, PARRIED, RINGOUT, WIN, LOSE, INTRO,
}


static func update(w: SimWorld, i: int) -> void:
	var p := w.f[i]
	var cd := w.chars[i]
	var r := compute(w, i)
	p.anim = r.x
	p.anim_frame = r.y
	var _u := cd


static func _c(cd: CharDef, a: int) -> int:
	return cd.common[a] if a < cd.common.size() else 0


## 戻り値: Vector2i(アニメ番号, フレーム)。アニメ番号 -1 = 喰らい判定なし
static func compute(w: SimWorld, i: int) -> Vector2i:
	var p := w.f[i]
	var cd := w.chars[i]
	match p.state:
		SE.ST_STAND:
			return Vector2i(_c(cd, A.IDLE), p.sf + 1)
		SE.ST_CROUCH:
			return Vector2i(_c(cd, A.CROUCH), p.sf + 1)
		SE.ST_CROUCH_IN:
			return Vector2i(_c(cd, A.CROUCH_IN), p.sf + 1)
		SE.ST_STAND_UP:
			return Vector2i(_c(cd, A.STAND_UP), p.sf + 1)
		SE.ST_WALK_F:
			return Vector2i(_c(cd, A.WALK_F), p.sf + 1)
		SE.ST_WALK_B:
			return Vector2i(_c(cd, A.WALK_B), p.sf + 1)
		SE.ST_DASH_F:
			return Vector2i(_c(cd, A.DASH_F), _scale(p.sf + 1, cd.dash_f_frames, _len(cd, A.DASH_F)))
		SE.ST_DASH_B:
			return Vector2i(_c(cd, A.DASH_B), _scale(p.sf + 1, cd.dash_b_frames, _len(cd, A.DASH_B)))
		SE.ST_RUN:
			return Vector2i(_c(cd, A.RUN), p.sf + 1)
		SE.ST_RUN_STOP:
			return Vector2i(_c(cd, A.RUN_STOP), p.sf + 1)
		SE.ST_EVADE:
			return Vector2i(_c(cd, A.EVADE_L if evade_to_left(w, i) else A.EVADE_R), _scale(p.sf + 1, p.evade_len, _len(cd, A.EVADE_L)))
		SE.ST_GUARD:
			return Vector2i(_c(cd, A.GUARD_C if p.guard_crouch == 1 else A.GUARD_S), p.sf + 1)
		SE.ST_BLOCKSTUN:
			var ba := A.BLOCK_C if p.guard_crouch == 1 else A.BLOCK_S
			return Vector2i(_c(cd, ba), _scale(p.sf + 1, p.stun_len, _len(cd, ba)))
		SE.ST_MOVE:
			var m := cd.moves[p.move]
			return Vector2i(m.anim_index, maxi(1, p.mf))
		SE.ST_THROWING:
			var tm := cd.moves[p.throw_move] if p.throw_move >= 0 else cd.moves[p.move]
			return Vector2i(tm.throw_anim, maxi(1, p.throw_frame))
		SE.ST_THROWN:
			return Vector2i(-1, 0)
		SE.ST_HITSTUN:
			var ha := hit_anim(p)
			return Vector2i(_c(cd, ha), _scale(p.sf + 1, p.stun_len, _len(cd, ha)))
		SE.ST_STAGGER:
			var sa := A.STAGGER_LEG if p.sub == 1 else A.STAGGER_GUT
			return Vector2i(_c(cd, sa), p.sf + 1)
		SE.ST_CRUMPLE:
			return Vector2i(_c(cd, A.CRUMPLE), p.sf + 1)
		SE.ST_AIR, SE.ST_KO:
			return Vector2i(_c(cd, air_anim(p.sub)), p.sf + 1)
		SE.ST_RINGOUT:
			return Vector2i(_c(cd, A.RINGOUT), p.sf + 1)
		SE.ST_WALL:
			return Vector2i(_c(cd, A.WALL_SPLAT if p.sub == 1 else A.WALL_STAGGER), p.sf + 1)
		SE.ST_DOWN:
			return Vector2i(_c(cd, A.DOWN_FACE if p.sub == SE.DOWN_FACE else A.DOWN_UP), p.sf + 1)
		SE.ST_GETUP:
			var ga := A.GETUP_UP
			match p.sub:
				SE.GU_ROLL_L:
					ga = A.ROLL_L
				SE.GU_ROLL_R:
					ga = A.ROLL_R
				SE.GU_ROLL_BACK:
					ga = A.ROLL_BACK
				_:
					ga = A.GETUP_UP
			return Vector2i(_c(cd, ga), p.sf + 1)
		SE.ST_TECH:
			var ta := [A.TECH, A.TECH_L, A.TECH_R, A.TECH_BACK][clampi(p.sub, 0, 3)] as int
			return Vector2i(_c(cd, ta), p.sf + 1)
		SE.ST_BACKTURN:
			return Vector2i(_c(cd, A.BACKTURN), p.sf + 1)
		SE.ST_TURN:
			return Vector2i(_c(cd, A.TURN), p.sf + 1)
		SE.ST_STANCE:
			if p.stance >= 0 and p.stance < cd.stance_anim.size():
				return Vector2i(cd.stance_anim[p.stance], p.sf + 1)
			return Vector2i(_c(cd, A.IDLE), p.sf + 1)
		SE.ST_CLASH:
			return Vector2i(_c(cd, A.CLASH), p.sf + 1)
		SE.ST_PARRIED:
			return Vector2i(_c(cd, A.PARRIED), p.sf + 1)
		SE.ST_WIN:
			return Vector2i(_c(cd, A.WIN), p.sf + 1)
		SE.ST_LOSE:
			return Vector2i(_c(cd, A.LOSE), p.sf + 1)
	return Vector2i(_c(cd, A.IDLE), p.sf + 1)


static func hit_anim(p: FighterState) -> int:
	match p.reaction:
		SE.R_HIGH_LIGHT:
			return A.HIT_CROUCH if p.sub == 1 else A.HIT_HIGH
		SE.R_HIGH_HEAVY:
			return A.HIT_CROUCH if p.sub == 1 else A.HIT_HIGH_HEAVY
		SE.R_MID_LIGHT:
			return A.HIT_CROUCH if p.sub == 1 else A.HIT_MID
		SE.R_MID_HEAVY:
			return A.HIT_CROUCH if p.sub == 1 else A.HIT_MID_HEAVY
		SE.R_LOW:
			return A.HIT_LOW
		SE.R_TURN:
			return A.HIT_TURN
		SE.R_GUARD_CRUSH:
			return A.GUARD_CRUSH
	return A.HIT_MID


static func air_anim(sub: int) -> int:
	match sub:
		SE.AIR_SPIN:
			return A.AIR_SPIN
		SE.AIR_KNOCK:
			return A.AIR_KNOCK
		SE.AIR_TRIP:
			return A.AIR_TRIP
	return A.AIR_LAUNCH


static func _len(cd: CharDef, a: int) -> int:
	if cd.baked == null:
		return 1
	var idx := _c(cd, a)
	if idx < 0 or idx >= cd.baked.anim_len.size():
		return 1
	return cd.baked.anim_len[idx]


## 経過 f / 全体 total を、アニメの長さ n にスケール
static func _scale(f: int, total: int, n: int) -> int:
	if total <= 0:
		return mini(f, n)
	return clampi((f * n + total - 1) / total, 1, n)


## 回避がキャラから見て左向きか
static func evade_to_left(w: SimWorld, i: int) -> bool:
	var p := w.f[i]
	var vx := -w.cam_x if p.evade_dir > 0 else w.cam_x
	var vz := -w.cam_z if p.evade_dir > 0 else w.cam_z
	var fx := FP.sin(p.facing)
	var fz := FP.cos(p.facing)
	# 右ベクトル = (-fz, fx)
	return FP.mul(vx, -fz) + FP.mul(vz, fx) < 0
