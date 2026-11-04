extends TestCase
## ゴールデンリプレイ（tests/replays/golden_*.json）を再生し、60F ごとのチェックサムが一致することを確かめる。
## 不一致はシミュレーションの意図しない変更を意味する。意図した変更なら tools/validate/make_golden.gd で作り直す。


func test_golden_replays() -> void:
	var d := DirAccess.open("res://tests/replays")
	check(d != null, "tests/replays がある")
	if d == null:
		return
	var n := 0
	for fn: String in d.get_files():
		if not (fn.begins_with("golden_") and fn.ends_with(".json")):
			continue
		n += 1
		var j: Dictionary = DataLoader.read_json("res://tests/replays/" + fn)
		var ch: Array = j["chars"]
		var w := SimFactory.world(String(ch[0]), String(ch[1]), String(j["stage"]), int(j["seed"]), {"ringout": bool(j["ringout"])})
		var checks := {}
		for c: Array in j["checks"]:
			checks[int(c[0])] = int(c[1])
		var rle: Array = j["inputs"]
		var bad := -1
		for k: int in range(0, rle.size(), 2):
			var v := int(rle[k])
			for _r: int in range(int(rle[k + 1])):
				w.step(v & 0xFFFF, (v >> 16) & 0xFFFF)
				if checks.has(w.frame) and int(checks[w.frame]) != w.checksum() and bad < 0:
					bad = w.frame
		check(bad < 0, "%s: フレーム %d でチェックサム不一致" % [fn, bad])
		eq(w.frame, int(j["frames"]), fn + ": フレーム数")
		eq(w.checksum(), int(j["final"]), fn + ": 最終チェックサム")
	check(n >= 10, "ゴールデンリプレイが 10 本以上ある (%d)" % n)
