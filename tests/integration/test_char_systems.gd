extends TestCase
## キャラ固有システムの統合テスト（首相撲・トラップ・連続投げ・ジャスト入力・構え・当て身・ダウン投げ）

const N := 5
const P := InputBits.P
const K := InputBits.K
const G := InputBits.G

var w: SimWorld
var log: Array[Dictionary] = []


func _world(a: String, b: String, dist: String) -> void:
	w = SimFactory.world(a, b, "arena", 11, {"ringout": false})
	SimDriver.skip_intro(w)
	SimDriver.place(w, FP.from_str(dist))
	log.clear()


func _step(i0: int, i1: int) -> void:
	w.step(i0, i1)
	for e: Dictionary in w.events:
		log.append(e)


func _idle(n: int) -> void:
	for _k: int in range(n):
		_step(SimDriver.inp(N), SimDriver.inp(N))


## P1 がボタンを押す（1F 押して離す）
func _p1(dirv: int, btn: int) -> void:
	_step(SimDriver.inp(dirv, btn, btn), SimDriver.inp(N))
	_step(SimDriver.inp(N), SimDriver.inp(N))


func _both(d0: int, b0: int, d1: int, b1: int) -> void:
	_step(SimDriver.inp(d0, b0, b0), SimDriver.inp(d1, b1, b1))
	_step(SimDriver.inp(N), SimDriver.inp(N))


func _has(kind: String, key: String = "", val: Variant = null) -> bool:
	for e: Dictionary in log:
		if String(e["kind"]) == kind and (key == "" or e.get(key) == val):
			return true
	return false


## 指定イベントが出るまで待つ（出たら true）
func _wait_event(kind: String, maxf: int, since: int = -1) -> bool:
	var n0 := log.size() if since < 0 else since
	for j0: int in range(n0, log.size()):
		if String(log[j0]["kind"]) == kind:
			return true
	for _k: int in range(maxf):
		_idle(1)
		for j: int in range(n0, log.size()):
			if String(log[j]["kind"]) == kind:
				return true
	return false


func _move_id(i: int) -> String:
	return w.chars[i].moves[w.f[i].move].id


func _wait_state(i: int, st: int, maxf: int) -> bool:
	for _k: int in range(maxf):
		if w.f[i].state == st:
			return true
		_idle(1)
	return w.f[i].state == st


# ------------------------------------------------------------ ゾー: 首相撲

func test_zaw_clinch_knees_and_elbow() -> void:
	_world("zaw", "toma", "0.70")
	_p1(N, K | G)
	check(_wait_state(0, SE.ST_THROWING, 14), "首相撲が成立する")
	eq(_move_id(0), "zaw_kg")
	_idle(12)
	var mk1 := log.size()
	_p1(N, K)
	check(_wait_event("throw_chain", 4, mk1), "K で膝へ")
	eq(_move_id(0), "zaw_clinch_k1")
	check(_wait_event("hit", 20), "膝が入る")
	_idle(3)
	var mk2 := log.size()
	_p1(N, K)
	check(_wait_event("throw_chain", 12, mk2), "K で 2 発目")
	eq(_move_id(0), "zaw_clinch_k2")
	check(_wait_event("hit", 20), "2 発目が入る")
	_idle(3)
	var mk3 := log.size()
	_p1(N, P)
	check(_wait_event("throw_chain", 12, mk3), "P で肘")
	eq(_move_id(0), "zaw_clinch_p")
	_idle(60)
	eq(w.f[1].hp, 1000 - 40 - 40 - 70, "膝 2 発 + 肘")
	check(w.f[1].state == SE.ST_STAGGER or w.f[1].state == SE.ST_STAND, "肘のあとは立ったまま（よろけ）")


func test_zaw_clinch_mash_escape() -> void:
	_world("zaw", "toma", "0.70")
	_p1(N, K | G)
	check(_wait_state(0, SE.ST_THROWING, 14), "首相撲が成立する")
	var escaped := false
	for k: int in range(120):
		# 攻め側は膝を入れ続け、受け側はレバガチャ
		var a_in := SimDriver.inp(N, K, K) if k % 12 == 10 else SimDriver.inp(N)
		var d_in := SimDriver.inp(4 if k % 2 == 0 else 6, P, P) if k % 2 == 0 else SimDriver.inp(6)
		_step(a_in, d_in)
		if _has("throw_escape"):
			escaped = true
			break
	check(escaped, "レバガチャで脱出できる")


# ------------------------------------------------------------ マリエル: トラップ

func test_mariel_trap_then_elbows() -> void:
	_world("mariel", "toma", "0.75")
	_both(4, P, N, P)
	check(_wait_event("parry", 14), "トラップでジャブを捕らえる")
	check(_wait_state(0, SE.ST_THROWING, 4), "腕取りへ移行")
	eq(_move_id(0), "mariel_trap")
	_idle(10)
	var mk4 := log.size()
	_p1(N, P)
	check(_wait_event("throw_chain", 10, mk4), "P で肘連打")
	eq(_move_id(0), "mariel_trap_p")
	_idle(70)
	eq(w.f[1].hp, 1000 - 120)


func test_mariel_trap_whiff_recovery() -> void:
	_world("mariel", "toma", "1.20")
	_p1(4, P)
	var t := 0
	while w.f[0].state == SE.ST_MOVE and t < 60:
		_idle(1)
		t += 1
	eq(t, 26 - 1, "空振り時の全体 26F")


# ------------------------------------------------------------ ビョルン: 連続投げ

func test_bjorn_chain_throw_full() -> void:
	_world("bjorn", "toma", "0.80")
	_step(SimDriver.inp(4), SimDriver.inp(N))
	_step(SimDriver.inp(6, P | G, P | G), SimDriver.inp(N))
	check(_wait_state(0, SE.ST_THROWING, 14), "腰抱えが成立する")
	eq(_move_id(0), "bjorn_46pg")
	check(_wait_event("hit", 40), "1 段目のダメージ")
	_idle(2)
	var mk5 := log.size()
	_step(SimDriver.inp(4, P | G, P | G), SimDriver.inp(N))
	check(_wait_event("throw_chain", 6, mk5), "4P+G で振り回し")
	eq(_move_id(0), "bjorn_swing")
	check(_wait_event("hit", 40), "2 段目のダメージ")
	_idle(2)
	var mk6 := log.size()
	_step(SimDriver.inp(6, P | G, P | G), SimDriver.inp(N))
	check(_wait_event("throw_chain", 6, mk6), "6P+G で俵返し")
	eq(_move_id(0), "bjorn_tawara")
	_idle(90)
	eq(w.f[1].hp, 1000 - 100 - 90 - 180, "3 段の合計 370")


# ------------------------------------------------------------ 月嵐: ジャスト入力

func test_yuelan_just_frame() -> void:
	_world("yuelan", "toma", "0.80")
	_p1(6, P)
	# 判断は前フレーム終了時の mf で行われるので、mf == 16 の状態で押す
	var guard := 0
	while w.f[0].mf != 16 and guard < 60:
		_idle(1)
		guard += 1
	_p1(N, P)
	check(_has("just_frame"), "ジャスト入力が成立する")
	_idle(4)
	eq(_move_id(0), "yuelan_6pp_j")


func test_yuelan_normal_followup() -> void:
	_world("yuelan", "toma", "0.80")
	_p1(6, P)
	_idle(4)
	_p1(N, P)
	_idle(20)
	check(not _has("just_frame"), "早い入力は通常版")
	eq(_move_id(0), "yuelan_6pp")


func test_yuelan_step_into_fist() -> void:
	_world("yuelan", "toma", "2.20")
	_step(SimDriver.inp(3), SimDriver.inp(N))
	_step(SimDriver.inp(6), SimDriver.inp(N))
	eq(_move_id(0), "yuelan_step", "3→6 で進歩")
	_idle(2)
	_p1(N, P)
	_idle(6)
	eq(_move_id(0), "yuelan_step_p", "進歩中 P で進歩崩拳")


# ------------------------------------------------------------ アドリアン / ラヴィ: 構え

func test_adrien_garde_moves() -> void:
	_world("adrien", "toma", "2.00")
	_p1(N, K | G)
	_idle(6)
	eq(w.f[0].state, SE.ST_STANCE, "ガルドに入る")
	var x0 := w.f[0].x
	_step(SimDriver.inp(6), SimDriver.inp(N))
	_idle(1)
	eq(_move_id(0), "adrien_garde_6", "6 で前進")
	_idle(16)
	eq(w.f[0].state, SE.ST_STANCE, "前進後もガルド")
	check(absi(w.f[0].x - x0) > FP.from_str("0.3"), "前に進んでいる")
	_p1(N, K)
	_idle(2)
	eq(_move_id(0), "adrien_garde_k", "ガルド中 K でシャッセ")


func test_ravi_stance_transitions_and_low_profile() -> void:
	_world("ravi", "toma", "0.75")
	_p1(2, P | K)
	_idle(10)
	eq(w.f[0].state, SE.ST_STANCE, "蛇の構え")
	eq(w.chars[0].stance_ids[w.f[0].stance], "snake")
	# 蛇の構えは上段を潜る
	_both(N, 0, N, P)
	_idle(14)
	check(not _has("hit", "attacker", 1), "上段ジャブは蛇の構えに当たらない")
	_p1(4, P | K)
	_idle(10)
	eq(w.chars[0].stance_ids[w.f[0].stance], "elephant", "蛇→象")
	_p1(N, P | K)
	_idle(10)
	eq(w.chars[0].stance_ids[w.f[0].stance], "lion", "象→獅子")


# ------------------------------------------------------------ 玄斎: 当て身

func test_gensai_reversal_kick() -> void:
	_world("gensai", "toma", "0.90")
	# 灯真の上段回し蹴り（発生 13F）を、当て身（2〜12F）の受付に重ねる
	_step(SimDriver.inp(N), SimDriver.inp(N, K, K))
	_idle(3)
	_p1(4, P | K)
	check(_wait_state(0, SE.ST_THROWING, 20), "蹴りを当て身で捕らえる")
	_idle(70)
	eq(w.f[1].hp, 1000 - 185, "当て身投げのダメージ")


func test_gensai_low_reversal_ignores_high() -> void:
	_world("gensai", "toma", "0.80")
	_both(1, P | K, N, P)
	_idle(20)
	check(not _has("parry"), "下段当て身は上段を取らない")


# ------------------------------------------------------------ レナ: 脱力・ダウン投げ

func test_lena_relax_and_down_throw() -> void:
	_world("lena", "toma", "0.80")
	_p1(N, P | K | G)
	_idle(8)
	eq(w.f[0].state, SE.ST_STANCE, "脱力に入る")
	_idle(70)
	eq(w.f[0].state, SE.ST_STAND, "60F で自動解除")
	# 相手をダウンさせてダウン投げ
	FighterCtl._to_down(w, 1, SE.DOWN_UP, false)
	_idle(30)
	_p1(2, P | G)
	check(_wait_state(0, SE.ST_THROWING, 16), "ダウン投げが成立する")
	_idle(70)
	eq(w.f[1].hp, 1000 - 120)
