package com.example.planetgrow.core

import kotlin.math.PI
import kotlin.math.ceil
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.roundToInt
import kotlin.math.sin

/**
 * 惑星と住人の状態。
 *
 * 座標系: 惑星の中心が (0, 0)。1 ブロック = 1.0。画面と同じく y は下向きが正。
 * 角度: 0 = 右, -90 = 上(真上), 90 = 下, 180 = 左 (度数法・画面座標系)。
 */

enum class BlockKind { GRASS, DIRT, STONE, DEEPSLATE, CORE }

class Planet(val radius: Float) {
    /** ブロック座標の範囲 (-ri .. ri) */
    val ri: Int = ceil(radius).toInt()
    private val span: Int = ri * 2 + 1
    private val kinds: Array<BlockKind?> = arrayOfNulls(span * span)

    /** 角度ごとの地表までの距離 (0.5 度刻み)。住人や草木の設置に使う。 */
    private val surfaceTable = FloatArray(SURF_STEPS)

    init {
        for (j in -ri..ri) {
            for (i in -ri..ri) {
                val d = hypot(i.toFloat(), j.toFloat())
                if (d > radius) continue
                kinds[(j + ri) * span + (i + ri)] = when {
                    // 中心の 3x3 はマグマ
                    i >= -1 && i <= 1 && j >= -1 && j <= 1 -> BlockKind.CORE
                    d > radius - 1.0f -> BlockKind.GRASS
                    d > radius - 2.4f -> BlockKind.DIRT
                    d > radius * 0.42f -> BlockKind.STONE
                    else -> BlockKind.DEEPSLATE
                }
            }
        }
        buildSurfaceTable()
    }

    fun kindAt(i: Int, j: Int): BlockKind? {
        if (i < -ri || j < -ri || i > ri || j > ri) return null
        return kinds[(j + ri) * span + (i + ri)]
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
                if (kindAt(i, j) != null) {
                    found = t
                    break
                }
                t -= step
            }
            surfaceTable[k] = found
        }
    }

    /**
     * 足元が浮かないように、少し広めに見て低いほうの地表を返す。
     * ブロックの段差に人や木が引っかかって浮くのを防ぐ。
     */
    fun groundRadius(angle: Float): Float {
        var m = Float.MAX_VALUE
        for (k in -3..3) {
            val r = surfaceRadius(angle + k * 0.035f)
            if (r < m) m = r
        }
        // ブロックの角に乗って浮かないよう、理想的な球面より外には出さない
        return if (m > radius + 0.08f) radius + 0.08f else m
    }

    /** angle (ラジアン) 方向の地表までの半径。 */
    fun surfaceRadius(angle: Float): Float {
        val two = 2f * PI.toFloat()
        var a = angle % two
        if (a < 0f) a += two
        val k = ((a / two) * SURF_STEPS).toInt() % SURF_STEPS
        return surfaceTable[k]
    }

    companion object {
        private const val SURF_STEPS = 720
    }
}

enum class PropKind { HOUSE, TREE, POPPY, DANDELION, TUFT, LAMP }

/** 惑星の上に建っているもの。angleDeg は設置角度 (-90 が真上)。 */
class Prop(val kind: PropKind, val angleDeg: Float)

/**
 * 成長のスケジュール。
 * 「地球の 1 日 = 惑星の 1 日」で、起動日を 1 日目として日数が進むほど賑やかになる。
 * ここを書き換えれば成長の早さや内容を調整できる。
 */
object Growth {
    /** 家が建っている向き (真上)。住人の家でもある。 */
    const val FIRST_HOUSE_ANGLE = -90f

    /** 惑星の半径。家 (高さ 7 ブロック) のおよそ 2 倍の直径から始まる。 */
    fun radiusForDay(day: Int): Float = when {
        day < 6 -> 6.5f
        day < 15 -> 7.5f
        day < 30 -> 8.5f
        else -> 9.5f
    }

    /** 住人の数。 */
    fun residentsForDay(day: Int): Int = when {
        day < 15 -> 1
        day < 30 -> 2
        else -> 3
    }

    /** 家は地表が平らな上下左右にだけ建てる。 */
    private val HOUSE_ANGLES = floatArrayOf(-90f, 0f, 180f, 90f)

    fun houseAngles(day: Int): List<Float> {
        val n = residentsForDay(day)
        return (0 until n).map { HOUSE_ANGLES[it % HOUSE_ANGLES.size] }
    }

    /** その日までに生えているもの。 */
    fun propsForDay(day: Int): List<Prop> {
        val out = ArrayList<Prop>()
        for (a in houseAngles(day)) out.add(Prop(PropKind.HOUSE, a))
        for (s in SCHEDULE) {
            if (day >= s.day) out.add(Prop(s.kind, s.angleDeg))
        }
        return out
    }

    private class Entry(val day: Int, val kind: PropKind, val angleDeg: Float)

    private val SCHEDULE = listOf(
        Entry(2, PropKind.TUFT, -56f),
        Entry(2, PropKind.TUFT, -124f),
        Entry(3, PropKind.TREE, -34f),
        Entry(4, PropKind.POPPY, -142f),
        Entry(5, PropKind.TUFT, 22f),
        Entry(6, PropKind.TREE, 148f),
        Entry(7, PropKind.DANDELION, -14f),
        Entry(8, PropKind.LAMP, -158f),
        Entry(9, PropKind.TUFT, 62f),
        Entry(10, PropKind.POPPY, 118f),
        Entry(12, PropKind.TREE, 42f),
        Entry(14, PropKind.TUFT, 170f),
        Entry(16, PropKind.DANDELION, -104f),
        Entry(18, PropKind.TREE, -168f),
        Entry(20, PropKind.LAMP, 14f),
        Entry(24, PropKind.POPPY, 78f),
        Entry(28, PropKind.TREE, 100f),
        Entry(32, PropKind.TUFT, -74f),
        Entry(36, PropKind.LAMP, 136f),
        Entry(40, PropKind.TREE, -122f)
    )
}

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
        // 家のあたりが暗くなったら就寝、明るくなったら起床
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
                if (kotlin.math.abs(diff) < 0.06f) {
                    angle = toRad(homeAngle)
                    if (nightHome) state = INSIDE else state = WALK
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
        val two = 2f * PI.toFloat()
        if (angle > PI.toFloat()) angle -= two
        if (angle < -PI.toFloat()) angle += two
    }

    /** 歩行アニメのコマ (0 or 1)。止まっているときは常に 0。 */
    fun frame(): Int {
        if (state == IDLE || state == INSIDE) return 0
        return if ((animTime * 5.5f).toInt() % 2 == 0) 0 else 1
    }
}

/** 煙突から出る煙。位置はワールド座標 (ブロック単位)。 */
class Smoke(var x: Float, var y: Float, var vx: Float, var vy: Float) {
    var life: Float = 0f
    var maxLife: Float = 2.6f
    var size: Float = 2f
}

fun toRad(deg: Float): Float = deg * (PI.toFloat() / 180f)

fun toDeg(rad: Float): Float = rad * (180f / PI.toFloat())

/** その地点での太陽の高さ (1 = 真上, -1 = 真裏)。 */
fun localSunHeight(angleRad: Float, sunDirX: Float, sunDirY: Float): Float =
    cos(angleRad) * sunDirX + sin(angleRad) * sunDirY

/**
 * 惑星全体の状態。
 */
class World(startDay: Int) {
    var day: Int = startDay
        private set
    var planet: Planet = Planet(Growth.radiusForDay(startDay))
        private set
    var props: List<Prop> = Growth.propsForDay(startDay)
        private set
    val residents = ArrayList<Resident>()
    val smoke = ArrayList<Smoke>()
    private var smokeTimer = 0f
    private val rnd = Rnd(0x7A5E)

    init {
        rebuildResidents()
    }

    fun setDay(newDay: Int) {
        if (newDay == day) return
        val oldRadius = planet.radius
        day = newDay
        props = Growth.propsForDay(day)
        val r = Growth.radiusForDay(day)
        if (r != oldRadius) planet = Planet(r)
        rebuildResidents()
    }

    private fun rebuildResidents() {
        val want = Growth.residentsForDay(day)
        val homes = Growth.houseAngles(day)
        while (residents.size > want) residents.removeAt(residents.size - 1)
        while (residents.size < want) {
            val idx = residents.size
            val home = homes[idx]
            residents.add(Resident(toRad(home + 18f), home, 0x1000 + idx * 7919))
        }
    }

    fun update(dt: Float, sunDirX: Float, sunDirY: Float) {
        for (r in residents) r.update(dt, sunDirX, sunDirY)

        // 煙突の煙
        smokeTimer -= dt
        if (smokeTimer <= 0f) {
            smokeTimer = 0.55f + rnd.float() * 0.4f
            for (p in props) {
                if (p.kind != PropKind.HOUSE) continue
                if (smoke.size > 80) break
                val a = toRad(p.angleDeg)
                val surf = planet.groundRadius(a)
                // 煙突はおよそ屋根の上 (地表から 6.6 ブロック)、家の中心から 1 ブロック右
                val up = surf + 6.7f
                val side = 1.0f
                val nx = cos(a)
                val ny = sin(a)
                // ローカル右方向 = (-ny, nx)
                val x = nx * up + (-ny) * side
                val y = ny * up + nx * side
                val s = Smoke(x, y, nx * 0.55f + rnd.range(-0.12f, 0.12f), ny * 0.55f + rnd.range(-0.12f, 0.12f))
                s.maxLife = 2.2f + rnd.float() * 1.4f
                s.size = 2f + rnd.int(3)
                smoke.add(s)
            }
        }
        var i = 0
        while (i < smoke.size) {
            val s = smoke[i]
            s.life += dt
            if (s.life >= s.maxLife) {
                smoke.removeAt(i)
                continue
            }
            s.x += s.vx * dt
            s.y += s.vy * dt
            s.vx *= 0.995f
            s.vy *= 0.995f
            i++
        }
    }
}
