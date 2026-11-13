class_name HealthBar
extends Control
## 体力バー（直前の被ダメージを遅れて減らす表示）

var value := 1.0
var delayed := 1.0
var delay_t := 0.0
var right_to_left := false
var color := UITheme.P1
var low_pulse := 0.0


func set_value(v: float) -> void:
	if v < value:
		delay_t = 0.6
	elif v > value:
		delayed = v
	value = v
	queue_redraw()


func _process(delta: float) -> void:
	if delay_t > 0.0:
		delay_t -= delta
	elif delayed > value:
		delayed = maxf(value, delayed - delta / 0.4 * maxf(0.05, delayed - value + 0.05))
		queue_redraw()
	if value < 0.3:
		low_pulse += delta * 4.0
		queue_redraw()


func _draw() -> void:
	var r := Rect2(Vector2.ZERO, size)
	var skew := size.y * 0.6
	_poly(r, 0.0, 1.0, Color(0, 0, 0, 0.55), skew)
	_poly(r.grow(-3), 0.0, 1.0, Color(0.12, 0.12, 0.15, 0.9), skew)
	_poly(r.grow(-3), value, delayed, Color(0.98, 0.95, 0.9), skew)
	var c := color
	if value < 0.3:
		c = c.lerp(UITheme.DANGER, 0.55 + 0.25 * sin(low_pulse))
	_poly(r.grow(-3), 0.0, value, c, skew)
	_poly(Rect2(r.position + Vector2(3, 3), Vector2(r.size.x - 6, (r.size.y - 6) * 0.35)), 0.0, value, Color(1, 1, 1, 0.18), skew * 0.35)


## 体力の f0..f1 区間を、中央から外側へ伸びる向きで描く
func _poly(r: Rect2, f0: float, f1: float, c: Color, skew: float) -> void:
	if f1 <= f0:
		return
	var w := r.size.x
	var x0 := 0.0
	var x1 := 0.0
	if right_to_left:
		x0 = r.position.x + w * f0
		x1 = r.position.x + w * f1
	else:
		x0 = r.position.x + w * (1.0 - f1)
		x1 = r.position.x + w * (1.0 - f0)
	var y0 := r.position.y
	var y1 := r.position.y + r.size.y
	var pts := PackedVector2Array()
	if right_to_left:
		pts = [Vector2(x0, y0), Vector2(x1, y0), Vector2(x1 - skew, y1), Vector2(x0 - skew, y1)]
	else:
		pts = [Vector2(x0, y0), Vector2(x1, y0), Vector2(x1 + skew, y1), Vector2(x0 + skew, y1)]
	draw_colored_polygon(pts, c)
