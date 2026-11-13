extends SceneTree
## ゴールデンリプレイの作成（CPU 同士の対戦の入力と 60F ごとのチェックサムを記録）
## 使い方: godot --headless -s res://tools/validate/make_golden.gd
## シミュレーションやデータを意図して変えたときだけ作り直す（tests/integration/test_golden_replays.gd が照合する）

const CASES := [
	["toma", "zaw", "arena", 11], ["lena", "bjorn", "fort", 12], ["bjorn", "mariel", "harbor", 13],
	["zaw", "yuelan", "temple", 14], ["yuelan", "adrien", "bamboo", 15], ["mariel", "ravi", "raft", 16],
	["adrien", "gensai", "skyline", 17], ["ravi", "lena", "ruins", 18], ["gensai", "toma", "lighthouse", 19],
	["toma", "toma", "temple", 20],
]


func _init() -> void:
	var k := 0
	for c: Array in CASES:
		var path := "res://tests/replays/golden_%02d.json" % k
		var j := record(String(c[0]), String(c[1]), String(c[2]), int(c[3]))
		var f := FileAccess.open(path, FileAccess.WRITE)
		f.store_string(JSON.stringify(j) + "\n")
		f.close()
		print("%s: %s vs %s (%s) frames=%d winner=%d" % [path, c[0], c[1], c[2], int(j["frames"]), int(j["winner"])])
		k += 1
	quit(0)


static func record(c0: String, c1: String, stage: String, seed_value: int) -> Dictionary:
	var w := SimFactory.world(c0, c1, stage, seed_value, {"ringout": true})
	var a0 := AIController.new()
	a0.setup(w, 0, 7, false)
	var a1 := AIController.new()
	a1.setup(w, 1, 7, false)
	var inputs: Array = []
	var checks: Array = []
	for _f: int in range(60 * 60 * 4):
		var i0 := a0.next_input(w)
		var i1 := a1.next_input(w)
		inputs.append(i0 | (i1 << 16))
		w.step(i0, i1)
		if w.frame % 60 == 0:
			checks.append([w.frame, w.checksum()])
		if w.phase == SE.PH_MATCH_END:
			break
	# 同じ入力の連続をまとめる: [値, 回数, 値, 回数, ...]
	var rle: Array = []
	var x := 0
	while x < inputs.size():
		var v: int = inputs[x]
		var n := 1
		while x + n < inputs.size() and inputs[x + n] == v:
			n += 1
		rle.append(v)
		rle.append(n)
		x += n
	return {"schema_version": 1, "chars": [c0, c1], "stage": stage, "seed": seed_value, "ringout": true,
		"inputs": rle, "checks": checks, "frames": w.frame, "final": w.checksum(), "winner": w.match_winner}
