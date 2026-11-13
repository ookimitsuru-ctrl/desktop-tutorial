class_name DataLoader
extends RefCounted
## data/ の JSON とベイク済みバイナリを読み込み、シミュレーション用の不変定義を作る。
## （浮動小数点を経由しないよう、小数は文字列で記述し FP.from_str で変換する）

const DATA := "res://data/"


static func read_json(path: String) -> Variant:
	var f := FileAccess.open(path, FileAccess.READ)
	if f == null:
		push_error("DataLoader: 開けません " + path)
		return null
	var txt := f.get_as_text()
	var v: Variant = JSON.parse_string(txt)
	if v == null:
		push_error("DataLoader: JSON 解析失敗 " + path)
	return v


static func fpv(v: Variant, def: int = 0) -> int:
	if v == null:
		return def
	if v is String:
		return FP.from_str(v)
	return FP.from_int(int(v))


static func load_rules() -> RulesDef:
	var j: Dictionary = read_json(DATA + "common/rules.json")
	var r := RulesDef.new()
	r.health = int(j["health"])
	r.round_frames = int(j["round_seconds_default"]) * 60
	r.rounds_to_win = int(j["rounds_to_win_default"])
	r.start_distance = fpv(j["start_distance"])
	var inp: Dictionary = j["input"]
	r.simul_window = int(inp["simultaneous_window"])
	r.double_tap_window = int(inp["double_tap_window"])
	r.motion_window_2 = int(inp["motion_window_2dir"])
	r.motion_window_3 = int(inp["motion_window_3dir"])
	r.button_after_motion = int(inp["button_after_motion"])
	r.buffer_frames = int(inp["buffer_frames"])
	r.crouch_tap_frames = int(inp["crouch_tap_to_evade_frames"])
	var ev: Dictionary = j["evade"]
	r.evade_success_from = int(ev["success_start"])
	r.evade_success_to = int(ev["success_end"])
	r.evade_distance = fpv(ev["distance"])
	r.evade_guard_from = int(ev["guard_cancel_from"])
	r.evade_attack_from = int(ev["attack_window"][0])
	r.evade_attack_to = int(ev["attack_window"][1])
	r.evade_bonus = int(ev["success_bonus_frames"])
	var th: Dictionary = j["throw"]
	r.throw_whiff_recovery = int(th["whiff_recovery"])
	r.throw_escape_before = int(th["escape_before"])
	r.throw_escape_after = int(th["escape_after"])
	r.throw_protect = int(th["post_stun_protect"])
	r.throw_escape_adv = int(th["escape_advantage"])
	var ch: Dictionary = j["counter"]
	r.ch_mul_num = int(ch["damage_num"])
	r.ch_mul_den = int(ch["damage_den"])
	r.ch_extra_adv = int(ch["default_extra_adv"])
	var hs: Dictionary = j["hitstop"]
	r.hitstop_hit = _ints(hs["hit"])
	r.hitstop_block = _ints(hs["block"])
	r.hitstop_ch_bonus = int(hs["ch_bonus"])
	r.hitstop_finisher = int(hs["finisher"])
	var jg: Dictionary = j["juggle"]
	r.gravity = fpv(jg["gravity"])
	r.relaunch_num = int(jg["relaunch_num"])
	r.relaunch_den = int(jg["relaunch_den"])
	r.gravity_add_pct = int(jg["gravity_add_pct"])
	r.launch_gravity_pct = int(jg.get("launch_gravity_pct", 100))
	r.launch_vy_pct = int(jg.get("launch_vy_pct", 100))
	r.air_hurt_bonus_mm = (fpv(jg.get("air_hurt_bonus", "0")) * 1000) >> 16
	r.juggle_vy = fpv(jg.get("juggle_vy", "0.055"))
	r.max_air_hits = int(jg["max_air_hits"])
	r.scaling_pct = _ints(jg["scaling_pct"])
	r.wall_scale_pct = int(jg["wall_pct"])
	r.stagger_max_reduce_pct = int(j["stagger"]["max_reduction_pct"])
	var te: Dictionary = j["tech"]
	r.tech_before = int(te["window_before"])
	r.tech_after = int(te["window_after"])
	r.tech_invuln = int(te["invuln_frames"])
	r.down_min = int(j["down"]["min_lying"])
	r.down_max = int(j["down"]["max_lying"])
	var wl: Dictionary = j["wall"]
	r.wall_hit_speed = fpv(wl["hit_min_speed"])
	r.wall_stagger_frames = int(wl["stagger_frames"])
	r.wall_splat_frames = int(wl["splat_frames"])
	r.breakable_hp = int(wl["breakable_hp"])
	var ra: Dictionary = j["relative_angle"]
	r.side_from_deg = int(ra["side_from"])
	r.back_from_deg = int(ra["back_from"])
	r.side_hitstun_bonus = int(ra["side_hitstun_bonus"])
	r.back_damage_pct = int(ra["back_damage_pct"])
	r.intro_frames = int(j["round_flow"]["intro_frames"])
	r.end_frames = int(j["round_flow"]["end_frames"])
	r.tracking_rate_deg = int(j["tracking_default_rate_deg"])
	return r


static func _ints(a: Array) -> PackedInt32Array:
	var r := PackedInt32Array()
	for v: Variant in a:
		r.append(int(v))
	return r


static func load_stage(id: String) -> StageDef:
	var j: Dictionary = read_json(DATA + "stages/" + id + ".json")
	var s := StageDef.new()
	s.id = id
	var nm: Array = j.get("name", [id, id])
	s.name_ja = String(nm[0])
	s.name_en = String(nm[1])
	var ring: Dictionary = j["ring"]
	var verts: Array = ring.get("vertices", [])
	if ring.has("circle"):
		verts = _circle(ring["circle"])
	for v: Array in verts:
		s.vx.append(fpv(v[0]))
		s.vz.append(fpv(v[1]))
	var edges: Array = ring["edges"]
	for k: int in range(s.vx.size()):
		var e: Dictionary = edges[k] if k < edges.size() else edges[edges.size() - 1]
		var t := String(e.get("type", "wall"))
		s.edge_type.append(_edge_type(t))
		s.edge_height.append(fpv(e.get("height", "0.8")))
		s.edge_after.append(_edge_type(String(e.get("after", "open"))))
		s.edge_hp.append(int(e.get("hp", 2)))
	for sp: Array in ring["start"]:
		s.start_x.append(fpv(sp[0]))
		s.start_z.append(fpv(sp[1]))
	s.compute_normals()
	return s


## 円形リング: {"radius": "6.0", "segments": 32} を多角形に（頂点は整数演算で）
static func _circle(c: Dictionary) -> Array:
	var r := String(c.get("radius", "6.0"))
	var n := int(c.get("segments", 32))
	var out: Array = []
	var rf := FP.from_str(r)
	for k: int in range(n):
		var a := (k * FP.ANG_FULL) / n
		var x := FP.mul(FP.cos(a), rf)
		var z := FP.mul(FP.sin(a), rf)
		out.append([_fp_to_str(x), _fp_to_str(z)])
	return out


static func _fp_to_str(v: int) -> String:
	# Q16.16 → 10進文字列（小数第6位まで、整数演算）
	var neg := v < 0
	var a := absi(v)
	var ip := a >> 16
	var frac := ((a & 0xFFFF) * 1000000) >> 16
	return ("-" if neg else "") + str(ip) + "." + str(frac).pad_zeros(6)


static func _edge_type(t: String) -> int:
	match t:
		"open":
			return SE.EDGE_OPEN
		"fence":
			return SE.EDGE_FENCE
		"breakable":
			return SE.EDGE_BREAKABLE
	return SE.EDGE_WALL


static func character_json(id: String) -> Dictionary:
	return read_json(DATA + "characters/" + id + "/character.json")


## キャラの技一覧（共通技を含む）。id にはキャラ接頭辞を付ける
static func moves_json(id: String) -> Array:
	var j: Dictionary = read_json(DATA + "characters/" + id + "/moves.json")
	var out: Array = (j["moves"] as Array).duplicate(true)
	var have := {}
	for m: Dictionary in out:
		have[String(m["id"])] = true
	var cj: Dictionary = read_json(DATA + "common/common_moves.json")
	for m2: Dictionary in cj["moves"]:
		var c: Dictionary = m2.duplicate(true)
		c["id"] = id + "_" + String(c["id"])
		if not have.has(c["id"]):
			out.append(c)
	return out


static func _index_in(names: Array[String], v: String, def: int) -> int:
	var i := names.find(v)
	return i if i >= 0 else def


static func load_character(id: String, index: int, baked: BakedChar) -> CharDef:
	var j := character_json(id)
	var cd := CharDef.new()
	cd.index = index
	cd.id = id
	var nm: Array = j.get("name", [id, id])
	cd.name_ja = String(nm[0])
	cd.name_en = String(nm[1])
	cd.weight_class = ["light", "middle", "heavy"].find(String(j.get("weight_class", "middle")))
	var ph: Dictionary = j["physics"]
	cd.push_radius = fpv(ph["push_radius"])
	cd.float_factor = fpv(ph["float_factor"])
	cd.hurt_mul = fpv(ph.get("hurt_mul", "1.0"))
	cd.throw_range = fpv(ph["throw_range"])
	var mv: Dictionary = j["movement"]
	cd.walk_f = fpv(mv["walk_f"]) / 60
	cd.walk_b = fpv(mv["walk_b"]) / 60
	cd.dash_f_frames = int(mv["dash_f"][0])
	cd.dash_f_dist = fpv(mv["dash_f"][1])
	cd.dash_b_frames = int(mv["dash_b"][0])
	cd.dash_b_dist = fpv(mv["dash_b"][1])
	cd.run_max = fpv(mv["run"]) / 60
	cd.evade_total = int(mv.get("evade", 22))
	for sdef: Dictionary in j.get("stances", []):
		cd.stance_ids.append(String(sdef["id"]))
		cd.stance_max.append(int(sdef.get("max_frames", 0)))
		cd.stance_low.append(1 if bool(sdef.get("low_profile", false)) else 0)
	cd.baked = baked
	if baked != null:
		for k: int in range(baked.anim_names.size()):
			cd.anim_index[baked.anim_names[k]] = k
		cd.anim_names = baked.anim_names
	cd.common.resize(PoseRef.NAMES.size())
	for k2: int in range(PoseRef.NAMES.size()):
		cd.common[k2] = int(cd.anim_index.get(PoseRef.NAMES[k2], 0))
	for sid: String in cd.stance_ids:
		cd.stance_anim.append(int(cd.anim_index.get("stance_" + sid, 0)))
	var mj := moves_json(id)
	for k3: int in range(mj.size()):
		var m := _move(mj[k3], k3, cd)
		cd.moves.append(m)
		cd.move_by_id[m.id] = m
	for k4: int in range(mj.size()):
		_link(mj[k4], cd.moves[k4], cd)
	cd.side_throw = cd.move_index(String(j.get("side_throw", "")))
	cd.back_throw = cd.move_index(String(j.get("back_throw", "")))
	cd.cmd_moves = cd.moves.duplicate()
	cd.cmd_moves.sort_custom(func(a: MoveDef, b: MoveDef) -> bool:
		if a.priority != b.priority:
			return a.priority > b.priority
		return a.index < b.index)
	return cd


static func _move(d: Dictionary, idx: int, cd: CharDef) -> MoveDef:
	var m := MoveDef.new()
	m.index = idx
	m.id = String(d["id"])
	var nm: Array = d.get("name", [m.id, m.id])
	m.name_ja = String(nm[0])
	m.name_en = String(nm[1])
	m.category = String(d.get("cat", "basic"))
	for t: Variant in d.get("tags", []):
		m.tags.append(String(t))
	m.cmd = CommandSpec.parse(String(d.get("cmd", "P")))
	if not m.cmd.valid:
		push_error("コマンド不正: %s %s" % [m.id, d.get("cmd", "")])
	m.chain_only = bool(d.get("chain_only", false))
	for fr: Variant in d.get("from", []):
		var fs := String(fr)
		var bit := SE.FROM_NAMES.find(fs)
		if bit >= 0:
			m.from_mask |= 1 << bit
	if d.has("stance"):
		m.from_mask |= SE.FROM_STANCE
		m.stance_from = cd.stance_ids.find(String(d["stance"]))
	m.level = _index_in(SE.LEVEL_NAMES, String(d.get("lv", "mid")), SE.LV_MID)
	m.limb = _index_in(SE.LIMB_NAMES, String(d.get("limb", "punch")), SE.LIMB_PUNCH)
	m.damage = int(d.get("dmg", 0))
	var f: Array = d.get("f", [10, 2, 12])
	m.startup = int(f[0])
	m.active = int(f[1])
	m.recovery = int(f[2])
	var adv: Array = d.get("adv", [0, 0, 0])
	m.hit_reaction = _index_in(SE.REACTION_NAMES, String(d.get("hr", "mid_light")), SE.R_MID_LIGHT)
	m.ch_reaction = _index_in(SE.REACTION_NAMES, String(d.get("chr", d.get("hr", "mid_light"))), m.hit_reaction)
	m.adv_block = int(adv[0]) if adv.size() > 0 and not (adv[0] is String) else 0
	m.adv_hit = int(adv[1]) if adv.size() > 1 and not (adv[1] is String) else 0
	if adv.size() > 2 and not (adv[2] is String):
		m.adv_ch = int(adv[2])
	else:
		m.adv_ch = m.adv_hit + 3
	m.weight = _index_in(SE.WEIGHT_NAMES, String(d.get("w", "light")), SE.W_LIGHT)
	m.tracking = _index_in(SE.TRACK_NAMES, String(d.get("trk", "linear")), SE.TRK_LINEAR)
	var tu_def := 4 if m.tracking == SE.TRK_LINEAR else maxi(4, m.startup - 2)
	m.track_until = int(d.get("trk_until", tu_def))
	m.stagger_frames = int(d.get("stagger", 36))
	if d.has("launch"):
		var la: Array = d["launch"]
		m.launch_vy = fpv(la[0])
		m.launch_vx = fpv(la[1]) if la.size() > 1 else 0
	m.air_vy = fpv(d.get("air_vy", null), 0)
	if d.has("push"):
		var pu: Array = d["push"]
		m.push_block = fpv(pu[0])
		m.push_hit = fpv(pu[1]) if pu.size() > 1 else 0
	for fl: Variant in d.get("flags", []):
		var bi := SE.FLAG_NAMES.find(String(fl))
		if bi >= 0:
			m.flags |= 1 << bi
	for pz: Array in d.get("posture", []):
		m.posture_from.append(int(pz[0]))
		m.posture_to.append(int(pz[1]))
		var pb := SE.POSTURE_NAMES.find(String(pz[2]))
		m.posture_flag.append(1 << pb if pb >= 0 else 0)
	m.anim_index = int(cd.anim_index.get(m.id, -1))
	m.priority = m.cmd.base_priority() + int(d.get("priority", 0))
	m.reach = 0
	if cd.baked != null and m.anim_index >= 0:
		m.reach = _reach(cd.baked, m)
	if d.has("throw"):
		var th: Dictionary = d["throw"]
		m.is_throw = true
		m.throw_range = fpv(th.get("range", null), 0)
		m.throw_escape = _esc(String(th.get("esc", "N")))
		m.throw_len = int(th.get("len", 60))
		m.throw_dmg_frame = int(th.get("dmg_frame", 36))
		var te := String(th.get("end", "up"))
		m.throw_end_down = SE.DOWN_FACE if te == "face" else SE.DOWN_UP
		match te:
			"stagger":
				m.throw_end_kind = SE.TE_STAGGER
			"stand":
				m.throw_end_kind = SE.TE_STAND
			"backturn":
				m.throw_end_kind = SE.TE_BACKTURN
		m.throw_end_stun = int(th.get("stun", 30))
		m.throw_mash = int(th.get("mash", 0))
		m.throw_end_air = bool(th.get("air", false))
		m.throw_vs_down = bool(th.get("vs_down", false))
		m.throw_stage = bool(th.get("stage", false))
		m.throw_next_window = int(th.get("next_window", 18))
		m.throw_anim = int(cd.anim_index.get(m.id + "__throw", -1))
	if d.has("parry"):
		var pa: Dictionary = d["parry"]
		m.parry_from = int(pa["win"][0])
		m.parry_to = int(pa["win"][1])
		for lv: Variant in pa.get("levels", []):
			m.parry_levels |= 1 << SE.LEVEL_NAMES.find(String(lv))
		for lb: Variant in pa.get("limbs", []):
			m.parry_limbs |= 1 << SE.LIMB_NAMES.find(String(lb))
	return m


static func _esc(s: String) -> int:
	match s:
		"N", "n", "5":
			return SE.ESC_N
		"4":
			return SE.ESC_BACK
		"6":
			return SE.ESC_FWD
		"2":
			return SE.ESC_DOWN
	return SE.ESC_NONE


## 技の相互参照（連携・溜め・当て身・連続投げ・構え）
static func _link(d: Dictionary, m: MoveDef, cd: CharDef) -> void:
	for c: Dictionary in d.get("chain", []):
		var to := cd.move_index(String(c["to"]))
		if to < 0:
			push_error("連携先がありません: %s → %s" % [m.id, c["to"]])
			continue
		var spec := CommandSpec.parse(String(c.get("in", "P")))
		var win: Array = c.get("win", [1, m.total()])
		m.chain_to.append(to)
		m.chain_btn.append(spec.buttons)
		m.chain_dir.append(spec.dir)
		m.chain_from.append(int(win[0]))
		m.chain_to_f.append(int(win[1]))
		m.chain_at.append(int(c.get("at", m.active_end() + 1)))
		var cond := String(c.get("cond", "any"))
		m.chain_cond.append(SE.CH_HIT if cond == "hit" else (SE.CH_CONTACT if cond == "contact" else SE.CH_ANY))
		m.chain_just.append(int(c.get("just", 0)))
		m.chain_just_to.append(cd.move_index(String(c.get("just_to", ""))))
	if d.has("charge"):
		var ch: Dictionary = d["charge"]
		m.charge_btn = CommandSpec.parse(String(ch.get("btn", "P"))).buttons
		m.charge_at = int(ch.get("at", 20))
		m.charge_to = cd.move_index(String(ch["to"]))
	if d.has("parry"):
		m.parry_success = cd.move_index(String(d["parry"].get("success", "")))
	if d.has("end_stance"):
		m.end_stance = cd.stance_ids.find(String(d["end_stance"]))
	if d.has("throw"):
		for nx: Dictionary in d["throw"].get("next", []):
			var spec2 := CommandSpec.parse(String(nx.get("in", "P+G")))
			m.throw_next_to.append(cd.move_index(String(nx["to"])))
			m.throw_next_btn.append(spec2.buttons)
			m.throw_next_dir.append(spec2.dir)


## ベイクから到達距離（mm → Q16.16）
static func _reach(bk: BakedChar, m: MoveDef) -> int:
	var best := 0
	for fr: int in range(m.startup, m.active_end() + 1):
		var o := bk.hit_at(m.anim_index, fr)
		if o < 0:
			continue
		for s: int in range(2):
			var rad: int = bk.hit[o + s * 7 + 6]
			if rad > 0:
				best = maxi(best, maxi(int(bk.hit[o + s * 7 + 2]), int(bk.hit[o + s * 7 + 5])) + rad)
	return FighterCtl.mm_to_fp(best)


# ------------------------------------------------------------ ベイクデータ

static func baked_path(id: String) -> String:
	return DATA + "baked/" + id + ".bin"


static func load_baked(id: String) -> BakedChar:
	var path := baked_path(id)
	if not FileAccess.file_exists(path):
		push_warning("ベイクデータがありません: " + path)
		return null
	var f := FileAccess.open(path, FileAccess.READ)
	var bk := BakedChar.new()
	var magic := f.get_buffer(4).get_string_from_ascii()
	if magic != "RBBK":
		push_error("ベイク形式不正: " + path)
		return null
	var _ver := f.get_32()
	var hash_len := f.get_32()
	bk.source_hash = f.get_buffer(hash_len).get_string_from_utf8()
	var n := f.get_32()
	for k: int in range(n):
		var ln := f.get_32()
		bk.anim_names.append(f.get_buffer(ln).get_string_from_utf8())
		bk.anim_len.append(f.get_32())
		bk.anim_loop.append(f.get_32())
		bk.anim_offset.append(_s32(f.get_32()))
		bk.motion_offset.append(_s32(f.get_32()))
		bk.hit_offset.append(_s32(f.get_32()))
		bk.victim_offset.append(_s32(f.get_32()))
	bk.hurt = _read_i16(f, f.get_32())
	bk.motion = _read_i16(f, f.get_32())
	bk.hit = _read_i16(f, f.get_32())
	bk.victim = _read_i32(f, f.get_32())
	return bk


static func _s32(v: int) -> int:
	return v - 0x100000000 if v >= 0x80000000 else v


static func _read_i16(f: FileAccess, count: int) -> PackedInt32Array:
	var buf := f.get_buffer(count * 2)
	var out := PackedInt32Array()
	out.resize(count)
	for i: int in range(count):
		out[i] = buf.decode_s16(i * 2)
	return out


static func _read_i32(f: FileAccess, count: int) -> PackedInt32Array:
	var buf := f.get_buffer(count * 4)
	var out := PackedInt32Array()
	out.resize(count)
	for i: int in range(count):
		out[i] = buf.decode_s32(i * 4)
	return out
