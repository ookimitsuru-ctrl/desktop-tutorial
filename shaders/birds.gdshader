shader_type spatial;
// 遠くを飛ぶ鳥（羽ばたく板）
render_mode unshaded, cull_disabled, shadows_disabled;
uniform vec4 color : source_color = vec4(0.05, 0.05, 0.06, 1.0);

void vertex() {
	float f = sin(TIME * 8.0 + float(INSTANCE_ID) * 1.9);
	VERTEX.y += abs(VERTEX.x) * f * 0.55;
}

void fragment() {
	ALBEDO = color.rgb;
}
