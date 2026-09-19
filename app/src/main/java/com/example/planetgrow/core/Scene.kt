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
         * 惑星と、衛星の軌道まで入るように決める。
         */
        fun viewBlocksFor(state: PlanetState, now: Long): Int {
            var need = state.radius(now) + 7.5f
            for (s in state.satellites(now)) {
                need = max(need, s.orbitRadius + s.radius(now) + 2.5f)
            }
            return (2f * need).roundToInt().coerceAtLeast(24)
        }

        /** 広い場面ではドットを小さくして、描く量を抑える。 */
        fun blockPxFor(viewBlocks: Int): Int = if (viewBlocks > 40) 8 else 16

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
    }

    val frame = PixelBuffer(width, height)
    private val background = PixelBuffer(width, height)
    private val originX = width / 2
    private val originY = height / 2
    private val half = blockPx / 2

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

    fun render(world: World, sky: Sky, timeSec: Float, dt: Float) {
        val now = sky.epochMillis
        frame.copyFrom(background)
        drawStars(timeSec)
        drawShootingStar(dt)
        drawMoon(world, sky, now)
        drawSun(world, sky, now)
        drawSatellites(world, sky, now)
        drawBridges(world, sky, now)
        drawAtmosphere(world, sky, now)
        drawPlanet(world, sky, now)
        drawBuildings(world, sky, now)
        drawAnimals(world, sky)
        drawResidents(world, sky)
        drawParticles(world)
        drawFalling(world)
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
            drawOne(world, sky, now, placed.kind, placed.angleDeg, 1f, false, placed.variant, placed.doneMillis, placed.dist)
        }
        for (job in world.state.jobs) {
            if (job.kind == BuildKind.BRIDGE) continue
            drawOne(world, sky, now, job.kind, job.angleDeg, job.progress(now), true, 0, job.startMillis, job.dist)
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
        dist: Float
    ) {
        val a = toRad(angleDeg)
        val cropStage = cropStageFor(now, sinceMillis, building, progress)

        // 池や畑のように地面にあるものは、球の手前の面に平らに置く
        if (Structures.isOnSurface(kind) || dist >= 0f) {
            drawOnSurface(world, sky, now, kind, a, dist, progress, building, cropStage)
            return
        }

        val surf = world.planet.groundRadius(a, world.state.halfWidthBlocks(kind))
        val cx = (originX + cos(a) * surf * blockPx).roundToInt().toFloat()
        val cy = (originY + sin(a) * surf * blockPx).roundToInt().toFloat()
        val rot = a + (PI.toFloat() / 2f)
        val tint = surfaceTint(a, sky)

        val flat = Structures.flatSpriteFor(kind, progress, variant)
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

    /** 畑の作物の育ち具合 (0..2)。時間とともに実って、また植え直される。 */
    private fun cropStageFor(now: Long, sinceMillis: Long, building: Boolean, progress: Float): Int {
        if (building) return (progress * 2f).toInt().coerceIn(0, 2)
        val period = PlanetState.CROP_PERIOD_MILLIS
        val phase = ((now - sinceMillis) % period).toFloat() / period.toFloat()
        return (phase * 3f).toInt().coerceIn(0, 2)
    }

    /** 惑星の手前側の面に、平らに置くもの (池や畑)。 */
    private fun drawOnSurface(
        world: World,
        sky: Sky,
        now: Long,
        kind: BuildKind,
        a: Float,
        dist: Float,
        progress: Float,
        building: Boolean,
        cropStage: Int
    ) {
        val r = world.state.radius(now)
        val faceR = if (dist >= 0f) dist else r * 0.52f
        val wx = cos(a) * faceR
        val wy = sin(a) * faceR
        val cx = (originX + wx * blockPx).roundToInt()
        val cy = (originY + wy * blockPx).roundToInt()
        val st = Structures.forBuild(kind, progress, 0, cropStage) ?: return
        val body = sp(st.body)
        val nx = wx / r
        val ny = wy / r
        val nz = sqrt((1f - nx * nx - ny * ny).coerceAtLeast(0f))
        val tint = Col.scale(lightTint(nx * sky.sunDirX + ny * sky.sunDirY), 0.72f + 0.28f * nz)
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

    private fun drawAnimals(world: World, sky: Sky) {
        for (an in world.animals) {
            val surf = world.planet.groundRadius(an.angle)
            val cx = originX + cos(an.angle) * surf * blockPx
            val cy = originY + sin(an.angle) * surf * blockPx
            val rot = an.angle + (PI.toFloat() / 2f)
            val set = Art.animals[an.variant % Art.animals.size]
            val sprite = sp(set[an.frame() % set.size])
            var tint = surfaceTint(an.angle, sky)
            if (an.hungry) tint = Col.scale(tint, 0.75f)
            frame.drawRotated(
                sprite, cx, cy,
                Art.animalCenterX(an.variant) * f, Art.animalFootY(an.variant) * f, rot, an.dir < 0f,
                tint
            )
        }
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

    /** 落ちてくる隕石・チリ。 */
    private fun drawFalling(world: World) {
        for (obj in world.falling) {
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
                    val size = (if (k < 5) 3 else 2) * (if (blockPx == Tex.SIZE) 1 else 1)
                    frame.blendRect(x - size / 2, y - size / 2, size, size, Col.withAlpha(trail, alpha))
                }
                frame.glow(cx, cy, 26f * f, trail, 0.55f)
                val sprite = sp(Art.skyFallSprite(obj.kind))
                frame.drawRotated(sprite, cx, cy, sprite.w / 2f, sprite.h / 2f, obj.spin)
            } else {
                frame.glow(cx, cy, (30f + 40f * obj.flash) * f, trail, 0.8f * obj.flash)
            }
        }
    }
}
