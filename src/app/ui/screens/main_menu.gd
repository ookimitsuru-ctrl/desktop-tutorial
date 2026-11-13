extends ScreenBase
## メインメニュー

var preview: CharPreview


func build() -> void:
	add_title("RINGBOUND")
	var r := safe_rect()
	var arcade_ok := true
	var items := [
		[DataDB.t("menu_quick"), _quick],
		[DataDB.t("menu_arcade"), func() -> void: _select(Game.Mode.ARCADE)],
		[DataDB.t("menu_versus"), func() -> void: _select(Game.Mode.VERSUS)],
		[DataDB.t("menu_training"), func() -> void: _select(Game.Mode.TRAINING)],
		[DataDB.t("menu_tutorial"), _tutorial],
		[DataDB.t("menu_trial"), func() -> void: _select(Game.Mode.TRIAL)],
		[DataDB.t("menu_survival"), func() -> void: _select(Game.Mode.SURVIVAL), arcade_ok],
		[DataDB.t("menu_time_attack"), func() -> void: _select(Game.Mode.TIME_ATTACK), arcade_ok],
		[DataDB.t("menu_watch"), func() -> void: _select(Game.Mode.WATCH)],
		[DataDB.t("menu_replay"), func() -> void: SceneRouter.goto("replays")],
		[DataDB.t("menu_records"), func() -> void: SceneRouter.goto("records")],
		[DataDB.t("menu_gallery"), func() -> void: SceneRouter.goto("gallery")],
		[DataDB.t("menu_options"), func() -> void: SceneRouter.goto("options")],
	]
	var sc := ScrollContainer.new()
	sc.position = r.position + Vector2(10, 90)
	sc.size = Vector2(420, r.size.y - 100)
	sc.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	content.add_child(sc)
	var vb := VBoxContainer.new()
	vb.add_theme_constant_override("separation", 8)
	sc.add_child(vb)
	for it: Array in items:
		var b := UITheme.button(String(it[0]), it[1], 400)
		b.alignment = HORIZONTAL_ALIGNMENT_LEFT
		if it.size() > 2 and not bool(it[2]):
			b.disabled = true
		vb.add_child(b)
	focus_first(vb)
	preview = CharPreview.new()
	preview.position = Vector2(r.position.x + r.size.x * 0.45, r.position.y)
	preview.size = Vector2(r.size.x * 0.55, r.size.y)
	# メインメニューでは構えずに堂々と立つ。箱絵のように少し下から見上げ、足先まで入るよう引く
	preview.cam_dist = 3.9
	preview.cam_h = 0.34
	preview.look_h = 0.52
	content.add_child(preview)
	preview.show_char(Game.p_char[0] if Game.p_char[0] != "" else "toma", Game.p_costume[0], Game.p_color[0])
	preview.play("rest")
	var rank := UITheme.outline(UITheme.label("%s  %s" % [DataDB.t("rank"), SaveData.rank_name()], 22, "bold", UITheme.GOLD), 5)
	rank.position = Vector2(r.position.x + r.size.x - 340, r.position.y + r.size.y - 40)
	content.add_child(rank)
	AudioHub.bgm("bgm_menu")


func _select(mode: int) -> void:
	Game.mode = mode
	SceneRouter.goto("char_select", {"mode": mode})


func _quick() -> void:
	Game.mode = Game.Mode.VERSUS
	Game.setup_match_defaults()
	var chars := DataDB.characters()
	if Game.p_char[0] == "" or not chars.has(Game.p_char[0]):
		Game.p_char[0] = chars[0]
	Game.p_char[1] = chars[randi() % chars.size()]
	Game.p_cpu = [0, int(Settings.g("cpu_level"))]
	var st := DataDB.stages()
	Game.stage = st[randi() % st.size()]
	if Game.stage == "lighthouse" and not SaveData.unlocked("stage_lighthouse"):
		Game.stage = "arena"
	Game.ensure_colors_differ()
	InputHub.assign = [["touch", "kb1", "pad"], []]
	SceneRouter.goto("vs")


func _tutorial() -> void:
	Game.mode = Game.Mode.TUTORIAL
	Game.p_char = ["toma", "toma"]
	Game.p_costume = ["a", "a"]
	Game.p_color = [0, 1]
	Game.p_cpu = [0, 0]
	Game.stage = "arena"
	Game.setup_match_defaults()
	SceneRouter.goto("tutorial_select")
