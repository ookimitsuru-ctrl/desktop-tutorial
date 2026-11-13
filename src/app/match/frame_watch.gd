class_name FrameWatch
extends RefCounted
## トレーニングのフレーム表示: 接触後に両者が行動可能になったフレーム差を実測する（データ値ではなく実測）

var active := false
var att := 0
var contact_frame := 0
var start_frame := 0
var move_name := ""
var kind := ""
var level := ""
var att_free := -1
var def_free := -1
var startup := 0
var result := ""
var _move_start: Array[int] = [0, 0]


func observe(w: SimWorld) -> void:
	for e: Dictionary in w.events:
		var k := String(e["kind"])
		if k == "move":
			_move_start[int(e["player"])] = w.frame
		elif (k == "hit" or k == "block") and not bool(e.get("throw", false)):
			att = int(e["attacker"])
			var m := w.chars[att].moves[int(e["move"])]
			active = true
			contact_frame = w.frame
			startup = w.frame - _move_start[att] + 1
			move_name = DataDB.move_name(w.chars[att], m) + " " + m.cmd.text if m.cmd != null else ""
			kind = k
			level = ["上段", "中段", "下段", "特殊中段", "投げ", "下段投げ", "ダウン", "当て身", ""][m.level]
			att_free = -1
			def_free = -1
	if not active:
		return
	if w.frame <= contact_frame:
		return
	if att_free < 0 and FighterCtl.is_neutral_state(w.f[att].state):
		att_free = w.frame
	if def_free < 0 and FighterCtl.is_neutral_state(w.f[1 - att].state):
		def_free = w.frame
	var d := w.f[1 - att]
	var down := d.state == SE.ST_AIR or d.state == SE.ST_DOWN or d.state == SE.ST_CRUMPLE or d.state == SE.ST_STAGGER or d.state == SE.ST_WALL
	if att_free >= 0 and (def_free >= 0 or down):
		var adv_txt := ""
		if def_free >= 0:
			adv_txt = "%+dF" % (def_free - att_free)
		else:
			adv_txt = DataDB.t("fd_down")
		result = "%s %dF ｜ %s %s ｜ %s ｜ %s" % [DataDB.t("fd_startup"), startup, DataDB.t("fd_guard") if kind == "block" else DataDB.t("fd_hit"), adv_txt, level, move_name]
		active = false
