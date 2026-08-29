package com.rollerdash.arena.render

/** Every GLSL source in the game lives here so the pipeline reads top to bottom. */
object Shaders {

    /** Hard-surface shader for mechs, cover and walls. */
    const val SOLID_VS = """#version 300 es
        precision highp float;
        in vec3 aPos;
        in vec3 aNormal;
        in float aShade;
        uniform mat4 uMVP;
        uniform mat4 uModel;
        out vec3 vNormal;
        out vec3 vWorld;
        out float vShade;
        void main() {
            vec4 world = uModel * vec4(aPos, 1.0);
            vWorld = world.xyz;
            vNormal = normalize(mat3(uModel) * aNormal);
            vShade = aShade;
            gl_Position = uMVP * vec4(aPos, 1.0);
        }
    """

    const val SOLID_FS = """#version 300 es
        precision highp float;
        in vec3 vNormal;
        in vec3 vWorld;
        in float vShade;
        out vec4 fragColor;
        uniform vec4 uColor;
        uniform vec3 uLightDir;
        uniform vec3 uCameraPos;
        uniform vec3 uFogColor;
        uniform float uFogDensity;
        uniform float uEmissive;
        uniform vec3 uFlash;
        void main() {
            vec3 n = normalize(vNormal);
            vec3 v = normalize(uCameraPos - vWorld);
            vec3 l = normalize(uLightDir);
            float diff = max(dot(n, l), 0.0);
            // Hemisphere ambient: warm from the sky, dusty bounce from the floor.
            float up = n.y * 0.5 + 0.5;
            vec3 ambient = mix(vec3(0.24, 0.21, 0.17), vec3(0.42, 0.46, 0.52), up);
            vec3 h = normalize(l + v);
            float spec = pow(max(dot(n, h), 0.0), 34.0) * 0.35;
            float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0) * 0.35;
            vec3 base = uColor.rgb * vShade;
            vec3 lit = base * (ambient + vec3(1.05, 0.99, 0.86) * diff) + vec3(spec) + base * rim;
            lit = mix(lit, uColor.rgb, uEmissive);
            lit += uFlash;
            float dist = length(uCameraPos - vWorld);
            float fog = 1.0 - exp(-dist * uFogDensity);
            fragColor = vec4(mix(lit, uFogColor, clamp(fog, 0.0, 1.0)), uColor.a);
        }
    """

    /** Arena floor: procedural grid, sector rings and a scuffed dirt tone. */
    const val FLOOR_FS = """#version 300 es
        precision highp float;
        in vec3 vNormal;
        in vec3 vWorld;
        in float vShade;
        out vec4 fragColor;
        uniform vec4 uColor;
        uniform vec3 uLightDir;
        uniform vec3 uCameraPos;
        uniform vec3 uFogColor;
        uniform float uFogDensity;
        uniform float uHalfSize;
        uniform float uTime;

        float gridLine(vec2 p, float spacing, float width) {
            vec2 g = abs(fract(p / spacing - 0.5) - 0.5) * spacing;
            vec2 fw = fwidth(p) * width;
            vec2 l = smoothstep(fw, vec2(0.0), g);
            return max(l.x, l.y);
        }

        void main() {
            vec2 p = vWorld.xz;
            float major = gridLine(p, 20.0, 2.2);
            float minor = gridLine(p, 5.0, 1.1);
            float r = length(p);
            float ring = smoothstep(0.9, 0.0, abs(mod(r, 20.0) - 10.0) - 9.6);

            vec3 base = uColor.rgb;
            base = mix(base, base * 1.35, minor * 0.35);
            base = mix(base, vec3(0.55, 0.62, 0.42), major * 0.55);
            base = mix(base, vec3(0.42, 0.48, 0.35), ring * 0.18);

            // Edge of the pit glows so you can feel the wall coming up behind you.
            float edge = smoothstep(uHalfSize - 6.0, uHalfSize, max(abs(p.x), abs(p.y)));
            base = mix(base, vec3(0.75, 0.42, 0.16), edge * (0.35 + 0.12 * sin(uTime * 2.0)));

            float diff = max(dot(normalize(vNormal), normalize(uLightDir)), 0.0);
            vec3 lit = base * (0.42 + 0.72 * diff);
            float dist = length(uCameraPos - vWorld);
            float fog = 1.0 - exp(-dist * uFogDensity);
            fragColor = vec4(mix(lit, uFogColor, clamp(fog, 0.0, 1.0)), 1.0);
        }
    """

    /** Sky dome: haze at the horizon, dusk above, sun smear towards the light. */
    const val SKY_FS = """#version 300 es
        precision highp float;
        in vec3 vNormal;
        in vec3 vWorld;
        in float vShade;
        out vec4 fragColor;
        uniform vec3 uHorizon;
        uniform vec3 uZenith;
        uniform vec3 uLightDir;
        void main() {
            float h = clamp(vShade, 0.0, 1.0);
            vec3 col = mix(uHorizon, uZenith, pow(h, 0.65));
            vec3 dir = normalize(vWorld);
            float sun = pow(max(dot(dir, normalize(uLightDir)), 0.0), 24.0);
            col += vec3(1.0, 0.72, 0.35) * sun * 0.6;
            fragColor = vec4(col, 1.0);
        }
    """

    /** Camera-facing quads: tracers, flashes, smoke, blast spheres, shadows. */
    const val SPRITE_VS = """#version 300 es
        precision highp float;
        in vec3 aPos;
        in vec2 aUV;
        in vec4 aColor;
        uniform mat4 uViewProj;
        out vec2 vUV;
        out vec4 vColor;
        void main() {
            vUV = aUV;
            vColor = aColor;
            gl_Position = uViewProj * vec4(aPos, 1.0);
        }
    """

    const val SPRITE_FS = """#version 300 es
        precision highp float;
        in vec2 vUV;
        in vec4 vColor;
        out vec4 fragColor;
        /** 0 soft blob, 1 hard ring, 2 streak, 3 shadow blob */
        uniform int uShape;
        void main() {
            vec2 d = vUV * 2.0 - 1.0;
            float r = length(d);
            float a;
            if (uShape == 1) {
                a = smoothstep(1.0, 0.82, r) * smoothstep(0.55, 0.78, r);
            } else if (uShape == 2) {
                a = smoothstep(1.0, 0.0, abs(d.x)) * smoothstep(1.0, 0.35, abs(d.y));
            } else if (uShape == 3) {
                a = smoothstep(1.0, 0.25, r);
            } else {
                a = smoothstep(1.0, 0.05, r);
                a *= a;
            }
            if (a <= 0.003) discard;
            fragColor = vec4(vColor.rgb, vColor.a * a);
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
        /** 0 solid, 1 font atlas, 2 ring, 3 soft disc */
        uniform int uMode;
        void main() {
            vec4 c = vColor;
            if (uMode == 1) {
                c.a *= texture(uTex, vUV).a;
            } else if (uMode == 2) {
                vec2 d = vUV * 2.0 - 1.0;
                float r = length(d);
                c.a *= smoothstep(1.0, 0.90, r) * smoothstep(0.72, 0.84, r);
            } else if (uMode == 3) {
                vec2 d = vUV * 2.0 - 1.0;
                c.a *= smoothstep(1.0, 0.55, length(d));
            }
            if (c.a <= 0.004) discard;
            fragColor = c;
        }
    """
}
