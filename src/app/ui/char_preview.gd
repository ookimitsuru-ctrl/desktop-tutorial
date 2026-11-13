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
var cam_dist := 3.8
## カメラの高さと注視点の高さ（身長に対する割合）
var cam_h := 0.64
var look_h := 0.60
var mirror := false
## 選択・紹介の画面では、姿勢（構えで上体がひねられていても）に関わらず胸を正面（カメラ）へ向ける
var face_front := true
var _front_ready := false
## 0 以外なら体ごと回し続ける（度/秒）。正面から回り始める（キャラ選択のターンテーブル表示）
var spin_speed := 0.0
## メニュー用の立ち姿（anim = "rest"）。キャラごとに作って使い回す
var _rest: AnimClip = null
var _rest_id := ""
## 機体の大きさに合わせてカメラを引く倍率（背の高さと体格）
var _fit_k := 1.0
var _blink_wait := randf_range(0.8, 3.0)
var _blink_t := -1.0


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
	var build := String((DataDB.char_json(id).get("model", {}) as Dictionary).get("build", ""))
	_fit_k = lib.rig.height / 1.78 * (1.18 if build == "heavy" else 1.0)
	model = CharacterModel.new()
	vp.add_child(model)
	model.build(id, p_costume, DataDB.char_json(id), p_color, lib.rig)
	# モデルの正面は -Z。カメラは +Z 側にあるので 180° 回して正面を向け、yaw だけ斜めにする（左右で向きを鏡写し）
	model.rotation_degrees = Vector3(0, (180.0 - yaw) if mirror else (180.0 + yaw), 0)
	_front_ready = false


func _process(delta: float) -> void:
	if model == null:
		return
	t += delta
	var c: AnimClip = lib.clip(anim)
	if anim == "rest" or anim == "stand":
		if _rest == null or _rest_id != char_id + anim:
			_rest = lib.templates.rest_clip() if anim == "rest" else lib.templates.stand_clip()
			_rest_id = char_id + anim
		c = _rest
	if c == null:
		c = lib.clip("idle")
	var f := t * 60.0
	if not c.loop:
		f = minf(f, float(c.length))
	pe.evaluate(c.sample(f))
	model.apply_pose(pe)
	if spin_speed != 0.0:
		if _front_ready:
			model.rotation.y += deg_to_rad(spin_speed) * delta
		else:
			var fw0 := pe.global[Rig.B.CHEST].basis * Vector3(0, 0, -1)
			model.rotation.y = -atan2(fw0.x, fw0.z)
			_front_ready = true
	elif face_front:
		# 胸の向き（モデル空間の -Z が正面）がカメラ（+Z）を向くように体ごと回す
		var fw := pe.global[Rig.B.CHEST].basis * Vector3(0, 0, -1)
		var target := -atan2(fw.x, fw.z)
		if _front_ready:
			model.rotation.y = lerp_angle(model.rotation.y, target, minf(1.0, delta * 8.0))
		else:
			model.rotation.y = target
			_front_ready = true
	# ときどき瞬きする
	var blink := 0.0
	if _blink_t >= 0.0:
		_blink_t += delta
		blink = clampf(1.0 - absf(_blink_t - 0.06) / 0.06, 0.0, 1.0)
		if _blink_t > 0.13:
			_blink_t = -1.0
	else:
		_blink_wait -= delta
		if _blink_wait <= 0.0:
			_blink_t = 0.0
			_blink_wait = randf_range(2.0, 5.0)
	model.set_face(blink, 0.0)
	var h := lib.rig.height
	# 勝利のガッツポーズで頭上に突き上げた拳まで入るよう、少し引いて高めを見る
	cam.position = Vector3(0, h * cam_h, cam_dist * _fit_k)
	cam.look_at(Vector3(0, h * look_h, 0))


func play(a: String) -> void:
	anim = a
	t = 0.0
