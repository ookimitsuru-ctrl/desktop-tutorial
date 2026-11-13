shader_type spatial;
// 打撃の閃光（加算・ビルボード）。life 0→1 で広がり消える
render_mode unshaded, blend_add, depth_draw_never, cull_disabled, shadows_disabled;

// 端の大小が逆でも正しく動く smoothstep（GLSL では e0 >= e1 の smoothstep は未定義）
float ss(float e0, float e1, float x) {
	return e0 < e1 ? smoothstep(e0, e1, x) : 1.0 - smoothstep(e1, e0, x);
}
uniform vec4 color : source_color = vec4(1.0, 0.85, 0.5, 1.0);
uniform float life = 0.0;
uniform float rays = 8.0;
uniform float seed = 0.0;
uniform int kind = 0; // 0 閃光, 1 リング, 2 盾（ガード）
void vertex() {
	MODELVIEW_MATRIX = VIEW_MATRIX * mat4(INV_VIEW_MATRIX[0], INV_VIEW_MATRIX[1], INV_VIEW_MATRIX[2], MODEL_MATRIX[3]);
	MODELVIEW_MATRIX = MODELVIEW_MATRIX * mat4(vec4(length(MODEL_MATRIX[0].xyz), 0.0, 0.0, 0.0), vec4(0.0, length(MODEL_MATRIX[1].xyz), 0.0, 0.0), vec4(0.0, 0.0, length(MODEL_MATRIX[2].xyz), 0.0), vec4(0.0, 0.0, 0.0, 1.0));
}
float hash(float n) { return fract(sin(n) * 43758.5453); }
void fragment() {
	vec2 p = (UV - 0.5) * 2.0;
	float r = length(p);
	float a = r > 0.0001 ? atan(p.y, p.x) : 0.0;   // 中心での atan(0,0) は未定義（NaN で黒い点になる）
	float t = life;
	float fade = 1.0 - ss(0.55, 1.0, t);
	float v = 0.0;
	if (kind == 0) {
		// smoothstep の端は小さい順に（逆順は GLSL では未定義）
		float core = 1.0 - ss(0.0, 0.35 * (1.0 - t) + 0.05, r);
		float ray = pow(abs(cos(a * rays * 0.5 + seed * 6.28)), 24.0);
		float raylen = 0.35 + 0.65 * ss(0.0, 0.35, t);
		float rr = ray * (1.0 - ss(raylen * 0.3, raylen, r)) * ss(0.0, 0.1, r);
		rr = isnan(rr) ? 0.0 : rr;
		v = core * 1.2 + rr * 1.2;
	} else if (kind == 1) {
		float rad = 0.2 + t * 0.8;
		v = (1.0 - ss(0.0, 0.08, abs(r - rad))) * 1.2;
	} else {
		float arc = (1.0 - ss(0.0, 0.12, abs(r - 0.7))) * (1.0 - ss(0.2, 0.9, abs(p.x)));
		float hexs = (1.0 - ss(0.85, 0.9, r)) * 0.25;
		v = arc * 1.4 + hexs * (1.0 - t);
	}
	// 白飛びしないよう HDR を控えめに（ブルームで少しだけ光る程度）
	ALBEDO = color.rgb * min(v, 1.3) * fade * 0.95;
	ALPHA = clamp(v * fade, 0.0, 1.0);
}
