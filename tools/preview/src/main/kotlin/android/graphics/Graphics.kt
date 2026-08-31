@file:Suppress("unused")

package android.graphics

import java.awt.BasicStroke
import java.awt.RenderingHints
import java.awt.image.BufferedImage
import java.awt.Font as AwtFont
import java.awt.Color as AwtColor
import java.awt.Graphics2D

/** Minimal Bitmap/Canvas/Paint stand-ins backed by Java2D, for the font atlas. */
class Bitmap private constructor(val image: BufferedImage) {
    val width: Int get() = image.width
    val height: Int get() = image.height
    fun recycle() = Unit

    enum class Config { ARGB_8888, ALPHA_8 }

    companion object {
        @JvmStatic
        fun createBitmap(w: Int, h: Int, config: Config): Bitmap =
            Bitmap(BufferedImage(w, h, BufferedImage.TYPE_INT_ARGB))
    }
}

object Color {
    const val WHITE = -0x1
    const val BLACK = -0x1000000
    const val TRANSPARENT = 0
    @JvmStatic fun argb(a: Int, r: Int, g: Int, b: Int) = (a shl 24) or (r shl 16) or (g shl 8) or b
}

class Typeface private constructor(val family: String, val style: Int) {
    companion object {
        val MONOSPACE = Typeface("Monospaced", 0)
        val DEFAULT = Typeface("SansSerif", 0)
        const val NORMAL = 0
        const val BOLD = 1
        @JvmStatic fun create(base: Typeface, style: Int) = Typeface(base.family, style)
    }
}

class Paint(flags: Int = 0) {
    enum class Align { LEFT, CENTER, RIGHT }

    class FontMetrics {
        @JvmField var ascent = 0f
        @JvmField var descent = 0f
        @JvmField var top = 0f
        @JvmField var bottom = 0f
    }

    var typeface: Typeface = Typeface.DEFAULT
    var textSize: Float = 12f
    var color: Int = Color.WHITE
    var textAlign: Align = Align.LEFT
    var isAntiAlias: Boolean = flags and ANTI_ALIAS_FLAG != 0
    var strokeWidth: Float = 1f

    internal fun awtFont(): AwtFont {
        val style = if (typeface.style == Typeface.BOLD) AwtFont.BOLD else AwtFont.PLAIN
        return AwtFont(typeface.family, style, textSize.toInt().coerceAtLeast(1))
    }

    val fontMetrics: FontMetrics
        get() {
            val img = BufferedImage(1, 1, BufferedImage.TYPE_INT_ARGB)
            val g = img.createGraphics()
            val fm = g.getFontMetrics(awtFont())
            val out = FontMetrics()
            // Android's ascent is negative, Java2D's is positive.
            out.ascent = -fm.ascent.toFloat()
            out.descent = fm.descent.toFloat()
            out.top = out.ascent
            out.bottom = out.descent
            g.dispose()
            return out
        }

    companion object {
        const val ANTI_ALIAS_FLAG = 1
    }
}

class Canvas(private val bitmap: Bitmap) {
    private val g: Graphics2D = bitmap.image.createGraphics().apply {
        setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
        setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON)
        stroke = BasicStroke(1f)
    }

    fun drawColor(color: Int) {
        val old = g.composite
        g.composite = java.awt.AlphaComposite.Src
        g.color = AwtColor(color, true)
        g.fillRect(0, 0, bitmap.width, bitmap.height)
        g.composite = old
    }

    fun drawText(text: String, x: Float, y: Float, paint: Paint) {
        g.font = paint.awtFont()
        g.color = AwtColor(paint.color, true)
        val fm = g.fontMetrics
        val w = fm.stringWidth(text)
        val drawX = when (paint.textAlign) {
            Paint.Align.CENTER -> x - w * 0.5f
            Paint.Align.RIGHT -> x - w
            Paint.Align.LEFT -> x
        }
        g.drawString(text, drawX, y)
    }
}
