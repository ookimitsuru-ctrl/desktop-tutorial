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
class Effects(private val capacity: Int = 2000) {
    companion object {
        /** Additive soft blob: fire, muzzle flash, thruster wash. */
        const val PASS_FIRE = 0
        /** Additive ring: shockwaves. */
        const val PASS_RING = 1
        /** Alpha soft blob: smoke and dust. */
        const val PASS_SMOKE = 2
        /** Additive streak: sparks and tracer debris. */
        const val PASS_SPARK = 3
        /** Additive ring lying flat on the ground: blast waves. */
        const val PASS_GROUND_RING = 4
        /** Dark mark lying flat on the ground: scorch and soot. */
        const val PASS_SCORCH = 5
        const val PASS_COUNT = 6
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
    /** Ground-aligned particles lie in the XZ plane instead of facing the camera. */
    private val flat = BooleanArray(capacity)
    private val spin = FloatArray(capacity)
    private var cursor = 0
    private val rng = Random(1234)

    val liveCount: Int get() = life.count { it > 0f }

    private fun emit(
        p: Vec3, v: Vec3, lifetime: Float, s0: Float, s1: Float,
        r: Float, g: Float, b: Float, a: Float, passId: Int,
        gravity: Float = 0f, dragRate: Float = 1.2f, groundAligned: Boolean = false,
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
        flat[slot] = groundAligned
        spin[slot] = rng.nextFloat() * 6.2831f
    }

    private fun jitter(scale: Float) = Vec3(
        (rng.nextFloat() * 2f - 1f) * scale,
        (rng.nextFloat() * 2f - 1f) * scale,
        (rng.nextFloat() * 2f - 1f) * scale,
    )

    fun muzzleFlash(pos: Vec3, dir: Vec3, power: Float) {
        val p = pos + dir * 0.6f
        // Hot core, a wider flame petal, then the smoke that follows it out.
        emit(p, dir * 3f, 0.055f, 0.9f + power * 1.1f, 0.25f, 1f, 0.95f, 0.75f, 1f, PASS_FIRE)
        emit(p + dir * 0.5f, dir * 6f, 0.10f, 1.6f + power, 0.3f, 1f, 0.72f, 0.28f, 0.95f, PASS_FIRE)
        repeat(6) {
            emit(p, dir * (16f + rng.nextFloat() * 22f) + jitter(5f), 0.16f, 0.34f, 0.04f,
                1f, 0.80f, 0.34f, 1f, PASS_SPARK, gravity = 8f, dragRate = 3f)
        }
        emit(p, dir * 2.2f + Vec3(0f, 1.1f, 0f), 0.65f, 0.6f, 2.4f, 0.30f, 0.28f, 0.26f, 0.30f, PASS_SMOKE)
    }

    fun impact(pos: Vec3, dir: Vec3, power: Float) {
        val back = -dir.normalized()
        emit(pos, Vec3.ZERO, 0.10f, 1.0f * power + 0.5f, 0.15f, 1f, 0.82f, 0.5f, 1f, PASS_FIRE)
        // Sparks spray back along the shot, with a few long stragglers.
        repeat((6 + power * 8f).toInt().coerceAtMost(18)) {
            val fast = rng.nextFloat() < 0.3f
            emit(
                pos, back * (8f + rng.nextFloat() * (if (fast) 30f else 16f)) + jitter(7f),
                0.28f + rng.nextFloat() * 0.32f, if (fast) 0.34f else 0.24f, 0.03f,
                1f, 0.74f, 0.30f, 1f, PASS_SPARK, gravity = 18f, dragRate = 1.5f,
            )
        }
        repeat(2) {
            emit(pos + jitter(0.4f), back * 2f + Vec3(0f, 1.6f, 0f), 0.8f, 0.5f, 2.6f,
                0.26f, 0.25f, 0.24f, 0.42f, PASS_SMOKE)
        }
        if (pos.y < 1.2f) {
            emit(pos.withYZero() + Vec3(0f, 0.06f, 0f), Vec3.ZERO, 3.5f, 1.6f, 2.2f,
                0.05f, 0.045f, 0.04f, 0.5f, PASS_SCORCH, dragRate = 0f, groundAligned = true)
        }
    }

    fun explosion(pos: Vec3, radius: Float) {
        // 1: the white flash, gone in three frames.
        emit(pos, Vec3.ZERO, 0.06f, radius * 0.7f, radius * 1.5f, 1f, 0.95f, 0.82f, 1f, PASS_FIRE)
        // 2: the fireball, expanding and cooling.
        emit(pos, Vec3.ZERO, 0.34f, radius * 0.45f, radius * 2.1f, 1f, 0.40f, 0.10f, 1f, PASS_FIRE)
        // 3: the shock ring, both facing the camera and lying on the ground.
        emit(pos, Vec3.ZERO, 0.38f, radius * 0.5f, radius * 2.6f, 1f, 0.62f, 0.30f, 0.85f, PASS_RING)
        emit(
            pos.withYZero() + Vec3(0f, 0.12f, 0f), Vec3.ZERO, 0.6f, radius * 0.6f, radius * 4.2f,
            1f, 0.68f, 0.34f, 0.8f, PASS_GROUND_RING, dragRate = 0f, groundAligned = true,
        )
        // 4: burning chunks thrown out of the middle.
        repeat(12 + radius.toInt()) {
            emit(
                pos + jitter(radius * 0.3f), jitter(radius * 1.7f) + Vec3(0f, radius * 0.6f, 0f),
                0.45f + rng.nextFloat() * 0.55f, radius * 0.45f, radius * 0.12f,
                1f, 0.36f + rng.nextFloat() * 0.28f, 0.10f, 0.95f, PASS_FIRE, gravity = -1.5f,
            )
        }
        // 5: the smoke column, which is what sells the scale.
        repeat(16) {
            emit(
                pos + jitter(radius * 0.45f), jitter(radius * 0.8f) + Vec3(0f, radius * 0.9f, 0f),
                1.4f + rng.nextFloat() * 1.2f, radius * 0.55f, radius * 2.8f,
                0.20f, 0.19f, 0.18f, 0.6f, PASS_SMOKE, gravity = -1.8f, dragRate = 0.8f,
            )
        }
        // 6: sparks and debris.
        repeat(22) {
            emit(pos, jitter(radius * 4.2f), 0.55f + rng.nextFloat() * 0.6f, 0.42f, 0.04f,
                1f, 0.78f, 0.32f, 1f, PASS_SPARK, gravity = 24f, dragRate = 1.0f)
        }
        if (pos.y < radius * 0.9f) {
            emit(
                pos.withYZero() + Vec3(0f, 0.05f, 0f), Vec3.ZERO, 6f, radius * 1.4f, radius * 1.8f,
                0.045f, 0.04f, 0.035f, 0.62f, PASS_SCORCH, dragRate = 0f, groundAligned = true,
            )
        }
    }

    /** Grit and sparks thrown up by the roller wheels. */
    fun rollerDust(pos: Vec3, dir: Vec3, intensity: Float) {
        emit(
            pos + jitter(0.4f).withYZero(), -dir * (3f + rng.nextFloat() * 5f) + Vec3(0f, 1.5f, 0f),
            0.6f, 0.5f, 3.0f * intensity, 0.42f, 0.39f, 0.33f, 0.34f * intensity, PASS_SMOKE,
            gravity = -1f, dragRate = 1.4f,
        )
        repeat(2) {
            emit(
                pos + jitter(0.3f).withYZero(), -dir * (12f + rng.nextFloat() * 16f) + jitter(3f),
                0.24f, 0.20f, 0.03f, 1f, 0.72f, 0.30f, 0.95f, PASS_SPARK, gravity = 22f, dragRate = 2f,
            )
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

    /**
     * A thruster nozzle burning: white at the throat, orange down the plume, with
     * heat shimmer smoke behind it.
     */
    fun thrusterJet(pos: Vec3, dir: Vec3, power: Float) {
        val d = dir.normalized()
        emit(pos + d * 0.2f, d * 2f, 0.07f, 0.55f * power, 0.25f, 1f, 0.95f, 0.80f, 1f, PASS_FIRE, dragRate = 3f)
        emit(pos + d * 0.7f, d * (9f + rng.nextFloat() * 6f), 0.16f, 0.75f * power, 0.20f,
            1f, 0.62f, 0.24f, 0.95f, PASS_FIRE, dragRate = 2.2f)
        if (rng.nextFloat() < 0.45f) {
            emit(pos + d * 1.4f, d * 5f + jitter(1.2f), 0.55f, 0.6f, 2.2f,
                0.24f, 0.22f, 0.21f, 0.28f, PASS_SMOKE, gravity = -1.2f, dragRate = 1.6f)
        }
        if (rng.nextFloat() < 0.3f) {
            emit(pos + d * 0.6f, d * (18f + rng.nextFloat() * 14f) + jitter(2f), 0.18f, 0.18f, 0.03f,
                1f, 0.8f, 0.4f, 1f, PASS_SPARK, gravity = 6f, dragRate = 2f)
        }
    }

    /** Smoke pouring out of a machine that has taken a beating. */
    fun damageSmoke(pos: Vec3, severity: Float) {
        emit(
            pos + jitter(0.5f), Vec3((rng.nextFloat() - 0.5f) * 1.2f, 2.4f + rng.nextFloat() * 1.6f, (rng.nextFloat() - 0.5f) * 1.2f),
            1.6f + rng.nextFloat() * 1.0f, 0.6f, 2.6f + severity * 1.6f,
            0.16f, 0.15f, 0.145f, 0.34f + severity * 0.2f, PASS_SMOKE, gravity = -1.4f, dragRate = 0.7f,
        )
        if (severity > 0.6f && rng.nextFloat() < 0.25f) {
            emit(pos + jitter(0.4f), Vec3(0f, 1.6f, 0f), 0.35f, 0.5f, 0.15f,
                1f, 0.5f, 0.18f, 0.9f, PASS_FIRE, gravity = -1f)
        }
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
        emit(pos, Vec3.ZERO, 0.09f, 2.6f, 0.5f, 1f, 0.95f, 0.75f, 1f, PASS_FIRE)
        emit(pos, Vec3.ZERO, 0.22f, 0.6f, 3.6f, 1f, 0.72f, 0.42f, 0.75f, PASS_RING)
        repeat(26) {
            emit(pos, jitter(22f) + dir * 6f, 0.32f + rng.nextFloat() * 0.35f, 0.36f, 0.03f,
                1f, 0.86f, 0.45f, 1f, PASS_SPARK, gravity = 26f, dragRate = 1.2f)
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
                // Scorch sits at full strength then fades out at the end.
                PASS_SCORCH -> kotlin.math.min(1f, (1f - t) * 3.5f)
                else -> 1f - t * t
            }
            val a = alpha[i] * fade
            if (a <= 0.005f) continue
            val h = size * 0.5f
            var rx = rightX * h; var ry = rightY * h; var rz = rightZ * h
            var ux = upX * h; var uy = upY * h; var uz = upZ * h
            if (flat[i]) {
                // Lies on the ground: blast rings and scorch marks.
                val c = kotlin.math.cos(spin[i])
                val s = kotlin.math.sin(spin[i])
                rx = c * h; ry = 0f; rz = -s * h
                ux = s * h; uy = 0f; uz = c * h
            }
            if (passId == PASS_SPARK && !flat[i]) {
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
