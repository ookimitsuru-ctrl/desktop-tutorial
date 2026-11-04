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
