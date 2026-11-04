shader_type spatial;
render_mode diffuse_lambert;
uniform float excite = 0.0;
varying float v_rand;
void vertex() {
	float r = fract(sin(float(INSTANCE_ID) * 12.9898) * 43758.5453);
	v_rand = r;
	float bob = sin(TIME * (2.0 + r * 3.0 + excite * 6.0) + r * 6.28) * (0.02 + excite * 0.08);
	VERTEX.y += bob * smoothstep(0.0, 1.0, VERTEX.y + 0.5);
}
void fragment() {
	ALBEDO = COLOR.rgb * (0.6 + 0.4 * v_rand);
	ROUGHNESS = 0.9;
}
