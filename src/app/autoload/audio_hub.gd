extends Node
## 音の再生（BGM・効果音・ボイス・アナウンス）とバス管理。仕様: 10_audio.md

const SFX_DIR := "res://assets/audio/sfx/"
const BGM_DIR := "res://assets/audio/bgm/"
const POOL := 24

var _sfx_players: Array[AudioStreamPlayer] = []
var _sfx_next := 0
var _cache: Dictionary = {}
var _bgm: AudioStreamPlayer
var _bgm_b: AudioStreamPlayer
var _bgm_id := ""
var _voice: Array[AudioStreamPlayer] = []
var _amb: AudioStreamPlayer
var _amb_id := ""
var _ann: AudioStreamPlayer
var _ann_queue: Array[AudioStream] = []
var _duck := 0.0


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	_setup_buses()
	for i: int in range(POOL):
		var p := AudioStreamPlayer.new()
		p.bus = "SFX"
		add_child(p)
		_sfx_players.append(p)
	_bgm = AudioStreamPlayer.new()
	_bgm.bus = "BGM"
	add_child(_bgm)
	_bgm_b = AudioStreamPlayer.new()
	_bgm_b.bus = "BGM"
	add_child(_bgm_b)
	for i2: int in range(2):
		var v := AudioStreamPlayer.new()
		v.bus = "Voice"
		add_child(v)
		_voice.append(v)
	_ann = AudioStreamPlayer.new()
	_ann.bus = "Announcer"
	add_child(_ann)
	_amb = AudioStreamPlayer.new()
	_amb.bus = "Ambience"
	add_child(_amb)
	Settings.apply_audio()


func _setup_buses() -> void:
	for n: String in ["BGM", "SFX", "Voice", "Announcer", "Ambience", "UI"]:
		if AudioServer.get_bus_index(n) < 0:
			AudioServer.add_bus()
			var idx := AudioServer.bus_count - 1
			AudioServer.set_bus_name(idx, n)
			AudioServer.set_bus_send(idx, "Master")
	var mi := AudioServer.get_bus_index("Master")
	if AudioServer.get_bus_effect_count(mi) == 0:
		var lim := AudioEffectHardLimiter.new()
		lim.ceiling_db = -1.0
		AudioServer.add_bus_effect(mi, lim)


func _stream(path: String) -> AudioStream:
	if _cache.has(path):
		return _cache[path]
	var s: AudioStream = null
	if ResourceLoader.exists(path):
		s = load(path)
	_cache[path] = s
	return s


## 効果音。id は assets/audio/sfx/<id>.wav（バリエーションは id_1, id_2 … を自動選択）
func sfx(id: String, vol_db: float = 0.0, pitch_var: float = 0.04) -> void:
	var s := _stream(SFX_DIR + id + ".wav")
	if s == null:
		var n := 0
		while _stream(SFX_DIR + "%s_%d.wav" % [id, n + 1]) != null and n < 8:
			n += 1
		if n == 0:
			return
		s = _stream(SFX_DIR + "%s_%d.wav" % [id, randi() % n + 1])
	var p := _sfx_players[_sfx_next]
	_sfx_next = (_sfx_next + 1) % POOL
	p.stream = s
	p.volume_db = vol_db
	p.pitch_scale = 1.0 + randf_range(-pitch_var, pitch_var)
	p.play()


func ui(id: String) -> void:
	sfx("ui_" + id, -4.0, 0.0)


func voice(char_id: String, kind: String, player: int) -> void:
	var base := "res://assets/audio/voice/%s/%s" % [char_id, kind]
	var n := 0
	while _stream("%s_%d.wav" % [base, n + 1]) != null and n < 6:
		n += 1
	if n == 0:
		return
	var p := _voice[clampi(player, 0, 1)]
	p.stream = _stream("%s_%d.wav" % [base, randi() % n + 1])
	p.play()


## アナウンス。queue = true なら再生中の声が終わってから続けて流す（例: "K.O." → "Perfect"）
func announce(id: String, queue: bool = false) -> void:
	var s := _stream("res://assets/audio/announcer/%s.wav" % id)
	if s == null:
		return
	if queue and _ann.playing:
		_ann_queue.append(s)
		return
	_ann_queue.clear()
	_ann.stream = s
	_ann.play()
	duck(0.6)


func bgm(id: String, fade: float = 0.6) -> void:
	if id == _bgm_id and _bgm.playing:
		return
	_bgm_id = id
	var s := _stream(BGM_DIR + id + ".ogg")
	var old := _bgm
	_bgm = _bgm_b
	_bgm_b = old
	if s != null:
		_bgm.stream = s
		_bgm.volume_db = -40.0
		_bgm.play()
		var tw := create_tween()
		tw.tween_property(_bgm, "volume_db", 0.0, fade)
	if old.playing:
		var tw2 := create_tween()
		tw2.tween_property(old, "volume_db", -40.0, fade)
		tw2.tween_callback(old.stop)


## ステージの環境音（ループ）。id が空なら止める
func ambience(id: String, fade: float = 1.0) -> void:
	if id == _amb_id and _amb.playing:
		return
	_amb_id = id
	var s := _stream("res://assets/audio/ambience/%s.ogg" % id) if id != "" else null
	if s == null:
		stop_ambience(fade)
		return
	_amb.stream = s
	_amb.volume_db = -40.0
	_amb.play()
	var tw := create_tween()
	tw.tween_property(_amb, "volume_db", -6.0, fade)


func stop_ambience(fade: float = 0.6) -> void:
	_amb_id = ""
	if _amb.playing:
		var tw := create_tween()
		tw.tween_property(_amb, "volume_db", -40.0, fade)
		tw.tween_callback(_amb.stop)


func stop_bgm(fade: float = 0.5) -> void:
	_bgm_id = ""
	if _bgm.playing:
		var tw := create_tween()
		tw.tween_property(_bgm, "volume_db", -40.0, fade)
		tw.tween_callback(_bgm.stop)


## BGM を一時的に下げる（打撃・アナウンス）
func duck(amount: float) -> void:
	_duck = maxf(_duck, amount)


func _process(delta: float) -> void:
	if not _ann_queue.is_empty() and not _ann.playing:
		_ann.stream = _ann_queue.pop_front()
		_ann.play()
		duck(0.6)
	var bi := AudioServer.get_bus_index("BGM")
	if bi < 0:
		return
	_duck = maxf(0.0, _duck - delta * 1.2)
	var base := float(Settings.g("vol_bgm")) / 100.0
	AudioServer.set_bus_volume_db(bi, linear_to_db(maxf(base * (1.0 - 0.5 * _duck), 0.0001)))
