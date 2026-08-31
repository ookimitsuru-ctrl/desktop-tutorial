@file:Suppress("unused")

package android.opengl

import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.math.tan

/**
 * Column-major 4x4 maths, matching android.opengl.Matrix exactly so the preview
 * sees the same transforms the phone does.
 */
object Matrix {

    fun setIdentityM(sm: FloatArray, o: Int) {
        for (i in 0 until 16) sm[o + i] = 0f
        sm[o + 0] = 1f; sm[o + 5] = 1f; sm[o + 10] = 1f; sm[o + 15] = 1f
    }

    fun multiplyMM(result: FloatArray, ro: Int, lhs: FloatArray, lo: Int, rhs: FloatArray, rho: Int) {
        val tmp = FloatArray(16)
        for (c in 0 until 4) {
            for (r in 0 until 4) {
                var sum = 0f
                for (k in 0 until 4) sum += lhs[lo + k * 4 + r] * rhs[rho + c * 4 + k]
                tmp[c * 4 + r] = sum
            }
        }
        System.arraycopy(tmp, 0, result, ro, 16)
    }

    fun multiplyMV(resultVec: FloatArray, ro: Int, lhs: FloatArray, lo: Int, rhsVec: FloatArray, vo: Int) {
        val tmp = FloatArray(4)
        for (r in 0 until 4) {
            var sum = 0f
            for (k in 0 until 4) sum += lhs[lo + k * 4 + r] * rhsVec[vo + k]
            tmp[r] = sum
        }
        System.arraycopy(tmp, 0, resultVec, ro, 4)
    }

    fun translateM(m: FloatArray, o: Int, x: Float, y: Float, z: Float) {
        for (i in 0 until 4) {
            m[o + 12 + i] += m[o + i] * x + m[o + 4 + i] * y + m[o + 8 + i] * z
        }
    }

    fun scaleM(m: FloatArray, o: Int, x: Float, y: Float, z: Float) {
        for (i in 0 until 4) {
            m[o + i] *= x
            m[o + 4 + i] *= y
            m[o + 8 + i] *= z
        }
    }

    fun setRotateM(rm: FloatArray, o: Int, aDeg: Float, xIn: Float, yIn: Float, zIn: Float) {
        val a = aDeg * (Math.PI.toFloat() / 180f)
        val s = sin(a)
        val c = cos(a)
        var x = xIn
        var y = yIn
        var z = zIn
        val len = sqrt(x * x + y * y + z * z)
        if (len != 1f && len != 0f) {
            x /= len; y /= len; z /= len
        }
        val nc = 1f - c
        val xy = x * y
        val yz = y * z
        val zx = z * x
        rm[o + 0] = x * x * nc + c
        rm[o + 1] = xy * nc + z * s
        rm[o + 2] = zx * nc - y * s
        rm[o + 3] = 0f
        rm[o + 4] = xy * nc - z * s
        rm[o + 5] = y * y * nc + c
        rm[o + 6] = yz * nc + x * s
        rm[o + 7] = 0f
        rm[o + 8] = zx * nc + y * s
        rm[o + 9] = yz * nc - x * s
        rm[o + 10] = z * z * nc + c
        rm[o + 11] = 0f
        rm[o + 12] = 0f; rm[o + 13] = 0f; rm[o + 14] = 0f; rm[o + 15] = 1f
    }

    fun rotateM(m: FloatArray, o: Int, a: Float, x: Float, y: Float, z: Float) {
        val r = FloatArray(16)
        setRotateM(r, 0, a, x, y, z)
        val out = FloatArray(16)
        multiplyMM(out, 0, m, o, r, 0)
        System.arraycopy(out, 0, m, o, 16)
    }

    fun setLookAtM(
        rm: FloatArray, o: Int,
        eyeX: Float, eyeY: Float, eyeZ: Float,
        cx: Float, cy: Float, cz: Float,
        upX: Float, upY: Float, upZ: Float,
    ) {
        var fx = cx - eyeX
        var fy = cy - eyeY
        var fz = cz - eyeZ
        val rlf = 1f / sqrt(fx * fx + fy * fy + fz * fz)
        fx *= rlf; fy *= rlf; fz *= rlf
        var sx = fy * upZ - fz * upY
        var sy = fz * upX - fx * upZ
        var sz = fx * upY - fy * upX
        val rls = 1f / sqrt(sx * sx + sy * sy + sz * sz)
        sx *= rls; sy *= rls; sz *= rls
        val ux = sy * fz - sz * fy
        val uy = sz * fx - sx * fz
        val uz = sx * fy - sy * fx

        rm[o + 0] = sx; rm[o + 1] = ux; rm[o + 2] = -fx; rm[o + 3] = 0f
        rm[o + 4] = sy; rm[o + 5] = uy; rm[o + 6] = -fy; rm[o + 7] = 0f
        rm[o + 8] = sz; rm[o + 9] = uz; rm[o + 10] = -fz; rm[o + 11] = 0f
        rm[o + 12] = 0f; rm[o + 13] = 0f; rm[o + 14] = 0f; rm[o + 15] = 1f
        translateM(rm, o, -eyeX, -eyeY, -eyeZ)
    }

    fun perspectiveM(m: FloatArray, o: Int, fovy: Float, aspect: Float, zNear: Float, zFar: Float) {
        val f = 1f / tan(fovy * (Math.PI.toFloat() / 360f))
        val rangeReciprocal = 1f / (zNear - zFar)
        for (i in 0 until 16) m[o + i] = 0f
        m[o + 0] = f / aspect
        m[o + 5] = f
        m[o + 10] = (zFar + zNear) * rangeReciprocal
        m[o + 11] = -1f
        m[o + 14] = 2f * zFar * zNear * rangeReciprocal
    }

    fun orthoM(
        m: FloatArray, o: Int,
        left: Float, right: Float, bottom: Float, top: Float, near: Float, far: Float,
    ) {
        val rWidth = 1f / (right - left)
        val rHeight = 1f / (top - bottom)
        val rDepth = 1f / (far - near)
        for (i in 0 until 16) m[o + i] = 0f
        m[o + 0] = 2f * rWidth
        m[o + 5] = 2f * rHeight
        m[o + 10] = -2f * rDepth
        m[o + 12] = -(right + left) * rWidth
        m[o + 13] = -(top + bottom) * rHeight
        m[o + 14] = -(far + near) * rDepth
        m[o + 15] = 1f
    }

    fun invertM(mInv: FloatArray, mio: Int, m: FloatArray, mo: Int): Boolean {
        val src = FloatArray(16)
        System.arraycopy(m, mo, src, 0, 16)
        val inv = FloatArray(16)
        inv[0] = src[5] * src[10] * src[15] - src[5] * src[11] * src[14] - src[9] * src[6] * src[15] +
            src[9] * src[7] * src[14] + src[13] * src[6] * src[11] - src[13] * src[7] * src[10]
        inv[4] = -src[4] * src[10] * src[15] + src[4] * src[11] * src[14] + src[8] * src[6] * src[15] -
            src[8] * src[7] * src[14] - src[12] * src[6] * src[11] + src[12] * src[7] * src[10]
        inv[8] = src[4] * src[9] * src[15] - src[4] * src[11] * src[13] - src[8] * src[5] * src[15] +
            src[8] * src[7] * src[13] + src[12] * src[5] * src[11] - src[12] * src[7] * src[9]
        inv[12] = -src[4] * src[9] * src[14] + src[4] * src[10] * src[13] + src[8] * src[5] * src[14] -
            src[8] * src[6] * src[13] - src[12] * src[5] * src[10] + src[12] * src[6] * src[9]
        inv[1] = -src[1] * src[10] * src[15] + src[1] * src[11] * src[14] + src[9] * src[2] * src[15] -
            src[9] * src[3] * src[14] - src[13] * src[2] * src[11] + src[13] * src[3] * src[10]
        inv[5] = src[0] * src[10] * src[15] - src[0] * src[11] * src[14] - src[8] * src[2] * src[15] +
            src[8] * src[3] * src[14] + src[12] * src[2] * src[11] - src[12] * src[3] * src[10]
        inv[9] = -src[0] * src[9] * src[15] + src[0] * src[11] * src[13] + src[8] * src[1] * src[15] -
            src[8] * src[3] * src[13] - src[12] * src[1] * src[11] + src[12] * src[3] * src[9]
        inv[13] = src[0] * src[9] * src[14] - src[0] * src[10] * src[13] - src[8] * src[1] * src[14] +
            src[8] * src[2] * src[13] + src[12] * src[1] * src[10] - src[12] * src[2] * src[9]
        inv[2] = src[1] * src[6] * src[15] - src[1] * src[7] * src[14] - src[5] * src[2] * src[15] +
            src[5] * src[3] * src[14] + src[13] * src[2] * src[7] - src[13] * src[3] * src[6]
        inv[6] = -src[0] * src[6] * src[15] + src[0] * src[7] * src[14] + src[4] * src[2] * src[15] -
            src[4] * src[3] * src[14] - src[12] * src[2] * src[7] + src[12] * src[3] * src[6]
        inv[10] = src[0] * src[5] * src[15] - src[0] * src[7] * src[13] - src[4] * src[1] * src[15] +
            src[4] * src[3] * src[13] + src[12] * src[1] * src[7] - src[12] * src[3] * src[5]
        inv[14] = -src[0] * src[5] * src[14] + src[0] * src[6] * src[13] + src[4] * src[1] * src[14] -
            src[4] * src[2] * src[13] - src[12] * src[1] * src[6] + src[12] * src[2] * src[5]
        inv[3] = -src[1] * src[6] * src[11] + src[1] * src[7] * src[10] + src[5] * src[2] * src[11] -
            src[5] * src[3] * src[10] - src[9] * src[2] * src[7] + src[9] * src[3] * src[6]
        inv[7] = src[0] * src[6] * src[11] - src[0] * src[7] * src[10] - src[4] * src[2] * src[11] +
            src[4] * src[3] * src[10] + src[8] * src[2] * src[7] - src[8] * src[3] * src[6]
        inv[11] = -src[0] * src[5] * src[11] + src[0] * src[7] * src[9] + src[4] * src[1] * src[11] -
            src[4] * src[3] * src[9] - src[8] * src[1] * src[7] + src[8] * src[3] * src[5]
        inv[15] = src[0] * src[5] * src[10] - src[0] * src[6] * src[9] - src[4] * src[1] * src[10] +
            src[4] * src[2] * src[9] + src[8] * src[1] * src[6] - src[8] * src[2] * src[5]
        var det = src[0] * inv[0] + src[1] * inv[4] + src[2] * inv[8] + src[3] * inv[12]
        if (det == 0f) return false
        det = 1f / det
        for (i in 0 until 16) mInv[mio + i] = inv[i] * det
        return true
    }
}
