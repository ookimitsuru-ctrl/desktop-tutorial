extends TestCase


func _random_run(seed_value: int, frames: int) -> PackedInt32Array:
	var w := SimFactory.world("toma", "toma", "arena", seed_value)
	var r := seed_value
	var sums := PackedInt32Array()
	var held0 := 0
	var held1 := 0
	for k: int in range(frames):
		r = SimRng.next(r)
		var d0 := 1 + (r % 9)
		r = SimRng.next(r)
		var b0 := r % 8 if (r >> 4) % 3 == 0 else 0
		r = SimRng.next(r)
		var d1 := 1 + (r % 9)
		r = SimRng.next(r)
		var b1 := r % 8 if (r >> 4) % 3 == 0 else 0
		var i0 := InputBits.make(d0, b0, b0 & ~held0, held0 & ~b0)
		var i1 := InputBits.make(d1, b1, b1 & ~held1, held1 & ~b1)
		held0 = b0
		held1 = b1
		w.step(i0, i1)
		if k % 60 == 0:
			sums.append(w.checksum())
	sums.append(w.checksum())
	return sums


func test_same_inputs_same_result() -> void:
	for sd: int in [11, 222, 3333]:
		var a := _random_run(sd, 3000)
		var b := _random_run(sd, 3000)
		eq(a, b, "seed %d checksums equal" % sd)


func test_snapshot_roundtrip() -> void:
	var w := SimFactory.world("toma", "toma", "arena", 5)
	var r := 99
	var inputs: Array[int] = []
	for k: int in range(1200):
		r = SimRng.next(r)
		inputs.append(InputBits.make(1 + r % 9, (r >> 5) % 8, (r >> 9) % 8 if (r >> 3) % 4 == 0 else 0, 0))
	for k: int in range(600):
		w.step(inputs[k], inputs[1199 - k])
	var snap := w.save_state()
	var c_mid := w.checksum()
	for k: int in range(600, 900):
		w.step(inputs[k], inputs[1199 - k])
	var c_end := w.checksum()
	w.load_state(snap)
	eq(w.checksum(), c_mid, "restored checksum")
	for k: int in range(600, 900):
		w.step(inputs[k], inputs[1199 - k])
	eq(w.checksum(), c_end, "replayed checksum after restore")


func test_serialization_covers_all_fields() -> void:
	var p := FighterState.new()
	var missing: Array[String] = []
	for prop: Dictionary in p.get_property_list():
		var usage := int(prop["usage"])
		if (usage & PROPERTY_USAGE_SCRIPT_VARIABLE) == 0:
			continue
		var n := String(prop["name"])
		if n == "hist":
			continue
		if not FighterState.FIELDS.has(n):
			missing.append(n)
	eq(missing.size(), 0, "missing fields: %s" % str(missing))
