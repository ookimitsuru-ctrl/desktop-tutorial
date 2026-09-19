package com.example.planetgrow.core

import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin

/**
 * ドット絵用の小さなソフトウェアラスタライザ。
 *
 * このファイルは Android にも JVM デスクトップにも依存しない純 Kotlin。
 * アプリ本体 (Compose) と :preview モジュールが同じコードを共有する。
 */

/** 0xRRGGBB から不透明 ARGB を作る。 */
fun rgbOf(hex: Int): Int = (0xFF shl 24) or (hex and 0xFFFFFF)

object Col {
    const val CLEAR = 0
    val WHITE = rgbOf(0xFFFFFF)

    fun a(c: Int) = (c ushr 24) and 0xFF
    fun r(c: Int) = (c ushr 16) and 0xFF
    fun g(c: Int) = (c ushr 8) and 0xFF
    fun b(c: Int) = c and 0xFF

    fun argb(a: Int, r: Int, g: Int, b: Int): Int =
        ((a and 0xFF) shl 24) or ((r and 0xFF) shl 16) or ((g and 0xFF) shl 8) or (b and 0xFF)

    /** 乗算合成 (0..256 の倍率)。ライティングに使う。 */
    fun modulate(c: Int, rm: Int, gm: Int, bm: Int): Int {
        val a = (c ushr 24) and 0xFF
        val r = (((c ushr 16) and 0xFF) * rm) shr 8
        val g = (((c ushr 8) and 0xFF) * gm) shr 8
        val bl = ((c and 0xFF) * bm) shr 8
        return (a shl 24) or (r shl 16) or (g shl 8) or bl
    }

    /** tint 色 (0xFFRRGGBB) を「光の色」とみなして乗算する。 */
    fun tint(c: Int, tintColor: Int): Int =
        if (tintColor == WHITE) c
        else modulate(c, r(tintColor) + 1, g(tintColor) + 1, b(tintColor) + 1)

    fun lerp(c0: Int, c1: Int, t: Float): Int {
        val u = t.coerceIn(0f, 1f)
        val ia = a(c0) + ((a(c1) - a(c0)) * u).toInt()
        val ir = r(c0) + ((r(c1) - r(c0)) * u).toInt()
        val ig = g(c0) + ((g(c1) - g(c0)) * u).toInt()
        val ib = b(c0) + ((b(c1) - b(c0)) * u).toInt()
        return argb(ia, ir, ig, ib)
    }

    fun scale(c: Int, f: Float): Int {
        val m = (f * 256f).toInt().coerceIn(0, 256)
        return modulate(c, m, m, m)
    }

    fun withAlpha(c: Int, alpha: Int): Int = (c and 0x00FFFFFF) or ((alpha.coerceIn(0, 255)) shl 24)
}

/** 透明を含むドット絵スプライト。 */
class Sprite(val w: Int, val h: Int, val px: IntArray) {
    companion object {
        /**
         * 文字列でドット絵を書くためのヘルパー。
         * 例: Sprite.of(listOf("..X..", ".XXX."), mapOf('X' to rgbOf(0xFF0000)))
         * 未定義の文字・スペース・'.' は透明。
         */
        fun of(rows: List<String>, palette: Map<Char, Int>): Sprite {
            val h = rows.size
            val w = rows.maxOf { it.length }
            val px = IntArray(w * h)
            for (y in 0 until h) {
                val row = rows[y]
                for (x in 0 until w) {
                    val ch = if (x < row.length) row[x] else '.'
                    px[y * w + x] = palette[ch] ?: Col.CLEAR
                }
            }
            return Sprite(w, h, px)
        }
    }

    /** 2x2 を平均して半分の大きさにする (場面が広いときの表示用)。 */
    fun halfSize(): Sprite {
        val hw = (w + 1) / 2
        val hh = (h + 1) / 2
        val out = IntArray(hw * hh)
        for (y in 0 until hh) {
            for (x in 0 until hw) {
                var a = 0
                var r = 0
                var g = 0
                var b = 0
                var n = 0
                for (dy in 0 until 2) {
                    for (dx in 0 until 2) {
                        val sx = x * 2 + dx
                        val sy = y * 2 + dy
                        if (sx >= w || sy >= h) continue
                        val c = px[sy * w + sx]
                        val ca = (c ushr 24) and 0xFF
                        a += ca
                        r += ((c ushr 16) and 0xFF) * ca
                        g += ((c ushr 8) and 0xFF) * ca
                        b += (c and 0xFF) * ca
                        n++
                    }
                }
                if (n == 0 || a == 0) {
                    out[y * hw + x] = 0
                } else {
                    out[y * hw + x] = Col.argb(a / n, r / a, g / a, b / a)
                }
            }
        }
        return Sprite(hw, hh, out)
    }

    fun rotate90(times: Int): Sprite {
        var cur = this
        repeat(((times % 4) + 4) % 4) {
            val out = IntArray(cur.w * cur.h)
            // (x, y) -> (h-1-y, x)
            for (y in 0 until cur.h) for (x in 0 until cur.w) {
                out[x * cur.h + (cur.h - 1 - y)] = cur.px[y * cur.w + x]
            }
            cur = Sprite(cur.h, cur.w, out)
        }
        return cur
    }
}

/** ARGB のピクセルバッファ。これを最後に一枚の画像として画面へ拡大転送する。 */
class PixelBuffer(val width: Int, val height: Int) {
    val px = IntArray(width * height)

    fun fill(color: Int) {
        java.util.Arrays.fill(px, color)
    }

    fun copyFrom(other: PixelBuffer) {
        System.arraycopy(other.px, 0, px, 0, min(px.size, other.px.size))
    }

    fun set(x: Int, y: Int, color: Int) {
        if (x < 0 || y < 0 || x >= width || y >= height) return
        px[y * width + x] = color
    }

    fun get(x: Int, y: Int): Int =
        if (x < 0 || y < 0 || x >= width || y >= height) 0 else px[y * width + x]

    /** アルファ合成で 1px 置く。 */
    fun blend(x: Int, y: Int, color: Int) {
        if (x < 0 || y < 0 || x >= width || y >= height) return
        val a = (color ushr 24) and 0xFF
        if (a == 0) return
        val i = y * width + x
        if (a == 255) {
            px[i] = color
            return
        }
        val d = px[i]
        val ia = 255 - a
        val r = ((((color ushr 16) and 0xFF) * a) + (((d ushr 16) and 0xFF) * ia)) / 255
        val g = ((((color ushr 8) and 0xFF) * a) + (((d ushr 8) and 0xFF) * ia)) / 255
        val b = (((color and 0xFF) * a) + ((d and 0xFF) * ia)) / 255
        px[i] = (0xFF shl 24) or (r shl 16) or (g shl 8) or b
    }

    /** 加算合成 (光・グロー用)。 */
    fun addLight(x: Int, y: Int, r: Int, g: Int, b: Int) {
        if (x < 0 || y < 0 || x >= width || y >= height) return
        if (r <= 0 && g <= 0 && b <= 0) return
        val i = y * width + x
        val d = px[i]
        val nr = min(255, ((d ushr 16) and 0xFF) + r)
        val ng = min(255, ((d ushr 8) and 0xFF) + g)
        val nb = min(255, (d and 0xFF) + b)
        px[i] = (0xFF shl 24) or (nr shl 16) or (ng shl 8) or nb
    }

    fun fillRect(x0: Int, y0: Int, w: Int, h: Int, color: Int) {
        val xs = max(0, x0)
        val ys = max(0, y0)
        val xe = min(width, x0 + w)
        val ye = min(height, y0 + h)
        if (xs >= xe || ys >= ye) return
        for (y in ys until ye) {
            val base = y * width
            for (x in xs until xe) px[base + x] = color
        }
    }

    /** 軸そろえのスプライト転送。 */
    fun draw(s: Sprite, dx: Int, dy: Int, tintColor: Int = Col.WHITE, alpha: Int = 255) {
        val xs = max(0, dx)
        val ys = max(0, dy)
        val xe = min(width, dx + s.w)
        val ye = min(height, dy + s.h)
        if (xs >= xe || ys >= ye) return
        val plain = tintColor == Col.WHITE
        val rm = Col.r(tintColor) + 1
        val gm = Col.g(tintColor) + 1
        val bm = Col.b(tintColor) + 1
        for (y in ys until ye) {
            val srow = (y - dy) * s.w - dx
            val drow = y * width
            for (x in xs until xe) {
                val c = s.px[srow + x]
                if ((c ushr 24) == 0) continue
                var out = if (plain) c else Col.modulate(c, rm, gm, bm)
                if (alpha < 255) out = Col.withAlpha(out, (((out ushr 24) and 0xFF) * alpha) / 255)
                if ((out ushr 24) == 0xFF) px[drow + x] = out else blend(x, y, out)
            }
        }
    }

    /**
     * 回転付きスプライト転送 (最近傍サンプリング)。
     * スプライト内の (ax, ay) がバッファ上の (cx, cy) に来るように、
     * angle ラジアン(画面座標系・時計回り正)だけ回して描く。
     */
    fun drawRotated(
        s: Sprite,
        cx: Float,
        cy: Float,
        ax: Float,
        ay: Float,
        angle: Float,
        flipX: Boolean = false,
        tintColor: Int = Col.WHITE,
        alpha: Int = 255,
        /** この行より上のドットは描かない (建設中の「下から出来ていく」演出)。 */
        srcMinY: Int = 0
    ) {
        val ca = cos(angle)
        val sa = sin(angle)
        // 4 隅から描画範囲を求める
        var minX = Float.MAX_VALUE
        var minY = Float.MAX_VALUE
        var maxX = -Float.MAX_VALUE
        var maxY = -Float.MAX_VALUE
        for (k in 0 until 4) {
            val sx = if (k == 0 || k == 3) 0f else s.w.toFloat()
            val sy = if (k < 2) 0f else s.h.toFloat()
            val ox = sx - ax
            val oy = sy - ay
            val wx = cx + ca * ox - sa * oy
            val wy = cy + sa * ox + ca * oy
            minX = min(minX, wx); maxX = max(maxX, wx)
            minY = min(minY, wy); maxY = max(maxY, wy)
        }
        val xs = max(0, floor(minX).toInt() - 1)
        val ys = max(0, floor(minY).toInt() - 1)
        val xe = min(width, maxX.toInt() + 2)
        val ye = min(height, maxY.toInt() + 2)
        if (xs >= xe || ys >= ye) return
        val plain = tintColor == Col.WHITE
        val rm = Col.r(tintColor) + 1
        val gm = Col.g(tintColor) + 1
        val bm = Col.b(tintColor) + 1
        for (y in ys until ye) {
            val dy = y + 0.5f - cy
            for (x in xs until xe) {
                val dx = x + 0.5f - cx
                // 逆回転してスプライト座標へ
                var sx = (ca * dx + sa * dy) + ax
                val sy = (-sa * dx + ca * dy) + ay
                if (flipX) sx = s.w - sx
                val ix = floor(sx).toInt()
                val iy = floor(sy).toInt()
                if (ix < 0 || iy < srcMinY || ix >= s.w || iy >= s.h) continue
                val c = s.px[iy * s.w + ix]
                if ((c ushr 24) == 0) continue
                var out = if (plain) c else Col.modulate(c, rm, gm, bm)
                if (alpha < 255) out = Col.withAlpha(out, (((out ushr 24) and 0xFF) * alpha) / 255)
                blend(x, y, out)
            }
        }
    }

    /** 中心が明るい円形のグロー (加算)。 */
    fun glow(cx: Float, cy: Float, radius: Float, color: Int, strength: Float) {
        if (radius <= 0f || strength <= 0f) return
        val r0 = Col.r(color)
        val g0 = Col.g(color)
        val b0 = Col.b(color)
        val xs = max(0, (cx - radius).toInt())
        val ys = max(0, (cy - radius).toInt())
        val xe = min(width, (cx + radius).toInt() + 1)
        val ye = min(height, (cy + radius).toInt() + 1)
        val rr = radius * radius
        for (y in ys until ye) {
            val dy = y + 0.5f - cy
            for (x in xs until xe) {
                val dx = x + 0.5f - cx
                val d2 = dx * dx + dy * dy
                if (d2 >= rr) continue
                var f = 1f - d2 / rr
                f *= f * strength
                addLight(x, y, (r0 * f).toInt(), (g0 * f).toInt(), (b0 * f).toInt())
            }
        }
    }

    /** アルファ付きの小さな矩形 (煙などの粒に使う)。 */
    fun blendRect(x0: Int, y0: Int, w: Int, h: Int, color: Int) {
        for (y in y0 until y0 + h) for (x in x0 until x0 + w) blend(x, y, color)
    }

    fun toSprite(): Sprite = Sprite(width, height, px.copyOf())
}

/** 決定的な擬似乱数 (xorshift)。テクスチャ生成用。 */
class Rnd(seed: Int) {
    private var s: Int = if (seed == 0) 0x9E3779B9.toInt() else seed

    fun next(): Int {
        var x = s
        x = x xor (x shl 13)
        x = x xor (x ushr 17)
        x = x xor (x shl 5)
        s = x
        return x
    }

    fun int(bound: Int): Int = if (bound <= 0) 0 else ((next() ushr 1) % bound)

    fun float(): Float = (next() ushr 8) / 16777216f

    fun range(a: Float, b: Float): Float = a + (b - a) * float()
}

fun smoothstep(edge0: Float, edge1: Float, x: Float): Float {
    if (edge1 == edge0) return if (x < edge0) 0f else 1f
    val t = ((x - edge0) / (edge1 - edge0)).coerceIn(0f, 1f)
    return t * t * (3f - 2f * t)
}

fun fract(x: Float): Float = x - floor(x)

fun angleDiff(a: Float, b: Float): Float {
    var d = a - b
    while (d > Math.PI.toFloat()) d -= (2.0 * Math.PI).toFloat()
    while (d < -Math.PI.toFloat()) d += (2.0 * Math.PI).toFloat()
    return d
}

fun absF(x: Float): Float = abs(x)
