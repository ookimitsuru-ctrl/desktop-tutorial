shader_type spatial;
// 光の円錐（照明の光が空気中の塵で見える表現）。円柱メッシュ（高さ 1、上が細い）に貼る。加算合成
render_mode unshaded, blend_add, cull_disabled, depth_draw_never, shadows_disabled, fog_disabled;
uniform vec4 color : source_color = vec4(1.0, 0.95, 0.8, 1.0);
uniform float strength = 0.25;
varying float v_len;

void vertex() {
	v_len = 0.5 - VERTEX.y;   // 0 = 光源側, 1 = 先
}

void fragment() {
	float fres = abs(dot(normalize(NORMAL), normalize(VIEW)));
	float a = pow(fres, 1.6) * pow(1.0 - clamp(v_len, 0.0, 1.0), 1.4);
	ALBEDO = color.rgb;
	ALPHA = clamp(a * strength, 0.0, 1.0);
}
