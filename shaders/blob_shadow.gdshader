shader_type spatial;
render_mode unshaded, blend_mix, depth_draw_never, cull_disabled, shadows_disabled;

// 端の大小が逆でも正しく動く smoothstep（GLSL では e0 >= e1 の smoothstep は未定義）
float ss(float e0, float e1, float x) {
	return e0 < e1 ? smoothstep(e0, e1, x) : 1.0 - smoothstep(e1, e0, x);
}
uniform float strength = 0.42;
void fragment() {
	float d = length(UV - vec2(0.5)) * 2.0;
	float a = ss(1.0, 0.15, d) * strength;
	ALBEDO = vec3(0.0);
	ALPHA = a;
}
