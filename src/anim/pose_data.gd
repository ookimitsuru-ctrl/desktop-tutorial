class_name PoseData
extends RefCounted
## 1つのキーポーズ（IK ベース）。全ベクトルはキャラ空間 [右, 上, 前]（メートル / 度）。
## 角度は [前屈(+), 左へ向く(+), 左へ傾く(+)]。

## root.x / root.z = 技開始位置からの水平移動（シミュレーションの移動量になる）、root.y = 腰の上下
var root: Vector3 = Vector3.ZERO
var hips: Vector3 = Vector3.ZERO
var spine: Vector3 = Vector3.ZERO
var chest: Vector3 = Vector3.ZERO
var neck: Vector3 = Vector3.ZERO
var head: Vector3 = Vector3.ZERO
var shoulder_l: Vector3 = Vector3.ZERO
var shoulder_r: Vector3 = Vector3.ZERO
## 手首（Hand 関節）の目標位置
var hand_l: Vector3 = Vector3.ZERO
var hand_r: Vector3 = Vector3.ZERO
## 肘の向くべき方向
var elbow_l: Vector3 = Vector3(-0.5, -0.3, -0.6)
var elbow_r: Vector3 = Vector3(0.5, -0.3, -0.6)
## 手首の回転（前腕に対する相対）
var wrist_l: Vector3 = Vector3.ZERO
var wrist_r: Vector3 = Vector3.ZERO
## 指の握り 0=開き 1=拳
var fist_l: float = 1.0
var fist_r: float = 1.0
## 足首（Foot 関節）の目標位置
var foot_l: Vector3 = Vector3.ZERO
var foot_r: Vector3 = Vector3.ZERO
## 膝の向くべき方向
var knee_l: Vector3 = Vector3(0, 0, 1)
var knee_r: Vector3 = Vector3(0, 0, 1)
## 足の向き（キャラ空間の絶対角度）
var ankle_l: Vector3 = Vector3.ZERO
var ankle_r: Vector3 = Vector3.ZERO
## つま先の曲げ（度、+ で上に反る）
var toes_l: float = 0.0
var toes_r: float = 0.0
## 表情（0=通常 1=力み 2=被弾 3=叫び 4=KO 5=笑み）
var face: int = 0

const VEC_FIELDS: Array[String] = [
	"root", "hips", "spine", "chest", "neck", "head", "shoulder_l", "shoulder_r",
	"hand_l", "hand_r", "elbow_l", "elbow_r", "wrist_l", "wrist_r",
	"foot_l", "foot_r", "knee_l", "knee_r", "ankle_l", "ankle_r",
]
const FLOAT_FIELDS: Array[String] = ["fist_l", "fist_r", "toes_l", "toes_r"]


func copy() -> PoseData:
	var p := PoseData.new()
	p.root = root
	p.hips = hips
	p.spine = spine
	p.chest = chest
	p.neck = neck
	p.head = head
	p.shoulder_l = shoulder_l
	p.shoulder_r = shoulder_r
	p.hand_l = hand_l
	p.hand_r = hand_r
	p.elbow_l = elbow_l
	p.elbow_r = elbow_r
	p.wrist_l = wrist_l
	p.wrist_r = wrist_r
	p.fist_l = fist_l
	p.fist_r = fist_r
	p.foot_l = foot_l
	p.foot_r = foot_r
	p.knee_l = knee_l
	p.knee_r = knee_r
	p.ankle_l = ankle_l
	p.ankle_r = ankle_r
	p.toes_l = toes_l
	p.toes_r = toes_r
	p.face = face
	return p


## a→b を t(0..1) で補間（結果は新規）
static func lerp_pose(a: PoseData, b: PoseData, t: float) -> PoseData:
	var p := PoseData.new()
	p.root = a.root.lerp(b.root, t)
	p.hips = a.hips.lerp(b.hips, t)
	p.spine = a.spine.lerp(b.spine, t)
	p.chest = a.chest.lerp(b.chest, t)
	p.neck = a.neck.lerp(b.neck, t)
	p.head = a.head.lerp(b.head, t)
	p.shoulder_l = a.shoulder_l.lerp(b.shoulder_l, t)
	p.shoulder_r = a.shoulder_r.lerp(b.shoulder_r, t)
	p.hand_l = a.hand_l.lerp(b.hand_l, t)
	p.hand_r = a.hand_r.lerp(b.hand_r, t)
	p.elbow_l = a.elbow_l.lerp(b.elbow_l, t)
	p.elbow_r = a.elbow_r.lerp(b.elbow_r, t)
	p.wrist_l = a.wrist_l.lerp(b.wrist_l, t)
	p.wrist_r = a.wrist_r.lerp(b.wrist_r, t)
	p.fist_l = lerpf(a.fist_l, b.fist_l, t)
	p.fist_r = lerpf(a.fist_r, b.fist_r, t)
	p.foot_l = a.foot_l.lerp(b.foot_l, t)
	p.foot_r = a.foot_r.lerp(b.foot_r, t)
	p.knee_l = a.knee_l.lerp(b.knee_l, t)
	p.knee_r = a.knee_r.lerp(b.knee_r, t)
	p.ankle_l = a.ankle_l.lerp(b.ankle_l, t)
	p.ankle_r = a.ankle_r.lerp(b.ankle_r, t)
	p.toes_l = lerpf(a.toes_l, b.toes_l, t)
	p.toes_r = lerpf(a.toes_r, b.toes_r, t)
	p.face = a.face if t < 0.5 else b.face
	return p


## 4点の Catmull-Rom（手足の軌道を弧にする）。p1→p2 の区間を t で。
static func spline_pose(p0: PoseData, p1: PoseData, p2: PoseData, p3: PoseData, t: float) -> PoseData:
	var p := lerp_pose(p1, p2, t)
	p.hand_l = _cr(p0.hand_l, p1.hand_l, p2.hand_l, p3.hand_l, t)
	p.hand_r = _cr(p0.hand_r, p1.hand_r, p2.hand_r, p3.hand_r, t)
	p.foot_l = _cr(p0.foot_l, p1.foot_l, p2.foot_l, p3.foot_l, t)
	p.foot_r = _cr(p0.foot_r, p1.foot_r, p2.foot_r, p3.foot_r, t)
	return p


static func _cr(a: Vector3, b: Vector3, c: Vector3, d: Vector3, t: float) -> Vector3:
	var t2 := t * t
	var t3 := t2 * t
	return 0.5 * ((2.0 * b) + (-a + c) * t + (2.0 * a - 5.0 * b + 4.0 * c - d) * t2 + (-a + 3.0 * b - 3.0 * c + d) * t3)


## 左右反転（キャラ空間の x を反転し、左右の部位を入れ替える）
func mirrored() -> PoseData:
	var p := PoseData.new()
	p.root = _mx(root)
	p.hips = _ma(hips)
	p.spine = _ma(spine)
	p.chest = _ma(chest)
	p.neck = _ma(neck)
	p.head = _ma(head)
	p.shoulder_l = _ma(shoulder_r)
	p.shoulder_r = _ma(shoulder_l)
	p.hand_l = _mx(hand_r)
	p.hand_r = _mx(hand_l)
	p.elbow_l = _mx(elbow_r)
	p.elbow_r = _mx(elbow_l)
	p.wrist_l = _ma(wrist_r)
	p.wrist_r = _ma(wrist_l)
	p.fist_l = fist_r
	p.fist_r = fist_l
	p.foot_l = _mx(foot_r)
	p.foot_r = _mx(foot_l)
	p.knee_l = _mx(knee_r)
	p.knee_r = _mx(knee_l)
	p.ankle_l = _ma(ankle_r)
	p.ankle_r = _ma(ankle_l)
	p.toes_l = toes_r
	p.toes_r = toes_l
	p.face = face
	return p


static func _mx(v: Vector3) -> Vector3:
	return Vector3(-v.x, v.y, v.z)


static func _ma(v: Vector3) -> Vector3:
	return Vector3(v.x, -v.y, -v.z)


## Dictionary（JSON）から差分を適用。値は [x,y,z] または数値。
func apply_dict(d: Dictionary) -> void:
	for k: String in d:
		if k in VEC_FIELDS:
			var a: Array = d[k]
			set(k, Vector3(float(a[0]), float(a[1]), float(a[2])))
		elif k in FLOAT_FIELDS:
			set(k, float(d[k]))
		elif k == "face":
			face = int(d[k])
