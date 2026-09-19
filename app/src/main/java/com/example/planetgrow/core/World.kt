package com.example.planetgrow.core

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.hypot
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * 惑星と、その上で暮らすものたち。
 *
 * 座標系: 惑星の中心が (0, 0)。1 ブロック = 1.0。画面と同じく y は下向きが正。
 * 角度: 0 = 右, -90 = 上(真上), 90 = 下, 180 = 左 (度数法・画面座標系)。
 *
 * 惑星は「外から見た球」として描く。見えているのは地表だけで、内部は描かない。
 */

/** 地表のブロック。 */
enum class Terrain { GRASS, DIRT, STONE, SAND }

class Planet(val radius: Float) {
    /** ブロック座標の範囲 (-ri .. ri) */
    val ri: Int = ceil(radius).toInt()
    private val span: Int = ri * 2 + 1
    private val cells: Array<Terrain?> = arrayOfNulls(span * span)
    private val rim: BooleanArray = BooleanArray(span * span)

    /** 角度ごとの地表までの距離 (0.5 度刻み)。住人や建物の設置に使う。 */
    private val surfaceTable = FloatArray(SURF_STEPS)

    init {
        for (j in -ri..ri) {
            for (i in -ri..ri) {
                val d = hypot(i.toFloat(), j.toFloat())
                if (d > radius) continue
                cells[index(i, j)] = terrainFor(i, j)
            }
        }
        // ふちのブロック (外側に面しているもの) を覚えておく
        for (j in -ri..ri) {
            for (i in -ri..ri) {
                if (cells[index(i, j)] == null) continue
                val edge = terrainAt(i + 1, j) == null || terrainAt(i - 1, j) == null ||
                    terrainAt(i, j + 1) == null || terrainAt(i, j - 1) == null
                rim[index(i, j)] = edge
            }
        }
        buildSurfaceTable()
    }

    private fun index(i: Int, j: Int) = (j + ri) * span + (i + ri)

    fun terrainAt(i: Int, j: Int): Terrain? {
        if (i < -ri || j < -ri || i > ri || j > ri) return null
        return cells[index(i, j)]
    }

    fun isRim(i: Int, j: Int): Boolean {
        if (i < -ri || j < -ri || i > ri || j > ri) return false
        return rim[index(i, j)]
    }

    /** 地面の模様。岩場や土がまだらに混ざる。 */
    private fun terrainFor(i: Int, j: Int): Terrain {
        val rock = valueNoise(i * 0.26f, j * 0.26f, 0x51DE)
        if (rock > 0.70f) return Terrain.STONE
        val soil = valueNoise(i * 0.33f + 40f, j * 0.33f - 17f, 0x2A17)
        if (soil > 0.72f) return Terrain.DIRT
        return Terrain.GRASS
    }

    private fun buildSurfaceTable() {
        val step = 0.02f
        for (k in 0 until SURF_STEPS) {
            val a = (k.toFloat() / SURF_STEPS) * (2f * PI.toFloat())
            val cx = cos(a)
            val cy = sin(a)
            var t = radius + 1.5f
            var found = radius
            while (t > 1f) {
                val i = (cx * t).roundToInt()
                val j = (cy * t).roundToInt()
                if (terrainAt(i, j) != null) {
                    found = t
                    break
                }
                t -= step
            }
            surfaceTable[k] = found
        }
    }

    /** angle (ラジアン) 方向の地表までの半径。 */
    fun surfaceRadius(angle: Float): Float {
        val two = 2f * PI.toFloat()
        var a = angle % two
        if (a < 0f) a += two
        val k = ((a / two) * SURF_STEPS).toInt() % SURF_STEPS
        return surfaceTable[k]
    }

    /**
     * 足元が浮かないように、そのものの幅ぶん見渡して一番低い地表を返す。
     * 幅のある建物ほど広く見るので、ブロックの段差にまたがっても浮かない。
     */
    fun groundRadius(angle: Float, halfWidthBlocks: Float = 0.6f): Float {
        val halfSpan = kotlin.math.atan2(halfWidthBlocks, radius)
        val steps = 6
        var m = Float.MAX_VALUE
        for (k in -steps..steps) {
            val r = surfaceRadius(angle + halfSpan * k / steps)
            if (r < m) m = r
        }
        return if (m > radius + 0.08f) radius + 0.08f else m
    }

    companion object {
        private const val SURF_STEPS = 720
    }
}

// ---- ちょっとしたノイズ ----

private fun hashNoise(x: Int, y: Int, seed: Int): Float {
    var h = x * 374761393 + y * 668265263 + seed * 1274126177
    h = (h xor (h ushr 13)) * 1274126177
    h = h xor (h ushr 16)
    return ((h and 0x7FFFFFFF).toFloat() / 0x7FFFFFFF.toFloat())
}

/** 2 次元の値ノイズ (0..1)。 */
fun valueNoise(x: Float, y: Float, seed: Int): Float {
    val x0 = floor(x).toInt()
    val y0 = floor(y).toInt()
    val fx = smoothstep(0f, 1f, x - x0)
    val fy = smoothstep(0f, 1f, y - y0)
    val v00 = hashNoise(x0, y0, seed)
    val v10 = hashNoise(x0 + 1, y0, seed)
    val v01 = hashNoise(x0, y0 + 1, seed)
    val v11 = hashNoise(x0 + 1, y0 + 1, seed)
    val a = v00 + (v10 - v00) * fx
    val b = v01 + (v11 - v01) * fx
    return a + (b - a) * fy
}

// ---- 住人と生きもの ----

/** 惑星の表面を歩く住人。 */
class Resident(var angle: Float, val homeAngle: Float, seed: Int) {
    companion object {
        const val WALK = 0
        const val IDLE = 1
        const val GOING_HOME = 2
        const val INSIDE = 3

        /** 1 秒あたりの移動角 (ラジアン)。惑星一周におよそ 30 秒。 */
        const val SPEED = 0.21f
    }

    private val rnd = Rnd(seed)
    var state: Int = WALK
    var dir: Float = 1f
    var timer: Float = 2f + rnd.float() * 3f
    var animTime: Float = 0f
    private var turnCooldown: Float = 0f

    /** 家に入っている間は 0 に近づき、姿が消える。 */
    var visible: Float = 1f

    fun update(dt: Float, sunDirX: Float, sunDirY: Float) {
        animTime += dt
        turnCooldown -= dt
        val nightHome = localSunHeight(toRad(homeAngle), sunDirX, sunDirY) < -0.30f

        when (state) {
            INSIDE -> {
                visible = (visible - dt * 2.5f).coerceAtLeast(0f)
                if (!nightHome) {
                    state = WALK
                    timer = 2f + rnd.float() * 3f
                    dir = if (rnd.int(2) == 0) 1f else -1f
                }
            }
            GOING_HOME -> {
                visible = (visible + dt * 2.5f).coerceAtMost(1f)
                val diff = angleDiff(toRad(homeAngle), angle)
                if (abs(diff) < 0.06f) {
                    angle = toRad(homeAngle)
                    state = if (nightHome) INSIDE else WALK
                } else {
                    dir = if (diff > 0) 1f else -1f
                    angle += dir * SPEED * 1.4f * dt
                }
                if (!nightHome) state = WALK
            }
            IDLE -> {
                visible = (visible + dt * 2.5f).coerceAtMost(1f)
                timer -= dt
                if (nightHome) {
                    state = GOING_HOME
                } else if (timer <= 0f) {
                    state = WALK
                    timer = 3f + rnd.float() * 6f
                    if (rnd.int(100) < 45) dir = -dir
                }
            }
            else -> { // WALK
                visible = (visible + dt * 2.5f).coerceAtMost(1f)
                timer -= dt
                if (nightHome) {
                    state = GOING_HOME
                } else {
                    // 進む先が夜なら引き返す (日なたを歩く)
                    val ahead = localSunHeight(angle + dir * 0.45f, sunDirX, sunDirY)
                    if (ahead < -0.12f && turnCooldown <= 0f) {
                        dir = -dir
                        turnCooldown = 1.5f
                    }
                    angle += dir * SPEED * dt
                    if (timer <= 0f) {
                        state = IDLE
                        timer = 1.2f + rnd.float() * 2.5f
                    }
                }
            }
        }
        angle = wrapAngle(angle)
    }

    /** 歩行アニメのコマ (0 or 1)。 */
    fun frame(): Int {
        if (state == IDLE || state == INSIDE) return 0
        return if ((animTime * 5.5f).toInt() % 2 == 0) 0 else 1
    }
}

/** 惑星をうろうろする生きもの。夜はその場で丸くなる。 */
class Animal(var angle: Float, seed: Int) {
    private val rnd = Rnd(seed)
    var dir: Float = if (rnd.int(2) == 0) 1f else -1f
    var timer: Float = 1f + rnd.float() * 4f
    var animTime: Float = 0f
    var walking: Boolean = true

    fun update(dt: Float, sunDirX: Float, sunDirY: Float) {
        animTime += dt
        val night = localSunHeight(angle, sunDirX, sunDirY) < -0.25f
        if (night) {
            walking = false
            return
        }
        timer -= dt
        if (timer <= 0f) {
            walking = !walking
            timer = if (walking) 2f + rnd.float() * 5f else 1.5f + rnd.float() * 4f
            if (rnd.int(100) < 50) dir = -dir
        }
        if (walking) {
            val ahead = localSunHeight(angle + dir * 0.4f, sunDirX, sunDirY)
            if (ahead < -0.15f) dir = -dir
            angle = wrapAngle(angle + dir * 0.13f * dt)
        }
    }

    fun frame(): Int = if (!walking) 0 else if ((animTime * 4f).toInt() % 2 == 0) 0 else 1
}

/** 煙突から出る煙や、着弾のかけら。位置はワールド座標 (ブロック単位)。 */
class Particle(var x: Float, var y: Float, var vx: Float, var vy: Float, val color: Int) {
    var life: Float = 0f
    var maxLife: Float = 2.6f
    var size: Float = 2f
    var gravity: Float = 0f
}

/** 空から落ちてくるもの。 */
class FallingObject(val kind: SkyFallKind, val angleDeg: Float, val amount: Int) {
    /** 惑星の中心からの距離 (ブロック)。 */
    var dist: Float = 26f
    var speed: Float = 9f
    var spin: Float = 0f
    var landed: Boolean = false
    var flash: Float = 0f
}

fun toRad(deg: Float): Float = deg * (PI.toFloat() / 180f)

fun toDeg(rad: Float): Float = rad * (180f / PI.toFloat())

fun wrapAngle(a: Float): Float {
    val two = 2f * PI.toFloat()
    var v = a
    while (v > PI.toFloat()) v -= two
    while (v < -PI.toFloat()) v += two
    return v
}

/** その地点での太陽の高さ (1 = 真上, -1 = 真裏)。 */
fun localSunHeight(angleRad: Float, sunDirX: Float, sunDirY: Float): Float =
    cos(angleRad) * sunDirX + sin(angleRad) * sunDirY

/**
 * 画面に映る惑星まるごと。PlanetState (保存される値) から組み立てる。
 */
class World(val state: PlanetState) {

    var planet: Planet = Planet(state.radius())
        private set

    val residents = ArrayList<Resident>()
    val animals = ArrayList<Animal>()
    val particles = ArrayList<Particle>()
    val falling = ArrayList<FallingObject>()

    private var smokeTimer = 0f
    private val rnd = Rnd(0x7A5E)
    private var builtRadius = state.radius()

    init {
        syncFromState()
    }

    /** 保存された状態に合わせて、惑星の大きさ・住人・生きものの数をそろえる。 */
    fun syncFromState() {
        val r = state.radius()
        if (r != builtRadius) {
            planet = Planet(r)
            builtRadius = r
        }
        val homes = state.placed.filter { it.kind == BuildKind.HOUSE }.map { it.angleDeg }
        while (residents.size > homes.size) residents.removeAt(residents.size - 1)
        while (residents.size < homes.size) {
            val idx = residents.size
            residents.add(Resident(toRad(homes[idx] + 18f), homes[idx], 0x1000 + idx * 7919))
        }
        val wantAnimals = state.animalCount()
        while (animals.size > wantAnimals) animals.removeAt(animals.size - 1)
        while (animals.size < wantAnimals) {
            val idx = animals.size
            val a = state.placed.filter { it.kind == BuildKind.SHEEP }.getOrNull(idx)
            animals.add(Animal(toRad((a?.angleDeg ?: 0f) + 10f), 0x2000 + idx * 6971))
        }
    }

    /** 飛来を画面に出す。 */
    fun addFalling(kind: SkyFallKind, angleDeg: Float, amount: Int) {
        if (falling.size > 6) return
        falling.add(FallingObject(kind, angleDeg, amount))
    }

    fun update(dt: Float, sunDirX: Float, sunDirY: Float) {
        for (r in residents) r.update(dt, sunDirX, sunDirY)
        for (a in animals) a.update(dt, sunDirX, sunDirY)
        updateFalling(dt)
        updateSmoke(dt)
        updateParticles(dt)
    }

    private fun updateFalling(dt: Float) {
        var i = 0
        while (i < falling.size) {
            val f = falling[i]
            f.spin += dt * 4f
            if (!f.landed) {
                f.dist -= f.speed * dt
                f.speed += 6f * dt
                val ground = planet.groundRadius(toRad(f.angleDeg))
                if (f.dist <= ground) {
                    f.dist = ground
                    f.landed = true
                    f.flash = 1f
                    burst(f)
                }
            } else {
                f.flash -= dt * 1.6f
                if (f.flash <= 0f) {
                    falling.removeAt(i)
                    continue
                }
            }
            i++
        }
    }

    /** 着弾のかけらを散らす。 */
    private fun burst(f: FallingObject) {
        val a = toRad(f.angleDeg)
        val nx = cos(a)
        val ny = sin(a)
        val color = when (f.kind) {
            SkyFallKind.METEOR -> rgbOf(0xC08A5A)
            SkyFallKind.COSMIC_DUST -> rgbOf(0x9BD46A)
            SkyFallKind.COMET_DUST -> rgbOf(0xAEE6FF)
        }
        val count = 10 + f.amount * 4
        for (k in 0 until count) {
            val spread = rnd.range(-1.1f, 1.1f)
            val sx = -ny * spread
            val sy = nx * spread
            val speed = rnd.range(1.2f, 3.4f)
            val p = Particle(
                nx * (f.dist + 0.3f) + sx * 0.3f,
                ny * (f.dist + 0.3f) + sy * 0.3f,
                (nx + sx) * speed * 0.6f,
                (ny + sy) * speed * 0.6f,
                color
            )
            p.maxLife = 0.7f + rnd.float() * 0.9f
            p.size = 2f + rnd.int(3)
            p.gravity = -2.6f // 惑星に引き戻される
            particles.add(p)
        }
    }

    private fun updateSmoke(dt: Float) {
        smokeTimer -= dt
        if (smokeTimer > 0f) return
        smokeTimer = 0.55f + rnd.float() * 0.4f
        for (p in state.placed) {
            if (p.kind != BuildKind.HOUSE) continue
            if (particles.size > 140) break
            val a = toRad(p.angleDeg)
            val surf = planet.groundRadius(a)
            val up = surf + 7.0f
            val side = 1.0f
            val nx = cos(a)
            val ny = sin(a)
            val x = nx * up + (-ny) * side
            val y = ny * up + nx * side
            val s = Particle(
                x, y,
                nx * 0.55f + rnd.range(-0.12f, 0.12f),
                ny * 0.55f + rnd.range(-0.12f, 0.12f),
                Art.smokeColor(150)
            )
            s.maxLife = 2.2f + rnd.float() * 1.4f
            s.size = 2f + rnd.int(3)
            particles.add(s)
        }
    }

    private fun updateParticles(dt: Float) {
        var i = 0
        while (i < particles.size) {
            val s = particles[i]
            s.life += dt
            if (s.life >= s.maxLife) {
                particles.removeAt(i)
                continue
            }
            s.x += s.vx * dt
            s.y += s.vy * dt
            if (s.gravity != 0f) {
                val d = hypot(s.x, s.y)
                if (d > 0.001f) {
                    s.vx += (s.x / d) * s.gravity * dt
                    s.vy += (s.y / d) * s.gravity * dt
                }
            }
            s.vx *= 0.995f
            s.vy *= 0.995f
            i++
        }
    }
}
