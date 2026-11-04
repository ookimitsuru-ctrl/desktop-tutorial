class_name CommandSpec
extends RefCounted
## コマンド文字列（例: "46P+K", "2P+G", "41236P+G", "3_6", "P"）を解析した結果と照合。
## 仕様: 02_combat_system.md §2.3, 12_data_formats.md §12.11

## 必要なボタン（InputBits.P/K/G のビット和）。0 ならモーションのみのコマンド
var buttons: int = 0
## ボタン押下時の方向（0=任意, 2 は 1/2/3 を含む, その他は完全一致）
var dir: int = 0
## モーション（方向の並び）。最後の方向はボタン押下時またはその直前 6F 以内
var motion: PackedInt32Array = PackedInt32Array()
var valid: bool = true
var text: String = ""


static func parse(s: String) -> CommandSpec:
	var c := CommandSpec.new()
	c.text = s
	var t := s.strip_edges().replace("(", "").replace(")", "").replace("[J]", "")
	var digits := ""
	var i := 0
	while i < t.length() and (t[i] in "123456789_"):
		if t[i] != "_":
			digits += t[i]
		i += 1
	var rest := t.substr(i)
	if rest.length() > 0:
		for part: String in rest.split("+"):
			match part:
				"P":
					c.buttons |= InputBits.P
				"K":
					c.buttons |= InputBits.K
				"G":
					c.buttons |= InputBits.G
				"":
					pass
				_:
					c.valid = false
	if digits.length() == 1:
		c.dir = digits.to_int()
	elif digits.length() > 1:
		for ch: String in digits:
			c.motion.append(ch.to_int())
	if c.buttons == 0 and c.motion.size() == 0:
		c.valid = false
	return c


func button_count() -> int:
	return (buttons & 1) + ((buttons >> 1) & 1) + ((buttons >> 2) & 1)


func base_priority() -> int:
	return button_count() * 100 + motion.size() * 10


static func dir_matches(spec_dir: int, d: int) -> bool:
	if spec_dir == 0:
		return true
	if spec_dir == 2:
		return d == 1 or d == 2 or d == 3
	return spec_dir == d


## 方向一致の強さ（完全一致を優先）
static func dir_score(spec_dir: int, d: int) -> int:
	if spec_dir == 0:
		return 0
	return 6 if spec_dir == d else 3
