package com.rollerdash.arena.render

/**
 * Every GLSL source in the game.
 *
 * The scene is drawn in linear light into a floating point target, lit by one
 * sun with a shadow map, then tone mapped and bloomed on the way to the screen.
 * All surface detail - panel lines, wear, grime, cracks - is procedural, so the
 * game still ships without a single texture file.
 */
object Shaders {

    /** Shared lighting and material code, pasted into the surface shaders. */
    private const val COMMON_FS = """
        precision highp float;

        uniform vec3 uLightDir;
        uniform vec3 uSunColor;
        uniform vec3 uSkyColor;
        uniform vec3 uGroundColor;
        uniform vec3 uCameraPos;
        uniform vec3 uFogColor;
        uniform float uFogDensity;
        uniform float uTime;

        uniform mat4 uLightViewProj;
        uniform highp sampler2DShadow uShadowMap;
        uniform float uShadowTexel;
        /** 0 turns the shadow map off entirely, for the performance tier. */
        uniform float uShadowStrength;

        /** Muzzle flashes and blasts: xyz position, w radius. */
        uniform vec4 uPointPos[4];
        uniform vec3 uPointColor[4];

        vec3 pointLights(vec3 world, vec3 n) {
            vec3 sum = vec3(0.0);
            for (int i = 0; i < 4; i++) {
                float radius = uPointPos[i].w;
                if (radius <= 0.0) continue;
                vec3 d = uPointPos[i].xyz - world;
                float dist = length(d);
                if (dist > radius) continue;
                float atten = 1.0 - dist / radius;
                atten *= atten;
                float ndl = max(dot(n, d / max(dist, 0.001)), 0.0);
                sum += uPointColor[i] * atten * (ndl * 0.85 + 0.15);
            }
            return sum;
        }

        // Percentage-closer filtering: four taps is enough for a soft contact edge
        // without costing a mobile GPU too much.
        float shadowFactor(vec3 world, float ndl) {
            if (uShadowStrength < 0.5) return 1.0;
            vec4 lightPos = uLightViewProj * vec4(world, 1.0);
            vec3 proj = lightPos.xyz / lightPos.w;
            proj = proj * 0.5 + 0.5;
            if (proj.z > 1.0 || proj.x < 0.0 || proj.x > 1.0 || proj.y < 0.0 || proj.y > 1.0) return 1.0;
            float bias = mix(0.0025, 0.0006, ndl);
            float z = proj.z - bias;
            float sum = 0.0;
            sum += texture(uShadowMap, vec3(proj.xy + vec2(-0.7, -0.7) * uShadowTexel, z));
            sum += texture(uShadowMap, vec3(proj.xy + vec2( 0.7, -0.7) * uShadowTexel, z));
            sum += texture(uShadowMap, vec3(proj.xy + vec2(-0.7,  0.7) * uShadowTexel, z));
            sum += texture(uShadowMap, vec3(proj.xy + vec2( 0.7,  0.7) * uShadowTexel, z));
            return sum * 0.25;
        }

        vec3 hemisphere(vec3 n) {
            float up = n.y * 0.5 + 0.5;
            return mix(uGroundColor, uSkyColor, up);
        }

        /** Cheap value noise, used for grime and cracks. */
        float hash21(vec2 p) {
            p = fract(p * vec2(123.34, 456.21));
            p += dot(p, p + 45.32);
            return fract(p.x * p.y);
        }

        float valueNoise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            float a = hash21(i);
            float b = hash21(i + vec2(1.0, 0.0));
            float c = hash21(i + vec2(0.0, 1.0));
            float d = hash21(i + vec2(1.0, 1.0));
            return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }

        float fbm(vec2 p) {
            float v = 0.0;
            float a = 0.5;
            for (int i = 0; i < 4; i++) {
                v += a * valueNoise(p);
                p *= 2.02;
                a *= 0.5;
            }
            return v;
        }

        vec3 applyFog(vec3 color, vec3 world) {
            float dist = length(uCameraPos - world);
            float height = clamp(1.0 - world.y * 0.012, 0.55, 1.0);
            float fog = 1.0 - exp(-dist * uFogDensity * height);
            vec3 sunDir = normalize(uLightDir);
            vec3 view = normalize(world - uCameraPos);
            // A little sun in the haze, so distance reads as air and not as paint.
            float towardsSun = max(dot(view, sunDir), 0.0);
            vec3 fogTint = mix(uFogColor, uFogColor * 1.25 + uSunColor * 0.045, pow(towardsSun, 5.0));
            return mix(color, fogTint, clamp(fog, 0.0, 1.0));
        }
    """

    /** Shared vertex stage for every solid surface. */
    const val SOLID_VS = """#version 300 es
        precision highp float;
        in vec3 aPos;
        in vec3 aNormal;
        in float aShade;
        uniform mat4 uMVP;
        uniform mat4 uModel;
        out vec3 vNormal;
        out vec3 vWorld;
        out vec3 vLocal;
        out float vShade;
        void main() {
            vec4 world = uModel * vec4(aPos, 1.0);
            vWorld = world.xyz;
            vLocal = aPos;
            vNormal = normalize(mat3(uModel) * aNormal);
            vShade = aShade;
            gl_Position = uMVP * vec4(aPos, 1.0);
        }
    """

    /** Depth-only pass for the shadow map. */
    const val DEPTH_VS = """#version 300 es
        precision highp float;
        in vec3 aPos;
        uniform mat4 uMVP;
        void main() { gl_Position = uMVP * vec4(aPos, 1.0); }
    """

    const val DEPTH_FS = """#version 300 es
        precision highp float;
        void main() { }
    """

    /**
     * Hard-surface shader for mechs, cover and walls: panel lines cut into the
     * plate, wear along the edges, grime in the crevices, and a sun with a shadow.
     */
    const val SOLID_FS = """#version 300 es
        $COMMON_FS
        in vec3 vNormal;
        in vec3 vWorld;
        in vec3 vLocal;
        in float vShade;
        out vec4 fragColor;

        uniform vec4 uColor;
        uniform float uEmissive;
        uniform vec3 uFlash;
        /** 0 painted armour, 1 bare metal, 2 emissive lens, 3 concrete */
        uniform int uMaterial;
        /** Scale of the procedural panel grid in local units. */
        uniform float uPanelScale;
        uniform float uWear;

        float panelLines(vec3 p, vec3 n, float scale) {
            // Project on whichever pair of axes faces away from the normal.
            vec3 a = abs(n);
            vec2 uv = a.y > 0.7 ? p.xz : (a.x > 0.7 ? p.zy : p.xy);
            uv *= scale;
            vec2 g = abs(fract(uv) - 0.5);
            float line = smoothstep(0.5, 0.46, max(g.x, g.y));
            return 1.0 - line;
        }

        void main() {
            vec3 n = normalize(vNormal);
            vec3 v = normalize(uCameraPos - vWorld);
            vec3 l = normalize(uLightDir);
            float ndl = max(dot(n, l), 0.0);

            vec3 base = uColor.rgb;
            float rough = 0.55;
            float metal = 0.0;

            if (uMaterial == 0) {
                // Painted plate: panel seams, chipped edges, dirt down the sides.
                float seam = panelLines(vLocal, n, uPanelScale);
                base *= mix(1.0, 0.52, seam);
                float wear = smoothstep(0.55, 1.0, fbm(vLocal.xz * 6.0 + vLocal.y * 3.0)) * uWear;
                base = mix(base, vec3(0.42, 0.40, 0.36), wear * 0.55);
                float grime = fbm(vWorld.xz * 0.6 + vWorld.y * 0.4);
                base *= mix(0.82, 1.06, grime);
                rough = mix(0.65, 0.35, wear);
                metal = wear * 0.6;
            } else if (uMaterial == 1) {
                metal = 1.0;
                rough = 0.32;
                base *= mix(0.85, 1.15, fbm(vLocal.xz * 9.0));
            } else if (uMaterial == 3) {
                // Concrete: coarse speckle plus a few cracks.
                float speck = fbm(vWorld.xz * 3.2 + vWorld.y * 1.5);
                base *= mix(0.78, 1.12, speck);
                float crack = smoothstep(0.48, 0.5, fbm(vWorld.xz * 0.9)) * 0.5;
                base *= 1.0 - crack * 0.5;
                rough = 0.9;
            }

            // Baked corner darkening: the cheapest ambient occlusion there is.
            base *= mix(0.48, 1.04, vShade);

            float shadow = shadowFactor(vWorld, ndl);
            vec3 ambient = hemisphere(n);
            vec3 diffuse = uSunColor * ndl * shadow;
            // A cool fill from the camera so the shadow side still has shape.
            float fill = pow(max(dot(n, v), 0.0), 1.5) * 0.35;
            ambient += uSkyColor * fill;

            vec3 h = normalize(l + v);
            float specPower = mix(24.0, 220.0, 1.0 - rough);
            float spec = pow(max(dot(n, h), 0.0), specPower) * mix(0.25, 1.4, metal) * shadow;
            float fresnel = pow(1.0 - max(dot(n, v), 0.0), 4.0);

            // Rim: sky wraps the silhouette, the sun catches the far edge. This
            // is what lifts a machine off a background of the same grey.
            float ndv = max(dot(n, v), 0.0);
            vec3 rim = uSkyColor * pow(1.0 - ndv, 3.0) * 1.5;
            rim += uSunColor * pow(1.0 - ndv, 4.0) * max(dot(n, l), 0.0) * 0.35 * shadow;

            vec3 color = base * (ambient + diffuse + pointLights(vWorld, n)) +
                uSunColor * spec + hemisphere(reflect(-v, n)) * fresnel * 0.25 + rim * base;
            color = mix(color, uColor.rgb * 2.4, uEmissive);
            color += uFlash;
            fragColor = vec4(applyFog(color, vWorld), uColor.a);
        }
    """

    /** Arena floor: worn concrete slabs, tyre scuffs, sector markings, shadow. */
    const val FLOOR_FS = """#version 300 es
        $COMMON_FS
        in vec3 vNormal;
        in vec3 vWorld;
        in vec3 vLocal;
        in float vShade;
        out vec4 fragColor;

        uniform vec4 uColor;
        uniform float uHalfSize;

        float slabSeams(vec2 p, float spacing, float width) {
            vec2 q = abs(fract(p / spacing) - 0.5) * spacing;
            vec2 fw = fwidth(p) * width + 0.001;
            vec2 line = smoothstep(fw, vec2(0.0), q);
            return max(line.x, line.y);
        }

        void main() {
            vec2 p = vWorld.xz;
            vec3 base = uColor.rgb;

            // Poured slabs, each one a slightly different mix.
            vec2 slab = floor(p / 8.0);
            base *= 0.86 + 0.20 * hash21(slab);
            base *= 0.84 + 0.24 * fbm(p * 0.35);

            float seam = slabSeams(p, 8.0, 1.6);
            base = mix(base, base * 0.55, seam * 0.8);

            // Painted sector lines, scuffed away in patches.
            float paint = slabSeams(p, 24.0, 2.4);
            float wear = smoothstep(0.35, 0.75, fbm(p * 0.8));
            base = mix(base, vec3(0.32, 0.29, 0.15), paint * 0.65 * wear);

            float ring = smoothstep(1.2, 0.0, abs(length(p) - 26.0) - 0.6);
            base = mix(base, vec3(0.26, 0.21, 0.11), ring * 0.45 * wear);

            // Scorch and rubber worn into the centre of the pit, and the arcs
            // where machines have been dashing round it for years.
            float traffic = smoothstep(38.0, 6.0, length(p));
            base *= mix(1.0, 0.72, traffic * (0.4 + 0.6 * fbm(p * 1.7)));
            float arcs = smoothstep(0.62, 0.98, fbm(vec2(length(p) * 0.55, atan(p.y, p.x) * 3.0)));
            base *= mix(1.0, 0.78, arcs * smoothstep(52.0, 12.0, length(p)));

            // Spilled fuel: darker, and glossy enough to catch the sun.
            float oil = smoothstep(0.72, 0.88, fbm(p * 0.22 + 11.0));
            base = mix(base, base * 0.35, oil);

            // Hazard band around the rim.
            float edge = smoothstep(uHalfSize - 5.0, uHalfSize - 1.0, max(abs(p.x), abs(p.y)));
            float stripe = step(0.5, fract((p.x + p.y) * 0.18));
            base = mix(base, mix(vec3(0.30, 0.22, 0.05), vec3(0.05, 0.045, 0.04), stripe), edge * 0.8);

            vec3 n = normalize(vNormal);
            vec3 l = normalize(uLightDir);
            float ndl = max(dot(n, l), 0.0);
            float shadow = shadowFactor(vWorld, ndl);
            vec3 color = base * (hemisphere(n) + uSunColor * ndl * shadow + pointLights(vWorld, n));

            vec3 v = normalize(uCameraPos - vWorld);
            vec3 h = normalize(l + v);
            // Only the fuel patches are shiny; dry concrete stays matte.
            float gloss = mix(0.0, 1.0, oil);
            color += uSunColor * pow(max(dot(n, h), 0.0), 90.0) * gloss * 0.9 * shadow;
            float fres = pow(1.0 - max(dot(n, v), 0.0), 5.0);
            color += uSkyColor * fres * (0.18 + gloss * 0.4);

            fragColor = vec4(applyFog(color, vWorld), 1.0);
        }
    """

    /** Sky dome: banded haze, a real sun, and slow dust cloud. */
    const val SKY_FS = """#version 300 es
        $COMMON_FS
        in vec3 vNormal;
        in vec3 vWorld;
        in vec3 vLocal;
        in float vShade;
        out vec4 fragColor;

        uniform vec3 uHorizon;
        uniform vec3 uZenith;

        void main() {
            float h = clamp(vShade, 0.0, 1.0);
            vec3 col = mix(uHorizon, uZenith, pow(h, 0.55));

            vec3 dir = normalize(vLocal);
            vec3 sun = normalize(uLightDir);
            float d = max(dot(dir, sun), 0.0);
            // Disc, then the glow around it, then a wide scatter over the sky.
            col += uSunColor * pow(d, 3200.0) * 24.0;
            col += uSunColor * pow(d, 90.0) * 1.1;
            col += uSunColor * pow(d, 6.0) * 0.16;

            // Thin, high dust clouds drifting over the wastes.
            vec2 cloudUv = dir.xz / max(dir.y + 0.28, 0.08) * 0.6 + vec2(uTime * 0.004, uTime * 0.002);
            float cloud = smoothstep(0.52, 0.86, fbm(cloudUv * 1.7));
            cloud *= smoothstep(0.02, 0.35, dir.y);
            col = mix(col, mix(uFogColor * 1.15, uSunColor * 0.9, 0.35), cloud * 0.55);

            fragColor = vec4(col, 1.0);
        }
    """

    /** Distant ruin silhouettes ringing the arena. */
    const val BACKDROP_FS = """#version 300 es
        $COMMON_FS
        in vec3 vNormal;
        in vec3 vWorld;
        in vec3 vLocal;
        in float vShade;
        out vec4 fragColor;
        uniform vec4 uColor;
        void main() {
            vec3 n = normalize(vNormal);
            float ndl = max(dot(n, normalize(uLightDir)), 0.0);
            vec3 base = uColor.rgb * mix(0.75, 1.05, hash21(floor(vWorld.xz * 0.08)));
            vec3 color = base * (hemisphere(n) * 1.1 + uSunColor * ndl * 0.5);
            // Deliberately heavy haze: these are kilometres away.
            float dist = length(uCameraPos - vWorld);
            float fog = 1.0 - exp(-dist * uFogDensity * 1.35);
            color = mix(color, uFogColor * 1.1, clamp(fog, 0.0, 0.94));
            fragColor = vec4(color, 1.0);
        }
    """

    /** Camera-facing quads: tracers, flashes, smoke, blast spheres. */
    const val SPRITE_VS = """#version 300 es
        precision highp float;
        in vec3 aPos;
        in vec2 aUV;
        in vec4 aColor;
        uniform mat4 uViewProj;
        out vec2 vUV;
        out vec4 vColor;
        out vec3 vWorld;
        void main() {
            vUV = aUV;
            vColor = aColor;
            vWorld = aPos;
            gl_Position = uViewProj * vec4(aPos, 1.0);
        }
    """

    const val SPRITE_FS = """#version 300 es
        precision highp float;
        in vec2 vUV;
        in vec4 vColor;
        in vec3 vWorld;
        out vec4 fragColor;
        /** 0 soft blob, 1 hard ring, 2 streak, 3 shadow blob, 4 smoke puff */
        uniform int uShape;
        uniform float uIntensity;
        uniform vec3 uFogColor;
        uniform vec3 uCameraPos;
        uniform float uFogDensity;

        float hash21(vec2 p) {
            p = fract(p * vec2(123.34, 456.21));
            p += dot(p, p + 45.32);
            return fract(p.x * p.y);
        }
        float valueNoise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
                       mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
        }

        void main() {
            vec2 d = vUV * 2.0 - 1.0;
            float r = length(d);
            float a;
            if (uShape == 1) {
                a = smoothstep(1.0, 0.93, r) * smoothstep(0.76, 0.90, r);
            } else if (uShape == 2) {
                a = smoothstep(1.0, 0.0, abs(d.x)) * smoothstep(1.0, 0.30, abs(d.y));
            } else if (uShape == 3) {
                a = smoothstep(1.0, 0.15, r);
            } else if (uShape == 4) {
                // Billowing puff: a soft disc chewed up by noise.
                float n = valueNoise(vUV * 4.0 + vWorld.xz * 0.35);
                a = smoothstep(1.0, 0.15, r + n * 0.45 - 0.2);
            } else {
                a = smoothstep(1.0, 0.05, r);
                a *= a;
            }
            if (a <= 0.003) discard;
            vec3 color = vColor.rgb * uIntensity;
            if (uShape == 4 || uShape == 3) {
                float dist = length(uCameraPos - vWorld);
                float fog = 1.0 - exp(-dist * uFogDensity);
                color = mix(color, uFogColor, clamp(fog, 0.0, 1.0) * 0.8);
            }
            fragColor = vec4(color, vColor.a * a);
        }
    """

    /** Flat 2D overlay: bars, sticks, reticle, radar and text. */
    const val HUD_VS = """#version 300 es
        precision highp float;
        in vec3 aPos;
        in vec2 aUV;
        in vec4 aColor;
        uniform mat4 uProj;
        out vec2 vUV;
        out vec4 vColor;
        void main() {
            vUV = aUV;
            vColor = aColor;
            gl_Position = uProj * vec4(aPos.xy, 0.0, 1.0);
        }
    """

    const val HUD_FS = """#version 300 es
        precision highp float;
        in vec2 vUV;
        in vec4 vColor;
        out vec4 fragColor;
        uniform sampler2D uTex;
        /** 0 solid, 1 font atlas, 2 ring, 3 soft disc, 4 bar with scanlines, 5 hex plate */
        uniform int uMode;

        void main() {
            vec4 c = vColor;
            if (uMode == 1) {
                c.a *= texture(uTex, vUV).a;
            } else if (uMode == 2) {
                vec2 d = vUV * 2.0 - 1.0;
                float r = length(d);
                c.a *= smoothstep(1.0, 0.93, r) * smoothstep(0.80, 0.90, r);
            } else if (uMode == 3) {
                vec2 d = vUV * 2.0 - 1.0;
                c.a *= smoothstep(1.0, 0.55, length(d));
            } else if (uMode == 4) {
                // Gauge fill: fine scanlines and a bright leading edge.
                float scan = 0.82 + 0.18 * step(0.5, fract(vUV.y * 6.0));
                float edge = smoothstep(0.86, 1.0, vUV.x);
                c.rgb *= scan;
                c.rgb += c.rgb * edge * 1.4;
            } else if (uMode == 5) {
                // Button plate: soft disc with a bevelled rim.
                vec2 d = vUV * 2.0 - 1.0;
                float r = length(d);
                float body = smoothstep(1.0, 0.94, r);
                float rim = smoothstep(0.80, 0.90, r) * smoothstep(1.0, 0.95, r);
                c.a *= body * 0.55 + rim * 1.6;
                c.rgb += vec3(rim * 0.35);
            }
            if (c.a <= 0.004) discard;
            fragColor = c;
        }
    """

    /** Fullscreen triangle, generated from gl_VertexID - no buffers needed. */
    const val POST_VS = """#version 300 es
        precision highp float;
        out vec2 vUV;
        void main() {
            vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
            vUV = p;
            gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
        }
    """

    /**
     * FXAA, on the finished picture. Hard-edged machinery against flat concrete
     * is exactly the case that stair-steps worst without it.
     */
    const val FXAA_FS = """#version 300 es
        precision highp float;
        in vec2 vUV;
        out vec4 fragColor;
        uniform sampler2D uImage;
        uniform vec2 uTexel;

        float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

        void main() {
            vec3 rgbM = texture(uImage, vUV).rgb;
            vec3 rgbNW = texture(uImage, vUV + vec2(-1.0, -1.0) * uTexel).rgb;
            vec3 rgbNE = texture(uImage, vUV + vec2( 1.0, -1.0) * uTexel).rgb;
            vec3 rgbSW = texture(uImage, vUV + vec2(-1.0,  1.0) * uTexel).rgb;
            vec3 rgbSE = texture(uImage, vUV + vec2( 1.0,  1.0) * uTexel).rgb;

            float lM = luma(rgbM);
            float lNW = luma(rgbNW);
            float lNE = luma(rgbNE);
            float lSW = luma(rgbSW);
            float lSE = luma(rgbSE);
            float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
            float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
            if (lMax - lMin < 0.045) {
                fragColor = vec4(rgbM, 1.0);
                return;
            }

            vec2 dir = vec2(
                -((lNW + lNE) - (lSW + lSE)),
                  ((lNW + lSW) - (lNE + lSE))
            );
            float reduce = max((lNW + lNE + lSW + lSE) * 0.03125, 0.0078125);
            float rcpMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + reduce);
            dir = clamp(dir * rcpMin, -8.0, 8.0) * uTexel;

            vec3 rgbA = 0.5 * (
                texture(uImage, vUV + dir * (1.0 / 3.0 - 0.5)).rgb +
                texture(uImage, vUV + dir * (2.0 / 3.0 - 0.5)).rgb
            );
            vec3 rgbB = rgbA * 0.5 + 0.25 * (
                texture(uImage, vUV - dir * 0.5).rgb +
                texture(uImage, vUV + dir * 0.5).rgb
            );
            float lB = luma(rgbB);
            fragColor = vec4((lB < lMin || lB > lMax) ? rgbA : rgbB, 1.0);
        }
    """

    /** Bright pass: what is allowed to bloom. */
    const val BRIGHT_FS = """#version 300 es
        precision highp float;
        in vec2 vUV;
        out vec4 fragColor;
        uniform sampler2D uScene;
        uniform float uThreshold;
        uniform float uKnee;
        void main() {
            vec3 c = texture(uScene, vUV).rgb;
            float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
            float soft = clamp(lum - uThreshold + uKnee, 0.0, 2.0 * uKnee);
            soft = soft * soft / (4.0 * uKnee + 0.0001);
            float contribution = max(soft, lum - uThreshold) / max(lum, 0.0001);
            fragColor = vec4(c * contribution, 1.0);
        }
    """

    /** Separable gaussian, nine taps with linear sampling. */
    const val BLUR_FS = """#version 300 es
        precision highp float;
        in vec2 vUV;
        out vec4 fragColor;
        uniform sampler2D uSource;
        uniform vec2 uDirection;
        void main() {
            vec2 o1 = uDirection * 1.3846153846;
            vec2 o2 = uDirection * 3.2307692308;
            vec3 c = texture(uSource, vUV).rgb * 0.2270270270;
            c += texture(uSource, vUV + o1).rgb * 0.3162162162;
            c += texture(uSource, vUV - o1).rgb * 0.3162162162;
            c += texture(uSource, vUV + o2).rgb * 0.0702702703;
            c += texture(uSource, vUV - o2).rgb * 0.0702702703;
            fragColor = vec4(c, 1.0);
        }
    """

    /**
     * Tone map, bloom, and the small lens tricks that sell a camera: vignette,
     * a touch of chromatic aberration at the edges, grain, and a radial smear
     * that kicks in while boosting.
     */
    const val COMPOSITE_FS = """#version 300 es
        precision highp float;
        in vec2 vUV;
        out vec4 fragColor;
        uniform sampler2D uScene;
        uniform sampler2D uBloom;
        uniform float uBloomStrength;
        uniform float uExposure;
        uniform float uTime;
        uniform float uDashBlur;
        uniform float uDamage;
        uniform vec2 uAspect;

        // ACES filmic curve, the cheap fitted version.
        vec3 tonemapACES(vec3 x) {
            const float a = 2.51;
            const float b = 0.03;
            const float c = 2.43;
            const float d = 0.59;
            const float e = 0.14;
            return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
        }

        vec3 sampleScene(vec2 uv) {
            return texture(uScene, uv).rgb;
        }

        void main() {
            vec2 uv = vUV;
            vec2 centred = (uv - 0.5) * uAspect;
            float radius = length(centred);

            vec3 scene;
            if (uDashBlur > 0.001) {
                // Radial smear out of the middle of the screen while boosting.
                vec3 sum = vec3(0.0);
                float total = 0.0;
                for (int i = 0; i < 8; i++) {
                    float t = float(i) / 7.0;
                    float scale = 1.0 - t * 0.055 * uDashBlur * smoothstep(0.1, 0.8, radius);
                    vec2 suv = (uv - 0.5) * scale + 0.5;
                    float w = 1.0 - t * 0.7;
                    sum += sampleScene(suv) * w;
                    total += w;
                }
                scene = sum / total;
            } else {
                scene = sampleScene(uv);
            }

            // Chromatic aberration, strictly at the corners.
            float ca = 0.0016 * smoothstep(0.25, 0.95, radius);
            if (ca > 0.0001) {
                scene.r = sampleScene(uv + centred * ca).r;
                scene.b = sampleScene(uv - centred * ca).b;
            }

            vec3 bloom = texture(uBloom, uv).rgb;
            vec3 color = scene + bloom * uBloomStrength;

            color *= uExposure;
            color = tonemapACES(color);

            // Split tone: cool shadows, warm highlights, and a little more
            // saturation than the raw render has. This is the grade.
            float lum = dot(color, vec3(0.2126, 0.7152, 0.0722));
            vec3 shadowTint = vec3(0.84, 0.93, 1.14);
            vec3 highlightTint = vec3(1.10, 1.01, 0.88);
            color *= mix(shadowTint, highlightTint, smoothstep(0.12, 0.72, lum));
            color = mix(vec3(lum), color, 1.14);

            // Damage haze: the picture goes hot and red as your armour runs out.
            color = mix(color, vec3(dot(color, vec3(0.33)) * 1.05, color.g * 0.55, color.b * 0.5), uDamage * 0.5);

            float vignette = smoothstep(1.35, 0.35, radius);
            color *= mix(0.55, 1.0, vignette);

            float grain = fract(sin(dot(uv * vec2(1920.0, 1080.0) + uTime * 60.0, vec2(12.9898, 78.233))) * 43758.5453);
            color += (grain - 0.5) * 0.020;

            // Back to display gamma.
            color = pow(max(color, vec3(0.0)), vec3(1.0 / 2.2));
            fragColor = vec4(color, 1.0);
        }
    """
}
