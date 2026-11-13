extends Node
## 入力デバイスの管理と、プレイヤーごとの InputFrame（画面基準・InputBits）の生成。
## 仕様: 03_controls_and_input.md §3.5

signal device_pressed(device: String)
signal pause_requested(device: String)

const P := InputBits.P
const K := InputBits.K
const G := InputBits.G

## 物理キー → [デバイス, 種別, 値]（種別: "dir" or "btn"）
var key_map := {
	KEY_W: ["kb1", "up"], KEY_S: ["kb1", "down"], KEY_A: ["kb1", "left"], KEY_D: ["kb1", "right"],
	KEY_J: ["kb1", P], KEY_K: ["kb1", K], KEY_L: ["kb1", G],
	KEY_U: ["kb1", P | G], KEY_I: ["kb1", P | K], KEY_O: ["kb1", K | G],
	KEY_UP: ["kb2", "up"], KEY_DOWN: ["kb2", "down"], KEY_LEFT: ["kb2", "left"], KEY_RIGHT: ["kb2", "right"],
	KEY_KP_1: ["kb2", P], KEY_KP_2: ["kb2", K], KEY_KP_3: ["kb2", G],
	KEY_KP_4: ["kb2", P | G], KEY_KP_5: ["kb2", P | K], KEY_KP_6: ["kb2", K | G],
}
## ゲームパッドのボタン → ゲームボタン
var pad_map := {
	JOY_BUTTON_X: P, JOY_BUTTON_B: K, JOY_BUTTON_A: G, JOY_BUTTON_Y: P | K,
	JOY_BUTTON_RIGHT_SHOULDER: P | G, JOY_BUTTON_LEFT_SHOULDER: P | K | G,
}
var pad_trigger_map := {JOY_AXIS_TRIGGER_RIGHT: K | G, JOY_AXIS_TRIGGER_LEFT: 0}

## デバイス状態: name → {dir_bits(上下左右の押下), held, latch_press, latch_release, src_counts}
var dev: Dictionary = {}
## プレイヤーに割り当てたデバイス
var assign: Array = [["touch", "kb1", "pad"], ["kb2"]]
## タッチ（TouchControls が書き込む）
var touch_dir: int = 5
var touch_active: bool = false
var last_device: String = "touch"
var enabled: bool = true


func _ready() -> void:
	Input.use_accumulated_input = false
	process_mode = Node.PROCESS_MODE_ALWAYS
	for d: String in ["kb1", "kb2", "touch"]:
		_ensure(d)
	Input.joy_connection_changed.connect(_on_joy)


func _ensure(d: String) -> Dictionary:
	if not dev.has(d):
		dev[d] = {"up": false, "down": false, "left": false, "right": false, "held": 0, "lp": 0, "lr": 0,
			"counts": {P: 0, K: 0, G: 0}, "stick": 5, "trig": {}}
	return dev[d]


func _on_joy(device: int, connected: bool) -> void:
	if not connected:
		pause_requested.emit("pad:%d" % device)


func _input(event: InputEvent) -> void:
	if event is InputEventKey:
		var ek := event as InputEventKey
		if ek.echo:
			return
		var code := ek.physical_keycode if ek.physical_keycode != 0 else ek.keycode
		if code == KEY_ESCAPE and ek.pressed:
			pause_requested.emit("kb1")
			return
		if key_map.has(code):
			var m: Array = key_map[code]
			_apply(String(m[0]), m[1], ek.pressed)
	elif event is InputEventJoypadButton:
		var eb := event as InputEventJoypadButton
		var dname := "pad:%d" % eb.device
		if eb.button_index == JOY_BUTTON_START and eb.pressed:
			pause_requested.emit(dname)
			return
		match eb.button_index:
			JOY_BUTTON_DPAD_UP:
				_apply(dname, "up", eb.pressed)
			JOY_BUTTON_DPAD_DOWN:
				_apply(dname, "down", eb.pressed)
			JOY_BUTTON_DPAD_LEFT:
				_apply(dname, "left", eb.pressed)
			JOY_BUTTON_DPAD_RIGHT:
				_apply(dname, "right", eb.pressed)
			_:
				if pad_map.has(eb.button_index):
					_apply(dname, int(pad_map[eb.button_index]), eb.pressed)
	elif event is InputEventJoypadMotion:
		var em := event as InputEventJoypadMotion
		var dn := "pad:%d" % em.device
		var st := _ensure(dn)
		if em.axis == JOY_AXIS_LEFT_X or em.axis == JOY_AXIS_LEFT_Y:
			var v := Vector2(Input.get_joy_axis(em.device, JOY_AXIS_LEFT_X), Input.get_joy_axis(em.device, JOY_AXIS_LEFT_Y))
			st["stick"] = quantize(Vector2(v.x, -v.y), 0.25, 36.0, int(st["stick"]))
			last_device = dn
		elif pad_trigger_map.has(em.axis):
			var b := int(pad_trigger_map[em.axis])
			var on := em.axis_value > 0.5
			var trig: Dictionary = st["trig"]
			if b != 0 and bool(trig.get(em.axis, false)) != on:
				trig[em.axis] = on
				_apply(dn, b, on)


## d: デバイス名, what: "up"/"down"/"left"/"right" かボタンのビット
func _apply(d: String, what: Variant, pressed: bool) -> void:
	var st := _ensure(d)
	last_device = d
	if what is String:
		st[what] = pressed
		if pressed:
			device_pressed.emit(d)
		return
	var bits := int(what)
	var counts: Dictionary = st["counts"]
	for b: int in [P, K, G]:
		if (bits & b) == 0:
			continue
		var before := int(counts[b])
		counts[b] = maxi(0, before + (1 if pressed else -1))
		var now := int(counts[b])
		if before == 0 and now > 0:
			st["held"] = int(st["held"]) | b
			st["lp"] = int(st["lp"]) | b
		elif before > 0 and now == 0:
			st["held"] = int(st["held"]) & ~b
			st["lr"] = int(st["lr"]) | b
	if pressed:
		device_pressed.emit(d)


## タッチ UI からのボタン押下/解放
func touch_button(bits: int, pressed: bool) -> void:
	_apply("touch", bits, pressed)
	touch_active = true


func touch_set_dir(d: int) -> void:
	touch_dir = d
	touch_active = true
	last_device = "touch"


## 8 方向の量子化（v: 右・上が正）。上下左右 = 90-diag 度幅、斜め = diag 度幅
static func quantize(v: Vector2, deadzone: float, diag_deg: float, prev: int) -> int:
	if v.length() < deadzone:
		return 5
	var ang := rad_to_deg(atan2(v.y, v.x))
	if ang < 0:
		ang += 360.0
	var card := 90.0 - diag_deg
	# 区分: 右(6) は -card/2..card/2
	var dirs := [6, 9, 8, 7, 4, 1, 2, 3]
	var start := -card * 0.5
	var a := ang - start
	if a < 0:
		a += 360.0
	var idx := 0
	var acc := 0.0
	for k: int in range(8):
		var w := card if k % 2 == 0 else diag_deg
		if a < acc + w:
			idx = k
			break
		acc += w
	var d: int = dirs[idx]
	# ヒステリシス: 境界付近なら前回の方向を維持
	if prev != 5 and prev != d:
		var hyst := 6.0
		var prev_center := _dir_center(prev, card, diag_deg)
		var diff := absf(fposmod(ang - prev_center + 180.0, 360.0) - 180.0)
		var half := (card if prev in [6, 8, 4, 2] else diag_deg) * 0.5
		if diff <= half + hyst:
			return prev
	return d


static func _dir_center(d: int, card: float, diag: float) -> float:
	var order := [6, 9, 8, 7, 4, 1, 2, 3]
	var start := -card * 0.5
	var acc := start
	for k: int in range(8):
		var w := card if k % 2 == 0 else diag
		if order[k] == d:
			return acc + w * 0.5
		acc += w
	return 0.0


func _dir_of(st: Dictionary) -> int:
	var x := (1 if bool(st["right"]) else 0) - (1 if bool(st["left"]) else 0)
	var y := (1 if bool(st["up"]) else 0) - (1 if bool(st["down"]) else 0)
	var d := 5 + x + 3 * y
	if d == 5 and st.has("stick"):
		d = int(st["stick"])
	return d


func _devices_for(player: int) -> Array[String]:
	var out: Array[String] = []
	if player < 0 or player >= assign.size():
		return out
	for d: String in assign[player]:
		if d == "pad":
			for k: String in dev.keys():
				if k.begins_with("pad:") and not _pad_taken(k, player):
					out.append(k)
		else:
			out.append(d)
	return out


func _pad_taken(pad: String, player: int) -> bool:
	for p2: int in range(assign.size()):
		if p2 != player and (assign[p2] as Array).has(pad):
			return true
	return false


## プレイヤーの今フレームの入力（画面基準）。ラッチを消費する
func sample(player: int) -> int:
	if not enabled:
		return InputBits.make(5, 0, 0, 0)
	var d := 5
	var held := 0
	var pr := 0
	var rl := 0
	for name: String in _devices_for(player):
		var st := _ensure(name)
		var dd := touch_dir if name == "touch" else _dir_of(st)
		if d == 5 and dd != 5:
			d = dd
		held |= int(st["held"])
		pr |= int(st["lp"])
		rl |= int(st["lr"])
		st["lp"] = 0
		st["lr"] = 0
	return InputBits.make(d, held, pr, rl)


func clear_latches() -> void:
	for k: String in dev.keys():
		dev[k]["lp"] = 0
		dev[k]["lr"] = 0


func reset_all() -> void:
	for k: String in dev.keys():
		var st: Dictionary = dev[k]
		st["held"] = 0
		st["lp"] = 0
		st["lr"] = 0
		st["counts"] = {P: 0, K: 0, G: 0}
		for dk: String in ["up", "down", "left", "right"]:
			st[dk] = false
	touch_dir = 5


func uses_touch(player: int) -> bool:
	return (assign[player] as Array).has("touch") if player < assign.size() else false


func vibrate(player: int, ms: int, strength: float) -> void:
	var lvl := int(Settings.g("vibration"))
	if lvl <= 0:
		return
	var amp := clampf(strength * lvl / 3.0, 0.05, 1.0)
	if uses_touch(player) and last_device == "touch" and OS.has_feature("mobile"):
		Input.vibrate_handheld(ms, amp)
	for name: String in _devices_for(player):
		if name.begins_with("pad:"):
			Input.start_joy_vibration(name.substr(4).to_int(), amp * 0.6, amp, ms / 1000.0)
