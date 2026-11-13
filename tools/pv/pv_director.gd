extends Node
## PV（宣伝映像）の撮影監督。ショットの一覧（JSON）を順に撮り、各ショットの開始フレームをログに書く。
## Movie Maker で実行する（1 描画フレーム = 映像の 1 フレーム）:
##   xvfb-run -a godot --path . --rendering-driver vulkan --write-movie raw.avi --fixed-fps 30 res://tools/pv/pv_director.tscn
## 環境変数 PV_SHOTS（ショット一覧の JSON）、PV_LOG（ログの出力先）、PV_ONLY（"名前,名前" で一部だけ撮る）
##
## ショットの種類:
##  match    CPU 同士の試合。find で指定した出来事（打撃・浮かせ・投げ・壁・リングアウト・KO）を、同じ条件の
##           シミュレーションを先に回して探し（AI の乱数は試合のシードから決まるので再現する）、その少し前まで早送りして撮る。
##           speed で 1 フレームあたりの Tick 数を変え、スローモーションを作る（2 = 等速、1 = 1/2）。
##  showcase 機体 1 機をスタジオで撮る（低い位置からのカメラ、寄り・回り込み）
##  lineup   全機を並べて撮る

const PRE := 4  # 各ショットの頭の待ち（止めた状態）。編集ではこの後から使う

var shots: Array = []
var only: Array = []
var si := -1
var sh: Dictionary = {}
var f := 0           # ショット内のフレーム（PRE を含む）
var log_rows: Array = []
var stage_node: Node = null
var match_node: Node = null
var actors: Array = []   # showcase / lineup: [model, pe, clip, t0, facing]
var cam: Camera3D = null
var studio_key: DirectionalLight3D = null


func _ready() -> void:
	get_tree().root.theme = UITheme.build_theme()
	Settings.data["intros"] = "skip"
	Settings.data["quality"] = "ultra"
	Settings.data["render_scale"] = 100
	Settings.data["assist_escape"] = false
	Settings.data["replay_autosave"] = false
	Settings.data["camera_shake"] = 100
	Settings.data["photosensitive"] = false
	Settings.data["comic_words"] = false  # 擬音は編集で付ける
	var raw := FileAccess.get_file_as_string(OS.get_environment("PV_SHOTS"))
	shots = JSON.parse_string(raw)
	only = Array(OS.get_environment("PV_ONLY").split(",", false))
	_mute_music()
	if OS.get_environment("PV_DRY") == "1":
		# 撮らずに、試合のショットの出来事が見つかるかだけ確かめる
		for s2: Dictionary in shots:
			if String(s2["type"]) == "match" and s2.has("find") and (only.is_empty() or only.has(String(s2["name"]))):
				sh = s2
				Game.setup_match_defaults()
				Game.rounds_to_win = int(sh.get("rounds", 2))
				Game.round_seconds = int(sh.get("seconds", 99))
				Game.ringout = true
				var r := _find(sh["find"], sh["c"], String(sh["stage"]), int(sh.get("cpu", 8)))
				print("pv: dry %s -> %s" % [sh["name"], JSON.stringify(r)])
		get_tree().quit(0)
		set_process(false)


func _mute_music() -> void:
	# BGM と環境音は編集で付け直すので録らない（効果音・声・アナウンスは録る）
	for b: String in ["BGM", "Ambience"]:
		var i := AudioServer.get_bus_index(b)
		if i >= 0:
			AudioServer.set_bus_mute(i, true)


func _process(_delta: float) -> void:
	if sh.is_empty() or f >= PRE + int(sh["len"]) + 2:
		_next()
		if sh.is_empty():
			return
	var j := f - PRE   # 本編のフレーム（負なら待ち）
	match String(sh["type"]):
		"match":
			_update_match(j)
		"showcase", "lineup":
			_update_actors(j)
	f += 1
	_mute_music()


func _clear() -> void:
	for n: Node in [stage_node, match_node]:
		if n != null and is_instance_valid(n):
			n.free()
	stage_node = null
	match_node = null
	actors.clear()
	cam = null
	if SceneRouter.current != null and is_instance_valid(SceneRouter.current):
		SceneRouter.current.free()
		SceneRouter.current = null
	# 前のショットの音が次へ漏れないように止める
	AudioHub.release_all()


func _next() -> void:
	_clear()
	while true:
		si += 1
		if si >= shots.size():
			_finish()
			sh = {}
			return
		sh = shots[si]
		if only.is_empty() or only.has(String(sh["name"])):
			break
	f = 0
	var info := {}
	match String(sh["type"]):
		"match":
			info = _setup_match()
		"showcase":
			_setup_studio()
			_add_actor(String(sh["c"]), String(sh.get("costume", "a")), int(sh.get("color", 0)), String(sh.get("anim", "rest")),
				Vector3.ZERO, float(sh.get("t0", 0.0)))
		"lineup":
			_setup_studio()
			for row: Array in sh["robots"]:
				_add_actor(String(row[0]), "a", int(row[1]), "rest", Vector3(float(row[2]), 0, float(row[3])), float(row[4]) if row.size() > 4 else 0.0)
	var row := {"name": sh["name"], "start": Engine.get_frames_drawn(), "pre": PRE, "len": int(sh["len"])}
	row.merge(info)
	log_rows.append(row)
	print("pv: shot %s start=%d %s" % [sh["name"], row["start"], JSON.stringify(info)])


func _finish() -> void:
	var fa := FileAccess.open(OS.get_environment("PV_LOG"), FileAccess.WRITE)
	fa.store_string(JSON.stringify(log_rows, "  "))
	fa.close()
	print("pv: %d shot(s) done" % log_rows.size())
	get_tree().quit(0)


# ------------------------------------------------------------------ 試合

func _ticks_at(j: int) -> int:
	if j < 0:
		return 0
	var t := 2
	for seg: Array in sh.get("speed", [[0, 2]]):
		if j >= int(seg[0]):
			t = int(seg[1])
	return t


func _match_ok(e: Dictionary, spec: Dictionary) -> bool:
	if String(e.get("kind", "")) != String(spec["kind"]):
		return false
	for k: String in spec.get("eq", {}):
		if e.get(k) != spec["eq"][k]:
			return false
	for k2: String in spec.get("min", {}):
		if float(e.get(k2, 0)) < float(spec["min"][k2]):
			return false
	for k3: String in spec.get("flags", []):
		if not bool(e.get(k3, false)):
			return false
	return true


func _opts() -> Dictionary:
	return {"ringout": Game.ringout, "rounds_to_win": Game.rounds_to_win, "round_seconds": Game.round_seconds}


## 同じ条件のシミュレーションで出来事を探す。戻り値: {seed, tick}（tick は出来事が起きる step の通し番号、1 始まり）
func _find(spec: Dictionary, c: Array, stage: String, lv: int) -> Dictionary:
	var seeds: Array = sh.get("seeds", range(1, 41))
	for sd: Variant in seeds:
		var w := SimFactory.world(String(c[0]), String(c[1]), stage, int(sd), _opts())
		w.assist_easy_escape = [false, false]
		var a0 := AIController.new()
		a0.setup(w, 0, lv, false)
		var a1 := AIController.new()
		a1.setup(w, 1, lv, false)
		var cand := -1
		var then_spec: Dictionary = spec.get("then", {})
		for t: int in range(1, int(spec.get("max", 60 * 70)) + 1):
			var i0 := a0.next_input(w)
			var i1 := a1.next_input(w)
			w.step(i0, i1)
			for e: Dictionary in w.events:
				if cand < 0:
					if t >= int(spec.get("after", 120)) and _match_ok(e, spec):
						if then_spec.is_empty():
							return {"seed": int(sd), "tick": t}
						cand = t
				elif _match_ok(e, then_spec):
					return {"seed": int(sd), "tick": cand}
			if cand >= 0 and t - cand > int(then_spec.get("within", 90)):
				cand = -1
			if w.phase == SE.PH_MATCH_END:
				break
	push_error("pv: event not found for shot " + String(sh["name"]))
	return {"seed": 1, "tick": 300}


func _setup_match() -> Dictionary:
	var c: Array = sh["c"]
	var lv := int(sh.get("cpu", 8))
	Game.mode = Game.Mode.WATCH
	Game.p_char = [String(c[0]), String(c[1])]
	var cos: Array = sh.get("costume", ["a", "a"])
	Game.p_costume = [String(cos[0]), String(cos[1])]
	var col: Array = sh.get("color", [0, 1])
	Game.p_color = [int(col[0]), int(col[1])]
	Game.p_cpu = [lv, lv]
	Game.stage = String(sh["stage"])
	Game.setup_match_defaults()
	Game.rounds_to_win = int(sh.get("rounds", 2))
	Game.round_seconds = int(sh.get("seconds", 99))
	Game.ringout = true
	var at := int(sh.get("at", 0))
	var found := {}
	if sh.has("find"):
		found = _find(sh["find"], c, Game.stage, lv)
		Game.seed_value = int(found["seed"])
		var before := 0
		for j: int in range(int(sh.get("event_at", 30))):
			before += _ticks_at(j)
		at = maxi(0, int(found["tick"]) - 1 - before)
	else:
		Game.seed_value = int(sh.get("seed", 1))
	var script: GDScript = load("res://src/app/ui/screens/match.gd")
	match_node = script.new()
	match_node.call("setup", {"mode": Game.Mode.WATCH})
	add_child(match_node)
	# 早送り（描画せず、出来事の処理も飛ばす）
	var w: SimWorld = match_node.get("world")
	for _k: int in range(at):
		var i0: int = match_node.call("_input_for", 0)
		var i1: int = match_node.call("_input_for", 1)
		w.step(i0, i1)
	var fighters: Array = match_node.get("fighters")
	for i: int in range(2):
		(fighters[i] as FighterView).sync(w, i, 0.0)
	var cr: CameraRig = match_node.get("cam")
	cr.zoom_bias = float(sh.get("zoom", 0.0))
	if sh.has("free"):
		cr.mode = "free"
		var fr: Dictionary = sh["free"]
		cr.free_yaw = deg_to_rad(float(fr.get("yaw0", 0)))
		cr.free_pitch = float(fr.get("pitch", 10))
		cr.free_dist = float(fr.get("dist", 4.5))
	cr.update_cam(w, 0.016)
	cr.snap()
	cr.update_cam(w, 0.016)
	var hud: Node = match_node.get("hud")
	(hud as CanvasLayer).visible = bool(sh.get("hud", true))
	match_node.set("pv_ticks", 0)
	match_node.set("event_tap", Callable(self, "_tap"))
	return {"seed": Game.seed_value, "at": at, "event_tick": int(found.get("tick", -1))}


## 試合中の出来事を、ショット内のフレームと画面上の位置つきで記録する（編集で擬音や集中線を置く位置に使う）
func _tap(e: Dictionary) -> void:
	var kind := String(e.get("kind", ""))
	if not ["hit", "block", "launch", "wall_hit", "wall_broken", "landed", "ringout", "throw", "round_end"].has(kind):
		return
	var j := f - PRE - 1
	if j < 0 or log_rows.is_empty():
		return
	var fighters: Array = match_node.get("fighters")
	var who := int(e.get("defender", e.get("player", 0)))
	var fv := fighters[clampi(who, 0, 1)] as FighterView
	var cr: CameraRig = match_node.get("cam")
	var wp := fv.head_world - Vector3(0, 0.3, 0)
	if kind == "hit" or kind == "block":
		var ov := fighters[1 - clampi(who, 0, 1)] as FighterView
		wp = wp.lerp(ov.head_world - Vector3(0, 0.3, 0), 0.3)
	var sp := cr.unproject_position(wp)
	var vs := get_viewport().get_visible_rect().size
	var row: Dictionary = log_rows[log_rows.size() - 1]
	if not row.has("events"):
		row["events"] = []
	(row["events"] as Array).append({"kind": kind, "j": j, "x": sp.x / vs.x, "y": sp.y / vs.y, "weight": int(e.get("weight", 0)),
		"ch": bool(e.get("ch", false)), "ko": bool(e.get("ko", false)), "throw": bool(e.get("throw", false))})


func _update_match(j: int) -> void:
	if match_node == null:
		return
	match_node.set("pv_ticks", _ticks_at(j))
	if bool(match_node.get("_ended")):
		match_node.set("_end_timer", 999.0)
	var cr: CameraRig = match_node.get("cam")
	if sh.has("free") and cr.mode == "free" and j >= 0:
		var fr: Dictionary = sh["free"]
		var k := clampf(float(j) / maxf(1.0, float(sh["len"])), 0.0, 1.0)
		k = k * k * (3.0 - 2.0 * k)
		cr.free_yaw = deg_to_rad(lerpf(float(fr.get("yaw0", 0)), float(fr.get("yaw1", 0)), k))
		cr.free_dist = lerpf(float(fr.get("dist", 4.5)), float(fr.get("dist1", fr.get("dist", 4.5))), k)


# ------------------------------------------------------------------ スタジオ（機体紹介・全機）

func _setup_studio() -> void:
	var root := Node3D.new()
	add_child(root)
	stage_node = root
	var we := WorldEnvironment.new()
	var e := Environment.new()
	e.background_mode = Environment.BG_COLOR
	e.background_color = Color(0.018, 0.022, 0.032)
	e.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	e.ambient_light_color = Color(0.32, 0.36, 0.46)
	e.ambient_light_energy = 0.5
	e.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	e.glow_enabled = true
	e.glow_intensity = 0.9
	e.glow_bloom = 0.04
	e.glow_hdr_threshold = 1.0
	e.fog_enabled = true
	e.fog_light_color = Color(0.04, 0.06, 0.09)
	e.fog_density = 0.035
	e.adjustment_enabled = true
	e.adjustment_contrast = 1.1
	e.adjustment_saturation = 1.08
	we.environment = e
	root.add_child(we)
	# 床（暗い金属の床と、足元を照らす光の輪）
	var fl := MeshInstance3D.new()
	var pm := PlaneMesh.new()
	pm.size = Vector2(80, 80)
	fl.mesh = pm
	var fm := StandardMaterial3D.new()
	fm.albedo_color = Color(0.05, 0.055, 0.065)
	fm.roughness = 0.55
	fm.metallic = 0.4
	fl.material_override = fm
	root.add_child(fl)
	studio_key = DirectionalLight3D.new()
	studio_key.rotation_degrees = Vector3(-32, -28, 0)
	studio_key.light_color = Color(1.0, 0.93, 0.84)
	studio_key.light_energy = float(sh.get("key", 1.3))
	studio_key.shadow_enabled = true
	studio_key.directional_shadow_max_distance = 20.0
	root.add_child(studio_key)
	var top := SpotLight3D.new()
	top.position = Vector3(0, 6.5, 1.0)
	top.look_at_from_position(top.position, Vector3(0, 0, 0), Vector3.FORWARD)
	top.spot_range = 12.0
	top.spot_angle = 26.0 if String(sh["type"]) == "showcase" else 50.0
	top.light_energy = 5.0
	top.shadow_enabled = true
	root.add_child(top)
	for side: float in [-1.0, 1.0]:
		var rim := SpotLight3D.new()
		rim.position = Vector3(side * 2.6, 2.8, -2.6)
		rim.look_at_from_position(rim.position, Vector3(0, 1.3, 0), Vector3.UP)
		rim.spot_range = 10.0
		rim.spot_angle = 40.0
		rim.light_energy = 14.0
		rim.light_color = Color(0.35, 0.65, 1.0) if side < 0 else Color(1.0, 0.5, 0.2)
		root.add_child(rim)
	cam = Camera3D.new()
	cam.fov = float(sh.get("fov", 30))
	root.add_child(cam)
	cam.current = true


func _add_actor(id: String, costume: String, color: int, anim: String, pos: Vector3, t0: float) -> void:
	var lib := DataDB.anim_lib(id)
	var pe := PoseEval.new(lib.rig)
	var model := CharacterModel.new()
	stage_node.add_child(model)
	model.build(id, costume, DataDB.char_json(id), color, lib.rig)
	model.position = pos
	if model.material != null:
		model.material.set_shader_parameter("rim_color", Vector3(0.6, 0.8, 1.0))
		model.material.set_shader_parameter("rim_intensity", 0.5)
	var clip: AnimClip = lib.templates.rest_clip() if anim == "rest" else lib.clip(anim)
	actors.append([model, pe, clip, t0, lib])


func _update_actors(j: int) -> void:
	var t := maxf(0.0, float(j)) / 30.0
	var focus := Vector3.ZERO
	var hmax := 1.78
	for a: Array in actors:
		var model: CharacterModel = a[0]
		var pe: PoseEval = a[1]
		var clip: AnimClip = a[2]
		var fr := (t + float(a[3])) * 60.0
		if not clip.loop:
			fr = minf(fr, float(clip.length))
		pe.evaluate(clip.sample(fr))
		model.apply_pose(pe)
		# 胸を正面（+Z、カメラ側）へ向ける
		var fw := pe.global[Rig.B.CHEST].basis * Vector3(0, 0, -1)
		model.rotation.y = -atan2(fw.x, fw.z)
		model.set_face(0.0, 0.0)
		hmax = (a[4] as AnimLibrary).rig.height
	if actors.size() > 1:
		hmax = 1.85
	# カメラ: 低い位置から寄る・回り込む（k は 0 → 1）
	var cs: Dictionary = sh.get("cam", {})
	var k := clampf(t / maxf(0.01, float(sh["len"]) / 30.0), 0.0, 1.0)
	k = k * k * (3.0 - 2.0 * k)
	var dist := lerpf(float(cs.get("dist0", 3.6)), float(cs.get("dist1", 3.2)), k)
	if actors.size() == 1:
		dist *= hmax / 1.78
	var ch := lerpf(float(cs.get("h0", 0.3)), float(cs.get("h1", 0.4)), k) * hmax
	var look := Vector3(float(cs.get("look_x", 0.0)), float(cs.get("look_h", 0.6)) * hmax, 0)
	var yaw := deg_to_rad(lerpf(float(cs.get("yaw0", -10)), float(cs.get("yaw1", -4)), k))
	var off := Vector3(sin(yaw) * dist, 0, cos(yaw) * dist)
	cam.position = look + off + Vector3(0, ch - look.y, 0)
	cam.look_at(look, Vector3.UP)
	# 開幕の機体は暗闇から光が当たる
	if studio_key != null and sh.has("fade_in"):
		studio_key.light_energy = float(sh.get("key", 1.3)) * clampf(t / float(sh["fade_in"]), 0.0, 1.0)
