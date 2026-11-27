package jp.okracing.core

import kotlin.math.*

// セッション進行 (Web 版 src/race.js の移植): フリー走行 / タイムアタック / 予選 / 決勝 / トレーニング
// 車両とAIの更新、計時(ラップ・セクター)、順位、スタート手順、ピット、天候、ゴーストを扱う。

fun parseColor(hex: String): Int = (0xff000000L or hex.removePrefix("#").toLong(16)).toInt()

class Team(val id: String, val name: String, var c1: Int, var c2: Int, var c3: Int, val power: Double, val grip: Double)
class DriverInfo(val no: Int, val name: String, val short: String, val team: Int, val skill: Double, val aggr: Double, val player: Boolean = false)

// 架空のチームとドライバー (実在の名称は使用しない)
val TEAMS = listOf(
    Team("ok", "OK RACING", parseColor("#f47a1f"), parseColor("#14254f"), parseColor("#ffffff"), 1.0, 1.0),
    Team("vlk", "ヴォルカ GP", parseColor("#d21f2b"), parseColor("#1b1b1b"), parseColor("#ffd23a"), 1.0, 0.998),
    Team("ast", "アストラ", parseColor("#f4f4f0"), parseColor("#0f6b4a"), parseColor("#0f6b4a"), 0.995, 1.0),
    Team("nrd", "ノルド・モータース", parseColor("#1c4fb8"), parseColor("#f5d400"), parseColor("#ffffff"), 0.99, 0.995),
    Team("slv", "シルバーアロー技研", parseColor("#b9c0c8"), parseColor("#101418"), parseColor("#00b4c8"), 0.985, 0.992),
    Team("mrg", "ミラージュ", parseColor("#18a6a0"), parseColor("#f2f2f2"), parseColor("#0d3a4a"), 0.975, 0.99),
    Team("tgr", "ティグレ", parseColor("#f0c21a"), parseColor("#17361f"), parseColor("#17361f"), 0.97, 0.985),
    Team("brs", "ボレアス", parseColor("#6a2aa6"), parseColor("#f0f0f0"), parseColor("#ff5aa0"), 0.965, 0.98),
    Team("kmk", "カミカワ", parseColor("#101010"), parseColor("#c9a24a"), parseColor("#c9a24a"), 0.955, 0.978),
    Team("rss", "ロッソ・ピッコロ", parseColor("#8c1d2f"), parseColor("#f3e9d2"), parseColor("#2b2b2b"), 0.95, 0.972),
)
/** 版ごとのカラーリング (オリジナル版の自車は水色) */
fun applyVariantTeams(v: Variant) {
    for (t in TEAMS) v.teams[t.id]?.let { m -> m.s("c1").takeIf { it.isNotEmpty() }?.let { t.c1 = parseColor(it) }; m.s("c2").takeIf { it.isNotEmpty() }?.let { t.c2 = parseColor(it) }; m.s("c3").takeIf { it.isNotEmpty() }?.let { t.c3 = parseColor(it) } }
}
val DRIVERS = listOf(
    DriverInfo(1, "YOU", "YOU", 0, 1.0, 0.5, true),
    DriverInfo(2, "岡 健一", "OKA", 0, 0.80, 0.5), DriverInfo(5, "A. ヴェルナー", "VER", 1, 1.0, 0.8),
    DriverInfo(6, "L. モレッティ", "MOR", 1, 0.88, 0.6), DriverInfo(7, "J. ハートレイ", "HAR", 2, 0.97, 0.5),
    DriverInfo(8, "高見 涼", "TAK", 2, 0.84, 0.7), DriverInfo(11, "N. リンドグレン", "LIN", 3, 0.92, 0.4),
    DriverInfo(12, "P. ドゥラン", "DUR", 3, 0.78, 0.6), DriverInfo(15, "M. シュタイナー", "STE", 4, 0.86, 0.7),
    DriverInfo(16, "水野 駿", "MIZ", 4, 0.74, 0.5), DriverInfo(19, "R. カルヴァーリョ", "CAR", 5, 0.82, 0.9),
    DriverInfo(20, "T. ベケット", "BEC", 5, 0.68, 0.4), DriverInfo(23, "E. サントーロ", "SAN", 6, 0.76, 0.6),
    DriverInfo(24, "氷室 丈", "HIM", 6, 0.64, 0.5), DriverInfo(27, "D. オブライエン", "OBR", 7, 0.72, 0.7),
    DriverInfo(28, "K. ヤンセン", "JAN", 7, 0.58, 0.5), DriverInfo(31, "神川 透", "KAM", 8, 0.66, 0.6),
    DriverInfo(32, "F. マルシャン", "MAR", 8, 0.52, 0.4), DriverInfo(35, "G. ロッシーニ", "ROS", 9, 0.60, 0.8),
    DriverInfo(36, "S. パーマー", "PAL", 9, 0.45, 0.5),
)

class Difficulty(val name: String, val skill: Double, val grip: Double, val power: Double)
val DIFFICULTY = linkedMapOf("easy" to Difficulty("やさしい", -0.30, 0.97, 0.985), "normal" to Difficulty("ふつう", -0.05, 0.995, 0.997), "hard" to Difficulty("むずかしい", 0.0, 1.0, 1.0))
class Weather(val name: String, val wet: Double, val rain: Double)
val WEATHERS = linkedMapOf("dry" to Weather("晴れ", 0.0, 0.0), "damp" to Weather("曇り (ハーフウェット)", 0.38, 0.02), "wet" to Weather("雨", 0.9, 0.75), "change" to Weather("変わりやすい", 0.0, 0.0))

/** AI の予選タイムの目安 [s] */
fun estimateQualiTime(d: DriverInfo, team: Team, diff: String, wet: Double, base: Double = 102.3): Double {
    val D = DIFFICULTY[diff] ?: DIFFICULTY["normal"]!!
    val skill = clamp(d.skill + D.skill, 0.0, 1.0)
    val tp = 1 - (1 - team.power) * 0.55; val tg = 1 - (1 - team.grip) * 0.55
    var t = (102.3 + (1 - skill) * 4.6 + (1 - tp * D.power) * 20 + (1 - tg * D.grip) * 42) * (base / 102.3)
    if (wet > 0.05) t *= 1 + 0.26 * sat(wet).pow(0.35)
    return t
}

fun fmtTime(t0: Double?, showMin: Boolean = true): String {
    if (t0 == null || !t0.isFinite()) return "-:--.---"
    val neg = t0 < 0; val t = abs(t0)
    val m = floor(t / 60).toInt(); val s = t - m * 60
    val ss = String.format(java.util.Locale.US, "%06.3f", s)
    return (if (neg) "-" else "") + (if (showMin || m != 0) "$m:$ss" else String.format(java.util.Locale.US, "%.3f", s))
}

const val GHOST_DT = 0.1
class Ghost(val dt: Double, val lap: Double, val x: ArrayList<Double>, val y: ArrayList<Double>, val h: ArrayList<Double>, val trace: List<Double>?) {
    fun toJson(): Map<String, Any?> = mapOf("dt" to dt, "lap" to lap, "x" to x.map { Math.round(it * 100) / 100.0 }, "y" to y.map { Math.round(it * 100) / 100.0 }, "h" to h.map { Math.round(it * 1000) / 1000.0 }, "trace" to trace)
    companion object {
        fun fromJson(m: Map<String, Any?>?): Ghost? = m?.let { Ghost(it.d("dt", GHOST_DT), it.d("lap"), ArrayList(it.a("x")!!.map { v -> v.num() }), ArrayList(it.a("y")!!.map { v -> v.num() }), ArrayList(it.a("h")!!.map { v -> v.num() }), it.a("trace")?.map { v -> v.num() }) }
    }
}
class Pose(val x: Double, val y: Double, val h: Double)

class PitState(var state: String, var s: Double, var v: Double, val d0: Double, var lat: Double, var timer: Double, val box: Double, var total: Double, var serviceTotal: Double = 0.0)

class LapRec(val t: Double, val valid: Boolean, val tyre: String)

class Entry(val di: Int, val d: DriverInfo, val team: Team, val car: Car, val isPlayer: Boolean, var slot: Int) {
    var ai: Driver? = null; var pilot: Driver? = null
    var dist = 0.0; var lap = 0; var lapStart = 0.0; var lastLap: Double? = null; var lastValid = true; var bestLap: Double? = null; var lapValid = true
    val lapTimes = ArrayList<LapRec>()
    var sector = 0; var secStart = 0.0
    var curSec = arrayOfNulls<Double>(3); val bestSec = arrayOfNulls<Double>(3); val lastSec = arrayOfNulls<Double>(3)
    var totalTime = 0.0; var finished = false; var finishTime: Double? = null; var finishWall = 0.0; var finishOrder = 0; var lapsDone = 0
    var pos = slot + 1; var gap = 0.0
    var pit: PitState? = null; var pitRequest = false; var nextTyre = "medium"; var pitStops = 0
    var retired = false; var retireT = 0.0; var out = false; var stuckT = 0.0; var wrongT = 0.0; var penalty = 0.0; var jump = false
    var topSpeed = 0.0; var startTyre = "medium"; var blue = false; var prevS = 0.0; var started = false; var cool = false; var nextInvalid = false
}

class GameEvent(val type: String) {
    var e: Entry? = null; var v = 0.0; var n = 0; var k = 0; var time = 0.0; var valid = true; var pb = false; var sb = false; var best: Double? = null
    var lap = 0; var text = ""; var rain = 0.0; var total = 0.0; var kind = ""; var sev = ""
}

class SessionOpts(
    var mode: String = "free", var laps: Int = 0, var weather: String = "dry", var setup: String = "mid", var tyre: String = "medium",
    var difficulty: String = "normal", var damage: Boolean = true, var assist: Boolean = false, var autoShift: Boolean = false,
    var grid: List<Int>? = null, var qualiLaps: Int = 3, var ghost: Ghost? = null, var bestTrace: List<Double>? = null,
    var reference: Reference? = null, var trainSection: Int = 0, var solo: Boolean = false,
)

class ResultRow(val di: Int, val pos0: Int, val name: String, val team: String, val no: Int, val laps: Int, val time: Double?, val best: Double?, val stops: Int, val dnf: Boolean, val player: Boolean, val penalty: Double) { var pos = pos0 }

class PlayerInput { var throttle = 0.0; var brake = 0.0; var steer = 0.0 }

class Session(val T: Track, val line: RacingLine, val opts: SessionOpts) {
    val mode = opts.mode
    val laps = if (opts.mode == "race") opts.laps else if (opts.mode == "quali") opts.qualiLaps else 0
    var time = 0.0; var raceTime = 0.0; var state = "pre"; var stateT = 0.0
    val events = ArrayList<GameEvent>()
    var lights = 0; var lightsOut = false; var goDelay = 0.0
    var finishedCount = 0; var leaderFinished = false
    val env = Env(T, noDamage = !opts.damage)
    var wet = 0.0; var rain = 0.0; var rainTarget = 0.0
    private class WPlan(val t: Double, val rain: Double) { var done = false }
    private var weatherPlan: ArrayList<WPlan>? = null
    val entries = ArrayList<Entry>()
    lateinit var player: Entry
    val cars = ArrayList<Car>()
    var order: List<Entry> = emptyList()
    private val orderBuf = ArrayList<Entry>()
    var ghost: Ghost? = opts.ghost
    private var ghostRec: GhostRec? = null
    var ghostPose: Pose? = null; var newGhost: Ghost? = null
    var bestTrace: List<Double>? = opts.bestTrace
    private var traceRec: TraceRec? = null
    var delta: Double? = null
    val playerInput = PlayerInput()
    var sessionBestTime: Double? = null; var sessionBestEntry: Entry? = null
    var resultsReady = false
    var results: List<ResultRow> = emptyList(); var qualiResult: List<Int>? = null
    private var acc = 0.0
    var cdDur = 3.0
    var trainer: Trainer? = null
    private val pTmp = Pos()

    private class GhostRec { var t = 0.0; var next = 0.0; val x = ArrayList<Double>(); val y = ArrayList<Double>(); val h = ArrayList<Double>() }
    private class TraceRec { var next = 0.0; val t = ArrayList<Double>() }

    init {
        AiRand.seed((Math.random() * 1e9).toLong())
        val W = WEATHERS[opts.weather] ?: WEATHERS["dry"]!!
        wet = W.wet; rain = W.rain; rainTarget = W.rain
        if (opts.weather == "change") {
            val startWet = AiRand.next() < 0.4
            wet = if (startWet) 0.8 else 0.0; rain = if (startWet) 0.7 else 0.0; rainTarget = rain
            val dur = if (opts.mode == "race") opts.laps * (T.def.baseLap.takeIf { it > 0 } ?: 102.3) * 1.056 else 600.0
            val plan = arrayListOf(WPlan(dur * (0.2 + AiRand.next() * 0.3), if (startWet) 0.0 else 0.5 + AiRand.next() * 0.5))
            if (dur > 900) plan.add(WPlan(dur * (0.65 + AiRand.next() * 0.2), if (startWet) 0.6 else 0.0))
            weatherPlan = plan
        }
        env.wet = wet; env.ambient = if (wet > 0.3) 18.0 else 24.0

        val diff = DIFFICULTY[opts.difficulty] ?: DIFFICULTY["normal"]!!
        val order0 = if (opts.mode == "race") (if (opts.solo) listOf(0) else opts.grid ?: DRIVERS.indices.toList()) else listOf(0)
        order0.forEachIndexed { slot, di ->
            val d = DRIVERS[di]; val team = TEAMS[d.team]
            val isPlayer = d.player
            val car = Car(id = di, setupId = if (isPlayer) opts.setup else "mid", tyreId = "medium", trim = T.def.aero,
                power = if (isPlayer) 1.0 else (1 - (1 - team.power) * 0.55) * diff.power, gripK = if (isPlayer) 1.0 else (1 - (1 - team.grip) * 0.55) * diff.grip)
            val e = Entry(di, d, team, car, isPlayer, slot)
            if (isPlayer) {
                car.assistTC = opts.assist; car.assistABS = opts.assist; car.autoShift = opts.autoShift
                fitTyres(car, opts.tyre); e.nextTyre = opts.tyre
            } else {
                val sk = clamp(d.skill + diff.skill, 0.0, 1.0)
                var ty = "medium"
                if (wet > 0.42) ty = "rain"
                else if (opts.laps <= 6) ty = "soft"
                else if (opts.laps >= 30) ty = if (AiRand.next() < 0.6) "hard" else "medium"
                else if (opts.laps <= 12) ty = if (AiRand.next() < 0.5) "soft" else "medium"
                fitTyres(car, ty); e.nextTyre = ty
                e.ai = Driver(car, T, line, skill = sk, aggr = d.aggr)
            }
            e.startTyre = car.tyre.id
            entries.add(e)
        }
        player = entries.first { it.isPlayer }
        for (e in entries) cars.add(e.car)
        for (e in entries) {
            e.car.fuel = if (mode == "race") opts.laps * T.fuelPerLap * 1.04 + 4 else if (mode == "free") 40.0 else 12.0
        }
        if (mode != "race") env.noFuel = mode != "free"
        if (mode == "race") {
            entries.forEachIndexed { k, e ->
                val s = T.length - 9 - k * 8; val d = (if (k % 2 == 0) 1 else -1) * 3.3
                placeCar(e.car, T, s, d, 0.0)
                e.dist = -(9.0 + k * 8); e.prevS = e.car.s
                e.ai?.refresh(wet)
            }
            state = "grid"; stateT = 0.0
        } else {
            val e = player
            val s0 = T.length - 470
            placeCar(e.car, T, s0, line.off[T.idx(s0)].toDouble(), 46.0)
            e.dist = -470.0; e.prevS = e.car.s
            state = "countdown"; stateT = 0.0
        }
        sortPositions()
        if (opts.mode == "train") {
            env.noWear = true; env.noFuel = true; env.noDamage = true
            trainer = Trainer(this, opts.reference!!, opts.trainSection).also { it.begin() }
        }
    }

    fun emit(type: String, f: (GameEvent.() -> Unit)? = null) { val ev = GameEvent(type); f?.invoke(ev); events.add(ev) }

    /** メイン更新 (dt は可変。内部は 1/60 固定ステップ) */
    fun update(dt: Double) {
        acc += min(dt, 0.1)
        var n = 0
        while (acc >= 1.0 / 60 && n < 5) { tick(1.0 / 60); acc -= 1.0 / 60; n++ }
        if (n == 5) acc = 0.0
    }

    fun tick(dt: Double) {
        time += dt; stateT += dt
        if (state == "countdown") {
            if (stateT >= cdDur) { state = "green"; stateT = 0.0; emit("go") }
        } else if (state == "grid") {
            if (stateT >= 2.5) { state = "lights"; stateT = 0.0; lights = 0; goDelay = 0.6 + AiRand.next() * 1.8 }
        } else if (state == "lights") {
            val n = min(5, floor(stateT / 0.85).toInt() + 1)
            if (n != lights) { lights = n; emit("light") { this.n = n } }
            if (stateT >= 5 * 0.85 + goDelay) { state = "green"; stateT = 0.0; lights = 0; lightsOut = true; emit("go") }
        }
        val racing = state == "green" || state == "finished"
        if (state == "green") raceTime += dt

        weatherPlan?.let { if (state == "green") for (w in it) if (!w.done && raceTime >= w.t) { w.done = true; rainTarget = w.rain; emit("weather") { rain = w.rain } } }
        if (mode != "train") {
            rain += clamp(rainTarget - rain, -dt * 0.03, dt * 0.03)
            wet = sat(wet + (rain * 0.016 - (1 - rain) * (if (rain > 0.05) 0.001 else 0.0032)) * dt)
        }
        env.wet = wet

        val frozen = state == "countdown"
        for (e in entries) {
            val c = e.car
            if (e.out) continue
            if (e.pit != null) { updatePit(e, dt); continue }
            if (e.isPlayer && !e.finished) {
                val inp = playerInput
                if (e.pilot == null) e.pilot = Driver(c, T, line, skill = 1.0, aggr = 1.0, steerOnly = true)
                if (state == "green") {
                    val toPit = T.sDiff(T.pit.sEntry, c.s)
                    e.pilot!!.update(dt, wet, cars, DriveInfo(keepRight = e.pitRequest && toPit > 0 && toPit < 230))
                } else c.steerIn = 0.0
                c.throttle = inp.throttle; c.brake = inp.brake
                if (state == "grid" || state == "lights") {
                    if (c.speed > 1.2 && !e.jump) { e.jump = true; e.penalty += 10; emit("penalty") { text = "フライング +10秒" } }
                }
            } else if (e.ai != null || e.finished) {
                if (e.ai == null) { e.ai = Driver(c, T, line, skill = 0.3); e.cool = true }
                val ai = e.ai!!
                if (!racing) { c.throttle = 0.0; c.brake = 1.0; c.steerIn = 0.0 }
                else if (state == "green" && stateT < ai.reaction && !e.started) { c.throttle = 0.0; c.brake = 1.0 }
                else {
                    e.started = true
                    val info = DriveInfo(blue = e.blue, vmax = if (e.finished) 45.0 else if (e.retired) 0.01 else 0.0, caution = mode == "race" && raceTime < 40)
                    if (e.pitRequest && !e.finished && !e.retired) { val toPit = T.sDiff(T.pit.sEntry, c.s); if (toPit > 0 && toPit < 260) { info.keepRight = true; info.vmax = 70.0 } }
                    ai.update(dt, wet, cars, info)
                    if (e.finished) c.throttle = min(c.throttle, 0.5)
                }
            }
            if (e.retired && e.pit == null) { c.throttle = 0.0; c.brake = if (e.car.speed > 8) 0.5 else 1.0 }
        }
        updateDraft()

        val SUB = 4; val h = dt / SUB
        for (k in 0 until SUB) {
            for (e in entries) {
                if (e.out || e.pit != null) continue
                if (frozen) continue
                val c = e.car
                stepCar(c, h, env)
                if (c.hit > 2.5) emit("crash") { this.e = e; v = c.hit }
            }
            val es = entries
            for (i in es.indices) {
                val A = es[i]; if (A.out || A.pit != null) continue
                for (j in i + 1 until es.size) {
                    val B = es[j]; if (B.out || B.pit != null) continue
                    val dx = A.car.x - B.car.x; if (dx > 6 || dx < -6) continue
                    val dy = A.car.y - B.car.y; if (dy > 6 || dy < -6) continue
                    if (abs(T.sDiff(A.car.s, B.car.s)) > 12) continue
                    val imp = collideCars(A.car, B.car, env.noDamage)
                    if (imp > 1.5 && (A.isPlayer || B.isPlayer)) emit("contact") { v = imp }
                }
            }
        }
        if (frozen) { afterStep(dt); return }
        trainer?.tick(dt)
        for (e in entries) { if (e.out) continue; updateTiming(e, dt) }
        afterStep(dt)
    }

    private fun afterStep(dt: Double) {
        val pl = player
        for (e in entries) {
            val c = e.car
            if (e.out) continue
            if (c.retired && !e.retired) { e.retired = true; e.retireT = 0.0; emit("retire") { this.e = e } }
            if (e.retired) {
                e.retireT += dt
                if (!e.isPlayer && e.retireT > 6 && c.speed < 3) { e.out = true; c.out = true }
                continue
            }
            if (e.ai != null && e.pit == null && state == "green" && e.started) {
                val wrong = abs(c.relH) > 1.9
                if ((c.speed < 3 && c.offCount >= 2) || wrong || (c.speed < 1.5 && stateT > 5)) e.stuckT += dt else e.stuckT = max(0.0, e.stuckT - dt * 2)
                if (e.stuckT > 3.5) { resetToTrack(e); e.stuckT = 0.0 }
            }
            if (e.isPlayer && e.pit == null && !e.finished && state == "green") {
                val wrong = abs(c.relH) > 2.0
                val bogged = c.offCount >= 3 && c.speed < 5
                val walled = c.speed < 1.5 && c.throttle > 0.25 && stateT > 4
                val spun = abs(c.relH) > 0.45 && c.speed < 4 && stateT > 3
                val parked = mode == "race" && c.speed < 1 && stateT > 6
                if (wrong || bogged || walled || spun || parked) e.stuckT += dt * (if (spun && !wrong) 1.5 else if (parked && !spun) 0.75 else 1.0) else e.stuckT = max(0.0, e.stuckT - dt * 2)
                if (e.stuckT > 2.2) { val tr = trainer; if (tr != null) tr.abort("stuck") else resetToTrack(e); e.stuckT = 0.0 }
            }
            if (c.speed * 3.6 > e.topSpeed) e.topSpeed = c.speed * 3.6
        }
        if (mode == "race" && state == "green") {
            for (e in entries) {
                if (e.ai == null || e.cool || e.out || e.pit != null || e.finished || e.retired) continue
                val c = e.car; val left = laps - e.lap
                val worn = max(c.wearF, c.wearR)
                var want = false; var ty = e.nextTyre
                val slick = c.tyre.id != "rain"
                if (slick && wet > 0.5) { want = true; ty = "rain" }
                else if (!slick && wet < 0.22 && rain < 0.2) { want = left > 1; ty = if (left > 22) "hard" else if (left > 9) "medium" else "soft" }
                else if (worn > 0.7 && left > 2) { want = true; ty = if (wet > 0.42) "rain" else (if (left > 24) "hard" else if (left > 10) "medium" else "soft") }
                else if ((c.dmgF > 0.35 || c.dmgR > 0.45) && left > 2) { want = true; ty = if (wet > 0.42) "rain" else (if (worn > 0.35) (if (left > 12) "medium" else "soft") else c.tyre.id) }
                e.pitRequest = want; if (want) e.nextTyre = ty
            }
        }
        val P = T.pit
        for (e in entries) {
            if (e.out || e.pit != null || !e.pitRequest || e.retired) continue
            val c = e.car
            val ds = T.sDiff(c.s, P.sEntry)
            if (ds >= 0 && ds < 14 && c.d * P.side > -2.5 && c.vx > 3 && c.speed < 75) enterPit(e)
        }
        sortPositions()
        if (mode == "race") {
            for (e in entries) {
                e.blue = false
                if (e.ai == null || e.out) continue
                for (o in entries) {
                    if (o === e || o.out || o.pit != null) continue
                    val lapDiff = o.dist - e.dist
                    if (lapDiff > T.length * 0.6) { val gap = T.sDiff(e.car.s, o.car.s); if (gap > 0 && gap < 28) { e.blue = true; break } }
                }
                if (!e.blue && e.pit == null && e.car.dmgF + e.car.dmgR + e.car.dmgS > 0.3) {
                    for (o in entries) {
                        if (o === e || o.out || o.pit != null) continue
                        val gap = T.sDiff(e.car.s, o.car.s)
                        if (gap > 1 && gap < 22 && o.car.dmgF + o.car.dmgR + o.car.dmgS < 0.2) { e.blue = true; break }
                    }
                }
            }
        }
        updateGhost(dt)
        if (!resultsReady) {
            if (mode == "race") {
                if ((pl.finished && time - pl.finishWall > 4) || (pl.retired && pl.retireT > 3.5)) finishSession()
            } else if (mode == "quali") {
                if (pl.lap > laps || (pl.retired && pl.retireT > 3)) finishSession()
            } else if (pl.retired && pl.retireT > 2.5) repairAndReset(pl)
        }
    }

    private fun updateDraft() {
        for (e in entries) e.car.draft = 0.0
        if (entries.size < 2) return
        for (A in entries) {
            if (A.out || A.pit != null) continue
            val a = A.car; if (a.vx < 28) continue
            val ca = cos(a.yaw); val sa = sin(a.yaw)
            var best = 0.0
            for (B in entries) {
                if (B === A || B.out || B.pit != null) continue
                val b = B.car
                val dx = b.x - a.x; val dy = b.y - a.y
                val fwd = dx * ca + dy * sa; if (fwd < 3 || fwd > 55) continue
                val lat = abs(-dx * sa + dy * ca); if (lat > 1.9) continue
                if (abs(T.sDiff(a.s, b.s)) > 70) continue
                val f = (1 - fwd / 55) * (1 - lat / 1.9) * sat(b.vx / 40)
                if (f > best) best = f
            }
            a.draft = best
        }
    }

    // ---------- 計時 ----------
    private fun updateTiming(e: Entry, dt: Double) {
        val c = e.car; val L = T.length
        val s = e.pit?.let { it.s % L } ?: c.s
        val dsg = T.sDiff(s, e.prevS)
        val before = e.dist
        e.dist += dsg; e.prevS = s
        if (state != "green" && state != "finished") return
        val now = if (mode == "race") raceTime else time
        if (e.finished) return
        val lapPos = mod(e.dist, L); val lapPosB = mod(before, L)
        if (e.lap >= 1 && dsg > 0) {
            for (k in 0 until 2) {
                val sp = T.sectorSplits[k]
                if (lapPosB < sp && lapPos >= sp && e.sector == k) { val tc = now - dt * (lapPos - sp) / max(dsg, 1e-6); closeSector(e, k, tc) }
            }
        }
        val lapsB = floor(before / L).toInt(); val lapsA = floor(e.dist / L).toInt()
        if (lapsA > lapsB && e.dist >= 0 && lapsA + 1 > e.lap) {
            val over = e.dist - lapsA * L
            val tc = now - dt * over / max(dsg, 1e-6)
            if (e.lap >= 1) {
                closeSector(e, 2, tc)
                val lt = tc - e.lapStart
                e.lastLap = lt; e.lastValid = e.lapValid
                e.lapTimes.add(LapRec(lt, e.lapValid, c.tyre.id))
                var pb = false; var sb = false
                if (e.lapValid) {
                    if (e.bestLap == null || lt < e.bestLap!!) { e.bestLap = lt; pb = true }
                    if (sessionBestTime == null || lt < sessionBestTime!!) { sessionBestTime = lt; sessionBestEntry = e; sb = true }
                }
                if (e.isPlayer) {
                    val lapNo = e.lap; val vld = e.lapValid
                    emit("lap") { this.e = e; time = lt; valid = vld; this.pb = pb; this.sb = sb; lap = lapNo }
                    finishGhostLap(lt, e.lapValid && pb)
                } else if (sb && mode == "race") emit("fastest") { this.e = e; time = lt }
            }
            e.lap = lapsA + 1
            e.lapStart = if (mode == "race" && lapsA == 0) 0.0 else tc
            e.secStart = e.lapStart; e.sector = 0; e.curSec = arrayOfNulls(3); e.lapValid = true
            if (e.isPlayer) startGhostLap()
            if (mode == "race") {
                if (lapsA >= laps && !leaderFinished) { leaderFinished = true; emit("flag") { this.e = e } }
                if (leaderFinished && lapsA >= 1) {
                    e.finished = true; e.finishTime = tc + e.penalty; e.finishWall = time; e.finishOrder = finishedCount++
                    e.lapsDone = lapsA
                    if (e.isPlayer) emit("finish") { this.e = e }
                }
            }
        }
        if (mode == "race" && e.lap == 0 && e.dist >= 0) e.lap = 1
        if (c.offCount == 4 && e.lapValid && e.lap >= 1 && mode != "race" && e.pit == null) {
            e.lapValid = false; if (e.isPlayer) emit("invalid")
        }
        if (c.offCount == 4 && e.lap == 0 && mode != "race") e.nextInvalid = true
    }

    private fun closeSector(e: Entry, k: Int, tc: Double) {
        val st = tc - e.secStart
        e.curSec[k] = st; e.lastSec[k] = st; e.secStart = tc; e.sector = k + 1
        var pb = false
        if (e.lapValid && (e.bestSec[k] == null || st < e.bestSec[k]!!)) { pb = e.bestSec[k] != null; e.bestSec[k] = st }
        if (e.isPlayer) { val best = e.bestSec[k]; val vld = e.lapValid; emit("sector") { this.k = k; time = st; this.pb = pb; this.best = best; valid = vld } }
    }

    fun sortPositions() {
        orderBuf.clear(); orderBuf.addAll(entries)
        orderBuf.sortWith { a, b ->
            if (a.finished != b.finished) (if (a.finished) -1 else 1)
            else if (a.finished) a.finishOrder - b.finishOrder
            else b.dist.compareTo(a.dist)
        }
        val lead = orderBuf[0]
        orderBuf.forEachIndexed { i, e -> e.pos = i + 1; e.gap = lead.dist - e.dist }
        order = ArrayList(orderBuf)
    }

    // ---------- ピット ----------
    private fun enterPit(e: Entry) {
        val c = e.car
        e.pit = PitState("in", c.s, max(8.0, c.speed), c.d, 0.0, 0.0, T.pit.boxS[e.d.team], 0.0)
        c.inPit = true; e.pitRequest = false
        if (e.isPlayer) emit("pitin")
    }
    private fun updatePit(e: Entry, dt: Double) {
        val P = T.pit; val p = e.pit!!; val c = e.car; val L = T.length
        val limit = 100 / 3.6
        p.total += dt
        val toBox = T.sDiff(p.box, p.s % L)
        var vt: Double
        val sWrap = T.wrapS(p.s)
        val inExitRamp = T.sDiff(sWrap, P.sExitStart) > 0 && T.sDiff(sWrap, P.sExitStart) < 200
        if (p.state == "in") {
            vt = min(limit, sqrt(max(0.0, 2 * 9 * max(0.0, toBox - 0.15))) + 0.4)
            if (toBox < 0.25 && p.v < 1.2) {
                p.state = "service"; p.v = 0.0
                val dmg = c.dmgF + c.dmgR + c.dmgS
                p.timer = 6.2 + AiRand.next() * 2.2 + dmg * 9
                p.serviceTotal = p.timer
                if (e.isPlayer) { val tm = p.timer; emit("pitstop") { time = tm } }
            }
        } else if (p.state == "service") {
            vt = 0.0; p.timer -= dt
            if (p.timer <= 0) {
                fitTyres(c, e.nextTyre); c.dmgF = 0.0; c.dmgR = 0.0; c.dmgS *= 0.25; c.pull = 0.0
                if (mode != "race") c.fuel = max(c.fuel, 30.0)
                e.pitStops++; p.state = "out"
                e.ai?.refresh(wet)
                if (e.isPlayer) emit("pitout")
            }
        } else vt = if (inExitRamp) 46.0 else limit
        val acc = if (p.v < vt) 7.5 else -14.0
        p.v = max(0.0, min(if (vt > p.v) vt else 1e9, p.v + acc * dt))
        if (p.v < vt && acc < 0) p.v = vt
        p.s += p.v * dt
        T.pitPos(p.s, pTmp)
        val tIn = sat(T.sDiff(T.wrapS(p.s), P.sEntry) / 60)
        val blend = if (p.state == "in" && tIn < 1) (1 - tIn) * (1 - tIn) else 0.0
        val near = sat(1 - abs(T.sDiff(p.box, T.wrapS(p.s))) / 22)
        val latT = if (p.state == "out" && toBox < -1) max(0.0, near) else near
        p.lat = latT * latT * (3 - 2 * latT) * P.boxOffset
        val i = T.idx(p.s)
        val dd = (p.d0 - pTmp.d) * blend + p.lat
        val x = pTmp.x + T.nx[i] * dd; val y = pTmp.y + T.ny[i] * dd
        val hx = x - c.x; val hy = y - c.y
        if (hx * hx + hy * hy > 0.0004) c.yaw = atan2(hy, hx)
        c.x = x; c.y = y; c.vx = p.v; c.vy = 0.0; c.r = 0.0; c.speed = p.v
        c.s = T.wrapS(p.s); c.i = i; c.fi = c.s / T.ds; c.d = pTmp.d + dd
        c.throttle = if (p.v < vt) 0.4 else 0.1; c.brake = 0.0; c.delta = 0.0; c.steerIn = 0.0
        c.gear = if (p.v < 20) 1 else 2; c.rpm = max(3000.0, p.v / CAR.rw * c.ratios[c.gear] * 60 / (2 * PI))
        c.offCount = 0; c.kR = 0.0; c.kF = 0.0; c.slipF = 0.0; c.slipR = 0.0; c.hit = 0.0; c.surf.fill(0)
        updateTiming(e, dt)
        if (p.state == "out" && T.sDiff(T.wrapS(p.s), P.sExit) >= 0 && T.sDiff(T.wrapS(p.s), P.sExit) < 60) {
            val v = p.v
            placeCar(c, T, p.s, pTmp.d, v)
            c.inPit = false; e.pit = null; e.prevS = c.s
            if (e.isPlayer) { val tt = p.total; emit("pitexit") { total = tt } }
        }
    }

    // ---------- コース復帰 ----------
    fun resetToTrack(e: Entry) {
        val c = e.car
        var s = c.s
        for (tries in 0 until 8) {
            var ok = true
            for (o in entries) { if (o === e || o.out) continue; if (abs(T.sDiff(o.car.s, s)) < 10 && o.pit == null) { ok = false; break } }
            if (ok) break; s = T.wrapS(s - 12)
        }
        val before = c.s; val i = T.idx(s); val lo = line.off[i]
        val d = if (lo > 0) -(T.wl[i] - 1.7) else (T.wr[i] - 1.7)
        placeCar(c, T, s, d.toDouble(), 0.0)
        e.dist += T.sDiff(c.s, before); e.prevS = c.s
        if (mode != "race") e.lapValid = false
        if (e.isPlayer) emit("reset")
    }
    fun repairAndReset(e: Entry) {
        val c = e.car
        c.dmgF = 0.0; c.dmgR = 0.0; c.dmgS = 0.0; c.pull = 0.0; c.retired = false; e.retired = false; e.retireT = 0.0
        resetToTrack(e)
    }
    fun changeConfig(setup: String?, tyre: String?) {
        val c = player.car
        if (setup != null && SETUPS[setup] != null) { c.setup = trimSetup(SETUPS[setup]!!, T.def.aero); applySetup(c); opts.setup = setup }
        if (tyre != null && TYRES[tyre] != null) { fitTyres(c, tyre); opts.tyre = tyre; player.nextTyre = tyre }
        c.dmgF = 0.0; c.dmgR = 0.0; c.dmgS = 0.0; c.pull = 0.0
        if (mode == "free") c.fuel = 40.0
    }
    fun setWeather(id: String) {
        val W = WEATHERS[id] ?: return
        opts.weather = id; weatherPlan = null
        wet = W.wet; rain = W.rain; rainTarget = W.rain; env.wet = wet
    }
    fun shift(dir: Int): Boolean {
        val e = player
        if (e.pit != null || e.finished || state == "countdown") return false
        return requestShift(e.car, dir)
    }

    // ---------- ゴースト ----------
    private fun startGhostLap() {
        if (mode != "ta" && mode != "quali" && mode != "free") return
        ghostRec = GhostRec(); traceRec = TraceRec()
    }
    private fun updateGhost(dt: Double) {
        val pl = player; val c = pl.car
        val g = ghostRec ?: return
        if (state != "green") return
        g.t += dt
        while (g.t >= g.next) { g.x.add(c.x); g.y.add(c.y); g.h.add(c.yaw); g.next += GHOST_DT }
        val L = T.length; val lapPos = mod(pl.dist, L); val tr = traceRec!!
        while (tr.next <= lapPos && tr.t.size < 590) { tr.t.add(g.t); tr.next += 10 }
        val bt = bestTrace
        if (bt != null && pl.lap >= 1) {
            val k = lapPos / 10; val k0 = floor(k).toInt()
            if (k0 + 1 < bt.size) delta = g.t - (bt[k0] + (bt[k0 + 1] - bt[k0]) * (k - k0))
        } else delta = null
        val gh = ghost
        if (gh != null && mode == "ta" && pl.lap >= 1) {
            val f = g.t / gh.dt; val i0 = floor(f).toInt()
            if (i0 + 1 < gh.x.size) {
                val t = f - i0
                var dh = gh.h[i0 + 1] - gh.h[i0]; dh = atan2(sin(dh), cos(dh))
                ghostPose = Pose(gh.x[i0] + (gh.x[i0 + 1] - gh.x[i0]) * t, gh.y[i0] + (gh.y[i0 + 1] - gh.y[i0]) * t, gh.h[i0] + dh * t)
            } else ghostPose = null
        } else if (trainer == null) ghostPose = null
    }
    private fun finishGhostLap(lapTime: Double, isBest: Boolean) {
        val g = ghostRec ?: return; val tr = traceRec!!
        if (isBest) {
            tr.t.add(lapTime)
            bestTrace = ArrayList(tr.t)
            if (mode == "ta") {
                val ng = Ghost(GHOST_DT, lapTime, g.x, g.y, g.h, bestTrace)
                newGhost = ng
                if (ghost == null || lapTime < ghost!!.lap) ghost = ng
            }
        }
    }

    // ---------- 終了処理 ----------
    fun finishSession() {
        resultsReady = true; state = "finished"
        val pl = player
        if (mode == "race") {
            val rows = order.map { e ->
                ResultRow(e.di, 0, e.d.name, e.team.name, e.d.no, if (e.finished) e.lapsDone else max(0, floor(e.dist / T.length).toInt()),
                    if (e.finished) e.finishTime else null, e.bestLap, e.pitStops, e.retired, e.isPlayer, e.penalty)
            }
            val fin = rows.filter { it.time != null && !it.dnf }.sortedWith { a, b -> if (b.laps != a.laps) b.laps - a.laps else a.time!!.compareTo(b.time!!) }
            val run = rows.filter { it.time == null && !it.dnf }; val dnf = rows.filter { it.dnf }.sortedByDescending { it.laps }
            results = fin + run + dnf
            results.forEachIndexed { i, r -> r.pos = i + 1 }
        } else if (mode == "quali") {
            val rows = DRIVERS.mapIndexed { di, d ->
                if (d.player) ResultRow(di, 0, d.name, TEAMS[d.team].name, d.no, 0, null, pl.bestLap, 0, false, true, 0.0)
                else ResultRow(di, 0, d.name, TEAMS[d.team].name, d.no, 0, null, estimateQualiTime(d, TEAMS[d.team], opts.difficulty, wet, T.def.baseLap) + (AiRand.next() - 0.35) * 0.9, 0, false, false, 0.0)
            }.sortedBy { it.best ?: 1e9 }
            rows.forEachIndexed { i, r -> r.pos = i + 1 }
            results = rows
            qualiResult = rows.map { it.di }
        }
        emit("results")
    }
}
