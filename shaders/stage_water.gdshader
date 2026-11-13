shader_type spatial;
render_mode cull_disabled;
uniform vec4 deep : source_color = vec4(0.02, 0.08, 0.14, 1.0);
uniform vec4 shallow : source_color = vec4(0.08, 0.25, 0.32, 1.0);
uniform float speed = 0.4;
uniform float scale = 0.35;
uniform float choppy = 1.0;
varying vec3 wpos;
float wave(vec2 p, vec2 d, float f, float t) { return sin(dot(p, d) * f + t); }
void vertex() {
	wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	float t = TIME * speed;
	float h = (wave(wpos.xz, vec2(0.8, 0.6), 0.9, t * 2.0) * 0.5 + wave(wpos.xz, vec2(-0.3, 0.95), 1.7, t * 3.1) * 0.25) * 0.08 * choppy;
	VERTEX.y += h;
}
void fragment() {
	float t = TIME * speed;
	vec2 p = wpos.xz;
	vec3 n = normalize(vec3(
		cos(dot(p, vec2(0.8, 0.6)) * 0.9 + t * 2.0) * 0.12 + cos(dot(p, vec2(-0.3, 0.95)) * 1.7 + t * 3.1) * 0.08 + sin(p.x * 6.0 + t * 5.0) * 0.03 * choppy,
		1.0,
		cos(dot(p, vec2(0.5, -0.8)) * 1.3 + t * 2.5) * 0.1 + sin(p.y * 7.0 - t * 4.0) * 0.03 * choppy));
	NORMAL = normalize((VIEW_MATRIX * vec4(n, 0.0)).xyz);
	float fres = pow(1.0 - clamp(dot(NORMAL, VIEW), 0.0, 1.0), 4.0);
	ALBEDO = mix(deep.rgb, shallow.rgb, 0.3 + 0.3 * sin(p.x * 0.2 + t));
	ROUGHNESS = 0.08;
	SPECULAR = 0.8;
	EMISSION = shallow.rgb * fres * 0.4;
}
