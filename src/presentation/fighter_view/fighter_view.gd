class_name FighterView
extends Node3D
## ファイター1人の描画。シミュレーション状態（姿勢参照・位置・向き）を読み、ポーズを決めて表示する。
## シミュレーションへは一切書き込まない。

const FP_TO_F := 1.0 / 65536.0
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
var blend_from: PoseData = null
var blend_left := 0
var blend_total := 1
var last_frame := -1
var flash := 0.0
var shake := 0.0
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
		g.build(p_char, costume, cj, color_idx, lib.rig)
		g.top_level = true
		if g.material != null:
			g.material.set_shader_parameter("ghost", 0.35)
			g.material.render_priority = 1
			(g.material as ShaderMaterial).set_shader_parameter("rim_intensity", 1.2)
		ghosts.append(g)
		ghost_life.append(0.0)
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
	if key != cur_anim:
		if last_pose != null:
			blend_from = last_pose
			blend_total = _blend_len(w, i)
			blend_left = blend_total
		cur_anim = key
	var sim_advanced := w.frame != last_frame
	last_frame = w.frame
	if blend_left > 0 and blend_from != null:
		var t := 1.0 - float(blend_left) / float(blend_total + 1)
		pose = PoseData.lerp_pose(blend_from, pose, AnimClip.ease_t(AnimClip.Ease.SMOOTH, t))
		if sim_advanced and w.hitstop == 0:
			blend_left -= 1
	last_pose = pose
	pe.evaluate(pose)
	# 位置と向き
	var ang := float(p.facing) / 65536.0 * TAU
	var fx := sin(ang)
	var fz := cos(ang)
	var pos := Vector3(p.x * FP_TO_F, p.y * FP_TO_F, p.z * FP_TO_F)
	if shake > 0.0:
		pos += Vector3(randf_range(-1, 1), randf_range(-0.3, 0.3), randf_range(-1, 1)) * 0.012 * shake
		shake = maxf(0.0, shake - delta * 6.0)
	global_position = pos
	rotation = Vector3(0, atan2(-fx, -fz), 0)
	var extra := _springs(delta)
	model.apply_pose(pe, extra)
	# 影
	shadow.global_position = Vector3(pos.x, 0.012, pos.z) + _hips_offset()
	var hgt := clampf(1.0 - p.y * FP_TO_F * 0.6, 0.3, 1.0)
	shadow.scale = Vector3.ONE * (1.25 if p.state == SE.ST_DOWN else 1.0) * hgt
	# ヒットフラッシュ
	if flash > 0.0:
		flash = maxf(0.0, flash - delta * 8.0)
	set_material_param("hit_flash", flash * (0.1 if bool(Settings.g("photosensitive")) else 0.25))
	_ghosts(delta)


func _hips_offset() -> Vector3:
	var hp := pe.global[Rig.B.HIPS].origin
	return global_transform.basis * Vector3(hp.x, 0, hp.z)


func on_hit(heavy: bool) -> void:
	flash = 1.0
	shake = 1.0 if heavy else 0.6


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
