package com.rollerdash.arena.gl

import android.opengl.GLES30
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer

/**
 * Dynamic quad stream shared by the 3D effects and the 2D HUD.
 * Vertex layout: position (3), uv (2), colour (4).
 */
class QuadBatch(private val maxQuads: Int) {
    private val floatsPerVertex = 9
    private val data = FloatArray(maxQuads * 4 * floatsPerVertex)
    // Uploaded from one persistent direct buffer: flushing must not allocate.
    private val upload: FloatBuffer = ByteBuffer
        .allocateDirect(data.size * 4)
        .order(ByteOrder.nativeOrder())
        .asFloatBuffer()
    private var count = 0

    private val vbo = IntArray(1)
    private val ibo = IntArray(1)

    init {
        GLES30.glGenBuffers(1, vbo, 0)
        GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, vbo[0])
        GLES30.glBufferData(GLES30.GL_ARRAY_BUFFER, data.size * 4, null, GLES30.GL_DYNAMIC_DRAW)

        val indices = ShortArray(maxQuads * 6)
        for (q in 0 until maxQuads) {
            val v = (q * 4).toShort()
            val o = q * 6
            indices[o] = v
            indices[o + 1] = (v + 1).toShort()
            indices[o + 2] = (v + 2).toShort()
            indices[o + 3] = v
            indices[o + 4] = (v + 2).toShort()
            indices[o + 5] = (v + 3).toShort()
        }
        GLES30.glGenBuffers(1, ibo, 0)
        GLES30.glBindBuffer(GLES30.GL_ELEMENT_ARRAY_BUFFER, ibo[0])
        GLES30.glBufferData(GLES30.GL_ELEMENT_ARRAY_BUFFER, indices.size * 2, shortBuffer(indices), GLES30.GL_STATIC_DRAW)

        GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, 0)
        GLES30.glBindBuffer(GLES30.GL_ELEMENT_ARRAY_BUFFER, 0)
    }

    val isEmpty: Boolean get() = count == 0
    val quadCount: Int get() = count

    fun begin() { count = 0 }

    private fun put(o: Int, x: Float, y: Float, z: Float, u: Float, v: Float, r: Float, g: Float, b: Float, a: Float) {
        data[o] = x; data[o + 1] = y; data[o + 2] = z
        data[o + 3] = u; data[o + 4] = v
        data[o + 5] = r; data[o + 6] = g; data[o + 7] = b; data[o + 8] = a
    }

    /** Adds a quad from four explicit corners, wound counter-clockwise. */
    fun addQuad(
        x0: Float, y0: Float, z0: Float,
        x1: Float, y1: Float, z1: Float,
        x2: Float, y2: Float, z2: Float,
        x3: Float, y3: Float, z3: Float,
        u0: Float, v0: Float, u1: Float, v1: Float,
        r: Float, g: Float, b: Float, a: Float,
    ) {
        if (count >= maxQuads) return
        var o = count * 4 * floatsPerVertex
        put(o, x0, y0, z0, u0, v1, r, g, b, a); o += floatsPerVertex
        put(o, x1, y1, z1, u1, v1, r, g, b, a); o += floatsPerVertex
        put(o, x2, y2, z2, u1, v0, r, g, b, a); o += floatsPerVertex
        put(o, x3, y3, z3, u0, v0, r, g, b, a)
        count++
    }

    /** Screen-space rectangle for the HUD. */
    fun addRect(
        x: Float, y: Float, w: Float, h: Float,
        r: Float, g: Float, b: Float, a: Float,
        u0: Float = 0f, v0: Float = 0f, u1: Float = 1f, v1: Float = 1f,
    ) = addQuad(
        x, y, 0f, x + w, y, 0f, x + w, y + h, 0f, x, y + h, 0f,
        u0, v0, u1, v1, r, g, b, a,
    )

    fun flush(program: ShaderProgram) {
        if (count == 0) return
        val floats = count * 4 * floatsPerVertex
        upload.clear()
        upload.put(data, 0, floats)
        upload.position(0)
        GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, vbo[0])
        GLES30.glBufferSubData(GLES30.GL_ARRAY_BUFFER, 0, floats * 4, upload)
        GLES30.glBindBuffer(GLES30.GL_ELEMENT_ARRAY_BUFFER, ibo[0])
        val stride = floatsPerVertex * 4
        val pos = program.attrib("aPos")
        if (pos >= 0) {
            GLES30.glEnableVertexAttribArray(pos)
            GLES30.glVertexAttribPointer(pos, 3, GLES30.GL_FLOAT, false, stride, 0)
        }
        val uv = program.attrib("aUV")
        if (uv >= 0) {
            GLES30.glEnableVertexAttribArray(uv)
            GLES30.glVertexAttribPointer(uv, 2, GLES30.GL_FLOAT, false, stride, 3 * 4)
        }
        val col = program.attrib("aColor")
        if (col >= 0) {
            GLES30.glEnableVertexAttribArray(col)
            GLES30.glVertexAttribPointer(col, 4, GLES30.GL_FLOAT, false, stride, 5 * 4)
        }
        GLES30.glDrawElements(GLES30.GL_TRIANGLES, count * 6, GLES30.GL_UNSIGNED_SHORT, 0)
        count = 0
    }

    fun release() {
        GLES30.glDeleteBuffers(1, vbo, 0)
        GLES30.glDeleteBuffers(1, ibo, 0)
    }
}
