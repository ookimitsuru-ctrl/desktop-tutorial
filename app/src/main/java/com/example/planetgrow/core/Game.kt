package com.example.planetgrow.core

import kotlin.math.max
import kotlin.math.min

/**
 * 惑星に貯まっていく資源と、それを使って何を作るか。
 *
 * 時間はすべて地球の実時間。アプリを閉じている間も進むので、
 * 状態は「いつ何が起きたか」の時刻で持ち、開いたときにまとめて追いつかせる。
 */

const val HOUR_MS = 60L * 60L * 1000L
const val DAY_MS = 24L * HOUR_MS
const val WEEK_MS = 7L * DAY_MS

/**
 * ゲーム内で使う「今」。実時間を早回しするデバッグ/デモ用の倍率をここに集約する。
 *
 * 太陽・月の動き、地殻変動・農業・飛来・宇宙船の襲来・建設の進み方はすべて
 * この時刻を基準にしているので、ここを直すだけで一括して速さが変わる。
 * デバッグしたいときだけ 24 (1日=1時間) や 96 (1日=15分) にする。
 */
object GameTime {
    /** 1 = 実時間どおり。24 なら1日が1時間、96 なら1日が15分になる (デバッグ用)。 */
    var SCALE: Float = 1f

    /**
     * 直近の固定日時を基準に、そこからの経過だけを早回しする。
     * (1970年基準で丸ごと掛け算すると日付が遠い未来に飛んでしまうため)
     */
    private const val ANCHOR_MILLIS = 1735689600000L // 2025-01-01T00:00:00Z

    /** ゲーム内の「今」(見かけ上の時刻, ミリ秒)。 */
    fun now(): Long {
        val real = System.currentTimeMillis()
        if (SCALE == 1f) return real
        return ANCHOR_MILLIS + ((real - ANCHOR_MILLIS) * SCALE).toLong()
    }
}

/** 貯まる資源。 */
enum class ResourceKind { MINERAL, SEED, ICE, CROP }

/** 空から降ってくるもの。 */
enum class SkyFallKind(val resource: ResourceKind) {
    /** 隕石 → 鉱物 */
    METEOR(ResourceKind.MINERAL),

    /** 宇宙のチリ → 植物のたねや生物の卵 */
    COSMIC_DUST(ResourceKind.SEED),

    /** 彗星のチリ → 氷 */
    COMET_DUST(ResourceKind.ICE)
}

fun skyFallLabel(kind: SkyFallKind): String = when (kind) {
    SkyFallKind.METEOR -> "隕石"
    SkyFallKind.COSMIC_DUST -> "宇宙のチリ"
    SkyFallKind.COMET_DUST -> "彗星のチリ"
}

fun resourceLabel(kind: ResourceKind): String = when (kind) {
    ResourceKind.MINERAL -> "鉱石"
    ResourceKind.SEED -> "たね"
    ResourceKind.ICE -> "氷"
    ResourceKind.CROP -> "作物"
}

/** 一回の飛来。 */
class Arrival(
    val slot: Long,
    val atMillis: Long,
    val kind: SkyFallKind,
    val amount: Int,
    /** 落ちてくる方角 (度)。 */
    val angleDeg: Float
)

/**
 * 飛来の予定表。
 * 惑星の誕生時刻を種にして決めてあるので、アプリを閉じていても
 * 「その間に何回飛んできたか」を後から計算できる。
 */
object SkyFall {
    /** 1 時間に 1 回。 */
    const val SLOT_MILLIS = 1L * HOUR_MS

    private fun mix(a: Long, b: Long): Long {
        var h = a * -7046029254386353131L + b * -4658895280553007687L
        h = h xor (h ushr 32)
        h *= -7723592293110705685L
        h = h xor (h ushr 29)
        h *= -4371526650440235895L
        h = h xor (h ushr 32)
        return h
    }

    private fun positive(v: Long): Long = v and Long.MAX_VALUE

    fun arrivalForSlot(slot: Long, birthMillis: Long): Arrival {
        val h = mix(slot + 1L, birthMillis)
        val slotStart = birthMillis + slot * SLOT_MILLIS
        val offset = positive(h) % (SLOT_MILLIS - 60_000L)
        val roll = (positive(mix(h, 11L)) % 100L).toInt()
        val kind = when {
            roll < 40 -> SkyFallKind.METEOR
            roll < 75 -> SkyFallKind.COSMIC_DUST
            else -> SkyFallKind.COMET_DUST
        }
        val amount = 1 + (positive(mix(h, 23L)) % 3L).toInt()
        val angle = (positive(mix(h, 37L)) % 360L).toFloat() - 180f
        return Arrival(slot, slotStart + offset, kind, amount, angle)
    }

    /** (from, to] のあいだに飛来したものを古い順に返す。 */
    fun arrivalsBetween(fromMillis: Long, toMillis: Long, birthMillis: Long): List<Arrival> {
        if (toMillis <= fromMillis) return emptyList()
        val first = max(0L, (fromMillis - birthMillis) / SLOT_MILLIS)
        val last = (toMillis - birthMillis) / SLOT_MILLIS
        if (last < 0) return emptyList()
        val out = ArrayList<Arrival>()
        var slot = first
        while (slot <= last) {
            val a = arrivalForSlot(slot, birthMillis)
            if (a.atMillis > fromMillis && a.atMillis <= toMillis) out.add(a)
            slot++
            if (out.size > 200) break
        }
        return out
    }

    /** 次に飛来する予定。 */
    fun nextArrival(nowMillis: Long, birthMillis: Long): Arrival {
        var slot = max(0L, (nowMillis - birthMillis) / SLOT_MILLIS)
        while (true) {
            val a = arrivalForSlot(slot, birthMillis)
            if (a.atMillis > nowMillis) return a
            slot++
        }
    }
}

/** 作れるもの。PET は「つくる」からは選べず、レア卵からだけうまれる。 */
enum class BuildKind { FLOWER, TREE, LAMP, POND, FARM, HOUSE, ANIMAL, BRIDGE, PET }

/** 作るのに要る資源と時間。 */
class Recipe(
    val kind: BuildKind,
    val label: String,
    val note: String,
    /** できあがったときの知らせ。 */
    val doneText: String,
    val mineral: Int,
    val seed: Int,
    val ice: Int,
    val durationMillis: Long
) {
    fun costText(): String {
        val parts = ArrayList<String>()
        if (mineral > 0) parts.add("鉱石${mineral}")
        if (seed > 0) parts.add("たね${seed}")
        if (ice > 0) parts.add("氷${ice}")
        return if (parts.isEmpty()) "-" else parts.joinToString(" ")
    }
}

object Recipes {
    /**
     * 「つくる」で新しく作れるもの。
     * 家・街灯・木はここから外してある (既に建っているものはそのまま残る。
     * 惑星は最初から家1軒・住人1人つきなので、これでも住人は消えない)。
     */
    val all: List<Recipe> = listOf(
        Recipe(BuildKind.FLOWER, "花を植える", "どんな花が咲くかはお楽しみ", "花が咲きました", 0, 1, 0, 1 * HOUR_MS),
        Recipe(BuildKind.POND, "池をつくる", "彗星の氷が溶けて水になる", "池ができました", 0, 0, 3, 4 * HOUR_MS),
        Recipe(BuildKind.FARM, "畑をつくる", "生きものの食べものを育てる", "畑ができました", 0, 2, 1, 2 * HOUR_MS),
        Recipe(BuildKind.ANIMAL, "卵をかえす", "何がうまれるかはわからない", "家畜が3頭うまれました", 0, 3, 1, 2 * HOUR_MS),
        Recipe(BuildKind.BRIDGE, "橋をかける", "育った衛星とつなぐ", "橋がつながりました", 10, 0, 2, 24 * HOUR_MS)
    )

    fun of(kind: BuildKind): Recipe = all.first { it.kind == kind }
}

/** 建設中・成長中のもの。 */
class BuildJob(
    val kind: BuildKind,
    val angleDeg: Float,
    val startMillis: Long,
    val endMillis: Long,
    /** 橋のときだけ使う。つなぐ衛星の番号。 */
    val target: Int = -1,
    /** 池や畑のように面に置くものの、中心からの距離 (ブロック)。-1 はふちに立つもの。 */
    val dist: Float = -1f
) {
    fun progress(now: Long): Float {
        val span = (endMillis - startMillis).toFloat()
        if (span <= 0f) return 1f
        return ((now - startMillis).toFloat() / span).coerceIn(0f, 1f)
    }
}

/** 宇宙船襲来の結果。 */
enum class AlienOutcome { DAMAGE, RETREAT, VICTORY }

/** 一回の襲来。 */
class AlienEvent(
    val atMillis: Long,
    val outcome: AlienOutcome,
    val droppedResource: ResourceKind? = null,
    val droppedAmount: Int = 0,
    /** DAMAGE のとき、荒れ地の代わりに家畜をさらっていったか。 */
    val abductedAnimal: Boolean = false
)

fun alienOutcomeText(e: AlienEvent): String = when (e.outcome) {
    AlienOutcome.DAMAGE -> if (e.abductedAnimal) {
        "宇宙船が家畜をさらっていった…"
    } else {
        "宇宙船が惑星を攻撃した！地表の一部が荒れ地になってしまった"
    }
    AlienOutcome.RETREAT -> if (e.droppedResource != null) {
        "宇宙船が近づいたが引き返していった (${resourceLabel(e.droppedResource)}+${e.droppedAmount})"
    } else {
        "宇宙船が近づいたが引き返していった"
    }
    AlienOutcome.VICTORY -> "宇宙船を追い払った！乗り捨てられた船からレア卵を見つけた"
}

/** できあがって惑星に建っているもの。variant は木や生きものの種類。 */
class Placed(
    val kind: BuildKind,
    val angleDeg: Float,
    val doneMillis: Long,
    val variant: Int = 0,
    val target: Int = -1,
    /** 池や畑のように面に置くものの、中心からの距離 (ブロック)。-1 はふちに立つもの。 */
    val dist: Float = -1f
)

/**
 * 惑星のまわりを回る衛星。
 * 3 ヶ月で惑星の成長が止まったあと、少しずつ生まれる。
 * 生まれてから 1 ヶ月かけてスタート時の星と同じ大きさになり、人が住めるようになる。
 */
class Satellite(
    val index: Int,
    val birthMillis: Long,
    val orbitRadius: Float,
    val baseAngleDeg: Float,
    val bridged: Boolean,
    /** 橋でつながると同じ面を向けたまま止まる。 */
    val lockedAngleDeg: Float? = null
) {
    companion object {
        /** 一人前になるまでの時間。 */
        const val MATURE_MILLIS = 30L * DAY_MS

        /** 生まれたてと、育ちきったときの半径。 */
        const val START_RADIUS = 1.0f
        const val FULL_RADIUS = 6.5f

        /** 惑星のまわりを一周する時間 (見ていて分かるくらいゆっくり)。 */
        const val ORBIT_PERIOD_MILLIS = 8L * 60L * 1000L
    }

    fun ageMillis(now: Long): Long = max(0L, now - birthMillis)

    fun growth(now: Long): Float =
        (ageMillis(now).toFloat() / MATURE_MILLIS.toFloat()).coerceIn(0f, 1f)

    /** 半径。描き直しの手間を減らすため 0.5 ブロック刻みにする。 */
    fun radius(now: Long): Float {
        val r = START_RADIUS + (FULL_RADIUS - START_RADIUS) * growth(now)
        return (Math.round(r * 2f) / 2f)
    }

    /** 人が住めるようになったか。 */
    fun habitable(now: Long): Boolean = growth(now) >= 1f

    /** いまいる方角 (度)。橋でつながっていれば止まったまま。 */
    fun angleDeg(now: Long): Float {
        lockedAngleDeg?.let { return it }
        val phase = ((now % ORBIT_PERIOD_MILLIS).toFloat() / ORBIT_PERIOD_MILLIS.toFloat())
        return normalizeDeg(baseAngleDeg + phase * 360f)
    }
}

/**
 * 惑星の状態。ここだけ保存すれば続きから遊べる。
 */
class PlanetState(var birthMillis: Long) {

    var mineral: Int = 0
    var seed: Int = 0
    var ice: Int = 0

    /** 畑でとれた作物。生きものが食べる。 */
    var crop: Float = 0f

    /** 宇宙船を追い払って手に入れたレア卵の在庫。外周が空き次第、ペットが1頭孵る。 */
    var rareItem: Int = 0

    /** どこまで時間を進めたか。 */
    var lastTickMillis: Long = birthMillis

    /** 直前の宇宙船襲来がいつだったか (0 ならまだ一度も無い/家畜がいない期間)。 */
    var lastAlienMillis: Long = 0L

    /** 攻撃で荒れ地になった中心角。0 より前なら荒れ地は無い/もう治った。 */
    var wastelandStartMillis: Long = 0L
    var wastelandCenterDeg: Float = 0f

    val placed = ArrayList<Placed>()
    val jobs = ArrayList<BuildJob>()

    /** 橋がつながった衛星の番号。 */
    val bridged = HashSet<Int>()

    /** advanceTo() で新しく起きた襲来。呼び出し側が読んだらクリアすること。 */
    val pendingAlienEvents = ArrayList<AlienEvent>()

    fun resource(kind: ResourceKind): Int = when (kind) {
        ResourceKind.MINERAL -> mineral
        ResourceKind.SEED -> seed
        ResourceKind.ICE -> ice
        ResourceKind.CROP -> crop.toInt()
    }

    private fun add(kind: ResourceKind, n: Int) {
        when (kind) {
            ResourceKind.MINERAL -> mineral += n
            ResourceKind.SEED -> seed += n
            ResourceKind.ICE -> ice += n
            ResourceKind.CROP -> crop += n
        }
    }

    // ---- 惑星の成長 (地殻変動) ----

    companion object Growth {
        /** 生まれたときの半径。 */
        const val START_RADIUS = 6.5f

        /** 1 週間ごとに大きくなる量。 */
        const val RADIUS_PER_WEEK = 0.5f

        /**
         * 3 ヶ月 (13 週) で成長が止まる。
         * 0.5 x 13 = 6.5 なので、そのとき直径はスタート時のちょうど 2 倍になる。
         */
        const val GROWTH_WEEKS = 13

        /** 成長が止まってから最初の衛星ができるまで。 */
        const val FIRST_SATELLITE_AFTER = 0L

        /** 衛星が生まれる間隔と数の上限。 */
        val SATELLITE_INTERVAL = 3L * WEEK_MS
        const val MAX_SATELLITES = 3

        /**
         * 畑ひとつが作物を 1 つ作るのにかかる時間。実際の畑らしく、種まきから
         * 収穫まで 1 週間ほどかける (この長さは cropStageFor() の見た目の
         * 生育段階にもそのまま使われる)。
         */
        val CROP_PERIOD_MILLIS = WEEK_MS

        /**
         * 生きものひとりが作物を 1 つ食べるのにかかる時間。
         * 畑と同じ倍率で伸ばしてあるので、畑と生きものの必要な比率は前と変わらない
         * (畑 1 つでだいたい生きもの 2 匹を養える)。
         */
        val EAT_PERIOD_MILLIS = 2L * WEEK_MS

        /** 生きものが食べはじめるまでの猶予 (惑星が生まれてから 1 週間)。 */
        val FEEDING_STARTS_AFTER = WEEK_MS

        /** 貯めておける作物の上限 (畑 1 つにつき増える)。 */
        fun cropCapacity(farms: Int): Float = 8f + farms * 12f

        /** 家畜がいるとき、次の宇宙船襲来までの間隔 (1日に2度)。 */
        val ALIEN_INTERVAL_MILLIS = DAY_MS / 2L

        /** 攻撃を受けたとき荒れ地になる範囲 (惑星をぐるっと 360 度としたときの割合)。 */
        const val WASTELAND_ARC_DEG = 90f

        /** 荒れ地が自然に元に戻るまでの時間。 */
        val WASTELAND_HEAL_MILLIS = WEEK_MS

        /** レア卵からペットが孵るまでの時間。 */
        val PET_HATCH_MILLIS = HOUR_MS

        /** 生まれたての惑星。家が一軒と住人が一人だけ。 */
        fun newPlanet(nowMillis: Long): PlanetState {
            val s = PlanetState(nowMillis)
            s.placed.add(Placed(BuildKind.HOUSE, -90f, nowMillis))
            return s
        }

        fun load(text: String?): PlanetState? {
            if (text.isNullOrBlank()) return null
            var state: PlanetState? = null
            try {
                for (raw in text.split('\n')) {
                    val line = raw.trim()
                    if (line.isEmpty() || line.startsWith("v")) continue
                    val eq = line.indexOf('=')
                    if (eq <= 0) continue
                    val key = line.substring(0, eq)
                    val value = line.substring(eq + 1)
                    when (key) {
                        "birth" -> state = PlanetState(value.toLong())
                        "tick" -> state?.lastTickMillis = value.toLong()
                        "mineral" -> state?.mineral = value.toInt()
                        "seed" -> state?.seed = value.toInt()
                        "ice" -> state?.ice = value.toInt()
                        "crop" -> state?.crop = value.toFloat()
                        "rare" -> state?.rareItem = value.toInt()
                        "alien" -> state?.lastAlienMillis = value.toLong()
                        "wasteStart" -> state?.wastelandStartMillis = value.toLong()
                        "wasteDeg" -> state?.wastelandCenterDeg = value.toFloat()
                        "bridge" -> state?.bridged?.add(value.toInt())
                        "p" -> {
                            val f = value.split(',')
                            state?.placed?.add(
                                Placed(
                                    BuildKind.valueOf(f[0]), f[1].toFloat(), f[2].toLong(),
                                    f.getOrNull(3)?.toIntOrNull() ?: 0,
                                    f.getOrNull(4)?.toIntOrNull() ?: -1,
                                    f.getOrNull(5)?.toFloatOrNull() ?: -1f
                                )
                            )
                        }
                        "j" -> {
                            val f = value.split(',')
                            state?.jobs?.add(
                                BuildJob(
                                    BuildKind.valueOf(f[0]), f[1].toFloat(), f[2].toLong(), f[3].toLong(),
                                    f.getOrNull(4)?.toIntOrNull() ?: -1,
                                    f.getOrNull(5)?.toFloatOrNull() ?: -1f
                                )
                            )
                        }
                    }
                }
            } catch (e: Exception) {
                return null
            }
            return state
        }
    }

    fun ageMillis(now: Long): Long = max(0L, now - birthMillis)

    /**
     * 惑星の半径。地殻変動で 1 週間ごとに少しずつ大きくなり、3 ヶ月で止まる。
     * 建物の数では変わらない。
     */
    fun radius(now: Long): Float {
        val weeks = min(GROWTH_WEEKS.toLong(), ageMillis(now) / WEEK_MS).toInt()
        return START_RADIUS + RADIUS_PER_WEEK * weeks
    }

    /** 成長が止まる時刻。 */
    fun growthEndMillis(): Long = birthMillis + GROWTH_WEEKS * WEEK_MS

    /** まだ大きくなるか。 */
    fun stillGrowing(now: Long): Boolean = now < growthEndMillis()

    /** 次に大きくなるまでの時間。 */
    fun nextGrowthInMillis(now: Long): Long {
        if (!stillGrowing(now)) return 0L
        val weeks = ageMillis(now) / WEEK_MS
        return birthMillis + (weeks + 1) * WEEK_MS - now
    }

    // ---- 衛星 ----

    /** いまある衛星。誕生時刻は惑星の年齢から決まるので保存しなくてよい。 */
    fun satellites(now: Long): List<Satellite> {
        val end = growthEndMillis() + FIRST_SATELLITE_AFTER
        if (now < end) return emptyList()
        val count = min(MAX_SATELLITES.toLong(), 1L + (now - end) / SATELLITE_INTERVAL).toInt()
        val out = ArrayList<Satellite>(count)
        for (i in 0 until count) {
            val birth = end + i * SATELLITE_INTERVAL
            out.add(
                Satellite(
                    index = i,
                    birthMillis = birth,
                    orbitRadius = maxRadius() + 11f + i * 5f,
                    baseAngleDeg = normalizeDeg(-40f + i * 137f),
                    bridged = bridged.contains(i),
                    lockedAngleDeg = lockedAngleFor(i)
                )
            )
        }
        return out
    }

    /** 橋をかけ始めた時点で衛星は止まる。その向き。 */
    fun lockedAngleFor(index: Int): Float? {
        for (j in jobs) if (j.kind == BuildKind.BRIDGE && j.target == index) return j.angleDeg
        for (p in placed) if (p.kind == BuildKind.BRIDGE && p.target == index) return p.angleDeg
        return null
    }

    /** 育ちきったときの惑星の半径。 */
    fun maxRadius(): Float = START_RADIUS + RADIUS_PER_WEEK * GROWTH_WEEKS

    /** 橋をかけられる衛星 (育ちきっていて、まだつながっていないもの)。 */
    fun bridgeTarget(now: Long): Satellite? =
        satellites(now).firstOrNull { it.habitable(now) && !it.bridged }

    // ---- 時間を進める ----

    /**
     * 現在時刻まで追いつかせる。
     * 閉じていた間の飛来を資源に足し、畑と生きものの帳尻を合わせ、
     * できあがった建物を建てる。戻り値は「この呼び出しで新しく飛来したもの」。
     */
    fun advanceTo(now: Long): List<Arrival> {
        if (now <= lastTickMillis) {
            finishJobs(now)
            return emptyList()
        }
        val arrivals = SkyFall.arrivalsBetween(lastTickMillis, now, birthMillis)
        for (a in arrivals) add(a.kind.resource, a.amount)
        advanceFarming(lastTickMillis, now)
        advanceAliens(now)
        lastTickMillis = now
        finishJobs(now)
        return arrivals
    }

    /**
     * 家畜がいるあいだ、一定間隔で宇宙船が来るかどうかを進める。
     * 家畜がいない間は間隔のカウントを止めておく (いなくなっていた期間ぶん
     * まとめて襲来する、ということが起きないように)。
     */
    private fun advanceAliens(now: Long) {
        if (countOf(BuildKind.ANIMAL) <= 0) {
            lastAlienMillis = 0L
            return
        }
        if (lastAlienMillis <= 0L) {
            // 今ペットがいると分かった時点から数え始める (いなかった間の分は数えない)
            lastAlienMillis = now
            return
        }
        var next = lastAlienMillis + ALIEN_INTERVAL_MILLIS
        var guard = 0
        while (next <= now && guard < 30) {
            val event = rollAlienOutcome(next)
            applyAlienOutcome(event)
            pendingAlienEvents.add(event)
            lastAlienMillis = next
            next += ALIEN_INTERVAL_MILLIS
            guard++
        }
    }

    private fun alienHash(a: Long, b: Long): Long {
        var h = a * -7046029254386353131L + b * -4658895280553007687L
        h = h xor (h ushr 32)
        h *= -7723592293110705685L
        h = h xor (h ushr 29)
        return h and Long.MAX_VALUE
    }

    /**
     * 結果はほぼ運まかせ。花が多いほど「撃退成功」に少し寄る
     * (虫が宇宙人を追い払う、という設定を確率のかたむきだけで表す)。
     */
    private fun rollAlienOutcome(atMillis: Long): AlienEvent {
        val flowers = countOf(BuildKind.FLOWER).coerceAtMost(10)
        val victoryWeight = 20 + flowers * 6
        val damageWeight = (40 - flowers * 3).coerceAtLeast(10)
        val retreatWeight = 30
        val total = victoryWeight + damageWeight + retreatWeight
        val roll = (alienHash(atMillis, birthMillis xor 0x41A1E7L) % total.toLong()).toInt()
        val outcome = when {
            roll < damageWeight -> AlienOutcome.DAMAGE
            roll < damageWeight + retreatWeight -> AlienOutcome.RETREAT
            else -> AlienOutcome.VICTORY
        }
        if (outcome == AlienOutcome.DAMAGE) {
            // 家畜がいれば、荒れ地の代わりにそれをさらっていく
            return AlienEvent(atMillis, outcome, abductedAnimal = countOf(BuildKind.ANIMAL) > 0)
        }
        if (outcome != AlienOutcome.RETREAT) return AlienEvent(atMillis, outcome)
        // 撤退時、まれに資源を残していく
        if (alienHash(atMillis, 91L) % 100L >= 25L) return AlienEvent(atMillis, outcome)
        val pick = alienHash(atMillis, 103L) % 3L
        val kind = when (pick) { 0L -> ResourceKind.MINERAL; 1L -> ResourceKind.SEED; else -> ResourceKind.ICE }
        return AlienEvent(atMillis, outcome, kind, 2)
    }

    private fun applyAlienOutcome(e: AlienEvent) {
        when (e.outcome) {
            AlienOutcome.DAMAGE -> {
                val livestock = placed.filter { it.kind == BuildKind.ANIMAL }
                if (e.abductedAnimal && livestock.isNotEmpty()) {
                    val idx = (alienHash(e.atMillis, 61L) % livestock.size.toLong()).toInt()
                    placed.remove(livestock[idx])
                } else {
                    wastelandStartMillis = e.atMillis
                    wastelandCenterDeg = (alienHash(e.atMillis, 77L) % 360L).toFloat() - 180f
                }
            }
            AlienOutcome.RETREAT -> {
                if (e.droppedResource != null) add(e.droppedResource, e.droppedAmount)
            }
            AlienOutcome.VICTORY -> {
                rareItem += 1
            }
        }
    }

    /** 荒れ地の中心角。荒れ地が無い/もう治っていれば null。 */
    fun wastelandCenter(now: Long): Float? =
        if (wastelandStartMillis > 0L && now < wastelandStartMillis + WASTELAND_HEAL_MILLIS) wastelandCenterDeg else null

    /** 畑が作物を作り、生きものが食べる。 */
    private fun advanceFarming(from: Long, to: Long) {
        val span = (to - from).toFloat()
        if (span <= 0f) return
        val farms = countOf(BuildKind.FARM)
        val animals = countOf(BuildKind.ANIMAL)
        if (farms > 0) {
            crop += farms * span / CROP_PERIOD_MILLIS.toFloat()
        }
        val feedFrom = max(from, birthMillis + FEEDING_STARTS_AFTER)
        if (animals > 0 && to > feedFrom) {
            crop -= animals * (to - feedFrom).toFloat() / EAT_PERIOD_MILLIS.toFloat()
        }
        crop = crop.coerceIn(0f, cropCapacity(farms))
    }

    fun countOf(kind: BuildKind): Int = placed.count { it.kind == kind }

    /** 生きものがおなかをすかせているか。 */
    fun animalsHungry(now: Long): Boolean =
        countOf(BuildKind.ANIMAL) > 0 &&
            crop < 0.5f &&
            now >= birthMillis + FEEDING_STARTS_AFTER

    /** 農業を始めたほうがよいか (生きものがいて畑がない)。 */
    fun needsFarm(now: Long): Boolean =
        countOf(BuildKind.ANIMAL) > 0 && countOf(BuildKind.FARM) == 0

    private fun finishJobs(now: Long) {
        var i = 0
        while (i < jobs.size) {
            val j = jobs[i]
            if (now >= j.endMillis) {
                when (j.kind) {
                    BuildKind.BRIDGE -> {
                        if (j.target >= 0) bridged.add(j.target)
                        placed.add(Placed(j.kind, j.angleDeg, j.endMillis, 0, j.target, j.dist))
                    }
                    BuildKind.ANIMAL -> {
                        // 卵から家畜が3頭うまれる。面が足りなければ入るだけにする
                        for (k in 0 until 3) {
                            val slot = freeFaceSlot(now) ?: break
                            val variant = variantFor(j.kind, j.endMillis + k)
                            placed.add(Placed(j.kind, slot[1], j.endMillis, variant, -1, slot[0]))
                        }
                    }
                    else -> {
                        placed.add(
                            Placed(j.kind, j.angleDeg, j.endMillis, variantFor(j.kind, j.endMillis), -1, j.dist)
                        )
                    }
                }
                jobs.removeAt(i)
            } else {
                i++
            }
        }
        startPetHatchIfPossible(now)
    }

    /** レア卵の在庫があり、まだ孵化中のペットがいなければ、外周の空きに1つ孵化を始める。 */
    private fun startPetHatchIfPossible(now: Long) {
        if (rareItem <= 0) return
        if (jobs.any { it.kind == BuildKind.PET }) return
        val angle = freeAngleFor(BuildKind.PET) ?: return
        rareItem -= 1
        jobs.add(BuildJob(BuildKind.PET, angle, now, now + PET_HATCH_MILLIS))
    }

    // ---- 作る ----

    fun canBuild(r: Recipe, now: Long): Boolean = hasResourcesFor(r) && hasRoomFor(r, now)

    fun hasResourcesFor(r: Recipe): Boolean =
        mineral >= r.mineral && seed >= r.seed && ice >= r.ice

    /** 置く場所があるか。 */
    fun hasRoomFor(r: Recipe, now: Long): Boolean = when {
        r.kind == BuildKind.BRIDGE ->
            bridgeTarget(now) != null && jobs.none { it.kind == BuildKind.BRIDGE }
        Structures.isOnSurface(r.kind) -> freeFaceSlot(now) != null
        else -> freeAngleFor(r.kind) != null
    }

    /** 作り始める。資源と場所が足りていれば true。 */
    fun startBuild(r: Recipe, now: Long): Boolean {
        if (!canBuild(r, now)) return false
        var target = -1
        var angle = 0f
        var dist = -1f
        when {
            r.kind == BuildKind.BRIDGE -> {
                val sat = bridgeTarget(now) ?: return false
                target = sat.index
                angle = sat.angleDeg(now)
            }
            Structures.isOnSurface(r.kind) -> {
                val slot = freeFaceSlot(now) ?: return false
                dist = slot[0]
                angle = slot[1]
            }
            else -> angle = freeAngleFor(r.kind) ?: return false
        }
        mineral -= r.mineral
        seed -= r.seed
        ice -= r.ice
        jobs.add(BuildJob(r.kind, angle, now, now + r.durationMillis, target, dist))
        return true
    }

    fun residentCount(): Int = countOf(BuildKind.HOUSE)

    fun animalCount(): Int = countOf(BuildKind.ANIMAL)

    // ---- 置き場所 ----

    /** そのものの半分の幅 (ブロック)。接地と間隔の計算に使う。 */
    fun halfWidthBlocks(kind: BuildKind): Float = when (kind) {
        BuildKind.HOUSE -> 2.5f
        BuildKind.TREE -> 2.5f
        BuildKind.POND, BuildKind.FARM -> 1.5f
        BuildKind.FLOWER, BuildKind.PET -> 1.0f
        else -> 0.6f
    }

    /** 惑星の大きさに応じた、隣と空けたい角度。 */
    private fun spacingDeg(kind: BuildKind, radius: Float): Float {
        val half = kotlin.math.atan2(halfWidthBlocks(kind), radius)
        return (half * 2f) * (180f / kotlin.math.PI.toFloat()) + 8f
    }

    /** 池や畑を置く、惑星の手前の面のマス目 [中心からの距離, 角度]。 */
    fun faceSlots(radius: Float): List<FloatArray> {
        val out = ArrayList<FloatArray>()
        out.add(floatArrayOf(0f, 0f))
        var ring = 1
        while (ring < 6) {
            val dist = ring * 3.6f
            if (dist + 1.6f > radius - 1.0f) break
            val count = max(1, (2.0 * Math.PI * dist / 3.6).toInt())
            for (k in 0 until count) out.add(floatArrayOf(dist, k * 360f / count))
            ring++
        }
        return out
    }

    private fun faceTaken(): List<FloatArray> {
        val out = ArrayList<FloatArray>()
        for (p in placed) if (p.dist >= 0f) out.add(floatArrayOf(p.dist, p.angleDeg))
        for (j in jobs) if (j.dist >= 0f) out.add(floatArrayOf(j.dist, j.angleDeg))
        return out
    }

    /** 面のあいている場所。無ければ null。 */
    fun freeFaceSlot(now: Long): FloatArray? {
        val taken = faceTaken()
        for (slot in faceSlots(radius(now))) {
            val used = taken.any { kotlin.math.abs(it[0] - slot[0]) < 0.1f && kotlin.math.abs(shortestAngle(it[1] - slot[1])) < 1f }
            if (!used) return slot
        }
        return null
    }

    private class Spot(val kind: BuildKind, val angleDeg: Float)

    private fun occupied(): List<Spot> {
        val out = ArrayList<Spot>()
        // 橋は場所を取らない。面に置くもの (池・畑) はふちの取り合いに加わらない
        for (p in placed) if (p.kind != BuildKind.BRIDGE && p.dist < 0f) out.add(Spot(p.kind, p.angleDeg))
        for (j in jobs) if (j.kind != BuildKind.BRIDGE && j.dist < 0f) out.add(Spot(j.kind, j.angleDeg))
        return out
    }

    /**
     * 空いている場所を探す。10 度きざみの候補から、
     * まわりが一番広く空いているところを選ぶ。
     */
    fun freeAngleFor(kind: BuildKind): Float? {
        val r = radius(max(lastTickMillis, birthMillis))
        val used = occupied()
        var best: Float? = null
        var bestGap = -1f
        for (i in 0 until 36) {
            val a = normalizeDeg(-90f + i * 10f)
            var ok = true
            var minGap = 360f
            for (u in used) {
                val d = kotlin.math.abs(shortestAngle(u.angleDeg - a))
                val need = (spacingDeg(kind, r) + spacingDeg(u.kind, r)) / 2f
                if (d < need) {
                    ok = false
                    break
                }
                if (d < minGap) minGap = d
            }
            if (ok && minGap > bestGap) {
                bestGap = minGap
                best = a
            }
        }
        return best
    }

    // ---- 保存 ----

    fun save(): String {
        val sb = StringBuilder()
        sb.append("v2\n")
        sb.append("birth=").append(birthMillis).append('\n')
        sb.append("tick=").append(lastTickMillis).append('\n')
        sb.append("mineral=").append(mineral).append('\n')
        sb.append("seed=").append(seed).append('\n')
        sb.append("ice=").append(ice).append('\n')
        sb.append("crop=").append(crop).append('\n')
        sb.append("rare=").append(rareItem).append('\n')
        sb.append("alien=").append(lastAlienMillis).append('\n')
        sb.append("wasteStart=").append(wastelandStartMillis).append('\n')
        sb.append("wasteDeg=").append(wastelandCenterDeg).append('\n')
        for (b in bridged) sb.append("bridge=").append(b).append('\n')
        for (p in placed) {
            sb.append("p=").append(p.kind.name).append(',').append(p.angleDeg).append(',')
                .append(p.doneMillis).append(',').append(p.variant).append(',').append(p.target)
                .append(',').append(p.dist).append('\n')
        }
        for (j in jobs) {
            sb.append("j=").append(j.kind.name).append(',').append(j.angleDeg).append(',')
                .append(j.startMillis).append(',').append(j.endMillis).append(',').append(j.target)
                .append(',').append(j.dist).append('\n')
        }
        return sb.toString()
    }
}

/** 木や生きものの種類。作ったときに決まり、プレイヤーは選べない。 */
fun variantCount(kind: BuildKind): Int = when (kind) {
    BuildKind.TREE -> 4
    BuildKind.ANIMAL -> 4
    BuildKind.PET -> 4
    BuildKind.FLOWER -> 4
    else -> 1
}

fun variantFor(kind: BuildKind, seedMillis: Long): Int {
    val n = variantCount(kind)
    if (n <= 1) return 0
    var h = seedMillis * -7046029254386353131L + kind.ordinal * 2654435761L
    h = h xor (h ushr 31)
    h *= -4371526650440235895L
    h = h xor (h ushr 29)
    return ((h and Long.MAX_VALUE) % n).toInt()
}

fun animalLabel(variant: Int): String = when (variant) {
    0 -> "ヒツジ"
    1 -> "ニワトリ"
    2 -> "ブタ"
    else -> "ウシ"
}

fun treeLabel(variant: Int): String = when (variant) {
    0 -> "オーク"
    1 -> "シラカバ"
    2 -> "マツ"
    else -> "サクラ"
}

/** -180..180 に畳む。 */
fun normalizeDeg(deg: Float): Float {
    var d = deg
    while (d > 180f) d -= 360f
    while (d <= -180f) d += 360f
    return d
}

/** 2 つの角度の近いほうの差。 */
fun shortestAngle(deg: Float): Float = normalizeDeg(deg)

/** 残り時間を「3時間20分」のように書く。 */
fun formatDuration(millis: Long): String {
    if (millis <= 0L) return "まもなく"
    val totalMin = (millis + 59_999L) / 60_000L
    val days = totalMin / (60 * 24)
    val h = (totalMin / 60) % 24
    val m = totalMin % 60
    return when {
        days > 0 && h > 0 -> "${days}日${h}時間"
        days > 0 -> "${days}日"
        h > 0 && m > 0 -> "${h}時間${m}分"
        h > 0 -> "${h}時間"
        else -> "${m}分"
    }
}
