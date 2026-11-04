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
		"slam", "chain3":
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
			var hold := a0.copy()
			hold.hand_l = V(-0.10, t.hip_h + 0.15, 0.40)
			hold.hand_r = V(0.10, t.hip_h + 0.15, 0.40)
			hold.root += V(0, -0.12, 0)
			hold.chest += V(20, 0, 0)
			c.add(0, a0).add(g, hold).add(D, hold.copy()).add(L, hold.copy())
			var hv2 := victim_pose(t, "hunched")
			c.add_victim(gv, front, 180)
			c.add_victim(hv2, V(0, 0, 0.45 * s), 180)
			c.add_victim(hv2.copy(), V(0, 0.08, 0.42 * s), 180)
			c.add_victim(hv2.copy(), V(0, 0.08, 0.42 * s), 180)
		"chain2":
			var sw := a0.copy()
			sw.hips += V(0, 90, 0)
			sw.chest += V(10, 30, 0)
			sw.hand_l = V(0.25, t.hip_h + 0.25, 0.35)
			sw.hand_r = V(0.40, t.hip_h + 0.20, 0.25)
			var sw2 := sw.copy()
			sw2.hips += V(0, 90, 0)
			c.add(0, a0).add(int(D * 0.5), sw).add(D, sw2).add(L, a0.copy())
			c.add_victim(victim_pose(t, "hunched"), V(0, 0.08, 0.42 * s), 180)
			c.add_victim(victim_pose(t, "lifted"), V(0.55, 0.45, 0.20), 90)
			c.add_victim(victim_pose(t, "lifted"), V(-0.45, 0.50, 0.20), 270)
			c.add_victim(victim_pose(t, "hunched"), V(0, 0.08, 0.42 * s), 180)
		_:
			c.add(0, a0).add(L, end_a)
			c.add_victim(gv, front, 180)
			c.add_victim(victim_pose(t, "down_up"), V(0, 0, 0.9), 180)
	return c
