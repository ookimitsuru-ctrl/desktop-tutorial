extends SceneTree
## 技の攻撃判定位置をフレームごとに表示する（調整用）
## godot --headless -s res://tools/validate/move_probe.gd -- toma toma_4p


func _init() -> void:
	var args := OS.get_cmdline_user_args()
	var cid := args[0]
	var mid := args[1]
	var cd := SimFactory.character(cid)
	var m: MoveDef = cd.move_by_id[mid]
	var bk := cd.baked
	print("%s startup=%d active=%d total=%d anim=%d reach(mm)=%d" % [mid, m.startup, m.active, m.total(), m.anim_index, (m.reach * 1000) >> 16])
	for f: int in range(1, m.total() + 1):
		var o := bk.hit_at(m.anim_index, f)
		var mo := bk.motion_at(m.anim_index, f)
		var line := "f%02d motion(%d,%d)" % [f, bk.motion[mo] if mo >= 0 else 0, bk.motion[mo + 1] if mo >= 0 else 0]
		if o >= 0 and bk.hit[o + 6] > 0:
			line += " hit " + str(bk.hit.slice(o, o + 7))
			if bk.hit[o + 13] > 0:
				line += " | " + str(bk.hit.slice(o + 7, o + 14))
		print(line)
	var hb := bk.hurt_base(cd.common[PoseRef.A.GUARD_S if args.size() > 2 else PoseRef.A.IDLE], 1)
	print("idle hurt caps (r,u,f)-(r,u,f) r:")
	for c: int in range(11):
		var q := hb + c * 7
		print("  ", bk.hurt.slice(q, q + 7))
	quit(0)
