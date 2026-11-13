class_name Ring
extends RefCounted
## 押し合い・リング境界・壁ヒット・リングアウト。仕様: 02_combat_system.md §2.11, §2.13

static func resolve(w: SimWorld) -> void:
	_pushbox(w)
	for i: int in range(2):
		_constrain(w, i)
	_pushbox(w)
	for i: int in range(2):
		_constrain(w, i)


static func resolve_post(w: SimWorld) -> void:
	for i: int in range(2):
		_constrain(w, i)


static func _pushbox(w: SimWorld) -> void:
	var a := w.f[0]
	var b := w.f[1]
	if _no_push(a) or _no_push(b):
		return
	if absi(a.y - b.y) > FP.from_str("0.6"):
		return
	var dx := b.x - a.x
	var dz := b.z - a.z
	var d := FP.len2(dx, dz)
	var mn := w.chars[0].push_radius + w.chars[1].push_radius
	if a.state == SE.ST_DOWN or b.state == SE.ST_DOWN:
		mn = (mn * 3) / 4
	if d >= mn:
		return
	var nx := 0
	var nz := 0
	if d < 16:
		nx = FP.sin(a.facing)
		nz = FP.cos(a.facing)
	else:
		nx = (dx << 16) / d
		nz = (dz << 16) / d
	var ov := mn - d
	var ha := ov / 2
	var hb := ov - ha
	a.x -= FP.mul(nx, ha)
	a.z -= FP.mul(nz, ha)
	b.x += FP.mul(nx, hb)
	b.z += FP.mul(nz, hb)


static func _no_push(p: FighterState) -> bool:
	return p.state == SE.ST_THROWN or p.state == SE.ST_THROWING or p.state == SE.ST_RINGOUT or p.state == SE.ST_CLASH and p.sf < 2


## 符号付き距離（内側が正）
static func sdist(w: SimWorld, k: int, x: int, z: int) -> int:
	return FP.mul(w.stage.edge_nx[k], x) + FP.mul(w.stage.edge_nz[k], z) - w.stage.edge_c[k]


static func ringout_eligible(w: SimWorld, i: int) -> bool:
	var p := w.f[i]
	match p.state:
		SE.ST_AIR, SE.ST_KO:
			return true
		SE.ST_HITSTUN:
			return p.slide > 0 and (p.reaction == SE.R_HIGH_HEAVY or p.reaction == SE.R_MID_HEAVY)
		SE.ST_THROWN:
			var o := w.opp(i)
			if o.throw_move >= 0:
				return w.chars[1 - i].moves[o.throw_move].has_flag(SE.F_CAN_RINGOUT)
	return false


static func _wall_hit_eligible(p: FighterState) -> bool:
	return p.state == SE.ST_AIR or (p.state == SE.ST_HITSTUN and p.slide > 0)


static func _constrain(w: SimWorld, i: int) -> void:
	var p := w.f[i]
	if p.state == SE.ST_RINGOUT:
		return
	var cd := w.chars[i]
	var r := cd.push_radius
	var eligible := ringout_eligible(w, i)
	var n := w.stage.edge_count()
	for k: int in range(n):
		var s := sdist(w, k, p.x, p.z)
		var t := w.edge_type[k]
		var nx := w.stage.edge_nx[k]
		var nz := w.stage.edge_nz[k]
		if t == SE.EDGE_OPEN:
			if eligible:
				if s < 0:
					_ringout(w, i, k)
					return
			else:
				var margin := FP.from_str("0.05")
				if s < margin:
					p.x += FP.mul(nx, margin - s)
					p.z += FP.mul(nz, margin - s)
			continue
		if t == SE.EDGE_FENCE and eligible and p.y > w.stage.edge_height[k]:
			if s < 0:
				_ringout(w, i, k)
				return
			continue
		# 壁・柵・破壊壁
		if s < r:
			var toward := _speed_toward(p, nx, nz)
			if _wall_hit_eligible(p) and toward >= w.rules.wall_hit_speed and p.wall_hits < 1:
				if t == SE.EDGE_BREAKABLE:
					w.edge_hp[k] -= 1
					if w.edge_hp[k] <= 0:
						w.edge_type[k] = w.stage.edge_after[k]
						w.emit("wall_broken", {"edge": k, "player": i})
						continue
				_wall_hit(w, i, k)
			p.x += FP.mul(nx, r - s)
			p.z += FP.mul(nz, r - s)


## 壁へ向かう速度（Q16.16 m/F）
static func _speed_toward(p: FighterState, nx: int, nz: int) -> int:
	var vx := p.vx
	var vz := p.vz
	if p.state != SE.ST_AIR:
		vx = FP.mul(p.slide_x, p.slide)
		vz = FP.mul(p.slide_z, p.slide)
	return -(FP.mul(nx, vx) + FP.mul(nz, vz))


static func _wall_hit(w: SimWorld, i: int, k: int) -> void:
	var p := w.f[i]
	p.wall_hits += 1
	var splat := p.state == SE.ST_AIR
	var keep_y := p.y
	FighterCtl.set_state(p, SE.ST_WALL, 1 if splat else 0)
	p.stun = w.rules.wall_splat_frames if splat else w.rules.wall_stagger_frames
	p.y = mini(keep_y, FP.from_str("0.4")) if splat else 0
	p.vx = 0
	p.vz = 0
	p.vy = 0
	p.slide = 0
	# 壁を背にして相手を向く
	p.facing = FighterCtl.angle_to_opp(w, i)
	w.emit("wall_hit", {"player": i, "edge": k, "splat": splat})


static func _ringout(w: SimWorld, i: int, k: int) -> void:
	var p := w.f[i]
	var nx := w.stage.edge_nx[k]
	var nz := w.stage.edge_nz[k]
	var keep_vx := p.vx
	var keep_vz := p.vz
	if p.state != SE.ST_AIR:
		keep_vx = FP.mul(p.slide_x, p.slide)
		keep_vz = FP.mul(p.slide_z, p.slide)
	FighterCtl.set_state(p, SE.ST_RINGOUT, 0)
	var out := FP.from_str("0.035")
	p.vx = keep_vx - FP.mul(nx, out)
	p.vz = keep_vz - FP.mul(nz, out)
	p.vy = FP.from_str("0.04") if p.y <= 0 else p.vy
	p.gravity = w.rules.gravity
	w.emit("ringout", {"player": i, "edge": k})


## fighter idx の背後 within 以内に壁（柵・壁・破壊壁）があるか
static func back_to_wall(w: SimWorld, idx: int, within: int) -> bool:
	return _back_to(w, idx, within, true)


static func back_to_edge(w: SimWorld, idx: int, within: int) -> bool:
	return _back_to(w, idx, within, false)


static func _back_to(w: SimWorld, idx: int, within: int, walls_only: bool) -> bool:
	var p := w.f[idx]
	var fx := FP.sin(p.facing)
	var fz := FP.cos(p.facing)
	for k: int in range(w.stage.edge_count()):
		var t := w.edge_type[k]
		if walls_only and t == SE.EDGE_OPEN:
			continue
		var s := sdist(w, k, p.x, p.z)
		if s > within + w.chars[idx].push_radius:
			continue
		# 内向き法線と前方向が同じ向き = 背後に境界
		if FP.mul(w.stage.edge_nx[k], fx) + FP.mul(w.stage.edge_nz[k], fz) > FP.HALF:
			return true
	return false


## 点が open 辺の外にあるか（投げの判定用）
static func outside_open(w: SimWorld, x: int, z: int) -> int:
	for k: int in range(w.stage.edge_count()):
		if w.edge_type[k] == SE.EDGE_OPEN and sdist(w, k, x, z) < 0:
			return k
	return -1
