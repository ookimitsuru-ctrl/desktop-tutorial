package com.rollerdash.arena.core

import kotlin.math.cos
import kotlin.math.sin

/** A round in flight. Ownership matters: your own shots pass straight through you. */
class Projectile(
    val id: Int,
    val owner: Int,
    val spec: WeaponSpec,
    var pos: Vec3,
    var vel: Vec3,
    var life: Float,
) {
    val kind: ProjectileKind get() = spec.kind
    var prevPos: Vec3 = pos
    var dead = false
    /** Cosmetic spin for the renderer. */
    var age = 0f

    fun step(dt: Float, targetCenter: Vec3?) {
        prevPos = pos
        age += dt
        if (kind == ProjectileKind.MISSILE && targetCenter != null && spec.turnRate > 0f) {
            val toTarget = (targetCenter - pos).normalized()
            val dir = vel.normalized()
            val newDir = (dir + (toTarget - dir) * clamp(spec.turnRate * dt, 0f, 1f)).normalized()
            val speed = vel.length
            vel = newDir * (speed + 26f * dt)
        }
        if (spec.gravity > 0f) {
            vel = Vec3(vel.x, vel.y - spec.gravity * dt, vel.z)
        }
        pos = pos + vel * dt
        life -= dt
        if (life <= 0f) dead = true
    }

    companion object {
        /** Builds the round for one [ShotRequest], applying spread deterministically. */
        fun spawn(id: Int, req: ShotRequest, rng: Rng): Projectile {
            val s = req.spec
            val spreadYaw = if (s.spread > 0f) rng.nextSigned() * s.spread else 0f
            val spreadPitch = if (s.spread > 0f) rng.nextSigned() * s.spread * 0.6f else 0f
            val yaw = req.yaw + spreadYaw
            val pitch = req.pitch + spreadPitch
            val dir = Vec3(
                sin(yaw) * cos(pitch),
                sin(pitch),
                cos(yaw) * cos(pitch),
            )
            return Projectile(id, req.shooter, s, req.origin, dir * s.speed, s.lifetime)
        }
    }
}

/** Burning ground left by napalm. Ticks damage to anything standing in it. */
class BurnField(
    val owner: Int,
    val pos: Vec3,
    val radius: Float,
    val dps: Float,
    var life: Float,
) {
    val maxLife = life
    var tickTimer = 0f
}
