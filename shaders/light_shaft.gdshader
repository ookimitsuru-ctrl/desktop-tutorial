shader_type spatial;
// 木漏れ日の光の筋（斜めに置いた板）。ゆっくり揺らぐ。加算合成
render_mode unshaded, blend_add, cull_disabled, depth_draw_never, shadows_disabled, fog_disabled;
uniform vec4 color : source_color = vec4(1.0, 0.95, 0.8, 1.0);
uniform float strength = 0.18;
uniform float seed = 0.0;

float ss(float e0, float e1, float x) {
	return e0 < e1 ? smoothstep(e0, e1, x) : 1.0 - smoothstep(e1, e0, x);
}
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise2(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash2(i), hash2(i + vec2(1, 0)), f.x), mix(hash2(i + vec2(0, 1)), hash2(i + vec2(1, 1)), f.x), f.y);
}

void fragment() {
	float x = abs(UV.x - 0.5) * 2.0;
	float rays = 0.55 + 0.45 * noise2(vec2(UV.x * 7.0 + seed, TIME * 0.12 + seed));
	float a = (1.0 - x) * (1.0 - x) * ss(0.0, 0.2, UV.y) * ss(1.0, 0.55, UV.y) * rays;
	ALBEDO = color.rgb;
	ALPHA = clamp(a * strength, 0.0, 1.0);
}
