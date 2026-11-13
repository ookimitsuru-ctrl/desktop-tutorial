class_name FighterView
extends Node3D
## ファイター1人の描画。シミュレーション状態（姿勢参照・位置・向き）を読み、ポーズを決めて表示する。
## シミュレーションへは一切書き込まない。

## 足が地面を踏んだ（pos: ワールド座標、strength: 0〜1）
signal stepped(pos: Vector3, strength: float)
## 損傷した機体から火花が散った
signal sparked(pos: Vector3)

const FP_TO_F := 1.0 / 65536.0
const LIMBS := [Rig.B.L_HAND, Rig.B.R_HAND, Rig.B.L_FOOT, Rig.B.R_FOOT]
const CHAINS := [[Rig.B.HAIR1, Rig.B.HAIR2, Rig.B.HAIR3], [Rig.B.SASH1, Rig.B.SASH2]]

var model: CharacterModel
var ghosts: Array[CharacterModel] = []
var ghost_life: Array[float] = []
var lib: AnimLibrary
var pe: PoseEval
var cd: CharDef
var char_id := ""
var side := 0
var last_pose: PoseData = null
var cur_anim := -999
# 慣性ブレンド: 切り替え時の「前の姿勢との差」と「その速度」を持ち、ばねで 0 へ戻す。
# 新しい動きは最初のコマから動き続け、前の動きの勢いも残る（直線的な混ぜ合わせより重さが出る）
var _off_x: Dictionary = {}
var _off_v: Dictionary = {}
var _off_fx := PackedFloat32Array([0.0, 0.0, 0.0, 0.0])
var _off_t := 0.0
var _off_w := 30.0
var _off_on := false
var _prev_out: PoseData = null
# 上体の揺り戻し（x = 前後、y = 左右、度）・腰の沈み込み（m）・視線
var _lean := Vector2.ZERO
var _lean_v := Vector2.ZERO
var _bob := 0.0
var _bob_v := 0.0
var _look := Vector2.ZERO
var _vel := Vector3.ZERO
var _prev_pos := Vector3.ZERO
var _has_prev := false
var _prev_y := 0.0
var _foot_peak: Array[float] = [0.0, 0.0]
var _foot_down: Array[bool] = [true, true]
var _foot_cool: Array[float] = [0.0, 0.0]
var other: FighterView = null
var head_world := Vector3(0, 1.5, 0)
var trail: LimbTrail
## 手足の軌跡を出すか（PV の撮影では消す）
static var trails_enabled := true
var smoke: CPUParticles3D
var _spark_wait := 1.0
var max_hp := 1000
var last_frame := -1
var flash := 0.0
var shake := 0.0
# 表情（まばたき・力み・被弾）
var _blink_wait := randf_range(1.0, 4.0)
var _blink_t := -1.0
var _pain := 0.0
var shadow: MeshInstance3D
# 揺れ物（ワールド空間の粒子）
var _tip_pos: Dictionary = {}
var _tip_vel: Dictionary = {}
var _spring_ok := false
var hurt_debug: MeshInstance3D = null


func setup(p_char: String, costume: String, color_idx: int, p_cd: CharDef, p_side: int) -> void:
	char_id = p_char
	cd = p_cd
	side = p_side
	lib = DataDB.anim_lib(p_char)
	pe = PoseEval.new(lib.rig)
	var cj := DataDB.char_json(p_char)
	model = CharacterModel.new()
	add_child(model)
	model.build(p_char, costume, cj, color_idx, lib.rig)
	for k: int in range(2):
		var g := CharacterModel.new()
		g.visible = false
		add_child(g)
		g.build(p_char, costume, cj, color_idx, lib.rig, true)
		g.top_level = true
		if g.material != null:
			g.material.set_shader_parameter("ghost", 0.35)
			g.material.render_priority = 1
			(g.material as ShaderMaterial).set_shader_parameter("rim_intensity", 1.2)
		ghosts.append(g)
		ghost_life.append(0.0)
	trail = LimbTrail.new()
	add_child(trail)
	var cols: Array = cj.get("colors", [{}])
	var cdict: Dictionary = cols[clampi(color_idx, 0, cols.size() - 1)]
	var ac := Color.from_string(String(cdict.get("accent", "#FFC070")), Color(1.0, 0.75, 0.45))
	trail.color = ac.lerp(Color(1.0, 0.9, 0.75), 0.45)
	# 損傷時の煙（体力が減ると胸から立ちのぼる）
	smoke = CPUParticles3D.new()
	smoke.emitting = false
	smoke.amount = 14
	smoke.lifetime = 1.3
	smoke.local_coords = false
	var sq := QuadMesh.new()
	sq.size = Vector2(0.3, 0.3)
	var smat := ShaderMaterial.new()
	smat.shader = load("res://shaders/vfx_dust.gdshader")
	smat.set_shader_parameter("color", Color(0.16, 0.15, 0.15, 0.55))
	sq.material = smat
	smoke.mesh = sq
	smoke.direction = Vector3(0, 1, 0)
	smoke.spread = 22.0
	smoke.initial_velocity_min = 0.5
	smoke.initial_velocity_max = 1.1
	smoke.gravity = Vector3(0, 0.6, 0)
	smoke.scale_amount_min = 0.4
	smoke.scale_amount_max = 0.9
	var scv := Curve.new()
	scv.add_point(Vector2(0, 0.3))
	scv.add_point(Vector2(1, 1.6))
	smoke.scale_amount_curve = scv
	var sgr := Gradient.new()
	sgr.set_color(0, Color(1, 1, 1, 0.0))
	sgr.add_point(0.15, Color(1, 1, 1, 0.8))
	sgr.set_color(sgr.get_point_count() - 1, Color(1, 1, 1, 0.0))
	smoke.color_ramp = sgr
	smoke.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(smoke)
	# 丸影（Low 品質やリアルタイム影の補助）
	shadow = MeshInstance3D.new()
	var qm := QuadMesh.new()
	qm.size = Vector2(0.9, 0.9)
	qm.orientation = PlaneMesh.FACE_Y
	shadow.mesh = qm
	var sm := ShaderMaterial.new()
	sm.shader = load("res://shaders/blob_shadow.gdshader")
	shadow.material_override = sm
	shadow.top_level = true
	shadow.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(shadow)


func set_material_param(n: String, v: Variant) -> void:
	if model != null and model.material != null:
		model.material.set_shader_parameter(n, v)


## 現在の状態からポーズを決める
func _pose_for(w: SimWorld, i: int) -> PoseData:
	var p := w.f[i]
	if p.state == SE.ST_THROWN:
		var a := w.f[1 - i]
		var acd := w.chars[1 - i]
		if a.throw_move >= 0:
			var tm := acd.moves[a.throw_move]
			var alib := DataDB.anim_lib(acd.id)
			var clip: AnimClip = alib.clip(tm.id + "__throw")
			if clip != null:
				var vs: Array = clip.sample_victim(float(maxi(1, a.throw_frame)))
				return vs[0]
		return last_pose.copy() if last_pose != null else PoseData.new()
	var name := ""
	if p.anim >= 0 and p.anim < cd.anim_names.size():
		name = cd.anim_names[p.anim]
	var c: AnimClip = lib.clip(name)
	if c == null:
		c = lib.clip("idle")
	return c.sample(float(p.anim_frame))


func _blend_len(w: SimWorld, i: int) -> int:
	var p := w.f[i]
	match p.state:
		SE.ST_MOVE:
			var m := cd.moves[p.move]
			# 連携の次段はつながるように作ってあるので短く
			return 1 if m.chain_only else 2
		SE.ST_HITSTUN, SE.ST_BLOCKSTUN, SE.ST_THROWN, SE.ST_THROWING:
			return 2
		SE.ST_STAND, SE.ST_WALK_F, SE.ST_WALK_B, SE.ST_CROUCH, SE.ST_GUARD:
			return 4
		SE.ST_AIR, SE.ST_DOWN:
			return 3
	return 3


func sync(w: SimWorld, i: int, delta: float) -> void:
	var p := w.f[i]
	var key := p.anim * 1000 + (p.move if p.state == SE.ST_MOVE else 0) + (999 if p.state == SE.ST_THROWN else 0)
	var pose := _pose_for(w, i)
	var sim_advanced := w.frame != last_frame
	last_frame = w.frame
	var step_dt := (1.0 / 60.0) if (sim_advanced and w.hitstop == 0) else 0.0
	if key != cur_anim:
		if last_pose != null:
			_start_inertia(pose, _blend_len(w, i))
		cur_anim = key
	if _off_on:
		_off_t += step_dt
		pose = _apply_inertia(pose)
	if step_dt > 0.0:
		_prev_out = last_pose
	last_pose = pose
	# 位置と向き
	var ang := float(p.facing) / 65536.0 * TAU
	var fx := sin(ang)
	var fz := cos(ang)
	var pos := Vector3(p.x * FP_TO_F, p.y * FP_TO_F, p.z * FP_TO_F)
	var fwd := Vector3(fx, 0, fz)
	var right := fwd.cross(Vector3.UP)
	# 二次的な動き（慣性ブレンドの基準になる last_pose には含めない）
	var shown := _secondary(w, i, pose, pos, fwd, right, delta, step_dt)
	pe.evaluate(shown)
	if shake > 0.0:
		pos += Vector3(randf_range(-1, 1), randf_range(-0.3, 0.3), randf_range(-1, 1)) * 0.012 * shake
		shake = maxf(0.0, shake - delta * 6.0)
	global_position = pos
	rotation = Vector3(0, atan2(-fx, -fz), 0)
	var extra := _springs(delta)
	model.apply_pose(pe, extra)
	var xf := global_transform
	head_world = xf * pe.global[Rig.B.HEAD].origin
	_steps(p, xf, delta)
	_trails(p, xf, step_dt)
	_damage(p, xf, delta)
	# 影
	shadow.global_position = Vector3(pos.x, 0.012, pos.z) + _hips_offset()
	var hgt := clampf(1.0 - p.y * FP_TO_F * 0.6, 0.3, 1.0)
	shadow.scale = Vector3.ONE * (1.25 if p.state == SE.ST_DOWN else 1.0) * hgt
	# ヒットフラッシュ
	if flash > 0.0:
		flash = maxf(0.0, flash - delta * 8.0)
	set_material_param("hit_flash", flash * (0.1 if bool(Settings.g("photosensitive")) else 0.25))
	_face(p, delta)
	_ghosts(delta)


## 動きが切り替わった瞬間: 直前に表示していた姿勢との差と、その速度を覚える
func _start_inertia(target: PoseData, frames: int) -> void:
	_off_w = 4.7 / (float(frames + 2) / 60.0 * 1.5)
	_off_t = 0.0
	_off_on = true
	for f: String in PoseData.VEC_FIELDS:
		var x0: Vector3 = (last_pose.get(f) as Vector3) - (target.get(f) as Vector3)
		var v0 := Vector3.ZERO
		if _prev_out != null:
			v0 = ((last_pose.get(f) as Vector3) - (_prev_out.get(f) as Vector3)) * 60.0 * 0.55
			# 勢いは差の大きさに見合う分まで（行き過ぎて関節が暴れないように）
			var lim := x0.length() * _off_w * 1.2 + 0.02 * _off_w
			if v0.length() > lim:
				v0 = v0.normalized() * lim
		_off_x[f] = x0
		_off_v[f] = v0
	for k: int in range(4):
		var ff: String = PoseData.FLOAT_FIELDS[k]
		_off_fx[k] = float(last_pose.get(ff)) - float(target.get(ff))


## 臨界減衰のばねで差を 0 へ: x(t) = (x0 + (v0 + w x0) t) e^(-w t)
func _apply_inertia(target: PoseData) -> PoseData:
	var e := exp(-_off_w * _off_t)
	if e * (1.0 + _off_w * _off_t) < 0.004:
		_off_on = false
		return target
	var out := target.copy()
	for f: String in PoseData.VEC_FIELDS:
		var x0: Vector3 = _off_x[f]
		var v0: Vector3 = _off_v[f]
		out.set(f, (target.get(f) as Vector3) + (x0 + (v0 + x0 * _off_w) * _off_t) * e)
	for k: int in range(4):
		var ff: String = PoseData.FLOAT_FIELDS[k]
		out.set(ff, float(target.get(ff)) + _off_fx[k] * (1.0 + _off_w * _off_t) * e)
	return out


## 重さの表現: 加減速で上体が遅れて揺り戻す・着地で沈む・頭が相手を追う
func _secondary(w: SimWorld, i: int, pose: PoseData, pos: Vector3, fwd: Vector3, right: Vector3,
		delta: float, step_dt: float) -> PoseData:
	var p := w.f[i]
	if delta <= 0.0:
		_prev_pos = pos
		_has_prev = true
		_prev_y = pos.y
		return pose
	var dt := minf(delta, 1.0 / 30.0)
	if step_dt > 0.0:
		var vel := (pos - _prev_pos) / step_dt if _has_prev else Vector3.ZERO
		if vel.length() > 14.0:
			vel = Vector3.ZERO   # ラウンド開始などの瞬間移動
		var dv := vel - _vel
		_vel = vel
		dv.y = 0.0
		if dv.length() > 2.5:
			dv = dv.normalized() * 2.5
		# 前へ加速 → 上体は後ろへ遅れる（前屈が +）。右へ加速 → 左へ傾く（左傾きが +）
		_lean_v.x -= dv.dot(fwd) * 46.0
		_lean_v.y += dv.dot(right) * 46.0
		# 着地
		if _prev_y > 0.04 and pos.y <= 0.001:
			var fall := clampf((_prev_y - pos.y) * 60.0, 0.0, 8.0)
			_bob_v -= clampf(0.7 + fall * 0.25, 0.7, 2.2) * (0.35 if p.state == SE.ST_DOWN else 1.0)
		_prev_y = pos.y
		_prev_pos = pos
		_has_prev = true
		# ばね（少しだけ揺り戻しが残る減衰）
		_lean_v += (-_lean * 130.0 - _lean_v * 13.0) * step_dt
		_lean += _lean_v * step_dt
		_lean = _lean.clamp(Vector2(-13, -11), Vector2(13, 11))
		_bob_v += (-_bob * 210.0 - _bob_v * 17.0) * step_dt
		_bob = clampf(_bob + _bob_v * step_dt, -0.085, 0.03)
	# 視線: 立ち・移動・ガード中は頭が相手の頭を追う
	var look_t := Vector2.ZERO
	var track := false
	match p.state:
		SE.ST_STAND, SE.ST_CROUCH, SE.ST_WALK_F, SE.ST_WALK_B, SE.ST_DASH_F, SE.ST_DASH_B, SE.ST_RUN, \
		SE.ST_RUN_STOP, SE.ST_GUARD, SE.ST_EVADE, SE.ST_BACKTURN, SE.ST_STANCE, SE.ST_TURN:
			track = p.ko == 0
	if track and other != null:
		var d := other.head_world - head_world
		var lx := d.dot(right)
		var lz := d.dot(fwd)
		var dist := maxf(Vector2(lx, lz).length(), 0.3)
		look_t.x = clampf(rad_to_deg(atan2(-lx, lz)), -55.0, 55.0)
		look_t.y = clampf(rad_to_deg(atan2(-d.y, dist)), -28.0, 30.0)
	_look = _look.lerp(look_t, 1.0 - exp(-dt * (9.0 if track else 14.0)))
	if _lean.length_squared() < 1e-4 and absf(_bob) < 1e-4 and _look.length_squared() < 0.01:
		return pose
	var out := pose.copy()
	var down_k := 0.3 if (p.state == SE.ST_DOWN or p.state == SE.ST_THROWN) else 1.0
	out.root.y += _bob * down_k
	out.spine += Vector3(_lean.x * 0.35, 0, _lean.y * 0.35) * down_k
	out.chest += Vector3(_lean.x * 0.45, 0, _lean.y * 0.45) * down_k
	# 頭は上体よりさらに遅れる
	out.neck += Vector3(_lean.x * 0.25 + _look.y * 0.4, _look.x * 0.4, 0)
	out.head += Vector3(_lean.x * 0.35 + _look.y * 0.6, _look.x * 0.6, _lean.y * 0.2)
	return out


## 足が地面に着いた瞬間を見つけて知らせる（足音・土煙は試合側で出す）
func _steps(p: FighterState, xf: Transform3D, delta: float) -> void:
	var rest_y := lib.rig.joints[Rig.B.L_FOOT].y
	for k: int in range(2):
		_foot_cool[k] = maxf(0.0, _foot_cool[k] - delta)
		var fp := pe.global[Rig.B.L_FOOT if k == 0 else Rig.B.R_FOOT].origin
		var h := fp.y - rest_y + p.y * FP_TO_F
		if h > 0.06:
			_foot_down[k] = false
			_foot_peak[k] = maxf(_foot_peak[k], h)
		elif h < 0.025 and not _foot_down[k]:
			_foot_down[k] = true
			var peak := _foot_peak[k]
			_foot_peak[k] = 0.0
			var grounded := p.state != SE.ST_DOWN and p.state != SE.ST_THROWN and p.state != SE.ST_AIR \
					and p.state != SE.ST_RINGOUT and p.ko == 0
			if grounded and _foot_cool[k] <= 0.0 and delta > 0.0:
				_foot_cool[k] = 0.14
				var st := clampf(0.25 + peak * 1.6 + _vel.length() * 0.09, 0.2, 1.0)
				_bob_v -= 0.22 * st
				var wp := xf * Vector3(fp.x, 0.0, fp.z)
				stepped.emit(Vector3(wp.x, 0.03, wp.z), st)


## 技の最中、速く動く手足の先に軌跡を出す
func _trails(p: FighterState, xf: Transform3D, step_dt: float) -> void:
	var emit := trails_enabled and (p.state == SE.ST_MOVE or p.state == SE.ST_THROWING)
	for k: int in range(4):
		var b: int = LIMBS[k]
		var g := pe.global[b]
		var tip_local := lib.rig.tips[b] - lib.rig.joints[b]
		var dirn := tip_local.normalized()
		# 手は拳の幅、足は足首からつま先まで
		var a := xf * (g * (dirn * (-0.02 if k < 2 else 0.0)))
		var e := xf * (g * (dirn * (0.17 if k < 2 else 0.2)))
		trail.feed(k, a, e, emit, step_dt)
	trail.rebuild()


## 損傷: 体力が 3 割を切ると煙、さらに減ると火花
func _damage(p: FighterState, xf: Transform3D, delta: float) -> void:
	var ratio := float(p.hp) / float(maxi(1, max_hp))
	var hurt := ratio < 0.3 and p.hp > 0 and p.state != SE.ST_WIN
	var chest := xf * pe.global[Rig.B.CHEST].origin
	smoke.global_position = chest + Vector3(0, 0.12, 0)
	if smoke.emitting != hurt:
		smoke.emitting = hurt
	if hurt and delta > 0.0:
		_spark_wait -= delta
		if _spark_wait <= 0.0:
			_spark_wait = randf_range(0.5, 1.6) if ratio < 0.15 else randf_range(1.4, 3.2)
			var b: int = [Rig.B.CHEST, Rig.B.L_UPPER_ARM, Rig.B.R_UPPER_ARM, Rig.B.SPINE, Rig.B.L_UPPER_LEG][randi() % 5]
			sparked.emit(xf * pe.global[b].origin + Vector3(randf_range(-0.08, 0.08), randf_range(0.0, 0.1), randf_range(-0.08, 0.08)))


## 表情: ときどき瞬きし、技の最中は眉を寄せ（力み）、被弾・ガード中は目を細め、KO・敗北では目を閉じる
func _face(p: FighterState, delta: float) -> void:
	var blink := 0.0
	if _blink_t >= 0.0:
		_blink_t += delta
		blink = clampf(1.0 - absf(_blink_t - 0.06) / 0.06, 0.0, 1.0)
		if _blink_t > 0.13:
			_blink_t = -1.0
	else:
		_blink_wait -= delta
		if _blink_wait <= 0.0:
			_blink_t = 0.0
			_blink_wait = randf_range(2.0, 5.0)
	_pain = maxf(0.0, _pain - delta * 1.5)
	var frown := _pain
	match p.state:
		SE.ST_MOVE, SE.ST_THROWING:
			frown = maxf(frown, 0.7)
		SE.ST_HITSTUN, SE.ST_BLOCKSTUN, SE.ST_THROWN, SE.ST_AIR:
			frown = maxf(frown, 0.9)
			blink = maxf(blink, 0.45)
		SE.ST_WIN:
			frown = 0.0
	if p.ko != 0 or p.state == SE.ST_LOSE:
		blink = 1.0
		frown = 0.3
	model.set_face(blink, frown)


func _hips_offset() -> Vector3:
	var hp := pe.global[Rig.B.HIPS].origin
	return global_transform.basis * Vector3(hp.x, 0, hp.z)


## from: 攻撃側のワールド位置（わかるとき）。受けた方向へ上体がのけぞる
func on_hit(heavy: bool, from: Vector3 = Vector3.INF) -> void:
	flash = 1.0
	_pain = 1.0
	shake = 1.0 if heavy else 0.6
	if from != Vector3.INF:
		var d := global_position - from
		d.y = 0.0
		if d.length_squared() > 1e-6:
			d = d.normalized()
			var b := global_transform.basis
			var k := 210.0 if heavy else 120.0
			# モデルの前は -Z、右は +X
			_lean_v.x -= d.dot(b.z) * k
			_lean_v.y -= d.dot(b.x) * k * 0.8


## ガードで受け止めた衝撃（腰が沈む）
func on_block(heavy: bool) -> void:
	_bob_v -= 0.9 if heavy else 0.5
	_lean_v.x -= 70.0 if heavy else 35.0


func spawn_ghosts() -> void:
	for k: int in range(ghosts.size()):
		var g := ghosts[k]
		g.visible = true
		g.global_transform = global_transform
		g.global_position += Vector3(0, 0, 0)
		g.apply_pose(pe)
		ghost_life[k] = 0.30 + k * 0.08


func _ghosts(delta: float) -> void:
	for k: int in range(ghosts.size()):
		if ghost_life[k] <= 0.0:
			continue
		ghost_life[k] -= delta
		var g := ghosts[k]
		if g.material != null:
			g.material.set_shader_parameter("ghost", clampf(ghost_life[k] * 1.2, 0.0, 0.4))
		if ghost_life[k] <= 0.0:
			g.visible = false


## 揺れ物: 鎖ボーンの先端を粒子として追従させ、追加回転を返す
func _springs(delta: float) -> Dictionary:
	var extra := {}
	if delta <= 0.0:
		return extra
	var dt := minf(delta, 1.0 / 30.0)
	var xf := global_transform
	for chain: Array in CHAINS:
		if (chain[0] == Rig.B.HAIR1 and not lib.rig.has_hair) or (chain[0] == Rig.B.SASH1 and not lib.rig.has_sash):
			continue
		for b: int in chain:
			var g := pe.global[b]
			var tip_local := lib.rig.tips[b] - lib.rig.joints[b]
			var ln := tip_local.length()
			var joint_w := xf * g.origin
			var target_w := xf * (g * tip_local)
			if not _spring_ok or not _tip_pos.has(b):
				_tip_pos[b] = target_w
				_tip_vel[b] = Vector3.ZERO
				continue
			var tp: Vector3 = _tip_pos[b]
			var tv: Vector3 = _tip_vel[b]
			var acc := (target_w - tp) * 160.0 - tv * 14.0 + Vector3(0, -2.5, 0)
			tv += acc * dt
			tp += tv * dt
			var dvec := tp - joint_w
			if dvec.length() > 0.0001:
				tp = joint_w + dvec.normalized() * ln
			_tip_pos[b] = tp
			_tip_vel[b] = tv
			# モデル空間で rest→sim の方向の回転
			var inv := xf.affine_inverse()
			var d_rest := (g.basis * tip_local).normalized()
			var d_sim := (inv * tp - g.origin).normalized()
			if d_rest.dot(d_sim) > 0.9999:
				continue
			var axis := d_rest.cross(d_sim)
			if axis.length_squared() < 1e-10:
				continue
			var q_delta := Quaternion(axis.normalized(), d_rest.angle_to(d_sim))
			var gq := Quaternion(g.basis.orthonormalized())
			extra[b] = gq.inverse() * q_delta * gq
	_spring_ok = true
	return extra


func reset_springs() -> void:
	_spring_ok = false
	_has_prev = false
	_vel = Vector3.ZERO
	_lean = Vector2.ZERO
	_lean_v = Vector2.ZERO
	_bob = 0.0
	_bob_v = 0.0
	_off_on = false
	if trail != null:
		trail.clear()
