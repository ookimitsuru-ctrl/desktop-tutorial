class_name AIController
extends RefCounted
## CPU の思考。人間と同じ入力（InputBits）だけを出し、反応時間の制約を守る（入力読みはしない）。
## 仕様: 07_cpu_ai.md

const N := 5

var w: SimWorld
var me := 1
var level := 4
var boss := false
var cd: CharDef
var od: CharDef
var rng := 1
# 難易度パラメータ
var reaction := 19
var guard_acc := 0.65
var punish_rate := 0.55
var escape_rate := 0.3
var evade_use := 0.2
var combo_rate := 0.8
var aggression := 0.5
var learn := 0.2
var mistake := 0.0
# 観測履歴（相手の状態: [state, move, mf]）
var obs: Array = []
# 実行中の入力計画（自分基準の入力 u16）
var plan: Array[int] = []
var hold_dir := 5
var hold_btn := 0
var hold_frames := 0
var think_cd := 0
var last_btn := 0
# 技の分類
var pokes: Array[MoveDef] = []
var mids: Array[MoveDef] = []
var lows: Array[MoveDef] = []
var launchers: Array[MoveDef] = []
var heavies: Array[MoveDef] = []
var throws: Array[MoveDef] = []
var low_throws: Array[MoveDef] = []
var jab: MoveDef = null
var down_attacks: Array[MoveDef] = []
var plus_moves: Array[MoveDef] = []
var stance_entries: Array[MoveDef] = []   # 構えに入る技
var steps: Array[MoveDef] = []            # 移動技（進歩など）
var parries: Array[MoveDef] = []          # 当て身・トラップ
# 連携・連続投げの判断（技ごとに 1 回）
var _chain_start := -1
var _chain_k := -1
var _chain_mf := 0
var _throw_seen := -1
# コンボ（combos.json）: 始動技 id → コンボの配列
var combos: Dictionary = {}
var runner: ComboRunner = null
# 適応学習（相手の傾向: 指数移動平均）
var tend := {"crouch": 0.3, "attack_after_block": 0.4, "throw_n": 0.34, "throw_4": 0.33, "throw_6": 0.33, "evade": 0.1, "tech": 0.5}
var _prev_opp_state := -1
var _prev_my_state := -1


func setup(p_w: SimWorld, p_me: int, p_level: int, p_boss: bool) -> void:
	w = p_w
	me = p_me
	level = clampi(p_level, 1, 9)
	boss = p_boss
	if boss:
		level = 9
	cd = w.chars[me]
	od = w.chars[1 - me]
	rng = SimRng.seed_state(w.rng ^ (0x5151 + me * 7919))
	var tbl := [
		[30, 0.30, 0.10, 0.05, 0.00, 0.50, 0.30, 0.0, 0.25],
		[26, 0.45, 0.25, 0.10, 0.03, 0.60, 0.35, 0.0, 0.18],
		[22, 0.55, 0.40, 0.20, 0.06, 0.70, 0.45, 0.0, 0.12],
		[19, 0.65, 0.55, 0.30, 0.10, 0.80, 0.50, 0.2, 0.06],
		[16, 0.75, 0.70, 0.40, 0.14, 0.88, 0.55, 0.2, 0.04],
		[14, 0.82, 0.82, 0.50, 0.18, 0.93, 0.62, 0.5, 0.02],
		[12, 0.88, 0.90, 0.60, 0.20, 0.97, 0.66, 0.5, 0.01],
		[10, 0.93, 0.97, 0.70, 0.22, 0.99, 0.70, 0.8, 0.0],
		[9, 0.95, 1.00, 0.75, 0.24, 1.00, 0.78, 1.0, 0.0],
	]
	var t: Array = tbl[level - 1]
	reaction = int(t[0])
	guard_acc = float(t[1])
	punish_rate = float(t[2])
	escape_rate = float(t[3])
	evade_use = float(t[4])
	combo_rate = float(t[5])
	aggression = float(t[6])
	learn = float(t[7])
	mistake = float(t[8])
	_classify()
	_load_combos()


func _load_combos() -> void:
	var path := "res://data/characters/%s/combos.json" % cd.id
	if not FileAccess.file_exists(path):
		return
	var j: Variant = DataLoader.read_json(path)
	if not (j is Dictionary):
		return
	var wc := ["light", "middle", "heavy"][clampi(od.weight_class, 0, 2)] as String
	for c: Dictionary in (j as Dictionary).get("combos", []):
		if not (c.get("weight_classes", []) as Array).has(wc):
			continue
		var st := String(c["starter"])
		if not combos.has(st):
			combos[st] = []
		(combos[st] as Array).append(c)


func _classify() -> void:
	for m: MoveDef in cd.moves:
		if m.chain_only or m.cmd == null:
			continue
		var stand := (m.from_mask & SE.FROM_STAND) != 0
		if (m.from_mask & SE.FROM_OPP_DOWN) != 0 and m.level == SE.LV_DOWN:
			down_attacks.append(m)
			continue
		if not stand:
			continue
		if m.level == SE.LV_NONE:
			if m.end_stance >= 0:
				stance_entries.append(m)
			elif m.chain_to.size() > 0:
				steps.append(m)
			continue
		if m.is_parry():
			parries.append(m)
			continue
		if m.is_throw:
			if m.level == SE.LV_LTHROW:
				low_throws.append(m)
			elif not m.throw_vs_down and (m.from_mask & SE.FROM_WALL) == 0:
				throws.append(m)
			continue
		if not m.is_strike():
			continue
		if m.hit_reaction == SE.R_LAUNCH:
			launchers.append(m)
		if m.level == SE.LV_LOW:
			lows.append(m)
		elif m.level == SE.LV_MID or m.level == SE.LV_SMID:
			mids.append(m)
		if m.startup <= 15 and m.hit_reaction != SE.R_LAUNCH:
			pokes.append(m)
		if SE.is_air_reaction(m.hit_reaction) or m.hit_reaction == SE.R_CRUMPLE:
			heavies.append(m)
		if m.adv_block >= 0 and m.level != SE.LV_LOW:
			plus_moves.append(m)
		if m.cmd.buttons == InputBits.P and m.cmd.dir == 0 and m.cmd.motion.size() == 0:
			jab = m
	# 立ち途中・しゃがみからの浮かせ（確定反撃用）も
	for m2: MoveDef in cd.moves:
		if (m2.from_mask & SE.FROM_RISE) != 0 and m2.hit_reaction == SE.R_LAUNCH and not launchers.has(m2):
			launchers.append(m2)


func _rand() -> float:
	rng = SimRng.next(rng)
	return float((rng >> 8) & 0xFFFF) / 65536.0


func _pick(arr: Array) -> Variant:
	if arr.is_empty():
		return null
	rng = SimRng.next(rng)
	return arr[(rng >> 8) % arr.size()]


func _dist() -> float:
	var a := w.f[me]
	var b := w.f[1 - me]
	return Vector2((a.x - b.x) / 65536.0, (a.z - b.z) / 65536.0).length()


## 自分基準の方向を画面基準へ
func _to_screen(v: int) -> int:
	if w._on_screen_left(me):
		return v
	return InputBits.with_dir(v, InputBits.mirror_dir(InputBits.dir(v)))


func _observe() -> void:
	var o := w.f[1 - me]
	obs.push_front([o.state, o.move, o.mf, o.sf])
	if obs.size() > 40:
		obs.pop_back()
	# 傾向の学習
	if _prev_opp_state != o.state:
		if o.state == SE.ST_CROUCH or (o.state == SE.ST_GUARD and o.guard_crouch == 1):
			_learn("crouch", 1.0)
		elif o.state == SE.ST_GUARD:
			_learn("crouch", 0.0)
		if _prev_opp_state == SE.ST_BLOCKSTUN:
			_learn("attack_after_block", 1.0 if o.state == SE.ST_MOVE else 0.0)
		if o.state == SE.ST_EVADE:
			_learn("evade", 1.0)
		if o.state == SE.ST_TECH:
			_learn("tech", 1.0)
		elif _prev_opp_state == SE.ST_AIR and o.state == SE.ST_DOWN:
			_learn("tech", 0.0)
	if o.state == SE.ST_THROWING and o.throw_frame == 1:
		var tm := od.moves[o.throw_move]
		match tm.throw_escape:
			SE.ESC_N:
				_learn3("throw_n")
			SE.ESC_BACK:
				_learn3("throw_4")
			SE.ESC_FWD:
				_learn3("throw_6")
	_prev_opp_state = o.state


func _learn(k: String, v: float) -> void:
	tend[k] = float(tend[k]) * 0.92 + v * 0.08


func _learn3(k: String) -> void:
	for kk: String in ["throw_n", "throw_4", "throw_6"]:
		tend[kk] = float(tend[kk]) * 0.85 + (0.15 if kk == k else 0.0)


## 1 フレーム分の入力（画面基準）
func next_input(p_w: SimWorld) -> int:
	w = p_w
	_observe()
	var p := w.f[me]
	if not w.inputs_enabled():
		plan.clear()
		hold_dir = N
		hold_btn = 0
		return _emit(InputBits.make(N, 0, 0, 0))
	# コンボ実行中
	if runner != null:
		runner.observe(w.events)
		if runner.done:
			runner = null
		else:
			plan.clear()
			return _emit_raw(_to_screen(runner.next_input()))
	if not plan.is_empty():
		var v: int = plan.pop_front()
		return _emit(_to_screen(v))
	_think(p)
	if not plan.is_empty():
		var v2: int = plan.pop_front()
		return _emit(_to_screen(v2))
	return _emit(_to_screen(InputBits.make(hold_dir, hold_btn, 0, 0)))


## ComboRunner が整えた入力をそのまま出す（押下状態だけ同期）
func _emit_raw(v: int) -> int:
	last_btn = InputBits.held(v)
	return v


## held のビットから pressed/released を整える
func _emit(v: int) -> int:
	var held := InputBits.held(v)
	var pr := InputBits.pressed(v) | (held & ~last_btn)
	var rl := last_btn & ~held
	last_btn = held
	return InputBits.make(InputBits.dir(v), held, pr, rl)


func _press(dirv: int, btn: int, hold: int = 1) -> void:
	for k: int in range(hold):
		plan.append(InputBits.make(dirv, btn, btn if k == 0 else 0, 0))
	plan.append(InputBits.make(N, 0, 0, btn))


func _do_move(m: MoveDef, ctx: String = "stand") -> void:
	if m == null or m.cmd == null:
		return
	var c := m.cmd
	if ctx == "rise":
		for _k: int in range(3):
			plan.append(InputBits.make(2, 0, 0, 0))
	for d: int in c.motion:
		plan.append(InputBits.make(d, 0, 0, 0))
	var dd := N
	if c.motion.size() > 0:
		dd = c.motion[c.motion.size() - 1]
	if c.dir != 0:
		dd = c.dir
	# ミス（低レベル）: たまに方向を外す
	if _rand() < mistake * 0.5:
		dd = N
	_press(dd, c.buttons, 6 if m.charge_to >= 0 and _rand() < 0.3 else 1)


func _think(p: FighterState) -> void:
	var o := w.f[1 - me]
	hold_btn = 0
	# 被投げ: 抜け
	if p.state == SE.ST_THROWN:
		var o0 := w.f[1 - me]
		if o0.throw_move >= 0 and od.moves[o0.throw_move].throw_mash > 0:
			# レバガチャ（首相撲）
			if _rand() < 0.25 + level * 0.07:
				plan.append(InputBits.make([4, 6, 2, 8][int(_rand() * 4.0) % 4], InputBits.P, InputBits.P, 0))
				plan.append(InputBits.make(N, 0, 0, InputBits.P))
			return
		if p.sf <= 2 and _rand() < escape_rate:
			var r := _rand()
			var dirv := N
			if r < float(tend["throw_4"]) * learn + (1.0 - learn) * 0.33:
				dirv = 4
			elif r < (float(tend["throw_4"]) + float(tend["throw_6"])) * learn + (1.0 - learn) * 0.66:
				dirv = 6
			_press(dirv, InputBits.P | InputBits.G)
		return
	if p.state == SE.ST_THROWING:
		_think_throw(p)
		return
	if p.state == SE.ST_MOVE:
		if _try_combo(p):
			return
		_think_chain(p)
		return
	if p.state == SE.ST_STANCE:
		_think_stance(p)
		return
	if p.state == SE.ST_STAGGER:
		if _rand() < 0.2 + level * 0.08:
			plan.append(InputBits.make([4, 6, 2, 8][int(_rand() * 4.0) % 4], InputBits.P, InputBits.P, 0))
			plan.append(InputBits.make(N, 0, 0, InputBits.P))
		return
	if p.state == SE.ST_AIR:
		# 受け身: 着地直前に G
		if p.vy < 0 and p.y < FP.from_str("0.25") and level >= 3 and p.no_tech == 0:
			if _rand() < 0.4 + level * 0.07:
				var dd := [N, 8, 2, 4][int(_rand() * 4.0) % 4] as int
				_press(dd, InputBits.G)
		return
	if p.state == SE.ST_DOWN:
		if p.sf >= w.rules.down_min + (int(_rand() * 20.0) if level < 5 else 0):
			var r2 := _rand()
			if r2 < 0.35:
				_press(N, InputBits.G)
			elif r2 < 0.6:
				_press(8 if _rand() < 0.5 else 2, 0)
			elif r2 < 0.75 and level >= 4:
				_press(N, InputBits.K)
			elif r2 < 0.85 and level >= 4:
				_press(2, InputBits.K)
			else:
				_press(4, 0)
		return
	# 相手の攻撃を（反応時間後に）知覚
	var seen: Array = obs[mini(reaction, obs.size() - 1)]
	var seen_state := int(seen[0])
	var seen_move := int(seen[1])
	var seen_mf := int(seen[2])
	var actionable := FighterCtl.is_neutral_state(p.state) or p.state == SE.ST_BLOCKSTUN
	if seen_state == SE.ST_MOVE and seen_move >= 0 and actionable:
		var om := od.moves[seen_move]
		var now_mf := seen_mf + reaction
		if om.is_strike() and now_mf <= om.active_end() + 1:
			_defend(om)
			return
	# ガード中・ガード直後: 確定反撃
	if p.state == SE.ST_BLOCKSTUN:
		hold_btn = InputBits.G
		if o.state == SE.ST_MOVE:
			var om2 := od.moves[o.move]
			var remain := om2.total() - o.mf
			var my_free := p.stun
			var window := remain - my_free
			if window >= 10 and _rand() < punish_rate:
				var pm := _best_punish(window)
				if pm != null:
					_do_move(pm, "rise" if (pm.from_mask & SE.FROM_RISE) != 0 and (pm.from_mask & SE.FROM_STAND) == 0 else "stand")
		return
	# 相手の空振り・大きな硬直への反撃（見てから）
	if seen_state == SE.ST_MOVE and seen_move >= 0 and actionable and o.state == SE.ST_MOVE:
		var om3 := od.moves[o.move]
		if o.mf > om3.active_end() and om3.total() - o.mf >= 12 and _rand() < punish_rate * 0.6:
			var pm2 := _best_punish(om3.total() - o.mf)
			if pm2 != null and _dist() < 1.6:
				_do_move(pm2)
				return
	if not FighterCtl.is_neutral_state(p.state) and p.state != SE.ST_DASH_F:
		return
	# 浮いている相手へ追撃
	if o.state == SE.ST_AIR and o.air_hits < 5 and _dist() < 1.6:
		if _rand() < combo_rate:
			var jm: MoveDef = _pick(pokes)
			if jm != null:
				_do_move(jm)
				return
	# 倒れている相手
	if o.state == SE.ST_DOWN and o.ko == 0:
		if not down_attacks.is_empty() and _rand() < 0.25 and _dist() < 1.7:
			_do_move(_pick(down_attacks))
			return
		_walk(6, 4)
		return
	if think_cd > 0:
		think_cd -= 1
		return
	think_cd = int(2 + _rand() * (10 - level))
	_neutral(p, o)


func _defend(om: MoveDef) -> void:
	var correct := _rand() < guard_acc
	# 当て身・トラップ（読み切ったとき、上位レベルほど使う）
	if correct and level >= 4 and _rand() < 0.08 * (level - 3) and w.f[me].state != SE.ST_BLOCKSTUN:
		for pm: MoveDef in parries:
			if (pm.parry_levels & (1 << om.level)) != 0 and (pm.parry_limbs & (1 << om.limb)) != 0:
				_do_move(pm)
				return
	var crouch := om.level == SE.LV_LOW
	if not correct:
		crouch = _rand() < float(tend["crouch"]) if learn > 0 else _rand() < 0.4
	# 直線技は回避も選ぶ
	if om.tracking == SE.TRK_LINEAR and _rand() < evade_use and w.f[me].state != SE.ST_BLOCKSTUN:
		_press(8 if _rand() < 0.5 else 2, 0)
		return
	hold_btn = InputBits.G
	hold_dir = 2 if crouch else N
	for _k: int in range(6):
		plan.append(InputBits.make(hold_dir, InputBits.G, 0, 0))


func _best_punish(window: int) -> MoveDef:
	var best: MoveDef = null
	var best_score := -1.0
	var d := _dist()
	for m: MoveDef in launchers + heavies + pokes:
		if m.startup > window or m.startup < 8:
			continue
		var reach := m.reach * 0.0000153 + 0.3
		if reach < d - 0.1:
			continue
		var score := float(m.damage) + (150.0 if m.hit_reaction == SE.R_LAUNCH else 0.0)
		if score > best_score:
			best_score = score
			best = m
	return best


func _walk(dirv: int, frames: int) -> void:
	for _k: int in range(frames):
		plan.append(InputBits.make(dirv, 0, 0, 0))


func _neutral(p: FighterState, o: FighterState) -> void:
	var d := _dist()
	var hp_lead := float(p.hp - o.hp) / 1000.0
	var agg := aggression + (0.15 if hp_lead < -0.2 else 0.0) - (0.1 if hp_lead > 0.3 else 0.0)
	if d > 2.4:
		# 遠距離: 接近
		var r := _rand()
		if r < 0.45 * agg + 0.15:
			plan.append_array([InputBits.make(6, 0, 0, 0), InputBits.make(N, 0, 0, 0), InputBits.make(6, 0, 0, 0)])
			_walk(6, 6)
		elif r < 0.7:
			_walk(6, 10 + int(_rand() * 12.0))
		else:
			_walk(N, 8)
		return
	if d > 1.35:
		# 中距離: 差し込み・様子見・間合い調整
		var r2 := _rand()
		if not steps.is_empty() and r2 < 0.12 * agg + 0.04:
			_do_move(_pick(steps))
			return
		if not stance_entries.is_empty() and r2 > 0.92:
			_do_move(_pick(stance_entries))
			return
		var reach_moves: Array[MoveDef] = []
		for m: MoveDef in mids + lows + heavies:
			if m.reach * 0.0000153 + 0.25 >= d:
				reach_moves.append(m)
		if r2 < 0.35 * agg and not reach_moves.is_empty():
			_do_move(_pick(reach_moves))
		elif r2 < 0.65:
			_walk(6, 8 + int(_rand() * 8.0))
		elif r2 < 0.8 and level >= 3:
			_press(8 if _rand() < 0.5 else 2, 0)
		elif r2 < 0.9:
			_walk(4, 6)
		else:
			hold_btn = InputBits.G
			for _k: int in range(8):
				plan.append(InputBits.make(N, InputBits.G, 0, 0))
		return
	# 近距離: 二択・投げ・牽制・ガード
	var crouchy := float(tend["crouch"])
	var r3 := _rand()
	if not stance_entries.is_empty() and r3 < 0.08:
		_do_move(_pick(stance_entries))
		return
	var w_mid := 0.30 + (crouchy - 0.3) * learn
	var w_low := 0.16 + (0.3 - crouchy) * learn * 0.5
	var w_throw := 0.14 + (0.3 - crouchy) * learn * 0.5 + float(tend.get("guard_lot", 0.0))
	var w_jab := 0.15
	var w_guard := 0.25 * (1.0 - agg)
	var total := w_mid + w_low + w_throw + w_jab + w_guard
	r3 *= total
	if r3 < w_mid:
		var mm: MoveDef = _pick(mids if _rand() < 0.7 else (launchers if not launchers.is_empty() else mids))
		_do_move(mm)
	elif r3 < w_mid + w_low:
		_do_move(_pick(lows))
	elif r3 < w_mid + w_low + w_throw:
		var tl: Array[MoveDef] = low_throws if (o.is_crouching() and not low_throws.is_empty()) else throws
		_do_move(_pick(tl))
	elif r3 < w_mid + w_low + w_throw + w_jab:
		if jab != null:
			_do_move(jab)
			# 連携
			if _rand() < 0.5 and jab.chain_to.size() > 0:
				for _k2: int in range(10):
					plan.append(InputBits.make(N, 0, 0, 0))
				var k := int(_rand() * jab.chain_to.size()) % jab.chain_to.size()
				_press(N, jab.chain_btn[k])
	else:
		hold_btn = InputBits.G
		var cr := 2 if _rand() < 0.35 else N
		for _k3: int in range(10 + int(_rand() * 10.0)):
			plan.append(InputBits.make(cr, InputBits.G, 0, 0))
		if _rand() < 0.2 and level >= 4:
			_walk(4, 6)


## 連携（ストリング）の続き: 技ごとに 1 回だけ「出すか・どれか・いつか」を決める
func _think_chain(p: FighterState) -> void:
	var m := cd.moves[p.move]
	if p.move_start_frame != _chain_start:
		_chain_start = p.move_start_frame
		_chain_k = -1
		if m.chain_to.is_empty():
			return
		var want := 0.25 + level * 0.06
		if _rand() < want:
			_chain_k = int(_rand() * m.chain_to.size()) % m.chain_to.size()
			var lo := m.chain_from[_chain_k]
			var hi := mini(m.chain_to_f[_chain_k], m.chain_at[_chain_k] + 2)
			_chain_mf = lo + int(_rand() * float(maxi(1, hi - lo)))
			# ジャスト入力は上位レベルほど狙う
			if m.chain_just[_chain_k] > 0 and _rand() < 0.1 * level:
				_chain_mf = m.chain_just[_chain_k]
	if _chain_k < 0 or p.chain_next >= 0:
		return
	# ガードされた連携は低レベルほど出し切る（上位は中止もする）
	if p.move_contact == SE.MC_BLOCK and level >= 6 and _rand() < 0.02 * level:
		_chain_k = -1
		return
	if p.mf >= _chain_mf:
		var dirv := m.chain_dir[_chain_k]
		_press(dirv if dirv != 0 else N, m.chain_btn[_chain_k])
		_chain_k = -1


## 連続投げ・首相撲・トラップの分岐
func _think_throw(p: FighterState) -> void:
	if p.throw_move < 0:
		return
	var tm := cd.moves[p.throw_move]
	if tm.throw_next_to.is_empty():
		return
	if p.throw_frame < tm.throw_dmg_frame + 2 or p.throw_frame > tm.throw_dmg_frame + tm.throw_next_window - 2:
		return
	if _throw_seen == p.throw_move * 1000 + p.throw_frame:
		return
	_throw_seen = p.throw_move * 1000 + p.throw_frame
	if _rand() > 0.12 + level * 0.04:
		return
	var k := int(_rand() * tm.throw_next_to.size()) % tm.throw_next_to.size()
	var dirv := tm.throw_next_dir[k]
	_press(dirv if dirv != 0 else N, tm.throw_next_btn[k])


## 構え中: 技を出すか、移動・移行するか、解除するか
func _think_stance(p: FighterState) -> void:
	if think_cd > 0:
		think_cd -= 1
		return
	think_cd = int(3 + _rand() * (12 - level))
	var opts: Array[MoveDef] = []
	var moves_out: Array[MoveDef] = []
	var d := _dist()
	for m: MoveDef in cd.moves:
		if m.chain_only or (m.from_mask & SE.FROM_STANCE) == 0 or m.stance_from != p.stance:
			continue
		if m.is_strike():
			if m.reach * 0.0000153 + 0.3 >= d:
				opts.append(m)
		else:
			moves_out.append(m)
	var r := _rand()
	if not opts.is_empty() and r < 0.55:
		_do_move(_pick(opts))
	elif not moves_out.is_empty() and r < 0.8:
		_do_move(_pick(moves_out))
	elif r < 0.9:
		_press(N, InputBits.G)


## 始動技が当たって相手が浮いた（壁に張り付いた）ら、コンボのルートを実行する
func _try_combo(p: FighterState) -> bool:
	if p.move_contact != SE.MC_HIT:
		return false
	var m := cd.moves[p.move]
	if not combos.has(m.id):
		return false
	var o := w.f[1 - me]
	var list: Array = combos[m.id]
	var c: Dictionary = list[int(_rand() * list.size()) % list.size()]
	var wall := bool(c.get("wall", false))
	if wall and o.state != SE.ST_WALL and o.state != SE.ST_AIR:
		return false
	if not wall and o.state != SE.ST_AIR:
		return false
	if p.move_start_frame == _chain_start and _chain_k == -2:
		return false
	_chain_start = p.move_start_frame
	_chain_k = -2
	if _rand() > combo_rate - mistake:
		return false
	var rn := ComboRunner.new()
	if not rn.start(w, me, (c["route"] as Array).slice(1)):
		return false
	runner = rn
	return true
