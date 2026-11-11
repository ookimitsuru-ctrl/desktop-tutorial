shader_type spatial;
// 打撃の軌跡（手足の先が描く帯）。頂点色 = 色と濃さ、UV.x = 古さ（0 新しい → 1 消える）、UV.y = 帯の幅方向
render_mode unshaded, blend_add, depth_draw_never, cull_disabled, shadows_disabled;

void fragment() {
	float across = sin(UV.y * 3.14159);
	float core = pow(across, 6.0);
	float a = COLOR.a * (1.0 - UV.x) * (1.0 - UV.x);
	ALBEDO = (COLOR.rgb * across * 0.9 + vec3(1.0, 0.97, 0.9) * core * 0.6) * a;
}
