package preview

import android.opengl.GLES30
import com.rollerdash.arena.Audio
import com.rollerdash.arena.Game
import com.rollerdash.arena.render.GameRenderer
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.awt.image.BufferedImage
import javax.imageio.ImageIO
import org.lwjgl.egl.EGL
import org.lwjgl.egl.EGL10
import org.lwjgl.egl.EGL12
import org.lwjgl.egl.EGL13
import org.lwjgl.egl.EGL14
import org.lwjgl.egl.EGL15
import org.lwjgl.opengles.GLES as LwjglGLES
import org.lwjgl.system.MemoryStack

/**
 * Runs the real renderer on a build machine and writes PNGs.
 *
 * The game's Android GL calls are forwarded to a desktop OpenGL ES context by
 * the shims in this module, so what comes out is what the phone draws - which
 * makes it possible to work on how the game looks without a device in hand.
 *
 *   EGL_PLATFORM=surfaceless LIBGL_ALWAYS_SOFTWARE=1 ./gradlew run
 */
object Preview {

    private var width = 1600
    private var height = 900
    private var fbo = 0
    private var colorTex = 0
    private lateinit var readback: ByteBuffer
    private lateinit var outDir: File

    @JvmStatic
    fun main(args: Array<String>) {
        outDir = File(args.getOrNull(0) ?: "shots").apply { mkdirs() }
        if (args.size >= 3) {
            width = args[1].toInt()
            height = args[2].toInt()
        }

        initContext()
        createTarget()

        val audio = Audio()
        val game = Game(audio)
        val renderer = GameRenderer(game)
        renderer.outputFramebuffer = fbo
        renderer.fixedTimeStep = 1f / 60f
        renderer.onSurfaceCreated(null, null)
        renderer.onSurfaceChanged(null, width, height)
        GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, fbo)

        val pad = game.controls.gamepad
        pad.connected = true

        // Frames are stepped one at a time so a shot can be taken at the exact
        // moment something is happening - mid-dash, mid-explosion - rather than
        // whenever a block of simulation happens to end.
        fun step(frames: Int, shots: Map<Int, String> = emptyMap(), body: (Int) -> Unit = {}) {
            for (i in 0 until frames) {
                body(i)
                renderer.onDrawFrame(null)
                shots[i]?.let { capture(it) }
            }
        }

        fun clearPad() {
            pad.leftX = 0f; pad.leftY = 0f; pad.rightX = 0f
            pad.dash = false; pad.jump = false; pad.fireR = false; pad.fireL = false
            pad.fireC = false; pad.guard = false
        }

        step(45, mapOf(44 to "01-title"))

        game.startBattle()
        step(150, mapOf(149 to "02-approach")) { pad.leftY = -0.6f }

        // Mid roller dash: boosters lit, dust and sparks off the wheels.
        step(30, mapOf(10 to "03-dash", 22 to "03b-dash-late")) { i ->
            clearPad()
            pad.leftY = -1f
            pad.dash = i == 0
            pad.fireR = i > 6 && i % 5 < 2
        }

        // Airborne, thrusters pointing down, shooting on the way up.
        step(48, mapOf(14 to "04-jump", 34 to "04b-hover")) { i ->
            clearPad()
            pad.leftY = -0.5f
            pad.jump = i < 22
            pad.fireR = i % 6 < 2
            pad.fireL = i == 8
        }

        step(60, mapOf(40 to "05-strafe")) { i ->
            clearPad()
            pad.leftX = 0.9f
            pad.fireR = i % 7 < 2
            pad.fireL = i % 26 == 0
        }

        // A staged blast in front of the player, to judge the explosion itself.
        run {
            val player = game.battle.player
            val ahead = player.center +
                com.rollerdash.arena.core.forwardOf(player.yaw) * 9f + com.rollerdash.arena.core.Vec3(0f, 1.5f, 0f)
            game.effects.explosion(ahead, 9f)
            game.lights.add(ahead, 1f, 0.62f, 0.26f, 13f, 40f, 0.45f)
            step(40, mapOf(1 to "06-blast", 6 to "06b-fireball", 20 to "06c-smoke")) { clearPad() }
        }

        step(150, mapOf(80 to "07-brawl", 149 to "07b-brawl-late")) { i ->
            clearPad()
            pad.leftY = -1f
            pad.dash = i % 40 == 0
            pad.fireC = i % 50 == 0
            pad.fireR = i % 6 < 2
        }

        step(240, mapOf(120 to "08-mid-round", 239 to "08b-late-round")) { i ->
            clearPad()
            pad.leftY = if (i % 60 < 30) -1f else 0.4f
            pad.leftX = if (i % 90 < 45) 0.8f else -0.8f
            pad.fireR = i % 7 < 2
            pad.fireL = i % 33 == 0
            pad.dash = i % 50 == 0
        }

        println("wrote ${outDir.listFiles()?.size ?: 0} images to ${outDir.absolutePath}")
    }

    private fun initContext() {
        // LWJGL loads libEGL on first use; calling create() again throws.
        val dpy = EGL10.eglGetDisplay(EGL14.EGL_DEFAULT_DISPLAY)
        check(dpy != EGL10.EGL_NO_DISPLAY) { "no EGL display (set EGL_PLATFORM=surfaceless)" }
        MemoryStack.stackPush().use { stack ->
            val major = stack.mallocInt(1)
            val minor = stack.mallocInt(1)
            check(EGL10.eglInitialize(dpy, major, minor)) { "eglInitialize failed" }
            EGL.createDisplayCapabilities(dpy, major.get(0), minor.get(0))
            check(EGL12.eglBindAPI(EGL12.EGL_OPENGL_ES_API)) { "eglBindAPI failed" }

            val configAttribs = stack.ints(
                EGL12.EGL_RENDERABLE_TYPE, EGL15.EGL_OPENGL_ES3_BIT,
                EGL10.EGL_SURFACE_TYPE, EGL10.EGL_PBUFFER_BIT,
                EGL10.EGL_RED_SIZE, 8,
                EGL10.EGL_GREEN_SIZE, 8,
                EGL10.EGL_BLUE_SIZE, 8,
                EGL10.EGL_ALPHA_SIZE, 8,
                EGL10.EGL_DEPTH_SIZE, 24,
                EGL10.EGL_NONE,
            )
            val configs = stack.mallocPointer(1)
            val count = stack.mallocInt(1)
            check(EGL10.eglChooseConfig(dpy, configAttribs, configs, count) && count.get(0) > 0) {
                "no suitable EGL config"
            }
            val ctxAttribs = stack.ints(EGL13.EGL_CONTEXT_CLIENT_VERSION, 3, EGL10.EGL_NONE)
            val ctx = EGL10.eglCreateContext(dpy, configs.get(0), EGL10.EGL_NO_CONTEXT, ctxAttribs)
            check(ctx != EGL10.EGL_NO_CONTEXT) { "eglCreateContext failed" }
            check(EGL10.eglMakeCurrent(dpy, EGL10.EGL_NO_SURFACE, EGL10.EGL_NO_SURFACE, ctx)) {
                "eglMakeCurrent failed"
            }
        }
        LwjglGLES.createCapabilities()
        println("renderer: " + org.lwjgl.opengles.GLES20.glGetString(org.lwjgl.opengles.GLES20.GL_RENDERER))
        println("version : " + org.lwjgl.opengles.GLES20.glGetString(org.lwjgl.opengles.GLES20.GL_VERSION))
    }

    private fun createTarget() {
        val tex = IntArray(1)
        GLES30.glGenTextures(1, tex, 0)
        GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, tex[0])
        GLES30.glTexImage2D(
            GLES30.GL_TEXTURE_2D, 0, GLES30.GL_RGBA8, width, height, 0,
            GLES30.GL_RGBA, GLES30.GL_UNSIGNED_BYTE, null,
        )
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MIN_FILTER, GLES30.GL_LINEAR)
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MAG_FILTER, GLES30.GL_LINEAR)
        colorTex = tex[0]

        val depth = IntArray(1)
        GLES30.glGenRenderbuffers(1, depth, 0)
        GLES30.glBindRenderbuffer(GLES30.GL_RENDERBUFFER, depth[0])
        GLES30.glRenderbufferStorage(GLES30.GL_RENDERBUFFER, GLES30.GL_DEPTH_COMPONENT24, width, height)

        val fb = IntArray(1)
        GLES30.glGenFramebuffers(1, fb, 0)
        GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, fb[0])
        GLES30.glFramebufferTexture2D(
            GLES30.GL_FRAMEBUFFER, GLES30.GL_COLOR_ATTACHMENT0, GLES30.GL_TEXTURE_2D, colorTex, 0,
        )
        GLES30.glFramebufferRenderbuffer(
            GLES30.GL_FRAMEBUFFER, GLES30.GL_DEPTH_ATTACHMENT, GLES30.GL_RENDERBUFFER, depth[0],
        )
        check(GLES30.glCheckFramebufferStatus(GLES30.GL_FRAMEBUFFER) == GLES30.GL_FRAMEBUFFER_COMPLETE) {
            "preview framebuffer incomplete"
        }
        fbo = fb[0]
        readback = ByteBuffer.allocateDirect(width * height * 4).order(ByteOrder.nativeOrder())
    }

    private fun capture(name: String) {
        GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, fbo)
        GLES30.glFinish()
        readback.clear()
        GLES30.glReadPixels(0, 0, width, height, GLES30.GL_RGBA, GLES30.GL_UNSIGNED_BYTE, readback)
        val img = BufferedImage(width, height, BufferedImage.TYPE_INT_RGB)
        for (y in 0 until height) {
            for (x in 0 until width) {
                val i = ((height - 1 - y) * width + x) * 4
                val r = readback.get(i).toInt() and 0xFF
                val g = readback.get(i + 1).toInt() and 0xFF
                val b = readback.get(i + 2).toInt() and 0xFF
                img.setRGB(x, y, (r shl 16) or (g shl 8) or b)
            }
        }
        val file = File(outDir, "$name.png")
        ImageIO.write(img, "png", file)
        println("captured ${file.name}")
    }
}
