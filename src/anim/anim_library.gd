class_name AnimLibrary
extends RefCounted
## キャラクター1人分の全アニメーション（共通・構え・技・投げ）を生成する。
## 名前の並び順がベイクデータのアニメ番号になる（ベイカーとシミュレーションが共有）。

var names: PackedStringArray = PackedStringArray()
var clips: Dictionary = {}
var templates: AnimTemplates
var rig: Rig


## char_json: character.json、moves: 技（共通技を含む、読み込み順）
static func build(char_json: Dictionary, moves: Array) -> AnimLibrary:
	var lib := AnimLibrary.new()
	lib.rig = Rig.build(char_json.get("body", {}))
	var mv: Dictionary = char_json.get("movement", {})
	lib.templates = AnimTemplates.new(lib.rig, char_json.get("stance", {}), mv)
	for sdef: Dictionary in char_json.get("stances", []):
		lib.templates.stance_defs[String(sdef["id"])] = sdef
	var dash_f: Array = mv.get("dash_f", [18, "1.4"])
	var dash_b: Array = mv.get("dash_b", [20, "1.1"])
	for n: String in PoseRef.NAMES:
		var info := {}
		if n == "dash_f":
			info["frames"] = int(dash_f[0])
		elif n == "dash_b":
			info["frames"] = int(dash_b[0])
		elif n == "win":
			info["variant"] = int(char_json.get("win_pose", 0))
		lib._add(lib.templates.common(n, info))
	for sdef2: Dictionary in char_json.get("stances", []):
		lib._add(lib.templates.stance_clip(String(sdef2["id"])))
	for md: Dictionary in moves:
		lib._add(lib.templates.move(md))
		if md.has("throw"):
			lib._add(ThrowTemplates.throw_clip(lib.templates, md))
	return lib


func _add(c: AnimClip) -> void:
	if clips.has(c.name):
		push_warning("AnimLibrary: 重複したアニメ名 " + c.name)
		return
	names.append(c.name)
	clips[c.name] = c


func index_of(n: String) -> int:
	return names.find(n)


func clip(n: String) -> AnimClip:
	return clips.get(n, null)
