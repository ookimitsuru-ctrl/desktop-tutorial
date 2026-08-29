package com.rollerdash.arena.core

import kotlin.math.abs
import kotlin.test.Test
import kotlin.test.assertTrue
import kotlin.test.fail

/**
 * Runs every matchup for a full round with both sides under AI control and
 * checks the invariants that a renderer, a HUD and a physics step all quietly
 * depend on: finite numbers, mechs inside the arena, gauges in range, and an
 * ordnance list that does not grow without bound.
 *
 * This is the test that would catch a NaN creeping in through a normalise or a
 * divide, which is the failure mode most likely to survive every other test here
 * and then wreck the camera on a device.
 */
class SoakTest {

    private fun Vec3.isFinite() = x.isFinite() && y.isFinite() && z.isFinite()

    @Test
    fun everyMatchupSurvivesAFullRoundWithoutGoingNumericallyWrong() {
        var peakProjectiles = 0
        for (playerSpec in Roster.all) {
            for (enemySpec in Roster.all) {
                for (skill in listOf(0.3f, 0.95f)) {
                    val arena = Arena.standard()
                    val seed = (playerSpec.id.hashCode() * 31L + enemySpec.id.hashCode())
                    val battle = Battle(
                        arena, playerSpec, enemySpec,
                        BattleConfig(roundTime = 60f, seed = seed, aiSkill = skill),
                    )
                    // A second AI pilot stands in for the player, so both sides move.
                    val ghost = AiPilot(battle.player, battle.enemy, arena, Rng(4242), skill)
                    val label = "${playerSpec.id} vs ${enemySpec.id} @ $skill"
                    var t = 0f
                    while (t < 60f) {
                        val input = if (battle.phase == RoundPhase.FIGHT) {
                            ghost.think(1f / 60f, battle.projectiles)
                        } else {
                            PilotInput.IDLE
                        }
                        battle.update(1f / 60f, input)
                        battle.drainEvents()

                        for (m in battle.mechs) {
                            if (!m.pos.isFinite() || !m.vel.isFinite() || !m.yaw.isFinite()) {
                                fail("$label: went non-finite at t=$t (pos=${m.pos} vel=${m.vel} yaw=${m.yaw})")
                            }
                            if (abs(m.pos.x) > arena.halfSize + 0.2f || abs(m.pos.z) > arena.halfSize + 0.2f) {
                                fail("$label: left the arena at t=$t (${m.pos})")
                            }
                            if (m.pos.y < -0.05f || m.pos.y > 200f) fail("$label: y=${m.pos.y} at t=$t")
                            if (m.hp < 0f || m.hp > m.spec.armor) fail("$label: hp=${m.hp} at t=$t")
                            if (m.boost < -0.001f || m.boost > 1.001f) fail("$label: boost=${m.boost} at t=$t")
                            for (slot in WeaponSlot.entries) {
                                val ammo = m.ammoOf(slot)
                                if (ammo < -0.001f || ammo > 1.001f) fail("$label: $slot ammo=$ammo at t=$t")
                            }
                        }
                        for (p in battle.projectiles) {
                            if (!p.pos.isFinite()) fail("$label: projectile went non-finite at t=$t")
                        }
                        peakProjectiles = maxOf(peakProjectiles, battle.projectiles.size)
                        t += 1f / 60f
                    }
                }
            }
        }
        // Two machines cannot legitimately keep more than a few dozen rounds alive.
        assertTrue(peakProjectiles < 120, "ordnance list peaked at $peakProjectiles - something is leaking")
    }
}
