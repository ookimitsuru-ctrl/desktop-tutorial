package com.rollerdash.arena.core

import kotlin.math.abs
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue
import kotlin.test.fail

class MathTest {
    @Test
    fun wrapsAngles() {
        // Half a turn lands on either end of the range - both are the same heading.
        assertTrue(abs(abs(wrapAngle(PI_F * 3f)) - PI_F) < 1e-3f)
        assertTrue(abs(abs(wrapAngle(-PI_F * 3f)) - PI_F) < 1e-3f)
        assertTrue(abs(wrapAngle(PI_F * 2f + 0.5f) - 0.5f) < 1e-3f)
        assertTrue(abs(wrapAngle(0.5f) - 0.5f) < 1e-6f)
    }

    @Test
    fun turnsTheShortWayRound() {
        // From just below +PI to just above -PI is a short hop across the seam.
        val from = PI_F - 0.1f
        val to = -PI_F + 0.1f
        val stepped = turnTowards(from, to, 0.05f)
        assertTrue(angleDelta(from, stepped) > 0f, "should keep turning positive across the seam")
        assertEquals(to, turnTowards(from, to, 1f))
    }

    @Test
    fun forwardAndRightAreOrthogonal() {
        for (i in 0 until 8) {
            val yaw = i * 0.7f
            assertTrue(abs(forwardOf(yaw).dot(rightOf(yaw))) < 1e-5f)
            assertTrue(abs(forwardOf(yaw).length - 1f) < 1e-5f)
        }
    }

    @Test
    fun interceptLeadsAMovingTarget() {
        val origin = Vec3(0f, 0f, 0f)
        val target = Vec3(0f, 0f, 50f)
        val vel = Vec3(10f, 0f, 0f)
        val aim = predictIntercept(origin, target, vel, 100f)
        assertTrue(aim.x > 4f && aim.x < 6f, "expected roughly half a second of lead, got ${aim.x}")
    }

    @Test
    fun rngIsDeterministicAndInRange() {
        val a = Rng(42)
        val b = Rng(42)
        repeat(500) {
            val x = a.nextFloat()
            assertEquals(x, b.nextFloat())
            assertTrue(x >= 0f && x < 1f, "out of range: $x")
        }
    }
}

class ArenaTest {
    @Test
    fun keepsMechsInsideTheWalls() {
        val arena = Arena(60f)
        val p = arena.collide(Vec3(200f, 0f, 0f), 1.5f, 0f)
        assertTrue(p.hitWall)
        assertEquals(58.5f, p.position.x)
    }

    @Test
    fun pushesOutOfCover() {
        val arena = Arena(60f, listOf(Obstacle.Box(Vec3.ZERO, 5f, 5f, 10f)))
        val res = arena.collide(Vec3(4f, 0f, 0f), 1f, 0f)
        assertTrue(res.hitWall)
        assertTrue(res.position.x >= 6f - 1e-3f, "expected to be shoved clear, got ${res.position.x}")
    }

    @Test
    fun tallCoverBlocksSightLowCoverDoesNot() {
        val tall = Arena(60f, listOf(Obstacle.Box(Vec3.ZERO, 4f, 4f, 12f)))
        assertTrue(tall.blocked(Vec3(-20f, 2f, 0f), Vec3(20f, 2f, 0f)))
        val low = Arena(60f, listOf(Obstacle.Box(Vec3.ZERO, 4f, 4f, 1f)))
        assertFalse(low.blocked(Vec3(-20f, 3f, 0f), Vec3(20f, 3f, 0f)))
    }

    @Test
    fun lowCoverCanBeStoodOn() {
        val arena = Arena(60f, listOf(Obstacle.Box(Vec3.ZERO, 5f, 5f, 3f)))
        assertEquals(3f, arena.groundHeightAt(Vec3(1f, 0f, 1f)))
        assertEquals(0f, arena.groundHeightAt(Vec3(30f, 0f, 30f)))
    }
}

class MechTest {
    private fun mech(spec: AtSpec = Roster.SCOPE_HOUND) = Mech(0, spec, Vec3.ZERO, 0f)

    private fun run(m: Mech, arena: Arena, seconds: Float, input: PilotInput, prevSeed: PilotInput = PilotInput.IDLE) {
        var prev = prevSeed
        var t = 0f
        val dt = 1f / 120f
        while (t < seconds) {
            m.update(dt, input, prev, arena, null)
            prev = input
            t += dt
        }
    }

    @Test
    fun rollerDashIsFasterThanWalkingAndCostsBoost() {
        val arena = Arena(200f)
        val walker = mech()
        run(walker, arena, 1.0f, PilotInput(moveZ = 1f))
        val walkDist = walker.pos.flatLength

        val dasher = mech()
        val input = PilotInput(moveZ = 1f, dash = true)
        dasher.update(1f / 120f, input, PilotInput.IDLE, arena, null)
        run(dasher, arena, 0.5f, input, input)
        assertTrue(dasher.pos.flatLength > walkDist, "dash should outrun a walk")
        assertTrue(dasher.boost < 0.75f, "dash should have eaten boost, got ${dasher.boost}")
    }

    @Test
    fun dashEndsWhenItsTimerRunsOut() {
        val arena = Arena(200f)
        val m = mech()
        val input = PilotInput(moveZ = 1f, dash = true)
        m.update(1f / 120f, input, PilotInput.IDLE, arena, null)
        assertTrue(m.dashing)
        run(m, arena, m.spec.dashDuration + 0.2f, PilotInput(moveZ = 1f), input)
        assertFalse(m.dashing)
    }

    @Test
    fun jumpLeavesTheGroundAndComesBack() {
        val arena = Arena(200f)
        val m = mech()
        val jump = PilotInput(jump = true)
        m.update(1f / 120f, jump, PilotInput.IDLE, arena, null)
        assertTrue(m.airborne)
        run(m, arena, 4f, PilotInput.IDLE, jump)
        assertFalse(m.airborne, "should have landed within four seconds")
        assertEquals(0f, m.pos.y)
    }

    @Test
    fun crouchingReloadsFarFasterThanStanding() {
        val arena = Arena(200f)
        val standing = mech()
        val crouched = mech()
        standing.ammo[WeaponSlot.RIGHT.ordinal] = 0f
        crouched.ammo[WeaponSlot.RIGHT.ordinal] = 0f
        run(standing, arena, 1f, PilotInput.IDLE)
        run(crouched, arena, 1f, PilotInput(crouch = true))
        assertTrue(crouched.crouching)
        assertTrue(
            crouched.ammoOf(WeaponSlot.RIGHT) > standing.ammoOf(WeaponSlot.RIGHT) * 2f,
            "crouch reload ${crouched.ammoOf(WeaponSlot.RIGHT)} vs stand ${standing.ammoOf(WeaponSlot.RIGHT)}",
        )
    }

    @Test
    fun firingEmitsEveryShotInTheBurst() {
        val arena = Arena(200f)
        val m = mech()
        assertTrue(m.beginAttack(WeaponSlot.RIGHT))
        val spec = m.spec.weapon(WeaponSlot.RIGHT, Stance.GROUND)
        assertEquals(1f - spec.ammoCost, m.ammoOf(WeaponSlot.RIGHT), "the press should spend the magazine up front")
        var shots = 0
        var t = 0f
        while (t < spec.recovery + 2f) {
            m.update(1f / 120f, PilotInput.IDLE, PilotInput.IDLE, arena, null)
            shots += m.consumeShots().size
            t += 1f / 120f
        }
        assertEquals(spec.shots, shots)
        assertTrue(m.action == null, "the action should have recovered by now")
    }

    @Test
    fun theStanceDecidesWhichMoveComesOut() {
        val m = mech()
        assertEquals(Stance.GROUND, m.stance)
        m.dashing = true
        assertEquals(Stance.DASH, m.stance)
        m.airborne = true
        assertEquals(Stance.AIR, m.stance)
        assertEquals("DASH SWEEP", m.spec.weapon(WeaponSlot.RIGHT, Stance.DASH).name)
    }

    @Test
    fun enoughImpactKnocksAMechDown() {
        val m = mech()
        assertFalse(m.applyDamage(50f, 1.2f, Vec3(0f, 0f, 1f)))
        assertEquals(MechPose.DOWN, m.pose)
        assertFalse(m.controllable)
    }

    @Test
    fun guardingCutsDamageAndArmorRunsOut() {
        val arena = Arena(200f)
        val guard = mech()
        run(guard, arena, 0.2f, PilotInput(crouch = true))
        guard.applyDamage(100f, 0.1f, Vec3(0f, 0f, 1f))
        val open = mech()
        open.applyDamage(100f, 0.1f, Vec3(0f, 0f, 1f))
        assertTrue(guard.hp > open.hp)

        val doomed = mech()
        assertTrue(doomed.applyDamage(9999f, 0.5f, Vec3(0f, 0f, 1f)))
        assertTrue(doomed.dead)
    }

    @Test
    fun invulnerabilityAfterRisingIgnoresHits() {
        val m = mech()
        m.invuln = 1f
        assertFalse(m.applyDamage(500f, 0.5f, Vec3(0f, 0f, 1f)))
        assertEquals(m.spec.armor, m.hp)
    }
}

class BattleTest {
    private fun battle(skill: Float = 0.7f, seed: Long = 7L, roundTime: Float = 30f) = Battle(
        Arena.standard(), Roster.SCOPE_HOUND, Roster.FANG_HOUND,
        BattleConfig(roundTime = roundTime, seed = seed, aiSkill = skill),
    )

    @Test
    fun theAiActuallyFightsBack() {
        val b = battle(seed = 7L, roundTime = 90f)
        var t = 0f
        // Rounds reset armour, so watch the low-water mark rather than the end state.
        var playerLow = b.player.spec.armor
        var enemyLow = b.enemy.spec.armor
        while (t < 45f) {
            // Play it like a person would: close to fighting range and keep
            // circling. Two machines strolling at opposite ends of a 68 m arena
            // trade nothing but dodges.
            val gap = (b.enemy.center - b.player.center).flatLength
            b.update(
                1f / 60f,
                PilotInput(
                    moveZ = if (gap > 22f) 1f else 0f,
                    moveX = 0.5f,
                    fireRight = ((t * 60).toInt() / 20) % 2 == 0,
                ),
            )
            playerLow = minOf(playerLow, b.player.hp)
            enemyLow = minOf(enemyLow, b.enemy.hp)
            t += 1f / 60f
        }
        assertTrue(playerLow < b.player.spec.armor, "the AI never landed a shot")
        assertTrue(enemyLow < b.enemy.spec.armor, "the player never landed a shot")
    }

    @Test
    fun roundsAdvanceAndTheMatchEnds() {
        val b = Battle(
            Arena.standard(), Roster.SCOPE_HOUND, Roster.SCOPE_HOUND,
            BattleConfig(roundTime = 2f, seed = 11L, aiSkill = 0.5f),
        )
        var t = 0f
        while (t < 60f && b.phase != RoundPhase.MATCH_OVER) {
            b.update(1f / 60f, PilotInput.IDLE)
            t += 1f / 60f
        }
        assertEquals(RoundPhase.MATCH_OVER, b.phase)
        assertTrue(b.matchWinner in 0..2)
        assertTrue(b.roundsWon[0] + b.roundsWon[1] > 0 || b.matchWinner == 2)
    }

    @Test
    fun ordnanceGetsCleanedUp() {
        val b = battle()
        var t = 0f
        while (t < 20f) {
            b.update(1f / 60f, PilotInput(fireRight = true, fireLeft = ((t * 10).toInt() % 3 == 0)))
            t += 1f / 60f
        }
        assertTrue(b.projectiles.size < 400, "projectile list is leaking: ${b.projectiles.size}")
    }

    @Test
    fun mechsNeverLeaveTheArena() {
        val b = battle()
        var t = 0f
        while (t < 20f) {
            val push = if ((t * 2).toInt() % 2 == 0) 1f else -1f
            b.update(1f / 60f, PilotInput(moveX = push, moveZ = 1f, dash = ((t * 60).toInt() % 40 == 0)))
            t += 1f / 60f
        }
        for (m in b.mechs) {
            assertTrue(abs(m.pos.x) <= b.arena.halfSize + 0.1f, "escaped on x: ${m.pos.x}")
            assertTrue(abs(m.pos.z) <= b.arena.halfSize + 0.1f, "escaped on z: ${m.pos.z}")
            assertTrue(m.pos.y >= -0.01f)
        }
    }

    @Test
    fun sameSeedSameFight() {
        fun run(): String {
            val b = battle(seed = 99L)
            var t = 0f
            while (t < 12f) {
                b.update(1f / 60f, PilotInput(moveZ = 1f, fireRight = ((t * 60).toInt() % 25 == 0)))
                t += 1f / 60f
            }
            return "${b.player.hp}|${b.enemy.hp}|${b.player.pos}|${b.enemy.pos}"
        }
        assertEquals(run(), run())
    }

    @Test
    fun eventsFireForTheRenderer() {
        val b = battle()
        val seen = mutableSetOf<EventType>()
        var t = 0f
        while (t < 15f) {
            b.update(1f / 60f, PilotInput(moveZ = 1f, dash = ((t * 60).toInt() % 50 == 0), fireRight = true))
            seen += b.drainEvents().map { it.type }
            t += 1f / 60f
        }
        assertTrue(EventType.MUZZLE in seen)
        assertTrue(EventType.DASH_START in seen)
        assertTrue(EventType.IMPACT in seen)
    }

    @Test
    fun everyMachineOnTheRosterCanFight() {
        for (spec in Roster.all) {
            val b = Battle(
                Arena.standard(), spec, Roster.BERSERK,
                BattleConfig(roundTime = 10f, seed = 5L, aiSkill = 0.8f),
            )
            var t = 0f
            while (t < 10f) {
                b.update(1f / 60f, PilotInput(moveZ = 1f, fireRight = true, fireLeft = ((t * 60).toInt() % 30 == 0)))
                t += 1f / 60f
            }
            assertNotNull(b.lastRoundResult)
            for (slot in WeaponSlot.entries) {
                for (stance in Stance.entries) {
                    assertNotNull(spec.weapon(slot, stance), "${spec.id} is missing $slot/$stance")
                }
            }
        }
    }

    @Test
    fun twinStickMapsLikeTheCabinet() {
        val forward = TwinStick(leftY = 1f, rightY = 1f).toPilotInput()
        assertTrue(forward.moveZ > 0.9f)
        val back = TwinStick(leftY = -1f, rightY = -1f).toPilotInput()
        assertTrue(back.moveZ < -0.9f)
        val pivot = TwinStick(leftY = 1f, rightY = -1f).toPilotInput()
        assertTrue(pivot.turn > 0.5f && abs(pivot.moveZ) < 0.05f)
        val strafe = TwinStick(leftX = 1f, rightX = 1f).toPilotInput()
        assertTrue(strafe.moveX > 0.9f && abs(strafe.turn) < 0.05f)
        val jump = TwinStick(turboLeft = true, turboRight = true).toPilotInput()
        assertTrue(jump.jump && !jump.dash)
        val dash = TwinStick(leftY = 1f, rightY = 1f, turboRight = true).toPilotInput()
        assertTrue(dash.dash && !dash.jump)
        val center = TwinStick(triggerLeft = true, triggerRight = true).toPilotInput()
        assertTrue(center.fireCenter)
    }
}

/**
 * The lock-on assist. Without it the player's rounds go where the nose points,
 * which against a machine crossing at dash speed is a guaranteed miss - that is
 * exactly what it felt like on a device.
 */
class AimAssistTest {

    private companion object {
        /** Marks the one round these tests care about. */
        const val GRAZE_ID = 9001
    }

    private fun firstProjectileDirection(
        assist: Boolean,
        shooter: Int,
        targetPos: Vec3,
        targetVel: Vec3,
        targetAirborne: Boolean = false,
    ): Pair<Vec3, Vec3> {
        val arena = Arena(300f)
        val battle = Battle(
            arena, Roster.SCOPE_HOUND, Roster.SCOPE_HOUND,
            BattleConfig(roundTime = 60f, seed = 4242L, aiSkill = 0f, aimAssist = assist),
        )
        val gunner = battle.mechs[shooter]
        val target = battle.mechs[1 - shooter]

        fun pin() {
            gunner.pos = Vec3.ZERO
            gunner.vel = Vec3.ZERO
            target.pos = targetPos
            target.vel = targetVel
            target.airborne = targetAirborne
        }

        // Let the round start and the gunner settle onto the target before it fires.
        repeat(240) {
            pin()
            battle.update(1f / 60f, PilotInput.IDLE)
        }
        pin()
        gunner.beginAttack(WeaponSlot.RIGHT)
        var found: Projectile? = null
        for (frame in 0 until 60) {
            pin()
            battle.update(1f / 60f, PilotInput.IDLE)
            found = battle.projectiles.firstOrNull { it.owner == shooter }
            if (found != null) break
        }
        val projectile = found ?: fail("no round was fired")
        val straight = (target.center - projectile.prevPos).normalized()
        return projectile.vel.normalized() to straight
    }

    private fun degreesBetween(a: Vec3, b: Vec3) =
        kotlin.math.acos(clamp(a.dot(b), -1f, 1f)) * 57.2958f

    @Test
    fun assistedShotsLeadACrossingTarget() {
        val crossing = Vec3(24f, 0f, 0f)
        val (assisted, straightA) = firstProjectileDirection(true, 0, Vec3(0f, 0f, 34f), crossing)
        val (plain, straightB) = firstProjectileDirection(false, 0, Vec3(0f, 0f, 34f), crossing)

        assertTrue(
            assisted.dot(crossing.normalized()) > 0.08f,
            "assisted shot should be sent ahead of the target, got $assisted",
        )
        assertTrue(
            degreesBetween(assisted, straightA) > 6f,
            "assisted shot should not point straight at the target",
        )
        assertTrue(
            degreesBetween(plain, straightB) < 3f,
            "unassisted shot should point straight down the nose",
        )
    }

    @Test
    fun assistedShotsAngleUpAtAnAirborneTarget() {
        val (assisted, _) = firstProjectileDirection(true, 0, Vec3(0f, 14f, 30f), Vec3.ZERO, targetAirborne = true)
        val (plain, _) = firstProjectileDirection(false, 0, Vec3(0f, 14f, 30f), Vec3.ZERO, targetAirborne = true)
        assertTrue(assisted.y > 0.25f, "assisted shot should climb to a jumping target, got ${assisted.y}")
        assertTrue(kotlin.math.abs(plain.y) < 0.05f, "unassisted shot flies flat, got ${plain.y}")
    }

    @Test
    fun theEnemyPilotGetsNoAssist() {
        val (enemyShot, straight) = firstProjectileDirection(true, 1, Vec3(0f, 0f, 34f), Vec3(24f, 0f, 0f))
        assertTrue(
            degreesBetween(enemyShot, straight) < 3f,
            "the enemy has to lead by turning, not by assist",
        )
    }

    @Test
    fun assistNeverSendsAShotFarOffTheNose() {
        // A target crossing absurdly fast would ask for an impossible lead.
        val (assisted, straight) = firstProjectileDirection(true, 0, Vec3(0f, 0f, 12f), Vec3(400f, 0f, 0f))
        assertTrue(
            degreesBetween(assisted, straight) < 40f,
            "the correction has to stay bounded, got ${degreesBetween(assisted, straight)} deg",
        )
    }

    /**
     * Fires one round that passes [extra] metres outside the target's hull and
     * reports whether it registered. Everything else is held still: the machines
     * are pinned and every other round in the air is thrown away, so the only
     * thing that can do damage is this shot.
     */
    private fun grazeLands(shooter: Int, extra: Float): Boolean {
        val battle = Battle(
            Arena(300f), Roster.SCOPE_HOUND, Roster.SCOPE_HOUND,
            BattleConfig(roundTime = 60f, seed = 99L, aiSkill = 0f),
        )
        val gunner = battle.mechs[shooter]
        val target = battle.mechs[1 - shooter]
        fun pin() {
            target.pos = Vec3.ZERO
            target.vel = Vec3.ZERO
            gunner.pos = Vec3(0f, 0f, -40f)
            gunner.vel = Vec3.ZERO
        }
        // Run the intro out so rounds actually fly.
        repeat(240) {
            pin()
            battle.update(1f / 60f, PilotInput.IDLE)
        }
        pin()

        val spec = gunner.spec.weapon(WeaponSlot.RIGHT, Stance.GROUND)
        val before = target.hp
        battle.projectiles.clear()
        battle.projectiles += Projectile(
            GRAZE_ID, shooter, spec,
            Vec3(target.spec.radius + extra, target.center.y, -40f),
            Vec3(0f, 0f, spec.speed),
            spec.lifetime,
        )
        repeat(60) {
            battle.projectiles.retainAll { it.id == GRAZE_ID }
            battle.fields.clear()
            pin()
            battle.update(1f / 60f, PilotInput.IDLE)
        }
        return target.hp < before
    }

    @Test
    fun aGrazingRoundStillCountsForThePlayer() {
        assertTrue(grazeLands(0, 0.5f), "a near miss should still register for the player")
        assertTrue(grazeLands(0, 0.8f), "the slack should be worth most of a metre")
    }

    @Test
    fun theSlackIsNotSoWideThatShotsHitEmptyAir() {
        assertFalse(grazeLands(0, 1.4f), "a clean miss has to stay a miss")
    }

    @Test
    fun theEnemyPilotHasToHitTheHull() {
        assertFalse(grazeLands(1, 0.5f), "the enemy gets no forgiveness on its aim")
    }

    @Test
    fun aLobbedShellIsGivenAnArcThatReachesTheTarget() {
        val spec = Roster.TORTOISE.weapon(WeaponSlot.LEFT, Stance.GROUND)
        val distance = 45f
        val pitch = ballisticPitch(distance, 0f, spec.speed, spec.gravity)
            ?: fail("no firing solution at ${distance}m")
        // Fly the shell and see where it comes down.
        val vy = spec.speed * kotlin.math.sin(pitch)
        val vz = spec.speed * kotlin.math.cos(pitch)
        val flight = distance / vz
        val height = vy * flight - 0.5f * spec.gravity * flight * flight
        assertTrue(pitch > 0f, "a mortar has to be lobbed, got $pitch")
        assertTrue(abs(height) < 1.5f, "shell missed the range by ${height}m")
    }
}
