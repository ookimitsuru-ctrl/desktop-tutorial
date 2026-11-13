extends Node
## セッション状態（モードと試合設定の受け渡し）

enum Mode { VERSUS, ARCADE, TRAINING, TUTORIAL, TRIAL, SURVIVAL, TIME_ATTACK, REPLAY, WATCH, QUICK }

var mode: int = Mode.VERSUS
## 試合設定
var p_char: Array = ["toma", "toma"]
var p_costume: Array = ["a", "a"]
var p_color: Array = [0, 1]
## 0 = 人, 1-8 = CPU レベル
var p_cpu: Array = [0, 4]
var stage: String = "arena"
var seed_value: int = 1
var rounds_to_win: int = 2
var round_seconds: int = 45
var ringout: bool = true
## アーケード進行
var arcade: Dictionary = {}
var survival: Dictionary = {}
var replay_path: String = ""
var tutorial_lesson: int = 0
var trial_index: int = 0
var last_result: Dictionary = {}


func setup_match_defaults() -> void:
	rounds_to_win = int(Settings.g("rounds_to_win"))
	round_seconds = int(Settings.g("round_seconds"))
	ringout = bool(Settings.g("ringout"))
	seed_value = int(Time.get_unix_time_from_system()) & 0x7FFFFFFF


func ensure_colors_differ() -> void:
	if p_char[0] == p_char[1] and p_costume[0] == p_costume[1] and p_color[0] == p_color[1]:
		p_color[1] = (p_color[0] + 1) % 4
