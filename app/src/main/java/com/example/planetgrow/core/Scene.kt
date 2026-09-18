package com.example.planetgrow.core

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin

/**
 * 地球時間から決まる空の状態。
 * 太陽は 0 時に真下、6 時に左、12 時に真上、18 時に右。つまり現実の 24 時間で一周する。
 */
class Sky(val dayFraction: Float, val epochMillis: Long) {
    val sunAngle: Float = (dayFraction * 2f + 0.5f) * PI.toFloat()
    val sunDirX: Float = cos(sunAngle)
    val sunDirY: Float = sin(sunAngle)
    val moonAngle: Float = sunAngle + PI.toFloat()
}

/**
 * 画面 1 枚分を描くレンダラ。
 * ピクセルバッファに描いてから画面へ拡大転送するので、どの端末でも同じドットの大きさになる。
 */
class Scene(val width: Int, val height: Int) {

    companion object {
        const val BLOCK = Tex.SIZE

        /**
         * 画面の短辺に収めるブロック数。
         * 惑星が育って横にも家が建つと、少しずつ引いて全体が入るようにする。
         * (1 ブロック = 16px のままなので、ドットは常にくっきりしたまま)
         */
        fun viewBlocksFor(day: Int): Int {
            val r = Growth.radiusForDay(day)
            // 太陽が通る高さ: 横にも家があるなら家の高さ (7) を避ける
            val clearance = if (Growth.residentsForDay(day) > 1) 7.5f else 3.5f
            return (2f * (r + clearance + 2.5f)).roundToInt().coerceAtLeast(22)
        }

        /** 画面サイズとブロック数からピクセルバッファのサイズを決める。 */
        fun bufferSize(screenW: Int, screenH: Int, viewBlocks: Int): IntArray {
            if (screenW <= 0 || screenH <= 0) return intArrayOf(viewBlocks * BLOCK, viewBlocks * BLOCK)
            val shortSide = min(screenW, screenH).toFloat()
            val scale = (viewBlocks * BLOCK) / shortSide
            val w = (screenW * scale).roundToInt().coerceAtLeast(64)
            val h = (screenH * scale).roundToInt().coerceAtLeast(64)
            return intArrayOf(w, h)
        }

        private val DAY_TINT = rgbOf(0xFFFAF0)
        private val DUSK_TINT = rgbOf(0xFFA268)
        private val NIGHT_TINT = rgbOf(0x55649C)
        private val UNDERGROUND_TINT = rgbOf(0x8C8880)
        private val WARM_LIGHT = rgbOf(0xFFC46A)
    }

    val frame = PixelBuffer(width, height)
    private val background = PixelBuffer(width, height)
    private val originX = width / 2
    private val originY = height / 2
    private val half = BLOCK / 2

    // 星
    private val starCount = ((width * height) / 4200).coerceIn(60, 260)
    private val starX = IntArray(starCount)
    private val starY = IntArray(starCount)
    private val starBright = FloatArray(starCount)
    private val starPhase = FloatArray(starCount)
    private val starBig = BooleanArray(starCount)

    // 流れ星
    private var shootWait = 8f
    private var shootLife = -1f
    private var shootX = 0f
    private var shootY = 0f
    private var shootVX = 0f
    private var shootVY = 0f

    init {
        val rnd = Rnd(0x51A45)
        for (i in 0 until starCount) {
            starX[i] = rnd.int(width)
            starY[i] = rnd.int(height)
            starBright[i] = 0.35f + rnd.float() * 0.65f
            starPhase[i] = rnd.float() * 6.28f
            starBig[i] = rnd.int(100) < 12
        }
        buildBackground()
    }

    private fun buildBackground() {
        val top = rgbOf(0x05070F)
        val bottom = rgbOf(0x0C1024)
        for (y in 0 until height) {
            val c = Col.lerp(top, bottom, y.toFloat() / height)
            val base = y * width
            for (x in 0 until width) background.px[base + x] = c
        }
        // 淡い星雲
        nebula(width * 0.22f, height * 0.26f, width * 0.55f, 0x3A2E6E, 0.42f)
        nebula(width * 0.82f, height * 0.72f, width * 0.5f, 0x1E4A64, 0.34f)
        nebula(width * 0.55f, height * 0.12f, width * 0.35f, 0x4A2E5E, 0.22f)
        // 遠くの小さな星 (またたかない)
        val rnd = Rnd(0x9BEEF)
        repeat((width * height) / 2600) {
            val x = rnd.int(width)
            val y = rnd.int(height)
            val v = 40 + rnd.int(70)
            background.blend(x, y, Col.argb(255, v, v, (v * 1.15f).toInt().coerceAtMost(255)))
        }
    }

    private fun nebula(cx: Float, cy: Float, radius: Float, hex: Int, strength: Float) {
        val color = rgbOf(hex)
        val rnd = Rnd(hex)
        val r0 = Col.r(color)
        val g0 = Col.g(color)
        val b0 = Col.b(color)
        val x0 = (cx - radius).toInt().coerceAtLeast(0)
        val y0 = (cy - radius).toInt().coerceAtLeast(0)
        val x1 = (cx + radius).toInt().coerceAtMost(width)
        val y1 = (cy + radius).toInt().coerceAtMost(height)
        val rr = radius * radius
        for (y in y0 until y1) {
            for (x in x0 until x1) {
                val dx = x - cx
                val dy = (y - cy) * 1.35f
                val d2 = dx * dx + dy * dy
                if (d2 >= rr) continue
                var f = 1f - d2 / rr
                f = f * f * strength
                // ざらつきを足して雲らしく
                f *= 0.65f + 0.35f * rnd.float()
                background.addLight(x, y, (r0 * f).toInt(), (g0 * f).toInt(), (b0 * f).toInt())
            }
        }
    }

    /**
     * 太陽・月が回る半径 (ブロック)。画面に収まるように楕円にする。
     * 家 (高さ 7 ブロック) の上を通るだけの高さは必ず確保する。
     */
    private fun orbitX(world: World): Float =
        min(width / 2f / BLOCK - 2.5f, world.planet.radius + 12f)
            .coerceAtLeast(world.planet.radius + 3f)

    private fun orbitY(world: World): Float =
        min(height / 2f / BLOCK - 2.5f, world.planet.radius + 12f)
            .coerceAtLeast(world.planet.radius + 3f)

    /** その角度の地表の光の色。 */
    private fun surfaceTint(angleRad: Float, sky: Sky): Int {
        val h = localSunHeight(angleRad, sky.sunDirX, sky.sunDirY)
        val c = Col.lerp(NIGHT_TINT, DUSK_TINT, smoothstep(-0.65f, 0.06f, h))
        return Col.lerp(c, DAY_TINT, smoothstep(0f, 0.42f, h))
    }

    /** 0 = 昼, 1 = 夜。窓の明かりに使う。 */
    private fun nightness(angleRad: Float, sky: Sky): Float =
        1f - smoothstep(-0.25f, 0.2f, localSunHeight(angleRad, sky.sunDirX, sky.sunDirY))

    fun render(world: World, sky: Sky, timeSec: Float, dt: Float) {
        frame.copyFrom(background)
        drawStars(timeSec)
        drawShootingStar(dt)
        drawMoon(world, sky)
        drawSun(world, sky)
        drawAtmosphere(world, sky)
        drawPlanet(world, sky)
        drawProps(world, sky)
        drawSmoke(world)
        drawResidents(world, sky)
    }

    private fun drawStars(timeSec: Float) {
        for (i in 0 until starCount) {
            val tw = 0.65f + 0.35f * sin(timeSec * 1.7f + starPhase[i])
            val v = (starBright[i] * tw * 255f).toInt().coerceIn(0, 255)
            val c = Col.argb(v, 255, 255, 245)
            frame.blend(starX[i], starY[i], c)
            if (starBig[i]) {
                val dim = Col.argb(v / 2, 255, 255, 245)
                frame.blend(starX[i] + 1, starY[i], dim)
                frame.blend(starX[i] - 1, starY[i], dim)
                frame.blend(starX[i], starY[i] + 1, dim)
                frame.blend(starX[i], starY[i] - 1, dim)
            }
        }
    }

    private fun drawShootingStar(dt: Float) {
        if (shootLife < 0f) {
            shootWait -= dt
            if (shootWait <= 0f) {
                val rnd = Rnd((shootWait * 1000f).toInt() xor 0x7F3A)
                shootLife = 1.1f
                shootX = rnd.range(width * 0.1f, width * 0.9f)
                shootY = rnd.range(height * 0.05f, height * 0.45f)
                val dir = if (rnd.int(2) == 0) 1f else -1f
                shootVX = dir * rnd.range(280f, 420f)
                shootVY = rnd.range(90f, 190f)
                shootWait = 18f + rnd.float() * 30f
            }
            return
        }
        shootLife -= dt
        if (shootLife <= 0f) {
            shootLife = -1f
            return
        }
        shootX += shootVX * dt
        shootY += shootVY * dt
        val fade = (shootLife / 1.1f).coerceIn(0f, 1f)
        for (k in 0 until 16) {
            val f = k / 16f
            val x = (shootX - shootVX * f * 0.035f).toInt()
            val y = (shootY - shootVY * f * 0.035f).toInt()
            val a = ((1f - f) * fade * 230f).toInt()
            frame.blend(x, y, Col.argb(a, 255, 255, 240))
        }
    }

    private fun drawSun(world: World, sky: Sky) {
        val cx = originX + cos(sky.sunAngle) * orbitX(world) * BLOCK
        val cy = originY + sin(sky.sunAngle) * orbitY(world) * BLOCK
        frame.glow(cx, cy, 62f, rgbOf(0xFFB92E), 0.80f)
        frame.draw(Art.sun, (cx - Art.sun.w / 2f).roundToInt(), (cy - Art.sun.h / 2f).roundToInt())
    }

    private fun drawMoon(world: World, sky: Sky) {
        val cx = originX + cos(sky.moonAngle) * orbitX(world) * BLOCK
        val cy = originY + sin(sky.moonAngle) * orbitY(world) * BLOCK
        val sprite = Art.moonSpriteFor(sky.epochMillis)
        val phase = Art.moonPhaseFraction(sky.epochMillis)
        val fullness = 1f - abs(phase - 0.5f) * 2f
        frame.glow(cx, cy, 46f, rgbOf(0x9FB4E8), 0.16f + 0.34f * fullness)
        frame.draw(sprite, (cx - sprite.w / 2f).roundToInt(), (cy - sprite.h / 2f).roundToInt())
    }

    /** 惑星のまわりの大気。太陽側が明るく光る。 */
    private fun drawAtmosphere(world: World, sky: Sky) {
        val r = world.planet.radius
        val inner = r - 0.4f
        val outer = r + 2.3f
        val x0 = (originX - outer * BLOCK).toInt().coerceAtLeast(0)
        val y0 = (originY - outer * BLOCK).toInt().coerceAtLeast(0)
        val x1 = (originX + outer * BLOCK).toInt().coerceAtMost(width)
        val y1 = (originY + outer * BLOCK).toInt().coerceAtMost(height)
        val inner2 = inner * inner
        val outer2 = outer * outer
        for (y in y0 until y1) {
            val dy = (y + 0.5f - originY) / BLOCK
            for (x in x0 until x1) {
                val dx = (x + 0.5f - originX) / BLOCK
                val d2 = dx * dx + dy * dy
                if (d2 < inner2 || d2 > outer2) continue
                val d = kotlin.math.sqrt(d2)
                var f = 1f - (d - inner) / (outer - inner)
                f *= f
                val h = (dx * sky.sunDirX + dy * sky.sunDirY) / d
                val lit = smoothstep(-0.4f, 0.5f, h)
                val s = f * (0.14f + 0.86f * lit) * 0.5f
                frame.addLight(x, y, (0x64 * s).toInt(), (0xA0 * s).toInt(), (0xFF * s).toInt())
            }
        }
    }

    private fun drawPlanet(world: World, sky: Sky) {
        val p = world.planet
        for (j in -p.ri..p.ri) {
            for (i in -p.ri..p.ri) {
                val kind = p.kindAt(i, j) ?: continue
                val v = Tex.variantFor(i, j)
                val tex = when (kind) {
                    BlockKind.GRASS -> Tex.grass[grassDir(i, j)][v]
                    BlockKind.DIRT -> Tex.dirt[v]
                    BlockKind.STONE -> Tex.stone[v]
                    BlockKind.DEEPSLATE -> Tex.deepslate[v]
                    BlockKind.CORE -> Tex.core[v]
                }
                val tint = if (kind == BlockKind.CORE) {
                    Col.WHITE
                } else {
                    val d = hypot(i.toFloat(), j.toFloat())
                    val depth = p.radius - d
                    // 地表は昼夜がはっきり、深いところは一定の暗さに寄せる
                    val deepT = smoothstep(0.6f, 5.0f, depth) * 0.55f
                    val lit = surfaceTint(atan2(j.toFloat(), i.toFloat()), sky)
                    val dim = (1f - depth * 0.05f).coerceIn(0.62f, 1f)
                    Col.scale(Col.lerp(lit, UNDERGROUND_TINT, deepT), dim)
                }
                frame.draw(tex, originX + i * BLOCK - half, originY + j * BLOCK - half, tint)
            }
        }
        // 中心のマグマの光
        frame.glow(originX.toFloat(), originY.toFloat(), p.radius * BLOCK * 0.34f, rgbOf(0xFF7A18), 0.22f)
    }

    private fun grassDir(i: Int, j: Int): Int =
        if (abs(i) > abs(j)) {
            if (i > 0) 1 else 3
        } else {
            if (j > 0) 2 else 0
        }

    private fun drawProps(world: World, sky: Sky) {
        for (prop in world.props) {
            val a = toRad(prop.angleDeg)
            val surf = world.planet.groundRadius(a)
            val cx = (originX + cos(a) * surf * BLOCK).roundToInt().toFloat()
            val cy = (originY + sin(a) * surf * BLOCK).roundToInt().toFloat()
            val rot = a + (PI.toFloat() / 2f)
            val tint = surfaceTint(a, sky)

            val st = Structures.forProp(prop.kind)
            if (st != null) {
                frame.drawRotated(st.body, cx, cy, st.anchorX, st.anchorY, rot, false, tint)
                val night = nightness(a, sky)
                val lights = st.lights
                if (lights != null && night > 0.02f) {
                    frame.drawRotated(
                        lights, cx, cy, st.anchorX, st.anchorY, rot, false,
                        Col.WHITE, (night * 255f).toInt()
                    )
                    val ca = cos(rot)
                    val sa = sin(rot)
                    for (spot in st.lightSpots) {
                        val ox = spot[0] - st.anchorX
                        val oy = spot[1] - st.anchorY
                        val gx = cx + ca * ox - sa * oy
                        val gy = cy + sa * ox + ca * oy
                        frame.glow(gx, gy, spot[2], WARM_LIGHT, 0.55f * night)
                    }
                }
            } else {
                val flat = Structures.flatSpriteFor(prop.kind) ?: continue
                frame.drawRotated(flat, cx, cy, flat.w / 2f, flat.h.toFloat(), rot, false, tint)
            }
        }
    }

    private fun drawSmoke(world: World) {
        for (s in world.smoke) {
            val f = (s.life / s.maxLife).coerceIn(0f, 1f)
            val a = ((1f - f) * 140f).toInt()
            if (a <= 2) continue
            val size = (s.size + f * 2.5f).toInt().coerceAtLeast(1)
            val x = (originX + s.x * BLOCK).roundToInt() - size / 2
            val y = (originY + s.y * BLOCK).roundToInt() - size / 2
            frame.blendRect(x, y, size, size, Art.smokeColor(a))
        }
    }

    private fun drawResidents(world: World, sky: Sky) {
        for (r in world.residents) {
            if (r.visible <= 0.03f) continue
            val surf = world.planet.groundRadius(r.angle)
            val cx = (originX + cos(r.angle) * surf * BLOCK)
            val cy = (originY + sin(r.angle) * surf * BLOCK)
            val rot = r.angle + (PI.toFloat() / 2f)
            val f = r.frame()
            val sprite = Art.villager[f]
            val bob = if (f == 0) 1f else 0f
            frame.drawRotated(
                sprite, cx, cy, Art.VILLAGER_CENTER_X, Art.VILLAGER_FOOT_Y + bob, rot, false,
                surfaceTint(r.angle, sky), (r.visible * 255f).toInt()
            )
        }
    }
}
