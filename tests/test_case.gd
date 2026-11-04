class_name TestCase
extends RefCounted
## 最小のテスト基底クラス（tests/run_tests.gd が test_ で始まるメソッドを実行する）

var failures: Array[String] = []
var current: String = ""
var asserts: int = 0


func check(cond: bool, msg: String) -> void:
	asserts += 1
	if not cond:
		failures.append("%s: %s" % [current, msg])


func eq(a: Variant, b: Variant, msg: String = "") -> void:
	asserts += 1
	if a != b:
		failures.append("%s: %s (expected %s, got %s)" % [current, msg, str(b), str(a)])


func near(a: int, b: int, tol: int, msg: String = "") -> void:
	asserts += 1
	if absi(a - b) > tol:
		failures.append("%s: %s (expected %d±%d, got %d)" % [current, msg, b, tol, a])
