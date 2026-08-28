package com.rollerdash.arena.gl

import android.opengl.GLES30
import android.util.Log
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer
import java.nio.ShortBuffer

private const val TAG = "RollerDashGL"

fun floatBuffer(data: FloatArray): FloatBuffer =
    ByteBuffer.allocateDirect(data.size * 4).order(ByteOrder.nativeOrder()).asFloatBuffer().apply {
        put(data)
        position(0)
    }

fun shortBuffer(data: ShortArray): ShortBuffer =
    ByteBuffer.allocateDirect(data.size * 2).order(ByteOrder.nativeOrder()).asShortBuffer().apply {
        put(data)
        position(0)
    }

fun checkGl(where: String) {
    var err = GLES30.glGetError()
    while (err != GLES30.GL_NO_ERROR) {
        Log.e(TAG, "GL error 0x${err.toString(16)} at $where")
        err = GLES30.glGetError()
    }
}

/** A compiled shader pair plus a cache of uniform locations. */
class ShaderProgram(vertexSrc: String, fragmentSrc: String, val name: String = "program") {
    val id: Int = link(vertexSrc, fragmentSrc, name)
    private val uniforms = HashMap<String, Int>()
    private val attribs = HashMap<String, Int>()

    fun use() = GLES30.glUseProgram(id)

    fun uniform(n: String): Int = uniforms.getOrPut(n) { GLES30.glGetUniformLocation(id, n) }

    fun attrib(n: String): Int = attribs.getOrPut(n) { GLES30.glGetAttribLocation(id, n) }

    fun setMat4(n: String, m: FloatArray) = GLES30.glUniformMatrix4fv(uniform(n), 1, false, m, 0)
    fun setVec3(n: String, x: Float, y: Float, z: Float) = GLES30.glUniform3f(uniform(n), x, y, z)
    fun setVec4(n: String, x: Float, y: Float, z: Float, w: Float) = GLES30.glUniform4f(uniform(n), x, y, z, w)
    fun setFloat(n: String, v: Float) = GLES30.glUniform1f(uniform(n), v)
    fun setInt(n: String, v: Int) = GLES30.glUniform1i(uniform(n), v)

    companion object {
        private fun compile(type: Int, src: String, name: String): Int {
            val s = GLES30.glCreateShader(type)
            GLES30.glShaderSource(s, src)
            GLES30.glCompileShader(s)
            val status = IntArray(1)
            GLES30.glGetShaderiv(s, GLES30.GL_COMPILE_STATUS, status, 0)
            if (status[0] == 0) {
                val log = GLES30.glGetShaderInfoLog(s)
                GLES30.glDeleteShader(s)
                throw RuntimeException("$name shader failed to compile: $log")
            }
            return s
        }

        private fun link(vs: String, fs: String, name: String): Int {
            val v = compile(GLES30.GL_VERTEX_SHADER, vs, "$name.vert")
            val f = compile(GLES30.GL_FRAGMENT_SHADER, fs, "$name.frag")
            val p = GLES30.glCreateProgram()
            GLES30.glAttachShader(p, v)
            GLES30.glAttachShader(p, f)
            GLES30.glLinkProgram(p)
            val status = IntArray(1)
            GLES30.glGetProgramiv(p, GLES30.GL_LINK_STATUS, status, 0)
            if (status[0] == 0) {
                val log = GLES30.glGetProgramInfoLog(p)
                GLES30.glDeleteProgram(p)
                throw RuntimeException("$name failed to link: $log")
            }
            GLES30.glDeleteShader(v)
            GLES30.glDeleteShader(f)
            return p
        }
    }
}
