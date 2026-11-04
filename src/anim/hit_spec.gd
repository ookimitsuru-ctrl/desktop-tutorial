class_name HitSpec
extends RefCounted
## 技の攻撃判定（ボーン線分上の区間 t0→t1 のカプセル + 半径）。
## moves.json の "hit"/"hit2"（{"seg": ボーン名, "t0", "t1", "r"}）か、アニメテンプレートからの既定値。


static func _c(bone_name: String, t0: float, t1: float, r: float) -> Dictionary:
	return {"bone": Rig.bone_index(bone_name), "t0": t0, "t1": t1, "r": r}


## 戻り値: [{bone, t0, t1, r}, ...]（最大2）
static func for_move(md: Dictionary, lead: int) -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	if md.has("hit"):
		out.append(_parse(md["hit"]))
		if md.has("hit2"):
			out.append(_parse(md["hit2"]))
		return out
	var an: Dictionary = md.get("anim", {})
	var t := String(an.get("t", "punch"))
	var lv := String(md.get("lv", "mid"))
	if lv in ["throw", "lthrow", "parry", "none", "stance"]:
		return out
	var side_s := String(an.get("side", ""))
	match t:
		"punch":
			var side := AnimTemplates.side_of(side_s) if side_s != "" else lead
			var p := "Right" if side > 0 else "Left"
			out.append(_c(p + "Hand", 0.0, 1.0, 0.07))
			if String(an.get("style", "")) == "double":
				var q := "Left" if side > 0 else "Right"
				out.append(_c(q + "Hand", 0.0, 1.0, 0.07))
			else:
				out.append(_c(p + "LowerArm", 0.35, 1.0, 0.05))
		"elbow":
			var side2 := AnimTemplates.side_of(side_s) if side_s != "" else -lead
			var pe := "Right" if side2 > 0 else "Left"
			out.append(_c(pe + "LowerArm", 0.0, 0.3, 0.085))
			out.append(_c(pe + "UpperArm", 0.5, 1.0, 0.065))
		"kick", "knee":
			var side3 := AnimTemplates.side_of(side_s) if side_s != "" else -lead
			var pk := "Right" if side3 > 0 else "Left"
			var style2 := String(an.get("style", "front"))
			if t == "knee" or style2 in ["knee", "jump_knee"]:
				out.append(_c(pk + "LowerLeg", 0.0, 0.25, 0.10))
				out.append(_c(pk + "UpperLeg", 0.55, 1.0, 0.08))
			else:
				out.append(_c(pk + "Foot", 0.0, 1.0, 0.08))
				out.append(_c(pk + "LowerLeg", 0.25, 1.0, 0.065))
		"headbutt":
			out.append(_c("Head", 0.15, 0.65, 0.115))
		"shoulder":
			var ps := "Left" if lead < 0 else "Right"
			out.append(_c(ps + "UpperArm", 0.0, 0.45, 0.12))
			out.append(_c("Chest", 0.3, 0.9, 0.15))
		"down_attack":
			out.append(_c("RightHand", 0.0, 1.0, 0.11))
			out.append(_c("RightLowerArm", 0.3, 1.0, 0.07))
		"wakeup":
			out.append(_c("RightFoot", 0.0, 1.0, 0.09))
			out.append(_c("RightLowerLeg", 0.3, 1.0, 0.07))
	return out


static func _parse(d: Dictionary) -> Dictionary:
	var t0 := float(str(d.get("t0", d.get("t", "0.0"))))
	var t1 := float(str(d.get("t1", d.get("t", "1.0"))))
	return {"bone": Rig.bone_index(String(d.get("seg", "RightHand"))), "t0": t0, "t1": t1, "r": float(str(d.get("r", "0.07")))}
