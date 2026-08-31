@file:Suppress("unused")

package android.opengl

import android.graphics.Bitmap
import java.nio.ByteBuffer
import java.nio.ByteOrder
import javax.microedition.khronos.egl.EGLConfig
import javax.microedition.khronos.opengles.GL10

/** Uploads a Java2D-backed Bitmap the same way GLUtils would upload an Android one. */
object GLUtils {
    @JvmStatic
    fun texImage2D(target: Int, level: Int, bitmap: Bitmap, border: Int) {
        val w = bitmap.width
        val h = bitmap.height
        val buf = ByteBuffer.allocateDirect(w * h * 4).order(ByteOrder.nativeOrder())
        for (y in 0 until h) {
            for (x in 0 until w) {
                val argb = bitmap.image.getRGB(x, y)
                buf.put(((argb shr 16) and 0xFF).toByte())
                buf.put(((argb shr 8) and 0xFF).toByte())
                buf.put((argb and 0xFF).toByte())
                buf.put(((argb ushr 24) and 0xFF).toByte())
            }
        }
        buf.flip()
        GLES30.glTexImage2D(
            target, level, GLES30.GL_RGBA, w, h, border,
            GLES30.GL_RGBA, GLES30.GL_UNSIGNED_BYTE, buf,
        )
    }
}

/** Only the Renderer interface is needed off-device. */
open class GLSurfaceView {
    interface Renderer {
        fun onSurfaceCreated(gl: GL10?, config: EGLConfig?)
        fun onSurfaceChanged(gl: GL10?, width: Int, height: Int)
        fun onDrawFrame(gl: GL10?)
    }
}
