@file:Suppress("FunctionName", "unused")

package android.opengl

import java.nio.Buffer
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer
import java.nio.IntBuffer
import java.nio.ShortBuffer
import org.lwjgl.opengles.GLES30 as GL

/**
 * Desktop stand-in for Android's GLES30 binding, forwarding to a real OpenGL ES
 * context through LWJGL. It exists so the game's own renderer - not a copy of it -
 * can be run on a build machine and screenshotted.
 */
object GLES30 {
    const val GL_ARRAY_BUFFER = 0x8892
    const val GL_ELEMENT_ARRAY_BUFFER = 0x8893
    const val GL_STATIC_DRAW = 0x88E4
    const val GL_DYNAMIC_DRAW = 0x88E8
    const val GL_FLOAT = 0x1406
    const val GL_UNSIGNED_SHORT = 0x1403
    const val GL_UNSIGNED_BYTE = 0x1401
    const val GL_TRIANGLES = 0x0004
    const val GL_VERTEX_SHADER = 0x8B31
    const val GL_FRAGMENT_SHADER = 0x8B30
    const val GL_COMPILE_STATUS = 0x8B81
    const val GL_LINK_STATUS = 0x8B82
    const val GL_NO_ERROR = 0
    const val GL_DEPTH_TEST = 0x0B71
    const val GL_CULL_FACE = 0x0B44
    const val GL_BLEND = 0x0BE2
    const val GL_BACK = 0x0405
    const val GL_FRONT = 0x0404
    const val GL_SRC_ALPHA = 0x0302
    const val GL_ONE_MINUS_SRC_ALPHA = 0x0303
    const val GL_ONE = 1
    const val GL_ZERO = 0
    const val GL_COLOR_BUFFER_BIT = 0x4000
    const val GL_DEPTH_BUFFER_BIT = 0x0100
    const val GL_TEXTURE_2D = 0x0DE1
    const val GL_TEXTURE0 = 0x84C0
    const val GL_TEXTURE_MIN_FILTER = 0x2801
    const val GL_TEXTURE_MAG_FILTER = 0x2800
    const val GL_TEXTURE_WRAP_S = 0x2802
    const val GL_TEXTURE_WRAP_T = 0x2803
    const val GL_LINEAR = 0x2601
    const val GL_NEAREST = 0x2600
    const val GL_CLAMP_TO_EDGE = 0x812F
    const val GL_RGBA = 0x1908
    const val GL_RGBA8 = 0x8058
    const val GL_RGBA16F = 0x881A
    const val GL_RGB = 0x1907
    const val GL_HALF_FLOAT = 0x140B
    const val GL_FRAMEBUFFER = 0x8D40
    const val GL_RENDERBUFFER = 0x8D41
    const val GL_COLOR_ATTACHMENT0 = 0x8CE0
    const val GL_DEPTH_ATTACHMENT = 0x8D00
    const val GL_DEPTH_COMPONENT16 = 0x81A5
    const val GL_DEPTH_COMPONENT24 = 0x81A6
    const val GL_DEPTH_COMPONENT = 0x1902
    const val GL_UNSIGNED_INT = 0x1405
    const val GL_FRAMEBUFFER_COMPLETE = 0x8CD5
    const val GL_TEXTURE_COMPARE_MODE = 0x884C
    const val GL_TEXTURE_COMPARE_FUNC = 0x884D
    const val GL_COMPARE_REF_TO_TEXTURE = 0x884E
    const val GL_LEQUAL = 0x0203
    const val GL_TEXTURE1 = 0x84C1
    const val GL_TEXTURE2 = 0x84C2
    const val GL_TEXTURE3 = 0x84C3
    const val GL_NONE = 0
    const val GL_DEPTH_COMPONENT32F = 0x8CAC
    const val GL_CLAMP_TO_BORDER = 0x812D
    const val GL_R11F_G11F_B10F = 0x8C3A
    const val GL_RGB16F = 0x881B
    const val GL_SCISSOR_TEST = 0x0C11
    const val GL_POLYGON_OFFSET_FILL = 0x8037
    const val GL_FRONT_AND_BACK = 0x0408
    const val GL_MAX_SAMPLES = 0x8D57

    fun glViewport(x: Int, y: Int, w: Int, h: Int) = GL.glViewport(x, y, w, h)
    fun glScissor(x: Int, y: Int, w: Int, h: Int) = GL.glScissor(x, y, w, h)
    fun glClearColor(r: Float, g: Float, b: Float, a: Float) = GL.glClearColor(r, g, b, a)
    fun glClear(mask: Int) = GL.glClear(mask)
    fun glEnable(cap: Int) = GL.glEnable(cap)
    fun glDisable(cap: Int) = GL.glDisable(cap)
    fun glCullFace(mode: Int) = GL.glCullFace(mode)
    fun glDepthMask(flag: Boolean) = GL.glDepthMask(flag)
    fun glDepthFunc(func: Int) = GL.glDepthFunc(func)
    fun glBlendFunc(s: Int, d: Int) = GL.glBlendFunc(s, d)
    fun glPolygonOffset(factor: Float, units: Float) = GL.glPolygonOffset(factor, units)
    fun glGetError(): Int = GL.glGetError()
    fun glFinish() = GL.glFinish()

    fun glCreateShader(type: Int): Int = GL.glCreateShader(type)
    fun glShaderSource(shader: Int, src: String) = GL.glShaderSource(shader, src)
    fun glCompileShader(shader: Int) = GL.glCompileShader(shader)
    fun glGetShaderiv(shader: Int, pname: Int, params: IntArray, offset: Int) {
        params[offset] = GL.glGetShaderi(shader, pname)
    }
    fun glGetShaderInfoLog(shader: Int): String = GL.glGetShaderInfoLog(shader)
    fun glDeleteShader(shader: Int) = GL.glDeleteShader(shader)
    fun glCreateProgram(): Int = GL.glCreateProgram()
    fun glAttachShader(p: Int, s: Int) = GL.glAttachShader(p, s)
    fun glLinkProgram(p: Int) = GL.glLinkProgram(p)
    fun glGetProgramiv(p: Int, pname: Int, params: IntArray, offset: Int) {
        params[offset] = GL.glGetProgrami(p, pname)
    }
    fun glGetProgramInfoLog(p: Int): String = GL.glGetProgramInfoLog(p)
    fun glDeleteProgram(p: Int) = GL.glDeleteProgram(p)
    fun glUseProgram(p: Int) = GL.glUseProgram(p)
    fun glGetUniformLocation(p: Int, name: String): Int = GL.glGetUniformLocation(p, name)
    fun glGetAttribLocation(p: Int, name: String): Int = GL.glGetAttribLocation(p, name)
    fun glUniform1i(loc: Int, v: Int) = GL.glUniform1i(loc, v)
    fun glUniform1f(loc: Int, v: Float) = GL.glUniform1f(loc, v)
    fun glUniform2f(loc: Int, x: Float, y: Float) = GL.glUniform2f(loc, x, y)
    fun glUniform3f(loc: Int, x: Float, y: Float, z: Float) = GL.glUniform3f(loc, x, y, z)
    fun glUniform4f(loc: Int, x: Float, y: Float, z: Float, w: Float) = GL.glUniform4f(loc, x, y, z, w)
    fun glUniform4fv(loc: Int, count: Int, value: FloatArray, offset: Int) {
        val fb = tempFloats(4 * count)
        fb.put(value, offset, 4 * count)
        fb.flip()
        GL.glUniform4fv(loc, fb)
    }
    fun glUniform3fv(loc: Int, count: Int, value: FloatArray, offset: Int) {
        val fb = tempFloats(3 * count)
        fb.put(value, offset, 3 * count)
        fb.flip()
        GL.glUniform3fv(loc, fb)
    }
    fun glUniformMatrix4fv(loc: Int, count: Int, transpose: Boolean, value: FloatArray, offset: Int) {
        val fb = tempFloats(16 * count)
        fb.put(value, offset, 16 * count)
        fb.flip()
        GL.glUniformMatrix4fv(loc, transpose, fb)
    }

    fun glGenBuffers(n: Int, buffers: IntArray, offset: Int) {
        for (i in 0 until n) buffers[offset + i] = GL.glGenBuffers()
    }
    fun glDeleteBuffers(n: Int, buffers: IntArray, offset: Int) {
        for (i in 0 until n) GL.glDeleteBuffers(buffers[offset + i])
    }
    fun glBindBuffer(target: Int, buffer: Int) = GL.glBindBuffer(target, buffer)
    fun glBufferData(target: Int, size: Int, data: Buffer?, usage: Int) {
        when (data) {
            null -> GL.glBufferData(target, size.toLong(), usage)
            is FloatBuffer -> withLimit(data, size / 4) { GL.glBufferData(target, it, usage) }
            is ShortBuffer -> withLimit(data, size / 2) { GL.glBufferData(target, it, usage) }
            is ByteBuffer -> withLimit(data, size) { GL.glBufferData(target, it, usage) }
            else -> throw IllegalArgumentException("unsupported buffer ${data.javaClass}")
        }
    }
    fun glBufferSubData(target: Int, offset: Int, size: Int, data: Buffer) {
        when (data) {
            is FloatBuffer -> withLimit(data, size / 4) { GL.glBufferSubData(target, offset.toLong(), it) }
            is ShortBuffer -> withLimit(data, size / 2) { GL.glBufferSubData(target, offset.toLong(), it) }
            is ByteBuffer -> withLimit(data, size) { GL.glBufferSubData(target, offset.toLong(), it) }
            else -> throw IllegalArgumentException("unsupported buffer ${data.javaClass}")
        }
    }
    fun glEnableVertexAttribArray(index: Int) = GL.glEnableVertexAttribArray(index)
    fun glDisableVertexAttribArray(index: Int) = GL.glDisableVertexAttribArray(index)
    fun glVertexAttribPointer(index: Int, size: Int, type: Int, normalized: Boolean, stride: Int, offset: Int) =
        GL.glVertexAttribPointer(index, size, type, normalized, stride, offset.toLong())
    fun glDrawElements(mode: Int, count: Int, type: Int, offset: Int) =
        GL.glDrawElements(mode, count, type, offset.toLong())
    fun glDrawArrays(mode: Int, first: Int, count: Int) = GL.glDrawArrays(mode, first, count)

    fun glGenTextures(n: Int, textures: IntArray, offset: Int) {
        for (i in 0 until n) textures[offset + i] = GL.glGenTextures()
    }
    fun glDeleteTextures(n: Int, textures: IntArray, offset: Int) {
        for (i in 0 until n) GL.glDeleteTextures(textures[offset + i])
    }
    fun glBindTexture(target: Int, texture: Int) = GL.glBindTexture(target, texture)
    fun glActiveTexture(unit: Int) = GL.glActiveTexture(unit)
    fun glTexParameteri(target: Int, pname: Int, param: Int) = GL.glTexParameteri(target, pname, param)
    fun glTexImage2D(
        target: Int, level: Int, internalFormat: Int, width: Int, height: Int,
        border: Int, format: Int, type: Int, pixels: Buffer?,
    ) {
        when (pixels) {
            null -> GL.glTexImage2D(target, level, internalFormat, width, height, border, format, type, null as ByteBuffer?)
            is ByteBuffer -> GL.glTexImage2D(target, level, internalFormat, width, height, border, format, type, pixels)
            else -> throw IllegalArgumentException("unsupported pixel buffer")
        }
    }

    fun glGenFramebuffers(n: Int, fb: IntArray, offset: Int) {
        for (i in 0 until n) fb[offset + i] = GL.glGenFramebuffers()
    }
    fun glDeleteFramebuffers(n: Int, fb: IntArray, offset: Int) {
        for (i in 0 until n) GL.glDeleteFramebuffers(fb[offset + i])
    }
    fun glBindFramebuffer(target: Int, fb: Int) = GL.glBindFramebuffer(target, fb)
    fun glFramebufferTexture2D(target: Int, attachment: Int, texTarget: Int, texture: Int, level: Int) =
        GL.glFramebufferTexture2D(target, attachment, texTarget, texture, level)
    fun glCheckFramebufferStatus(target: Int): Int = GL.glCheckFramebufferStatus(target)
    fun glGenRenderbuffers(n: Int, rb: IntArray, offset: Int) {
        for (i in 0 until n) rb[offset + i] = GL.glGenRenderbuffers()
    }
    fun glDeleteRenderbuffers(n: Int, rb: IntArray, offset: Int) {
        for (i in 0 until n) GL.glDeleteRenderbuffers(rb[offset + i])
    }
    fun glBindRenderbuffer(target: Int, rb: Int) = GL.glBindRenderbuffer(target, rb)
    fun glRenderbufferStorage(target: Int, format: Int, w: Int, h: Int) =
        GL.glRenderbufferStorage(target, format, w, h)
    fun glFramebufferRenderbuffer(target: Int, attachment: Int, rbTarget: Int, rb: Int) =
        GL.glFramebufferRenderbuffer(target, attachment, rbTarget, rb)
    fun glDrawBuffers(n: Int, bufs: IntArray, offset: Int) {
        val ib = IntBuffer.allocate(n)
        for (i in 0 until n) ib.put(bufs[offset + i])
        ib.flip()
        val direct = ByteBuffer.allocateDirect(n * 4).order(ByteOrder.nativeOrder()).asIntBuffer()
        direct.put(ib).flip()
        GL.glDrawBuffers(direct)
    }
    fun glGetIntegerv(pname: Int, params: IntArray, offset: Int) {
        params[offset] = GL.glGetInteger(pname)
    }
    fun glReadPixels(x: Int, y: Int, w: Int, h: Int, format: Int, type: Int, pixels: Buffer) {
        GL.glReadPixels(x, y, w, h, format, type, pixels as ByteBuffer)
    }

    private val scratch = ThreadLocal.withInitial {
        ByteBuffer.allocateDirect(64 * 1024).order(ByteOrder.nativeOrder()).asFloatBuffer()
    }

    private fun tempFloats(count: Int): FloatBuffer {
        val b = scratch.get()
        b.clear()
        b.limit(count)
        b.position(0)
        return b
    }

    private inline fun <T : Buffer> withLimit(buffer: T, limit: Int, body: (T) -> Unit) {
        val saved = buffer.limit()
        val pos = buffer.position()
        if (limit in 0..buffer.capacity()) buffer.limit(limit)
        body(buffer)
        buffer.limit(saved)
        buffer.position(pos)
    }
}
