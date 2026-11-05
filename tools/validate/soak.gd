extends Node
## 長時間テスト（デスクトップ版）: CPU 同士の試合を連続で回し、試合の合間にオブジェクト数・ノード数・メモリを記録する。
## 試合画面を出入りするたびに増え続けるもの（解放漏れ）があれば失敗にする。
## 最初の WARMUP 試合で全キャラ・全衣装・全ステージを一巡させ（読み込みのキャッシュが埋まる）、その後の増え方だけを判定する。
## 使い方: godot --headless --path . --fixed-fps 60 res://tools/validate/soak.tscn [-- --matches 45 --frames 3600]
## 実機の 2 時間ソークの代わりにはならない（描画・発熱・GPU メモリは測れない）。

const STAGES: Array[String] = ["arena", "harbor", "bamboo", "fort", "ruins", "skyline", "temple", "raft", "lighthouse"]

const WARMUP := 18

var matches := 45
var frames := 3600
var idx := -1
var wait := 0
var in_match := false
var samples: Array = []


func _ready() -> void:
	get_tree().root.theme = UITheme.build_theme()
	Settings.data["intros"] = "skip"
	var args := OS.get_cmdline_user_args()
	for i: int in range(args.size() - 1):
		if args[i] == "--matches":
			matches = args[i + 1].to_int()
		elif args[i] == "--frames":
			frames = args[i + 1].to_int()
	matches = maxi(matches, WARMUP + 2)
	_next()


func _sample() -> Dictionary:
	return {
		"objects": int(Performance.get_monitor(Performance.OBJECT_COUNT)),
		"nodes": int(Performance.get_monitor(Performance.OBJECT_NODE_COUNT)),
		"orphans": int(Performance.get_monitor(Performance.OBJECT_ORPHAN_NODE_COUNT)),
		"resources": int(Performance.get_monitor(Performance.OBJECT_RESOURCE_COUNT)),
		"mem_mb": Performance.get_monitor(Performance.MEMORY_STATIC) / 1048576.0,
	}


func _next() -> void:
	if in_match:
		# 試合から抜けてメニューで落ち着かせてから計測する
		in_match = false
		wait = 30
		SceneRouter.goto("main_menu", {}, 0.0)
		return
	if idx >= 0:
		var s := _sample()
		samples.append(s)
		print("soak: after match %2d  objects=%d nodes=%d orphans=%d resources=%d mem=%.1fMB" % [idx + 1, s["objects"], s["nodes"], s["orphans"], s["resources"], s["mem_mb"]])
	idx += 1
	if idx >= matches:
		_finish()
		return
	var ids := DataDB.characters()
	Game.mode = Game.Mode.WATCH
	var lap := (idx / ids.size()) % 2
	Game.p_char = [ids[idx % ids.size()], ids[(idx + 4) % ids.size()]]
	Game.p_costume = ["a" if lap == 0 else "b", "b" if lap == 0 else "a"]
	Game.p_color = [0, 1]
	Game.p_cpu = [8, 8]
	Game.stage = STAGES[idx % STAGES.size()]
	Game.setup_match_defaults()
	Game.seed_value = 9000 + idx
	in_match = true
	wait = frames
	SceneRouter.goto("match", {"mode": Game.mode}, 0.0)


func _finish() -> void:
	var ok := true
	if samples.size() >= WARMUP + 4:
		# 解放漏れは試合ごとに増え続ける。一度だけの段差（アロケータの確保など）と区別するため、
		# 温まり後の区間を前半・後半に分け、両方で上限の半分を超えて増えたときだけ失敗にする。
		var i0 := WARMUP - 1
		var i2 := samples.size() - 1
		var i1 := (i0 + i2) / 2
		var limits := {"objects": 150, "nodes": 10, "orphans": 3, "resources": 30, "mem_mb": 6.0}
		for k: String in limits:
			var g1 := float(samples[i1][k]) - float(samples[i0][k])
			var g2 := float(samples[i2][k]) - float(samples[i1][k])
			var half := float(limits[k]) * 0.5
			var bad := g1 > half and g2 > half
			print("soak: %-9s first half %+.1f, second half %+.1f (limit %+.1f each) %s" % [k, g1, g2, half, "NG" if bad else "ok"])
			if bad:
				ok = false
	print("soak: %d match(es) (%d warm-up), %s" % [samples.size(), WARMUP, "PASS" if ok else "FAIL"])
	if SceneRouter.current != null:
		SceneRouter.current.queue_free()
		SceneRouter.current = null
	AudioHub.release_all()
	# 止めた再生はオーディオスレッドが次に回るときに手放される。--fixed-fps では数フレームが一瞬で過ぎるため実時間で待つ
	var t0 := Time.get_ticks_msec()
	while Time.get_ticks_msec() - t0 < 400:
		await get_tree().process_frame
	get_tree().quit(0 if ok else 1)


func _process(_d: float) -> void:
	if idx >= matches:
		return
	wait -= 1
	if wait <= 0:
		_next()
