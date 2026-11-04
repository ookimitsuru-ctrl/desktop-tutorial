extends TestCase
## 全キャラ必須の技カテゴリ（仕様 04_characters.md §4.3）を満たしているか

const IDS: Array[String] = ["toma", "lena", "bjorn", "zaw", "yuelan", "mariel", "adrien", "ravi", "gensai"]


func _from(m: MoveDef, bit: int) -> bool:
	return (m.from_mask & bit) != 0


func _leaves(cd: CharDef, m: MoveDef, depth: int) -> int:
	if m.chain_to.is_empty() or depth > 6:
		return 1
	var n := 0
	for k: int in range(m.chain_to.size()):
		n += _leaves(cd, cd.moves[m.chain_to[k]], depth + 1)
	return n


func _check_char(id: String) -> void:
	var cd := SimFactory.character(id)
	var jab_ok := false
	var low_p := false
	var fast_mid := false
	var launcher := false
	var ch_mids := 0
	var low_kd := false
	var trk := {SE.TRK_HALF_L: false, SE.TRK_HALF_R: false, SE.TRK_FULL: false}
	var plus_mid := false
	var ev_p := false
	var ev_k := false
	var bt := 0
	var esc := {}
	var normal_throws := 0
	var low_throw := false
	var wall := false
	var run_p := false
	var run_k := false
	var run_t := false
	var down_8p := false
	var down_2p := false
	for m: MoveDef in cd.moves:
		var stand := _from(m, SE.FROM_STAND)
		var btn := m.cmd.buttons if m.cmd != null else 0
		if m.is_strike() and m.level != SE.LV_DOWN:
			if stand and not m.chain_only and btn == InputBits.P and m.cmd.dir == 0 and m.cmd.motion.is_empty():
				jab_ok = m.startup == 10 and m.level == SE.LV_HIGH and _leaves(cd, m, 0) >= 2
			if stand and m.level == SE.LV_LOW and m.limb == SE.LIMB_PUNCH and m.startup == 11 and m.cmd.dir == 2:
				low_p = true
			if stand and not m.chain_only and (m.level == SE.LV_MID or m.level == SE.LV_SMID) and m.startup >= 12 and m.startup <= 14:
				fast_mid = true
			if m.hit_reaction == SE.R_LAUNCH and m.startup >= 14 and m.startup <= 16 and not m.chain_only:
				launcher = true
			if (m.level == SE.LV_MID or m.level == SE.LV_SMID) and m.ch_reaction in [SE.R_STAGGER_GUT, SE.R_STAGGER_LEG, SE.R_CRUMPLE, SE.R_LAUNCH]:
				ch_mids += 1
			if m.level == SE.LV_LOW and SE.is_air_reaction(m.hit_reaction):
				low_kd = true
			if trk.has(m.tracking):
				trk[m.tracking] = true
			if (m.level == SE.LV_MID or m.level == SE.LV_SMID) and m.adv_block >= 1:
				plus_mid = true
			if _from(m, SE.FROM_EVADE):
				ev_p = ev_p or btn == InputBits.P
				ev_k = ev_k or btn == InputBits.K
			if _from(m, SE.FROM_BACKTURN):
				bt += 1
			if _from(m, SE.FROM_WALL):
				wall = true
			if _from(m, SE.FROM_RUN):
				run_p = run_p or btn == InputBits.P
				run_k = run_k or btn == InputBits.K
		if m.level == SE.LV_DOWN and _from(m, SE.FROM_OPP_DOWN):
			down_8p = down_8p or m.cmd.dir == 8
			down_2p = down_2p or m.cmd.dir == 2
		if m.is_throw:
			if _from(m, SE.FROM_WALL):
				wall = true
			if _from(m, SE.FROM_RUN):
				run_t = true
			if stand and not m.chain_only and not m.throw_stage and not _from(m, SE.FROM_WALL):
				normal_throws += 1
				if m.level == SE.LV_LTHROW:
					low_throw = low_throw or m.throw_escape == SE.ESC_DOWN
				else:
					esc[m.throw_escape] = true
	check(jab_ok, "%s: 10F 上段 P とそこからの連携 2 系統" % id)
	check(low_p, "%s: 11F の 2P" % id)
	check(fast_mid, "%s: 12〜14F の中段" % id)
	check(launcher, "%s: 14〜16F の浮かせ技" % id)
	check(ch_mids >= 2, "%s: CH でよろけ・崩れ・浮きの中段 2 つ以上 (%d)" % [id, ch_mids])
	check(low_kd, "%s: ダウンを奪う下段" % id)
	check(trk[SE.TRK_HALF_L] and trk[SE.TRK_HALF_R] and trk[SE.TRK_FULL], "%s: 半回転（左右）と全回転" % id)
	check(plus_mid, "%s: ガードさせて有利な中段" % id)
	check(ev_p and ev_k, "%s: 回避中 P / K" % id)
	check(bt >= 2, "%s: 背向け技 2 種以上" % id)
	check(esc.has(SE.ESC_N) and esc.has(SE.ESC_FWD) and esc.has(SE.ESC_BACK), "%s: 投げ（抜け N / 6 / 4）" % id)
	check(low_throw, "%s: 下段投げ（抜け 2）" % id)
	check(normal_throws >= 4 and normal_throws <= 8, "%s: 通常投げ 4〜8 種 (%d)" % [id, normal_throws])
	check(cd.side_throw >= 0 and cd.back_throw >= 0, "%s: 側面投げ・背後投げ" % id)
	check(wall, "%s: 壁際専用技" % id)
	check(run_p and run_k and run_t, "%s: 走り P / K / 投げ" % id)
	check(down_8p and down_2p, "%s: ダウン攻撃 8P / 2P" % id)


func test_checklist_all() -> void:
	for id: String in IDS:
		_check_char(id)


## 投げ・連携・当て身の参照先が全て解決できる
func test_references_resolve() -> void:
	for id: String in IDS:
		var cd := SimFactory.character(id)
		for m: MoveDef in cd.moves:
			for t: int in m.chain_to:
				check(t >= 0, "%s: 連携先が不正" % m.id)
			for t2: int in m.throw_next_to:
				check(t2 >= 0, "%s: 連続投げ先が不正" % m.id)
			if m.is_parry():
				check(m.parry_success >= 0, "%s: 当て身成功時の技がない" % m.id)
			check(m.anim_index >= 0, "%s: アニメがない" % m.id)
			if m.is_throw:
				check(m.throw_anim >= 0, "%s: 投げアニメがない" % m.id)
