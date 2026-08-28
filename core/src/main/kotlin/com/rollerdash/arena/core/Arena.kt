package com.rollerdash.arena.core

import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

/**
 * A piece of cover. Boxes are axis aligned, cylinders are upright.
 * `height` matters: a mech that is airborne above the top can pass over it,
 * which is what makes jump-dashing over cover a real option.
 */
sealed class Obstacle {
    abstract val center: Vec3
    abstract val height: Float

    data class Box(
        override val center: Vec3,
        val halfX: Float,
        val halfZ: Float,
        override val height: Float,
    ) : Obstacle()

    data class Cylinder(
        override val center: Vec3,
        val radius: Float,
        override val height: Float,
    ) : Obstacle()
}

/** Result of pushing a circle out of the world geometry. */
data class Pushback(val position: Vec3, val hitWall: Boolean, val normal: Vec3)

/**
 * The battlefield: a square pit ringed by walls, dotted with cover.
 * Everything in here works on the floor plane; `y` only decides whether a
 * mech is high enough to clear an obstacle.
 */
class Arena(
    val halfSize: Float = 60f,
    val obstacles: List<Obstacle> = emptyList(),
) {
    val floorY = 0f

    /** Top surface height under `p`, ignoring obstacles a mech cannot stand on. */
    fun groundHeightAt(p: Vec3): Float {
        var h = floorY
        for (o in obstacles) {
            if (!o.standable) continue
            val inside = when (o) {
                is Obstacle.Box ->
                    abs(p.x - o.center.x) <= o.halfX && abs(p.z - o.center.z) <= o.halfZ
                is Obstacle.Cylinder -> {
                    val dx = p.x - o.center.x
                    val dz = p.z - o.center.z
                    dx * dx + dz * dz <= o.radius * o.radius
                }
            }
            if (inside) h = max(h, o.height)
        }
        return h
    }

    /**
     * Keeps a circle of `radius` standing at height `feetY` inside the arena and
     * out of any cover it is not clearing.
     */
    fun collide(p: Vec3, radius: Float, feetY: Float): Pushback {
        var pos = p
        var hitWall = false
        var normal = Vec3.ZERO
        val limit = halfSize - radius

        if (pos.x > limit) { pos = Vec3(limit, pos.y, pos.z); hitWall = true; normal = Vec3(-1f, 0f, 0f) }
        if (pos.x < -limit) { pos = Vec3(-limit, pos.y, pos.z); hitWall = true; normal = Vec3(1f, 0f, 0f) }
        if (pos.z > limit) { pos = Vec3(pos.x, pos.y, limit); hitWall = true; normal = Vec3(0f, 0f, -1f) }
        if (pos.z < -limit) { pos = Vec3(pos.x, pos.y, -limit); hitWall = true; normal = Vec3(0f, 0f, 1f) }

        for (o in obstacles) {
            // Standing on top of, or flying over, a piece of cover: no side contact.
            if (feetY >= o.height - 0.05f) continue
            when (o) {
                is Obstacle.Box -> {
                    val dx = pos.x - o.center.x
                    val dz = pos.z - o.center.z
                    val ox = o.halfX + radius - abs(dx)
                    val oz = o.halfZ + radius - abs(dz)
                    if (ox > 0f && oz > 0f) {
                        hitWall = true
                        if (ox < oz) {
                            val s = if (dx < 0f) -1f else 1f
                            pos = Vec3(o.center.x + s * (o.halfX + radius), pos.y, pos.z)
                            normal = Vec3(s, 0f, 0f)
                        } else {
                            val s = if (dz < 0f) -1f else 1f
                            pos = Vec3(pos.x, pos.y, o.center.z + s * (o.halfZ + radius))
                            normal = Vec3(0f, 0f, s)
                        }
                    }
                }
                is Obstacle.Cylinder -> {
                    val d = Vec3(pos.x - o.center.x, 0f, pos.z - o.center.z)
                    val minDist = o.radius + radius
                    val len = d.flatLength
                    if (len < minDist) {
                        hitWall = true
                        val n = if (len < 1e-4f) Vec3(1f, 0f, 0f) else d / len
                        pos = Vec3(o.center.x + n.x * minDist, pos.y, o.center.z + n.z * minDist)
                        normal = n
                    }
                }
            }
        }
        return Pushback(pos, hitWall, normal)
    }

    /** True when cover sits between the two points - used for lock-on and by the AI. */
    fun blocked(from: Vec3, to: Vec3): Boolean = obstacles.any { it.blocksSegment(from, to) }

    /**
     * First obstacle hit by a segment, as a fraction along it, or null when clear.
     * Projectiles use this to burst against cover.
     */
    fun segmentHit(from: Vec3, to: Vec3): Float? {
        var best: Float? = null
        for (o in obstacles) {
            val t = o.segmentT(from, to) ?: continue
            if (best == null || t < best!!) best = t
        }
        return best
    }

    companion object {
        /** The stock arena: a walled pit with a ring of pillars and low blast walls. */
        fun standard(): Arena {
            val list = mutableListOf<Obstacle>()
            list += Obstacle.Box(Vec3(0f, 0f, 0f), 6f, 6f, 3.2f)
            for (i in 0 until 4) {
                val a = i * PI_F * 0.5f + PI_F * 0.25f
                val d = 30f
                list += Obstacle.Cylinder(Vec3(kotlin.math.sin(a) * d, 0f, kotlin.math.cos(a) * d), 2.6f, 11f)
            }
            list += Obstacle.Box(Vec3(-26f, 0f, 8f), 8f, 1.4f, 4.5f)
            list += Obstacle.Box(Vec3(26f, 0f, -8f), 8f, 1.4f, 4.5f)
            list += Obstacle.Box(Vec3(8f, 0f, 26f), 1.4f, 8f, 4.5f)
            list += Obstacle.Box(Vec3(-8f, 0f, -26f), 1.4f, 8f, 4.5f)
            list += Obstacle.Box(Vec3(44f, 0f, 44f), 5f, 5f, 2.0f)
            list += Obstacle.Box(Vec3(-44f, 0f, -44f), 5f, 5f, 2.0f)
            return Arena(60f, list)
        }
    }
}

/** Cover low enough to stand on once you have jumped up there. */
val Obstacle.standable: Boolean get() = height <= 5f

private fun Obstacle.blocksSegment(from: Vec3, to: Vec3): Boolean = segmentT(from, to) != null

/**
 * Segment/obstacle intersection on the floor plane, with a crude height test at
 * the crossing point. Returns the parameter along the segment, or null.
 */
fun Obstacle.segmentT(from: Vec3, to: Vec3): Float? {
    val t = when (this) {
        is Obstacle.Box -> segmentBoxT(from, to, center, halfX, halfZ)
        is Obstacle.Cylinder -> segmentCircleT(from, to, center, radius)
    } ?: return null
    val y = from.y + (to.y - from.y) * t
    return if (y <= center.y + height) t else null
}

private fun segmentBoxT(from: Vec3, to: Vec3, c: Vec3, hx: Float, hz: Float): Float? {
    var tMin = 0f
    var tMax = 1f
    val d = to - from
    val lo = floatArrayOf(c.x - hx, c.z - hz)
    val hi = floatArrayOf(c.x + hx, c.z + hz)
    val o = floatArrayOf(from.x, from.z)
    val dir = floatArrayOf(d.x, d.z)
    for (i in 0 until 2) {
        if (abs(dir[i]) < 1e-6f) {
            if (o[i] < lo[i] || o[i] > hi[i]) return null
        } else {
            var t1 = (lo[i] - o[i]) / dir[i]
            var t2 = (hi[i] - o[i]) / dir[i]
            if (t1 > t2) { val tmp = t1; t1 = t2; t2 = tmp }
            tMin = max(tMin, t1)
            tMax = min(tMax, t2)
            if (tMin > tMax) return null
        }
    }
    return tMin
}

private fun segmentCircleT(from: Vec3, to: Vec3, c: Vec3, r: Float): Float? {
    val dx = to.x - from.x
    val dz = to.z - from.z
    val fx = from.x - c.x
    val fz = from.z - c.z
    val a = dx * dx + dz * dz
    if (a < 1e-8f) return if (fx * fx + fz * fz <= r * r) 0f else null
    val b = 2f * (fx * dx + fz * dz)
    val cc = fx * fx + fz * fz - r * r
    val disc = b * b - 4f * a * cc
    if (disc < 0f) return null
    val s = sqrt(disc)
    val t1 = (-b - s) / (2f * a)
    val t2 = (-b + s) / (2f * a)
    if (t1 in 0f..1f) return t1
    if (t2 in 0f..1f) return max(t2, 0f)
    return null
}
