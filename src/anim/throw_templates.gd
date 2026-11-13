class_name ThrowTemplates
extends RefCounted
## 投げのアニメ。掴み動作（空振り用）と、成立後のペアアニメ（被投げ側のポーズ・相対位置付き）。

const E := AnimClip.Ease


static func V(x: float, y: float, z: float) -> Vector3:
	return Vector3(x, y, z)


## 掴みにいく動作（空振り時のアニメ）
static func build(t: AnimTemplates, c: AnimClip, base: PoseData, md: Dictionary, an: Dictionary) -> void:
	var fr: Array = md.get("f", [10, 1, 20])
	var S := int(fr[0])
	var T := S + int(fr[1]) - 1 + int(fr[2])
	var reach := base.copy()
	var low := String(md.get("lv", "throw")) == "lthrow"
	var hy := t.sh_h - (0.55 if low else 0.10)
	reach.hand_l = V(-0.12, hy, 0.55)
	reach.hand_r = V(0.12, hy, 0.55)
	reach.fist_l = 0.2
	reach.fist_r = 0.2
	reach.elbow_l = V(-1, -0.4, 0)
	reach.elbow_r = V(1, -0.4, 0)
	reach.chest += V(12, -reach.chest.y, 0)
	reach.hips += V(4, -reach.hips.y * 0.5, 0)
	reach.root += V(0, -0.05 - (0.30 if low else 0.0), 0.10)
	if low:
		var cp := t.make_crouch()
		reach.foot_l = cp.foot_l
		reach.foot_r = cp.foot_r
		reach.knee_l = cp.knee_l
		reach.knee_r = cp.knee_r
	var miss := reach.copy()
	miss.chest += V(8, 0, 0)
	miss.hand_l += V(-0.08, -0.05, -0.08)
	miss.hand_r += V(0.08, -0.05, -0.08)
	var end := AnimTemplates.shifted(t.st.copy(), V(0, 0, 0.10))
	c.add(0, base).add(maxi(1, S - 3), reach, E.OUT_QUAD).add(S + 4, miss).add(T, end)


## 被投げ側の汎用ポーズ（被投げ側のキャラ空間）
static func victim_pose(t: AnimTemplates, kind: String) -> PoseData:
	var s := t.s
	var p := PoseData.new()
	p.root = V(0, -0.03, 0)
	p.foot_l = V(-0.13 * s, t.ank, 0.05)
	p.foot_r = V(0.13 * s, t.ank, -0.05)
	p.knee_l = V(0, 0, 1)
	p.knee_r = V(0, 0, 1)
	p.hand_l = V(-0.12, t.chin_h - 0.15, 0.25)
	p.hand_r = V(0.12, t.chin_h - 0.15, 0.25)
	p.elbow_l = V(-1, -0.5, 0)
	p.elbow_r = V(1, -0.5, 0)
	p.fist_l = 0.4
	p.fist_r = 0.4
	p.face = 2
	match kind:
		"grabbed":
			p.chest = V(-8, 0, 0)
			p.head = V(-6, 0, 0)
		"hunched":
			p.spine = V(25, 0, 0)
			p.chest = V(25, 0, 0)
			p.head = V(-15, 0, 0)
			p.root = V(0, -0.12, 0)
			p.hand_l = V(-0.2, t.hip_h + 0.25, 0.35)
			p.hand_r = V(0.2, t.hip_h + 0.25, 0.35)
		"lifted":
			p.hips = V(-70, 0, 0)
			p.chest = V(-10, 0, 0)
			p.head = V(-10, 0, 0)
			p.foot_l = V(-0.15, t.ank + 0.4, 0.55)
			p.foot_r = V(0.15, t.ank + 0.5, 0.50)
			p.hand_l = V(-0.45, t.sh_h - 0.2, 0.0)
			p.hand_r = V(0.45, t.sh_h - 0.1, 0.0)
		"inverted":
			p.hips = V(-170, 0, 0)
			p.chest = V(-10, 0, 0)
			p.foot_l = V(-0.15, t.ank + 1.4, 0.2)
			p.foot_r = V(0.15, t.ank + 1.5, 0.1)
			p.knee_l = V(0, 0, -1)
			p.knee_r = V(0, 0, -1)
			p.hand_l = V(-0.45, t.hip_h + 0.4, 0.0)
			p.hand_r = V(0.45, t.hip_h + 0.5, 0.0)
		"falling_back":
			p.hips = V(-45, 0, 0)
			p.chest = V(-15, 0, 0)
			p.root = V(0, -0.30, 0)
			p.foot_l = V(-0.15, t.ank + 0.3, 0.55)
			p.foot_r = V(0.15, t.ank + 0.2, 0.45)
			p.hand_l = V(-0.45, t.sh_h - 0.4, 0.1)
			p.hand_r = V(0.45, t.sh_h - 0.4, 0.1)
		"falling_face":
			p.hips = V(50, 0, 0)
			p.chest = V(10, 0, 0)
			p.root = V(0, -0.35, 0)
			p.foot_l = V(-0.15, t.ank + 0.2, -0.45)
			p.foot_r = V(0.15, t.ank + 0.3, -0.40)
			p.knee_l = V(0, -1, 0.2)
			p.knee_r = V(0, -1, 0.2)
			p.hand_l = V(-0.35, 0.35, 0.45)
			p.hand_r = V(0.35, 0.35, 0.45)
		"kneel":
			var cp := t.make_crouch()
			p = cp
			p.root = V(0, -0.55 * s, 0)
			p.chest = V(20, 0, 0)
			p.face = 2
		"down_up":
			p = t.make_down_up()
			p.face = 2
		"down_face":
			p = t.make_down_face()
			p.face = 2
	return p


## 投げ成立後のアニメ。md["throw"] の len / dmg と anim.style を使う。
static func throw_clip(t: AnimTemplates, md: Dictionary) -> AnimClip:
	var th: Dictionary = md.get("throw", {})
	var an: Dictionary = md.get("anim", {})
	var L := int(th.get("len", 60))
	var D := int(th.get("dmg_frame", int(L * 0.6)))
	var style := String(an.get("style", "slam"))
	var c := AnimClip.new()
	c.name = String(md.get("id", "")) + "__throw"
	c.length = L
	var s := t.s
	var a0 := t.st.copy()
	a0.hand_l = V(-0.12, t.sh_h - 0.05, 0.52)
	a0.hand_r = V(0.12, t.sh_h - 0.05, 0.52)
	a0.chest += V(8, -a0.chest.y, 0)
	a0.hips += V(0, -a0.hips.y * 0.5, 0)
	a0.fist_l = 0.6
	a0.fist_r = 0.6
	a0.face = 1
	var gv := victim_pose(t, "grabbed")
	var front := V(0, 0, 0.62 * s)
	var g := 8
	var end_a := t.st.copy()
	match style:
		"knee":
			var k := a0.copy()
			k.hand_l = V(-0.08, t.sh_h + 0.05, 0.45)
			k.hand_r = V(0.08, t.sh_h + 0.05, 0.45)
			var kn := k.copy()
			AnimTemplates.set_foot(kn, -t.lead, V(0.0, t.hip_h - 0.05, 0.30))
			AnimTemplates.set_knee(kn, -t.lead, V(0, 0.3, 1))
			kn.hips += V(-12, 0, 0)
			var hv := victim_pose(t, "hunched")
			var fall := victim_pose(t, "down_up")
			c.add(0, a0).add(g, k).add(int(D * 0.55), kn, E.IN_QUAD).add(int(D * 0.75), k.copy()) \
				.add(D, kn.copy(), E.IN_QUAD).add(int((D + L) / 2.0), k.copy()).add(L, end_a)
			c.add_victim(gv, front, 180)
			c.add_victim(hv, V(0, 0, 0.55 * s), 180)
			c.add_victim(hv.copy(), V(0, 0.05, 0.52 * s), 180)
			c.add_victim(hv.copy(), V(0, 0, 0.55 * s), 180)
			c.add_victim(hv.copy(), V(0, 0.06, 0.52 * s), 180)
			c.add_victim(victim_pose(t, "falling_back"), V(0, 0, 0.75 * s), 180)
			c.add_victim(fall, V(0, 0, 1.15 * s), 180)
		"over":
			var lift := a0.copy()
			lift.chest += V(-10, 0, 0)
			lift.hand_l = V(-0.10, t.sh_h + 0.25, 0.20)
			lift.hand_r = V(0.10, t.sh_h + 0.25, 0.20)
			lift.root += V(0, -0.10, 0)
			var turn := a0.copy()
			turn.hips += V(25, 30, 0)
			turn.chest += V(30, 0, 0)
			turn.hand_l = V(-0.15, t.hip_h, -0.20)
			turn.hand_r = V(0.15, t.hip_h, -0.25)
			turn.root += V(0, -0.20, 0)
			var rec := t.make_crouch()
			c.add(0, a0).add(g, a0.copy()).add(int(D * 0.55), lift, E.IN_QUAD).add(D, turn, E.IN_QUAD) \
				.add(int((D + L) / 2.0), rec).add(L, end_a)
			c.add_victim(gv, front, 180)
			c.add_victim(victim_pose(t, "grabbed"), V(0, 0, 0.55 * s), 180)
			c.add_victim(victim_pose(t, "inverted"), V(0, 0.55, 0.05), 180)
			c.add_victim(victim_pose(t, "down_up"), V(0, 0, -0.85 * s), 0)
			c.add_victim(victim_pose(t, "down_up"), V(0, 0, -0.90 * s), 0)
			c.add_victim(victim_pose(t, "down_up"), V(0, 0, -0.90 * s), 0)
		"slam":
			var lift2 := a0.copy()
			lift2.hand_l = V(-0.10, t.sh_h + 0.40, 0.35)
			lift2.hand_r = V(0.10, t.sh_h + 0.40, 0.35)
			lift2.chest += V(-12, 0, 0)
			var slam := a0.copy()
			slam.chest += V(35, 0, 0)
			slam.spine += V(15, 0, 0)
			slam.root += V(0, -0.30, 0.05)
			slam.hand_l = V(-0.12, 0.35, 0.65)
			slam.hand_r = V(0.12, 0.35, 0.65)
			slam.face = 3
			c.add(0, a0).add(g, a0.copy()).add(int(D * 0.6), lift2, E.OUT_QUAD).add(D, slam, E.IN_CUBIC) \
				.add(int((D + L) / 2.0), slam.copy()).add(L, end_a)
			c.add_victim(gv, front, 180)
			c.add_victim(victim_pose(t, "grabbed"), V(0, 0.02, 0.55 * s), 180)
			c.add_victim(victim_pose(t, "lifted"), V(0, 0.85, 0.40 * s), 180)
			c.add_victim(victim_pose(t, "down_up"), V(0, 0, 0.85 * s), 180)
			c.add_victim(victim_pose(t, "down_up"), V(0, 0, 0.88 * s), 180)
			c.add_victim(victim_pose(t, "down_up"), V(0, 0, 0.90 * s), 180)
		"suplex", "back":
			var arch := a0.copy()
			arch.hips += V(-60, 0, 0)
			arch.chest += V(-40, 0, 0)
			arch.root += V(0, -0.35, -0.2)
			arch.hand_l = V(-0.12, t.sh_h + 0.2, -0.1)
			arch.hand_r = V(0.12, t.sh_h + 0.2, -0.1)
			var bridge := arch.copy()
			bridge.hips += V(-40, 0, 0)
			bridge.root += V(0, -0.25, -0.2)
			var rise := t.make_crouch()
			c.add(0, a0).add(g, a0.copy()).add(int(D * 0.6), arch, E.IN_QUAD).add(D, bridge, E.IN_CUBIC) \
				.add(int((D + L) / 2.0), rise).add(L, end_a)
			c.add_victim(gv, V(0, 0, 0.45 * s), 0 if style == "back" else 180)
			c.add_victim(victim_pose(t, "grabbed"), V(0, 0.05, 0.40 * s), 0 if style == "back" else 180)
			c.add_victim(victim_pose(t, "inverted"), V(0, 0.85, -0.10), 0)
			c.add_victim(victim_pose(t, "down_up"), V(0, 0, -0.95 * s), 0)
			c.add_victim(victim_pose(t, "down_up"), V(0, 0, -1.0 * s), 0)
			c.add_victim(victim_pose(t, "down_up"), V(0, 0, -1.0 * s), 0)
		"trip", "lowtrip":
			var sweep := a0.copy()
			AnimTemplates.set_foot(sweep, -t.lead, V(0.25 * -t.lead, t.ank, 0.55))
			sweep.chest += V(15, -25, 0)
			sweep.hand_l = V(-0.20, t.sh_h - 0.3, 0.70)
			sweep.hand_r = V(0.20, t.sh_h - 0.5, 0.65)
			sweep.root += V(0, -0.15, 0.10)
			var low := style == "lowtrip"
			var vstart := victim_pose(t, "kneel" if low else "grabbed")
			c.add(0, a0).add(g, a0.copy()).add(int(D * 0.7), sweep, E.IN_QUAD).add(D, sweep.copy()) \
				.add(int((D + L) / 2.0), t.make_crouch()).add(L, end_a)
			c.add_victim(vstart, front, 180)
			c.add_victim(vstart.copy(), V(0, 0, 0.58 * s), 180)
			c.add_victim(victim_pose(t, "falling_back"), V(0, 0.1, 0.70 * s), 180)
			c.add_victim(victim_pose(t, "down_up"), V(0, 0, 0.95 * s), 180)
			c.add_victim(victim_pose(t, "down_up"), V(0, 0, 1.0 * s), 180)
			c.add_victim(victim_pose(t, "down_up"), V(0, 0, 1.0 * s), 180)
		"twist", "neck":
			var tw := a0.copy()
			tw.hips += V(10, 45, 0)
			tw.chest += V(20, 30, 0)
			tw.hand_l = V(-0.05, t.hip_h + 0.1, 0.65)
			tw.hand_r = V(0.25, t.hip_h + 0.2, 0.55)
			tw.root += V(0, -0.20, 0)
			var pin := t.make_crouch()
			pin.chest += V(20, 0, 0)
			pin.hand_l = V(-0.05, 0.40, 0.70)
			pin.hand_r = V(0.15, 0.35, 0.65)
			c.add(0, a0).add(g, a0.copy()).add(int(D * 0.7), tw, E.IN_QUAD).add(D, pin, E.IN_QUAD) \
				.add(int((D + L) / 2.0), pin.copy()).add(L, end_a)
			c.add_victim(gv, front, 180)
			c.add_victim(victim_pose(t, "hunched"), V(0, 0, 0.58 * s), 180)
			c.add_victim(victim_pose(t, "falling_face"), V(0.10, 0.05, 0.75 * s), 140)
			c.add_victim(victim_pose(t, "down_face"), V(0, 0, 0.55 * s), 180)
			c.add_victim(victim_pose(t, "down_face"), V(0, 0, 0.55 * s), 180)
			c.add_victim(victim_pose(t, "down_face"), V(0, 0, 0.55 * s), 180)
		"push", "tackle", "wall":
			var adv := 0.9 if style == "tackle" else 0.25
			var shove := a0.copy()
			shove.chest += V(15, 0, 0)
			shove.root += V(0, -0.15, adv * 0.6)
			shove.hand_l = V(-0.15, t.sh_h - 0.15, 0.80 + adv * 0.6)
			shove.hand_r = V(0.15, t.sh_h - 0.15, 0.80 + adv * 0.6)
			AnimTemplates.set_foot(shove, t.lead, AnimTemplates.foot(t.st, t.lead) + V(0, 0, adv * 0.7))
			var fin := AnimTemplates.shifted(t.st.copy(), V(0, 0, adv))
			c.add(0, a0).add(g, a0.copy()).add(int(D * 0.7), shove, E.IN_QUAD).add(D, shove.copy()) \
				.add(int((D + L) / 2.0), PoseData.lerp_pose(shove, fin, 0.5)).add(L, fin)
			var dist := 1.6 if style == "push" else 1.2
			c.add_victim(gv, front, 180)
			c.add_victim(victim_pose(t, "grabbed"), V(0, 0, 0.58 * s), 180)
			c.add_victim(victim_pose(t, "falling_back"), V(0, 0.12, 0.80 * s + adv * 0.6), 180)
			c.add_victim(victim_pose(t, "falling_back"), V(0, 0.05, dist * 0.8 + adv), 180)
			c.add_victim(victim_pose(t, "down_up"), V(0, 0, dist + adv), 180)
			c.add_victim(victim_pose(t, "down_up"), V(0, 0, dist + adv), 180)
		"down":
			var kneel := t.make_crouch()
			kneel.root = V(0, -0.55 * s, 0.25)
			kneel.chest += V(30, 0, 0)
			kneel.hand_l = V(-0.20, 0.20, 0.75)
			kneel.hand_r = V(0.20, 0.25, 0.70)
			c.add(0, t.make_crouch()).add(g, kneel).add(D, kneel.copy()).add(L, end_a)
			var dv := victim_pose(t, "down_up")
			c.add_victim(dv, V(0, 0, 0.75), 180)
			c.add_victim(dv.copy(), V(0, 0, 0.75), 180)
			var dv2 := dv.copy()
			dv2.chest += V(15, 0, 0)
			c.add_victim(dv2, V(0, 0, 0.75), 180)
			c.add_victim(dv.copy(), V(0, 0, 0.75), 180)
		"chain1":
			# 腰抱え（連続投げ1段目）: 締め上げてダメージ → 入力がなければ放り捨てる
			var hold := _waist_hold(t, a0)
			var drop := t.make_crouch()
			drop.chest += V(15, 0, 0)
			c.add(0, a0).add(g, hold).add(D, hold.copy()).add(mini(L - 6, D + 18), hold.copy()).add(L, drop)
			var hv2 := victim_pose(t, "hunched")
			c.add_victim(gv, front, 180)
			c.add_victim(hv2, V(0, 0.08, 0.42 * s), 180)
			var sq := hv2.copy()
			sq.chest += V(-12, 0, 0)
			c.add_victim(sq, V(0, 0.10, 0.42 * s), 180)
			c.add_victim(hv2.copy(), V(0, 0.08, 0.42 * s), 180)
			c.add_victim(victim_pose(t, "down_up"), V(0, 0, 0.85 * s), 180)
		"chain_lift":
			# 持ち上げ（2段目）: 腰抱えから担ぎ上げて保持 → 入力がなければ前へ叩きつける
			var hold2 := _waist_hold(t, a0)
			var up := hold2.copy()
			up.root += V(0, 0.10, 0)
			up.chest += V(-25, 0, 0)
			up.hand_l = V(-0.12, t.sh_h + 0.30, 0.25)
			up.hand_r = V(0.12, t.sh_h + 0.30, 0.25)
			var sl := a0.copy()
			sl.chest += V(35, 0, 0)
			sl.root += V(0, -0.30, 0.05)
			sl.hand_l = V(-0.12, 0.35, 0.65)
			sl.hand_r = V(0.12, 0.35, 0.65)
			c.add(0, hold2).add(maxi(4, D - 4), up, E.OUT_QUAD).add(D, up.copy()).add(mini(L - 8, D + 18), up.copy()) \
				.add(L - 4, sl, E.IN_CUBIC).add(L, end_a)
			var lv := victim_pose(t, "lifted")
			c.add_victim(victim_pose(t, "hunched"), V(0, 0.08, 0.42 * s), 180)
			c.add_victim(lv, V(0, 0.75, 0.30 * s), 180)
			c.add_victim(lv.copy(), V(0, 0.80, 0.30 * s), 180)
			c.add_victim(lv.copy(), V(0, 0.80, 0.30 * s), 180)
			c.add_victim(victim_pose(t, "down_up"), V(0, 0, 0.85 * s), 180)
			c.add_victim(victim_pose(t, "down_up"), V(0, 0, 0.88 * s), 180)
		"chain2":
			# 振り回し（2段目）: 腰を抱えたまま一回転して位置を入れ替え、再び腰抱えに戻る
			var h3 := _waist_hold(t, a0)
			var sw := h3.copy()
			sw.hips += V(0, 90, 0)
			sw.chest += V(-10, 20, 0)
			var sw2 := h3.copy()
			sw2.hips += V(0, 180, 0)
			c.add(0, h3).add(int(D * 0.5), sw).add(D, sw2).add(mini(L, D + 18), h3.copy()).add(L, h3.copy())
			var hu := victim_pose(t, "hunched")
			c.add_victim(hu, V(0, 0.08, 0.42 * s), 180)
			c.add_victim(victim_pose(t, "lifted"), V(0.50, 0.35, 0.10), 90)
			c.add_victim(victim_pose(t, "lifted"), V(0.0, 0.30, -0.45), 0)
			c.add_victim(hu.copy(), V(0, 0.08, 0.42 * s), 180)
			c.add_victim(hu.copy(), V(0, 0.08, 0.42 * s), 180)
		"chain3", "chain3_lift":
			# 俵返し（3段目）: 抱えたまま後ろへ反り投げる
			var st3 := _waist_hold(t, a0)
			var vstart := victim_pose(t, "hunched")
			var vpos := V(0, 0.08, 0.42 * s)
			if style == "chain3_lift":
				st3.root += V(0, 0.10, 0)
				st3.chest += V(-25, 0, 0)
				st3.hand_l = V(-0.12, t.sh_h + 0.30, 0.25)
				st3.hand_r = V(0.12, t.sh_h + 0.30, 0.25)
				vstart = victim_pose(t, "lifted")
				vpos = V(0, 0.80, 0.30 * s)
			var arch := st3.copy()
			arch.hips += V(-55, 0, 0)
			arch.chest += V(-40, 0, 0)
			arch.root += V(0, -0.30, -0.15)
			arch.hand_l = V(-0.12, t.sh_h + 0.25, -0.05)
			arch.hand_r = V(0.12, t.sh_h + 0.25, -0.05)
			var br := arch.copy()
			br.hips += V(-35, 0, 0)
			br.root += V(0, -0.25, -0.2)
			c.add(0, st3).add(int(D * 0.6), arch, E.IN_QUAD).add(D, br, E.IN_CUBIC).add(int((D + L) / 2.0), t.make_crouch()).add(L, end_a)
			c.add_victim(vstart, vpos, 180)
			c.add_victim(victim_pose(t, "inverted"), V(0, 0.90, -0.05), 0)
			c.add_victim(victim_pose(t, "down_up"), V(0, 0, -0.95 * s), 0)
			c.add_victim(victim_pose(t, "down_up"), V(0, 0, -1.0 * s), 0)
			c.add_victim(victim_pose(t, "down_up"), V(0, 0, -1.0 * s), 0)
		"clinch":
			# 首相撲: 両手で相手の首を抱え込む（保持のみ）
			var ch := _clinch_hold(t, a0)
			c.add(0, a0).add(g, ch, E.OUT_QUAD).add(L, ch.copy())
			c.add_victim(gv, front, 180)
			c.add_victim(_clinched(t), V(0, 0.04, 0.44 * s), 180)
			c.add_victim(_clinched(t), V(0, 0.04, 0.44 * s), 180)
		"clinch_knee":
			var ch2 := _clinch_hold(t, a0)
			var kc := ch2.copy()
			AnimTemplates.set_foot(kc, -t.lead, V(0.0, t.ank + 0.25, -0.05))
			kc.root += V(0, 0.0, -0.03)
			var kn := ch2.copy()
			AnimTemplates.set_foot(kn, -t.lead, V(0.0, t.hip_h + 0.05, 0.32))
			AnimTemplates.set_knee(kn, -t.lead, V(0, 0.5, 1))
			kn.hips += V(-14, 0, 0)
			kn.chest += V(12, 0, 0)
			kn.hand_l += V(0, -0.08, -0.04)
			kn.hand_r += V(0, -0.08, -0.04)
			var cv := _clinched(t)
			var cvh := cv.copy()
			cvh.chest += V(20, 0, 0)
			cvh.spine += V(10, 0, 0)
			c.add(0, ch2).add(maxi(2, D - 5), kc).add(D, kn, E.IN_QUAD).add(D + 5, kn.copy()).add(L, ch2.copy())
			c.add_victim(cv, V(0, 0.04, 0.44 * s), 180)
			c.add_victim(cv.copy(), V(0, 0.04, 0.44 * s), 180)
			c.add_victim(cvh, V(0, 0.09, 0.46 * s), 180)
			c.add_victim(cvh.copy(), V(0, 0.08, 0.46 * s), 180)
			c.add_victim(cv.copy(), V(0, 0.04, 0.44 * s), 180)
		"clinch_elbow":
			var ch3 := _clinch_hold(t, a0)
			var wind := ch3.copy()
			AnimTemplates.set_hand(wind, -t.lead, V(0.15 * -t.lead, t.sh_h + 0.25, 0.10))
			wind.chest += V(-6, 15.0 * t.lead, 0)
			var el := ch3.copy()
			AnimTemplates.set_hand(el, -t.lead, V(0.10 * t.lead, t.sh_h - 0.05, 0.25))
			AnimTemplates.set_elbow(el, -t.lead, V(0.2 * -t.lead, 0.3, 1.0))
			el.chest += V(18, -30.0 * t.lead, 0)
			el.hips += V(0, -25.0 * t.lead, 0)
			el.face = 1
			c.add(0, ch3).add(maxi(2, D - 6), wind, E.OUT_QUAD).add(D, el, E.IN_CUBIC).add(int((D + L) / 2.0), PoseData.lerp_pose(el, end_a, 0.5)).add(L, end_a)
			var cv2 := _clinched(t)
			var hitv := victim_pose(t, "grabbed")
			hitv.chest += V(-20, 0, 0)
			hitv.head += V(-25, 0, 0)
			c.add_victim(cv2, V(0, 0.04, 0.44 * s), 180)
			c.add_victim(cv2.copy(), V(0, 0.04, 0.44 * s), 180)
			c.add_victim(hitv, V(0, 0, 0.62 * s), 180)
			c.add_victim(victim_pose(t, "grabbed"), V(0, 0, 0.85 * s), 180)
			c.add_victim(victim_pose(t, "grabbed"), V(0, 0, 0.95 * s), 180)
		"clinch_throw":
			var ch4 := _clinch_hold(t, a0)
			var tw := ch4.copy()
			tw.hips += V(10, 70, 0)
			tw.chest += V(20, 30, 0)
			tw.root += V(0, -0.15, 0)
			tw.hand_l = V(0.10, t.hip_h + 0.20, 0.55)
			tw.hand_r = V(0.30, t.hip_h + 0.10, 0.40)
			c.add(0, ch4).add(int(D * 0.6), tw, E.IN_QUAD).add(D, tw.copy()).add(int((D + L) / 2.0), t.make_crouch()).add(L, end_a)
			c.add_victim(_clinched(t), V(0, 0.04, 0.44 * s), 180)
			c.add_victim(victim_pose(t, "falling_face"), V(0.35, 0.15, 0.55), 120)
			c.add_victim(victim_pose(t, "down_up"), V(0.20, 0, 1.0 * s), 180)
			c.add_victim(victim_pose(t, "down_up"), V(0.20, 0, 1.05 * s), 180)
			c.add_victim(victim_pose(t, "down_up"), V(0.20, 0, 1.05 * s), 180)
		"trap":
			# トラップ: 相手の突き手を捕らえて固める（保持のみ）
			var tr := _trap_hold(t, a0)
			c.add(0, a0).add(g, tr, E.OUT_QUAD).add(L, tr.copy())
			c.add_victim(_caught(t), V(0, 0, 0.66 * s), 180)
			c.add_victim(_caught(t), V(0, 0, 0.62 * s), 180)
			c.add_victim(_caught(t), V(0, 0, 0.62 * s), 180)
		"trap_elbows":
			var tr2 := _trap_hold(t, a0)
			var e1 := tr2.copy()
			AnimTemplates.set_hand(e1, -t.lead, V(0.05 * t.lead, t.sh_h + 0.02, 0.30))
			AnimTemplates.set_elbow(e1, -t.lead, V(0.2 * -t.lead, 0.4, 1.0))
			e1.chest += V(10, -25.0 * t.lead, 0)
			e1.face = 1
			var cg := _caught(t)
			var ch5 := cg.copy()
			ch5.head += V(-25, 20, 0)
			ch5.chest += V(-10, 0, 0)
			var k1 := maxi(3, D - 16)
			c.add(0, tr2).add(k1, e1, E.IN_CUBIC).add(k1 + 4, tr2.copy()).add(k1 + 8, e1.copy(), E.IN_CUBIC) \
				.add(k1 + 12, tr2.copy()).add(D, e1.copy(), E.IN_CUBIC).add(L, end_a)
			c.add_victim(cg, V(0, 0, 0.62 * s), 180)
			c.add_victim(ch5, V(0, 0, 0.64 * s), 180)
			c.add_victim(cg.copy(), V(0, 0, 0.62 * s), 180)
			c.add_victim(ch5.copy(), V(0, 0, 0.64 * s), 180)
			c.add_victim(cg.copy(), V(0, 0, 0.62 * s), 180)
			c.add_victim(ch5.copy(), V(0, 0, 0.66 * s), 180)
			c.add_victim(victim_pose(t, "grabbed"), V(0, 0, 0.90 * s), 180)
		"trap_knee":
			var tr3 := _trap_hold(t, a0)
			var ck := tr3.copy()
			AnimTemplates.set_foot(ck, -t.lead, V(0.10 * -t.lead, t.ank + 0.35, 0.15))
			var kk := tr3.copy()
			AnimTemplates.set_foot(kk, -t.lead, V(0.12, 0.30, 0.80))
			AnimTemplates.set_knee(kk, -t.lead, V(0, 0.3, 1))
			kk.hips += V(0, 30.0 * -t.lead, 0)
			kk.root += V(0.08, 0, 0.08)
			c.add(0, tr3).add(int(D * 0.6), ck).add(D, kk, E.IN_QUAD).add(int((D + L) / 2.0), t.make_crouch()).add(L, end_a)
			c.add_victim(_caught(t), V(0, 0, 0.62 * s), 180)
			c.add_victim(_caught(t), V(0, 0, 0.62 * s), 180)
			c.add_victim(victim_pose(t, "kneel"), V(0, 0, 0.66 * s), 180)
			c.add_victim(victim_pose(t, "falling_back"), V(0, 0.05, 0.80 * s), 180)
			c.add_victim(victim_pose(t, "down_up"), V(0, 0, 0.95 * s), 180)
		"trap_lock":
			var tr4 := _trap_hold(t, a0)
			var tw2 := tr4.copy()
			tw2.hips += V(10, 45, 0)
			tw2.chest += V(25, 30, 0)
			tw2.hand_l = V(-0.05, t.hip_h + 0.1, 0.65)
			tw2.hand_r = V(0.25, t.hip_h + 0.2, 0.55)
			tw2.root += V(0, -0.20, 0)
			var pin := t.make_crouch()
			pin.chest += V(20, 0, 0)
			pin.hand_l = V(-0.05, 0.40, 0.70)
			pin.hand_r = V(0.15, 0.35, 0.65)
			c.add(0, tr4).add(int(D * 0.7), tw2, E.IN_QUAD).add(D, pin, E.IN_QUAD).add(int((D + L) / 2.0), pin.copy()).add(L, end_a)
			c.add_victim(_caught(t), V(0, 0, 0.62 * s), 180)
			c.add_victim(victim_pose(t, "hunched"), V(0, 0, 0.58 * s), 180)
			c.add_victim(victim_pose(t, "falling_face"), V(0.10, 0.05, 0.75 * s), 140)
			c.add_victim(victim_pose(t, "down_face"), V(0, 0, 0.55 * s), 180)
			c.add_victim(victim_pose(t, "down_face"), V(0, 0, 0.55 * s), 180)
		"behind":
			# 背後回り: 相手の腕をくぐって体を回し、背中を向けさせて突き放す
			var duck := a0.copy()
			duck.root += V(0.10, -0.18, 0.05)
			duck.chest += V(20, -30, 0)
			duck.hand_l = V(-0.05, t.sh_h - 0.10, 0.55)
			duck.hand_r = V(0.25, t.sh_h - 0.05, 0.45)
			var turn := a0.copy()
			turn.hips += V(0, -30, 0)
			turn.chest += V(5, -20, 0)
			turn.hand_l = V(-0.15, t.sh_h - 0.05, 0.50)
			turn.hand_r = V(0.15, t.sh_h - 0.05, 0.55)
			var shove := a0.copy()
			shove.chest += V(10, 0, 0)
			shove.hand_l = V(-0.15, t.sh_h - 0.10, 0.75)
			shove.hand_r = V(0.15, t.sh_h - 0.10, 0.75)
			shove.root += V(0, -0.05, 0.10)
			c.add(0, a0).add(g, duck, E.OUT_QUAD).add(int(D * 0.7), turn).add(D, shove, E.IN_QUAD).add(L, AnimTemplates.shifted(t.st.copy(), V(0, 0, 0.10)))
			c.add_victim(gv, front, 180)
			c.add_victim(victim_pose(t, "grabbed"), V(0, 0, 0.60 * s), 180)
			c.add_victim(victim_pose(t, "grabbed"), V(0.05, 0, 0.60 * s), 90)
			var pushed := victim_pose(t, "grabbed")
			pushed.chest += V(15, 0, 0)
			c.add_victim(pushed, V(0, 0, 0.72 * s), 0)
			c.add_victim(victim_pose(t, "grabbed"), V(0, 0, 0.90 * s), 0)
		"flip":
			# 小手返し・当て身投げ: 手首を極めて前方へ一回転させて落とす
			var grab := a0.copy()
			grab.hand_l = V(-0.02, t.sh_h - 0.05, 0.50)
			grab.hand_r = V(0.08, t.sh_h - 0.02, 0.48)
			var twr := a0.copy()
			twr.hips += V(5, -35, 0)
			twr.chest += V(15, -20, 0)
			twr.hand_l = V(0.10, t.hip_h + 0.25, 0.55)
			twr.hand_r = V(0.20, t.hip_h + 0.30, 0.50)
			twr.root += V(0, -0.12, 0)
			var low2 := t.make_crouch()
			low2.chest += V(25, 0, 0)
			low2.hand_l = V(0.05, 0.45, 0.70)
			low2.hand_r = V(0.15, 0.50, 0.65)
			c.add(0, a0).add(g, grab).add(int(D * 0.6), twr, E.IN_QUAD).add(D, low2, E.IN_CUBIC).add(int((D + L) / 2.0), low2.copy()).add(L, end_a)
			c.add_victim(gv, front, 180)
			c.add_victim(victim_pose(t, "grabbed"), V(0, 0, 0.60 * s), 180)
			c.add_victim(victim_pose(t, "inverted"), V(-0.05, 0.85, 0.55), 180)
			c.add_victim(victim_pose(t, "down_up"), V(0, 0, 0.95 * s), 180)
			c.add_victim(victim_pose(t, "down_up"), V(0, 0, 0.95 * s), 180)
			c.add_victim(victim_pose(t, "down_up"), V(0, 0, 0.95 * s), 180)
		_:
			c.add(0, a0).add(L, end_a)
			c.add_victim(gv, front, 180)
			c.add_victim(victim_pose(t, "down_up"), V(0, 0, 0.9), 180)
	return c


## 腰抱え（連続投げ・首投げの保持）
static func _waist_hold(t: AnimTemplates, a0: PoseData) -> PoseData:
	var hold := a0.copy()
	hold.hand_l = V(-0.10, t.hip_h + 0.15, 0.40)
	hold.hand_r = V(0.10, t.hip_h + 0.15, 0.40)
	hold.root += V(0, -0.12, 0)
	hold.chest += V(20, 0, 0)
	return hold


## 首相撲の保持姿勢（両手で後頭部を抱える）
static func _clinch_hold(t: AnimTemplates, a0: PoseData) -> PoseData:
	var h := a0.copy()
	h.hand_l = V(-0.05, t.sh_h + 0.10, 0.38)
	h.hand_r = V(0.05, t.sh_h + 0.10, 0.38)
	h.elbow_l = V(-0.5, -0.7, 0.3)
	h.elbow_r = V(0.5, -0.7, 0.3)
	h.fist_l = 0.7
	h.fist_r = 0.7
	h.chest += V(8, 0, 0)
	h.root += V(0, -0.02, 0)
	h.face = 1
	return h


## 首相撲で抱え込まれた被投げ側（前かがみで頭を下げる）
static func _clinched(t: AnimTemplates) -> PoseData:
	var p := victim_pose(t, "hunched")
	p.spine = V(18, 0, 0)
	p.chest = V(18, 0, 0)
	p.head = V(10, 0, 0)
	p.root = V(0, -0.06, 0)
	p.hand_l = V(-0.12, t.sh_h - 0.05, 0.30)
	p.hand_r = V(0.12, t.sh_h - 0.05, 0.30)
	return p


## トラップ（腕取り）の保持姿勢: 前の手で手首、後ろの手で肘を押さえる
static func _trap_hold(t: AnimTemplates, a0: PoseData) -> PoseData:
	var h := a0.copy()
	AnimTemplates.set_hand(h, t.lead, V(0.05 * -t.lead, t.sh_h - 0.08, 0.50))
	AnimTemplates.set_hand(h, -t.lead, V(0.02 * -t.lead, t.sh_h - 0.02, 0.36))
	h.chest += V(6, -15.0 * t.lead, 0)
	h.fist_l = 0.6
	h.fist_r = 0.6
	h.face = 1
	return h


## 腕を取られた被投げ側（突いた腕が伸びたまま）
static func _caught(t: AnimTemplates) -> PoseData:
	var p := victim_pose(t, "grabbed")
	p.hand_r = V(0.02, t.sh_h - 0.05, 0.52)
	p.elbow_r = V(1, -0.2, 0)
	p.fist_r = 0.8
	p.chest += V(10, 0, 0)
	p.head += V(5, 0, 0)
	return p
