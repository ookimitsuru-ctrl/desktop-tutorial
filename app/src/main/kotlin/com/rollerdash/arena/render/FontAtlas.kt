package com.rollerdash.arena.render

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.opengl.GLES30
import android.opengl.GLUtils
import com.rollerdash.arena.gl.QuadBatch

/**
 * A monospaced glyph sheet baked once into a texture at startup - no font files,
 * no per-frame Canvas work, and text lands in the same batch as the rest of the HUD.
 */
class FontAtlas(
    private val cell: Int = 64,
    private val cols: Int = 16,
    private val rows: Int = 6,
    private val firstChar: Int = 32,
) {
    private val tex = IntArray(1)
    val textureId: Int get() = tex[0]

    init {
        val bmp = Bitmap.createBitmap(cell * cols, cell * rows, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bmp)
        canvas.drawColor(Color.TRANSPARENT)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            typeface = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD)
            textSize = cell * 0.72f
            color = Color.WHITE
            textAlign = Paint.Align.CENTER
        }
        val fm = paint.fontMetrics
        val baselineOffset = (cell - (fm.descent + fm.ascent)) * 0.5f
        for (i in 0 until cols * rows) {
            val code = firstChar + i
            if (code > 126) break
            val col = i % cols
            val row = i / cols
            canvas.drawText(
                String(charArrayOf(code.toChar())),
                col * cell + cell * 0.5f,
                row * cell + baselineOffset,
                paint,
            )
        }

        GLES30.glGenTextures(1, tex, 0)
        GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, tex[0])
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MIN_FILTER, GLES30.GL_LINEAR)
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MAG_FILTER, GLES30.GL_LINEAR)
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_WRAP_S, GLES30.GL_CLAMP_TO_EDGE)
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_WRAP_T, GLES30.GL_CLAMP_TO_EDGE)
        GLUtils.texImage2D(GLES30.GL_TEXTURE_2D, 0, bmp, 0)
        bmp.recycle()
    }

    /** Horizontal advance for one character at the given cap height. */
    fun advance(size: Float) = size * 0.60f

    fun measure(text: String, size: Float) = advance(size) * text.length

    /**
     * Queues `text` with its left edge at (x, y), y being the top of the cap box.
     * Colours are 0..1.
     */
    fun draw(
        batch: QuadBatch,
        text: String,
        x: Float,
        y: Float,
        size: Float,
        r: Float, g: Float, b: Float, a: Float = 1f,
        centered: Boolean = false,
        rightAligned: Boolean = false,
    ) {
        val adv = advance(size)
        var penX = when {
            centered -> x - measure(text, size) * 0.5f
            rightAligned -> x - measure(text, size)
            else -> x
        }
        for (ch in text) {
            val code = ch.code
            if (code != 32 && code in firstChar..126) {
                val i = code - firstChar
                val col = i % cols
                val row = i / cols
                val u0 = col.toFloat() / cols
                val u1 = (col + 1f) / cols
                val vTop = row.toFloat() / rows
                val vBottom = (row + 1f) / rows
                // Screen y grows downward, so the glyph top takes the smaller v.
                batch.addRect(penX - size * 0.2f, y, size, size, r, g, b, a, u0, vBottom, u1, vTop)
            }
            penX += adv
        }
    }
}
