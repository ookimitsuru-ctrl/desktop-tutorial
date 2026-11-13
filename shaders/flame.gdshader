shader_type spatial;
// 炎（常にカメラを向く板）。雑音を上へ流して揺らす。加算合成
render_mode unshaded, blend_add, cull_disabled, depth_draw_never, shadows_disabled;
uniform float seed = 0.0;
uniform float intensity = 1.6;

float ss(float e0, float e1, float x) {
	return e0 < e1 ? smoothstep(e0, e1, x) : 1.0 - smoothstep(e1, e0, x);
}
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise2(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash2(i), hash2(i + vec2(1, 0)), f.x), mix(hash2(i + vec2(0, 1)), hash2(i + vec2(1, 1)), f.x), f.y);
}

void vertex() {
	// 縦軸は保ち、横だけカメラへ向ける
	vec3 up = vec3(0.0, 1.0, 0.0);
	vec3 to_cam = normalize(CAMERA_POSITION_WORLD - MODEL_MATRIX[3].xyz);
	vec3 right = normalize(cross(up, to_cam));
	vec3 fwd = cross(right, up);
	float sx = length(MODEL_MATRIX[0].xyz);
	float sy = length(MODEL_MATRIX[1].xyz);
	mat4 m = mat4(vec4(right * sx, 0.0), vec4(up * sy, 0.0), vec4(fwd, 0.0), MODEL_MATRIX[3]);
	MODELVIEW_MATRIX = VIEW_MATRIX * m;
}

void fragment() {
	float x = UV.x - 0.5;
	float y = 1.0 - UV.y;   // 0 = 根元, 1 = 先
	float n = noise2(vec2(x * 4.0 + seed, y * 3.0 - TIME * 2.6 + seed)) * 0.65 + noise2(vec2(x * 9.0 - seed, y * 6.0 - TIME * 4.3)) * 0.35;
	float sway = (n - 0.5) * 0.3 * y;
	float w = (0.40 - y * 0.34) * (0.75 + 0.5 * n);
	float core = ss(w, w * 0.25, abs(x + sway));
	float top = ss(1.0, 0.5, y + (n - 0.5) * 0.55);
	float a = core * top * ss(0.0, 0.07, y);
	vec3 col = mix(vec3(1.0, 0.22, 0.02), vec3(1.0, 0.86, 0.4), core * top);
	ALBEDO = col * intensity;
	ALPHA = clamp(a, 0.0, 1.0);
}
