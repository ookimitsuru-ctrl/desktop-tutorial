extends SceneTree
## キャラクターモデルの静止画レンダリング（見た目確認用）
## xvfb-run godot --path . -s res://tools/dev/preview_model.gd -- toma a idle 1 out.png [anim2 frame2 ...]

var shots: Array = []
var out_path := ""
var frame_wait := 0
var vp: SubViewport
var model: CharacterModel
var pe: PoseEval
var lib: AnimLibrary
var cam: Camera3D


func _init() -> void:
	var a := OS.get_cmdline_user_args()
	var cid := a[0]
	var costume := a[1]
	out_path = a[2]
	var i := 3
	while i + 1 < a.size():
		shots.append([a[i], float(a[i + 1])])
		i += 2
	var cj := DataLoader.character_json(cid)
	lib = AnimLibrary.build(cj, DataLoader.moves_json(cid))
	pe = PoseEval.new(lib.rig)
	vp = SubViewport.new()
	vp.size = Vector2i(640 * maxi(1, mini(shots.size(), 4)), 720)
	vp.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	vp.own_world_3d = true
	root.add_child(vp)
	var env := WorldEnvironment.new()
	var e := Environment.new()
	e.background_mode = Environment.BG_COLOR
	e.background_color = Color(0.13, 0.15, 0.2)
	e.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	e.ambient_light_color = Color(0.45, 0.5, 0.6)
	e.ambient_light_energy = 0.8
	e.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.environment = e
	vp.add_child(env)
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-40, 35, 0)
	sun.light_energy = 1.6
	sun.shadow_enabled = true
	vp.add_child(sun)
	var floor_mesh := MeshInstance3D.new()
	var pm := PlaneMesh.new()
	pm.size = Vector2(20, 20)
	floor_mesh.mesh = pm
	var fm := StandardMaterial3D.new()
	fm.albedo_color = Color(0.25, 0.27, 0.3)
	floor_mesh.material_override = fm
	vp.add_child(floor_mesh)
	var n := shots.size()
	for k: int in range(n):
		var m := CharacterModel.new()
		m.build(cid, costume, cj, 0, lib.rig)
		m.position = Vector3((k - (n - 1) * 0.5) * 1.6, 0, 0)
		m.rotation_degrees = Vector3(0, -60, 0)
		vp.add_child(m)
		var clip: AnimClip = lib.clip(String(shots[k][0]))
		if clip == null:
			print("no clip ", shots[k][0])
			continue
		pe.evaluate(clip.sample(float(shots[k][1])))
		m.apply_pose(pe)
	cam = Camera3D.new()
	cam.fov = 30
	cam.position = Vector3(0, 1.1, 3.6 + n * 1.2)
	cam.look_at_from_position(cam.position, Vector3(0, 0.95, 0))
	vp.add_child(cam)


func _process(_d: float) -> bool:
	frame_wait += 1
	if frame_wait == 4:
		var img := vp.get_texture().get_image()
		img.save_png(out_path)
		print("saved ", out_path)
		quit(0)
	return false
