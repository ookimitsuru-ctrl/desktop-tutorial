class_name Baker
extends RefCounted
## アニメーションから喰らい判定・攻撃判定・移動量・被投げ位置をベイクして data/baked/<id>.bin に書き出す。
## 仕様: 09_art_animation_camera_vfx.md §9.6

const VERSION := 1
## テンプレートを変更したら上げる（ベイクの再生成が必要なことを検出するため）
const TEMPLATE_VERSION := "tpl-2"
const B := Rig.B

## 11 本の喰らいカプセル: [ボーンA, tA, ボーンB, tB, 半径]
const HURT_CAPS := [
	[B.HEAD, 0.25, B.HEAD, 0.72, 0.105],
	[B.CHEST, 0.10, B.CHEST, 0.95, 0.15],
	[B.HIPS, 0.0, B.SPINE, 0.8, 0.14],
	[B.L_UPPER_ARM, 0.0, B.L_UPPER_ARM, 1.0, 0.055],
	[B.R_UPPER_ARM, 0.0, B.R_UPPER_ARM, 1.0, 0.055],
	[B.L_LOWER_ARM, 0.0, B.L_HAND, 0.6, 0.05],
	[B.R_LOWER_ARM, 0.0, B.R_HAND, 0.6, 0.05],
	[B.L_UPPER_LEG, 0.0, B.L_UPPER_LEG, 1.0, 0.085],
	[B.R_UPPER_LEG, 0.0, B.R_UPPER_LEG, 1.0, 0.085],
	[B.L_LOWER_LEG, 0.0, B.L_FOOT, 0.5, 0.06],
	[B.R_LOWER_LEG, 0.0, B.R_FOOT, 0.5, 0.06],
]


static func source_hash(id: String) -> String:
	var ctx := HashingContext.new()
	ctx.start(HashingContext.HASH_SHA256)
	for p: String in [
		"res://data/characters/%s/character.json" % id,
		"res://data/characters/%s/moves.json" % id,
		"res://data/common/common_moves.json",
	]:
		var f := FileAccess.open(p, FileAccess.READ)
		if f != null:
			ctx.update(f.get_buffer(f.get_length()))
	ctx.update(TEMPLATE_VERSION.to_utf8_buffer())
	return ctx.finish().hex_encode().substr(0, 32)


static func mm(v: float) -> int:
	return int(round(v * 1000.0))


## キャラ空間 [右,上,前] mm へ（モデル空間 → 反転 z）
static func cs(v: Vector3) -> Vector3i:
	return Vector3i(mm(v.x), mm(v.y), mm(-v.z))


static func bake(id: String) -> String:
	var cj := DataLoader.character_json(id)
	var moves := DataLoader.moves_json(id)
	var lib := AnimLibrary.build(cj, moves)
	var rig := lib.rig
	var pe := PoseEval.new(rig)
	var sc := rig.height / 1.78
	var move_by_id := {}
	for md: Dictionary in moves:
		move_by_id[String(md["id"])] = md
	var lead := lib.templates.lead
	var hurt := PackedInt32Array()
	var motion := PackedInt32Array()
	var hit := PackedInt32Array()
	var victim := PackedInt32Array()
	var table: Array = []
	for n: String in lib.names:
		var c: AnimClip = lib.clips[n]
		var ln := maxi(1, c.length)
		var hurt_off := hurt.size()
		for fr: int in range(1, ln + 1):
			pe.evaluate(c.sample(float(fr)))
			for cap: Array in HURT_CAPS:
				var a := cs(pe.seg_point(int(cap[0]), float(cap[1])))
				var b := cs(pe.seg_point(int(cap[2]), float(cap[3])))
				hurt.append_array([a.x, a.y, a.z, b.x, b.y, b.z, mm(float(cap[4]) * sc)])
		var motion_off := -1
		var hit_off := -1
		var victim_off := -1
		var base_id := n.trim_suffix("__throw")
		if move_by_id.has(base_id):
			var md: Dictionary = move_by_id[base_id]
			# 移動量（累積を丸めて差分を取り、総量を正確に）
			motion_off = motion.size()
			var prev_r := mm(c.sample(0.0).root.x)
			var prev_f := mm(c.sample(0.0).root.z)
			for fr2: int in range(1, ln + 1):
				var rt := c.sample(float(fr2)).root
				var cr := mm(rt.x)
				var cf := mm(rt.z)
				motion.append(cr - prev_r)
				motion.append(cf - prev_f)
				prev_r = cr
				prev_f = cf
			if not n.ends_with("__throw"):
				var specs := HitSpec.for_move(md, lead)
				if specs.size() > 0:
					hit_off = hit.size()
					var fr_arr: Array = md.get("f", [10, 2, 12])
					var s0 := int(fr_arr[0])
					var s1 := s0 + int(fr_arr[1]) - 1
					for fr3: int in range(1, ln + 1):
						if fr3 < s0 or fr3 > s1:
							for _z: int in range(14):
								hit.append(0)
							continue
						pe.evaluate(c.sample(float(fr3)))
						for k: int in range(2):
							if k < specs.size():
								var sp: Dictionary = specs[k]
								var pa := cs(pe.seg_point(int(sp["bone"]), float(sp["t0"])))
								var pb := cs(pe.seg_point(int(sp["bone"]), float(sp["t1"])))
								hit.append_array([pa.x, pa.y, pa.z, pb.x, pb.y, pb.z, mm(float(sp["r"]) * sc)])
							else:
								hit.append_array([0, 0, 0, 0, 0, 0, 0])
			if c.is_throw():
				victim_off = victim.size()
				for fr4: int in range(1, ln + 1):
					var vs: Array = c.sample_victim(float(fr4))
					var vr: Vector3 = vs[1]
					var yaw := int(round(float(vs[2]) / 360.0 * 65536.0)) & 0xFFFF
					victim.append_array([mm(vr.x), mm(vr.y), mm(vr.z), yaw])
		table.append([n, ln, 1 if c.loop else 0, hurt_off, motion_off, hit_off, victim_off])
	# 書き出し
	var path := ProjectSettings.globalize_path(DataLoader.baked_path(id))
	DirAccess.make_dir_recursive_absolute(path.get_base_dir())
	var f := FileAccess.open(path, FileAccess.WRITE)
	f.store_buffer("RBBK".to_ascii_buffer())
	f.store_32(VERSION)
	var hs := source_hash(id).to_utf8_buffer()
	f.store_32(hs.size())
	f.store_buffer(hs)
	f.store_32(table.size())
	for row: Array in table:
		var nb := String(row[0]).to_utf8_buffer()
		f.store_32(nb.size())
		f.store_buffer(nb)
		for k2: int in range(1, 7):
			f.store_32(int(row[k2]) & 0xFFFFFFFF)
	_store_i16(f, hurt)
	_store_i16(f, motion)
	_store_i16(f, hit)
	f.store_32(victim.size())
	var vb := PackedByteArray()
	vb.resize(victim.size() * 4)
	for i: int in range(victim.size()):
		vb.encode_s32(i * 4, victim[i])
	f.store_buffer(vb)
	f.close()
	# 骨格（モデル生成ツール用）
	var rj := FileAccess.open(ProjectSettings.globalize_path("res://data/baked/%s.rig.json" % id), FileAccess.WRITE)
	rj.store_string(JSON.stringify(rig.to_json(), "  "))
	rj.close()
	return "%s: anims=%d hurt=%d motion=%d hit=%d victim=%d" % [id, table.size(), hurt.size(), motion.size(), hit.size(), victim.size()]


static func _store_i16(f: FileAccess, arr: PackedInt32Array) -> void:
	f.store_32(arr.size())
	var b := PackedByteArray()
	b.resize(arr.size() * 2)
	for i: int in range(arr.size()):
		b.encode_s16(i * 2, clampi(arr[i], -32768, 32767))
	f.store_buffer(b)
