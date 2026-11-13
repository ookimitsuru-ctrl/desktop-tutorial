extends ScreenBase
## キャラクター選択（モードに応じて 1 人 / 2 人）

var mode := 0
var slot := 0
var need_two := true
var previews: Array[CharPreview] = []
var name_labels: Array[Label] = []
var info_labels: Array[Label] = []
var machine_labels: Array[Label] = []
var tiles: Array[Button] = []
var chars: PackedStringArray
var vs_cpu := true
var mode_btn: Button
var cpu_btn: Button
var next_btn: Button
var slot_label: Label


func build() -> void:
	mode = int(params.get("mode", Game.mode))
	Game.mode = mode
	Game.setup_match_defaults()
	need_two = mode in [Game.Mode.VERSUS, Game.Mode.TRAINING, Game.Mode.WATCH]
	add_title(DataDB.t("char_select"))
	add_back("main_menu")
	chars = DataDB.characters()
	if not chars.has(Game.p_char[0]):
		Game.p_char[0] = chars[0]
	if not chars.has(Game.p_char[1]):
		Game.p_char[1] = chars[mini(1, chars.size() - 1)]
	var r := safe_rect()
	var pw := r.size.x * 0.27
	for i: int in range(2):
		var pv := CharPreview.new()
		pv.mirror = i == 1
		# ロボット選択: 正面を向いて真っすぐ立ち、体ごとゆっくり回る（左右で逆回り）。全身が入るよう少し引いて、やや下から見る
		pv.spin_speed = 32.0 if i == 0 else -32.0
		pv.cam_dist = 4.6
		pv.cam_h = 0.46
		pv.look_h = 0.5
		pv.position = Vector2(r.position.x + (0.0 if i == 0 else r.size.x - pw), r.position.y + 70)
		pv.size = Vector2(pw, r.size.y - 170)
		content.add_child(pv)
		previews.append(pv)
		# 機体名（パイロット名の上）
		var ml := UITheme.outline(UITheme.label("", 18, "bold", UITheme.ACCENT), 4)
		ml.position = Vector2(pv.position.x + 10, r.position.y + r.size.y - 128)
		ml.size = Vector2(pw - 20, 26)
		ml.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT if i == 0 else HORIZONTAL_ALIGNMENT_RIGHT
		content.add_child(ml)
		machine_labels.append(ml)
		var nl := UITheme.outline(UITheme.label("", 30, "display"), 6)
		nl.position = Vector2(pv.position.x + 10, r.position.y + r.size.y - 100)
		nl.size = Vector2(pw - 20, 40)
		nl.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT if i == 0 else HORIZONTAL_ALIGNMENT_RIGHT
		content.add_child(nl)
		name_labels.append(nl)
		var il := UITheme.outline(UITheme.label("", 18, "body", UITheme.TEXT2), 4)
		il.position = Vector2(pv.position.x + 10, r.position.y + r.size.y - 58)
		il.size = Vector2(pw - 20, 30)
		il.horizontal_alignment = nl.horizontal_alignment
		content.add_child(il)
		info_labels.append(il)
	# 中央: キャラのタイル
	var grid := GridContainer.new()
	grid.columns = 3
	grid.add_theme_constant_override("h_separation", 8)
	grid.add_theme_constant_override("v_separation", 8)
	var gw := r.size.x * 0.42
	grid.position = Vector2(r.position.x + (r.size.x - gw) * 0.5, r.position.y + 96)
	content.add_child(grid)
	for id: String in chars:
		var b := Button.new()
		b.custom_minimum_size = Vector2(gw / 3.0 - 8, 74)
		b.size = b.custom_minimum_size
		# 日本語の長い名前でタイルが広がらないよう、幅を固定して 2 行に折り返す
		b.clip_text = true
		b.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		var locked := id == "gensai" and not SaveData.unlocked("char_gensai")
		var tn := DataDB.char_name(id)
		# 長い日本語の名前は「・」の後で改行する（任意の位置で折り返すと名前の途中で切れる）
		if tn.length() > 6 and tn.contains("・"):
			tn = tn.replace("・", "・\n")
		b.text = tn if not locked else "？？？"
		b.disabled = locked
		var longest := 0
		for part: String in tn.split("\n"):
			longest = maxi(longest, part.length())
		b.add_theme_font_size_override("font_size", 19 if longest <= 6 else 17)
		b.pressed.connect(_pick.bind(id))
		b.focus_entered.connect(func() -> void:
			AudioHub.ui("move")
			_hover(id))
		grid.add_child(b)
		tiles.append(b)
	var rnd := Button.new()
	rnd.text = DataDB.t("random")
	rnd.custom_minimum_size = Vector2(gw / 3.0 - 8, 74)
	rnd.pressed.connect(func() -> void:
		var pool: Array[String] = []
		for c: String in chars:
			if c != "gensai" or SaveData.unlocked("char_gensai"):
				pool.append(c)
		_pick(pool[randi() % pool.size()]))
	grid.add_child(rnd)
	# 操作ボタン
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	row.position = Vector2(grid.position.x, r.position.y + r.size.y - 170)
	content.add_child(row)
	row.add_child(UITheme.button(DataDB.t("costume"), _toggle_costume, gw / 2.0 - 4))
	row.add_child(UITheme.button(DataDB.t("color"), _cycle_color, gw / 2.0 - 4))
	var row2 := HBoxContainer.new()
	row2.add_theme_constant_override("separation", 8)
	row2.position = Vector2(grid.position.x, r.position.y + r.size.y - 106)
	content.add_child(row2)
	if mode == Game.Mode.VERSUS:
		mode_btn = UITheme.button("", _toggle_vs, gw / 2.0 - 4)
		row2.add_child(mode_btn)
	if mode in [Game.Mode.VERSUS, Game.Mode.WATCH, Game.Mode.ARCADE, Game.Mode.SURVIVAL, Game.Mode.TIME_ATTACK]:
		cpu_btn = UITheme.button("", _cycle_cpu, gw / 2.0 - 4)
		row2.add_child(cpu_btn)
	next_btn = UITheme.button(DataDB.t("decide"), _next, gw)
	next_btn.position = Vector2(grid.position.x, r.position.y + r.size.y - 44)
	content.add_child(next_btn)
	slot_label = UITheme.outline(UITheme.label("", 24, "bold", UITheme.P1), 5)
	slot_label.position = Vector2(grid.position.x, r.position.y + 62)
	content.add_child(slot_label)
	if mode == Game.Mode.WATCH:
		Game.p_cpu = [6, 6]
	elif mode == Game.Mode.VERSUS:
		Game.p_cpu = [0, int(Settings.g("cpu_level"))] if vs_cpu else [0, 0]
	elif mode == Game.Mode.TRAINING or mode == Game.Mode.TRIAL:
		Game.p_cpu = [0, 0]
	else:
		Game.p_cpu = [0, int(Settings.g("cpu_level"))]
	InputHub.assign = [["touch", "kb1", "pad"], []]
	_refresh()
	AudioHub.bgm("bgm_select")
	if not tiles.is_empty():
		tiles[maxi(0, chars.find(Game.p_char[0]))].grab_focus.call_deferred()


func _hover(id: String) -> void:
	var changed: bool = previews[slot].char_id != id
	previews[slot].show_char(id, Game.p_costume[slot], Game.p_color[slot])
	if changed:
		previews[slot].play("stand")
	_info(slot, id)


func _info(i: int, id: String) -> void:
	var cj := DataDB.char_json(id)
	name_labels[i].text = DataDB.char_name(id)
	_fit(name_labels[i], 30, 18)
	machine_labels[i].text = DataDB.char_sub(id)
	_fit(machine_labels[i], 18, 12)
	var stars := "★".repeat(int(cj.get("difficulty", 2))) + "☆".repeat(5 - int(cj.get("difficulty", 2)))
	info_labels[i].text = "%s  %s" % [DataDB.pick(cj.get("style", ["", ""])), stars]


## ラベルの幅に収まるまで文字を小さくする
func _fit(l: Label, max_size: int, min_size: int) -> void:
	var font := l.get_theme_font("font")
	var fs := max_size
	while fs > min_size and font.get_string_size(l.text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x > l.size.x:
		fs -= 1
	l.add_theme_font_size_override("font_size", fs)


func _pick(id: String) -> void:
	Game.p_char[slot] = id
	AudioHub.ui("ok")
	previews[slot].show_char(id, Game.p_costume[slot], Game.p_color[slot])
	previews[slot].play("stand")
	_refresh()


func _toggle_costume() -> void:
	var id: String = Game.p_char[slot]
	var nxt := "b" if Game.p_costume[slot] == "a" else "a"
	if nxt == "b" and not SaveData.unlocked("costume_" + id):
		AudioHub.ui("back")
		slot_label.text = DataDB.t("locked_costume")
		return
	if not FileAccess.file_exists("res://assets/characters/%s/%s_%s.glb" % [id, id, nxt]):
		return
	Game.p_costume[slot] = nxt
	_refresh()


func _cycle_color() -> void:
	var id: String = Game.p_char[slot]
	for k: int in range(1, 5):
		var c: int = (int(Game.p_color[slot]) + k) % 4
		if c < 2 or SaveData.unlocked("color%d_%s" % [c + 1, id]):
			Game.p_color[slot] = c
			break
	_refresh()


func _toggle_vs() -> void:
	vs_cpu = not vs_cpu
	Game.p_cpu[1] = int(Settings.g("cpu_level")) if vs_cpu else 0
	InputHub.assign = [["touch", "kb1", "pad"], []] if vs_cpu else [["touch", "kb1"], ["kb2", "pad"]]
	_refresh()


func _cycle_cpu() -> void:
	var i := 1 if Game.p_cpu[1] > 0 else 0
	if mode == Game.Mode.WATCH:
		i = slot
	if mode in [Game.Mode.ARCADE, Game.Mode.SURVIVAL, Game.Mode.TIME_ATTACK]:
		var lv := int(Settings.g("cpu_level")) % 8 + 1
		Settings.s("cpu_level", lv)
		_refresh()
		return
	Game.p_cpu[i] = Game.p_cpu[i] % 8 + 1
	Settings.s("cpu_level", Game.p_cpu[i])
	_refresh()


func _refresh() -> void:
	for i: int in range(2):
		previews[i].visible = i == 0 or need_two
		name_labels[i].visible = previews[i].visible
		info_labels[i].visible = previews[i].visible
		machine_labels[i].visible = previews[i].visible
		if previews[i].visible:
			var changed: bool = previews[i].char_id != Game.p_char[i]
			previews[i].show_char(Game.p_char[i], Game.p_costume[i], Game.p_color[i])
			if changed:
				previews[i].play("stand")
			_info(i, Game.p_char[i])
	var who := ""
	match mode:
		Game.Mode.TRAINING:
			who = DataDB.t("slot_player") if slot == 0 else DataDB.t("slot_dummy")
		Game.Mode.WATCH:
			who = "CPU %d" % (slot + 1)
		Game.Mode.VERSUS:
			who = "1P" if slot == 0 else ("CPU" if vs_cpu else "2P")
		_:
			who = "1P"
	slot_label.text = "▶ " + who
	slot_label.add_theme_color_override("font_color", UITheme.P1 if slot == 0 else UITheme.P2)
	if mode_btn != null:
		mode_btn.text = DataDB.t("vs_cpu") if vs_cpu else DataDB.t("vs_2p")
	if cpu_btn != null:
		if mode in [Game.Mode.ARCADE, Game.Mode.SURVIVAL, Game.Mode.TIME_ATTACK]:
			cpu_btn.text = "%s %d" % [DataDB.t("difficulty"), int(Settings.g("cpu_level"))]
		elif mode == Game.Mode.WATCH:
			cpu_btn.text = "CPU%d Lv %d" % [slot + 1, Game.p_cpu[slot]]
		else:
			cpu_btn.text = "CPU Lv %d" % Game.p_cpu[1] if vs_cpu else "—"
			cpu_btn.disabled = not vs_cpu


func _next() -> void:
	if need_two and slot == 0:
		slot = 1
		Game.ensure_colors_differ()
		_refresh()
		tiles[maxi(0, chars.find(Game.p_char[1]))].grab_focus()
		return
	Game.ensure_colors_differ()
	match mode:
		Game.Mode.ARCADE:
			ArcadeFlow.start(Game.p_char[0])
		Game.Mode.SURVIVAL:
			ArcadeFlow.start_survival(Game.p_char[0])
		Game.Mode.TIME_ATTACK:
			ArcadeFlow.start_time_attack(Game.p_char[0])
		Game.Mode.TRIAL:
			Game.p_char[1] = "toma" if Game.p_char[0] != "toma" else "zaw" if chars.has("zaw") else "toma"
			Game.stage = "arena"
			Game.trial_index = 0
			SceneRouter.goto("vs")
		_:
			SceneRouter.goto("stage_select")


func go_back() -> void:
	if slot == 1:
		slot = 0
		_refresh()
		return
	super.go_back()
