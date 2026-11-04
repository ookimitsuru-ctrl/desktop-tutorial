class_name FP
extends RefCounted
## 固定小数点 Q16.16 と 2進角の演算（シミュレーション専用・浮動小数点不使用）。
## 仕様: docs/spec/11_technical_architecture.md §11.6

const SHIFT := 16
const ONE := 65536
const HALF := 32768
## 2進角: 65536 = 360°
const ANG_FULL := 65536
const ANG_HALF := 32768
const ANG_QUARTER := 16384


static func from_int(i: int) -> int:
	return i << SHIFT


static func to_int(v: int) -> int:
	# 0 方向への切り捨て
	if v >= 0:
		return v >> SHIFT
	return -((-v) >> SHIFT)


static func mul(a: int, b: int) -> int:
	var p := a * b
	if p >= 0:
		return p >> SHIFT
	return -((-p) >> SHIFT)


static func div(a: int, b: int) -> int:
	if b == 0:
		return 0
	return (a << SHIFT) / b


## 整数 × 有理数 (num/den) を 0 方向切り捨てで
static func scale(v: int, num: int, den: int) -> int:
	if den == 0:
		return 0
	return (v * num) / den


## 10進文字列（"0.70", "-1.25", "3"）を浮動小数点を経由せず Q16.16 に変換（四捨五入）。
static func from_str(s: String) -> int:
	var t := s.strip_edges()
	if t.is_empty():
		return 0
	var neg := false
	if t.begins_with("-"):
		neg = true
		t = t.substr(1)
	elif t.begins_with("+"):
		t = t.substr(1)
	var parts := t.split(".")
	var ip := 0
	if parts[0].length() > 0:
		ip = parts[0].to_int()
	var result := ip * ONE
	if parts.size() > 1:
		var frac := parts[1]
		if frac.length() > 9:
			frac = frac.substr(0, 9)
		var digits := frac.length()
		if digits > 0:
			var f := frac.to_int()
			var den := 1
			for _i: int in range(digits):
				den *= 10
			# 四捨五入: (f * ONE * 2 + den) / (2 * den)
			result += (f * ONE * 2 + den) / (2 * den)
	return -result if neg else result


## 任意の値（int / String / float は禁止）を Q16.16 に。JSON から読む時に使う。
static func from_variant(v: Variant) -> int:
	if v is String:
		return from_str(v)
	if v is int:
		return from_int(v)
	push_error("FP.from_variant: 小数は文字列で記述すること: %s" % [str(v)])
	return 0


## 整数平方根（floor）
static func isqrt(n: int) -> int:
	if n <= 0:
		return 0
	var x := n
	var y := (x + 1) >> 1
	while y < x:
		x = y
		y = (x + n / x) >> 1
	return x


## Q16.16 の平方根
static func sqrt(v: int) -> int:
	if v <= 0:
		return 0
	return isqrt(v << SHIFT)


## 2進角の正規化（0..65535）
static func ang(a: int) -> int:
	return a & 0xFFFF


## 2進角の差（-32768..32767）
static func ang_diff(a: int, b: int) -> int:
	var d := (a - b) & 0xFFFF
	if d >= ANG_HALF:
		d -= ANG_FULL
	return d


## 度 → 2進角（整数度）
static func deg(d: int) -> int:
	return ((d * ANG_FULL) / 360) & 0xFFFF


static func sin(a: int) -> int:
	var aa := a & 0xFFFF
	var idx := aa >> 4
	var fr := aa & 15
	var s0: int = TrigTable.SIN[idx]
	var s1: int = TrigTable.SIN[idx + 1]
	return s0 + (((s1 - s0) * fr) >> 4)


static func cos(a: int) -> int:
	# 注意: クラス内で sin() と書くと組み込み関数に解決されるため FP. を付ける
	return FP.sin(a + ANG_QUARTER)


## atan2(y, x) → 2進角。x 軸正方向が 0、反時計回り（y 正）が正。
static func atan2(y: int, x: int) -> int:
	if x == 0 and y == 0:
		return 0
	var ax := absi(x)
	var ay := absi(y)
	var t := 0
	if ax >= ay:
		t = TrigTable.ATAN[(ay * TrigTable.ATAN_N) / ax]
	else:
		t = ANG_QUARTER - int(TrigTable.ATAN[(ax * TrigTable.ATAN_N) / ay])
	if x < 0:
		t = ANG_HALF - t
	if y < 0:
		t = -t
	return t & 0xFFFF


## 2D ベクトル長（Q16.16）
static func len2(x: int, z: int) -> int:
	return isqrt(x * x + z * z)


## 3D ベクトル長
static func len3(x: int, y: int, z: int) -> int:
	return isqrt(x * x + y * y + z * z)


static func clampi_(v: int, lo: int, hi: int) -> int:
	return lo if v < lo else (hi if v > hi else v)


## 線形補間 a→b を t/den で
static func lerpi(a: int, b: int, t: int, den: int) -> int:
	if den == 0:
		return b
	return a + ((b - a) * t) / den
