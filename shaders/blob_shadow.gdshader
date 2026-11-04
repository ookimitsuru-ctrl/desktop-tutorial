shader_type spatial;
render_mode unshaded, blend_mix, depth_draw_never, cull_disabled, shadows_disabled;
uniform float strength = 0.42;
void fragment() {
	float d = length(UV - vec2(0.5)) * 2.0;
	float a = smoothstep(1.0, 0.15, d) * strength;
	ALBEDO = vec3(0.0);
	ALPHA = a;
}
