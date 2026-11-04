class_name Combat
extends RefCounted
## 打撃・投げ・当て身の判定と結果適用。仕様: 02_combat_system.md §2.5〜2.9, §2.12〜2.13

const CAPS := BakedChar.CAPS
const VALS := BakedChar.VALS


static func to_mm(v: int) -> int:
	return (v * 1000) / 65536


static func rel_angle(w: SimWorld, di: int) -> int:
	var d := w.f[di]
	var to_att := FighterCtl.angle_to_opp(w, di)
	var diff := absi(FP.ang_diff(to_att, d.facing))
	if d.state == SE.ST_AIR or d.state == SE.ST_DOWN:
		return SE.TA_FRONT
	if diff <= FP.deg(w.rules.side_from_deg):
		return SE.TA_FRONT
	if diff <= FP.deg(w.rules.back_from_deg):
		return SE.TA_SIDE
	return SE.TA_BACK


static func defender_posture(w: SimWorld, di: int) -> int:
	var d := w.f[di]
	var r := 0
	if d.state == SE.ST_MOVE:
		var dm := w.chars[di].moves[d.move]
		r |= dm.posture_at(d.mf)
	if d.state == SE.ST_STANCE and d.stance >= 0 and d.stance < w.chars[di].stance_low.size():
		if w.chars[di].stance_low[d.stance] == 1:
			r |= SE.P_LOW_PROFILE
	return r


static func is_counter_state(w: SimWorld, d: FighterState) -> bool:
	match d.state:
		SE.ST_MOVE, SE.ST_DASH_F, SE.ST_DASH_B, SE.ST_RUN, SE.ST_RUN_STOP:
			return true
		SE.ST_EVADE:
			# 回避の終了区間、または回避成立区間中に回転技が当たった（回避狩り）
			return d.sf >= w.rules.evade_success_from
	return false


## 攻撃者 ai から見た回避判定のカバー
static func tracking_covers(w: SimWorld, ai: int, trk: int) -> bool:
	if trk == SE.TRK_FULL:
		return true
	if trk == SE.TRK_LINEAR:
		return false
	var a := w.f[ai]
	var d := w.opp(ai)
	var vx := -w.cam_x if d.evade_dir > 0 else w.cam_x
	var vz := -w.cam_z if d.evade_dir > 0 else w.cam_z
	var fx := FP.sin(a.facing)
	var fz := FP.cos(a.facing)
	var dot := FP.mul(vx, -fz) + FP.mul(vz, fx)
	var to_right := dot > 0
	return (trk == SE.TRK_HALF_R and to_right) or (trk == SE.TRK_HALF_L and not to_right)


# ------------------------------------------------------------ 幾何判定

static func geom_hit(w: SimWorld, ai: int, m: MoveDef) -> bool:
	var a := w.f[ai]
	var di := 1 - ai
	var d := w.f[di]
	var bka := w.chars[ai].baked
	var bkd := w.chars[di].baked
	if bka == null or bkd == null:
		return false
	var ho := bka.hit_at(m.anim_index, a.mf)
	if ho < 0:
		return false
	var hb := bkd.hurt_base(d.anim, d.anim_frame)
	if hb < 0:
		return false
	var ax := to_mm(a.x)
	var ay := to_mm(a.y)
	var az := to_mm(a.z)
	var afx := FP.sin(a.facing)
	var afz := FP.cos(a.facing)
	var dx := to_mm(d.x)
	var dy := to_mm(d.y)
	var dz := to_mm(d.z)
	var dfx := FP.sin(d.facing)
	var dfz := FP.cos(d.facing)
	var hm := w.chars[di].hurt_mul
	for s: int in range(2):
		var o := ho + s * 7
		var rad: int = bka.hit[o + 6]
		if rad <= 0:
			continue
		# 攻撃カプセルの両端（ワールド mm）
		var hr1: int = bka.hit[o]
		var hu1: int = bka.hit[o + 1]
		var hf1: int = bka.hit[o + 2]
		var hr2: int = bka.hit[o + 3]
		var hu2: int = bka.hit[o + 4]
		var hf2: int = bka.hit[o + 5]
		var ax1 := ax + (-afz * hr1 + afx * hf1) / 65536
		var az1 := az + (afx * hr1 + afz * hf1) / 65536
		var ay1 := ay + hu1
		var ax2 := ax + (-afz * hr2 + afx * hf2) / 65536
		var az2 := az + (afx * hr2 + afz * hf2) / 65536
		var ay2 := ay + hu2
		for c: int in range(CAPS):
			var q := hb + c * VALS
			var cr: int = (bkd.hurt[q + 6] * hm) / 65536
			if cr <= 0:
				continue
			var r1: int = bkd.hurt[q]
			var u1: int = bkd.hurt[q + 1]
			var f1: int = bkd.hurt[q + 2]
			var r2: int = bkd.hurt[q + 3]
			var u2: int = bkd.hurt[q + 4]
			var f2: int = bkd.hurt[q + 5]
			var x1 := dx + (-dfz * r1 + dfx * f1) / 65536
			var z1 := dz + (dfx * r1 + dfz * f1) / 65536
			var y1 := dy + u1
			var x2 := dx + (-dfz * r2 + dfx * f2) / 65536
			var z2 := dz + (dfx * r2 + dfz * f2) / 65536
			var y2 := dy + u2
			var lim := rad + cr
			var lim2 := lim * lim
			# 攻撃カプセルを 4 点で標本化（間隔は半径以下になる長さ）
			for k: int in range(4):
				var px := ax1 + ((ax2 - ax1) * k) / 3
				var py := ay1 + ((ay2 - ay1) * k) / 3
				var pz := az1 + ((az2 - az1) * k) / 3
				if seg_point_dist2(x1, y1, z1, x2, y2, z2, px, py, pz) <= lim2:
					return true
	return false


static func seg_point_dist2(x1: int, y1: int, z1: int, x2: int, y2: int, z2: int, px: int, py: int, pz: int) -> int:
	var bx := x2 - x1
	var by := y2 - y1
	var bz := z2 - z1
	var qx := px - x1
	var qy := py - y1
	var qz := pz - z1
	var den := bx * bx + by * by + bz * bz
	var num := qx * bx + qy * by + qz * bz
	var cx := x1
	var cy := y1
	var cz := z1
	if den > 0 and num > 0:
		if num >= den:
			cx = x2
			cy = y2
			cz = z2
		else:
			cx = x1 + (bx * num) / den
			cy = y1 + (by * num) / den
			cz = z1 + (bz * num) / den
	var ex := px - cx
	var ey := py - cy
	var ez := pz - cz
	return ex * ex + ey * ey + ez * ez


# ------------------------------------------------------------ 打撃

static func resolve_strikes(w: SimWorld) -> void:
	var r0 := _check_strike(w, 0)
	var r1 := _check_strike(w, 1)
	var trade: bool = (not r0.is_empty() and r0["type"] == "hit") and (not r1.is_empty() and r1["type"] == "hit")
	if not r0.is_empty():
		_apply(w, 0, r0, trade)
	if not r1.is_empty():
		_apply(w, 1, r1, trade)


static func _check_strike(w: SimWorld, ai: int) -> Dictionary:
	var a := w.f[ai]
	if a.state != SE.ST_MOVE:
		return {}
	var m := w.chars[ai].moves[a.move]
	if not m.is_strike() or a.move_contact != SE.MC_NONE:
		return {}
	if a.mf < m.startup or a.mf > m.active_end():
		return {}
	var di := 1 - ai
	var d := w.f[di]
	match d.state:
		SE.ST_THROWN, SE.ST_THROWING, SE.ST_RINGOUT, SE.ST_WIN, SE.ST_LOSE, SE.ST_CLASH, SE.ST_TECH:
			return {}
	if d.invuln > 0:
		return {}
	if d.ko != 0 and d.state == SE.ST_DOWN:
		return {}
	if d.state == SE.ST_AIR and d.air_hits >= w.rules.max_air_hits:
		return {}
	var dpost := defender_posture(w, di)
	if (dpost & (SE.P_STRIKE_INV | SE.P_FULL_INV)) != 0:
		return {}
	var d_down := d.state == SE.ST_DOWN or (d.state == SE.ST_GETUP and d.sf <= 12)
	if m.level == SE.LV_DOWN:
		if not d_down:
			return {}
		if d.state == SE.ST_GETUP and d.sub != SE.GU_INPLACE:
			return {}
	elif d_down and not m.has_flag(SE.F_HITS_DOWN):
		return {}
	if m.has_flag(SE.F_HITS_AIR_ONLY) and d.state != SE.ST_AIR:
		return {}
	# 回避判定（最初の持続フレームのみ・幾何より優先）
	if a.mf == m.startup and d.state == SE.ST_EVADE and d.sf >= w.rules.evade_success_from and d.sf <= w.rules.evade_success_to:
		if not tracking_covers(w, ai, m.tracking):
			a.move_contact = SE.MC_WHIFF_EVADE
			d.evade_len = maxi(d.sf + 1, d.evade_len - w.rules.evade_bonus)
			d.stat_evades += 1
			w.emit("evade_success", {"player": di, "move": m.index})
			return {}
	var d_crouch := d.is_crouching() or (dpost & SE.P_LOW_PROFILE) != 0
	if d.state == SE.ST_MOVE and w.chars[di].moves[d.move].has_flag(SE.F_END_CROUCH) and d.mf >= 2:
		d_crouch = true
	if m.level == SE.LV_HIGH and d_crouch and d.state != SE.ST_AIR:
		return {}
	if m.level == SE.LV_LOW and (dpost & SE.P_AIRBORNE) != 0:
		return {}
	if not geom_hit(w, ai, m):
		return {}
	var rel := rel_angle(w, di)
	# 当て身
	if d.state == SE.ST_MOVE:
		var dm := w.chars[di].moves[d.move]
		if dm.is_parry() and d.mf >= dm.parry_from and d.mf <= dm.parry_to and rel == SE.TA_FRONT:
			if (dm.parry_levels & (1 << m.level)) != 0 and (dm.parry_limbs & (1 << m.limb)) != 0:
				return {"type": "parry"}
	var guarding := (d.state == SE.ST_GUARD or d.state == SE.ST_BLOCKSTUN) and rel != SE.TA_BACK
	var blocked := false
	if guarding:
		var cg := d.guard_crouch == 1
		match m.level:
			SE.LV_HIGH, SE.LV_MID:
				blocked = not cg
			SE.LV_LOW:
				blocked = cg
			SE.LV_SMID:
				blocked = true
	if blocked:
		return {"type": "block", "rel": rel}
	var ch := is_counter_state(w, d)
	return {"type": "hit", "ch": ch, "rel": rel}


static func _apply(w: SimWorld, ai: int, res: Dictionary, trade: bool) -> void:
	match String(res["type"]):
		"hit":
			_apply_hit(w, ai, bool(res["ch"]) and not trade, int(res["rel"]))
		"block":
			_apply_block(w, ai, int(res["rel"]))
		"parry":
			_apply_parry(w, ai)


static func _default_push(weight: int) -> int:
	match weight:
		SE.W_LIGHT:
			return FP.from_str("0.15")
		SE.W_MEDIUM:
			return FP.from_str("0.25")
	return FP.from_str("0.40")


static func _stun_from_adv(m: MoveDef, a: FighterState, adv: int) -> int:
	var c := a.mf - m.startup + 1
	var remain := (m.active - c) + m.recovery
	return maxi(1, remain + adv)


static func _apply_hit(w: SimWorld, ai: int, ch: bool, rel: int) -> void:
	var a := w.f[ai]
	var di := 1 - ai
	var d := w.f[di]
	var m := w.chars[ai].moves[a.move]
	var reaction := m.ch_reaction if ch else m.hit_reaction
	var dmg := m.damage
	if ch:
		dmg = (dmg * w.rules.ch_mul_num) / w.rules.ch_mul_den
	if rel == SE.TA_BACK:
		dmg = (dmg * w.rules.back_damage_pct) / 100
	var air := d.state == SE.ST_AIR
	var juggle := air or d.state == SE.ST_WALL or d.state == SE.ST_CRUMPLE or d.state == SE.ST_STAGGER
	if air or d.state == SE.ST_WALL:
		var idx := mini(d.air_hits, w.rules.scaling_pct.size() - 1)
		dmg = (dmg * w.rules.scaling_pct[idx]) / 100
		if d.state == SE.ST_WALL or d.wall_hits > 0:
			dmg = (dmg * w.rules.wall_scale_pct) / 100
	elif d.state == SE.ST_CRUMPLE or d.state == SE.ST_STAGGER:
		dmg = (dmg * 90) / 100
	elif d.state == SE.ST_DOWN and d.combo_hits > 0:
		dmg = dmg / 2
	dmg = maxi(1, dmg)
	d.hp -= dmg
	if w.training_infinite_hp and d.hp < 1:
		d.hp = 1
	a.stat_damage += dmg
	if ch:
		a.stat_counters += 1
	d.combo_hits += 1
	d.combo_dmg += dmg
	a.move_contact = SE.MC_HIT
	a.move_ch = 1 if ch else 0
	d.no_tech = 1 if m.has_flag(SE.F_NO_TECH) else d.no_tech
	d.hit_from_back = 1 if rel == SE.TA_BACK else 0
	# ヒットストップ
	var hs := w.rules.hitstop_hit[m.weight] + (w.rules.hitstop_ch_bonus if ch else 0)
	if juggle:
		hs = (hs * 2) / 3
	w.hitstop = maxi(w.hitstop, hs)
	var fx := FP.sin(a.facing)
	var fz := FP.cos(a.facing)
	var ko := d.hp <= 0
	if ko:
		d.hp = 0
		d.ko = 1
	var crouch_hit := d.is_crouching()
	if air:
		_juggle(w, di, m, reaction, fx, fz)
	elif d.state == SE.ST_WALL:
		if SE.is_air_reaction(reaction) and reaction != SE.R_WALLSPLAT:
			FighterCtl.to_air(w, di, SE.AIR_LAUNCH, FP.from_str("0.07"), FP.mul(fx, FP.from_str("0.004")), FP.mul(fz, FP.from_str("0.004")))
			d.air_hits = maxi(d.air_hits, 1)
		else:
			d.stun = maxi(d.stun, 18)
	elif d.state == SE.ST_DOWN:
		d.sf = mini(d.sf, w.rules.down_min - 4)
		d.tech_check = 0
	elif ko and not SE.is_air_reaction(reaction):
		FighterCtl.to_air(w, di, SE.AIR_KNOCK, FP.from_str("0.07"), FP.mul(fx, FP.from_str("0.05")), FP.mul(fz, FP.from_str("0.05")))
		d.reaction = SE.R_KNOCKBACK
	elif SE.is_stun_reaction(reaction):
		var adv := m.adv_ch if ch else m.adv_hit
		if rel == SE.TA_SIDE:
			adv += w.rules.side_hitstun_bonus
		var s := _stun_from_adv(m, a, adv)
		FighterCtl.set_state(d, SE.ST_HITSTUN, 1 if crouch_hit else 0)
		d.reaction = reaction
		d.stun = s
		d.stun_len = s
		var push := m.push_hit if m.push_hit > 0 else _default_push(m.weight)
		FighterCtl.set_slide(d, fx, fz, push)
	elif reaction == SE.R_STAGGER_GUT or reaction == SE.R_STAGGER_LEG:
		FighterCtl.set_state(d, SE.ST_STAGGER, 1 if reaction == SE.R_STAGGER_LEG else 0)
		d.reaction = reaction
		d.stun = m.stagger_frames
		d.stun_len = m.stagger_frames
		d.stagger_min = (m.stagger_frames * w.rules.stagger_max_reduce_pct) / 100
		FighterCtl.set_slide(d, fx, fz, FP.from_str("0.15"))
		w.emit("stagger", {"player": di, "frames": m.stagger_frames})
	elif reaction == SE.R_CRUMPLE:
		FighterCtl.set_state(d, SE.ST_CRUMPLE, 0)
		d.reaction = reaction
		d.stun = 60
		d.stun_len = 60
	else:
		_launch(w, di, m, reaction, fx, fz)
	w.emit("hit", {
		"attacker": ai, "defender": di, "move": m.index, "damage": dmg, "ch": ch, "rel": rel,
		"level": m.level, "weight": m.weight, "reaction": reaction, "combo": d.combo_hits,
		"combo_damage": d.combo_dmg, "ko": ko, "juggle": juggle, "limb": m.limb,
		"x": d.x, "y": d.y, "z": d.z,
	})


static func _launch(w: SimWorld, di: int, m: MoveDef, reaction: int, fx: int, fz: int) -> void:
	var d := w.f[di]
	var vy := 0
	var push := 0
	var kind := SE.AIR_LAUNCH
	match reaction:
		SE.R_LAUNCH:
			vy = m.launch_vy if m.launch_vy > 0 else FP.from_str("0.110")
			push = m.launch_vx if m.launch_vx > 0 else FP.from_str("0.008")
		SE.R_LAUNCH_SPIN:
			vy = m.launch_vy if m.launch_vy > 0 else FP.from_str("0.100")
			push = m.launch_vx if m.launch_vx > 0 else FP.from_str("0.012")
			kind = SE.AIR_SPIN
		SE.R_KNOCKBACK, SE.R_WALLSPLAT:
			vy = FP.from_str("0.070")
			push = m.launch_vx if m.launch_vx > 0 else FP.from_str("0.055")
			kind = SE.AIR_KNOCK
		SE.R_SPIN:
			vy = FP.from_str("0.065")
			push = m.launch_vx if m.launch_vx > 0 else FP.from_str("0.040")
			kind = SE.AIR_SPIN
		SE.R_TRIP:
			vy = FP.from_str("0.045")
			push = FP.from_str("0.004")
			kind = SE.AIR_TRIP
		_:
			vy = FP.from_str("0.07")
			push = FP.from_str("0.04")
			kind = SE.AIR_KNOCK
	FighterCtl.to_air(w, di, kind, vy, FP.mul(fx, push), FP.mul(fz, push))
	d.reaction = reaction
	d.air_hits = 1
	w.emit("launch", {"player": di, "kind": kind})


static func _juggle(w: SimWorld, di: int, m: MoveDef, reaction: int, fx: int, fz: int) -> void:
	var d := w.f[di]
	var base := m.air_vy
	if base <= 0:
		base = (m.launch_vy * 7) / 10 if m.launch_vy > 0 else FP.from_str("0.055")
	if reaction == SE.R_LAUNCH and m.launch_vy > 0:
		base = maxi(base, (m.launch_vy * 8) / 10)
	var vy := base
	for _k: int in range(d.air_hits):
		vy = (vy * w.rules.relaunch_num) / w.rules.relaunch_den
	d.vy = maxi(d.vy, vy)
	d.gravity += (FP.mul(w.rules.gravity, w.chars[di].float_factor) * w.rules.gravity_add_pct) / 100
	d.air_hits += 1
	var push := FP.from_str("0.012")
	if reaction == SE.R_KNOCKBACK or reaction == SE.R_WALLSPLAT or reaction == SE.R_SPIN:
		push = FP.from_str("0.045")
	d.vx = FP.mul(fx, push)
	d.vz = FP.mul(fz, push)
	if reaction == SE.R_SPIN or reaction == SE.R_LAUNCH_SPIN:
		d.sub = SE.AIR_SPIN
		d.last_air_kind = SE.AIR_SPIN
	d.sf = 0
	if d.air_hits >= w.rules.max_air_hits:
		d.vy = mini(d.vy, 0)


static func _apply_block(w: SimWorld, ai: int, rel: int) -> void:
	var a := w.f[ai]
	var di := 1 - ai
	var d := w.f[di]
	var m := w.chars[ai].moves[a.move]
	var s := _stun_from_adv(m, a, m.adv_block)
	if m.has_flag(SE.F_GUARD_CRUSH):
		FighterCtl.set_state(d, SE.ST_HITSTUN, 0)
		d.reaction = SE.R_GUARD_CRUSH
	else:
		var gc := d.guard_crouch
		FighterCtl.set_state(d, SE.ST_BLOCKSTUN, gc)
		d.guard_crouch = gc
	d.stun = s
	d.stun_len = s
	var push := m.push_block if m.push_block > 0 else _default_push(m.weight)
	var fx := FP.sin(a.facing)
	var fz := FP.cos(a.facing)
	if Ring.back_to_wall(w, di, FP.from_str("0.1")):
		FighterCtl.set_slide(a, -fx, -fz, push)
	else:
		FighterCtl.set_slide(d, fx, fz, push)
	a.move_contact = SE.MC_BLOCK
	w.hitstop = maxi(w.hitstop, w.rules.hitstop_block[m.weight])
	w.emit("block", {"attacker": ai, "defender": di, "move": m.index, "level": m.level, "weight": m.weight,
		"crush": m.has_flag(SE.F_GUARD_CRUSH), "x": d.x, "y": d.y, "z": d.z, "crouch": d.guard_crouch})
	var _r := rel


static func _apply_parry(w: SimWorld, ai: int) -> void:
	var a := w.f[ai]
	var di := 1 - ai
	var d := w.f[di]
	var dm := w.chars[di].moves[d.move]
	a.move_contact = SE.MC_PARRIED
	FighterCtl.set_state(a, SE.ST_PARRIED, 0)
	a.stun = 40
	a.stun_len = 40
	w.hitstop = maxi(w.hitstop, 8)
	w.emit("parry", {"player": di, "attacker": ai})
	if dm.parry_success >= 0:
		var sm := w.chars[di].moves[dm.parry_success]
		FighterCtl.start_move(w, di, sm, SE.FROM_STAND)
		if sm.is_throw:
			begin_throw(w, di, sm, false)


# ------------------------------------------------------------ 投げ

static func throwable(w: SimWorld, di: int, low: bool, vs_down: bool) -> bool:
	var d := w.f[di]
	if d.throw_protect > 0 or d.invuln > 0:
		return false
	if vs_down:
		return d.state == SE.ST_DOWN and d.ko == 0
	match d.state:
		SE.ST_STAND, SE.ST_WALK_F, SE.ST_WALK_B, SE.ST_DASH_F, SE.ST_DASH_B, SE.ST_RUN, SE.ST_RUN_STOP, \
		SE.ST_EVADE, SE.ST_STAND_UP, SE.ST_BACKTURN, SE.ST_TURN:
			return not low
		SE.ST_GUARD:
			return (d.guard_crouch == 1) == low
		SE.ST_CROUCH:
			return low
		SE.ST_CROUCH_IN:
			return low if d.sf >= 2 else not low
		SE.ST_STANCE:
			var lp := (defender_posture(w, di) & SE.P_LOW_PROFILE) != 0
			return lp == low
		SE.ST_MOVE:
			var dm := w.chars[di].moves[d.move]
			# 打撃の発生前・持続中は投げられない（打撃は投げに勝つ）。投げの掴み動作は投げられる
			if dm.is_throw:
				return not low
			if d.mf <= dm.active_end():
				return false
			if (dm.posture_at(d.mf) & (SE.P_THROW_INV | SE.P_FULL_INV)) != 0:
				return false
			return dm.has_flag(SE.F_END_CROUCH) == low
	return false


static func resolve_throws(w: SimWorld) -> void:
	var c0 := _throw_candidate(w, 0)
	var c1 := _throw_candidate(w, 1)
	if c0 and c1:
		_clash(w)
		return
	if c0:
		begin_throw(w, 0, w.chars[0].moves[w.f[0].move], true)
	elif c1:
		begin_throw(w, 1, w.chars[1].moves[w.f[1].move], true)


static func _throw_candidate(w: SimWorld, ai: int) -> bool:
	var a := w.f[ai]
	if a.state != SE.ST_MOVE:
		return false
	var m := w.chars[ai].moves[a.move]
	if not m.is_throw or m.throw_stage or a.mf != m.startup:
		return false
	var rng := m.throw_range if m.throw_range > 0 else w.chars[ai].throw_range
	if FighterCtl.dist(w, ai) > rng:
		return false
	return throwable(w, 1 - ai, m.level == SE.LV_LTHROW, m.throw_vs_down)


static func _clash(w: SimWorld) -> void:
	for i: int in range(2):
		var p := w.f[i]
		FighterCtl.set_state(p, SE.ST_CLASH, 0)
		p.stun = 16
		var o := w.opp(i)
		FighterCtl.set_slide(p, p.x - o.x, p.z - o.z, FP.from_str("0.35"))
	w.hitstop = maxi(w.hitstop, 6)
	w.emit("throw_clash", {})


## 投げの成立。check_variant: 側面・背面で変化させるか
static func begin_throw(w: SimWorld, ai: int, m: MoveDef, check_variant: bool) -> void:
	var a := w.f[ai]
	var di := 1 - ai
	var d := w.f[di]
	var cd := w.chars[ai]
	var tm := m
	if check_variant and not m.throw_vs_down:
		var rel := rel_angle(w, di)
		if rel == SE.TA_SIDE and cd.side_throw >= 0:
			tm = cd.moves[cd.side_throw]
		elif rel == SE.TA_BACK and cd.back_throw >= 0:
			tm = cd.moves[cd.back_throw]
	FighterCtl.set_state(a, SE.ST_THROWING, 0)
	a.move = tm.index
	a.throw_move = tm.index
	a.throw_frame = 0
	a.throw_grab = 1 if tm.throw_escape != SE.ESC_NONE and check_variant else 0
	a.facing = FighterCtl.angle_to_opp(w, ai)
	FighterCtl.set_state(d, SE.ST_THROWN, 0)
	d.throw_escape = _collect_escape(w, di, w.rules.throw_escape_before, 0)
	d.mash = 0
	d.slide = 0
	d.y = 0
	w.emit("throw", {"attacker": ai, "defender": di, "move": tm.index, "escapable": a.throw_grab == 1})


static func _esc_code(dirv: int) -> int:
	match dirv:
		4, 7:
			return SE.ESC_BACK
		6, 9:
			return SE.ESC_FWD
		1, 2, 3:
			return SE.ESC_DOWN
	return SE.ESC_N


## 被投げ側の P+G 入力を新しい順に最大2方向まで（ビットマスク）
static func _collect_escape(w: SimWorld, di: int, frames: int, prev: int) -> int:
	var d := w.f[di]
	var found: Array[int] = []
	for back: int in range(0, frames + 1):
		var e := d.h(back)
		var pr := InputBits.pressed(e)
		if (pr & (InputBits.P | InputBits.G)) == 0:
			continue
		var acc := 0
		for k: int in range(0, w.rules.simul_window + 1):
			acc |= InputBits.pressed(d.h(back + k))
		if (acc & (InputBits.P | InputBits.G)) != (InputBits.P | InputBits.G):
			continue
		var code := _esc_code(InputBits.dir(e))
		if not found.has(code):
			found.append(code)
		if found.size() >= 2:
			break
	var mask := 0
	for c: int in found:
		mask |= 1 << c
	return mask


static func advance_throws(w: SimWorld) -> void:
	for ai: int in range(2):
		var a := w.f[ai]
		if a.state != SE.ST_THROWING:
			continue
		var di := 1 - ai
		var d := w.f[di]
		var cd := w.chars[ai]
		var tm := cd.moves[a.throw_move]
		if d.state != SE.ST_THROWN:
			FighterCtl.set_state(a, SE.ST_STAND, 0)
			a.throw_move = -1
			continue
		a.throw_frame += 1
		a.sf = a.throw_frame
		# 掴み中の抜け入力
		if a.throw_grab == 1 and a.throw_frame <= w.rules.throw_escape_after:
			var cur := _collect_escape(w, di, 0, 0)
			if cur != 0:
				d.throw_escape = _merge_escape(d.throw_escape, cur)
		if a.throw_grab == 1 and a.throw_frame == w.rules.throw_escape_after + 1:
			a.throw_grab = 0
			var esc := (d.throw_escape & (1 << tm.throw_escape)) != 0 or (w.assist_escape(di) and tm.throw_escape != SE.ESC_NONE and d.throw_escape != 0)
			if esc:
				_escape(w, ai)
				continue
		# レバガチャ脱出（首相撲など）: 累計が閾値に達したら脱出
		if tm.throw_mash > 0:
			if (InputBits.pressed(d.input_now) & (InputBits.P | InputBits.K | InputBits.G)) != 0 or InputBits.dir(d.h(0)) != InputBits.dir(d.h(1)):
				d.mash += 1
			if d.mash >= tm.throw_mash:
				_escape(w, ai)
				continue
		# 連続投げ
		if tm.throw_next_to.size() > 0 and a.throw_frame >= tm.throw_dmg_frame and a.throw_frame <= tm.throw_dmg_frame + tm.throw_next_window:
			# 先行入力（ヒットストップ中の入力を含む）も受け付ける。消費済みの入力は使わない
			var hit_k := -1
			for back: int in range(0, w.rules.buffer_frames + 1):
				if w.frame - back <= a.consumed:
					break
				var e := a.h(back)
				var pr := InputBits.pressed(e)
				if pr == 0:
					continue
				var dd := InputBits.dir(e)
				for k0: int in range(tm.throw_next_to.size()):
					var need0 := tm.throw_next_btn[k0]
					if (pr & need0) != 0 and (InputBits.held(e) & need0) == need0 and CommandSpec.dir_matches(tm.throw_next_dir[k0], dd):
						hit_k = k0
						break
				if hit_k >= 0:
					break
			for k: int in range(tm.throw_next_to.size()):
				if k == hit_k:
					a.consumed = w.frame
					var nm := cd.moves[tm.throw_next_to[k]]
					a.throw_move = nm.index
					a.move = nm.index
					a.throw_frame = 0
					a.throw_grab = 1 if nm.throw_escape != SE.ESC_NONE else 0
					d.throw_escape = 0
					w.emit("throw_chain", {"attacker": ai, "move": nm.index})
					break
			if a.throw_frame == 0:
				continue
		_place_victim(w, ai, tm, a.throw_frame)
		FighterCtl._apply_motion(w, ai, tm.throw_anim, a.throw_frame)
		if a.throw_frame == tm.throw_dmg_frame and tm.damage > 0:
			var dmg := tm.damage
			d.hp -= dmg
			if w.training_infinite_hp and d.hp < 1:
				d.hp = 1
			a.stat_damage += dmg
			d.combo_dmg += dmg
			d.combo_hits += 1
			if d.hp <= 0:
				d.hp = 0
				d.ko = 1
			w.hitstop = maxi(w.hitstop, 7)
			w.emit("hit", {"attacker": ai, "defender": di, "move": tm.index, "damage": dmg, "ch": false, "rel": 0,
				"level": SE.LV_THROW, "weight": SE.W_HEAVY, "reaction": -1, "combo": d.combo_hits,
				"combo_damage": d.combo_dmg, "ko": d.ko == 1, "juggle": false, "throw": true, "limb": SE.LIMB_BODY,
				"x": d.x, "y": d.y, "z": d.z})
		if a.throw_frame >= tm.throw_len:
			_end_throw(w, ai, tm)


static func _merge_escape(old_mask: int, new_mask: int) -> int:
	var m := old_mask | new_mask
	# 3方向以上なら新しい方を優先（古いものを1つ落とす）
	var cnt := 0
	for b: int in range(4):
		if (m & (1 << b)) != 0:
			cnt += 1
	if cnt > 2:
		return new_mask | (old_mask & ~new_mask & ((old_mask & -old_mask)))
	return m


static func _place_victim(w: SimWorld, ai: int, tm: MoveDef, frame: int) -> void:
	var a := w.f[ai]
	var d := w.opp(ai)
	var bk := w.chars[ai].baked
	if bk == null:
		return
	var o := bk.victim_at(tm.throw_anim, frame)
	if o < 0:
		return
	var r := FighterCtl.mm_to_fp(bk.victim[o])
	var u := FighterCtl.mm_to_fp(bk.victim[o + 1])
	var fw := FighterCtl.mm_to_fp(bk.victim[o + 2])
	var fx := FP.sin(a.facing)
	var fz := FP.cos(a.facing)
	d.x = a.x + FP.mul(-fz, r) + FP.mul(fx, fw)
	d.z = a.z + FP.mul(fx, r) + FP.mul(fz, fw)
	d.y = maxi(0, u)
	d.facing = FP.ang(a.facing + bk.victim[o + 3])


static func _end_throw(w: SimWorld, ai: int, tm: MoveDef) -> void:
	var a := w.f[ai]
	var di := 1 - ai
	var d := w.f[di]
	FighterCtl.set_state(a, SE.ST_STAND, 0)
	a.throw_move = -1
	a.throw_protect = 0
	d.no_tech = 1 if tm.has_flag(SE.F_NO_TECH) else 0
	if d.ko != 0 and tm.throw_end_kind != SE.TE_DOWN:
		d.y = 0
		FighterCtl._to_down(w, di, SE.DOWN_UP, false)
	elif tm.throw_end_kind == SE.TE_STAGGER:
		d.y = 0
		FighterCtl.set_state(d, SE.ST_STAGGER, 0)
		d.reaction = SE.R_STAGGER_GUT
		d.stun = tm.throw_end_stun
		d.stun_len = tm.throw_end_stun
		d.stagger_min = (tm.throw_end_stun * w.rules.stagger_max_reduce_pct) / 100
		w.emit("stagger", {"player": di, "frames": tm.throw_end_stun})
	elif tm.throw_end_kind == SE.TE_STAND or tm.throw_end_kind == SE.TE_BACKTURN:
		d.y = 0
		FighterCtl.set_state(d, SE.ST_HITSTUN, 0)
		d.reaction = SE.R_TURN if tm.throw_end_kind == SE.TE_BACKTURN else SE.R_MID_HEAVY
		d.stun = tm.throw_end_stun
		d.stun_len = tm.throw_end_stun
		if tm.throw_end_kind == SE.TE_BACKTURN:
			d.facing = (FighterCtl.angle_to_opp(w, di) + FP.ANG_HALF) & 0xFFFF
	elif tm.throw_end_air:
		FighterCtl.to_air(w, di, SE.AIR_TRIP, FP.from_str("0.03"), 0, 0)
		d.air_hits = 1
	else:
		d.y = 0
		FighterCtl._to_down(w, di, tm.throw_end_down, false)
	a.facing = FighterCtl.angle_to_opp(w, ai)
	w.emit("throw_end", {"attacker": ai, "defender": di})


static func _escape(w: SimWorld, ai: int) -> void:
	var a := w.f[ai]
	var d := w.opp(ai)
	FighterCtl.set_state(a, SE.ST_CLASH, 0)
	a.stun = 18
	a.throw_move = -1
	FighterCtl.set_state(d, SE.ST_CLASH, 0)
	d.stun = 18 - w.rules.throw_escape_adv
	FighterCtl.set_slide(a, a.x - d.x, a.z - d.z, FP.from_str("0.30"))
	FighterCtl.set_slide(d, d.x - a.x, d.z - a.z, FP.from_str("0.30"))
	d.stat_escapes += 1
	w.hitstop = maxi(w.hitstop, 6)
	w.emit("throw_escape", {"player": 1 - a.side, "attacker": a.side})
