class_name BakedChar
extends RefCounted
## アニメーションからベイクした判定・移動量（整数 mm）。
## hurt: アニメごと・フレームごとに 11 カプセル × 7 値 (ax, ay, az, bx, by, bz, r)
## キャラ空間 [右, 上, 前]、原点はキャラ位置の床。

const CAPS := 11
const VALS := 7
## 攻撃判定: フレームごとに 2 カプセル × (ax, ay, az, bx, by, bz, r)
const HIT_STRIDE := 14

var anim_names: PackedStringArray = PackedStringArray()
## アニメ番号 → hurt 配列の開始オフセット / フレーム数
var anim_offset: PackedInt32Array = PackedInt32Array()
var anim_len: PackedInt32Array = PackedInt32Array()
var anim_loop: PackedInt32Array = PackedInt32Array()
var hurt: PackedInt32Array = PackedInt32Array()
## 技（アニメ番号で引く）のフレームごとの移動量 [右, 前] mm と攻撃球 2個 [r, u, f, radius] ×2 mm（radius 0 = なし）
var motion_offset: PackedInt32Array = PackedInt32Array()
var motion: PackedInt32Array = PackedInt32Array()
var hit_offset: PackedInt32Array = PackedInt32Array()
var hit: PackedInt32Array = PackedInt32Array()
## 投げ: 被投げ側の相対位置 [右, 上, 前] mm と相対向き（2進角）
var victim_offset: PackedInt32Array = PackedInt32Array()
var victim: PackedInt32Array = PackedInt32Array()
var source_hash: String = ""


## アニメ a のフレーム f（1 始まり）を範囲に丸めた hurt の開始位置
func hurt_base(a: int, f: int) -> int:
	if a < 0 or a >= anim_len.size():
		return -1
	var n := anim_len[a]
	if n <= 0:
		return -1
	var ff := f
	if anim_loop[a] == 1:
		ff = ((f - 1) % n + n) % n + 1
	ff = clampi(ff, 1, n)
	return anim_offset[a] + (ff - 1) * CAPS * VALS


func motion_at(a: int, f: int) -> int:
	if a < 0 or a >= motion_offset.size() or motion_offset[a] < 0:
		return -1
	var n := anim_len[a]
	if f < 1 or f > n:
		return -1
	return motion_offset[a] + (f - 1) * 2


func hit_at(a: int, f: int) -> int:
	if a < 0 or a >= hit_offset.size() or hit_offset[a] < 0:
		return -1
	var n := anim_len[a]
	if f < 1 or f > n:
		return -1
	return hit_offset[a] + (f - 1) * HIT_STRIDE


func victim_at(a: int, f: int) -> int:
	if a < 0 or a >= victim_offset.size() or victim_offset[a] < 0:
		return -1
	var n := anim_len[a]
	var ff := clampi(f, 1, n)
	return victim_offset[a] + (ff - 1) * 4
