package com.rollerdash.arena.gl

import android.opengl.GLES30

/**
 * Static indexed geometry: position, normal and an ambient-occlusion-ish shade
 * value baked per vertex. Colour comes from a uniform so one cube can be the
 * whole mech.
 */
class Mesh(vertices: FloatArray, indices: ShortArray) {
    private val vbo = IntArray(1)
    private val ibo = IntArray(1)
    val indexCount = indices.size

    init {
        GLES30.glGenBuffers(1, vbo, 0)
        GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, vbo[0])
        val vb = floatBuffer(vertices)
        GLES30.glBufferData(GLES30.GL_ARRAY_BUFFER, vertices.size * 4, vb, GLES30.GL_STATIC_DRAW)

        GLES30.glGenBuffers(1, ibo, 0)
        GLES30.glBindBuffer(GLES30.GL_ELEMENT_ARRAY_BUFFER, ibo[0])
        val ib = shortBuffer(indices)
        GLES30.glBufferData(GLES30.GL_ELEMENT_ARRAY_BUFFER, indices.size * 2, ib, GLES30.GL_STATIC_DRAW)

        GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, 0)
        GLES30.glBindBuffer(GLES30.GL_ELEMENT_ARRAY_BUFFER, 0)
    }

    /** Binds the buffers and wires up the vertex attributes for [program]. */
    fun bind(program: ShaderProgram) {
        GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, vbo[0])
        GLES30.glBindBuffer(GLES30.GL_ELEMENT_ARRAY_BUFFER, ibo[0])
        val stride = STRIDE * 4
        val pos = program.attrib("aPos")
        if (pos >= 0) {
            GLES30.glEnableVertexAttribArray(pos)
            GLES30.glVertexAttribPointer(pos, 3, GLES30.GL_FLOAT, false, stride, 0)
        }
        val nrm = program.attrib("aNormal")
        if (nrm >= 0) {
            GLES30.glEnableVertexAttribArray(nrm)
            GLES30.glVertexAttribPointer(nrm, 3, GLES30.GL_FLOAT, false, stride, 3 * 4)
        }
        val shade = program.attrib("aShade")
        if (shade >= 0) {
            GLES30.glEnableVertexAttribArray(shade)
            GLES30.glVertexAttribPointer(shade, 1, GLES30.GL_FLOAT, false, stride, 6 * 4)
        }
    }

    fun draw() = GLES30.glDrawElements(GLES30.GL_TRIANGLES, indexCount, GLES30.GL_UNSIGNED_SHORT, 0)

    fun release() {
        GLES30.glDeleteBuffers(1, vbo, 0)
        GLES30.glDeleteBuffers(1, ibo, 0)
    }

    companion object {
        /** floats per vertex: 3 position, 3 normal, 1 shade */
        const val STRIDE = 7
    }
}
