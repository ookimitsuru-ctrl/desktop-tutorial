extends Node
## 起動: テーマ設定・端末ティア判定 → タイトルへ


func _ready() -> void:
	get_tree().root.theme = UITheme.build_theme()
	get_window().min_size = Vector2i(640, 360)
	Quality.detect_tier()
	_ui_actions()
	await get_tree().process_frame
	SceneRouter.goto("title", {}, 0.0)


## ゲームパッドでのメニュー操作（決定 = A、戻る = B）
func _ui_actions() -> void:
	var pairs := {"ui_accept": [JOY_BUTTON_A], "ui_cancel": [JOY_BUTTON_B, JOY_BUTTON_BACK]}
	for act: String in pairs:
		for b: int in pairs[act]:
			var e := InputEventJoypadButton.new()
			e.button_index = b
			if not InputMap.action_has_event(act, e):
				InputMap.action_add_event(act, e)
