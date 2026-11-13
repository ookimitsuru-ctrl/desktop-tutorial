class_name StageDef
extends RefCounted
## ステージのリング定義（シミュレーション用）

var id: String = ""
var name_ja: String = ""
var name_en: String = ""
## 頂点（Q16.16、反時計回り）: x, z の交互
var vx: PackedInt32Array = PackedInt32Array()
var vz: PackedInt32Array = PackedInt32Array()
var edge_type: PackedInt32Array = PackedInt32Array()
var edge_height: PackedInt32Array = PackedInt32Array()
var edge_after: PackedInt32Array = PackedInt32Array()
var edge_hp: PackedInt32Array = PackedInt32Array()
var start_x: PackedInt32Array = PackedInt32Array()
var start_z: PackedInt32Array = PackedInt32Array()


func edge_count() -> int:
	return vx.size()

## 内向き単位法線（Q16.16）と、dot(n, v) の値（読み込み時に計算）
var edge_nx: PackedInt32Array = PackedInt32Array()
var edge_nz: PackedInt32Array = PackedInt32Array()
var edge_c: PackedInt32Array = PackedInt32Array()


## 頂点から法線を計算（向きは符号付き面積で判定）
func compute_normals() -> void:
	var n := vx.size()
	edge_nx.resize(n)
	edge_nz.resize(n)
	edge_c.resize(n)
	var area2 := 0
	for k: int in range(n):
		var k2 := (k + 1) % n
		area2 += ((vx[k] >> 8) * (vz[k2] >> 8)) - ((vx[k2] >> 8) * (vz[k] >> 8))
	for k: int in range(n):
		var k2 := (k + 1) % n
		var ex := vx[k2] - vx[k]
		var ez := vz[k2] - vz[k]
		var l := FP.len2(ex, ez)
		var nx := 0
		var nz := 0
		if area2 > 0:
			nx = -ez
			nz = ex
		else:
			nx = ez
			nz = -ex
		if l > 0:
			nx = (nx << 16) / l
			nz = (nz << 16) / l
		edge_nx[k] = nx
		edge_nz[k] = nz
		edge_c[k] = FP.mul(nx, vx[k]) + FP.mul(nz, vz[k])
