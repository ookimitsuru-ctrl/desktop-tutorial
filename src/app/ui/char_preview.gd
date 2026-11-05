class_name CharPreview
extends SubViewportContainer
## メニュー用のキャラクター3D表示（独立したワールド・待機アニメ）

var vp: SubViewport
var model: CharacterModel
var lib: AnimLibrary
var pe: PoseEval
var cam: Camera3D
var t := 0.0
var anim := "idle"
var char_id := ""
var costume := "a"
var color := 0
var yaw := -25.0
var cam_dist := 3.3
var mirror := false


func _init() -> void:
	stretch = true
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	vp = SubViewport.new()
	vp.own_world_3d = true
	vp.transparent_bg = true
	vp.msaa_3d = Viewport.MSAA_2X
	add_child(vp)
	var env := WorldEnvironment.new()
	var e := Environment.new()
	e.background_mode = Environment.BG_CLEAR_COLOR
	e.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	e.ambient_light_color = Color(0.42, 0.45, 0.55)
	e.ambient_light_energy = 0.8
	e.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.environment = e
	vp.add_child(env)
	var key := DirectionalLight3D.new()
	key.rotation_degrees = Vector3(-35, -30, 0)
	key.light_energy = 1.5
	vp.add_child(key)
	var rim := DirectionalLight3D.new()
	rim.rotation_degrees = Vector3(-10, 160, 0)
	rim.light_energy = 0.8
	rim.light_color = Color(0.75, 0.8, 1.0)
	vp.add_child(rim)
	cam = Camera3D.new()
	cam.fov = 28
	vp.add_child(cam)


func show_char(id: String, p_costume: String = "a", p_color: int = 0) -> void:
	if id == char_id and p_costume == costume and p_color == color and model != null:
		return
	if model != null and id == char_id and p_costume == costume:
		model.set_colors(DataDB.char_json(id), p_color)
		color = p_color
		return
	char_id = id
	costume = p_costume
	color = p_color
	if model != null:
		model.queue_free()
	lib = DataDB.anim_lib(id)
	pe = PoseEval.new(lib.rig)
	model = CharacterModel.new()
	vp.add_child(model)
	model.build(id, p_costume, DataDB.char_json(id), p_color, lib.rig)
	# モデルの正面は -Z。カメラは +Z 側にあるので 180° 回して正面を向け、yaw だけ斜めにする（左右で向きを鏡写し）
	model.rotation_degrees = Vector3(0, (180.0 - yaw) if mirror else (180.0 + yaw), 0)


func _process(delta: float) -> void:
	if model == null:
		return
	t += delta
	var c: AnimClip = lib.clip(anim)
	if c == null:
		c = lib.clip("idle")
	var f := t * 60.0
	if not c.loop:
		f = minf(f, float(c.length))
	pe.evaluate(c.sample(f))
	model.apply_pose(pe)
	var h := lib.rig.height
	cam.position = Vector3(0, h * 0.58, cam_dist)
	cam.look_at(Vector3(0, h * 0.55, 0))


func play(a: String) -> void:
	anim = a
	t = 0.0
