shader_type spatial;
render_mode diffuse_lambert;

// 端の大小が逆でも正しく動く smoothstep（GLSL では e0 >= e1 の smoothstep は未定義）
float ss(float e0, float e1, float x) {
	return e0 < e1 ? smoothstep(e0, e1, x) : 1.0 - smoothstep(e1, e0, x);
}
uniform float excite = 0.0;
varying float v_rand;
varying float v_y;
void vertex() {
	float r = fract(sin(float(INSTANCE_ID) * 12.9898) * 43758.5453);
	v_rand = r;
	float bob = sin(TIME * (2.0 + r * 3.0 + excite * 6.0) + r * 6.28) * (0.02 + excite * 0.08);
	v_y = VERTEX.y;
	// 盛り上がると立ち上がって体を揺らす（人によって反応が違う）
	float up = excite * step(0.45, fract(r * 7.31)) * (0.06 + 0.05 * sin(TIME * 7.0 + r * 40.0));
	VERTEX.y += bob * ss(0.0, 1.0, VERTEX.y + 0.5) + up;
	VERTEX.x += sin(TIME * (1.3 + r * 2.0) + r * 20.0) * 0.015 * ss(-0.1, 0.3, VERTEX.y);
}
void fragment() {
	// 上が頭（肌と髪）、下が服。丸い棒を人影に見せる
	float r2 = fract(v_rand * 17.13);
	vec3 skin = mix(vec3(0.42, 0.28, 0.2), vec3(0.78, 0.6, 0.48), r2) * 0.55;
	vec3 hair = mix(vec3(0.03, 0.025, 0.02), vec3(0.22, 0.14, 0.07), fract(v_rand * 5.7));
	vec3 shirt = COLOR.rgb * (0.6 + 0.4 * v_rand);
	float head = ss(0.10, 0.125, v_y);
	float top = ss(0.235, 0.255, v_y);
	float neck = 1.0 - 0.45 * (1.0 - ss(0.0, 0.03, abs(v_y - 0.11)));
	ALBEDO = mix(shirt, mix(skin, hair, top), head) * neck;
	ROUGHNESS = 0.9;
	// 観客席のカメラのフラッシュ（盛り上がるほど増える）
	float tick = floor(TIME * 10.0);
	float f = step(0.9975 - excite * 0.01, fract(sin(v_rand * 913.7 + tick * 12.9898) * 43758.5453));
	EMISSION = vec3(1.0, 1.0, 0.95) * f * 4.0;
}
