class_name StageView
extends Node3D
## ステージの見た目。リング形状（シミュレーションと同じデータ）から床・縁・壁を作り、テーマごとの背景と照明を置く。
## 仕様: 05_stages.md

const FP_TO_F := 1.0 / 65536.0

var stage_id := ""
var theme: Dictionary = {}
var env: WorldEnvironment
var sun: DirectionalLight3D
var edge_nodes: Array[Node3D] = []
var edge_broken: Array[Node3D] = []
var crowd_mat: ShaderMaterial = null
var rim_color := Color(1.0, 0.92, 0.85)
var rim_dir := Vector3(-0.4, 0.5, 0.7)
var wetness := 0.0
var particles: Array[CPUParticles3D] = []
var _flash := 0.0
var _flash_t := 0.0
var _lighthouse_beam: Node3D = null
var ground_color := Color(0.7, 0.68, 0.62)
## [ノード, 辺の中点, 外向き法線]: カメラと選手の間に入る壁を透明にする
var _fade_walls: Array = []

const THEMES := {
	"arena": {
		"sky": [Color(0.02, 0.025, 0.05), Color(0.06, 0.07, 0.12), Color(0.02, 0.02, 0.03)],
		"sun_rot": Vector3(-55, 30, 0), "sun": Color(1.0, 0.95, 0.88), "sun_e": 1.5,
		"amb": Color(0.42, 0.46, 0.6), "amb_e": 0.9, "fog": Color(0.05, 0.06, 0.1), "fog_d": 0.006,
		"floor": 0, "floor_c": Color(0.2, 0.38, 0.75), "line_c": Color(0.92, 0.93, 0.95), "alt_c": Color(0.1, 0.1, 0.12),
		"fence_c": Color(0.12, 0.13, 0.18), "pad_c": Color(0.75, 0.15, 0.12), "outside": "floor", "outside_c": Color(0.06, 0.06, 0.08),
		"rim": Color(0.75, 0.85, 1.0), "glow": 0.9, "dust": Color(0.75, 0.78, 0.85),
	},
	"harbor": {
		"sky": [Color(0.015, 0.02, 0.04), Color(0.09, 0.1, 0.16), Color(0.01, 0.015, 0.03)],
		"sun_rot": Vector3(-35, -40, 0), "sun": Color(1.0, 0.72, 0.45), "sun_e": 1.6,
		"amb": Color(0.35, 0.42, 0.6), "amb_e": 0.85, "fog": Color(0.06, 0.08, 0.13), "fog_d": 0.02,
		"floor": 1, "floor_c": Color(0.45, 0.45, 0.47), "line_c": Color(0.85, 0.7, 0.1), "alt_c": Color(0.2, 0.2, 0.2),
		"outside": "water", "water": [Color(0.01, 0.04, 0.07), Color(0.04, 0.13, 0.2)], "rim": Color(1.0, 0.75, 0.5), "wet": 0.7,
		"rain": true, "glow": 1.0, "dust": Color(0.5, 0.6, 0.7),
	},
	"bamboo": {
		"sky": [Color(0.55, 0.68, 0.72), Color(0.82, 0.86, 0.8), Color(0.3, 0.38, 0.3)],
		"sun_rot": Vector3(-30, 60, 0), "sun": Color(1.0, 0.95, 0.82), "sun_e": 1.3,
		"amb": Color(0.55, 0.65, 0.58), "amb_e": 0.8, "fog": Color(0.72, 0.8, 0.76), "fog_d": 0.035,
		"floor": 2, "floor_c": Color(0.52, 0.52, 0.48), "line_c": Color(0.8, 0.8, 0.8), "alt_c": Color(0.24, 0.32, 0.2),
		"fence_c": Color(0.55, 0.6, 0.32), "outside": "grass", "outside_c": Color(0.2, 0.3, 0.16), "rim": Color(0.9, 1.0, 0.85),
		"leaves": Color(0.5, 0.7, 0.3), "glow": 0.5, "dust": Color(0.6, 0.62, 0.55),
	},
	"fort": {
		"sky": [Color(0.55, 0.62, 0.72), Color(0.86, 0.88, 0.92), Color(0.7, 0.72, 0.76)],
		"sun_rot": Vector3(-38, 140, 0), "sun": Color(0.95, 0.97, 1.0), "sun_e": 1.2,
		"amb": Color(0.65, 0.7, 0.8), "amb_e": 0.85, "fog": Color(0.82, 0.85, 0.9), "fog_d": 0.03,
		"floor": 3, "floor_c": Color(0.55, 0.55, 0.55), "line_c": Color(0.9, 0.9, 0.9), "alt_c": Color(0.35, 0.36, 0.4),
		"wall_c": Color(0.48, 0.46, 0.44), "outside": "snow", "outside_c": Color(0.88, 0.9, 0.95), "rim": Color(0.85, 0.92, 1.0),
		"snow": true, "glow": 0.5, "dust": Color(0.95, 0.96, 1.0),
	},
	"ruins": {
		"sky": [Color(0.32, 0.36, 0.55), Color(0.98, 0.62, 0.36), Color(0.6, 0.45, 0.32)],
		"sun_rot": Vector3(-12, -70, 0), "sun": Color(1.0, 0.65, 0.38), "sun_e": 2.0,
		"amb": Color(0.6, 0.48, 0.45), "amb_e": 0.7, "fog": Color(0.85, 0.6, 0.42), "fog_d": 0.015,
		"floor": 4, "floor_c": Color(0.75, 0.6, 0.42), "line_c": Color(0.9, 0.8, 0.6), "alt_c": Color(0.45, 0.35, 0.25),
		"outside": "sand", "outside_c": Color(0.78, 0.62, 0.42), "rim": Color(1.0, 0.7, 0.45), "sand": true, "glow": 0.8,
		"dust": Color(0.85, 0.7, 0.5),
	},
	"skyline": {
		"sky": [Color(0.01, 0.01, 0.04), Color(0.1, 0.06, 0.18), Color(0.02, 0.02, 0.05)],
		"sun_rot": Vector3(-50, 20, 0), "sun": Color(0.75, 0.82, 1.0), "sun_e": 1.2,
		"amb": Color(0.3, 0.3, 0.5), "amb_e": 0.7, "fog": Color(0.08, 0.05, 0.14), "fog_d": 0.006,
		"floor": 5, "floor_c": Color(0.22, 0.24, 0.27), "line_c": Color(0.95, 0.85, 0.2), "alt_c": Color(0.15, 0.15, 0.18),
		"fence_c": Color(0.5, 0.52, 0.55), "outside": "void", "rim": Color(0.6, 0.7, 1.0), "glow": 1.1, "dust": Color(0.6, 0.62, 0.7),
	},
	"temple": {
		"sky": [Color(0.38, 0.32, 0.5), Color(0.98, 0.58, 0.38), Color(0.4, 0.3, 0.25)],
		"sun_rot": Vector3(-18, 110, 0), "sun": Color(1.0, 0.68, 0.42), "sun_e": 1.6,
		"amb": Color(0.6, 0.5, 0.5), "amb_e": 0.75, "fog": Color(0.75, 0.55, 0.45), "fog_d": 0.02,
		"floor": 6, "floor_c": Color(0.82, 0.8, 0.76), "line_c": Color(0.8, 0.8, 0.8), "alt_c": Color(0.5, 0.48, 0.45),
		"wall_c": Color(0.86, 0.82, 0.72), "roof_c": Color(0.18, 0.18, 0.2), "outside": "floor", "outside_c": Color(0.4, 0.35, 0.3),
		"rim": Color(1.0, 0.75, 0.55), "leaves": Color(0.9, 0.3, 0.12), "glow": 0.7, "dust": Color(0.8, 0.78, 0.72),
	},
	"raft": {
		"sky": [Color(0.3, 0.55, 0.85), Color(0.75, 0.85, 0.95), Color(0.4, 0.5, 0.45)],
		"sun_rot": Vector3(-55, 45, 0), "sun": Color(1.0, 0.97, 0.9), "sun_e": 1.7,
		"amb": Color(0.55, 0.65, 0.8), "amb_e": 0.85, "fog": Color(0.7, 0.8, 0.9), "fog_d": 0.01,
		"floor": 7, "floor_c": Color(0.55, 0.4, 0.25), "line_c": Color(0.8, 0.8, 0.8), "alt_c": Color(0.18, 0.12, 0.08),
		"outside": "water", "water": [Color(0.04, 0.15, 0.14), Color(0.12, 0.35, 0.32)], "rim": Color(1.0, 0.96, 0.85), "glow": 0.5,
		"dust": Color(0.6, 0.75, 0.85), "trees": true,
	},
	"lighthouse": {
		"sky": [Color(0.01, 0.015, 0.03), Color(0.06, 0.08, 0.12), Color(0.01, 0.01, 0.02)],
		"sun_rot": Vector3(-60, -20, 0), "sun": Color(0.65, 0.75, 1.0), "sun_e": 1.0,
		"amb": Color(0.22, 0.28, 0.42), "amb_e": 0.65, "fog": Color(0.05, 0.07, 0.1), "fog_d": 0.025,
		"floor": 8, "floor_c": Color(0.38, 0.4, 0.42), "line_c": Color(0.8, 0.8, 0.8), "alt_c": Color(0.2, 0.22, 0.25),
		"outside": "water", "water": [Color(0.01, 0.03, 0.05), Color(0.05, 0.12, 0.16)], "rim": Color(0.75, 0.85, 1.0), "wet": 0.8,
		"rain": true, "storm": true, "glow": 1.0, "dust": Color(0.6, 0.7, 0.8),
	},
}


func build(sid: String, sdef: StageDef, quality: int) -> void:
	stage_id = sid
	theme = THEMES.get(sid, THEMES["arena"])
	var col_rim: Color = theme.get("rim", Color.WHITE)
	rim_color = col_rim
	wetness = float(theme.get("wet", 0.0))
	_environment(quality)
	_ring(sdef)
	_outside(sdef)
	_props(sid, sdef, quality)
	_weather(quality)


func _environment(quality: int) -> void:
	env = WorldEnvironment.new()
	var e := Environment.new()
	var sky := Sky.new()
	var sm := ProceduralSkyMaterial.new()
	var sc: Array = theme["sky"]
	sm.sky_top_color = sc[0]
	sm.sky_horizon_color = sc[1]
	sm.ground_bottom_color = sc[2]
	sm.ground_horizon_color = sc[1]
	sm.sun_angle_max = 20.0
	sky.sky_material = sm
	e.background_mode = Environment.BG_SKY
	e.sky = sky
	e.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	e.ambient_light_color = theme["amb"]
	e.ambient_light_energy = float(theme["amb_e"])
	e.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	e.tonemap_exposure = 1.0
	e.fog_enabled = true
	e.fog_light_color = theme["fog"]
	e.fog_density = float(theme["fog_d"]) * 0.45
	e.fog_sky_affect = 0.4
	if quality >= 1:
		e.glow_enabled = true
		e.glow_intensity = float(theme.get("glow", 0.7))
		e.glow_bloom = 0.05
		e.glow_hdr_threshold = 1.1
	e.adjustment_enabled = true
	e.adjustment_contrast = 1.06
	e.adjustment_saturation = 1.08
	env.environment = e
	add_child(env)
	sun = DirectionalLight3D.new()
	sun.rotation_degrees = theme["sun_rot"]
	sun.light_color = theme["sun"]
	sun.light_energy = float(theme["sun_e"])
	sun.shadow_enabled = quality >= 1
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_2_SPLITS if quality >= 2 else DirectionalLight3D.SHADOW_ORTHOGONAL
	sun.directional_shadow_max_distance = 18.0
	sun.shadow_bias = 0.04
	add_child(sun)
	rim_dir = -sun.global_transform.basis.z


func _mat(c: Color, rough: float = 0.8, metal: float = 0.0) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = c
	m.roughness = rough
	m.metallic = metal
	return m


func _box(size: Vector3, pos: Vector3, mat: Material, parent: Node3D = null, rot_y: float = 0.0) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = size
	mi.mesh = bm
	mi.material_override = mat
	mi.position = pos
	mi.rotation.y = rot_y
	(parent if parent != null else self).add_child(mi)
	return mi


func _cyl(r_top: float, r_bot: float, h: float, pos: Vector3, mat: Material, parent: Node3D = null, seg: int = 12) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	var cm := CylinderMesh.new()
	cm.top_radius = r_top
	cm.bottom_radius = r_bot
	cm.height = h
	cm.radial_segments = seg
	mi.mesh = cm
	mi.material_override = mat
	mi.position = pos
	(parent if parent != null else self).add_child(mi)
	return mi


func _verts(sdef: StageDef) -> Array[Vector3]:
	var out: Array[Vector3] = []
	for k: int in range(sdef.vx.size()):
		out.append(Vector3(sdef.vx[k] * FP_TO_F, 0.0, sdef.vz[k] * FP_TO_F))
	return out


func _ring(sdef: StageDef) -> void:
	var vs := _verts(sdef)
	# 床（扇形三角形）＋ 厚み
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var c := Vector3.ZERO
	for v: Vector3 in vs:
		c += v
	c /= vs.size()
	var n := vs.size()
	var ccw := _area(vs) > 0.0
	for k: int in range(n):
		var a := vs[k]
		var b := vs[(k + 1) % n]
		st.set_normal(Vector3.UP)
		if ccw:
			st.add_vertex(c)
			st.add_vertex(b)
			st.add_vertex(a)
		else:
			st.add_vertex(c)
			st.add_vertex(a)
			st.add_vertex(b)
	# 側面
	for k2: int in range(n):
		var a2 := vs[k2]
		var b2 := vs[(k2 + 1) % n]
		var down := Vector3(0, -0.6, 0)
		var nn := (b2 - a2).cross(Vector3.UP).normalized() * (1.0 if ccw else -1.0)
		st.set_normal(nn)
		st.add_vertex(a2)
		st.add_vertex(a2 + down)
		st.add_vertex(b2)
		st.add_vertex(b2)
		st.add_vertex(a2 + down)
		st.add_vertex(b2 + down)
	var mesh := st.commit()
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	var fm := ShaderMaterial.new()
	fm.shader = load("res://shaders/stage_floor.gdshader")
	fm.set_shader_parameter("pattern", int(theme["floor"]))
	fm.set_shader_parameter("base_color", theme["floor_c"])
	fm.set_shader_parameter("line_color", theme["line_c"])
	fm.set_shader_parameter("alt_color", theme["alt_c"])
	fm.set_shader_parameter("wet", wetness)
	var maxr := 0.0
	for v2: Vector3 in vs:
		maxr = maxf(maxr, maxf(absf(v2.x), absf(v2.z)))
	fm.set_shader_parameter("ring_half", maxr)
	mi.material_override = fm
	add_child(mi)
	ground_color = (theme["floor_c"] as Color).lightened(0.3)
	# 縁
	for k3: int in range(n):
		var a3 := vs[k3]
		var b3 := vs[(k3 + 1) % n]
		var node := Node3D.new()
		add_child(node)
		edge_nodes.append(node)
		var t := sdef.edge_type[k3]
		var h := sdef.edge_height[k3] * FP_TO_F
		match t:
			SE.EDGE_FENCE:
				_fence(node, a3, b3, h)
			SE.EDGE_WALL:
				_wall(node, a3, b3, 2.4)
			SE.EDGE_BREAKABLE:
				if stage_id == "skyline":
					_fence(node, a3, b3, 1.2)
				else:
					_wall(node, a3, b3, 1.8)
			_:
				_trim(node, a3, b3)
		var broken := Node3D.new()
		broken.visible = false
		add_child(broken)
		edge_broken.append(broken)
		if t == SE.EDGE_BREAKABLE:
			_trim(broken, a3, b3)


func _area(vs: Array[Vector3]) -> float:
	var a := 0.0
	for k: int in range(vs.size()):
		var p := vs[k]
		var q := vs[(k + 1) % vs.size()]
		a += p.x * q.z - q.x * p.z
	return a


func _seg_basis(a: Vector3, b: Vector3) -> Array:
	var mid := (a + b) * 0.5
	var d := b - a
	var ln := d.length()
	var yaw := atan2(d.x, d.z)
	return [mid, ln, yaw]


func _trim(node: Node3D, a: Vector3, b: Vector3) -> void:
	var sb := _seg_basis(a, b)
	_box(Vector3(0.08, 0.04, float(sb[1])), Vector3(sb[0]) + Vector3(0, 0.02, 0), _mat(theme.get("line_c", Color.WHITE), 0.5), node, float(sb[2]))


func _fence(node: Node3D, a: Vector3, b: Vector3, h: float) -> void:
	var sb := _seg_basis(a, b)
	var mid: Vector3 = sb[0]
	var ln: float = sb[1]
	var yaw: float = sb[2]
	var fc: Color = theme.get("fence_c", Color(0.3, 0.3, 0.3))
	if stage_id == "bamboo":
		var bm := _mat(fc, 0.6)
		var count := int(ln / 0.11)
		var mm := MultiMesh.new()
		mm.transform_format = MultiMesh.TRANSFORM_3D
		var cm := CylinderMesh.new()
		cm.top_radius = 0.045
		cm.bottom_radius = 0.05
		cm.height = 1.0
		cm.radial_segments = 8
		mm.mesh = cm
		mm.instance_count = count
		var d := (b - a) / float(count)
		for k: int in range(count):
			var hh := h * (0.85 + 0.3 * fmod(k * 0.618, 1.0))
			mm.set_instance_transform(k, Transform3D(Basis().scaled(Vector3(1, hh, 1)), a + d * (k + 0.5) + Vector3(0, hh * 0.5, 0)))
		var mmi := MultiMeshInstance3D.new()
		mmi.multimesh = mm
		mmi.material_override = bm
		node.add_child(mmi)
		_box(Vector3(0.05, 0.05, ln), mid + Vector3(0, h * 0.7, 0), _mat(fc.darkened(0.3)), node, yaw)
		return
	if stage_id == "skyline":
		var post := _mat(Color(0.55, 0.57, 0.6), 0.4, 0.6)
		var mesh_mat := StandardMaterial3D.new()
		mesh_mat.albedo_color = Color(0.6, 0.65, 0.7, 0.45)
		mesh_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		mesh_mat.metallic = 0.7
		_box(Vector3(0.02, h, ln), mid + Vector3(0, h * 0.5, 0), mesh_mat, node, yaw)
		_box(Vector3(0.06, 0.06, ln), mid + Vector3(0, h, 0), post, node, yaw)
		return
	# 闘技場のパッド付きフェンス
	var pc: Color = theme.get("pad_c", Color(0.6, 0.15, 0.12))
	_box(Vector3(0.14, h, ln), mid + Vector3(0, h * 0.5, 0), _mat(fc, 0.6), node, yaw)
	_box(Vector3(0.18, 0.12, ln), mid + Vector3(0, h, 0), _mat(pc, 0.5), node, yaw)


func _wall(node: Node3D, a: Vector3, b: Vector3, h: float) -> void:
	var sb := _seg_basis(a, b)
	var mid: Vector3 = sb[0]
	var ln: float = sb[1]
	var yaw: float = sb[2]
	var wc: Color = theme.get("wall_c", Color(0.5, 0.5, 0.5))
	var out_n := Vector3(mid.x, 0, mid.z).normalized() * 0.18
	var wm := _mat(wc, 0.9)
	wm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA_DEPTH_PRE_PASS
	var w := _box(Vector3(0.36, h, ln + 0.36), mid + out_n + Vector3(0, h * 0.5, 0), wm, node, yaw)
	w.set_meta("wall", true)
	_fade_walls.append([node, mid, out_n.normalized()])
	if stage_id == "temple":
		# 築地塀: 本体を低くし、筋（横線）と瓦の屋根を載せる
		w.scale = Vector3(1, 1.55 / h, 1)
		w.position.y = 1.55 * 0.5
		var hh := 1.55
		for li: int in range(3):
			_box(Vector3(0.38, 0.035, ln + 0.37), mid + out_n + Vector3(0, hh - 0.32 - li * 0.14, 0), _mat(Color(0.92, 0.9, 0.84), 0.9), node, yaw)
		_box(Vector3(0.42, 0.30, ln + 0.42), mid + out_n + Vector3(0, 0.15, 0), _mat(Color(0.42, 0.41, 0.4), 0.95), node, yaw)
		var rc: Color = theme.get("roof_c", Color(0.2, 0.2, 0.2))
		_gable(node, mid + out_n + Vector3(0, hh, 0), ln + 0.8, 0.95, 0.32, rc, yaw)
	elif stage_id == "fort":
		var n := int(ln / 0.9)
		for k: int in range(n):
			if k % 2 == 0:
				var t := (k + 0.5) / float(n)
				var p := a.lerp(b, t) + out_n + Vector3(0, h + 0.22, 0)
				_box(Vector3(0.4, 0.44, 0.55), p, _mat(wc.darkened(0.1)), node, yaw)


## 切妻屋根（棟が辺に沿う）: base は軒の中心、len は棟の長さ、wid は屋根の幅、h は高さ
func _gable(parent: Node3D, base: Vector3, len: float, wid: float, h: float, col: Color, yaw: float) -> void:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var hl := len * 0.5
	var hw := wid * 0.5
	# ローカル座標: 棟は z 方向、x が屋根の幅
	var p0 := Vector3(-hw, 0, -hl)
	var p1 := Vector3(-hw, 0, hl)
	var p2 := Vector3(0, h, hl)
	var p3 := Vector3(0, h, -hl)
	var p4 := Vector3(hw, 0, -hl)
	var p5 := Vector3(hw, 0, hl)
	for tri: Array in [[p0, p1, p2], [p0, p2, p3], [p4, p3, p2], [p4, p2, p5], [p0, p3, p4], [p1, p5, p2]]:
		var a: Vector3 = tri[0]
		var b: Vector3 = tri[1]
		var c: Vector3 = tri[2]
		var nn := (b - a).cross(c - a).normalized()
		st.set_normal(nn)
		st.add_vertex(a)
		st.add_vertex(b)
		st.add_vertex(c)
	var mi := MeshInstance3D.new()
	mi.mesh = st.commit()
	mi.material_override = _mat(col, 0.55)
	mi.position = base
	mi.rotation.y = yaw
	(parent if parent != null else self).add_child(mi)


## 寄棟屋根: base は軒の中心、w×d の平面、h の高さ（棟は x 方向）
func _hip(base: Vector3, w: float, d: float, h: float, col: Color, parent: Node3D = null, yaw: float = 0.0) -> MeshInstance3D:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var hw := w * 0.5
	var hd := d * 0.5
	var r := maxf(0.0, hw - hd)
	var a := Vector3(-hw, 0, -hd)
	var b := Vector3(hw, 0, -hd)
	var c := Vector3(hw, 0, hd)
	var dd := Vector3(-hw, 0, hd)
	var r0 := Vector3(-r, h, 0)
	var r1 := Vector3(r, h, 0)
	for tri: Array in [[a, r0, r1], [a, r1, b], [b, r1, c], [c, r1, r0], [c, r0, dd], [dd, r0, a], [a, b, c], [a, c, dd]]:
		var p: Vector3 = tri[0]
		var q: Vector3 = tri[1]
		var t: Vector3 = tri[2]
		st.set_normal((q - p).cross(t - p).normalized())
		st.add_vertex(p)
		st.add_vertex(q)
		st.add_vertex(t)
	var mi := MeshInstance3D.new()
	mi.mesh = st.commit()
	mi.material_override = _mat(col, 0.5)
	mi.position = base
	mi.rotation.y = yaw
	(parent if parent != null else self).add_child(mi)
	return mi


func _outside(sdef: StageDef) -> void:
	var kind := String(theme.get("outside", "floor"))
	var mi := MeshInstance3D.new()
	var pm := PlaneMesh.new()
	pm.size = Vector2(160, 160)
	pm.subdivide_width = 64 if kind == "water" else 0
	pm.subdivide_depth = 64 if kind == "water" else 0
	mi.mesh = pm
	var y := -0.6
	match kind:
		"water":
			var wm := ShaderMaterial.new()
			wm.shader = load("res://shaders/stage_water.gdshader")
			var wc: Array = theme.get("water", [Color(0.02, 0.06, 0.1), Color(0.05, 0.15, 0.2)])
			wm.set_shader_parameter("deep", wc[0])
			wm.set_shader_parameter("shallow", wc[1])
			wm.set_shader_parameter("choppy", 2.0 if theme.has("storm") else 1.0)
			mi.material_override = wm
			y = -1.6
		"void":
			mi.material_override = _mat(Color(0.03, 0.03, 0.05))
			y = -40.0
		_:
			mi.material_override = _mat(theme.get("outside_c", Color(0.3, 0.3, 0.3)), 0.95)
			y = -1.5 if kind in ["sand", "grass", "snow"] else -0.02
	mi.position = Vector3(0, y, 0)
	add_child(mi)


func _rng(seed_v: int) -> RandomNumberGenerator:
	var r := RandomNumberGenerator.new()
	r.seed = seed_v
	return r


func _multimesh(mesh: Mesh, xforms: Array[Transform3D], mat: Material, colors: Array[Color] = []) -> MultiMeshInstance3D:
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_colors = colors.size() > 0
	mm.mesh = mesh
	mm.instance_count = xforms.size()
	for k: int in range(xforms.size()):
		mm.set_instance_transform(k, xforms[k])
		if colors.size() > 0:
			mm.set_instance_color(k, colors[k % colors.size()])
	var mmi := MultiMeshInstance3D.new()
	mmi.multimesh = mm
	mmi.material_override = mat
	mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mmi)
	return mmi


func _props(sid: String, sdef: StageDef, quality: int) -> void:
	var r := _rng(sid.hash())
	var dens: float = [0.35, 0.6, 1.0, 1.0][clampi(quality, 0, 3)]
	match sid:
		"arena":
			# 観客席（段々）と観客
			for side: int in range(4):
				var yaw := side * PI * 0.5
				var bas := Basis(Vector3.UP, yaw)
				for tier: int in range(5):
					_box(Vector3(34, 0.6, 1.4), bas * Vector3(0, 0.3 + tier * 0.6, 11.5 + tier * 1.4), _mat(Color(0.08, 0.09, 0.12)), null, yaw)
			var xf: Array[Transform3D] = []
			var cols: Array[Color] = []
			var n := int(900 * dens)
			for k: int in range(n):
				var side2 := k % 4
				var tier2 := r.randi_range(0, 4)
				var x := r.randf_range(-15.5, 15.5)
				var bas2 := Basis(Vector3.UP, side2 * PI * 0.5)
				var p := bas2 * Vector3(x, 0.6 + tier2 * 0.6 + 0.3, 11.5 + tier2 * 1.4 + r.randf_range(-0.3, 0.3))
				xf.append(Transform3D(Basis().scaled(Vector3(1, r.randf_range(0.9, 1.15), 1)), p))
				cols.append(Color.from_hsv(r.randf(), r.randf_range(0.1, 0.45), r.randf_range(0.12, 0.35)))
			var cap := CapsuleMesh.new()
			cap.radius = 0.17
			cap.height = 0.62
			cap.radial_segments = 6
			cap.rings = 2
			crowd_mat = ShaderMaterial.new()
			crowd_mat.shader = load("res://shaders/crowd.gdshader")
			crowd_mat.set_shader_parameter("excite", 0.0)
			_multimesh(cap, xf, crowd_mat, cols)
			# 照明トラス
			for k3: int in range(4):
				var lp := Vector3(cos(k3 * PI * 0.5 + 0.78) * 9.0, 9.0, sin(k3 * PI * 0.5 + 0.78) * 9.0)
				var spot := SpotLight3D.new()
				spot.position = lp
				spot.look_at_from_position(lp, Vector3.ZERO, Vector3.UP)
				spot.spot_range = 22.0
				spot.spot_angle = 28.0
				spot.light_energy = 2.0 if quality >= 2 else 1.2
				spot.light_color = Color(1.0, 0.95, 0.85)
				add_child(spot)
				_box(Vector3(0.5, 0.3, 0.5), lp, _mat(Color(0.9, 0.9, 0.85), 0.3), null)
			_box(Vector3(8, 4.5, 0.3), Vector3(0, 9.5, -17), _mat(Color(0.05, 0.05, 0.08)))
			var screen := _box(Vector3(7.4, 4.0, 0.05), Vector3(0, 9.5, -16.8), _mat(Color(0.1, 0.2, 0.4)))
			(screen.material_override as StandardMaterial3D).emission_enabled = true
			(screen.material_override as StandardMaterial3D).emission = Color(0.15, 0.3, 0.7)
		"harbor":
			var cont_cols: Array[Color] = [Color(0.6, 0.15, 0.1), Color(0.1, 0.3, 0.55), Color(0.15, 0.45, 0.25), Color(0.7, 0.55, 0.1), Color(0.4, 0.4, 0.42)]
			for k: int in range(int(18 * dens) + 4):
				var ang := r.randf_range(-1.2, 1.2) + (PI if k % 2 == 0 else 0.0)
				var d := r.randf_range(14, 26)
				var p := Vector3(sin(ang) * d, 0, cos(ang) * d)
				var stack := r.randi_range(1, 3)
				for s: int in range(stack):
					_box(Vector3(2.4, 2.5, 6.0), p + Vector3(0, -1.6 + 1.25 + s * 2.5, 0), _mat(cont_cols[r.randi() % cont_cols.size()], 0.7, 0.3), null, ang)
			for k2: int in range(2):
				var cp := Vector3(-18 + k2 * 36, 0, -20)
				_box(Vector3(0.8, 18, 0.8), cp + Vector3(0, 7.4, 0), _mat(Color(0.8, 0.6, 0.1), 0.5, 0.4))
				_box(Vector3(0.6, 0.6, 14), cp + Vector3(0, 16, 4), _mat(Color(0.8, 0.6, 0.1), 0.5, 0.4))
				var lamp := OmniLight3D.new()
				lamp.position = cp + Vector3(0, 15, 8)
				lamp.light_color = Color(1.0, 0.7, 0.4)
				lamp.light_energy = 3.0
				lamp.omni_range = 30.0
				add_child(lamp)
			_box(Vector3(80, 1.0, 10), Vector3(0, -1.1, -24), _mat(Color(0.25, 0.25, 0.27)))
		"bamboo":
			var xf2: Array[Transform3D] = []
			for k: int in range(int(420 * dens)):
				var ang2 := r.randf() * TAU
				var d2 := r.randf_range(8.5, 32)
				var h2 := r.randf_range(7, 13)
				var tilt := Basis(Vector3(r.randf_range(-1, 1), 0, r.randf_range(-1, 1)).normalized(), r.randf_range(0.0, 0.08))
				xf2.append(Transform3D(tilt * Basis().scaled(Vector3(1, h2, 1)), Vector3(sin(ang2) * d2, -1.5 + h2 * 0.5, cos(ang2) * d2)))
			var cm := CylinderMesh.new()
			cm.top_radius = 0.06
			cm.bottom_radius = 0.075
			cm.height = 1.0
			cm.radial_segments = 6
			_multimesh(cm, xf2, _mat(Color(0.42, 0.58, 0.28), 0.6))
			# 葉の塊
			var xf3: Array[Transform3D] = []
			for k2: int in range(int(160 * dens)):
				var ang3 := r.randf() * TAU
				var d3 := r.randf_range(9, 30)
				xf3.append(Transform3D(Basis().scaled(Vector3.ONE * r.randf_range(1.2, 2.6)), Vector3(sin(ang3) * d3, r.randf_range(6, 11), cos(ang3) * d3)))
			var sm := SphereMesh.new()
			sm.radius = 1.0
			sm.height = 1.4
			sm.radial_segments = 8
			sm.rings = 4
			_multimesh(sm, xf3, _mat(Color(0.3, 0.45, 0.2), 0.9))
		"fort":
			for k: int in range(int(10 * dens) + 3):
				var ang4 := r.randf() * TAU
				var d4 := r.randf_range(14, 30)
				var p4 := Vector3(sin(ang4) * d4, -1.5, cos(ang4) * d4)
				_box(Vector3(r.randf_range(2, 6), r.randf_range(2, 6), r.randf_range(1, 2)), p4 + Vector3(0, 1.5, 0), _mat(Color(0.5, 0.48, 0.46), 0.95), null, ang4)
			var xf4: Array[Transform3D] = []
			for k2: int in range(int(60 * dens)):
				var ang5 := r.randf() * TAU
				var d5 := r.randf_range(18, 40)
				xf4.append(Transform3D(Basis().scaled(Vector3(1, r.randf_range(1.5, 3.0), 1)), Vector3(sin(ang5) * d5, 1.5, cos(ang5) * d5)))
			var cone := CylinderMesh.new()
			cone.top_radius = 0.0
			cone.bottom_radius = 1.2
			cone.height = 3.5
			cone.radial_segments = 7
			_multimesh(cone, xf4, _mat(Color(0.18, 0.3, 0.25), 0.9))
		"ruins":
			for k: int in range(int(14 * dens) + 4):
				var ang6 := (k / float(int(14 * dens) + 4)) * TAU + r.randf_range(-0.1, 0.1)
				var d6 := r.randf_range(11, 18)
				var h6 := r.randf_range(4, 11) if r.randf() > 0.3 else r.randf_range(1, 3)
				var p6 := Vector3(sin(ang6) * d6, -1.5, cos(ang6) * d6)
				_cyl(0.65, 0.75, h6, p6 + Vector3(0, h6 * 0.5, 0), _mat(Color(0.78, 0.62, 0.45), 0.9), null, 10)
				if h6 > 5 and r.randf() > 0.5:
					_box(Vector3(2.2, 0.6, 1.6), p6 + Vector3(0, h6 + 0.3, 0), _mat(Color(0.75, 0.6, 0.44), 0.9))
			for k2: int in range(5):
				var ang7 := r.randf() * TAU
				_box(Vector3(30, r.randf_range(3, 8), 20), Vector3(sin(ang7) * 70, -1.5, cos(ang7) * 70), _mat(Color(0.7, 0.5, 0.35)), null, ang7)
		"skyline":
			var bxf: Array[Transform3D] = []
			for k: int in range(int(120 * dens) + 20):
				var ang8 := r.randf() * TAU
				var d8 := r.randf_range(25, 110)
				var h8 := r.randf_range(10, 80)
				var w8 := r.randf_range(5, 14)
				bxf.append(Transform3D(Basis(Vector3.UP, r.randf() * PI).scaled(Vector3(w8, h8, w8)), Vector3(sin(ang8) * d8, -60 + h8 * 0.5, cos(ang8) * d8)))
			var bmesh := BoxMesh.new()
			var wm2 := ShaderMaterial.new()
			wm2.shader = load("res://shaders/emissive_windows.gdshader")
			_multimesh(bmesh, bxf, wm2)
			_cyl(6.6, 6.8, 0.8, Vector3(0, -1.0, 0), _mat(Color(0.25, 0.26, 0.3), 0.7))
			for k2: int in range(8):
				var la := k2 * TAU / 8.0
				var lamp2 := _cyl(0.06, 0.06, 0.15, Vector3(sin(la) * 6.3, 0.08, cos(la) * 6.3), _mat(Color(0.2, 1.0, 0.3)))
				(lamp2.material_override as StandardMaterial3D).emission_enabled = true
				(lamp2.material_override as StandardMaterial3D).emission = Color(0.2, 1.0, 0.3) * 2.0
		"temple":
			_temple(r, dens)
		"raft":
			var txf2: Array[Transform3D] = []
			for k: int in range(int(140 * dens) + 10):
				var side3 := -1.0 if k % 2 == 0 else 1.0
				var x3 := side3 * r.randf_range(16, 40)
				var z3 := r.randf_range(-70, 70)
				txf2.append(Transform3D(Basis().scaled(Vector3(1, r.randf_range(0.8, 1.4), 1) * r.randf_range(2.5, 4.5)), Vector3(x3, 1.0 + r.randf_range(0, 2), z3)))
			var cone2 := CylinderMesh.new()
			cone2.top_radius = 0.0
			cone2.bottom_radius = 1.0
			cone2.height = 2.5
			cone2.radial_segments = 7
			_multimesh(cone2, txf2, _mat(Color(0.15, 0.35, 0.18), 0.9))
			for sgn: float in [-1.0, 1.0]:
				_box(Vector3(18, 3, 160), Vector3(sgn * 26, -1.8, 0), _mat(Color(0.3, 0.42, 0.22)))
		"lighthouse":
			_cyl(2.4, 3.2, 26, Vector3(0, 11, -14), _mat(Color(0.88, 0.88, 0.85), 0.7))
			for k: int in range(4):
				_cyl(2.45 - k * 0.2, 2.55 - k * 0.2, 1.2, Vector3(0, 2 + k * 6, -14), _mat(Color(0.7, 0.12, 0.1), 0.6))
			_cyl(1.6, 1.8, 2.5, Vector3(0, 25.5, -14), _mat(Color(0.2, 0.22, 0.25), 0.4, 0.6))
			_lighthouse_beam = Node3D.new()
			_lighthouse_beam.position = Vector3(0, 25.5, -14)
			add_child(_lighthouse_beam)
			var beam := SpotLight3D.new()
			beam.spot_range = 60
			beam.spot_angle = 12
			beam.light_energy = 6
			beam.light_color = Color(1.0, 0.95, 0.8)
			beam.rotation_degrees = Vector3(-12, 0, 0)
			_lighthouse_beam.add_child(beam)
			var rxf: Array[Transform3D] = []
			for k2: int in range(int(40 * dens) + 8):
				var ang10 := r.randf() * TAU
				var d10 := r.randf_range(6.5, 16)
				rxf.append(Transform3D(Basis(Vector3(r.randf(), r.randf(), r.randf()).normalized(), r.randf() * 3.0).scaled(Vector3(r.randf_range(1, 3), r.randf_range(0.6, 2), r.randf_range(1, 3))), Vector3(sin(ang10) * d10, -1.5, cos(ang10) * d10)))
			var rock := SphereMesh.new()
			rock.radial_segments = 6
			rock.rings = 3
			_multimesh(rock, rxf, _mat(Color(0.12, 0.13, 0.15), 0.95))


## 古寺: 本堂・五重塔・山門・紅葉・石灯籠（塀の外）
func _temple(r: RandomNumberGenerator, dens: float) -> void:
	var wood := Color(0.42, 0.18, 0.1)
	var plaster := Color(0.9, 0.86, 0.76)
	var roof := Color(0.16, 0.17, 0.2)
	var stone := Color(0.5, 0.49, 0.47)
	# 本堂（北側）
	var hz := -17.0
	_box(Vector3(18, 1.0, 10), Vector3(0, -0.1, hz), _mat(stone, 0.95))
	for ix: int in range(7):
		for iz: int in [0, 1]:
			_cyl(0.22, 0.24, 4.0, Vector3(-7.5 + ix * 2.5, 2.4, hz + 3.6 - iz * 7.2), _mat(wood, 0.7))
	_box(Vector3(16, 3.6, 0.2), Vector3(0, 2.2, hz - 3.5), _mat(plaster, 0.9))
	for ix2: int in range(6):
		_box(Vector3(2.0, 3.0, 0.12), Vector3(-6.25 + ix2 * 2.5, 2.0, hz + 3.3), _mat(Color(0.55, 0.32, 0.18), 0.8))
	_box(Vector3(17, 0.4, 9.2), Vector3(0, 4.55, hz), _mat(wood.darkened(0.2), 0.8))
	_hip(Vector3(0, 4.7, hz), 22.0, 13.0, 4.2, roof)
	_box(Vector3(9.5, 0.5, 0.5), Vector3(0, 8.95, hz), _mat(roof.darkened(0.3), 0.5))
	# 五重塔（北西の奥）
	var pz := Vector3(-16, 0, -27)
	_box(Vector3(6, 1.0, 6), pz + Vector3(0, -0.1, 0), _mat(stone, 0.95))
	for t: int in range(5):
		var sc := 1.0 - t * 0.12
		var y := 0.4 + t * 3.0
		_box(Vector3(3.6 * sc, 2.2, 3.6 * sc), pz + Vector3(0, y + 1.1, 0), _mat(wood if t % 2 == 0 else wood.lightened(0.08), 0.8))
		_hip(pz + Vector3(0, y + 2.2, 0), 6.4 * sc, 6.4 * sc, 1.0, roof)
	_cyl(0.12, 0.18, 5.0, pz + Vector3(0, 17.2, 0), _mat(Color(0.75, 0.6, 0.3), 0.4, 0.6))
	for k: int in range(6):
		_cyl(0.32, 0.32, 0.08, pz + Vector3(0, 15.6 + k * 0.6, 0), _mat(Color(0.75, 0.6, 0.3), 0.4, 0.6))
	# 山門（南側）
	var gz := 14.0
	for gx: float in [-2.6, 2.6]:
		_cyl(0.32, 0.34, 5.0, Vector3(gx, 2.0, gz), _mat(Color(0.72, 0.18, 0.1), 0.6))
	_box(Vector3(7.0, 0.5, 1.2), Vector3(0, 4.6, gz), _mat(Color(0.72, 0.18, 0.1), 0.6))
	_hip(Vector3(0, 4.85, gz), 9.0, 4.0, 1.8, roof)
	# 石灯籠（塀の外の四隅）
	for lp: Vector3 in [Vector3(-6.3, 0, -6.3), Vector3(6.3, 0, -6.3), Vector3(-6.3, 0, 6.3), Vector3(6.3, 0, 6.3), Vector3(-3.5, 0, -11.5), Vector3(3.5, 0, -11.5)]:
		_box(Vector3(0.7, 0.25, 0.7), lp + Vector3(0, 0.12, 0), _mat(stone))
		_cyl(0.12, 0.14, 0.9, lp + Vector3(0, 0.7, 0), _mat(stone))
		_box(Vector3(0.6, 0.12, 0.6), lp + Vector3(0, 1.2, 0), _mat(stone))
		var fire := _box(Vector3(0.42, 0.38, 0.42), lp + Vector3(0, 1.45, 0), _mat(Color(1.0, 0.75, 0.45)))
		(fire.material_override as StandardMaterial3D).emission_enabled = true
		(fire.material_override as StandardMaterial3D).emission = Color(1.0, 0.55, 0.2) * 1.4
		_hip(lp + Vector3(0, 1.64, 0), 0.9, 0.9, 0.35, stone.darkened(0.15))
		var lt := OmniLight3D.new()
		lt.position = lp + Vector3(0, 1.5, 0)
		lt.light_color = Color(1.0, 0.62, 0.3)
		lt.light_energy = 1.0
		lt.omni_range = 4.5
		add_child(lt)
	# 紅葉（幹 + 色の違う葉の塊）
	var trunk_xf: Array[Transform3D] = []
	var leaf_xf: Array[Transform3D] = []
	var leaf_c: Array[Color] = []
	var palette: Array[Color] = [Color(0.85, 0.22, 0.08), Color(0.92, 0.42, 0.1), Color(0.95, 0.62, 0.15), Color(0.7, 0.12, 0.08), Color(0.55, 0.5, 0.18)]
	for k2: int in range(int(34 * dens) + 8):
		var ang := r.randf() * TAU
		var dist := r.randf_range(8.0, 26.0)
		var base := Vector3(sin(ang) * dist, 0, cos(ang) * dist)
		if base.z < -11.0 and absf(base.x) < 11.0:
			continue
		var th := r.randf_range(2.5, 4.0)
		trunk_xf.append(Transform3D(Basis().scaled(Vector3(1, th, 1)), base + Vector3(0, th * 0.5, 0)))
		for c2: int in range(4):
			var off := Vector3(r.randf_range(-1.2, 1.2), th + r.randf_range(-0.2, 1.0), r.randf_range(-1.2, 1.2))
			leaf_xf.append(Transform3D(Basis().scaled(Vector3(1.0, 0.75, 1.0) * r.randf_range(1.0, 1.8)), base + off))
			leaf_c.append(palette[r.randi() % palette.size()])
	var tm := CylinderMesh.new()
	tm.top_radius = 0.1
	tm.bottom_radius = 0.16
	tm.height = 1.0
	tm.radial_segments = 6
	_multimesh(tm, trunk_xf, _mat(Color(0.25, 0.16, 0.12), 0.9))
	var lm := SphereMesh.new()
	lm.radial_segments = 8
	lm.rings = 5
	var leaf_mat := _mat(Color.WHITE, 0.9)
	leaf_mat.vertex_color_use_as_albedo = true
	_multimesh(lm, leaf_xf, leaf_mat, leaf_c)
	# 遠景の山
	_mountains(r, Color(0.45, 0.35, 0.42), 9)


## 遠景の山並み（霧で霞む）
func _mountains(r: RandomNumberGenerator, col: Color, n: int) -> void:
	var cm := CylinderMesh.new()
	cm.top_radius = 0.0
	cm.bottom_radius = 1.0
	cm.height = 1.0
	cm.radial_segments = 7
	var xf: Array[Transform3D] = []
	for k: int in range(n):
		var ang := k * TAU / n + r.randf_range(-0.2, 0.2)
		var d := r.randf_range(90, 130)
		var hgt := r.randf_range(18, 40)
		var rad := r.randf_range(30, 55)
		xf.append(Transform3D(Basis().scaled(Vector3(rad, hgt, rad)), Vector3(sin(ang) * d, -2 + hgt * 0.5, cos(ang) * d)))
	_multimesh(cm, xf, _mat(col, 1.0))


func _weather(quality: int) -> void:
	if quality <= 0:
		return
	if theme.get("rain", false):
		particles.append(_rain(Color(0.7, 0.8, 0.9, 0.35), 900 if quality >= 2 else 400, Vector3(0, -14, 0), 0.6, Vector2(0.012, 0.35)))
	if theme.get("snow", false):
		particles.append(_rain(Color(1, 1, 1, 0.85), 600 if quality >= 2 else 250, Vector3(0.3, -1.1, 0), 6.0, Vector2(0.05, 0.05)))
	if theme.has("leaves"):
		particles.append(_rain(theme["leaves"], 120, Vector3(0.4, -0.7, 0.2), 8.0, Vector2(0.08, 0.05)))
	if theme.get("sand", false):
		particles.append(_rain(Color(0.9, 0.75, 0.5, 0.25), 200, Vector3(2.5, -0.1, 0.5), 5.0, Vector2(0.12, 0.12)))


func _rain(c: Color, amount: int, grav: Vector3, life: float, size: Vector2) -> CPUParticles3D:
	var p := CPUParticles3D.new()
	p.amount = amount
	p.lifetime = life
	p.preprocess = life
	p.emission_shape = CPUParticles3D.EMISSION_SHAPE_BOX
	p.emission_box_extents = Vector3(16, 1, 16)
	p.position = Vector3(0, 9, 0)
	p.direction = Vector3(0, -1, 0)
	p.spread = 5.0
	p.gravity = grav
	p.initial_velocity_min = 0.5
	p.initial_velocity_max = 1.5
	var q := QuadMesh.new()
	q.size = size
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.albedo_color = c
	m.billboard_mode = BaseMaterial3D.BILLBOARD_FIXED_Y if size.y > size.x * 2.0 else BaseMaterial3D.BILLBOARD_ENABLED
	q.material = m
	p.mesh = q
	add_child(p)
	return p


func on_wall_broken(edge: int) -> void:
	if edge >= 0 and edge < edge_nodes.size():
		edge_nodes[edge].visible = false
		edge_broken[edge].visible = true


func excite_crowd(v: float) -> void:
	if crowd_mat != null:
		crowd_mat.set_shader_parameter("excite", v)


## カメラが壁の外側にあるとき、その壁を半透明にする
func fade_for_camera(cam_pos: Vector3) -> void:
	for fw: Array in _fade_walls:
		var node: Node3D = fw[0]
		var mid: Vector3 = fw[1]
		var n: Vector3 = fw[2]
		var outside := (cam_pos - mid).dot(n) > 0.1
		for c: Node in node.get_children():
			if c is MeshInstance3D:
				var m := (c as MeshInstance3D).material_override as StandardMaterial3D
				if m != null:
					var target := 0.18 if outside else 1.0
					m.albedo_color.a = lerpf(m.albedo_color.a, target, 0.2)


func update(delta: float, photosensitive: bool) -> void:
	if _lighthouse_beam != null:
		_lighthouse_beam.rotate_y(delta * 0.9)
	if theme.get("storm", false):
		_flash_t -= delta
		if _flash_t <= 0.0:
			_flash_t = randf_range(12.0, 25.0)
			_flash = 1.0
		if _flash > 0.0:
			_flash = maxf(0.0, _flash - delta * (0.8 if photosensitive else 3.5))
			var amt := _flash * (0.35 if photosensitive else 1.0)
			env.environment.ambient_light_energy = float(theme["amb_e"]) + amt * 1.5
	if crowd_mat != null:
		var exv: Variant = crowd_mat.get_shader_parameter("excite")
		var ex := float(exv) if exv != null else 0.0
		if ex > 0.0:
			crowd_mat.set_shader_parameter("excite", maxf(0.0, ex - delta * 0.4))
