class_name SimRng
extends RefCounted
## 決定論的乱数（xorshift32）。状態はシミュレーション状態に含める。

const MASK := 0xFFFFFFFF


static func seed_state(seed_value: int) -> int:
	var s := seed_value & MASK
	if s == 0:
		s = 0x9E3779B9
	return s


## 次の状態を返す
static func next(state: int) -> int:
	var x := state & MASK
	x ^= (x << 13) & MASK
	x ^= x >> 17
	x ^= (x << 5) & MASK
	return x & MASK


## state から [0, n) の値（呼び出し側で状態を next() で進めること）
static func range_of(state: int, n: int) -> int:
	if n <= 0:
		return 0
	return (state >> 8) % n
