class_name SimChecksum
extends RefCounted
## FNV-1a 32bit（整数列）

const OFFSET := 0x811C9DC5
const PRIME := 0x01000193
const MASK := 0xFFFFFFFF


static func of_ints(buf: PackedInt32Array) -> int:
	var h := OFFSET
	for v: int in buf:
		var u := v & MASK
		for _b: int in range(4):
			h ^= u & 0xFF
			h = (h * PRIME) & MASK
			u >>= 8
	return h
