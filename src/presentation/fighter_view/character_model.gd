class_name CharacterModel
extends Node3D
## キャラクターの見た目（glb の骨格メッシュ + パレットシェーダー）。ポーズは PoseEval の結果を適用する。

const SHADER := preload("res://shaders/character.gdshader")
const GHOST_SHADER := preload("res://shaders/character_ghost.gdshader")
const SLOT_KEYS: Array[String] = ["skin", "hair", "primary", "secondary", "accent", "gloves", "shoes", "eye", "dark", "lips", "metal", "tertiary"]

var skeleton: Skeleton3D
var mesh: MeshInstance3D
var material: ShaderMaterial
var bone_map: PackedInt32Array = PackedInt32Array()
var rig: Rig


static func load_glb(path: String) -> Node:
	if ResourceLoader.exists(path):
		var ps: PackedScene = load(path)
		if ps != null:
			return ps.instantiate()
	var doc := GLTFDocument.new()
	var state := GLTFState.new()
	var err := doc.append_from_file(ProjectSettings.globalize_path(path), state)
	if err != OK:
		push_error("glb 読み込み失敗: " + path)
		return null
	return doc.generate_scene(state)


## ghost: 残像用（半透明のシェーダーを使う）
func build(char_id: String, costume: String, char_json: Dictionary, color_idx: int, p_rig: Rig, ghost: bool = false) -> void:
	rig = p_rig
	var path := "res://assets/characters/%s/%s_%s.glb" % [char_id, char_id, costume]
	var scene := load_glb(path)
	if scene == null:
		return
	add_child(scene)
	skeleton = _find_skeleton(scene)
	mesh = _find_mesh(scene)
	material = ShaderMaterial.new()
	material.shader = GHOST_SHADER if ghost else SHADER
	set_colors(char_json, color_idx)
	if mesh != null:
		mesh.material_override = material
		mesh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	bone_map.resize(Rig.B.COUNT)
	for i: int in range(Rig.B.COUNT):
		bone_map[i] = skeleton.find_bone(Rig.NAMES[i]) if skeleton != null else -1


func set_colors(char_json: Dictionary, color_idx: int) -> void:
	var cols: Array = char_json.get("colors", [{}])
	var c: Dictionary = cols[clampi(color_idx, 0, cols.size() - 1)]
	var model: Dictionary = char_json.get("model", {})
	var defaults := {
		"skin": model.get("skin", "#D9A57E"), "hair": "#1A1614", "primary": "#DDDDDD", "secondary": "#333344",
		"accent": "#AA3333", "gloves": "#222222", "shoes": "#2A2A2A", "eye": "#F4F1EA", "dark": "#1A1210",
		"lips": "#B07060", "metal": "#C9A548", "tertiary": "#444444",
	}
	var arr := PackedVector4Array()
	for k: String in SLOT_KEYS:
		var hex := String(c.get(k, defaults[k]))
		var col := Color.from_string(hex, Color.MAGENTA).srgb_to_linear()
		arr.append(Vector4(col.r, col.g, col.b, 1.0))
	material.set_shader_parameter("palette", arr)


func _find_skeleton(n: Node) -> Skeleton3D:
	if n is Skeleton3D:
		return n
	for c: Node in n.get_children():
		var r := _find_skeleton(c)
		if r != null:
			return r
	return null


func _find_mesh(n: Node) -> MeshInstance3D:
	if n is MeshInstance3D:
		return n
	for c: Node in n.get_children():
		var r := _find_mesh(c)
		if r != null:
			return r
	return null


## PoseEval の結果をスケルトンへ
func apply_pose(pe: PoseEval, extra_rot: Dictionary = {}) -> void:
	if skeleton == null:
		return
	for i: int in range(Rig.B.COUNT):
		var bi := bone_map[i]
		if bi < 0:
			continue
		var q := pe.local_rot[i]
		if extra_rot.has(i):
			q = q * (extra_rot[i] as Quaternion)
		skeleton.set_bone_pose_rotation(bi, q)
	var hb := bone_map[Rig.B.HIPS]
	if hb >= 0:
		skeleton.set_bone_pose_position(hb, pe.hips_pos)
