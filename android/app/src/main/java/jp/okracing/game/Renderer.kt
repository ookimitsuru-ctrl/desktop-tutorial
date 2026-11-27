package jp.okracing.game

import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Path
import jp.okracing.core.*
import kotlin.math.*

// ワールド描画 (Web 版 src/render.js の移植): コース・周辺施設・車両・エフェクト・天候

private fun mulberry(seed: Int): () -> Double {
    var a = seed
    return {
        a += 0x6D2B79F5
        var t = (a xor (a ushr 15)) * (1 or a)
        t = (t + ((t xor (t ushr 7)) * (61 or t))) xor t
        ((t xor (t ushr 14)).toLong() and 0xffffffffL) / 4294967296.0
    }
}
fun mixColor(c1: String, c2: String, t: Double): Int {
    val a = Ctx2D.color(c1); val b = Ctx2D.color(c2)
    return Color.rgb(lerp(Color.red(a).toDouble(), Color.red(b).toDouble(), t).toInt(), lerp(Color.green(a).toDouble(), Color.green(b).toDouble(), t).toInt(), lerp(Color.blue(a).toDouble(), Color.blue(b).toDouble(), t).toInt())
}
private fun rnd() = Math.random()

class Cam { var x = 0.0; var y = 0.0; var ang = 0.0; var scale = 4.0; var init = false; var shake = 0.0; var lx = 0.0; var ly = 0.0; var rot = 0.0; var ax = 0.0; var ay = 0.0; var mode = "up" }
class Skid(var x1: Double, var y1: Double, var x2: Double, var y2: Double, var a: Double)
class Part(val type: Int, var x: Double, var y: Double, var vx: Double, var vy: Double, var life: Double, val max: Double, var size: Double, val grow: Double)
class TrackPaths { val asphalt = Path(); val lineL = Path(); val lineR = Path(); val kerbA = Path(); val kerbB = Path(); val gravel = Path(); val wall = Path(); val tyre = Path(); val tyreW = Path(); val rubber = Path(); val deck = Path(); val patch = Path(); val seam = Path(); var assist: Array<Path>? = null
    fun get(k: String): Path = when (k) { "asphalt" -> asphalt; "lineL" -> lineL; "lineR" -> lineR; "kerbA" -> kerbA; "kerbB" -> kerbB; "gravel" -> gravel; "wall" -> wall; "tyre" -> tyre; "tyreW" -> tyreW; "rubber" -> rubber; "deck" -> deck; "patch" -> patch; else -> seam } }
class Box(val team: Team, val rect: Path, val bar: Path, val door: Path)
class Board(val x: Double, val y: Double, val h: Double, val n: Int)
class Marks { lateinit var pitLane: Path; lateinit var pitLineA: Path; lateinit var pitLineB: Path; lateinit var pitApron: Path; lateinit var pitWall: Path; lateinit var garage: Path; lateinit var garageRoof: Path; lateinit var paddock: Path
    val boxes = ArrayList<Box>(); val checkA = Path(); val checkB = Path(); val grid = Path(); lateinit var gantry: Path; val gantryLights = ArrayList<Pos>(); lateinit var centerRef: Pos; val boards = ArrayList<Board>() }
class Scenery(val type: String, val x: Double, val y: Double, val r: Double) { var body: Path? = null; var rows: List<Path> = emptyList(); var roof: Path? = null; var col = 0; var size = 0.0; var rot = 0.0; var h = 0.0 }
class Tree(val x: Double, val y: Double, val size: Double, val kind: Int)
class Minimap(val bmp: Bitmap, val W: Double, val H: Double, val sc: Double, val pad: Double, val minX: Double, val minY: Double) { fun mx(x: Double) = pad + (x - minX) * sc; fun my(y: Double) = pad + (y - minY) * sc }

class Renderer(var T: Track, var line: RacingLine) {
    var dpr = 1.0; var w = 0.0; var h = 0.0
    val cam = Cam()
    val skids = ArrayList<Skid>(); var skidHead = 0; val SKID_MAX = 1400
    val parts = ArrayList<Part>(); val PART_MAX = 420
    val lastWheel = HashMap<Car, DoubleArray>()
    var time = 0.0
    var assist: ByteArray? = null
    var lineAssistOn = false
    private val paths = HashMap<Chunk, TrackPaths>()
    lateinit var mark: Marks
    val scenery = ArrayList<Scenery>()
    private val treeGrid = HashMap<Long, ArrayList<Tree>>(); private val treeCell = 120.0
    lateinit var minimap: Minimap
    private val treeSpr = ArrayList<Bitmap>(); private val partSpr = ArrayList<Bitmap>()
    private lateinit var grassPattern: Pattern; private lateinit var gravelPattern: Pattern; private lateinit var crowdPattern: Pattern

    init { buildSprites(); buildStatic() }

    fun setTrack(t: Track, l: RacingLine) { T = t; line = l; clearEffects(); assist = null; cam.init = false; buildStatic() }
    fun resize(w: Double, h: Double, dpr: Double) { this.w = w; this.h = h; this.dpr = dpr }

    private fun X(i: Int, d: Double) = T.x[i] + T.nx[i] * d
    private fun Y(i: Int, d: Double) = T.y[i] + T.ny[i] * d
    private fun Path.mv(x: Double, y: Double) = moveTo(x.toFloat(), y.toFloat())
    private fun Path.ln(x: Double, y: Double) = lineTo(x.toFloat(), y.toFloat())

    // ---------------------------------------------------------------- 静的ジオメトリ
    fun buildStatic() {
        val N = T.N; val L = line; val cr = T.cross
        paths.clear()
        for (ch in T.chunks) {
            val a = ch.a; val b = ch.b
            val P = TrackPaths()
            for (q in a..b) { val i = q % N; if (q == a) P.asphalt.mv(X(i, -T.wl[i].toDouble()), Y(i, -T.wl[i].toDouble())) else P.asphalt.ln(X(i, -T.wl[i].toDouble()), Y(i, -T.wl[i].toDouble())) }
            for (q in b downTo a) { val i = q % N; P.asphalt.ln(X(i, T.wr[i].toDouble()), Y(i, T.wr[i].toDouble())) }
            P.asphalt.close()
            for (q in a..b) {
                val i = q % N
                val l = -(T.wl[i] - 0.22); val r = T.wr[i] - 0.22
                if (q == a) { P.lineL.mv(X(i, l), Y(i, l)); P.lineR.mv(X(i, r), Y(i, r)); P.rubber.mv(L.x[i].toDouble(), L.y[i].toDouble()) }
                else { P.lineL.ln(X(i, l), Y(i, l)); P.lineR.ln(X(i, r), Y(i, r)); P.rubber.ln(L.x[i].toDouble(), L.y[i].toDouble()) }
            }
            for (q in a until b) {
                val i = q % N; val j = (q + 1) % N
                fun quad(path: Path, d1i: Double, d2i: Double, d1j: Double, d2j: Double) { path.mv(X(i, d1i), Y(i, d1i)); path.ln(X(j, d1j), Y(j, d1j)); path.ln(X(j, d2j), Y(j, d2j)); path.ln(X(i, d2i), Y(i, d2i)); path.close() }
                if (T.bumpy[i] > 0.05 && T.bumpy[j] > 0.05) {
                    quad(P.patch, -T.wl[i].toDouble(), T.wr[i].toDouble(), -T.wl[j].toDouble(), T.wr[j].toDouble())
                    val si = q * T.ds
                    if (T.bumpWave(si) > 0.55 && T.bumpWave(si) >= T.bumpWave(si - T.ds) && T.bumpWave(si) >= T.bumpWave(si + T.ds)) { P.seam.mv(X(i, -T.wl[i] + 0.4), Y(i, -T.wl[i] + 0.4)); P.seam.ln(X(i, T.wr[i] - 0.4), Y(i, T.wr[i] - 0.4)) }
                }
                val kp = if (q and 1 == 1) P.kerbA else P.kerbB
                if (T.kerbL[i] > 0 && T.kerbL[j] > 0) quad(kp, -T.wl[i].toDouble(), -(T.wl[i] + T.kerbL[i]).toDouble(), -T.wl[j].toDouble(), -(T.wl[j] + T.kerbL[j]).toDouble())
                if (T.kerbR[i] > 0 && T.kerbR[j] > 0) quad(kp, T.wr[i].toDouble(), (T.wr[i] + T.kerbR[i]).toDouble(), T.wr[j].toDouble(), (T.wr[j] + T.kerbR[j]).toDouble())
                val gs = T.gravelStart
                if (T.gravL[i].toInt() != 0 && T.gravL[j].toInt() != 0) quad(P.gravel, -(T.wl[i] + T.kerbL[i] + gs), -(T.wallL[i] - 0.7), -(T.wl[j] + T.kerbL[j] + gs), -(T.wallL[j] - 0.7))
                if (T.gravR[i].toInt() != 0 && T.gravR[j].toInt() != 0) quad(P.gravel, T.wr[i] + T.kerbR[i] + gs, T.wallR[i] - 0.7, T.wr[j] + T.kerbR[j] + gs, T.wallR[j] - 0.7)
                fun seg(path: Path, di: Double, dj: Double) { path.mv(X(i, di), Y(i, di)); path.ln(X(j, dj), Y(j, dj)) }
                seg(if (T.tyreL[i].toInt() != 0) (if (q and 1 == 1) P.tyre else P.tyreW) else P.wall, -T.wallL[i].toDouble(), -T.wallL[j].toDouble())
                seg(if (T.tyreR[i].toInt() != 0) (if (q and 1 == 1) P.tyre else P.tyreW) else P.wall, T.wallR[i].toDouble(), T.wallR[j].toDouble())
                quad(P.deck, -(T.wallL[i] + 0.9), T.wallR[i] + 0.9, -(T.wallL[j] + 0.9), T.wallR[j] + 0.9)
            }
            paths[ch] = P
            val mid = (a + b) / 2.0
            ch.bridge = cr != null && abs(mid - cr.hi) * T.ds < 34
        }
        buildMarkings(); buildScenery(); buildMinimap()
    }

    fun PT(s: Double, d: Double): Pos = T.pos(s, d, Pos())

    fun stripPath(s0: Double, s1: Double, dA: (Double) -> Double, dB: (Double) -> Double, step: Double = 4.0): Path {
        val p = Path()
        var len = s1 - s0; if (len < 0) len += T.length
        val n = max(2, ceil(len / step).toInt())
        val o = Pos()
        for (k in 0..n) { val s = T.wrapS(s0 + len * k / n); T.pos(s, dA(s), o); if (k > 0) p.ln(o.x, o.y) else p.mv(o.x, o.y) }
        for (k in n downTo 0) { val s = T.wrapS(s0 + len * k / n); T.pos(s, dB(s), o); p.ln(o.x, o.y) }
        p.close(); return p
    }
    fun linePath(s0: Double, s1: Double, dA: (Double) -> Double, step: Double = 4.0): Path {
        val p = Path()
        var len = s1 - s0; if (len < 0) len += T.length
        val n = max(2, ceil(len / step).toInt())
        val o = Pos()
        for (k in 0..n) { val s = T.wrapS(s0 + len * k / n); T.pos(s, dA(s), o); if (k > 0) p.ln(o.x, o.y) else p.mv(o.x, o.y) }
        return p
    }

    private fun buildMarkings() {
        val P = T.pit; val M = Marks(); mark = M
        fun wr(s: Double) = T.wr[T.idx(s)].toDouble()
        fun wl(s: Double) = T.wl[T.idx(s)].toDouble()
        val ps = P.side
        fun pw(s: Double) = if (ps > 0) wr(s) else wl(s)
        M.pitLane = stripPath(P.sEntry, P.sExit, { P.dAt(it) - 3.4 }, { P.dAt(it) + 3.4 }, 3.0)
        M.pitLineA = linePath(P.sEntry + 20, P.sExit - 20, { P.dAt(it) - ps * 3.2 }, 3.0)
        M.pitLineB = linePath(P.sEntryEnd, P.sExitStart, { P.dAt(it) + ps * 3.2 }, 3.0)
        M.pitApron = stripPath(P.apron[0], P.apron[1], { ps * (pw(it) + 1.4 + 9.5 + 3.4) }, { ps * (pw(it) + 1.4 + 9.5 + 9.2) }, 6.0)
        M.pitWall = linePath(P.sEntryEnd - 30, P.sExitStart + 12, { ps * (pw(it) + 1.4) }, 4.0)
        M.garage = stripPath(P.garage[0], P.garage[1], { ps * (pw(it) + 20.3) }, { ps * (pw(it) + 36) }, 6.0)
        M.garageRoof = stripPath(P.garage[0], P.garage[1], { ps * (pw(it) + 22.5) }, { ps * (pw(it) + 34.5) }, 6.0)
        M.paddock = stripPath(P.paddock[0], P.paddock[1], { ps * (pw(it) + 36) }, { ps * (pw(it) + 78) }, 8.0)
        for (t in TEAMS.indices) {
            val s = P.boxS[t]; val d = P.dAt(s) + P.boxOffset
            M.boxes.add(Box(TEAMS[t], stripPath(s - 3.2, s + 3.4, { d - 1.7 }, { d + 1.7 }, 2.0), stripPath(s - 3.2, s + 3.4, { d + ps * 1.7 }, { d + ps * 2.5 }, 2.0), stripPath(s - 6, s + 6, { ps * (pw(it) + 20.3) }, { ps * (pw(it) + 22.5) }, 3.0)))
        }
        val o = Pos()
        val w0l = wl(0.0); val w0r = wr(0.0); val nsq = jsRound((w0l + w0r) / 0.7)
        for (r in 0 until 2) for (k in 0 until nsq) {
            val d1 = -w0l + (w0l + w0r) * k / nsq; val d2 = -w0l + (w0l + w0r) * (k + 1) / nsq; val s1 = -0.7 + r * 0.7; val s2 = s1 + 0.7
            val pth = if ((k + r) and 1 == 1) M.checkA else M.checkB
            T.pos(s1, d1, o); pth.mv(o.x, o.y); T.pos(s2, d1, o); pth.ln(o.x, o.y); T.pos(s2, d2, o); pth.ln(o.x, o.y); T.pos(s1, d2, o); pth.ln(o.x, o.y); pth.close()
        }
        for (k in 0 until 20) {
            val s = T.length - 9 - k * 8 + 2.5; val d = (if (k % 2 == 0) 1 else -1) * 3.3
            T.pos(s - 1.2, d - 1.25, o); M.grid.mv(o.x, o.y); T.pos(s, d - 1.25, o); M.grid.ln(o.x, o.y); T.pos(s, d + 1.25, o); M.grid.ln(o.x, o.y); T.pos(s - 1.2, d + 1.25, o); M.grid.ln(o.x, o.y)
        }
        M.gantry = stripPath(7.0, 8.2, { -(w0l + 3) }, { w0r + 2.2 }, 1.0)
        for (k in 0 until 5) M.gantryLights.add(T.pos(7.6, -3.2 + k * 1.6, Pos()))
        M.centerRef = PT(0.0, 0.0)
        for (bd in T.def.boards) for (dist in intArrayOf(150, 100, 50)) {
            val s = T.wrapS(bd[0] - dist); val i = T.idx(s); val d = if (bd[1] < 0) -(T.wl[i] + 2.4) else T.wr[i] + 2.4
            T.pos(s, d.toDouble(), o); M.boards.add(Board(o.x, o.y, o.h, dist))
        }
    }

    private fun buildScenery() {
        val S = scenery; S.clear()
        fun wallL(s: Double) = T.wallL[T.idx(s)].toDouble()
        fun wallR(s: Double) = T.wallR[T.idx(s)].toDouble()
        val o = Pos()
        fun stand(s0: Double, s1: Double, side: Double, gap: Double, depth: Double, col: String) {
            val f1: (Double) -> Double = if (side < 0) { s -> -(wallL(s) + gap) } else { s -> wallR(s) + gap }
            val f2: (Double) -> Double = if (side < 0) { s -> -(wallL(s) + gap + depth) } else { s -> wallR(s) + gap + depth }
            val rows = ArrayList<Path>()
            val nrow = max(3, jsRound(depth / 2.2))
            for (r in 1 until nrow) { val t = r.toDouble() / nrow; rows.add(linePath(s0, s1, { s -> lerp(f1(s), f2(s), t) }, 6.0)) }
            var len = s1 - s0; if (len < 0) len += T.length
            val mid = PT(T.wrapS(s0 + len / 2), (f1(s0) + f2(s0)) / 2)
            S.add(Scenery("stand", mid.x, mid.y, len / 2 + depth + 20).apply { body = stripPath(s0, s1, f1, f2, 6.0); this.rows = rows; roof = stripPath(s0, s1, { s -> lerp(f1(s), f2(s), 0.62) }, f2, 6.0); this.col = Ctx2D.color(col) })
        }
        val def = T.def
        for (st in def.stands) stand(st[0].num(), st[1].num(), st[2].num(), st[3].num(), st[4].num(), st[5] as String)
        val rnd = mulberry(77)
        val park = def.park
        if (park != null) {
            run { val p = PT(park.d("wheel"), -(wallL(park.d("wheel")) + 70)); S.add(Scenery("wheel", p.x, p.y, 60.0)) }
            val cols = arrayOf("#d94b4b", "#e8b33a", "#3d8fd9", "#f0f0f0", "#58b368")
            for (k in 0 until 14) {
                val s = park.d("from") + rnd() * park.d("len"); val d = -(wallL(s) + 40 + rnd() * 80)
                val p = PT(T.wrapS(s), d)
                S.add(Scenery("tent", p.x, p.y, 14.0).apply { size = 5 + rnd() * 7; rot = rnd() * 3; col = Ctx2D.color(cols[k % 5]) })
            }
        }
        var s = 150.0
        while (s < T.length) {
            val i = T.idx(s); val side = if (jsRound(s / 260) and 1 == 1) 1 else -1
            val cr = T.cross
            if (!(cr != null && (abs(i - cr.lo) < 40 || abs(i - cr.hi) < 40)) && !T.pit.inZone(s, 60.0)) {
                val d = if (side < 0) -(T.wallL[i] + 2.2) else T.wallR[i] + 2.2
                T.pos(s, d.toDouble(), o); S.add(Scenery("post", o.x, o.y, 6.0).apply { h = o.h })
            }
            s += 260
        }
        // 樹木
        val sw = def.standWall
        fun inStandWall(s: Double) = if (sw[0] <= sw[1]) s >= sw[0] && s <= sw[1] else s >= sw[0] || s <= sw[1]
        treeGrid.clear()
        fun noise(x: Double, y: Double): Double { val v = sin(x * 12.9898 + y * 78.233) * 43758.5453; return v - floor(v) }
        fun smoothNoise(x: Double, y: Double): Double { val xi = floor(x); val yi = floor(y); val xf = x - xi; val yf = y - yi; val a = noise(xi, yi); val b = noise(xi + 1, yi); val c = noise(xi, yi + 1); val d = noise(xi + 1, yi + 1); val u = xf * xf * (3 - 2 * xf); val v = yf * yf * (3 - 2 * yf); return lerp(lerp(a, b, u), lerp(c, d, u), v) }
        // コースの空間ハッシュ (コース近くに木を置かないため)
        val cell = 40.0; val grid = HashMap<Long, ArrayList<Int>>()
        fun key(cx: Int, cy: Int) = cx.toLong() * 100003L + cy
        for (i in 0 until T.N) grid.getOrPut(key(floor(T.x[i] / cell).toInt(), floor(T.y[i] / cell).toInt())) { ArrayList() }.add(i)
        val r2 = mulberry(4242)
        for (k in 0 until 5200) {
            val x = T.minX - 160 + r2() * (T.maxX - T.minX + 320); val y = T.minY - 160 + r2() * (T.maxY - T.minY + 320)
            val size = 3.2 + r2() * 3.8; val kind = (r2() * 3).toInt()
            if (smoothNoise(x / 140 + 3, y / 140 + 7) < 0.42) continue
            var ok = true
            val kx = floor(x / cell).toInt(); val ky = floor(y / cell).toInt()
            loop@ for (gx in kx - 2..kx + 2) for (gy in ky - 2..ky + 2) {
                val arr = grid[key(gx, gy)] ?: continue
                for (i in arr) {
                    val dx = x - T.x[i]; val dy = y - T.y[i]
                    val dd = dx * T.nx[i] + dy * T.ny[i]; val al = dx * T.tx[i] + dy * T.ty[i]
                    if (abs(al) > 3) continue
                    val lim = if (dd > 0) T.wallR[i] else T.wallL[i]
                    val si = i * T.ds
                    var extra = 5 + size
                    if (T.pit.inZone(si, 60.0) || inStandWall(si)) extra = if (dd * T.pit.side > 0) 90.0 else 48.0
                    if (park != null) { val clr = park.a("clear")!!; if (si > clr[0].num() && si < clr[1].num() && dd < 0) extra = 190.0 }
                    if (abs(dd) < lim + extra) { ok = false; break@loop }
                }
            }
            if (!ok) continue
            for (sc in S) if (sc.type == "stand" && hypot(sc.x - x, sc.y - y) < sc.r * 0.55) { ok = false; break }
            if (!ok) continue
            val t = Tree(x, y, size, kind)
            treeGrid.getOrPut(floor(x / treeCell).toLong() * 100003L + floor(y / treeCell).toLong()) { ArrayList() }.add(t)
        }
    }

    private fun buildSprites() {
        val cols = arrayOf(arrayOf("#1f5a2a", "#2f7a36", "#4a9a48"), arrayOf("#24522a", "#356f33", "#5c9a4a"), arrayOf("#1d4a30", "#2c6a40", "#49905a"))
        for (k in 0 until 3) {
            val c = OffCanvas(64, 64); val g = c.ctx
            g.fillStyle = "rgba(0,0,0,0.28)"; g.beginPath(); g.ellipse(36.0, 37.0, 23.0, 22.0, 0.0, 0.0, TAU); g.fill()
            val r = mulberry(100 + k)
            g.fillStyle = cols[k][0]; g.beginPath(); g.arc(30.0, 30.0, 23.0, 0.0, TAU); g.fill()
            for (q in 0 until 9) { g.fillStyle = cols[k][1 + (q % 2)]; g.beginPath(); g.arc(18 + r() * 22, 16 + r() * 22, 6 + r() * 7, 0.0, TAU); g.fill() }
            treeSpr.add(c.bmp)
        }
        fun soft(r: Int, gc: Int, b: Int, a0: Double): Bitmap {
            val c = OffCanvas(32, 32); val g = c.ctx
            val gr = g.createRadialGradient(16.0, 16.0, 0.0, 16.0, 16.0, 16.0); gr.addColorStop(0.0, "rgba($r,$gc,$b,$a0)"); gr.addColorStop(1.0, "rgba($r,$gc,$b,0)")
            g.fillStyle = gr; g.fillRect(0.0, 0.0, 32.0, 32.0); return c.bmp
        }
        partSpr.addAll(listOf(soft(235, 235, 235, 0.55), soft(196, 170, 120, 0.6), soft(80, 150, 70, 0.75), soft(215, 230, 245, 0.42), soft(255, 220, 110, 1.0)))
        val pc = OffCanvas(128, 128); val pg = pc.ctx
        pg.fillStyle = "#3f8a3c"; pg.fillRect(0.0, 0.0, 128.0, 128.0)
        val r = mulberry(9)
        for (i in 0 until 16) { pg.fillStyle = if (i % 2 == 1) "rgba(255,255,255,0.045)" else "rgba(0,0,0,0.05)"; pg.fillRect(0.0, i * 8.0, 128.0, 8.0) }
        for (i in 0 until 900) { pg.fillStyle = if (r() < 0.5) "rgba(20,60,20,0.16)" else "rgba(170,220,120,0.12)"; pg.fillRect(floor(r() * 128), floor(r() * 128), 1 + floor(r() * 2), 1 + floor(r() * 2)) }
        grassPattern = Pattern(pc.bmp).apply { setScale(0.5f) }
        val gcv = OffCanvas(64, 64); val gg = gcv.ctx
        gg.fillStyle = "#c9b48a"; gg.fillRect(0.0, 0.0, 64.0, 64.0)
        val gcol = arrayOf("rgba(120,100,70,0.35)", "rgba(240,225,190,0.4)", "rgba(160,140,100,0.3)")
        for (i in 0 until 700) { gg.fillStyle = gcol[i % 3]; gg.fillRect(floor(r() * 64), floor(r() * 64), 1.0, 1.0) }
        gravelPattern = Pattern(gcv.bmp).apply { setScale(0.22f) }
        val cc = OffCanvas(64, 64); val cg = cc.ctx
        val ccols = arrayOf("#e5484d", "#f2c230", "#3d8fd9", "#f4f4f4", "#58b368", "#f08a24", "#222831", "#d9d9d9")
        for (i in 0 until 520) { cg.fillStyle = ccols[(r() * ccols.size).toInt()]; cg.globalAlpha = 0.55 + r() * 0.4; cg.fillRect((r() * 32) * 2, (r() * 32) * 2, 2.0, 2.0) }
        crowdPattern = Pattern(cc.bmp).apply { setScale(0.3f) }
    }

    private fun buildMinimap() {
        val W = 300.0; val pad = 12.0
        val sc = (W - pad * 2) / (T.maxX - T.minX); val H = ceil((T.maxY - T.minY) * sc + pad * 2)
        val c = OffCanvas(W.toInt(), H.toInt()); val g = c.ctx
        fun mx(x: Double) = pad + (x - T.minX) * sc
        fun my(y: Double) = pad + (y - T.minY) * sc
        fun stroke(col: String, lw: Double, a: Int, b: Int) { g.strokeStyle = col; g.lineWidth = lw; g.lineJoin = "round"; g.lineCap = "round"; g.beginPath(); var q = a; while (q <= b) { val i = mod(q, T.N); if (q == a) g.moveTo(mx(T.x[i].toDouble()), my(T.y[i].toDouble())) else g.lineTo(mx(T.x[i].toDouble()), my(T.y[i].toDouble())); q += 2 }; g.stroke() }
        stroke("rgba(0,0,0,0.75)", 7.0, 0, T.N)
        stroke("#f2f2f2", 3.6, 0, T.N)
        T.cross?.let { stroke("rgba(0,0,0,0.75)", 7.0, it.hi - 14, it.hi + 14); stroke("#f2f2f2", 3.6, it.hi - 16, it.hi + 16) }
        g.strokeStyle = "#ff5a2a"; g.lineWidth = 2.5; g.beginPath()
        g.moveTo(mx(T.x[0] - T.nx[0] * 22.0), my(T.y[0] - T.ny[0] * 22.0)); g.lineTo(mx(T.x[0] + T.nx[0] * 22.0), my(T.y[0] + T.ny[0] * 22.0)); g.stroke()
        minimap = Minimap(c.bmp, W, H, sc, pad, T.minX, T.minY)
    }

    /** 走行ライン表示 (ブレーキング区間を色分け) */
    fun setAssist(profile: FloatArray?) {
        val N = T.N; val L = line
        if (profile == null) { assist = null; return }
        val cat = ByteArray(N)
        for (i in 0 until N) {
            val j = (i + 3) % N
            val acc = (profile[j] * profile[j] - profile[i] * profile[i]) / (2 * 3 * T.ds)
            cat[i] = if (acc < -5) 2 else if (acc < 1.2 && profile[i] < 78) 1 else 0
        }
        for (pass in 0 until 2) for (i in 0 until N) { val a = cat[(i - 2 + N) % N]; val b = cat[(i + 2) % N]; if (a == b && cat[i] != a) cat[i] = a }
        for (ch in T.chunks) {
            val P = arrayOf(Path(), Path(), Path())
            for (q in ch.a until ch.b) { val i = q % N; val j = (q + 1) % N; val p = P[cat[i].toInt()]; p.mv(L.x[i].toDouble(), L.y[i].toDouble()); p.ln(L.x[j].toDouble(), L.y[j].toDouble()) }
            paths[ch]?.assist = P
        }
        assist = cat
    }

    // ---------------------------------------------------------------- エフェクト
    fun addSkid(x1: Double, y1: Double, x2: Double, y2: Double, a: Double) {
        if (skids.size < SKID_MAX) skids.add(Skid(x1, y1, x2, y2, a))
        else { val o = skids[skidHead]; o.x1 = x1; o.y1 = y1; o.x2 = x2; o.y2 = y2; o.a = a; skidHead = (skidHead + 1) % SKID_MAX }
    }
    fun addPart(type: Int, x: Double, y: Double, vx: Double, vy: Double, life: Double, size: Double, grow: Double) {
        if (parts.size >= PART_MAX) parts.removeAt(0)
        parts.add(Part(type, x, y, vx, vy, life, life, size, grow))
    }
    fun clearEffects() { skids.clear(); skidHead = 0; parts.clear(); lastWheel.clear() }

    fun updateEffects(session: Session, dt: Double) {
        val wet = session.wet
        val R2 = (hypot(w, h) / cam.scale * 0.6 + 30).pow(2)
        for (e in session.entries) {
            if (e.out) continue
            val c = e.car
            val dx = c.x - cam.x; val dy = c.y - cam.y
            if (dx * dx + dy * dy > R2) { lastWheel.remove(c); continue }
            val cs = cos(c.yaw); val sn = sin(c.yaw)
            val lw = lastWheel.getOrPut(c) { DoubleArray(9) }
            val v = c.speed
            val spinR = c.kR > 0.22 && v > 2; val slideR = abs(c.saR) > 0.2 && v > 9; val lockF = c.lockedF; val slideF = abs(c.saF) > 0.3 && v > 9
            val lockR = c.kR < -0.3 && v > 6
            for (k in 0 until 4) {
                val wh = CarSprite.WHEELS[k]
                val wx = c.x + cs * wh[0] - sn * wh[1]; val wy = c.y + sn * wh[0] + cs * wh[1]
                val rear = k >= 2; val surf = c.surf[k]
                val markOn = surf == 0 && e.pit == null && (if (rear) (spinR || slideR || lockR) else (lockF || slideF))
                if (markOn && lw[8] != 0.0) {
                    val px = lw[k * 2]; val py = lw[k * 2 + 1]
                    if ((px - wx) * (px - wx) + (py - wy) * (py - wy) < 16) addSkid(px, py, wx, wy, if (wet > 0.4) 0.12 else (if (rear && spinR) 0.5 else 0.36))
                }
                lw[k * 2] = wx; lw[k * 2 + 1] = wy
                if (e.pit != null) continue
                if (markOn && wet < 0.5 && rnd() < 0.5) addPart(0, wx, wy, (rnd() - 0.5) * 2, (rnd() - 0.5) * 2, 0.7 + rnd() * 0.5, 1.2, 3.2)
                if (surf >= 2 && v > 4 && rnd() < (if (surf == 3) 0.8 else 0.35)) {
                    val bx = -cs * v * 0.25; val by = -sn * v * 0.25
                    addPart(if (surf == 3) 1 else 2, wx, wy, bx + (rnd() - 0.5) * 4, by + (rnd() - 0.5) * 4, if (surf == 3) 0.9 else 0.5, if (surf == 3) 1.6 else 0.7, if (surf == 3) 3.5 else 1.2)
                }
                if (rear && wet > 0.15 && v > 14 && rnd() < wet * sat(v / 50) * 0.9)
                    addPart(3, wx - cs * 0.6, wy - sn * 0.6, -cs * v * 0.12 + (rnd() - 0.5) * 3, -sn * v * 0.12 + (rnd() - 0.5) * 3, 0.6 + wet * 0.5, 1.4 + v * 0.02, 4 + v * 0.06)
            }
            lw[8] = 1.0
            if (c.vx > 66 && e.pit == null && rnd() < 0.10 + 0.25 * sat((c.fuel - 40) / 100)) {
                val bx = c.x - cs * 1.4; val by = c.y - sn * 1.4
                for (q in 0 until 2) addPart(4, bx + (rnd() - 0.5) * 0.6, by + (rnd() - 0.5) * 0.6, -cs * c.vx * 0.15 + (rnd() - 0.5) * 5, -sn * c.vx * 0.15 + (rnd() - 0.5) * 5, 0.25 + rnd() * 0.2, 0.28, -0.3)
            }
            // バンピーな路面で底が擦れて出る火花
            if (e.pit == null) {
                val onRoad = c.surf[0] == 0 && c.surf[1] == 0 && c.surf[2] == 0 && c.surf[3] == 0
                val sc = if (onRoad) T.scrape(c.s, c.vx) * (1 + 0.3 * sat((c.fuel - 40) / 100)) else 0.0
                if (sc > 0.12) {
                    val n = min(10, floor(sc * 10 + rnd() * 2).toInt())
                    val vwx = cs * c.vx - sn * c.vy; val vwy = sn * c.vx + cs * c.vy
                    for (q in 0 until n) {
                        val along = -0.2 - rnd() * 1.6; val side = (rnd() - 0.5) * 0.7
                        val px = c.x + cs * along - sn * side; val py = c.y + sn * along + cs * side
                        val kk = 0.35 + rnd() * 0.35; val spread = 5 + sc * 6
                        addPart(4, px, py, vwx * kk + (rnd() - 0.5) * spread, vwy * kk + (rnd() - 0.5) * spread, 0.22 + rnd() * 0.35 * (0.5 + sc), 0.25 + sc * 0.3, -0.25)
                    }
                }
                if (e.isPlayer) { val vib = T.bumpAt(c.s, c.speed); if (vib > 0) cam.shake = max(cam.shake, 0.05 + vib * 0.12 + sc * 0.2) }
            }
            if (c.hit > 3) {
                for (q in 0 until min(14.0, c.hit * 0.8).toInt()) addPart(if (rnd() < 0.3) 4 else 1, c.x, c.y, (rnd() - 0.5) * 14, (rnd() - 0.5) * 14, 0.5 + rnd() * 0.5, 0.8, 2.5)
                if (e.isPlayer) cam.shake = min(1.2, c.hit * 0.08)
            }
        }
        var i = parts.size - 1
        while (i >= 0) {
            val p = parts[i]; p.life -= dt
            if (p.life <= 0) { parts[i] = parts[parts.size - 1]; parts.removeAt(parts.size - 1); i--; continue }
            p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - dt * 2.2; p.vy *= 1 - dt * 2.2; p.size += p.grow * dt
            i--
        }
    }

    // ---------------------------------------------------------------- カメラ
    fun updateCamera(tx: Double, ty: Double, tyaw: Double, tspeed: Double, mode: String, zoom: String, dt: Double, snap: Boolean = false) {
        val v = tspeed
        val zf = if (zoom == "near") 0.78 else if (zoom == "far") 1.3 else 1.0
        val t = sat((v - 6) / 84); val tt = (t * t * (3 - 2 * t)).pow(1.3)
        val scale: Double; val ax: Double; val ay: Double; val targetAng: Double?
        if (mode == "right") { scale = w / (lerp(70.0, 330.0, tt) * zf); ax = w * 0.3; ay = h * 0.47; targetAng = tyaw }
        else if (mode == "north") { scale = h / (lerp(95.0, 290.0, tt) * zf); ax = w * 0.5; ay = h * 0.47; targetAng = null }
        else { scale = h / (lerp(32.0, 176.0, tt) * zf); ax = w * 0.5; ay = h * 0.68; targetAng = tyaw }
        if (!cam.init || snap) {
            cam.x = tx; cam.y = ty; cam.scale = scale; cam.ang = targetAng ?: 0.0; cam.init = true; cam.lx = 0.0; cam.ly = 0.0
        } else {
            cam.scale += (scale - cam.scale) * min(1.0, dt * 1.8)
            if (targetAng != null) {
                val d = atan2(sin(targetAng - cam.ang), cos(targetAng - cam.ang))
                cam.ang += clamp(d * min(1.0, dt * 6.5), -dt * 3.2, dt * 3.2)
            }
            cam.x = tx; cam.y = ty
        }
        if (mode == "north") {
            val lx = cos(tyaw) * min(v, 70.0) * 0.9; val ly = sin(tyaw) * min(v, 70.0) * 0.9
            cam.lx += (lx - cam.lx) * min(1.0, dt * 1.5); cam.ly += (ly - cam.ly) * min(1.0, dt * 1.5)
        } else { cam.lx = 0.0; cam.ly = 0.0 }
        cam.rot = if (mode == "right") -cam.ang else if (mode == "north") 0.0 else -cam.ang - PI / 2
        cam.ax = ax; cam.ay = ay
        cam.shake = max(0.0, cam.shake - dt * 3)
        cam.mode = mode
    }
    fun applyWorld(ctx: Ctx2D) {
        val k = cam.scale * dpr
        val c = cos(cam.rot) * k; val s = sin(cam.rot) * k
        val sx = if (cam.shake > 0) (rnd() - 0.5) * cam.shake * 8 else 0.0; val sy = if (cam.shake > 0) (rnd() - 0.5) * cam.shake * 8 else 0.0
        val cx = cam.x + cam.lx; val cy = cam.y + cam.ly
        ctx.setTransform(c, s, -s, c, (cam.ax + sx) * dpr - (c * cx - s * cy), (cam.ay + sy) * dpr - (s * cx + c * cy))
    }

    // ---------------------------------------------------------------- 描画
    class Cfg(val quality: String = "high", val lineAssist: Boolean = false, val ghost: Boolean = true)

    fun render(ctx: Ctx2D, session: Session, cfg: Cfg, dt: Double) {
        time += dt; lineAssistOn = cfg.lineAssist
        val wet = session.wet; val rain = session.rain
        val vr = hypot(max(cam.ax, w - cam.ax), max(cam.ay, h - cam.ay)) / cam.scale + 6
        val vx = cam.x + cam.lx; val vy = cam.y + cam.ly
        ctx.resetState()
        ctx.setTransform(1.0, 0.0, 0.0, 1.0, 0.0, 0.0)
        ctx.fillStyle = mixColor("#3f8a3c", "#2f6a3a", wet * 0.7)
        ctx.fillRect(0.0, 0.0, w * dpr + 2, h * dpr + 2)
        applyWorld(ctx)
        if (cfg.quality != "low") {
            ctx.fillStyle = grassPattern; ctx.fillRect(vx - vr, vy - vr, vr * 2, vr * 2)
            if (wet > 0.03) { ctx.fillStyle = Ctx2D.rgba(30, 60, 50, wet * 0.3); ctx.fillRect(vx - vr, vy - vr, vr * 2, vr * 2) }
        }
        val vis = ArrayList<TrackPaths>(); val visBridge = ArrayList<Boolean>()
        for (ch in T.chunks) { val dx = ch.cx - vx; val dy = ch.cy - vy; val rr = vr + ch.r; if (dx * dx + dy * dy < rr * rr) { vis.add(paths[ch]!!); visBridge.add(ch.bridge) } }
        fun merge(key: String, bridge: Boolean): Path { val p = Path(); for (k in vis.indices) if (visBridge[k] == bridge) p.addPath(vis[k].get(key)); return p }
        val nearPit = hypot(vx - mark.centerRef.x, vy - mark.centerRef.y) < 760 + vr
        val asphaltCol = mixColor("#43464c", "#26292f", wet)
        val lw = 1 / cam.scale
        if (nearPit) drawPitGround(ctx, wet)
        fun drawTrackLayer(bridge: Boolean) {
            if (!bridge) {
                ctx.fillStyle = if (cfg.quality == "low") Ctx2D.color("#c9b48a") else gravelPattern; ctx.fill(merge("gravel", false))
                if (wet > 0.05) { ctx.fillStyle = Ctx2D.rgba(70, 60, 45, wet * 0.3); ctx.fill(merge("gravel", false)) }
            } else {
                ctx.save(); ctx.translate(2.2, 3.2); ctx.fillStyle = "rgba(0,0,0,0.32)"; ctx.fill(merge("deck", true)); ctx.restore()
                ctx.fillStyle = "#8a8f96"; ctx.fill(merge("deck", true))
            }
            ctx.fillStyle = asphaltCol; ctx.fill(merge("asphalt", bridge))
            ctx.fillStyle = Ctx2D.rgba(20, 20, 24, 0.16 * (1 - wet * 0.5)); ctx.fill(merge("patch", bridge))
            ctx.strokeStyle = "rgba(150,150,155,0.22)"; ctx.lineWidth = max(0.18, lw * 1.2); ctx.stroke(merge("seam", bridge))
            ctx.lineCap = "round"; ctx.lineJoin = "round"
            ctx.strokeStyle = Ctx2D.rgba(0, 0, 0, 0.10 * (1 - wet * 0.7)); ctx.lineWidth = 3.4; ctx.stroke(merge("rubber", bridge))
            ctx.lineWidth = 1.6; ctx.stroke(merge("rubber", bridge))
            ctx.fillStyle = "#d8382c"; ctx.fill(merge("kerbA", bridge))
            ctx.fillStyle = "#f1f1ee"; ctx.fill(merge("kerbB", bridge))
            ctx.strokeStyle = "rgba(245,245,240,0.92)"; ctx.lineWidth = max(0.2, lw * 1.1)
            ctx.stroke(merge("lineL", bridge)); ctx.stroke(merge("lineR", bridge))
            if (assist != null && cfg.lineAssist) {
                val pa = arrayOf(Path(), Path(), Path())
                for (k in vis.indices) if (visBridge[k] == bridge) vis[k].assist?.let { a -> pa[0].addPath(a[0]); pa[1].addPath(a[1]); pa[2].addPath(a[2]) }
                ctx.lineWidth = max(0.45, lw * 2.2)
                ctx.strokeStyle = "rgba(90,230,150,0.42)"; ctx.stroke(pa[0])
                ctx.strokeStyle = "rgba(255,214,60,0.62)"; ctx.stroke(pa[1])
                ctx.strokeStyle = "rgba(255,70,60,0.8)"; ctx.stroke(pa[2])
            }
            ctx.lineCap = "butt"
            ctx.strokeStyle = "#1b1d20"; ctx.lineWidth = 1.5; ctx.stroke(merge("tyre", bridge))
            ctx.strokeStyle = "#e4e4e4"; ctx.stroke(merge("tyreW", bridge))
            ctx.strokeStyle = if (bridge) "#d9dde2" else "#b9bec6"; ctx.lineWidth = max(0.55, lw * 1.6); ctx.stroke(merge("wall", bridge))
        }
        drawTrackLayer(false)
        if (nearPit) drawPitMarkings(ctx, session, lw)
        drawBoards(ctx, vx, vy, vr)
        drawSkids(ctx, vx, vy, vr)
        drawScenery(ctx, vx, vy, vr, cfg)
        val cr = T.cross
        fun onBridge(s: Double) = cr != null && abs(T.sDiff(s, cr.sHi)) < 44
        val pl = session.player
        fun drawCars(upper: Boolean) {
            for (e in session.entries) {
                if (e.out || e === pl) continue
                val c = e.car; if (onBridge(c.s) != upper) continue
                val dx = c.x - vx; val dy = c.y - vy; if (dx * dx + dy * dy > (vr + 5) * (vr + 5)) continue
                drawOneCar(ctx, e)
            }
            val gp = session.ghostPose
            if (gp != null && cfg.ghost && onBridge(pl.car.s) == upper) CarSprite.drawCar(ctx, gp.x, gp.y, gp.h, 0.0, 0.0, 0.0, pl.team, ghost = true)
            if (!pl.out && onBridge(pl.car.s) == upper) drawOneCar(ctx, pl)
        }
        drawCars(false)
        drawParts(ctx, false)
        if (visBridge.any { it }) {
            val under = cr != null && abs(T.sDiff(pl.car.s, cr.sLo)) < 26
            if (under) ctx.globalAlpha = 0.5
            drawTrackLayer(true)
            ctx.globalAlpha = 1.0
            drawCars(true)
        }
        drawParts(ctx, true)
        ctx.setTransform(dpr, 0.0, 0.0, dpr, 0.0, 0.0)
        if (wet > 0.02 || rain > 0.02) { ctx.fillStyle = Ctx2D.rgba(40, 55, 75, 0.10 * wet + 0.10 * rain); ctx.fillRect(0.0, 0.0, w, h) }
        if (rain > 0.03 && cfg.quality != "low") {
            ctx.strokeStyle = "rgba(210,225,245,0.34)"; ctx.lineWidth = 1.0; ctx.beginPath()
            val n = jsRound(rain * 150)
            val slant = -5 - pl.car.speed * 0.05
            for (i in 0 until n) { val x = rnd() * (w + 60) - 20; val y = rnd() * h; val len = 12 + rnd() * 18; ctx.moveTo(x, y); ctx.lineTo(x + slant * len / 20, y + len) }
            ctx.stroke()
        }
    }

    private fun drawOneCar(ctx: Ctx2D, e: Entry) { val c = e.car; CarSprite.drawCar(ctx, c.x, c.y, c.yaw, c.delta, c.dmgF, c.dmgR, e.team, number = e.d.no, tyreColor = c.tyre.color) }

    private fun drawPitGround(ctx: Ctx2D, wet: Double) {
        val M = mark
        ctx.fillStyle = mixColor("#5a5d63", "#3a3d43", wet); ctx.fill(M.paddock)
        ctx.fillStyle = mixColor("#4b4e54", "#2d3036", wet); ctx.fill(M.pitLane); ctx.fill(M.pitApron)
    }
    private fun drawPitMarkings(ctx: Ctx2D, session: Session, lw: Double) {
        val M = mark
        ctx.strokeStyle = "rgba(245,245,240,0.85)"; ctx.lineWidth = max(0.18, lw); ctx.stroke(M.pitLineA)
        ctx.strokeStyle = "rgba(250,210,60,0.9)"; ctx.stroke(M.pitLineB)
        for (b in M.boxes) { ctx.strokeStyle = "rgba(255,255,255,0.8)"; ctx.lineWidth = max(0.14, lw); ctx.stroke(b.rect); ctx.fillStyle = b.team.c1; ctx.fill(b.bar) }
        ctx.fillStyle = "#d5d8dc"; ctx.fill(M.garage)
        ctx.fillStyle = "#8f959d"; ctx.fill(M.garageRoof)
        for (b in M.boxes) { ctx.fillStyle = b.team.c1; ctx.fill(b.door) }
        ctx.strokeStyle = "#eceff2"; ctx.lineWidth = 0.9; ctx.lineCap = "butt"; ctx.stroke(M.pitWall)
        ctx.strokeStyle = "#2b5fb8"; ctx.lineWidth = 0.28; ctx.stroke(M.pitWall)
        ctx.fillStyle = "#f4f4f4"; ctx.fill(M.checkA); ctx.fillStyle = "#111"; ctx.fill(M.checkB)
        ctx.strokeStyle = "rgba(245,245,240,0.9)"; ctx.lineWidth = max(0.2, lw); ctx.lineJoin = "miter"; ctx.stroke(M.grid)
        ctx.fillStyle = "#1a1c1f"; ctx.fill(M.gantry)
        val on = if (session.state == "lights") session.lights else 0
        M.gantryLights.forEachIndexed { k, p -> ctx.fillStyle = if (k < on) "#ff2a1a" else if (session.lightsOut && session.stateT < 2.5) "#2bff6a" else "#3a0d0a"; ctx.beginPath(); ctx.arc(p.x, p.y, 0.55, 0.0, TAU); ctx.fill() }
    }
    private fun drawBoards(ctx: Ctx2D, vx: Double, vy: Double, vr: Double) {
        for (b in mark.boards) {
            val dx = b.x - vx; val dy = b.y - vy; if (dx * dx + dy * dy > vr * vr) continue
            ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.h + PI / 2)
            ctx.fillStyle = "#f5f5f5"; ctx.fillRect(-1.5, -0.9, 3.0, 1.8)
            ctx.fillStyle = "#111"; ctx.font = "bold 1.5px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(b.n.toString(), 0.0, 0.08)
            ctx.restore()
        }
    }
    private fun drawSkids(ctx: Ctx2D, vx: Double, vy: Double, vr: Double) {
        if (skids.isEmpty()) return
        val p1 = Path(); val p2 = Path(); val r2 = vr * vr
        for (k in skids) { val dx = k.x1 - vx; val dy = k.y1 - vy; if (dx * dx + dy * dy > r2) continue; val p = if (k.a > 0.4) p2 else p1; p.mv(k.x1, k.y1); p.ln(k.x2, k.y2) }
        ctx.lineCap = "round"; ctx.lineWidth = 0.34
        ctx.strokeStyle = "rgba(12,12,14,0.3)"; ctx.stroke(p1)
        ctx.strokeStyle = "rgba(12,12,14,0.5)"; ctx.stroke(p2)
    }
    private fun drawParts(ctx: Ctx2D, upper: Boolean) {
        if (parts.isEmpty() || upper) return   // 立体交差の上段に乗るパーティクルは無い (Web 版も同じ)
        val px = 1 / cam.scale
        val streak = arrayOf(Path(), Path())
        for (p in parts) {
            val a = p.life / p.max; ctx.globalAlpha = if (p.type == 4) min(1.0, a * 2) else a
            val sz = if (p.type == 4) max(p.size, px * 2.2) else max(0.1, p.size)
            ctx.drawImage(partSpr[p.type], p.x - sz, p.y - sz, sz * 2, sz * 2)
            if (p.type == 4) { val tl = min(0.045, 0.02 + a * 0.03); val q = streak[if (a > 0.5) 1 else 0]; q.mv(p.x, p.y); q.ln(p.x - p.vx * tl, p.y - p.vy * tl) }
        }
        ctx.globalAlpha = 1.0
        ctx.lineCap = "round"
        ctx.lineWidth = max(0.12, px * 1.4)
        ctx.strokeStyle = "rgba(255,170,60,0.75)"; ctx.stroke(streak[0])
        ctx.strokeStyle = "rgba(255,240,170,0.95)"; ctx.stroke(streak[1])
    }
    private fun drawScenery(ctx: Ctx2D, vx: Double, vy: Double, vr: Double, cfg: Cfg) {
        val lw = 1 / cam.scale
        for (o in scenery) {
            val dx = o.x - vx; val dy = o.y - vy; val rr = vr + o.r; if (dx * dx + dy * dy > rr * rr) continue
            when (o.type) {
                "stand" -> {
                    ctx.fillStyle = o.col; ctx.fill(o.body)
                    if (cfg.quality != "low") { ctx.fillStyle = crowdPattern; ctx.fill(o.body) }
                    ctx.strokeStyle = "rgba(30,34,40,0.4)"; ctx.lineWidth = 0.4; for (r in o.rows) ctx.stroke(r)
                    ctx.fillStyle = "rgba(225,230,236,0.92)"; ctx.fill(o.roof)
                    ctx.strokeStyle = "rgba(40,44,50,0.5)"; ctx.lineWidth = max(0.2, lw); ctx.stroke(o.body)
                }
                "wheel" -> {
                    ctx.save(); ctx.translate(o.x, o.y)
                    ctx.fillStyle = "rgba(0,0,0,0.22)"; ctx.beginPath(); ctx.ellipse(8.0, 10.0, 30.0, 30.0, 0.0, 0.0, TAU); ctx.fill()
                    ctx.rotate(time * 0.05)
                    ctx.strokeStyle = "#e9edf2"; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.arc(0.0, 0.0, 28.0, 0.0, TAU); ctx.stroke()
                    ctx.lineWidth = 0.35; ctx.beginPath(); ctx.arc(0.0, 0.0, 24.0, 0.0, TAU)
                    for (k in 0 until 16) { val a = k * TAU / 16; ctx.moveTo(0.0, 0.0); ctx.lineTo(cos(a) * 28, sin(a) * 28) }
                    ctx.stroke()
                    val cols = arrayOf("#e5484d", "#f2c230", "#3d8fd9", "#58b368")
                    for (k in 0 until 16) { val a = k * TAU / 16; ctx.fillStyle = cols[k % 4]; ctx.beginPath(); ctx.arc(cos(a) * 28, sin(a) * 28, 1.9, 0.0, TAU); ctx.fill() }
                    ctx.fillStyle = "#c7ccd3"; ctx.beginPath(); ctx.arc(0.0, 0.0, 3.0, 0.0, TAU); ctx.fill()
                    ctx.restore()
                }
                "tent" -> {
                    ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(o.rot)
                    ctx.fillStyle = "rgba(0,0,0,0.22)"; ctx.fillRect(-o.size / 2 + 1, -o.size / 2 + 1.4, o.size, o.size)
                    ctx.fillStyle = o.col; ctx.fillRect(-o.size / 2, -o.size / 2, o.size, o.size)
                    ctx.strokeStyle = "rgba(255,255,255,0.6)"; ctx.lineWidth = 0.25; ctx.beginPath(); ctx.moveTo(-o.size / 2, -o.size / 2); ctx.lineTo(o.size / 2, o.size / 2); ctx.moveTo(o.size / 2, -o.size / 2); ctx.lineTo(-o.size / 2, o.size / 2); ctx.stroke()
                    ctx.restore()
                }
                "post" -> {
                    ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(o.h)
                    ctx.fillStyle = "#f08a24"; ctx.fillRect(-1.3, -1.0, 2.6, 2.0); ctx.fillStyle = "#fff"; ctx.fillRect(-1.3, -0.25, 2.6, 0.5)
                    ctx.restore()
                }
            }
        }
        if (cfg.quality == "low") return
        val G = treeCell; val x0 = floor((vx - vr) / G).toLong(); val x1 = floor((vx + vr) / G).toLong(); val y0 = floor((vy - vr) / G).toLong(); val y1 = floor((vy + vr) / G).toLong()
        for (gx in x0..x1) for (gy in y0..y1) {
            val a = treeGrid[gx * 100003L + gy] ?: continue
            for (t in a) { val s = t.size; ctx.drawImage(treeSpr[t.kind], t.x - s, t.y - s, s * 2.13, s * 2.13) }
        }
    }
}
