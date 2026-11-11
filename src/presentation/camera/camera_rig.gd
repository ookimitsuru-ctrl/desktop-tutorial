class_name CameraRig
extends Camera3D
## 対戦カメラ。対戦軸に垂直な側（シミュレーションの cam_dir）から両者を収める。仕様: 09 §9.8

const FP_TO_F := 1.0 / 65536.0
const VFOV := 32.0

var trauma := 0.0
# 強打の瞬間に画角を一瞬だけ詰める（ばねで戻る）
var _punch := 0.0
var _punch_v := 0.0
var shake_scale := 1.0
var _pos := Vector3(0, 1.6, 6)
var _target := Vector3(0, 1.0, 0)
var _inited := false
var mode := "fight"   # fight / intro / ko / ringout / win / free
var mode_t := 0.0
var focus_player := 0
var zoom_bias := 0.0
var free_yaw := 0.0
var free_pitch := 12.0
var free_dist := 5.0


func _ready() -> void:
	fov = VFOV
	keep_aspect = Camera3D.KEEP_HEIGHT
	near = 0.05
	far = 400.0


func add_trauma(t: float) -> void:
	trauma = clampf(trauma + t, 0.0, 1.0)


func punch(amount: float) -> void:
	_punch_v -= amount * 38.0 * shake_scale


func snap() -> void:
	_inited = false


func update_cam(w: SimWorld, delta: float) -> void:
	var a := Vector3(w.f[0].x * FP_TO_F, w.f[0].y * FP_TO_F, w.f[0].z * FP_TO_F)
	var b := Vector3(w.f[1].x * FP_TO_F, w.f[1].y * FP_TO_F, w.f[1].z * FP_TO_F)
	var mid := (a + b) * 0.5
	mid.y = 0.0
	var sep := Vector2(a.x - b.x, a.z - b.z).length()
	var cam_dir := Vector3(w.cam_x * FP_TO_F, 0, w.cam_z * FP_TO_F).normalized()
	if cam_dir.length_squared() < 0.5:
		cam_dir = Vector3(0, 0, 1)
	var vp := get_viewport().get_visible_rect().size
	var aspect := vp.x / maxf(vp.y, 1.0)
	var hhalf := atan(tan(deg_to_rad(VFOV * 0.5)) * aspect)
	var dist := clampf((sep * 0.5 + 1.0) / tan(hhalf), 4.6, 8.5) + zoom_bias
	var air := maxf(a.y, b.y)
	var tgt := mid + Vector3(0, 0.92 + air * 0.4, 0)
	var desired := tgt + cam_dir * dist + Vector3(0, 0.42 + (dist - 4.6) * 0.12, 0)
	match mode:
		"intro":
			mode_t += delta
			var ang := lerpf(-0.9, 0.0, smoothstep(0.0, 1.6, mode_t))
			var off := (desired - tgt).rotated(Vector3.UP, ang) * lerpf(1.6, 1.0, smoothstep(0.0, 1.6, mode_t))
			desired = tgt + off + Vector3(0, lerpf(1.2, 0.0, smoothstep(0.0, 1.6, mode_t)), 0)
		"ko", "ringout":
			mode_t += delta
			var fp := a if focus_player == 0 else b
			var ft := Vector3(fp.x, maxf(0.6, fp.y + 0.6), fp.z)
			tgt = tgt.lerp(ft, 0.55)
			desired = tgt + (desired - tgt) * 0.72 + Vector3(0, 0.2, 0)
		"win":
			mode_t += delta
			var wp := a if focus_player == 0 else b
			# ガッツポーズで突き上げた拳まで入るよう、高めを見て少し引く
			var wt := Vector3(wp.x, 1.28, wp.z)
			var orbit := (cam_dir * 3.3).rotated(Vector3.UP, 0.6 - mode_t * 0.15)
			tgt = wt
			desired = wt + orbit + Vector3(0, 0.25, 0)
		"free":
			tgt = mid + Vector3(0, 1.0, 0)
			var base := Vector3(0, 0, free_dist).rotated(Vector3.RIGHT, -deg_to_rad(free_pitch)).rotated(Vector3.UP, free_yaw)
			desired = tgt + base
	if not _inited:
		_pos = desired
		_target = tgt
		_inited = true
	var k := 1.0 - exp(-delta * (5.5 if mode == "fight" else 3.0))
	_pos = _pos.lerp(desired, k)
	_target = _target.lerp(tgt, 1.0 - exp(-delta * 7.0))
	_punch_v += (-_punch * 260.0 - _punch_v * 22.0) * minf(delta, 0.033)
	_punch = clampf(_punch + _punch_v * minf(delta, 0.033), -3.5, 1.5)
	fov = VFOV + _punch
	var shake_off := Vector3.ZERO
	var rot_z := 0.0
	if trauma > 0.0:
		var t2 := trauma * trauma * shake_scale
		shake_off = Vector3(randf_range(-1, 1), randf_range(-1, 1), randf_range(-1, 1)) * 0.035 * t2
		rot_z = randf_range(-1, 1) * 0.6 * t2
		trauma = maxf(0.0, trauma - delta * 1.6)
	global_position = _pos + shake_off
	look_at(_target + shake_off * 0.5, Vector3.UP)
	rotate_object_local(Vector3.FORWARD, deg_to_rad(rot_z))
