class_name ReplayRecorder
extends RefCounted
## リプレイの記録と保存（入力のみ・数KB）。仕様: 06 §6.9, 12 §12.9

const MAX_AUTO := 50

var header: Dictionary = {}
var inputs: PackedInt32Array = PackedInt32Array()
var checks: PackedInt32Array = PackedInt32Array()


func begin(g: Node, w: SimWorld) -> void:
	header = {
		"version": ProjectSettings.get_setting("application/config/version", "0"),
		"data_hash": data_hash(),
		"seed": g.get("seed_value"), "chars": g.get("p_char"), "costumes": g.get("p_costume"), "colors": g.get("p_color"),
		"cpu": g.get("p_cpu"), "stage": g.get("stage"), "rounds_to_win": w.rounds_to_win, "round_seconds": w.round_frames / 60,
		"ringout": w.ringout_enabled, "date": Time.get_datetime_string_from_system(), "mode": g.get("mode"),
	}


static func data_hash() -> String:
	var ctx := HashingContext.new()
	ctx.start(HashingContext.HASH_MD5)
	var d := DirAccess.open("res://data/baked")
	if d != null:
		var files := d.get_files()
		files.sort()
		for f: String in files:
			if f.ends_with(".bin"):
				var fa := FileAccess.open("res://data/baked/" + f, FileAccess.READ)
				if fa != null:
					ctx.update(fa.get_buffer(mini(fa.get_length(), 65536)))
	return ctx.finish().hex_encode()


func add(i0: int, i1: int, w: SimWorld) -> void:
	inputs.append(i0)
	inputs.append(i1)
	if w.frame % 60 == 0:
		checks.append(w.frame)
		checks.append(w.checksum())


func save_auto() -> String:
	var dir := SaveData.REPLAY_DIR
	DirAccess.make_dir_recursive_absolute(dir)
	var stamp := Time.get_datetime_string_from_system().replace(":", "-")
	var path := "%s/%s_%s_vs_%s.rbr" % [dir, stamp, header["chars"][0], header["chars"][1]]
	save(path)
	_prune(dir)
	return path


func save(path: String) -> void:
	var f := FileAccess.open(path, FileAccess.WRITE)
	if f == null:
		return
	f.store_buffer("RBRP".to_ascii_buffer())
	f.store_16(1)
	var hj := JSON.stringify(header).to_utf8_buffer()
	f.store_32(hj.size())
	f.store_buffer(hj)
	# 入力（u16 を RLE）
	var packed := PackedInt32Array()
	var k := 0
	while k < inputs.size():
		var v := inputs[k]
		var run := 1
		while k + run < inputs.size() and inputs[k + run] == v and run < 65535:
			run += 1
		packed.append(v)
		packed.append(run)
		k += run
	f.store_32(packed.size())
	for x: int in packed:
		f.store_16(x & 0xFFFF)
	f.store_32(checks.size())
	for c: int in checks:
		f.store_32(c & 0xFFFFFFFF)
	f.close()


func _prune(dir: String) -> void:
	var d := DirAccess.open(dir)
	if d == null:
		return
	var files: Array[String] = []
	for f: String in d.get_files():
		if f.ends_with(".rbr") and not f.begins_with("fav_"):
			files.append(f)
	files.sort()
	while files.size() > MAX_AUTO:
		d.remove(files[0])
		files.remove_at(0)


static func load_file(path: String) -> Dictionary:
	var f := FileAccess.open(path, FileAccess.READ)
	if f == null:
		return {}
	if f.get_buffer(4).get_string_from_ascii() != "RBRP":
		return {}
	var _ver := f.get_16()
	var hl := f.get_32()
	var header_v: Variant = JSON.parse_string(f.get_buffer(hl).get_string_from_utf8())
	var n := f.get_32()
	var raw := PackedInt32Array()
	for _i: int in range(n):
		raw.append(f.get_16())
	var inputs_out := PackedInt32Array()
	for j: int in range(0, raw.size(), 2):
		for _r: int in range(raw[j + 1]):
			inputs_out.append(raw[j])
	var cn := f.get_32()
	var checks_out := PackedInt32Array()
	for _c: int in range(cn):
		checks_out.append(f.get_32())
	return {"header": header_v if header_v is Dictionary else {}, "inputs": inputs_out, "checks": checks_out}


static func list() -> Array[String]:
	var out: Array[String] = []
	var d := DirAccess.open(SaveData.REPLAY_DIR)
	if d == null:
		return out
	for f: String in d.get_files():
		if f.ends_with(".rbr"):
			out.append(SaveData.REPLAY_DIR + "/" + f)
	out.sort()
	out.reverse()
	return out
