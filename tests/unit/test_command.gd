extends TestCase


func test_parse() -> void:
	var c := CommandSpec.parse("46P+K")
	eq(c.buttons, InputBits.P | InputBits.K)
	eq(c.motion.size(), 2)
	var c2 := CommandSpec.parse("2P+G")
	eq(c2.dir, 2)
	eq(c2.buttons, InputBits.P | InputBits.G)
	var c3 := CommandSpec.parse("3_6")
	eq(c3.buttons, 0)
	eq(c3.motion.size(), 2)
	check(CommandSpec.parse("P").valid, "P valid")
	check(not CommandSpec.parse("X").valid, "X invalid")


func test_dir_match() -> void:
	check(CommandSpec.dir_matches(2, 1), "2 matches 1")
	check(CommandSpec.dir_matches(2, 3), "2 matches 3")
	check(not CommandSpec.dir_matches(3, 2), "3 not 2")
	check(CommandSpec.dir_matches(0, 9), "any")
