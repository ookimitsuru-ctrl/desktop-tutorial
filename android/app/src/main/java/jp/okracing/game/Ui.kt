package jp.okracing.game

import jp.okracing.core.*
import kotlin.math.*

// メニュー画面の部品 (Web 版 style.css の見た目を Canvas で再現する小さな UI)。座標は dp。
// 画面ごとに部品の並び (Item) を組み立て、パネル・見出し・スクロール・タップ判定はここでまとめて扱う。

const val C_NAVY = "#14254f"; const val C_DIM = "#9aa5ba"; const val C_TXT = "#f3f5f9"
const val UFONT = "Roboto Condensed"
/** UI のアクセント色 (標準版はオレンジ、オリジナル版は水色)。Web 版の CSS 変数 --or に当たる */
var C_OR = "#f47a1f"
fun accentA(a: Double): Int { val c = Ctx2D.color(C_OR); return android.graphics.Color.argb((a * 255).roundToInt(), android.graphics.Color.red(c), android.graphics.Color.green(c), android.graphics.Color.blue(c)) }

class Hit(val x: Double, val y: Double, val w: Double, val h: Double, val act: () -> Unit, val drag: ((Double) -> Unit)? = null)

/** 文字を幅で折り返す (日本語は 1 文字単位、英数字は単語単位) */
fun wrapText(ctx: Ctx2D, s: String, maxW: Double): List<String> {
    val out = ArrayList<String>()
    for (para in s.split('\n')) {
        if (para.isEmpty()) { out.add(""); continue }
        var line = StringBuilder(); var i = 0
        while (i < para.length) {
            var j = i + 1
            if (para[i].isLetterOrDigit() && para[i].code < 128) { while (j < para.length && para[j].isLetterOrDigit() && para[j].code < 128) j++ }
            val tok = para.substring(i, j)
            val cand = line.toString() + tok
            if (ctx.measureText(cand) > maxW && line.isNotEmpty()) { out.add(line.toString().trimEnd()); line = StringBuilder(tok.trimStart()) } else line.append(tok)
            i = j
        }
        out.add(line.toString())
    }
    return out
}
fun setFont(ctx: Ctx2D, size: Double, weight: String = "700", italic: Boolean = false) { ctx.font = "${if (italic) "italic " else ""}$weight ${size}px $UFONT" }

/** タイトルロゴ: 「Formula」(オレンジの箱) +「simulator」 */
fun drawLogo(ctx: Ctx2D, cx: Double, baseY: Double, size: Double, accent: String) {
    ctx.save(); ctx.translate(cx, baseY); ctx.setSkewX(-0.105)
    setFont(ctx, size, "900", true)
    val w1 = ctx.measureText("Formula"); val w2 = ctx.measureText("simulator"); val gap = size * 0.18
    val padL = size * 0.16; val padR = size * 0.22
    val total = w1 + padL + padR + gap + w2
    var x = -total / 2
    val boxTop = -size * 0.86; val boxH = size * 1.06
    ctx.fillStyle = C_NAVY; ctx.beginPath(); ctx.roundRect(x + size * 0.09, boxTop + size * 0.09, w1 + padL + padR, boxH, size * 0.1); ctx.fill()
    ctx.fillStyle = accent; ctx.beginPath(); ctx.roundRect(x, boxTop, w1 + padL + padR, boxH, size * 0.1); ctx.fill()
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"
    ctx.fillStyle = "#fff"; ctx.fillText("Formula", x + padL, 0.0)
    x += w1 + padL + padR + gap
    ctx.fillStyle = C_NAVY; ctx.fillText("simulator", x + size * 0.05, size * 0.05)
    ctx.fillStyle = "#fff"; ctx.fillText("simulator", x, 0.0)
    ctx.restore()
}

class SegOpt(val v: Any, val label: String, val sub: String? = null, val dot: Int? = null, val short: String? = null)

abstract class Item { abstract fun height(ctx: Ctx2D, w: Double): Double; abstract fun draw(ctx: Ctx2D, ui: UiRoot, x: Double, y: Double, w: Double) }

class Heading(val text: String, val small: String? = null) : Item() {
    override fun height(ctx: Ctx2D, w: Double) = 34.0
    override fun draw(ctx: Ctx2D, ui: UiRoot, x: Double, y: Double, w: Double) {
        setFont(ctx, 12.0, "800"); ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"; ctx.fillStyle = "#ffc79a"
        ctx.fillText(text, x, y + 28); val tw = ctx.measureText(text)
        if (small != null) { setFont(ctx, 11.0, "600"); ctx.fillStyle = C_DIM; ctx.fillText(small, x + tw + 8, y + 28) }
    }
}
class Note(val text: String, val size: Double = 11.5, val color: String = C_DIM, val lineH: Double = 1.6) : Item() {
    override fun height(ctx: Ctx2D, w: Double): Double { setFont(ctx, size, "500"); return wrapText(ctx, text, w).size * size * lineH + 6 }
    override fun draw(ctx: Ctx2D, ui: UiRoot, x: Double, y: Double, w: Double) {
        setFont(ctx, size, "500"); ctx.fillStyle = color; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"
        wrapText(ctx, text, w).forEachIndexed { k, l -> ctx.fillText(l, x, y + size * (1.2 + k * lineH)) }
    }
}
/** 選択ボタンの並び (.seg)。幅に応じて折り返す */
class Seg(val opts: List<SegOpt>, val cur: Any?, val minW: Double = 92.0, val onPick: (Any) -> Unit) : Item() {
    private fun cols(w: Double) = max(1, min(opts.size, floor((w + 6) / (minW + 6)).toInt()))
    private fun rowsOf(w: Double): List<List<Int>> { val c = cols(w); return opts.indices.chunked(c) }
    private fun bh(ctx: Ctx2D, o: SegOpt, bw: Double): Double {
        var h = 8.0 + 17
        if (o.sub != null) { setFont(ctx, 10.5, "500"); h += wrapText(ctx, o.sub, bw - 20 - (if (o.dot != null) 26 else 0)).size * 13.7 }
        return h + 8
    }
    override fun height(ctx: Ctx2D, w: Double): Double {
        var h = 0.0
        for (row in rowsOf(w)) { val bw = (w - 6 * (row.size - 1)) / row.size; h += row.maxOf { bh(ctx, opts[it], bw) } + 6 }
        return h
    }
    override fun draw(ctx: Ctx2D, ui: UiRoot, x: Double, y: Double, w: Double) {
        var yy = y
        for (row in rowsOf(w)) {
            val bw = (w - 6 * (row.size - 1)) / row.size; val rh = row.maxOf { bh(ctx, opts[it], bw) }
            row.forEachIndexed { k, idx ->
                val o = opts[idx]; val bx = x + k * (bw + 6); val sel = o.v == cur
                ui.button(ctx, bx, yy, bw, rh, sel) { onPick(o.v) }
                setFont(ctx, 13.5, "700"); ctx.fillStyle = C_TXT; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"
                val lw = bw - 20 - (if (o.dot != null) 26 else 0)
                ctx.fillText(ellipsize(ctx, o.label, lw), bx + 10, yy + 8 + 13)
                if (o.sub != null) { setFont(ctx, 10.5, "500"); ctx.fillStyle = C_DIM; wrapText(ctx, o.sub, lw).forEachIndexed { q, l -> ctx.fillText(l, bx + 10, yy + 8 + 17 + 11 + q * 13.7) } }
                if (o.dot != null) {
                    val cx = bx + bw - 8 - 11; val cy = yy + 7 + 11
                    ctx.beginPath(); ctx.arc(cx, cy, 9.25, 0.0, TAU); ctx.fillStyle = "#111"; ctx.fill(); ctx.strokeStyle = o.dot; ctx.lineWidth = 3.5; ctx.stroke()
                    setFont(ctx, 10.0, "800"); ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(o.short ?: "", cx, cy + 0.5); ctx.textBaseline = "alphabetic"
                }
            }
            yy += rh + 6
        }
    }
}
fun ellipsize(ctx: Ctx2D, s: String, w: Double): String { if (ctx.measureText(s) <= w) return s; var t = s; while (t.isNotEmpty() && ctx.measureText("$t…") > w) t = t.dropLast(1); return "$t…" }

class Btn(val label: String, val go: Boolean = false, val act: () -> Unit)
/** ボタンの並び (.btns): 最小幅 150 で等分 */
class Btns(val list: List<Btn>, val minW: Double = 150.0) : Item() {
    private fun cols(w: Double) = max(1, min(list.size, floor((w + 8) / (minW + 8)).toInt()))
    override fun height(ctx: Ctx2D, w: Double): Double { val r = ceil(list.size / cols(w).toDouble()).toInt(); return r * 44.0 - 8 + 20 }
    override fun draw(ctx: Ctx2D, ui: UiRoot, x: Double, y: Double, w: Double) {
        val c = cols(w); val bw = (w - 8 * (c - 1)) / c
        list.forEachIndexed { k, b -> val bx = x + (k % c) * (bw + 8); val by = y + 10 + (k / c) * 44.0; ui.textButton(ctx, bx, by, bw, 36.0, b.label, b.go, 14.0, b.act) }
    }
}
class Card(val en: String, val name: String, val desc: String, val act: () -> Unit)
class Cards(val list: List<Card>, val screenH: Double, val screenW: Double) : Item() {
    private fun cols() = if (screenW < 760) 2 else 5
    private fun ch() = if (screenH <= 380) 70.0 else clamp(screenH * 0.34, 96.0, 170.0)
    override fun height(ctx: Ctx2D, w: Double): Double { val r = ceil(list.size / cols().toDouble()).toInt(); return r * (ch() + 10) + 18 }
    override fun draw(ctx: Ctx2D, ui: UiRoot, x: Double, y: Double, w: Double) {
        val c = cols(); val cw = (w - 10 * (c - 1)) / c; val h = ch()
        list.forEachIndexed { k, cd ->
            val cx = x + (k % c) * (cw + 10); val cy = y + 14 + (k / c) * (h + 10)
            ui.hits.add(Hit(cx, cy, cw, h, cd.act))
            val gr = ctx.createLinearGradient(cx, cy, cx + cw * 0.5, cy + h); gr.addColorStop(0.0, "rgba(255,255,255,0.1)"); gr.addColorStop(1.0, "rgba(255,255,255,0.02)")
            ctx.beginPath(); ctx.roundRect(cx, cy, cw, h, 9.0); ctx.fillStyle = gr; ctx.fill(); ctx.strokeStyle = "rgba(255,255,255,0.14)"; ctx.lineWidth = 1.0; ctx.stroke()
            ctx.fillStyle = C_OR; ctx.fillRect(cx, cy + 2, 4.0, h - 4)
            ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"
            setFont(ctx, 10.0, "800"); ctx.fillStyle = "#ffc79a"; ctx.fillText(cd.en.toCharArray().joinToString(" "), cx + 14, cy + 22)
            val nsz = clamp(screenH * 0.048, 17.0, 24.0); setFont(ctx, nsz, "900", true); ctx.fillStyle = "#fff"
            val nl = wrapText(ctx, cd.name, cw - 24); nl.forEachIndexed { q, l -> ctx.fillText(l, cx + 14, cy + 26 + nsz * (1 + q * 1.1)) }
            if (screenH > 380) { setFont(ctx, 12.0, "500"); ctx.fillStyle = C_DIM; wrapText(ctx, cd.desc, cw - 24).forEachIndexed { q, l -> val ly = cy + 34 + nsz * (nl.size * 1.1) + 16 + q * 17.4; if (ly < cy + h - 4) ctx.fillText(l, cx + 14, ly) } }
        }
    }
}
class TrackBtn(val name: String, val small: String, val sel: Boolean, val act: () -> Unit)
class TrackRow(val label: String, val list: List<TrackBtn>) : Item() {
    override fun height(ctx: Ctx2D, w: Double) = 48.0
    override fun draw(ctx: Ctx2D, ui: UiRoot, x: Double, y: Double, w: Double) {
        setFont(ctx, 11.0, "800"); ctx.fillStyle = "#ffc79a"; ctx.textAlign = "left"; ctx.textBaseline = "middle"
        ctx.fillText(label, x, y + 28); val lw = ctx.measureText(label) + 12
        val bw = (w - lw - 8 * (list.size - 1)) / list.size
        list.forEachIndexed { k, b ->
            val bx = x + lw + k * (bw + 8)
            ui.button(ctx, bx, y + 10, bw, 36.0, b.sel, b.act)
            setFont(ctx, 10.5, "600"); val sw = ctx.measureText(b.small)
            setFont(ctx, 14.0, "700", true); val nm = ellipsize(ctx, b.name, bw - sw - 26); val nw = ctx.measureText(nm)
            val tx = bx + (bw - nw - sw - 8) / 2
            ctx.fillStyle = "#fff"; ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(nm, tx, y + 28)
            setFont(ctx, 10.5, "600"); ctx.fillStyle = C_DIM; ctx.fillText(b.small, tx + nw + 8, y + 29)
        }
        ctx.textBaseline = "alphabetic"
    }
}
class Cell(val text: String, val cls: String = "", val t: Boolean = false, val small: String? = null)
/** 表 (.tbl)。列の幅は中身から決め、入りきらないときは縮める */
class Table(val head: List<Cell>, val rows: List<List<Cell>>, val me: Set<Int> = emptySet(), val empty: String? = null) : Item() {
    private val rh = 26.0
    override fun height(ctx: Ctx2D, w: Double) = 24.0 + (if (rows.isEmpty() && empty != null) 44.0 else rows.size * rh) + 6
    override fun draw(ctx: Ctx2D, ui: UiRoot, x: Double, y: Double, w: Double) {
        val n = head.size; val cw = DoubleArray(n)
        setFont(ctx, 10.5, "700"); for (k in 0 until n) cw[k] = ctx.measureText(head[k].text + (head[k].small ?: "")) + 14
        for (r in rows) for (k in 0 until min(n, r.size)) { setFont(ctx, 12.5, if (r[k].t) "800" else "500", r[k].t); cw[k] = max(cw[k], ctx.measureText(r[k].text) + 14 + (r[k].small?.let { 8 + it.length * 7.0 } ?: 0.0)) }
        val tot = cw.sum(); val f = if (tot > w) w / tot else 1.0
        if (tot < w) { val extra = (w - tot) / n; for (k in 0 until n) cw[k] += extra } else for (k in 0 until n) cw[k] *= f
        val sc = min(1.0, max(0.75, f))
        var cx = x
        ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"
        for (k in 0 until n) { setFont(ctx, 10.5 * sc, "700"); ctx.fillStyle = C_DIM; ctx.fillText(head[k].text, cx + 6, y + 16); head[k].small?.let { ctx.fillText(it, cx + 6 + ctx.measureText(head[k].text) + 4, y + 16) }; cx += cw[k] }
        ctx.fillStyle = "rgba(255,255,255,0.14)"; ctx.fillRect(x, y + 23, w, 1.0)
        if (rows.isEmpty() && empty != null) { setFont(ctx, 12.5, "500"); ctx.fillStyle = C_DIM; ctx.textAlign = "center"; ctx.fillText(empty, x + w / 2, y + 52); ctx.textAlign = "left"; return }
        rows.forEachIndexed { ri, r ->
            val ry = y + 24 + ri * rh
            if (ri in me) { ctx.fillStyle = accentA(0.28); ctx.fillRect(x, ry, w, rh) }
            ctx.fillStyle = "rgba(255,255,255,0.06)"; ctx.fillRect(x, ry + rh - 1, w, 1.0)
            var xx = x
            for (k in 0 until min(n, r.size)) {
                val c = r[k]; val meRow = ri in me
                setFont(ctx, 12.5 * sc, if (c.t || meRow) "800" else "500", c.t)
                ctx.fillStyle = when (c.cls) { "ok" -> "#7dffb0"; "bad" -> "#ff8a7a"; "dim" -> C_DIM; else -> C_TXT }
                val tx = ellipsize(ctx, c.text, cw[k] - 10); ctx.fillText(tx, xx + 6, ry + 17)
                c.small?.let { setFont(ctx, 10.5 * sc, "500"); ctx.fillStyle = C_DIM; ctx.fillText(it, xx + 6 + ctx.measureText(tx) + 16, ry + 17) }
                xx += cw[k]
            }
        }
    }
}
class HowItem(val key: String, val color: String, val title: String, val body: String, val keyText: String = "#fff") : Item() {
    override fun height(ctx: Ctx2D, w: Double): Double { setFont(ctx, 12.5, "500"); return max(44.0, (wrapText(ctx, body, w - 76).size + 1) * 20.0 + 6) + 10 }
    override fun draw(ctx: Ctx2D, ui: UiRoot, x: Double, y: Double, w: Double) {
        ctx.beginPath(); ctx.roundRect(x, y + 10, 64.0, 40.0, 9.0); ctx.fillStyle = color; ctx.fill(); ctx.strokeStyle = "rgba(255,255,255,0.14)"; ctx.lineWidth = 1.0; ctx.stroke()
        setFont(ctx, 12.0, "900", true); ctx.fillStyle = keyText; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(key, x + 32, y + 30); ctx.textBaseline = "alphabetic"
        ctx.textAlign = "left"; setFont(ctx, 12.5, "800"); ctx.fillStyle = "#fff"; ctx.fillText(title, x + 76, y + 24)
        setFont(ctx, 12.5, "500"); ctx.fillStyle = "#d6dbe6"; wrapText(ctx, body, w - 76).forEachIndexed { k, l -> ctx.fillText(l, x + 76, y + 44 + k * 20.0) }
    }
}
class RangeItem(val value: Double, val label: String, val onChange: (Double) -> Unit) : Item() {
    override fun height(ctx: Ctx2D, w: Double) = 40.0
    override fun draw(ctx: Ctx2D, ui: UiRoot, x: Double, y: Double, w: Double) {
        val tw = w - 64; val cy = y + 20
        ctx.fillStyle = "rgba(255,255,255,0.2)"; ctx.beginPath(); ctx.roundRect(x, cy - 3, tw, 6.0, 3.0); ctx.fill()
        ctx.fillStyle = C_OR; ctx.beginPath(); ctx.roundRect(x, cy - 3, tw * value, 6.0, 3.0); ctx.fill()
        ctx.beginPath(); ctx.arc(x + tw * value, cy, 10.0, 0.0, TAU); ctx.fillStyle = "#fff"; ctx.fill()
        setFont(ctx, 15.0, "800", true); ctx.fillStyle = "#fff"; ctx.textAlign = "right"; ctx.textBaseline = "middle"; ctx.fillText(label, x + w, cy); ctx.textBaseline = "alphabetic"; ctx.textAlign = "left"
        ui.hits.add(Hit(x - 10, y, tw + 20, 40.0, {}, drag = { px -> onChange(clamp(((px - x) / tw * 20).roundToInt() / 20.0, 0.0, 1.0)) }))
    }
}
/** トレーニング講評のトレーナー吹き出し (.coach) */
class Coach(val advice: List<Advice>) : Item() {
    override fun height(ctx: Ctx2D, w: Double): Double { setFont(ctx, 13.0, "500"); return advice.sumOf { wrapText(ctx, it.text, w - 80).size * 21.5 + 3 } + 28 }
    override fun draw(ctx: Ctx2D, ui: UiRoot, x: Double, y: Double, w: Double) {
        val h = height(ctx, w) - 8
        ctx.beginPath(); ctx.roundRect(x, y + 4, w, h, 12.0); ctx.fillStyle = accentA(0.12); ctx.fill(); ctx.strokeStyle = accentA(0.4); ctx.lineWidth = 1.0; ctx.stroke()
        ctx.beginPath(); ctx.arc(x + 12 + 17, y + 14 + 17, 17.0, 0.0, TAU); ctx.fillStyle = C_OR; ctx.fill()
        setFont(ctx, 16.0, "900", true); ctx.fillStyle = "#111"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("T", x + 29, y + 31); ctx.textBaseline = "alphabetic"; ctx.textAlign = "left"
        var yy = y + 26.0
        for (a in advice) {
            setFont(ctx, 13.0, "500"); ctx.fillStyle = when (a.sev) { "good" -> "#7dffb0"; "info" -> "#9cc9ff"; else -> C_TXT }
            val lines = wrapText(ctx, a.text, w - 80)
            ctx.beginPath(); ctx.arc(x + 62, yy - 4, 2.2, 0.0, TAU); ctx.fill()
            lines.forEachIndexed { k, l -> ctx.fillText(l, x + 70, yy + k * 21.5) }
            yy += lines.size * 21.5 + 3
        }
    }
}
/** 任意の描画を行う部品 */
class Custom(val h: Double, val fn: (Ctx2D, UiRoot, Double, Double, Double) -> Unit) : Item() {
    override fun height(ctx: Ctx2D, w: Double) = h
    override fun draw(ctx: Ctx2D, ui: UiRoot, x: Double, y: Double, w: Double) = fn(ctx, ui, x, y, w)
}

class HeadBtn(val label: String, val go: Boolean = false, val act: () -> Unit)
class Screen(val title: String, val em: String = "", val back: (() -> Unit)? = null, val backLabel: String = "‹ 戻る", val right: List<HeadBtn> = emptyList(),
             val items: List<Item> = emptyList(), val width: String = "wide", val footer: List<Btn> = emptyList(), val headerExtra: String? = null, val logoHeader: Boolean = false)

/** 画面の土台: パネル・見出し・スクロール・タップ判定 */
class UiRoot {
    val hits = ArrayList<Hit>()
    var scroll = 0.0; private var maxScroll = 0.0; private var scrollArea = Rc(0.0, 0.0, 0.0, 0.0)
    var accent = C_OR
    private var downX = 0.0; private var downY = 0.0; private var lastY = 0.0; private var moved = false; private var dragHit: Hit? = null; private var vel = 0.0; private var lastT = 0L
    var pressed: Hit? = null
    var pending: (() -> Unit)? = null

    fun button(ctx: Ctx2D, x: Double, y: Double, w: Double, h: Double, sel: Boolean, act: () -> Unit) {
        val hit = Hit(x, y, w, h, act); hits.add(hit)
        val pr = pressed?.let { it.x == x && it.y == y } == true
        ctx.beginPath(); ctx.roundRect(x, y, w, h, 9.0)
        ctx.fillStyle = if (sel) accentA(0.3) else if (pr) "rgba(255,255,255,0.16)" else "rgba(255,255,255,0.07)"; ctx.fill()
        ctx.strokeStyle = if (sel) accent else "rgba(255,255,255,0.14)"; ctx.lineWidth = if (sel) 2.0 else 1.0; ctx.stroke()
    }
    fun textButton(ctx: Ctx2D, x: Double, y: Double, w: Double, h: Double, label: String, go: Boolean, size: Double = 14.0, act: () -> Unit) {
        val hit = Hit(x, y, w, h, act); hits.add(hit)
        val pr = pressed?.let { it.x == x && it.y == y } == true
        ctx.beginPath(); ctx.roundRect(x, y, w, h, 9.0)
        ctx.fillStyle = if (go) accent else if (pr) "rgba(255,255,255,0.16)" else "rgba(255,255,255,0.07)"; ctx.fill()
        if (!go) { ctx.strokeStyle = "rgba(255,255,255,0.14)"; ctx.lineWidth = 1.0; ctx.stroke() }
        setFont(ctx, size, "700"); ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(ellipsize(ctx, label, w - 12), x + w / 2, y + h / 2 + 1); ctx.textBaseline = "alphabetic"; ctx.textAlign = "left"
    }
    fun headBtnWidth(ctx: Ctx2D, b: HeadBtn): Double { setFont(ctx, 14.0, "700"); return ctx.measureText(b.label) + 28 }

    /** 背景の暗幕とパネル付きの画面を描く */
    fun drawScreen(ctx: Ctx2D, sc: Screen, W: Double, H: Double, safe: Safe) {
        hits.clear()
        val g = ctx.createRadialGradient(W / 2, H / 2, 0.0, W / 2, H / 2, max(W, H) * 0.7); g.addColorStop(0.0, "rgba(8,12,24,0.35)"); g.addColorStop(1.0, "rgba(8,12,24,0.78)")
        ctx.fillStyle = g; ctx.fillRect(0.0, 0.0, W, H)
        val padL = max(10.0, safe.l); val padR = max(10.0, safe.r); val padT = max(10.0, safe.t); val padB = max(10.0, safe.b)
        val maxW = when (sc.width) { "wide" -> 900.0; "small" -> 420.0; else -> 560.0 }
        val pw = min(maxW, W - padL - padR); val px = padL + (W - padL - padR - pw) / 2
        val hh = if (sc.logoHeader) 52.0 else clamp(H * 0.046 * 2.1, 44.0, 52.0)
        val iw = pw - 28
        val contentH = sc.items.sumOf { it.height(ctx, iw) } + 16 + 6
        val footH = if (sc.footer.isNotEmpty()) 50.0 else 0.0
        val ph = min(H - padT - padB, hh + contentH + footH + 2)
        val py = padT + (H - padT - padB - ph) / 2
        // パネル
        ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 30.0
        ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 14.0); ctx.fillStyle = "rgba(11,16,32,0.9)"; ctx.fill(); ctx.restore()
        ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 14.0); ctx.strokeStyle = "rgba(255,255,255,0.14)"; ctx.lineWidth = 1.0; ctx.stroke()
        ctx.save(); ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 14.0); ctx.clip()
        // 見出し
        val hg = ctx.createLinearGradient(px, 0.0, px + pw, 0.0); hg.addColorStop(0.0, accentA(0.22)); hg.addColorStop(1.0, "rgba(20,37,79,0.3)")
        ctx.fillStyle = hg; ctx.fillRect(px, py, pw, hh); ctx.fillStyle = "rgba(255,255,255,0.14)"; ctx.fillRect(px, py + hh, pw, 1.0)
        var lx = px + 14; var rx = px + pw - 14
        val by = py + (hh - 34) / 2
        sc.back?.let { b -> val bw = 70.0; textButton(ctx, lx, by, bw, 34.0, sc.backLabel, false, 14.0, b); lx += bw + 10 }
        for (b in sc.right.reversed()) { val bw = headBtnWidth(ctx, b); textButton(ctx, rx - bw, by, bw, 34.0, b.label, b.go, 14.0, b.act); rx -= bw + 8 }
        if (sc.logoHeader) { drawLogo(ctx, lx + 92, py + hh / 2 + 10, 26.0, accent); lx += 200 }
        else {
            val ts = clamp(H * 0.046, 17.0, 24.0)
            setFont(ctx, ts, "900", true); ctx.fillStyle = "#fff"; ctx.textAlign = "left"; ctx.textBaseline = "middle"
            val t = ellipsize(ctx, sc.title, rx - lx - 20); ctx.fillText(t, lx, py + hh / 2 + 1)
            val tw = ctx.measureText(t)
            if (sc.em.isNotEmpty() && lx + tw + 30 < rx) { setFont(ctx, ts * 0.5, "700"); ctx.fillStyle = "#ffc79a"; ctx.fillText(ellipsize(ctx, sc.em.toCharArray().joinToString(" "), rx - lx - tw - 30), lx + tw + ts * 0.8, py + hh / 2 + 2) }
            ctx.textBaseline = "alphabetic"
        }
        sc.headerExtra?.let { setFont(ctx, clamp(H * 0.028, 11.0, 14.0), "600"); ctx.fillStyle = C_DIM; ctx.textAlign = "right"; ctx.textBaseline = "middle"; ctx.fillText(ellipsize(ctx, it, rx - lx - 10), rx, py + hh / 2); ctx.textAlign = "left"; ctx.textBaseline = "alphabetic" }
        // 本文 (スクロール)
        val top = py + hh + 1; val bodyH = ph - hh - 1 - footH
        scrollArea = Rc(px, top, pw, bodyH)
        maxScroll = max(0.0, contentH - bodyH); scroll = clamp(scroll, 0.0, maxScroll)
        ctx.save(); ctx.beginPath(); ctx.rect(px, top, pw, bodyH); ctx.clip()
        var y = top + 6 - scroll
        val hitStart = hits.size
        for (it in sc.items) { val h = it.height(ctx, iw); if (y + h > top - 40 && y < top + bodyH + 40) it.draw(ctx, this, px + 14, y, iw); y += h }
        ctx.restore()
        // スクロール領域の外にはみ出した部品はタップできないようにする
        val keep = hits.subList(hitStart, hits.size).filter { it.y + it.h > top && it.y < top + bodyH }
        while (hits.size > hitStart) hits.removeAt(hits.size - 1); hits.addAll(keep)
        if (maxScroll > 0) { val sh = bodyH * bodyH / contentH; val sy = top + (bodyH - sh) * scroll / maxScroll; ctx.fillStyle = "rgba(255,255,255,0.25)"; ctx.beginPath(); ctx.roundRect(px + pw - 5, sy, 3.0, sh, 1.5); ctx.fill() }
        if (sc.footer.isNotEmpty()) {
            val fw = (pw - 28 - 8 * (sc.footer.size - 1)) / sc.footer.size
            sc.footer.forEachIndexed { k, b -> textButton(ctx, px + 14 + k * (fw + 8), py + ph - 14 - 34, fw, 34.0, b.label, b.go, 13.0, b.act) }
        }
        ctx.restore()
        if (vel != 0.0) { scroll = clamp(scroll - vel, 0.0, maxScroll); vel *= 0.92; if (abs(vel) < 0.2) vel = 0.0 }
    }

    // ---- タッチ ----
    fun down(x: Double, y: Double) {
        downX = x; downY = y; lastY = y; moved = false; vel = 0.0; lastT = System.nanoTime()
        dragHit = hits.lastOrNull { it.drag != null && x >= it.x && x <= it.x + it.w && y >= it.y && y <= it.y + it.h }
        dragHit?.drag?.invoke(x)
        pressed = if (dragHit == null) hits.lastOrNull { it.drag == null && x >= it.x && x <= it.x + it.w && y >= it.y && y <= it.y + it.h } else null
    }
    fun move(x: Double, y: Double) {
        dragHit?.let { it.drag?.invoke(x); return }
        if (abs(y - downY) > 8 || abs(x - downX) > 8) { moved = true; pressed = null }
        if (moved && scrollArea.has(downX, downY)) { val dy = y - lastY; scroll = clamp(scroll - dy, 0.0, maxScroll); val now = System.nanoTime(); val dtt = max(1e-3, (now - lastT) / 1e9); vel = dy / dtt / 60; lastT = now }
        lastY = y
    }
    fun up(x: Double, y: Double) {
        if (dragHit != null) { dragHit = null; return }
        if (!moved) { vel = 0.0; val h = hits.lastOrNull { it.drag == null && x >= it.x - 2 && x <= it.x + it.w + 2 && y >= it.y - 2 && y <= it.y + it.h + 2 }; if (h != null) pending = h.act }
        pressed = null
    }
    fun resetScroll() { scroll = 0.0; vel = 0.0 }
}
