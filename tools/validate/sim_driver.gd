class_name SimDriver
extends RefCounted
## テスト・検証用のシミュレーション操作ヘルパー

const N := 5


static func inp(dir: int, held: int = 0, pressed: int = 0, released: int = 0) -> int:
	return InputBits.make(dir, held, pressed, released)


static func skip_intro(w: SimWorld) -> void:
	var guard := 0
	while w.phase == SE.PH_INTRO and guard < 1000:
		w.step(inp(N), inp(N))
		guard += 1


## 両者を中心間距離 dist（Q16.16）で x 軸上に向かい合わせに置く
static func place(w: SimWorld, dist: int) -> void:
	w.f[0].x = -dist / 2
	w.f[1].x = dist - dist / 2
	w.f[0].z = 0
	w.f[1].z = 0
	w.cam_x = 0
	w.cam_z = FP.ONE
	w._face_each_other()
	for i: int in range(2):
		FighterCtl.set_state(w.f[i], SE.ST_STAND, 0)
		w.f[i].hp = w.rules.health
		PoseRef.update(w, i)


## 技のコマンドを P1（画面左）の入力列にする。from 文脈ごとの前置き入力を含む
static func command_inputs(m: MoveDef, from_ctx: String) -> Array[int]:
	var out: Array[int] = []
	var c := m.cmd
	match from_ctx:
		"crouch":
			for _k: int in range(8):
				out.append(inp(2))
		"rise":
			for _k2: int in range(10):
				out.append(inp(2))
		"dash":
			out.append(inp(6))
			out.append(inp(N))
			out.append(inp(6))
			for _k3: int in range(6):
				out.append(inp(6))
	for d: int in c.motion:
		out.append(inp(d))
	var last_dir := N
	if c.motion.size() > 0:
		last_dir = c.motion[c.motion.size() - 1]
	if c.dir != 0:
		last_dir = c.dir
	if from_ctx == "crouch" and c.dir == 0:
		last_dir = 2
	if from_ctx == "rise":
		last_dir = N
	out.append(inp(last_dir, c.buttons, c.buttons, 0))
	out.append(inp(N, 0, 0, c.buttons))
	return out


static func is_neutral(p: FighterState) -> bool:
	return FighterCtl.is_neutral_state(p.state)
