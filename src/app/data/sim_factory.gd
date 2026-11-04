class_name SimFactory
extends RefCounted
## SimWorld の組み立て（データの読み込みとキャッシュ）

static var _rules: RulesDef = null
static var _chars: Dictionary = {}
static var _stages: Dictionary = {}
static var roster: PackedStringArray = PackedStringArray(["toma", "lena", "bjorn", "zaw", "yuelan", "mariel", "adrien", "ravi", "gensai"])


static func rules() -> RulesDef:
	if _rules == null:
		_rules = DataLoader.load_rules()
	return _rules


static func character(id: String) -> CharDef:
	if not _chars.has(id):
		var idx := roster.find(id)
		var bk := DataLoader.load_baked(id)
		_chars[id] = DataLoader.load_character(id, idx if idx >= 0 else 0, bk)
	return _chars[id]


static func stage(id: String) -> StageDef:
	if not _stages.has(id):
		_stages[id] = DataLoader.load_stage(id)
	return _stages[id]


static func clear_cache() -> void:
	_rules = null
	_chars.clear()
	_stages.clear()


static func available_characters() -> PackedStringArray:
	var out := PackedStringArray()
	for id: String in roster:
		if FileAccess.file_exists("res://data/characters/%s/character.json" % id) and FileAccess.file_exists(DataLoader.baked_path(id)):
			out.append(id)
	return out


static func world(c0: String, c1: String, stage_id: String, seed_value: int, opts: Dictionary = {}) -> SimWorld:
	var w := SimWorld.new()
	w.ringout_enabled = bool(opts.get("ringout", true))
	var r := rules()
	w.setup(r, stage(stage_id), character(c0), character(c1), seed_value)
	if opts.has("rounds_to_win"):
		w.rounds_to_win = int(opts["rounds_to_win"])
	if opts.has("round_seconds"):
		w.round_frames = int(opts["round_seconds"]) * 60
		w.reset_round()
	return w
