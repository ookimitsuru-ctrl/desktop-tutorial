extends Node
## 設定（user://save/settings.json）。仕様: 08_ui_ux.md §8.7

signal changed(key: String)

const PATH := "user://save/settings.json"
const DEFAULTS := {
	"schema_version": 1,
	"rounds_to_win": 2,
	"round_seconds": 45,
	"ringout": true,
	"ko_replay": true,
	"intros": "full",
	"language": "ja",
	"touch_preset": "standard",
	"stick_mode": "floating",
	"stick_deadzone": 22,
	"stick_diag_deg": 36,
	"stick_hysteresis": 6,
	"button_scale": 100,
	"touch_opacity": 70,
	"vibration": 2,
	"quality": "auto",
	"render_scale": 0,
	"show_fps": false,
	"power_save": false,
	"camera_shake": 100,
	"hud_opacity": 100,
	"text_size": "standard",
	"vol_master": 80,
	"vol_bgm": 70,
	"vol_sfx": 85,
	"vol_voice": 85,
	"vol_announcer": 85,
	"photosensitive": false,
	"colorblind": "off",
	"stagger_gauge": true,
	"replay_autosave": true,
	"unlock_all": false,
	"assist_escape": false,
	"assist_tech": false,
	"p1_left_always": false,
	"touch_layout": {},
	"pad_map": {},
	"cpu_level": 4,
	"device_tier": "",
	"player_name": "PLAYER",
}

var data: Dictionary = {}


func _ready() -> void:
	load_settings()


func load_settings() -> void:
	data = DEFAULTS.duplicate(true)
	var v: Variant = SaveData.read_json(PATH)
	if v is Dictionary:
		for k: String in v:
			data[k] = v[k]
	# 以前の「端末の言語に合わせる」設定は日本語に置き換える（既定は日本語）
	if String(data.get("language", "ja")) == "auto":
		data["language"] = "ja"
	apply_audio()


func save_settings() -> void:
	SaveData.write_json(PATH, data)


func g(key: String) -> Variant:
	return data.get(key, DEFAULTS.get(key))


func s(key: String, value: Variant) -> void:
	data[key] = value
	save_settings()
	if key.begins_with("vol_"):
		apply_audio()
	changed.emit(key)


func apply_audio() -> void:
	for pair: Array in [["Master", "vol_master"], ["BGM", "vol_bgm"], ["SFX", "vol_sfx"], ["Voice", "vol_voice"], ["Announcer", "vol_announcer"], ["Ambience", "vol_sfx"]]:
		var idx := AudioServer.get_bus_index(String(pair[0]))
		if idx >= 0:
			var v := float(g(String(pair[1]))) / 100.0
			AudioServer.set_bus_volume_db(idx, linear_to_db(maxf(v, 0.0001)))
			AudioServer.set_bus_mute(idx, v <= 0.001)


func lang() -> String:
	var l := String(g("language"))
	return "en" if l == "en" else "ja"
