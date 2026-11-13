class_name AnimClip
extends RefCounted
## キーポーズ列からなるアニメーション。frame は技のフレーム番号と同じ数え方（1..length）。
## キー f=0 は開始直前の姿勢。

enum Ease { LINEAR, IN_QUAD, OUT_QUAD, IN_OUT_QUAD, IN_CUBIC, OUT_CUBIC, IN_OUT_CUBIC, OUT_BACK, STEP, SMOOTH, IN_EXPO, OUT_EXPO }

var name: String = ""
var length: int = 1
var loop: bool = false
## 手足を Catmull-Rom で補間するか（蹴りの弧など）
var spline: bool = false
var key_frames: PackedInt32Array = PackedInt32Array()
var key_poses: Array[PoseData] = []
var key_eases: PackedInt32Array = PackedInt32Array()
## 被投げ側（投げ技のみ）: 被投げ側のキーと、攻撃側から見た被投げ側のルート位置 [右,上,前] と向き(度)
var victim_poses: Array[PoseData] = []
var victim_root: Array[Vector3] = []
var victim_yaw: PackedFloat32Array = PackedFloat32Array()
## イベント: [{f, type, id}]
var events: Array[Dictionary] = []


func add(f: int, pose: PoseData, ease: int = Ease.SMOOTH) -> AnimClip:
	key_frames.append(f)
	key_poses.append(pose)
	key_eases.append(ease)
	return self


func add_victim(pose: PoseData, root_rel: Vector3, yaw_deg: float) -> void:
	victim_poses.append(pose)
	victim_root.append(root_rel)
	victim_yaw.append(yaw_deg)


func is_throw() -> bool:
	return victim_poses.size() == key_poses.size() and victim_poses.size() > 0


static func ease_t(e: int, t: float) -> float:
	match e:
		Ease.LINEAR:
			return t
		Ease.IN_QUAD:
			return t * t
		Ease.OUT_QUAD:
			return 1.0 - (1.0 - t) * (1.0 - t)
		Ease.IN_OUT_QUAD:
			return 2.0 * t * t if t < 0.5 else 1.0 - pow(-2.0 * t + 2.0, 2.0) / 2.0
		Ease.IN_CUBIC:
			return t * t * t
		Ease.OUT_CUBIC:
			return 1.0 - pow(1.0 - t, 3.0)
		Ease.IN_OUT_CUBIC:
			return 4.0 * t * t * t if t < 0.5 else 1.0 - pow(-2.0 * t + 2.0, 3.0) / 2.0
		Ease.OUT_BACK:
			var c1 := 1.70158
			var c3 := c1 + 1.0
			return 1.0 + c3 * pow(t - 1.0, 3.0) + c1 * pow(t - 1.0, 2.0)
		Ease.STEP:
			return 0.0 if t < 1.0 else 1.0
		Ease.IN_EXPO:
			return 0.0 if t <= 0.0 else pow(2.0, 10.0 * t - 10.0)
		Ease.OUT_EXPO:
			return 1.0 if t >= 1.0 else 1.0 - pow(2.0, -10.0 * t)
	# SMOOTH
	return -(cos(PI * t) - 1.0) / 2.0


func _segment(frame: float) -> int:
	var n := key_frames.size()
	for i: int in range(n - 1):
		if frame <= key_frames[i + 1]:
			return i
	return n - 2


## 指定フレーム（小数可）のポーズ
func sample(frame: float) -> PoseData:
	var n := key_frames.size()
	if n == 0:
		return PoseData.new()
	if n == 1:
		return key_poses[0].copy()
	var f := frame
	if loop and length > 0:
		f = fposmod(frame, float(length))
	if f <= key_frames[0]:
		return key_poses[0].copy()
	if f >= key_frames[n - 1]:
		return key_poses[n - 1].copy()
	var i := _segment(f)
	var f0 := float(key_frames[i])
	var f1 := float(key_frames[i + 1])
	var t := 0.0 if f1 <= f0 else (f - f0) / (f1 - f0)
	t = ease_t(key_eases[i + 1], clampf(t, 0.0, 1.0))
	if spline and n >= 3:
		var p0 := key_poses[maxi(i - 1, 0)]
		var p3 := key_poses[mini(i + 2, n - 1)]
		return PoseData.spline_pose(p0, key_poses[i], key_poses[i + 1], p3, t)
	return PoseData.lerp_pose(key_poses[i], key_poses[i + 1], t)


## 被投げ側のポーズとルート（攻撃側キャラ空間）
func sample_victim(frame: float) -> Array:
	var n := key_frames.size()
	if victim_poses.size() != n or n == 0:
		return [PoseData.new(), Vector3.ZERO, 0.0]
	if frame <= key_frames[0]:
		return [victim_poses[0].copy(), victim_root[0], victim_yaw[0]]
	if frame >= key_frames[n - 1]:
		return [victim_poses[n - 1].copy(), victim_root[n - 1], victim_yaw[n - 1]]
	var i := _segment(frame)
	var f0 := float(key_frames[i])
	var f1 := float(key_frames[i + 1])
	var t := 0.0 if f1 <= f0 else (frame - f0) / (f1 - f0)
	t = ease_t(key_eases[i + 1], clampf(t, 0.0, 1.0))
	return [PoseData.lerp_pose(victim_poses[i], victim_poses[i + 1], t),
		victim_root[i].lerp(victim_root[i + 1], t), lerpf(victim_yaw[i], victim_yaw[i + 1], t)]
