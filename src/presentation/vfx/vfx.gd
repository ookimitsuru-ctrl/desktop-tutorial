class_name Vfx
extends Node3D
## 打撃エフェクト・土煙などのプール（試合中に生成しない）。仕様: 09 §9.9

const SPARKS := 20
const DUSTS := 8

var _sparks: Array[MeshInstance3D] = []
var _life: Array[float] = []
var _dur: Array[float] = []
var _next := 0
var _dusts: Array[CPUParticles3D] = []
var _dnext := 0
var photosensitive := false
const BURSTS := 8
var _bursts: Array[CPUParticles3D] = []
var _bnext := 0


func _ready() -> void:
	var spark_shader: Shader = load("res://shaders/vfx_spark.gdshader")
	for i: int in range(SPARKS):
		var m := MeshInstance3D.new()
		var q := QuadMesh.new()
		q.size = Vector2(1, 1)
		m.mesh = q
		var mat := ShaderMaterial.new()
		mat.shader = spark_shader
		m.material_override = mat
		m.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		m.visible = false
		add_child(m)
		_sparks.append(m)
		_life.append(0.0)
		_dur.append(0.2)
	# 金属の火花: 細い棒を速度の向きにそろえて飛ばす（重力で落ち、色が冷めていく）
	var bm := StandardMaterial3D.new()
	bm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	bm.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	bm.vertex_color_use_as_albedo = true
	bm.albedo_color = Color(1, 1, 1)
	bm.cull_mode = BaseMaterial3D.CULL_DISABLED
	for b: int in range(BURSTS):
		var bp := CPUParticles3D.new()
		bp.emitting = false
		bp.one_shot = true
		bp.amount = 16
		bp.lifetime = 0.45
		bp.explosiveness = 1.0
		bp.local_coords = false
		var bx := BoxMesh.new()
		bx.size = Vector3(0.012, 0.11, 0.012)
		bx.material = bm
		bp.mesh = bx
		bp.set_particle_flag(CPUParticles3D.PARTICLE_FLAG_ALIGN_Y_TO_VELOCITY, true)
		bp.spread = 48.0
		bp.initial_velocity_min = 1.8
		bp.initial_velocity_max = 6.5
		bp.gravity = Vector3(0, -11.0, 0)
		bp.damping_min = 0.5
		bp.damping_max = 2.0
		bp.scale_amount_min = 0.5
		bp.scale_amount_max = 1.3
		bp.lifetime_randomness = 0.5
		var bc := Curve.new()
		bc.add_point(Vector2(0, 1.0))
		bc.add_point(Vector2(1, 0.15))
		bp.scale_amount_curve = bc
		var bg := Gradient.new()
		bg.set_color(0, Color(1.0, 0.97, 0.85))
		bg.add_point(0.35, Color(1.0, 0.7, 0.25))
		bg.set_color(bg.get_point_count() - 1, Color(0.5, 0.1, 0.02))
		bp.color_ramp = bg
		bp.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		add_child(bp)
		_bursts.append(bp)
	var dust_mat := ShaderMaterial.new()
	dust_mat.shader = load("res://shaders/vfx_dust.gdshader")
	for j: int in range(DUSTS):
		var p := CPUParticles3D.new()
		p.emitting = false
		p.one_shot = true
		p.amount = 14
		p.lifetime = 0.7
		p.explosiveness = 0.95
		var q2 := QuadMesh.new()
		q2.size = Vector2(0.35, 0.35)
		q2.material = dust_mat
		p.mesh = q2
		p.direction = Vector3(0, 1, 0)
		p.spread = 80.0
		p.initial_velocity_min = 0.6
		p.initial_velocity_max = 1.8
		p.gravity = Vector3(0, -1.2, 0)
		p.damping_min = 1.5
		p.damping_max = 2.5
		p.scale_amount_min = 0.5
		p.scale_amount_max = 1.4
		var curve := Curve.new()
		curve.add_point(Vector2(0, 0.4))
		curve.add_point(Vector2(0.3, 1.0))
		curve.add_point(Vector2(1, 1.3))
		p.scale_amount_curve = curve
		var grad := Gradient.new()
		grad.set_color(0, Color(1, 1, 1, 0.8))
		grad.set_color(1, Color(1, 1, 1, 0.0))
		p.color_ramp = grad
		add_child(p)
		_dusts.append(p)


func _spark(pos: Vector3, size: float, color: Color, kind: int, dur: float, rays: float) -> void:
	var m := _sparks[_next]
	_life[_next] = 0.0
	_dur[_next] = dur
	_next = (_next + 1) % SPARKS
	m.visible = true
	m.global_position = pos
	m.scale = Vector3.ONE * size
	var mat := m.material_override as ShaderMaterial
	mat.set_shader_parameter("color", color)
	mat.set_shader_parameter("kind", kind)
	mat.set_shader_parameter("rays", rays)
	mat.set_shader_parameter("seed", randf())
	mat.set_shader_parameter("life", 0.0)


## kind: light / medium / heavy / counter / guard / launch / throw / break
func hit(pos: Vector3, kind: String) -> void:
	match kind:
		"light":
			_spark(pos, 0.55, Color(1.0, 0.92, 0.7), 0, 0.14, 8)
		"medium":
			_spark(pos, 0.8, Color(1.0, 0.86, 0.55), 0, 0.18, 10)
		"heavy", "launch":
			_spark(pos, 1.15, Color(1.0, 0.8, 0.45), 0, 0.23, 12)
			_spark(pos, 0.75, Color(1.0, 0.6, 0.25, 0.8), 1, 0.22, 0)
		"counter":
			_spark(pos, 1.25, Color(1.0, 0.38, 0.18), 0, 0.25, 14)
			_spark(pos, 0.9, Color(1.0, 0.3, 0.15), 1, 0.25, 0)
		"guard":
			_spark(pos, 0.8, Color(0.55, 0.8, 1.0), 2, 0.16, 0)
			_spark(pos, 0.35, Color(0.7, 0.9, 1.0), 0, 0.12, 6)
		"throw":
			_spark(pos, 1.0, Color(1.0, 0.95, 0.85), 1, 0.3, 0)
		"break":
			_spark(pos, 1.3, Color(0.95, 0.97, 1.0), 1, 0.3, 0)
			_spark(pos, 0.7, Color(0.9, 0.95, 1.0), 0, 0.2, 10)
		"evade":
			_spark(pos, 0.7, Color(0.6, 0.9, 1.0, 0.6), 1, 0.25, 0)


## 金属の火花。dir = 飛ぶ向き、power = 0〜1（数と勢い）、tint = 色味（電気の火花は青白く）
func metal_sparks(pos: Vector3, dir: Vector3, power: float, tint: Color = Color(1, 1, 1)) -> void:
	var p := _bursts[_bnext]
	_bnext = (_bnext + 1) % BURSTS
	p.global_position = pos
	p.direction = dir.normalized() if dir.length_squared() > 1e-6 else Vector3.UP
	p.amount = clampi(int(6.0 + power * 22.0), 4, 28)
	p.initial_velocity_min = 1.2 + power * 1.5
	p.initial_velocity_max = 3.5 + power * 5.0
	p.color = tint
	p.restart()
	p.emitting = true


func dust(pos: Vector3, amount: int, color: Color) -> void:
	var p := _dusts[_dnext]
	_dnext = (_dnext + 1) % DUSTS
	p.global_position = pos
	p.amount = clampi(amount, 4, 32)
	p.color = color
	p.restart()
	p.emitting = true


func _process(delta: float) -> void:
	for i: int in range(SPARKS):
		var m := _sparks[i]
		if not m.visible:
			continue
		_life[i] += delta
		var t := _life[i] / _dur[i]
		if t >= 1.0:
			m.visible = false
			continue
		(m.material_override as ShaderMaterial).set_shader_parameter("life", t)
