package jp.okracing.core

import kotlin.math.*

// コースモデル (Web 版 src/track.js の移植): 中心線・幅員・縁石・ランオフ・バリア・高低差・立体交差・ピットレーン
// 座標系: x=東, y=南 (画面と同じ y 下向き)。角度は時計回りが正。横位置 d は進行方向右が正。1ユニット = 1m。

const val DS = 2.0 // サンプル間隔の目標[m]

private fun catmull(p0: Double, p1: Double, p2: Double, p3: Double, t: Double): Double {
    val t2 = t * t; val t3 = t2 * t
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
}

fun smoothArr(a: FloatArray, r: Int, passes: Int = 1): FloatArray {
    val n = a.size; var src = a
    for (p in 0 until passes) {
        val out = FloatArray(n)
        var acc = 0.0; val w = 2 * r + 1
        for (k in -r..r) acc += src[(k + n * 8) % n]
        for (i in 0 until n) {
            out[i] = (acc / w).toFloat()
            acc += src[(i + r + 1) % n] - src[(i - r + n * 8) % n]
        }
        src = out
    }
    return src
}

class Cross(val lo: Int, val hi: Int, val sLo: Double, val sHi: Double, val x: Double, val y: Double, val half: Double = 24.0)
class Chunk(val a: Int, val b: Int, val cx: Double, val cy: Double, val r: Double) { var cache: Any? = null; var bridge = false }
class Loc { var fi = 0.0; var i = 0; var s = 0.0; var d = 0.0; var dist2 = 0.0 }
class Pos { var x = 0.0; var y = 0.0; var h = 0.0; var d = 0.0 }

class Pit(val T: Track, def: TrackDef) {
    val sEntry = def.pit.d("sEntry"); val sEntryEnd = def.pit.d("sEntryEnd"); val sExitStart = def.pit.d("sExitStart"); val sExit = def.pit.d("sExit")
    val garage = def.pit.a("garage")!!.map { it.num() }; val apron = def.pit.a("apron")!!.map { it.num() }; val paddock = def.pit.a("paddock")!!.map { it.num() }
    val speedLimit = 80 / 3.6
    val side = def.pit.d("side", 1.0)                  // +1: ピットは進行方向の右 / -1: 左
    val laneOff = 9.5
    var length = 0.0
    val boxOffset = 5.2 * side
    val boxS = ArrayList<Double>()
    fun dAt(s: Double): Double {
        val i = jsRound(s / T.ds) % T.N
        val base = if (side > 0) T.wr[i].toDouble() else T.wl[i].toDouble()
        val lane = base + 1.4 + laneOff
        val onTrack = base - 2.6
        val u = if (inRange(s, sEntry, sEntryEnd)) smoothStep((s - sEntry) / (sEntryEnd - sEntry))
        else if (inRange(s, sExitStart, sExit)) 1 - smoothStep((s - sExitStart) / (sExit - sExitStart))
        else 1.0
        return side * (onTrack + (lane - onTrack) * u)
    }
    fun inZone(s: Double, pad: Double = 50.0) = inRange(s, T.wrapS(sEntry - pad), T.wrapS(sExit + pad))
    fun contains(s: Double) = inRange(s, sEntry, sExit)
    companion object { fun inRange(s: Double, a: Double, b: Double) = if (a <= b) s >= a && s <= b else s >= a || s <= b }
}

class Track(val def: TrackDef) {
    val id = def.id; val name = def.name; val sections = def.sections; val sectorSplits = def.sectorSplits
    val length = def.length
    val N = jsRound(length / DS)
    val ds = length / N
    val x = FloatArray(N); val y = FloatArray(N); val hdg = FloatArray(N); val curv = FloatArray(N)
    val wl = FloatArray(N); val wr = FloatArray(N); val z = FloatArray(N); val slope = FloatArray(N)
    val kerbL = FloatArray(N); val kerbR = FloatArray(N); val wallL = FloatArray(N); val wallR = FloatArray(N)
    val gravL = ByteArray(N); val gravR = ByteArray(N); val tyreL = ByteArray(N); val tyreR = ByteArray(N)
    val nx = FloatArray(N); val ny = FloatArray(N); val tx = FloatArray(N); val ty = FloatArray(N)
    val bank = FloatArray(N); val bumpy = FloatArray(N)
    var turnTotal = 0.0; var zMin = 0.0; var zMax = 0.0
    var cross: Cross? = null
    val gravelStart = 3.2
    lateinit var pit: Pit
    val CH = 12
    val chunks = ArrayList<Chunk>()
    var minX = 0.0; var maxX = 0.0; var minY = 0.0; var maxY = 0.0
    val fuelPerLap = 2.1 * length / 5807

    init { build() }

    private fun build() {
        val raw = def.points; val m = raw.size
        // --- 1) 高密度補間して弧長を測る ---
        val SUB = 10
        val fn = m * SUB
        val fx = DoubleArray(fn); val fy = DoubleArray(fn); val fwr = DoubleArray(fn); val fwl = DoubleArray(fn); val fs = DoubleArray(fn + 1)
        var q = 0
        for (i in 0 until m) {
            val p0 = raw[(i - 1 + m) % m]; val p1 = raw[i]; val p2 = raw[(i + 1) % m]; val p3 = raw[(i + 2) % m]
            for (k in 0 until SUB) {
                val t = k.toDouble() / SUB
                fx[q] = catmull(p0[0], p1[0], p2[0], p3[0], t); fy[q] = catmull(p0[1], p1[1], p2[1], p3[1], t)
                fwr[q] = p1[2] + (p2[2] - p1[2]) * t; fwl[q] = p1[3] + (p2[3] - p1[3]) * t; q++
            }
        }
        for (i in 0 until fn) { val j = (i + 1) % fn; fs[i + 1] = fs[i] + hypot(fx[j] - fx[i], fy[j] - fy[i]) }
        val rawLen = fs[fn]
        val k = length / rawLen
        // --- 2) 等間隔リサンプル ---
        var j = 0
        for (i in 0 until N) {
            val target = (i * ds) / k
            while (fs[j + 1] < target) j++
            val t = (target - fs[j]) / (fs[j + 1] - fs[j])
            val j2 = (j + 1) % fn
            x[i] = ((fx[j] + (fx[j2] - fx[j]) * t) * k).toFloat()
            y[i] = ((fy[j] + (fy[j2] - fy[j]) * t) * k).toFloat()
            wr[i] = (fwr[j] + (fwr[j2] - fwr[j]) * t).toFloat()
            wl[i] = (fwl[j] + (fwl[j2] - fwl[j]) * t).toFloat()
        }
        if (def.smooth) smoothCenter()
        val ox = x[0]; val oy = y[0]
        for (i in 0 until N) { x[i] -= ox; y[i] -= oy }
        run {
            val swr = smoothArr(wr, 6, 2); val swl = smoothArr(wl, 6, 2)
            for (i in 0 until N) {
                val tot = clamp((swr[i] + swl[i]) * def.widthScale, def.widthMin, def.widthMax)
                val ratio = swr[i].toDouble() / (swr[i] + swl[i])
                wr[i] = (tot * ratio).toFloat(); wl[i] = (tot * (1 - ratio)).toFloat()
            }
        }
        // --- 3) 方位・曲率 ---
        var prev = 0.0
        val hd = DoubleArray(N)
        for (i in 0 until N) {
            val a = (i - 1 + N) % N; val b = (i + 1) % N
            var h = atan2((y[b] - y[a]).toDouble(), (x[b] - x[a]).toDouble())
            if (i > 0) { while (h - prev > PI) h -= TAU; while (h - prev < -PI) h += TAU }
            hd[i] = h; prev = h
        }
        val totalTurn = hd[N - 1] - hd[0]
        val wrapTurn = jsRound(totalTurn / TAU) * TAU
        val cv = FloatArray(N)
        for (i in 0 until N) {
            val a = (i - 1 + N) % N; val b = (i + 1) % N
            var d = hd[b] - hd[a]
            if (i == 0) d = hd[1] - (hd[N - 1] - wrapTurn)
            if (i == N - 1) d = (hd[0] + wrapTurn) - hd[N - 2]
            cv[i] = (d / (2 * ds)).toFloat()
        }
        val cvs = smoothArr(cv, 3, 2)
        for (i in 0 until N) {
            hdg[i] = hd[i].toFloat(); curv[i] = cvs[i]
            tx[i] = cos(hd[i]).toFloat(); ty[i] = sin(hd[i]).toFloat()
            nx[i] = -ty[i]; ny[i] = tx[i]
        }
        turnTotal = wrapTurn
        // --- 4) 高低差 ---
        run {
            val K = def.elevKeys; val kn = K.size
            val zr = FloatArray(N)
            for (i in 0 until N) {
                val s = i * ds; var a = kn - 1
                for (qq in 0 until kn) if (K[qq][0] <= s) a = qq
                val p1 = K[a]; val p2 = K[(a + 1) % kn]; val p0 = K[(a - 1 + kn) % kn]; val p3 = K[(a + 2) % kn]
                val s1 = p1[0]; val s2 = p2[0] + (if (a + 1 >= kn) length else 0.0)
                val t = (s - s1) / (s2 - s1)
                zr[i] = catmull(p0[1], p1[1], p2[1], p3[1], t).toFloat()
            }
            val zs = smoothArr(zr, 20, 2)
            var mn = 1e9; var mx = -1e9
            for (i in 0 until N) { mn = min(mn, zs[i].toDouble()); mx = max(mx, zs[i].toDouble()) }
            val sc = if (def.elevRange != null) def.elevRange / (mx - mn) else 1.0
            for (i in 0 until N) z[i] = ((zs[i] - mn) * sc).toFloat()
            for (i in 0 until N) slope[i] = ((z[(i + 1) % N] - z[(i - 1 + N) % N]) / (2 * ds)).toFloat()
            if (def.bankDeg != null) { val b = def.bankDeg * PI / 180; for (i in 0 until N) bank[i] = (b * clamp(curv[i] * def.bankRadius, -1.0, 1.0)).toFloat() }
            zMin = 0.0; zMax = (mx - mn) * sc
        }
        // --- 5) 立体交差の検出 ---
        run {
            var lo = -1; var hi = -1
            outer@ for (a in 0 until N) {
                var b = a + 100
                while (b < N - 100 + a) {
                    if (b < N) { val dx = x[a] - x[b]; val dy = y[a] - y[b]; if (dx * dx + dy * dy < 2.2) { lo = a; hi = b; break@outer } }
                    b++
                }
            }
            if (lo >= 0) {
                var best = 1e9; var ba = 0; var bb = 0
                for (a in lo - 4..lo + 8) for (b in hi - 8..hi + 8) {
                    val aa = mod(a, N); val bbb = mod(b, N)
                    val dx = (x[aa] - x[bbb]).toDouble(); val dy = (y[aa] - y[bbb]).toDouble(); val d2 = dx * dx + dy * dy
                    if (d2 < best) { best = d2; ba = a; bb = b }
                }
                cross = Cross(ba, bb, ba * ds, bb * ds, x[mod(bb, N)].toDouble(), y[mod(bb, N)].toDouble())
            }
        }
        fun idxDist(a: Int, b: Int): Int { val d = abs(a - b); return min(d, N - d) }
        fun nearCross(i: Int): Boolean { val c = cross ?: return false; return idxDist(i, c.lo) * ds < 60 || idxDist(i, c.hi) * ds < 60 }
        // --- 6) 縁石 ---
        for (i in 0 until N) {
            var kin = 0.0; var kout = 0.0
            for (qq in -8..8) { val c = curv[(i + qq + N) % N].toDouble(); if (abs(c) > abs(kin)) kin = c }
            for (qq in -45..14) { val c = curv[(i + qq + N) % N].toDouble(); if (abs(c) > abs(kout)) kout = c }
            val KW = 1.7f
            if (abs(kin) > 1.0 / 380) { if (kin > 0) kerbR[i] = KW else kerbL[i] = KW }
            if (abs(kout) > 1.0 / 230) { if (kout > 0) kerbL[i] = KW else kerbR[i] = KW }
        }
        // --- 7) ランオフとバリア ---
        val CELL = 40.0
        val grid = HashMap<Long, ArrayList<Int>>()
        fun key(cx: Int, cy: Int) = cx.toLong() * 100003L + cy
        for (i in 0 until N) grid.getOrPut(key(floor(x[i] / CELL).toInt(), floor(y[i] / CELL).toInt())) { ArrayList() }.add(i)
        fun clearance(px: Double, py: Double, self: Int, sep: Int): Double {
            var best = 1e9
            val kx = floor(px / CELL).toInt(); val ky = floor(py / CELL).toInt()
            for (gx in kx - 2..kx + 2) for (gy in ky - 2..ky + 2) {
                val a = grid[key(gx, gy)] ?: continue
                for (qq in a) {
                    if (idxDist(qq, self) < sep) continue
                    if (nearCross(qq) && nearCross(self)) continue
                    val d = hypot(x[qq] - px, y[qq] - py) - max(wl[qq], wr[qq])
                    if (d < best) best = d
                }
            }
            return best
        }
        val runL = FloatArray(N); val runR = FloatArray(N)
        for (i in 0 until N) {
            var kc = 0.0
            var qq = -40
            while (qq <= 65) { val c = curv[(i + qq + N) % N].toDouble(); if (abs(c) > abs(kc)) kc = c; qq += 2 }
            val depth = 11 + 40 * sat(abs(kc) * 105 - 0.12)
            var rl = 9.0; var rr = 9.0
            if (kc > 1.0 / 900) rl = depth else if (kc < -1.0 / 900) rr = depth
            for (side in intArrayOf(-1, 1)) {
                val want = if (side < 0) rl else rr; val w = if (side < 0) wl[i] else wr[i]
                var t = 1.5
                while (t < want) {
                    val px = x[i] + nx[i] * side * (w + t); val py = y[i] + ny[i] * side * (w + t)
                    if (clearance(px, py, i, 70) < t + 2.5) break
                    t += 1
                }
                t = min(t, want)
                if (side < 0) rl = t else rr = t
            }
            if (nearCross(i)) { rl = min(rl, 1.6); rr = min(rr, 1.6) }
            if (def.runoffL != null) { rl = min(rl, def.runoffL); rr = min(rr, def.runoffR!!) }
            runL[i] = rl.toFloat(); runR[i] = rr.toFloat()
        }
        pit = Pit(this, def)
        val ps = pit.side
        for (i in 0 until N) {
            val s = i * ds
            val pitRun = if (ps > 0) runR else runL; val standRun = if (ps > 0) runL else runR
            if (Pit.inRange(s, pit.sEntry - 30, pit.sExit + 20)) pitRun[i] = min(pitRun[i], 1.4f)
            if (Pit.inRange(s, def.standWall[0], def.standWall[1])) standRun[i] = min(standRun[i], 6f)
        }
        run {
            val sl = smoothArr(runL, 5, 2); val sr = smoothArr(runR, 5, 2)
            for (i in 0 until N) {
                val rl = max(1.4f, min(sl[i], runL[i] + 3)); val rr = max(1.4f, min(sr[i], runR[i] + 3))
                wallL[i] = wl[i] + rl; wallR[i] = wr[i] + rr
                gravL[i] = if (rl > 17) 1 else 0; gravR[i] = if (rr > 17) 1 else 0
                tyreL[i] = if (rl > 13) 1 else 0; tyreR[i] = if (rr > 13) 1 else 0
            }
        }
        // --- 8) ピットレーン ---
        pit.length = (length - pit.sEntry) + pit.sExit
        for (t in 0 until 10) pit.boxS.add((def.pit.d("boxStart") + t * 21) % length)
        // --- 9) 描画用チャンク境界 ---
        var c = 0
        while (c * CH < N) {
            val a = c * CH; val b = min(N, a + CH)
            var cx = 0.0; var cy = 0.0
            for (i in a until b) { cx += x[i]; cy += y[i] }
            cx /= (b - a); cy /= (b - a)
            var r = 0.0
            for (i in a..b) { val qq = i % N; r = max(r, hypot(x[qq] - cx, y[qq] - cy) + max(wallL[qq], wallR[qq]) + 4) }
            chunks.add(Chunk(a, b, cx, cy, r)); c++
        }
        minX = 1e9; maxX = -1e9; minY = 1e9; maxY = -1e9
        for (i in 0 until N) { minX = min(minX, x[i].toDouble()); maxX = max(maxX, x[i].toDouble()); minY = min(minY, y[i].toDouble()); maxY = max(maxY, y[i].toDouble()) }
        buildBumps()
    }

    private fun smoothCenter() {
        val sx = smoothArr(x, 3, 2); val sy = smoothArr(y, 3, 2)
        val kap = FloatArray(N)
        for (i in 0 until N) {
            val a = (i - 3 + N) % N; val b = (i + 3) % N
            val ax = (sx[i] - sx[a]).toDouble(); val ay = (sy[i] - sy[a]).toDouble(); val bx = (sx[b] - sx[i]).toDouble(); val by = (sy[b] - sy[i]).toDouble()
            kap[i] = abs(2 * (ax * by - ay * bx) / (hypot(ax, ay) * hypot(bx, by) * hypot((sx[b] - sx[a]).toDouble(), (sy[b] - sy[a]).toDouble()) + 1e-9)).toFloat()
        }
        val kS = smoothArr(kap, 6, 2)
        var hw = FloatArray(N)
        for (i in 0 until N) {
            var km = 0.0; for (q in -14..14) km = max(km, kS[(i + q + N) % N].toDouble())
            hw[i] = clamp(0.2 / (km + 1e-4) / 2, 3.0, 10.0).toFloat()
        }
        hw = smoothArr(hw, 8, 2)
        for (pass in 0 until 2) {
            val ox2 = FloatArray(N); val oy2 = FloatArray(N)
            for (i in 0 until N) {
                val h = hw[i].toDouble(); val hi2 = floor(h).toInt(); val fr = h - hi2
                var ax = 0.0; var ay = 0.0; var w = 0.0
                for (q in -hi2 - 1..hi2 + 1) {
                    val ww = if (abs(q) > hi2) fr else 1.0; if (ww <= 0) continue
                    val j = (i + q + N) % N; ax += x[j] * ww; ay += y[j] * ww; w += ww
                }
                ox2[i] = (ax / w).toFloat(); oy2[i] = (ay / w).toFloat()
            }
            ox2.copyInto(x); oy2.copyInto(y)
        }
        run {
            val kx = FloatArray(N)
            for (i in 0 until N) {
                val a = (i - 3 + N) % N; val b = (i + 3) % N
                val ax = (x[i] - x[a]).toDouble(); val ay = (y[i] - y[a]).toDouble(); val bx = (x[b] - x[i]).toDouble(); val by = (y[b] - y[i]).toDouble()
                kx[i] = (2 * (ax * by - ay * bx) / (hypot(ax, ay) * hypot(bx, by) * hypot((x[b] - x[a]).toDouble(), (y[b] - y[a]).toDouble()) + 1e-9)).toFloat()
            }
            val ks = smoothArr(kx, 3, 1)
            val nx2 = FloatArray(N); val ny2 = FloatArray(N)
            for (i in 0 until N) {
                val a = (i - 1 + N) % N; val b = (i + 1) % N; val tx0 = (x[b] - x[a]).toDouble(); val ty0 = (y[b] - y[a]).toDouble(); val l = hypot(tx0, ty0)
                val h = hw[i].toDouble(); val sig2 = (h * (h + 1) / 3 + 4) * ds * ds
                val push = -ks[i] * sig2 * 0.8
                nx2[i] = (x[i] + (-ty0 / l) * push).toFloat(); ny2[i] = (y[i] + (tx0 / l) * push).toFloat()
            }
            smoothArr(nx2, 1, 1).copyInto(x); smoothArr(ny2, 1, 1).copyInto(y)
        }
        var len = 0.0; for (i in 0 until N) { val q = (i + 1) % N; len += hypot((x[q] - x[i]).toDouble(), (y[q] - y[i]).toDouble()) }
        val f = length / len
        for (i in 0 until N) { x[i] = (x[i] * f).toFloat(); y[i] = (y[i] * f).toFloat() }
    }

    // ---------------------------------------------------------------- 問い合わせ
    fun wrapI(i: Int) = mod(i, N)
    fun wrapS(s: Double) = mod(s, length)
    fun idx(s: Double) = wrapI(jsRound(s / ds))

    /** (x,y) を (s,d) に変換。hint は前回の小数インデックス */
    fun locate(px: Double, py: Double, hint: Double, out: Loc, win: Int = 14): Loc {
        var bi = 0; var bd = 1e18
        val h = jsRound(hint)
        for (q in -win..win) {
            val i = wrapI(h + q)
            val dx = px - x[i]; val dy = py - y[i]; val d2 = dx * dx + dy * dy
            if (d2 < bd) { bd = d2; bi = i }
        }
        val dx = px - x[bi]; val dy = py - y[bi]
        val along = dx * tx[bi] + dy * ty[bi]
        val fi = bi + along / ds
        val i2 = wrapI(floor(fi).toInt()); val i3 = wrapI(i2 + 1); val t = fi - floor(fi)
        val cx = x[i2] + (x[i3] - x[i2]) * t; val cy = y[i2] + (y[i3] - y[i2]) * t
        val nnx = nx[i2] + (nx[i3] - nx[i2]) * t; val nny = ny[i2] + (ny[i3] - ny[i2]) * t
        out.fi = mod(fi, N.toDouble())
        out.i = wrapI(jsRound(fi))
        out.s = out.fi * ds
        out.d = (px - cx) * nnx + (py - cy) * nny
        out.dist2 = bd
        return out
    }
    fun locateGlobal(px: Double, py: Double, out: Loc): Loc {
        var bi = 0; var bd = 1e18
        var i = 0
        while (i < N) { val dx = px - x[i]; val dy = py - y[i]; val d2 = dx * dx + dy * dy; if (d2 < bd) { bd = d2; bi = i }; i += 2 }
        return locate(px, py, bi.toDouble(), out, 4)
    }
    /** (s,d) → ワールド座標 */
    fun pos(s: Double, d: Double, out: Pos): Pos {
        val f = wrapS(s) / ds; val i = floor(f).toInt() % N; val i2 = (i + 1) % N; val t = f - floor(f)
        val nnx = nx[i] + (nx[i2] - nx[i]) * t; val nny = ny[i] + (ny[i2] - ny[i]) * t
        out.x = x[i] + (x[i2] - x[i]) * t + nnx * d
        out.y = y[i] + (y[i2] - y[i]) * t + nny * d
        val h1 = hdg[i].toDouble(); var h2 = hdg[i2].toDouble(); if (i2 < i) h2 += turnTotal
        out.h = h1 + (h2 - h1) * t
        return out
    }
    fun lerpArr(arr: FloatArray, fi: Double): Double {
        val i = floor(fi).toInt() % N; val i2 = (i + 1) % N; val t = fi - floor(fi)
        return arr[i] + (arr[i2] - arr[i]) * t
    }
    fun sectionAt(s: Double): Section? { for (c in def.sections) if (s >= c.from && s < c.to) return c; return null }
    /** 路面種別: 0=舗装 1=縁石 2=芝 3=グラベル */
    fun surface(i: Int, d: Double): Int {
        if (d >= 0) {
            val w = wr[i]; if (d <= w) return 0
            val k = kerbR[i]; if (d <= w + k) return 1
            if (gravR[i].toInt() != 0 && d > w + k + gravelStart) return 3
            return 2
        }
        val w = wl[i]; val e = -d
        if (e <= w) return 0
        val k = kerbL[i]; if (e <= w + k) return 1
        if (gravL[i].toInt() != 0 && e > w + k + gravelStart) return 3
        return 2
    }
    /** s の符号付き差 (a - b) を [-L/2, L/2] に */
    fun sDiff(a: Double, b: Double): Double { var d = a - b; if (d > length / 2) d -= length else if (d < -length / 2) d += length; return d }
    private val tmpPos = Pos()
    fun pitPos(s: Double, out: Pos): Pos {
        val d = pit.dAt(wrapS(s))
        pos(s, d, out)
        val e = 1.5
        pos(s + e, pit.dAt(wrapS(s + e)), tmpPos)
        out.h = atan2(tmpPos.y - out.y, tmpPos.x - out.x)
        out.d = d
        return out
    }

    // ---------------------------------------------------------------- バンピーな路面 (見た目と音だけに使う)
    private fun buildBumps() {
        val b = bumpy
        fun add(s0: Double, s1: Double, amp: Double) {
            val len = mod(s1 - s0, length)
            var xx = 0.0
            while (xx <= len) { val i = idx(s0 + xx); val e = min(1.0, min(xx / 12, (len - xx) / 12)); b[i] = max(b[i].toDouble(), amp * e).toFloat(); xx += ds }
        }
        val bumps = def.bumps
        if (bumps != null) for (p in bumps) add(p[0], p[1], p[2])
        else {
            var seed = 0L; for (ch in def.id) seed = (seed * 31 + ch.code) and 0xffffffffL
            fun rnd(): Double { seed = (seed * 1664525 + 1013904223) and 0xffffffffL; return seed / 4294967296.0 }
            fun straight(i: Int) = abs(curv[i]) < 1.0 / 600
            var st = 0; while (st < N && straight(st)) st++
            for (k in 0 until N) {
                val i = (st + k) % N; if (!straight(i) || straight((i - 1 + N) % N)) continue
                var j = i; var n = 0; while (straight(j % N) && n < N) { j++; n++ }
                val L = n * ds; val s0 = i * ds; val s1 = s0 + L
                if (L < 180) continue
                add(s1 - 150 - rnd() * 40, s1 + 5, 0.75 + rnd() * 0.25)
                if (L >= 450 && rnd() < 0.6) { val c = s0 + L * (0.3 + rnd() * 0.3); add(c - 45 - rnd() * 30, c + 45 + rnd() * 30, 0.5 + rnd() * 0.3) }
            }
        }
    }
    fun bumpWave(s: Double): Double {
        val a = max(0.0, sin(s * 0.571)).pow(6) * (0.65 + 0.35 * sin(s * 0.17 + 1.3))
        val c = max(0.0, sin(s * 1.19 + 2.1)).pow(10) * 0.55
        return min(1.0, a + c)
    }
    fun scrape(s: Double, v: Double): Double { val a = bumpy[idx(s)]; if (a <= 0 || v < 38) return 0.0; return a * min(1.0, (v - 38) / 40) * bumpWave(s) }
    fun bumpAt(s: Double, v: Double): Double { val a = bumpy[idx(s)]; return if (a > 0) a * min(1.0, v / 60) else 0.0 }
}
