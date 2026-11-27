package jp.okracing.core

import kotlin.math.*

// 車両物理モデル (Web 版 src/physics.js の移植。OK-90 / 1990年前後のF1を想定した架空マシン)
// 2輪(前後軸)モデル + 前後輪の回転自由度 + 複合スリップタイヤ + 空力 + 荷重移動。
// 車体座標: x=前, y=右。ヨー角/ヨーレートは時計回り(右旋回)が正。

const val G = 9.81
private const val RHO = 1.2

object CAR {
    const val dryMass = 505.0 + 75; const val wheelbase = 2.85; const val a = 1.62; const val b = 1.23
    const val cgh = 0.28; const val izK = 1.22; const val rw = 0.33; const val iwF = 1.7; const val iwR = 2.3; const val ie = 0.032
    const val halfTrack = 0.88; const val length = 4.45; const val width = 2.16
    const val brakeForceMax = 23500.0; const val brakeBias = 0.67; const val eff = 0.91
    const val revLimit = 13600.0; const val revMax = 14300.0; const val idle = 2500.0
    const val shiftTime = 0.11; const val maxLock = 0.37; const val fuelRate = 0.030; const val fuelPerLap = 2.1
}

// 3.5L NA V10 トルクカーブ [rpm, Nm]  最高出力 約680ps / 12,800rpm
private val TQ = arrayOf(doubleArrayOf(1500.0, 150.0), doubleArrayOf(3000.0, 205.0), doubleArrayOf(5000.0, 268.0), doubleArrayOf(7000.0, 322.0), doubleArrayOf(9000.0, 362.0), doubleArrayOf(10500.0, 380.0), doubleArrayOf(11800.0, 386.0), doubleArrayOf(12800.0, 378.0), doubleArrayOf(13500.0, 352.0), doubleArrayOf(14300.0, 250.0), doubleArrayOf(15500.0, 80.0))
fun engineTorque(rpm: Double): Double {
    if (rpm <= TQ[0][0]) return TQ[0][1]
    for (i in 1 until TQ.size) if (rpm <= TQ[i][0]) { val a = TQ[i - 1]; val b = TQ[i]; return a[1] + (b[1] - a[1]) * (rpm - a[0]) / (b[0] - a[0]) }
    return 0.0
}
private fun engineBrake(rpm: Double) = 15 + 55 * sat(rpm / 13500)

private val BASE_RATIOS = doubleArrayOf(-13.2, 13.44, 10.18, 8.27, 6.91, 5.96, 5.25)

class Setup(val id: String, val name: String, val cda: Double, val cla: Double, val final: Double, val front: Double, val desc: String) {
    fun copy(cla: Double = this.cla, cda: Double = this.cda, final: Double = this.final) = Setup(id, name, cda, cla, final, front, desc)
}
val SETUPS = linkedMapOf(
    "high" to Setup("high", "高速寄り", 1.04, 2.50, 0.955, 0.365, "最高速重視。ストレートで有利"),
    "mid" to Setup("mid", "中速寄り", 1.20, 2.90, 1.0, 0.37, "バランス型。標準の設定"),
    "low" to Setup("low", "低速寄り", 1.43, 3.25, 1.055, 0.375, "旋回と立ち上がり重視。最高速は低下"),
)

class Tyre(val id: String, val name: String, val short: String, val color: Int, val mu: Double, val muWet: Double, val wear: Double, val opt: Double, val cold: Double, val hot: Double)
val TYRES = linkedMapOf(
    "soft" to Tyre("soft", "ソフト", "S", 0xffe8323c.toInt(), 1.88, 0.82, 0.066, 88.0, 62.0, 42.0),
    "medium" to Tyre("medium", "ミディアム", "M", 0xfff2c230.toInt(), 1.845, 0.78, 0.037, 92.0, 58.0, 46.0),
    "hard" to Tyre("hard", "ハード", "H", 0xffe8e8e8.toInt(), 1.81, 0.73, 0.022, 96.0, 54.0, 50.0),
    "rain" to Tyre("rain", "レイン", "R", 0xff2f8fe8.toInt(), 1.46, 1.27, 0.05, 62.0, 60.0, 36.0),
)

private val SURF_MU = doubleArrayOf(1.0, 0.93, 0.42, 0.50)
private val SURF_MU_WET = doubleArrayOf(1.0, 0.72, 0.62, 0.9)
private val SURF_DRAG = doubleArrayOf(0.014, 0.02, 0.085, 0.24)
private const val HEAT_K = 0.42
private const val KPEAK = 0.105
private val APEAK_F = tan(0.118); private val APEAK_R = tan(0.105)
private const val SH_C = 1.5; private val SH_B = tan(PI / (2 * SH_C))

fun tyreGripFactor(ty: Tyre, temp: Double, wear: Double): Double {
    val dt = temp - ty.opt
    val w = if (dt < 0) ty.cold else ty.hot
    val ft = 1 - min(0.24, (dt / w) * (dt / w) * 0.15)
    val cliff = if (wear > 0.72) ((wear - 0.72) / 0.28) else 0.0
    val fw = 1 - 0.075 * wear - 0.30 * cliff * cliff
    return ft * fw
}
fun tyreBaseMu(ty: Tyre, wet: Double): Double { val w = sat(wet).pow(0.8); return ty.mu + (ty.muWet - ty.mu) * w }

fun trimSetup(setup: Setup, trim: Aero?): Setup {
    if (trim == null) return setup
    val ref = SETUPS["mid"]!!; val sp = trim.spread
    fun k(v: Double, r: Double) = r * (v / r).pow(sp)
    return setup.copy(cla = k(setup.cla, ref.cla) * trim.cl, cda = k(setup.cda, ref.cda) * trim.cd, final = k(setup.final, ref.final) * trim.final)
}

class Car(var id: Int = 0, setupId: String = "mid", tyreId: String = "medium", trim: Aero? = null, var power: Double = 1.0, var gripK: Double = 1.0) {
    var x = 0.0; var y = 0.0; var yaw = 0.0; var vx = 0.0; var vy = 0.0; var r = 0.0
    var wF = 0.0; var wR = 0.0; var gear = 1; var shiftT = 0.0; var nextGear = 1; var rpm = CAR.idle
    var throttle = 0.0; var brake = 0.0; var steerIn = 0.0; var delta = 0.0
    var fuel = 10.0
    var setup: Setup = trimSetup(SETUPS[setupId]!!, trim)
    var tyre: Tyre = TYRES[tyreId]!!
    var tempF = 75.0; var tempR = 75.0; var wearF = 0.0; var wearR = 0.0
    var dmgF = 0.0; var dmgR = 0.0; var dmgS = 0.0; var pull = 0.0; var retired = false
    var assistTC = false; var assistABS = false; var autoShift = false
    var ratios = DoubleArray(7)
    var fi = 0.0; var i = 0; var s = 0.0; var d = 0.0; var relH = 0.0
    var ax = 0.0; var ay = 0.0; var kF = 0.0; var kR = 0.0; var slipF = 0.0; var slipR = 0.0; var saF = 0.0; var saR = 0.0
    val surf = IntArray(4); var offCount = 0; var limiter = false; var shiftDenied = 0.0
    var draft = 0.0; var hit = 0.0; var hitSide = 0; var speed = 0.0; var mu = 1.7
    var fzF = 3000.0; var fzR = 4000.0; var stopped = false; var lockedF = false
    var inPit = false; var out = false   // レース進行側が設定 (ピットレーン走行中 / リタイアで消えた)
    init { applySetup(this) }
}

fun applySetup(car: Car) { car.ratios = DoubleArray(7) { BASE_RATIOS[it] * car.setup.final } }
fun fitTyres(car: Car, id: String) { car.tyre = TYRES[id]!!; car.tempF = car.tyre.opt - 6; car.tempR = car.tempF; car.wearF = 0.0; car.wearR = 0.0 }
fun placeCar(car: Car, track: Track, s: Double, d: Double, speed: Double = 0.0) {
    val p = track.pos(s, d, Pos())
    car.x = p.x; car.y = p.y; car.yaw = p.h; car.vx = speed; car.vy = 0.0; car.r = 0.0
    car.wF = speed / CAR.rw; car.wR = car.wF; car.delta = 0.0; car.steerIn = 0.0; car.throttle = 0.0; car.brake = 0.0
    car.fi = track.wrapS(s) / track.ds; car.i = track.idx(s); car.s = track.wrapS(s); car.d = d
    car.shiftT = 0.0; car.ax = 0.0; car.ay = 0.0; car.hit = 0.0
    var g = 1
    if (speed > 1) { while (g < 6 && speed / CAR.rw * car.ratios[g] * 60 / TAU > 12200) g++ }
    car.gear = g; car.nextGear = g
    car.rpm = max(CAR.idle, speed / CAR.rw * car.ratios[g] * 60 / TAU)
}
fun totalMass(car: Car) = CAR.dryMass + car.fuel

fun steerLock(car: Car, v: Double): Double {
    val m = totalMass(car)
    val ay = 1.75 * (G + 0.5 * RHO * car.setup.cla * v * v / m)
    val need = CAR.wheelbase * ay / max(v * v, 40.0) + 0.105
    return min(CAR.maxLock, need)
}

fun requestShift(car: Car, dir: Int): Boolean {
    if (car.shiftT > 0) return false
    val ng = car.gear + dir
    if (ng > 6) return false
    if (ng < 1) {
        if (ng == 0 && abs(car.vx) < 2.5) { car.nextGear = 0; car.shiftT = CAR.shiftTime; return true }
        return false
    }
    if (car.gear == 0 && car.vx < -2.5) return false
    if (dir < 0) {
        val rpmNew = car.wR * car.ratios[ng] * 60 / TAU
        if (rpmNew > CAR.revMax) { car.shiftDenied = 0.5; return false }
    }
    car.nextGear = ng; car.shiftT = CAR.shiftTime
    return true
}

private fun autoShiftLogic(car: Car) {
    if (car.shiftT > 0 || car.gear == 0) return
    val rpm = car.wR * car.ratios[car.gear] * 60 / TAU
    if (car.gear < 6 && rpm > 13150 && car.kR < 0.2 && car.throttle > 0.3) requestShift(car, 1)
    else if (car.gear > 1) {
        val rl = car.wR * car.ratios[car.gear - 1] * 60 / TAU
        val th = if (car.throttle > 0.6) 10600.0 else 12300.0
        if (rl < th && rpm < 11200) requestShift(car, -1)
    }
}

class Env(val track: Track, var wet: Double = 0.0, var ambient: Double = 24.0, var noDamage: Boolean = false, var noWear: Boolean = false, var noFuel: Boolean = false)

private val locTmp = Loc()
private fun sgn(v: Double) = if (v > 0) 1.0 else if (v < 0) -1.0 else 0.0

/** 1ステップ進める */
fun stepCar(car: Car, dt: Double, env: Env) {
    val T = env.track; val wet = env.wet
    val S = car.setup; val ty = car.tyre
    val m = CAR.dryMass + car.fuel; val Iz = m * CAR.izK
    val a = CAR.a; val b = CAR.b; val L = CAR.wheelbase; val rw = CAR.rw

    if (car.autoShift) autoShiftLogic(car)
    if (car.shiftDenied > 0) car.shiftDenied -= dt

    val thr = if (car.retired || car.fuel <= 0) 0.0 else sat(car.throttle)
    val brk = sat(car.brake)
    val v = hypot(car.vx, car.vy)
    car.speed = v

    // --- ステアリング ---
    val lock = steerLock(car, abs(car.vx))
    val dTarget = clamp(car.steerIn, -1.0, 1.0) * lock + car.pull * 0.02
    val dRate = 2.4 * dt
    car.delta += clamp(dTarget - car.delta, -dRate, dRate)
    val delta = car.delta; val cd = cos(delta); val sd = sin(delta)

    // --- 路面 (4輪) ---
    val ci = car.i
    val cosr = cos(car.yaw); val sinr = sin(car.yaw)
    val nx = T.nx[ci]; val ny = T.ny[ci]
    val fwdN = cosr * nx + sinr * ny
    val rgtN = -sinr * nx + cosr * ny
    val ht = CAR.halfTrack
    val dFL = car.d + a * fwdN - ht * rgtN; val dFR = car.d + a * fwdN + ht * rgtN
    val dRL = car.d - b * fwdN - ht * rgtN; val dRR = car.d - b * fwdN + ht * rgtN
    val sf = car.surf
    sf[0] = T.surface(ci, dFL); sf[1] = T.surface(ci, dFR); sf[2] = T.surface(ci, dRL); sf[3] = T.surface(ci, dRR)
    val wetK = sat(wet).pow(0.8)
    fun smu(k: Int) = SURF_MU[k] * (1 + (SURF_MU_WET[k] - 1) * wetK)
    val muFL = smu(sf[0]); val muFR = smu(sf[1]); val muRL = smu(sf[2]); val muRR = smu(sf[3])
    val surfF = (muFL + muFR) * 0.5; val surfR = (muRL + muRR) * 0.5
    car.offCount = (if (sf[0] > 1) 1 else 0) + (if (sf[1] > 1) 1 else 0) + (if (sf[2] > 1) 1 else 0) + (if (sf[3] > 1) 1 else 0)

    // --- 空力 ---
    val q = 0.5 * RHO * car.vx * car.vx
    val draft = car.draft
    val dfF = S.cla * S.front * q * (1 - 0.75 * car.dmgF) * (1 - 0.22 * draft)
    val dfR = S.cla * (1 - S.front) * q * (1 - 0.6 * car.dmgR) * (1 - 0.08 * draft)
    val drag = S.cda * q * (1 + 0.3 * car.dmgF + 0.3 * car.dmgR) * (1 - 0.34 * draft) * sgn(car.vx)

    // --- 輪荷重 ---
    val slope = T.slope[ci].toDouble()
    val zdd = (T.slope[(ci + 3) % T.N] - T.slope[(ci - 3 + T.N) % T.N]) / (6 * T.ds)
    val sinB = sin(T.bank[ci].toDouble())
    val gEff = G + clamp(car.vx * car.vx * zdd, -3.0, 3.0) + car.vx * car.vx * T.curv[ci] * sinB
    val trans = m * car.ax * CAR.cgh / L
    val fzF = max(50.0, m * gEff * b / L + dfF - trans)
    val fzR = max(50.0, m * gEff * a / L + dfR + trans)
    car.fzF = fzF; car.fzR = fzR

    // --- タイヤ摩擦係数 ---
    val base = tyreBaseMu(ty, wet) * car.gripK * (1 - 0.25 * car.dmgS)
    fun ls(fz: Double) = 1 - 0.085 * clamp(fz / 3600 - 1, -0.5, 2.2)
    val latLoss = 1 - 0.035 * min(1.0, abs(car.ay) / 25)
    val muF = base * tyreGripFactor(ty, car.tempF, car.wearF) * surfF * ls(fzF) * latLoss
    val muR = base * 1.12 * tyreGripFactor(ty, car.tempR, car.wearR) * surfR * ls(fzR) * latLoss
    car.mu = (muF + muR) * 0.5

    // --- パワートレイン ---
    var gear = car.gear
    var ratio = car.ratios[gear]
    var engaged = true; var Te = 0.0
    if (car.shiftT > 0) {
        car.shiftT -= dt; engaged = false
        if (car.shiftT <= 0) { car.gear = car.nextGear; gear = car.gear; ratio = car.ratios[gear] }
    }
    val wheelRpm = car.wR * ratio * 60 / TAU
    var rpm = wheelRpm
    car.limiter = false
    if (engaged) {
        if (wheelRpm < 3900) {
            engaged = false
            rpm = max(wheelRpm, CAR.idle + thr * 5200)
            Te = if (thr > 0.01) thr * engineTorque(rpm) * car.power * (0.55 + 0.45 * sat(wheelRpm / 3900)) else 0.0
        } else if (wheelRpm > CAR.revLimit) {
            Te = -engineBrake(wheelRpm); car.limiter = true
        } else {
            Te = thr * engineTorque(wheelRpm) * car.power - (1 - thr) * engineBrake(wheelRpm)
        }
    } else {
        rpm = max(CAR.idle, car.rpm + (abs(car.wR * car.ratios[car.nextGear] * 60 / TAU) - car.rpm) * min(1.0, dt * 30))
    }
    rpm = abs(rpm)

    // --- スリップ計算 ---
    val vxf = car.vx; val vyf = car.vy + a * car.r
    val vLongF = vxf * cd + vyf * sd; val vLatF = -vxf * sd + vyf * cd
    val vrefF = max(abs(vLongF), 2.2)
    val kF = (car.wF * rw - vLongF) / vrefF
    val taF = vLatF / vrefF
    val vLongR = car.vx; val vLatR = car.vy - b * car.r
    val vrefR = max(abs(vLongR), 2.2)
    val kR = (car.wR * rw - vLongR) / vrefR
    val taR = vLatR / vrefR

    val roomF = max(0.3, 1 - abs(taF / APEAK_F) * 0.75); val roomR = max(0.3, 1 - abs(taR / APEAK_R) * 0.75)
    if (car.assistTC && Te > 0) { val th = 0.07 * roomR; if (kR > th) Te *= sat(1 - (kR - th) / 0.08) }
    var brkF = brk * CAR.brakeForceMax * CAR.brakeBias * rw
    var brkR = brk * CAR.brakeForceMax * (1 - CAR.brakeBias) * rw
    if (car.assistABS) {
        val tf = 0.085 * roomF; val tr = 0.08 * roomR
        if (kF < -tf) brkF *= sat(1 - (-kF - tf) / 0.06)
        if (kR < -tr) { brkR *= sat(1 - (-kR - tr) / 0.06); if (Te < 0 && engaged) Te *= sat(1 - (-kR - tr) / 0.03) }
    }

    val sxF = kF / KPEAK; val syF = taF / APEAK_F
    val rhoF = hypot(sxF, syF) + 1e-6
    val FF = muF * fzF * sin(SH_C * atan(SH_B * rhoF))
    val FxF = FF * sxF / rhoF; val FyF = -FF * syF / rhoF
    val sxR = kR / KPEAK; val syR = taR / APEAK_R
    val rhoR = hypot(sxR, syR) + 1e-6
    val FR = muR * fzR * sin(SH_C * atan(SH_B * rhoR))
    val FxR = FR * sxR / rhoR; val FyR = -FR * syR / rhoR
    car.kF = kF; car.kR = kR; car.slipF = rhoF; car.slipR = rhoR; car.saF = taF; car.saR = taR

    // --- 車輪の回転 (半陰解法) ---
    val stiffF = muF * fzF * (SH_B * SH_C / KPEAK) / (1 + 2.2 * rhoF * rhoF)
    val stiffR = muR * fzR * (SH_B * SH_C / KPEAK) / (1 + 2.2 * rhoR * rhoR)
    val rollF = SURF_DRAG[sf[0]] + SURF_DRAG[sf[1]]; val rollR = SURF_DRAG[sf[2]] + SURF_DRAG[sf[3]]
    run {
        val I = CAR.iwF; val den = I + dt * rw * rw * stiffF / vrefF
        var w = car.wF + dt * (-FxF * rw) / den
        val db = brkF * dt / den
        if (abs(w) <= db) w = 0.0 else w -= sgn(w) * db
        car.wF = w
        car.lockedF = w == 0.0 && abs(vLongF) > 4
    }
    run {
        val I = CAR.iwR + (if (engaged) CAR.ie * ratio * ratio else 0.0); val den = I + dt * rw * rw * stiffR / vrefR
        val Td = Te * ratio * CAR.eff
        var w = car.wR + dt * (Td - FxR * rw) / den
        val db = brkR * dt / den
        if (abs(w) <= db) w = 0.0 else w -= sgn(w) * db
        car.wR = w
    }
    car.rpm = if (engaged) abs(car.wR * ratio * 60 / TAU) else rpm

    // --- 車体に働く力 ---
    val rollRes = (rollF * fzF + rollR * fzR) * 0.5
    val vsgn = if (abs(car.vx) > 0.3) sgn(car.vx) else car.vx / 0.3
    val hx = T.tx[ci]; val hy = T.ty[ci]
    val gx = -m * G * slope * (cosr * hx + sinr * hy); val gy = -m * G * slope * (-sinr * hx + cosr * hy)
    val bkF = m * G * sinB; val bnx = T.nx[ci]; val bny = T.ny[ci]
    val Fx = FxF * cd - FyF * sd + FxR - drag - rollRes * vsgn + gx + bkF * (cosr * bnx + sinr * bny)
    var Fy = FxF * sd + FyF * cd + FyR + gy + bkF * (-sinr * bnx + cosr * bny)
    if (car.offCount != 0) Fy -= clamp(car.vy, -1.0, 1.0) * rollRes * 0.8
    val splitF = (muFR - muFL) / (muFR + muFL + 1e-6); val splitR = (muRR - muRL) / (muRR + muRL + 1e-6)
    var Mz = a * (FxF * sd + FyF * cd) - b * FyR - ht * (FxF * cd * splitF + FxR * splitR)
    Mz -= (SURF_DRAG[sf[1]] + SURF_DRAG[sf[3]] - SURF_DRAG[sf[0]] - SURF_DRAG[sf[2]]) * (fzF + fzR) * 0.25 * ht * vsgn

    val axB = Fx / m; val ayB = Fy / m
    car.ax += (axB - car.ax) * min(1.0, dt * 18)
    car.ay += (ayB - car.ay) * min(1.0, dt * 18)
    car.vx += (axB + car.r * car.vy) * dt
    car.vy += (ayB - car.r * car.vx) * dt
    car.r += (Mz / Iz) * dt

    car.stopped = false
    if (v < 0.6 && thr < 0.03 && (brk > 0.05 || v < 0.25)) {
        car.vx *= 0.8; car.vy *= 0.5; car.r *= 0.5
        if (v < 0.25) { car.vx = 0.0; car.vy = 0.0; car.r = 0.0; car.wF = 0.0; car.wR = 0.0; car.stopped = true }
    }

    // --- 位置更新 ---
    val c2 = cos(car.yaw); val s2 = sin(car.yaw)
    car.x += (car.vx * c2 - car.vy * s2) * dt
    car.y += (car.vx * s2 + car.vy * c2) * dt
    car.yaw += car.r * dt

    // --- コース座標 / バリア衝突 ---
    T.locate(car.x, car.y, car.fi, locTmp, 7)
    car.fi = locTmp.fi; car.i = locTmp.i; car.s = locTmp.s; car.d = locTmp.d
    car.relH = atan2(sin(car.yaw - T.hdg[car.i]), cos(car.yaw - T.hdg[car.i]))
    car.hit = 0.0
    val HW = 0.95
    val lim = if (car.d > 0) T.wallR[car.i] - HW else T.wallL[car.i] - HW
    if (abs(car.d) > lim) {
        val side = if (car.d > 0) 1 else -1
        val wnx = T.nx[car.i] * side; val wny = T.ny[car.i] * side
        val c3 = cos(car.yaw); val s3 = sin(car.yaw)
        var wvx = car.vx * c3 - car.vy * s3; var wvy = car.vx * s3 + car.vy * c3
        val vn = wvx * wnx + wvy * wny
        val pen = abs(car.d) - lim
        car.x -= wnx * pen; car.y -= wny * pen; car.d -= side * pen
        if (vn > 0) {
            val tyreWall = (if (side > 0) T.tyreR[car.i] else T.tyreL[car.i]).toInt() != 0
            val e = if (tyreWall) 0.08 else 0.22
            wvx -= (1 + e) * vn * wnx; wvy -= (1 + e) * vn * wny
            val fr = 1 - min(0.55, vn * (if (tyreWall) 0.09 else 0.05))
            val tx = -wny.toDouble(); val ty2 = wnx.toDouble(); val vt = (wvx * tx + wvy * ty2) * fr; val vn2 = wvx * wnx + wvy * wny
            wvx = tx * vt + wnx * vn2; wvy = ty2 * vt + wny * vn2
            car.vx = wvx * c3 + wvy * s3; car.vy = -wvx * s3 + wvy * c3
            val nose = c3 * wnx + s3 * wny
            val cross = c3 * wny - s3 * wnx
            car.r = car.r * 0.4 - (if (cross == 0.0) 1.0 else sgn(cross)) * min(2.5, vn * 0.22) * (if (nose >= 0) 1 else -1)
            car.wF = car.vx / rw; car.wR = car.wF
            car.hit = vn; car.hitSide = if (nose > 0.35) 1 else if (nose < -0.35) -1 else 0
            if (vn > 2.2 && !env.noDamage) {
                val dm = (vn - 2.2) / (if (tyreWall) 30 else 21)
                if (car.hitSide > 0) { car.dmgF = min(1.0, car.dmgF + dm); car.dmgS = min(1.0, car.dmgS + dm * 0.35) }
                else if (car.hitSide < 0) { car.dmgR = min(1.0, car.dmgR + dm); car.dmgS = min(1.0, car.dmgS + dm * 0.3) }
                else { car.dmgS = min(1.0, car.dmgS + dm * 0.8); car.dmgF = min(1.0, car.dmgF + dm * 0.3) }
                car.pull = clamp(car.pull + (rand() - 0.5) * dm * 3, -1.0, 1.0) * (if (car.dmgS > 0.05) 1 else 0)
                if (car.dmgF + car.dmgR + car.dmgS * 1.2 >= 1.9 || car.dmgS >= 1) car.retired = true
            }
        }
    }

    // --- タイヤ温度と摩耗 ---
    val amb = env.ambient
    val pF = abs(FxF * (car.wF * rw - vLongF)) + abs(FyF * vLatF)
    val pR = abs(FxR * (car.wR * rw - vLongR)) + abs(FyR * vLatR)
    val cool = (26 + 1.25 * v) * (1 + 1.6 * wetK)
    val CAP = 1500.0
    val hF = min(pF, 150000.0) * HEAT_K + fzF * v * 0.0035; val hR = min(pR, 150000.0) * HEAT_K + fzR * v * 0.0035
    car.tempF += (hF - cool * (car.tempF - amb)) / CAP * dt
    car.tempR += (hR - cool * 1.5 * (car.tempR - amb)) / (CAP * 1.3) * dt
    if (!env.noWear) {
        val wk = ty.wear * (if (ty.id == "rain") (1.6 - 1.25 * wetK) else 1.0) * 1e-6
        fun oh(t: Double) = 1 + max(0.0, t - ty.opt - 12) * 0.035
        car.wearF = min(1.0, car.wearF + wk * min(pF, 60000.0) * oh(car.tempF) * dt * (if (car.lockedF) 1.3 else 1.0))
        car.wearR = min(1.0, car.wearR + wk * 0.75 * min(pR, 60000.0) * oh(car.tempR) * dt)
    }
    if (!env.noFuel && thr > 0 && car.fuel > 0) car.fuel = max(0.0, car.fuel - CAR.fuelRate * thr * sat(rpm / 12800) * dt)
}

// 車同士の衝突 (各車 3 円で近似)。衝撃の強さを返す。
private val CIRC = doubleArrayOf(1.35, 0.0, -1.35); private const val CR = 1.04
fun collideCars(A: Car, B: Car, noDamage: Boolean): Double {
    val dx0 = B.x - A.x; val dy0 = B.y - A.y
    if (dx0 * dx0 + dy0 * dy0 > 36) return 0.0
    val ca = cos(A.yaw); val sa = sin(A.yaw); val cb = cos(B.yaw); val sb = sin(B.yaw)
    var best = 0.0; var bnx = 0.0; var bny = 0.0; var bax = 0.0; var bay = 0.0; var bbx = 0.0; var bby = 0.0
    for (i in 0 until 3) {
        val ax = A.x + ca * CIRC[i]; val ay = A.y + sa * CIRC[i]
        for (j in 0 until 3) {
            val bx = B.x + cb * CIRC[j]; val by = B.y + sb * CIRC[j]
            val dx = bx - ax; val dy = by - ay; val d = hypot(dx, dy); val pen = 2 * CR - d
            if (pen > best) { best = pen; val inv = 1 / (if (d == 0.0) 1.0 else d); bnx = dx * inv; bny = dy * inv; bax = ax; bay = ay; bbx = bx; bby = by }
        }
    }
    if (best <= 0) return 0.0
    A.x -= bnx * best * 0.5; A.y -= bny * best * 0.5; B.x += bnx * best * 0.5; B.y += bny * best * 0.5
    val avx = A.vx * ca - A.vy * sa; val avy = A.vx * sa + A.vy * ca
    val bvx = B.vx * cb - B.vy * sb; val bvy = B.vx * sb + B.vy * cb
    val rax = bax - A.x; val ray = bay - A.y; val rbx = bbx - B.x; val rby = bby - B.y
    val pax = avx - A.r * ray; val pay = avy + A.r * rax; val pbx = bvx - B.r * rby; val pby = bvy + B.r * rbx
    val vn = (pbx - pax) * bnx + (pby - pay) * bny
    if (vn >= 0) return 0.0
    val mA = totalMass(A); val mB = totalMass(B); val iA = mA * CAR.izK; val iB = mB * CAR.izK
    val ra = rax * bny - ray * bnx; val rb = rbx * bny - rby * bnx
    val jn = -(1 + 0.25) * vn / (1 / mA + 1 / mB + ra * ra / iA + rb * rb / iB)
    val ix = bnx * jn; val iy = bny * jn
    val a2x = avx - ix / mA; val a2y = avy - iy / mA; val b2x = bvx + ix / mB; val b2y = bvy + iy / mB
    A.r -= ra * jn / iA * 0.35; B.r += rb * jn / iB * 0.35
    A.vx = a2x * ca + a2y * sa; A.vy = -a2x * sa + a2y * ca
    B.vx = b2x * cb + b2y * sb; B.vy = -b2x * sb + b2y * cb
    val imp = -vn
    if (imp > 4.5 && !noDamage) {
        val dm = (imp - 4.5) / 40
        val fa = (bax - A.x) * ca + (bay - A.y) * sa; val fb = (bbx - B.x) * cb + (bby - B.y) * sb
        fun apply(c: Car, f: Double) {
            if (f > 0.6) c.dmgF = min(1.0, c.dmgF + dm) else if (f < -0.6) c.dmgR = min(1.0, c.dmgR + dm * 0.8) else c.dmgS = min(1.0, c.dmgS + dm * 0.6)
            if (c.dmgF + c.dmgR + c.dmgS * 1.2 >= 1.9 || c.dmgS >= 1) c.retired = true
        }
        apply(A, fa); apply(B, fb)
    }
    return imp
}
