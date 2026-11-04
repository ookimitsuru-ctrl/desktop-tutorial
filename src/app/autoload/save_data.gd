extends Node
## セーブデータ（原子的書き込み・.bak 復旧）。仕様: 06_game_modes_and_progression.md §6.11

const PROFILE := "user://save/profile.json"
const REPLAY_DIR := "user://save/replays"

var profile: Dictionary = {}


func _ready() -> void:
	DirAccess.make_dir_recursive_absolute("user://save")
	DirAccess.make_dir_recursive_absolute(REPLAY_DIR)
	load_profile()


static func read_json(path: String) -> Variant:
	for p: String in [path, path + ".bak"]:
		if not FileAccess.file_exists(p):
			continue
		var f := FileAccess.open(p, FileAccess.READ)
		if f == null:
			continue
		var v: Variant = JSON.parse_string(f.get_as_text())
		if v != null:
			return v
	return null


static func write_json(path: String, v: Variant) -> bool:
	DirAccess.make_dir_recursive_absolute(path.get_base_dir())
	var tmp := path + ".tmp"
	var f := FileAccess.open(tmp, FileAccess.WRITE)
	if f == null:
		return false
	f.store_string(JSON.stringify(v, "  "))
	f.close()
	if FileAccess.file_exists(path):
		DirAccess.copy_absolute(path, path + ".bak")
	return DirAccess.rename_absolute(tmp, path) == OK


func load_profile() -> void:
	var v: Variant = read_json(PROFILE)
	profile = v if v is Dictionary else {}
	for k: String in ["unlocks", "records", "stats", "achievements"]:
		if not profile.has(k):
			profile[k] = {}
	if not profile.has("rank_points"):
		profile["rank_points"] = 0
	profile["schema_version"] = 1


func save_profile() -> void:
	write_json(PROFILE, profile)


func unlocked(key: String) -> bool:
	if bool(Settings.g("unlock_all")):
		return true
	return bool((profile["unlocks"] as Dictionary).get(key, false))


func unlock(key: String) -> bool:
	if (profile["unlocks"] as Dictionary).get(key, false):
		return false
	profile["unlocks"][key] = true
	save_profile()
	return true


func add_stat(key: String, n: int = 1) -> void:
	var st: Dictionary = profile["stats"]
	st[key] = int(st.get(key, 0)) + n


func stat(key: String) -> int:
	return int((profile["stats"] as Dictionary).get(key, 0))


func record_best(key: String, value: int, lower_better: bool = false) -> bool:
	var rec: Dictionary = profile["records"]
	if not rec.has(key) or (value < int(rec[key]) if lower_better else value > int(rec[key])):
		rec[key] = value
		save_profile()
		return true
	return false


func add_rank_points(n: int) -> void:
	profile["rank_points"] = int(profile["rank_points"]) + n
	save_profile()


func rank_name() -> String:
	var pts := int(profile.get("rank_points", 0))
	var kyu := [0, 30, 70, 120, 180, 250, 330, 420, 520, 630]
	var dan := [750, 900, 1080, 1300, 1560, 1860, 2200, 2600, 3050, 3600]
	if pts >= 4500:
		return DataDB.t("rank_master")
	for i: int in range(dan.size() - 1, -1, -1):
		if pts >= dan[i]:
			return DataDB.t("rank_dan") % (i + 1)
	for j: int in range(kyu.size() - 1, -1, -1):
		if pts >= kyu[j]:
			return DataDB.t("rank_kyu") % (10 - j)
	return DataDB.t("rank_kyu") % 10
