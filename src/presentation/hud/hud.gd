class_name HUD
extends CanvasLayer
## 対戦中の HUD（体力・時間・ラウンド・コンボ・特殊ヒット表示・ラウンドコール）。仕様: 08 §8.4

var root: Control
var bars: Array[HealthBar] = []
var names: Array[Label] = []
var round_dots: Array[Control] = []
var timer_label: Label
var combo: Array[Label] = []
var combo_dmg: Array[Label] = []
var callouts: Array[Label] = []
var center: Label
var sub_center: Label
var training_line: Label
var info_line: Label
var fps_label: Label
var _combo_t: Array[float] = [0.0, 0.0]
var _call_t: Array[float] = [0.0, 0.0]
var wins: Array[int] = [0, 0]
var rounds_to_win := 2
var _center_tw: Tween


func _ready() -> void:
	layer = 5
	root = Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(root)
	for i: int in range(2):
		var b := HealthBar.new()
		b.right_to_left = i == 0
		b.color = UITheme.P1 if i == 0 else UITheme.P2
		b.mouse_filter = Control.MOUSE_FILTER_IGNORE
		root.add_child(b)
		bars.append(b)
		var n := UITheme.outline(UITheme.label("", 22, "bold"), 6)
		root.add_child(n)
		names.append(n)
		var dots := Control.new()
		dots.draw.connect(_draw_dots.bind(dots, i))
		dots.mouse_filter = Control.MOUSE_FILTER_IGNORE
		root.add_child(dots)
		round_dots.append(dots)
		var c := UITheme.outline(UITheme.label("", 40, "num", Color(1, 0.95, 0.8)), 8)
		c.modulate.a = 0.0
		root.add_child(c)
		combo.append(c)
		var cd := UITheme.outline(UITheme.label("", 22, "num", Color(0.9, 0.9, 0.9)), 6)
		cd.modulate.a = 0.0
		root.add_child(cd)
		combo_dmg.append(cd)
		var co := UITheme.outline(UITheme.label("", 34, "display", Color(1.0, 0.45, 0.25)), 8)
		co.modulate.a = 0.0
		root.add_child(co)
		callouts.append(co)
	timer_label = UITheme.outline(UITheme.label("45", 54, "num"), 8)
	timer_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	root.add_child(timer_label)
	center = UITheme.outline(UITheme.label("", 96, "display"), 14)
	center.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	center.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	center.modulate.a = 0.0
	root.add_child(center)
	sub_center = UITheme.outline(UITheme.label("", 34, "bold"), 8)
	sub_center.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	sub_center.modulate.a = 0.0
	root.add_child(sub_center)
	training_line = UITheme.outline(UITheme.label("", 22, "bold", Color(0.95, 0.95, 0.75)), 6)
	training_line.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	root.add_child(training_line)
	info_line = UITheme.outline(UITheme.label("", 18, "body", UITheme.TEXT2), 5)
	info_line.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	root.add_child(info_line)
	fps_label = UITheme.outline(UITheme.label("", 16, "num", Color(0.6, 1, 0.6)), 4)
	fps_label.visible = bool(Settings.g("show_fps"))
	root.add_child(fps_label)
	get_viewport().size_changed.connect(_layout)
	_layout()


func _safe() -> Rect2:
	var vs := root.get_viewport_rect().size
	var sa := DisplayServer.get_display_safe_area()
	var ss := DisplayServer.screen_get_size()
	var r := Rect2(Vector2.ZERO, vs)
	if OS.has_feature("mobile") and ss.x > 0 and sa.size.x > 0:
		var sx := vs.x / float(ss.x)
		var sy := vs.y / float(ss.y)
		r = Rect2(Vector2(sa.position.x * sx, sa.position.y * sy), Vector2(sa.size.x * sx, sa.size.y * sy))
	return r.grow(-12)


func _layout() -> void:
	var r := _safe()
	var vw := r.size.x
	var bw := minf(vw * 0.36, 560.0)
	var top := r.position.y + 14.0
	var cx := r.position.x + vw * 0.5
	bars[0].position = Vector2(cx - 62 - bw, top + 30)
	bars[0].size = Vector2(bw, 26)
	bars[1].position = Vector2(cx + 62, top + 30)
	bars[1].size = Vector2(bw, 26)
	names[0].position = Vector2(bars[0].position.x + 4, top - 2)
	names[1].position = Vector2(bars[1].position.x + bw - 4 - names[1].get_minimum_size().x, top - 2)
	round_dots[0].position = Vector2(cx - 62 - 70, top + 60)
	round_dots[0].size = Vector2(70, 20)
	round_dots[1].position = Vector2(cx + 62, top + 60)
	round_dots[1].size = Vector2(70, 20)
	timer_label.position = Vector2(cx - 50, top + 6)
	timer_label.size = Vector2(100, 70)
	var vs := root.get_viewport_rect().size
	center.position = Vector2(0, vs.y * 0.28)
	center.size = Vector2(vs.x, vs.y * 0.25)
	center.pivot_offset = center.size * 0.5
	sub_center.position = Vector2(0, vs.y * 0.52)
	sub_center.size = Vector2(vs.x, 50)
	for i: int in range(2):
		var x := r.position.x + 30 if i == 0 else r.position.x + vw - 260
		combo[i].position = Vector2(x, vs.y * 0.30)
		combo_dmg[i].position = Vector2(x + 4, vs.y * 0.30 + 52)
		callouts[i].position = Vector2(x, vs.y * 0.22)
	training_line.position = Vector2(0, top + 92)
	training_line.size = Vector2(vs.x, 30)
	info_line.position = Vector2(0, top + 122)
	info_line.size = Vector2(vs.x, 26)
	fps_label.position = r.position + Vector2(4, r.size.y - 26)


func _draw_dots(ctrl: Control, i: int) -> void:
	var n := rounds_to_win
	for k: int in range(n):
		var x: float = (ctrl.size.x - 18 - k * 22) if i == 0 else (k * 22 + 9)
		var c := Vector2(x, 10)
		ctrl.draw_circle(c, 8.0, Color(0, 0, 0, 0.6))
		if k < wins[i]:
			ctrl.draw_circle(c, 6.5, UITheme.GOLD)
		else:
			ctrl.draw_arc(c, 6.5, 0, TAU, 20, Color(1, 1, 1, 0.5), 1.5)


func set_names(n0: String, n1: String) -> void:
	names[0].text = n0
	names[1].text = n1
	_layout()


func update_hud(w: SimWorld, delta: float) -> void:
	for i: int in range(2):
		bars[i].set_value(float(w.f[i].hp) / float(w.rules.health))
		if _combo_t[i] > 0.0:
			_combo_t[i] -= delta
			if _combo_t[i] <= 0.0:
				var tw := create_tween()
				tw.tween_property(combo[i], "modulate:a", 0.0, 0.3)
				tw.parallel().tween_property(combo_dmg[i], "modulate:a", 0.0, 0.3)
	var secs := int(ceil(w.timer / 60.0))
	if w.round_frames >= 99 * 60 * 10:
		timer_label.text = "∞"
	else:
		timer_label.text = str(secs)
	var low := secs <= 10 and w.phase == SE.PH_FIGHT
	timer_label.add_theme_color_override("font_color", UITheme.DANGER if low else UITheme.TEXT)
	var nw: Array[int] = [w.wins0, w.wins1]
	if nw != wins:
		wins = nw
		for d: Control in round_dots:
			d.queue_redraw()
	if fps_label.visible:
		fps_label.text = "%d FPS" % Engine.get_frames_per_second()


## 攻撃側 attacker 側に「N HIT」
func show_combo(attacker: int, hits: int, dmg: int) -> void:
	if hits < 2:
		return
	var l := combo[attacker]
	l.text = "%d HIT" % hits
	combo_dmg[attacker].text = str(dmg)
	l.modulate.a = 1.0
	combo_dmg[attacker].modulate.a = 1.0
	l.scale = Vector2(1.3, 1.3)
	var tw := create_tween()
	tw.tween_property(l, "scale", Vector2.ONE, 0.12)
	_combo_t[attacker] = 1.2


func callout(side: int, text: String, color: Color) -> void:
	var l := callouts[side]
	l.text = text
	l.add_theme_color_override("font_color", color)
	l.modulate.a = 1.0
	l.scale = Vector2(1.4, 1.4)
	var tw := create_tween()
	tw.tween_property(l, "scale", Vector2.ONE, 0.1)
	tw.tween_interval(0.45)
	tw.tween_property(l, "modulate:a", 0.0, 0.2)


func announce(text: String, sub: String = "", dur: float = 1.1, color: Color = UITheme.TEXT) -> void:
	center.text = text
	center.add_theme_color_override("font_color", color)
	sub_center.text = sub
	if _center_tw != null:
		_center_tw.kill()
	center.modulate.a = 0.0
	center.scale = Vector2(1.6, 1.6)
	sub_center.modulate.a = 0.0
	_center_tw = create_tween()
	_center_tw.tween_property(center, "modulate:a", 1.0, 0.12)
	_center_tw.parallel().tween_property(center, "scale", Vector2.ONE, 0.2).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	_center_tw.parallel().tween_property(sub_center, "modulate:a", 1.0, 0.25)
	_center_tw.tween_interval(dur)
	_center_tw.tween_property(center, "modulate:a", 0.0, 0.25)
	_center_tw.parallel().tween_property(sub_center, "modulate:a", 0.0, 0.25)


func set_training_line(t: String) -> void:
	training_line.text = t


func set_info(t: String) -> void:
	info_line.text = t
