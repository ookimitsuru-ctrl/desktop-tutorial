// キャラクター用シェーダーの本体（character.gdshader と character_ghost.gdshader が読み込む）。
// COLOR.r = (パレット番号 + 0.5) / 16, COLOR.g = 材質, COLOR.b = AO, COLOR.a = 部品ごとの色むら（機甲兵）
// 機甲兵のモデル（tools/charmodel/gen_mech.py）: UV.x = 面の縁からの距離（m、1.0 = 情報なし）、UV.y = 1 なら面全体で補間した法線を使う
// ALPHA を書くのは残像（GHOST）のときだけ。ALPHA を書くシェーダーは条件分岐の中でも半透明扱いになり、
// 深度を書かずに描かれるため、本体では自分自身の前後関係が崩れる（後ろ髪の上に目が描かれる等）。
uniform vec4 palette[12];
uniform vec3 rim_color = vec3(1.0, 0.92, 0.85);
uniform float rim_intensity = 0.22;
uniform vec3 rim_dir = vec3(-0.4, 0.5, 0.7);
uniform float hit_flash = 0.0;
uniform float wetness = 0.0;
uniform float ghost = 0.0;
// 機甲兵（ロボット）: 材質の読み替え 塗装 / ゴム / 地金 / 暗いフレーム / レンズ（発光）
uniform bool mech = false;
uniform float lens_glow = 1.0;

// パレット色と材質は頂点で決めて補間する（パレット番号そのものを補間すると境界に別の色が混ざるため）
varying vec3 v_base;
varying vec4 v_mat;   // 肌, 布, 髪, 革・金属 の重み（残りは光沢）
varying float v_ao;
varying vec3 v_local;
varying float v_spec_k;   // 直接光のハイライトの強さ（材質ごと）
varying float v_edge;     // 面の縁からの距離（m）
varying float v_round;    // 1 = 補間した法線をそのまま使う
varying float v_tint;     // 部品ごとの乱数

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

// 端の大小が逆でも正しく動く smoothstep（GLSL では e0 >= e1 の smoothstep は未定義）
float ss(float e0, float e1, float x) {
	return e0 < e1 ? smoothstep(e0, e1, x) : 1.0 - smoothstep(e1, e0, x);
}

void vertex() {
	// 関節で骨の向きが大きく違うと、スキニング後の法線が打ち消し合って長さ 0 になる（正規化で NaN → ブルームで白い球）
	if (!(dot(NORMAL, NORMAL) > 1e-8)) {
		NORMAL = vec3(0.0, 1.0, 0.0);
	}
	int idx = clamp(int(round(COLOR.r * 16.0 - 0.5)), 0, 11);
	v_base = palette[idx].rgb;
	float m = COLOR.g;
	v_mat = vec4(m < 0.12 ? 1.0 : 0.0, (m >= 0.12 && m < 0.37) ? 1.0 : 0.0, (m >= 0.37 && m < 0.62) ? 1.0 : 0.0, (m >= 0.62 && m < 0.87) ? 1.0 : 0.0);
	v_ao = COLOR.b;
	float gl = clamp(1.0 - (v_mat.x + v_mat.y + v_mat.z + v_mat.w), 0.0, 1.0);
	v_spec_k = mech ? (v_mat.x * 0.30 + v_mat.y * 0.05 + v_mat.z * 0.70 + v_mat.w * 0.35 + gl * 0.6)
			: (v_mat.x * 0.30 + v_mat.y * 0.08 + v_mat.z * 0.25 + v_mat.w * 0.50 + gl * 0.80);
	v_local = VERTEX;
	v_edge = mech ? UV.x : 1.0;
	v_round = mech ? UV.y : 1.0;
	v_tint = COLOR.a;
}

void fragment() {
	if (any(isnan(NORMAL)) || !(dot(NORMAL, NORMAL) > 1e-8)) {
		NORMAL = vec3(0.0, 0.0, 1.0);
	}
	vec3 base = v_base;
	float n = vnoise(v_local * 90.0);
	float n2 = vnoise(v_local * 18.0);
	float nh = vnoise(v_local * vec3(40.0, 160.0, 40.0));
	float glossy = clamp(1.0 - (v_mat.x + v_mat.y + v_mat.z + v_mat.w), 0.0, 1.0);
	float rough;
	float spec;
	float metal = 0.0;
	vec3 glow = vec3(0.0);
	if (mech) {
		// 縁の丸み: 平らな面は、面の法線（画面上の微分から求める）を使い、縁の近くだけ「隣の面と平均した法線」へ寄せる。
		// 板の角が丸く面取りされたように光を拾う
		vec3 nf = normalize(cross(dFdx(VERTEX), dFdy(VERTEX)));
		vec3 ni = normalize(NORMAL);
		if (dot(nf, ni) < 0.0) {
			nf = -nf;
		}
		float wb = max(v_round, 1.0 - ss(0.0, 0.007, v_edge));
		NORMAL = normalize(mix(nf, ni, wb));
		float has_edge = step(v_edge, 0.5);
		// 塗装: 斑、板ごとのわずかな色むら、縁に沿った薄い陰（スミ入れ）、雨だれの筋、下の方ほど泥汚れ
		float mottle = 0.93 + 0.09 * n2;
		float panel = 0.93 + 0.14 * v_tint;
		float cav = has_edge * (1.0 - ss(0.0015, 0.016, v_edge));
		float streak = ss(0.55, 0.9, vnoise(v_local * vec3(55.0, 5.0, 55.0)));
		float mud = ss(0.55, 0.05, v_local.y) * (0.35 + 0.4 * vnoise(v_local * 7.0));
		vec3 paint = base * mottle * panel * (1.0 - 0.24 * cav) * (1.0 - 0.10 * streak);
		// 剥げ: 縁は地金が出る（雑音で途切れさせる）。面の中にも小さな欠け
		// 幅と有無を大きめの雑音で変える（点線のように規則的にならないように）
		float wn = 0.3 * n + 0.7 * n2;
		float wear = has_edge * (1.0 - ss(0.0, 0.0018 + 0.0055 * n2, v_edge)) * ss(0.43, 0.6, wn);
		wear = max(wear, ss(0.91, 0.96, n) * 0.6) * v_mat.x;
		vec3 steel = mix(base, vec3(0.52, 0.52, 0.50), 0.7);
		paint = mix(paint, steel, wear);
		paint = mix(paint, vec3(0.20, 0.17, 0.13), clamp(mud, 0.0, 0.6));
		vec3 col = v_mat.x * paint + v_mat.y * base * (0.9 + 0.1 * n) + v_mat.z * base * (0.82 + 0.28 * nh)
				+ v_mat.w * base * (0.88 + 0.14 * n2) * (1.0 - 0.2 * cav) + glossy * base * 0.25;
		base = mix(col, vec3(0.20, 0.17, 0.13), clamp(mud * 0.5 * (v_mat.z + v_mat.w), 0.0, 0.4));
		rough = v_mat.x * mix(0.66, 0.5, wear) + v_mat.y * 0.92 + v_mat.z * 0.45 + v_mat.w * 0.62 + glossy * 0.45;
		spec = v_mat.x * mix(0.22, 0.5, wear) + v_mat.y * 0.05 + v_mat.z * 0.5 + v_mat.w * 0.3 + glossy * 0.5;
		metal = v_mat.x * wear * 0.6 + v_mat.z * 0.55 + v_mat.w * 0.2;
		// レンズ・灯火: ゆっくり脈打つ
		glow = v_base * glossy * lens_glow * 2.6 * (0.86 + 0.14 * sin(TIME * 2.6 + v_local.y * 8.0));
	} else {
		// 材質ごとの色ムラ（肌: わずかなムラ、布: 織り目、髪: 筋）
		float tex = v_mat.x * (0.94 + 0.08 * n2) + v_mat.y * (0.90 + 0.12 * n) + v_mat.z * (0.85 + 0.25 * nh) + v_mat.w + glossy;
		base *= tex;
		// テカりを抑える: 布はほぼ艶なし、肌と髪はわずか、革は控えめ、光沢（目など）だけ艶を残す
		rough = v_mat.x * 0.70 + v_mat.y * 0.94 + v_mat.z * 0.66 + v_mat.w * 0.60 + glossy * 0.45;
		spec = v_mat.x * 0.15 + v_mat.y * 0.05 + v_mat.z * 0.12 + v_mat.w * 0.25 + glossy * 0.5;
	}
	float ao = mix(0.45, 1.0, v_ao);
	ALBEDO = base * ao;
	METALLIC = metal;
	// 粗さが低い画素が混ざると、エンジン側の鏡面計算で極端な値（白い光の玉）が出る端末があるため下限を設ける
	// 雨のステージでは少しだけ濡れた艶を足す（強すぎると油を塗ったように見える）
	ROUGHNESS = clamp(mix(rough, 0.45, wetness * 0.5), 0.45, 1.0);
	SPECULAR = spec;
	// リム（ステージのリム光方向寄りを強く）
	float fres = pow(1.0 - clamp(dot(NORMAL, VIEW), 0.0, 1.0), 4.0);
	vec3 rd = normalize((VIEW_MATRIX * vec4(rim_dir, 0.0)).xyz);
	float side = clamp(dot(NORMAL, rd) * 0.5 + 0.6, 0.0, 1.0);
	EMISSION = rim_color * rim_intensity * fres * side * ao * (0.35 + 0.65 * dot(base, vec3(0.33))) + vec3(hit_flash) + glow;
#ifdef GHOST
	ALPHA = ghost;
#endif
}

void light() {
	// ラップライティング（境界を柔らかく、肌は暖色の滲み）
	float ndl = dot(NORMAL, LIGHT);
	float wrap = 0.35;
	float diff = clamp((ndl + wrap) / (1.0 + wrap), 0.0, 1.0);
	vec3 tint = vec3(1.0);
	float t = clamp(1.0 - abs(ndl) * 2.5, 0.0, 1.0);
	tint = mix(vec3(1.0), vec3(1.25, 0.82, 0.72), t * 0.6 * v_mat.x * (mech ? 0.0 : 1.0));
	DIFFUSE_LIGHT += diff * ATTENUATION * LIGHT_COLOR * tint / 3.14159;
	vec3 hv = VIEW + LIGHT;
	vec3 h = dot(hv, hv) > 1e-8 ? normalize(hv) : NORMAL;
	// ハイライトは粗さの 2 乗で弱め、材質ごとの係数を掛ける（暗い布地に白い艶が乗ってテカテカに見えないように）
	float rr = 1.0 - ROUGHNESS;
	float sp = pow(clamp(dot(NORMAL, h), 0.0, 1.0), mix(60.0, 6.0, ROUGHNESS)) * rr * rr * v_spec_k * (1.0 + wetness * 0.6);
	SPECULAR_LIGHT += sp * ATTENUATION * LIGHT_COLOR;
}
