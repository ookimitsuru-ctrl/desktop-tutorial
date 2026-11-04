class_name PoseEval
extends RefCounted
## PoseData → 各ボーンのモデル空間姿勢（FK + 2ボーン IK）。
## 描画（FighterView）と判定ベイカーが同じコードを使うことで、見た目と判定を一致させる。

const B := Rig.B

var rig: Rig
## 出力: モデル空間のボーン姿勢
var global: Array[Transform3D] = []
## 出力: 親に対する回転（Skeleton3D.set_bone_pose_rotation 用）
var local_rot: Array[Quaternion] = []
## 出力: ルートボーン（Hips）の位置
var hips_pos: Vector3 = Vector3.ZERO

# IK 用のレスト情報
var _arm_u0: Array[Vector3] = [Vector3.ZERO, Vector3.ZERO]
var _arm_v0: Array[Vector3] = [Vector3.ZERO, Vector3.ZERO]
var _leg_u0: Array[Vector3] = [Vector3.ZERO, Vector3.ZERO]
var _leg_v0: Array[Vector3] = [Vector3.ZERO, Vector3.ZERO]
var _palm_n: Array[Vector3] = [Vector3.ZERO, Vector3.ZERO]
const ARM_P0 := Vector3(0, 0, 1)   # レスト時に肘が向く方向（後ろ）
const LEG_P0 := Vector3(0, 0, -1)  # レスト時に膝が向く方向（前）


func _init(r: Rig) -> void:
	rig = r
	global.resize(B.COUNT)
	local_rot.resize(B.COUNT)
	var j := rig.joints
	_arm_u0[0] = (j[B.L_LOWER_ARM] - j[B.L_UPPER_ARM]).normalized()
	_arm_v0[0] = (j[B.L_HAND] - j[B.L_LOWER_ARM]).normalized()
	_arm_u0[1] = (j[B.R_LOWER_ARM] - j[B.R_UPPER_ARM]).normalized()
	_arm_v0[1] = (j[B.R_HAND] - j[B.R_LOWER_ARM]).normalized()
	_leg_u0[0] = (j[B.L_LOWER_LEG] - j[B.L_UPPER_LEG]).normalized()
	_leg_v0[0] = (j[B.L_FOOT] - j[B.L_LOWER_LEG]).normalized()
	_leg_u0[1] = (j[B.R_LOWER_LEG] - j[B.R_UPPER_LEG]).normalized()
	_leg_v0[1] = (j[B.R_FOOT] - j[B.R_LOWER_LEG]).normalized()
	# 掌の向き（レスト時、体の内側やや下）
	var a := deg_to_rad(Rig.ARM_DOWN_DEG)
	_palm_n[0] = Vector3(cos(a), -sin(a), 0).normalized()
	_palm_n[1] = Vector3(-cos(a), -sin(a), 0).normalized()


static func euler_basis(e: Vector3) -> Basis:
	return Basis.from_euler(Vector3(deg_to_rad(-e.x), deg_to_rad(e.y), deg_to_rad(e.z)))


static func _perp(v: Vector3, axis: Vector3, fallback: Vector3) -> Vector3:
	var p := v - axis * v.dot(axis)
	if p.length_squared() < 1e-8:
		p = fallback - axis * fallback.dot(axis)
		if p.length_squared() < 1e-8:
			p = axis.cross(Vector3.UP)
			if p.length_squared() < 1e-8:
				p = axis.cross(Vector3.RIGHT)
	return p.normalized()


static func _frame(x: Vector3, y: Vector3) -> Basis:
	var z := x.cross(y).normalized()
	return Basis(x, y, z)


## rest 方向 u0 / 曲げ方向 p0 のボーンを、新しい方向 u1 / 曲げ方向 pole に向ける回転
static func _aim(u0: Vector3, p0: Vector3, u1: Vector3, pole: Vector3) -> Basis:
	var y0 := _perp(p0, u0, Vector3.FORWARD)
	var y1 := _perp(pole, u1, p0)
	var b0 := _frame(u0, y0)
	var b1 := _frame(u1, y1)
	return (b1 * b0.transposed()).orthonormalized()


## 2ボーン IK: 根元 s、目標 t、長さ a/b、曲げ方向 pole → 中間関節位置
static func _solve_mid(s: Vector3, t: Vector3, a: float, b: float, pole: Vector3) -> Vector3:
	var d_vec := t - s
	var d := d_vec.length()
	var dmin := absf(a - b) + 0.001
	var dmax := a + b - 0.0005
	d = clampf(d, dmin, dmax)
	var dir := d_vec.normalized() if d_vec.length_squared() > 1e-10 else Vector3.DOWN
	var cos_a := clampf((a * a + d * d - b * b) / (2.0 * a * d), -1.0, 1.0)
	var sin_a := sqrt(maxf(0.0, 1.0 - cos_a * cos_a))
	var bend := _perp(pole, dir, Vector3.BACK)
	return s + dir * (a * cos_a) + bend * (a * sin_a)


func evaluate(p: PoseData) -> void:
	var j := rig.joints
	var rl := rig.rest_local
	# 腰
	hips_pos = j[B.HIPS] + Vector3(0, p.root.y, 0)
	global[B.HIPS] = Transform3D(euler_basis(p.hips), hips_pos)
	global[B.SPINE] = global[B.HIPS] * Transform3D(euler_basis(p.spine), rl[B.SPINE])
	global[B.CHEST] = global[B.SPINE] * Transform3D(euler_basis(p.chest), rl[B.CHEST])
	global[B.NECK] = global[B.CHEST] * Transform3D(euler_basis(p.neck), rl[B.NECK])
	global[B.HEAD] = global[B.NECK] * Transform3D(euler_basis(p.head), rl[B.HEAD])
	global[B.L_SHOULDER] = global[B.CHEST] * Transform3D(euler_basis(p.shoulder_l), rl[B.L_SHOULDER])
	global[B.R_SHOULDER] = global[B.CHEST] * Transform3D(euler_basis(p.shoulder_r), rl[B.R_SHOULDER])
	# 手足の目標は「技の開始位置」基準で書かれている。体（ルート）は移動済みなので差し引く
	var off := Vector3(p.root.x, 0, p.root.z)
	# 腕
	_arm(0, B.L_SHOULDER, B.L_UPPER_ARM, B.L_LOWER_ARM, B.L_HAND, B.L_FINGERS, B.L_THUMB,
		Rig.to_model(p.hand_l - off), Rig.to_model(p.elbow_l), p.wrist_l, p.fist_l)
	_arm(1, B.R_SHOULDER, B.R_UPPER_ARM, B.R_LOWER_ARM, B.R_HAND, B.R_FINGERS, B.R_THUMB,
		Rig.to_model(p.hand_r - off), Rig.to_model(p.elbow_r), p.wrist_r, p.fist_r)
	# 脚
	_leg(0, B.L_UPPER_LEG, B.L_LOWER_LEG, B.L_FOOT, B.L_TOES,
		Rig.to_model(p.foot_l - off), Rig.to_model(p.knee_l), p.ankle_l, p.toes_l)
	_leg(1, B.R_UPPER_LEG, B.R_LOWER_LEG, B.R_FOOT, B.R_TOES,
		Rig.to_model(p.foot_r - off), Rig.to_model(p.knee_r), p.ankle_r, p.toes_r)
	# 揺れ物（描画側でばねを加算する。ここではレスト）
	for bi: int in [B.HAIR1, B.HAIR2, B.HAIR3, B.SASH1, B.SASH2]:
		var par := Rig.PARENTS[bi]
		global[bi] = global[par] * Transform3D(Basis.IDENTITY, rl[bi])
	# 親に対する回転
	for i: int in range(B.COUNT):
		var par := Rig.PARENTS[i]
		var lb: Basis = global[i].basis if par < 0 else global[par].basis.inverse() * global[i].basis
		local_rot[i] = Quaternion(lb.orthonormalized())


func _arm(side: int, sh: int, ua: int, la: int, hand: int, fing: int, thumb: int,
		target: Vector3, pole: Vector3, wrist: Vector3, fist: float) -> void:
	var rl := rig.rest_local
	var s := global[sh] * rl[ua]
	var mid := _solve_mid(s, target, rig.upper_arm_len, rig.lower_arm_len, pole)
	var u1 := (mid - s).normalized()
	var ub := _aim(_arm_u0[side], ARM_P0, u1, pole)
	global[ua] = Transform3D(ub, s)
	var dir_t := target - mid
	var v1 := dir_t.normalized() if dir_t.length_squared() > 1e-10 else u1
	# 腕が伸び切った時に目標へ届かないので、手首位置は前腕長で決める
	var lb := _aim(_arm_v0[side], ARM_P0, v1, pole)
	global[la] = Transform3D(lb, mid)
	var w := mid + v1 * rig.lower_arm_len
	# 手首: 前腕のレスト軸周りのひねり + 曲げ
	var v0 := _arm_v0[side]
	var flex_axis := v0.cross(_palm_n[side]).normalized()
	var wb := Basis(v0, deg_to_rad(wrist.y)) * Basis(flex_axis, deg_to_rad(wrist.x)) * Basis(_palm_n[side], deg_to_rad(wrist.z))
	global[hand] = Transform3D(lb * wb, w)
	# 指: 掌側へ曲げる
	var curl_axis := v0.cross(_palm_n[side]).normalized()
	var fb := Basis(curl_axis, deg_to_rad(-105.0 * fist))
	global[fing] = global[hand] * Transform3D(fb, rl[fing])
	var tb := Basis(curl_axis, deg_to_rad(-45.0 * fist))
	global[thumb] = global[hand] * Transform3D(tb, rl[thumb])


func _leg(side: int, ul: int, ll: int, foot: int, toes: int,
		target: Vector3, pole: Vector3, ankle: Vector3, toe_deg: float) -> void:
	var rl := rig.rest_local
	var s := global[B.HIPS] * rl[ul]
	var mid := _solve_mid(s, target, rig.upper_leg_len, rig.lower_leg_len, pole)
	var u1 := (mid - s).normalized()
	global[ul] = Transform3D(_aim(_leg_u0[side], LEG_P0, u1, pole), s)
	var dt := target - mid
	var v1 := dt.normalized() if dt.length_squared() > 1e-10 else u1
	var lb := _aim(_leg_v0[side], LEG_P0, v1, pole)
	global[ll] = Transform3D(lb, mid)
	var a := mid + v1 * rig.lower_leg_len
	global[foot] = Transform3D(euler_basis(ankle), a)
	global[toes] = global[foot] * Transform3D(Basis(Vector3.RIGHT, deg_to_rad(toe_deg)), rl[toes])


## ボーンの線分上の点（t=0 で関節、1 で先端）のモデル空間位置
func seg_point(bone: int, t: float) -> Vector3:
	var g := global[bone]
	var tip_local := rig.tips[bone] - rig.joints[bone]
	return g * (tip_local * t)
