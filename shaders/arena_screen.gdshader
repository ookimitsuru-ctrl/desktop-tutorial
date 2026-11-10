shader_type spatial;
// 闘技場の大型ビジョン（動く映像風の発光）
uniform vec4 color_a : source_color = vec4(0.1, 0.3, 0.9, 1.0);
uniform vec4 color_b : source_color = vec4(0.9, 0.15, 0.1, 1.0);

void fragment() {
	vec2 uv = UV;
	float t = TIME;
	float bands = step(0.5, fract((uv.x + uv.y * 0.45) * 5.0 - t * 0.3));
	vec3 c = mix(color_a.rgb, color_b.rgb, step(0.5, uv.x));
	c *= 0.55 + 0.45 * bands;
	float dia = 1.0 - smoothstep(0.17, 0.19, abs(uv.x - 0.5) * 0.9 + abs(uv.y - 0.5) * 1.5);
	c = mix(c, vec3(1.0, 0.86, 0.3) * (0.75 + 0.25 * sin(t * 4.0)), dia);
	float scan = 0.82 + 0.18 * sin(uv.y * 260.0);
	ALBEDO = vec3(0.02);
	EMISSION = c * scan * 1.5;
	ROUGHNESS = 0.4;
}
