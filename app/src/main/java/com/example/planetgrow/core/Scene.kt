package com.example.planetgrow.core

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * 地球時間から決まる空の状態。
 * 太陽は 0 時に真下、6 時に左、12 時に真上、18 時に右。現実の 24 時間で一周する。
 */
class Sky(val dayFraction: Float, val epochMillis: Long) {
    val sunAngle: Float = (dayFraction * 2f + 0.5f) * PI.toFloat()
    val sunDirX: Float = cos(sunAngle)
    val sunDirY: Float = sin(sunAngle)
    val moonAngle: Float = sunAngle + PI.toFloat()
}

/** 場面が広いときに使う、半分の大きさのドット絵。 */
object HalfSprites {
    private val cache = HashMap<Sprite, Sprite>()

    fun of(s: Sprite): Sprite {
        val hit = cache[s]
        if (hit != null) return hit
        val made = s.halfSize()
        cache[s] = made
        return made
    }
}

/**
 * 画面 1 枚分を描くレンダラ。
 * ピクセルバッファに描いてから画面へ拡大転送するので、どの端末でも同じドットの大きさになる。
 *
 * 衛星まで入ると場面が広くなるので、そのときは 1 ブロック 8px に落として描く。
 */
class Scene(val width: Int, val height: Int, val blockPx: Int = Tex.SIZE) {

    companion object {
        const val BLOCK = Tex.SIZE

        /**
         * 画面の短辺に収めるブロック数。
         * 見ている天体が画面いっぱいに映るように決める。
         * 衛星は離れているので、タップで見に行く (カメラが移動する)。
         */
        fun viewBlocksFor(state: PlanetState, now: Long): Int =
            (2f * (state.radius(now) + 7.5f)).roundToInt().coerceAtLeast(24)

        /** 広い場面ではドットを小さくして、描く量を抑える。 */
        fun blockPxFor(viewBlocks: Int): Int = if (viewBlocks > 44) 8 else 16

        /** カメラが見ている天体。-1 = 惑星, 0.. = 衛星。 */
        const val FOCUS_PLANET = -1
        const val FOCUS_NONE = -2

        /** 画面サイズとブロック数からピクセルバッファのサイズを決める。 */
        fun bufferSize(screenW: Int, screenH: Int, viewBlocks: Int, blockPx: Int): IntArray {
            if (screenW <= 0 || screenH <= 0) return intArrayOf(viewBlocks * blockPx, viewBlocks * blockPx)
            val shortSide = min(screenW, screenH).toFloat()
            val scale = (viewBlocks * blockPx) / shortSide
            val w = (screenW * scale).roundToInt().coerceAtLeast(64)
            val h = (screenH * scale).roundToInt().coerceAtLeast(64)
            return intArrayOf(w, h)
        }

        private val DAY_TINT = rgbOf(0xFFFAF0)
        private val DUSK_TINT = rgbOf(0xFFC08A)
        private val NIGHT_TINT = rgbOf(0x55649C)
        private val WARM_LIGHT = rgbOf(0xFFC46A)
        private val BEAM_COLOR = rgbOf(0x9CFFEC)
    }

    val frame = PixelBuffer(width, height)
    private val background = PixelBuffer(width, height)

    /** カメラが見ているワールド座標 (ブロック)。 */
    private var camX = 0f
    private var camY = 0f
    private var camReady = false

    /** いま見ている天体。-1 = 惑星, 0.. = 衛星。 */
    var focus: Int = FOCUS_PLANET

    private var originX = width / 2
    private var originY = height / 2
    private val half = blockPx / 2

    /** 画面外の天体を指す印 [x, y, 天体番号]。タップの当たり判定にも使う。 */
    private val markers = ArrayList<FloatArray>()

    /** 16px のドット絵を今の倍率に合わせる係数。 */
    private val f: Float = blockPx / Tex.SIZE.toFloat()

    /** 橋の板。 */
    private val bridgeTile: Sprite = buildBridgeTile()

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

    // 遠くの UFO (ゲームには関係ない演出)。実時間のペースで、たまに現れる
    private var ufoWait = 40f
    private var ufoLife = -1f
    private var ufoX = 0f
    private var ufoY = 0f
    private var ufoVX = 0f
    private var ufoBobPhase = 0f

    // 遠くを通り過ぎるよその惑星 (演出)。実時間のペースで、めったに現れない
    private var farPlanetWait = 100f
    private var farPlanetLife = -1f
    private var farPlanetX = 0f
    private var farPlanetY = 0f
    private var farPlanetVX = 0f

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

    /** いまの倍率のドット絵を取り出す。 */
    private fun sp(s: Sprite): Sprite = if (blockPx == Tex.SIZE) s else HalfSprites.of(s)

    private fun buildBridgeTile(): Sprite {
        val n = Tex.SIZE
        val px = IntArray(n * n)
        val rail = rgbOf(0x5A4229)
        val plank = rgbOf(0xB08A54)
        val plankDark = rgbOf(0x9A7748)
        for (y in 0 until n) {
            for (x in 0 until n) {
                px[y * n + x] = when {
                    y < 2 || y > n - 3 -> rail
                    x % 5 == 0 -> plankDark
                    else -> plank
                }
            }
        }
        return Sprite(n, n, px)
    }

    private fun buildBackground() {
        val top = rgbOf(0x05070F)
        val bottom = rgbOf(0x0C1024)
        for (y in 0 until height) {
            val c = Col.lerp(top, bottom, y.toFloat() / height)
            val base = y * width
            for (x in 0 until width) background.px[base + x] = c
        }
        nebula(width * 0.22f, height * 0.26f, width * 0.55f, 0x3A2E6E, 0.42f)
        nebula(width * 0.82f, height * 0.72f, width * 0.5f, 0x1E4A64, 0.34f)
        nebula(width * 0.55f, height * 0.12f, width * 0.35f, 0x4A2E5E, 0.22f)
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
                var s = 1f - d2 / rr
                s = s * s * strength
                s *= 0.65f + 0.35f * rnd.float()
                background.addLight(x, y, (r0 * s).toInt(), (g0 * s).toInt(), (b0 * s).toInt())
            }
        }
    }

    // 太陽と月は楕円を描いて回る。建物より内側を通るときは後ろに隠れる。
    private fun orbitX(world: World, now: Long): Float =
        min(width / 2f / blockPx - 2.5f, world.state.radius(now) + 12f)
            .coerceAtLeast(world.state.radius(now) + 3f)

    private fun orbitY(world: World, now: Long): Float =
        min(height / 2f / blockPx - 2.5f, world.state.radius(now) + 12f)
            .coerceAtLeast(world.state.radius(now) + 3f)

    /** 光の当たり具合 (-1..1) から地表の色を決める。 */
    private fun lightTint(lambert: Float): Int {
        val c = Col.lerp(NIGHT_TINT, DUSK_TINT, smoothstep(-0.34f, 0.02f, lambert))
        return Col.lerp(c, DAY_TINT, smoothstep(0.02f, 0.30f, lambert))
    }

    private fun surfaceTint(angleRad: Float, sky: Sky): Int =
        lightTint(localSunHeight(angleRad, sky.sunDirX, sky.sunDirY))

    /** 0 = 昼, 1 = 夜。窓の明かりに使う。 */
    private fun nightness(angleRad: Float, sky: Sky): Float =
        1f - smoothstep(-0.25f, 0.2f, localSunHeight(angleRad, sky.sunDirX, sky.sunDirY))

    /** いま見ている天体のワールド座標。 */
    private fun cameraTarget(state: PlanetState, now: Long): FloatArray {
        if (focus >= 0) {
            val sat = state.satellites(now).firstOrNull { it.index == focus }
            if (sat != null) {
                val a = toRad(sat.angleDeg(now))
                return floatArrayOf(cos(a) * sat.orbitRadius, sin(a) * sat.orbitRadius)
            }
        }
        return floatArrayOf(0f, 0f)
    }

    fun render(world: World, sky: Sky, timeSec: Float, dt: Float) {
        val now = sky.epochMillis

        // カメラをなめらかに寄せる
        val target = cameraTarget(world.state, now)
        if (!camReady) {
            camX = target[0]
            camY = target[1]
            camReady = true
        } else {
            val k = (dt * 2.2f).coerceIn(0f, 1f)
            camX += (target[0] - camX) * k
            camY += (target[1] - camY) * k
        }
        originX = (width / 2f - camX * blockPx).roundToInt()
        originY = (height / 2f - camY * blockPx).roundToInt()

        frame.copyFrom(background)
        drawStars(timeSec)
        // ゲームには関係ない、遠くの演出 (奥から手前の順に描く)
        drawFarPlanetDecor(dt)
        drawBackgroundComet(sky)
        drawUfo(dt)
        drawShootingStar(dt)
        drawMoon(world, sky, now)
        drawSun(world, sky, now)
        drawSatellites(world, sky, now)
        drawBridges(world, sky, now)
        drawAtmosphere(world, sky, now)
        drawPlanet(world, sky, now)
        drawBuildings(world, sky, now)
        drawAnimals(world, sky, now)
        drawFleeing(world, sky)
        drawResidents(world, sky)
        drawParticles(world)
        drawFalling(world)
        drawAbduction(world)
        drawMarkers(world, now)
    }

    /** 画面の外にある天体を、画面のふちの印で知らせる。 */
    private fun drawMarkers(world: World, now: Long) {
        markers.clear()
        val bodies = ArrayList<FloatArray>() // x, y, 半径, 番号
        bodies.add(floatArrayOf(0f, 0f, world.state.radius(now), FOCUS_PLANET.toFloat()))
        for (sat in world.state.satellites(now)) {
            val a = toRad(sat.angleDeg(now))
            bodies.add(
                floatArrayOf(
                    cos(a) * sat.orbitRadius, sin(a) * sat.orbitRadius,
                    sat.radius(now), sat.index.toFloat()
                )
            )
        }
        val margin = 18f
        for (b in bodies) {
            val sx = originX + b[0] * blockPx
            val sy = originY + b[1] * blockPx
            val r = b[2] * blockPx
            val visible = sx + r > 0 && sx - r < width && sy + r > 0 && sy - r < height
            if (visible) continue
            // 画面のふちに寄せる
            val dx = sx - width / 2f
            val dy = sy - height / 2f
            val len = kotlin.math.hypot(dx, dy).coerceAtLeast(0.001f)
            val maxX = (width / 2f - margin) / (abs(dx) / len).coerceAtLeast(0.0001f)
            val maxY = (height / 2f - margin) / (abs(dy) / len).coerceAtLeast(0.0001f)
            val d = min(maxX, maxY)
            val mx = width / 2f + dx / len * d
            val my = height / 2f + dy / len * d
            val index = b[3].toInt()
            val color = if (index == FOCUS_PLANET) rgbOf(0x7CC24A) else rgbOf(0x9FB4E8)
            frame.glow(mx, my, 14f, color, 0.5f)
            val size = (6 * f).toInt().coerceAtLeast(3)
            frame.blendRect((mx - size / 2).toInt(), (my - size / 2).toInt(), size, size, Col.withAlpha(color, 230))
            // 番号のかわりに点を並べる (衛星1 = 1 個)
            if (index >= 0) {
                for (k in 0..index) {
                    val ox = (mx - size).toInt() + k * (size / 2 + 2)
                    frame.blendRect(ox, (my + size).toInt(), 2, 2, Col.withAlpha(color, 200))
                }
            }
            markers.add(floatArrayOf(mx, my, index.toFloat()))
        }
    }

    /**
     * 画面上の割合 (0..1) をタップしたとき、どの天体か。
     * FOCUS_NONE なら何もない。
     */
    fun bodyAtFraction(state: PlanetState, now: Long, fx: Float, fy: Float): Int {
        val bx = fx * width
        val by = fy * height
        // 画面のふちの印
        for (m in markers) {
            if (kotlin.math.hypot(bx - m[0], by - m[1]) < 34f * f) return m[2].toInt()
        }
        val wx = camX + (bx - width / 2f) / blockPx
        val wy = camY + (by - height / 2f) / blockPx
        for (sat in state.satellites(now)) {
            val a = toRad(sat.angleDeg(now))
            val sx = cos(a) * sat.orbitRadius
            val sy = sin(a) * sat.orbitRadius
            if (kotlin.math.hypot(wx - sx, wy - sy) <= sat.radius(now) + 4f) return sat.index
        }
        if (kotlin.math.hypot(wx, wy) <= state.radius(now) + 6f) return FOCUS_PLANET
        return FOCUS_NONE
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
            val t = k / 16f
            val x = (shootX - shootVX * t * 0.035f).toInt()
            val y = (shootY - shootVY * t * 0.035f).toInt()
            val a = ((1f - t) * fade * 230f).toInt()
            frame.blend(x, y, Col.argb(a, 255, 255, 240))
        }
    }

    /**
     * 遠くの UFO。ゲームには関係ない演出で、実時間のペースでたまに横切る
     * (GameTime を早回ししていても、これは普段どおりの速さで現れる)。
     *
     * 40〜115 秒おき。
     */
    private fun drawUfo(dt: Float) {
        if (ufoLife < 0f) {
            ufoWait -= dt
            if (ufoWait <= 0f) {
                val rnd = Rnd((ufoWait * 1000f).toInt() xor 0x2FA1)
                ufoLife = rnd.range(4f, 6f)
                val dir = if (rnd.int(2) == 0) 1f else -1f
                ufoY = rnd.range(height * 0.08f, height * 0.5f)
                ufoX = if (dir > 0f) -60f else width + 60f
                ufoVX = dir * rnd.range(90f, 150f)
                ufoBobPhase = rnd.float() * 10f
                ufoWait = 40f + rnd.float() * 75f
            }
            return
        }
        ufoLife -= dt
        ufoX += ufoVX * dt
        val bobY = ufoY + sin(ufoBobPhase + ufoX * 0.02f) * 10f
        if (ufoLife <= 0f || ufoX < -80f || ufoX > width + 80f) {
            ufoLife = -1f
            return
        }
        frame.glow(ufoX, bobY, 22f * f, rgbOf(0x9BE8FF), 0.4f)
        val sprite = sp(Art.ufo)
        frame.draw(sprite, (ufoX - sprite.w / 2f).roundToInt(), (bobY - sprite.h / 2f).roundToInt())
    }

    /**
     * 遠くを通り過ぎる、よその惑星。自分の星と同じ作りに見えるが、
     * ゲームの進行には関係ない背景の演出。
     *
     * 100〜260 秒おき。
     */
    private fun drawFarPlanetDecor(dt: Float) {
        if (farPlanetLife < 0f) {
            farPlanetWait -= dt
            if (farPlanetWait <= 0f) {
                val rnd = Rnd((farPlanetWait * 1000f).toInt() xor 0x7B2E)
                farPlanetLife = rnd.range(24f, 36f)
                val dir = if (rnd.int(2) == 0) 1f else -1f
                farPlanetY = rnd.range(height * 0.58f, height * 0.9f)
                farPlanetX = if (dir > 0f) -40f else width + 40f
                farPlanetVX = dir * (width + 80f) / farPlanetLife
                farPlanetWait = 100f + rnd.float() * 160f
            }
            return
        }
        farPlanetLife -= dt
        farPlanetX += farPlanetVX * dt
        if (farPlanetLife <= 0f) {
            farPlanetLife = -1f
            return
        }
        val sprite = Art.distantPlanet
        frame.glow(farPlanetX, farPlanetY, 10f, rgbOf(0x8FC85A), 0.16f)
        frame.draw(sprite, (farPlanetX - sprite.w / 2f).roundToInt(), (farPlanetY - sprite.h / 2f).roundToInt())
    }

    /**
     * 遠くの背景を、彗星がまるまる1日 (GameTime 基準) かけてゆっくり横切っていく。
     * 惑星が生まれてからの日数ごとに軌道 (高さ・向き) が変わるので、毎日同じ道ではない。
     */
    private fun drawBackgroundComet(sky: Sky) {
        val cycle = Math.floorDiv(sky.epochMillis, DAY_MS)
        val rnd = Rnd((cycle and 0xFFFFFL).toInt() xor 0x51C0)
        val laneY = rnd.range(height * 0.04f, height * 0.4f)
        val dir = if (rnd.int(2) == 0) 1f else -1f
        val margin = width * 0.12f
        val t = sky.dayFraction
        val x = if (dir > 0f) {
            -margin + (width + margin * 2f) * t
        } else {
            (width + margin) - (width + margin * 2f) * t
        }
        val trail = rgbOf(0xAEE6FF)
        for (k in 1..9) {
            val tx = x - dir * k * 5f
            val alpha = ((1f - k / 10f) * 100f).toInt()
            frame.blendRect((tx - 1f).toInt(), (laneY - 1f).toInt(), 2, 2, Col.withAlpha(trail, alpha))
        }
        frame.glow(x, laneY, 6f, rgbOf(0xCFE8FF), 0.4f)
        frame.blendRect((x - 1f).toInt(), (laneY - 1f).toInt(), 2, 2, Col.withAlpha(rgbOf(0xFFFFFF), 235))
    }

    private fun drawSun(world: World, sky: Sky, now: Long) {
        val cx = originX + cos(sky.sunAngle) * orbitX(world, now) * blockPx
        val cy = originY + sin(sky.sunAngle) * orbitY(world, now) * blockPx
        frame.glow(cx, cy, 62f * f, rgbOf(0xFFB92E), 0.80f)
        val s = sp(Art.sun)
        frame.draw(s, (cx - s.w / 2f).roundToInt(), (cy - s.h / 2f).roundToInt())
    }

    private fun drawMoon(world: World, sky: Sky, now: Long) {
        val cx = originX + cos(sky.moonAngle) * orbitX(world, now) * blockPx
        val cy = originY + sin(sky.moonAngle) * orbitY(world, now) * blockPx
        val sprite = sp(Art.moonSpriteFor(sky.epochMillis))
        val phase = Art.moonPhaseFraction(sky.epochMillis)
        val fullness = 1f - abs(phase - 0.5f) * 2f
        frame.glow(cx, cy, 46f * f, rgbOf(0x9FB4E8), 0.16f + 0.34f * fullness)
        frame.draw(sprite, (cx - sprite.w / 2f).roundToInt(), (cy - sprite.h / 2f).roundToInt())
    }

    /** 惑星のまわりの大気。太陽側が明るく光る。 */
    private fun drawAtmosphere(world: World, sky: Sky, now: Long) {
        atmosphereAround(originX.toFloat(), originY.toFloat(), world.state.radius(now), sky, 1f)
    }

    private fun atmosphereAround(cx: Float, cy: Float, radius: Float, sky: Sky, strength: Float) {
        val inner = radius - 0.4f
        val outer = radius + 2.3f
        val x0 = (cx - outer * blockPx).toInt().coerceAtLeast(0)
        val y0 = (cy - outer * blockPx).toInt().coerceAtLeast(0)
        val x1 = (cx + outer * blockPx).toInt().coerceAtMost(width)
        val y1 = (cy + outer * blockPx).toInt().coerceAtMost(height)
        val inner2 = inner * inner
        val outer2 = outer * outer
        for (y in y0 until y1) {
            val dy = (y + 0.5f - cy) / blockPx
            for (x in x0 until x1) {
                val dx = (x + 0.5f - cx) / blockPx
                val d2 = dx * dx + dy * dy
                if (d2 < inner2 || d2 > outer2) continue
                val d = sqrt(d2)
                var g = 1f - (d - inner) / (outer - inner)
                g *= g
                val h = (dx * sky.sunDirX + dy * sky.sunDirY) / d
                val lit = smoothstep(-0.4f, 0.5f, h)
                val s = g * (0.14f + 0.86f * lit) * 0.5f * strength
                frame.addLight(x, y, (0x64 * s).toInt(), (0xA0 * s).toInt(), (0xFF * s).toInt())
            }
        }
    }

    /** 惑星の地表。外から見た球として陰影をつける (内部は描かない)。 */
    private fun drawPlanet(world: World, sky: Sky, now: Long) {
        drawGlobe(world.planet, originX.toFloat(), originY.toFloat(), sky)
    }

    private fun drawGlobe(planet: Planet, cx: Float, cy: Float, sky: Sky) {
        val r = planet.radius
        val bx = cx.roundToInt()
        val by = cy.roundToInt()
        for (j in -planet.ri..planet.ri) {
            for (i in -planet.ri..planet.ri) {
                val terrain = planet.terrainAt(i, j) ?: continue
                val v = Tex.variantFor(i, j)
                val rim = planet.isRim(i, j)
                val tex = when (terrain) {
                    Terrain.GRASS -> if (rim) Tex.grass[rimDir(i, j)][v] else Tex.grassTop[v]
                    Terrain.DIRT -> Tex.dirt[v]
                    Terrain.STONE -> Tex.stone[v]
                    Terrain.SAND -> Tex.sand[v]
                    Terrain.WASTELAND -> Tex.wasteland[v]
                }
                val nx = i / r
                val ny = j / r
                val nz = sqrt((1f - nx * nx - ny * ny).coerceAtLeast(0f))
                val lambert = nx * sky.sunDirX + ny * sky.sunDirY
                val tint = Col.scale(lightTint(lambert), 0.72f + 0.28f * nz)
                frame.draw(sp(tex), bx + i * blockPx - half, by + j * blockPx - half, tint)
            }
        }
    }

    /** ふちのブロックがどちらを向いているか (0=上,1=右,2=下,3=左)。 */
    private fun rimDir(i: Int, j: Int): Int =
        if (abs(i) > abs(j)) {
            if (i > 0) 1 else 3
        } else {
            if (j > 0) 2 else 0
        }

    /** 惑星のまわりを回る衛星。 */
    private fun drawSatellites(world: World, sky: Sky, now: Long) {
        for (sat in world.state.satellites(now)) {
            val a = toRad(sat.angleDeg(now))
            val cx = originX + cos(a) * sat.orbitRadius * blockPx
            val cy = originY + sin(a) * sat.orbitRadius * blockPx
            val terrain = world.terrainFor(sat, now)
            if (sat.habitable(now)) {
                atmosphereAround(cx, cy, terrain.radius, sky, 0.8f)
            }
            drawGlobe(terrain, cx, cy, sky)
        }
    }

    /** 惑星と衛星をつなぐ橋。 */
    private fun drawBridges(world: World, sky: Sky, now: Long) {
        for (p in world.state.placed) if (p.kind == BuildKind.BRIDGE) drawBridge(world, sky, now, p.target, 1f)
        for (j in world.state.jobs) if (j.kind == BuildKind.BRIDGE) drawBridge(world, sky, now, j.target, j.progress(now))
    }

    private fun drawBridge(world: World, sky: Sky, now: Long, target: Int, progress: Float) {
        val sat = world.state.satellites(now).firstOrNull { it.index == target } ?: return
        val a = toRad(sat.angleDeg(now))
        val from = world.planet.groundRadius(a, 0.6f)
        val to = sat.orbitRadius - world.terrainFor(sat, now).radius
        if (to <= from) return
        val tint = surfaceTint(a, sky)
        val rot = a + (PI.toFloat() / 2f)
        val tile = sp(bridgeTile)
        val steps = ((to - from) / 1f).toInt().coerceAtLeast(1)
        val shown = (steps * progress).toInt().coerceAtLeast(if (progress > 0f) 1 else 0)
        for (k in 0 until shown) {
            val d = from + k + 0.5f
            val x = originX + cos(a) * d * blockPx
            val y = originY + sin(a) * d * blockPx
            frame.drawRotated(tile, x, y, tile.w / 2f, tile.h / 2f, rot, false, tint)
        }
    }

    /** 建っているもの・建設中のものを描く。 */
    private fun drawBuildings(world: World, sky: Sky, now: Long) {
        for (placed in world.state.placed) {
            if (placed.kind == BuildKind.BRIDGE) continue
            drawOne(world, sky, now, placed.kind, placed.angleDeg, 1f, false, placed.variant, placed.doneMillis, placed.dist, placed.target)
        }
        for (job in world.state.jobs) {
            if (job.kind == BuildKind.BRIDGE) continue
            drawOne(world, sky, now, job.kind, job.angleDeg, job.progress(now), true, 0, job.startMillis, job.dist, -1)
        }
    }

    private fun drawOne(
        world: World,
        sky: Sky,
        now: Long,
        kind: BuildKind,
        angleDeg: Float,
        progress: Float,
        building: Boolean,
        variant: Int,
        sinceMillis: Long,
        dist: Float,
        target: Int = -1
    ) {
        val a = toRad(angleDeg)
        // 火山だけは「作物の育ち具合」ではなく「おとなしい/活発化した」の 2 段階を表す
        val cropStage = if (kind == BuildKind.VOLCANO) {
            volcanoStageFor(now, sinceMillis)
        } else {
            cropStageFor(now, sinceMillis, building, progress)
        }
        // 火山に追いやられて合体した花は、ひとまわり大きい見た目にする。
        // 火山自体は、上で求めた cropStage (0/1) を「活発化したか」として使う
        val flatVariant = when {
            kind == BuildKind.FLOWER && target == 1 -> variant + 4
            kind == BuildKind.VOLCANO -> cropStage
            else -> variant
        }

        // 池や畑のように地面にあるものは、球の手前の面に平らに置く
        if (Structures.isOnSurface(kind) || dist >= 0f) {
            drawOnSurface(world, sky, now, kind, a, dist, progress, building, cropStage, variant)
            return
        }

        val surf = world.planet.groundRadius(a, world.state.halfWidthBlocks(kind))
        val cx = (originX + cos(a) * surf * blockPx).roundToInt().toFloat()
        val cy = (originY + sin(a) * surf * blockPx).roundToInt().toFloat()
        val rot = a + (PI.toFloat() / 2f)
        val tint = surfaceTint(a, sky)

        val flat = Structures.flatSpriteFor(kind, progress, flatVariant)
        if (flat != null) {
            val s = sp(flat)
            frame.drawRotated(s, cx, cy, s.w / 2f, s.h.toFloat(), rot, false, tint)
            return
        }
        val st = Structures.forBuild(kind, progress, variant, cropStage) ?: return
        val body = sp(st.body)
        val gradual = building && Structures.revealsGradually(kind)
        val minY = if (gradual) ((1f - progress) * body.h).toInt() else 0

        if (gradual) {
            frame.drawRotated(sp(st.scaffold), cx, cy, st.anchorX * f, st.anchorY * f, rot, false, tint, 200)
        }
        frame.drawRotated(body, cx, cy, st.anchorX * f, st.anchorY * f, rot, false, tint, 255, minY)

        val night = nightness(a, sky)
        val lights = st.lights
        if (!building && lights != null && night > 0.02f) {
            frame.drawRotated(sp(lights), cx, cy, st.anchorX * f, st.anchorY * f, rot, false, Col.WHITE, (night * 255f).toInt())
            val ca = cos(rot)
            val sa = sin(rot)
            for (spot in st.lightSpots) {
                val ox = (spot[0] - st.anchorX) * f
                val oy = (spot[1] - st.anchorY) * f
                val gx = cx + ca * ox - sa * oy
                val gy = cy + sa * ox + ca * oy
                frame.glow(gx, gy, spot[2] * f, WARM_LIGHT, 0.55f * night)
            }
        }
    }

    /** 火山: 0=おとなしい, 1=活発化した (火口が常に赤く光る)。 */
    private fun volcanoStageFor(now: Long, sinceMillis: Long): Int =
        if (now - sinceMillis >= PlanetState.VOLCANO_ACTIVE_AFTER) 1 else 0

    /** 畑の作物の育ち具合 (0..2)。時間とともに実って、また植え直される。 */
    private fun cropStageFor(now: Long, sinceMillis: Long, building: Boolean, progress: Float): Int {
        if (building) return (progress * 2f).toInt().coerceIn(0, 2)
        val period = PlanetState.CROP_PERIOD_MILLIS
        val phase = ((now - sinceMillis) % period).toFloat() / period.toFloat()
        return (phase * 3f).toInt().coerceIn(0, 2)
    }

    /** 惑星の手前側の面に、平らに置くもの (池・畑・卵・ペット)。 */
    private fun drawOnSurface(
        world: World,
        sky: Sky,
        now: Long,
        kind: BuildKind,
        a: Float,
        dist: Float,
        progress: Float,
        building: Boolean,
        cropStage: Int,
        variant: Int = 0
    ) {
        val r = world.state.radius(now)
        val faceR = if (dist >= 0f) dist else r * 0.52f
        val wx = cos(a) * faceR
        val wy = sin(a) * faceR
        val cx = (originX + wx * blockPx).roundToInt()
        val cy = (originY + wy * blockPx).roundToInt()
        val nx = wx / r
        val ny = wy / r
        val nz = sqrt((1f - nx * nx - ny * ny).coerceAtLeast(0f))
        val tint = Col.scale(lightTint(nx * sky.sunDirX + ny * sky.sunDirY), 0.72f + 0.28f * nz)

        // 卵など、育ち具合で見た目そのものが変わるものを先に見る (孵ったあとは null になり下へ落ちる)
        val flat = Structures.flatSpriteFor(kind, progress, variant)
        if (flat != null) {
            val s = sp(flat)
            frame.draw(s, cx - s.w / 2, cy - s.h / 2, tint)
            return
        }
        val st = Structures.forBuild(kind, progress, 0, cropStage) ?: return
        val body = sp(st.body)
        frame.draw(body, cx - body.w / 2, cy - body.h / 2, tint)
        if (building) {
            frame.draw(sp(st.scaffold), cx - body.w / 2, cy - body.h / 2, tint, ((1f - progress) * 160f).toInt())
        }
    }

    private fun drawResidents(world: World, sky: Sky) {
        for (r in world.residents) {
            if (r.visible <= 0.03f) continue
            val surf = world.planet.groundRadius(r.angle)
            val cx = originX + cos(r.angle) * surf * blockPx
            val cy = originY + sin(r.angle) * surf * blockPx
            val rot = r.angle + (PI.toFloat() / 2f)
            val idx = r.frame()
            val sprite = sp(Art.villager[idx])
            val bob = if (idx == 0) 1f else 0f
            frame.drawRotated(
                sprite, cx, cy,
                Art.VILLAGER_CENTER_X * f, (Art.VILLAGER_FOOT_Y + bob) * f, rot, false,
                surfaceTint(r.angle, sky), (r.visible * 255f).toInt()
            )
        }
    }

    /** 家畜は池や畑と同じ惑星の正面に平らに座り、ペットは家などと同じくふちに立つ。 */
    private fun drawAnimals(world: World, sky: Sky, now: Long) {
        val r = world.state.radius(now)
        for (an in world.animals) {
            val set = Art.animals[an.variant % Art.animals.size]
            val sprite = sp(set[an.frame() % set.size])
            if (an.onFace) {
                val wx = cos(an.angle) * an.dist
                val wy = sin(an.angle) * an.dist
                val cx = (originX + wx * blockPx).roundToInt()
                val cy = (originY + wy * blockPx).roundToInt()
                val nx = wx / r
                val ny = wy / r
                val nz = sqrt((1f - nx * nx - ny * ny).coerceAtLeast(0f))
                var tint = Col.scale(lightTint(nx * sky.sunDirX + ny * sky.sunDirY), 0.72f + 0.28f * nz)
                if (an.hungry) tint = Col.scale(tint, 0.75f)
                frame.draw(sprite, cx - sprite.w / 2, cy - sprite.h / 2, tint)
            } else {
                val surf = world.planet.groundRadius(an.angle, world.state.halfWidthBlocks(BuildKind.PET))
                val cx = originX + cos(an.angle) * surf * blockPx
                val cy = originY + sin(an.angle) * surf * blockPx
                val rot = an.angle + (PI.toFloat() / 2f)
                frame.drawRotated(sprite, cx, cy, sprite.w / 2f, sprite.h.toFloat(), rot, false, surfaceTint(an.angle, sky))
            }
        }
    }

    /** 空腹で旅立つ家畜。惑星から外向きに漂いながら、しだいに透けて消える。 */
    private fun drawFleeing(world: World, sky: Sky) {
        for (fl in world.fleeing) {
            val a = toRad(fl.angleDeg) + fl.angleOffset()
            val dist = fl.dist()
            val cx = originX + cos(a) * dist * blockPx
            val cy = originY + sin(a) * dist * blockPx
            val rot = a + (PI.toFloat() / 2f)
            val set = Art.animals[fl.variant % Art.animals.size]
            val sprite = sp(set[0])
            val alpha = (fl.alpha() * 255f).toInt()
            frame.drawRotated(sprite, cx, cy, sprite.w / 2f, sprite.h.toFloat(), rot, false, surfaceTint(a, sky), alpha)
        }
    }

    /** 宇宙船が家畜をさらっていく演出。UFO が現れ、光線を出して吸い込み、去っていく。 */
    private fun drawAbduction(world: World) {
        val ab = world.abduction ?: return
        val a = toRad(ab.angleDeg)
        val nx = cos(a)
        val ny = sin(a)
        val surf = world.planet.groundRadius(a, 1.0f)
        val ufoDist = surf + ab.height()
        val ufoX = originX + nx * ufoDist * blockPx
        val ufoY = originY + ny * ufoDist * blockPx

        if (ab.beaming()) {
            val groundX = originX + nx * surf * blockPx
            val groundY = originY + ny * surf * blockPx
            val steps = 8
            for (i in 0..steps) {
                val tt = i / steps.toFloat()
                val x = ufoX + (groundX - ufoX) * tt
                val y = ufoY + (groundY - ufoY) * tt
                val radius = (2.5f + 4.5f * tt) * f
                frame.glow(x, y, radius, BEAM_COLOR, 0.5f * (0.4f + 0.6f * (1f - tt)))
            }
        }

        val sprite = sp(Art.ufo)
        val rot = a + (PI.toFloat() / 2f)
        frame.glow(ufoX, ufoY, 20f * f, rgbOf(0x9BE8FF), 0.35f)
        frame.drawRotated(sprite, ufoX, ufoY, sprite.w / 2f, sprite.h / 2f, rot, false, Col.WHITE)
    }

    private fun drawParticles(world: World) {
        for (s in world.particles) {
            val t = (s.life / s.maxLife).coerceIn(0f, 1f)
            val a = ((1f - t) * 170f).toInt()
            if (a <= 2) continue
            val size = (s.size * f).toInt().coerceAtLeast(1)
            val x = (originX + s.x * blockPx).roundToInt() - size / 2
            val y = (originY + s.y * blockPx).roundToInt() - size / 2
            frame.blendRect(x, y, size, size, Col.withAlpha(s.color, a))
        }
    }

    /** 落ちてくる・飛んでくるもの。見せ方は種類ごとにまったく違う。 */
    private fun drawFalling(world: World) {
        for (obj in world.falling) {
            when (obj.style) {
                FallStyle.STRAIGHT -> drawStraightFall(obj)
                FallStyle.DRIFT -> drawDriftFall(world, obj)
                FallStyle.FLYBY -> drawFlybyComet(obj)
            }
        }
    }

    /** 隕石: まっすぐ落ちて、地表に突き刺さる。 */
    private fun drawStraightFall(obj: FallingObject) {
        val a = toRad(obj.angleDeg)
        val nx = cos(a)
        val ny = sin(a)
        val cx = originX + nx * obj.dist * blockPx
        val cy = originY + ny * obj.dist * blockPx
        val trail = Art.skyFallTrailColor(obj.kind)

        if (!obj.landed) {
            for (k in 1..14) {
                val d = obj.dist + k * 0.28f
                val x = (originX + nx * d * blockPx).roundToInt()
                val y = (originY + ny * d * blockPx).roundToInt()
                val alpha = ((1f - k / 15f) * 190f).toInt()
                val size = if (k < 5) 3 else 2
                frame.blendRect(x - size / 2, y - size / 2, size, size, Col.withAlpha(trail, alpha))
            }
            frame.glow(cx, cy, 26f * f, trail, 0.55f)
            val sprite = sp(Art.skyFallSprite(obj.kind))
            frame.drawRotated(sprite, cx, cy, sprite.w / 2f, sprite.h / 2f, obj.spin)
        } else {
            frame.glow(cx, cy, (30f + 40f * obj.flash) * f, trail, 0.8f * obj.flash)
        }
    }

    /** たね: 綿毛がついていて、ゆっくり揺れながら漂ってくる。 */
    private fun drawDriftFall(world: World, obj: FallingObject) {
        if (!obj.landed) {
            val pos = world.driftPosition(obj)
            val cx = originX + pos[0] * blockPx
            val cy = originY + pos[1] * blockPx
            frame.glow(cx, cy, 12f * f, rgbOf(0xEAF2C8), 0.22f)
            val sprite = sp(Art.skyFallSprite(obj.kind))
            frame.drawRotated(sprite, cx, cy, sprite.w / 2f, sprite.h / 2f, obj.spin)
        } else {
            val cx = originX + obj.driftToX * blockPx
            val cy = originY + obj.driftToY * blockPx
            frame.glow(cx, cy, (8f + 14f * obj.flash) * f, rgbOf(0x9BD46A), 0.5f * obj.flash)
        }
    }

    /** 彗星: 家ほどの大きさの塊が惑星のわきを一直線にかすめて、氷のきらめきを降らせる。 */
    private fun drawFlybyComet(obj: FallingObject) {
        val pos = obj.flybyPosition()
        val cx = originX + pos[0] * blockPx
        val cy = originY + pos[1] * blockPx
        val trail = Art.skyFallTrailColor(obj.kind)

        for (k in 1..22) {
            val back = k * 0.9f
            val tx = pos[0] - obj.flyDirX * back
            val ty = pos[1] - obj.flyDirY * back
            val x = (originX + tx * blockPx).roundToInt()
            val y = (originY + ty * blockPx).roundToInt()
            val alpha = ((1f - k / 23f) * 130f).toInt()
            val size = if (k < 8) 5 else 3
            frame.blendRect(x - size / 2, y - size / 2, size, size, Col.withAlpha(trail, alpha))
        }
        frame.glow(cx, cy, 60f * f, trail, 0.5f)
        val sprite = sp(Art.cometNucleus)
        frame.drawRotated(sprite, cx, cy, sprite.w / 2f, sprite.h / 2f, obj.spin)
    }
}
