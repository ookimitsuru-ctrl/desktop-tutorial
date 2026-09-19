package com.example.planetgrow.core

import kotlin.math.max

/**
 * 惑星に貯まっていく資源と、それを使って何を作るか。
 *
 * 時間はすべて地球の実時間。アプリを閉じている間も進むので、
 * 状態は「いつ何が起きたか」の時刻で持ち、開いたときにまとめて追いつかせる。
 */

/** 貯まる資源。 */
enum class ResourceKind { MINERAL, SEED, ICE }

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
    /** 半日に 1 回 = 1 日およそ 2 回。 */
    const val SLOT_MILLIS = 12L * 60L * 60L * 1000L

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
        // 枠のなかのどこかの時刻に落ちてくる
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
            if (out.size > 200) break // 久しぶりに開いたときの上限
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

/** 作れるもの。 */
enum class BuildKind { FLOWER, TREE, LAMP, POND, HOUSE, SHEEP }

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
        return parts.joinToString(" ")
    }
}

object Recipes {
    private const val HOUR = 60L * 60L * 1000L

    val all: List<Recipe> = listOf(
        Recipe(BuildKind.FLOWER, "花を植える", "たねから花が咲く", "花が咲きました", 0, 1, 0, 1 * HOUR),
        Recipe(BuildKind.LAMP, "街灯を立てる", "夜の惑星を照らす", "街灯がともりました", 2, 0, 0, 3 * HOUR),
        Recipe(BuildKind.POND, "池をつくる", "彗星の氷が溶けて水になる", "池ができました", 0, 0, 3, 4 * HOUR),
        Recipe(BuildKind.TREE, "木を育てる", "芽から少しずつ育つ", "木が育ちました", 0, 2, 1, 8 * HOUR),
        Recipe(BuildKind.SHEEP, "卵をかえす", "生きものが増える", "生きものがうまれました", 0, 3, 1, 10 * HOUR),
        Recipe(BuildKind.HOUSE, "家を建てる", "住人がひとり増える", "家が建ちました", 5, 1, 0, 16 * HOUR)
    )

    fun of(kind: BuildKind): Recipe = all.first { it.kind == kind }
}

/** 建設中・成長中のもの。 */
class BuildJob(
    val kind: BuildKind,
    val angleDeg: Float,
    val startMillis: Long,
    val endMillis: Long
) {
    fun progress(now: Long): Float {
        val span = (endMillis - startMillis).toFloat()
        if (span <= 0f) return 1f
        return ((now - startMillis).toFloat() / span).coerceIn(0f, 1f)
    }
}

/** できあがって惑星に建っているもの。 */
class Placed(val kind: BuildKind, val angleDeg: Float, val doneMillis: Long)

/**
 * 惑星の状態。ここだけ保存すれば続きから遊べる。
 */
class PlanetState(var birthMillis: Long) {

    var mineral: Int = 0
    var seed: Int = 0
    var ice: Int = 0

    /** どこまで時間を進めたか。 */
    var lastTickMillis: Long = birthMillis

    val placed = ArrayList<Placed>()
    val jobs = ArrayList<BuildJob>()

    fun resource(kind: ResourceKind): Int = when (kind) {
        ResourceKind.MINERAL -> mineral
        ResourceKind.SEED -> seed
        ResourceKind.ICE -> ice
    }

    private fun add(kind: ResourceKind, n: Int) {
        when (kind) {
            ResourceKind.MINERAL -> mineral += n
            ResourceKind.SEED -> seed += n
            ResourceKind.ICE -> ice += n
        }
    }

    /**
     * 現在時刻まで追いつかせる。
     * 閉じていた間の飛来を資源に足し、できあがった建物を建てる。
     * 戻り値は「この呼び出しで新しく飛来したもの」。
     */
    fun advanceTo(now: Long): List<Arrival> {
        if (now <= lastTickMillis) {
            finishJobs(now)
            return emptyList()
        }
        val arrivals = SkyFall.arrivalsBetween(lastTickMillis, now, birthMillis)
        for (a in arrivals) add(a.kind.resource, a.amount)
        lastTickMillis = now
        finishJobs(now)
        return arrivals
    }

    private fun finishJobs(now: Long) {
        var i = 0
        while (i < jobs.size) {
            val j = jobs[i]
            if (now >= j.endMillis) {
                placed.add(Placed(j.kind, j.angleDeg, j.endMillis))
                jobs.removeAt(i)
            } else {
                i++
            }
        }
    }

    fun canBuild(r: Recipe): Boolean =
        mineral >= r.mineral && seed >= r.seed && ice >= r.ice && freeAngleFor(r.kind) != null

    /** 作り始める。資源が足りていれば true。 */
    fun startBuild(r: Recipe, now: Long): Boolean {
        if (!canBuild(r)) return false
        val angle = freeAngleFor(r.kind) ?: return false
        mineral -= r.mineral
        seed -= r.seed
        ice -= r.ice
        jobs.add(BuildJob(r.kind, angle, now, now + r.durationMillis))
        return true
    }

    /** 建っているものと建設中のものの数。惑星の大きさのもとになる。 */
    fun occupancy(): Int = placed.size + jobs.size

    /** 惑星の半径。ものが増えるほど少しずつ大きくなる。 */
    fun radius(): Float = (6.5f + 0.5f * ((occupancy() - 1) / 2)).coerceIn(6.5f, 10.5f)

    fun residentCount(): Int = placed.count { it.kind == BuildKind.HOUSE }

    fun animalCount(): Int = placed.count { it.kind == BuildKind.SHEEP }

    // ---- 置き場所 ----

    /** そのものの半分の幅 (ブロック)。接地と間隔の計算に使う。 */
    fun halfWidthBlocks(kind: BuildKind): Float = when (kind) {
        BuildKind.HOUSE -> 2.5f
        BuildKind.TREE -> 2.5f
        BuildKind.POND -> 2.5f
        else -> 0.6f
    }

    /** 惑星の大きさに応じた、隣と空けたい角度。 */
    private fun spacingDeg(kind: BuildKind): Float {
        val r = radius()
        val half = kotlin.math.atan2(halfWidthBlocks(kind), r)
        return (half * 2f) * (180f / kotlin.math.PI.toFloat()) + 8f
    }

    private class Spot(val kind: BuildKind, val angleDeg: Float)

    private fun occupied(): List<Spot> {
        val out = ArrayList<Spot>()
        for (p in placed) out.add(Spot(p.kind, p.angleDeg))
        for (j in jobs) out.add(Spot(j.kind, j.angleDeg))
        return out
    }

    /**
     * 空いている場所を探す。10 度きざみの候補から、
     * まわりが一番広く空いているところを選ぶ。
     */
    fun freeAngleFor(kind: BuildKind): Float? {
        val used = occupied()
        var best: Float? = null
        var bestGap = -1f
        for (i in 0 until 36) {
            val a = normalizeDeg(-90f + i * 10f)
            var ok = true
            var minGap = 360f
            for (u in used) {
                val d = kotlin.math.abs(shortestAngle(u.angleDeg - a))
                val need = (spacingDeg(kind) + spacingDeg(u.kind)) / 2f
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
        sb.append("v1\n")
        sb.append("birth=").append(birthMillis).append('\n')
        sb.append("tick=").append(lastTickMillis).append('\n')
        sb.append("mineral=").append(mineral).append('\n')
        sb.append("seed=").append(seed).append('\n')
        sb.append("ice=").append(ice).append('\n')
        for (p in placed) sb.append("p=").append(p.kind.name).append(',').append(p.angleDeg).append(',').append(p.doneMillis).append('\n')
        for (j in jobs) sb.append("j=").append(j.kind.name).append(',').append(j.angleDeg).append(',').append(j.startMillis).append(',').append(j.endMillis).append('\n')
        return sb.toString()
    }

    companion object {
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
                    if (line.isEmpty() || line == "v1") continue
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
                        "p" -> {
                            val f = value.split(',')
                            state?.placed?.add(Placed(BuildKind.valueOf(f[0]), f[1].toFloat(), f[2].toLong()))
                        }
                        "j" -> {
                            val f = value.split(',')
                            state?.jobs?.add(BuildJob(BuildKind.valueOf(f[0]), f[1].toFloat(), f[2].toLong(), f[3].toLong()))
                        }
                    }
                }
            } catch (e: Exception) {
                return null
            }
            return state
        }
    }
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
    val h = totalMin / 60
    val m = totalMin % 60
    return when {
        h > 0 && m > 0 -> "${h}時間${m}分"
        h > 0 -> "${h}時間"
        else -> "${m}分"
    }
}
