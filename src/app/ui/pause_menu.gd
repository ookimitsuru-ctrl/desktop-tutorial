class_name PauseMenu
extends Control
## ポーズメニュー（再開・トレーニング設定・技表・リタイア）

var m: Node   # match 画面
var panel: PanelContainer
var box: VBoxContainer


func init(match_node: Node) -> void:
	m = match_node
	set_anchors_preset(Control.PRESET_FULL_RECT)
	var dim := ColorRect.new()
	dim.color = Color(0, 0, 0, 0.55)
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(dim)
	_main()


func _clear() -> void:
	if panel != null:
		panel.queue_free()
	panel = PanelContainer.new()
	panel.set_anchors_preset(Control.PRESET_CENTER)
	add_child(panel)
	var sc := ScrollContainer.new()
	sc.custom_minimum_size = Vector2(560, 0)
	sc.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	panel.add_child(sc)
	box = VBoxContainer.new()
	box.add_theme_constant_override("separation", 10)
	box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	sc.add_child(box)


func _center() -> void:
	await get_tree().process_frame
	var vs := get_viewport_rect().size
	var h := minf(box.get_combined_minimum_size().y + 40, vs.y - 60)
	(panel.get_child(0) as ScrollContainer).custom_minimum_size = Vector2(560, h)
	panel.position = (vs - panel.get_combined_minimum_size()) * 0.5
	var first := _first_button(box)
	if first != null:
		first.grab_focus()


func _first_button(n: Node) -> Control:
	for c: Node in n.get_children():
		if c is Button:
			return c
		var r := _first_button(c)
		if r != null:
			return r
	return null


func _main() -> void:
	_clear()
	box.add_child(UITheme.label(DataDB.t("pause"), 34, "display"))
	box.add_child(UITheme.button(DataDB.t("resume"), func() -> void: m.call("_toggle_pause")))
	var tc: Variant = m.get("mode_ctrl")
	if tc is TrainingCtrl:
		var t := tc as TrainingCtrl
		if t.tutorial != null:
			box.add_child(UITheme.button(DataDB.t("tut_next"), func() -> void:
				t.tutorial.next_lesson()
				m.call("_toggle_pause")))
		else:
			box.add_child(UITheme.button(DataDB.t("training_settings"), _training))
			box.add_child(UITheme.button(DataDB.t("record_start") if not t.recording else DataDB.t("record_stop"), func() -> void:
				if t.recording:
					t.recording = false
				else:
					t.rec = PackedInt32Array()
					t.recording = true
					t.play_pos = 0
				m.call("_toggle_pause")))
		box.add_child(UITheme.button(DataDB.t("reset_position"), func() -> void:
			t.reset_position()
			m.call("_toggle_pause")))
	box.add_child(UITheme.button(DataDB.t("command_list"), _commands))
	box.add_child(UITheme.button(DataDB.t("touch_layout") + ": " + DataDB.t("preset_" + String(Settings.g("touch_preset"))), func() -> void:
		var arr := ["standard", "classic", "assist", "left"]
		var i := arr.find(String(Settings.g("touch_preset")))
		Settings.s("touch_preset", arr[(i + 1) % arr.size()])
		var tcn: TouchControls = m.get("touch")
		if tcn != null:
			tcn._config()
		_main()))
	box.add_child(UITheme.button(DataDB.t("char_select"), func() -> void:
		get_tree().paused = false
		SceneRouter.goto("char_select", {"mode": Game.mode})))
	box.add_child(UITheme.button(DataDB.t("retire"), func() -> void:
		get_tree().paused = false
		SceneRouter.goto("main_menu")))
	box.add_child(UITheme.button(DataDB.t("to_title"), func() -> void:
		get_tree().paused = false
		SceneRouter.goto("title")))
	_center()


func _training() -> void:
	_clear()
	var t: TrainingCtrl = m.get("mode_ctrl")
	box.add_child(UITheme.label(DataDB.t("training_settings"), 30, "display"))
	for k: String in ["dummy", "cpu_level", "after_block", "escape", "tech", "wakeup", "show_frame", "show_input", "show_boxes", "speed", "position"]:
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 8)
		var l := UITheme.label(DataDB.t("opt_" + k), 22)
		l.custom_minimum_size = Vector2(230, 0)
		row.add_child(l)
		var val := Button.new()
		val.custom_minimum_size = Vector2(260, 48)
		val.text = _val_text(k, t.opt[k])
		val.pressed.connect(func() -> void:
			t.cycle(k, 1)
			val.text = _val_text(k, t.opt[k])
			AudioHub.ui("move"))
		val.gui_input.connect(func(ev: InputEvent) -> void:
			if ev.is_action_pressed("ui_left"):
				t.cycle(k, -1)
				val.text = _val_text(k, t.opt[k])
			elif ev.is_action_pressed("ui_right"):
				t.cycle(k, 1)
				val.text = _val_text(k, t.opt[k]))
		row.add_child(val)
		box.add_child(row)
	box.add_child(UITheme.button(DataDB.t("back"), _main))
	_center()


func _val_text(k: String, v: Variant) -> String:
	if v is bool:
		return "ON" if v else "OFF"
	if v is int:
		if k == "speed":
			return "1/%d" % v if int(v) > 1 else "1.0"
		return str(v)
	return DataDB.t("v_" + String(v))


func _commands() -> void:
	_clear()
	var w: SimWorld = m.get("world")
	var cd := w.chars[0]
	box.add_child(UITheme.label(DataDB.t("command_list") + " - " + DataDB.char_name(cd.id), 28, "display"))
	var cats := {"basic": [], "string": [], "special": [], "system": [], "throw": [], "evade": [], "backturn": [], "down_attack": []}
	for mv: MoveDef in cd.moves:
		var c := mv.category if cats.has(mv.category) else "special"
		(cats[c] as Array).append(mv)
	for c2: String in cats:
		var arr: Array = cats[c2]
		if arr.is_empty():
			continue
		box.add_child(UITheme.label("— " + DataDB.t("cat_" + c2) + " —", 20, "bold", UITheme.GOLD))
		for mv2: MoveDef in arr:
			var lv: String = ["上", "中", "下", "特中", "投", "下投", "ダ", "当", "—"][mv2.level]
			var fr := ""
			if mv2.is_strike():
				fr = "  %dF  G%+d" % [mv2.startup, mv2.adv_block]
			var line := "%s   %s   [%s]  %d%s" % [_cmd_text(cd, mv2), DataDB.move_name(cd, mv2), lv, mv2.damage, fr]
			box.add_child(UITheme.label(line, 18))
	box.add_child(UITheme.button(DataDB.t("back"), _main))
	_center()


func _cmd_text(cd: CharDef, mv: MoveDef) -> String:
	if mv.cmd == null:
		return ""
	var pre := ""
	if (mv.from_mask & SE.FROM_RISE) != 0 and (mv.from_mask & SE.FROM_STAND) == 0:
		pre = DataDB.t("trial_rise")
	elif (mv.from_mask & SE.FROM_DASH) != 0 and (mv.from_mask & SE.FROM_STAND) == 0:
		pre = "66"
	elif (mv.from_mask & SE.FROM_RUN) != 0:
		pre = DataDB.t("pre_run")
	elif (mv.from_mask & SE.FROM_EVADE) != 0:
		pre = DataDB.t("pre_evade")
	elif (mv.from_mask & SE.FROM_BACKTURN) != 0:
		pre = DataDB.t("pre_backturn")
	elif (mv.from_mask & SE.FROM_STANCE) != 0 and mv.stance_from >= 0:
		pre = cd.stance_ids[mv.stance_from] + ":"
	elif (mv.from_mask & SE.FROM_OPP_DOWN) != 0:
		pre = DataDB.t("pre_down")
	elif (mv.from_mask & SE.FROM_WALL) != 0:
		pre = DataDB.t("pre_wall")
	var t := mv.cmd.text
	if mv.chain_only:
		# 連携の前段を探す
		for p: MoveDef in cd.moves:
			for k: int in range(p.chain_to.size()):
				if p.chain_to[k] == mv.index:
					return (p.cmd.text if not p.chain_only else "…") + ", " + t
	return pre + t


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("ui_cancel"):
		m.call("_toggle_pause")
		get_viewport().set_input_as_handled()
