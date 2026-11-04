class_name AnimTemplates
extends RefCounted
## 構えを基準に、共通動作と技のキーポーズを手続き的に生成する。
## 座標はキャラ空間 [右, 上, 前]（m）、角度は [前屈+, 左へ向く+, 左へ傾く+]（度）。

const E := AnimClip.Ease

var rig: Rig
var s: float = 1.0
var sd: Dictionary = {}
var lead: int = -1          # -1 = 左足前（オーソドックス）, 1 = 右足前
var st: PoseData            # 構え
var ank: float = 0.085      # 足首の高さ
var hip_h: float = 0.955
var sh_h: float = 1.425
var chin_h: float = 1.56
var walk_f_speed: float = 1.5
var walk_b_speed: float = 1.2


func _init(r: Rig, stance_def: Dictionary, movement: Dictionary) -> void:
	rig = r
	s = r.height / 1.78
	sd = stance_def
	lead = 1 if String(sd.get("lead", "l")) == "r" else -1
	ank = r.joints[Rig.B.L_FOOT].y
	hip_h = r.joints[Rig.B.HIPS].y
	sh_h = r.joints[Rig.B.L_UPPER_ARM].y
	chin_h = r.joints[Rig.B.HEAD].y - 0.02 * s
	walk_f_speed = float(str(movement.get("walk_f", "1.5")))
	walk_b_speed = float(str(movement.get("walk_b", "1.2")))
	st = make_stance()


func _f(key: String, def: float) -> float:
	return float(str(sd.get(key, def)))


# ------------------------------------------------------------ 部位の補助（side: 1=右, -1=左）

static func hand(p: PoseData, side: int) -> Vector3:
	return p.hand_r if side > 0 else p.hand_l


static func set_hand(p: PoseData, side: int, v: Vector3) -> void:
	if side > 0:
		p.hand_r = v
	else:
		p.hand_l = v


static func set_elbow(p: PoseData, side: int, v: Vector3) -> void:
	if side > 0:
		p.elbow_r = v
	else:
		p.elbow_l = v


static func set_wrist(p: PoseData, side: int, v: Vector3) -> void:
	if side > 0:
		p.wrist_r = v
	else:
		p.wrist_l = v


static func set_fist(p: PoseData, side: int, v: float) -> void:
	if side > 0:
		p.fist_r = v
	else:
		p.fist_l = v


static func foot(p: PoseData, side: int) -> Vector3:
	return p.foot_r if side > 0 else p.foot_l


static func set_foot(p: PoseData, side: int, v: Vector3) -> void:
	if side > 0:
		p.foot_r = v
	else:
		p.foot_l = v


static func set_knee(p: PoseData, side: int, v: Vector3) -> void:
	if side > 0:
		p.knee_r = v
	else:
		p.knee_l = v


static func set_ankle(p: PoseData, side: int, v: Vector3) -> void:
	if side > 0:
		p.ankle_r = v
	else:
		p.ankle_l = v


static func set_toes(p: PoseData, side: int, v: float) -> void:
	if side > 0:
		p.toes_r = v
	else:
		p.toes_l = v


static func side_of(v: Variant) -> int:
	return 1 if String(v) == "r" else -1


static func V(x: float, y: float, z: float) -> Vector3:
	return Vector3(x, y, z)


# ------------------------------------------------------------ 構え

func make_stance() -> PoseData:
	var p := PoseData.new()
	var wdt := _f("width", 0.30) * s
	var dep := _f("depth", 0.44) * s
	var cr := _f("crouch", 0.07) * s
	var turn := _f("turn", 28.0)
	var guard := String(sd.get("guard", "mid"))
	var lean := _f("lean", 6.0)
	# 左足前（lead=-1）で作り、右足前なら最後に反転
	p.root = V(0, -cr, 0)
	p.hips = V(2, -turn, 0)
	p.spine = V(lean * 0.4, turn * 0.15, 0)
	p.chest = V(lean * 0.6, turn * 0.15, 0)
	p.neck = V(2, turn * 0.3, 0)
	p.head = V(4, turn * 0.4, 0)
	p.foot_l = V(-wdt * 0.25, ank, dep * 0.5)
	p.foot_r = V(wdt * 0.55, ank, -dep * 0.5)
	p.ankle_l = V(0, -turn * 0.35, 0)
	p.ankle_r = V(0, -turn - 30.0, 0)
	p.knee_l = V(-0.15, 0, 1)
	p.knee_r = V(0.45, 0, 1)
	var gy := chin_h
	match guard:
		"high":
			p.hand_l = V(-0.06 * s, gy - 0.10 * s, 0.30 * s)
			p.hand_r = V(0.08 * s, gy - 0.12 * s, 0.17 * s)
		"low":
			p.hand_l = V(-0.12 * s, gy - 0.40 * s, 0.32 * s)
			p.hand_r = V(0.12 * s, gy - 0.34 * s, 0.14 * s)
		"open":
			p.hand_l = V(-0.10 * s, gy - 0.22 * s, 0.40 * s)
			p.hand_r = V(0.10 * s, gy - 0.30 * s, 0.22 * s)
			p.fist_l = 0.2
			p.fist_r = 0.3
		"wide":
			p.hand_l = V(-0.30 * s, gy - 0.30 * s, 0.30 * s)
			p.hand_r = V(0.30 * s, gy - 0.32 * s, 0.22 * s)
			p.fist_l = 0.4
			p.fist_r = 0.4
		_:
			p.hand_l = V(-0.06 * s, gy - 0.17 * s, 0.34 * s)
			p.hand_r = V(0.09 * s, gy - 0.20 * s, 0.17 * s)
	p.elbow_l = V(-0.5, -1, -0.1)
	p.elbow_r = V(0.7, -1, -0.3)
	p.wrist_l = V(0, -20, 0)
	p.wrist_r = V(0, 20, 0)
	if sd.has("pose"):
		p.apply_dict(sd["pose"])
	if lead > 0:
		return p.mirrored()
	return p


## 構えの重心を下げたしゃがみ
func make_crouch() -> PoseData:
	var p := st.copy()
	var d := 0.40 * s
	p.root = V(0, -d, 0)
	p.hips = st.hips + V(18, 0, 0)
	p.spine = st.spine + V(10, 0, 0)
	p.chest = st.chest + V(8, 0, 0)
	p.head = st.head + V(-20, 0, 0)
	p.foot_l = st.foot_l * V(1.25, 1, 0.9)
	p.foot_r = st.foot_r * V(1.25, 1, 0.9)
	p.knee_l = V(st.knee_l.x * 2.0, 0, 1)
	p.knee_r = V(st.knee_r.x * 2.0, 0, 1)
	p.hand_l = st.hand_l + V(0, -0.38 * s, 0.03)
	p.hand_r = st.hand_r + V(0, -0.38 * s, 0.05)
	p.toes_l = 0
	p.toes_r = 18
	return p


func make_guard(crouch: bool) -> PoseData:
	var p := make_crouch() if crouch else st.copy()
	var cy := chin_h - (0.40 * s if crouch else 0.0)
	p.hand_l = V(-0.08 * s, cy - 0.04 * s, 0.24 * s)
	p.hand_r = V(0.08 * s, cy - 0.05 * s, 0.20 * s)
	p.elbow_l = V(-0.2, -1, 0.3)
	p.elbow_r = V(0.2, -1, 0.3)
	p.wrist_l = V(10, -60, 0)
	p.wrist_r = V(10, 60, 0)
	p.chest += V(6, 0, 0)
	p.head += V(8, 0, 0)
	p.spine.y *= 0.5
	p.chest.y *= 0.5
	return p


## 仰向けに倒れた姿勢（頭が後ろ、足が前）
func make_down_up() -> PoseData:
	var p := PoseData.new()
	p.root = V(0, -(hip_h - 0.13 * s), 0.25 * s)
	p.hips = V(-88, 0, 0)
	p.spine = V(0, 0, 0)
	p.chest = V(-4, 0, 0)
	p.neck = V(10, 0, 0)
	p.head = V(10, 15, 0)
	p.foot_l = V(-0.16 * s, 0.10 * s, 0.98 * s)
	p.foot_r = V(0.20 * s, 0.10 * s, 0.86 * s)
	p.knee_l = V(0, 1, 0.1)
	p.knee_r = V(0.2, 1, 0.2)
	p.ankle_l = V(-80, 10, 0)
	p.ankle_r = V(-70, -20, 0)
	p.hand_l = V(-0.42 * s, 0.07 * s, -0.12 * s)
	p.hand_r = V(0.40 * s, 0.07 * s, 0.02 * s)
	p.elbow_l = V(-1, 0.3, 0)
	p.elbow_r = V(1, 0.3, 0)
	p.fist_l = 0.3
	p.fist_r = 0.3
	return p


## うつ伏せ（頭が前、足が後ろ）
func make_down_face() -> PoseData:
	var p := PoseData.new()
	p.root = V(0, -(hip_h - 0.14 * s), -0.2 * s)
	p.hips = V(86, 10, 0)
	p.spine = V(2, 0, 0)
	p.chest = V(2, 0, 0)
	p.neck = V(-20, 0, 0)
	p.head = V(-20, -30, 0)
	p.foot_l = V(-0.18 * s, 0.10 * s, -1.02 * s)
	p.foot_r = V(0.16 * s, 0.10 * s, -0.95 * s)
	p.knee_l = V(0, -1, 0)
	p.knee_r = V(0, -1, 0)
	p.ankle_l = V(80, 0, 0)
	p.ankle_r = V(80, 0, 0)
	p.hand_l = V(-0.40 * s, 0.08 * s, 0.30 * s)
	p.hand_r = V(0.36 * s, 0.08 * s, 0.10 * s)
	p.elbow_l = V(-1, 0.5, 0)
	p.elbow_r = V(1, 0.5, 0)
	p.fist_l = 0.2
	p.fist_r = 0.2
	return p


# ------------------------------------------------------------ 共通アニメ

func common(clip_name: String, info: Dictionary) -> AnimClip:
	var c := AnimClip.new()
	c.name = clip_name
	match clip_name:
		"idle":
			c.loop = true
			c.length = 96
			var up := st.copy()
			up.root += V(0, 0.010 * s, 0)
			up.chest += V(-1.5, 0, 0)
			up.hand_l += V(0, 0.012, 0.004)
			up.hand_r += V(0, 0.010, 0)
			c.add(0, st.copy()).add(48, up).add(96, st.copy())
		"walk_f", "walk_b":
			_walk(c, clip_name == "walk_f")
		"dash_f":
			c.length = int(info.get("frames", 18))
			var n := c.length
			var a := st.copy()
			a.root += V(0, -0.04 * s, 0)
			a.chest += V(8, 0, 0)
			set_foot(a, lead, foot(st, lead) + V(0, 0.07 * s, 0.25 * s))
			var b := st.copy()
			b.root += V(0, -0.05 * s, 0)
			set_foot(b, -lead, foot(st, -lead) + V(0, 0.06 * s, 0.22 * s))
			c.add(0, st.copy()).add(int(n * 0.35), a, E.OUT_QUAD).add(int(n * 0.7), b).add(n, st.copy())
		"dash_b":
			c.length = int(info.get("frames", 20))
			var n2 := c.length
			var a2 := st.copy()
			a2.chest += V(-8, 0, 0)
			a2.root += V(0, 0.01, 0)
			set_foot(a2, -lead, foot(st, -lead) + V(0, 0.08 * s, -0.25 * s))
			var b2 := st.copy()
			set_foot(b2, lead, foot(st, lead) + V(0, 0.07 * s, -0.20 * s))
			b2.root += V(0, -0.03 * s, 0)
			c.add(0, st.copy()).add(int(n2 * 0.35), a2, E.OUT_QUAD).add(int(n2 * 0.7), b2).add(n2, st.copy())
		"run":
			_run(c)
		"run_stop":
			c.length = 10
			var sk := st.copy()
			sk.chest += V(-12, 0, 0)
			sk.root += V(0, -0.06 * s, 0)
			set_foot(sk, lead, foot(st, lead) + V(0, 0, 0.18))
			c.add(0, _run_pose(0.0)).add(4, sk, E.OUT_QUAD).add(10, st.copy())
		"crouch":
			c.loop = true
			c.length = 80
			var cp := make_crouch()
			var cu := cp.copy()
			cu.root += V(0, 0.008, 0)
			c.add(0, cp).add(40, cu).add(80, cp.copy())
		"crouch_in":
			c.length = 3
			c.add(0, st.copy()).add(3, make_crouch(), E.OUT_QUAD)
		"stand_up":
			c.length = 4
			c.add(0, make_crouch()).add(4, st.copy(), E.OUT_QUAD)
		"evade_l", "evade_r":
			_evade(c, -1 if clip_name == "evade_l" else 1)
		"guard_s":
			c.loop = true
			c.length = 60
			c.add(0, make_guard(false)).add(60, make_guard(false))
		"guard_c":
			c.loop = true
			c.length = 60
			c.add(0, make_guard(true)).add(60, make_guard(true))
		"block_s", "block_c":
			var g := make_guard(clip_name == "block_c")
			var k := g.copy()
			k.chest += V(-10, 0, 0)
			k.head += V(-8, 0, 0)
			k.hand_l += V(0, 0.02, -0.07)
			k.hand_r += V(0, 0.02, -0.07)
			k.root += V(0, -0.015, 0)
			c.length = 16
			c.add(0, g).add(2, k, E.OUT_EXPO).add(16, g.copy(), E.SMOOTH)
		"hit_high", "hit_high_heavy":
			var hv := clip_name == "hit_high_heavy"
			var h := st.copy()
			h.head += V(-30 if hv else -22, 18, 8)
			h.neck += V(-12, 6, 0)
			h.chest += V(-14 if hv else -9, 6, 0)
			h.hips += V(-4, 0, 0)
			h.hand_l += V(-0.05, 0.05, -0.12)
			h.hand_r += V(0.05, 0.04, -0.12)
			h.root += V(0, -0.02, 0)
			h.face = 2
			c.length = 24
			c.add(0, st.copy()).add(2, h, E.OUT_EXPO).add(9, h.copy(), E.LINEAR).add(24, st.copy(), E.SMOOTH)
		"hit_mid", "hit_mid_heavy":
			var hv2 := clip_name == "hit_mid_heavy"
			var h2 := st.copy()
			h2.spine += V(18 if hv2 else 12, 0, 0)
			h2.chest += V(16 if hv2 else 10, 0, 0)
			h2.head += V(10, 0, 0)
			h2.hips += V(-8, 0, 0)
			h2.root += V(0, -0.06 * s, 0)
			h2.hand_l = V(-0.08 * s, hip_h + 0.10 * s, 0.18 * s)
			h2.hand_r = V(0.10 * s, hip_h + 0.15 * s, 0.15 * s)
			h2.face = 2
			c.length = 24
			c.add(0, st.copy()).add(3, h2, E.OUT_EXPO).add(10, h2.copy(), E.LINEAR).add(24, st.copy(), E.SMOOTH)
		"hit_low":
			var h3 := st.copy()
			set_foot(h3, lead, foot(st, lead) + V(0, 0.08 * s, -0.10 * s))
			h3.root += V(0, -0.09 * s, 0)
			h3.hips += V(6, 0, 10 * lead)
			h3.chest += V(8, 0, -6 * lead)
			h3.face = 2
			c.length = 20
			c.add(0, st.copy()).add(3, h3, E.OUT_EXPO).add(20, st.copy())
		"hit_crouch":
			var cp2 := make_crouch()
			var h4 := cp2.copy()
			h4.chest += V(-12, 8, 0)
			h4.head += V(-15, 10, 0)
			h4.root += V(0, -0.03, 0)
			h4.face = 2
			c.length = 20
			c.add(0, cp2).add(2, h4, E.OUT_EXPO).add(20, cp2.copy())
		"hit_turn":
			var h5 := st.copy()
			h5.hips += V(0, 140, 0)
			h5.chest += V(-6, 30, 0)
			h5.head += V(-10, 20, 0)
			h5.face = 2
			var end5 := _backturn_pose()
			end5.hips += V(0, 180, 0)
			c.length = 24
			c.add(0, st.copy()).add(6, h5, E.OUT_QUAD).add(24, end5)
		"guard_crush":
			var gc := make_guard(false)
			var o := st.copy()
			o.chest += V(-18, 0, 0)
			o.head += V(-14, 0, 0)
			o.hand_l = V(-0.45 * s, sh_h + 0.05, 0.05)
			o.hand_r = V(0.45 * s, sh_h + 0.05, 0.0)
			o.fist_l = 0.3
			o.fist_r = 0.3
			o.face = 2
			c.length = 30
			c.add(0, gc).add(4, o, E.OUT_EXPO).add(22, o.copy()).add(30, st.copy())
		"stagger_gut", "stagger_leg":
			c.loop = true
			c.length = 40
			var w1 := st.copy()
			w1.spine += V(20, 0, 0)
			w1.chest += V(14, 0, 8)
			w1.head += V(8, 0, 0)
			w1.root += V(0, -0.10 * s, 0)
			w1.hand_l = V(-0.12 * s, hip_h + 0.05, 0.16 * s)
			w1.hand_r = V(0.12 * s, hip_h + 0.10, 0.12 * s)
			w1.face = 2
			if clip_name == "stagger_leg":
				set_foot(w1, lead, foot(st, lead) + V(0, 0.10 * s, -0.12 * s))
			var w2 := w1.copy()
			w2.chest += V(-4, 6, -14)
			w2.root += V(0, 0.02, 0)
			c.add(0, w1).add(20, w2).add(40, w1.copy())
		"crumple":
			_crumple(c)
		"air_launch", "air_knock", "air_trip", "air_spin":
			_air(c, clip_name)
		"down_up":
			c.loop = true
			c.length = 90
			var d1 := make_down_up()
			var d2 := d1.copy()
			d2.chest += V(-2, 0, 0)
			d2.head += V(4, -10, 0)
			c.add(0, d1).add(45, d2).add(90, d1.copy())
		"down_face":
			c.loop = true
			c.length = 90
			var f1 := make_down_face()
			var f2 := f1.copy()
			f2.head += V(-4, 6, 0)
			c.add(0, f1).add(45, f2).add(90, f1.copy())
		"getup_up", "getup_face":
			_getup(c, clip_name == "getup_face")
		"roll_l", "roll_r", "roll_back":
			_roll(c, clip_name)
		"tech", "tech_l", "tech_r", "tech_back":
			_tech(c, clip_name)
		"backturn":
			c.loop = true
			c.length = 60
			c.add(0, _backturn_pose()).add(60, _backturn_pose())
		"turn":
			c.length = 8
			var bt := _backturn_pose()
			var en := st.copy()
			en.hips += V(0, 180, 0)
			c.add(0, bt).add(8, en, E.OUT_QUAD)
			# 終了時にシミュレーションの向きが反転する（en = 新しい向きでの構え）
		"wall_stagger":
			c.loop = true
			c.length = 30
			var ws := st.copy()
			ws.chest += V(-16, 0, 6)
			ws.head += V(-10, 0, 0)
			ws.hips += V(-8, 0, 0)
			ws.hand_l = V(-0.40 * s, hip_h + 0.20, -0.10)
			ws.hand_r = V(0.40 * s, hip_h + 0.25, -0.12)
			ws.root += V(0, -0.08, 0)
			ws.face = 2
			c.add(0, ws).add(15, ws.copy()).add(30, ws.copy())
		"wall_splat":
			c.length = 40
			var sp := st.copy()
			sp.hips = V(-6, 0, 0)
			sp.chest = V(-10, 0, 0)
			sp.head = V(-14, 0, 0)
			sp.hand_l = V(-0.55 * s, sh_h + 0.15, -0.12)
			sp.hand_r = V(0.55 * s, sh_h + 0.10, -0.12)
			sp.fist_l = 0.2
			sp.fist_r = 0.2
			sp.foot_l = V(-0.18 * s, ank + 0.05, 0.10)
			sp.foot_r = V(0.18 * s, ank + 0.02, 0.12)
			sp.face = 2
			var sl := sp.copy()
			sl.root += V(0, -0.35 * s, 0)
			sl.hips += V(-30, 0, 0)
			c.add(0, sp).add(26, sp.copy()).add(40, sl, E.IN_QUAD)
		"clash":
			c.length = 18
			var cl := st.copy()
			cl.chest += V(-10, 0, 0)
			cl.hand_l += V(-0.05, 0.05, -0.1)
			cl.hand_r += V(0.05, 0.05, -0.1)
			c.add(0, cl).add(18, st.copy())
		"parried":
			c.length = 40
			var pr := st.copy()
			pr.chest += V(-14, -20, 10)
			pr.hips += V(-6, -12, 0)
			pr.hand_l = V(-0.45 * s, sh_h, 0.20)
			pr.hand_r = V(0.40 * s, sh_h - 0.2, -0.05)
			pr.face = 2
			c.add(0, pr).add(30, pr.copy()).add(40, st.copy())
		"ringout":
			c.length = 60
			var r1 := st.copy()
			r1.hips = V(-30, 0, 10)
			r1.chest = V(-20, 0, 0)
			r1.hand_l = V(-0.5 * s, sh_h + 0.3, 0.1)
			r1.hand_r = V(0.5 * s, sh_h + 0.35, 0.0)
			r1.fist_l = 0.0
			r1.fist_r = 0.0
			r1.foot_l = V(-0.2, ank + 0.3, 0.3)
			r1.face = 3
			var r2 := r1.copy()
			r2.hips = V(-70, 20, -10)
			r2.hand_l = V(-0.6 * s, sh_h, 0.3)
			c.add(0, r1).add(30, r2).add(60, r1.copy())
		"win":
			_win(c, int(info.get("variant", 0)))
		"lose":
			c.length = 90
			var l1 := make_crouch()
			l1.root = V(0, -0.55 * s, 0)
			set_foot(l1, -lead, V(0.15 * -lead * -1.0, ank, -0.35))
			l1.chest += V(20, 0, 0)
			l1.head += V(25, 0, 0)
			l1.hand_l = V(-0.25, 0.10, 0.25)
			l1.hand_r = V(0.25, 0.12, 0.30)
			l1.fist_l = 0.6
			l1.fist_r = 0.9
			c.add(0, st.copy()).add(40, l1, E.SMOOTH).add(90, l1.copy())
		"intro":
			c.length = 120
			var rel := st.copy()
			rel.root = V(0, 0, 0)
			rel.hips = V(0, 0, 0)
			rel.spine = V(0, 0, 0)
			rel.chest = V(0, 0, 0)
			rel.head = V(0, 0, 0)
			rel.neck = V(0, 0, 0)
			rel.foot_l = V(-0.12 * s, ank, 0.02)
			rel.foot_r = V(0.12 * s, ank, -0.02)
			rel.ankle_l = V(0, 8, 0)
			rel.ankle_r = V(0, -8, 0)
			rel.hand_l = V(-0.25 * s, hip_h - 0.12, 0.02)
			rel.hand_r = V(0.25 * s, hip_h - 0.12, 0.02)
			rel.elbow_l = V(-1, 0, 0.3)
			rel.elbow_r = V(1, 0, 0.3)
			rel.knee_l = V(0, 0, 1)
			rel.knee_r = V(0, 0, 1)
			var bow := rel.copy()
			bow.spine = V(14, 0, 0)
			bow.chest = V(10, 0, 0)
			bow.head = V(14, 0, 0)
			c.add(0, rel).add(30, rel.copy()).add(50, bow).add(70, rel.copy()).add(100, st.copy(), E.OUT_BACK).add(120, st.copy())
		_:
			c.length = 1
			c.add(0, st.copy())
	return c


func _walk(c: AnimClip, fwd: bool) -> void:
	c.loop = true
	var n := 24
	c.length = n
	var sp := (walk_f_speed if fwd else walk_b_speed) / 60.0
	var stride := sp * n
	var dirn := 1.0 if fwd else -1.0
	# 前足（lead）と後ろ足が交互にすり足で進む。接地中はキャラに対して後ろへ滑る
	var lead_side := lead
	var keys := [0, 6, 12, 18, 24]
	for k: int in keys:
		var p := st.copy()
		var t := float(k) / n
		var fl := foot(st, lead_side)
		var fr := foot(st, -lead_side)
		var a_lead := _shuffle_offset(t, 0.0, stride) * dirn
		var a_rear := _shuffle_offset(t, 0.5, stride) * dirn
		var lift_l := _lift(t, 0.0) * 0.05 * s
		var lift_r := _lift(t, 0.5) * 0.05 * s
		set_foot(p, lead_side, fl + V(0, lift_l, a_lead))
		set_foot(p, -lead_side, fr + V(0, lift_r, a_rear))
		p.root += V(0, -absf(sin(t * TAU * 2.0)) * 0.012 * s, 0)
		p.chest += V(dirn * 2.0, 0, 0)
		c.add(k, p, E.LINEAR)


## 1周期 t(0..1) の足の前後オフセット（振り出し 30% + 接地で後退 70%）
static func _shuffle_offset(t: float, phase: float, stride: float) -> float:
	var u := fposmod(t + phase, 1.0)
	if u < 0.3:
		return lerpf(-stride * 0.5, stride * 0.5, u / 0.3)
	return lerpf(stride * 0.5, -stride * 0.5, (u - 0.3) / 0.7)


static func _lift(t: float, phase: float) -> float:
	var u := fposmod(t + phase, 1.0)
	if u < 0.3:
		return sin(u / 0.3 * PI)
	return 0.0


func _run_pose(t: float) -> PoseData:
	var p := st.copy()
	p.hips = V(14, 0, 0)
	p.spine = V(6, 0, 0)
	p.chest = V(4, 0, 0)
	p.head = V(-12, 0, 0)
	p.neck = V(0, 0, 0)
	var sw := sin(t * TAU)
	var stride := 0.45 * s
	p.foot_l = V(-0.10 * s, ank + maxf(0.0, sw) * 0.22 * s, sw * stride)
	p.foot_r = V(0.10 * s, ank + maxf(0.0, -sw) * 0.22 * s, -sw * stride)
	p.knee_l = V(0, 0, 1)
	p.knee_r = V(0, 0, 1)
	p.ankle_l = V(-sw * 20.0, 0, 0)
	p.ankle_r = V(sw * 20.0, 0, 0)
	p.hand_l = V(-0.20 * s, hip_h + 0.25 * s, -sw * 0.22 * s + 0.05)
	p.hand_r = V(0.20 * s, hip_h + 0.25 * s, sw * 0.22 * s + 0.05)
	p.elbow_l = V(-0.3, -0.5, -1)
	p.elbow_r = V(0.3, -0.5, -1)
	p.root = V(0, -0.05 * s + absf(cos(t * TAU)) * 0.04 * s, 0)
	return p


func _run(c: AnimClip) -> void:
	c.loop = true
	c.length = 20
	for k: int in [0, 5, 10, 15, 20]:
		c.add(k, _run_pose(float(k) / 20.0), E.LINEAR)


func _evade(c: AnimClip, side: int) -> void:
	c.length = 22
	var a := st.copy()
	a.root += V(0, -0.07 * s, 0)
	a.hips += V(4, 12.0 * -side, 6.0 * -side)
	a.chest += V(4, 6.0 * -side, 0)
	# 進む側の足が先に出る
	var fa := V(0.28 * s * side, 0.06 * s, 0.02)
	if side == lead:
		set_foot(a, lead, foot(st, lead) + fa)
	else:
		set_foot(a, -lead, foot(st, -lead) + fa)
	var b := st.copy()
	b.root += V(0, -0.04 * s, 0)
	b.hips += V(2, 6.0 * -side, 0)
	c.add(0, st.copy()).add(6, a, E.OUT_QUAD).add(13, b).add(22, st.copy())


func _crumple(c: AnimClip) -> void:
	c.length = 60
	var k1 := st.copy()
	k1.spine += V(25, 0, 0)
	k1.chest += V(20, 0, 0)
	k1.head += V(15, 0, 0)
	k1.root = V(0, -0.15 * s, 0)
	k1.hand_l = V(-0.08, hip_h - 0.05, 0.15)
	k1.hand_r = V(0.10, hip_h, 0.12)
	k1.face = 2
	var k2 := k1.copy()
	k2.root = V(0, -0.50 * s, 0.05)
	k2.hips = V(30, 0, 0)
	k2.foot_l = V(-0.15 * s, ank, -0.05)
	k2.foot_r = V(0.15 * s, ank, -0.10)
	k2.knee_l = V(0, -0.3, 1)
	k2.knee_r = V(0, -0.3, 1)
	k2.hand_l = V(-0.2, 0.30, 0.3)
	k2.hand_r = V(0.2, 0.32, 0.3)
	c.add(0, st.copy()).add(10, k1, E.OUT_QUAD).add(36, k2, E.IN_QUAD).add(60, make_down_face(), E.IN_QUAD)


func _air(c: AnimClip, kind: String) -> void:
	c.length = 80
	var a := st.copy()
	a.face = 2
	match kind:
		"air_launch":
			a.hips = V(-35, 0, 0)
			a.spine = V(-10, 0, 0)
			a.chest = V(-15, 0, 0)
			a.head = V(-20, 0, 0)
			a.hand_l = V(-0.35 * s, sh_h + 0.15, 0.25)
			a.hand_r = V(0.35 * s, sh_h + 0.10, 0.20)
			a.foot_l = V(-0.12, ank - 0.10, 0.25)
			a.foot_r = V(0.14, ank + 0.05, 0.30)
		"air_knock":
			a.hips = V(-25, 0, 0)
			a.chest = V(-20, 0, 0)
			a.head = V(-25, 0, 0)
			a.hand_l = V(-0.4 * s, sh_h + 0.2, 0.3)
			a.hand_r = V(0.4 * s, sh_h + 0.1, 0.3)
			a.foot_l = V(-0.15, ank + 0.05, 0.40)
			a.foot_r = V(0.12, ank + 0.15, 0.45)
		"air_trip":
			a.hips = V(-50, 0, 0)
			a.chest = V(-10, 0, 0)
			a.hand_l = V(-0.45 * s, sh_h, 0.1)
			a.hand_r = V(0.45 * s, sh_h, 0.1)
			a.foot_l = V(-0.15, ank + 0.35, 0.65)
			a.foot_r = V(0.15, ank + 0.45, 0.55)
		"air_spin":
			a.hips = V(-30, 70, 25)
			a.chest = V(-10, 20, 10)
			a.hand_l = V(-0.45 * s, sh_h + 0.1, 0.0)
			a.hand_r = V(0.45 * s, sh_h + 0.2, 0.15)
			a.foot_l = V(-0.2, ank + 0.1, 0.3)
			a.foot_r = V(0.2, ank + 0.25, 0.2)
	a.fist_l = 0.3
	a.fist_r = 0.3
	a.knee_l = V(0, 0.3, 1)
	a.knee_r = V(0, 0.3, 1)
	var b := a.copy()
	b.hips += V(-40, 0, 0)
	b.root += V(0, -0.35 * s, 0)
	b.head += V(15, 0, 0)
	if kind == "air_spin":
		b.hips += V(-20, 180, 0)
	var e := make_down_face() if kind == "air_spin" else make_down_up()
	e.root += V(0, 0.08, 0)
	c.add(0, st.copy()).add(5, a, E.OUT_EXPO).add(26, b, E.SMOOTH).add(60, e, E.IN_QUAD).add(80, e.copy())


func _getup(c: AnimClip, face: bool) -> void:
	c.length = 26
	var start := make_down_face() if face else make_down_up()
	var sit := PoseData.new()
	if face:
		sit = make_crouch()
		sit.root = V(0, -0.62 * s, 0)
		sit.hips = V(50, 0, 0)
		sit.hand_l = V(-0.25, ank + 0.05, 0.35)
		sit.hand_r = V(0.25, ank + 0.05, 0.30)
		sit.fist_l = 0.1
		sit.fist_r = 0.1
	else:
		sit = make_down_up()
		sit.root = V(0, -(hip_h - 0.15 * s), 0.10)
		sit.hips = V(-15, 0, 0)
		sit.chest = V(15, 0, 0)
		sit.head = V(10, 0, 0)
		sit.hand_l = V(-0.30 * s, 0.10, -0.15)
		sit.hand_r = V(0.30 * s, 0.10, -0.12)
		sit.foot_l = V(-0.15, ank, 0.45)
		sit.foot_r = V(0.15, ank, 0.40)
		sit.knee_l = V(0, 1, 0.6)
		sit.knee_r = V(0, 1, 0.6)
	var kneel := make_crouch()
	kneel.root = V(0, -0.45 * s, 0)
	kneel.hips = st.hips + V(25, 0, 0)
	c.add(0, start).add(8, sit, E.OUT_QUAD).add(17, kneel, E.SMOOTH).add(26, st.copy(), E.OUT_QUAD)


func _roll(c: AnimClip, kind: String) -> void:
	c.length = 30
	var start := make_down_up()
	var mid := make_crouch()
	mid.root = V(0, -0.65 * s, 0)
	mid.hips = V(40, 0, 0)
	mid.spine = V(25, 0, 0)
	mid.chest = V(20, 0, 0)
	mid.head = V(20, 0, 0)
	mid.hand_l = V(-0.2, 0.4, 0.2)
	mid.hand_r = V(0.2, 0.4, 0.2)
	match kind:
		"roll_l":
			mid.hips += V(0, 0, 60)
		"roll_r":
			mid.hips += V(0, 0, -60)
		"roll_back":
			mid.hips = V(-120, 0, 0)
			mid.root = V(0, -0.6 * s, 0)
	var kneel := make_crouch()
	kneel.root = V(0, -0.40 * s, 0)
	c.add(0, start).add(10, mid, E.SMOOTH).add(20, kneel, E.SMOOTH).add(30, st.copy(), E.OUT_QUAD)


func _tech(c: AnimClip, kind: String) -> void:
	c.length = 22 if kind == "tech" else 26
	var start := make_down_up()
	start.root += V(0, 0.15, 0)
	var mid := make_crouch()
	mid.root = V(0, -0.55 * s, 0)
	mid.hips = V(35, 0, 0)
	mid.hand_l = V(-0.35, 0.25, 0.1)
	mid.hand_r = V(0.35, 0.25, 0.1)
	mid.fist_l = 0.1
	mid.fist_r = 0.1
	match kind:
		"tech_l":
			mid.hips += V(0, 0, 45)
		"tech_r":
			mid.hips += V(0, 0, -45)
		"tech_back":
			mid.hips = V(-90, 0, 0)
	c.add(0, start).add(int(c.length * 0.4), mid, E.OUT_QUAD).add(c.length, st.copy(), E.OUT_QUAD)


func _backturn_pose() -> PoseData:
	var p := st.copy()
	p.hips = V(2, 0, 0)
	p.spine = V(2, 10, 0)
	p.chest = V(4, 20, 0)
	p.neck = V(0, 25, 0)
	p.head = V(5, 40, 0)
	p.hand_l = V(-0.20 * s, hip_h + 0.30, 0.18)
	p.hand_r = V(0.20 * s, hip_h + 0.35, 0.15)
	p.foot_l = V(-0.16 * s, ank, 0.05)
	p.foot_r = V(0.16 * s, ank, -0.05)
	p.ankle_l = V(0, 10, 0)
	p.ankle_r = V(0, -10, 0)
	return p


func _win(c: AnimClip, variant: int) -> void:
	c.length = 150
	var a := st.copy()
	a.root = V(0, 0, 0)
	a.hips = V(0, -10, 0)
	a.chest = V(-4, 0, 0)
	a.head = V(-6, 10, 0)
	a.foot_l = V(-0.13 * s, ank, 0.05)
	a.foot_r = V(0.13 * s, ank, -0.05)
	a.face = 5
	match variant % 3:
		0:
			a.hand_r = V(0.10 * s, chin_h + 0.25 * s, 0.10)
			a.hand_l = V(-0.22 * s, hip_h, 0.05)
			a.elbow_r = V(1, 0, 0)
		1:
			a.hand_l = V(-0.08 * s, sh_h - 0.12, 0.25)
			a.hand_r = V(0.08 * s, sh_h - 0.10, 0.25)
			a.spine = V(18, 0, 0)
			a.chest = V(10, 0, 0)
			a.head = V(10, 0, 0)
		_:
			a.hand_l = V(-0.06 * s, chin_h - 0.15, 0.30)
			a.hand_r = V(0.12 * s, hip_h + 0.05, -0.05)
			a.hips = V(0, -35, 0)
			a.head = V(0, 35, 0)
	c.add(0, st.copy()).add(30, a, E.OUT_BACK).add(150, a.copy())


# ------------------------------------------------------------ 技

## 技アニメの生成。md = moves.json の1件
func move(md: Dictionary) -> AnimClip:
	var fr: Array = md.get("f", [10, 2, 12])
	var S := int(fr[0])
	var A := int(fr[1])
	var R := int(fr[2])
	var T := S + A - 1 + R
	var an: Dictionary = md.get("anim", {})
	var t := String(an.get("t", "punch"))
	var c := AnimClip.new()
	c.name = String(md.get("id", ""))
	c.length = T
	var base := _start_pose(md)
	match t:
		"punch":
			_punch(c, base, an, S, A, R)
		"elbow":
			_elbow(c, base, an, S, A, R)
		"kick":
			_kick(c, base, an, S, A, R)
		"knee":
			an["style"] = "knee"
			_kick(c, base, an, S, A, R)
		"headbutt":
			_headbutt(c, base, an, S, A, R)
		"shoulder":
			_shoulder(c, base, an, S, A, R)
		"stance":
			_stance_enter(c, base, an, T)
		"parry":
			_parry(c, base, an, S, A, R)
		"throw":
			ThrowTemplates.build(self, c, base, md, an)
		"down_attack":
			_down_attack(c, base, an, S, A, R)
		"wakeup":
			_wakeup(c, an, S, A, R)
		_:
			_punch(c, base, an, S, A, R)
	return c


## 技の開始姿勢（from に応じて）
func _start_pose(md: Dictionary) -> PoseData:
	var fr: Array = md.get("from", ["stand"])
	var an: Dictionary = md.get("anim", {})
	if an.has("start"):
		var sp := String(an["start"])
		if sp == "crouch":
			return make_crouch()
		if sp == "down":
			return make_down_up()
		if sp == "backturn":
			var b := _backturn_pose()
			b.hips += V(0, 180, 0)
			return b
	if "crouch" in fr and not ("stand" in fr):
		return make_crouch()
	if "down" in fr:
		return make_down_up()
	if "backturn" in fr:
		var b2 := _backturn_pose()
		b2.hips += V(0, 180, 0)
		return b2
	if "rise" in fr:
		return make_crouch()
	return st.copy()


## 体を off（[右, 上, 前] の水平成分）だけ移動させた姿勢（手足も一緒に移動）
static func shifted(p: PoseData, off: Vector3) -> PoseData:
	var q := p.copy()
	var o := Vector3(off.x, 0, off.z)
	q.root = Vector3(p.root.x + off.x, p.root.y, p.root.z + off.z)
	q.hand_l += o
	q.hand_r += o
	q.foot_l += o
	q.foot_r += o
	return q


## 終了姿勢（技の移動量だけ前に出た構え）
func _end_at(an: Dictionary, off: Vector3) -> PoseData:
	var back := float(str(an.get("back", "0")))
	return shifted(_end_pose(an), Vector3(off.x, 0, off.z + back))


func _end_pose(an: Dictionary) -> PoseData:
	var e := String(an.get("end", "stand"))
	match e:
		"crouch":
			return make_crouch()
		"backturn":
			return _backturn_pose()
		"down":
			return make_down_up()
	return st.copy()


func _h(v: Variant) -> float:
	match String(v):
		"high":
			return 1.47
		"mid":
			return 1.12
		"low":
			return 0.42
		"low_mid":
			return 0.85
		"head_high":
			return 1.60
	return float(String(v))


## 打撃の標準タイミング: [予備, 接触, 持続終わり, 戻り途中, 終了]
static func _times(S: int, A: int, R: int) -> Array[int]:
	var ant := clampi(int(round(S * 0.5)), 1, maxi(1, S - 2))
	var hold := S + A - 1
	var mid := hold + maxi(1, int(round(R * 0.4)))
	return [ant, S, hold, mid, S + A - 1 + R]


func _punch(c: AnimClip, base: PoseData, an: Dictionary, S: int, A: int, R: int) -> void:
	var side := side_of(an.get("side", "l" if lead < 0 else "r"))
	var style := String(an.get("style", "straight"))
	var h := _h(an.get("h", "high")) * (0.92 + 0.08 * s)
	var reach := float(str(an.get("reach", "0.62"))) * s
	var step := float(str(an.get("step", "0.0")))
	var twist := float(str(an.get("twist", "0")))
	var crouch := float(str(an.get("crouch", "0"))) * s
	var tm := _times(S, A, R)
	var rear := side != lead
	var turn := (38.0 if rear else 16.0) + twist
	var ant := base.copy()
	var hit := base.copy()
	# 体の回転: 右手なら左へ向く(+)
	hit.hips += V(4, turn * 0.55 * side, 0)
	hit.chest += V(6, turn * 0.45 * side, 0)
	hit.head += V(2, -turn * 0.8 * side, 0)
	hit.root += V(0, -crouch - 0.02 * s, step)
	hit.face = 1
	ant.hips += V(0, -turn * 0.15 * side, 0)
	ant.root += V(0, -0.015 * s - crouch * 0.4, step * 0.2)
	var aim_x := 0.02 * side * s
	var target := V(aim_x, h, reach + step)
	var elbow := V(0.6 * side, -0.6, -0.3)
	var wrist := V(0, -70.0 * side, 0)
	match style:
		"hook":
			target = V(-0.05 * side * s, h, reach * 0.78 + step)
			elbow = V(1.0 * side, 0.15, 0.0)
			wrist = V(0, -90.0 * side, 0)
			set_hand(ant, side, hand(base, side) + V(0.22 * side * s, -0.05, -0.05))
			hit.hips += V(0, turn * 0.3 * side, 0)
		"upper":
			target = V(0.0, h, reach * 0.62 + step)
			elbow = V(0.3 * side, -1.0, 0.2)
			wrist = V(-40, -10.0 * side, 0)
			set_hand(ant, side, V(0.12 * side * s, hip_h - 0.05, 0.18 + step * 0.2))
			ant.root += V(0, -0.09 * s, 0)
			ant.chest += V(10, 0, 0)
			hit.root += V(0, 0.03 * s, 0)
			hit.chest += V(-8, 0, 0)
		"back":
			target = V(0.05 * side * s, h, reach * 0.88 + step)
			elbow = V(0.0, -0.6, 1.0)
			wrist = V(0, 60.0 * side, 0)
			set_hand(ant, side, V(-0.12 * side * s, sh_h - 0.12, 0.20))
			hit.hips += V(0, -turn * 1.1 * side, 0)
			hit.chest += V(0, -turn * 0.8 * side, 0)
		"hammer":
			target = V(0.0, h, reach * 0.70 + step)
			elbow = V(0.5 * side, 1.0, 0.2)
			wrist = V(60, 0, 0)
			set_hand(ant, side, V(0.10 * side * s, chin_h + 0.25 * s, 0.05))
			hit.chest += V(16, 0, 0)
			hit.spine += V(10, 0, 0)
		"palm":
			set_fist(hit, side, 0.0)
			set_fist(ant, side, 0.2)
			wrist = V(-55, -30.0 * side, 0)
		"chop":
			set_fist(hit, side, 0.0)
			target = V(0.15 * side * s, h, reach * 0.78 + step)
			elbow = V(1.0 * side, 0.3, 0.0)
			wrist = V(0, -10.0 * side, 0)
			set_hand(ant, side, V(-0.20 * side * s, chin_h, 0.10))
		"spear":
			set_fist(hit, side, 0.0)
			wrist = V(0, -90.0 * side, 0)
		"double":
			var other := -side
			set_hand(hit, other, V(0.02 * other * s, h - 0.12, reach * 0.95 + step))
			set_elbow(hit, other, V(0.6 * other, -0.6, -0.3))
			set_wrist(hit, other, V(0, -70.0 * other, 0))
			hit.hips = base.hips + V(8, 0, 0)
			hit.chest = base.chest + V(10, -base.chest.y, 0)
			hit.head = base.head + V(0, -base.head.y, 0)
		"body":
			target = V(0.0, h, reach * 0.85 + step)
			hit.root += V(0, -0.10 * s, 0)
			hit.chest += V(12, 0, 0)
	set_hand(hit, side, target)
	set_elbow(hit, side, elbow)
	set_wrist(hit, side, wrist)
	# 踏み込み: 前足を前へ
	if step > 0.05:
		set_foot(hit, lead, foot(base, lead) + V(0, 0, step * 0.9))
		set_foot(ant, lead, foot(base, lead) + V(0, 0.06 * s, step * 0.5))
	if crouch > 0.15:
		var cp := make_crouch()
		hit.foot_l = cp.foot_l
		hit.foot_r = cp.foot_r
		hit.knee_l = cp.knee_l
		hit.knee_r = cp.knee_r
	var ext := hit.copy()
	set_hand(ext, side, target + V(0, 0, 0.02))
	var end := _end_at(an, hit.root)
	var rec := PoseData.lerp_pose(hit, end, 0.55)
	c.add(0, base).add(tm[0], ant, E.SMOOTH).add(tm[1], hit, E.IN_CUBIC).add(tm[2], ext, E.LINEAR) \
		.add(tm[3], rec, E.OUT_QUAD).add(tm[4], end, E.SMOOTH)


func _elbow(c: AnimClip, base: PoseData, an: Dictionary, S: int, A: int, R: int) -> void:
	var side := side_of(an.get("side", "r" if lead < 0 else "l"))
	var style := String(an.get("style", "fwd"))
	var h := _h(an.get("h", "mid"))
	var step := float(str(an.get("step", "0.1")))
	var tm := _times(S, A, R)
	var ant := base.copy()
	var hit := base.copy()
	var rear := side != lead
	var turn := 75.0 if rear else 50.0
	hit.hips += V(6, turn * 0.6 * side, 0)
	hit.chest += V(10, turn * 0.5 * side, 0)
	hit.head += V(0, -turn * 0.9 * side, 0)
	hit.root += V(0, -0.04 * s, step)
	hit.face = 1
	ant.hips += V(0, -turn * 0.2 * side, 0)
	ant.root += V(0, -0.02 * s, step * 0.2)
	# 肘先端を体の中心線の前に出す: 手首は反対側の肩の前、肘を前へ
	var hand_t := V(-0.12 * side * s, h + 0.12, 0.22 * s + step)
	var elbow_dir := V(-0.1 * side, -0.1, 1.0)
	match style:
		"up":
			hand_t = V(0.0, h + 0.30, 0.15 * s + step)
			elbow_dir = V(0.2 * side, 0.6, 1.0)
			ant.root += V(0, -0.08 * s, 0)
		"down":
			hand_t = V(0.05 * side, h - 0.05, 0.25 + step)
			elbow_dir = V(0.3 * side, -1.0, 0.8)
		"spin":
			hit.hips += V(0, 70.0 * side, 0)
			hit.chest += V(0, 30.0 * side, 0)
			hand_t = V(0.15 * side * s, h + 0.08, 0.30 * s + step)
			elbow_dir = V(1.0 * side, 0, 0.6)
		"back":
			hand_t = V(0.10 * side * s, h + 0.05, -0.05 + step)
			elbow_dir = V(0.3 * side, 0, -1.0)
	set_hand(hit, side, hand_t)
	set_elbow(hit, side, elbow_dir)
	set_wrist(hit, side, V(0, -40.0 * side, 0))
	if step > 0.05:
		set_foot(hit, lead, foot(base, lead) + V(0, 0, step * 0.9))
	var end := _end_at(an, hit.root)
	var rec := PoseData.lerp_pose(hit, end, 0.5)
	c.add(0, base).add(tm[0], ant).add(tm[1], hit, E.IN_CUBIC).add(tm[2], hit.copy(), E.LINEAR) \
		.add(tm[3], rec, E.OUT_QUAD).add(tm[4], end, E.SMOOTH)


func _kick(c: AnimClip, base: PoseData, an: Dictionary, S: int, A: int, R: int) -> void:
	var side := side_of(an.get("side", "r" if lead < 0 else "l"))
	var style := String(an.get("style", "front"))
	var h := _h(an.get("h", "mid"))
	var reach := float(str(an.get("reach", "0.85"))) * s
	var step := float(str(an.get("step", "0.0")))
	var tm := _times(S, A, R)
	c.spline = true
	var support := -side
	var ant := base.copy()
	var hit := base.copy()
	var chamber := base.copy()
	var rear := side != lead
	# 軸足は構えの位置（踏み込み分だけ前）
	var sup_pos := foot(base, support) + V(0, 0, step)
	if rear:
		sup_pos = foot(base, lead) + V(0.05 * side, 0, step)
	set_foot(hit, support, sup_pos)
	set_foot(chamber, support, sup_pos)
	set_foot(ant, support, foot(base, support) + V(0, 0, step * 0.3))
	hit.root += V(0, 0.0, step)
	chamber.root += V(0, 0.0, step * 0.7)
	hit.face = 1
	var foot_t := V(0.0, h, reach + step)
	var knee_dir := V(0, 0, 1)
	var kchamber := V(0.1 * side, minf(h, hip_h + 0.05), 0.35 + step * 0.7)
	match style:
		"front":
			knee_dir = V(0, 0.3, 1)
			hit.hips += V(-12, 10.0 * side if rear else 0.0, 0)
			hit.chest += V(-6, 0, 0)
			set_ankle(hit, side, V(-60, 0, 0))
			set_toes(hit, side, 30)
		"push":
			knee_dir = V(0, 0.4, 1)
			hit.hips += V(-18, 0, 0)
			hit.chest += V(-8, 0, 0)
			set_ankle(hit, side, V(-75, 0, 0))
			set_toes(hit, side, 40)
		"round":
			foot_t = V(-0.05 * side, h, reach * 0.92 + step)
			knee_dir = V(-0.2 * side, 1.0, 0.6)
			kchamber = V(0.35 * side, hip_h, 0.15 + step * 0.7)
			hit.hips += V(-6, 75.0 * side, -22.0 * side)
			hit.chest += V(0, -25.0 * side, 10.0 * side)
			hit.head += V(0, -40.0 * side, 0)
			set_ankle(hit, side, V(-60, 70.0 * side, 0))
			set_knee(chamber, side, V(0.6 * side, 1, 0.3))
			set_foot(chamber, support, sup_pos)
			set_ankle(hit, support, V(0, 70.0 * side, 0))
		"side":
			foot_t = V(0.0, h, reach + step)
			knee_dir = V(0.0, 1.0, 0.0)
			kchamber = V(0.05 * side, hip_h + 0.05, 0.10 + step * 0.5)
			hit.hips += V(-10, 85.0 * side, -30.0 * side)
			hit.chest += V(-4, -20.0 * side, 14.0 * side)
			hit.head += V(0, -55.0 * side, 0)
			set_ankle(hit, side, V(-30, 90.0 * side, 0))
			set_ankle(hit, support, V(0, 90.0 * side, 0))
		"back":
			foot_t = V(0.05 * side, h, reach + step)
			knee_dir = V(0, -1.0, 0.3)
			kchamber = V(0.1 * side, hip_h, 0.0 + step * 0.5)
			hit.hips += V(25, 175.0 * side, 0)
			hit.chest += V(0, 10.0 * side, 0)
			hit.head += V(-10, 160.0 * -side, 0)
			set_ankle(hit, side, V(70, 180, 0))
			ant.hips += V(0, 90.0 * side, 0)
		"spin":
			foot_t = V(-0.15 * side, h, reach * 0.95 + step)
			knee_dir = V(0.0, 1.0, -0.3)
			kchamber = V(0.25 * side, hip_h, -0.1 + step * 0.5)
			hit.hips += V(-10, 250.0 * side, -25.0 * side)
			hit.chest += V(0, 40.0 * side, 10.0 * side)
			hit.head += V(0, -60.0 * side, 0)
			ant.hips += V(0, 120.0 * side, 0)
			chamber.hips += V(0, 180.0 * side, 0)
			set_ankle(hit, side, V(0, 160.0 * side, 0))
			set_ankle(hit, support, V(0, 200.0 * side, 0))
		"axe":
			foot_t = V(0.0, h, reach * 0.8 + step)
			knee_dir = V(0, 0.3, 1.0)
			kchamber = V(0.05 * side, h + 0.65, 0.45 + step * 0.7)
			hit.hips += V(10, 0, 0)
			hit.chest += V(16, 0, 0)
			set_ankle(hit, side, V(30, 0, 0))
		"low":
			foot_t = V(0.05 * side, 0.25, reach * 0.95 + step)
			knee_dir = V(0.3 * side, 0.2, 1.0)
			kchamber = V(0.15 * side, 0.45, 0.30 + step * 0.5)
			hit.hips += V(6, 40.0 * side, 0)
			hit.root += V(0, -0.06 * s, 0)
			set_ankle(hit, side, V(-30, 60.0 * side, 0))
		"sweep":
			var cp := make_crouch()
			hit = cp.copy()
			chamber = cp.copy()
			hit.root = V(0, -0.62 * s, step)
			chamber.root = hit.root
			hit.hips = V(35, 120.0 * side, 0)
			chamber.hips = V(35, 60.0 * side, 0)
			hit.hand_l = V(-0.25, 0.25, 0.1)
			hit.hand_r = V(0.25, 0.25, 0.1)
			set_foot(hit, support, V(0.0, ank, step - 0.05))
			set_foot(chamber, support, V(0.0, ank, step - 0.05))
			foot_t = V(-0.2 * side, ank + 0.02, reach * 0.95 + step)
			knee_dir = V(0, 1.0, 0.3)
			kchamber = V(0.5 * side, ank + 0.05, 0.2 + step)
			set_ankle(hit, side, V(0, 90.0 * side, 0))
		"knee":
			foot_t = V(0.0, h - 0.40, 0.15 + step)
			knee_dir = V(0, 0.2, 1.0)
			kchamber = V(0.05 * side, h - 0.45, 0.05 + step)
			hit.hips += V(-14, 15.0 * side, 0)
			hit.chest += V(10, 0, 0)
			var gh := chin_h - 0.25
			hit.hand_l = V(-0.12 * s, gh, 0.40 + step)
			hit.hand_r = V(0.12 * s, gh, 0.40 + step)
			set_ankle(hit, side, V(60, 0, 0))
			set_toes(hit, side, -30)
		"jump_knee":
			foot_t = V(0.0, h - 0.40, 0.18 + step)
			knee_dir = V(0, 0.2, 1.0)
			kchamber = V(0.05 * side, h - 0.55, 0.10 + step)
			hit.root += V(0, 0.38 * s, 0)
			chamber.root += V(0, 0.25 * s, 0)
			hit.hips += V(-10, 0, 0)
			set_foot(hit, support, V(-0.05 * side, ank + 0.55 * s, step - 0.15))
			set_knee(hit, support, V(0, -0.3, 1))
			hit.hand_l = V(-0.15 * s, chin_h + 0.1, 0.30 + step)
			hit.hand_r = V(0.15 * s, chin_h + 0.15, 0.20 + step)
			ant.root += V(0, -0.10 * s, 0)
		"jump":
			foot_t = V(0.0, h, reach + step)
			knee_dir = V(0, 0.4, 1.0)
			kchamber = V(0.05 * side, h - 0.20, 0.30 + step)
			hit.root += V(0, 0.42 * s, 0)
			chamber.root += V(0, 0.30 * s, 0)
			hit.hips += V(-20, 30.0 * side, 0)
			set_foot(hit, support, V(-0.05 * side, ank + 0.50 * s, step - 0.20))
			set_knee(hit, support, V(0, -0.2, 1))
			ant.root += V(0, -0.12 * s, 0)
		"flip":
			hit.root += V(0, 0.45 * s, 0)
			chamber.root += V(0, 0.30 * s, 0)
			hit.hips += V(-130, 0, 0)
			chamber.hips += V(-60, 0, 0)
			foot_t = V(0.0, h + 0.4, 0.5 + step)
			knee_dir = V(0, -0.5, 1.0)
			kchamber = V(0.05 * side, hip_h + 0.4, 0.2 + step)
			set_foot(hit, support, V(-0.05 * side, h + 0.2, 0.2 + step))
		"stomp":
			foot_t = V(0.05 * side, ank + 0.02, reach * 0.8 + step)
			knee_dir = V(0, 0.3, 1.0)
			kchamber = V(0.05 * side, 0.75, 0.45 + step)
			hit.chest += V(18, 0, 0)
			hit.root += V(0, -0.10 * s, 0)
	set_foot(hit, side, foot_t)
	set_knee(hit, side, knee_dir)
	if style != "sweep":
		set_foot(chamber, side, kchamber)
		set_knee(chamber, side, knee_dir if style != "round" else V(0.6 * side, 1, 0.3))
		chamber.hips = PoseData.lerp_pose(base, hit, 0.5).hips if style not in ["spin", "back"] else chamber.hips
		chamber.chest = PoseData.lerp_pose(base, hit, 0.5).chest
	else:
		set_foot(chamber, side, kchamber)
		set_knee(chamber, side, knee_dir)
	# 腕でバランス
	if style in ["round", "side", "spin", "back", "axe", "front", "push"]:
		var arm_up := 0.0 if style in ["front", "push"] else 0.10
		set_hand(hit, side, V(0.40 * side * s, sh_h - 0.30 + arm_up, -0.10))
		set_elbow(hit, side, V(0.6 * side, -1, 0))
		set_hand(hit, support, V(0.08 * support * s, chin_h - 0.12, 0.25))
	var end := _end_at(an, V(hit.root.x, 0, step))
	if style in ["jump_knee", "jump", "flip"]:
		end.root.y = base.root.y
	var rec := chamber.copy()
	rec.root.z = hit.root.z
	rec.root.y = lerpf(hit.root.y, end.root.y, 0.6)
	var k_ant := clampi(int(round(S * 0.35)), 1, maxi(1, S - 3))
	var k_ch := clampi(int(round(S * 0.7)), k_ant + 1, maxi(k_ant + 1, S - 1))
	c.add(0, base).add(k_ant, ant, E.SMOOTH).add(k_ch, chamber, E.OUT_QUAD).add(tm[1], hit, E.IN_QUAD) \
		.add(tm[2], hit.copy(), E.LINEAR).add(tm[3], rec, E.OUT_QUAD).add(tm[4], end, E.SMOOTH)


func _headbutt(c: AnimClip, base: PoseData, an: Dictionary, S: int, A: int, R: int) -> void:
	var step := float(str(an.get("step", "0.25")))
	var tm := _times(S, A, R)
	var ant := base.copy()
	ant.chest += V(-12, 0, 0)
	ant.head += V(-20, 0, 0)
	ant.root += V(0, 0.01, 0)
	ant.hand_l = V(-0.15 * s, chin_h - 0.05, 0.40)
	ant.hand_r = V(0.15 * s, chin_h - 0.05, 0.40)
	ant.fist_l = 0.4
	ant.fist_r = 0.4
	var hit := ant.copy()
	hit.spine = V(22, 0, 0)
	hit.chest = V(20, 0, 0)
	hit.neck = V(15, 0, 0)
	hit.head = V(20, 0, 0)
	hit.hips = base.hips * V(1, 0.3, 1) + V(10, 0, 0)
	hit.root = base.root + V(0, -0.05 * s, step)
	hit.hand_l = V(-0.20 * s, sh_h - 0.05, 0.45 + step)
	hit.hand_r = V(0.20 * s, sh_h - 0.05, 0.45 + step)
	set_foot(hit, lead, foot(base, lead) + V(0, 0, step))
	hit.face = 3
	var end := _end_at(an, V(0, 0, step))
	c.add(0, base).add(tm[0], ant).add(tm[1], hit, E.IN_CUBIC).add(tm[2], hit.copy()).add(tm[3], PoseData.lerp_pose(hit, end, 0.5)).add(tm[4], end)


func _shoulder(c: AnimClip, base: PoseData, an: Dictionary, S: int, A: int, R: int) -> void:
	var step := float(str(an.get("step", "0.35")))
	var tm := _times(S, A, R)
	var hit := base.copy()
	hit.hips = V(8, -70.0 * -lead * -1.0, 0)
	hit.chest = V(14, 0, 0)
	hit.root = base.root + V(0, -0.10 * s, step)
	set_foot(hit, lead, foot(base, lead) + V(0, 0, step + 0.1))
	set_hand(hit, lead, V(0.05 * lead, chin_h - 0.2, 0.20 + step))
	set_hand(hit, -lead, V(-0.05 * lead, chin_h - 0.15, 0.10 + step))
	hit.face = 1
	var ant := base.copy()
	ant.root += V(0, -0.06 * s, 0)
	var end := _end_at(an, V(0, 0, step))
	c.add(0, base).add(tm[0], ant).add(tm[1], hit, E.IN_CUBIC).add(tm[2], hit.copy()).add(tm[3], PoseData.lerp_pose(hit, end, 0.5)).add(tm[4], end)


func _stance_enter(c: AnimClip, base: PoseData, an: Dictionary, T: int) -> void:
	var target := stance_pose(String(an.get("stance", "")))
	c.add(0, base).add(T, target, E.OUT_QUAD)


## 名前付きの構え（character.json の stances[].pose を構えに上書き）
var stance_defs: Dictionary = {}


func stance_pose(sid: String) -> PoseData:
	var p := st.copy()
	if stance_defs.has(sid):
		var d: Dictionary = stance_defs[sid]
		var pd: Dictionary = d.get("pose", {})
		var rel := bool(d.get("relative", true))
		if rel:
			var tmp := PoseData.new()
			tmp.apply_dict(pd)
			for k: String in pd:
				if k in PoseData.VEC_FIELDS:
					p.set(k, (p.get(k) as Vector3) + (tmp.get(k) as Vector3))
				elif k in PoseData.FLOAT_FIELDS:
					p.set(k, float(pd[k]))
		else:
			p.apply_dict(pd)
		if bool(d.get("crouch", false)):
			var cp := make_crouch()
			p.foot_l = cp.foot_l
			p.foot_r = cp.foot_r
			p.knee_l = cp.knee_l
			p.knee_r = cp.knee_r
			p.root.y = minf(p.root.y, cp.root.y)
	return p


func stance_clip(sid: String) -> AnimClip:
	var c := AnimClip.new()
	c.name = "stance_" + sid
	c.loop = true
	c.length = 60
	var p := stance_pose(sid)
	var p2 := p.copy()
	p2.root += V(0, 0.012, 0)
	c.add(0, p).add(30, p2).add(60, p.copy())
	return c


func _parry(c: AnimClip, base: PoseData, an: Dictionary, S: int, A: int, R: int) -> void:
	var T := S + A - 1 + R
	var catch := base.copy()
	var side := side_of(an.get("side", "l" if lead < 0 else "r"))
	set_hand(catch, side, V(0.0, chin_h - 0.10, 0.42 * s))
	set_hand(catch, -side, V(0.10 * -side, sh_h - 0.25, 0.25))
	set_fist(catch, side, 0.1)
	set_wrist(catch, side, V(-30, -40.0 * side, 0))
	catch.chest += V(0, -15.0 * side, 0)
	catch.root += V(0, -0.04, 0)
	var low := bool(an.get("low", false))
	if low:
		set_hand(catch, side, V(0.0, 0.55, 0.45 * s))
		catch.root += V(0, -0.2 * s, 0)
		catch.chest += V(15, 0, 0)
	c.add(0, base).add(3, catch, E.OUT_QUAD).add(maxi(4, S + A - 1), catch.copy()).add(T, st.copy())


func _down_attack(c: AnimClip, base: PoseData, an: Dictionary, S: int, A: int, R: int) -> void:
	var style := String(an.get("style", "punch"))
	var tm := _times(S, A, R)
	var reach := float(str(an.get("reach", "0.75")))
	var hit := make_crouch()
	if style == "pounce":
		var air := base.copy()
		air.root = V(0, 0.35 * s, reach * 0.5)
		air.hips = V(30, 0, 0)
		air.foot_l = V(-0.15, ank + 0.4, reach * 0.3)
		air.foot_r = V(0.15, ank + 0.35, reach * 0.2)
		hit = make_crouch()
		hit.root = V(0, -0.65 * s, reach)
		hit.hips = V(55, 0, 0)
		hit.chest = V(25, 0, 0)
		hit.foot_l = V(-0.2, ank, reach - 0.35)
		hit.foot_r = V(0.2, ank, reach - 0.45)
		set_hand(hit, 1, V(0.05, 0.12, reach + 0.25))
		set_hand(hit, -1, V(-0.15, 0.20, reach + 0.10))
		var rec := shifted(make_crouch(), V(0, 0, reach))
		var end := shifted(st.copy(), V(0, 0, reach))
		c.add(0, base).add(tm[0], air, E.OUT_QUAD).add(tm[1], hit, E.IN_QUAD).add(tm[2], hit.copy()).add(tm[3], rec).add(tm[4], end)
		return
	if style == "stomp":
		_kick(c, base, {"side": "r" if lead < 0 else "l", "style": "stomp", "h": "0.1", "reach": str(reach)}, S, A, R)
		return
	hit.root += V(0, -0.15 * s, 0.10)
	hit.chest += V(20, 0, 0)
	set_hand(hit, 1, V(0.05, 0.15, reach))
	set_elbow(hit, 1, V(0.5, 0.5, -0.3))
	var ant := make_crouch()
	set_hand(ant, 1, V(0.15, 0.80, 0.10))
	var end2 := shifted(st.copy(), V(0, 0, 0.10))
	c.add(0, base).add(tm[0], ant).add(tm[1], hit, E.IN_CUBIC).add(tm[2], hit.copy()).add(tm[3], shifted(make_crouch(), V(0, 0, 0.1))).add(tm[4], end2)


func _wakeup(c: AnimClip, an: Dictionary, S: int, A: int, R: int) -> void:
	var low := bool(an.get("low", false))
	var tm := _times(S, A, R)
	var start := make_down_up()
	var sit := make_down_up()
	sit.root = V(0, -(hip_h - 0.18 * s), 0.0)
	sit.hips = V(-25, 0, 0)
	sit.chest = V(20, 0, 0)
	sit.hand_l = V(-0.30, 0.10, -0.25)
	sit.hand_r = V(0.30, 0.10, -0.25)
	sit.foot_l = V(-0.15, ank, 0.35)
	sit.foot_r = V(0.15, ank + 0.1, 0.30)
	var hit := sit.copy()
	var side := 1
	if low:
		hit.root = V(0, -(hip_h - 0.20 * s), 0.0)
		hit.hips = V(-35, -30, 0)
		set_foot(hit, side, V(0.05, 0.12, 0.95))
		set_knee(hit, side, V(0, 1, 0.2))
	else:
		hit.root = V(0, -0.40 * s, 0.0)
		hit.hips = V(-30, 0, 20)
		hit.hand_l = V(-0.30, 0.05, -0.10)
		set_foot(hit, side, V(0.05, 0.95, 0.75))
		set_knee(hit, side, V(0.5, 1, 0.3))
		set_foot(hit, -side, V(-0.15, ank, 0.05))
	hit.face = 1
	var kneel := make_crouch()
	c.add(0, start).add(tm[0], sit, E.OUT_QUAD).add(tm[1], hit, E.IN_QUAD).add(tm[2], hit.copy()).add(tm[3], kneel).add(tm[4], st.copy())
