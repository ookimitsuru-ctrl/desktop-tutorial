class_name SimWorld
extends RefCounted
## 決定論シミュレーション本体。step() で1フレーム進める。
## 仕様: 02_combat_system.md, 11_technical_architecture.md §11.7

var rules: RulesDef
var stage: StageDef
var chars: Array[CharDef] = []
var f: Array[FighterState] = []

# ---- ワールド状態（スナップショット対象） ----
var frame: int = 0
var phase: int = SE.PH_INTRO
var phase_frame: int = 0
var round_no: int = 1
var timer: int = 0
var hitstop: int = 0
var rng: int = 1
var cam_x: int = 0
var cam_z: int = FP.ONE
var wins0: int = 0
var wins1: int = 0
var round_winner: int = -1
var end_reason: int = 0
var match_winner: int = -1
var extra_round: int = 0
var ko_frame: int = 0
var event_seq: int = 0
var edge_type: PackedInt32Array = PackedInt32Array()
var edge_hp: PackedInt32Array = PackedInt32Array()

const WORLD_FIELDS: Array[String] = [
	"frame", "phase", "phase_frame", "round_no", "timer", "hitstop", "rng", "cam_x", "cam_z",
	"wins0", "wins1", "round_winner", "end_reason", "match_winner", "extra_round", "ko_frame", "event_seq",
]

# ---- 設定（状態ではない） ----
var rounds_to_win: int = 2
var round_frames: int = 2700
var ringout_enabled: bool = true
var training: bool = false
var training_infinite_hp: bool = false
## アシスト「投げ抜け簡易化」（オフライン限定）
var assist_easy_escape: Array[bool] = [false, false]
## このフレームのイベント（演出・AI・ログ用。状態ではない）
var events: Array[Dictionary] = []


func setup(p_rules: RulesDef, p_stage: StageDef, c0: CharDef, c1: CharDef, seed_value: int) -> void:
	rules = p_rules
	stage = p_stage
	chars = [c0, c1]
	f = [FighterState.new(), FighterState.new()]
	f[0].side = 0
	f[1].side = 1
	f[0].char_idx = c0.index
	f[1].char_idx = c1.index
	rng = SimRng.seed_state(seed_value)
	rounds_to_win = rules.rounds_to_win
	round_frames = rules.round_frames
	edge_type = stage.edge_type.duplicate()
	edge_hp = stage.edge_hp.duplicate()
	if not ringout_enabled:
		_disable_ringout()
	round_no = 1
	wins0 = 0
	wins1 = 0
	match_winner = -1
	extra_round = 0
	reset_round()


func _disable_ringout() -> void:
	for i: int in range(edge_type.size()):
		if edge_type[i] == SE.EDGE_OPEN or edge_type[i] == SE.EDGE_BREAKABLE:
			edge_type[i] = SE.EDGE_WALL


func reset_round() -> void:
	phase = SE.PH_INTRO
	phase_frame = 0
	timer = round_frames if extra_round == 0 else 30 * 60
	hitstop = 0
	round_winner = -1
	ko_frame = 0
	edge_type = stage.edge_type.duplicate()
	edge_hp = stage.edge_hp.duplicate()
	if not ringout_enabled:
		_disable_ringout()
	cam_x = 0
	cam_z = FP.ONE
	for i: int in range(2):
		var p := f[i]
		var keep_hist := p.hist.duplicate()
		var keep_head := p.hist_head
		var stats := [p.stat_damage, p.stat_max_combo, p.stat_counters, p.stat_escapes, p.stat_evades]
		var np := FighterState.new()
		np.side = i
		np.char_idx = p.char_idx
		np.hist = keep_hist
		np.hist_head = keep_head
		np.stat_damage = stats[0]
		np.stat_max_combo = stats[1]
		np.stat_counters = stats[2]
		np.stat_escapes = stats[3]
		np.stat_evades = stats[4]
		np.hp = rules.health
		np.x = stage.start_x[i]
		np.z = stage.start_z[i]
		np.evade_len = chars[i].evade_total
		f[i] = np
	_face_each_other()
	for i: int in range(2):
		PoseRef.update(self, i)


func _face_each_other() -> void:
	var a := FP.atan2(f[1].x - f[0].x, f[1].z - f[0].z)
	f[0].facing = a
	f[1].facing = FP.ang(a + FP.ANG_HALF)


func assist_escape(i: int) -> bool:
	return assist_easy_escape[i]


func opp(i: int) -> FighterState:
	return f[1 - i]


func inputs_enabled() -> bool:
	return phase == SE.PH_FIGHT


func emit(kind: String, data: Dictionary) -> void:
	event_seq += 1
	data["kind"] = kind
	data["frame"] = frame
	data["seq"] = event_seq
	events.append(data)


## 1フレーム進める。in0/in1 は画面基準の入力（InputBits）
func step(in0: int, in1: int) -> void:
	events.clear()
	frame += 1
	_update_camera_side()
	_ingest(0, in0)
	_ingest(1, in1)
	if phase == SE.PH_MATCH_END:
		phase_frame += 1
		for i: int in range(2):
			f[i].sf += 1
			PoseRef.update(self, i)
		return
	if phase == SE.PH_INTRO:
		phase_frame += 1
		for i: int in range(2):
			f[i].sf += 1
			PoseRef.update(self, i)
		if phase_frame == 1:
			emit("round_start", {"round": round_no, "final": _is_final_round()})
		if phase_frame >= rules.intro_frames:
			phase = SE.PH_FIGHT
			phase_frame = 0
			emit("fight", {})
		return
	if hitstop > 0:
		hitstop -= 1
		for i: int in range(2):
			FighterCtl.during_hitstop(self, i)
		return
	# 時間切れの状態を終える（両者同時）→ 判断（両者とも同じ判定前状態から）
	FighterCtl.complete_timers(self, 0)
	FighterCtl.complete_timers(self, 1)
	var ctx0 := FighterCtl.context(self, 0)
	var ctx1 := FighterCtl.context(self, 1)
	FighterCtl.decide(self, 0, ctx0)
	FighterCtl.decide(self, 1, ctx1)
	# 状態の進行・移動
	FighterCtl.advance(self, 0)
	FighterCtl.advance(self, 1)
	_face_free()
	Ring.resolve(self)
	for i: int in range(2):
		PoseRef.update(self, i)
	Combat.resolve_throws(self)
	Combat.advance_throws(self)
	Combat.resolve_strikes(self)
	Ring.resolve_post(self)
	for i: int in range(2):
		PoseRef.update(self, i)
	_post()


func _ingest(i: int, raw: int) -> void:
	var p := f[i]
	var d := InputBits.dir(raw)
	if not _on_screen_left(i):
		d = InputBits.mirror_dir(d)
	p.push_input(InputBits.with_dir(raw, d))


## 画面右方向ベクトル（カメラ側ベクトルから）
func screen_right() -> Vector2i:
	return Vector2i(cam_z, -cam_x)


func _on_screen_left(i: int) -> bool:
	var r := screen_right()
	var o := opp(i)
	var dx := f[i].x - o.x
	var dz := f[i].z - o.z
	var dot := (dx >> 4) * (r.x >> 4) + (dz >> 4) * (r.y >> 4)
	return dot <= 0 if i == 0 else dot < 0


func _update_camera_side() -> void:
	var ax := f[1].x - f[0].x
	var az := f[1].z - f[0].z
	var l := FP.len2(ax, az)
	if l < 64:
		return
	var nx := (ax << 16) / l
	var nz := (az << 16) / l
	# 対戦軸に垂直なベクトル
	var px := -nz
	var pz := nx
	if (px >> 4) * (cam_x >> 4) + (pz >> 4) * (cam_z >> 4) < 0:
		px = -px
		pz = -pz
	cam_x = px
	cam_z = pz


func _face_free() -> void:
	for i: int in range(2):
		var p := f[i]
		if FighterCtl.is_free_facing(p):
			var o := opp(i)
			if absi(o.x - p.x) + absi(o.z - p.z) > 256:
				p.facing = FP.atan2(o.x - p.x, o.z - p.z)


func _is_final_round() -> bool:
	return wins0 == rounds_to_win - 1 and wins1 == rounds_to_win - 1


func _post() -> void:
	if phase == SE.PH_FIGHT:
		var ko0 := f[0].hp <= 0
		var ko1 := f[1].hp <= 0
		var ro0 := f[0].state == SE.ST_RINGOUT
		var ro1 := f[1].state == SE.ST_RINGOUT
		if ko0 or ko1 or ro0 or ro1:
			var winner := -1
			var reason := SE.END_KO
			if (ko0 or ro0) and (ko1 or ro1):
				winner = 2
				reason = SE.END_DRAW
			elif ko0 or ro0:
				winner = 1
				reason = SE.END_RINGOUT if ro0 and not ko0 else SE.END_KO
			else:
				winner = 0
				reason = SE.END_RINGOUT if ro1 and not ko1 else SE.END_KO
			_end_round(winner, reason)
		else:
			timer -= 1
			if timer <= 0:
				timer = 0
				var w := -1
				if f[0].hp > f[1].hp:
					w = 0
				elif f[1].hp > f[0].hp:
					w = 1
				else:
					w = 2
				_end_round(w, SE.END_TIMEUP if w != 2 else SE.END_DRAW)
	elif phase == SE.PH_ROUND_END:
		phase_frame += 1
		if phase_frame == 120:
			for i: int in range(2):
				var p := f[i]
				var won := round_winner == i
				if won and FighterCtl.is_settled(p):
					FighterCtl.set_state(p, SE.ST_WIN, 0)
					emit("win_pose", {"player": i})
		if phase_frame >= rules.end_frames:
			_next_round()


func _end_round(winner: int, reason: int) -> void:
	phase = SE.PH_ROUND_END
	phase_frame = 0
	round_winner = winner
	end_reason = reason
	ko_frame = frame
	if winner == 0 or winner == 2:
		wins0 += 1
	if winner == 1 or winner == 2:
		wins1 += 1
	var perfect := false
	if winner == 0:
		perfect = f[0].hp >= rules.health
	elif winner == 1:
		perfect = f[1].hp >= rules.health
	if reason == SE.END_KO:
		hitstop = rules.hitstop_finisher
	for i: int in range(2):
		if f[i].hp <= 0:
			f[i].ko = 1
	emit("round_end", {"winner": winner, "reason": reason, "perfect": perfect, "wins": [wins0, wins1]})


func _next_round() -> void:
	var done0 := wins0 >= rounds_to_win
	var done1 := wins1 >= rounds_to_win
	if extra_round == 1 and (round_winner == 0 or round_winner == 1):
		_match_end(round_winner)
		return
	if extra_round == 1 and round_winner == 2:
		_match_end(2)
		return
	if done0 and done1:
		extra_round = 1
	elif done0:
		_match_end(0)
		return
	elif done1:
		_match_end(1)
		return
	round_no += 1
	reset_round()


func _match_end(winner: int) -> void:
	match_winner = winner
	phase = SE.PH_MATCH_END
	phase_frame = 0
	emit("match_end", {"winner": winner})


# ---- スナップショット ----

func save_state() -> PackedInt32Array:
	var buf := PackedInt32Array()
	for fn: String in WORLD_FIELDS:
		buf.append(int(get(fn)))
	buf.append(edge_type.size())
	buf.append_array(edge_type)
	buf.append_array(edge_hp)
	f[0].write_to(buf)
	f[1].write_to(buf)
	return buf


func load_state(buf: PackedInt32Array) -> void:
	var o := 0
	for fn: String in WORLD_FIELDS:
		set(fn, buf[o])
		o += 1
	var n := buf[o]
	o += 1
	edge_type = buf.slice(o, o + n)
	o += n
	edge_hp = buf.slice(o, o + n)
	o += n
	o = f[0].read_from(buf, o)
	o = f[1].read_from(buf, o)


func checksum() -> int:
	return SimChecksum.of_ints(save_state())


# ---- 乱数 ----

func rand(n: int) -> int:
	rng = SimRng.next(rng)
	return SimRng.range_of(rng, n)
