class_name FrameDataCheck
extends RefCounted
## 全技のフレームデータを実測してデータと照合する（仕様: 15_qa_and_testing.md §15.2）

const N := 5


static func supported_ctx(m: MoveDef) -> String:
	if m.chain_only or m.cmd == null or m.cmd.buttons == 0:
		return ""
	if not m.is_strike() or m.level == SE.LV_DOWN:
		return ""
	if (m.from_mask & SE.FROM_STAND) != 0:
		return "stand"
	if (m.from_mask & SE.FROM_RISE) != 0:
		return "rise"
	if (m.from_mask & SE.FROM_CROUCH) != 0:
		return "crouch"
	if (m.from_mask & SE.FROM_DASH) != 0:
		return "dash"
	return ""


## 1回の試行。戻り値 {start, contact, kind, att_free, def_free, contact_mf}
static func trial(char_id: String, m: MoveDef, ctx: String, dist: int, mode: String) -> Dictionary:
	var w := SimFactory.world(char_id, "toma", "arena", 7, {"ringout": false})
	w.training_infinite_hp = true
	SimDriver.skip_intro(w)
	SimDriver.place(w, dist)
	var seq := SimDriver.command_inputs(m, ctx)
	var dhold := 0
	var ddir := N
	if mode == "block":
		dhold = InputBits.G
		if m.level == SE.LV_LOW:
			ddir = 2
	var res := {"start": -1, "contact": -1, "kind": "", "att_free": -1, "def_free": -1, "contact_mf": -1}
	# 防御側は最初からガードを保持
	for k: int in range(220):
		var a_in := seq[k] if k < seq.size() else SimDriver.inp(N)
		var d_in := SimDriver.inp(ddir, dhold, dhold if k == 0 else 0, 0)
		w.step(a_in, d_in)
		for e: Dictionary in w.events:
			var kind := String(e["kind"])
			if kind == "move" and int(e["player"]) == 0 and String(e["id"]) == m.id and int(res["start"]) < 0:
				res["start"] = w.frame
			if (kind == "hit" or kind == "block") and int(e["attacker"]) == 0 and int(res["contact"]) < 0:
				res["contact"] = w.frame
				res["kind"] = kind
				res["contact_mf"] = w.f[0].mf
		if int(res["contact"]) >= 0 and w.frame > int(res["contact"]):
			if int(res["att_free"]) < 0 and SimDriver.is_neutral(w.f[0]):
				res["att_free"] = w.frame
			if int(res["def_free"]) < 0 and SimDriver.is_neutral(w.f[1]):
				res["def_free"] = w.frame
			if int(res["att_free"]) >= 0 and int(res["def_free"]) >= 0:
				break
	return res


## 発生フレームで当たる最大の距離を探す
static func contact_distance(char_id: String, m: MoveDef, ctx: String) -> int:
	var best := -1
	var d := FP.from_str("0.55")
	var step := FP.from_str("0.05")
	while d <= FP.from_str("2.4"):
		var r := trial(char_id, m, ctx, d, "hit")
		if int(r["contact"]) >= 0 and int(r["start"]) >= 0 and int(r["contact"]) - int(r["start"]) + 1 == m.startup:
			best = d
		d += step
	return best


## キャラの全技を検証し、エラー文字列の配列を返す
static func verify(char_id: String, only: String = "") -> Array[String]:
	var errs: Array[String] = []
	var cd := SimFactory.character(char_id)
	for m: MoveDef in cd.moves:
		if only != "" and m.id != only:
			continue
		var ctx := supported_ctx(m)
		if ctx == "":
			continue
		var dist := contact_distance(char_id, m, ctx)
		if dist < 0:
			errs.append("%s: 発生 %dF で当たる距離が見つからない" % [m.id, m.startup])
			continue
		# 最大距離ぎりぎりではなく、確実に当たる距離で測る
		dist = maxi(FP.from_str("0.6"), dist - FP.from_str("0.12"))
		var rb := trial(char_id, m, ctx, dist, "block")
		# ガード姿勢は体が引けるので、届かなければ近づけて測り直す
		var dd := dist
		while String(rb["kind"]) == "" and dd > FP.from_str("0.65"):
			dd -= FP.from_str("0.10")
			rb = trial(char_id, m, ctx, dd, "block")
		if String(rb["kind"]) != "block":
			errs.append("%s: ガードされない (%s)" % [m.id, rb["kind"]])
		else:
			var advb := int(rb["def_free"]) - int(rb["att_free"])
			if advb != m.adv_block:
				errs.append("%s: ガード時 %+d (データ %+d)" % [m.id, advb, m.adv_block])
		var rh := trial(char_id, m, ctx, dist, "hit")
		if SE.is_stun_reaction(m.hit_reaction):
			var advh := int(rh["def_free"]) - int(rh["att_free"])
			if advh != m.adv_hit:
				errs.append("%s: ヒット時 %+d (データ %+d)" % [m.id, advh, m.adv_hit])
	return errs
