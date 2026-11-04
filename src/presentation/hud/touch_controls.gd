class_name TouchControls
extends Control
## 格闘ゲーム用タッチ操作（フローティング・スティック、P/K/G、コードゾーン、ローリング、マクロ、フリック）。
## 仕様: 03_controls_and_input.md §3.2

signal pause_pressed

const P := InputBits.P
const K := InputBits.K
const G := InputBits.G

## ボタン: [ビット, ラベル, 小ラベル, 中心（右下基準のdp）, 半径dp]
var buttons: Array = []
var stick_center := Vector2.ZERO
var stick_knob := Vector2.ZERO
var stick_touch := -1
var stick_dir := 5
var touch_bits: Dictionary = {}   # touch index → 押しているビット
var touch_btn_mode: Dictionary = {} # touch index → true（ボタン担当）
var dp := 1.0
var stick_radius := 64.0
var opacity := 0.7
var preset := "standard"
var pause_rect := Rect2()
var _pressed_vis: Dictionary = {}
var _guide_pos := Vector2.ZERO


func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_config()
	get_viewport().size_changed.connect(_config)


func _config() -> void:
	preset = String(Settings.g("touch_preset"))
	opacity = float(Settings.g("touch_opacity")) / 100.0
	var vs := get_viewport_rect().size
	var dpi := float(DisplayServer.screen_get_dpi())
	var screen_h := float(DisplayServer.screen_get_size().y)
	if OS.has_feature("mobile") and dpi > 0 and screen_h > 0:
		dp = (dpi / 160.0) / (screen_h / vs.y)
	else:
		dp = 0.85
	dp *= float(Settings.g("button_scale")) / 100.0
	stick_radius = 64.0 * dp
	var r := 42.0 * dp
	var m := 24.0 * dp
	var base := Vector2(vs.x - m, vs.y - m)
	var left_handed := preset == "left"
	buttons = []
	var main := [
		[P, "P", "拳", Vector2(-r * 4.3, -r * 1.55)],
		[K, "K", "蹴", Vector2(-r * 1.35, -r * 1.55)],
		[G, "G", "守", Vector2(-r * 2.82, -r * 3.55)],
	]
	for b: Array in main:
		buttons.append([b[0], b[1], b[2], base + Vector2(b[3]), r, true])
	if preset != "classic":
		var mr := 29.0 * dp
		buttons.append([P | G, "投", "P+G", base + Vector2(-r * 5.6, -r * 3.7), mr, false])
		buttons.append([P | K, "P+K", "", base + Vector2(-r * 0.9, -r * 3.9), mr, false])
		buttons.append([K | G, "K+G", "", base + Vector2(-r * 0.6, -r * 0.0) + Vector2(0, -mr * 0.2), mr * 0.85, false])
	if left_handed:
		for b2: Array in buttons:
			var c: Vector2 = b2[3]
			b2[3] = Vector2(vs.x - c.x, c.y)
	var pr := 30.0 * dp
	pause_rect = Rect2(Vector2(vs.x * 0.5 - pr, 8), Vector2(pr * 2, pr * 1.4))
	_guide_pos = Vector2(m + stick_radius * 1.6, vs.y - m - stick_radius * 1.6)
	if left_handed:
		_guide_pos.x = vs.x - _guide_pos.x
	queue_redraw()


func _stick_region(p: Vector2) -> bool:
	var vs := get_viewport_rect().size
	if preset == "left":
		return p.x > vs.x * 0.55 and p.y > vs.y * 0.18
	return p.x < vs.x * 0.45 and p.y > vs.y * 0.18


func _input(event: InputEvent) -> void:
	if not visible:
		return
	if event is InputEventScreenTouch:
		var e := event as InputEventScreenTouch
		var pos := e.position
		if e.pressed:
			if pause_rect.has_point(pos):
				pause_pressed.emit()
				get_viewport().set_input_as_handled()
				return
			if stick_touch < 0 and _stick_region(pos):
				stick_touch = e.index
				stick_center = pos if String(Settings.g("stick_mode")) == "floating" else _guide_pos
				stick_knob = pos
				_update_stick()
			else:
				touch_btn_mode[e.index] = true
				_update_buttons(e.index, pos)
		else:
			if e.index == stick_touch:
				stick_touch = -1
				stick_dir = 5
				InputHub.touch_set_dir(5)
			elif touch_btn_mode.has(e.index):
				_set_bits(e.index, 0)
				touch_btn_mode.erase(e.index)
		queue_redraw()
	elif event is InputEventScreenDrag:
		var d := event as InputEventScreenDrag
		if d.index == stick_touch:
			stick_knob = d.position
			# 指が外周の 1.6 倍を超えたら中心を追従
			var off := stick_knob - stick_center
			var lim := stick_radius * 1.6
			if off.length() > lim:
				stick_center = stick_knob - off.normalized() * lim
			_update_stick()
			queue_redraw()
		elif touch_btn_mode.has(d.index):
			_update_buttons(d.index, d.position)
			queue_redraw()


func _update_stick() -> void:
	var v := stick_knob - stick_center
	var n := Vector2(v.x, -v.y) / stick_radius
	var dz := float(Settings.g("stick_deadzone")) / 100.0
	stick_dir = InputHub.quantize(n, dz, float(Settings.g("stick_diag_deg")), stick_dir)
	InputHub.touch_set_dir(stick_dir)


func _update_buttons(idx: int, pos: Vector2) -> void:
	var bits := 0
	var hits: Array[int] = []
	for k: int in range(buttons.size()):
		var b: Array = buttons[k]
		var c: Vector2 = b[3]
		var r: float = b[4]
		if pos.distance_to(c) <= r * 1.2:
			hits.append(k)
	# コードゾーン: 主ボタン2つの中心を結ぶ線分から 18dp 以内で、両方の判定円に近い
	var mains: Array[int] = []
	for k2: int in range(buttons.size()):
		if bool(buttons[k2][5]):
			mains.append(k2)
	for a: int in range(mains.size()):
		for b2: int in range(a + 1, mains.size()):
			var ca: Vector2 = buttons[mains[a]][3]
			var cb: Vector2 = buttons[mains[b2]][3]
			var seg := cb - ca
			var t := clampf((pos - ca).dot(seg) / seg.length_squared(), 0.0, 1.0)
			if t > 0.3 and t < 0.7 and pos.distance_to(ca + seg * t) <= 18.0 * dp:
				bits |= int(buttons[mains[a]][0]) | int(buttons[mains[b2]][0])
	for k3: int in hits:
		bits |= int(buttons[k3][0])
	_set_bits(idx, bits)


func _set_bits(idx: int, bits: int) -> void:
	var old := int(touch_bits.get(idx, 0))
	if old == bits:
		return
	var released := old & ~bits
	var pressed := bits & ~old
	if released != 0:
		InputHub.touch_button(released, false)
	if pressed != 0:
		InputHub.touch_button(pressed, true)
	touch_bits[idx] = bits


func release_all() -> void:
	for idx: int in touch_bits.keys():
		_set_bits(idx, 0)
	touch_bits.clear()
	touch_btn_mode.clear()
	stick_touch = -1
	InputHub.touch_set_dir(5)
	queue_redraw()


func _held_bits() -> int:
	var b := 0
	for v: int in touch_bits.values():
		b |= v
	return b


func _draw() -> void:
	var a := opacity
	var font := UITheme.font("bold")
	# スティック
	var sc := stick_center if stick_touch >= 0 else _guide_pos
	var kn := stick_knob if stick_touch >= 0 else _guide_pos
	draw_circle(sc, stick_radius, Color(0.05, 0.07, 0.12, 0.35 * a))
	draw_arc(sc, stick_radius, 0, TAU, 48, Color(1, 1, 1, 0.35 * a), 2.0 * dp)
	var kv := kn - sc
	if kv.length() > stick_radius:
		kv = kv.normalized() * stick_radius
	if stick_dir != 5 and stick_touch >= 0:
		var dv := Vector2(((stick_dir - 1) % 3) - 1, -(((stick_dir - 1) / 3) - 1)).normalized()
		draw_arc(sc, stick_radius, dv.angle() - 0.35, dv.angle() + 0.35, 12, Color(UITheme.ACCENT, 0.9 * a), 5.0 * dp)
	draw_circle(sc + kv, 28.0 * dp, Color(0.85, 0.88, 0.95, 0.55 * a))
	# ボタン
	var held := _held_bits()
	for b: Array in buttons:
		var c: Vector2 = b[3]
		var r: float = b[4]
		var bits: int = b[0]
		var on := (held & bits) == bits
		var col := Color(0.1, 0.12, 0.18, 0.55 * a)
		if on:
			col = Color(UITheme.ACCENT, 0.85 * a)
		draw_circle(c, r * (0.94 if on else 1.0), col)
		draw_arc(c, r, 0, TAU, 40, Color(1, 1, 1, 0.45 * a), 2.0 * dp)
		var big := String(b[1])
		var fs := int(r * (0.75 if big.length() <= 1 else 0.5))
		var ts := font.get_string_size(big, HORIZONTAL_ALIGNMENT_CENTER, -1, fs)
		draw_string(font, c + Vector2(-ts.x * 0.5, fs * 0.32), big, HORIZONTAL_ALIGNMENT_CENTER, -1, fs, Color(1, 1, 1, 0.9 * a))
		var small := String(b[2])
		if small != "" and bool(b[5]):
			var fs2 := int(r * 0.32)
			var ts2 := font.get_string_size(small, HORIZONTAL_ALIGNMENT_CENTER, -1, fs2)
			draw_string(font, c + Vector2(-ts2.x * 0.5, r * 0.72), small, HORIZONTAL_ALIGNMENT_CENTER, -1, fs2, Color(1, 1, 1, 0.6 * a))
	# ポーズ
	draw_rect(pause_rect, Color(0.05, 0.07, 0.12, 0.45 * a))
	var pc := pause_rect.get_center()
	var bw := 5.0 * dp
	draw_rect(Rect2(pc + Vector2(-bw * 2.0, -bw * 2.2), Vector2(bw, bw * 4.4)), Color(1, 1, 1, 0.8 * a))
	draw_rect(Rect2(pc + Vector2(bw, -bw * 2.2), Vector2(bw, bw * 4.4)), Color(1, 1, 1, 0.8 * a))
