extends SceneTree
## コンボの自動探索と検証。浮かせ始動・壁始動のルートをビーム探索し、
## 軽・中・重の 3 体重級のダミー全てで成立したものを data/characters/<id>/combos.json に書き出す。
## 使い方: godot --headless -s res://tools/validate/combo_search.gd [-- id ...] [--verify]
##   --verify: 探索せず、既存の combos.json が全て成立するかだけ確認（失敗で終了コード 1）

const N := 5
const DUMMIES := {"light": "lena", "middle": "toma", "heavy": "bjorn"}
const BEAM := 6
const DEPTH := 5


func _init() -> void:
	var ids: Array[String] = []
	var verify := false
	for a: String in OS.get_cmdline_user_args():
		if a == "--verify":
			verify = true
		else:
			ids.append(a)
	if ids.is_empty():
		var d := DirAccess.open("res://data/characters")
		for n: String in d.get_directories():
			ids.append(n)
	var bad := 0
	for id: String in ids:
		if verify:
			bad += _verify(id)
		else:
			_search(id)
	quit(1 if bad > 0 else 0)


# ------------------------------------------------------------ 実行

## ルートを実行して結果を返す: {ok, damage, hits, timing}
static func run(cid: String, dummy: String, route: Array, wall: bool) -> Dictionary:
	var cd := SimFactory.character(cid)
	var starter: MoveDef = cd.move_by_id.get(String(route[0]), null)
	if starter == null:
		return {"ok": false}
	var ctx := "stand"
	if (starter.from_mask & SE.FROM_STAND) == 0:
		if (starter.from_mask & SE.FROM_RISE) != 0:
			ctx = "rise"
		elif (starter.from_mask & SE.FROM_DASH) != 0:
			ctx = "dash"
	for dist: String in (["1.05", "1.30", "0.85"] if ctx == "dash" else ["0.80", "0.95", "1.10", "0.68"]):
		var w := SimFactory.world(cid, dummy, "temple" if wall else "arena", 3, {"ringout": false})
		var r := _run_at(w, starter, ctx, route, FP.from_str(dist), wall)
		if bool(r.get("started", false)):
			return r
	return {"ok": false}


static func _run_at(w: SimWorld, starter: MoveDef, ctx: String, route: Array, dist: int, wall: bool) -> Dictionary:
	SimDriver.skip_intro(w)
	SimDriver.place(w, dist)
	if wall:
		# 相手（P2）を壁の手前 0.45m に置く（temple は x = ±5 が壁）
		var shift := FP.from_str("4.55") - w.f[1].x
		w.f[0].x += shift
		w.f[1].x += shift
	var seq := SimDriver.command_inputs(starter, ctx)
	var runner := ComboRunner.new()
	runner.start(w, 0, route.slice(1))
	var t0 := w.frame
	var started := false
	var max_dmg := 0
	var timing: Array[int] = []
	var k := 0
	var last_press := -1
	var hit_frame := -1
	var splatted := false
	while k < 400:
		var a_in := SimDriver.inp(N)
		if k < seq.size():
			a_in = seq[k]
			if InputBits.pressed(seq[k]) != 0 and last_press < 0:
				last_press = w.frame
				timing.append(0)
		elif started and (splatted or not wall):
			var nf := runner.press_frames.size()
			a_in = runner.next_input()
			if runner.press_frames.size() > nf:
				timing.append(w.frame - last_press)
				last_press = w.frame
		w.step(a_in, SimDriver.inp(N))
		if not started:
			for e: Dictionary in w.events:
				if String(e["kind"]) == "hit" and int(e["attacker"]) == 0:
					started = true
					hit_frame = w.frame
			if started and not wall and w.f[1].state != SE.ST_AIR:
				return {"started": true, "ok": false}
		else:
			# 壁始動: 壁に張り付くまで待つ（張り付かずに落ちたら失敗）
			if wall and not splatted:
				if w.f[1].state == SE.ST_WALL:
					splatted = true
				elif w.f[1].state == SE.ST_DOWN or w.frame - hit_frame > 40:
					return {"started": true, "ok": false}
			runner.observe(w.events)
		max_dmg = maxi(max_dmg, w.f[1].combo_dmg)
		if started and runner.done and (splatted or not wall):
			break
		if not started and k > seq.size() + starter.total() + 10:
			break
		k += 1
	var ok := started and (splatted or not wall) and not runner.failed and runner.idx >= route.size() - 1 and runner.hits >= route.size() - 1
	return {"started": started, "ok": ok, "damage": max_dmg, "hits": runner.hits + 1, "timing": timing, "frames": w.frame - t0}


static func _starter_ok(w: SimWorld, wall: bool) -> bool:
	var d := w.f[1]
	if wall:
		return d.state == SE.ST_WALL
	return d.state == SE.ST_AIR


# ------------------------------------------------------------ 探索

static func _segments(cd: CharDef) -> Array:
	var out: Array = []
	for m: MoveDef in cd.moves:
		if m.chain_only or not m.is_strike() or m.level == SE.LV_DOWN:
			continue
		if (m.from_mask & SE.FROM_STAND) == 0 or m.cmd == null or m.cmd.buttons == 0:
			continue
		if m.startup > 20 or m.charge_to >= 0 and m.startup > 18:
			continue
		_chains(cd, [m.id], m, out, 0)
	return out


static func _chains(cd: CharDef, path: Array, m: MoveDef, out: Array, depth: int) -> void:
	out.append(path.duplicate())
	if depth >= 3:
		return
	for k: int in range(m.chain_to.size()):
		var nm := cd.moves[m.chain_to[k]]
		if not nm.is_strike():
			continue
		var p2 := path.duplicate()
		p2.append(nm.id)
		_chains(cd, p2, nm, out, depth + 1)


func _starters(cd: CharDef, wall: bool) -> Array[MoveDef]:
	var out: Array[MoveDef] = []
	for m: MoveDef in cd.moves:
		if m.chain_only or not m.is_strike() or m.cmd == null or m.cmd.buttons == 0:
			continue
		if (m.from_mask & (SE.FROM_STAND | SE.FROM_RISE | SE.FROM_DASH)) == 0:
			continue
		if wall:
			if m.has_flag(SE.F_WALL_SPLAT):
				out.append(m)
		elif m.hit_reaction == SE.R_LAUNCH:
			out.append(m)
	return out


func _search(cid: String) -> void:
	var cd := SimFactory.character(cid)
	var segs := _segments(cd)
	var found: Array = []
	for wall: bool in [false, true]:
		for st: MoveDef in _starters(cd, wall):
			found.append_array(_beam(cid, st, segs, wall))
	# 浮かせ 2 本（始動違い優先）＋ 壁 1 本
	found.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return int(a["_score"]) > int(b["_score"]))
	var out: Array = []
	var used := {}
	for want_wall: bool in [false, false, true]:
		# 始動の違うルートを優先し、無ければ同じ始動の別ルート
		for pass_i: int in range(2):
			var picked := false
			for c: Dictionary in found:
				if bool(c["wall"]) != want_wall or used.has(String(c["id"])):
					continue
				if pass_i == 0 and used.has("starter_" + String(c["starter"])):
					continue
				out.append(c)
				used[String(c["id"])] = true
				used["starter_" + String(c["starter"])] = true
				picked = true
				break
			if picked:
				break
	for c3: Dictionary in out:
		c3.erase("_score")
	var j := {"schema_version": 1, "character": cid, "combos": out}
	var f := FileAccess.open("res://data/characters/%s/combos.json" % cid, FileAccess.WRITE)
	f.store_string(JSON.stringify(j, "  ") + "\n")
	f.close()
	for c2: Dictionary in out:
		print("%s: %s %s dmg=%d" % [cid, "WALL" if bool(c2["wall"]) else "LAUNCH", c2["route"], int(c2["expected_damage"])])


func _count(found: Array, wall: bool) -> int:
	var n := 0
	var seen := {}
	for c: Dictionary in found:
		if bool(c["wall"]) == wall and not seen.has(String(c["starter"])):
			seen[String(c["starter"])] = true
			n += 1
	return n


func _beam(cid: String, st: MoveDef, segs: Array, wall: bool) -> Array:
	var beam: Array = [{"route": [st.id], "damage": 0}]
	var valid: Array = []
	var first := run(cid, "toma", [st.id], wall)
	if not bool(first.get("started", false)) or not bool(first.get("ok", false)):
		return []
	beam[0]["damage"] = int(first["damage"])
	for _d: int in range(DEPTH):
		var cand: Array = []
		for b: Dictionary in beam:
			for sg: Array in segs:
				var rt: Array = (b["route"] as Array).duplicate()
				rt.append_array(sg)
				if rt.size() > 8:
					continue
				var r := run(cid, "toma", rt, wall)
				if bool(r.get("ok", false)) and int(r["damage"]) > int(b["damage"]):
					cand.append({"route": rt, "damage": int(r["damage"])})
		if cand.is_empty():
			break
		cand.sort_custom(func(a: Dictionary, b2: Dictionary) -> bool: return int(a["damage"]) > int(b2["damage"]))
		beam = cand.slice(0, BEAM)
		for c: Dictionary in beam:
			var v := _validate(cid, c["route"], wall)
			if not v.is_empty():
				valid.append(v)
	# 2 番目の技が違うものを最大 2 本
	valid.sort_custom(func(a: Dictionary, b3: Dictionary) -> bool: return int(a["_score"]) > int(b3["_score"]))
	var out: Array = []
	var seconds := {}
	for v2: Dictionary in valid:
		var key := String((v2["route"] as Array)[1]) if (v2["route"] as Array).size() > 1 else ""
		if seconds.has(key):
			continue
		seconds[key] = true
		v2["id"] = "%s_%d" % [String(v2["id"]), out.size() + 1]
		out.append(v2)
		if out.size() >= 2:
			break
	return out


static func _validate(cid: String, route: Array, wall: bool) -> Dictionary:
	var min_dmg := 99999
	var classes: Array[String] = []
	var timing: Array = []
	for wc: String in DUMMIES:
		var r := run(cid, String(DUMMIES[wc]), route, wall)
		if not bool(r.get("ok", false)):
			if wc == "middle":
				return {}
			continue
		classes.append(wc)
		min_dmg = mini(min_dmg, int(r["damage"]))
		if wc == "middle":
			timing = r["timing"]
	var id := "%s_c_%s_%d" % [cid, String(route[0]).trim_prefix(cid + "_"), route.size()]
	# 成立する体重級が多いものを優先（スコア = ダメージ × 成立割合）
	return {"id": id, "starter": route[0], "context": "wall" if wall else "launch", "route": route, "timing": timing,
		"weight_classes": classes, "expected_damage": min_dmg, "wall": wall, "difficulty": clampi(route.size() - 2, 1, 5),
		"_score": min_dmg * classes.size()}


func _verify(cid: String) -> int:
	var p := "res://data/characters/%s/combos.json" % cid
	if not FileAccess.file_exists(p):
		print("%s: combos.json がありません" % cid)
		return 1
	var j: Dictionary = DataLoader.read_json(p)
	var bad := 0
	for c: Dictionary in j.get("combos", []):
		for wc: String in c.get("weight_classes", []):
			var r := run(cid, String(DUMMIES[wc]), c["route"], bool(c.get("wall", false)))
			if not bool(r.get("ok", false)) or int(r["damage"]) < int(c["expected_damage"]):
				print("%s: %s が %s に成立しない (%s)" % [cid, c["id"], wc, r])
				bad += 1
	print("%s: %d combo(s), %d failure(s)" % [cid, (j.get("combos", []) as Array).size(), bad])
	return bad
