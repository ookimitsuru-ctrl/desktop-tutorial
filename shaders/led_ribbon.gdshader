shader_type spatial;
// 闘技場の客席前を一周する帯状の電光板（流れる模様。文字や実在の意匠は使わない）
render_mode cull_disabled;
uniform vec4 color_a : source_color = vec4(0.1, 0.35, 1.0, 1.0);
uniform vec4 color_b : source_color = vec4(1.0, 0.25, 0.1, 1.0);
uniform float len = 30.0;
uniform float phase = 0.0;
uniform float excite = 0.0;

void fragment() {
	float x = (UV.x - 0.5) * len;
	float t = TIME * (1.2 + excite * 2.5) + phase;
	// 山形（シェブロン）が流れる区間と、点滅する升目の区間を交互に
	float seg = floor((x + t * 0.6) / 6.0);
	float kind = step(0.5, fract(seg * 0.5));
	float chev = step(0.5, fract((x + t * 1.6) * 0.9 - abs(UV.y - 0.5) * 1.6));
	vec2 cell = floor(vec2((x + t * 0.6) * 4.0, UV.y * 4.0));
	float blink = step(0.45, fract(sin(dot(cell, vec2(12.9898, 78.233)) + floor(TIME * 3.0) * 1.7) * 43758.5453));
	float v = mix(chev, blink, kind);
	vec3 c = mix(color_a.rgb, color_b.rgb, step(0.5, fract(seg * 0.25 + 0.1)));
	// 発光素子の粒
	vec2 px = fract(vec2(x * 16.0, UV.y * 10.0)) - 0.5;
	float dot_m = 1.0 - smoothstep(0.25, 0.48, length(px));
	float border = step(0.08, UV.y) * step(UV.y, 0.92);
	ALBEDO = vec3(0.015);
	EMISSION = c * (0.12 + 0.88 * v) * (0.5 + 0.5 * dot_m) * border * (1.3 + excite * 0.8);
	ROUGHNESS = 0.5;
}
