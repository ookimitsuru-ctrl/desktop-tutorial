class_name Progress
extends RefCounted
## 戦績・実績・解禁の更新。仕様: 06_game_modes_and_progression.md §6.10

static var _defs: Array = []


static func defs() -> Array:
	if _defs.is_empty():
		var j: Variant = DataLoader.read_json("res://data/achievements.json")
		if j is Dictionary:
			_defs = (j as Dictionary).get("achievements", [])
	return _defs


## 試合結果（match.gd の res）を戦績に反映し、新しく達成した実績の id を返す
static func on_match(res: Dictionary) -> Array[String]:
	var mode := Game.mode
	# 遊んだステージ（BGM のギャラリー解禁・全ステージ実績）
	SaveData.unlock_quiet("stage_played_" + Game.stage)
	var bgm := String(DataDB.stage_json(Game.stage).get("bgm", ""))
	if bgm != "":
		SaveData.unlock_quiet("bgm_" + bgm.trim_prefix("bgm_"))
	if mode in [Game.Mode.TRAINING, Game.Mode.TUTORIAL, Game.Mode.TRIAL, Game.Mode.WATCH, Game.Mode.REPLAY]:
		return check()
	var winner := int(res.get("winner", -1))
	var human0 := int(Game.p_cpu[0]) == 0
	var vs_cpu := human0 and int(Game.p_cpu[1]) > 0
	var two_p := human0 and int(Game.p_cpu[1]) == 0
	if not human0:
		return check()
	SaveData.add_stat("matches")
	var st: Array = res.get("stats", [])
	if st.size() == 2:
		var me: Dictionary = st[0]
		SaveData.add_stat("damage_total", int(me.get("damage", 0)))
		SaveData.add_stat("escapes", int(me.get("escapes", 0)))
		SaveData.add_stat("evades", int(me.get("evades", 0)))
		SaveData.add_stat("counters", int(me.get("counters", 0)))
		SaveData.record_best("max_combo", int(me.get("max_combo", 0)))
	if two_p:
		SaveData.add_stat("versus_2p")
	if winner == 0:
		SaveData.add_stat("wins_total")
		for rd: Dictionary in res.get("rounds", []):
			if int(rd.get("winner", -1)) != 0:
				continue
			if bool(rd.get("perfect", false)):
				SaveData.add_stat("perfects")
			if int(rd.get("reason", -1)) == SE.END_RINGOUT:
				SaveData.add_stat("ringout_wins")
		if vs_cpu and int(Game.p_cpu[1]) >= 8:
			SaveData.add_stat("streak_cpu8_cur")
			SaveData.record_best("streak_cpu8", SaveData.stat("streak_cpu8_cur"))
		if two_p:
			SaveData.add_rank_points(5)
		if mode == Game.Mode.ARCADE and bool(res.get("boss", false)):
			SaveData.add_stat("boss_wins")
	elif vs_cpu:
		(SaveData.profile["stats"] as Dictionary)["streak_cpu8_cur"] = 0
	return check()


## 達成条件を満たした実績を解禁し、その id を返す
static func check() -> Array[String]:
	var out: Array[String] = []
	for d: Dictionary in defs():
		var id := String(d["id"])
		if SaveData.has_unlock("ach_" + id):
			continue
		if met(d):
			SaveData.unlock_quiet("ach_" + id)
			out.append(id)
	if not out.is_empty():
		SaveData.save_profile()
	return out


static func met(d: Dictionary) -> bool:
	var key := String(d.get("key", ""))
	var need := int(d.get("need", 1))
	match String(d.get("type", "")):
		"stat":
			return SaveData.stat(key) >= need
		"record":
			return _record(key, false) >= need
		"record_low":
			var v := _record(key, true)
			return v > 0 and v <= need
		"unlock":
			return SaveData.has_unlock(key)
		"count":
			return count_unlocks(key) >= need
		"rank":
			return int(SaveData.profile.get("rank_points", 0)) >= need
	return false


static func _record(key: String, lower: bool) -> int:
	var rec: Dictionary = SaveData.profile["records"]
	if not key.ends_with("*"):
		return int(rec.get(key, 0))
	var prefix := key.trim_suffix("*")
	var best := 0
	for k: String in rec:
		if k.begins_with(prefix):
			var v := int(rec[k])
			if best == 0 or (v < best if lower else v > best):
				best = v
	return best


static func count_unlocks(prefix: String) -> int:
	var n := 0
	for k: String in SaveData.profile["unlocks"]:
		if k.begins_with(prefix) and bool(SaveData.profile["unlocks"][k]):
			n += 1
	return n


static func achievement_name(id: String) -> String:
	for d: Dictionary in defs():
		if String(d["id"]) == id:
			return DataDB.pick(d.get("name", [id, id]))
	return id
