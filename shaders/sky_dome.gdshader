shader_type spatial;
// 空のドーム（カメラに追従する大きな球の内側）。色の勾配・太陽や月・星・流れる雲・オーロラ・稲光を描く。
// 環境の Sky は反射と環境光のために残し、見た目はこのドームが覆う。
render_mode unshaded, cull_front, depth_draw_never, shadows_disabled, fog_disabled;

uniform vec3 top_color : source_color = vec3(0.2, 0.4, 0.8);
uniform vec3 horizon_color : source_color = vec3(0.7, 0.8, 0.9);
uniform vec3 ground_color : source_color = vec3(0.3, 0.3, 0.3);
uniform vec3 sun_dir = vec3(0.3, 0.5, 0.4);
uniform vec3 sun_color : source_color = vec3(1.0, 0.9, 0.7);
uniform float sun_disc = 0.0;    // 太陽の円盤の角半径（ラジアン）。0 = なし
uniform float sun_glow = 0.5;
uniform float moon = 0.0;        // 月の角半径（ラジアン）。向きは sun_dir
uniform float stars = 0.0;
uniform float cloud_cover = 0.4;
uniform float cloud_scale = 1.0;
uniform vec2 cloud_wind = vec2(0.012, 0.004);
uniform vec3 cloud_lit : source_color = vec3(1.0, 1.0, 1.0);
uniform vec3 cloud_dark : source_color = vec3(0.5, 0.55, 0.65);
uniform float aurora = 0.0;
uniform float flash = 0.0;
uniform int octaves = 4;
varying vec3 v_dir;

float ss(float e0, float e1, float x) {
	return e0 < e1 ? smoothstep(e0, e1, x) : 1.0 - smoothstep(e1, e0, x);
}
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float hash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float noise2(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash2(i), hash2(i + vec2(1, 0)), f.x), mix(hash2(i + vec2(0, 1)), hash2(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
	float v = 0.0;
	float a = 0.5;
	float tot = 0.0;
	for (int i = 0; i < octaves; i++) {
		v += a * noise2(p);
		tot += a;
		p = p * 2.03 + vec2(17.0, 9.0);
		a *= 0.5;
	}
	return v / tot;
}

void vertex() {
	v_dir = VERTEX;
}

void fragment() {
	vec3 d = normalize(v_dir);
	float h = d.y;
	vec3 sdir = normalize(sun_dir);
	float sd = max(dot(d, sdir), 0.0);
	vec3 col = h >= 0.0 ? mix(horizon_color, top_color, pow(h, 0.5)) : mix(horizon_color, ground_color, clamp(-h * 5.0, 0.0, 1.0));
	// 太陽・月のまわりの光
	col += sun_color * sun_glow * (0.30 * pow(sd, 6.0) + 0.55 * pow(sd, 48.0));
	// 星（またたく）
	if (stars > 0.0 && h > 0.0) {
		vec3 p = d * 190.0;
		vec3 ip = floor(p);
		float r = hash3(ip);
		float s = step(0.988, r) * ss(0.42, 0.05, length(fract(p) - 0.5));
		float tw = 0.65 + 0.35 * sin(TIME * (1.0 + r * 5.0) + r * 80.0);
		col += vec3(0.9, 0.95, 1.0) * s * tw * stars * ss(0.0, 0.3, h) * (0.5 + 1.5 * fract(r * 37.0));
	}
	// 月（うっすらと模様）
	if (moon > 0.0) {
		float md = acos(clamp(dot(d, sdir), -1.0, 1.0));
		float disc = ss(moon, moon * 0.94, md);
		float mare = 0.82 + 0.18 * noise2(d.xy * 38.0 + d.zx * 21.0);
		col = mix(col, vec3(1.0, 0.98, 0.9) * 1.25 * mare, disc);
	}
	if (sun_disc > 0.0) {
		float ad = acos(clamp(dot(d, sdir), -1.0, 1.0));
		col = mix(col, sun_color * 2.2, ss(sun_disc, sun_disc * 0.9, ad));
	}
	// オーロラ（北の空の光の幕）
	if (aurora > 0.0 && h > 0.04) {
		float az = atan(d.x, -d.z);
		float band = noise2(vec2(az * 2.2 + TIME * 0.03, TIME * 0.02));
		float curtain = pow(noise2(vec2(az * 11.0 + band * 5.0, TIME * 0.12)), 2.2);
		float ray = 0.6 + 0.4 * noise2(vec2(az * 60.0, TIME * 0.5));
		float fall = ss(0.06, 0.22, h) * ss(0.8, 0.3, h);
		vec3 ac = mix(vec3(0.15, 1.0, 0.55), vec3(0.55, 0.25, 0.95), clamp(h * 1.5, 0.0, 1.0));
		col += ac * curtain * ray * fall * aurora * ss(-0.2, 0.5, -d.z + 0.3);
	}
	// 雲（地平線へ向かって流れ去る平面に投影）
	if (cloud_cover > 0.0 && h > -0.03) {
		vec2 uv = d.xz / (h + 0.24) * cloud_scale + cloud_wind * TIME;
		float c = fbm(uv * 1.1) * 0.78 + noise2(uv * 5.3 + 3.0) * 0.22;
		float t0 = mix(0.74, 0.3, cloud_cover);
		float dens = ss(t0, t0 + 0.22, c) * ss(-0.03, 0.12, h);
		vec3 lit = mix(cloud_lit, cloud_dark, ss(0.0, 0.5, (c - t0) * 2.4));
		lit += sun_color * pow(sd, 5.0) * 0.4 + vec3(flash) * 0.9;
		col = mix(col, lit, dens * 0.94);
	}
	col += vec3(0.55, 0.6, 0.75) * flash * 0.35;
	ALBEDO = col;
}
