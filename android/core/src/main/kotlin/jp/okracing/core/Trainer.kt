package jp.okracing.core

import kotlin.math.*

// トレーニングモード (Web 版 src/trainer.js の移植)
//  ・お手本ラップ: AI(スキル最大)が理想ラインを走った1周を事前に記録 (速度・ギヤ・ペダル・時刻・位置)
//  ・目標表示 / ライブ助言 / 走行分析 / 区間リピート

private const val KMH = 3.6

class Reference(val key: String, val N: Int, val s0: Double, val i0: Int, val wet: Double, val setup: String, val tyre: String) {
    val v = FloatArray(N); val thr = FloatArray(N); val brk = FloatArray(N); val gear = IntArray(N); val t = FloatArray(N); val vis = BooleanArray(N)
    val poseDt = 1.0 / 60; val px = ArrayList<Double>(); val py = ArrayList<Double>(); val ph = ArrayList<Double>()
    var lapTime = 0.0; var filled = 0
    var ratios = DoubleArray(7)
}

private val refCache = HashMap<String, Reference>()

fun buildReference(T: Track, line: RacingLine, setup: String = "mid", tyre: String = "soft", wet: Double = 0.0): Reference {
    val key = "${T.id}|$setup|$tyre|${jsRound(wet * 20)}"
    refCache[key]?.let { return it }
    val N = T.N; val L = T.length
    val car = Car(setupId = setup, tyreId = tyre, trim = T.def.aero); car.fuel = 14.0; fitTyres(car, tyre)
    val drv = Driver(car, T, line, skill = 1.0); drv.errT = 1e9
    val sStart = L - 470; val s0 = L - 150; val i0 = T.idx(s0)
    placeCar(car, T, sStart, line.off[T.idx(sStart)].toDouble(), 46.0)
    val env = Env(T, wet = wet, noFuel = true, noWear = true, noDamage = true)
    val ref = Reference(key, N, s0, i0, wet, setup, tyre)
    val first = 320 + L
    val stop = first + L + 900
    var dist = 0.0; var prevS = car.s; var t: Double; var recT0 = -1.0; var lastI = -1; var ticks = 0
    while (dist < stop && ticks < 60 * 400) {
        drv.update(1.0 / 60, wet, null, null)
        for (k in 0 until 4) stepCar(car, 1.0 / 240, env)
        ticks++
        dist += T.sDiff(car.s, prevS); prevS = car.s
        if (dist >= first) {
            if (recT0 < 0) recT0 = ticks / 60.0
            t = ticks / 60.0 - recT0
            ref.px.add(car.x); ref.py.add(car.y); ref.ph.add(car.yaw)
            val i = car.i
            if (i != lastI && dist < first + L) {
                var j = if (lastI < 0) i else (lastI + 1) % N
                for (g in 0 until 4) {
                    if (!ref.vis[j]) { ref.vis[j] = true; ref.v[j] = car.speed.toFloat(); ref.thr[j] = car.throttle.toFloat(); ref.brk[j] = car.brake.toFloat(); ref.gear[j] = car.gear; ref.t[j] = t.toFloat() }
                    if (j == i) break; j = (j + 1) % N
                }
                lastI = i
            }
            if (dist >= first + L && ref.lapTime == 0.0) ref.lapTime = t
        }
    }
    for (i in 0 until N) if (!ref.vis[i]) {
        ref.filled++; val a = (i - 1 + N) % N; val b = (i + 1) % N
        ref.v[i] = (ref.v[a] + ref.v[b]) / 2; ref.t[i] = (ref.t[a] + ref.t[b]) / 2; ref.thr[i] = ref.thr[a]; ref.brk[i] = ref.brk[a]; ref.gear[i] = ref.gear[a]
    }
    ref.ratios = car.ratios
    refCache[key] = ref
    return ref
}

/** 速度 v[m/s] で回転数が約12,000rpm (パワーバンドの中心) になるギヤ */
fun optimalGear(ratios: DoubleArray, v: Double): Int {
    var best = 1; var bd = 1e9
    for (g in 1..6) {
        val rpm = v / CAR.rw * ratios[g] * 60 / TAU
        if (rpm > 13300) continue
        val d = abs(rpm - 11800)
        if (d < bd) { bd = d; best = g }
    }
    return best
}

class Zone(val start: Int, val end: Int, val minIdx: Int, val vStart: Double, val vMin: Double, val peak: Double)
class Prepared(val sec: TrainSec) { var start = 0.0; var len = 0.0; var id = ""; var bs = 0; var endS = 0.0; var zones: List<Zone> = emptyList() }

private fun prepareSection(T: Track, ref: Reference, sec: TrainSec): Prepared {
    val N = T.N; val ds = T.ds; val L = T.length
    fun ix(s: Double) = jsRound(s / ds).coerceIn(0, N - 1)
    val o = Prepared(sec)
    if (sec.n0 <= 0) { o.start = ref.s0; o.len = L; o.id = sec.id; return o }
    var bs = ix(sec.n0)
    for (i in ix(sec.n0 - 120) until ix(sec.n1)) if (ref.brk[i] > 0.2) { bs = i; break }
    o.id = sec.id; o.bs = bs
    o.start = max(0.0, bs * ds - 300)
    o.endS = min(L - 1, sec.n1 + 40)
    o.len = o.endS - o.start
    o.zones = detectZones(T, ref, ix(sec.n0 - 120), ix(sec.n1))
    return o
}

fun detectZones(T: Track, ref: Reference, i0: Int, i1: Int): List<Zone> {
    val ds = T.ds; val zones = ArrayList<Zone>()
    var i = i0
    while (i < i1) {
        if (ref.brk[i] > 0.15) {
            val s = i; var e = i; var gap = 0
            for (j in i until min(T.N, i1 + 40)) { if (ref.brk[j] > 0.15) { e = j; gap = 0 } else if (++gap > 8) break }
            var peak = 0.0; for (j in s..e) peak = max(peak, ref.brk[j].toDouble())
            var mi = e; var mv = 1e9; for (j in s..min(T.N - 1, e + jsRound(60 / ds))) if (ref.v[j] < mv) { mv = ref.v[j].toDouble(); mi = j }
            val drop = ref.v[s] - mv
            if (drop > 7) zones.add(Zone(s, e, mi, ref.v[s].toDouble(), mv, peak))
            i = e + 1
        } else i++
    }
    return zones.take(4)
}

fun stars(dT: Double, len: Double): Int {
    val k = sqrt(clamp(len / 400, 0.7, 4.0))
    return if (dT <= 0.15 * k) 5 else if (dT <= 0.4 * k) 4 else if (dT <= 0.9 * k) 3 else if (dT <= 1.8 * k) 2 else 1
}

class Cue(val kind: String, val text: String, val sev: String, val at: Double, val dur: Double)
class Target { var speed = 0.0; var gear = 1; var gearNow = 1; var dv = 0.0; var thr = 0.0; var brk = 0.0; var delta = 0.0; var gearState = "ok" }
class ZoneResult(val label: String, val noBrake: Boolean, val brakeDiffM: Double, val peakPl: Double, val peakRef: Double, val vMinPl: Double, val vMinRef: Double,
                 val vEntryPl: Double, val vEntryRef: Double, val exitDiffM: Double, val gearPl: Int, val gearOpt: Int, val lock: Int, val spin: Int, val off: Int, val dT: Double)
class Advice(val sev: String, val text: String, val w: Double = 0.0)
class SectionReport(val id: String, val name: String) { var zones = ArrayList<ZoneResult>(); var advice: List<Advice> = emptyList(); var len = 0.0; var dT = 0.0; var stars = 0 }
class TrainReport(val aborted: Boolean, val secId: String, val name: String, val isLap: Boolean, val runT: Double, val run: Int) {
    var rows: List<SectionReport> = emptyList(); var refTime = 0.0; var delta = 0.0; var stars = 0; var advice: List<Advice> = emptyList(); var zones: List<ZoneResult> = emptyList(); var score = 0
}

class Trainer(val S: Session, ref0: Reference, secIdx0: Int = 0) {
    val T = S.T; val line = S.line
    val secs = T.def.train
    var ref = ref0
    var secIdx = secIdx0.coerceIn(0, secs.size - 1)
    val N = T.N
    val pT = FloatArray(N); val pV = FloatArray(N); val pThr = FloatArray(N); val pBrk = FloatArray(N)
    val pGear = IntArray(N); val pLock = IntArray(N); val pSpin = IntArray(N); val pOff = IntArray(N); val pVis = BooleanArray(N)
    var prepared = secs.map { prepareSection(T, ref, it) }
    var cue: Cue? = null; private val cueCd = HashMap<String, Double>(); private val zoneShown = HashSet<Int>(); private val zoneDone = HashSet<Int>()
    var runs = 0; var lastReport: TrainReport? = null; var report: TrainReport? = null; var done = false; var lastRunTime: Double? = null
    val target = Target()
    private var gearWrongT = 0.0
    var runT = 0.0; var runDist = 0.0; private var prevS = 0.0; private var lastI = -1; var tref0 = 0.0; var startIdx = 0
    private var zonesCache: List<Zone>? = null

    val sec get() = secs[secIdx]
    val prep get() = prepared[secIdx]
    val isLap get() = sec.n0 <= 0

    fun setReference(r: Reference) { ref = r; prepared = secs.map { prepareSection(T, r, it) }; zonesCache = null }
    fun setSection(idx: Int) { secIdx = idx.coerceIn(0, secs.size - 1) }

    fun begin() {
        val e = S.player; val c = e.car; val p = prep
        val i = T.idx(p.start)
        placeCar(c, T, p.start, line.off[i].toDouble(), ref.v[i].toDouble())
        c.gear = max(1, ref.gear[i]); c.nextGear = c.gear; c.shiftT = 0.0
        c.rpm = max(CAR.idle, ref.v[i] / CAR.rw * c.ratios[c.gear] * 60 / TAU)
        c.dmgF = 0.0; c.dmgR = 0.0; c.dmgS = 0.0; c.pull = 0.0; c.retired = false; e.retired = false; e.stuckT = 0.0; e.pilot = null
        c.fuel = 40.0; c.draft = 0.0
        e.dist = p.start; e.prevS = c.s; e.lap = 0; e.lapValid = true
        pVis.fill(false); zoneShown.clear(); zoneDone.clear()
        runT = 0.0; runDist = 0.0; prevS = c.s; lastI = -1
        tref0 = ref.t[i].toDouble(); startIdx = i
        done = false; report = null; cue = null; cueCd.clear(); gearWrongT = 0.0
        runs++
        S.state = "countdown"; S.stateT = 0.0; S.cdDur = 1.7; S.delta = null; S.resultsReady = false
        c.speed = ref.v[i].toDouble(); target.delta = 0.0
        updateGhost(0.0); updateTarget(c)
        S.emit("trainstart")
    }
    fun restart() = begin()

    fun idxAhead(i: Int, meters: Double) = (i + jsRound(meters / T.ds)) % N

    fun updateGhost(elapsed: Double) {
        val f = (tref0 + elapsed) / ref.poseDt; val i0 = floor(f).toInt()
        if (i0 + 1 >= ref.px.size) { S.ghostPose = null; return }
        val t = f - i0; var dh = ref.ph[i0 + 1] - ref.ph[i0]; dh = atan2(sin(dh), cos(dh))
        S.ghostPose = Pose(ref.px[i0] + (ref.px[i0 + 1] - ref.px[i0]) * t, ref.py[i0] + (ref.py[i0 + 1] - ref.py[i0]) * t, ref.ph[i0] + dh * t)
    }

    fun updateTarget(c: Car) {
        val i = c.i; val tg = target; val la = idxAhead(i, max(8.0, c.speed * 0.4))
        tg.speed = ref.v[i].toDouble(); tg.gear = optimalGear(ref.ratios, ref.v[la].toDouble()); tg.gearNow = c.gear
        tg.dv = c.speed - ref.v[i]; tg.thr = ref.thr[i].toDouble(); tg.brk = ref.brk[i].toDouble()
        tg.delta = runT - (ref.t[i] - tref0)
        tg.gearState = if (tg.gear == c.gear) "ok" else if (tg.gear > c.gear) "up" else "down"
    }

    fun tick(dt: Double) {
        val c = S.player.car
        if (S.state != "green" || done) return
        runT += dt
        val dsg = T.sDiff(c.s, prevS); runDist += dsg; prevS = c.s
        val i = c.i
        if (i != lastI) {
            var j = if (lastI < 0) i else (lastI + 1) % N
            for (g in 0 until 4) {
                pVis[j] = true; pT[j] = runT.toFloat(); pV[j] = c.speed.toFloat(); pThr[j] = c.throttle.toFloat(); pBrk[j] = c.brake.toFloat(); pGear[j] = c.gear
                pLock[j] = if ((c.kF < -0.14 && c.speed > 8) || c.lockedF) 1 else 0; pSpin[j] = if (c.kR > 0.28 && c.speed > 5) 1 else 0; pOff[j] = if (c.offCount >= 3) 1 else 0
                if (j == i) break; j = (j + 1) % N
            }
            lastI = i
        }
        updateGhost(runT)
        updateTarget(c)
        liveCues(dt, c, i, c.speed)
        checkZones(i)
        if (runDist >= prep.len) finish()
    }

    private fun say(kind: String, text: String, sev: String, dur: Double = 1.9, cd: Double = 2.5) {
        val now = S.time
        cueCd[kind]?.let { if (now < it) return }
        fun pri(s: String) = when (s) { "urgent" -> 3; "warn" -> 2; "info", "good" -> 1; else -> 0 }
        val cu = cue
        if (cu != null && now - cu.at < cu.dur && pri(cu.sev) > pri(sev)) return
        cue = Cue(kind, text, sev, now, dur)
        cueCd[kind] = now + cd
        S.emit("traincue") { this.kind = kind; this.sev = sev }
    }
    fun allZones(): List<Zone> {
        zonesCache?.let { return it }
        val z = ArrayList<Zone>()
        for (p in prepared) z.addAll(p.zones)
        z.sortBy { it.start }
        zonesCache = z; return z
    }
    private fun liveCues(dt: Double, c: Car, i: Int, v: Double) {
        if (runT < 0.5) return
        val ds = T.ds
        val brk = c.brake; val thr = c.throttle
        val zs = allZones()
        for (zi in zs.indices) {
            val z = zs[zi]
            var toStart = (((z.start - i + N + N / 2.0) % N) - N / 2.0); toStart *= ds
            if (toStart <= clamp(v * 0.5, 14.0, 48.0) && toStart >= 0 && brk < 0.12 && !zoneShown.contains(zi)) { say("brake", "ブレーキ！", "urgent", 1.2, 0.5); zoneShown.add(zi) }
            else if (toStart < 0 && toStart > -40 && brk < 0.12 && v > ref.v[i] + 8) say("late", "ブレーキが遅れています！ 強く踏んで", "urgent", 1.6, 2.0)
        }
        val ahead = idxAhead(i, 14.0)
        if (brk > 0.2 && ref.brk[i] < 0.05 && ref.brk[ahead] < 0.08 && v < ref.v[i] - 6) say("release", "ブレーキを離して！ 速度を残す", "warn", 1.5, 2.5)
        if (ref.thr[i] > 0.85 && thr < 0.35 && brk < 0.1 && v < ref.v[i] - 4) say("thr", "アクセルを開けて！", "warn", 1.4, 3.0)
        if (c.kR > 0.3 && v > 4) say("spin", "アクセルが開きすぎ！ 空転しています", "warn", 1.5, 3.0)
        if (c.lockedF && v > 8) say("lock", "ロック！ ブレーキを少し緩めて", "warn", 1.5, 3.0)
        if (target.gearState != "ok") gearWrongT += dt else gearWrongT = 0.0
        if (gearWrongT > 0.7 && c.shiftT <= 0) {
            val g = target.gear
            if (g < c.gear) say("gear", "シフトダウン → ${g}速", "info", 1.6, 4.0) else say("gear", "シフトアップ → ${g}速", "info", 1.6, 4.0)
        }
    }
    private fun checkZones(i: Int) {
        val zs = allZones(); val ds = T.ds
        for (zi in zs.indices) {
            val z = zs[zi]
            if (zoneDone.contains(zi)) continue
            val after = ((i - (z.minIdx + jsRound(60 / ds)) + N + N / 2.0) % N) - N / 2.0
            val before = ((z.start - i + N + N / 2.0) % N) - N / 2.0
            if (after >= 0 && after < 40 && before < 0 && pVis[z.start]) {
                zoneDone.add(zi)
                val r = analyzeZone(z) ?: continue
                if (r.noBrake) say("zone", "ブレーキを踏まずに通過しました", "warn", 2.2, 0.5)
                else if (r.off > 0) say("zone", "コースアウト！ 進入速度を落としましょう", "warn", 2.2, 0.5)
                else if (r.brakeDiffM > 12) say("zone", "ブレーキが ${jsRound(r.brakeDiffM)}m 遅い", "warn", 2.4, 0.5)
                else if (r.brakeDiffM < -20) say("zone", "ブレーキが ${jsRound(-r.brakeDiffM)}m 早い", "warn", 2.4, 0.5)
                else if (r.exitDiffM > 14) say("zone", "アクセルが ${jsRound(r.exitDiffM)}m 遅い", "warn", 2.4, 0.5)
                else if (r.vMinPl < r.vMinRef - 10) say("zone", "コーナー速度が ${jsRound(r.vMinRef - r.vMinPl)}km/h 低い", "warn", 2.4, 0.5)
                else say("zone", "ナイス！ お手本どおり", "good", 2.2, 0.5)
            }
        }
    }

    fun analyzeZone(z: Zone): ZoneResult? {
        val ds = T.ds
        var prevEnd = 0; for (q in allZones()) if (q.end < z.start && q.end > prevEnd) prevEnd = q.end
        val w0 = max(prevEnd + 1, z.start - jsRound(100 / ds)); val w1 = min(N - 1, z.end + jsRound(20 / ds))
        val vEnd = min(N - 1, z.minIdx + jsRound(60 / ds))
        var pb = -1; var bestD = 1e9; var peak = 0.0; var held = false
        for (j in w0..w1) {
            if (!pVis[j]) continue
            val prevB = if (j > w0 && pVis[j - 1]) pBrk[j - 1] else (if (j == w0) pBrk[j] else 0f)
            if (pBrk[j] > 0.25 && (prevB <= 0.25 || j == w0)) { val d = abs(j - z.start).toDouble(); if (d < bestD) { bestD = d; pb = j; held = j == w0 && pBrk[j] > 0.25 && w0 > z.start - jsRound(100 / ds) } }
            peak = max(peak, pBrk[j].toDouble())
        }
        var pMin = 1e9; var pMinI = z.minIdx
        for (j in z.start..vEnd) if (pVis[j] && pV[j] < pMin) { pMin = pV[j].toDouble(); pMinI = j }
        if (pMin > 1e8) return null
        val lim = min(N - 1, pMinI + jsRound(300 / ds))
        var pOn = -1; var rOn = -1
        for (j in pMinI..lim) if (pVis[j] && pThr[j] > 0.6) { pOn = j; break }
        for (j in z.minIdx..min(N - 1, z.minIdx + jsRound(300 / ds))) if (ref.thr[j] > 0.6) { rOn = j; break }
        var lock = 0; var spin = 0; var off = 0
        for (j in w0..min(N - 1, z.minIdx + jsRound(150 / ds))) if (pVis[j]) { lock += pLock[j]; spin += pSpin[j]; off += pOff[j] }
        val e0 = w0; val e1 = min(N - 1, z.minIdx + jsRound(150 / ds))
        val dT = if (pVis[e0] && pVis[e1]) (pT[e1] - pT[e0]) - (ref.t[e1] - ref.t[e0]).toDouble() else 0.0
        val gOpt = optimalGear(ref.ratios, z.vMin)
        val nm = T.sectionAt(z.minIdx * ds)
        return ZoneResult(
            label = if (nm != null && nm.name.isNotEmpty()) nm.name else "${jsRound(z.minIdx * ds)}m 付近",
            noBrake = pb < 0 && z.peak > 0.3 && pV[z.start] > z.vMin + 12,
            brakeDiffM = if (pb < 0 || held) 0.0 else (pb - z.start) * ds,
            peakPl = peak, peakRef = z.peak, vMinPl = pMin * KMH, vMinRef = z.vMin * KMH,
            vEntryPl = if (pVis[z.start]) pV[z.start] * KMH else 0.0, vEntryRef = z.vStart * KMH,
            exitDiffM = if (pOn < 0 || rOn < 0) 0.0 else (pOn - pMinI - (rOn - z.minIdx)) * ds,
            gearPl = if (pVis[pMinI]) pGear[pMinI] else 0, gearOpt = gOpt, lock = lock, spin = spin, off = off, dT = dT,
        )
    }

    private fun analyzeSection(p: Prepared): SectionReport {
        val ds = T.ds
        val out = SectionReport(p.id, p.sec.name)
        val iA = max(0, p.bs - jsRound(150 / ds)); val iB = min(N - 1, T.idx(p.sec.n1))
        out.len = (iB - iA) * ds
        out.dT = if (pVis[iA] && pVis[iB]) (pT[iB] - pT[iA]) - (ref.t[iB] - ref.t[iA]).toDouble() else 0.0
        out.stars = stars(out.dT, out.len)
        for (z in p.zones) analyzeZone(z)?.let { out.zones.add(it) }
        out.advice = adviceFor(out.zones)
        return out
    }

    fun finish() {
        if (done) return
        done = true
        val rep = TrainReport(false, sec.id, sec.name, isLap, runT, runs)
        if (isLap) {
            val rows = ArrayList<SectionReport>()
            for (k in 1 until prepared.size) if (prepared[k].zones.isNotEmpty()) rows.add(analyzeSection(prepared[k]))
            rep.rows = rows
            rep.refTime = ref.lapTime; rep.delta = runT - ref.lapTime
            rep.stars = stars(max(0.0, rep.delta), 5800.0)
            val worst = rows.sortedByDescending { it.dT }
            val adv = ArrayList<Advice>()
            for (r in worst) for (a in r.advice) if (a.sev != "good" && adv.size < 3) adv.add(Advice(a.sev, "【${r.name}】${a.text}"))
            if (adv.isEmpty()) adv.add(Advice("good", "どの区間もお手本に近い走りです。タイムをさらに縮めるには、各コーナーの立ち上がりを磨きましょう。"))
            rep.advice = adv
        } else {
            val r = analyzeSection(prep)
            rep.rows = listOf(r); rep.delta = r.dT; rep.stars = r.stars; rep.zones = r.zones; rep.advice = r.advice
            rep.refTime = ref.t[T.idx(prep.endS)] - tref0
        }
        rep.score = jsRound(100 * exp(-max(0.0, rep.delta) / (0.9 * sqrt(clamp((if (isLap) 5800.0 else prep.len) / 400, 0.7, 4.0) * (if (isLap) 4 else 1)))))
        report = rep; lastReport = rep; lastRunTime = runT
        S.emit("trainreport")
    }

    fun abort(reason: String) {
        if (done) return
        done = true
        val rep = TrainReport(true, sec.id, sec.name, isLap, runT, runs)
        rep.advice = listOf(Advice("warn", if (reason == "wall") "コースの外に出てしまいました。ブレーキを早めに踏み、進入速度を抑えましょう。" else "コースアウトして復帰できませんでした。コーナー手前でしっかり減速し、立ち上がりのアクセルはゆっくり開けましょう。"))
        report = rep; lastReport = rep
        S.emit("trainreport")
    }
}

/** 助言の文章を作る (重要度の高い順に最大3件) */
fun adviceFor(zones: List<ZoneResult>): List<Advice> {
    val list = ArrayList<Advice>()
    for (z in zones) {
        val L = z.label
        if (z.off > 0) list.add(Advice("warn", "$L: コースアウトしました。進入速度が高すぎます。ブレーキング開始を早めましょう。", 100.0))
        if (z.noBrake) list.add(Advice("warn", "$L: ブレーキを踏んでいません。お手本は約${jsRound(z.vEntryRef)}km/hからブレーキング。", 95.0))
        if (z.lock > 3) list.add(Advice("warn", "$L: ブレーキでタイヤがロックしています。最初に強く踏み、速度が落ちたら踏力を抜きましょう。", 80.0))
        if (z.brakeDiffM > 12 && !z.noBrake) list.add(Advice("warn", "$L: ブレーキが約${jsRound(z.brakeDiffM)}m 遅れています。道路脇のブレーキング指標を目安に、早めに踏み始めましょう。", 70 + z.brakeDiffM / 3))
        if (z.brakeDiffM < -20 && z.vMinPl < z.vMinRef - 4) list.add(Advice("warn", "$L: ブレーキが約${jsRound(-z.brakeDiffM)}m 早すぎて、コーナー速度が${jsRound(z.vMinRef - z.vMinPl)}km/h 足りません。もう少し奥まで我慢しましょう。", 60 + -z.brakeDiffM / 4))
        else if (z.vMinPl < z.vMinRef - 8) list.add(Advice("warn", "$L: コーナー中の最低速度が${jsRound(z.vMinRef - z.vMinPl)}km/h 低め。ブレーキを残しすぎず、早めに離してコーナーへ。", 55 + (z.vMinRef - z.vMinPl) / 2))
        if (z.peakPl < z.peakRef * 0.65 && z.vEntryPl > z.vEntryRef - 5 && !z.noBrake) list.add(Advice("warn", "$L: ブレーキが弱めです。最初に80%以上で強く踏み、徐々に抜いていきましょう。", 50.0))
        if (z.spin > 3) list.add(Advice("warn", "$L: 立ち上がりで後輪が空転しています。アクセルは一気に開けず、徐々に開けましょう。", 65.0))
        else if (z.exitDiffM > 14) list.add(Advice("warn", "$L: アクセルを開けるのが約${jsRound(z.exitDiffM)}m 遅れています。コーナーの出口が見えたら素早く開けましょう。", 45 + z.exitDiffM / 4))
        if (z.gearPl != 0 && abs(z.gearPl - z.gearOpt) >= 1) list.add(Advice("info", "$L: コーナー中の最適ギヤは${z.gearOpt}速です (あなたは${z.gearPl}速)。ブレーキング中に先にシフトダウンしておきましょう。", 40.0))
    }
    val out = list.sortedByDescending { it.w }.take(3).toMutableList()
    if (out.isEmpty()) out.add(Advice("good", "ブレーキ・コーナー速度・アクセルのタイミングがお手本にとても近いです。この調子で繰り返し、さらに0.1秒を削りましょう。"))
    return out
}
