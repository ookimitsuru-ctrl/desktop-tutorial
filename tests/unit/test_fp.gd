extends TestCase


func test_from_str() -> void:
	eq(FP.from_str("1"), 65536)
	eq(FP.from_str("0.5"), 32768)
	eq(FP.from_str("-1.25"), -81920)
	eq(FP.from_str("0.0065"), 426)
	eq(FP.from_str("2.40"), 157286)


func test_mul_div() -> void:
	eq(FP.mul(FP.from_int(3), FP.from_str("0.5")), FP.from_str("1.5"))
	eq(FP.div(FP.from_int(3), FP.from_int(2)), FP.from_str("1.5"))
	eq(FP.mul(FP.from_int(-3), FP.from_str("0.5")), -FP.from_str("1.5"))


func test_sqrt() -> void:
	eq(FP.sqrt(FP.from_int(4)), FP.from_int(2))
	near(FP.sqrt(FP.from_int(2)), 92682, 2)
	eq(FP.isqrt(1000000), 1000)


func test_trig() -> void:
	near(FP.sin(0), 0, 1)
	near(FP.sin(FP.ANG_QUARTER), FP.ONE, 1)
	near(FP.cos(0), FP.ONE, 1)
	near(FP.sin(FP.deg(30)), FP.HALF, 40)
	near(FP.atan2(FP.ONE, 0), FP.ANG_QUARTER, 8)
	near(FP.atan2(0, -FP.ONE), FP.ANG_HALF, 8)
	near(FP.atan2(-FP.ONE, -FP.ONE), FP.deg(225), 16)


func test_ang_diff() -> void:
	near(FP.ang_diff(FP.deg(10), FP.deg(350)), FP.deg(20), 2)
	near(FP.ang_diff(FP.deg(350), FP.deg(10)), -FP.deg(20), 2)
