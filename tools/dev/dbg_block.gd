extends SceneTree


func _init() -> void:
	var args := OS.get_cmdline_user_args()
	var cd := SimFactory.character(args[0])
	var m: MoveDef = cd.move_by_id[args[1]]
	var w := SimFactory.world(args[0], "toma", "arena", 7, {"ringout": false})
	SimDriver.skip_intro(w)
	SimDriver.place(w, FP.from_str("0.7"))
	var seq := SimDriver.command_inputs(m, FrameDataCheck.supported_ctx(m))
	for k: int in range(40):
		var a_in := seq[k] if k < seq.size() else SimDriver.inp(5)
		w.step(a_in, SimDriver.inp(5, InputBits.G, InputBits.G if k == 0 else 0, 0))
		var a := w.f[0]
		var d := w.f[1]
		print("k%02d A st=%s mf=%d x=%d | D st=%s anim=%d fr=%d x=%d gc=%d | ev=%s" % [k, SE.STATE_NAMES[a.state], a.mf, (a.x * 1000) >> 16, SE.STATE_NAMES[d.state], d.anim, d.anim_frame, (d.x * 1000) >> 16, d.guard_crouch, str(w.events.map(func(e: Dictionary) -> String: return String(e["kind"])))])
	quit(0)
