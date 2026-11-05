extends ScreenBase
## リザルト

var preview: CharPreview


func build() -> void:
	var r := safe_rect()
	var winner := int(params.get("winner", -1))
	# 戦績・実績（結果画面の構築は 1 試合につき 1 回）
	var new_ach := Progress.on_match(params)
	if not bool(Settings.g("unlock_all")):
		for a_id: String in new_ach:
			SceneRouter.toast(DataDB.t("achievement_unlocked") % Progress.achievement_name(a_id))
	var chars: Array = params.get("chars", Game.p_char)
	var title := DataDB.t("draw")
	if winner == 0 or winner == 1:
		title = DataDB.char_name(String(chars[winner])) + " " + DataDB.t("wins")
	add_title(title)
	preview = CharPreview.new()
	preview.position = Vector2(r.position.x + r.size.x * 0.5, r.position.y + 40)
	preview.size = Vector2(r.size.x * 0.5, r.size.y - 40)
	content.add_child(preview)
	if winner == 0 or winner == 1:
		preview.show_char(String(chars[winner]), Game.p_costume[winner], Game.p_color[winner])
		preview.play("win")
	# 勝利台詞
	if winner == 0 or winner == 1:
		var story := DataDB.story(String(chars[winner]))
		var lines: Array = story.get("win_quotes", [])
		if not lines.is_empty():
			var q := UITheme.outline(UITheme.label("「" + DataDB.pick(lines[randi() % lines.size()]) + "」", 24, "bold"), 5)
			q.position = r.position + Vector2(14, 84)
			q.size = Vector2(r.size.x * 0.48, 80)
			q.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
			content.add_child(q)
	var stats: Array = params.get("stats", [])
	if stats.size() == 2:
		var grid := GridContainer.new()
		grid.columns = 3
		grid.add_theme_constant_override("h_separation", 26)
		grid.position = r.position + Vector2(14, 170)
		content.add_child(grid)
		for k: String in ["", "1P", "2P"]:
			grid.add_child(UITheme.label(k, 20, "bold", UITheme.GOLD))
		for key: String in ["damage", "max_combo", "counters", "escapes", "evades"]:
			grid.add_child(UITheme.label(DataDB.t("stat_" + key), 20))
			grid.add_child(UITheme.label(str(stats[0].get(key, 0)), 20, "num"))
			grid.add_child(UITheme.label(str(stats[1].get(key, 0)), 20, "num"))
	var items: Array = []
	match Game.mode:
		Game.Mode.ARCADE, Game.Mode.TIME_ATTACK, Game.Mode.SURVIVAL:
			var nxt := ArcadeFlow.on_result(params)
			match nxt:
				"next":
					items.append([DataDB.t("next_fight"), func() -> void:
						if Game.mode == Game.Mode.SURVIVAL:
							ArcadeFlow.next_survival()
						else:
							ArcadeFlow.next_fight()])
				"ending":
					items.append([DataDB.t("next"), func() -> void: SceneRouter.goto("story", {"kind": "ending", "char": Game.arcade["char"]})])
				"continue":
					items.append([DataDB.t("continue"), func() -> void:
						Game.arcade["continues"] = int(Game.arcade["continues"]) + 1
						ArcadeFlow.next_fight()])
					items.append([DataDB.t("give_up"), func() -> void: SceneRouter.goto("main_menu")])
				"over":
					var s := UITheme.outline(UITheme.label(DataDB.t("survival_result") % int(Game.survival["wins"]), 30, "display", UITheme.GOLD), 6)
					s.position = r.position + Vector2(14, r.size.y - 230)
					content.add_child(s)
					items.append([DataDB.t("main_menu"), func() -> void: SceneRouter.goto("main_menu")])
		_:
			if winner == 0 and Game.p_cpu[1] > 0:
				SaveData.add_rank_points(int(Game.p_cpu[1]) * 2)
				SaveData.add_stat("wins_" + Game.p_char[0])
				if SaveData.stat("wins_" + Game.p_char[0]) >= 20:
					SaveData.unlock("color3_" + Game.p_char[0])
			items.append([DataDB.t("rematch"), func() -> void:
				Game.seed_value = int(Time.get_unix_time_from_system()) & 0x7FFFFFFF
				SceneRouter.goto("vs")])
			items.append([DataDB.t("char_select"), func() -> void: SceneRouter.goto("char_select", {"mode": Game.mode})])
			items.append([DataDB.t("main_menu"), func() -> void: SceneRouter.goto("main_menu")])
	items.append([DataDB.t("to_title"), func() -> void: SceneRouter.goto("title")])
	var vb := vbox_menu(items, r.position + Vector2(14, r.size.y - 190 - (40 if items.size() > 3 else 0)), 360)
	focus_first(vb)
	SaveData.save_profile()
	AudioHub.bgm("bgm_result_win" if winner == 0 else "bgm_result_lose", 0.3)
