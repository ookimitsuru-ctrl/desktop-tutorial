class_name StageView
extends Node3D
## ステージの見た目。リング形状（シミュレーションと同じデータ）から床・縁・壁を作り、テーマごとの背景と照明を置く。
## 仕様: 05_stages.md

const FP_TO_F := 1.0 / 65536.0
## 小道具に重ねる質感（tools/gen/gen_textures.py で生成。三面投影で貼る）
const TEX_GRUNGE := preload("res://assets/textures/grunge.png")
const TEX_BUMP := preload("res://assets/textures/bump_n.png")

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
## [材質, 位相]: 点滅する航空障害灯
var _blinkers: Array = []
var _blink_t := 0.0
## 空のドーム（カメラに追従）
var _dome: MeshInstance3D = null
var _dome_mat: ShaderMaterial = null
## [光源, 基準の明るさ, 位相]: 揺らぐ炎の明かり
var _flames: Array = []
## [材質, 基準の発光色, 位相]: ちらつくネオン
var _neons: Array = []
## [ノード, 基準の回転, 位相, 振れ幅]: 夜空を掃くサーチライト
var _sweeps: Array = []
## 流れる景色（川下りの岸）。同じ内容を 3 つ並べて流し、端で巻き戻す
var _scrollers: Array[Node3D] = []
var _scroll_z := 0.0
var _scroll_speed := 0.0
const SCROLL_SPAN := 160.0
## [ノード, 中心, 半径, 角速度, 角度]: 遠くを旋回する鳥の群れ
var _flocks: Array = []
var _t := 0.0
## 三面投影をワールド座標で行うか（動く物はローカル座標にしないと模様が流れる）
var _tri_world := true
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
		"skyfx": {"stars": 0.7, "moon": 0.035, "cover": 0.25, "lit": Color(0.10, 0.11, 0.17), "dark": Color(0.04, 0.045, 0.08), "wind": Vector2(0.006, 0.002), "glow": 0.25},
	},
	"harbor": {
		"sky": [Color(0.015, 0.02, 0.04), Color(0.09, 0.1, 0.16), Color(0.01, 0.015, 0.03)],
		"sun_rot": Vector3(-35, -40, 0), "sun": Color(1.0, 0.72, 0.45), "sun_e": 1.6,
		"amb": Color(0.35, 0.42, 0.6), "amb_e": 0.85, "fog": Color(0.06, 0.08, 0.13), "fog_d": 0.02,
		"floor": 1, "floor_c": Color(0.45, 0.45, 0.47), "line_c": Color(0.85, 0.7, 0.1), "alt_c": Color(0.2, 0.2, 0.2),
		"outside": "water", "water": [Color(0.01, 0.04, 0.07), Color(0.04, 0.13, 0.2)], "rim": Color(1.0, 0.75, 0.5), "wet": 0.7,
		"rain": true, "glow": 1.0, "dust": Color(0.5, 0.6, 0.7),
		"skyfx": {"cover": 0.9, "lit": Color(0.13, 0.15, 0.21), "dark": Color(0.04, 0.05, 0.08), "wind": Vector2(0.02, 0.008), "glow": 0.15},
	},
	"bamboo": {
		"sky": [Color(0.55, 0.68, 0.72), Color(0.82, 0.86, 0.8), Color(0.3, 0.38, 0.3)],
		"sun_rot": Vector3(-30, 60, 0), "sun": Color(1.0, 0.95, 0.82), "sun_e": 1.3,
		"amb": Color(0.55, 0.65, 0.58), "amb_e": 0.8, "fog": Color(0.72, 0.8, 0.76), "fog_d": 0.035,
		"floor": 2, "floor_c": Color(0.52, 0.52, 0.48), "line_c": Color(0.8, 0.8, 0.8), "alt_c": Color(0.24, 0.32, 0.2),
		"fence_c": Color(0.55, 0.6, 0.32), "outside": "grass", "outside_c": Color(0.2, 0.3, 0.16), "rim": Color(0.9, 1.0, 0.85),
		"leaves": Color(0.5, 0.7, 0.3), "glow": 0.5, "dust": Color(0.6, 0.62, 0.55),
		"skyfx": {"cover": 0.55, "lit": Color(1.0, 1.0, 0.98), "dark": Color(0.72, 0.78, 0.78), "wind": Vector2(0.008, 0.003), "glow": 0.5, "sun_disc": 0.03},
	},
	"fort": {
		# 薄明の雪原。空にオーロラ、かがり火が雪を照らす
		"sky": [Color(0.02, 0.05, 0.13), Color(0.16, 0.26, 0.40), Color(0.20, 0.24, 0.32)],
		"sun_rot": Vector3(-38, 140, 0), "sun": Color(0.62, 0.74, 1.0), "sun_e": 1.15,
		"amb": Color(0.42, 0.52, 0.75), "amb_e": 0.85, "fog": Color(0.14, 0.20, 0.32), "fog_d": 0.014,
		"floor": 3, "floor_c": Color(0.55, 0.55, 0.55), "line_c": Color(0.9, 0.9, 0.9), "alt_c": Color(0.35, 0.36, 0.4),
		"wall_c": Color(0.38, 0.36, 0.34), "outside": "snow", "outside_c": Color(0.80, 0.85, 0.95), "rim": Color(0.6, 0.8, 1.0),
		"snow": true, "glow": 0.85, "dust": Color(0.95, 0.96, 1.0),
		"skyfx": {"stars": 0.55, "moon": 0.03, "cover": 0.3, "lit": Color(0.30, 0.36, 0.48), "dark": Color(0.12, 0.15, 0.24), "wind": Vector2(0.007, 0.002), "glow": 0.3, "aurora": 0.9},
	},
	"ruins": {
		"sky": [Color(0.32, 0.36, 0.55), Color(0.98, 0.62, 0.36), Color(0.6, 0.45, 0.32)],
		"sun_rot": Vector3(-12, -70, 0), "sun": Color(1.0, 0.65, 0.38), "sun_e": 2.0,
		"amb": Color(0.6, 0.48, 0.45), "amb_e": 0.7, "fog": Color(0.85, 0.6, 0.42), "fog_d": 0.015,
		"floor": 4, "floor_c": Color(0.75, 0.6, 0.42), "line_c": Color(0.9, 0.8, 0.6), "alt_c": Color(0.45, 0.35, 0.25),
		"outside": "sand", "outside_c": Color(0.78, 0.62, 0.42), "rim": Color(1.0, 0.7, 0.45), "sand": true, "glow": 0.8,
		"dust": Color(0.85, 0.7, 0.5),
		"skyfx": {"cover": 0.4, "lit": Color(1.0, 0.72, 0.5), "dark": Color(0.5, 0.33, 0.36), "wind": Vector2(0.006, 0.002), "glow": 0.9, "sun_disc": 0.05},
	},
	"skyline": {
		"sky": [Color(0.01, 0.01, 0.04), Color(0.1, 0.06, 0.18), Color(0.02, 0.02, 0.05)],
		"sun_rot": Vector3(-50, 20, 0), "sun": Color(0.75, 0.82, 1.0), "sun_e": 1.2,
		"amb": Color(0.3, 0.3, 0.5), "amb_e": 0.7, "fog": Color(0.08, 0.05, 0.14), "fog_d": 0.006,
		"floor": 5, "floor_c": Color(0.22, 0.24, 0.27), "line_c": Color(0.95, 0.85, 0.2), "alt_c": Color(0.15, 0.15, 0.18),
		"fence_c": Color(0.5, 0.52, 0.55), "outside": "void", "rim": Color(0.6, 0.7, 1.0), "glow": 1.1, "dust": Color(0.6, 0.62, 0.7),
		"skyfx": {"stars": 0.9, "moon": 0.045, "cover": 0.3, "lit": Color(0.20, 0.14, 0.30), "dark": Color(0.06, 0.04, 0.12), "wind": Vector2(0.008, 0.003), "glow": 0.3},
	},
	"temple": {
		"sky": [Color(0.38, 0.32, 0.5), Color(0.98, 0.58, 0.38), Color(0.4, 0.3, 0.25)],
		"sun_rot": Vector3(-18, 110, 0), "sun": Color(1.0, 0.68, 0.42), "sun_e": 1.6,
		"amb": Color(0.6, 0.5, 0.5), "amb_e": 0.75, "fog": Color(0.75, 0.55, 0.45), "fog_d": 0.02,
		"floor": 6, "floor_c": Color(0.82, 0.8, 0.76), "line_c": Color(0.8, 0.8, 0.8), "alt_c": Color(0.5, 0.48, 0.45),
		"wall_c": Color(0.86, 0.82, 0.72), "roof_c": Color(0.18, 0.18, 0.2), "outside": "floor", "outside_c": Color(0.4, 0.35, 0.3),
		"rim": Color(1.0, 0.75, 0.55), "leaves": Color(0.9, 0.3, 0.12), "glow": 0.7, "dust": Color(0.8, 0.78, 0.72),
		"skyfx": {"cover": 0.5, "lit": Color(1.0, 0.66, 0.5), "dark": Color(0.45, 0.3, 0.42), "wind": Vector2(0.007, 0.002), "glow": 0.8, "sun_disc": 0.045},
	},
	"raft": {
		"sky": [Color(0.3, 0.55, 0.85), Color(0.75, 0.85, 0.95), Color(0.4, 0.5, 0.45)],
		"sun_rot": Vector3(-55, 45, 0), "sun": Color(1.0, 0.97, 0.9), "sun_e": 1.7,
		"amb": Color(0.55, 0.65, 0.8), "amb_e": 0.85, "fog": Color(0.7, 0.8, 0.9), "fog_d": 0.007,
		"floor": 7, "floor_c": Color(0.55, 0.4, 0.25), "line_c": Color(0.8, 0.8, 0.8), "alt_c": Color(0.18, 0.12, 0.08),
		"outside": "water", "water": [Color(0.04, 0.15, 0.14), Color(0.12, 0.35, 0.32)], "rim": Color(1.0, 0.96, 0.85), "glow": 0.5,
		"dust": Color(0.6, 0.75, 0.85), "trees": true,
		"skyfx": {"cover": 0.45, "lit": Color(1.0, 1.0, 1.0), "dark": Color(0.62, 0.7, 0.82), "wind": Vector2(0.015, 0.0), "glow": 0.5, "sun_disc": 0.03},
	},
	"lighthouse": {
		"sky": [Color(0.01, 0.015, 0.03), Color(0.06, 0.08, 0.12), Color(0.01, 0.01, 0.02)],
		"sun_rot": Vector3(-60, -20, 0), "sun": Color(0.65, 0.75, 1.0), "sun_e": 1.0,
		"amb": Color(0.22, 0.28, 0.42), "amb_e": 0.65, "fog": Color(0.05, 0.07, 0.1), "fog_d": 0.025,
		"floor": 8, "floor_c": Color(0.38, 0.4, 0.42), "line_c": Color(0.8, 0.8, 0.8), "alt_c": Color(0.2, 0.22, 0.25),
		"outside": "water", "water": [Color(0.01, 0.03, 0.05), Color(0.05, 0.12, 0.16)], "rim": Color(0.75, 0.85, 1.0), "wet": 0.8,
		"rain": true, "storm": true, "glow": 1.0, "dust": Color(0.6, 0.7, 0.8),
		"skyfx": {"cover": 0.97, "lit": Color(0.10, 0.12, 0.16), "dark": Color(0.02, 0.03, 0.045), "wind": Vector2(0.05, 0.02), "glow": 0.0},
	},
}


var _quality := 2


func build(sid: String, sdef: StageDef, quality: int) -> void:
	_quality = quality
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
	_build_dome(quality)


## 空のドーム: 雲・星・月・太陽・オーロラを描く大きな球（カメラに追従させる）
func _build_dome(quality: int) -> void:
	var fx: Dictionary = theme.get("skyfx", {})
	var sc: Array = theme["sky"]
	_dome = MeshInstance3D.new()
	var sm := SphereMesh.new()
	sm.radius = 1.0
	sm.height = 2.0
	sm.radial_segments = 32
	sm.rings = 16
	_dome.mesh = sm
	_dome.scale = Vector3.ONE * 300.0
	_dome.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_dome.extra_cull_margin = 2000.0
	_dome_mat = ShaderMaterial.new()
	_dome_mat.shader = load("res://shaders/sky_dome.gdshader")
	_dome_mat.set_shader_parameter("top_color", sc[0])
	_dome_mat.set_shader_parameter("horizon_color", sc[1])
	_dome_mat.set_shader_parameter("ground_color", sc[2])
	_dome_mat.set_shader_parameter("sun_dir", sun.global_transform.basis.z)
	_dome_mat.set_shader_parameter("sun_color", theme["sun"])
	_dome_mat.set_shader_parameter("sun_disc", float(fx.get("sun_disc", 0.0)))
	_dome_mat.set_shader_parameter("sun_glow", float(fx.get("glow", 0.4)))
	_dome_mat.set_shader_parameter("moon", float(fx.get("moon", 0.0)))
	_dome_mat.set_shader_parameter("stars", float(fx.get("stars", 0.0)))
	_dome_mat.set_shader_parameter("cloud_cover", float(fx.get("cover", 0.4)))
	_dome_mat.set_shader_parameter("cloud_wind", fx.get("wind", Vector2(0.01, 0.003)))
	_dome_mat.set_shader_parameter("cloud_lit", fx.get("lit", Color.WHITE))
	_dome_mat.set_shader_parameter("cloud_dark", fx.get("dark", Color(0.5, 0.55, 0.65)))
	_dome_mat.set_shader_parameter("aurora", float(fx.get("aurora", 0.0)))
	_dome_mat.set_shader_parameter("octaves", [2, 3, 4, 4][clampi(quality, 0, 3)])
	_dome.material_override = _dome_mat
	add_child(_dome)


func _mat(c: Color, rough: float = 0.8, metal: float = 0.0) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = c
	m.roughness = rough
	m.metallic = metal
	# 質感: 明るさのむら・染みを三面投影で重ねる（中画質以上）。高画質では細かな凹凸も
	if _quality >= 1:
		m.albedo_texture = TEX_GRUNGE
		m.uv1_triplanar = true
		m.uv1_world_triplanar = _tri_world
		m.uv1_scale = Vector3.ONE * 0.16
		m.uv1_triplanar_sharpness = 2.0
		if _quality >= 2:
			m.normal_enabled = true
			m.normal_texture = TEX_BUMP
			m.normal_scale = 0.3
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
				_wall(node, a3, b3, 1.9 if stage_id == "fort" else 2.4)
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
		# 石積みの目地（横線）
		for li: int in range(4):
			_box(Vector3(0.38, 0.03, ln + 0.37), mid + out_n + Vector3(0, 0.45 + li * 0.5, 0), _mat(wc.darkened(0.3), 0.95), node, yaw)
		var n := int(ln / 0.9)
		for k: int in range(n):
			if k % 2 == 0:
				var t := (k + 0.5) / float(n)
				var p := a.lerp(b, t) + out_n + Vector3(0, h + 0.22, 0)
				_box(Vector3(0.4, 0.44, 0.55), p, _mat(wc.darkened(0.1)), node, yaw)
	# 壁の飾り（筋・腰石・屋根・狭間）も本体と一緒に透けるよう、最初から深度プリパス付きの半透明にしておく
	# （試合中に透明モードを切り替えるとシェーダーの作り直しで引っかかる端末があるため）
	for c: Node in node.get_children():
		if c is MeshInstance3D:
			var dm := (c as MeshInstance3D).material_override as StandardMaterial3D
			if dm != null and dm.transparency == BaseMaterial3D.TRANSPARENCY_DISABLED:
				dm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA_DEPTH_PRE_PASS


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
			# 筏は丸太が半分沈む高さに水面を置く
			y = -0.7 if stage_id == "raft" else -1.6
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


func _multimesh(mesh: Mesh, xforms: Array[Transform3D], mat: Material, colors: Array[Color] = [], parent: Node3D = null) -> MultiMeshInstance3D:
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
	(parent if parent != null else self).add_child(mmi)
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
				var head := _box(Vector3(0.6, 0.35, 0.6), lp, _mat(Color(1.0, 0.97, 0.9), 0.3), null)
				(head.material_override as StandardMaterial3D).emission_enabled = true
				(head.material_override as StandardMaterial3D).emission = Color(1.0, 0.95, 0.85) * 2.5
				_cone(lp, Vector3(0, 0.6, 0), 11.5, 3.0, Color(1.0, 0.95, 0.85), 0.075)
				# 照明をつなぐトラス（梁）と、そこから下がる垂れ幕
				var lp2 := Vector3(cos((k3 + 1) * PI * 0.5 + 0.78) * 9.0, 9.0, sin((k3 + 1) * PI * 0.5 + 0.78) * 9.0)
				var mid := (lp + lp2) * 0.5
				var yaw3 := atan2((lp2 - lp).x, (lp2 - lp).z)
				_box(Vector3(0.18, 0.18, lp.distance_to(lp2)), mid, _mat(Color(0.2, 0.21, 0.24), 0.5, 0.6), null, yaw3)
				_box(Vector3(0.1, 0.1, lp.distance_to(lp2)), mid + Vector3(0, 0.45, 0), _mat(Color(0.2, 0.21, 0.24), 0.5, 0.6), null, yaw3)
				var bc := Color(0.7, 0.12, 0.1) if k3 % 2 == 0 else Color(0.1, 0.22, 0.6)
				_banner(mid + Vector3(0, -0.1, 0), 2.6, 4.2, bc, Color(0.95, 0.82, 0.3), yaw3 + PI * 0.5, true, null, 0.35)
			_box(Vector3(8, 4.5, 0.3), Vector3(0, 9.5, -17), _mat(Color(0.05, 0.05, 0.08)))
			var screen := MeshInstance3D.new()
			var sq := QuadMesh.new()
			sq.size = Vector2(7.4, 4.0)
			screen.mesh = sq
			var scm := ShaderMaterial.new()
			scm.shader = load("res://shaders/arena_screen.gdshader")
			screen.material_override = scm
			screen.position = Vector3(0, 9.5, -16.82)
			add_child(screen)
		"harbor":
			_harbor(r, dens)
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
			for k4: int in range(8):
				var a4 := k4 * TAU / 8.0 + 0.4
				var d4 := r.randf_range(6.5, 11.5)
				_shaft(Vector3(sin(a4) * d4, 4.4, cos(a4) * d4), 12.0, r.randf_range(1.3, 2.6), Color(1.0, 0.97, 0.78), r.randf_range(0.10, 0.18))
			_motes(Color(1.0, 0.98, 0.75, 0.6), 80)
			_flock(Vector3(0, 30, 0), 55.0, 7, 0.1)
		"fort":
			_fort(r, dens)
		"ruins":
			_ruins(r, dens)
		"skyline":
			_skyline(r, dens)
		"temple":
			_temple(r, dens)
		"raft":
			_raft(r, dens)
		"lighthouse":
			_cyl(2.4, 3.2, 26, Vector3(0, 11, -14), _mat(Color(0.88, 0.88, 0.85), 0.7))
			for k: int in range(4):
				_cyl(2.45 - k * 0.2, 2.55 - k * 0.2, 1.2, Vector3(0, 2 + k * 6, -14), _mat(Color(0.7, 0.12, 0.1), 0.6))
			_cyl(1.6, 1.8, 2.5, Vector3(0, 25.5, -14), _mat(Color(0.2, 0.22, 0.25), 0.4, 0.6))
			# 灯室のガラス（発光）・回廊と手すり・屋根
			var glass := _cyl(1.45, 1.45, 1.8, Vector3(0, 25.6, -14), _mat(Color(1.0, 0.95, 0.75)), null, 16)
			(glass.material_override as StandardMaterial3D).emission_enabled = true
			(glass.material_override as StandardMaterial3D).emission = Color(1.0, 0.9, 0.6) * 2.2
			_cyl(2.6, 2.6, 0.18, Vector3(0, 24.15, -14), _mat(Color(0.18, 0.18, 0.2), 0.5, 0.6), null, 20)
			for k5: int in range(16):
				var a5 := k5 * TAU / 16.0
				_cyl(0.03, 0.03, 0.9, Vector3(sin(a5) * 2.5, 24.7, -14 + cos(a5) * 2.5), _mat(Color(0.15, 0.15, 0.17), 0.5, 0.6), null, 4)
			_cyl(0.0, 1.9, 1.2, Vector3(0, 27.4, -14), _mat(Color(0.12, 0.13, 0.15), 0.4, 0.6), null, 16)
			# 灯台守の小屋（明かりの灯る窓）
			_box(Vector3(5, 3, 4), Vector3(-6.5, 0.4, -15), _mat(Color(0.82, 0.8, 0.76), 0.8))
			_gable(self, Vector3(-6.5, 1.9, -15), 5.6, 4.6, 1.4, Color(0.25, 0.12, 0.1), PI * 0.5)
			var win := _box(Vector3(1.0, 0.8, 0.05), Vector3(-6.5, 0.7, -12.97), _mat(Color(1.0, 0.8, 0.45)))
			(win.material_override as StandardMaterial3D).emission_enabled = true
			(win.material_override as StandardMaterial3D).emission = Color(1.0, 0.7, 0.35) * 2.0
			var wl := _omni()
			wl.position = Vector3(-6.5, 0.8, -12.4)
			wl.light_color = Color(1.0, 0.7, 0.4)
			wl.light_energy = 1.2
			wl.omni_range = 6.0
			add_child(wl)
			# 舞台の縁に打ち寄せる波しぶき（白い泡の輪）
			var foam := _cyl(5.6, 5.9, 0.2, Vector3(0, -1.45, 0), _mat(Color(0.85, 0.9, 0.95), 0.9), null, 40)
			var fm := foam.material_override as StandardMaterial3D
			fm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
			fm.albedo_color = Color(0.85, 0.9, 0.95, 0.55)
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
			for sg: float in [-1.0, 1.0]:
				_cone(Vector3.ZERO, Vector3(0, -0.208, 0.978 * sg), 62.0, 7.5, Color(1.0, 0.95, 0.8), 0.26, _lighthouse_beam)
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
		var lt := _omni()
		lt.position = lp + Vector3(0, 1.5, 0)
		lt.light_color = Color(1.0, 0.62, 0.3)
		lt.light_energy = 1.0
		lt.omni_range = 4.5
		add_child(lt)
		_flames.append([lt, 1.0, lp.x + lp.z * 0.5])
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
	# 山門の脇ののぼり、夕日の筋、漂う光の粒、ねぐらへ帰る鳥
	for nx: float in [-4.4, 4.4]:
		_cyl(0.04, 0.05, 4.4, Vector3(nx, 2.2, 12.6), _mat(Color(0.25, 0.2, 0.16), 0.8))
		_banner(Vector3(nx + 0.04, 2.7, 12.6), 0.75, 3.0, Color(0.55, 0.08, 0.1) if nx < 0 else Color(0.12, 0.16, 0.4), Color(0.95, 0.9, 0.8), 0.0, false, null, 0.7)
	for k7: int in range(5):
		var a7 := k7 * TAU / 5.0 + 1.1
		var d7 := r.randf_range(7.5, 11.0)
		_shaft(Vector3(sin(a7) * d7, 4.0, cos(a7) * d7), 12.0, r.randf_range(1.5, 2.4), Color(1.0, 0.72, 0.45), r.randf_range(0.07, 0.11))
	_motes(Color(1.0, 0.8, 0.55, 0.5), 60)
	_flock(Vector3(-10, 32, 0), 60.0, 9, 0.08)
	# 遠景の山
	_mountains(r, Color(0.45, 0.35, 0.42), 9)


## 埠頭: コンテナの山、ガントリークレーン、係留柱、街灯、停泊中の貨物船、対岸の街明かり
func _harbor(r: RandomNumberGenerator, dens: float) -> void:
	var cont_cols: Array[Color] = [Color(0.6, 0.15, 0.1), Color(0.1, 0.3, 0.55), Color(0.15, 0.45, 0.25), Color(0.7, 0.55, 0.1), Color(0.4, 0.4, 0.42), Color(0.55, 0.3, 0.12)]
	# 岸壁（リングの奥側は陸、手前側は海）
	_box(Vector3(80, 1.0, 34), Vector3(0, -1.1, -24), _mat(Color(0.22, 0.22, 0.24), 0.9))
	# コンテナの山（扉側を暗く）
	for k: int in range(int(14 * dens) + 6):
		var x := r.randf_range(-30, 30)
		var z := r.randf_range(-36, -12)
		if absf(x) < 8 and z > -16:
			continue
		var yaw := (PI * 0.5 if r.randf() > 0.6 else 0.0) + r.randf_range(-0.03, 0.03)
		var stack := r.randi_range(1, 4)
		for st: int in range(stack):
			var col := cont_cols[r.randi() % cont_cols.size()]
			var c := _box(Vector3(2.44, 2.59, 6.06), Vector3(x, -0.6 + 1.3 + st * 2.6, z), _mat(col, 0.75, 0.25), null, yaw)
			# 扉・リブ
			var door_off := Basis(Vector3.UP, yaw) * Vector3(0, 0, 3.04)
			_box(Vector3(2.3, 2.4, 0.04), c.position + door_off, _mat(col.darkened(0.35), 0.8, 0.2), null, yaw)
	# ガントリークレーン 2 基（脚・梁・ブーム・赤い航空障害灯）
	var crane_c := Color(0.85, 0.55, 0.08)
	for k2: int in range(2):
		var cx := -14.0 + k2 * 28.0
		var cz := -14.0
		for lx: float in [-3.0, 3.0]:
			for lz: float in [-4.0, 4.0]:
				_box(Vector3(0.6, 20, 0.6), Vector3(cx + lx, 9.4, cz + lz), _mat(crane_c, 0.5, 0.4))
			_box(Vector3(0.5, 0.5, 8.6), Vector3(cx + lx, 6.0, cz), _mat(crane_c, 0.5, 0.4))
		_box(Vector3(7.2, 1.2, 1.2), Vector3(cx, 19.0, cz - 4.0), _mat(crane_c, 0.5, 0.4))
		_box(Vector3(7.2, 1.2, 1.2), Vector3(cx, 19.0, cz + 4.0), _mat(crane_c, 0.5, 0.4))
		_box(Vector3(1.4, 1.4, 34), Vector3(cx, 20.2, cz + 9), _mat(crane_c, 0.5, 0.4))
		_box(Vector3(3.0, 2.4, 3.0), Vector3(cx, 18.3, cz + 2), _mat(Color(0.85, 0.85, 0.82), 0.5))
		_blinker(Vector3(cx, 21.2, cz + 25.5), 0.4, k2 * 0.5)
		var lamp := _omni()
		lamp.position = Vector3(cx, 17.0, cz + 6)
		lamp.light_color = Color(1.0, 0.72, 0.42)
		lamp.light_energy = 3.0
		lamp.omni_range = 30.0
		add_child(lamp)
		_cone(Vector3(cx, 17.2, cz + 6), Vector3(cx, 0, cz + 9), 17.5, 6.5, Color(1.0, 0.75, 0.45), 0.075)
	# 係留柱（ビット）と岸壁の縁石
	var bol_xf: Array[Transform3D] = []
	for k3: int in range(14):
		var bx := -26.0 + k3 * 4.0
		bol_xf.append(Transform3D(Basis(), Vector3(bx, -0.35, -7.4)))
	var bm := CylinderMesh.new()
	bm.top_radius = 0.22
	bm.bottom_radius = 0.26
	bm.height = 0.5
	bm.radial_segments = 10
	_multimesh(bm, bol_xf, _mat(Color(0.12, 0.12, 0.13), 0.5, 0.5))
	_box(Vector3(80, 0.18, 0.4), Vector3(0, -0.52, -7.2), _mat(Color(0.85, 0.7, 0.1), 0.6))
	# 街灯（ナトリウム灯）
	for lx2: float in [-9.0, 9.0]:
		_cyl(0.08, 0.1, 7.0, Vector3(lx2, 2.9, -8.5), _mat(Color(0.2, 0.2, 0.22), 0.5, 0.6))
		var bulb := _box(Vector3(0.8, 0.2, 0.4), Vector3(lx2, 6.4, -8.1), _mat(Color(1.0, 0.8, 0.5)))
		(bulb.material_override as StandardMaterial3D).emission_enabled = true
		(bulb.material_override as StandardMaterial3D).emission = Color(1.0, 0.65, 0.3) * 2.5
		var sl := _omni()
		sl.position = Vector3(lx2, 6.0, -7.5)
		sl.light_color = Color(1.0, 0.68, 0.38)
		sl.light_energy = 1.6
		sl.omni_range = 12.0
		add_child(sl)
		_cone(Vector3(lx2, 6.3, -8.1), Vector3(lx2, 0, -6.9), 6.7, 2.7, Color(1.0, 0.72, 0.42), 0.17)
	# 停泊中の貨物船（手前の海、右奥）
	var hull_c := Color(0.12, 0.13, 0.16)
	var ship := Node3D.new()
	ship.position = Vector3(24, -1.6, 22)
	ship.rotation.y = 0.35
	add_child(ship)
	_box(Vector3(9, 6, 60), Vector3(0, 2.0, 0), _mat(hull_c, 0.7, 0.2), ship)
	_box(Vector3(9.1, 1.2, 60.1), Vector3(0, -0.3, 0), _mat(Color(0.5, 0.12, 0.1), 0.7), ship)
	_hip(Vector3(0, -1.0, 31.5), 9.0, 6.0, 0.0, hull_c, ship)
	_box(Vector3(8, 8, 7), Vector3(0, 9.0, -22), _mat(Color(0.88, 0.88, 0.85), 0.6), ship)
	var win := ShaderMaterial.new()
	win.shader = load("res://shaders/emissive_windows.gdshader")
	var wb := MeshInstance3D.new()
	var bxm := BoxMesh.new()
	wb.mesh = bxm
	wb.material_override = win
	wb.scale = Vector3(8.05, 7.0, 7.05)
	wb.position = Vector3(0, 9.0, -22)
	ship.add_child(wb)
	for k4: int in range(int(6 * dens) + 2):
		_box(Vector3(2.44, 2.59, 6.06), Vector3(r.randf_range(-2.5, 2.5), 6.3, -10 + k4 * 6.5), _mat(cont_cols[r.randi() % cont_cols.size()], 0.75, 0.25), ship)
	# 対岸の街明かり
	var bxf: Array[Transform3D] = []
	for k5: int in range(int(60 * dens) + 10):
		var x5 := r.randf_range(-110, 110)
		var h5 := r.randf_range(6, 40)
		var w5 := r.randf_range(4, 10)
		bxf.append(Transform3D(Basis().scaled(Vector3(w5, h5, w5)), Vector3(x5, -2 + h5 * 0.5, r.randf_range(95, 120))))
	var city := ShaderMaterial.new()
	city.shader = load("res://shaders/emissive_windows.gdshader")
	_multimesh(BoxMesh.new(), bxf, city)


## 雪原の砦跡: 崩れた石塁、見張り塔、かがり火、旗、雪をかぶった針葉樹、雪山
func _fort(r: RandomNumberGenerator, dens: float) -> void:
	var stone := Color(0.52, 0.5, 0.48)
	var snow := Color(0.93, 0.95, 0.98)
	# 崩れた石塁（雪が積もる）
	for k: int in range(int(10 * dens) + 4):
		var ang := r.randf() * TAU
		var d := r.randf_range(12, 26)
		var p := Vector3(sin(ang) * d, -1.5, cos(ang) * d)
		var sz := Vector3(r.randf_range(2, 6), r.randf_range(1.5, 4.5), r.randf_range(1, 2))
		_box(sz, p + Vector3(0, sz.y * 0.5, 0), _mat(stone, 0.95), null, ang)
		_box(Vector3(sz.x + 0.1, 0.18, sz.z + 0.1), p + Vector3(0, sz.y + 0.05, 0), _mat(snow, 0.9), null, ang)
	# 見張り塔（北東の奥、上部が崩れている）
	var tp := Vector3(13, -1.5, -15)
	_cyl(2.6, 3.0, 10.0, tp + Vector3(0, 5.0, 0), _mat(stone.darkened(0.08), 0.95), null, 12)
	for k2: int in range(6):
		if k2 % 3 == 1:
			continue
		var a2 := k2 * TAU / 6.0
		_box(Vector3(1.2, 1.2, 0.8), tp + Vector3(sin(a2) * 2.5, 10.6, cos(a2) * 2.5), _mat(stone.darkened(0.08), 0.95), null, a2)
	_cyl(2.65, 2.65, 0.2, tp + Vector3(0, 10.05, 0), _mat(snow, 0.9), null, 12)
	# かがり火（塀の外の四方）と旗
	for bp: Vector3 in [Vector3(-7.4, 0, -4.0), Vector3(7.4, 0, -4.0), Vector3(-7.4, 0, 4.0), Vector3(7.4, 0, 4.0)]:
		_cyl(0.08, 0.1, 1.6, bp + Vector3(0, 0.8, 0), _mat(Color(0.2, 0.18, 0.16), 0.7, 0.4))
		var bowl := _cyl(0.4, 0.25, 0.3, bp + Vector3(0, 1.7, 0), _mat(Color(0.25, 0.22, 0.2), 0.6, 0.5))
		var _b := bowl
		_flame(bp + Vector3(0, 1.8, 0), 0.8, 2.4, 8.5)
		_cyl(0.05, 0.05, 4.5, bp + Vector3(0.6, 2.25, 0), _mat(Color(0.3, 0.25, 0.2), 0.8))
		_banner(bp + Vector3(0.62, 3.75, 0.0), 1.6, 1.2, Color(0.62, 0.1, 0.08), Color(0.92, 0.86, 0.7), -PI * 0.5, false)
	# 雪をかぶった針葉樹
	var trunk: Array[Transform3D] = []
	var leaf: Array[Transform3D] = []
	var cap: Array[Transform3D] = []
	for k3: int in range(int(70 * dens) + 10):
		var ang3 := r.randf() * TAU
		var d3 := r.randf_range(16, 45)
		var base := Vector3(sin(ang3) * d3, -1.5, cos(ang3) * d3)
		var hgt := r.randf_range(3.0, 6.5)
		trunk.append(Transform3D(Basis().scaled(Vector3(1, hgt * 0.3, 1)), base + Vector3(0, hgt * 0.15, 0)))
		for t: int in range(3):
			var sc := (1.0 - t * 0.28) * hgt * 0.32
			var y := hgt * (0.3 + t * 0.22)
			leaf.append(Transform3D(Basis().scaled(Vector3(sc, sc * 1.1, sc)), base + Vector3(0, y, 0)))
			cap.append(Transform3D(Basis().scaled(Vector3(sc * 0.55, sc * 0.45, sc * 0.55)), base + Vector3(0, y + sc * 0.4, 0)))
	var tm := CylinderMesh.new()
	tm.top_radius = 0.12
	tm.bottom_radius = 0.18
	tm.height = 1.0
	tm.radial_segments = 6
	_multimesh(tm, trunk, _mat(Color(0.25, 0.18, 0.12), 0.9))
	var cone := CylinderMesh.new()
	cone.top_radius = 0.0
	cone.bottom_radius = 1.0
	cone.height = 1.0
	cone.radial_segments = 8
	_multimesh(cone, leaf, _mat(Color(0.14, 0.26, 0.2), 0.9))
	_multimesh(cone, cap, _mat(snow, 0.85))
	_mountains(r, Color(0.78, 0.82, 0.9), 10)


## 砂漠の遺跡: 二段の基壇、列柱と梁（一部は崩れている）、巨大な門、倒れた柱の胴、オアシスのヤシ、砂丘、遠くの階段状の神殿、かがり火
func _ruins(r: RandomNumberGenerator, dens: float) -> void:
	var stone := Color(0.8, 0.64, 0.46)
	var dark := Color(0.6, 0.46, 0.33)
	var sm := _mat(stone, 0.92)
	var dm := _mat(dark, 0.95)
	# リングの基壇（砂に埋もれた二段の石段）
	_box(Vector3(15.0, 0.5, 15.0), Vector3(0, -0.85, 0), dm)
	_box(Vector3(16.4, 0.45, 16.4), Vector3(0, -1.3, 0), sm)
	# 東西の列柱（梁が残る区間と、折れた柱）
	for side: float in [-1.0, 1.0]:
		var prev_top := -1.0
		for k: int in range(7):
			var z := -13.5 + k * 4.5
			var p := Vector3(side * 12.0, -1.5, z)
			var broken := r.randf() < 0.35
			var h := r.randf_range(1.2, 4.0) if broken else 7.0
			_column(p, h, broken, sm, dm, r)
			if not broken and prev_top > 0.0:
				_box(Vector3(1.3, 0.9, 4.5), p + Vector3(0, 7.0 + 0.55 + 0.45, -2.25), sm)
				_box(Vector3(1.34, 0.12, 4.52), p + Vector3(0, 7.0 + 0.55 + 0.75, -2.25), dm)
			prev_top = -1.0 if broken else 7.0
	# 南の奥: 柱の残る小さな祠
	for k2: int in range(4):
		var px := -4.5 + k2 * 3.0
		_column(Vector3(px, -1.5, 15.5), 5.0 if k2 != 2 else 2.2, k2 == 2, sm, dm, r)
	_box(Vector3(6.6, 0.8, 1.3), Vector3(-3.0, -1.5 + 5.0 + 0.55 + 0.4, 15.5), sm)
	# 北の巨大な門（台形の塔門 2 基と梁、帯の彫り）
	var gz := -26.0
	for gx: float in [-6.0, 6.0]:
		var py := _cyl(2.3, 3.4, 13.0, Vector3(gx, -1.5 + 6.5, gz), sm, null, 4)
		py.rotation.y = PI * 0.25
		for b: int in range(3):
			var bt := _cyl(3.25 - b * 0.33, 3.3 - b * 0.33, 0.35, Vector3(gx, 1.0 + b * 3.6, gz), dm, null, 4)
			bt.rotation.y = PI * 0.25
	_box(Vector3(9.0, 1.6, 3.2), Vector3(0, 8.6, gz), sm)
	_box(Vector3(9.4, 0.3, 3.4), Vector3(0, 9.5, gz), dm)
	_box(Vector3(2.4, 1.0, 0.2), Vector3(0, 8.6, gz + 1.65), _mat(Color(0.55, 0.36, 0.22), 0.9))
	# 倒れた柱の胴と石材
	for k3: int in range(int(10 * dens) + 4):
		var ang := r.randf() * TAU
		var d := r.randf_range(9.5, 22.0)
		var p3 := Vector3(sin(ang) * d, -1.5, cos(ang) * d)
		if r.randf() < 0.6:
			var ln := r.randf_range(1.2, 3.0)
			var drum := _cyl(0.58, 0.58, ln, p3 + Vector3(0, 0.45, 0), sm, null, 14)
			drum.rotation = Vector3(0, r.randf() * TAU, PI * 0.5)
		else:
			var sz := Vector3(r.randf_range(0.8, 1.8), r.randf_range(0.4, 0.9), r.randf_range(0.6, 1.2))
			_box(sz, p3 + Vector3(0, sz.y * 0.4, 0), dm, null, r.randf() * TAU).rotation.x = r.randf_range(-0.2, 0.2)
	# かがり火（基壇の四隅の外）
	for bp: Vector3 in [Vector3(-8.7, -1.5, -8.7), Vector3(8.7, -1.5, -8.7), Vector3(-8.7, -1.5, 8.7), Vector3(8.7, -1.5, 8.7)]:
		_box(Vector3(0.7, 0.4, 0.7), bp + Vector3(0, 0.2, 0), dm)
		_cyl(0.12, 0.16, 2.0, bp + Vector3(0, 1.4, 0), _mat(Color(0.3, 0.22, 0.14), 0.6, 0.5))
		_cyl(0.5, 0.28, 0.35, bp + Vector3(0, 2.5, 0), _mat(Color(0.35, 0.25, 0.15), 0.5, 0.6))
		_flame(bp + Vector3(0, 2.62, 0), 0.9, 1.5, 7.5)
	# オアシス（南西）: 水たまりとヤシ
	var oasis := Vector3(-22, -1.5, 18)
	var pond := _cyl(6.0, 6.0, 0.06, oasis + Vector3(0, 0.03, 0), _mat(Color(0.1, 0.32, 0.36), 0.15, 0.2), null, 24)
	pond.scale = Vector3(1.0, 1.0, 0.65)
	_palms(r, oasis, 7.5, int(6 * dens) + 4)
	_palms(r, Vector3(24, -1.5, -6), 5.0, int(3 * dens) + 2)
	# 砂丘
	var dune: Array[Transform3D] = []
	for k4: int in range(int(18 * dens) + 6):
		var ang4 := r.randf() * TAU
		var d4 := r.randf_range(38, 95)
		dune.append(Transform3D(Basis(Vector3.UP, r.randf() * PI) * Basis.from_scale(Vector3(r.randf_range(14, 30), r.randf_range(2.5, 7.0), r.randf_range(8, 18))), Vector3(sin(ang4) * d4, -1.6, cos(ang4) * d4)))
	var dm2 := SphereMesh.new()
	dm2.radial_segments = 12
	dm2.rings = 6
	_multimesh(dm2, dune, _mat(Color(0.8, 0.6, 0.4), 1.0))
	# 遠くの階段状の神殿
	var zp := Vector3(48, -1.5, -70)
	for t: int in range(6):
		var w := 34.0 - t * 5.0
		_box(Vector3(w, 3.2, w), zp + Vector3(0, 1.6 + t * 3.2, 0), _mat(stone.darkened(0.08 + t * 0.02), 0.95))
	_box(Vector3(4.0, 0.6, 26.0), zp + Vector3(0, 9.0, 13.0), dm).rotation.x = -0.72
	_box(Vector3(6.0, 4.0, 6.0), zp + Vector3(0, 21.2, 0), dm)
	_flock(Vector3(20, 34, -30), 30.0, 5, -0.14)
	_motes(Color(1.0, 0.85, 0.6, 0.45), 60)
	for k9: int in range(4):
		_shaft(Vector3(-12.0 + k9 * 0.4, 4.2, -9.0 + k9 * 4.5), 11.0, 1.8, Color(1.0, 0.78, 0.5), 0.07)


## 列柱 1 本: 礎石・柱身（溝の帯）・柱頭。broken なら柱頭なしで斜めに欠けた上端
func _column(p: Vector3, h: float, broken: bool, sm: Material, dm: Material, r: RandomNumberGenerator) -> void:
	_box(Vector3(1.5, 0.45, 1.5), p + Vector3(0, 0.22, 0), dm)
	_cyl(0.52, 0.6, h, p + Vector3(0, 0.45 + h * 0.5, 0), sm, null, 16)
	for b: int in range(int(h / 2.4)):
		_cyl(0.6, 0.6, 0.08, p + Vector3(0, 1.2 + b * 2.4, 0), dm, null, 16)
	if broken:
		var chip := _box(Vector3(1.1, 0.5, 1.1), p + Vector3(0, 0.45 + h + 0.05, 0), sm, null, r.randf() * TAU)
		chip.rotation.x = r.randf_range(0.35, 0.6)
		return
	_cyl(0.78, 0.55, 0.35, p + Vector3(0, 0.45 + h + 0.17, 0), sm, null, 16)
	_box(Vector3(1.5, 0.22, 1.5), p + Vector3(0, 0.45 + h + 0.45, 0), dm)


## ヤシの群れ: 曲がった幹（3 節）と垂れた葉
func _palms(r: RandomNumberGenerator, center: Vector3, spread: float, n: int) -> void:
	var trunk: Array[Transform3D] = []
	var frond: Array[Transform3D] = []
	for k: int in range(n):
		var base := center + Vector3(r.randf_range(-spread, spread), 0, r.randf_range(-spread, spread) * 0.7)
		var lean := Vector3(r.randf_range(-1, 1), 0, r.randf_range(-1, 1)).normalized()
		var hgt := r.randf_range(5.0, 8.5)
		var top := base
		for s2: int in range(3):
			var seg_h := hgt / 3.0
			var dir := (Vector3.UP + lean * (0.12 + s2 * 0.14)).normalized()
			var mid := top + dir * seg_h * 0.5
			var axis := Vector3.UP.cross(dir)
			var bas := Basis() if axis.length() < 1e-4 else Basis(axis.normalized(), Vector3.UP.angle_to(dir))
			trunk.append(Transform3D(bas * Basis.from_scale(Vector3(1, seg_h, 1)), mid))
			top += dir * seg_h
		var nf := 8
		for f: int in range(nf):
			var yaw := f * TAU / nf + r.randf_range(-0.2, 0.2)
			var droop := r.randf_range(0.35, 0.65)
			var bas2 := Basis(Vector3.UP, yaw) * Basis(Vector3.RIGHT, droop)
			frond.append(Transform3D(bas2 * Basis.from_scale(Vector3(0.55, 0.05, 2.6)), top + bas2 * Vector3(0, 0, 1.25)))
	var tm := CylinderMesh.new()
	tm.top_radius = 0.16
	tm.bottom_radius = 0.22
	tm.height = 1.0
	tm.radial_segments = 7
	_multimesh(tm, trunk, _mat(Color(0.42, 0.32, 0.22), 0.95))
	var fm := BoxMesh.new()
	_multimesh(fm, frond, _mat(Color(0.25, 0.42, 0.18), 0.85))


## 夜景の屋上: ヘリポートを載せた塔、屋上の設備、隣のビルの屋上（給水塔・アンテナ）、ネオン看板、点滅する航空障害灯、月
func _skyline(r: RandomNumberGenerator, dens: float) -> void:
	var win := ShaderMaterial.new()
	win.shader = load("res://shaders/emissive_windows.gdshader")
	# 遠くのビル群
	var bxf: Array[Transform3D] = []
	for k: int in range(int(120 * dens) + 20):
		var ang := r.randf() * TAU
		var d := r.randf_range(32, 110)
		var h := r.randf_range(10, 80)
		var w := r.randf_range(5, 14)
		bxf.append(Transform3D(Basis(Vector3.UP, r.randf() * PI).scaled(Vector3(w, h, w)), Vector3(sin(ang) * d, -60 + h * 0.5, cos(ang) * d)))
	_multimesh(BoxMesh.new(), bxf, win)
	# 自分の塔（屋上の床・パラペット・窓）
	var concrete := Color(0.2, 0.21, 0.24)
	var tower := MeshInstance3D.new()
	tower.mesh = BoxMesh.new()
	tower.material_override = win
	tower.scale = Vector3(18, 60, 18)
	tower.position = Vector3(0, -1.9 - 30, 0)
	add_child(tower)
	_box(Vector3(18.2, 0.5, 18.2), Vector3(0, -1.65, 0), _mat(concrete, 0.85))
	for sgn: float in [-1.0, 1.0]:
		_box(Vector3(18.2, 1.0, 0.3), Vector3(0, -0.9, sgn * 9.0), _mat(concrete.lightened(0.1), 0.8))
		_box(Vector3(0.3, 1.0, 18.2), Vector3(sgn * 9.0, -0.9, 0), _mat(concrete.lightened(0.1), 0.8))
	# ヘリポートの台座と脚、外周灯（緑と白を交互）
	_cyl(6.6, 6.8, 0.8, Vector3(0, -1.0, 0), _mat(Color(0.25, 0.26, 0.3), 0.7))
	for k2: int in range(12):
		var la := k2 * TAU / 12.0
		var lc := Color(0.2, 1.0, 0.3) if k2 % 2 == 0 else Color(1.0, 1.0, 0.9)
		var lamp := _cyl(0.06, 0.06, 0.15, Vector3(sin(la) * 6.3, 0.08, cos(la) * 6.3), _mat(lc))
		(lamp.material_override as StandardMaterial3D).emission_enabled = true
		(lamp.material_override as StandardMaterial3D).emission = lc * 2.0
	# 屋上の設備: 空調機（ファン付き）、階段室、アンテナ
	for ap: Vector3 in [Vector3(-7.4, -1.4, -7.4), Vector3(-7.4, -1.4, -5.2), Vector3(7.6, -1.4, 6.0)]:
		_box(Vector3(1.6, 1.0, 1.6), ap + Vector3(0, 0.5, 0), _mat(Color(0.55, 0.56, 0.58), 0.5, 0.4))
		_cyl(0.6, 0.6, 0.06, ap + Vector3(0, 1.02, 0), _mat(Color(0.12, 0.12, 0.13), 0.5, 0.5), null, 16)
	_box(Vector3(3.2, 2.6, 2.4), Vector3(7.2, -0.1, -7.4), _mat(concrete.lightened(0.05), 0.85))
	var door := _box(Vector3(0.9, 1.8, 0.05), Vector3(7.2, -0.5, -6.17), _mat(Color(0.9, 0.85, 0.6)))
	(door.material_override as StandardMaterial3D).emission_enabled = true
	(door.material_override as StandardMaterial3D).emission = Color(1.0, 0.85, 0.55) * 0.9
	_cyl(0.06, 0.1, 9.0, Vector3(-7.6, 3.1, 7.6), _mat(Color(0.5, 0.5, 0.52), 0.4, 0.7))
	for k3: int in range(3):
		_box(Vector3(1.2 - k3 * 0.3, 0.04, 0.04), Vector3(-7.6, 1.5 + k3 * 2.0, 7.6), _mat(Color(0.5, 0.5, 0.52), 0.4, 0.7))
	_blinker(Vector3(-7.6, 7.7, 7.6), 0.25, 0.0)
	# 隣のビルの屋上（リングより低い位置）
	for k4: int in range(int(5 * dens) + 3):
		var ang4 := k4 * TAU / (int(5 * dens) + 3) + r.randf_range(-0.25, 0.25)
		var d4 := r.randf_range(20, 30)
		var top := r.randf_range(-12.0, -3.0)
		var bw := r.randf_range(9, 14)
		var bc := Vector3(sin(ang4) * d4, top, cos(ang4) * d4)
		var b := MeshInstance3D.new()
		b.mesh = BoxMesh.new()
		b.material_override = win
		b.scale = Vector3(bw, 60, bw)
		b.position = bc - Vector3(0, 30, 0)
		b.rotation.y = ang4
		add_child(b)
		_box(Vector3(bw + 0.2, 0.3, bw + 0.2), bc + Vector3(0, 0.15, 0), _mat(concrete.darkened(0.1), 0.9), null, ang4)
		var bas := Basis(Vector3.UP, ang4)
		# 給水塔（脚付きの円筒と円錐の屋根）
		var tp := bc + bas * Vector3(bw * 0.25, 0, bw * 0.2)
		for lx: float in [-0.7, 0.7]:
			for lz: float in [-0.7, 0.7]:
				_box(Vector3(0.12, 2.0, 0.12), tp + Vector3(lx, 1.2, lz), _mat(Color(0.2, 0.18, 0.16), 0.7))
		_cyl(1.2, 1.2, 2.2, tp + Vector3(0, 3.3, 0), _mat(Color(0.42, 0.3, 0.22), 0.85), null, 14)
		_cyl(0.0, 1.3, 0.8, tp + Vector3(0, 4.8, 0), _mat(Color(0.25, 0.2, 0.18), 0.8), null, 14)
		# 屋上のアンテナと障害灯
		var mp := bc + bas * Vector3(-bw * 0.3, 0, -bw * 0.3)
		_cyl(0.05, 0.08, 6.0, mp + Vector3(0, 3.0, 0), _mat(Color(0.45, 0.45, 0.48), 0.4, 0.7))
		_blinker(mp + Vector3(0, 6.1, 0), 0.16, k4 * 0.37)
		# ネオン看板（リング側の面）
		if k4 % 2 == 0:
			var neon_c: Color = [Color(1.0, 0.2, 0.6), Color(0.2, 0.85, 1.0), Color(1.0, 0.65, 0.15)][(k4 / 2) % 3]
			var face := bc - Vector3(sin(ang4), 0, cos(ang4)) * (bw * 0.5 + 0.15)
			_box(Vector3(5.2, 2.4, 0.2), face + Vector3(0, -2.5, 0), _mat(Color(0.05, 0.05, 0.06), 0.6), null, ang4)
			var sign := _box(Vector3(4.6, 1.8, 0.05), face + Vector3(0, -2.5, 0) - Vector3(sin(ang4), 0, cos(ang4)) * 0.12, _mat(neon_c), null, ang4)
			(sign.material_override as StandardMaterial3D).emission_enabled = true
			(sign.material_override as StandardMaterial3D).emission = neon_c * 2.2
			_neons.append([sign.material_override, neon_c * 2.2, k4 * 1.7])
			var nl := _omni()
			nl.position = face + Vector3(0, -2.5, 0) - Vector3(sin(ang4), 0, cos(ang4)) * 1.5
			nl.light_color = neon_c
			nl.light_energy = 1.5
			nl.omni_range = 9.0
			add_child(nl)
	# 夜空を掃くサーチライト（遠くのビルの屋上から）
	for k5: int in range(3):
		var a5 := k5 * TAU / 3.0 + 0.9
		var sp := Vector3(sin(a5) * 46.0, -8.0, cos(a5) * 46.0)
		var pv := _cone(sp, sp + Vector3(-sin(a5) * 0.25, 1.0, -cos(a5) * 0.25), 85.0, 5.0, Color(0.75, 0.85, 1.0), 0.17)
		_sweeps.append([pv, pv.rotation, k5 * 2.1, 0.2])


## 点滅する赤い航空障害灯
func _blinker(p: Vector3, size: float, phase: float) -> void:
	var m := _mat(Color(1.0, 0.1, 0.05))
	m.emission_enabled = true
	m.emission = Color(1.0, 0.08, 0.04) * 1.8
	var b := _box(Vector3(size, size, size), p, m)
	var _b := b
	_blinkers.append([m, phase])


## 川下りの筏: 丸太を並べた筏（縄の結束・舵・灯籠）、両岸（斜面・岩・葦・三段の葉の木）、小屋と桟橋、遠くの山
func _raft(r: RandomNumberGenerator, dens: float) -> void:
	var log_c := Color(0.42, 0.3, 0.18)
	# 丸太（甲板の下。z 方向の両端が少し出る）
	var logs: Array[Transform3D] = []
	var lr := 0.31
	var n := 15
	for k: int in range(n):
		var x := -4.5 + lr + k * (9.0 - lr * 2.0) / (n - 1)
		var ln := 9.6 + r.randf_range(-0.15, 0.25)
		logs.append(Transform3D(Basis(Vector3.RIGHT, PI * 0.5) * Basis.from_scale(Vector3(1, ln, 1)), Vector3(x, -0.42, r.randf_range(-0.08, 0.08))))
	var lm := CylinderMesh.new()
	lm.top_radius = lr
	lm.bottom_radius = lr
	lm.height = 1.0
	lm.radial_segments = 10
	_multimesh(lm, logs, _mat(log_c, 0.9))
	# 縄の結束（両側の丸太の上を横切る）
	for z: float in [-4.15, 4.15]:
		for sgn: float in [-1.0, 1.0]:
			_box(Vector3(0.1, 0.62, 0.12), Vector3(sgn * 4.55, -0.35, z), _mat(Color(0.72, 0.6, 0.38), 0.95))
	# 舵（後ろの長い櫂）と灯籠の竿
	var oar := _cyl(0.05, 0.05, 6.0, Vector3(0.6, -0.1, -6.6), _mat(Color(0.55, 0.42, 0.28), 0.85))
	oar.rotation = Vector3(-1.2, 0, 0)
	_box(Vector3(0.45, 0.04, 1.4), Vector3(0.6, -0.95, -9.2), _mat(Color(0.5, 0.38, 0.25), 0.85)).rotation.x = 0.35
	var pole_p := Vector3(-4.2, 0.0, 4.9)
	_cyl(0.05, 0.06, 2.6, pole_p + Vector3(0, 1.0, 0), _mat(Color(0.38, 0.28, 0.18), 0.85))
	var lantern := _box(Vector3(0.28, 0.36, 0.28), pole_p + Vector3(0, 2.1, 0), _mat(Color(1.0, 0.85, 0.55)))
	(lantern.material_override as StandardMaterial3D).emission_enabled = true
	(lantern.material_override as StandardMaterial3D).emission = Color(1.0, 0.7, 0.35) * 1.2
	# 両岸の景色は同じものを 3 つ並べて後ろへ流し、筏が川を下っているように見せる
	_scroll_speed = 1.7
	_tri_world = false
	for ci: int in range(3):
		var bank := Node3D.new()
		bank.position.z = (ci - 1) * SCROLL_SPAN
		add_child(bank)
		_scrollers.append(bank)
		_raft_bank(bank, _rng("raft_bank".hash()), dens)
	_tri_world = true
	_flock(Vector3(0, 28, 0), 45.0, 7, 0.12)
	# 遠くの山
	_mountains(r, Color(0.42, 0.55, 0.6), 10)


## 炎（揺れる板）と揺らぐ明かり。size は炎の高さの目安
func _flame(pos: Vector3, size: float, energy: float, light_range: float, parent: Node3D = null) -> void:
	var q := QuadMesh.new()
	q.size = Vector2(size * 0.95, size * 1.7)
	var mi := MeshInstance3D.new()
	mi.mesh = q
	var fm := ShaderMaterial.new()
	fm.shader = load("res://shaders/flame.gdshader")
	fm.set_shader_parameter("seed", pos.x * 3.1 + pos.z * 1.7)
	mi.material_override = fm
	mi.position = pos + Vector3(0, size * 0.8, 0)
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	(parent if parent != null else self).add_child(mi)
	var l := _omni()
	l.position = pos + Vector3(0, size * 0.7, 0)
	l.light_color = Color(1.0, 0.56, 0.24)
	l.light_energy = energy
	l.omni_range = light_range
	(parent if parent != null else self).add_child(l)
	_flames.append([l, energy, pos.x * 1.3 + pos.z * 0.7])
	_embers(pos + Vector3(0, size * 0.9, 0), parent)


## 火の粉（上へ舞い上がる小さな光の粒）
func _embers(pos: Vector3, parent: Node3D = null) -> void:
	if _quality <= 0:
		return
	var p := CPUParticles3D.new()
	p.amount = 10
	p.lifetime = 1.9
	p.preprocess = 1.9
	p.emission_shape = CPUParticles3D.EMISSION_SHAPE_SPHERE
	p.emission_sphere_radius = 0.14
	p.direction = Vector3.UP
	p.spread = 24.0
	p.gravity = Vector3(0.2, 0.55, 0.05)
	p.initial_velocity_min = 0.5
	p.initial_velocity_max = 1.4
	p.scale_amount_min = 0.5
	p.scale_amount_max = 1.3
	var g := Gradient.new()
	g.set_color(0, Color(1.0, 0.85, 0.45, 1.0))
	g.set_color(1, Color(1.0, 0.2, 0.05, 0.0))
	p.color_ramp = g
	p.mesh = _spark_quad(0.034)
	p.position = pos
	(parent if parent != null else self).add_child(p)


func _spark_quad(size: float) -> QuadMesh:
	var q := QuadMesh.new()
	q.size = Vector2(size, size)
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	m.vertex_color_use_as_albedo = true
	m.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	q.material = m
	return q


## 空中を漂う細かな光の粒（木漏れ日の中の塵・花粉）
func _motes(color: Color, amount: int) -> void:
	if _quality <= 0:
		return
	var p := CPUParticles3D.new()
	p.amount = amount
	p.lifetime = 7.0
	p.preprocess = 7.0
	p.emission_shape = CPUParticles3D.EMISSION_SHAPE_BOX
	p.emission_box_extents = Vector3(10, 2.2, 10)
	p.position = Vector3(0, 2.6, 0)
	p.direction = Vector3(1, 0.2, 0.3)
	p.spread = 180.0
	p.gravity = Vector3(0.02, 0.01, 0.0)
	p.initial_velocity_min = 0.03
	p.initial_velocity_max = 0.14
	var g := Gradient.new()
	g.set_color(0, Color(color.r, color.g, color.b, 0.0))
	g.add_point(0.3, Color(color.r, color.g, color.b, color.a))
	g.add_point(0.7, Color(color.r, color.g, color.b, color.a))
	g.set_color(g.get_point_count() - 1, Color(color.r, color.g, color.b, 0.0))
	p.color_ramp = g
	p.mesh = _spark_quad(0.03)
	add_child(p)


## 光の円錐（照明の光が見える表現）。pos から target へ向かって length だけ伸びる。戻り値は向きを持つ親ノード
func _cone(pos: Vector3, target: Vector3, length: float, radius: float, color: Color, strength: float, parent: Node3D = null) -> Node3D:
	var pivot := Node3D.new()
	var dir := (target - pos).normalized()
	var up := Vector3.UP if absf(dir.y) < 0.98 else Vector3.FORWARD
	pivot.transform = Transform3D(Basis.looking_at(dir, up), pos)
	(parent if parent != null else self).add_child(pivot)
	if _quality <= 0:
		return pivot
	var cm := CylinderMesh.new()
	cm.top_radius = 0.04
	cm.bottom_radius = 1.0
	cm.height = 1.0
	cm.radial_segments = 20
	cm.rings = 1
	cm.cap_top = false
	cm.cap_bottom = false
	var mi := MeshInstance3D.new()
	mi.mesh = cm
	var sm := ShaderMaterial.new()
	sm.shader = load("res://shaders/light_cone.gdshader")
	sm.set_shader_parameter("color", color)
	sm.set_shader_parameter("strength", strength)
	mi.material_override = sm
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	# メッシュの +Y（細い側）を親の +Z（光源側）へ向け、先を -Z（照らす側）へ伸ばす
	mi.rotation_degrees = Vector3(90, 0, 0)
	mi.scale = Vector3(radius, length, radius)
	mi.position = Vector3(0, 0, -length * 0.5)
	pivot.add_child(mi)
	return pivot


## 風になびく旗。hang = true は上辺を固定した垂れ幕、false は左辺を竿に固定した旗（pos は固定された辺の中央）
func _banner(pos: Vector3, w: float, h: float, col: Color, stripe: Color, yaw: float, hang: bool, parent: Node3D = null, wind: float = 1.0) -> void:
	var pm := PlaneMesh.new()
	pm.orientation = PlaneMesh.FACE_Z
	pm.size = Vector2(w, h)
	pm.subdivide_width = 1 if hang else 10
	pm.subdivide_depth = 10 if hang else 1
	var mi := MeshInstance3D.new()
	mi.mesh = pm
	var sm := ShaderMaterial.new()
	sm.shader = load("res://shaders/banner.gdshader")
	sm.set_shader_parameter("color", col)
	sm.set_shader_parameter("stripe", stripe)
	sm.set_shader_parameter("phase", pos.x * 0.9 + pos.z * 1.3)
	sm.set_shader_parameter("hang", 1.0 if hang else 0.0)
	sm.set_shader_parameter("wind", wind)
	mi.material_override = sm
	mi.rotation.y = yaw
	var off := Vector3(0, -h * 0.5, 0) if hang else Basis(Vector3.UP, yaw) * Vector3(w * 0.5, 0, 0)
	mi.position = pos + off
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	(parent if parent != null else self).add_child(mi)


## 木漏れ日・夕日の光の筋（光の向きに沿った板を十字に 2 枚）
func _shaft(center: Vector3, length: float, width: float, color: Color, strength: float) -> void:
	if _quality <= 0:
		return
	var dir := rim_dir.normalized()   # 光の進む向き
	var x := dir.cross(Vector3.UP)
	if x.length() < 0.05:
		x = Vector3.RIGHT
	x = x.normalized()
	var node := Node3D.new()
	node.transform = Transform3D(Basis(x, -dir, x.cross(-dir)), center)
	add_child(node)
	for k: int in range(2):
		var q := QuadMesh.new()
		q.size = Vector2(width, length)
		var mi := MeshInstance3D.new()
		mi.mesh = q
		var sm := ShaderMaterial.new()
		sm.shader = load("res://shaders/light_shaft.gdshader")
		sm.set_shader_parameter("color", color)
		sm.set_shader_parameter("strength", strength)
		sm.set_shader_parameter("seed", center.x * 2.3 + center.z * 1.1 + k * 5.0)
		mi.material_override = sm
		mi.rotation.y = k * PI * 0.5
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		node.add_child(mi)


## 遠くを旋回する鳥の群れ（V 字の編隊）
func _flock(center: Vector3, radius: float, n: int, speed: float, col: Color = Color(0.05, 0.05, 0.06)) -> void:
	if _quality <= 0:
		return
	var pm := PlaneMesh.new()
	pm.size = Vector2(1.3, 0.28)
	pm.subdivide_width = 1
	var xf: Array[Transform3D] = []
	for k: int in range(n):
		var side := float((k + 1) / 2) * (1.0 if k % 2 == 0 else -1.0)
		xf.append(Transform3D(Basis(), Vector3(side * 1.6, absf(side) * 0.15, absf(side) * 1.4)))
	var sm := ShaderMaterial.new()
	sm.shader = load("res://shaders/birds.gdshader")
	sm.set_shader_parameter("color", col)
	var mmi := _multimesh(pm, xf, sm)
	_flocks.append([mmi, center, radius, speed, randf() * TAU])


## 川岸の 1 区画（長さ SCROLL_SPAN）: 土手・斜面・岩・葦・木・小屋と桟橋
func _raft_bank(bank: Node3D, r: RandomNumberGenerator, dens: float) -> void:
	var half := SCROLL_SPAN * 0.5
	var bank_c := Color(0.3, 0.42, 0.22)
	for sgn2: float in [-1.0, 1.0]:
		_box(Vector3(40, 2.0, SCROLL_SPAN + 0.3), Vector3(sgn2 * 38, -0.6, 0), _mat(bank_c, 0.95), bank)
		var slope := _box(Vector3(6.0, 0.5, SCROLL_SPAN + 0.3), Vector3(sgn2 * 16.4, -0.55, 0), _mat(Color(0.42, 0.38, 0.28), 0.95), bank)
		slope.rotation.z = sgn2 * 0.18
	var rocks: Array[Transform3D] = []
	for k2: int in range(int(50 * dens) + 8):
		var side := -1.0 if k2 % 2 == 0 else 1.0
		rocks.append(Transform3D(Basis(Vector3(r.randf(), r.randf(), r.randf()).normalized(), r.randf() * 3.0) * Basis.from_scale(Vector3(r.randf_range(0.5, 1.6), r.randf_range(0.4, 1.0), r.randf_range(0.5, 1.6))),
			Vector3(side * r.randf_range(13.0, 16.5), -0.75, r.randf_range(-half, half))))
	var rock := SphereMesh.new()
	rock.radial_segments = 6
	rock.rings = 3
	_multimesh(rock, rocks, _mat(Color(0.4, 0.4, 0.38), 0.95), [], bank)
	var reeds: Array[Transform3D] = []
	for k3: int in range(int(200 * dens) + 30):
		var side3 := -1.0 if k3 % 2 == 0 else 1.0
		var hh := r.randf_range(0.8, 1.8)
		reeds.append(Transform3D(Basis(Vector3(r.randf_range(-1, 1), 0, r.randf_range(-1, 1)).normalized(), r.randf_range(0.0, 0.25)) * Basis.from_scale(Vector3(1, hh, 1)),
			Vector3(side3 * r.randf_range(12.5, 15.5), -0.7 + hh * 0.5, r.randf_range(-half, half))))
	var rm := CylinderMesh.new()
	rm.top_radius = 0.0
	rm.bottom_radius = 0.035
	rm.height = 1.0
	rm.radial_segments = 4
	_multimesh(rm, reeds, _mat(Color(0.55, 0.6, 0.3), 0.9), [], bank)
	var trunk: Array[Transform3D] = []
	var leaf: Array[Transform3D] = []
	var leaf_c: Array[Color] = []
	for k4: int in range(int(105 * dens) + 15):
		var side4 := -1.0 if k4 % 2 == 0 else 1.0
		var base := Vector3(side4 * r.randf_range(19, 46), 0.4, r.randf_range(-half, half))
		var hgt := r.randf_range(6.0, 12.0)
		trunk.append(Transform3D(Basis().scaled(Vector3(1, hgt * 0.35, 1)), base + Vector3(0, hgt * 0.175, 0)))
		var tint := Color.from_hsv(r.randf_range(0.26, 0.36), r.randf_range(0.5, 0.7), r.randf_range(0.26, 0.42))
		for t: int in range(3):
			var sc := (1.0 - t * 0.26) * hgt * 0.26
			leaf.append(Transform3D(Basis(Vector3.UP, r.randf() * TAU) * Basis.from_scale(Vector3(sc, sc * 1.25, sc)), base + Vector3(0, hgt * (0.32 + t * 0.2), 0)))
			leaf_c.append(tint.lightened(t * 0.06))
	var tm := CylinderMesh.new()
	tm.top_radius = 0.12
	tm.bottom_radius = 0.2
	tm.height = 1.0
	tm.radial_segments = 6
	_multimesh(tm, trunk, _mat(Color(0.3, 0.22, 0.15), 0.9), [], bank)
	var cone := CylinderMesh.new()
	cone.top_radius = 0.0
	cone.bottom_radius = 1.0
	cone.height = 1.0
	cone.radial_segments = 8
	var leaf_mat := _mat(Color.WHITE, 0.9)
	leaf_mat.vertex_color_use_as_albedo = true
	leaf_mat.vertex_color_is_srgb = true
	_multimesh(cone, leaf, leaf_mat, leaf_c, bank)
	# 小屋と桟橋（左岸）
	var hp := Vector3(-21, 0.4, -14)
	_box(Vector3(4.0, 2.6, 3.4), hp + Vector3(0, 1.3, 0), _mat(Color(0.5, 0.36, 0.22), 0.9), bank)
	_gable(bank, hp + Vector3(0, 2.6, 0), 4.6, 4.2, 1.5, Color(0.3, 0.24, 0.16), 0.0)
	_box(Vector3(9.0, 0.15, 1.6), Vector3(-15.0, -0.35, -14), _mat(Color(0.45, 0.33, 0.22), 0.9), bank)
	for px: float in [-18.5, -15.5, -12.5, -10.8]:
		for pz: float in [-14.7, -13.3]:
			_cyl(0.09, 0.09, 1.4, Vector3(px, -0.9, pz), _mat(Color(0.32, 0.24, 0.16), 0.9), bank)


## 小道具の点光源。低画質では作らない（呼び出し側は null を受け取っても add_child しない）
func _omni() -> OmniLight3D:
	var l := OmniLight3D.new()
	if _quality <= 0:
		l.visible = false
	l.shadow_enabled = false
	return l


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
	if _dome != null:
		_dome.global_position = cam_pos
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
	_t += delta
	# 炎の明かりの揺らぎ（ゆっくりした明るさの変化なので光過敏の設定でもそのまま）
	for fl: Array in _flames:
		var ph := float(fl[2])
		var k := 0.82 + 0.13 * sin(_t * 7.3 + ph) + 0.09 * sin(_t * 12.7 + ph * 1.7) + 0.05 * sin(_t * 23.1 + ph * 0.6)
		(fl[0] as OmniLight3D).light_energy = float(fl[1]) * k
	# ネオンのちらつき（光過敏の設定では止める）
	if not photosensitive:
		for ne: Array in _neons:
			var np := float(ne[2])
			var on := 1.0 if fmod(_t * 0.7 + np, 5.0) > 0.25 or sin(_t * 40.0 + np) > 0.0 else 0.25
			(ne[0] as StandardMaterial3D).emission = (ne[1] as Color) * on
	for sw: Array in _sweeps:
		var node: Node3D = sw[0]
		var base: Vector3 = sw[1]
		node.rotation = base + Vector3(sin(_t * 0.23 + float(sw[2])) * float(sw[3]), sin(_t * 0.17 + float(sw[2]) * 1.9) * float(sw[3]) * 1.4, 0)
	if not _scrollers.is_empty():
		_scroll_z = wrapf(_scroll_z + delta * _scroll_speed, -SCROLL_SPAN * 0.5, SCROLL_SPAN * 0.5)
		for i: int in range(_scrollers.size()):
			_scrollers[i].position.z = _scroll_z + (i - 1) * SCROLL_SPAN
	for fk: Array in _flocks:
		var ang := float(fk[4]) + delta * float(fk[3])
		fk[4] = ang
		var c: Vector3 = fk[1]
		var bird: Node3D = fk[0]
		bird.position = c + Vector3(cos(ang), 0, sin(ang)) * float(fk[2])
		bird.rotation.y = -ang + (PI if float(fk[3]) > 0.0 else 0.0)
	if _lighthouse_beam != null:
		_lighthouse_beam.rotate_y(delta * 0.9)
	if not _blinkers.is_empty():
		# 航空障害灯: 1.5 秒周期でゆっくり明滅する（点滅ではなく明るさの変化なので光過敏の設定でもそのまま）
		_blink_t += delta
		for bl: Array in _blinkers:
			var ph := fmod(_blink_t / 1.5 + float(bl[1]), 1.0)
			var on := clampf(1.0 - absf(ph - 0.25) * 4.0, 0.08, 1.0)
			(bl[0] as StandardMaterial3D).emission = Color(1.0, 0.08, 0.04) * 1.8 * on
	if theme.get("storm", false):
		_flash_t -= delta
		if _flash_t <= 0.0:
			_flash_t = randf_range(12.0, 25.0)
			_flash = 1.0
		if _flash > 0.0:
			_flash = maxf(0.0, _flash - delta * (0.8 if photosensitive else 3.5))
			var amt := _flash * (0.35 if photosensitive else 1.0)
			env.environment.ambient_light_energy = float(theme["amb_e"]) + amt * 1.5
			if _dome_mat != null:
				_dome_mat.set_shader_parameter("flash", amt)
	if crowd_mat != null:
		var exv: Variant = crowd_mat.get_shader_parameter("excite")
		var ex := float(exv) if exv != null else 0.0
		if ex > 0.0:
			crowd_mat.set_shader_parameter("excite", maxf(0.0, ex - delta * 0.4))
