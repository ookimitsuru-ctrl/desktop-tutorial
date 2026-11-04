extends ScreenBase
## ギャラリー: エンディング・キャラクター（プロフィールとモデル）・BGM・実績。仕様: 06 §6.1, §6.10

const TRACKS: Array = [
	["title", ["タイトル", "Title"]], ["menu", ["メインメニュー", "Main Menu"]], ["select", ["キャラクター選択", "Character Select"]],
	["arena", ["大闘技場", "Grand Arena"]], ["harbor", ["埠頭の夜", "Night Harbor"]], ["bamboo", ["竹林の石舞台", "Bamboo Stage"]],
	["fort", ["雪原の砦跡", "Snowfield Fort"]], ["ruins", ["砂漠の遺跡", "Desert Ruins"]], ["skyline", ["摩天楼ヘリポート", "Skyline Helipad"]],
	["temple", ["古寺の中庭", "Temple Courtyard"]], ["raft", ["川の筏", "River Raft"]], ["boss", ["嵐の灯台", "Lighthouse in the Storm"]],
	["training", ["トレーニング", "Training"]], ["ending", ["エンディング", "Ending"]],
	["result_win", ["勝利", "Victory"]], ["result_lose", ["敗北", "Defeat"]],
]
const ALWAYS := ["title", "menu", "select", "training", "result_win", "result_lose"]

var panel: Control
var preview: CharPreview
var tab := "endings"
var sel_char := "toma"
var costume := "a"
var color := 0
var anims: Array[String] = ["idle", "win", "intro"]
var anim_i := 0
var rot := 0.0


func build() -> void:
	add_title(DataDB.t("menu_gallery"))
	add_back("main_menu")
	var r := safe_rect()
	var tabs := HBoxContainer.new()
	tabs.add_theme_constant_override("separation", 8)
	tabs.position = r.position + Vector2(10, 80)
	content.add_child(tabs)
	for t: Array in [["endings", "gallery_endings"], ["chars", "gallery_chars"], ["bgm", "gallery_bgm"], ["ach", "achievements"]]:
		var b := UITheme.button(DataDB.t(String(t[1])), _tab.bind(String(t[0])), 200)
		tabs.add_child(b)
	panel = Control.new()
	panel.position = r.position + Vector2(10, 150)
	panel.size = Vector2(r.size.x - 20, r.size.y - 160)
	content.add_child(panel)
	focus_first(tabs)
	_show()
	AudioHub.bgm("bgm_menu")


func _tab(t: String) -> void:
	tab = t
	AudioHub.ui("ok")
	_show()


func _clear() -> void:
	for c: Node in panel.get_children():
		panel.remove_child(c)
		c.queue_free()
	preview = null


func _scroll_list(width: float) -> VBoxContainer:
	var sc := ScrollContainer.new()
	sc.size = Vector2(width, panel.size.y)
	sc.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	panel.add_child(sc)
	var vb := VBoxContainer.new()
	vb.add_theme_constant_override("separation", 8)
	sc.add_child(vb)
	return vb


func _show() -> void:
	_clear()
	match tab:
		"endings":
			_show_endings()
		"chars":
			_show_chars()
		"bgm":
			_show_bgm()
		"ach":
			_show_ach()


# ------------------------------------------------------------ エンディング

func _show_endings() -> void:
	var vb := _scroll_list(300)
	for id: String in DataDB.characters():
		var ok := SaveData.unlocked("ending_" + id)
		var b := UITheme.button(DataDB.char_name(id) if ok else "？？？", _ending.bind(id), 280)
		b.disabled = not ok
		vb.add_child(b)
	var info := UITheme.label(DataDB.t("gallery_endings_hint"), 22, "body", UITheme.TEXT2)
	info.position = Vector2(320, 0)
	info.size = Vector2(panel.size.x * 0.4, 100)
	info.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	info.name = "Info"
	panel.add_child(info)


func _ending(id: String) -> void:
	AudioHub.ui("ok")
	var info := panel.get_node_or_null("Info") as Label
	if info != null:
		info.text = DataDB.pick(DataDB.story(id).get("ending", ["", ""]))
		info.add_theme_color_override("font_color", UITheme.TEXT)
		info.size = Vector2(panel.size.x * 0.40, panel.size.y)
	_ensure_preview(id, panel.size.x * 0.32)
	preview.play("win")
	AudioHub.bgm("bgm_ending")


# ------------------------------------------------------------ キャラクター

func _show_chars() -> void:
	var vb := _scroll_list(240)
	for id: String in DataDB.characters():
		var locked := id == "gensai" and not SaveData.unlocked("char_gensai")
		var b := UITheme.button(DataDB.char_name(id) if not locked else "？？？", _char.bind(id), 220)
		b.disabled = locked
		vb.add_child(b)
	var info := UITheme.label("", 21)
	info.position = Vector2(260, 0)
	info.size = Vector2(panel.size.x * 0.36, panel.size.y - 70)
	info.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	info.name = "Info"
	panel.add_child(info)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 6)
	row.position = Vector2(260, panel.size.y - 60)
	panel.add_child(row)
	row.add_child(UITheme.button(DataDB.t("costume"), _cycle_costume, 150))
	row.add_child(UITheme.button(DataDB.t("color"), _cycle_color, 150))
	row.add_child(UITheme.button(DataDB.t("gallery_pose"), _cycle_anim, 150))
	row.add_child(UITheme.button("⟲", func() -> void: _rotate(-35.0), 60))
	row.add_child(UITheme.button("⟳", func() -> void: _rotate(35.0), 60))
	_char(sel_char)


func _char(id: String) -> void:
	sel_char = id
	costume = "a"
	color = 0
	anim_i = 0
	var cj := DataDB.char_json(id)
	var st := DataDB.story(id)
	var pf: Dictionary = st.get("profile", {})
	var lines: Array[String] = []
	lines.append(DataDB.char_name(id))
	lines.append(DataDB.pick(cj.get("style", ["", ""])))
	lines.append("")
	if not pf.is_empty():
		lines.append("%s: %s" % [DataDB.t("profile_age"), String(pf.get("age", ""))])
		lines.append("%s: %s" % [DataDB.t("profile_origin"), DataDB.pick(pf.get("origin", ["", ""]))])
		lines.append("%s: %s" % [DataDB.t("profile_size"), String(pf.get("size", ""))])
		lines.append("")
		lines.append(DataDB.pick(pf.get("bio", ["", ""])))
	var q: Array = st.get("win_quotes", [])
	if not q.is_empty():
		lines.append("")
		lines.append("「%s」" % DataDB.pick(q[0]))
	var info := panel.get_node_or_null("Info") as Label
	if info != null:
		info.text = "\n".join(lines)
	_ensure_preview(id, panel.size.x * 0.36)
	preview.show_char(id, costume, color)
	preview.play("idle")


func _ensure_preview(id: String, w: float) -> void:
	if preview == null:
		preview = CharPreview.new()
		preview.position = Vector2(panel.size.x - w, -40)
		preview.size = Vector2(w, panel.size.y + 40)
		panel.add_child(preview)
	preview.show_char(id, costume, color)


func _cycle_costume() -> void:
	var nxt := "b" if costume == "a" else "a"
	if nxt == "b" and not SaveData.unlocked("costume_" + sel_char):
		SceneRouter.toast(DataDB.t("locked_costume"), 1.5)
		return
	costume = nxt
	preview.show_char(sel_char, costume, color)


func _cycle_color() -> void:
	for k: int in range(1, 5):
		var c := (color + k) % 4
		if c < 2 or SaveData.unlocked("color%d_%s" % [c + 1, sel_char]):
			color = c
			break
	preview.show_char(sel_char, costume, color)


func _cycle_anim() -> void:
	anim_i = (anim_i + 1) % anims.size()
	preview.play(anims[anim_i])


func _rotate(d: float) -> void:
	if preview != null and preview.model != null:
		preview.model.rotation_degrees.y += d


# ------------------------------------------------------------ BGM

func _bgm_unlocked(id: String) -> bool:
	if id in ALWAYS:
		return true
	if id == "ending":
		return Progress.count_unlocks("ending_") > 0 or SaveData.unlocked("ending_toma")
	return SaveData.unlocked("bgm_" + id)


func _show_bgm() -> void:
	var vb := _scroll_list(panel.size.x * 0.6)
	for t: Array in TRACKS:
		var id := String(t[0])
		var ok := _bgm_unlocked(id)
		var b := UITheme.button(("♪  " + DataDB.pick(t[1])) if ok else "？？？", _play_bgm.bind(id), panel.size.x * 0.55)
		b.alignment = HORIZONTAL_ALIGNMENT_LEFT
		b.disabled = not ok
		vb.add_child(b)


func _play_bgm(id: String) -> void:
	AudioHub.bgm("bgm_" + id, 0.4)


# ------------------------------------------------------------ 実績

func _show_ach() -> void:
	var defs := Progress.defs()
	var got := 0
	for d: Dictionary in defs:
		if SaveData.has_unlock("ach_" + String(d["id"])):
			got += 1
	var vb := _scroll_list(panel.size.x)
	vb.add_child(UITheme.label("%s  %d / %d" % [DataDB.t("achievements"), got, defs.size()], 26, "bold", UITheme.GOLD))
	for d2: Dictionary in defs:
		var ok := SaveData.has_unlock("ach_" + String(d2["id"]))
		var l := UITheme.label(("★ " if ok else "☆ ") + DataDB.pick(d2["name"]) + "  —  " + DataDB.pick(d2["desc"]), 21, "body", UITheme.TEXT if ok else UITheme.TEXT2)
		l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		l.custom_minimum_size = Vector2(panel.size.x - 30, 0)
		vb.add_child(l)
