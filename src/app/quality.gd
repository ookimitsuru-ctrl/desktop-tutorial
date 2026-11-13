class_name Quality
extends RefCounted
## 端末ティアの判定と品質プリセット（0 Low, 1 Medium, 2 High, 3 Ultra）。仕様: 13_performance.md


static func detect_tier() -> int:
	var cached := String(Settings.g("device_tier"))
	if cached != "":
		return int(cached)
	var tier := 2
	if OS.has_feature("mobile"):
		var mem := OS.get_static_memory_peak_usage()
		var gpu := RenderingServer.get_video_adapter_name().to_lower()
		var compat := RenderingServer.get_current_rendering_method() == "gl_compatibility"
		tier = 1
		for hi: String in ["adreno (tm) 7", "adreno (tm) 8", "immortalis", "mali-g7", "mali-g6", "xclipse", "adreno 7", "adreno 8"]:
			if gpu.contains(hi):
				tier = 2
		for lo: String in ["adreno (tm) 5", "adreno (tm) 6", "mali-g5", "powervr", "mali-t"]:
			if gpu.contains(lo) and not gpu.contains("adreno (tm) 66") and not gpu.contains("adreno (tm) 69"):
				tier = 0
		if compat:
			tier = mini(tier, 1)
		var _m := mem
	Settings.s("device_tier", str(tier))
	return tier


static func current_preset() -> int:
	var q := String(Settings.g("quality"))
	if bool(Settings.g("power_save")):
		return 0
	match q:
		"low":
			return 0
		"medium":
			return 1
		"high":
			return 2
		"ultra":
			return 3
	return detect_tier()


static func apply_viewport(vp: Viewport, preset: int) -> void:
	var scales := [0.65, 0.8, 0.9, 1.0]
	var rs := int(Settings.g("render_scale"))
	var s := float(scales[clampi(preset, 0, 3)]) if rs <= 0 else rs / 100.0
	if bool(Settings.g("power_save")):
		s = 0.6
	# FSR は Forward+ のみ。Mobile / Compatibility レンダラーでは双線形で拡大する
	var forward_plus := RenderingServer.get_current_rendering_method() == "forward_plus"
	vp.scaling_3d_mode = Viewport.SCALING_3D_MODE_FSR if (s < 0.99 and forward_plus) else Viewport.SCALING_3D_MODE_BILINEAR
	vp.scaling_3d_scale = s
	vp.msaa_3d = [Viewport.MSAA_DISABLED, Viewport.MSAA_2X, Viewport.MSAA_4X, Viewport.MSAA_4X][clampi(preset, 0, 3)]
	vp.screen_space_aa = Viewport.SCREEN_SPACE_AA_FXAA if preset == 0 else Viewport.SCREEN_SPACE_AA_DISABLED
