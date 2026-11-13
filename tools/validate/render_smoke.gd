extends Node
## 描画の実行確認: 全ステージで CPU 同士の試合を短く描画し、残像・全種類のヒット火花・土煙も出して、
## すべてのシェーダーを実際にコンパイルさせる（ヘッドレスではシェーダーがコンパイルされないため）。
## 使い方（GPU なしでも可。ソフトウェアの Vulkan を使う）:
##   xvfb-run -a godot --path . --rendering-driver vulkan --resolution 640x360 res://tools/validate/render_smoke.tscn [-- --stages arena,raft]
## 出力の "SHADER ERROR" / "ERROR:" を CI 側で検査する。

var STAGES: Array[String] = ["arena", "harbor", "bamboo", "fort", "ruins", "skyline", "temple", "raft", "lighthouse"]
const HITS: Array[String] = ["light", "medium", "heavy", "counter", "guard", "throw", "break", "evade"]

var idx := -1
var wait := 0
var fx_at := -1


func _ready() -> void:
	get_tree().root.theme = UITheme.build_theme()
	Settings.data["intros"] = "skip"
	var args := OS.get_cmdline_user_args()
	for i: int in range(args.size() - 1):
		if args[i] == "--stages":
			STAGES.assign(args[i + 1].split(",", false))
	wait = 30
	SceneRouter.goto("main_menu", {}, 0.0)


func _next() -> void:
	idx += 1
	if idx >= STAGES.size():
		print("render_smoke: %d stage(s) rendered" % STAGES.size())
		if SceneRouter.current != null:
			SceneRouter.current.queue_free()
			SceneRouter.current = null
		AudioHub.release_all()
		var t0 := Time.get_ticks_msec()
		while Time.get_ticks_msec() - t0 < 400:
			await get_tree().process_frame
		get_tree().quit(0)
		return
	var ids := DataDB.characters()
	Game.mode = Game.Mode.WATCH
	Game.p_char = [ids[idx % ids.size()], ids[(idx + 4) % ids.size()]]
	Game.p_costume = ["a", "b"]
	Game.p_color = [0, 1]
	Game.p_cpu = [8, 8]
	Game.stage = STAGES[idx]
	Game.setup_match_defaults()
	Game.seed_value = 500 + idx
	print("render_smoke: ", Game.stage, " ", Game.p_char)
	wait = 70
	fx_at = 30
	SceneRouter.goto("match", {"mode": Game.mode}, 0.0)


func _process(_d: float) -> void:
	if idx >= STAGES.size():
		return
	wait -= 1
	if wait == fx_at:
		var m := SceneRouter.current
		if m != null and m.get("vfx") != null:
			for k: String in HITS:
				m.vfx.hit(Vector3(0, 1.2, 0), k)
			m.vfx.dust(Vector3(0, 0.05, 0), 18, Color(0.7, 0.68, 0.62))
			for f: FighterView in m.fighters:
				f.spawn_ghosts()
	if wait <= 0:
		_next()
