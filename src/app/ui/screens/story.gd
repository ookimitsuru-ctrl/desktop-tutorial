extends ScreenBase
## アーケードの物語テキスト（オープニング・ライバル戦前・ボス戦前・エンディング）

var lines: Array[String] = []
var idx := 0
var text_label: Label
var _shown := 0.0
var kind := ""


func build() -> void:
	kind = String(params.get("kind", "opening"))
	var cid := String(params.get("char", "toma"))
	var st := DataDB.story(cid)
	match kind:
		"opening":
			lines.append(DataDB.pick(st.get("opening", ["", ""])))
		"rival":
			for l: Variant in st.get("rival", []):
				lines.append(DataDB.pick(l))
		"boss":
			for l2: Variant in st.get("boss", []):
				lines.append(DataDB.pick(l2))
		"ending":
			lines.append(DataDB.pick(st.get("ending", ["", ""])))
	if lines.is_empty() or lines[0] == "":
		_done.call_deferred()
		return
	var r := safe_rect()
	var pv := CharPreview.new()
	pv.position = Vector2(r.position.x + r.size.x * 0.58, r.position.y)
	pv.size = Vector2(r.size.x * 0.42, r.size.y)
	content.add_child(pv)
	pv.show_char(cid, Game.p_costume[0], Game.p_color[0])
	if kind == "ending":
		pv.play("win")
	var head := UITheme.outline(UITheme.label(DataDB.char_name(cid), 40, "display"), 6)
	head.position = r.position + Vector2(20, 30)
	content.add_child(head)
	var sub := UITheme.outline(UITheme.label(DataDB.char_sub(cid), 18, "bold", UITheme.ACCENT), 4)
	sub.position = r.position + Vector2(22, 84)
	content.add_child(sub)
	var panel := PanelContainer.new()
	panel.position = r.position + Vector2(20, 110)
	panel.size = Vector2(r.size.x * 0.56, r.size.y * 0.62)
	content.add_child(panel)
	text_label = UITheme.label("", 25)
	text_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	text_label.custom_minimum_size = Vector2(r.size.x * 0.52, 0)
	panel.add_child(text_label)
	var hint := UITheme.label(DataDB.t("tap_next"), 18, "body", UITheme.TEXT2)
	hint.position = Vector2(r.position.x + 20, r.position.y + r.size.y - 30)
	content.add_child(hint)
	_show()
	AudioHub.bgm("bgm_ending" if kind == "ending" else "bgm_select")
	add_title_button()


func _show() -> void:
	text_label.text = lines[idx]
	text_label.visible_ratio = 0.0
	_shown = 0.0


func _process(delta: float) -> void:
	if text_label != null and text_label.visible_ratio < 1.0:
		_shown += delta
		text_label.visible_ratio = minf(1.0, _shown * 40.0 / maxf(1.0, text_label.text.length()))


func _input(event: InputEvent) -> void:
	var tap := (event is InputEventScreenTouch and (event as InputEventScreenTouch).pressed) or event.is_action_pressed("ui_accept") \
		or (event is InputEventMouseButton and (event as InputEventMouseButton).pressed)
	if not tap or text_label == null:
		return
	# 「タイトルへ」ボタンの上のタップは会話を進めない
	if title_button != null and (event is InputEventScreenTouch or event is InputEventMouseButton):
		if title_button.get_global_rect().has_point((event as InputEventFromWindow).position if event is InputEventMouseButton else (event as InputEventScreenTouch).position):
			return
	get_viewport().set_input_as_handled()
	if text_label.visible_ratio < 1.0:
		text_label.visible_ratio = 1.0
		return
	idx += 1
	if idx >= lines.size():
		_done()
	else:
		_show()


func _done() -> void:
	set_process_input(false)
	if kind == "ending":
		SceneRouter.goto("records", {"credits": true})
	elif kind == "rival" or kind == "boss":
		# 対戦の準備（相手・ステージ・CPU の強さ）は next_fight が済ませている。ここで next_fight を呼ぶと
		# 同じ会話の画面へ戻ってしまい先へ進めなくなる
		SceneRouter.goto("vs", {"boss": kind == "boss"})
	else:
		ArcadeFlow.next_fight()
