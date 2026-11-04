class_name UITheme
extends RefCounted
## UI の色・フォント・スタイル（仕様: 08_ui_ux.md §8.5）

const BG_DEEP := Color(0.043, 0.059, 0.102)
const BG_PANEL := Color(0.082, 0.106, 0.169, 0.92)
const ACCENT := Color(0.91, 0.27, 0.17)
const GOLD := Color(0.83, 0.66, 0.29)
const TEXT := Color(0.95, 0.94, 0.92)
const TEXT2 := Color(0.65, 0.67, 0.72)
const P1 := Color(0.25, 0.65, 0.96)
const P2 := Color(0.96, 0.65, 0.25)
const DANGER := Color(0.91, 0.27, 0.17)

static var _fonts: Dictionary = {}


static func font(name: String) -> Font:
	if not _fonts.has(name):
		var path: String = {
			"body": "res://assets/fonts/NotoSansJP-Regular.ttf",
			"bold": "res://assets/fonts/NotoSansJP-Bold.ttf",
			"display": "res://assets/fonts/DelaGothicOne-Regular.ttf",
			"num": "res://assets/fonts/Oswald-Bold.ttf",
		}.get(name, "res://assets/fonts/NotoSansJP-Regular.ttf")
		var f: Font = load(path) if ResourceLoader.exists(path) else ThemeDB.fallback_font
		if f is FontFile:
			var fv := FontVariation.new()
			fv.base_font = f
			# 日本語の不足字形は本文フォントにフォールバック
			if name != "body" and ResourceLoader.exists("res://assets/fonts/NotoSansJP-Bold.ttf"):
				fv.fallbacks = [load("res://assets/fonts/NotoSansJP-Bold.ttf")]
			f = fv
		_fonts[name] = f
	return _fonts[name]


static func scale() -> float:
	match String(Settings.g("text_size")):
		"large":
			return 1.2
		"xlarge":
			return 1.4
	return 1.0


static func build_theme() -> Theme:
	var t := Theme.new()
	t.default_font = font("body")
	t.default_font_size = int(22 * scale())
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.11, 0.14, 0.22, 0.95)
	sb.border_color = Color(1, 1, 1, 0.08)
	sb.set_border_width_all(1)
	sb.set_corner_radius_all(6)
	sb.content_margin_left = 18
	sb.content_margin_right = 18
	sb.content_margin_top = 10
	sb.content_margin_bottom = 10
	var hover := sb.duplicate() as StyleBoxFlat
	hover.bg_color = Color(0.16, 0.2, 0.3, 0.98)
	hover.border_color = ACCENT
	hover.set_border_width_all(2)
	var focus := hover.duplicate() as StyleBoxFlat
	focus.draw_center = false
	var pressed := hover.duplicate() as StyleBoxFlat
	pressed.bg_color = ACCENT.darkened(0.3)
	var disabled := sb.duplicate() as StyleBoxFlat
	disabled.bg_color = Color(0.1, 0.1, 0.12, 0.6)
	t.set_stylebox("normal", "Button", sb)
	t.set_stylebox("hover", "Button", hover)
	t.set_stylebox("focus", "Button", focus)
	t.set_stylebox("pressed", "Button", pressed)
	t.set_stylebox("disabled", "Button", disabled)
	t.set_color("font_color", "Button", TEXT)
	t.set_color("font_hover_color", "Button", Color.WHITE)
	t.set_color("font_focus_color", "Button", Color.WHITE)
	t.set_color("font_disabled_color", "Button", TEXT2.darkened(0.3))
	t.set_font("font", "Button", font("bold"))
	t.set_font_size("font_size", "Button", int(24 * scale()))
	t.set_color("font_color", "Label", TEXT)
	var panel := StyleBoxFlat.new()
	panel.bg_color = BG_PANEL
	panel.set_corner_radius_all(10)
	panel.content_margin_left = 20
	panel.content_margin_right = 20
	panel.content_margin_top = 16
	panel.content_margin_bottom = 16
	t.set_stylebox("panel", "PanelContainer", panel)
	t.set_stylebox("panel", "Panel", panel)
	var slider_bg := StyleBoxFlat.new()
	slider_bg.bg_color = Color(0.2, 0.22, 0.3)
	slider_bg.content_margin_top = 4
	slider_bg.content_margin_bottom = 4
	t.set_stylebox("slider", "HSlider", slider_bg)
	var grab := StyleBoxFlat.new()
	grab.bg_color = ACCENT
	t.set_stylebox("grabber_area", "HSlider", grab)
	t.set_stylebox("grabber_area_highlight", "HSlider", grab)
	return t


static func label(text: String, size: int, font_name: String = "body", color: Color = TEXT) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_override("font", font(font_name))
	l.add_theme_font_size_override("font_size", int(size * scale()))
	l.add_theme_color_override("font_color", color)
	return l


static func outline(l: Label, width: int, color: Color = Color(0, 0, 0, 0.85)) -> Label:
	l.add_theme_constant_override("outline_size", width)
	l.add_theme_color_override("font_outline_color", color)
	return l


static func button(text: String, cb: Callable, min_w: float = 320.0) -> Button:
	var b := Button.new()
	b.text = text
	b.custom_minimum_size = Vector2(min_w, 56)
	b.focus_mode = Control.FOCUS_ALL
	b.pressed.connect(func() -> void:
		AudioHub.ui("ok")
		cb.call())
	b.focus_entered.connect(func() -> void: AudioHub.ui("move"))
	return b
