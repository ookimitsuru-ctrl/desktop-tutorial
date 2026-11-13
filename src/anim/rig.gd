class_name Rig
extends RefCounted
## キャラクターの骨格定義（全ボーンのレスト回転は単位回転、平行移動のみ）。
## モデル空間: +X = キャラの右, +Y = 上, -Z = 前（Godot の前方規約）。
## データ上のベクトルは [右, 上, 前] で書き、to_model() で (x, y, -f) に変換する。

enum B {
	HIPS, SPINE, CHEST, NECK, HEAD,
	L_SHOULDER, L_UPPER_ARM, L_LOWER_ARM, L_HAND,
	R_SHOULDER, R_UPPER_ARM, R_LOWER_ARM, R_HAND,
	L_UPPER_LEG, L_LOWER_LEG, L_FOOT, L_TOES,
	R_UPPER_LEG, R_LOWER_LEG, R_FOOT, R_TOES,
	L_FINGERS, L_THUMB, R_FINGERS, R_THUMB,
	HAIR1, HAIR2, HAIR3, SASH1, SASH2,
	COUNT
}

const NAMES: Array[String] = [
	"Hips", "Spine", "Chest", "Neck", "Head",
	"LeftShoulder", "LeftUpperArm", "LeftLowerArm", "LeftHand",
	"RightShoulder", "RightUpperArm", "RightLowerArm", "RightHand",
	"LeftUpperLeg", "LeftLowerLeg", "LeftFoot", "LeftToes",
	"RightUpperLeg", "RightLowerLeg", "RightFoot", "RightToes",
	"LeftFingers", "LeftThumb", "RightFingers", "RightThumb",
	"Hair1", "Hair2", "Hair3", "Sash1", "Sash2",
]

const PARENTS: Array[int] = [
	-1, B.HIPS, B.SPINE, B.CHEST, B.NECK,
	B.CHEST, B.L_SHOULDER, B.L_UPPER_ARM, B.L_LOWER_ARM,
	B.CHEST, B.R_SHOULDER, B.R_UPPER_ARM, B.R_LOWER_ARM,
	B.HIPS, B.L_UPPER_LEG, B.L_LOWER_LEG, B.L_FOOT,
	B.HIPS, B.R_UPPER_LEG, B.R_LOWER_LEG, B.R_FOOT,
	B.L_HAND, B.L_HAND, B.R_HAND, B.R_HAND,
	B.HEAD, B.HAIR1, B.HAIR2, B.HIPS, B.SASH1,
]

## A ポーズの腕の下げ角（垂直からの角度・度）
const ARM_DOWN_DEG := 50.0

var height: float = 1.78
## 各ボーンの根元（関節）のモデル空間位置
var joints: Array[Vector3] = []
## 各ボーンの先端（子が複数・末端のボーン用）
var tips: Array[Vector3] = []
## レスト時の親からの相対位置
var rest_local: Array[Vector3] = []
var upper_arm_len: float = 0.0
var lower_arm_len: float = 0.0
var upper_leg_len: float = 0.0
var lower_leg_len: float = 0.0
var has_hair: bool = false
var has_sash: bool = false
var hair_len: float = 0.3


static func to_model(v: Vector3) -> Vector3:
	return Vector3(v.x, v.y, -v.z)


static func from_model(v: Vector3) -> Vector3:
	return Vector3(v.x, v.y, -v.z)


static func bone_index(bone_name: String) -> int:
	return NAMES.find(bone_name)


## body: character.json の "body"（数値は文字列 or 数値どちらでも可・描画用なので float）
static func build(body: Dictionary) -> Rig:
	var r := Rig.new()
	var h := float(str(body.get("height", "1.78")))
	var sw := float(str(body.get("shoulder", "1.0")))
	var hw := float(str(body.get("hip", "1.0")))
	var arm := float(str(body.get("arm", "1.0")))
	var leg := float(str(body.get("leg", "1.0")))
	var torso := float(str(body.get("torso", "1.0")))
	r.height = h
	r.has_hair = bool(body.get("hair_chain", false))
	r.has_sash = bool(body.get("sash_chain", false))
	r.hair_len = float(str(body.get("hair_len", "0.30")))
	var s := h / 1.78
	var j: Array[Vector3] = []
	j.resize(B.COUNT)
	var t: Array[Vector3] = []
	t.resize(B.COUNT)
	var hip_y := 0.955 * s * leg
	var leg_scale := hip_y / 0.955
	j[B.HIPS] = Vector3(0, hip_y, 0)
	j[B.SPINE] = Vector3(0, hip_y + 0.10 * s * torso, 0.0)
	j[B.CHEST] = Vector3(0, hip_y + 0.28 * s * torso, 0.0)
	j[B.NECK] = Vector3(0, hip_y + 0.545 * s * torso, 0.005)
	j[B.HEAD] = Vector3(0, hip_y + 0.625 * s * torso, 0.0)
	t[B.HEAD] = j[B.HEAD] + Vector3(0, 0.205 * s, 0)
	var sh_y := hip_y + 0.49 * s * torso
	var sh_x := 0.185 * s * sw
	j[B.L_SHOULDER] = Vector3(-0.025 * s, sh_y, 0.0)
	j[B.R_SHOULDER] = Vector3(0.025 * s, sh_y, 0.0)
	j[B.L_UPPER_ARM] = Vector3(-sh_x, sh_y - 0.01 * s, 0.0)
	j[B.R_UPPER_ARM] = Vector3(sh_x, sh_y - 0.01 * s, 0.0)
	r.upper_arm_len = 0.295 * s * arm
	r.lower_arm_len = 0.255 * s * arm
	var a := deg_to_rad(ARM_DOWN_DEG)
	var dl := Vector3(-sin(a), -cos(a), 0.0)
	var dr := Vector3(sin(a), -cos(a), 0.0)
	j[B.L_LOWER_ARM] = j[B.L_UPPER_ARM] + dl * r.upper_arm_len
	j[B.R_LOWER_ARM] = j[B.R_UPPER_ARM] + dr * r.upper_arm_len
	j[B.L_HAND] = j[B.L_LOWER_ARM] + dl * r.lower_arm_len
	j[B.R_HAND] = j[B.R_LOWER_ARM] + dr * r.lower_arm_len
	j[B.L_FINGERS] = j[B.L_HAND] + dl * 0.085 * s
	j[B.R_FINGERS] = j[B.R_HAND] + dr * 0.085 * s
	t[B.L_FINGERS] = j[B.L_FINGERS] + dl * 0.085 * s
	t[B.R_FINGERS] = j[B.R_FINGERS] + dr * 0.085 * s
	t[B.L_HAND] = j[B.L_FINGERS]
	t[B.R_HAND] = j[B.R_FINGERS]
	j[B.L_THUMB] = j[B.L_HAND] + Vector3(0.015, -0.02, -0.03) * s
	j[B.R_THUMB] = j[B.R_HAND] + Vector3(-0.015, -0.02, -0.03) * s
	t[B.L_THUMB] = j[B.L_THUMB] + Vector3(0.01, -0.05, -0.02) * s
	t[B.R_THUMB] = j[B.R_THUMB] + Vector3(-0.01, -0.05, -0.02) * s
	var hx := 0.092 * s * hw
	j[B.L_UPPER_LEG] = Vector3(-hx, hip_y - 0.035 * s, 0.0)
	j[B.R_UPPER_LEG] = Vector3(hx, hip_y - 0.035 * s, 0.0)
	var ankle_y := 0.085 * s
	var knee_y := lerpf(ankle_y, j[B.L_UPPER_LEG].y, 0.47)
	j[B.L_LOWER_LEG] = Vector3(-hx - 0.004 * s, knee_y, -0.012 * s)
	j[B.R_LOWER_LEG] = Vector3(hx + 0.004 * s, knee_y, -0.012 * s)
	j[B.L_FOOT] = Vector3(-hx - 0.008 * s, ankle_y, 0.012 * s)
	j[B.R_FOOT] = Vector3(hx + 0.008 * s, ankle_y, 0.012 * s)
	j[B.L_TOES] = Vector3(-hx - 0.012 * s, 0.022 * s, -0.125 * s)
	j[B.R_TOES] = Vector3(hx + 0.012 * s, 0.022 * s, -0.125 * s)
	t[B.L_TOES] = j[B.L_TOES] + Vector3(0, -0.005, -0.065) * s
	t[B.R_TOES] = j[B.R_TOES] + Vector3(0, -0.005, -0.065) * s
	t[B.L_FOOT] = j[B.L_TOES]
	t[B.R_FOOT] = j[B.R_TOES]
	r.upper_leg_len = j[B.L_UPPER_LEG].distance_to(j[B.L_LOWER_LEG])
	r.lower_leg_len = j[B.L_LOWER_LEG].distance_to(j[B.L_FOOT])
	# 髪（後頭部から下がる鎖）と帯端
	var hl := r.hair_len * s
	j[B.HAIR1] = j[B.HEAD] + Vector3(0, 0.15 * s, 0.09 * s)
	j[B.HAIR2] = j[B.HAIR1] + Vector3(0, -hl * 0.4, 0.035 * s)
	j[B.HAIR3] = j[B.HAIR2] + Vector3(0, -hl * 0.35, 0.02 * s)
	t[B.HAIR3] = j[B.HAIR3] + Vector3(0, -hl * 0.3, 0.01 * s)
	j[B.SASH1] = j[B.HIPS] + Vector3(-0.07 * s, 0.03 * s, -0.11 * s)
	j[B.SASH2] = j[B.SASH1] + Vector3(-0.01 * s, -0.17 * s, -0.01 * s)
	t[B.SASH2] = j[B.SASH2] + Vector3(-0.005 * s, -0.17 * s, 0)
	# 先端の既定値: 子ボーンの関節
	for i: int in range(B.COUNT):
		if t[i] == Vector3.ZERO:
			for c: int in range(B.COUNT):
				if PARENTS[c] == i:
					t[i] = j[c]
					break
	t[B.CHEST] = j[B.NECK]
	t[B.HIPS] = j[B.SPINE]
	r.joints = j
	r.tips = t
	r.rest_local = []
	r.rest_local.resize(B.COUNT)
	for i: int in range(B.COUNT):
		var p := PARENTS[i]
		r.rest_local[i] = j[i] if p < 0 else j[i] - j[p]
	return r


func to_json() -> Dictionary:
	var arr: Array = []
	for i: int in range(B.COUNT):
		arr.append({
			"name": NAMES[i], "parent": PARENTS[i],
			"pos": [joints[i].x, joints[i].y, joints[i].z],
			"tip": [tips[i].x, tips[i].y, tips[i].z],
		})
	return {"height": height, "bones": arr, "hair": has_hair, "sash": has_sash}
