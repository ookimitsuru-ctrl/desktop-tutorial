package com.rollerdash.arena.core

import kotlin.math.abs
import kotlin.math.max

enum class AiState { APPROACH, ORBIT, PRESS, EVADE, RELOAD }

/**
 * The enemy pilot. It plays with the same [PilotInput] a human gets - no cheating
 * on speed or turn rate - and gets its edge from timing instead.
 *
 * `skill` runs 0..1 and moves reaction time, trigger discipline and how often it
 * bothers to dodge.
 */
class AiPilot(
    private val self: Mech,
    private val foe: Mech,
    private val arena: Arena,
    private val rng: Rng,
    var skill: Float = 0.6f,
) {
    private var state = AiState.APPROACH
    private var stateTimer = 0f
    private var decisionTimer = 0f
    private var strafeSign = 1f
    private var evadeDir = Vec3.ZERO
    private var dashLatch = false
    private var jumpLatch = false
    private var fireLatchR = false
    private var fireLatchL = false
    private var fireCooldown = 0f
    private var reaction = 0f

    /** Range this machine wants to fight at, derived from what it is carrying. */
    private val preferredRange: Float = run {
        val ground = self.spec.weapon(WeaponSlot.RIGHT, Stance.GROUND)
        when {
            self.spec.weapon(WeaponSlot.CENTER, Stance.DASH).kind == ProjectileKind.MELEE &&
                self.spec.dashSpeed > 30f -> 14f
            ground.kind == ProjectileKind.PLASMA -> 42f
            self.spec.weight > 1.3f -> 20f
            else -> 26f
        }
    }

    fun reset() {
        state = AiState.APPROACH
        stateTimer = 0f
        decisionTimer = 0f
        evadeDir = Vec3.ZERO
        fireCooldown = 0.6f
        reaction = reactionTime()
    }

    private fun reactionTime() = lerp(0.42f, 0.09f, clamp(skill, 0f, 1f)) * rng.range(0.7f, 1.3f)

    fun think(dt: Float, projectiles: List<Projectile>): PilotInput {
        if (!self.controllable) return PilotInput.IDLE

        stateTimer += dt
        decisionTimer -= dt
        fireCooldown -= dt
        reaction -= dt

        val toFoe = foe.center - self.center
        val dist = toFoe.flatLength
        val clearLine = !arena.blocked(self.center + Vec3(0f, 0.5f, 0f), foe.center)

        val threat = incomingThreat(projectiles)
        if (threat != null && state != AiState.EVADE && rng.chance(0.25f + skill * 0.7f)) {
            state = AiState.EVADE
            stateTimer = 0f
            evadeDir = threat
            dashLatch = false
        }

        if (decisionTimer <= 0f && state != AiState.EVADE) {
            decisionTimer = rng.range(0.5f, 1.3f) * lerp(1.4f, 0.7f, skill)
            state = chooseState(dist, clearLine)
            strafeSign = if (rng.chance(0.5f)) 1f else -1f
        }

        var moveX = 0f
        var moveZ = 0f
        var dash = false
        var jump = false
        var crouch = false

        when (state) {
            AiState.APPROACH -> {
                moveZ = 1f
                moveX = strafeSign * 0.35f
                dash = dist > preferredRange * 1.6f && self.boost > 0.45f && !self.dashing
            }
            AiState.ORBIT -> {
                moveX = strafeSign
                moveZ = clamp((dist - preferredRange) / 18f, -0.85f, 0.85f)
                // A long-range frame that has been closed down dashes out rather
                // than trading punches it cannot win.
                val crowded = dist < preferredRange * 0.55f && preferredRange > 30f
                dash = self.boost > 0.6f && stateTimer < 0.25f && rng.chance(0.02f + skill * 0.05f) ||
                    (crowded && !self.dashing && self.boost > self.spec.dashCost + 0.1f)
            }
            AiState.PRESS -> {
                moveZ = 1f
                moveX = strafeSign * 0.5f
                dash = self.boost > self.spec.dashCost + 0.1f && !self.dashing
                jump = dist < 18f && rng.chance(0.004f + skill * 0.01f)
            }
            AiState.EVADE -> {
                val side = rightOf(self.yaw)
                val away = if (side.dot(evadeDir) > 0f) 1f else -1f
                moveX = away
                moveZ = -0.25f
                dash = !self.dashing && self.boost > self.spec.dashCost
                jump = self.boost > 0.55f && rng.chance(0.01f + skill * 0.02f)
                if (stateTimer > 0.75f) { state = AiState.ORBIT; stateTimer = 0f }
            }
            AiState.RELOAD -> {
                crouch = true
                if (self.ammoOf(WeaponSlot.RIGHT) > 0.85f && self.boost > 0.8f) {
                    state = AiState.ORBIT
                    stateTimer = 0f
                }
            }
        }

        // Keep clear of the arena wall - being pinned against it is how ATs die.
        val edge = arena.halfSize - 8f
        if (abs(self.pos.x) > edge || abs(self.pos.z) > edge) {
            val inward = (Vec3.ZERO - self.pos).flatNormalized()
            val f = forwardOf(self.yaw)
            val r = rightOf(self.yaw)
            moveZ = clamp(moveZ + inward.dot(f) * 0.8f, -1f, 1f)
            moveX = clamp(moveX + inward.dot(r) * 0.8f, -1f, 1f)
        }

        val turn = aimTurn(dist)
        val fire = pickFire(dist, clearLine)

        // Edge-triggered buttons: latches make sure a press lands as one press.
        val dashPress = dash && !dashLatch
        dashLatch = dash
        val jumpPress = jump && !jumpLatch
        jumpLatch = jump

        val wantRight = fire == WeaponSlot.RIGHT || fire == WeaponSlot.CENTER
        val wantLeft = fire == WeaponSlot.LEFT || fire == WeaponSlot.CENTER
        val rightPress = wantRight && !fireLatchR
        val leftPress = wantLeft && !fireLatchL
        fireLatchR = wantRight
        fireLatchL = wantLeft

        return PilotInput(
            moveX = moveX,
            moveZ = moveZ,
            turn = turn,
            dash = dashPress,
            jump = jumpPress,
            crouch = crouch,
            fireRight = rightPress,
            fireLeft = leftPress,
        )
    }

    private fun chooseState(dist: Float, clearLine: Boolean): AiState {
        val dry = self.ammoOf(WeaponSlot.RIGHT) < 0.25f && self.ammoOf(WeaponSlot.LEFT) < 0.35f
        if (dry && dist > 34f && self.boost < 0.5f) return AiState.RELOAD
        if (!clearLine) return AiState.APPROACH
        return when {
            dist > preferredRange * 1.5f -> AiState.APPROACH
            dist < preferredRange * 0.55f && preferredRange > 20f -> AiState.ORBIT
            rng.chance(0.25f + skill * 0.35f) && self.boost > 0.5f -> AiState.PRESS
            else -> AiState.ORBIT
        }
    }

    /**
     * Manual turn correction so shots lead a moving target. Small corrections are
     * left to the lock-on, which is exactly how the player's own aim behaves.
     */
    private fun aimTurn(dist: Float): Float {
        val weapon = self.spec.weapon(WeaponSlot.RIGHT, self.stance)
        if (weapon.speed <= 0f) return 0f
        val aimPoint = predictIntercept(self.muzzle(WeaponSlot.RIGHT), foe.center, foe.vel, weapon.speed)
        val wantYaw = yawOf(Vec3(aimPoint.x - self.pos.x, 0f, aimPoint.z - self.pos.z))
        val err = angleDelta(self.yaw, wantYaw)
        // Sloppier pilots simply do not correct as hard.
        val gain = lerp(1.6f, 4.2f, skill)
        val jitter = (1f - skill) * 0.10f * rng.nextSigned()
        val cmd = (err + jitter) * gain
        return if (abs(err) < 0.05f || dist < 6f) 0f else clamp(cmd, -1f, 1f)
    }

    private fun pickFire(dist: Float, clearLine: Boolean): WeaponSlot? {
        if (!clearLine || fireCooldown > 0f || reaction > 0f) return null
        val aimErr = abs(angleDelta(self.yaw, yawOf(Vec3(foe.pos.x - self.pos.x, 0f, foe.pos.z - self.pos.z))))
        val tolerance = lerp(0.10f, 0.26f, 1f - skill)

        val meleeCenter = self.spec.weapon(WeaponSlot.CENTER, self.stance).kind == ProjectileKind.MELEE
        val meleeLeft = self.spec.weapon(WeaponSlot.LEFT, self.stance).kind == ProjectileKind.MELEE
        val slot = when {
            meleeCenter && dist < 12f && self.ammoOf(WeaponSlot.CENTER) >= 1f && aimErr < 0.55f -> WeaponSlot.CENTER
            meleeLeft && dist < 8f && self.ammoOf(WeaponSlot.LEFT) >= 0.5f && aimErr < 0.6f -> WeaponSlot.LEFT
            dist > 18f && self.ammoOf(WeaponSlot.LEFT) > 0.6f && rng.chance(0.45f) -> WeaponSlot.LEFT
            self.ammoOf(WeaponSlot.RIGHT) > 0.3f && aimErr < tolerance -> WeaponSlot.RIGHT
            self.ammoOf(WeaponSlot.CENTER) >= 1f && aimErr < tolerance * 0.6f && rng.chance(0.3f) -> WeaponSlot.CENTER
            else -> null
        } ?: return null

        val spec = self.spec.weapon(slot, self.stance)
        if (spec.kind != ProjectileKind.MELEE && dist > 70f) return null
        fireCooldown = spec.recovery + lerp(0.55f, 0.06f, skill) * rng.range(0.6f, 1.4f)
        reaction = reactionTime() * 0.4f
        return slot
    }

    /** Direction to slide if something dangerous is about to arrive, else null. */
    private fun incomingThreat(projectiles: List<Projectile>): Vec3? {
        var best: Vec3? = null
        var bestTime = 0.9f
        for (p in projectiles) {
            if (p.owner == self.index) continue
            val rel = self.center - p.pos
            val speed = p.vel.length
            if (speed < 1f) continue
            val dir = p.vel / speed
            val along = rel.dot(dir)
            if (along <= 0f) continue
            val time = along / speed
            if (time > bestTime) continue
            val lateral = (rel - dir * along).flatLength
            val danger = self.spec.radius + p.spec.radius + max(p.spec.blastRadius * 0.6f, 1.5f)
            if (lateral < danger) {
                bestTime = time
                val offset = (rel - dir * along).flatNormalized()
                best = if (offset.flatLength < 0.1f) rightOf(self.yaw) else offset
            }
        }
        return best
    }

    val debugState: AiState get() = state
    val debugRange: Float get() = preferredRange
}
