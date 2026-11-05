extends ScreenBase
## タイトル画面

var prev0: CharPreview
var prev1: CharPreview
var press: Label
var _t := 0.0


func build() -> void:
	var chars := DataDB.characters()
	var vs := get_viewport_rect().size
	prev0 = CharPreview.new()
	# 選手の頭がロゴに隠れないよう、ロゴを上・選手を下に寄せる
	prev0.position = Vector2(vs.x * 0.02, vs.y * 0.27)
	prev0.size = Vector2(vs.x * 0.36, vs.y * 0.73)
	content.add_child(prev0)
	prev0.show_char(chars[randi() % chars.size()], "a", 0)
	prev1 = CharPreview.new()
	prev1.mirror = true
	prev1.position = Vector2(vs.x * 0.62, vs.y * 0.27)
	prev1.size = Vector2(vs.x * 0.36, vs.y * 0.73)
	content.add_child(prev1)
	prev1.show_char(chars[randi() % chars.size()], "a", 1)
	var logo := UITheme.outline(UITheme.label("RINGBOUND", 112, "display"), 12)
	logo.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	logo.position = Vector2(0, vs.y * 0.04)
	logo.size = Vector2(vs.x, 140)
	content.add_child(logo)
	var sub := UITheme.outline(UITheme.label("闘 環", 44, "display", UITheme.ACCENT), 8)
	sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	sub.position = Vector2(0, vs.y * 0.04 + 136)
	sub.size = Vector2(vs.x, 60)
	content.add_child(sub)
	press = UITheme.outline(UITheme.label(DataDB.t("press_start"), 28, "bold"), 6)
	press.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	press.position = Vector2(0, vs.y * 0.74)
	press.size = Vector2(vs.x, 40)
	content.add_child(press)
	var ver := UITheme.label("v" + String(ProjectSettings.get_setting("application/config/version", "")), 16, "num", UITheme.TEXT2)
	ver.position = Vector2(vs.x - 110, vs.y - 34)
	content.add_child(ver)
	AudioHub.bgm("bgm_title")


func _process(delta: float) -> void:
	_t += delta
	if press != null and not bool(Settings.g("photosensitive")):
		press.modulate.a = 0.55 + 0.45 * sin(_t * 3.0)


func _input(event: InputEvent) -> void:
	var go := false
	if event is InputEventScreenTouch and (event as InputEventScreenTouch).pressed:
		go = true
	elif event is InputEventMouseButton and (event as InputEventMouseButton).pressed:
		go = true
	elif event is InputEventKey and (event as InputEventKey).pressed and not (event as InputEventKey).echo:
		go = true
	elif event is InputEventJoypadButton and (event as InputEventJoypadButton).pressed:
		go = true
	if go:
		get_viewport().set_input_as_handled()
		set_process_input(false)
		AudioHub.ui("ok")
		SceneRouter.goto("main_menu")
