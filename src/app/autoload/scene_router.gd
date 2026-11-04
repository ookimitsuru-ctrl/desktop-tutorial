extends Node
## 画面遷移（フェード付き）。画面は Node を継承したスクリプト（引数 params を受け取る）

signal screen_changed(name: String)

var current: Node = null
var current_name := ""
var _fade: ColorRect
var _layer: CanvasLayer
var _busy := false
var history: Array[String] = []


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	_layer = CanvasLayer.new()
	_layer.layer = 100
	add_child(_layer)
	_fade = ColorRect.new()
	_fade.color = Color(0.03, 0.04, 0.07, 0.0)
	_fade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_fade.set_anchors_preset(Control.PRESET_FULL_RECT)
	_layer.add_child(_fade)


## name: src/app/ui/screens/<name>.gd
func goto(name: String, params: Dictionary = {}, fade: float = 0.22) -> void:
	if _busy:
		return
	_busy = true
	_fade.mouse_filter = Control.MOUSE_FILTER_STOP
	if fade > 0.0 and current != null:
		var tw := create_tween()
		tw.tween_property(_fade, "color:a", 1.0, fade)
		await tw.finished
	if current != null:
		current.queue_free()
		current = null
	get_tree().paused = false
	var script: GDScript = load("res://src/app/ui/screens/%s.gd" % name)
	var node: Node = script.new()
	if node.has_method("setup"):
		node.call("setup", params)
	get_tree().root.add_child.call_deferred(node)
	current = node
	if current_name != "":
		history.append(current_name)
	current_name = name
	screen_changed.emit(name)
	if fade > 0.0:
		var tw2 := create_tween()
		tw2.tween_property(_fade, "color:a", 0.0, fade)
		await tw2.finished
	_fade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_busy = false


func back() -> void:
	if history.is_empty():
		return
	var prev: String = history.pop_back()
	var keep := history.duplicate()
	await goto(prev)
	history = keep


## 画面上部に短い通知を出す（実績解除など）。複数あれば縦に並べる
var _toasts: Array[Control] = []


func toast(text: String, seconds: float = 3.2) -> void:
	var pc := PanelContainer.new()
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.06, 0.07, 0.11, 0.92)
	sb.border_color = UITheme.GOLD
	sb.set_border_width_all(2)
	sb.set_corner_radius_all(8)
	sb.content_margin_left = 18
	sb.content_margin_right = 18
	sb.content_margin_top = 8
	sb.content_margin_bottom = 8
	pc.add_theme_stylebox_override("panel", sb)
	pc.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var l := UITheme.label(text, 22, "bold", UITheme.GOLD)
	pc.add_child(l)
	_layer.add_child(pc)
	_toasts.append(pc)
	var vs := get_viewport().get_visible_rect().size
	pc.reset_size()
	pc.position = Vector2((vs.x - pc.size.x) * 0.5, 16 + 56 * (_toasts.size() - 1))
	pc.modulate.a = 0.0
	var tw := create_tween()
	tw.tween_property(pc, "modulate:a", 1.0, 0.2)
	tw.tween_interval(seconds)
	tw.tween_property(pc, "modulate:a", 0.0, 0.4)
	tw.tween_callback(func() -> void:
		_toasts.erase(pc)
		pc.queue_free())
	AudioHub.sfx("just", -6.0, 0.0)
