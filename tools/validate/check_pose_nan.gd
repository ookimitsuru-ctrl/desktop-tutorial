extends SceneTree
## 全キャラの全アニメ・全フレームで、骨の回転に NaN や非正規化が無いか確かめる
## godot --headless -s res://tools/validate/check_pose_nan.gd


func _init() -> void:
	var bad := 0
	var d := DirAccess.open("res://data/characters")
	for id: String in d.get_directories():
		var lib := AnimLibrary.build(DataLoader.character_json(id), DataLoader.moves_json(id))
		var pe := PoseEval.new(lib.rig)
		var shown := 0
		for n: String in lib.names:
			var c: AnimClip = lib.clip(n)
			for f: int in range(0, c.length + 1):
				pe.evaluate(c.sample(float(f)))
				for i: int in range(pe.local_rot.size()):
					var q := pe.local_rot[i]
					var ok := is_finite(q.x) and is_finite(q.y) and is_finite(q.z) and is_finite(q.w) and absf(q.length() - 1.0) < 0.01
					if not ok:
						bad += 1
						if shown < 8:
							shown += 1
							print("%s %s f%d bone %d q=%s" % [id, n, f, i, q])
				if not (is_finite(pe.hips_pos.x) and is_finite(pe.hips_pos.y) and is_finite(pe.hips_pos.z)):
					bad += 1
		print(id, " checked")
	print("check_pose_nan: %d bad" % bad)
	quit(1 if bad > 0 else 0)
