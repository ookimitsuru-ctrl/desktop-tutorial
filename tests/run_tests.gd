extends SceneTree
## テストランナー: godot --headless -s res://tests/run_tests.gd [-- filter]


func _init() -> void:
	var filter := ""
	var args := OS.get_cmdline_user_args()
	if args.size() > 0:
		filter = args[0]
	var files: Array[String] = []
	for dir: String in ["res://tests/unit", "res://tests/integration"]:
		var d := DirAccess.open(dir)
		if d == null:
			continue
		for f: String in d.get_files():
			if f.begins_with("test_") and f.ends_with(".gd"):
				files.append(dir + "/" + f)
	files.sort()
	var total := 0
	var failed := 0
	var asserts := 0
	var t0 := Time.get_ticks_msec()
	for p: String in files:
		var script: GDScript = load(p)
		if script == null:
			print("LOAD FAIL ", p)
			failed += 1
			continue
		for m: Dictionary in script.get_script_method_list():
			var mn := String(m["name"])
			if not mn.begins_with("test_"):
				continue
			if filter != "" and not (p + ":" + mn).contains(filter):
				continue
			var tc: TestCase = script.new()
			tc.current = p.get_file() + ":" + mn
			tc.call(mn)
			total += 1
			asserts += tc.asserts
			if tc.failures.size() > 0:
				failed += 1
				for fl: String in tc.failures.slice(0, 12):
					print("  FAIL ", fl)
				if tc.failures.size() > 12:
					print("  ... (%d more)" % (tc.failures.size() - 12))
	print("TESTS: %d run, %d failed, %d asserts, %d ms" % [total, failed, asserts, Time.get_ticks_msec() - t0])
	quit(1 if failed > 0 else 0)
