extends ScreenBase
## リプレイ一覧と再生


func build() -> void:
	add_title(DataDB.t("menu_replay"))
	add_back("main_menu")
	var r := safe_rect()
	var sc := ScrollContainer.new()
	sc.position = r.position + Vector2(10, 84)
	sc.size = Vector2(r.size.x - 20, r.size.y - 90)
	content.add_child(sc)
	var vb := VBoxContainer.new()
	vb.add_theme_constant_override("separation", 8)
	sc.add_child(vb)
	var files := ReplayRecorder.list()
	if files.is_empty():
		vb.add_child(UITheme.label(DataDB.t("no_replays"), 24, "body", UITheme.TEXT2))
	var cur_hash := ReplayRecorder.data_hash()
	for p: String in files.slice(0, 50):
		var rp := ReplayRecorder.load_file(p)
		if rp.is_empty():
			continue
		var h: Dictionary = rp["header"]
		var chars: Array = h.get("chars", ["?", "?"])
		var ok := String(h.get("data_hash", "")) == cur_hash
		var txt := "%s   %s vs %s   %s" % [String(h.get("date", "")).replace("T", " "), DataDB.char_name(String(chars[0])), DataDB.char_name(String(chars[1])), DataDB.pick(DataDB.stage_json(String(h.get("stage", "arena"))).get("name", ["", ""]))]
		if not ok:
			txt += "  (" + DataDB.t("replay_old") + ")"
		var b := UITheme.button(txt, _play.bind(p, h), r.size.x - 60)
		b.alignment = HORIZONTAL_ALIGNMENT_LEFT
		b.disabled = not ok
		vb.add_child(b)
	focus_first(vb)


func _play(p: String, h: Dictionary) -> void:
	Game.mode = Game.Mode.REPLAY
	Game.replay_path = p
	var ch: Array = h["chars"]
	Game.p_char = [String(ch[0]), String(ch[1])]
	var co: Array = h.get("costumes", ["a", "a"])
	Game.p_costume = [String(co[0]), String(co[1])]
	var cl: Array = h.get("colors", [0, 1])
	Game.p_color = [int(cl[0]), int(cl[1])]
	Game.p_cpu = [0, 0]
	Game.stage = String(h.get("stage", "arena"))
	Game.seed_value = int(h.get("seed", 1))
	Game.rounds_to_win = int(h.get("rounds_to_win", 2))
	Game.round_seconds = int(h.get("round_seconds", 45))
	Game.ringout = bool(h.get("ringout", true))
	SceneRouter.goto("match", {"mode": Game.Mode.REPLAY})
