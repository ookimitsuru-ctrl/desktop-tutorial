class_name LimbTrail
extends MeshInstance3D
## 打撃の軌跡。手足の先が速く動いている間だけ、通った跡を帯にして描く（加算）。
## 見た目だけの演出で、シミュレーションには関わらない。

const LIFE := 0.15
const MAX_PTS := 28
const SUB := 3   # 1 フレームの移動を何分割するか（弧を滑らかに）

var color := Color(1.0, 0.8, 0.5)
var _im: ImmediateMesh
# 手足ごとの履歴: [a, b, age] を並べる（a, b = 帯の両端）
var _a: Array = [[], [], [], []]
var _b: Array = [[], [], [], []]
var _age: Array = [[], [], [], []]
var _str: Array = [[], [], [], []]
var _last: Array[Vector3] = [Vector3.ZERO, Vector3.ZERO, Vector3.ZERO, Vector3.ZERO]
var _has_last: Array[bool] = [false, false, false, false]
var _any := false


func _init() -> void:
	_im = ImmediateMesh.new()
	mesh = _im
	var m := ShaderMaterial.new()
	m.shader = load("res://shaders/limb_trail.gdshader")
	material_override = m
	cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	top_level = true
	extra_cull_margin = 100.0


func clear() -> void:
	for k: int in range(4):
		_a[k].clear()
		_b[k].clear()
		_age[k].clear()
		_str[k].clear()
		_has_last[k] = false
	_im.clear_surfaces()
	_any = false


## limb: 0〜3、a / b: 帯の両端（ワールド座標）、emit: 軌跡を出す状態か、dt: 進んだ時間（ヒットストップ中は 0）
func feed(limb: int, a: Vector3, b: Vector3, emit: bool, dt: float) -> void:
	var mid := (a + b) * 0.5
	var la: Array = _a[limb]
	var lb: Array = _b[limb]
	var lg: Array = _age[limb]
	var ls: Array = _str[limb]
	if dt > 0.0:
		for i: int in range(lg.size()):
			lg[i] += dt
		while not lg.is_empty() and float(lg[0]) > LIFE:
			la.pop_front()
			lb.pop_front()
			lg.pop_front()
			ls.pop_front()
	var speed := 0.0
	if _has_last[limb] and dt > 0.0:
		speed = (mid - _last[limb]).length() / dt
	if dt > 0.0:
		_last[limb] = mid
		_has_last[limb] = true
	if not emit or dt <= 0.0 or speed < 4.5 or speed > 80.0:
		return
	var st := clampf((speed - 4.5) / 7.0, 0.0, 1.0)
	var n := la.size()
	if n >= 2 and float(lg[n - 1]) < dt * 1.5:
		# 直前の区間の流れを保ったまま、間を補って弧にする
		var a0: Vector3 = la[n - 2]
		var a1: Vector3 = la[n - 1]
		var b0: Vector3 = lb[n - 2]
		var b1: Vector3 = lb[n - 1]
		var s1 := float(ls[n - 1])
		for k: int in range(1, SUB):
			var t := float(k) / float(SUB)
			la.append(_cr(a0, a1, a, a * 2.0 - a1, t))
			lb.append(_cr(b0, b1, b, b * 2.0 - b1, t))
			lg.append(dt * (1.0 - t))
			ls.append(lerpf(s1, st, t))
	la.append(a)
	lb.append(b)
	lg.append(0.0)
	ls.append(st)
	while la.size() > MAX_PTS:
		la.pop_front()
		lb.pop_front()
		lg.pop_front()
		ls.pop_front()


static func _cr(p0: Vector3, p1: Vector3, p2: Vector3, p3: Vector3, t: float) -> Vector3:
	var t2 := t * t
	var t3 := t2 * t
	return 0.5 * ((2.0 * p1) + (-p0 + p2) * t + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t2 + (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * t3)


func rebuild() -> void:
	var need := false
	for k: int in range(4):
		var g: Array = _age[k]
		for i: int in range(g.size() - 1):
			if float(g[i]) - float(g[i + 1]) <= 0.05:
				need = true
				break
	if not need:
		if _any:
			_im.clear_surfaces()
			_any = false
		return
	_im.clear_surfaces()
	_im.surface_begin(Mesh.PRIMITIVE_TRIANGLES)
	for k: int in range(4):
		var la: Array = _a[k]
		var lb: Array = _b[k]
		var lg: Array = _age[k]
		var ls: Array = _str[k]
		for i: int in range(la.size() - 1):
			# 途切れ（出していない間）をまたいで帯をつながない
			if float(lg[i]) - float(lg[i + 1]) > 0.05:
				continue
			var u0 := clampf(float(lg[i]) / LIFE, 0.0, 1.0)
			var u1 := clampf(float(lg[i + 1]) / LIFE, 0.0, 1.0)
			var c0 := Color(color.r, color.g, color.b, float(ls[i]))
			var c1 := Color(color.r, color.g, color.b, float(ls[i + 1]))
			_v(la[i], c0, Vector2(u0, 0.0))
			_v(lb[i], c0, Vector2(u0, 1.0))
			_v(la[i + 1], c1, Vector2(u1, 0.0))
			_v(lb[i], c0, Vector2(u0, 1.0))
			_v(lb[i + 1], c1, Vector2(u1, 1.0))
			_v(la[i + 1], c1, Vector2(u1, 0.0))
	_im.surface_end()
	_any = true


func _v(p: Vector3, c: Color, uv: Vector2) -> void:
	_im.surface_set_color(c)
	_im.surface_set_uv(uv)
	_im.surface_add_vertex(p)
