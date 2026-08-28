package com.rollerdash.arena.core

import kotlin.math.abs
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

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
    private fun battle(skill: Float = 0.7f, seed: Long = 7L) = Battle(
        Arena.standard(), Roster.SCOPE_HOUND, Roster.FANG_HOUND,
        BattleConfig(roundTime = 30f, seed = seed, aiSkill = skill),
    )

    @Test
    fun theAiActuallyFightsBack() {
        val b = battle()
        var t = 0f
        // Rounds reset armour, so watch the low-water mark rather than the end state.
        var playerLow = b.player.spec.armor
        var enemyLow = b.enemy.spec.armor
        while (t < 25f) {
            b.update(1f / 60f, PilotInput(moveZ = 0.4f, fireRight = ((t * 60).toInt() / 20) % 2 == 0))
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
