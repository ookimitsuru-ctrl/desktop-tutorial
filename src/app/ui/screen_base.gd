class_name ScreenBase
extends Control
## メニュー画面の共通処理（背景・タイトル・戻る）

var params: Dictionary = {}
var content: Control
var title_label: Label
var back_target := ""
var title_button: Button = null
var _title_armed := 0.0


func setup(p: Dictionary) -> void:
	params = p


func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	var bg := ColorRect.new()
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	var sm := ShaderMaterial.new()
	sm.shader = load("res://shaders/menu_bg.gdshader")
	bg.material = sm
	bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(bg)
	content = Control.new()
	content.set_anchors_preset(Control.PRESET_FULL_RECT)
	content.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(content)
	build()


func build() -> void:
	pass


func safe_rect() -> Rect2:
	var vs := get_viewport_rect().size
	var r := Rect2(Vector2.ZERO, vs)
	if OS.has_feature("mobile"):
		var sa := DisplayServer.get_display_safe_area()
		var ss := DisplayServer.screen_get_size()
		if ss.x > 0 and sa.size.x > 0:
			var sx := vs.x / float(ss.x)
			var sy := vs.y / float(ss.y)
			r = Rect2(Vector2(sa.position.x * sx, sa.position.y * sy), Vector2(sa.size.x * sx, sa.size.y * sy))
	return r.grow(-20)


func add_title(t: String) -> void:
	var r := safe_rect()
	title_label = UITheme.outline(UITheme.label(t, 40, "display"), 6)
	title_label.position = r.position + Vector2(10, 4)
	content.add_child(title_label)
	var line := ColorRect.new()
	line.color = UITheme.ACCENT
	line.position = r.position + Vector2(12, 66)
	line.size = Vector2(160, 4)
	content.add_child(line)


## 右上の「タイトルへ」ボタン。誤って押しても進行を失わないよう、1 回目で確認の表示に変わり 2 回目で戻る
func add_title_button() -> void:
	var r := safe_rect()
	title_button = UITheme.button(DataDB.t("to_title"), _on_title_button, 200)
	title_button.position = Vector2(r.position.x + r.size.x - 210, r.position.y + 6)
	content.add_child(title_button)


func _on_title_button() -> void:
	if _title_armed > 0.0:
		get_tree().paused = false
		SceneRouter.goto("title")
		return
	_title_armed = 2.5
	title_button.text = DataDB.t("to_title_confirm")
	var tw := create_tween()
	tw.tween_interval(2.5)
	tw.tween_callback(func() -> void:
		_title_armed = 0.0
		if title_button != null:
			title_button.text = DataDB.t("to_title"))


func add_back(target: String) -> void:
	back_target = target
	var r := safe_rect()
	var b := UITheme.button("← " + DataDB.t("back"), go_back, 160)
	b.position = Vector2(r.position.x + r.size.x - 170, r.position.y + 6)
	content.add_child(b)


func go_back() -> void:
	if back_target != "":
		SceneRouter.goto(back_target)


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("ui_cancel") and back_target != "":
		AudioHub.ui("back")
		go_back()
		get_viewport().set_input_as_handled()


func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_GO_BACK_REQUEST and back_target != "":
		go_back()


func vbox_menu(items: Array, pos: Vector2, width: float = 380.0) -> VBoxContainer:
	var vb := VBoxContainer.new()
	vb.position = pos
	vb.add_theme_constant_override("separation", 10)
	content.add_child(vb)
	for it: Array in items:
		var b := UITheme.button(String(it[0]), it[1], width)
		if it.size() > 2 and not bool(it[2]):
			b.disabled = true
		b.alignment = HORIZONTAL_ALIGNMENT_LEFT
		vb.add_child(b)
	return vb


func focus_first(n: Node) -> void:
	for c: Node in n.get_children():
		if c is Button and not (c as Button).disabled:
			(c as Button).grab_focus.call_deferred()
			return
