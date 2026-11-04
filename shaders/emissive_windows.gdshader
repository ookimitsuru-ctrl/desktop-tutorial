shader_type spatial;
uniform vec4 wall : source_color = vec4(0.05, 0.06, 0.09, 1.0);
uniform vec4 lit : source_color = vec4(1.0, 0.8, 0.5, 1.0);
uniform float density = 0.45;
varying vec3 lpos;
float h(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
void vertex() { lpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz; }
void fragment() {
	vec2 g = vec2(lpos.x + lpos.z, lpos.y) * vec2(1.4, 1.1);
	vec2 c = floor(g);
	vec2 f = fract(g);
	float win = step(0.2, f.x) * step(f.x, 0.8) * step(0.25, f.y) * step(f.y, 0.8);
	float on = step(1.0 - density, h(c)) * (0.6 + 0.4 * sin(TIME * 0.2 + h(c + 3.0) * 20.0));
	ALBEDO = wall.rgb;
	EMISSION = lit.rgb * win * on * 2.2;
	ROUGHNESS = 0.6;
}
