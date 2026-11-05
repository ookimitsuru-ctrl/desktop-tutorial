extends Node
## アーケードを全キャラで最後まで進める確認（ヘッドレスで実行可能）。
## 会話 → VS → 試合 → 結果 → 次の試合 … → エンディング → スタッフロール と、実際の画面遷移をたどる。
## 試合は勝ったことにして結果画面へ送り、結果画面の先頭のボタン（次の試合）を押す。
## 同じ画面が先へ進まずに繰り返されたら失敗（例: ライバル戦の前の会話が繰り返される）。
## 使い方: godot --headless --path . res://tools/validate/arcade_walk.tscn

var ids: Array[String] = []
var ci := -1
var steps := 0
var last_name := ""
var same := 0
var wait := 0
var failed: Array[String] = []
var visited: Array[String] = []
var pending_start := false


func _ready() -> void:
	get_tree().root.theme = UITheme.build_theme()
	Settings.data["intros"] = "skip"
	ids.assign(DataDB.characters())
	_next_char()


func _next_char() -> void:
	if ci >= 0:
		print("arcade_walk: %s %s (%s)" % [ids[ci], "NG" if failed.has(ids[ci]) else "ok", " > ".join(visited)])
	ci += 1
	if ci >= ids.size():
		print("arcade_walk: %d character(s), %s" % [ids.size(), "FAIL" if not failed.is_empty() else "PASS"])
		if SceneRouter.current != null:
			SceneRouter.current.queue_free()
			SceneRouter.current = null
		AudioHub.release_all()
		var t0 := Time.get_ticks_msec()
		while Time.get_ticks_msec() - t0 < 400:
			await get_tree().process_frame
		get_tree().quit(0 if failed.is_empty() else 1)
		return
	steps = 0
	same = 0
	last_name = ""
	visited.clear()
	# 画面の切り替え中は遷移の指示が無視されるので、切り替えが終わってから始める
	pending_start = true


func _short(n: String, p: Dictionary) -> String:
	if n == "story":
		return "story:" + String(p.get("kind", ""))
	return n


func _process(_d: float) -> void:
	if ci < 0 or ci >= ids.size():
		return
	if pending_start:
		if not bool(SceneRouter.get("_busy")):
			pending_start = false
			Game.p_costume = ["a", "a"]
			Game.p_color = [0, 1]
			ArcadeFlow.start(ids[ci])
		return
	wait -= 1
	if wait > 0 or SceneRouter.current == null:
		return
	var name := SceneRouter.current_name
	var cur := SceneRouter.current
	var p: Dictionary = cur.get("params") if cur.get("params") is Dictionary else {}
	var key := _short(name, p) + "#" + str(int(Game.arcade.get("index", 0)))
	if key == last_name:
		same += 1
	else:
		same = 0
		last_name = key
		visited.append(_short(name, p))
	steps += 1
	if same > 400 or steps > 4000 or visited.size() > 80:
		failed.append(ids[ci])
		print("arcade_walk: %s stuck at %s" % [ids[ci], key])
		_next_char()
		return
	match name:
		"story":
			# 画面の切り替え中（フェード）は遷移の指示が無視されるため、少し待ってから繰り返し試す
			if same % 40 == 20:
				cur.call("_done")
		"vs":
			pass  # 自動で試合へ
		"match":
			if same % 40 == 20:
				SceneRouter.goto("result", {"winner": 0, "chars": Game.p_char.duplicate(), "stats": [{}, {}], "frames": 1800, "hp_left": 600,
					"rounds": [{"winner": 0, "reason": 0, "perfect": false}], "boss": false}, 0.0)
		"result":
			if same % 40 == 20:
				var b := _first_button(cur)
				if b != null:
					b.emit_signal("pressed")
		"records":
			# 前のキャラのスタッフロールが残っている間は無視する（エンディングを見た後だけ完了）
			if visited.has("story:ending"):
				_next_char()
		_:
			failed.append(ids[ci])
			print("arcade_walk: %s unexpected screen %s" % [ids[ci], name])
			_next_char()


func _first_button(n: Node) -> Button:
	for c: Node in n.get_children():
		if c is Button and (c as Button).visible and not (c as Button).disabled and (c as Button).text != DataDB.t("to_title"):
			return c
		var r := _first_button(c)
		if r != null:
			return r
	return null
