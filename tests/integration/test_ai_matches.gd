extends TestCase
## CPU 同士の対戦を全キャラで回し、止まらず決着がつき、固有システムも使われることを確かめる

const IDS: Array[String] = ["toma", "lena", "bjorn", "zaw", "yuelan", "mariel", "adrien", "ravi", "gensai"]


func _run(c0: String, c1: String, seed_value: int, kinds: Dictionary) -> SimWorld:
	var w := SimFactory.world(c0, c1, "arena", seed_value, {"ringout": true})
	var a0 := AIController.new()
	a0.setup(w, 0, 8, false)
	var a1 := AIController.new()
	a1.setup(w, 1, 8, false)
	var moves := [{}, {}]
	for _k: int in range(60 * 60 * 3):
		w.step(a0.next_input(w), a1.next_input(w))
		for e: Dictionary in w.events:
			var k := String(e["kind"])
			kinds[k] = int(kinds.get(k, 0)) + 1
			if k == "move":
				(moves[int(e["player"])] as Dictionary)[String(e["id"])] = true
		if w.phase == SE.PH_MATCH_END:
			break
	check((moves[0] as Dictionary).size() >= 6, "%s が多様な技を使う (%d)" % [c0, (moves[0] as Dictionary).size()])
	return w


func test_cpu_matches_all_characters() -> void:
	var kinds := {}
	for i: int in range(IDS.size()):
		var c0 := IDS[i]
		var c1 := IDS[(i + 4) % IDS.size()]
		var w := _run(c0, c1, 100 + i, kinds)
		check(w.phase == SE.PH_MATCH_END, "%s vs %s が決着する（frame %d, phase %d）" % [c0, c1, w.frame, w.phase])
		check(w.f[0].stat_damage + w.f[1].stat_damage > 0, "%s vs %s でダメージが発生する" % [c0, c1])
	for k: String in ["hit", "block", "throw", "round_end", "move"]:
		check(int(kinds.get(k, 0)) > 0, "イベント %s が発生する" % k)
	check(int(kinds.get("throw_chain", 0)) > 0, "連続投げ・首相撲・トラップの分岐が使われる")
