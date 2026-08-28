package com.rollerdash.arena.render

import com.rollerdash.arena.core.Vec3
import com.rollerdash.arena.gl.QuadBatch
import kotlin.math.max
import kotlin.random.Random

/**
 * Every spark, scorch, dust plume and blast in the game. Flat arrays, fixed
 * capacity, oldest particle recycled - nothing allocates once the game is running.
 *
 * `pass` decides both the blend mode and the sprite shape, so the renderer can
 * draw the whole system in four draw calls.
 */
class Effects(private val capacity: Int = 1200) {
    companion object {
        /** Additive soft blob: fire, muzzle flash, thruster wash. */
        const val PASS_FIRE = 0
        /** Additive ring: shockwaves. */
        const val PASS_RING = 1
        /** Alpha soft blob: smoke and dust. */
        const val PASS_SMOKE = 2
        /** Additive streak: sparks and tracer debris. */
        const val PASS_SPARK = 3
        const val PASS_COUNT = 4
    }

    private val px = FloatArray(capacity)
    private val py = FloatArray(capacity)
    private val pz = FloatArray(capacity)
    private val vx = FloatArray(capacity)
    private val vy = FloatArray(capacity)
    private val vz = FloatArray(capacity)
    private val life = FloatArray(capacity)
    private val maxLife = FloatArray(capacity)
    private val size0 = FloatArray(capacity)
    private val size1 = FloatArray(capacity)
    private val cr = FloatArray(capacity)
    private val cg = FloatArray(capacity)
    private val cb = FloatArray(capacity)
    private val alpha = FloatArray(capacity)
    private val drag = FloatArray(capacity)
    private val grav = FloatArray(capacity)
    private val pass = IntArray(capacity)
    private var cursor = 0
    private val rng = Random(1234)

    val liveCount: Int get() = life.count { it > 0f }

    private fun emit(
        p: Vec3, v: Vec3, lifetime: Float, s0: Float, s1: Float,
        r: Float, g: Float, b: Float, a: Float, passId: Int,
        gravity: Float = 0f, dragRate: Float = 1.2f,
    ) {
        var slot = -1
        for (i in 0 until capacity) {
            val idx = (cursor + i) % capacity
            if (life[idx] <= 0f) { slot = idx; break }
        }
        if (slot < 0) slot = cursor % capacity
        cursor = (slot + 1) % capacity
        px[slot] = p.x; py[slot] = p.y; pz[slot] = p.z
        vx[slot] = v.x; vy[slot] = v.y; vz[slot] = v.z
        life[slot] = lifetime; maxLife[slot] = lifetime
        size0[slot] = s0; size1[slot] = s1
        cr[slot] = r; cg[slot] = g; cb[slot] = b; alpha[slot] = a
        pass[slot] = passId
        grav[slot] = gravity
        drag[slot] = dragRate
    }

    private fun jitter(scale: Float) = Vec3(
        (rng.nextFloat() * 2f - 1f) * scale,
        (rng.nextFloat() * 2f - 1f) * scale,
        (rng.nextFloat() * 2f - 1f) * scale,
    )

    fun muzzleFlash(pos: Vec3, dir: Vec3, power: Float) {
        val p = pos + dir * 0.6f
        emit(p, dir * 3f, 0.09f, 1.1f + power, 0.2f, 1f, 0.86f, 0.45f, 1f, PASS_FIRE)
        repeat(4) {
            emit(p, dir * (14f + rng.nextFloat() * 16f) + jitter(4f), 0.16f, 0.35f, 0.05f,
                1f, 0.78f, 0.35f, 1f, PASS_SPARK, gravity = 6f, dragRate = 3f)
        }
        emit(p, dir * 2.5f + Vec3(0f, 1.2f, 0f), 0.55f, 0.5f, 2.0f, 0.35f, 0.33f, 0.30f, 0.35f, PASS_SMOKE)
    }

    fun impact(pos: Vec3, dir: Vec3, power: Float) {
        val back = -dir.normalized()
        emit(pos, Vec3.ZERO, 0.12f, 1.2f * power + 0.6f, 0.2f, 1f, 0.75f, 0.4f, 1f, PASS_FIRE)
        repeat((4 + power * 6f).toInt().coerceAtMost(14)) {
            emit(pos, back * (6f + rng.nextFloat() * 14f) + jitter(6f), 0.3f + rng.nextFloat() * 0.25f,
                0.28f, 0.04f, 1f, 0.72f, 0.30f, 1f, PASS_SPARK, gravity = 16f, dragRate = 1.6f)
        }
        repeat(2) {
            emit(pos + jitter(0.4f), back * 2f + Vec3(0f, 1.5f, 0f), 0.7f, 0.7f, 2.4f,
                0.30f, 0.29f, 0.27f, 0.4f, PASS_SMOKE)
        }
    }

    fun explosion(pos: Vec3, radius: Float) {
        emit(pos, Vec3.ZERO, 0.30f, radius * 0.4f, radius * 2.2f, 1f, 0.62f, 0.22f, 1f, PASS_FIRE)
        emit(pos, Vec3.ZERO, 0.45f, radius * 0.5f, radius * 3.4f, 1f, 0.85f, 0.55f, 0.9f, PASS_RING)
        repeat(10 + (radius).toInt()) {
            emit(pos + jitter(radius * 0.35f), jitter(radius * 1.6f) + Vec3(0f, radius * 0.5f, 0f),
                0.5f + rng.nextFloat() * 0.5f, radius * 0.5f, radius * 0.15f,
                1f, 0.55f + rng.nextFloat() * 0.3f, 0.2f, 0.95f, PASS_FIRE, gravity = -2f)
        }
        repeat(12) {
            emit(pos + jitter(radius * 0.4f), jitter(radius * 0.9f) + Vec3(0f, radius * 0.7f, 0f),
                1.1f + rng.nextFloat() * 0.9f, radius * 0.6f, radius * 2.4f,
                0.24f, 0.23f, 0.22f, 0.55f, PASS_SMOKE, gravity = -1.5f, dragRate = 0.9f)
        }
        repeat(16) {
            emit(pos, jitter(radius * 3.5f), 0.6f + rng.nextFloat() * 0.4f, 0.4f, 0.05f,
                1f, 0.8f, 0.35f, 1f, PASS_SPARK, gravity = 22f, dragRate = 1.1f)
        }
    }

    /** Grit thrown up by the roller wheels. */
    fun rollerDust(pos: Vec3, dir: Vec3, intensity: Float) {
        emit(
            pos + jitter(0.4f).withYZero(), -dir * (3f + rng.nextFloat() * 5f) + Vec3(0f, 1.6f, 0f),
            0.55f, 0.6f, 2.6f * intensity, 0.46f, 0.42f, 0.34f, 0.36f * intensity, PASS_SMOKE,
            gravity = -1f, dragRate = 1.4f,
        )
        if (rng.nextFloat() < 0.5f) {
            emit(pos, -dir * (10f + rng.nextFloat() * 10f) + jitter(2f), 0.22f, 0.22f, 0.03f,
                1f, 0.7f, 0.3f, 0.9f, PASS_SPARK, gravity = 20f, dragRate = 2f)
        }
    }

    fun landingDust(pos: Vec3, power: Float) {
        repeat(8) {
            val out = jitter(1f).withYZero().normalized()
            emit(pos + out * 0.8f, out * (5f * power + 2f) + Vec3(0f, 1.2f, 0f),
                0.6f, 0.8f, 3.0f, 0.48f, 0.44f, 0.36f, 0.4f, PASS_SMOKE, dragRate = 1.8f)
        }
    }

    fun boosterWash(pos: Vec3, dir: Vec3) {
        emit(pos, dir * 6f + jitter(1f), 0.22f, 0.8f, 0.15f, 1f, 0.65f, 0.30f, 0.85f, PASS_FIRE, dragRate = 2.5f)
    }

    fun burnPatch(pos: Vec3, radius: Float) {
        val a = rng.nextFloat() * 6.2831f
        val r = radius * kotlin.math.sqrt(rng.nextFloat())
        val p = Vec3(pos.x + kotlin.math.sin(a) * r, pos.y + 0.2f, pos.z + kotlin.math.cos(a) * r)
        emit(p, Vec3(0f, 2.5f + rng.nextFloat() * 2f, 0f), 0.6f, 1.4f, 0.4f,
            1f, 0.5f + rng.nextFloat() * 0.3f, 0.18f, 0.85f, PASS_FIRE, gravity = -3f)
        if (rng.nextFloat() < 0.3f) {
            emit(p, Vec3(0f, 3.5f, 0f), 1.2f, 1.0f, 3.0f, 0.2f, 0.19f, 0.18f, 0.4f, PASS_SMOKE, gravity = -2f)
        }
    }

    fun meleeSpark(pos: Vec3, dir: Vec3) {
        emit(pos, Vec3.ZERO, 0.12f, 2.2f, 0.4f, 1f, 0.9f, 0.6f, 1f, PASS_FIRE)
        repeat(18) {
            emit(pos, jitter(18f) + dir * 6f, 0.35f + rng.nextFloat() * 0.3f, 0.35f, 0.04f,
                1f, 0.85f, 0.45f, 1f, PASS_SPARK, gravity = 24f, dragRate = 1.3f)
        }
    }

    fun update(dt: Float) {
        for (i in 0 until capacity) {
            if (life[i] <= 0f) continue
            life[i] -= dt
            if (life[i] <= 0f) continue
            vy[i] -= grav[i] * dt
            val d = max(0f, 1f - drag[i] * dt)
            vx[i] *= d; vy[i] *= d; vz[i] *= d
            px[i] += vx[i] * dt
            py[i] += vy[i] * dt
            pz[i] += vz[i] * dt
            if (py[i] < 0.05f) {
                py[i] = 0.05f
                vy[i] *= -0.25f
                vx[i] *= 0.7f
                vz[i] *= 0.7f
            }
        }
    }

    /** Writes every particle of one pass into `batch` as camera-facing quads. */
    fun emitQuads(batch: QuadBatch, passId: Int, rightX: Float, rightY: Float, rightZ: Float,
                  upX: Float, upY: Float, upZ: Float) {
        for (i in 0 until capacity) {
            if (life[i] <= 0f || pass[i] != passId) continue
            val t = 1f - life[i] / maxLife[i]
            val size = size0[i] + (size1[i] - size0[i]) * t
            val fade = when (passId) {
                PASS_SPARK -> (1f - t) * (1f - t)
                PASS_SMOKE -> kotlin.math.sin(t * 3.1416f).coerceAtLeast(0f)
                else -> 1f - t * t
            }
            val a = alpha[i] * fade
            if (a <= 0.005f) continue
            val h = size * 0.5f
            var rx = rightX * h; var ry = rightY * h; var rz = rightZ * h
            var ux = upX * h; var uy = upY * h; var uz = upZ * h
            if (passId == PASS_SPARK) {
                // Sparks stretch along the way they are travelling, in screen space.
                val ax = vx[i] * rightX + vy[i] * rightY + vz[i] * rightZ
                val ay = vx[i] * upX + vy[i] * upY + vz[i] * upZ
                val len = kotlin.math.sqrt(ax * ax + ay * ay)
                if (len > 0.001f) {
                    val dx = ax / len
                    val dy = ay / len
                    val stretch = h * (1.4f + kotlin.math.min(len * 0.06f, 4f))
                    val thin = h * 0.55f
                    rx = (rightX * dx + upX * dy) * stretch
                    ry = (rightY * dx + upY * dy) * stretch
                    rz = (rightZ * dx + upZ * dy) * stretch
                    ux = (rightX * -dy + upX * dx) * thin
                    uy = (rightY * -dy + upY * dx) * thin
                    uz = (rightZ * -dy + upZ * dx) * thin
                }
            }
            val x = px[i]; val y = py[i]; val z = pz[i]
            batch.addQuad(
                x - rx - ux, y - ry - uy, z - rz - uz,
                x + rx - ux, y + ry - uy, z + rz - uz,
                x + rx + ux, y + ry + uy, z + rz + uz,
                x - rx + ux, y - ry + uy, z - rz + uz,
                0f, 0f, 1f, 1f,
                cr[i], cg[i], cb[i], a,
            )
        }
    }

    fun clear() {
        for (i in 0 until capacity) life[i] = 0f
    }
}

private fun Vec3.withYZero() = Vec3(x, 0f, z)
