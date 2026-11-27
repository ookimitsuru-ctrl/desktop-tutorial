package jp.okracing.game

import android.graphics.*
import android.os.Build
import jp.okracing.core.TAU
import kotlin.math.*

/**
 * Web 版の CanvasRenderingContext2D と同じ書き方で android.graphics.Canvas に描くための薄い層。
 * Web 版の描画コード (render.js / hud.js / carsprite.js) をほぼそのまま移植できるようにする。
 * 色は CSS の文字列 (#rgb, #rrggbb, #rrggbbaa, rgb(), rgba()) も受け付ける。
 */
class Grad(val linear: Boolean, val x0: Float, val y0: Float, val r0: Float, val x1: Float, val y1: Float, val r1: Float) {
    private val stops = ArrayList<Pair<Float, Int>>()
    private var shader: Shader? = null
    fun addColorStop(o: Double, c: String) { stops.add(o.toFloat() to Ctx2D.color(c)); shader = null }
    fun addColorStop(o: Double, c: Int) { stops.add(o.toFloat() to c); shader = null }
    fun shader(): Shader {
        shader?.let { return it }
        val cols = stops.map { it.second }.toIntArray(); val pos = stops.map { it.first }.toFloatArray()
        val s = if (linear) LinearGradient(x0, y0, x1, y1, cols, pos, Shader.TileMode.CLAMP) else RadialGradient(x1, y1, max(0.001f, r1), cols, pos, Shader.TileMode.CLAMP)
        shader = s; return s
    }
}
class Pattern(val bmp: Bitmap) {
    val shader = BitmapShader(bmp, Shader.TileMode.REPEAT, Shader.TileMode.REPEAT)
    fun setScale(s: Float) { shader.setLocalMatrix(Matrix().apply { setScale(s, s) }) }
}

class Ctx2D(var canvas: Canvas) {
    companion object {
        private val colorCache = HashMap<String, Int>()
        fun color(s: String): Int = colorCache.getOrPut(s) { parse(s) }
        private fun parse(s0: String): Int {
            val s = s0.trim()
            if (s.startsWith("#")) {
                val h = s.substring(1)
                return when (h.length) {
                    3 -> { val r = h[0].digitToInt(16); val g = h[1].digitToInt(16); val b = h[2].digitToInt(16); Color.rgb(r * 17, g * 17, b * 17) }
                    6 -> (0xff000000L or h.toLong(16)).toInt()
                    8 -> { val v = h.toLong(16); Color.argb((v and 0xff).toInt(), ((v shr 24) and 0xff).toInt(), ((v shr 16) and 0xff).toInt(), ((v shr 8) and 0xff).toInt()) }
                    else -> Color.MAGENTA
                }
            }
            if (s.startsWith("rgb")) {
                val p = s.substring(s.indexOf('(') + 1, s.lastIndexOf(')')).split(',').map { it.trim() }
                val r = p[0].toDouble().toInt().coerceIn(0, 255); val g = p[1].toDouble().toInt().coerceIn(0, 255); val b = p[2].toDouble().toInt().coerceIn(0, 255)
                val a = if (p.size > 3) (p[3].toDouble() * 255).roundToInt().coerceIn(0, 255) else 255
                return Color.argb(a, r, g, b)
            }
            return when (s) { "white" -> Color.WHITE; "black" -> Color.BLACK; "transparent" -> 0; else -> Color.MAGENTA }
        }
        fun rgba(r: Int, g: Int, b: Int, a: Double) = Color.argb((a * 255).roundToInt().coerceIn(0, 255), r, g, b)
        private val fontCache = HashMap<String, Pair<Typeface, Float>>()
        /** CSS の font 指定 ("italic 800 14px family") → 書体と大きさ */
        fun parseFont(f: String): Pair<Typeface, Float> = fontCache.getOrPut(f) {
            val m = Regex("([0-9.]+)px").find(f)
            val size = m?.groupValues?.get(1)?.toFloat() ?: 10f
            val pre = f.substring(0, m?.range?.first ?: 0)
            var weight = 400
            if (pre.contains("bold")) weight = 700
            Regex("\\b([1-9]00)\\b").find(pre)?.let { weight = it.groupValues[1].toInt() }
            val fam = if (f.contains("monospace")) Typeface.MONOSPACE else if (f.contains("Condensed")) Typeface.create("sans-serif-condensed", Typeface.NORMAL) else Typeface.SANS_SERIF
            val tf = if (Build.VERSION.SDK_INT >= 28) Typeface.create(fam, weight.coerceIn(100, 1000), false) else Typeface.create(fam, if (weight >= 600) Typeface.BOLD else Typeface.NORMAL)
            tf to size
        }
        fun italic(f: String) = f.startsWith("italic") || f.contains(" italic")
    }

    private class St(var fill: Any = Color.BLACK, var stroke: Any = Color.BLACK, var lineWidth: Float = 1f, var cap: Paint.Cap = Paint.Cap.BUTT, var join: Paint.Join = Paint.Join.MITER,
                     var alpha: Float = 1f, var font: String = "10px sans-serif", var align: String = "start", var baseline: String = "alphabetic", var srcIn: Boolean = false,
                     var shadowBlur: Float = 0f, var shadowColor: Int = 0) {
        fun copy() = St(fill, stroke, lineWidth, cap, join, alpha, font, align, baseline, srcIn, shadowBlur, shadowColor)
    }
    private var st = St()
    private val stack = ArrayList<St>()
    private val fp = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val sp = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
    private val tp = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val bp = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
    private val srcIn = PorterDuffXfermode(PorterDuff.Mode.SRC_IN)
    var path = Path()
    private val rect = RectF()
    private val mtx = Matrix(); private val mv = FloatArray(9)

    // ---- スタイル ----
    var fillStyle: Any get() = st.fill; set(v) { st.fill = if (v is String) color(v) else v }
    var strokeStyle: Any get() = st.stroke; set(v) { st.stroke = if (v is String) color(v) else v }
    var lineWidth: Double get() = st.lineWidth.toDouble(); set(v) { st.lineWidth = v.toFloat() }
    var lineCap: String get() = st.cap.name.lowercase(); set(v) { st.cap = when (v) { "round" -> Paint.Cap.ROUND; "square" -> Paint.Cap.SQUARE; else -> Paint.Cap.BUTT } }
    var lineJoin: String get() = st.join.name.lowercase(); set(v) { st.join = when (v) { "round" -> Paint.Join.ROUND; "bevel" -> Paint.Join.BEVEL; else -> Paint.Join.MITER } }
    var globalAlpha: Double get() = st.alpha.toDouble(); set(v) { st.alpha = v.toFloat().coerceIn(0f, 1f) }
    var font: String get() = st.font; set(v) { st.font = v }
    var textAlign: String get() = st.align; set(v) { st.align = v }
    var textBaseline: String get() = st.baseline; set(v) { st.baseline = v }
    var globalCompositeOperation: String get() = if (st.srcIn) "source-in" else "source-over"; set(v) { st.srcIn = v == "source-in" }
    var shadowBlur: Double get() = st.shadowBlur.toDouble(); set(v) { st.shadowBlur = v.toFloat() }
    var shadowColor: String = "#000"; set(v) { field = v; st.shadowColor = color(v) }

    private fun applyStyle(p: Paint, style: Any) {
        when (style) {
            is Int -> { p.shader = null; p.color = style; p.alpha = (Color.alpha(style) * st.alpha).roundToInt() }
            is Grad -> { p.shader = style.shader(); p.color = Color.BLACK; p.alpha = (255 * st.alpha).roundToInt() }
            is Pattern -> { p.shader = style.shader; p.color = Color.BLACK; p.alpha = (255 * st.alpha).roundToInt() }
        }
        p.xfermode = if (st.srcIn) srcIn else null
        if (st.shadowBlur > 0) p.setShadowLayer(st.shadowBlur / 2, 0f, 0f, st.shadowColor) else p.clearShadowLayer()
    }
    private fun fillPaint(): Paint { applyStyle(fp, st.fill); return fp }
    private fun strokePaint(): Paint { applyStyle(sp, st.stroke); sp.strokeWidth = st.lineWidth; sp.strokeCap = st.cap; sp.strokeJoin = st.join; return sp }

    // ---- 状態と変換 ----
    fun save() { stack.add(st.copy()); canvas.save() }
    fun restore() { if (stack.isNotEmpty()) st = stack.removeAt(stack.size - 1); canvas.restore() }
    fun translate(x: Double, y: Double) = canvas.translate(x.toFloat(), y.toFloat())
    fun rotate(a: Double) = canvas.rotate(Math.toDegrees(a).toFloat())
    fun scale(x: Double, y: Double) = canvas.scale(x.toFloat(), y.toFloat())
    fun setSkewX(k: Double) = canvas.skew(k.toFloat(), 0f)
    fun setTransform(a: Double, b: Double, c: Double, d: Double, e: Double, f: Double) {
        mv[0] = a.toFloat(); mv[1] = c.toFloat(); mv[2] = e.toFloat(); mv[3] = b.toFloat(); mv[4] = d.toFloat(); mv[5] = f.toFloat(); mv[6] = 0f; mv[7] = 0f; mv[8] = 1f
        mtx.setValues(mv); canvas.setMatrix(mtx)
    }
    fun resetState() { st = St(); stack.clear() }

    // ---- パス ----
    fun beginPath() { path = Path() }
    fun closePath() = path.close()
    fun moveTo(x: Double, y: Double) = path.moveTo(x.toFloat(), y.toFloat())
    fun lineTo(x: Double, y: Double) = path.lineTo(x.toFloat(), y.toFloat())
    fun quadraticCurveTo(cx: Double, cy: Double, x: Double, y: Double) = path.quadTo(cx.toFloat(), cy.toFloat(), x.toFloat(), y.toFloat())
    fun bezierCurveTo(c1x: Double, c1y: Double, c2x: Double, c2y: Double, x: Double, y: Double) = path.cubicTo(c1x.toFloat(), c1y.toFloat(), c2x.toFloat(), c2y.toFloat(), x.toFloat(), y.toFloat())
    fun rect(x: Double, y: Double, w: Double, h: Double) = path.addRect(x.toFloat(), y.toFloat(), (x + w).toFloat(), (y + h).toFloat(), Path.Direction.CW)
    fun roundRect(x: Double, y: Double, w: Double, h: Double, r: Double) {
        val ww = max(0.0, w); val hh = max(0.0, h)
        val rr = min(r, min(ww, hh) / 2).toFloat()
        rect.set(x.toFloat(), y.toFloat(), (x + ww).toFloat(), (y + hh).toFloat()); path.addRoundRect(rect, rr, rr, Path.Direction.CW)
    }
    fun arc(x: Double, y: Double, r: Double, a0: Double, a1: Double, ccw: Boolean = false) = ellipse(x, y, r, r, 0.0, a0, a1, ccw)
    fun ellipse(x: Double, y: Double, rx: Double, ry: Double, rot: Double, a0: Double, a1: Double, ccw: Boolean = false) {
        rect.set((x - rx).toFloat(), (y - ry).toFloat(), (x + rx).toFloat(), (y + ry).toFloat())
        var sw = a1 - a0
        if (!ccw) { if (sw >= TAU) sw = TAU else { sw %= TAU; if (sw < 0) sw += TAU } } else { if (sw <= -TAU) sw = -TAU else { sw %= TAU; if (sw > 0) sw -= TAU } }
        if (abs(sw) >= TAU - 1e-6) {
            // 全周: 始点へつないでから 2 回に分けて描く (360° の arcTo は描けないため)
            path.arcTo(rect, Math.toDegrees(a0).toFloat(), 180f * sign(sw).toFloat(), false)
            path.arcTo(rect, Math.toDegrees(a0).toFloat() + 180f * sign(sw).toFloat(), 180f * sign(sw).toFloat(), false)
        } else path.arcTo(rect, Math.toDegrees(a0).toFloat(), Math.toDegrees(sw).toFloat(), false)
    }

    fun fill(p: Path? = null) = canvas.drawPath(p ?: path, fillPaint())
    fun stroke(p: Path? = null) = canvas.drawPath(p ?: path, strokePaint())
    fun clip(p: Path? = null) { canvas.clipPath(p ?: path) }
    fun fillRect(x: Double, y: Double, w: Double, h: Double) = canvas.drawRect(x.toFloat(), y.toFloat(), (x + w).toFloat(), (y + h).toFloat(), fillPaint())
    fun strokeRect(x: Double, y: Double, w: Double, h: Double) = canvas.drawRect(x.toFloat(), y.toFloat(), (x + w).toFloat(), (y + h).toFloat(), strokePaint())
    fun clearRect(x: Double, y: Double, w: Double, h: Double) { val p = Paint().apply { xfermode = PorterDuffXfermode(PorterDuff.Mode.CLEAR) }; canvas.drawRect(x.toFloat(), y.toFloat(), (x + w).toFloat(), (y + h).toFloat(), p) }

    fun createLinearGradient(x0: Double, y0: Double, x1: Double, y1: Double) = Grad(true, x0.toFloat(), y0.toFloat(), 0f, x1.toFloat(), y1.toFloat(), 0f)
    fun createRadialGradient(x0: Double, y0: Double, r0: Double, x1: Double, y1: Double, r1: Double) = Grad(false, x0.toFloat(), y0.toFloat(), r0.toFloat(), x1.toFloat(), y1.toFloat(), r1.toFloat())

    fun drawImage(b: Bitmap, x: Double, y: Double, w: Double, h: Double) {
        bp.alpha = (255 * st.alpha).roundToInt(); bp.xfermode = if (st.srcIn) srcIn else null
        rect.set(x.toFloat(), y.toFloat(), (x + w).toFloat(), (y + h).toFloat())
        canvas.drawBitmap(b, null, rect, bp)
    }

    // ---- 文字 ----
    private fun textPaint(size: Float): Paint {
        val (tf, _) = parseFont(st.font)
        tp.typeface = tf; tp.textSize = size
        tp.textSkewX = if (italic(st.font)) -0.2f else 0f
        tp.textAlign = when (st.align) { "center" -> Paint.Align.CENTER; "right", "end" -> Paint.Align.RIGHT; else -> Paint.Align.LEFT }
        return tp
    }
    fun measureText(s: String): Double { val (_, size) = parseFont(st.font); val k = if (size < 6) 40f / size else 1f; return (textPaint(size * k).measureText(s) / k).toDouble() }
    fun fillText(s: String, x: Double, y: Double) {
        val (_, size) = parseFont(st.font)
        // 小さい文字 (コース上の看板など、拡大した座標系で描くもの) は大きな文字にして縮めて描く
        val k = if (size < 6) 40f / size else 1f
        val p = textPaint(size * k)
        applyStyle(p, st.fill)
        val fm = p.fontMetrics
        val by = when (st.baseline) { "middle" -> -(fm.ascent + fm.descent) / 2; "top", "hanging" -> -fm.ascent; "bottom", "ideographic" -> -fm.descent; else -> 0f }
        if (k != 1f) { canvas.save(); canvas.scale(1 / k, 1 / k); canvas.drawText(s, x.toFloat() * k, y.toFloat() * k + by, p); canvas.restore() }
        else canvas.drawText(s, x.toFloat(), y.toFloat() + by, p)
    }
}


/** Web 版の document.createElement('canvas') の代わり: 描き込み用のビットマップと Ctx2D */
class OffCanvas(val width: Int, val height: Int) {
    val bmp: Bitmap = Bitmap.createBitmap(max(1, width), max(1, height), Bitmap.Config.ARGB_8888)
    val ctx = Ctx2D(Canvas(bmp))
}
