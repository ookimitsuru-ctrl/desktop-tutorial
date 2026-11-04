extends Node
## 画面確認用: 指定画面へ遷移し、指定フレームでスクリーンショットを保存する
## 環境変数 SHOT_SCREEN（既定 match）, SHOT_OUT（出力先ディレクトリ）, SHOT_FRAMES（"60,240,600"）, SHOT_STAGE, SHOT_CHARS

var frames: Array[int] = []
var out := ""
var n := 0


func _ready() -> void:
	get_tree().root.theme = UITheme.build_theme()
	out = OS.get_environment("SHOT_OUT")
	for s: String in OS.get_environment("SHOT_FRAMES").split(",", false):
		frames.append(s.to_int())
	if frames.is_empty():
		frames = [120, 400]
	var scr := OS.get_environment("SHOT_SCREEN")
	if scr == "":
		scr = "match"
	var chars := OS.get_environment("SHOT_CHARS").split(",", false)
	Game.mode = Game.Mode.WATCH if scr == "match" else Game.Mode.VERSUS
	Game.p_char = [chars[0] if chars.size() > 0 else "toma", chars[1] if chars.size() > 1 else "toma"]
	Game.p_costume = ["a", "a"]
	Game.p_color = [0, 1]
	Game.p_cpu = [7, 7]
	var st := OS.get_environment("SHOT_STAGE")
	Game.stage = st if st != "" else "arena"
	Game.setup_match_defaults()
	Game.seed_value = 12345
	Settings.data["intros"] = "skip"
	SceneRouter.goto(scr, {"mode": Game.mode}, 0.0)


func _process(_d: float) -> void:
	n += 1
	if frames.has(n):
		var img := get_viewport().get_texture().get_image()
		img.save_png("%s/shot_%04d.png" % [out, n])
		print("shot ", n)
	if n > frames.max():
		get_tree().quit(0)
