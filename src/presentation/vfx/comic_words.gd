class_name ComicWords
extends CanvasLayer
## アメコミ風の擬音（POW! / WHAM! など）。打撃が当たった位置のそばに飛び出して、すぐ消える。
## 見た目だけの演出（シミュレーションには関わらない）。画像は tools/gen/gen_onomatopoeia.py で生成

const WORDS: Array[String] = ["pow", "wham", "bam", "smash", "crash", "thwap", "slam", "splat", "zlonk", "thud"]
const POOL := 6
# 飛び出す大きさの推移（1/60 秒ごと）: 小さく出て、行き過ぎてから落ち着く
const POP: Array[float] = [0.3, 0.75, 1.12, 1.22, 1.12, 1.03, 1.0]

var enabled := true
var _tex: Dictionary = {}
var _sprites: Array[Sprite2D] = []
var _t: Array[float] = []
var _life: Array[float] = []
var _size: Array[float] = []
var _rot: Array[float] = []
var _next := 0
var _last_word := ""
var _last_time := -10.0
var _clock := 0.0


func _ready() -> void:
	layer = 4   # 体力ゲージなど（HUD = 5）の下
	for w: String in WORDS:
		var p := "res://assets/vfx/words/%s.png" % w
		if ResourceLoader.exists(p):
			_tex[w] = load(p)
	for i: int in range(POOL):
		var s := Sprite2D.new()
		s.visible = false
		s.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
		add_child(s)
		_sprites.append(s)
		_t.append(0.0)
		_life.append(0.0)
		_size.append(1.0)
		_rot.append(0.0)


## word: WORDS のどれか、screen: 画面上の位置（打点）、power: 0〜1（大きさと表示時間）、side: 打点から見て置く側（-1 左 / +1 右）
func spawn(word: String, screen: Vector2, power: float, side: float = 0.0) -> void:
	if not enabled or not _tex.has(word):
		return
	# 同じ語が続けざまに出ると読めないので、ごく短い間隔では出さない
	if word == _last_word and _clock - _last_time < 0.12:
		return
	_last_word = word
	_last_time = _clock
	var vp := get_viewport().get_visible_rect().size
	var s := _sprites[_next]
	var i := _next
	_next = (_next + 1) % POOL
	s.texture = _tex[word]
	var k := vp.y / 1080.0 * lerpf(0.42, 0.86, clampf(power, 0.0, 1.0))
	_size[i] = k
	_t[i] = 0.0
	_life[i] = lerpf(0.42, 0.8, clampf(power, 0.0, 1.0))
	_rot[i] = deg_to_rad(randf_range(-9.0, 9.0))
	var half := Vector2(s.texture.get_width(), s.texture.get_height()) * k * 0.5
	if is_zero_approx(side):
		side = -1.0 if screen.x > vp.x * 0.5 else 1.0
	var pos := screen + Vector2(side * half.x * 0.55 + randf_range(-20, 20) * k, -half.y * 0.95 - 30.0 * k)
	# 画面内に収め、上の体力ゲージには掛けない
	pos.x = clampf(pos.x, half.x + 12.0, vp.x - half.x - 12.0)
	pos.y = clampf(pos.y, vp.y * 0.16 + half.y, vp.y - half.y - 12.0)
	s.position = pos
	s.rotation = _rot[i]
	s.scale = Vector2.ONE * k * POP[0]
	s.modulate = Color(1, 1, 1, 1)
	s.visible = true
	move_child(s, get_child_count() - 1)


func _process(delta: float) -> void:
	_clock += delta
	for i: int in range(POOL):
		var s := _sprites[i]
		if not s.visible:
			continue
		_t[i] += delta
		var t := _t[i]
		if t >= _life[i]:
			s.visible = false
			continue
		var f := t * 60.0
		var idx := mini(int(f), POP.size() - 1)
		var nxt := mini(idx + 1, POP.size() - 1)
		var sc := lerpf(POP[idx], POP[nxt], f - floorf(f)) if idx < POP.size() - 1 else 1.0
		# 終わりは縮みながら消える
		var out := clampf((t - (_life[i] - 0.12)) / 0.12, 0.0, 1.0)
		s.scale = Vector2.ONE * _size[i] * sc * (1.0 - 0.35 * out)
		s.modulate.a = 1.0 - out
		s.rotation = _rot[i] + sin(t * 38.0) * 0.02 * (1.0 - clampf(t * 4.0, 0.0, 1.0))
		s.position.y -= delta * 26.0
