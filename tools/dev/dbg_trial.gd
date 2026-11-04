extends SceneTree


func _init() -> void:
	var args := OS.get_cmdline_user_args()
	var cd := SimFactory.character(args[0])
	var m: MoveDef = cd.move_by_id[args[1]]
	var ctx := FrameDataCheck.supported_ctx(m)
	var best := FrameDataCheck.contact_distance(args[0], m, ctx)
	print("best dist mm=", (best * 1000) >> 16)
	for dmm: int in [600, 700, 800, 900, 1000]:
		var d := FP.from_int(dmm) / 1000
		var rh := FrameDataCheck.trial(args[0], m, ctx, d, "hit")
		var rb := FrameDataCheck.trial(args[0], m, ctx, d, "block")
		print(dmm, " hit:", rh, "\n     block:", rb)
	quit(0)
