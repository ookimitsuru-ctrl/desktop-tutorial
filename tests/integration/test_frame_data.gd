extends TestCase
## 全キャラの全技のフレームデータを実測してデータと照合する


func _verify(id: String) -> void:
	var errs := FrameDataCheck.verify(id)
	for e: String in errs:
		check(false, e)


func test_frame_data_toma() -> void:
	_verify("toma")


func test_frame_data_lena() -> void:
	_verify("lena")


func test_frame_data_bjorn() -> void:
	_verify("bjorn")


func test_frame_data_zaw() -> void:
	_verify("zaw")


func test_frame_data_yuelan() -> void:
	_verify("yuelan")


func test_frame_data_mariel() -> void:
	_verify("mariel")


func test_frame_data_adrien() -> void:
	_verify("adrien")


func test_frame_data_ravi() -> void:
	_verify("ravi")


func test_frame_data_gensai() -> void:
	_verify("gensai")
