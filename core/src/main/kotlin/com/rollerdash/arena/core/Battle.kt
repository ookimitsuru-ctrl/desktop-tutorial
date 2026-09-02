package com.rollerdash.arena.core

import kotlin.math.max
import kotlin.math.min

enum class EventType {
    MUZZLE, IMPACT, EXPLOSION, MELEE_HIT, MELEE_SWING, DASH_START, LAND, JUMP,
    KNOCKDOWN, DESTROYED, ROUND_START, ROUND_END, MATCH_END, LOCK_ON, GUARD,
}

/** Fire-and-forget notification for the renderer and the sound bank. */
data class GameEvent(
    val type: EventType,
    val pos: Vec3 = Vec3.ZERO,
    val dir: Vec3 = Vec3.ZERO,
    val magnitude: Float = 1f,
    val actor: Int = -1,
)

enum class RoundPhase { READY, FIGHT, KO, MATCH_OVER }

data class BattleConfig(
    val roundTime: Float = 90f,
    val roundsToWin: Int = 2,
    val seed: Long = 0x2B07705AL,
    val aiSkill: Float = 0.6f,
    /**
     * Arcade lock-on for the player: shots lead the target and lobbed weapons
     * get a real launch angle. Off means the machine simply fires where its
     * nose is pointing, which is what the enemy pilot has to do.
     */
    val aimAssist: Boolean = true,
)

/**
 * The whole fight: two Armored Troopers, their ordnance, the round clock and
 * the score. Deterministic given the same inputs and seed.
 */
class Battle(
    val arena: Arena,
    playerSpec: AtSpec,
    enemySpec: AtSpec,
    val config: BattleConfig = BattleConfig(),
) {
    val rng = Rng(config.seed)
    val player = Mech(0, playerSpec, Vec3(0f, 0f, -34f), 0f)
    val enemy = Mech(1, enemySpec, Vec3(0f, 0f, 34f), PI_F)
    val mechs = listOf(player, enemy)

    val projectiles = mutableListOf<Projectile>()
    val fields = mutableListOf<BurnField>()
    private val events = mutableListOf<GameEvent>()
    private var nextProjectileId = 1

    val ai = AiPilot(enemy, player, arena, Rng(config.seed xor 0x9E3779B9L), config.aiSkill)

    private var prevInput = arrayOf(PilotInput.IDLE, PilotInput.IDLE)

    // The AI thinks once per display frame, not once per physics substep, so its
    // reactions are no quicker than a player's thumbs.
    private var aiInput = PilotInput.IDLE
    private var aiThinkTimer = 0f

    var phase = RoundPhase.READY
        private set
    var phaseTimer = 2.2f
        private set
    var roundNumber = 1
        private set
    var timeLeft = config.roundTime
        private set
    val roundsWon = intArrayOf(0, 0)
    /** -1 while the match is live, otherwise 0 player / 1 enemy / 2 draw. */
    var matchWinner = -1
        private set
    var lastRoundResult: String = ""
        private set

    /** Set while the player has a clean line to the enemy. */
    var lockClear = false
        private set
    /** 0..1 ramp; a full lock is what the reticle snaps closed on. */
    var lockCharge = 0f
        private set

    init {
        placeForRound()
        events += GameEvent(EventType.ROUND_START, magnitude = roundNumber.toFloat())
    }

    fun drainEvents(): List<GameEvent> {
        if (events.isEmpty()) return emptyList()
        val out = events.toList()
        events.clear()
        return out
    }

    /** Advance the fight. Long frames are cut into fixed slices so physics stays sane. */
    fun update(frameDt: Float, playerInput: PilotInput) {
        var remaining = min(frameDt, 0.25f)
        val step = 1f / 120f
        while (remaining > 0f) {
            val dt = min(step, remaining)
            remaining -= dt
            stepOnce(dt, playerInput)
        }
    }

    private fun stepOnce(dt: Float, playerInputRaw: PilotInput) {
        updateLock(dt)

        val live = phase == RoundPhase.FIGHT
        val playerInput = if (live) playerInputRaw else PilotInput.IDLE
        aiThinkTimer -= dt
        if (aiThinkTimer <= 0f) {
            aiInput = if (live) ai.think(AI_THINK_INTERVAL, projectiles) else PilotInput.IDLE
            aiThinkTimer += AI_THINK_INTERVAL
        }
        val enemyInput = if (live) aiInput else PilotInput.IDLE

        stepMech(player, playerInput, 0, dt)
        stepMech(enemy, enemyInput, 1, dt)

        separateMechs()
        stepProjectiles(dt)
        stepFields(dt)
        updatePhase(dt)
    }

    private fun stepMech(m: Mech, input: PilotInput, slot: Int, dt: Float) {
        val prev = prevInput[slot]
        val other = if (slot == 0) enemy else player
        val wasDashing = m.dashing
        val wasAirborne = m.airborne

        if (m.controllable && phase == RoundPhase.FIGHT) {
            input.slotPressed(prev)?.let { pressed ->
                if (m.beginAttack(pressed)) {
                    val a = m.action!!
                    if (a.spec.kind == ProjectileKind.MELEE) {
                        events += GameEvent(EventType.MELEE_SWING, m.center, forwardOf(m.yaw), actor = m.index)
                    }
                }
            }
        }

        m.update(dt, input, prev, arena, other.center)
        prevInput[slot] = input

        if (!wasDashing && m.dashing) {
            events += GameEvent(EventType.DASH_START, m.pos, m.dashDir, actor = m.index)
        }
        if (!wasAirborne && m.airborne && m.vel.y > 1f) {
            events += GameEvent(EventType.JUMP, m.pos, actor = m.index)
        }
        if (wasAirborne && !m.airborne) {
            events += GameEvent(EventType.LAND, m.pos, magnitude = m.landingSquash, actor = m.index)
        }

        for (req in m.consumeShots()) resolveShot(req)
    }

    private fun resolveShot(rawRequest: ShotRequest) {
        val req = aimAssisted(rawRequest)
        if (req.spec.kind == ProjectileKind.MELEE) {
            resolveMelee(req)
            return
        }
        val p = Projectile.spawn(nextProjectileId++, req, rng)
        projectiles += p
        events += GameEvent(
            EventType.MUZZLE, req.origin, forwardOf(req.yaw),
            magnitude = req.spec.damage / 100f, actor = req.shooter,
        )
    }

    /**
     * Lock-on aiming for the player, the way the cabinet did it: the shot is
     * sent where the target is going to be, not where it is, and it is angled
     * up or down to reach a machine that has left the ground. A lobbed weapon
     * gets a real launch angle for the range instead of a fixed one.
     *
     * The enemy pilot does not get this - it leads its shots by turning, and
     * how well it does that is what the difficulty setting controls.
     */
    private fun aimAssisted(req: ShotRequest): ShotRequest {
        if (!config.aimAssist || req.shooter != PLAYER_INDEX) return req
        val spec = req.spec
        if (spec.kind == ProjectileKind.MELEE || spec.speed <= 1f) return req
        val target = mechs.firstOrNull { it.index != req.shooter && it.alive } ?: return req

        var aim = target.center
        var pitch = req.pitch
        repeat(2) {
            val flat = Vec3(aim.x - req.origin.x, 0f, aim.z - req.origin.z)
            val distance = flat.flatLength
            if (distance < 0.5f) return req
            val heightDelta = aim.y - req.origin.y
            val solved = if (spec.gravity > 0f) {
                ballisticPitch(distance, heightDelta, spec.speed, spec.gravity) ?: return req
            } else {
                kotlin.math.atan2(heightDelta, distance)
            }
            pitch = solved
            val flightTime = distance / maxOf(0.001f, spec.speed * kotlin.math.cos(pitch))
            aim = target.center + target.vel * flightTime
        }

        val wantYaw = yawOf(Vec3(aim.x - req.origin.x, 0f, aim.z - req.origin.z))
        // Bounded correction: the assist helps you lead, it does not turn you round.
        val correction = clamp(angleDelta(req.yaw, wantYaw), -MAX_AIM_ASSIST, MAX_AIM_ASSIST)
        return req.copy(
            yaw = wrapAngle(req.yaw + correction),
            pitch = clamp(pitch, -1.0f, 1.0f),
            // A targeting computer also tightens the group.
            spec = spec.copy(spread = spec.spread * ASSIST_SPREAD),
        )
    }

    private fun resolveMelee(req: ShotRequest) {
        val attacker = mechs[req.shooter]
        val victim = mechs.first { it.index != req.shooter }
        val reach = req.spec.radius
        val toVictim = victim.center - attacker.center
        val dist = toVictim.flatLength
        val facing = forwardOf(attacker.yaw)
        val aligned = toVictim.flatNormalized().dot(facing)
        val heightOk = kotlin.math.abs(victim.pos.y - attacker.pos.y) < attacker.spec.height
        if (dist <= reach + victim.spec.radius && aligned > 0.35f && heightOk) {
            val killed = victim.applyDamage(req.spec.damage, req.spec.impact, toVictim, ignoreGuard = true)
            events += GameEvent(EventType.MELEE_HIT, victim.center, toVictim, magnitude = 1f, actor = req.shooter)
            attacker.hitStop = max(attacker.hitStop, 0.09f)
            if (killed) onDestroyed(victim)
        }
    }

    private fun stepProjectiles(dt: Float) {
        val it = projectiles.iterator()
        while (it.hasNext()) {
            val p = it.next()
            val target = mechs.firstOrNull { it2 -> it2.index != p.owner && it2.alive }
            p.step(dt, target?.center)

            var hitPoint: Vec3? = null
            var hitMech: Mech? = null

            // Mech hits first, then cover, then the floor.
            for (m in mechs) {
                if (m.index == p.owner || !m.alive || m.invuln > 0f) continue
                val t = segmentHitsMech(p.prevPos, p.pos, m, p.spec.radius + hitAssist(p.owner))
                if (t != null) {
                    hitMech = m
                    hitPoint = lerp(p.prevPos, p.pos, t)
                    break
                }
            }
            if (hitMech == null) {
                val tCover = arena.segmentHit(p.prevPos, p.pos)
                if (tCover != null) hitPoint = lerp(p.prevPos, p.pos, tCover)
            }
            if (hitMech == null && hitPoint == null) {
                val ground = arena.groundHeightAt(p.pos)
                if (p.pos.y <= ground) hitPoint = p.pos.withY(ground)
            }
            val outside = kotlin.math.abs(p.pos.x) > arena.halfSize + 4f ||
                kotlin.math.abs(p.pos.z) > arena.halfSize + 4f || p.pos.y > 160f

            if (hitPoint != null) {
                detonate(p, hitPoint, hitMech)
                it.remove()
            } else if (p.dead || outside) {
                if (p.spec.blastRadius > 0f && !outside) detonate(p, p.pos, null)
                it.remove()
            }
        }
    }

    private fun detonate(p: Projectile, at: Vec3, direct: Mech?) {
        val dir = p.vel.flatNormalized()
        if (direct != null) {
            val killed = direct.applyDamage(p.spec.damage, p.spec.impact, dir)
            events += GameEvent(EventType.IMPACT, at, dir, magnitude = p.spec.damage / 120f, actor = p.owner)
            if (killed) onDestroyed(direct)
        } else {
            events += GameEvent(EventType.IMPACT, at, dir, magnitude = 0.5f, actor = p.owner)
        }
        if (p.spec.blastRadius > 0f) {
            events += GameEvent(EventType.EXPLOSION, at, dir, magnitude = p.spec.blastRadius, actor = p.owner)
            for (m in mechs) {
                // No self damage: the arcade rules never punished you for your own blast.
                if (!m.alive || m === direct || m.index == p.owner) continue
                val d = m.center.distanceTo(at)
                if (d > p.spec.blastRadius + m.spec.radius) continue
                val falloff = clamp(1f - d / (p.spec.blastRadius + m.spec.radius), 0.25f, 1f)
                val killed = m.applyDamage(
                    p.spec.damage * 0.65f * falloff,
                    p.spec.impact * falloff,
                    (m.center - at),
                )
                if (killed) onDestroyed(m)
            }
        }
        if (p.kind == ProjectileKind.NAPALM) {
            fields += BurnField(
                owner = p.owner,
                pos = at.withY(arena.groundHeightAt(at)),
                radius = max(3.5f, p.spec.blastRadius),
                dps = p.spec.damage * 0.55f,
                life = 3.2f,
            )
        }
    }

    private fun stepFields(dt: Float) {
        val it = fields.iterator()
        while (it.hasNext()) {
            val f = it.next()
            f.life -= dt
            f.tickTimer += dt
            if (f.tickTimer >= 0.25f) {
                f.tickTimer = 0f
                for (m in mechs) {
                    if (!m.alive || m.index == f.owner) continue
                    if (m.pos.y > f.pos.y + 3.5f) continue
                    if (m.center.flatDistanceTo(f.pos) <= f.radius + m.spec.radius) {
                        val killed = m.applyDamage(f.dps * 0.25f, 0.03f, m.center - f.pos)
                        if (killed) onDestroyed(m)
                    }
                }
            }
            if (f.life <= 0f) it.remove()
        }
    }

    /** Two ATs cannot share a floor tile; shove them apart evenly. */
    private fun separateMechs() {
        val a = player
        val b = enemy
        val d = Vec3(b.pos.x - a.pos.x, 0f, b.pos.z - a.pos.z)
        val minDist = a.spec.radius + b.spec.radius
        val len = d.flatLength
        if (len < minDist && len > 1e-4f) {
            val push = (minDist - len) * 0.5f
            val n = d / len
            a.pos = a.pos - n * push
            b.pos = b.pos + n * push
            a.pos = arena.collide(a.pos, a.spec.radius, a.pos.y).position
            b.pos = arena.collide(b.pos, b.spec.radius, b.pos.y).position
        }
    }

    private fun updateLock(dt: Float) {
        val clear = !arena.blocked(player.center, enemy.center) && enemy.alive
        if (clear != lockClear) {
            lockClear = clear
            if (clear) events += GameEvent(EventType.LOCK_ON, enemy.center, actor = 0)
        }
        lockCharge = clamp(lockCharge + (if (clear) 2.5f else -4f) * dt, 0f, 1f)
    }

    private fun onDestroyed(m: Mech) {
        events += GameEvent(EventType.DESTROYED, m.center, magnitude = 2f, actor = m.index)
        events += GameEvent(EventType.EXPLOSION, m.center, magnitude = 12f, actor = m.index)
    }

    private fun updatePhase(dt: Float) {
        when (phase) {
            RoundPhase.READY -> {
                phaseTimer -= dt
                if (phaseTimer <= 0f) {
                    phase = RoundPhase.FIGHT
                    timeLeft = config.roundTime
                }
            }
            RoundPhase.FIGHT -> {
                timeLeft = max(0f, timeLeft - dt)
                val playerDown = !player.alive
                val enemyDown = !enemy.alive
                if (playerDown || enemyDown || timeLeft <= 0f) {
                    finishRound(playerDown, enemyDown)
                }
            }
            RoundPhase.KO -> {
                phaseTimer -= dt
                if (phaseTimer <= 0f) {
                    if (roundsWon[0] >= config.roundsToWin || roundsWon[1] >= config.roundsToWin ||
                        roundNumber >= config.roundsToWin * 2 - 1
                    ) {
                        matchWinner = when {
                            roundsWon[0] > roundsWon[1] -> 0
                            roundsWon[1] > roundsWon[0] -> 1
                            else -> 2
                        }
                        phase = RoundPhase.MATCH_OVER
                        events += GameEvent(EventType.MATCH_END, magnitude = matchWinner.toFloat())
                    } else {
                        roundNumber++
                        placeForRound()
                        phase = RoundPhase.READY
                        phaseTimer = 2.2f
                        events += GameEvent(EventType.ROUND_START, magnitude = roundNumber.toFloat())
                    }
                }
            }
            RoundPhase.MATCH_OVER -> Unit
        }
    }

    private fun finishRound(playerDown: Boolean, enemyDown: Boolean) {
        val winner = when {
            playerDown && enemyDown -> 2
            playerDown -> 1
            enemyDown -> 0
            player.armorFraction > enemy.armorFraction -> 0
            enemy.armorFraction > player.armorFraction -> 1
            else -> 2
        }
        lastRoundResult = when (winner) {
            0 -> if (enemyDown) "K.O." else "TIME UP - ARMOR WIN"
            1 -> if (playerDown) "DESTROYED" else "TIME UP - ARMOR LOSS"
            else -> "DRAW"
        }
        if (winner == 0) roundsWon[0]++
        if (winner == 1) roundsWon[1]++
        phase = RoundPhase.KO
        phaseTimer = 3.4f
        events += GameEvent(EventType.ROUND_END, magnitude = winner.toFloat())
    }

    /** A little slack on the player's rounds, so a near miss counts as a hit. */
    private fun hitAssist(owner: Int) =
        if (config.aimAssist && owner == PLAYER_INDEX) PLAYER_HIT_SLACK else 0f

    private companion object {
        /** 60 Hz, matching how often a player's finger can actually change anything. */
        const val AI_THINK_INTERVAL = 1f / 60f

        const val PLAYER_INDEX = 0

        /** How far off its facing an assisted shot may be sent, in radians. */
        const val MAX_AIM_ASSIST = 0.40f

        /** Extra metres of forgiveness on the player's shots - a near miss counts. */
        const val PLAYER_HIT_SLACK = 0.9f

        /** How much of a weapon's scatter survives the targeting computer. */
        const val ASSIST_SPREAD = 0.45f
    }

    private fun placeForRound() {
        projectiles.clear()
        fields.clear()
        val spread = arena.halfSize * 0.58f
        val angle = rng.range(0f, TWO_PI)
        val pPos = Vec3(kotlin.math.sin(angle) * spread, 0f, kotlin.math.cos(angle) * spread)
        val ePos = -pPos
        player.resetForRound(pPos.withY(arena.groundHeightAt(pPos)), yawOf(ePos - pPos))
        enemy.resetForRound(ePos.withY(arena.groundHeightAt(ePos)), yawOf(pPos - ePos))
        ai.reset()
        aiInput = PilotInput.IDLE
        aiThinkTimer = 0f
        prevInput = arrayOf(PilotInput.IDLE, PilotInput.IDLE)
    }

    /** Restarts the whole match, keeping the chosen machines. */
    fun restart() {
        roundsWon[0] = 0
        roundsWon[1] = 0
        roundNumber = 1
        matchWinner = -1
        lastRoundResult = ""
        placeForRound()
        phase = RoundPhase.READY
        phaseTimer = 2.2f
        events += GameEvent(EventType.ROUND_START, magnitude = 1f)
    }
}

/**
 * Segment against an upright capsule-ish cylinder around a mech.
 * Returns the fraction along the segment where it first touches, or null.
 */
fun segmentHitsMech(from: Vec3, to: Vec3, m: Mech, extraRadius: Float): Float? {
    val r = m.spec.radius + extraRadius
    val dx = to.x - from.x
    val dz = to.z - from.z
    val fx = from.x - m.pos.x
    val fz = from.z - m.pos.z
    val a = dx * dx + dz * dz
    val b = 2f * (fx * dx + fz * dz)
    val c = fx * fx + fz * fz - r * r
    var t: Float
    if (a < 1e-8f) {
        if (c > 0f) return null
        t = 0f
    } else {
        val disc = b * b - 4f * a * c
        if (disc < 0f) return null
        val s = kotlin.math.sqrt(disc)
        val t1 = (-b - s) / (2f * a)
        val t2 = (-b + s) / (2f * a)
        t = when {
            t1 in 0f..1f -> t1
            t2 in 0f..1f -> max(t2, 0f)
            else -> return null
        }
    }
    val y = from.y + (to.y - from.y) * t
    val lo = m.pos.y - extraRadius
    val hi = m.pos.y + m.spec.height + extraRadius
    return if (y in lo..hi) t else null
}
