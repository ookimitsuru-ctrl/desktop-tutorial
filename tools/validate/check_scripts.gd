extends SceneTree
## 全スクリプトを読み込み、コンパイルエラーを検出する。


func _init() -> void:
	var files: Array[String] = []
	_walk("res://src", files)
	_walk("res://tools", files)
	_walk("res://tests", files)
	var bad := 0
	for p: String in files:
		var s: Variant = load(p)
		if s == null or not (s as Script).can_instantiate() and not p.contains("/tools/"):
			bad += 1
			print("NG ", p)
	print("checked %d scripts, %d failed" % [files.size(), bad])
	quit(1 if bad > 0 else 0)


func _walk(dir: String, out: Array[String]) -> void:
	var d := DirAccess.open(dir)
	if d == null:
		return
	for f: String in d.get_files():
		if f.ends_with(".gd"):
			out.append(dir + "/" + f)
	for sub: String in d.get_directories():
		_walk(dir + "/" + sub, out)
