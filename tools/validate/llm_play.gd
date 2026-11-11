extends Node
## ローカル LLM による QA ハーネス（Godot 側）。tools/qa/llm_qa.py から起動される。
##
## 実際の試合画面（match.gd）を動かし、1P の入力を LLM が選んだ行動で作る（2P は CPU）。描画側の処理（FighterView・カメラ・
## 擬音・ステージ）も本番と同じ経路で動くので、スクリプトの実行エラーも拾える。
## 毎フレーム、不変条件（体力・位置の範囲、状態の固着、タイマー超過、描画側の NaN）を見張り、破れたら "@QA_ANOM" を出す。
## 試合の終わりに、記録した入力でシミュレーションをもう一度回して検査値（チェックサム）の一致を確かめる（決定論）。
## 異常のあった試合は入力を .rbr（ゲーム内リプレイ）と .json で保存するので、LLM なしで再現できる。
##
## 通信: 標準出力へ "@QA {json}" を出して要求し、標準入力の 1 行（JSON）で返事をもらう（返事の間は試合の時間が止まる）。
##   {"t":"scenario"}                      → {"stop":bool, "chars":[..], "costumes":[..], "colors":[..], "stage":"..", "cpu":n, "seed":n,
##                                            "rounds":n, "seconds":n, "ringout":bool, "settings":{..}}
##   {"t":"decide","state":{..}}          → {"plan":["jab","guard",..]}
##   {"t":"match_end","result":{..}}      → {"ok":1}
## 引数: -- --out <出力ディレクトリ>

const FP := 65536.0
const MAX_MATCH_FRAMES := 30000
const POS_LIMIT := 80.0

# 状態ごとの「これ以上続いたら固着」のフレーム数（入力で抜けられない状態だけ）
var stuck_limits := {}
var st_names := {}
var actions := {}
var out_dir := ""

var _mode := "start"
var _scn: Dictionary = {}
var _match: Node = null
var _world: SimWorld = null
var _match_no := 0
var _wait := 0
var _plan: Array = []
var _cur: Array = []       # 実行中の行動: [Vector2i(dir, held)] を 1 tick ずつ
var _cur_name := ""
var _last_held := 0
var _rng := RandomNumberGenerator.new()
var _anoms: Array = []
var _anom_count: Dictionary = {}
var _ev_count: Dictionary = {}
var _recent: Array = []
var _last_frame := -1
var _same: Array = [[-1, 0], [-1, 0]]
var _blocked_usec := 0
var _frame_blocked := false
var _perf: Array = []
var _decisions := 0
var _stopping := false
var _leave_wait := 0
var _last_usec := 0
var _prev_blocked := false


func _ready() -> void:
	get_tree().root.theme = UITheme.build_theme()
	Settings.data["intros"] = "skip"
	Settings.data["replay_autosave"] = false
	var args := OS.get_cmdline_user_args()
	for i: int in range(args.size() - 1):
		if args[i] == "--out":
			out_dir = args[i + 1]
	if out_dir == "":
		out_dir = "user://qa"
	DirAccess.make_dir_recursive_absolute(out_dir + "/repro")
	var se_script: GDScript = load("res://src/sim/match/se.gd")
	var consts := se_script.get_script_constant_map()
	for k: String in consts:
		if k.begins_with("ST_"):
			st_names[int(consts[k])] = k.trim_prefix("ST_").to_lower()
	stuck_limits = {SE.ST_HITSTUN: 300, SE.ST_BLOCKSTUN: 300, SE.ST_STAGGER: 420, SE.ST_CRUMPLE: 420, SE.ST_AIR: 360, SE.ST_WALL: 300,
		SE.ST_DOWN: 900, SE.ST_GETUP: 300, SE.ST_TECH: 300, SE.ST_THROWN: 420, SE.ST_THROWING: 420, SE.ST_CLASH: 300,
		SE.ST_PARRIED: 300, SE.ST_MOVE: 420, SE.ST_EVADE: 200}
	_build_actions()
	print("@QA " + JSON.stringify({"t": "hello", "actions": actions.keys(), "chars": DataDB.characters(), "pid": OS.get_process_id()}))


# ------------------------------------------------------------------ 行動の表

func _seg(d: int, held: int, n: int) -> Array:
	var a: Array = []
	for _i: int in range(n):
		a.append(Vector2i(d, held))
	return a


func _btn(d: int, b: int) -> Array:
	return _seg(d, 0, 2 if d != 5 else 0) + _seg(d, b, 3) + _seg(5, 0, 19 if d != 5 else 21)


func _build_actions() -> void:
	var P := InputBits.P
	var K := InputBits.K
	var G := InputBits.G
	actions = {
		"idle": _seg(5, 0, 24), "walk_in": _seg(6, 0, 24), "walk_out": _seg(4, 0, 24), "crouch": _seg(2, 0, 24),
		"guard": _seg(5, G, 24), "guard_low": _seg(2, G, 24), "jump": _seg(8, 0, 6) + _seg(5, 0, 18),
		"dash_in": _seg(6, 0, 3) + _seg(5, 0, 3) + _seg(6, 0, 18), "dash_out": _seg(4, 0, 3) + _seg(5, 0, 3) + _seg(4, 0, 18),
		"run_in": _seg(6, 0, 3) + _seg(5, 0, 3) + _seg(6, 0, 40),
		"step_up": _seg(8, 0, 3) + _seg(5, 0, 3) + _seg(8, 0, 12) + _seg(5, 0, 6),
		"step_down": _seg(2, 0, 3) + _seg(5, 0, 3) + _seg(2, 0, 12) + _seg(5, 0, 6),
		"jab": _btn(5, P), "kick": _btn(5, K), "tap_guard": _btn(5, G),
		"6P": _btn(6, P), "4P": _btn(4, P), "2P": _btn(2, P), "3P": _btn(3, P), "1P": _btn(1, P), "8P": _btn(8, P),
		"6K": _btn(6, K), "4K": _btn(4, K), "2K": _btn(2, K), "3K": _btn(3, K), "1K": _btn(1, K), "8K": _btn(8, K),
		"PPP": _seg(5, P, 2) + _seg(5, 0, 11) + _seg(5, P, 2) + _seg(5, 0, 11) + _seg(5, P, 2) + _seg(5, 0, 14),
		"PPK": _seg(5, P, 2) + _seg(5, 0, 11) + _seg(5, P, 2) + _seg(5, 0, 11) + _seg(5, K, 2) + _seg(5, 0, 14),
		"PK": _seg(5, P, 2) + _seg(5, 0, 11) + _seg(5, K, 2) + _seg(5, 0, 18),
		"KKK": _seg(5, K, 2) + _seg(5, 0, 11) + _seg(5, K, 2) + _seg(5, 0, 11) + _seg(5, K, 2) + _seg(5, 0, 14),
		"throw": _btn(5, P | G), "throw6": _btn(6, P | G), "throw4": _btn(4, P | G),
		"mash": [], "mash_all": _seg(5, P | K | G, 24), "alt_all": [],
	}
	for k: int in range(12):
		var h := 0 if k % 2 == 1 else (P | K | G)
		actions["alt_all"].append_array(_seg(5, h, 2))


func _expand(name: String) -> Array:
	if name == "mash":
		var a: Array = []
		for _i: int in range(8):
			a.append_array(_seg(_rng.randi_range(1, 9), _rng.randi_range(0, 7), 3))
		return a
	return (actions[name] as Array).duplicate() if actions.has(name) else (actions["idle"] as Array).duplicate()


# ------------------------------------------------------------------ 通信

func _request(msg: Dictionary) -> Dictionary:
	var t0 := Time.get_ticks_usec()
	print("@QA " + JSON.stringify(msg))
	var line := OS.read_string_from_stdin(65536).strip_edges()
	_blocked_usec += Time.get_ticks_usec() - t0
	_frame_blocked = true
	if line == "":
		return {"stop": true, "plan": []}
	var r: Variant = JSON.parse_string(line)
	return r if r is Dictionary else {"plan": []}


func _anom(kind: String, detail: Dictionary) -> void:
	var key := "%d:%s" % [_match_no, kind]
	_anom_count[key] = int(_anom_count.get(key, 0)) + 1
	if int(_anom_count[key]) > 3:
		return
	var row := {"match": _match_no, "frame": _world.frame if _world != null else -1, "kind": kind, "detail": detail}
	_anoms.append(row)
	print("@QA_ANOM " + JSON.stringify(row))


# ------------------------------------------------------------------ 試合の入力

func _make_input(w: SimWorld) -> int:
	if not w.inputs_enabled():
		_cur.clear()
		_plan.clear()
		_last_held = 0
		return InputBits.make(5, 0, 0, 0)
	if _cur.is_empty():
		if _plan.is_empty():
			var r := _request({"t": "decide", "state": _state(w)})
			_decisions += 1
			if bool(r.get("stop", false)):
				_stopping = true
			for n: Variant in r.get("plan", []):
				_plan.append(String(n))
			if _plan.is_empty():
				_plan.append("idle")
		_cur_name = _plan.pop_front()
		_cur = _expand(_cur_name)
	var v: Vector2i = _cur.pop_front()
	var d := v.x
	if not w._on_screen_left(0):
		d = InputBits.mirror_dir(d)
	var held := v.y
	var pr := held & ~_last_held
	var rl := _last_held & ~held
	_last_held = held
	return InputBits.make(d, held, pr, rl)


func _state(w: SimWorld) -> Dictionary:
	var a := w.f[0]
	var b := w.f[1]
	var dist := Vector2((a.x - b.x) / FP, (a.z - b.z) / FP).length()
	return {
		"dist": snappedf(dist, 0.1), "hp": [a.hp, b.hp], "me": st_names.get(a.state, "?"), "opp": st_names.get(b.state, "?"),
		"airborne": a.y > 0, "round": w.round_no, "wins": [w.wins0, w.wins1], "timer": w.timer / 60,
		"last": _cur_name, "events": _recent.duplicate(),
	}


func _tap(e: Dictionary) -> void:
	var k := String(e.get("kind", ""))
	_ev_count[k] = int(_ev_count.get(k, 0)) + 1
	if ["hit", "block", "launch", "wall_hit", "throw", "ringout", "landed", "evade_success", "parry"].has(k):
		var who := int(e.get("defender", e.get("player", 0)))
		_recent.append("%s%s" % [k, "(me)" if who == 0 else "(opp)"])
		if _recent.size() > 4:
			_recent.pop_front()
	if k == "hit":
		var dmg := int(e.get("damage", 0))
		if dmg < 0 or dmg > 1000:
			_anom("bad_damage", {"damage": dmg, "move": int(e.get("move", -1))})


# ------------------------------------------------------------------ 見張り

func _finite(v: Vector3) -> bool:
	return is_finite(v.x) and is_finite(v.y) and is_finite(v.z) and v.length() < 1000.0


func _check(m: Node, w: SimWorld) -> void:
	if w.frame == _last_frame:
		return
	_last_frame = w.frame
	for i: int in range(2):
		var p := w.f[i]
		var who := "p%d" % (i + 1)
		if absf(p.x / FP) > POS_LIMIT or absf(p.z / FP) > POS_LIMIT or p.y / FP < -50.0 or p.y / FP > 20.0:
			_anom("out_of_range", {"who": who, "x": p.x / FP, "y": p.y / FP, "z": p.z / FP, "state": st_names.get(p.state, "?")})
		if p.hp < 0 or p.hp > w.rules.health:
			_anom("hp_range", {"who": who, "hp": p.hp})
		var lim: int = int(stuck_limits.get(p.state, 0))
		var s: Array = _same[i]
		if s[0] == p.state and w.phase == SE.PH_FIGHT:
			s[1] += 1
			if lim > 0 and s[1] == lim:
				_anom("stuck_state", {"who": who, "state": st_names.get(p.state, "?"), "frames": lim, "move": p.move, "anim": p.anim})
		else:
			s[0] = p.state
			s[1] = 0
	if w.phase == SE.PH_FIGHT and w.phase_frame > w.round_frames + 300:
		_anom("timer_overrun", {"phase_frame": w.phase_frame, "timer": w.timer})
	# 描画側
	var fighters: Array = m.get("fighters")
	for i2: int in range(fighters.size()):
		var fv := fighters[i2] as FighterView
		if not _finite(fv.global_position) or not _finite(fv.head_world):
			_anom("view_not_finite", {"who": i2, "pos": str(fv.global_position), "head": str(fv.head_world)})
		# 描画側の動きの状態（慣性・揺り戻し・視線）が壊れていないか
		var ln: Vector2 = fv.get("_lean")
		var lk: Vector2 = fv.get("_look")
		var bob: float = fv.get("_bob")
		if not (is_finite(ln.x) and is_finite(ln.y) and is_finite(lk.x) and is_finite(lk.y) and is_finite(bob)) or ln.length() > 25.0 or lk.length() > 120.0 or absf(bob) > 0.3:
			_anom("motion_state", {"who": i2, "lean": str(ln), "look": str(lk), "bob": bob})
	var cr := m.get("cam") as Camera3D
	if cr != null and not _finite(cr.global_position):
		_anom("camera_not_finite", {"pos": str(cr.global_position)})


## リプレイの検査値は 32 ビットで保存される（PackedInt32Array）ので、同じ形に切り詰めて比べる
func _to_i32(v: int) -> int:
	var c := v & 0xFFFFFFFF
	return c - 0x100000000 if c >= 0x80000000 else c


func _replay_check(m: Node) -> Dictionary:
	var rec: ReplayRecorder = m.get("recorder")
	var g := Game
	var opts := {"ringout": g.ringout, "rounds_to_win": g.rounds_to_win, "round_seconds": g.round_seconds}
	var w := SimFactory.world(String(g.p_char[0]), String(g.p_char[1]), g.stage, g.seed_value, opts)
	w.assist_easy_escape = [bool(Settings.g("assist_escape")), false]
	var ins := rec.inputs
	var chk := rec.checks
	var ci := 0
	for k: int in range(ins.size() / 2):
		w.step(ins[k * 2], ins[k * 2 + 1])
		if w.frame % 60 == 0 and ci + 1 < chk.size():
			if chk[ci] == w.frame:
				if chk[ci + 1] != _to_i32(w.checksum()):
					return {"ok": false, "frame": w.frame}
				ci += 2
	var live: SimWorld = m.get("world")
	return {"ok": w.checksum() == live.checksum(), "frame": w.frame}


# ------------------------------------------------------------------ 進行

func _process(_delta: float) -> void:
	match _mode:
		"start":
			var r := _request({"t": "scenario"})
			if bool(r.get("stop", false)) or r.is_empty() or not r.has("chars"):
				_finish()
				return
			_begin(r)
		"wait_scene":
			if SceneRouter.current != null and not bool(SceneRouter.get("_busy")) and SceneRouter.current.get("recorder") != null:
				_match = SceneRouter.current
				_world = _match.get("world")
				_match.set("pv_ticks", 1)
				(_match.get("sources") as Array)[0] = Callable(self, "_make_input")
				_match.set("event_tap", Callable(self, "_tap"))
				_mode = "play"
		"play":
			# 1 フレームの実時間（LLM の返事待ちを含むフレームと、その次のフレームは除く）
			var now := Time.get_ticks_usec()
			if _last_usec > 0 and not _frame_blocked and not _prev_blocked and _last_frame > 5:
				_perf.append(float(now - _last_usec) / 1000.0)
			_last_usec = now
			_prev_blocked = _frame_blocked
			_frame_blocked = false
			_check(_match, _world)
			if _stopping:
				_end_match(true)
			elif _world.phase == SE.PH_MATCH_END:
				_match.set("_end_timer", 999.0)
				_end_match(false)
			elif _world.frame > MAX_MATCH_FRAMES:
				_anom("match_too_long", {"frames": _world.frame, "round": _world.round_no, "phase": _world.phase})
				_end_match(true)
		"leave":
			_leave_wait -= 1
			if _leave_wait <= 0 and SceneRouter.current != null and not bool(SceneRouter.get("_busy")) and SceneRouter.current.get("world") == null:
				_mode = "start"


func _begin(r: Dictionary) -> void:
	_match_no += 1
	_scn = r
	for k: String in r.get("settings", {}):
		Settings.data[k] = r["settings"][k]
	Game.mode = Game.Mode.WATCH
	Game.p_char = [String(r["chars"][0]), String(r["chars"][1])]
	Game.p_costume = [String(r["costumes"][0]), String(r["costumes"][1])]
	Game.p_color = [int(r["colors"][0]), int(r["colors"][1])]
	Game.p_cpu = [4, int(r["cpu"])]
	Game.stage = String(r["stage"])
	Game.setup_match_defaults()
	Game.rounds_to_win = int(r.get("rounds", 2))
	Game.round_seconds = int(r.get("seconds", 30))
	Game.ringout = bool(r.get("ringout", true))
	Game.seed_value = int(r["seed"])
	_rng.seed = int(r["seed"])
	_anoms.clear()
	_ev_count.clear()
	_recent.clear()
	_perf.clear()
	_plan.clear()
	_cur.clear()
	_last_held = 0
	_last_frame = -1
	_same = [[-1, 0], [-1, 0]]
	_blocked_usec = 0
	_cur_name = ""
	_last_usec = 0
	print("qa: match %d %s vs %s on %s cpu=%d seed=%d" % [_match_no, Game.p_char[0], Game.p_char[1], Game.stage, int(r["cpu"]), Game.seed_value])
	SceneRouter.goto("match", {"mode": Game.mode}, 0.0)
	_mode = "wait_scene"


func _end_match(aborted: bool) -> void:
	var rec: ReplayRecorder = _match.get("recorder")
	var det := _replay_check(_match)
	if not bool(det["ok"]):
		_anom("nondeterministic", det)
	var base := "%s/repro/m%03d_%s_vs_%s_%s" % [out_dir, _match_no, Game.p_char[0], Game.p_char[1], Game.stage]
	rec.save(base + ".rbr")
	var inputs: Array = []
	for v: int in rec.inputs:
		inputs.append(v)
	var f := FileAccess.open(base + ".json", FileAccess.WRITE)
	if f != null:
		f.store_string(JSON.stringify({"scenario": _scn, "header": rec.header, "anomalies": _anoms, "inputs": inputs}))
		f.close()
	_perf.sort()
	var p95 := 0.0
	var pmax := 0.0
	if not _perf.is_empty():
		p95 = float(_perf[mini(_perf.size() - 1, int(_perf.size() * 0.95))])
		pmax = float(_perf[_perf.size() - 1])
	var res := {
		"match": _match_no, "frames": _world.frame, "winner": _world.match_winner, "rounds": _world.round_no, "aborted": aborted,
		"anomalies": _anoms.size(), "events": _ev_count, "deterministic": bool(det["ok"]), "decisions": _decisions,
		"script_ms_p95": snappedf(p95, 0.01), "script_ms_max": snappedf(pmax, 0.01), "repro": base,
		"objects": int(Performance.get_monitor(Performance.OBJECT_COUNT)), "nodes": int(Performance.get_monitor(Performance.OBJECT_NODE_COUNT)),
		"orphans": int(Performance.get_monitor(Performance.OBJECT_ORPHAN_NODE_COUNT)), "mem_mb": snappedf(Performance.get_monitor(Performance.MEMORY_STATIC) / 1048576.0, 0.1),
	}
	var r := _request({"t": "match_end", "result": res})
	if bool(r.get("stop", false)):
		_stopping = true
	_match = null
	_world = null
	SceneRouter.goto("main_menu", {}, 0.0)
	_leave_wait = 20
	_mode = "leave"
	if _stopping:
		_finish()


func _finish() -> void:
	_mode = "done"
	print("@QA " + JSON.stringify({"t": "bye"}))
	if SceneRouter.current != null:
		SceneRouter.current.queue_free()
		SceneRouter.current = null
	AudioHub.release_all()
	var t0 := Time.get_ticks_msec()
	while Time.get_ticks_msec() - t0 < 400:
		await get_tree().process_frame
	get_tree().quit(0)
