extends TestCase


func test_toma_frame_data() -> void:
	var errs := FrameDataCheck.verify("toma")
	for e: String in errs:
		check(false, e)
