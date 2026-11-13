class_name InputBits
extends RefCounted
## 1フレームの入力（u16）のエンコード。仕様: 12_data_formats.md §12.9
## bit0-3: 方向(1-9), bit4-6: held(P,K,G), bit7-9: pressed, bit10-12: released

const P := 1
const K := 2
const G := 4

const DIR_MASK := 0xF
const HELD_SHIFT := 4
const PRESSED_SHIFT := 7
const RELEASED_SHIFT := 10


static func make(dir: int, held: int, pressed: int, released: int) -> int:
	var d := dir if dir >= 1 and dir <= 9 else 5
	return d | ((held & 7) << HELD_SHIFT) | ((pressed & 7) << PRESSED_SHIFT) | ((released & 7) << RELEASED_SHIFT)


static func dir(v: int) -> int:
	var d := v & DIR_MASK
	return d if d >= 1 and d <= 9 else 5


static func held(v: int) -> int:
	return (v >> HELD_SHIFT) & 7


static func pressed(v: int) -> int:
	return (v >> PRESSED_SHIFT) & 7


static func released(v: int) -> int:
	return (v >> RELEASED_SHIFT) & 7


## 画面基準の方向を左右反転（自分が画面右側にいる時の 前後変換）
static func mirror_dir(d: int) -> int:
	match d:
		1: return 3
		3: return 1
		4: return 6
		6: return 4
		7: return 9
		9: return 7
	return d


static func with_dir(v: int, d: int) -> int:
	return (v & ~DIR_MASK) | d


static func is_down(d: int) -> bool:
	return d == 1 or d == 2 or d == 3


static func is_up(d: int) -> bool:
	return d == 7 or d == 8 or d == 9


static func is_fwd(d: int) -> bool:
	return d == 3 or d == 6 or d == 9


static func is_back(d: int) -> bool:
	return d == 1 or d == 4 or d == 7
