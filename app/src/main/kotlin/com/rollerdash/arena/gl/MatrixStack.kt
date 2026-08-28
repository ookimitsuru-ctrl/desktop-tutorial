package com.rollerdash.arena.gl

import android.opengl.Matrix

/** Plain transform stack - the model hierarchy is small enough not to need more. */
class MatrixStack(depth: Int = 24) {
    private val stack = Array(depth) { FloatArray(16) }
    private val scratch = FloatArray(16)
    private var top = 0

    init { Matrix.setIdentityM(stack[0], 0) }

    fun identity() {
        top = 0
        Matrix.setIdentityM(stack[0], 0)
    }

    fun push() {
        System.arraycopy(stack[top], 0, stack[top + 1], 0, 16)
        top++
    }

    fun pop() { top-- }

    fun peek(): FloatArray = stack[top]

    fun translate(x: Float, y: Float, z: Float) = Matrix.translateM(stack[top], 0, x, y, z)

    fun rotateDeg(deg: Float, x: Float, y: Float, z: Float) = Matrix.rotateM(stack[top], 0, deg, x, y, z)

    fun rotateRad(rad: Float, x: Float, y: Float, z: Float) =
        Matrix.rotateM(stack[top], 0, rad * 57.29578f, x, y, z)

    fun scale(x: Float, y: Float, z: Float) = Matrix.scaleM(stack[top], 0, x, y, z)

    /** Copies the current transform with an extra local scale, for a single draw. */
    fun scaled(x: Float, y: Float, z: Float, out: FloatArray): FloatArray {
        System.arraycopy(stack[top], 0, out, 0, 16)
        Matrix.scaleM(out, 0, x, y, z)
        return out
    }

    /** Copies the current transform with a local translate + scale, for a single draw. */
    fun boxAt(
        px: Float, py: Float, pz: Float,
        sx: Float, sy: Float, sz: Float,
        out: FloatArray,
    ): FloatArray {
        System.arraycopy(stack[top], 0, out, 0, 16)
        Matrix.translateM(out, 0, px, py, pz)
        Matrix.scaleM(out, 0, sx, sy, sz)
        return out
    }

    /** Translate, then rotate, then scale - the order that keeps a scaled part square. */
    fun partAt(
        px: Float, py: Float, pz: Float,
        rotDeg: Float, ax: Float, ay: Float, az: Float,
        sx: Float, sy: Float, sz: Float,
        out: FloatArray,
    ): FloatArray {
        System.arraycopy(stack[top], 0, out, 0, 16)
        Matrix.translateM(out, 0, px, py, pz)
        Matrix.rotateM(out, 0, rotDeg, ax, ay, az)
        Matrix.scaleM(out, 0, sx, sy, sz)
        return out
    }

    /**
     * A roller wheel: laid on its side so the axle runs across the machine, then
     * spun about that axle.
     */
    fun wheelAt(
        px: Float, py: Float, pz: Float,
        spinDeg: Float, diameter: Float, width: Float,
        out: FloatArray,
    ): FloatArray {
        System.arraycopy(stack[top], 0, out, 0, 16)
        Matrix.translateM(out, 0, px, py, pz)
        Matrix.rotateM(out, 0, 90f, 0f, 0f, 1f)
        Matrix.rotateM(out, 0, spinDeg, 0f, 1f, 0f)
        Matrix.scaleM(out, 0, diameter, width, diameter)
        return out
    }

    fun multiplyInto(proj: FloatArray, out: FloatArray): FloatArray {
        Matrix.multiplyMM(out, 0, proj, 0, stack[top], 0)
        return out
    }

    fun copyTo(out: FloatArray) = System.arraycopy(stack[top], 0, out, 0, 16).let { out }

    fun scratch(): FloatArray = scratch
}
