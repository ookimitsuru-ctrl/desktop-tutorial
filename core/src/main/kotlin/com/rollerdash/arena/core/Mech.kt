package com.rollerdash.arena.core

import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/** A shot the mech wants the world to spawn this frame. */
data class ShotRequest(
    val shooter: Int,
    val slot: WeaponSlot,
    val stance: Stance,
    val spec: WeaponSpec,
    val origin: Vec3,
    val yaw: Float,
    val pitch: Float,
    val index: Int,
)

/** An attack in progress: windup, then the shots, then recovery. */
class ActiveAction(
    val slot: WeaponSlot,
    val stance: Stance,
    val spec: WeaponSpec,
) {
    var timer = 0f
    var shotsFired = 0
    var nextShotAt = spec.windup
    val totalTime: Float get() = spec.windup + spec.burstInterval * (spec.shots - 1) + spec.recovery
    val firing: Boolean get() = shotsFired < spec.shots
}

enum class MechPose { STAND, WALK, DASH, AIR, CROUCH, STAGGER, DOWN, RISE, DEAD }

/**
 * One Armored Trooper. Holds every bit of state the simulation and the renderer
 * need; the renderer only ever reads from here.
 */
class Mech(
    val index: Int,
    val spec: AtSpec,
    var pos: Vec3,
    var yaw: Float,
) {
    var vel: Vec3 = Vec3.ZERO
    var hp: Float = spec.armor
    /** Roller/booster charge, 0..1. */
    var boost: Float = 1f
    val ammo = floatArrayOf(1f, 1f, 1f)

    var airborne = false
    var dashing = false
    var dashTimer = 0f
    var dashDir: Vec3 = Vec3.ZERO
    var crouching = false
    var action: ActiveAction? = null

    var stagger = 0f
    var staggerTimer = 0f
    var downTimer = 0f
    var riseTimer = 0f
    var invuln = 0f
    var hitStop = 0f
    var dead = false

    /** Purely cosmetic, driven here so every renderer sees the same animation. */
    var walkPhase = 0f
    var rollerSpin = 0f
    var recoil = 0f
    var eyeSlide = 0f
    var landingSquash = 0f
    var tookDamageFlash = 0f

    private val pendingShots = mutableListOf<ShotRequest>()

    val alive: Boolean get() = !dead
    val feetY: Float get() = pos.y
    val centerY: Float get() = pos.y + spec.height * 0.5f
    val headY: Float get() = pos.y + spec.height * 0.82f
    val center: Vec3 get() = Vec3(pos.x, centerY, pos.z)
    val armorFraction: Float get() = clamp(hp / spec.armor, 0f, 1f)
    val controllable: Boolean get() = !dead && staggerTimer <= 0f && downTimer <= 0f && riseTimer <= 0f

    val pose: MechPose
        get() = when {
            dead -> MechPose.DEAD
            downTimer > 0f -> MechPose.DOWN
            riseTimer > 0f -> MechPose.RISE
            staggerTimer > 0f -> MechPose.STAGGER
            airborne -> MechPose.AIR
            dashing -> MechPose.DASH
            crouching -> MechPose.CROUCH
            vel.flatLength > 0.6f -> MechPose.WALK
            else -> MechPose.STAND
        }

    val stance: Stance
        get() = when {
            airborne -> Stance.AIR
            dashing -> Stance.DASH
            else -> Stance.GROUND
        }

    fun ammoOf(slot: WeaponSlot) = ammo[slot.ordinal]

    fun muzzle(slot: WeaponSlot): Vec3 {
        val f = forwardOf(yaw)
        val r = rightOf(yaw)
        val side = when (slot) {
            WeaponSlot.RIGHT -> 1.05f
            WeaponSlot.LEFT -> -1.05f
            WeaponSlot.CENTER -> 0f
        }
        val h = when (slot) {
            WeaponSlot.CENTER -> spec.height * 0.62f
            else -> spec.height * 0.58f
        }
        val crouchDrop = if (crouching) -0.5f else 0f
        return pos + r * side + f * 1.3f + Vec3(0f, h + crouchDrop, 0f)
    }

    fun consumeShots(): List<ShotRequest> {
        if (pendingShots.isEmpty()) return emptyList()
        val out = pendingShots.toList()
        pendingShots.clear()
        return out
    }

    /** Can this slot be used right now? */
    fun canFire(slot: WeaponSlot): Boolean {
        if (!controllable || crouching) return false
        if (action != null) return false
        val s = spec.weapon(slot, stance)
        return ammo[slot.ordinal] >= s.ammoCost - 1e-4f
    }

    fun beginAttack(slot: WeaponSlot): Boolean {
        if (!canFire(slot)) return false
        val st = stance
        val s = spec.weapon(slot, st)
        ammo[slot.ordinal] = max(0f, ammo[slot.ordinal] - s.ammoCost)
        action = ActiveAction(slot, st, s)
        // A dash attack cancels the dash itself but keeps the momentum, which is
        // what makes dash-cancelling worth learning.
        if (dashing) { dashing = false; dashTimer = 0f }
        if (s.selfThrust != 0f) {
            val f = forwardOf(yaw)
            vel = Vec3(f.x * s.selfThrust, vel.y, f.z * s.selfThrust)
        }
        return true
    }

    fun applyDamage(amount: Float, impact: Float, fromDir: Vec3, ignoreGuard: Boolean = false): Boolean {
        if (dead || invuln > 0f) return false
        val guarded = crouching && !ignoreGuard
        val dmg = if (guarded) amount * 0.55f else amount
        hp -= dmg
        tookDamageFlash = 1f
        hitStop = max(hitStop, min(0.07f, 0.02f + impact * 0.05f))
        val push = if (guarded) impact * 0.35f else impact
        stagger += push / spec.weight
        val dir = fromDir.flatNormalized()
        vel = vel + dir * (push * 7f / spec.weight)
        if (hp <= 0f) {
            hp = 0f
            dead = true
            downTimer = 99f
            action = null
            return true
        }
        if (stagger >= 1f) {
            knockDown(dir)
        } else if (push >= 0.5f) {
            action = null
            staggerTimer = max(staggerTimer, 0.35f * push)
        }
        return false
    }

    fun knockDown(dir: Vec3) {
        stagger = 0f
        action = null
        dashing = false
        crouching = false
        downTimer = 1.45f
        staggerTimer = 0f
        airborne = true
        vel = Vec3(dir.x * 11f, 9f, dir.z * 11f)
    }

    fun resetForRound(startPos: Vec3, startYaw: Float) {
        pos = startPos
        yaw = startYaw
        vel = Vec3.ZERO
        hp = spec.armor
        boost = 1f
        ammo[0] = 1f; ammo[1] = 1f; ammo[2] = 1f
        airborne = false; dashing = false; dashTimer = 0f; crouching = false
        action = null
        stagger = 0f; staggerTimer = 0f; downTimer = 0f; riseTimer = 0f
        invuln = 1f; hitStop = 0f; dead = false
        recoil = 0f; landingSquash = 0f; tookDamageFlash = 0f
    }

    /**
     * One simulation step. `lockTarget` is where the mech wants to look; pass null
     * to leave the heading entirely to the turn input.
     */
    fun update(dt: Float, input: PilotInput, prev: PilotInput, arena: Arena, lockTarget: Vec3?) {
        tookDamageFlash = max(0f, tookDamageFlash - dt * 4f)
        landingSquash = max(0f, landingSquash - dt * 5f)
        recoil = max(0f, recoil - dt * 6f)
        invuln = max(0f, invuln - dt)

        if (hitStop > 0f) {
            hitStop -= dt
            if (hitStop > 0f) return
        }

        if (dead) {
            updateFall(dt, arena)
            return
        }

        // Downed: no control until the mech gets back on its rollers.
        if (downTimer > 0f) {
            downTimer -= dt
            updateFall(dt, arena)
            vel = Vec3(vel.x * 0.9f, vel.y, vel.z * 0.9f)
            if (downTimer <= 0f) {
                riseTimer = 0.75f
                invuln = 0.9f
            }
            return
        }
        if (riseTimer > 0f) {
            riseTimer -= dt
            vel = Vec3(damp(vel.x, 0f, 8f, dt), vel.y, damp(vel.z, 0f, 8f, dt))
            updateFall(dt, arena)
            return
        }
        if (staggerTimer > 0f) {
            staggerTimer -= dt
            vel = Vec3(damp(vel.x, 0f, 5f, dt), vel.y, damp(vel.z, 0f, 5f, dt))
            updateFall(dt, arena)
            return
        }

        stagger = max(0f, stagger - spec.staggerRecovery * dt)

        updateHeading(dt, input, lockTarget)
        updateCrouch(input)
        updateBoostAndDash(dt, input, prev)
        updateJump(dt, input, prev)
        updateVelocity(dt, input)
        updateAction(dt)
        integrate(dt, arena)
        updateAnimation(dt)
        regen(dt)
    }

    private fun updateHeading(dt: Float, input: PilotInput, lockTarget: Vec3?) {
        val manual = abs(input.turn) > 0.15f
        if (manual) {
            yaw = wrapAngle(yaw + input.turn * spec.turnRate * 1.35f * dt)
        } else if (lockTarget != null) {
            val want = yawOf(Vec3(lockTarget.x - pos.x, 0f, lockTarget.z - pos.z))
            val rate = if (dashing) spec.turnRate * 0.75f else spec.turnRate
            yaw = turnTowards(yaw, want, rate * dt)
        }
    }

    private fun updateCrouch(input: PilotInput) {
        crouching = input.crouch && !airborne && !dashing && action == null
    }

    private fun updateBoostAndDash(dt: Float, input: PilotInput, prev: PilotInput) {
        val pressed = input.dash && !prev.dash
        if (pressed && boost >= spec.dashCost && !crouching) {
            val dir = moveDirection(input, fallbackForward = true)
            if (airborne) {
                // Air dash: one hard shove, no sustained drain.
                boost -= spec.dashCost
                vel = Vec3(dir.x * spec.dashSpeed * 0.9f, max(vel.y, -2f), dir.z * spec.dashSpeed * 0.9f)
                dashing = false
            } else {
                boost -= spec.dashCost
                dashing = true
                dashTimer = spec.dashDuration
                dashDir = dir
            }
        }

        if (dashing) {
            dashTimer -= dt
            boost -= spec.dashTailCost * dt
            // Steering during a dash is deliberately weak - commit to your line.
            if (input.hasMove) {
                val want = moveDirection(input, fallbackForward = true)
                dashDir = (dashDir + (want - dashDir) * (2.2f * dt)).flatNormalized()
            }
            if (dashTimer <= 0f || boost <= 0f || airborne) {
                dashing = false
                dashTimer = 0f
            }
        }
        boost = clamp(boost, 0f, 1f)
    }

    private fun updateJump(dt: Float, input: PilotInput, prev: PilotInput) {
        val pressed = input.jump && !prev.jump
        if (pressed && !airborne && boost >= spec.jumpCost && !crouching) {
            boost -= spec.jumpCost
            airborne = true
            dashing = false
            vel = Vec3(vel.x, spec.jumpSpeed, vel.z)
        } else if (airborne && input.jump && boost > 0f && vel.y < spec.jumpSpeed * 0.75f) {
            // Held jump feeds the hover jets: the classic float-and-shoot.
            vel = Vec3(vel.x, vel.y + spec.hoverThrust * dt, vel.z)
            boost = max(0f, boost - spec.hoverDrain * dt)
        }
    }

    /** Desired travel direction in world space from the stick, relative to facing. */
    private fun moveDirection(input: PilotInput, fallbackForward: Boolean): Vec3 {
        val f = forwardOf(yaw)
        val r = rightOf(yaw)
        val v = f * input.moveZ + r * input.moveX
        if (v.flatLength < 0.05f) {
            return if (fallbackForward) f else Vec3.ZERO
        }
        return v.flatNormalized()
    }

    private fun updateVelocity(dt: Float, input: PilotInput) {
        if (dashing) {
            vel = Vec3(dashDir.x * spec.dashSpeed, vel.y, dashDir.z * spec.dashSpeed)
            return
        }
        if (crouching) {
            vel = Vec3(damp(vel.x, 0f, 12f, dt), vel.y, damp(vel.z, 0f, 12f, dt))
            return
        }
        val committed = action?.let { it.timer < it.spec.windup + 0.08f && it.spec.selfThrust != 0f } ?: false
        if (committed) {
            vel = Vec3(vel.x * (1f - 1.2f * dt), vel.y, vel.z * (1f - 1.2f * dt))
            return
        }

        val f = forwardOf(yaw)
        val r = rightOf(yaw)
        val fwdScale = if (input.moveZ >= 0f) 1f else spec.backScale
        val want = (f * (input.moveZ * spec.walkSpeed * fwdScale)) +
            (r * (input.moveX * spec.walkSpeed * spec.strafeScale))

        if (airborne) {
            // Thin air control; momentum from the launch is what carries you.
            val target = Vec3(want.x, vel.y, want.z)
            vel = Vec3(damp(vel.x, target.x, 1.6f, dt), vel.y, damp(vel.z, target.z, 1.6f, dt))
        } else {
            val rate = if (want.flatLength > 0.1f) 11f else 9f
            vel = Vec3(damp(vel.x, want.x, rate, dt), vel.y, damp(vel.z, want.z, rate, dt))
        }
    }

    private fun updateAction(dt: Float) {
        val a = action ?: return
        a.timer += dt
        while (a.firing && a.timer >= a.nextShotAt) {
            emitShot(a, a.shotsFired)
            a.shotsFired++
            a.nextShotAt += a.spec.burstInterval
            recoil = 1f
        }
        if (a.timer >= a.totalTime) action = null
    }

    private fun emitShot(a: ActiveAction, i: Int) {
        val pitch = when {
            a.spec.kind == ProjectileKind.MORTAR -> a.spec.launchPitch
            else -> 0f
        }
        pendingShots += ShotRequest(
            shooter = index,
            slot = a.slot,
            stance = a.stance,
            spec = a.spec,
            origin = muzzle(a.slot),
            yaw = yaw,
            pitch = pitch,
            index = i,
        )
    }

    private fun integrate(dt: Float, arena: Arena) {
        if (airborne || pos.y > arena.groundHeightAt(pos) + 1e-3f) {
            vel = Vec3(vel.x, vel.y - spec.gravity * dt, vel.z)
            airborne = true
        }
        pos = pos + vel * dt
        val ground = arena.groundHeightAt(pos)
        if (pos.y <= ground) {
            if (airborne && vel.y < -4f) landingSquash = 1f
            pos = pos.withY(ground)
            if (vel.y < 0f) vel = Vec3(vel.x, 0f, vel.z)
            airborne = false
        }
        val res = arena.collide(pos, spec.radius, pos.y)
        pos = res.position
        if (res.hitWall) {
            // Scrub the component of travel that is heading into the wall.
            val n = res.normal
            val into = vel.x * n.x + vel.z * n.z
            if (into < 0f) vel = Vec3(vel.x - n.x * into, vel.y, vel.z - n.z * into)
            if (dashing) { dashing = false; dashTimer = 0f }
        }
    }

    private fun updateFall(dt: Float, arena: Arena) {
        vel = Vec3(vel.x, vel.y - spec.gravity * dt, vel.z)
        pos = pos + vel * dt
        val ground = arena.groundHeightAt(pos)
        if (pos.y <= ground) {
            pos = pos.withY(ground)
            vel = Vec3(vel.x * 0.6f, 0f, vel.z * 0.6f)
            airborne = false
        }
        pos = arena.collide(pos, spec.radius, pos.y).position
    }

    private fun updateAnimation(dt: Float) {
        val speed = vel.flatLength
        if (dashing) {
            rollerSpin += dt * (speed * 1.6f)
            walkPhase = damp(walkPhase, 0f, 8f, dt)
        } else if (!airborne) {
            walkPhase += dt * speed * 1.1f
            rollerSpin += dt * speed * 0.5f
        }
        eyeSlide = damp(eyeSlide, kotlin.math.sin(rollerSpin * 0.4f) * 0.35f, 3f, dt)
    }

    private fun regen(dt: Float) {
        if (!dashing) {
            val rate = if (crouching) spec.crouchBoostRegen else if (airborne) spec.boostRegen * 0.35f else spec.boostRegen
            boost = clamp(boost + rate * dt, 0f, 1f)
        }
        for (slot in WeaponSlot.entries) {
            val mag = spec.mags[slot] ?: MagazineSpec()
            val rate = if (crouching) mag.crouchReloadRate else mag.reloadRate
            ammo[slot.ordinal] = clamp(ammo[slot.ordinal] + rate * dt, 0f, 1f)
        }
    }
}
