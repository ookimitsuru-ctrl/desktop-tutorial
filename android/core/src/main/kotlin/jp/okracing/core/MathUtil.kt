package jp.okracing.core

import kotlin.math.*

const val TAU = PI * 2
fun clamp(v: Double, a: Double, b: Double) = if (v < a) a else if (v > b) b else v
fun sat(v: Double) = clamp(v, 0.0, 1.0)
fun smoothStep(t0: Double): Double { val t = sat(t0); return t * t * (3 - 2 * t) }
fun lerp(a: Double, b: Double, t: Double) = a + (b - a) * t
fun hypot2(x: Double, y: Double) = sqrt(x * x + y * y)
/** JS の Math.round と同じ丸め (x.5 は +∞ 側) */
fun jsRound(v: Double): Int = floor(v + 0.5).toInt()
fun mod(a: Int, n: Int): Int { val r = a % n; return if (r < 0) r + n else r }
fun mod(a: Double, n: Double): Double { val r = a % n; return if (r < 0) r + n else r }

/** Math.random の代わり (シード固定もできる) */
object Rnd {
    var r = java.util.Random()
    fun next(): Double = r.nextDouble()
    fun seed(s: Long) { r = java.util.Random(s) }
}
fun rand() = Rnd.next()
