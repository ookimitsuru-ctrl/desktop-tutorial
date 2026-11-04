class_name TrainingCtrl
extends RefCounted
## トレーニング（とチュートリアル・技トライアル）の制御: ダミー動作、録画再生、フレーム表示、位置リセット、速度。
## 仕様: 06_game_modes_and_progression.md §6.4〜6.6

const N := 5

var match_node: Node
var mode := 0
var opt := {
	"dummy": "stand", "after_block": "none", "escape": "never", "tech": "none", "wakeup": "inplace",
	"show_frame": true, "show_input": false, "show_boxes": false, "speed": 1, "position": "center", "cpu_level": 4,
}
const CHOICES := {
	"dummy": ["stand", "crouch", "guard_stand", "guard_crouch", "guard_auto", "guard_random", "cpu", "play"],
	"after_block": ["none", "jab", "punish", "throw", "evade"],
	"escape": ["never", "always", "random"],
	"tech": ["none", "inplace", "side", "back", "random"],
	"wakeup": ["stay", "inplace", "roll", "kick", "random"],
	"show_frame": [true, false], "show_input": [true, false], "show_boxes": [false, true],
	"speed": [1, 2, 4], "position": ["center", "p1_edge", "p2_edge"], "cpu_level": [1, 2, 3, 4, 5, 6, 7, 8],
}
var speed_div := 1
var speed_count := 0
var frozen := false
var step_once := false
var ai: AIController = null
var plan: Array[int] = []
var rec: PackedInt32Array = PackedInt32Array()
var recording := false
var play_pos := 0
var _random_guard_crouch := false
var _neutral_t := 0
var tutorial: TutorialRunner = null
var _input_hist: Array[String] = []
var _last_input := -1
var _last_input_n := 0


func _init(m: Node, p_mode: int) -> void:
	match_node = m
	mode = p_mode
	if p_mode == Game.Mode.TUTORIAL or p_mode == Game.Mode.TRIAL:
		tutorial = TutorialRunner.new(self, p_mode)


func set_opt(k: String, v: Variant) -> void:
	opt[k] = v
	if k == "speed":
		speed_div = int(v)
	if k == "show_boxes":
		match_node.set("debug_boxes", bool(v))
	if k == "dummy" and String(v) == "cpu":
		ai = AIController.new()
		ai.setup(match_node.get("world"), 1, int(opt["cpu_level"]), false)
	if k == "cpu_level" and ai != null:
		ai.setup(match_node.get("world"), 1, int(v), false)


func cycle(k: String, dir: int) -> void:
	var arr: Array = CHOICES[k]
	var i := arr.find(opt[k])
	i = (i + dir + arr.size()) % arr.size()
	set_opt(k, arr[i])


func reset_position() -> void:
	var w: SimWorld = match_node.get("world")
	var d := FP.from_str("2.0")
	var cx := 0
	match String(opt["position"]):
		"p1_edge":
			cx = -FP.from_str("4.3")
		"p2_edge":
			cx = FP.from_str("4.3")
	SimDriver.place(w, d)
	w.f[0].x += cx
	w.f[1].x += cx
	w.hitstop = 0
	for i: int in range(2):
		w.f[i].hp = w.rules.health
		w.f[i].combo_hits = 0
	w.edge_type = w.stage.edge_type.duplicate()
	w.edge_hp = w.stage.edge_hp.duplicate()
	var sv: StageView = match_node.get("stage_view")
	for k: int in range(sv.edge_nodes.size()):
		sv.edge_nodes[k].visible = true
		sv.edge_broken[k].visible = false
	(match_node.get("cam") as CameraRig).snap()


## P2（ダミー）の入力。-1 なら通常処理
func input_for(w: SimWorld, i: int) -> int:
	if tutorial != null:
		var tv := tutorial.input_for(w, i)
		if tv >= 0:
			return tv
	if i == 0:
		var v := InputHub.sample(0)
		if recording:
			rec.append(v)
			if rec.size() >= 600:
				recording = false
			return InputBits.make(5, 0, 0, 0)
		_track_input(v)
		return v
	if recording:
		return InputHub.sample(0)
	var d := w.f[1]
	if not plan.is_empty():
		return plan.pop_front()
	var a := w.f[0]
	match d.state:
		SE.ST_THROWN:
			var esc := String(opt["escape"])
			if d.sf == 1 and (esc == "always" or (esc == "random" and randf() < 0.5)):
				var tm := w.chars[0].moves[a.throw_move] if a.throw_move >= 0 else null
				var dirv := N
				if tm != null:
					dirv = [N, 4, 6, 2, N][clampi(tm.throw_escape, 0, 4)]
				dirv = InputBits.mirror_dir(dirv) if not w._on_screen_left(1) else dirv
				return InputBits.make(dirv, InputBits.P | InputBits.G, InputBits.P | InputBits.G, 0)
		SE.ST_AIR:
			var te := String(opt["tech"])
			if te != "none" and d.vy < 0 and d.y < FP.from_str("0.2"):
				var td := {"inplace": N, "side": 8, "back": 4}.get(te, [N, 8, 2, 4][randi() % 4]) as int
				return InputBits.make(td, InputBits.G, InputBits.G, 0)
		SE.ST_DOWN:
			var wk := String(opt["wakeup"])
			if d.sf == w.rules.down_min + 2:
				match wk:
					"inplace":
						return InputBits.make(N, InputBits.G, InputBits.G, 0)
					"roll":
						return InputBits.make(8, 0, 0, 0)
					"kick":
						return InputBits.make(N, InputBits.K, InputBits.K, 0)
					"random":
						return [InputBits.make(N, InputBits.G, InputBits.G, 0), InputBits.make(8, 0, 0, 0), InputBits.make(N, InputBits.K, InputBits.K, 0)][randi() % 3]
		SE.ST_BLOCKSTUN:
			if d.stun <= 2:
				_after_block(w)
			return _guard_input(w, true)
	var dm := String(opt["dummy"])
	match dm:
		"stand":
			return InputBits.make(N, 0, 0, 0)
		"crouch":
			return InputBits.make(2, 0, 0, 0)
		"guard_stand":
			return InputBits.make(N, InputBits.G, 0, 0)
		"guard_crouch":
			return InputBits.make(2, InputBits.G, 0, 0)
		"guard_auto", "guard_random":
			return _guard_input(w, false)
		"cpu":
			if ai != null:
				return ai.next_input(w)
		"play":
			if rec.size() > 0:
				var v2 := rec[play_pos % rec.size()]
				play_pos += 1
				return v2
	return InputBits.make(N, 0, 0, 0)


func _guard_input(w: SimWorld, in_stun: bool) -> int:
	var dm := String(opt["dummy"])
	var a := w.f[0]
	var crouch := false
	if dm == "guard_crouch" or dm == "crouch":
		crouch = true
	if dm == "guard_auto" and a.state == SE.ST_MOVE:
		var m := w.chars[0].moves[a.move]
		crouch = m.level == SE.LV_LOW or m.level == SE.LV_LTHROW
	if dm == "guard_random":
		if a.state == SE.ST_MOVE and a.mf == 1:
			_random_guard_crouch = randf() < 0.5
		crouch = _random_guard_crouch
	if not in_stun and dm in ["stand", "crouch", "cpu", "play"]:
		return InputBits.make(2 if crouch else N, 0, 0, 0)
	return InputBits.make(2 if crouch else N, InputBits.G, 0, 0)


func _after_block(w: SimWorld) -> void:
	var ab := String(opt["after_block"])
	var cd := w.chars[1]
	match ab:
		"jab":
			plan = [InputBits.make(N, InputBits.P, InputBits.P, 0), InputBits.make(N, 0, 0, InputBits.P)]
		"throw":
			plan = [InputBits.make(N, InputBits.P | InputBits.G, InputBits.P | InputBits.G, 0), InputBits.make(N, 0, 0, InputBits.P | InputBits.G)]
		"evade":
			plan = [InputBits.make(8, 0, 0, 0), InputBits.make(N, 0, 0, 0)]
		"punish":
			var tmp := AIController.new()
			tmp.setup(w, 1, 8, false)
			var a := w.f[0]
			if a.state == SE.ST_MOVE:
				var m := w.chars[0].moves[a.move]
				var pm := tmp._best_punish(m.total() - a.mf - w.f[1].stun)
				if pm != null:
					var inputs: Array[int] = []
					if (pm.from_mask & SE.FROM_RISE) != 0 and (pm.from_mask & SE.FROM_STAND) == 0:
						inputs.append(InputBits.make(2, 0, 0, 0))
					for dd: int in pm.cmd.motion:
						inputs.append(InputBits.make(InputBits.mirror_dir(dd), 0, 0, 0))
					var ld := InputBits.mirror_dir(pm.cmd.dir if pm.cmd.dir != 0 else N)
					inputs.append(InputBits.make(ld, pm.cmd.buttons, pm.cmd.buttons, 0))
					inputs.append(InputBits.make(N, 0, 0, pm.cmd.buttons))
					plan = inputs
	var _c := cd


func _track_input(v: int) -> void:
	var key := v & 0x7F
	if key == _last_input:
		_last_input_n += 1
		return
	if _last_input >= 0:
		_input_hist.push_front(_fmt(_last_input, _last_input_n))
		if _input_hist.size() > 14:
			_input_hist.pop_back()
	_last_input = key
	_last_input_n = 1


static func _fmt(v: int, n: int) -> String:
	var arrows := ["", "↙", "↓", "↘", "←", "・", "→", "↖", "↑", "↗"]
	var d := InputBits.dir(v)
	var h := InputBits.held(v)
	var b := ""
	if h & InputBits.P:
		b += "P"
	if h & InputBits.K:
		b += "K"
	if h & InputBits.G:
		b += "G"
	return "%s %s  %d" % [arrows[d], b, mini(n, 99)]


func after_tick(w: SimWorld) -> void:
	if tutorial != null:
		tutorial.after_tick(w)
	# 体力の自動回復
	var calm := FighterCtl.is_neutral_state(w.f[0].state) and FighterCtl.is_neutral_state(w.f[1].state)
	_neutral_t = _neutral_t + 1 if calm else 0
	if _neutral_t == 50:
		for i: int in range(2):
			w.f[i].hp = w.rules.health
	var hud: HUD = match_node.get("hud")
	var fw: FrameWatch = match_node.get("frame_watch")
	if bool(opt["show_frame"]) and fw != null and tutorial == null:
		hud.set_training_line(fw.result)
	elif tutorial == null:
		hud.set_training_line("")
	if bool(opt["show_input"]) and tutorial == null:
		hud.set_info("  ".join(_input_hist.slice(0, 8)))
	elif tutorial == null:
		hud.set_info(DataDB.t("training_hint"))


func on_event(e: Dictionary) -> void:
	if tutorial != null:
		tutorial.on_event(e)
