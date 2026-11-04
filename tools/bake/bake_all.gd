extends SceneTree
## 使い方: godot --headless -s res://tools/bake/bake_all.gd [-- id ...]
## 引数なしなら data/characters の全キャラをベイクする。


func _init() -> void:
	var ids: Array[String] = []
	for a: String in OS.get_cmdline_user_args():
		ids.append(a)
	if ids.is_empty():
		var d := DirAccess.open("res://data/characters")
		for n: String in d.get_directories():
			ids.append(n)
	for id: String in ids:
		var t0 := Time.get_ticks_msec()
		print(Baker.bake(id), "  (%d ms)" % (Time.get_ticks_msec() - t0))
	quit(0)
