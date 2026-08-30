package com.rollerdash.arena.core

import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sign
import kotlin.math.sin
import kotlin.math.sqrt

const val PI_F = 3.14159265f
const val TWO_PI = PI_F * 2f

/** Immutable 3D vector. Y is up, the arena floor lies on the XZ plane. */
data class Vec3(val x: Float, val y: Float, val z: Float) {
    operator fun plus(o: Vec3) = Vec3(x + o.x, y + o.y, z + o.z)
    operator fun minus(o: Vec3) = Vec3(x - o.x, y - o.y, z - o.z)
    operator fun times(s: Float) = Vec3(x * s, y * s, z * s)
    operator fun div(s: Float) = Vec3(x / s, y / s, z / s)
    operator fun unaryMinus() = Vec3(-x, -y, -z)

    val lengthSq: Float get() = x * x + y * y + z * z
    val length: Float get() = sqrt(lengthSq)

    /** Length ignoring height - most of the battle logic is 2D on the floor plane. */
    val flatLength: Float get() = sqrt(x * x + z * z)
    val flat: Vec3 get() = Vec3(x, 0f, z)

    fun normalized(): Vec3 {
        val l = length
        return if (l < 1e-6f) ZERO else Vec3(x / l, y / l, z / l)
    }

    fun flatNormalized(): Vec3 {
        val l = flatLength
        return if (l < 1e-6f) ZERO else Vec3(x / l, 0f, z / l)
    }

    fun dot(o: Vec3) = x * o.x + y * o.y + z * o.z

    fun cross(o: Vec3) = Vec3(
        y * o.z - z * o.y,
        z * o.x - x * o.z,
        x * o.y - y * o.x,
    )

    fun distanceTo(o: Vec3) = (this - o).length
    fun flatDistanceTo(o: Vec3) = (this - o).flatLength
    fun withY(newY: Float) = Vec3(x, newY, z)

    companion object {
        val ZERO = Vec3(0f, 0f, 0f)
        val UP = Vec3(0f, 1f, 0f)
    }
}

/** Heading of `v` on the floor plane, in the same convention as [forwardOf]. */
fun yawOf(v: Vec3): Float = atan2(v.x, v.z)

/** Unit forward vector for a heading. yaw = 0 looks down +Z. */
fun forwardOf(yaw: Float) = Vec3(sin(yaw), 0f, cos(yaw))

/**
 * Unit right-hand vector for a heading, matching the camera's own right axis
 * (forward x up) so that strafing right moves the mech right on screen.
 */
fun rightOf(yaw: Float) = Vec3(-cos(yaw), 0f, sin(yaw))

fun clamp(v: Float, lo: Float, hi: Float) = if (v < lo) lo else if (v > hi) hi else v

fun lerp(a: Float, b: Float, t: Float) = a + (b - a) * t

fun lerp(a: Vec3, b: Vec3, t: Float) = Vec3(lerp(a.x, b.x, t), lerp(a.y, b.y, t), lerp(a.z, b.z, t))

/** Wraps an angle into (-PI, PI]. */
fun wrapAngle(a: Float): Float {
    var r = a
    while (r > PI_F) r -= TWO_PI
    while (r <= -PI_F) r += TWO_PI
    return r
}

/** Shortest signed delta to turn from `from` to `to`. */
fun angleDelta(from: Float, to: Float) = wrapAngle(to - from)

/** Turns `from` towards `to` by at most `maxStep` radians. */
fun turnTowards(from: Float, to: Float, maxStep: Float): Float {
    val d = angleDelta(from, to)
    return if (abs(d) <= maxStep) to else wrapAngle(from + sign(d) * maxStep)
}

/** Moves `v` towards `target` by at most `maxStep`. */
fun approach(v: Float, target: Float, maxStep: Float): Float {
    val d = target - v
    return if (abs(d) <= maxStep) target else v + sign(d) * maxStep
}

/** Frame-rate independent exponential smoothing. `rate` is roughly "per second sharpness". */
fun damp(current: Float, target: Float, rate: Float, dt: Float): Float =
    lerp(current, target, 1f - kotlin.math.exp(-rate * dt))

fun damp(current: Vec3, target: Vec3, rate: Float, dt: Float): Vec3 =
    lerp(current, target, 1f - kotlin.math.exp(-rate * dt))

/**
 * Lead angle solution: where to aim a shot of speed `speed` fired from `origin`
 * at a target moving with `targetVel`. Returns the aim point (iterative, 3 passes
 * is plenty for the speeds involved here).
 */
fun predictIntercept(origin: Vec3, target: Vec3, targetVel: Vec3, speed: Float): Vec3 {
    if (speed <= 0.01f) return target
    var t = target.distanceTo(origin) / speed
    repeat(3) {
        val p = target + targetVel * t
        t = p.distanceTo(origin) / speed
    }
    return target + targetVel * t
}

/** Deterministic xorshift RNG so battles can be replayed and unit tested. */
class Rng(seed: Long = 0x5DEECE66DL) {
    private var state: Long = if (seed == 0L) 1L else seed

    fun nextLong(): Long {
        var x = state
        x = x xor (x shl 13)
        x = x xor (x ushr 7)
        x = x xor (x shl 17)
        state = x
        return x
    }

    /** Uniform in [0, 1). */
    fun nextFloat(): Float = ((nextLong() ushr 40).toFloat() / (1 shl 24).toFloat())

    /** Uniform in [-1, 1]. */
    fun nextSigned(): Float = nextFloat() * 2f - 1f

    fun range(lo: Float, hi: Float) = lo + nextFloat() * (hi - lo)

    fun nextInt(bound: Int): Int = ((nextLong() ushr 33) % bound).toInt()

    fun chance(p: Float) = nextFloat() < p
}
