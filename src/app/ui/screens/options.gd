extends ScreenBase
## オプション（全設定項目）。仕様: 08 §8.7

const ROWS := [
	["cat_game", ""],
	["rounds_to_win", [1, 2, 3, 4, 5]],
	["round_seconds", [30, 45, 60, 99999]],
	["ringout", [true, false]],
	["intros", ["full", "short", "skip"]],
	["language", ["ja", "en"]],
	["cat_controls", ""],
	["touch_preset", ["standard", "classic", "assist", "left"]],
	["stick_mode", ["floating", "fixed"]],
	["stick_deadzone", [10, 15, 22, 30, 40]],
	["stick_diag_deg", [30, 36, 40, 45]],
	["button_scale", [70, 85, 100, 115, 130, 140]],
	["touch_opacity", [20, 40, 55, 70, 85, 100]],
	["vibration", [0, 1, 2, 3]],
	["assist_escape", [false, true]],
	["cat_display", ""],
	["quality", ["auto", "low", "medium", "high", "ultra"]],
	["render_scale", [0, 50, 60, 70, 80, 90, 100]],
	["show_fps", [false, true]],
	["power_save", [false, true]],
	["camera_shake", [0, 50, 100]],
	["text_size", ["standard", "large", "xlarge"]],
	["cat_sound", ""],
	["vol_master", [0, 20, 40, 60, 80, 100]],
	["vol_bgm", [0, 20, 40, 60, 70, 80, 100]],
	["vol_sfx", [0, 20, 40, 60, 85, 100]],
	["vol_voice", [0, 20, 40, 60, 85, 100]],
	["vol_announcer", [0, 20, 40, 60, 85, 100]],
	["cat_access", ""],
	["photosensitive", [false, true]],
	["stagger_gauge", [true, false]],
	["cat_data", ""],
	["replay_autosave", [true, false]],
	["unlock_all", [false, true]],
]

var box: VBoxContainer


func build() -> void:
	add_title(DataDB.t("menu_options"))
	add_back("main_menu")
	var r := safe_rect()
	var sc := ScrollContainer.new()
	sc.position = r.position + Vector2(10, 84)
	sc.size = Vector2(r.size.x - 20, r.size.y - 90)
	sc.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	content.add_child(sc)
	box = VBoxContainer.new()
	box.add_theme_constant_override("separation", 6)
	sc.add_child(box)
	for row: Array in ROWS:
		var key := String(row[0])
		if key.begins_with("cat_"):
			var l := UITheme.label("— " + DataDB.t(key) + " —", 22, "bold", UITheme.GOLD)
			box.add_child(l)
			continue
		var h := HBoxContainer.new()
		h.add_theme_constant_override("separation", 12)
		var nl := UITheme.label(DataDB.t("set_" + key), 22)
		nl.custom_minimum_size = Vector2(380, 0)
		h.add_child(nl)
		var b := Button.new()
		b.custom_minimum_size = Vector2(300, 48)
		b.text = _fmt(key, Settings.g(key))
		var choices: Array = row[1]
		b.pressed.connect(func() -> void:
			_cycle(key, choices, 1)
			b.text = _fmt(key, Settings.g(key))
			AudioHub.ui("move"))
		b.gui_input.connect(func(ev: InputEvent) -> void:
			if ev.is_action_pressed("ui_left"):
				_cycle(key, choices, -1)
				b.text = _fmt(key, Settings.g(key))
			elif ev.is_action_pressed("ui_right"):
				_cycle(key, choices, 1)
				b.text = _fmt(key, Settings.g(key)))
		h.add_child(b)
		box.add_child(h)
	var reset := UITheme.button(DataDB.t("reset_save"), _confirm_reset, 380)
	box.add_child(reset)
	box.add_child(UITheme.button(DataDB.t("licenses"), func() -> void: SceneRouter.goto("records", {"licenses": true}), 380))
	focus_first(box.get_child(1))


func _cycle(key: String, choices: Array, d: int) -> void:
	var cur: Variant = Settings.g(key)
	var i := choices.find(cur)
	i = (i + d + choices.size()) % choices.size()
	Settings.s(key, choices[i])
	if key == "language" or key == "text_size":
		get_tree().root.theme = UITheme.build_theme()


func _fmt(key: String, v: Variant) -> String:
	if v is bool:
		return "ON" if v else "OFF"
	if key == "round_seconds" and int(v) > 999:
		return "∞"
	if key == "render_scale" and int(v) == 0:
		return DataDB.t("v_auto")
	if v is float or v is int:
		return str(int(v))
	return DataDB.t("v_" + String(v))


var _confirm := 0


func _confirm_reset() -> void:
	_confirm += 1
	if _confirm < 2:
		AudioHub.ui("back")
		return
	DirAccess.remove_absolute(SaveData.PROFILE)
	SaveData.load_profile()
	_confirm = 0
	AudioHub.ui("ok")
