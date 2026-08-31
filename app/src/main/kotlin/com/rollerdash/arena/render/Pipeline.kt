package com.rollerdash.arena.render

import android.opengl.GLES30
import com.rollerdash.arena.gl.ShaderProgram

/**
 * An offscreen surface the scene or a post-processing step draws into.
 * Colour is kept in a floating point format so highlights can go past white and
 * be tone mapped later, which is what stops explosions looking like flat paint.
 */
class RenderTarget(
    val width: Int,
    val height: Int,
    private val internalFormat: Int = GLES30.GL_R11F_G11F_B10F,
    withDepth: Boolean = false,
) {
    private val fboIds = IntArray(1)
    private val texIds = IntArray(1)
    private val depthIds = IntArray(1)
    private val hasDepth = withDepth

    val framebuffer: Int get() = fboIds[0]
    val texture: Int get() = texIds[0]

    init {
        GLES30.glGenTextures(1, texIds, 0)
        GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, texIds[0])
        val (format, type) = when (internalFormat) {
            GLES30.GL_R11F_G11F_B10F -> GLES30.GL_RGB to GLES30.GL_HALF_FLOAT
            GLES30.GL_RGBA8 -> GLES30.GL_RGBA to GLES30.GL_UNSIGNED_BYTE
            else -> GLES30.GL_RGBA to GLES30.GL_UNSIGNED_BYTE
        }
        GLES30.glTexImage2D(GLES30.GL_TEXTURE_2D, 0, internalFormat, width, height, 0, format, type, null)
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MIN_FILTER, GLES30.GL_LINEAR)
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MAG_FILTER, GLES30.GL_LINEAR)
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_WRAP_S, GLES30.GL_CLAMP_TO_EDGE)
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_WRAP_T, GLES30.GL_CLAMP_TO_EDGE)

        GLES30.glGenFramebuffers(1, fboIds, 0)
        GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, fboIds[0])
        GLES30.glFramebufferTexture2D(
            GLES30.GL_FRAMEBUFFER, GLES30.GL_COLOR_ATTACHMENT0, GLES30.GL_TEXTURE_2D, texIds[0], 0,
        )
        if (withDepth) {
            GLES30.glGenRenderbuffers(1, depthIds, 0)
            GLES30.glBindRenderbuffer(GLES30.GL_RENDERBUFFER, depthIds[0])
            GLES30.glRenderbufferStorage(GLES30.GL_RENDERBUFFER, GLES30.GL_DEPTH_COMPONENT24, width, height)
            GLES30.glFramebufferRenderbuffer(
                GLES30.GL_FRAMEBUFFER, GLES30.GL_DEPTH_ATTACHMENT, GLES30.GL_RENDERBUFFER, depthIds[0],
            )
        }
        val status = GLES30.glCheckFramebufferStatus(GLES30.GL_FRAMEBUFFER)
        check(status == GLES30.GL_FRAMEBUFFER_COMPLETE) {
            "render target ${width}x$height incomplete: 0x${status.toString(16)}"
        }
        GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, 0)
    }

    fun bind() {
        GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, fboIds[0])
        GLES30.glViewport(0, 0, width, height)
    }

    fun bindTexture(unit: Int) {
        GLES30.glActiveTexture(GLES30.GL_TEXTURE0 + unit)
        GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, texIds[0])
    }

    fun release() {
        GLES30.glDeleteFramebuffers(1, fboIds, 0)
        GLES30.glDeleteTextures(1, texIds, 0)
        if (hasDepth) GLES30.glDeleteRenderbuffers(1, depthIds, 0)
    }
}

/** Depth-only target the sun renders into, sampled with hardware comparison. */
class ShadowMap(val size: Int) {
    private val fboIds = IntArray(1)
    private val texIds = IntArray(1)

    val texture: Int get() = texIds[0]
    val texelSize: Float get() = 1f / size

    init {
        GLES30.glGenTextures(1, texIds, 0)
        GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, texIds[0])
        GLES30.glTexImage2D(
            GLES30.GL_TEXTURE_2D, 0, GLES30.GL_DEPTH_COMPONENT24, size, size, 0,
            GLES30.GL_DEPTH_COMPONENT, GLES30.GL_UNSIGNED_INT, null,
        )
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MIN_FILTER, GLES30.GL_LINEAR)
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MAG_FILTER, GLES30.GL_LINEAR)
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_WRAP_S, GLES30.GL_CLAMP_TO_EDGE)
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_WRAP_T, GLES30.GL_CLAMP_TO_EDGE)
        // Hardware PCF: sampling returns the comparison result, not the depth.
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_COMPARE_MODE, GLES30.GL_COMPARE_REF_TO_TEXTURE)
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_COMPARE_FUNC, GLES30.GL_LEQUAL)

        GLES30.glGenFramebuffers(1, fboIds, 0)
        GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, fboIds[0])
        GLES30.glFramebufferTexture2D(
            GLES30.GL_FRAMEBUFFER, GLES30.GL_DEPTH_ATTACHMENT, GLES30.GL_TEXTURE_2D, texIds[0], 0,
        )
        val none = intArrayOf(GLES30.GL_NONE)
        GLES30.glDrawBuffers(1, none, 0)
        val status = GLES30.glCheckFramebufferStatus(GLES30.GL_FRAMEBUFFER)
        check(status == GLES30.GL_FRAMEBUFFER_COMPLETE) {
            "shadow map incomplete: 0x${status.toString(16)}"
        }
        GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, 0)
    }

    fun bind() {
        GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, fboIds[0])
        GLES30.glViewport(0, 0, size, size)
    }

    fun bindTexture(unit: Int) {
        GLES30.glActiveTexture(GLES30.GL_TEXTURE0 + unit)
        GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, texIds[0])
    }

    fun release() {
        GLES30.glDeleteFramebuffers(1, fboIds, 0)
        GLES30.glDeleteTextures(1, texIds, 0)
    }
}

/**
 * Bright-pass plus a separable blur, run at half resolution. Everything that
 * glows in the game - thrusters, tracers, the scope lens, explosions - reads as
 * light rather than as paint because of this pass.
 */
class BloomChain(width: Int, height: Int) {
    private val w = maxOf(1, width / 2)
    private val h = maxOf(1, height / 2)
    val bright = RenderTarget(w, h)
    private val ping = RenderTarget(w, h)
    private val pong = RenderTarget(w, h)

    val result: RenderTarget get() = ping

    fun run(scene: RenderTarget, brightProgram: ShaderProgram, blurProgram: ShaderProgram, drawFullscreen: () -> Unit) {
        bright.bind()
        brightProgram.use()
        scene.bindTexture(0)
        brightProgram.setInt("uScene", 0)
        brightProgram.setFloat("uThreshold", 1.05f)
        brightProgram.setFloat("uKnee", 0.6f)
        drawFullscreen()

        var source = bright
        blurProgram.use()
        blurProgram.setInt("uSource", 0)
        // Two widening passes; horizontal then vertical each time.
        for (pass in 0 until 2) {
            val radius = 1f + pass * 2.2f
            pong.bind()
            source.bindTexture(0)
            blurProgram.setVec2("uDirection", radius / w, 0f)
            drawFullscreen()

            ping.bind()
            pong.bindTexture(0)
            blurProgram.setVec2("uDirection", 0f, radius / h)
            drawFullscreen()
            source = ping
        }
    }

    fun release() {
        bright.release()
        ping.release()
        pong.release()
    }
}
