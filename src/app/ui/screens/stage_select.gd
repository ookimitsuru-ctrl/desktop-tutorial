extends ScreenBase
## ステージ選択（リング形状の俯瞰図付き）

var diagram: Control
var name_label: Label
var cur := "arena"


func build() -> void:
	add_title(DataDB.t("stage_select"))
	add_back("char_select")
	var r := safe_rect()
	var vb := VBoxContainer.new()
	vb.position = r.position + Vector2(10, 90)
	vb.add_theme_constant_override("separation", 8)
	content.add_child(vb)
	for sid: String in DataDB.stages():
		var locked := sid == "lighthouse" and not SaveData.unlocked("stage_lighthouse")
		var b := UITheme.button(DataDB.pick(DataDB.stage_json(sid).get("name", [sid, sid])) if not locked else "？？？", _go.bind(sid), 360)
		b.alignment = HORIZONTAL_ALIGNMENT_LEFT
		b.disabled = locked
		b.focus_entered.connect(_show.bind(sid))
		b.mouse_entered.connect(_show.bind(sid))
		vb.add_child(b)
	var rb := UITheme.button(DataDB.t("random"), func() -> void:
		var st := DataDB.stages()
		if not SaveData.unlocked("stage_lighthouse"):
			st.erase("lighthouse")
		_go(st[randi() % st.size()]), 360)
	vb.add_child(rb)
	diagram = Control.new()
	diagram.position = Vector2(r.position.x + r.size.x * 0.45, r.position.y + 100)
	diagram.size = Vector2(minf(r.size.x * 0.5, r.size.y - 160), minf(r.size.x * 0.5, r.size.y - 160))
	diagram.draw.connect(_draw_ring)
	content.add_child(diagram)
	name_label = UITheme.outline(UITheme.label("", 34, "display"), 6)
	name_label.position = Vector2(diagram.position.x, r.position.y + 60)
	content.add_child(name_label)
	var leg := UITheme.label(DataDB.t("ring_legend"), 18, "body", UITheme.TEXT2)
	leg.position = Vector2(diagram.position.x, diagram.position.y + diagram.size.y + 8)
	content.add_child(leg)
	focus_first(vb)
	_show(Game.stage if DataDB.stages().has(Game.stage) else "arena")


func _show(sid: String) -> void:
	cur = sid
	name_label.text = DataDB.pick(DataDB.stage_json(sid).get("name", [sid, sid]))
	diagram.queue_redraw()


func _draw_ring() -> void:
	var sd := SimFactory.stage(cur)
	var n := sd.vx.size()
	var c := diagram.size * 0.5
	var sc := diagram.size.x / 16.0
	diagram.draw_rect(Rect2(Vector2.ZERO, diagram.size), Color(0, 0, 0, 0.25))
	var pts := PackedVector2Array()
	for k: int in range(n):
		pts.append(c + Vector2(sd.vx[k] / 65536.0, sd.vz[k] / 65536.0) * sc)
	diagram.draw_colored_polygon(pts, Color(0.18, 0.22, 0.32, 0.9))
	for k2: int in range(n):
		var a := pts[k2]
		var b := pts[(k2 + 1) % n]
		var col := Color.WHITE
		var dashed := false
		match sd.edge_type[k2]:
			SE.EDGE_OPEN:
				col = UITheme.ACCENT
			SE.EDGE_FENCE:
				col = Color(1.0, 0.85, 0.3)
			SE.EDGE_BREAKABLE:
				col = Color(0.9, 0.9, 0.9)
				dashed = true
		if dashed:
			diagram.draw_dashed_line(a, b, col, 4.0, 10.0)
		else:
			diagram.draw_line(a, b, col, 4.0)
	for i: int in range(2):
		diagram.draw_circle(c + Vector2(sd.start_x[i] / 65536.0, sd.start_z[i] / 65536.0) * sc, 6.0, UITheme.P1 if i == 0 else UITheme.P2)


func _go(sid: String) -> void:
	Game.stage = sid
	SceneRouter.goto("vs")
