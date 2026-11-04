extends Node
## 全画面を順に開いて数十フレーム動かし、実行時エラーが出ないか確かめる（ヘッドレスで実行可能）。
## 使い方: godot --headless --path . res://tools/validate/ui_smoke.tscn
## 出力の "SCRIPT ERROR" / "ERROR:" を CI 側で検査する。

var steps: Array = []
var idx := -1
var wait := 0


func _ready() -> void:
	get_tree().root.theme = UITheme.build_theme()
	Settings.data["intros"] = "skip"
	Game.setup_match_defaults()
	var ids := DataDB.characters()
	steps = [
		["title", {}], ["main_menu", {}], ["options", {}], ["records", {}], ["records", {"licenses": true}],
		["records", {"credits": true}], ["replays", {}], ["tutorial_select", {}], ["gallery", {}],
	]
	for m: int in [Game.Mode.ARCADE, Game.Mode.VERSUS, Game.Mode.TRAINING, Game.Mode.TRIAL, Game.Mode.SURVIVAL, Game.Mode.TIME_ATTACK, Game.Mode.WATCH]:
		steps.append(["char_select", {"mode": m}])
	steps.append(["stage_select", {"mode": Game.Mode.VERSUS}])
	for id: String in ids:
		for k: String in ["opening", "rival", "boss", "ending"]:
			steps.append(["story", {"kind": k, "char": id}])
	# 対戦（CPU 同士）を全キャラで短く
	for i: int in range(ids.size()):
		steps.append(["@match", [ids[i], ids[(i + 3) % ids.size()], ["arena", "harbor", "bamboo", "fort", "ruins", "skyline", "temple", "raft", "lighthouse"][i]]])
	steps.append(["@training", ["ravi", "zaw"]])
	steps.append(["result", {"winner": 0, "chars": ["toma", "zaw"], "stats": [{}, {}], "frames": 3000, "hp_left": 500, "rounds": [{"winner": 0, "reason": 0, "perfect": true}]}])
	_next()


func _next() -> void:
	idx += 1
	if idx >= steps.size():
		print("ui_smoke: %d screen(s) visited" % steps.size())
		# 画面を片付けてから終了（終了時の参照残りの警告を避ける）
		if SceneRouter.current != null:
			SceneRouter.current.queue_free()
			SceneRouter.current = null
		AudioHub.stop_bgm(0.0)
		AudioHub.stop_ambience(0.0)
		for _k: int in range(10):
			await get_tree().process_frame
		get_tree().quit(0)
		return
	var st: Array = steps[idx]
	var name := String(st[0])
	wait = 40
	if name == "@match" or name == "@training":
		var a: Array = st[1]
		Game.mode = Game.Mode.WATCH if name == "@match" else Game.Mode.TRAINING
		Game.p_char = [String(a[0]), String(a[1])]
		Game.p_costume = ["a", "b"]
		Game.p_color = [0, 1]
		Game.p_cpu = [8, 8] if name == "@match" else [0, 0]
		Game.stage = String(a[2]) if a.size() > 2 else "arena"
		Game.setup_match_defaults()
		Game.seed_value = 777 + idx
		wait = 400
		print("ui_smoke: ", name, " ", a)
		SceneRouter.goto("match", {"mode": Game.mode}, 0.0)
		return
	print("ui_smoke: ", name, " ", st[1])
	SceneRouter.goto(name, st[1], 0.0)


func _process(_d: float) -> void:
	if idx >= steps.size():
		return
	wait -= 1
	if wait <= 0:
		_next()
