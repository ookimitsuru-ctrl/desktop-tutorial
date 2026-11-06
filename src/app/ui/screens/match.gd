extends Node3D
## 試合画面: シミュレーションを進め、演出（ステージ・ファイター・カメラ・エフェクト・HUD・音）に反映する。
## 仕様: 11_technical_architecture.md §11.5, 09, 10

const FP_TO_F := 1.0 / 65536.0

var params: Dictionary = {}
var world: SimWorld
var stage_view: StageView
var fighters: Array[FighterView] = []
var cam: CameraRig
var vfx: Vfx
var hud: HUD
var touch: TouchControls
var touch_layer: CanvasLayer
var round_log: Array = []
var sources: Array = [null, null]   # null = 人, AIController, Callable
var recorder: ReplayRecorder
var replay_inputs: PackedInt32Array = PackedInt32Array()
var replay_pos := 0
var paused := false
var pause_layer: CanvasLayer
var pause_menu: Control
var mode_ctrl: Object = null
var quality := 2
var _acc := 0.0
## 映像の書き出し用（tools/pv）: 0 以上なら描画 1 フレームあたりこの数だけ Tick を進める（実時間を見ない）
var pv_ticks := -1
var _last_usec := 0
var _slow := 0
var _slow_div := 1
var _slow_count := 0
var _swish: Array[int] = [-1, -1]
var _ended := false
var _end_timer := 0.0
var training := false
var frame_watch: FrameWatch
var debug_boxes := false
var _hurt_draw: ImmediateMesh
var _hurt_mi: MeshInstance3D


func setup(p: Dictionary) -> void:
	params = p


func _ready() -> void:
	quality = Quality.current_preset()
	Quality.apply_viewport(get_viewport(), quality)
	var g := Game
	var mode := int(params.get("mode", g.mode))
	training = mode == Game.Mode.TRAINING or mode == Game.Mode.TUTORIAL or mode == Game.Mode.TRIAL
	var opts := {"ringout": g.ringout, "rounds_to_win": g.rounds_to_win, "round_seconds": g.round_seconds}
	if training:
		opts["round_seconds"] = 9999
		opts["rounds_to_win"] = 99
	world = SimFactory.world(g.p_char[0], g.p_char[1], g.stage, g.seed_value, opts)
	world.training = training
	if mode == Game.Mode.SURVIVAL:
		world.f[0].hp = int(Game.survival.get("hp", 1000))
	world.training_infinite_hp = training
	world.assist_easy_escape = [bool(Settings.g("assist_escape")), false]
	if mode == Game.Mode.REPLAY:
		_load_replay()
	# 3D
	stage_view = StageView.new()
	add_child(stage_view)
	stage_view.build(g.stage, world.stage, quality)
	for i: int in range(2):
		var fv := FighterView.new()
		add_child(fv)
		fv.setup(g.p_char[i], g.p_costume[i], g.p_color[i], world.chars[i], i)
		fv.set_material_param("rim_color", stage_view.rim_color)
		fv.set_material_param("rim_dir", stage_view.rim_dir)
		fv.set_material_param("wetness", stage_view.wetness)
		fighters.append(fv)
	vfx = Vfx.new()
	vfx.photosensitive = bool(Settings.g("photosensitive"))
	add_child(vfx)
	cam = CameraRig.new()
	cam.shake_scale = float(Settings.g("camera_shake")) / 100.0
	add_child(cam)
	cam.current = true
	cam.mode = "intro" if String(Settings.g("intros")) != "skip" and not training else "fight"
	_hurt_draw = ImmediateMesh.new()
	_hurt_mi = MeshInstance3D.new()
	_hurt_mi.mesh = _hurt_draw
	var hm := StandardMaterial3D.new()
	hm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	hm.vertex_color_use_as_albedo = true
	hm.no_depth_test = true
	_hurt_mi.material_override = hm
	add_child(_hurt_mi)
	# HUD
	hud = HUD.new()
	add_child(hud)
	hud.rounds_to_win = world.rounds_to_win if not training else 0
	hud.set_names(DataDB.char_name(g.p_char[0]), DataDB.char_name(g.p_char[1]))
	touch_layer = CanvasLayer.new()
	touch_layer.layer = 6
	add_child(touch_layer)
	touch = TouchControls.new()
	touch_layer.add_child(touch)
	touch.pause_pressed.connect(_toggle_pause)
	touch.visible = _touch_visible()
	InputHub.pause_requested.connect(_on_pause_request)
	InputHub.reset_all()
	# 入力源
	for i2: int in range(2):
		var lvl: int = int(g.p_cpu[i2])
		if mode == Game.Mode.WATCH or (lvl > 0 and mode != Game.Mode.REPLAY):
			var ai := AIController.new()
			ai.setup(world, i2, maxi(1, lvl), world.chars[i2].id == "gensai" and bool(params.get("boss", false)))
			sources[i2] = ai
	if mode != Game.Mode.REPLAY:
		recorder = ReplayRecorder.new()
		recorder.begin(g, world)
	frame_watch = FrameWatch.new()
	# モード固有
	if training:
		mode_ctrl = TrainingCtrl.new(self, mode)
	elif mode == Game.Mode.ARCADE or mode == Game.Mode.SURVIVAL or mode == Game.Mode.TIME_ATTACK:
		mode_ctrl = null
	AudioHub.bgm(String(DataDB.stage_json(g.stage).get("audio", {}).get("bgm", "bgm_arena")))
	AudioHub.ambience(String(DataDB.stage_json(g.stage).get("audio", {}).get("ambience", "")))
	_last_usec = Time.get_ticks_usec()
	for i3: int in range(2):
		fighters[i3].sync(world, i3, 0.0)
	cam.snap()
	cam.update_cam(world, 0.016)


func _touch_visible() -> bool:
	if not InputHub.uses_touch(0) or Game.p_cpu[0] > 0 or Game.mode == Game.Mode.REPLAY or Game.mode == Game.Mode.WATCH:
		return false
	return DisplayServer.is_touchscreen_available() or OS.has_feature("mobile") or OS.get_environment("RB_FORCE_TOUCH") == "1"


func _load_replay() -> void:
	var rp := ReplayRecorder.load_file(Game.replay_path)
	if rp.is_empty():
		return
	replay_inputs = rp["inputs"]
	replay_pos = 0


# ------------------------------------------------------------ ループ

func _process(delta: float) -> void:
	if paused:
		return
	var n := _ticks(delta)
	for _k: int in range(n):
		if _slow > 0:
			_slow_count += 1
			if _slow_count % _slow_div != 0:
				continue
			_slow -= 1
		_tick()
	_present(delta)


## この描画フレームで進める Tick 数（原則 1、フレーム落ち時に追いつく）
func _ticks(delta: float) -> int:
	if pv_ticks >= 0:
		return pv_ticks
	var now := Time.get_ticks_usec()
	var dt := (now - _last_usec) / 1000.0
	_last_usec = now
	if training and mode_ctrl != null and (mode_ctrl as TrainingCtrl).speed_div > 1:
		var td := mode_ctrl as TrainingCtrl
		td.speed_count += 1
		if td.step_once:
			td.step_once = false
			return 1
		if td.frozen:
			return 0
		return 1 if td.speed_count % td.speed_div == 0 else 0
	if training and mode_ctrl != null and (mode_ctrl as TrainingCtrl).frozen:
		var td2 := mode_ctrl as TrainingCtrl
		if td2.step_once:
			td2.step_once = false
			return 1
		return 0
	if dt <= 25.0:
		return 1
	if dt > 100.0:
		return 1
	return clampi(int(round(dt / 16.667)), 1, 3)


func _tick() -> void:
	var inputs: Array[int] = [0, 0]
	for i: int in range(2):
		inputs[i] = _input_for(i)
	world.step(inputs[0], inputs[1])
	if recorder != null:
		recorder.add(inputs[0], inputs[1], world)
	if frame_watch != null:
		frame_watch.observe(world)
	if mode_ctrl != null:
		mode_ctrl.call("after_tick", world)
	for e: Dictionary in world.events:
		_on_event(e)
	for i2: int in range(2):
		if _swish[i2] > 0:
			_swish[i2] -= 1
			if _swish[i2] == 0:
				AudioHub.sfx("swish_heavy" if world.f[i2].move >= 0 and world.chars[i2].moves[world.f[i2].move].weight >= SE.W_HEAVY else "swish", -4.0)


func _input_for(i: int) -> int:
	if Game.mode == Game.Mode.REPLAY:
		if replay_pos * 2 + 1 < replay_inputs.size():
			var v := replay_inputs[replay_pos * 2 + i]
			if i == 1:
				replay_pos += 1
			return v
		return InputBits.make(5, 0, 0, 0)
	if mode_ctrl != null and mode_ctrl.has_method("input_for"):
		var v2: int = mode_ctrl.call("input_for", world, i)
		if v2 >= 0:
			return v2
	var src: Variant = sources[i]
	if src is AIController:
		return (src as AIController).next_input(world)
	var player_idx := i
	if Game.p_cpu[0] > 0 and i == 1:
		player_idx = 0
	return InputHub.sample(player_idx)


# ------------------------------------------------------------ 演出

func _present(delta: float) -> void:
	for i: int in range(2):
		fighters[i].sync(world, i, delta)
	cam.update_cam(world, delta)
	hud.update_hud(world, delta)
	stage_view.update(delta, bool(Settings.g("photosensitive")))
	stage_view.fade_for_camera(cam.global_position)
	if debug_boxes:
		_draw_boxes()
	if _ended:
		_end_timer -= delta
		if _end_timer <= 0.0:
			_ended = false
			_finish()


func _pos(i: int, up: float) -> Vector3:
	var p := world.f[i]
	return Vector3(p.x * FP_TO_F, p.y * FP_TO_F + up, p.z * FP_TO_F)


func _contact(att: int, def: int, level: int) -> Vector3:
	var h := 1.45 if level == SE.LV_HIGH else (0.45 if level == SE.LV_LOW else (0.25 if level == SE.LV_DOWN else 1.1))
	var a := _pos(att, 0)
	var d := _pos(def, h)
	var dir := (a - d)
	dir.y = 0
	return d + dir.normalized() * 0.22 + Vector3(0, 0, 0)


func _on_event(e: Dictionary) -> void:
	var kind := String(e["kind"])
	match kind:
		"round_start":
			var r := int(e["round"])
			var txt := "FINAL ROUND" if bool(e["final"]) else "ROUND %d" % r
			if world.extra_round == 1:
				txt = "EXTRA ROUND"
			if not training:
				hud.announce(txt, "", 0.9)
				AudioHub.announce("final_round" if bool(e["final"]) else "round_%d" % mini(r, 5))
			cam.mode = "intro" if r == 1 and String(Settings.g("intros")) == "full" and not training else "fight"
			cam.mode_t = 0.0
			for fv: FighterView in fighters:
				fv.reset_springs()
		"fight":
			if not training:
				hud.announce("FIGHT", "", 0.5, UITheme.ACCENT)
				AudioHub.announce("fight")
			cam.mode = "fight"
		"move":
			var pl := int(e["player"])
			var m := world.chars[pl].moves[int(e["move"])]
			if m.is_strike():
				_swish[pl] = maxi(1, m.startup - 3)
				if m.weight >= SE.W_HEAVY:
					AudioHub.voice(world.chars[pl].id, "attack_heavy", pl)
				elif randf() < 0.3:
					AudioHub.voice(world.chars[pl].id, "attack", pl)
		"hit":
			_on_hit(e)
		"block":
			var att := int(e["attacker"])
			var df := int(e["defender"])
			vfx.hit(_contact(att, df, int(e["level"])), "guard")
			AudioHub.sfx("guard_heavy" if int(e["weight"]) >= SE.W_HEAVY else "guard", -2.0)
			cam.add_trauma(0.08)
			InputHub.vibrate(att, 10, 0.3)
			if bool(e["crush"]):
				hud.callout(att, DataDB.t("hud_guard_crush"), UITheme.GOLD)
		"evade_success":
			var ep := int(e["player"])
			fighters[ep].spawn_ghosts()
			hud.callout(ep, DataDB.t("hud_evade"), Color(0.55, 0.85, 1.0))
			AudioHub.sfx("evade", -3.0)
		"throw":
			AudioHub.sfx("grab", -2.0)
		"throw_escape":
			var tp := int(e["player"])
			vfx.hit(_pos(tp, 1.2).lerp(_pos(1 - tp, 1.2), 0.5), "break")
			hud.callout(tp, DataDB.t("hud_break"), Color(0.9, 0.95, 1.0))
			AudioHub.sfx("throw_break", 0.0)
			InputHub.vibrate(tp, 15, 0.5)
		"throw_clash":
			vfx.hit(_pos(0, 1.2).lerp(_pos(1, 1.2), 0.5), "break")
			AudioHub.sfx("throw_break", 0.0)
		"launch":
			AudioHub.sfx("launch", -3.0)
		"landed":
			var lp := int(e["player"])
			vfx.dust(_pos(lp, 0.05), 18, stage_view.ground_color)
			AudioHub.sfx("land_heavy" if bool(e["heavy"]) else "land", -2.0)
			cam.add_trauma(0.12)
		"tech":
			vfx.dust(_pos(int(e["player"]), 0.05), 8, stage_view.ground_color)
			AudioHub.sfx("tech", -4.0)
		"wall_hit":
			var wp := int(e["player"])
			cam.add_trauma(0.45)
			vfx.dust(_pos(wp, 1.0), 14, Color(0.85, 0.82, 0.78))
			AudioHub.sfx("wall_hit", 0.0)
			hud.callout(1 - wp, DataDB.t("hud_wall"), UITheme.GOLD)
		"wall_broken":
			stage_view.on_wall_broken(int(e["edge"]))
			vfx.dust(_pos(int(e["player"]), 1.0), 32, Color(0.7, 0.68, 0.64))
			cam.add_trauma(0.6)
			AudioHub.sfx("wall_break", 2.0)
		"ringout":
			var rp := int(e["player"])
			cam.mode = "ringout"
			cam.focus_player = rp
			cam.mode_t = 0.0
			AudioHub.sfx("ringout_" + stage_view.stage_id, 0.0)
			AudioHub.sfx("ringout", -2.0)
		"stagger":
			AudioHub.sfx("stagger", -4.0)
		"parry":
			var pp := int(e["player"])
			vfx.hit(_pos(pp, 1.2).lerp(_pos(1 - pp, 1.2), 0.5), "break")
			hud.callout(pp, DataDB.t("hud_parry"), Color(0.6, 1.0, 0.8))
			AudioHub.sfx("parry", 0.0)
		"just_frame":
			var jp := int(e["player"])
			vfx.hit(_pos(jp, 1.2), "break")
			AudioHub.sfx("just", -2.0)
		"round_end":
			_on_round_end(e)
		"win_pose":
			var wpl := int(e["player"])
			cam.mode = "win"
			cam.focus_player = wpl
			cam.mode_t = 0.0
			AudioHub.voice(world.chars[wpl].id, "win", wpl)
		"match_end":
			_ended = true
			var mw := int(e.get("winner", -1))
			if (mw == 0 or mw == 1) and not training:
				AudioHub.announce("win_" + world.chars[mw].id, true)
			_end_timer = 1.6
	if mode_ctrl != null and mode_ctrl.has_method("on_event"):
		mode_ctrl.call("on_event", e)


func _on_hit(e: Dictionary) -> void:
	var att := int(e["attacker"])
	var df := int(e["defender"])
	var w := int(e["weight"])
	var ch := bool(e["ch"])
	var is_throw := bool(e.get("throw", false))
	var level := int(e["level"])
	var p := _contact(att, df, level) if not is_throw else _pos(df, 0.4)
	var kind := ["light", "medium", "heavy", "launch"][clampi(w, 0, 3)] as String
	if ch:
		kind = "counter"
	if is_throw:
		vfx.dust(_pos(df, 0.05), 24, stage_view.ground_color)
		AudioHub.sfx("slam", 2.0)
		cam.add_trauma(0.5)
	else:
		vfx.hit(p, kind)
		AudioHub.sfx("hit_" + ["light", "medium", "heavy", "heavy"][clampi(w, 0, 3)], -1.0 if w >= SE.W_HEAVY else -3.0)
		if ch:
			AudioHub.sfx("counter", -2.0)
		cam.add_trauma([0.15, 0.25, 0.4, 0.38][clampi(w, 0, 3)] + (0.15 if ch else 0.0))
	fighters[df].on_hit(w >= SE.W_HEAVY or ch)
	if w >= SE.W_HEAVY:
		AudioHub.duck(0.35)
		stage_view.excite_crowd(0.6)
	if ch:
		hud.callout(att, "COUNTER", Color(1.0, 0.42, 0.2))
	elif int(e["rel"]) == SE.TA_BACK:
		hud.callout(att, DataDB.t("hud_back"), UITheme.GOLD)
	hud.show_combo(att, int(e["combo"]), int(e["combo_damage"]))
	if randf() < (0.8 if w >= SE.W_HEAVY else 0.35):
		AudioHub.voice(world.chars[df].id, "hurt_heavy" if w >= SE.W_HEAVY else "hurt", df)
	InputHub.vibrate(att, 35 if ch else 20, 0.8 if ch else 0.5)
	InputHub.vibrate(df, 25, 0.6)


func _on_round_end(e: Dictionary) -> void:
	round_log.append({"winner": int(e["winner"]), "reason": int(e["reason"]), "perfect": bool(e["perfect"])})
	var reason := int(e["reason"])
	var winner := int(e["winner"])
	var txt := "K.O."
	var ann := "ko"
	match reason:
		SE.END_RINGOUT:
			txt = "RING OUT"
			ann = "ring_out"
		SE.END_TIMEUP:
			txt = "TIME UP"
			ann = "time_up"
		SE.END_DRAW:
			txt = "DRAW"
			ann = "draw"
	if training:
		return
	hud.announce(txt, "PERFECT" if bool(e["perfect"]) else "", 1.6, UITheme.ACCENT if reason == SE.END_KO else UITheme.TEXT)
	AudioHub.announce(ann)
	if bool(e["perfect"]):
		AudioHub.announce("perfect", true)
	if reason == SE.END_KO:
		_slow = 45
		_slow_div = 3
		_slow_count = 0
		cam.mode = "ko"
		cam.focus_player = 1 - winner if winner < 2 else 0
		cam.mode_t = 0.0
		cam.add_trauma(0.6)
		stage_view.excite_crowd(1.0)
		for i: int in range(2):
			if world.f[i].ko == 1:
				AudioHub.voice(world.chars[i].id, "ko", i)


func _finish() -> void:
	var res := {
		"winner": world.match_winner, "chars": Game.p_char.duplicate(), "stats": [
			{"damage": world.f[0].stat_damage, "max_combo": world.f[0].stat_max_combo, "counters": world.f[0].stat_counters, "escapes": world.f[0].stat_escapes, "evades": world.f[0].stat_evades},
			{"damage": world.f[1].stat_damage, "max_combo": world.f[1].stat_max_combo, "counters": world.f[1].stat_counters, "escapes": world.f[1].stat_escapes, "evades": world.f[1].stat_evades},
		], "frames": world.frame, "hp_left": world.f[0].hp,
		"rounds": round_log, "boss": bool(params.get("boss", false)),
	}
	Game.last_result = res
	if recorder != null and bool(Settings.g("replay_autosave")):
		recorder.save_auto()
	if mode_ctrl != null and mode_ctrl.has_method("on_finish"):
		mode_ctrl.call("on_finish", res)
		return
	SceneRouter.goto("result", res)


# ------------------------------------------------------------ ポーズ

func _on_pause_request(_dev: String) -> void:
	_toggle_pause()


func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_GO_BACK_REQUEST:
		_toggle_pause()
	elif what == NOTIFICATION_APPLICATION_FOCUS_OUT or what == NOTIFICATION_APPLICATION_PAUSED:
		if not paused and Game.mode != Game.Mode.REPLAY:
			_toggle_pause()


func _toggle_pause() -> void:
	paused = not paused
	if paused:
		if touch != null:
			touch.release_all()
		InputHub.reset_all()
		pause_layer = CanvasLayer.new()
		pause_layer.layer = 20
		add_child(pause_layer)
		pause_menu = PauseMenu.new()
		pause_menu.call("init", self)
		pause_layer.add_child(pause_menu)
	else:
		if pause_layer != null:
			pause_layer.queue_free()
			pause_layer = null
		_last_usec = Time.get_ticks_usec()


func _exit_tree() -> void:
	AudioHub.stop_ambience()
	if InputHub.pause_requested.is_connected(_on_pause_request):
		InputHub.pause_requested.disconnect(_on_pause_request)


# ------------------------------------------------------------ 判定表示（トレーニング）

func _draw_boxes() -> void:
	_hurt_draw.clear_surfaces()
	_hurt_draw.surface_begin(Mesh.PRIMITIVE_LINES)
	for i: int in range(2):
		var p := world.f[i]
		var cd := world.chars[i]
		var bk := cd.baked
		var hb := bk.hurt_base(p.anim, p.anim_frame)
		var ang := float(p.facing) / 65536.0 * TAU
		var fwd := Vector3(sin(ang), 0, cos(ang))
		var right := Vector3(-fwd.z, 0, fwd.x)
		var base := _pos(i, 0)
		if hb >= 0:
			for c: int in range(BakedChar.CAPS):
				var q := hb + c * BakedChar.VALS
				var a := base + right * bk.hurt[q] * 0.001 + Vector3.UP * bk.hurt[q + 1] * 0.001 + fwd * bk.hurt[q + 2] * 0.001
				var b := base + right * bk.hurt[q + 3] * 0.001 + Vector3.UP * bk.hurt[q + 4] * 0.001 + fwd * bk.hurt[q + 5] * 0.001
				_capsule_lines(a, b, bk.hurt[q + 6] * 0.001, Color(0.3, 0.6, 1.0))
		if p.state == SE.ST_MOVE:
			var m := cd.moves[p.move]
			var ho := bk.hit_at(m.anim_index, p.mf)
			if ho >= 0 and p.mf >= m.startup and p.mf <= m.active_end():
				for s: int in range(2):
					var o := ho + s * 7
					if bk.hit[o + 6] <= 0:
						continue
					var a2 := base + right * bk.hit[o] * 0.001 + Vector3.UP * bk.hit[o + 1] * 0.001 + fwd * bk.hit[o + 2] * 0.001
					var b2 := base + right * bk.hit[o + 3] * 0.001 + Vector3.UP * bk.hit[o + 4] * 0.001 + fwd * bk.hit[o + 5] * 0.001
					_capsule_lines(a2, b2, bk.hit[o + 6] * 0.001, Color(1.0, 0.25, 0.2))
		var pr := cd.push_radius * FP_TO_F
		for k: int in range(16):
			var a3 := base + Vector3(cos(k * TAU / 16), 0.02, sin(k * TAU / 16)) * pr
			var b3 := base + Vector3(cos((k + 1) * TAU / 16), 0.02, sin((k + 1) * TAU / 16)) * pr
			_line(a3, b3, Color(0.3, 1.0, 0.3))
	_hurt_draw.surface_end()


func _line(a: Vector3, b: Vector3, c: Color) -> void:
	_hurt_draw.surface_set_color(c)
	_hurt_draw.surface_add_vertex(a)
	_hurt_draw.surface_set_color(c)
	_hurt_draw.surface_add_vertex(b)


func _capsule_lines(a: Vector3, b: Vector3, r: float, c: Color) -> void:
	var d := (b - a)
	var n := d.normalized() if d.length() > 0.001 else Vector3.UP
	var u := n.cross(Vector3.UP if absf(n.y) < 0.9 else Vector3.RIGHT).normalized()
	var v := n.cross(u)
	for k: int in range(8):
		var t0 := k * TAU / 8
		var t1 := (k + 1) * TAU / 8
		var o0 := (u * cos(t0) + v * sin(t0)) * r
		var o1 := (u * cos(t1) + v * sin(t1)) * r
		_line(a + o0, a + o1, c)
		_line(b + o0, b + o1, c)
		if k % 2 == 0:
			_line(a + o0, b + o0, c)
