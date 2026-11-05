shader_type spatial;
render_mode cull_disabled;

// 端の大小が逆でも正しく動く smoothstep（GLSL では e0 >= e1 の smoothstep は未定義）
float ss(float e0, float e1, float x) {
	return e0 < e1 ? smoothstep(e0, e1, x) : 1.0 - smoothstep(e1, e0, x);
}
// リング床の手続き的マテリアル（pattern: 0 マット, 1 濡れたコンクリ, 2 石畳, 3 雪の石, 4 砂岩, 5 ヘリポート, 6 白砂利と敷石, 7 丸太, 8 灯台の石）
uniform int pattern = 0;
uniform vec4 base_color : source_color = vec4(0.2, 0.3, 0.5, 1.0);
uniform vec4 line_color : source_color = vec4(0.9, 0.9, 0.9, 1.0);
uniform vec4 alt_color : source_color = vec4(0.3, 0.3, 0.3, 1.0);
uniform float ring_half = 6.0;
uniform float wet = 0.0;
varying vec3 wpos;

float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise2(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash2(i), hash2(i + vec2(1, 0)), f.x), mix(hash2(i + vec2(0, 1)), hash2(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
	float v = 0.0;
	float a = 0.5;
	for (int i = 0; i < 4; i++) { v += a * noise2(p); p *= 2.03; a *= 0.5; }
	return v;
}
void vertex() { wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz; }
void fragment() {
	vec2 p = wpos.xz;
	vec3 col = base_color.rgb;
	float rough = 0.8;
	float edge_d = ring_half - max(abs(p.x), abs(p.y));
	if (pattern == 0) {
		col *= 0.92 + 0.08 * fbm(p * 3.0);
		float ln = ss(0.06, 0.03, abs(edge_d - 0.35)) + ss(0.035, 0.015, abs(length(p) - 2.0));
		col = mix(col, line_color.rgb, clamp(ln, 0.0, 1.0));
		rough = 0.65;
	} else if (pattern == 1) {
		float n = fbm(p * 1.5);
		col *= 0.75 + 0.35 * n;
		float ln = ss(0.08, 0.04, abs(edge_d - 0.25));
		col = mix(col, line_color.rgb, ln);
		rough = mix(0.85, 0.12, wet * ss(0.35, 0.65, fbm(p * 0.7 + 3.0)));
	} else if (pattern == 2 || pattern == 3 || pattern == 8) {
		vec2 g = p * (pattern == 8 ? 1.4 : 1.8);
		vec2 cell = floor(g);
		vec2 f = fract(g);
		float joint = ss(0.0, 0.06, f.x) * ss(1.0, 0.94, f.x) * ss(0.0, 0.06, f.y) * ss(1.0, 0.94, f.y);
		float tone = 0.8 + 0.3 * hash2(cell);
		col = mix(alt_color.rgb, col * tone * (0.85 + 0.25 * fbm(p * 4.0)), joint);
		if (pattern == 3) {
			float snow = ss(0.45, 0.7, fbm(p * 1.2 + 7.0));
			col = mix(col, vec3(0.92, 0.94, 0.98), snow * 0.85);
		}
		rough = mix(0.9, 0.2, wet);
	} else if (pattern == 4) {
		vec2 g = p * vec2(1.2, 2.4);
		vec2 cell = floor(g + vec2(floor(g.y) * 0.5, 0.0));
		vec2 f = fract(g + vec2(floor(g.y) * 0.5, 0.0));
		float joint = ss(0.0, 0.04, f.x) * ss(1.0, 0.96, f.x) * ss(0.0, 0.08, f.y) * ss(1.0, 0.92, f.y);
		col = mix(alt_color.rgb, col * (0.85 + 0.25 * hash2(cell)) * (0.85 + 0.2 * fbm(p * 6.0)), joint);
		float crack = ss(0.02, 0.0, abs(fbm(p * 2.0) - 0.5));
		col *= 1.0 - crack * 0.3;
	} else if (pattern == 5) {
		col *= 0.9 + 0.1 * fbm(p * 2.0);
		float r = length(p);
		float h = 0.0;
		vec2 q = p / 1.6;
		h += step(abs(q.x + 0.55), 0.13) * step(abs(q.y), 0.9);
		h += step(abs(q.x - 0.55), 0.13) * step(abs(q.y), 0.9);
		h += step(abs(q.y), 0.11) * step(abs(q.x), 0.6);
		float circ = ss(0.08, 0.04, abs(r - 3.2)) + ss(0.06, 0.03, abs(edge_d - 0.3));
		col = mix(col, line_color.rgb, clamp(h, 0.0, 1.0) * 0.9 + circ * 0.6);
		rough = 0.5;
	} else if (pattern == 6) {
		float n = noise2(p * 22.0) * 0.5 + noise2(p * 47.0) * 0.5;
		col = mix(col * 0.82, col * 1.08, n);
		vec2 g = p * 1.6 + vec2(floor(p.y * 1.6) * 0.5, 0.0);
		vec2 f = fract(g);
		vec2 cell = floor(g);
		float stone = step(0.72, hash2(cell)) * ss(0.0, 0.08, f.x) * ss(1.0, 0.92, f.x) * ss(0.0, 0.08, f.y) * ss(1.0, 0.92, f.y);
		col = mix(col, alt_color.rgb * (0.9 + 0.2 * noise2(p * 3.0)), stone);
	} else if (pattern == 7) {
		float plank = fract(p.x * 1.6);
		float seam = ss(0.0, 0.05, plank) * ss(1.0, 0.95, plank);
		float grain = noise2(vec2(p.x * 8.0, p.y * 0.8)) * 0.3 + noise2(vec2(p.x * 30.0, p.y * 3.0)) * 0.15;
		col = mix(alt_color.rgb, col * (0.8 + grain + 0.15 * hash2(vec2(floor(p.x * 1.6), 0.0))), seam);
		rough = mix(0.85, 0.3, wet);
	}
	ALBEDO = col;
	ROUGHNESS = rough;
	SPECULAR = 0.4;
}
