extends TestCase

const N := 5


func _w() -> SimWorld:
	var w := SimFactory.world("toma", "toma", "arena", 3, {"ringout": false})
	SimDriver.skip_intro(w)
	return w


func test_intro_to_fight() -> void:
	var w := SimFactory.world("toma", "toma", "arena", 3)
	eq(w.phase, SE.PH_INTRO, "starts in intro")
	SimDriver.skip_intro(w)
	eq(w.phase, SE.PH_FIGHT, "fight after intro")
	eq(w.f[0].hp, 1000)


func test_walk_forward_moves() -> void:
	var w := _w()
	var x0 := w.f[0].x
	for _k: int in range(30):
		w.step(SimDriver.inp(6), SimDriver.inp(N))
	check(w.f[0].x > x0 + FP.from_str("0.3"), "P1 walked forward")
	eq(w.f[0].state, SE.ST_WALK_F)


func test_p2_input_mirrored() -> void:
	var w := _w()
	var x0 := w.f[1].x
	# P2 は画面右。画面左（4）を押すと相手へ向かって前進
	for _k: int in range(30):
		w.step(SimDriver.inp(N), SimDriver.inp(4))
	check(w.f[1].x < x0 - FP.from_str("0.3"), "P2 walked toward P1")


func test_jab_hits() -> void:
	var w := _w()
	SimDriver.place(w, FP.from_str("0.8"))
	var seq := [SimDriver.inp(N, InputBits.P, InputBits.P), SimDriver.inp(N, 0, 0, InputBits.P)]
	var hit := false
	for k: int in range(30):
		w.step(seq[k] if k < seq.size() else SimDriver.inp(N), SimDriver.inp(N))
		for e: Dictionary in w.events:
			if String(e["kind"]) == "hit":
				hit = true
	check(hit, "jab connected")
	eq(w.f[1].hp, 950, "jab damage 50")


func test_crouch_dodges_high() -> void:
	var w := _w()
	SimDriver.place(w, FP.from_str("0.8"))
	for _k: int in range(6):
		w.step(SimDriver.inp(N), SimDriver.inp(2))
	var seq := [SimDriver.inp(N, InputBits.P, InputBits.P), SimDriver.inp(N, 0, 0, InputBits.P)]
	for k: int in range(30):
		w.step(seq[k] if k < seq.size() else SimDriver.inp(N), SimDriver.inp(2))
	eq(w.f[1].hp, 1000, "crouching avoids high")


func test_dash_and_evade() -> void:
	var w := _w()
	var x0 := w.f[0].x
	var seq := [SimDriver.inp(6), SimDriver.inp(N), SimDriver.inp(6)]
	var dashed := false
	for k: int in range(10):
		w.step(seq[k] if k < seq.size() else SimDriver.inp(N), SimDriver.inp(N))
		if w.f[0].state == SE.ST_DASH_F:
			dashed = true
	check(dashed, "66 dashes")
	check(w.f[0].x > x0, "moved")
	w = _w()
	w.step(SimDriver.inp(8), SimDriver.inp(N))
	eq(w.f[0].state, SE.ST_EVADE, "8 tap evades")
	var z0 := w.f[0].z
	for _k: int in range(12):
		w.step(SimDriver.inp(N), SimDriver.inp(N))
	check(w.f[0].z < z0 - FP.from_str("0.3"), "evaded away from camera (-z)")


func test_throw_and_escape() -> void:
	var w := _w()
	SimDriver.place(w, FP.from_str("0.75"))
	var pg := InputBits.P | InputBits.G
	var seq := [SimDriver.inp(N, pg, pg), SimDriver.inp(N, 0, 0, pg)]
	var thrown := false
	for k: int in range(120):
		w.step(seq[k] if k < seq.size() else SimDriver.inp(N), SimDriver.inp(N))
		if w.f[1].state == SE.ST_THROWN:
			thrown = true
	check(thrown, "throw connected")
	eq(w.f[1].hp, 750, "throw damage 250")
	# 抜け: 防御側が N+P+G
	w = _w()
	SimDriver.place(w, FP.from_str("0.75"))
	var escaped := false
	for k: int in range(60):
		var din := SimDriver.inp(N, pg, pg) if k == 6 else SimDriver.inp(N)
		w.step(seq[k] if k < seq.size() else SimDriver.inp(N), din)
		for e: Dictionary in w.events:
			if String(e["kind"]) == "throw_escape":
				escaped = true
	check(escaped, "throw escaped")
	eq(w.f[1].hp, 1000, "no damage on escape")


func test_launch_and_land() -> void:
	var w := _w()
	SimDriver.place(w, FP.from_str("0.8"))
	var seq: Array[int] = []
	for _k: int in range(10):
		seq.append(SimDriver.inp(2))
	seq.append(SimDriver.inp(N, InputBits.P, InputBits.P))
	seq.append(SimDriver.inp(N, 0, 0, InputBits.P))
	var launched := false
	var landed := false
	for k: int in range(150):
		w.step(seq[k] if k < seq.size() else SimDriver.inp(N), SimDriver.inp(N))
		if w.f[1].state == SE.ST_AIR:
			launched = true
		if launched and w.f[1].state == SE.ST_DOWN:
			landed = true
	check(launched, "rising punch launches")
	check(landed, "lands into down")
