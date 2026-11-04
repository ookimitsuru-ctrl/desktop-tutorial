extends SceneTree
## 距離ごとの発生・接触を表示する（調整用）
## godot --headless -s res://tools/validate/trial_probe.gd -- bjorn bjorn_6k [hit|block]


func _init() -> void:
	var args := OS.get_cmdline_user_args()
	var cid := args[0]
	var cd := SimFactory.character(cid)
	var m: MoveDef = cd.move_by_id[args[1]]
	var mode := args[2] if args.size() > 2 else "hit"
	var ctx := FrameDataCheck.supported_ctx(m)
	var d := FP.from_str("0.55")
	while d <= FP.from_str("2.2"):
		var r := FrameDataCheck.trial(cid, m, ctx, d, mode)
		var cf := int(r["contact"]) - int(r["start"]) + 1 if int(r["contact"]) >= 0 else -1
		print("dist %.2f  kind=%s contact_at=%d (startup %d) adv=%d" % [float(d) / 65536.0, r["kind"], cf, m.startup, int(r["def_free"]) - int(r["att_free"])])
		d += FP.from_str("0.05")
	quit(0)
