extends SceneTree
## バランスレポート: 全組み合わせを CPU（同レベル）同士で対戦させ、勝率表を reports/balance.md に書き出す。
## 使い方: godot --headless -s res://tools/validate/balance_report.gd [-- 試合数/組 (既定 6) レベル (既定 7)]
## 基準（仕様 Q15）: 各キャラの総合勝率 40〜60%

const IDS: Array[String] = ["toma", "lena", "bjorn", "zaw", "yuelan", "mariel", "adrien", "ravi", "gensai"]
const STAGES: Array[String] = ["arena", "temple", "harbor", "fort", "bamboo", "ruins", "skyline", "raft"]


func _init() -> void:
	var a := OS.get_cmdline_user_args()
	var per := int(a[0]) if a.size() > 0 else 6
	var lv := int(a[1]) if a.size() > 1 else 7
	var seed_base := int(a[2]) if a.size() > 2 else 1000
	var wins := {}
	var games := {}
	var total_w := {}
	var total_g := {}
	var frames := 0
	var t0 := Time.get_ticks_msec()
	var seed_value := seed_base
	for i: int in range(IDS.size()):
		for j: int in range(IDS.size()):
			if i == j:
				continue
			for k: int in range(per):
				seed_value += 1
				var w := SimFactory.world(IDS[i], IDS[j], STAGES[seed_value % STAGES.size()], seed_value, {"ringout": true})
				var a0 := AIController.new()
				a0.setup(w, 0, lv, false)
				var a1 := AIController.new()
				a1.setup(w, 1, lv, false)
				for _f: int in range(60 * 60 * 4):
					w.step(a0.next_input(w), a1.next_input(w))
					if w.phase == SE.PH_MATCH_END:
						break
				frames += w.frame
				var key := IDS[i] + ">" + IDS[j]
				games[key] = int(games.get(key, 0)) + 1
				total_g[IDS[i]] = int(total_g.get(IDS[i], 0)) + 1
				total_g[IDS[j]] = int(total_g.get(IDS[j], 0)) + 1
				if w.match_winner == 0:
					wins[key] = int(wins.get(key, 0)) + 1
					total_w[IDS[i]] = int(total_w.get(IDS[i], 0)) + 1
				elif w.match_winner == 1:
					var key2 := IDS[j] + ">" + IDS[i]
					wins[key2] = int(wins.get(key2, 0)) + 1
					total_w[IDS[j]] = int(total_w.get(IDS[j], 0)) + 1
	var md := "# バランスレポート\n\nCPU レベル %d 同士、各組 %d 試合 × 左右入れ替え（計 %d 試合、%.1f 分）。\n\n" % [lv, per, per * IDS.size() * (IDS.size() - 1), (Time.get_ticks_msec() - t0) / 60000.0]
	md += "## 総合勝率（基準 40〜60%）\n\n| キャラ | 勝率 | 判定 |\n|---|---|---|\n"
	var lines: Array = []
	for id: String in IDS:
		var r := float(total_w.get(id, 0)) / maxf(1.0, float(total_g.get(id, 0)))
		lines.append([id, r])
	lines.sort_custom(func(x: Array, y: Array) -> bool: return float(x[1]) > float(y[1]))
	for l: Array in lines:
		var r2 := float(l[1])
		md += "| %s | %.1f%% | %s |\n" % [l[0], r2 * 100.0, "OK" if r2 >= 0.40 and r2 <= 0.60 else "要調整"]
	md += "\n## 対戦表（行のキャラから見た勝率）\n\n| | " + " | ".join(IDS) + " |\n|---" + "|---".repeat(IDS.size()) + "|\n"
	for x: String in IDS:
		var row := "| **%s** |" % x
		for y: String in IDS:
			if x == y:
				row += " — |"
				continue
			var g := int(games.get(x + ">" + y, 0)) + int(games.get(y + ">" + x, 0))
			var wv := int(wins.get(x + ">" + y, 0))
			row += " %d%% |" % int(round(100.0 * float(wv) / maxf(1.0, float(g))))
		md += row + "\n"
	DirAccess.make_dir_recursive_absolute("res://reports")
	var f := FileAccess.open("res://reports/balance.md", FileAccess.WRITE)
	f.store_string(md)
	f.close()
	print(md)
	quit(0)
