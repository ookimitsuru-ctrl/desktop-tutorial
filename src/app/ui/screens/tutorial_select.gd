extends ScreenBase
## チュートリアルの課の選択


func build() -> void:
	add_title(DataDB.t("menu_tutorial"))
	add_back("main_menu")
	var r := safe_rect()
	var sc := ScrollContainer.new()
	sc.position = r.position + Vector2(10, 84)
	sc.size = Vector2(r.size.x * 0.6, r.size.y - 90)
	content.add_child(sc)
	var vb := VBoxContainer.new()
	vb.add_theme_constant_override("separation", 8)
	sc.add_child(vb)
	for k: int in range(12):
		var mark := "✓ " if SaveData.unlocked("tutorial_%d" % k) else "   "
		var b := UITheme.button("%s%d. %s" % [mark, k + 1, DataDB.t("tut%d_title" % k)], _go.bind(k), r.size.x * 0.55)
		b.alignment = HORIZONTAL_ALIGNMENT_LEFT
		vb.add_child(b)
	focus_first(vb)


func _go(k: int) -> void:
	Game.tutorial_lesson = k
	Game.mode = Game.Mode.TUTORIAL
	Game.p_cpu = [0, 0]
	SceneRouter.goto("vs")
