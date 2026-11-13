extends ScreenBase
## 記録・ギャラリー・クレジット・ライセンス


func build() -> void:
	var licenses := bool(params.get("licenses", false))
	var credits := bool(params.get("credits", false))
	add_title(DataDB.t("licenses") if licenses else (DataDB.t("credits") if credits else DataDB.t("menu_records")))
	add_back("main_menu")
	var r := safe_rect()
	var sc := ScrollContainer.new()
	sc.position = r.position + Vector2(10, 84)
	sc.size = Vector2(r.size.x - 20, r.size.y - 90)
	content.add_child(sc)
	var vb := VBoxContainer.new()
	vb.add_theme_constant_override("separation", 6)
	sc.add_child(vb)
	var add := func(t: String, size: int = 20, color: Color = UITheme.TEXT) -> void:
		var l := UITheme.label(t, size, "body", color)
		l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		l.custom_minimum_size = Vector2(r.size.x - 60, 0)
		vb.add_child(l)
	if licenses or credits:
		var f := FileAccess.open("res://docs/CREDITS.md", FileAccess.READ)
		if f != null:
			add.call(f.get_as_text(), 18)
		if licenses:
			add.call("\n— Godot Engine —\n" + Engine.get_license_text(), 14, UITheme.TEXT2)
			# エンジンが含むサードパーティ部品の著作権表示とライセンス
			var parts := ""
			for info: Dictionary in Engine.get_copyright_info():
				parts += "\n" + String(info.get("name", ""))
				for pt: Dictionary in info.get("parts", []):
					for c: Variant in pt.get("copyright", []):
						parts += "\n  © " + String(c)
					parts += "\n  License: " + String(pt.get("license", ""))
			add.call("\n— Third-party components —" + parts, 12, UITheme.TEXT2)
			var lic := ""
			var li: Dictionary = Engine.get_license_info()
			for k: String in li:
				lic += "\n\n[" + k + "]\n" + String(li[k])
			add.call("\n— Licenses —" + lic, 11, UITheme.TEXT2)
		focus_first(content)
		return
	add.call("%s: %s  (%d pt)" % [DataDB.t("rank"), SaveData.rank_name(), int(SaveData.profile.get("rank_points", 0))], 26, UITheme.GOLD)
	add.call("— " + DataDB.t("records") + " —", 22, UITheme.GOLD)
	var rec: Dictionary = SaveData.profile.get("records", {})
	if rec.is_empty():
		add.call(DataDB.t("no_records"), 20, UITheme.TEXT2)
	for k: String in rec:
		var v := int(rec[k])
		var txt := str(v)
		if k.begins_with("time_attack"):
			txt = "%d:%05.2f" % [v / 3600, (v % 3600) / 60.0]
		add.call("%s : %s" % [k, txt])
	add.call("— " + DataDB.t("endings") + " —", 22, UITheme.GOLD)
	for id: String in DataDB.characters():
		if SaveData.unlocked("ending_" + id):
			add.call(DataDB.char_name(id) + "\n" + DataDB.pick(DataDB.story(id).get("ending", ["", ""])), 18)
		else:
			add.call(DataDB.char_name(id) + " : ？？？", 18, UITheme.TEXT2)
