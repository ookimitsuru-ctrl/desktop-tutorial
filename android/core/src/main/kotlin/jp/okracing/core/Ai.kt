package jp.okracing.core

import kotlin.math.*

// AIドライバー (Web 版 src/ai.js の移植): レーシングライン・速度プロファイル・操縦・追い越し/防御

private const val RHO_AI = 1.2
/** 車がコースの横方向に占める半幅 [m]。前を向いていれば約 0.95m、スピンして横を向いていれば約 2.3m */
fun halfAcross(T: Track, o: Car): Double { val a = o.yaw - atan2(T.ty[o.i].toDouble(), T.tx[o.i].toDouble()); return 0.95 * abs(cos(a)) + 2.25 * abs(sin(a)) }

class RacingLine(val off: FloatArray, val x: FloatArray, val y: FloatArray, val curv: FloatArray, val lo: FloatArray, val hi: FloatArray)

fun computeRacingLine(T: Track): RacingLine {
    val N = T.N
    val d = FloatArray(N); val lo = FloatArray(N); val hi = FloatArray(N)
    for (i in 0 until N) {
        lo[i] = (-(T.wl[i] - 1.25) - (if (T.kerbL[i] != 0f) 0.55 else 0.0)).toFloat()
        hi[i] = ((T.wr[i] - 1.25) + (if (T.kerbR[i] != 0f) 0.55 else 0.0)).toFloat()
    }
    val px = FloatArray(N); val py = FloatArray(N)
    fun W(i: Int) = mod(i, N)
    val RL = T.def.raceline; val RN = RL?.size ?: 0
    for (i in 0 until N) {
        val v = if (RN == 0) 0.0 else if (RN == N) RL!![i] else RL!![jsRound(i.toDouble() * RN / N) % RN]
        d[i] = clamp(v, lo[i].toDouble(), hi[i].toDouble()).toFloat()
        px[i] = T.x[i] + T.nx[i] * d[i]; py[i] = T.y[i] + T.ny[i] * d[i]
    }
    val curv = FloatArray(N)
    for (i in 0 until N) {
        val a = W(i - 3); val b = W(i + 3)
        val ax = (px[i] - px[a]).toDouble(); val ay = (py[i] - py[a]).toDouble(); val bx = (px[b] - px[i]).toDouble(); val by = (py[b] - py[i]).toDouble()
        val cr = ax * by - ay * bx
        val la = hypot(ax, ay); val lb = hypot(bx, by); val lc = hypot((px[b] - px[a]).toDouble(), (py[b] - py[a]).toDouble())
        curv[i] = (2 * cr / (la * lb * lc + 1e-9)).toFloat()
    }
    val cs = FloatArray(N)
    for (i in 0 until N) { var a = 0.0; for (q in -2..2) a += curv[W(i + q)]; cs[i] = (a / 5).toFloat() }
    return RacingLine(d, px, py, cs, lo, hi)
}

class ProfileParams(val mu: Double, val use: Double = 1.0, val cla: Double, val cda: Double, val mass: Double, val power: Double = 1.0,
                    val brake: Double = 0.9, val dfUse: Double = 0.93, val gUse: Double = 0.97, val vtop: Double = 96.0)

/** 速度プロファイル */
fun speedProfile(T: Track, line: RacingLine, p: ProfileParams, out: FloatArray? = null): FloatArray {
    val N = T.N; val ds = T.ds
    val v = out ?: FloatArray(N)
    val kdf = 0.5 * RHO_AI * p.cla / p.mass; val kdr = 0.5 * RHO_AI * p.cda / p.mass
    val mu = p.mu * p.use
    val VTOP = p.vtop
    fun sb(i: Int) = sin(abs(T.bank[i].toDouble()))
    for (i in 0 until N) {
        val k = abs(line.curv[i]) + 1e-5; val s = sb(i); val c = sqrt(1 - s * s)
        val den = k * (c - mu * s) - mu * kdf * p.dfUse
        val vv = if (den > 1e-6) sqrt(G * (mu * p.gUse * c + s) / den) else VTOP
        v[i] = min(vv, VTOP).toFloat()
    }
    val bk = p.brake
    for (pass in 0 until 2) {
        for (q in N - 1 downTo 0) {
            val i = q; val j = (q + 1) % N
            val vj = v[j].toDouble()
            val amax = mu * (G + kdf * vj * vj)
            val alat = max(0.0, vj * vj * abs(line.curv[j]) - G * sb(j))
            val along = amax * max(0.0, 1 - (alat * alat) / (amax * amax)).pow(0.85) * bk + kdr * vj * vj + G * T.slope[i]
            val vi = sqrt(vj * vj + 2 * max(1.0, along) * ds)
            if (vi < v[i]) v[i] = vi.toFloat()
        }
    }
    val pw = 507000 * CAR.eff * p.power
    for (pass in 0 until 2) {
        for (i in 0 until N) {
            val j = (i + 1) % N; val vi = v[i].toDouble()
            val amax = mu * (G + kdf * vi * vi)
            val alat = max(0.0, vi * vi * abs(line.curv[i]) - G * sb(i))
            val atr = sqrt(max(0.0, amax * amax - alat * alat)) * 0.58
            val apw = pw / (p.mass * max(vi, 12.0))
            val acc = min(atr, apw) - kdr * vi * vi - G * T.slope[i]
            val vj = sqrt(max(4.0, vi * vi + 2 * acc * ds))
            if (vj < v[j]) v[j] = vj.toFloat()
        }
    }
    return v
}

/** AI 用の疑似乱数 (Web 版と同じ LCG。シードを揃えれば同じ動きになる) */
object AiRand {
    private var seed = 12345L
    fun seed(s: Long) { seed = s and 0xffffffffL }
    fun next(): Double { seed = (seed * 1664525 + 1013904223) and 0xffffffffL; return seed / 4294967296.0 }
}

class DriveInfo(var caution: Boolean = false, var blue: Boolean = false, var keepRight: Boolean = false, var vmax: Double = 0.0)

class Driver(val car: Car, val T: Track, val line: RacingLine, skill: Double = 0.8, aggr: Double = 0.5, val steerOnly: Boolean = false) {
    companion object { var DF_USE = 0.98; var G_USE = 1.0 }
    var skill = skill
    var use = 0.95 + 0.05 * skill
    var aggr = aggr
    val profile = FloatArray(T.N)
    var profileMu = 0.0; var profileT = 0.0
    var offset = 0.0; var offsetTarget = 0.0
    var followCap = 999.0; var defended = 0.0
    var reaction = 0.18 + AiRand.next() * 0.35
    var errT = 3 + AiRand.next() * 20; var err = 0.0
    var lift = 0.0; var wet = 0.0
    var passSide = 0; var passT = 0.0
    private var dSm = Double.NaN
    private var footT = 0.0; private var footB = 0.0
    private val p = Pos()

    init {
        if (!steerOnly) { car.assistTC = true; car.assistABS = true; car.autoShift = true }
        refresh(0.0)
    }
    fun estMu(wet: Double): Double {
        val c = car
        val f = max(0.7, min(tyreGripFactor(c.tyre, c.tempF, c.wearF), tyreGripFactor(c.tyre, c.tempR + 8, c.wearR)))
        return tyreBaseMu(c.tyre, wet) * f * c.gripK * (1 - 0.25 * c.dmgS) * (1 - 0.1 * c.dmgF)
    }
    fun refresh(wet: Double) {
        val c = car
        this.wet = wet
        val mu = estMu(wet)
        profileMu = mu
        speedProfile(T, line, ProfileParams(mu = mu, use = use * (if (wet > 0.3) 0.97 else 1.0) * T.def.aiGrip, cla = c.setup.cla * (1 - 0.3 * c.dmgF - 0.25 * c.dmgR), cda = c.setup.cda,
            mass = totalMass(c), power = c.power, brake = 0.86 + 0.06 * skill, dfUse = DF_USE, gUse = G_USE, vtop = if (T.def.aero != null) 125.0 else 96.0), profile)
    }

    fun update(dt: Double, wet: Double, cars: List<Car>?, info: DriveInfo?) {
        val c = car; val L = line
        profileT -= dt
        if (profileT <= 0 || abs(wet - this.wet) > 0.04) {
            profileT = 4 + AiRand.next() * 2
            if (abs(estMu(wet) - profileMu) > 0.012 || abs(wet - this.wet) > 0.04) refresh(wet)
        }
        val v = max(0.0, c.vx)
        val N = T.N

        var cap = 999.0; var lift = 0.0
        if (cars != null) {
            val myOff = c.d
            var ahead: Car? = null; var aGap = 1e9; var behind: Car? = null; var bGap = 1e9; var sideBy = false; var block: Car? = null; var blGap = 1e9
            for (o in cars) {
                if (o === c || o.inPit || o.out) continue
                val gap = T.sDiff(o.s, c.s)
                if (abs(gap) > 95) continue
                val dx = o.x - c.x; val dy = o.y - c.y
                if (dx * dx + dy * dy > 110 * 110) continue
                if (gap > 0 && gap < aGap) { aGap = gap; ahead = o }
                if (gap > 0 && gap < blGap) {
                    val l1 = o.d - myOff; val l2 = (o.d - L.off[o.i]) - (myOff - L.off[c.i]); val wo = halfAcross(T, o) + 1.35
                    if (abs(l1) < wo || abs(l2) < wo || (info?.caution == true && gap > 4)) { blGap = gap; block = o }
                }
                if (gap <= 0 && -gap < bGap) { bGap = -gap; behind = o }
                if (abs(gap) < 6.5) {
                    val lat = o.d - myOff
                    if (abs(lat) < 3.0 && abs(lat) > 0.3) {
                        val push = (3.0 - abs(lat)) * (if (lat > 0) -1 else 1)
                        offsetTarget += push * 0.5
                        sideBy = true
                    }
                }
            }
            var kn = 0.0
            var q = 10; while (q < 110) { val kk = L.curv[(c.i + q) % N].toDouble(); if (abs(kk) > abs(kn)) kn = kk; q += 6 }
            val inside = if (kn > 0.004) 1 else if (kn < -0.004) -1 else 0
            passT -= dt
            if (ahead != null) {
                val ov = max(0.0, ahead.vx)
                val closing = v - ov
                val lat = ahead.d - myOff
                val slow = ov < 12 && v > 20; val stopped = ov < 4
                val hw = halfAcross(T, ahead)
                if (aGap < (if (steerOnly) 16 + max(0.0, closing) * 2.2 else 9 + max(0.0, closing) * 1.4) + (if (slow || stopped) 40 else 0)) {
                    if (abs(lat) < hw + 1.55 || passT > 0) {
                        if (passT <= 0) {
                            val roomR = L.hi[c.i] - (ahead.d + hw + 1.45); val roomL = (ahead.d - hw - 1.45) - L.lo[c.i]
                            var side: Int
                            if (stopped) side = if (roomR > roomL) (if (roomR > 0.2) 1 else 0) else (if (roomL > 0.2) -1 else 0)
                            else if (inside > 0 && roomR > 0.2) side = 1 else if (inside < 0 && roomL > 0.2) side = -1
                            else side = if (roomR > roomL) (if (roomR > 0.2) 1 else 0) else (if (roomL > 0.2) -1 else 0)
                            val cornering = abs(L.curv[c.i]) > 0.008
                            if (cornering && !slow && !stopped && !steerOnly && AiRand.next() > 0.02 + aggr * 0.05) side = 0
                            passSide = side; passT = if (side != 0) 2.5 else 0.4
                        }
                        if (passSide != 0) {
                            val tgt = ahead.d + passSide * (hw + 1.6) - L.off[c.i]
                            offsetTarget += (tgt - offsetTarget) * min(1.0, dt * 3.5)
                        }
                    }
                }
            } else if (passT <= 0) passSide = 0
            if (block != null && blGap < 90) {
                val ov = max(0.0, block.vx)
                val room = max(0.0, blGap - (5.4 + v * 0.035) - (if (info?.caution == true) 3 else 0))
                val decel = (if (abs(L.curv[c.i]) > 0.004) 4.2 else 6.2) * profileMu
                cap = min(cap, sqrt(ov * ov + 2 * decel * room))
                if (blGap < 25 && abs(L.curv[c.i]) > 0.004) cap = min(cap, profile[c.i] * 0.985 + 1)
                if (blGap < 5.2) cap = min(cap, ov - 1.5)
                if (ov < 4 && passSide != 0 && block === ahead && blGap > 3) cap = max(cap, if (blGap > 8) 5.0 else 2.5)
            }
            if ((ahead == null || aGap > 30) && !sideBy) { if (passT <= 0) offsetTarget *= (1 - min(1.0, dt * 0.9)) }
            if (sideBy) cap = min(cap, max(20.0, profile[c.i] * 0.95))
            defended -= dt
            if (behind != null && bGap < 14 && behind.vx > v + 1.5 && abs(L.curv[c.i]) < 0.003 && inside != 0 && defended <= 0 && info?.blue != true) {
                if (AiRand.next() < 0.25 + aggr * 0.5) {
                    val tgt = clamp(inside * 2.8, (L.lo[c.i] - L.off[c.i] + 0.3).toDouble(), (L.hi[c.i] - L.off[c.i] - 0.3).toDouble())
                    offsetTarget = tgt * 0.8
                }
                defended = 6.0
            }
            if (info?.blue == true) {
                val side = if (inside != 0) -inside else (if (c.d > 0) 1 else -1)
                offsetTarget += (side * 3 - offsetTarget) * min(1.0, dt * 2)
                lift = 0.12
            }
        }
        errT -= dt
        if (errT <= 0) { errT = 6 + AiRand.next() * 30; err = (AiRand.next() - 0.3) * (1 - skill) * 0.05 }
        err *= (1 - dt * 0.4)

        if (info?.keepRight == true) { val edge = if (T.pit.side > 0) L.hi[c.i] - 0.6 else L.lo[c.i] + 0.6; offsetTarget += ((edge - L.off[c.i]) - offsetTarget) * min(1.0, dt * 2.5) }
        val oi = (c.i + 8) % N
        offsetTarget = clamp(offsetTarget, (L.lo[oi] - L.off[oi]).toDouble(), (L.hi[oi] - L.off[oi]).toDouble())
        offset += clamp(offsetTarget - offset, -3.2 * dt, 3.2 * dt)

        // ---------- ステアリング (pure pursuit) ----------
        val look = 6.5 + v * 0.26
        val fi = c.fi + look / T.ds
        val li = floor(fi).toInt() % N; val li2 = (li + 1) % N; val lt = fi - floor(fi)
        val off = L.off[li] + (L.off[li2] - L.off[li]) * lt + offset
        T.pos(fi * T.ds, off, p)
        val dx = p.x - c.x; val dy = p.y - c.y
        val cy = cos(c.yaw); val sy = sin(c.yaw)
        val lx = dx * cy + dy * sy; val ly = -dx * sy + dy * cy
        val curvCmd = 2 * ly / (lx * lx + ly * ly + 1e-6)
        val m = totalMass(c)
        val ayReq = v * v * curvCmd
        val ayMax = profileMu * (G + 0.5 * RHO_AI * c.setup.cla * v * v / m)
        var delta = atan(CAR.wheelbase * curvCmd) + 0.055 * clamp(ayReq / ayMax, -1.2, 1.2)
        val beta = atan2(c.vy - CAR.b * c.r, max(v, 3.0))
        val bTh = if (steerOnly) 0.10 else 0.15
        if (abs(beta) > bTh) delta += (beta - sign(beta) * bTh) * (if (steerOnly) 2.2 else 1.6)
        if (lx < 1.5) delta = (if (ly == 0.0) 1.0 else sign(ly)) * CAR.maxLock
        if (dSm.isNaN()) dSm = delta
        dSm += (delta - dSm) * min(1.0, dt * 14)
        delta = dSm
        val lock = steerLock(c, v)
        c.steerIn = clamp(delta / lock, -1.0, 1.0)

        if (steerOnly) return

        // ---------- 速度制御 ----------
        val pi = (c.i + jsRound((2 + v * 0.07) / T.ds)) % N
        var vt = profile[pi] * (1 + err)
        val offAbs = abs(offset)
        if (offAbs > 0.7 && abs(L.curv[pi]) > 0.004) vt *= 1 - min(0.12, offAbs * 0.028)
        if (info?.caution == true && abs(L.curv[pi]) > 0.003) vt *= 0.93
        if (c.offCount >= 2) vt = min(vt, 30.0)
        val stuck = c.offCount >= 2 && v < 8
        vt = min(vt, cap)
        if (info != null && info.vmax > 0) vt = min(vt, info.vmax)
        val e = vt - v
        var thr = 0.0; var brk = 0.0
        val pwr = engineTorque(max(c.rpm, 6000.0)) * c.ratios[max(1, c.gear)] * CAR.eff / CAR.rw
        val dragF = 0.5 * RHO_AI * c.setup.cda * v * v + 0.016 * m * G + m * G * T.slope[c.i]
        val hold = clamp(dragF / pwr, 0.0, 1.0)
        if (e > -1.5) {
            thr = sat(hold * (1 + min(0.0, e) / 1.5) + max(0.0, e) * 0.45)
            val used = abs(c.ay) / (ayMax + 1e-6)
            val room = sqrt(max(0.0, 1 - min(1.0, used * used * 0.94)))
            val trac = c.mu * c.fzR * room
            thr = min(thr, clamp(trac / pwr * 1.0 + hold * 0.6 + 0.04, 0.06, 1.0))
            thr *= (1 - lift)
            if (stuck) thr = max(thr, 0.75)
        }
        run {
            val k2 = (pi + 4) % N; val vp1 = profile[pi].toDouble(); val vp2 = profile[k2].toDouble()
            val aff = max(0.0, (vp1 * vp1 - vp2 * vp2) / (2 * 4 * T.ds))
            val dragA = 0.5 * RHO_AI * c.setup.cda * v * v / m
            var need = 0.0
            if (e < 1.5 && aff > dragA + 1.5) need = (aff - dragA) * m / CAR.brakeForceMax
            if (e < -1.5) need += (-e - 1.5) * 0.10
            if (cap < 900 && e < -0.3) need = max(need, -e * 0.22)
            if (need > 0.02) { brk = sat(need); thr = 0.0 }
        }
        if (abs(beta) > 0.14 && v > 15) thr *= sat(1 - (abs(beta) - 0.14) * 8)
        if (!c.assistTC) {
            footT = clamp(footT + (if (c.kR > 0.085) dt * 9 * (1 + (c.kR - 0.085) * 12) else -dt * 1.6), 0.0, 0.9)
            thr *= 1 - footT
            if (c.gear <= 2) thr = min(thr, 0.35 + 0.65 * sat((c.rpm - 6000) / 7000) + (c.gear - 1) * 0.2)
        }
        if (!c.assistABS) {
            footB = clamp(footB + (if (c.kF < -0.12 || c.kR < -0.14) dt * 10 else -dt * 2.5), 0.0, 0.85)
            brk *= 1 - footB
        }
        c.throttle += clamp(thr - c.throttle, -dt * 12, dt * (4 + 4 * skill))
        c.brake += clamp(brk - c.brake, -dt * 10, dt * 9)
    }
}
