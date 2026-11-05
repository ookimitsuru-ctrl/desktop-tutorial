shader_type spatial;
render_mode diffuse_lambert;

// 端の大小が逆でも正しく動く smoothstep（GLSL では e0 >= e1 の smoothstep は未定義）
float ss(float e0, float e1, float x) {
	return e0 < e1 ? smoothstep(e0, e1, x) : 1.0 - smoothstep(e1, e0, x);
}
uniform float excite = 0.0;
varying float v_rand;
void vertex() {
	float r = fract(sin(float(INSTANCE_ID) * 12.9898) * 43758.5453);
	v_rand = r;
	float bob = sin(TIME * (2.0 + r * 3.0 + excite * 6.0) + r * 6.28) * (0.02 + excite * 0.08);
	VERTEX.y += bob * ss(0.0, 1.0, VERTEX.y + 0.5);
}
void fragment() {
	ALBEDO = COLOR.rgb * (0.6 + 0.4 * v_rand);
	ROUGHNESS = 0.9;
}
