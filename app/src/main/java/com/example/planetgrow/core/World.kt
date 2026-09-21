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
enum class Terrain { GRASS, DIRT, STONE, SAND, WASTELAND }

class Planet(
    val radius: Float,
    val terrainSeed: Int = 0x51DE,
    /** 宇宙船の攻撃で荒れ地になっている中心角 (度)。無ければ null。 */
    private val wastelandCenterDeg: Float? = null,
    private val wastelandArcDeg: Float = PlanetState.WASTELAND_ARC_DEG
) {
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

    /** 地面の模様。岩場や土がまだらに混ざる。攻撃を受けた範囲は荒れ地になる。 */
    private fun terrainFor(i: Int, j: Int): Terrain {
        if (wastelandCenterDeg != null) {
            val angleDeg = toDeg(kotlin.math.atan2(j.toFloat(), i.toFloat()))
            if (kotlin.math.abs(shortestAngle(angleDeg - wastelandCenterDeg)) < wastelandArcDeg / 2f) {
                return Terrain.WASTELAND
            }
        }
        val rock = valueNoise(i * 0.26f, j * 0.26f, terrainSeed)
        if (rock > 0.70f) return Terrain.STONE
        val soil = valueNoise(i * 0.33f + 40f, j * 0.33f - 17f, terrainSeed xor 0x2A17)
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

/**
 * 惑星の正面に暮らすペット (池や畑と同じ、面に置かれる場所に住む)。
 * 家畜ではなくペットなので群れず、その場でのんびり過ごす。
 */
class Animal(val dist: Float, val angle: Float, val variant: Int, seed: Int) {
    private val rnd = Rnd(seed)
    private val animPhase: Float = rnd.float() * 10f
    var animTime: Float = 0f

    /** おなかがすいていると元気がなくなる。 */
    var hungry: Boolean = false

    fun update(dt: Float) {
        animTime += dt
    }

    /** のんびりした仕草のコマ (0 or 1)。おなかがすいているとじっとする。 */
    fun frame(): Int {
        if (hungry) return 0
        return if (((animTime + animPhase) * 1.6f).toInt() % 2 == 0) 0 else 1
    }
}

/** 煙突から出る煙や、着弾のかけら。位置はワールド座標 (ブロック単位)。 */
class Particle(var x: Float, var y: Float, var vx: Float, var vy: Float, val color: Int) {
    var life: Float = 0f
    var maxLife: Float = 2.6f
    var size: Float = 2f
    var gravity: Float = 0f
    /** これより中心に近づいたら、そこに留まって消えるのを待つ (地面に着いた扱い)。負なら無効。 */
    var groundRadius: Float = -1f
}

/**
 * 飛来の見せ方。中身 (資源) は同じでも、飛んでくる様子はまったく違う。
 *   STRAIGHT … 隕石。まっすぐ地表に落ちて突き刺さる
 *   DRIFT    … たね。綿毛がついていて、ゆっくり漂いながら着地する
 *   FLYBY    … 彗星。惑星の近くを直線でかすめて通り過ぎ、氷のきらめきを降らせる
 */
enum class FallStyle { STRAIGHT, DRIFT, FLYBY }

fun fallStyleFor(kind: SkyFallKind): FallStyle = when (kind) {
    SkyFallKind.METEOR -> FallStyle.STRAIGHT
    SkyFallKind.COSMIC_DUST -> FallStyle.DRIFT
    SkyFallKind.COMET_DUST -> FallStyle.FLYBY
}

/** 空から降ってくる・飛んでくるもの。 */
class FallingObject(val kind: SkyFallKind, val angleDeg: Float, val amount: Int) {
    val style: FallStyle = fallStyleFor(kind)

    var spin: Float = 0f
    var landed: Boolean = false
    var flash: Float = 0f
    /** FLYBY はどこにも「着地」しないので、これが立ったら消してよい。 */
    var finished: Boolean = false

    // ---- STRAIGHT (隕石): 惑星の中心からの距離を縮めて落ちる ----
    var dist: Float = 26f
    var speed: Float = 9f

    // ---- DRIFT (たね): 遠くの一点から着地点まで、ゆっくり弧を描いて漂う ----
    var driftFromX: Float = 0f
    var driftFromY: Float = 0f
    var driftToX: Float = 0f
    var driftToY: Float = 0f
    var driftT: Float = 0f
    var driftDuration: Float = 7f
    var swaySeed: Float = 0f

    // ---- FLYBY (彗星): 惑星のわきを直線で通り過ぎる ----
    var flyDirX: Float = 1f
    var flyDirY: Float = 0f
    var flyPerpX: Float = 0f
    var flyPerpY: Float = 1f
    /** 最接近時の、進路に垂直な向きのずれ (符号つき)。 */
    var flyOffset: Float = 0f
    /** 経路上の位置。0 が最接近点、マイナスから始まりプラスへ抜ける。 */
    var flyT: Float = 0f
    var flyHalfLength: Float = 26f
    var flySpeed: Float = 10f
    private var iceTimer: Float = 0f

    /** いまの世界座標 (ブロック単位)。惑星の中心が (0, 0)。 */
    fun flybyPosition(): FloatArray = floatArrayOf(
        flyPerpX * flyOffset + flyDirX * flyT,
        flyPerpY * flyOffset + flyDirY * flyT
    )

    /**
     * 氷のきらめきをまいてよいタイミングか。
     * 経路上の位置ではなく「いま実際に惑星からどれだけ離れているか」で判定する。
     * こうしないと、まだ遠いのに撒いてしまい、氷が地表に届く前に消えてしまう。
     */
    fun withinIceShower(): Boolean {
        val pos = flybyPosition()
        val d = kotlin.math.hypot(pos[0], pos[1])
        return d < abs(flyOffset) + 3f
    }

    fun tickIceTimer(dt: Float): Boolean {
        iceTimer -= dt
        if (iceTimer > 0f) return false
        iceTimer = 0.05f
        return true
    }
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

    var planet: Planet = Planet(state.radius(state.lastTickMillis))
        private set

    val residents = ArrayList<Resident>()
    val animals = ArrayList<Animal>()
    val particles = ArrayList<Particle>()
    val falling = ArrayList<FallingObject>()

    /** 衛星の地形。半径が変わったときだけ作り直す。 */
    private val satelliteTerrain = HashMap<Int, Planet>()

    private var smokeTimer = 0f
    private val rnd = Rnd(0x7A5E)
    private var builtRadius = state.radius(state.lastTickMillis)
    private var builtWastelandCenter: Float? = state.wastelandCenter(state.lastTickMillis)

    init {
        syncFromState(state.lastTickMillis)
    }

    /** 衛星の地形を取り出す (無ければ作る)。 */
    fun terrainFor(sat: Satellite, now: Long): Planet {
        val r = sat.radius(now)
        val cached = satelliteTerrain[sat.index]
        if (cached != null && cached.radius == r) return cached
        val made = Planet(r, 0x5A7E + sat.index * 977)
        satelliteTerrain[sat.index] = made
        return made
    }

    /** 保存された状態に合わせて、惑星の大きさ・住人・生きものの数をそろえる。 */
    fun syncFromState(now: Long) {
        val r = state.radius(now)
        val wasteCenter = state.wastelandCenter(now)
        if (r != builtRadius || wasteCenter != builtWastelandCenter) {
            planet = Planet(r, wastelandCenterDeg = wasteCenter)
            builtRadius = r
            builtWastelandCenter = wasteCenter
        }
        val homes = state.placed.filter { it.kind == BuildKind.HOUSE }.map { it.angleDeg }
        while (residents.size > homes.size) residents.removeAt(residents.size - 1)
        while (residents.size < homes.size) {
            val idx = residents.size
            residents.add(Resident(toRad(homes[idx] + 18f), homes[idx], 0x1000 + idx * 7919))
        }
        val born = state.placed.filter { it.kind == BuildKind.ANIMAL }
        while (animals.size > born.size) animals.removeAt(animals.size - 1)
        while (animals.size < born.size) {
            val idx = animals.size
            val a = born[idx]
            // 古いセーブ (ふちに立っていた頃) の生きものは面の中心へ寄せる
            animals.add(Animal(a.dist.coerceAtLeast(0f), toRad(a.angleDeg), a.variant, 0x2000 + idx * 6971))
        }
        val hungry = state.animalsHungry(now)
        for (a in animals) a.hungry = hungry
    }

    /** 飛来を画面に出す。 */
    fun addFalling(kind: SkyFallKind, angleDeg: Float, amount: Int) {
        if (falling.size > 6) return
        val f = FallingObject(kind, angleDeg, amount)
        when (f.style) {
            FallStyle.STRAIGHT -> {
                // 隕石: そのまま角度に沿って上空から落ちてくる
            }
            FallStyle.DRIFT -> {
                // たね: 遠くのどこかから、着地点 (angleDeg の地表) までゆっくり漂う
                val a = toRad(angleDeg)
                val ground = planet.groundRadius(a)
                f.driftToX = cos(a) * ground
                f.driftToY = sin(a) * ground
                val fromAngle = a + rnd.range(-1.1f, 1.1f)
                val fromDist = planet.radius + rnd.range(16f, 24f)
                f.driftFromX = cos(fromAngle) * fromDist
                f.driftFromY = sin(fromAngle) * fromDist
                f.driftDuration = 6f + rnd.float() * 3f
                f.swaySeed = rnd.float() * 100f
                f.spin = rnd.range(-0.6f, 0.6f)
            }
            FallStyle.FLYBY -> {
                // 彗星: 惑星のわきを一直線にかすめて通り過ぎる
                val travel = rnd.range(0f, 2f * PI.toFloat())
                f.flyDirX = cos(travel)
                f.flyDirY = sin(travel)
                f.flyPerpX = -f.flyDirY
                f.flyPerpY = f.flyDirX
                val side = if (rnd.int(2) == 0) 1f else -1f
                f.flyOffset = (planet.radius + rnd.range(1.5f, 3.5f)) * side
                f.flyHalfLength = planet.radius + 20f
                f.flyT = -f.flyHalfLength
                f.flySpeed = 9f + rnd.range(-1f, 1.5f)
                f.spin = 0.5f
            }
        }
        falling.add(f)
    }

    fun update(dt: Float, sunDirX: Float, sunDirY: Float) {
        for (r in residents) r.update(dt, sunDirX, sunDirY)
        for (a in animals) a.update(dt)
        updateFalling(dt)
        updateSmoke(dt)
        updateParticles(dt)
    }

    private fun updateFalling(dt: Float) {
        var i = 0
        while (i < falling.size) {
            val f = falling[i]
            when (f.style) {
                FallStyle.STRAIGHT -> updateStraight(f, dt)
                FallStyle.DRIFT -> updateDrift(f, dt)
                FallStyle.FLYBY -> updateFlyby(f, dt)
            }
            if (f.finished) {
                falling.removeAt(i)
                continue
            }
            i++
        }
    }

    private fun updateStraight(f: FallingObject, dt: Float) {
        f.spin += dt * 4f
        if (!f.landed) {
            f.dist -= f.speed * dt
            f.speed += 6f * dt
            val ground = planet.groundRadius(toRad(f.angleDeg))
            if (f.dist <= ground) {
                f.dist = ground
                f.landed = true
                f.flash = 1f
                burstRocky(f)
            }
        } else {
            f.flash -= dt * 1.6f
            if (f.flash <= 0f) f.finished = true
        }
    }

    private fun updateDrift(f: FallingObject, dt: Float) {
        f.spin += dt * 0.8f
        if (!f.landed) {
            f.driftT += dt / f.driftDuration
            if (f.driftT >= 1f) {
                f.driftT = 1f
                f.landed = true
                f.flash = 1f
                burstFluff(f)
            }
        } else {
            f.flash -= dt * 2.2f
            if (f.flash <= 0f) f.finished = true
        }
    }

    private fun updateFlyby(f: FallingObject, dt: Float) {
        f.spin += dt * 1.2f
        f.flyT += f.flySpeed * dt
        if (f.withinIceShower() && f.tickIceTimer(dt)) {
            spawnIceSparkle(f)
        }
        if (f.flyT > f.flyHalfLength) f.finished = true
    }

    /** たねが漂う、いまの世界座標。ゆっくり左右に揺れながら着地点へ向かう。 */
    fun driftPosition(f: FallingObject): FloatArray {
        val t = smoothstep(0f, 1f, f.driftT)
        val x = f.driftFromX + (f.driftToX - f.driftFromX) * t
        val y = f.driftFromY + (f.driftToY - f.driftFromY) * t
        // 進行方向に垂直な向きへ、だんだん収まる揺れを加える
        val dx = f.driftToX - f.driftFromX
        val dy = f.driftToY - f.driftFromY
        val len = hypot(dx, dy).coerceAtLeast(0.001f)
        val perpX = -dy / len
        val perpY = dx / len
        val sway = sin(f.swaySeed + f.driftT * 14f) * 1.6f * (1f - t * 0.7f)
        return floatArrayOf(x + perpX * sway, y + perpY * sway)
    }

    /** 着弾のかけらを散らす (隕石: 岩の破片)。 */
    private fun burstRocky(f: FallingObject) {
        val a = toRad(f.angleDeg)
        val nx = cos(a)
        val ny = sin(a)
        val color = rgbOf(0xC08A5A)
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
            p.gravity = -2.6f
            particles.add(p)
        }
    }

    /** たねが着地するときの、やわらかい綿毛のふわっとした散り方。 */
    private fun burstFluff(f: FallingObject) {
        val color = rgbOf(0x9BD46A)
        val count = 6 + f.amount * 2
        for (k in 0 until count) {
            val a = rnd.range(0f, 2f * PI.toFloat())
            val speed = rnd.range(0.15f, 0.6f)
            val p = Particle(
                f.driftToX + cos(a) * 0.4f,
                f.driftToY + sin(a) * 0.4f,
                cos(a) * speed,
                sin(a) * speed - 0.2f,
                color
            )
            p.maxLife = 1.0f + rnd.float() * 0.8f
            p.size = 1f + rnd.int(2)
            particles.add(p)
        }
    }

    /** 火山が活発化した瞬間の、噴石と噴煙が派手に出る一度きりの演出。 */
    fun eruptVolcano(angleDeg: Float) {
        val a = toRad(angleDeg)
        val nx = cos(a)
        val ny = sin(a)
        val surf = planet.groundRadius(a, 2.0f)
        val originX = nx * (surf + 5.5f)
        val originY = ny * (surf + 5.5f)
        val rockColor = rgbOf(0x5A4A42)
        val emberColor = rgbOf(0xFF8A1E)
        repeat(28) {
            val spread = rnd.range(-1.4f, 1.4f)
            val sx = -ny * spread
            val sy = nx * spread
            val speed = rnd.range(2.6f, 5.6f)
            val p = Particle(
                originX + sx * 0.3f,
                originY + sy * 0.3f,
                (nx * 1.2f + sx) * speed * 0.5f,
                (ny * 1.2f + sy) * speed * 0.5f,
                if (rnd.int(100) < 55) rockColor else emberColor
            )
            p.maxLife = 1.0f + rnd.float() * 1.2f
            p.size = 2f + rnd.int(3)
            p.gravity = -3.2f
            p.groundRadius = surf
            particles.add(p)
        }
        repeat(16) {
            val jitter = rnd.range(-1.6f, 1.6f)
            val p = Particle(
                originX + (-ny) * jitter,
                originY + nx * jitter,
                nx * 0.3f + rnd.range(-0.18f, 0.18f),
                ny * 0.3f + rnd.range(-0.18f, 0.18f),
                Art.smokeColor(150 + rnd.int(60))
            )
            p.maxLife = 2.6f + rnd.float() * 1.8f
            p.size = 3f + rnd.int(4)
            particles.add(p)
        }
    }

    /** 彗星が近くをかすめる間、氷のきらめきを少しずつ降らせる。 */
    private fun spawnIceSparkle(f: FallingObject) {
        if (particles.size > 170) return
        val pos = f.flybyPosition()
        val d = hypot(pos[0], pos[1]).coerceAtLeast(0.001f)
        val towardX = -pos[0] / d
        val towardY = -pos[1] / d
        repeat(2) {
            val jitter = rnd.range(-2.2f, 2.2f)
            val px = pos[0] + f.flyDirX * jitter * 0.6f
            val py = pos[1] + f.flyDirY * jitter * 0.6f
            val speed = rnd.range(2.2f, 3.2f)
            val p = Particle(
                px, py,
                towardX * speed + f.flyDirX * rnd.range(-0.3f, 0.3f),
                towardY * speed + f.flyDirY * rnd.range(-0.3f, 0.3f),
                if (rnd.int(100) < 55) rgbOf(0xEAF7FF) else rgbOf(0xAEE6FF)
            )
            p.maxLife = 1.5f + rnd.float() * 1.0f
            p.size = 1f + rnd.int(2)
            p.gravity = -2.6f
            p.groundRadius = planet.radius + 0.3f
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
            val surf = planet.groundRadius(a, 2.5f)
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
            if (s.groundRadius > 0f) {
                val d2 = hypot(s.x, s.y)
                if (d2 < s.groundRadius) {
                    // 地面についたので、そこで止まって残りの寿命だけ光る
                    val scale = s.groundRadius / d2.coerceAtLeast(0.001f)
                    s.x *= scale
                    s.y *= scale
                    s.vx = 0f
                    s.vy = 0f
                    s.gravity = 0f
                }
            }
            i++
        }
    }
}
