class_name ArcadeFlow
extends RefCounted
## アーケード・サバイバル・タイムアタックの進行。仕様: 06 §6.2, §6.7, §6.8

const LEVELS := {1: [1, 1, 2, 2, 3, 3, 4, 4, 4], 2: [2, 2, 3, 3, 4, 4, 5, 5, 6], 3: [3, 4, 4, 5, 5, 6, 6, 7, 7], 4: [4, 5, 5, 6, 6, 7, 7, 8, 8]}


static func _difficulty() -> int:
	var lv := int(Settings.g("cpu_level"))
	if lv <= 2:
		return 1
	if lv <= 4:
		return 2
	if lv <= 6:
		return 3
	return 4


static func _home(id: String) -> String:
	var hs := String(DataDB.char_json(id).get("home_stage", "arena"))
	return hs if DataDB.stages().has(hs) else "arena"


static func start(char_id: String) -> void:
	var chars := DataDB.characters()
	var rival := String(DataDB.char_json(char_id).get("rival", ""))
	if not chars.has(rival) or rival == char_id or (rival == "gensai" and char_id != "gensai"):
		rival = ""
	var pool: Array[String] = []
	for c: String in chars:
		if c != char_id and c != rival and c != "gensai":
			pool.append(c)
	pool.shuffle()
	var order: Array = []
	for c2: String in pool.slice(0, 6):
		order.append({"char": c2, "stage": _home(c2)})
	if rival != "":
		order.append({"char": rival, "stage": "arena", "rival": true})
	order.append({"char": char_id, "stage": _home(char_id), "mirror": true})
	if chars.has("gensai") and char_id != "gensai":
		order.append({"char": "gensai", "stage": "lighthouse", "boss": true})
	Game.arcade = {"char": char_id, "order": order, "index": 0, "continues": 0, "score": 0, "frames": 0, "diff": _difficulty(), "kind": "arcade"}
	Game.mode = Game.Mode.ARCADE
	SceneRouter.goto("story", {"kind": "opening", "char": char_id})


static func start_time_attack(char_id: String) -> void:
	start(char_id)
	Game.arcade["kind"] = "time_attack"
	Game.arcade["diff"] = 2
	Game.mode = Game.Mode.TIME_ATTACK


static func start_survival(char_id: String) -> void:
	Game.survival = {"char": char_id, "wins": 0, "hp": 1000, "frames": 0}
	Game.mode = Game.Mode.SURVIVAL
	next_survival()


static func next_fight() -> void:
	var a := Game.arcade
	var idx := int(a["index"])
	var order: Array = a["order"]
	if idx >= order.size():
		SceneRouter.goto("story", {"kind": "ending", "char": a["char"]})
		return
	var f: Dictionary = order[idx]
	Game.p_char = [String(a["char"]), String(f["char"])]
	Game.p_costume = [Game.p_costume[0], "a"]
	Game.p_cpu = [0, int(LEVELS[int(a["diff"])][mini(idx, 8)])]
	if bool(f.get("boss", false)):
		Game.p_cpu[1] = mini(9, Game.p_cpu[1] + 1)
	Game.stage = String(f["stage"])
	Game.setup_match_defaults()
	if String(a["kind"]) == "time_attack":
		Game.rounds_to_win = 1
	Game.ensure_colors_differ()
	InputHub.assign = [["touch", "kb1", "pad"], []]
	if bool(f.get("rival", false)) or bool(f.get("boss", false)):
		SceneRouter.goto("story", {"kind": "boss" if bool(f.get("boss", false)) else "rival", "char": a["char"], "opp": f["char"]})
	else:
		SceneRouter.goto("vs", {"boss": bool(f.get("boss", false))})


static func next_survival() -> void:
	var s := Game.survival
	var chars := DataDB.characters()
	var pool: Array[String] = []
	for c: String in chars:
		if c != "gensai" or SaveData.unlocked("char_gensai"):
			pool.append(c)
	var opp: String = pool[randi() % pool.size()]
	Game.p_char = [String(s["char"]), opp]
	Game.p_cpu = [0, mini(8, 3 + int(s["wins"]) / 5)]
	var st := DataDB.stages()
	st.erase("lighthouse")
	Game.stage = st[randi() % st.size()]
	Game.setup_match_defaults()
	Game.rounds_to_win = 1
	Game.ensure_colors_differ()
	SceneRouter.goto("vs")


## 試合結果の処理。戻り値: 次の画面へ進んだら true
static func on_result(res: Dictionary) -> String:
	var won := int(res["winner"]) == 0
	if Game.mode == Game.Mode.SURVIVAL:
		var s := Game.survival
		if won:
			s["wins"] = int(s["wins"]) + 1
			s["frames"] = int(s["frames"]) + int(res["frames"])
			var left := int(res.get("hp_left", 500))
			s["hp"] = mini(1000, left + 150 + 0)
			return "next"
		SaveData.record_best("survival_" + String(s["char"]), int(s["wins"]))
		return "over"
	var a := Game.arcade
	if won:
		a["score"] = int(a["score"]) + 10000 * Game.rounds_to_win + int(res.get("hp_left", 0)) * 10
		a["frames"] = int(a["frames"]) + int(res["frames"])
		a["index"] = int(a["index"]) + 1
		SaveData.add_rank_points(int(Game.p_cpu[1]) * 2)
		if int(a["index"]) >= (a["order"] as Array).size():
			_complete(a)
			return "ending"
		return "next"
	return "continue"


static func _complete(a: Dictionary) -> void:
	var c := String(a["char"])
	SaveData.unlock("costume_" + c)
	SaveData.unlock("ending_" + c)
	if int(a["diff"]) >= 2:
		SaveData.unlock("char_gensai")
		SaveData.unlock("stage_lighthouse")
	SaveData.unlock("arcade_clear")
	if int(a["diff"]) >= 4 and int(a["continues"]) == 0 and String(a["kind"]) == "arcade":
		SaveData.unlock("arcade_master_nc")
	SaveData.add_rank_points(20)
	SaveData.record_best("arcade_score_" + c, int(a["score"]))
	if String(a["kind"]) == "time_attack":
		SaveData.record_best("time_attack_" + c, int(a["frames"]), true)
