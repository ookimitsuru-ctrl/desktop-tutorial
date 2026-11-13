extends SceneTree
## 技・アニメのポーズを横から並べて撮影（見た目の確認用）
## xvfb-run godot --path . -s res://tools/dev/contact_sheet.gd -- <char> <costume> <out.png> <anim[:frame]> ...
## frame 省略時: 技なら発生フレーム、それ以外は 1。"anim@all" で技の 6 段階を並べる

const COLS := 6
const CELL := Vector2i(320, 400)

var vp: SubViewport
var frame_wait := 0
var out_path := ""


func _init() -> void:
	var a := OS.get_cmdline_user_args()
	var cid := a[0]
	var costume := a[1]
	out_path = a[2]
	var cj := DataLoader.character_json(cid)
	var moves := DataLoader.moves_json(cid)
	var mdict := {}
	for md: Dictionary in moves:
		mdict[String(md["id"])] = md
	var lib := AnimLibrary.build(cj, moves)
	var pe := PoseEval.new(lib.rig)
	var shots: Array = []
	for k: int in range(3, a.size()):
		var spec := a[k]
		var nm := spec
		var fr := -1.0
		if spec.ends_with("@all"):
			nm = spec.trim_suffix("@all")
			var clip0: AnimClip = lib.clip(nm)
			if clip0 == null:
				continue
			for t: float in [0.0, 0.3, 0.6, 0.85, 1.0, 1.4]:
				var f0 := 1.0
				if mdict.has(nm):
					var st := float(mdict[nm]["f"][0])
					f0 = maxf(1.0, st * t) if t <= 1.0 else st + (clip0.length - st) * (t - 1.0) * 2.0
				else:
					f0 = maxf(1.0, clip0.length * t / 1.4)
				shots.append([nm, f0])
			continue
		if spec.contains(":"):
			nm = spec.get_slice(":", 0)
			fr = float(spec.get_slice(":", 1))
		if fr < 0:
			fr = float(mdict[nm]["f"][0]) if mdict.has(nm) else 1.0
		shots.append([nm, fr])
	var rows := int(ceil(shots.size() / float(COLS)))
	vp = SubViewport.new()
	vp.size = Vector2i(CELL.x * mini(COLS, shots.size()), CELL.y * rows)
	vp.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	vp.own_world_3d = true
	root.add_child(vp)
	var env := WorldEnvironment.new()
	var e := Environment.new()
	e.background_mode = Environment.BG_COLOR
	e.background_color = Color(0.11, 0.13, 0.17)
	e.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	e.ambient_light_color = Color(0.40, 0.44, 0.52)
	e.ambient_light_energy = 0.7
	e.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.environment = e
	vp.add_child(env)
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-45, 30, 0)
	sun.light_energy = 1.5
	vp.add_child(sun)
	# 各ショットを x 方向に 3m 間隔で並べ、列ごとにカメラ（正射影）を置くのは難しいので、
	# 1 台の正射影カメラで格子状に配置する
	var spacing := Vector2(2.0, 2.5)
	for k2: int in range(shots.size()):
		var col := k2 % COLS
		var row := k2 / COLS
		var m := CharacterModel.new()
		m.build(cid, costume, cj, 0, lib.rig)
		# 横から見る: キャラの前(-Z)を画面右(+X)へ
		m.rotation_degrees = Vector3(0, -90, 0)
		m.position = Vector3(col * spacing.x, -row * spacing.y, 0)
		vp.add_child(m)
		var clip: AnimClip = lib.clip(String(shots[k2][0]))
		if clip == null:
			print("no clip: ", shots[k2][0])
			continue
		var pose := clip.sample(float(shots[k2][1]))
		pe.evaluate(pose)
		m.apply_pose(pe)
		# 技の移動量を反映
		m.position.x += pose.root.z
		var lbl := Label3D.new()
		lbl.text = "%s @%d" % [shots[k2][0], int(shots[k2][1])]
		lbl.font_size = 28
		lbl.pixel_size = 0.004
		lbl.position = Vector3(col * spacing.x + 0.2, -row * spacing.y + 2.05, 0)
		lbl.no_depth_test = true
		vp.add_child(lbl)
		var fl := MeshInstance3D.new()
		var bm := BoxMesh.new()
		bm.size = Vector3(spacing.x * 0.95, 0.02, 1.0)
		fl.mesh = bm
		fl.position = Vector3(col * spacing.x + 0.25, -row * spacing.y - 0.01, 0)
		vp.add_child(fl)
	var cam := Camera3D.new()
	cam.projection = Camera3D.PROJECTION_ORTHOGONAL
	cam.size = spacing.y * rows
	cam.keep_aspect = Camera3D.KEEP_HEIGHT
	var cx := (mini(COLS, shots.size()) - 1) * spacing.x * 0.5 + 0.25
	var cy := -(rows - 1) * spacing.y * 0.5 + 1.0
	cam.position = Vector3(cx, cy + 0.3, 10)
	cam.rotation_degrees = Vector3(-2, 0, 0)
	vp.add_child(cam)


func _process(_d: float) -> bool:
	frame_wait += 1
	if frame_wait == 4:
		vp.get_texture().get_image().save_png(out_path)
		print("saved ", out_path)
		quit(0)
	return false
