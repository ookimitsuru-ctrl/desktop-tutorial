extends ScreenBase
## VS 画面（この間にデータとモデルを先読み）

var _t := 0.0
var _ready_go := false
var boss := false


func build() -> void:
	boss = bool(params.get("boss", false))
	var vs := get_viewport_rect().size
	for i: int in range(2):
		var pv := CharPreview.new()
		pv.mirror = i == 1
		pv.cam_dist = 2.4
		pv.size = Vector2(vs.x * 0.42, vs.y)
		pv.position = Vector2(-vs.x * 0.42 if i == 0 else vs.x, 0)
		content.add_child(pv)
		pv.show_char(Game.p_char[i], Game.p_costume[i], Game.p_color[i])
		var tw := create_tween()
		tw.tween_property(pv, "position:x", vs.x * 0.04 if i == 0 else vs.x * 0.54, 0.35).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
		var cj := DataDB.char_json(Game.p_char[i])
		var nl := UITheme.outline(UITheme.label(DataDB.char_name(Game.p_char[i]), 40, "display", UITheme.P1 if i == 0 else UITheme.P2), 8)
		nl.position = Vector2(vs.x * (0.06 if i == 0 else 0.56), vs.y * 0.78)
		content.add_child(nl)
		var sl := UITheme.outline(UITheme.label(DataDB.pick(cj.get("style", ["", ""])), 22, "bold"), 5)
		sl.position = Vector2(nl.position.x, vs.y * 0.78 + 56)
		content.add_child(sl)
	var v := UITheme.outline(UITheme.label("VS", 120, "display", UITheme.ACCENT), 14)
	v.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.position = Vector2(0, vs.y * 0.34)
	v.size = Vector2(vs.x, 160)
	content.add_child(v)
	var st := UITheme.outline(UITheme.label(DataDB.pick(DataDB.stage_json(Game.stage).get("name", ["", ""])), 24, "bold", UITheme.TEXT2), 5)
	st.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	st.position = Vector2(0, vs.y * 0.06)
	st.size = Vector2(vs.x, 40)
	content.add_child(st)
	AudioHub.sfx("ui_vs", 0.0, 0.0)
	_preload.call_deferred()


func _preload() -> void:
	for id: String in Game.p_char:
		DataDB.anim_lib(id)
		SimFactory.character(id)
	SimFactory.stage(Game.stage)
	_ready_go = true


func _process(delta: float) -> void:
	_t += delta
	if _ready_go and _t > 1.5:
		_ready_go = false
		SceneRouter.goto("match", {"mode": Game.mode, "boss": boss})


func _input(event: InputEvent) -> void:
	if (event is InputEventScreenTouch and (event as InputEventScreenTouch).pressed) or event.is_action_pressed("ui_accept"):
		_t = maxf(_t, 1.5)
