extends Node
## ゲームデータ（キャラ・ステージ・文字列）のキャッシュと提供

var strings: Dictionary = {}
var _char_json: Dictionary = {}
var _libs: Dictionary = {}
var _stage_json: Dictionary = {}
var _story: Dictionary = {}

const STAGES: Array[String] = ["arena", "harbor", "bamboo", "fort", "ruins", "skyline", "temple", "raft", "lighthouse"]


func _ready() -> void:
	_load_strings()


func _load_strings() -> void:
	var f := FileAccess.open("res://i18n/strings.csv", FileAccess.READ)
	if f == null:
		return
	var header := f.get_csv_line()
	while not f.eof_reached():
		var row := f.get_csv_line()
		if row.size() < header.size() or row[0] == "":
			continue
		var d := {}
		for i: int in range(1, header.size()):
			d[header[i]] = row[i].replace("\\n", "\n")
		strings[row[0]] = d


## 翻訳文字列
func t(key: String) -> String:
	var d: Dictionary = strings.get(key, {})
	var l := Settings.lang()
	if d.has(l) and String(d[l]) != "":
		return d[l]
	if d.has("ja"):
		return d["ja"]
	return key


## [ja, en] 形式の名前を現在の言語で
func pick(pair: Variant) -> String:
	if pair is Array and (pair as Array).size() >= 2:
		return String(pair[0]) if Settings.lang() == "ja" else String(pair[1])
	return str(pair)


func characters() -> PackedStringArray:
	return SimFactory.available_characters()


func char_json(id: String) -> Dictionary:
	if not _char_json.has(id):
		_char_json[id] = DataLoader.character_json(id)
	return _char_json[id]


func anim_lib(id: String) -> AnimLibrary:
	if not _libs.has(id):
		_libs[id] = AnimLibrary.build(char_json(id), DataLoader.moves_json(id))
	return _libs[id]


func stage_json(id: String) -> Dictionary:
	if not _stage_json.has(id):
		_stage_json[id] = DataLoader.read_json("res://data/stages/%s.json" % id)
	return _stage_json[id]


func stages() -> Array[String]:
	var out: Array[String] = []
	for s: String in STAGES:
		if FileAccess.file_exists("res://data/stages/%s.json" % s):
			out.append(s)
	return out


func story(id: String) -> Dictionary:
	if not _story.has(id):
		var v: Variant = DataLoader.read_json("res://data/story/%s.json" % id) if FileAccess.file_exists("res://data/story/%s.json" % id) else {}
		_story[id] = v if v is Dictionary else {}
	return _story[id]


func char_name(id: String) -> String:
	return pick(char_json(id).get("name", [id, id]))


func move_name(cd: CharDef, m: MoveDef) -> String:
	return m.name_ja if Settings.lang() == "ja" else m.name_en
