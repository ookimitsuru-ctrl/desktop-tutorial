class_name FighterCtl
extends RefCounted
## ファイターの入力解釈・状態遷移・移動。仕様: 02_combat_system.md §2.3〜2.5, §2.10

const EVADE_CURVE: Array[int] = [4, 8, 11, 12, 12, 11, 10, 9, 8, 7, 5, 3]
const MM_TO_FP := 65536

# ------------------------------------------------------------ 補助

static func mm_to_fp(mm: int) -> int:
	return (mm * MM_TO_FP) / 1000


static func set_state(p: FighterState, st: int, sub: int) -> void:
	p.state = st
	p.sub = sub
	p.sf = 0
	if st != SE.ST_MOVE:
		p.move = -1
		p.mf = 0
		p.chain_next = -1
		p.move_contact = SE.MC_NONE
		p.move_ch = 0


static func dist(w: SimWorld, i: int) -> int:
	var p := w.f[i]
	var o := w.opp(i)
	return FP.len2(o.x - p.x, o.z - p.z)


static func angle_to_opp(w: SimWorld, i: int) -> int:
	var p := w.f[i]
	var o := w.opp(i)
	return FP.atan2(o.x - p.x, o.z - p.z)


## キャラ空間 [右, 前] の移動（Q16.16）をワールドへ
static func move_local(p: FighterState, r: int, fw: int) -> void:
	var fx := FP.sin(p.facing)
	var fz := FP.cos(p.facing)
	p.x += FP.mul(-fz, r) + FP.mul(fx, fw)
	p.z += FP.mul(fx, r) + FP.mul(fz, fw)


static func is_free_facing(p: FighterState) -> bool:
	match p.state:
		SE.ST_STAND, SE.ST_CROUCH, SE.ST_CROUCH_IN, SE.ST_STAND_UP, SE.ST_WALK_F, SE.ST_WALK_B, \
		SE.ST_GUARD, SE.ST_BLOCKSTUN, SE.ST_DASH_F, SE.ST_DASH_B, SE.ST_RUN, SE.ST_RUN_STOP, \
		SE.ST_EVADE, SE.ST_STANCE, SE.ST_CLASH, SE.ST_WIN:
			return true
		SE.ST_GETUP, SE.ST_TECH:
			return p.sf > 6
	return false


static func is_settled(p: FighterState) -> bool:
	match p.state:
		SE.ST_STAND, SE.ST_CROUCH, SE.ST_WALK_F, SE.ST_WALK_B, SE.ST_GUARD, SE.ST_STAND_UP, SE.ST_CROUCH_IN, SE.ST_STANCE, SE.ST_BACKTURN:
			return true
	return false


static func is_neutral_state(st: int) -> bool:
	return st == SE.ST_STAND or st == SE.ST_CROUCH or st == SE.ST_CROUCH_IN or st == SE.ST_STAND_UP \
		or st == SE.ST_WALK_F or st == SE.ST_WALK_B or st == SE.ST_GUARD


static func held(p: FighterState, b: int) -> bool:
	return (InputBits.held(p.input_now) & b) != 0


static func pressed(p: FighterState, b: int) -> bool:
	return (InputBits.pressed(p.input_now) & b) != 0


static func any_pressed(p: FighterState) -> bool:
	return InputBits.pressed(p.input_now) != 0


static func dir_now(p: FighterState) -> int:
	return InputBits.dir(p.input_now)


static func dir_prev(p: FighterState) -> int:
	return InputBits.dir(p.h(1))


## 方向 dv が今フレームに入力され、window 内に「dv → 離す → dv」があるか
static func double_tap(p: FighterState, dv: int, window: int) -> bool:
	if InputBits.dir(p.h(0)) != dv or InputBits.dir(p.h(1)) == dv:
		return false
	var phase := 0
	for back: int in range(1, window + 1):
		var d := InputBits.dir(p.h(back))
		if phase == 0:
			if d != dv:
				phase = 1
		if phase == 1 and d == dv:
			return true
	return false


static func entered(p: FighterState, dv: int) -> bool:
	return InputBits.dir(p.h(0)) == dv and InputBits.dir(p.h(1)) != dv


# ------------------------------------------------------------ 時間切れ処理

static func complete_timers(w: SimWorld, i: int) -> void:
	var p := w.f[i]
	var cd := w.chars[i]
	# 立ち途中技の受付（しゃがみ系から 2 を離した）。文脈の計算より前に行う
	if InputBits.is_down(dir_prev(p)) and not InputBits.is_down(dir_now(p)):
		if p.state == SE.ST_CROUCH or p.state == SE.ST_CROUCH_IN or p.guard_crouch == 1 \
				or (p.state == SE.ST_MOVE and cd.moves[p.move].has_flag(SE.F_END_CROUCH)):
			p.rise_window = 8
	match p.state:
		SE.ST_MOVE:
			var m := cd.moves[p.move]
			if p.mf >= m.total():
				end_move(w, i)
		SE.ST_BLOCKSTUN:
			if p.stun <= 0:
				_to_neutral_after_stun(w, i)
		SE.ST_HITSTUN:
			if p.stun <= 0:
				if p.reaction == SE.R_TURN:
					set_state(p, SE.ST_BACKTURN, 0)
				else:
					_to_neutral_after_stun(w, i)
				_end_combo(w, i)
		SE.ST_STAGGER, SE.ST_PARRIED, SE.ST_CLASH:
			if p.stun <= 0:
				set_state(p, SE.ST_STAND, 0)
				_end_combo(w, i)
		SE.ST_CRUMPLE:
			if p.stun <= 0:
				_to_down(w, i, SE.DOWN_FACE, false)
		SE.ST_WALL:
			if p.stun <= 0:
				if p.sub == 1:
					_to_down(w, i, SE.DOWN_UP, false)
				else:
					set_state(p, SE.ST_STAND, 0)
					_end_combo(w, i)
		SE.ST_STAND_UP:
			if p.sf >= 4:
				set_state(p, SE.ST_STAND, 0)
		SE.ST_CROUCH_IN:
			if p.sf >= 3:
				var t2 := p.tap2_frame
				set_state(p, SE.ST_CROUCH, 0)
				p.tap2_frame = t2
		SE.ST_DASH_F:
			if p.sf >= cd.dash_f_frames:
				set_state(p, SE.ST_STAND, 0)
		SE.ST_DASH_B:
			if p.sf >= cd.dash_b_frames:
				set_state(p, SE.ST_STAND, 0)
		SE.ST_RUN_STOP:
			if p.sf >= 10:
				set_state(p, SE.ST_STAND, 0)
		SE.ST_EVADE:
			if p.sf >= p.evade_len:
				set_state(p, SE.ST_STAND, 0)
		SE.ST_GETUP:
			var gl := 26 if p.sub == SE.GU_INPLACE else 30
			if p.sf >= gl:
				set_state(p, SE.ST_STAND, 0)
				_end_combo(w, i)
		SE.ST_TECH:
			var tl := 22 if p.sub == SE.TECH_INPLACE else 26
			if p.sf >= tl:
				set_state(p, SE.ST_STAND, 0)
				_end_combo(w, i)
		SE.ST_TURN:
			if p.sf >= 8:
				set_state(p, SE.ST_STAND, 0)
		SE.ST_DOWN:
			if p.ko == 0 and p.sf >= w.rules.down_max and w.phase == SE.PH_FIGHT:
				set_state(p, SE.ST_GETUP, SE.GU_INPLACE)
		SE.ST_STANCE:
			if p.stance >= 0 and p.stance < cd.stance_max.size():
				var mx := cd.stance_max[p.stance]
				if mx > 0 and p.sf >= mx:
					p.stance = -1
					set_state(p, SE.ST_STAND, 0)


static func _to_neutral_after_stun(w: SimWorld, i: int) -> void:
	var p := w.f[i]
	var d := dir_now(p)
	var crouch := InputBits.is_down(d)
	if held(p, InputBits.G) and w.inputs_enabled():
		set_state(p, SE.ST_GUARD, 0)
		p.guard_crouch = 1 if crouch else 0
	elif crouch:
		set_state(p, SE.ST_CROUCH, 0)
	else:
		set_state(p, SE.ST_STAND, 0)
	p.throw_protect = w.rules.throw_protect


static func _end_combo(w: SimWorld, i: int) -> void:
	var p := w.f[i]
	if p.combo_hits > 1:
		w.emit("combo_end", {"player": 1 - i, "hits": p.combo_hits, "damage": p.combo_dmg})
	var o := w.opp(i)
	o.stat_max_combo = maxi(o.stat_max_combo, p.combo_dmg)
	p.combo_hits = 0
	p.combo_dmg = 0
	p.air_hits = 0
	p.wall_hits = 0


static func end_move(w: SimWorld, i: int) -> void:
	var p := w.f[i]
	var m := w.chars[i].moves[p.move]
	if m.end_stance >= 0:
		set_state(p, SE.ST_STANCE, m.end_stance)
		p.stance = m.end_stance
	elif m.has_flag(SE.F_END_BACKTURN):
		set_state(p, SE.ST_BACKTURN, 0)
	elif m.has_flag(SE.F_END_CROUCH) and InputBits.is_down(dir_now(p)):
		set_state(p, SE.ST_CROUCH, 0)
	elif m.has_flag(SE.F_END_CROUCH):
		set_state(p, SE.ST_STAND_UP, 0)
		p.rise_window = 8
	else:
		set_state(p, SE.ST_STAND, 0)


# ------------------------------------------------------------ 文脈

static func context(w: SimWorld, i: int) -> int:
	var p := w.f[i]
	var o := w.opp(i)
	var c := 0
	match p.state:
		SE.ST_STAND, SE.ST_WALK_F, SE.ST_WALK_B, SE.ST_STAND_UP:
			c = SE.FROM_STAND
		SE.ST_GUARD:
			c = SE.FROM_CROUCH if p.guard_crouch == 1 else SE.FROM_STAND
		SE.ST_CROUCH, SE.ST_CROUCH_IN:
			c = SE.FROM_CROUCH
		SE.ST_DASH_F:
			if p.sf >= 6:
				c = SE.FROM_DASH
			if p.sf >= 12:
				c |= SE.FROM_STAND
		SE.ST_DASH_B:
			if p.sf >= 12:
				c = SE.FROM_STAND
		SE.ST_RUN:
			c = SE.FROM_RUN
		SE.ST_EVADE:
			if p.sf >= w.rules.evade_attack_from and p.sf <= w.rules.evade_attack_to:
				c = SE.FROM_EVADE
		SE.ST_BACKTURN:
			c = SE.FROM_BACKTURN
		SE.ST_STANCE:
			c = SE.FROM_STANCE
		SE.ST_DOWN:
			if p.sf >= w.rules.down_min and p.ko == 0:
				c = SE.FROM_DOWN
		SE.ST_MOVE:
			c = 0
	if p.rise_window > 0 and (c & (SE.FROM_STAND | SE.FROM_CROUCH)) != 0:
		c |= SE.FROM_RISE
	if (c & (SE.FROM_STAND | SE.FROM_CROUCH)) != 0:
		var od := o.state == SE.ST_DOWN or (o.state == SE.ST_GETUP and o.sf <= 12) or (o.state == SE.ST_CRUMPLE and o.sf > 30)
		if od and dist(w, i) <= FP.from_int(2):
			c |= SE.FROM_OPP_DOWN
		if Ring.back_to_wall(w, 1 - i, FP.ONE) and dist(w, i) <= FP.from_str("1.2"):
			c |= SE.FROM_WALL
	return c


# ------------------------------------------------------------ 判断

static func decide(w: SimWorld, i: int, ctx: int) -> void:
	var p := w.f[i]
	var d := dir_now(p)
	var dp := dir_prev(p)
	if not w.inputs_enabled():
		_decide_idle(w, i)
		return
	match p.state:
		SE.ST_MOVE:
			_decide_move(w, i)
			return
		SE.ST_STAGGER:
			if any_pressed(p) or d != dp:
				if p.stun > p.stagger_min:
					p.stun -= 1
			return
		SE.ST_DOWN:
			_decide_down(w, i, ctx)
			return
		SE.ST_DASH_F:
			if ctx != 0 and _try_moves(w, i, ctx):
				return
			if p.sf >= 10 and held(p, InputBits.G):
				_guard(p, d)
				return
			if p.sf >= 14 and d == 6 and dist(w, i) >= FP.from_str("2.5"):
				set_state(p, SE.ST_RUN, 0)
				p.vx = 0
			return
		SE.ST_DASH_B:
			if p.sf >= 12:
				if _try_moves(w, i, ctx):
					return
				if held(p, InputBits.G):
					_guard(p, d)
			return
		SE.ST_EVADE:
			if ctx != 0 and _try_moves(w, i, ctx):
				return
			if p.sf >= w.rules.evade_guard_from and held(p, InputBits.G):
				_guard(p, d)
			return
		SE.ST_RUN:
			if _try_moves(w, i, ctx):
				return
			if d != 6 and d != 9 and d != 3 or held(p, InputBits.G) or dist(w, i) < FP.from_str("0.8"):
				set_state(p, SE.ST_RUN_STOP, 0)
			return
		SE.ST_BACKTURN:
			if _try_moves(w, i, ctx):
				p.facing = angle_to_opp(w, i)
				return
			if pressed(p, InputBits.G):
				set_state(p, SE.ST_TURN, 0)
			return
		SE.ST_STANCE:
			if _try_moves(w, i, ctx):
				return
			if pressed(p, InputBits.G):
				p.stance = -1
				set_state(p, SE.ST_STAND, 0)
			return
	if is_neutral_state(p.state):
		_neutral(w, i, ctx)


static func _decide_idle(w: SimWorld, i: int) -> void:
	var p := w.f[i]
	if p.state == SE.ST_GUARD or p.state == SE.ST_WALK_F or p.state == SE.ST_WALK_B:
		set_state(p, SE.ST_STAND, 0)
	elif p.state == SE.ST_CROUCH or p.state == SE.ST_CROUCH_IN:
		set_state(p, SE.ST_STAND_UP, 0)
	elif p.state == SE.ST_DOWN and p.ko == 0 and p.sf >= w.rules.down_min + 20:
		set_state(p, SE.ST_GETUP, SE.GU_INPLACE)


static func _guard(p: FighterState, d: int) -> void:
	if p.state != SE.ST_GUARD:
		set_state(p, SE.ST_GUARD, 0)
	p.guard_crouch = 1 if InputBits.is_down(d) else 0


static func _neutral(w: SimWorld, i: int, ctx: int) -> void:
	var p := w.f[i]
	var cd := w.chars[i]
	var d := dir_now(p)
	var dp := dir_prev(p)
	# 2 タップ → 手前回避（遡及変換）
	if (p.state == SE.ST_CROUCH_IN or p.state == SE.ST_CROUCH) and not InputBits.is_down(d):
		var age := w.frame - p.tap2_frame
		if age <= w.rules.crouch_tap_frames and age >= 1 and not _buttons_since(p, age):
			_start_evade(w, i, -1, age)
			return
	if _try_moves(w, i, ctx):
		return
	var g := held(p, InputBits.G)
	if d == 6 and double_tap(p, 6, w.rules.double_tap_window):
		set_state(p, SE.ST_DASH_F, 0)
		return
	if d == 4 and double_tap(p, 4, w.rules.double_tap_window):
		set_state(p, SE.ST_DASH_B, 0)
		return
	if d == 8 and dp != 8 and not g:
		_start_evade(w, i, 1, 0)
		return
	if g:
		_guard(p, d)
		return
	if InputBits.is_down(d):
		if p.state != SE.ST_CROUCH and p.state != SE.ST_CROUCH_IN:
			set_state(p, SE.ST_CROUCH_IN, 0)
			p.guard_crouch = 0
			if d == 2:
				p.tap2_frame = w.frame
		return
	if p.state == SE.ST_CROUCH or p.state == SE.ST_CROUCH_IN or (p.state == SE.ST_GUARD and p.guard_crouch == 1):
		set_state(p, SE.ST_STAND_UP, 0)
		p.guard_crouch = 0
		p.rise_window = 8
		return
	if p.state == SE.ST_STAND_UP:
		return
	if d == 6 or d == 9:
		if p.state != SE.ST_WALK_F:
			set_state(p, SE.ST_WALK_F, 0)
		return
	if d == 4 or d == 7:
		if p.state != SE.ST_WALK_B:
			set_state(p, SE.ST_WALK_B, 0)
		return
	if p.state != SE.ST_STAND:
		set_state(p, SE.ST_STAND, 0)
	p.guard_crouch = 0
	var _unused := cd


static func _buttons_since(p: FighterState, age: int) -> bool:
	for back: int in range(0, age + 1):
		if InputBits.pressed(p.h(back)) != 0:
			return true
	return false


static func _start_evade(w: SimWorld, i: int, dirv: int, elapsed: int) -> void:
	var p := w.f[i]
	set_state(p, SE.ST_EVADE, 0)
	p.evade_dir = dirv
	p.evade_len = w.chars[i].evade_total
	p.evade_success = 0
	p.guard_crouch = 0
	# 遡及変換の場合は経過分の移動も即座に行う
	for k: int in range(elapsed):
		p.sf += 1
		_evade_move(w, i)
	w.emit("evade", {"player": i, "dir": dirv})


static func _decide_down(w: SimWorld, i: int, ctx: int) -> void:
	var p := w.f[i]
	if p.ko != 0:
		return
	if p.tech_check > 0 and p.no_tech == 0 and pressed(p, InputBits.G):
		_start_tech(w, i, dir_now(p))
		return
	if p.sf < w.rules.down_min:
		return
	if _try_moves(w, i, ctx):
		return
	var d := dir_now(p)
	if pressed(p, InputBits.G) or pressed(p, InputBits.P):
		set_state(p, SE.ST_GETUP, SE.GU_INPLACE)
	elif entered(p, 8):
		set_state(p, SE.ST_GETUP, SE.GU_ROLL_L)
	elif entered(p, 2):
		set_state(p, SE.ST_GETUP, SE.GU_ROLL_R)
	elif entered(p, 4) and not Ring.back_to_edge(w, i, FP.from_str("1.3")):
		set_state(p, SE.ST_GETUP, SE.GU_ROLL_BACK)
	var _u := d


static func _start_tech(w: SimWorld, i: int, d: int) -> void:
	var p := w.f[i]
	var kind := SE.TECH_INPLACE
	if d == 8 or d == 7 or d == 9:
		kind = SE.TECH_L
	elif d == 2 or d == 1 or d == 3:
		kind = SE.TECH_R
	elif d == 4:
		kind = SE.TECH_BACK
	set_state(p, SE.ST_TECH, kind)
	p.invuln = w.rules.tech_invuln
	p.tech_check = 0
	p.y = 0
	w.emit("tech", {"player": i, "kind": kind})


static func _decide_move(w: SimWorld, i: int) -> void:
	var p := w.f[i]
	var cd := w.chars[i]
	var m := cd.moves[p.move]
	# 遡及同時押し（発生前の 3F 以内）
	if p.mf <= w.rules.simul_window + 1 and p.mf < m.startup and InputBits.pressed(p.input_now) != 0 and not m.chain_only:
		var up := _match(w, i, p.move_ctx, 0, m.cmd.buttons if m.cmd != null else 0)
		if up != null and up.index != m.index:
			var keep := p.mf
			start_move(w, i, up, p.move_ctx)
			p.mf = keep
			return
	# 溜め
	if m.charge_to >= 0 and p.mf == m.charge_at and held(p, m.charge_btn):
		var keep2 := p.mf
		start_move(w, i, cd.moves[m.charge_to], p.move_ctx)
		p.mf = keep2
		return
	# 連携の入力
	if p.chain_next < 0 and InputBits.pressed(p.input_now) != 0:
		var d := dir_now(p)
		for k: int in range(m.chain_to.size()):
			if p.mf < m.chain_from[k] or p.mf > m.chain_to_f[k]:
				continue
			var cond := m.chain_cond[k]
			if cond == SE.CH_HIT and p.move_contact != SE.MC_HIT:
				continue
			if cond == SE.CH_CONTACT and p.move_contact != SE.MC_HIT and p.move_contact != SE.MC_BLOCK:
				continue
			var need := m.chain_btn[k]
			if (InputBits.pressed(p.input_now) & need) != need:
				continue
			var cdir := m.chain_dir[k]
			if cdir != 0 and not CommandSpec.dir_matches(cdir, d):
				continue
			var target := m.chain_to[k]
			if m.chain_just[k] > 0 and p.mf == m.chain_just[k] and m.chain_just_to[k] >= 0:
				target = m.chain_just_to[k]
				w.emit("just_frame", {"player": i})
			p.chain_next = target
			p.chain_at = maxi(m.chain_at[k], p.mf)
			p.consumed = w.frame
			break
	if p.chain_next >= 0 and p.mf >= p.chain_at:
		var nm := cd.moves[p.chain_next]
		start_move(w, i, nm, p.move_ctx)


## 先行入力を含めて技を探し、見つかれば開始する
static func _try_moves(w: SimWorld, i: int, ctx: int) -> bool:
	if ctx == 0:
		return false
	var p := w.f[i]
	for back: int in range(0, w.rules.buffer_frames + 1):
		if w.frame - back <= p.consumed:
			break
		var e := p.h(back)
		if back > 0 and InputBits.pressed(e) == 0:
			continue
		var m := _match(w, i, ctx, back, 0)
		if m != null:
			p.consumed = w.frame
			if m.end_stance >= 0 and m.level == SE.LV_NONE and p.state == SE.ST_STANCE:
				pass
			start_move(w, i, m, ctx)
			return true
	return false


## 文脈 ctx・back フレーム前の入力で成立する最優先の技。superset > 0 なら、そのボタンを含みより多いボタンの技のみ
static func _match(w: SimWorld, i: int, ctx: int, back: int, superset: int) -> MoveDef:
	var p := w.f[i]
	var cd := w.chars[i]
	var best: MoveDef = null
	var best_score := -1
	var d := InputBits.dir(p.h(back))
	for m: MoveDef in cd.cmd_moves:
		if m.chain_only or m.cmd == null:
			continue
		if (m.from_mask & ctx) == 0:
			continue
		if (m.from_mask & SE.FROM_STANCE) != 0 and (ctx & SE.FROM_STANCE) != 0:
			if m.stance_from != p.stance:
				continue
		if (m.from_mask & SE.FROM_WALL) != 0 and (ctx & SE.FROM_WALL) == 0:
			continue
		if superset != 0:
			if (m.cmd.buttons & superset) != superset or m.cmd.buttons == superset:
				continue
		var score := m.priority
		if (m.from_mask & ctx & SE.FROM_OPP_DOWN) != 0:
			score += 1000
		if (m.from_mask & ctx & SE.FROM_WALL) != 0:
			score += 800
		if (m.from_mask & ctx & (SE.FROM_RISE | SE.FROM_DASH)) != 0:
			score += 500
		if score + 10 <= best_score:
			continue
		if not _spec_matches(w, p, m.cmd, back):
			continue
		score += CommandSpec.dir_score(m.cmd.dir, d)
		if score > best_score:
			best_score = score
			best = m
	return best


static func _spec_matches(w: SimWorld, p: FighterState, c: CommandSpec, back: int) -> bool:
	var e := p.h(back)
	if c.buttons != 0:
		var pn := InputBits.pressed(e)
		if (pn & c.buttons) == 0:
			return false
		var acc := 0
		for k: int in range(0, w.rules.simul_window + 1):
			acc |= InputBits.pressed(p.h(back + k))
		if (acc & c.buttons) != c.buttons:
			return false
		# 指定外のボタンが同時に押されていたら不成立（P+K を押して P が出ないように）
		if (pn & ~c.buttons) != 0:
			return false
	var d := InputBits.dir(e)
	if c.motion.size() == 0:
		return CommandSpec.dir_matches(c.dir, d)
	var n := c.motion.size()
	var window := w.rules.motion_window_2 if n <= 2 else w.rules.motion_window_3
	if c.buttons == 0:
		# モーションのみ: 最後の方向がこのフレームで入力された
		if d != c.motion[n - 1] or InputBits.dir(p.h(back + 1)) == d:
			return false
		var k := n - 2
		for b: int in range(back + 1, back + window + 1):
			if k < 0:
				break
			if InputBits.dir(p.h(b)) == c.motion[k]:
				k -= 1
		return k < 0
	# ボタン付き: 最後の方向がボタン押下の button_after_motion 以内
	var idx := n - 1
	var last_found := -1
	for b: int in range(back, back + w.rules.button_after_motion + 1):
		if InputBits.dir(p.h(b)) == c.motion[idx]:
			last_found = b
			break
	if last_found < 0:
		return false
	idx -= 1
	for b: int in range(last_found + 1, last_found + window + 1):
		if idx < 0:
			break
		if InputBits.dir(p.h(b)) == c.motion[idx]:
			idx -= 1
	return idx < 0


static func start_move(w: SimWorld, i: int, m: MoveDef, ctx: int) -> void:
	var p := w.f[i]
	set_state(p, SE.ST_MOVE, 0)
	p.move = m.index
	p.mf = 0
	p.move_ctx = ctx
	p.move_contact = SE.MC_NONE
	p.move_ch = 0
	p.chain_next = -1
	p.move_start_frame = w.frame
	p.guard_crouch = 0
	if (ctx & SE.FROM_RISE) != 0 and (m.from_mask & SE.FROM_RISE) != 0:
		p.rise_window = 0
	if (ctx & SE.FROM_BACKTURN) != 0:
		p.facing = angle_to_opp(w, i)
	if p.state != SE.ST_STANCE and m.end_stance < 0:
		p.stance = p.stance if (m.from_mask & SE.FROM_STANCE) != 0 else -1
	w.emit("move", {"player": i, "move": m.index, "id": m.id})


# ------------------------------------------------------------ 進行

static func during_hitstop(w: SimWorld, i: int) -> void:
	var p := w.f[i]
	if p.state == SE.ST_STAGGER and (any_pressed(p) or dir_now(p) != dir_prev(p)):
		if p.stun > p.stagger_min:
			p.stun -= 1


static func advance(w: SimWorld, i: int) -> void:
	var p := w.f[i]
	var cd := w.chars[i]
	p.sf += 1
	if p.rise_window > 0:
		p.rise_window -= 1
	if p.throw_protect > 0:
		p.throw_protect -= 1
	if p.invuln > 0:
		p.invuln -= 1
	if p.tech_check > 0 and p.state == SE.ST_DOWN:
		p.tech_check -= 1
	match p.state:
		SE.ST_MOVE:
			var m := cd.moves[p.move]
			p.mf += 1
			_apply_motion(w, i, m.anim_index, p.mf)
			if p.mf <= m.track_until:
				_track(w, i, w.rules.tracking_rate_deg if m.tracking == SE.TRK_LINEAR else w.rules.tracking_rate_deg * 3)
		SE.ST_WALK_F:
			var sp := FP.scale(cd.walk_f, mini(p.sf, 4), 4)
			move_local(p, 0, sp)
		SE.ST_WALK_B:
			var sb := FP.scale(cd.walk_b, mini(p.sf, 4), 4)
			move_local(p, 0, -sb)
		SE.ST_DASH_F:
			move_local(p, 0, _curve_step(cd.dash_f_dist, cd.dash_f_frames, p.sf))
		SE.ST_DASH_B:
			move_local(p, 0, -_curve_step(cd.dash_b_dist, cd.dash_b_frames, p.sf))
		SE.ST_RUN:
			var rs := mini(cd.run_max, cd.dash_f_dist / cd.dash_f_frames + FP.scale(cd.run_max, p.sf, 20))
			move_local(p, 0, rs)
		SE.ST_RUN_STOP:
			move_local(p, 0, FP.scale(cd.run_max, maxi(0, 10 - p.sf), 30))
		SE.ST_EVADE:
			_evade_move(w, i)
		SE.ST_BLOCKSTUN, SE.ST_HITSTUN, SE.ST_STAGGER, SE.ST_PARRIED, SE.ST_CLASH, SE.ST_CRUMPLE:
			p.stun -= 1
			_slide(p)
		SE.ST_WALL:
			p.stun -= 1
		SE.ST_AIR, SE.ST_RINGOUT, SE.ST_KO:
			_air(w, i)
		SE.ST_GETUP:
			_getup_move(w, i)
		SE.ST_TECH:
			_tech_move(w, i)
		SE.ST_BACKTURN:
			p.facing = FP.ang(angle_to_opp(w, i) + FP.ANG_HALF)
		SE.ST_DOWN:
			_slide(p)


static func _slide(p: FighterState) -> void:
	if p.slide <= 0:
		return
	p.x += FP.mul(p.slide_x, p.slide)
	p.z += FP.mul(p.slide_z, p.slide)
	p.slide = (p.slide * 3) / 4
	if p.slide < 64:
		p.slide = 0


## 押し戻しを設定（from_x/z の方向から押される）
static func set_slide(p: FighterState, dir_x: int, dir_z: int, dist_fp: int) -> void:
	var l := FP.len2(dir_x, dir_z)
	if l <= 0:
		return
	p.slide_x = (dir_x << 16) / l
	p.slide_z = (dir_z << 16) / l
	p.slide = dist_fp / 4


## 台形の速度カーブで総距離 total を frames に分配した、f フレーム目の移動量
static func _curve_step(total: int, frames: int, f: int) -> int:
	if f < 1 or f > frames:
		return 0
	var s := 0
	var cum_prev := 0
	var cum := 0
	for k: int in range(1, frames + 1):
		s += _cw(k, frames)
	for k: int in range(1, f + 1):
		cum_prev = cum
		cum += _cw(k, frames)
	return (total * cum) / s - (total * cum_prev) / s


static func _cw(k: int, n: int) -> int:
	return mini(mini(k * 2, 6), n - k + 1)


static func _evade_move(w: SimWorld, i: int) -> void:
	var p := w.f[i]
	if p.sf < 1 or p.sf > EVADE_CURVE.size():
		return
	var dd := (w.rules.evade_distance * EVADE_CURVE[p.sf - 1]) / 100
	# 奥(+1) = カメラから遠ざかる = -cam、手前(-1) = +cam
	var sx := -w.cam_x if p.evade_dir > 0 else w.cam_x
	var sz := -w.cam_z if p.evade_dir > 0 else w.cam_z
	p.x += FP.mul(sx, dd)
	p.z += FP.mul(sz, dd)


static func _getup_move(w: SimWorld, i: int) -> void:
	var p := w.f[i]
	if p.sub == SE.GU_INPLACE:
		return
	if p.sf < 4 or p.sf > 20:
		return
	if p.sub == SE.GU_ROLL_BACK:
		move_local(p, 0, -FP.from_str("1.2") / 17)
		return
	var dd := FP.from_str("0.8") / 17
	var sx := -w.cam_x if p.sub == SE.GU_ROLL_L else w.cam_x
	var sz := -w.cam_z if p.sub == SE.GU_ROLL_L else w.cam_z
	p.x += FP.mul(sx, dd)
	p.z += FP.mul(sz, dd)


static func _tech_move(w: SimWorld, i: int) -> void:
	var p := w.f[i]
	if p.sub == SE.TECH_INPLACE or p.sf < 2 or p.sf > 15:
		return
	if p.sub == SE.TECH_BACK:
		move_local(p, 0, -FP.ONE / 14)
		return
	var dd := FP.from_str("0.8") / 14
	var sx := -w.cam_x if p.sub == SE.TECH_L else w.cam_x
	var sz := -w.cam_z if p.sub == SE.TECH_L else w.cam_z
	p.x += FP.mul(sx, dd)
	p.z += FP.mul(sz, dd)


static func _apply_motion(w: SimWorld, i: int, anim: int, frame: int) -> void:
	var bk := w.chars[i].baked
	if bk == null:
		return
	var o := bk.motion_at(anim, frame)
	if o < 0:
		return
	var r := bk.motion[o]
	var fw := bk.motion[o + 1]
	if r == 0 and fw == 0:
		return
	move_local(w.f[i], mm_to_fp(r), mm_to_fp(fw))


static func _track(w: SimWorld, i: int, rate_deg: int) -> void:
	var p := w.f[i]
	var target := angle_to_opp(w, i)
	var diff := FP.ang_diff(target, p.facing)
	var lim := FP.deg(rate_deg)
	diff = clampi(diff, -lim, lim)
	p.facing = FP.ang(p.facing + diff)


static func _air(w: SimWorld, i: int) -> void:
	var p := w.f[i]
	p.vy -= p.gravity
	p.y += p.vy
	p.x += p.vx
	p.z += p.vz
	if p.state == SE.ST_RINGOUT:
		if p.y < FP.from_int(-6):
			p.y = FP.from_int(-6)
			p.vy = 0
			p.vx = 0
			p.vz = 0
		return
	if p.y <= 0 and p.vy < 0:
		land(w, i)


static func land(w: SimWorld, i: int) -> void:
	var p := w.f[i]
	p.y = 0
	p.vy = 0
	p.vx = 0
	p.vz = 0
	var orient := SE.DOWN_FACE if p.last_air_kind == SE.AIR_SPIN else SE.DOWN_UP
	w.emit("landed", {"player": i, "heavy": p.air_hits > 0})
	if p.ko == 0 and p.no_tech == 0 and w.inputs_enabled():
		for back: int in range(0, w.rules.tech_before + 1):
			if (InputBits.pressed(p.h(back)) & InputBits.G) != 0:
				_start_tech(w, i, InputBits.dir(p.h(back)))
				return
	_to_down(w, i, orient, true)


static func _to_down(w: SimWorld, i: int, orient: int, allow_tech: bool) -> void:
	var p := w.f[i]
	var nt := p.no_tech
	set_state(p, SE.ST_DOWN, orient)
	p.y = 0
	p.tech_check = w.rules.tech_after if allow_tech and nt == 0 else 0
	p.no_tech = 0


## 空中状態にする
static func to_air(w: SimWorld, i: int, kind: int, vy: int, push_x: int, push_z: int) -> void:
	var p := w.f[i]
	var cd := w.chars[i]
	set_state(p, SE.ST_AIR, kind)
	p.last_air_kind = kind
	p.vy = vy
	p.vx = push_x
	p.vz = push_z
	p.gravity = FP.mul(w.rules.gravity, cd.float_factor)
	if p.y <= 0:
		p.y = 1
