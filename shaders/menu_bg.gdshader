shader_type canvas_item;

// 端の大小が逆でも正しく動く smoothstep（GLSL では e0 >= e1 の smoothstep は未定義）
float ss(float e0, float e1, float x) {
	return e0 < e1 ? smoothstep(e0, e1, x) : 1.0 - smoothstep(e1, e0, x);
}
// メニュー背景: 深い藍黒に朱の斜光と細い線
uniform vec4 base : source_color = vec4(0.043, 0.059, 0.102, 1.0);
uniform vec4 accent : source_color = vec4(0.91, 0.27, 0.17, 1.0);
uniform float t_scale = 1.0;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void fragment() {
	vec2 uv = UV;
	float t = TIME * 0.05 * t_scale;
	vec3 col = base.rgb * (0.8 + 0.4 * uv.y);
	float band = ss(0.35, 0.0, abs(uv.x * 0.7 - uv.y * 0.9 + 0.25 - sin(t) * 0.05));
	col += accent.rgb * band * 0.10;
	float lines = ss(0.003, 0.0, abs(fract((uv.x + uv.y * 0.35) * 18.0 + t) - 0.5) - 0.497);
	col += vec3(1.0) * lines * 0.025;
	float vign = ss(1.2, 0.3, length(uv - vec2(0.5, 0.45)));
	col *= 0.55 + 0.45 * vign;
	col += (hash(uv * 400.0 + t) - 0.5) * 0.012;
	COLOR = vec4(col, 1.0);
}
