shader_type spatial;
// キャラクター用シェーダー: 頂点カラーのパレット番号で色を決め、ラップライティング＋リムで読みやすく。
// COLOR.r = (パレット番号 + 0.5) / 16, COLOR.g = 材質, COLOR.b = AO
render_mode cull_back, depth_draw_opaque;

uniform vec4 palette[12];
uniform vec3 rim_color = vec3(1.0, 0.92, 0.85);
uniform float rim_intensity = 0.32;
uniform vec3 rim_dir = vec3(-0.4, 0.5, 0.7);
uniform float hit_flash = 0.0;
uniform float wetness = 0.0;
uniform float ghost = 0.0;

// パレット色と材質は頂点で決めて補間する（パレット番号そのものを補間すると境界に別の色が混ざるため）
varying vec3 v_base;
varying vec4 v_mat;   // 肌, 布, 髪, 革・金属 の重み（残りは光沢）
varying float v_ao;
varying vec3 v_local;

float hash3(vec3 p) {
	p = fract(p * 0.3183099 + 0.1);
	p *= 17.0;
	return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float vnoise(vec3 x) {
	vec3 i = floor(x);
	vec3 f = fract(x);
	f = f * f * (3.0 - 2.0 * f);
	return mix(mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
			mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}

void vertex() {
	int idx = clamp(int(round(COLOR.r * 16.0 - 0.5)), 0, 11);
	v_base = palette[idx].rgb;
	float m = COLOR.g;
	v_mat = vec4(m < 0.12 ? 1.0 : 0.0, (m >= 0.12 && m < 0.37) ? 1.0 : 0.0, (m >= 0.37 && m < 0.62) ? 1.0 : 0.0, (m >= 0.62 && m < 0.87) ? 1.0 : 0.0);
	v_ao = COLOR.b;
	v_local = VERTEX;
}

void fragment() {
	vec3 base = v_base;
	float n = vnoise(v_local * 90.0);
	float n2 = vnoise(v_local * 18.0);
	float nh = vnoise(v_local * vec3(40.0, 160.0, 40.0));
	float glossy = clamp(1.0 - (v_mat.x + v_mat.y + v_mat.z + v_mat.w), 0.0, 1.0);
	// 材質ごとの色ムラ（肌: わずかなムラ、布: 織り目、髪: 筋）
	float tex = v_mat.x * (0.94 + 0.08 * n2) + v_mat.y * (0.90 + 0.12 * n) + v_mat.z * (0.85 + 0.25 * nh) + v_mat.w + glossy;
	base *= tex;
	float rough = v_mat.x * 0.55 + v_mat.y * 0.88 + v_mat.z * 0.45 + v_mat.w * 0.35 + glossy * 0.15;
	float spec = v_mat.x * 0.35 + v_mat.y * 0.2 + v_mat.z * 0.35 + v_mat.w * 0.6 + glossy * 0.7;
	float ao = mix(0.45, 1.0, v_ao);
	ALBEDO = base * ao;
	ROUGHNESS = mix(rough, 0.2, wetness);
	SPECULAR = spec;
	// リム（ステージのリム光方向寄りを強く）
	float fres = pow(1.0 - clamp(dot(NORMAL, VIEW), 0.0, 1.0), 3.0);
	vec3 rd = normalize((VIEW_MATRIX * vec4(rim_dir, 0.0)).xyz);
	float side = clamp(dot(NORMAL, rd) * 0.5 + 0.6, 0.0, 1.0);
	EMISSION = rim_color * rim_intensity * fres * side * ao * (0.35 + 0.65 * dot(base, vec3(0.33))) + vec3(hit_flash);
	if (ghost > 0.0) {
		ALPHA = ghost;
	}
}

void light() {
	// ラップライティング（境界を柔らかく、肌は暖色の滲み）
	float ndl = dot(NORMAL, LIGHT);
	float wrap = 0.35;
	float diff = clamp((ndl + wrap) / (1.0 + wrap), 0.0, 1.0);
	vec3 tint = vec3(1.0);
	float t = clamp(1.0 - abs(ndl) * 2.5, 0.0, 1.0);
	tint = mix(vec3(1.0), vec3(1.25, 0.82, 0.72), t * 0.6 * v_mat.x);
	DIFFUSE_LIGHT += diff * ATTENUATION * LIGHT_COLOR * tint / 3.14159;
	vec3 h = normalize(VIEW + LIGHT);
	float sp = pow(clamp(dot(NORMAL, h), 0.0, 1.0), mix(80.0, 8.0, ROUGHNESS)) * (1.0 - ROUGHNESS) * 0.6;
	SPECULAR_LIGHT += sp * ATTENUATION * LIGHT_COLOR;
}
