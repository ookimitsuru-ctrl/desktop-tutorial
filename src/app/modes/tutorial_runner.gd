class_name TutorialRunner
extends RefCounted
## チュートリアル 12 課と技トライアル（20 課）の進行。課題は文言・ダミー行動・成功条件で構成。
## 仕様: 06 §6.5, §6.6

const N := 5

var ctrl: TrainingCtrl
var mode := 0
var lesson := 0
var steps: Array = []    # [{text, dummy, check, need}]
var step := 0
var count := 0
var done := false
var _dummy_t := 0
var _flags := {}
var trial_list: Array = []
var _x0 := 0


func _init(c: TrainingCtrl, p_mode: int) -> void:
	ctrl = c
	mode = p_mode
	if mode == Game.Mode.TRIAL:
		_build_trials()
		lesson = Game.trial_index
	else:
		lesson = Game.tutorial_lesson
	_load()


func _t(k: String) -> String:
	return DataDB.t(k)


func _load() -> void:
	step = 0
	count = 0
	_flags = {}
	steps = []
	if mode == Game.Mode.TRIAL:
		var tr: Dictionary = trial_list[clampi(lesson, 0, trial_list.size() - 1)]
		steps = [{"text": tr["text"], "dummy": tr.get("dummy", "stand"), "check": "move_hit", "arg": tr["move"], "need": 1}]
	else:
		match lesson:
			0:
				steps = [
					{"text": _t("tut0_a"), "check": "cmd", "arg": "P", "need": 1},
					{"text": _t("tut0_b"), "check": "cmd", "arg": "K", "need": 1},
					{"text": _t("tut0_c"), "check": "state", "arg": SE.ST_GUARD, "need": 1},
					{"text": _t("tut0_d"), "check": "cmd", "arg": "6P", "need": 1},
					{"text": _t("tut0_e"), "check": "cmd", "arg": "2K", "need": 1},
				]
			1:
				steps = [
					{"text": _t("tut1_a"), "check": "walk", "need": 1},
					{"text": _t("tut1_b"), "check": "state", "arg": SE.ST_DASH_F, "need": 1},
					{"text": _t("tut1_c"), "check": "state", "arg": SE.ST_DASH_B, "need": 1},
					{"text": _t("tut1_d"), "check": "state", "arg": SE.ST_CROUCH, "need": 1},
				]
			2:
				steps = [{"text": _t("tut2_a"), "check": "combo", "arg": 3, "need": 1}]
			3:
				steps = [
					{"text": _t("tut3_a"), "dummy": "jab_loop", "check": "whiff_high", "need": 3},
					{"text": _t("tut3_b"), "dummy": "mid_loop", "check": "block", "need": 3},
				]
			4:
				steps = [{"text": _t("tut4_a"), "dummy": "mixup", "check": "block_streak", "need": 5}]
			5:
				steps = [{"text": _t("tut5_a"), "dummy": "guard", "check": "throw", "need": 2}]
			6:
				steps = [{"text": _t("tut6_a"), "dummy": "throw_loop", "check": "escape", "need": 3}]
			7:
				steps = [{"text": _t("tut7_a"), "dummy": "linear_loop", "check": "evade", "need": 3}]
			8:
				steps = [{"text": _t("tut8_a"), "dummy": "guard", "check": "cmd", "arg": "K+G", "need": 2},
					{"text": _t("tut8_b"), "dummy": "guard", "check": "throw", "need": 1}]
			9:
				steps = [{"text": _t("tut9_a"), "dummy": "unsafe_loop", "check": "punish_launch", "need": 2}]
			10:
				steps = [{"text": _t("tut10_a"), "check": "air_combo", "need": 1}]
			11:
				steps = [{"text": _t("tut11_a"), "dummy": "knockdown", "check": "tech", "need": 2},
					{"text": _t("tut11_b"), "dummy": "stand", "check": "ringout", "need": 1}]
	_show()


func _build_trials() -> void:
	var cd := SimFactory.character(Game.p_char[0])
	var cats: Array[String] = []
	var picked: Array = []
	for m: MoveDef in cd.moves:
		if m.chain_only or not m.is_strike() or m.level == SE.LV_DOWN:
			continue
		if (m.from_mask & (SE.FROM_STAND | SE.FROM_CROUCH | SE.FROM_RISE | SE.FROM_DASH)) == 0:
			continue
		picked.append(m)
	picked.sort_custom(func(a: MoveDef, b: MoveDef) -> bool: return a.startup < b.startup)
	for m2: MoveDef in picked.slice(0, 16):
		var ctx := "rise" if (m2.from_mask & SE.FROM_RISE) != 0 and (m2.from_mask & SE.FROM_STAND) == 0 else ""
		var cmdtxt := (_t("trial_rise") if ctx == "rise" else "") + (_t("trial_dash") if (m2.from_mask & SE.FROM_DASH) != 0 and (m2.from_mask & SE.FROM_STAND) == 0 else "") + m2.cmd.text
		trial_list.append({"text": "%s  %s" % [DataDB.move_name(cd, m2), cmdtxt], "move": m2.id})
	# 連携
	for m3: MoveDef in cd.moves:
		if m3.chain_to.size() > 0 and (m3.from_mask & SE.FROM_STAND) != 0 and trial_list.size() < 20:
			var nm := cd.moves[m3.chain_to[0]]
			trial_list.append({"text": "%s → %s  %s, %s" % [DataDB.move_name(cd, m3), DataDB.move_name(cd, nm), m3.cmd.text, CommandSpec.new().text if false else _btn_txt(m3.chain_btn[0])], "move": nm.id})


static func _btn_txt(b: int) -> String:
	var parts: Array[String] = []
	if b & InputBits.P:
		parts.append("P")
	if b & InputBits.K:
		parts.append("K")
	if b & InputBits.G:
		parts.append("G")
	return "+".join(parts)


func _show() -> void:
	var hud: HUD = ctrl.match_node.get("hud")
	if done:
		hud.set_training_line(_t("tut_clear"))
		hud.set_info(_t("tut_next_hint"))
		return
	var s: Dictionary = steps[step]
	var title := ""
	if mode == Game.Mode.TRIAL:
		title = "%s %d/%d" % [_t("trial_title"), lesson + 1, trial_list.size()]
	else:
		title = "%s %d  %s" % [_t("tut_lesson"), lesson + 1, _t("tut%d_title" % lesson)]
	hud.set_training_line(title)
	var need := int(s.get("need", 1))
	hud.set_info("%s   (%d/%d)" % [String(s["text"]), count, need])


func _advance() -> void:
	count += 1
	AudioHub.ui("ok")
	var s: Dictionary = steps[step]
	if count >= int(s.get("need", 1)):
		step += 1
		count = 0
		_flags = {}
		if step >= steps.size():
			done = true
			AudioHub.sfx("just", 0.0)
			var key := ("trial_%s_%d" % [Game.p_char[0], lesson]) if mode == Game.Mode.TRIAL else ("tutorial_%d" % lesson)
			SaveData.unlock(key)
	_show()


func next_lesson() -> void:
	var maxn := trial_list.size() if mode == Game.Mode.TRIAL else 12
	lesson = (lesson + 1) % maxn
	done = false
	if mode == Game.Mode.TRIAL:
		Game.trial_index = lesson
	else:
		Game.tutorial_lesson = lesson
	ctrl.reset_position()
	_load()


func _cur() -> Dictionary:
	if done or step >= steps.size():
		return {}
	return steps[step]


## ダミー（P2）の行動
func input_for(w: SimWorld, i: int) -> int:
	if i != 1:
		return -1
	var s := _cur()
	var dm := String(s.get("dummy", "stand"))
	_dummy_t += 1
	var d := w.f[1]
	var free := FighterCtl.is_neutral_state(d.state)
	match dm:
		"guard":
			return InputBits.make(N, InputBits.G, 0, 0)
		"jab_loop", "mid_loop", "linear_loop", "unsafe_loop", "throw_loop", "mixup", "knockdown":
			if not free:
				return InputBits.make(N, 0, 0, 0)
			if _dummy_t % 70 == 0:
				var cmd := {"jab_loop": "P", "mid_loop": "6P", "linear_loop": "6P", "unsafe_loop": "", "throw_loop": "P+G", "knockdown": "6P+K"}.get(dm, "") as String
				if dm == "mixup":
					cmd = "6P" if randf() < 0.5 else "2K"
				var m := _find(w.chars[1], cmd) if cmd != "" else _unsafe(w.chars[1])
				if m != null:
					var dd := m.cmd.dir if m.cmd.dir != 0 else N
					if not w._on_screen_left(1):
						dd = InputBits.mirror_dir(dd)
					return InputBits.make(dd, m.cmd.buttons, m.cmd.buttons, 0)
			# 間合いを詰める
			if FighterCtl.dist(w, 1) > FP.from_str("1.0") and dm != "knockdown":
				return InputBits.make(4 if w._on_screen_left(0) else 6, 0, 0, 0)
	return InputBits.make(N, 0, 0, 0)


func _find(cd: CharDef, cmd: String) -> MoveDef:
	for m: MoveDef in cd.moves:
		if not m.chain_only and m.cmd != null and m.cmd.text == cmd and (m.from_mask & SE.FROM_STAND) != 0:
			return m
	return null


func _unsafe(cd: CharDef) -> MoveDef:
	for m: MoveDef in cd.moves:
		if not m.chain_only and m.is_strike() and m.adv_block <= -13 and (m.from_mask & SE.FROM_STAND) != 0 and m.cmd.motion.size() == 0:
			return m
	return null


func after_tick(w: SimWorld) -> void:
	var s := _cur()
	if s.is_empty():
		return
	var p := w.f[0]
	match String(s["check"]):
		"state":
			if p.state == int(s["arg"]) and not _flags.has("s"):
				_flags["s"] = true
				_advance()
		"walk":
			if p.state == SE.ST_WALK_F and p.sf > 30:
				_advance()
	if String(s.get("check", "")) == "ringout" and w.f[1].state == SE.ST_RINGOUT and not _flags.has("ro"):
		_flags["ro"] = true
		_advance()
		ctrl.reset_position()


func on_event(e: Dictionary) -> void:
	var s := _cur()
	var k := String(e["kind"])
	if s.is_empty():
		return
	var w: SimWorld = ctrl.match_node.get("world")
	match String(s["check"]):
		"cmd":
			if k == "move" and int(e["player"]) == 0:
				var m := w.chars[0].moves[int(e["move"])]
				if m.cmd != null and m.cmd.text == String(s["arg"]):
					_advance()
		"move_hit":
			if k == "hit" and int(e["attacker"]) == 0:
				var m2 := w.chars[0].moves[int(e["move"])]
				if m2.id == String(s["arg"]):
					_advance()
		"combo":
			if k == "hit" and int(e["attacker"]) == 0 and int(e["combo"]) >= int(s["arg"]):
				_advance()
		"whiff_high":
			if k == "move" and int(e["player"]) == 1 and w.f[0].is_crouching():
				_flags["w"] = true
			if k == "hit" and int(e["defender"]) == 0:
				_flags.erase("w")
			if k == "move" and int(e["player"]) == 1 and _flags.has("w2"):
				_advance()
				_flags.erase("w2")
			if _flags.has("w"):
				_flags["w2"] = true
		"block":
			if k == "block" and int(e["defender"]) == 0:
				_advance()
		"block_streak":
			if k == "block" and int(e["defender"]) == 0:
				_advance()
			if k == "hit" and int(e["defender"]) == 0:
				count = 0
				_show()
		"throw":
			if k == "throw" and int(e["attacker"]) == 0:
				_advance()
		"escape":
			if k == "throw_escape" and int(e["player"]) == 0:
				_advance()
		"evade":
			if k == "evade_success" and int(e["player"]) == 0:
				_advance()
		"punish_launch":
			if k == "launch" and int(e["player"]) == 1:
				_advance()
		"air_combo":
			if k == "hit" and int(e["attacker"]) == 0 and bool(e["juggle"]) and int(e["combo"]) >= 2:
				_advance()
		"tech":
			if k == "tech" and int(e["player"]) == 0:
				_advance()
