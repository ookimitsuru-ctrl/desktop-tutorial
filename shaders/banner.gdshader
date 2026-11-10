shader_type spatial;
// 風になびく旗・のぼり。板メッシュ（細かく分割）の頂点を波打たせる。hang = 1 は上辺を固定（垂れ幕）、0 は左辺を固定（竿の旗）
render_mode cull_disabled;
uniform vec4 color : source_color = vec4(0.7, 0.1, 0.08, 1.0);
uniform vec4 stripe : source_color = vec4(0.95, 0.9, 0.8, 1.0);
uniform float phase = 0.0;
uniform float hang = 0.0;
uniform float wind = 1.0;
varying float v_shade;

void vertex() {
	float k = mix(UV.x, UV.y, hang);   // 固定された辺からの距離（0〜1）
	float a = TIME * 3.4 * wind + k * 5.5 + phase;
	float w = (sin(a) * 0.11 + sin(a * 1.7 + 1.3) * 0.04) * k * wind;
	VERTEX += NORMAL * w;
	v_shade = cos(a) * k;
	if (hang < 0.5) {
		VERTEX.y -= k * k * 0.05;
	}
}

void fragment() {
	float band = mix(step(0.4, UV.y) * step(UV.y, 0.6), step(0.42, UV.x) * step(UV.x, 0.58), hang);
	vec3 c = mix(color.rgb, stripe.rgb, band);
	ALBEDO = c * (0.82 + 0.22 * v_shade);
	ROUGHNESS = 0.95;
	SPECULAR = 0.05;
}
