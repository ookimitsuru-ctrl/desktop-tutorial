package com.rollerdash.arena

import com.rollerdash.arena.core.Arena
import com.rollerdash.arena.core.Battle
import com.rollerdash.arena.core.BattleConfig
import com.rollerdash.arena.core.EventType
import com.rollerdash.arena.core.Roster
import com.rollerdash.arena.core.RoundPhase
import com.rollerdash.arena.core.Vec3
import com.rollerdash.arena.core.PI_F
import com.rollerdash.arena.core.clamp
import com.rollerdash.arena.core.lerp
import com.rollerdash.arena.core.wrapAngle
import com.rollerdash.arena.core.forwardOf
import com.rollerdash.arena.core.rightOf
import com.rollerdash.arena.render.Effects
import com.rollerdash.arena.render.Hud
import com.rollerdash.arena.render.Lights
import com.rollerdash.arena.render.MechRenderState
import com.rollerdash.arena.core.ControlScheme
import com.rollerdash.arena.ui.Controls
import com.rollerdash.arena.ui.Menu
import com.rollerdash.arena.ui.MenuRow

enum class AppState { TITLE, BATTLE, PAUSED, RESULT }

/** Difficulty presets: skill feeds straight into the AI pilot. */
enum class Difficulty(val label: String, val skill: Float, val rounds: Int) {
    ROOKIE("ROOKIE", 0.30f, 2),
    SOLDIER("SOLDIER", 0.58f, 2),
    VETERAN("VETERAN", 0.80f, 2),
    RED_SHOULDER("RED SHOULDER", 0.97f, 2),
}

/**
 * Owns the whole session: which machines are selected, the running battle, the
 * menus, and the glue that turns simulation events into sound and particles.
 * The renderer reads from here and never writes back.
 */
class Game(private val audio: Audio) {

    val arena: Arena = Arena.standard()
    val effects = Effects()
    val lights = Lights()
    val controls = Controls()
    val hud = Hud()
    val renderStates = arrayOf(MechRenderState(), MechRenderState())

    var state = AppState.TITLE
        private set

    var playerIndex = 0
        private set
    var enemyIndex = 1
        private set
    var difficulty = Difficulty.SOLDIER
        private set

    var quality = com.rollerdash.arena.core.Quality.HIGH
        private set

    /** Arcade lock-on: your shots lead the target and arc onto it. */
    var aimAssist = true
        private set

    var battle: Battle = newBattle()
        private set

    var cameraShake = 0f
        private set

    private var dustTimer = 0f
    private var burnTimer = 0f
    private var smokeTimer = 0f
    private val stepMarker = intArrayOf(-1, -1)

    /** Seconds of slow motion left after a kill. */
    private var slowMo = 0f

    /** Where the camera should push in during the slow motion, if anywhere. */
    var dramaFocus: Vec3? = null
        private set

    val titleMenu = Menu(
        align = com.rollerdash.arena.core.MenuAlign.LEFT,
        rows = listOf(
            MenuRow("MACHINE", { Roster.all[playerIndex].displayName }, { d ->
                playerIndex = (playerIndex + d + Roster.all.size) % Roster.all.size
                battle = newBattle()
                audio.play(Sfx.UI)
            }, detail = { Roster.all[playerIndex].blurb }),
            MenuRow("OPPONENT", { Roster.all[enemyIndex].displayName }, { d ->
                enemyIndex = (enemyIndex + d + Roster.all.size) % Roster.all.size
                battle = newBattle()
                audio.play(Sfx.UI)
            }, detail = { Roster.all[enemyIndex].blurb }),
            MenuRow("CONTROL", { if (controls.scheme == ControlScheme.MODERN) "MODERN" else "TWIN STICK" }, {
                controls.scheme = if (controls.scheme == ControlScheme.MODERN) {
                    ControlScheme.TWIN_STICK
                } else {
                    ControlScheme.MODERN
                }
                relayoutControls()
                audio.play(Sfx.UI)
            }, detail = {
                if (controls.scheme == ControlScheme.MODERN) {
                    "STICK TO MOVE, DRAG RIGHT TO TURN, BUTTONS TO FIRE"
                } else {
                    "TWO LEVERS: BOTH FORWARD WALKS, APART TURNS, TURBO DASHES"
                }
            }),
            MenuRow("LAYOUT", { if (controls.mirrored) "LEFT HANDED" else "RIGHT HANDED" }, {
                controls.mirrored = !controls.mirrored
                audio.play(Sfx.UI)
            }, detail = { "WHICH THUMB DRIVES AND WHICH ONE SHOOTS" }),
            MenuRow("LOCK-ON", { if (aimAssist) "ASSIST" else "MANUAL" }, {
                aimAssist = !aimAssist
                battle = newBattle()
                audio.play(Sfx.UI)
            }, detail = { "ASSIST LEADS YOUR SHOTS ONTO A MOVING TARGET" }),
            MenuRow("GRAPHICS", { quality.label }, { d ->
                val all = com.rollerdash.arena.core.Quality.entries
                quality = all[(quality.ordinal + d + all.size) % all.size]
                audio.play(Sfx.UI)
            }, detail = { "DROP THIS IF THE FRAME RATE DIPS ON YOUR HANDSET" }),
            MenuRow("SKILL", { difficulty.label }, { d ->
                val all = Difficulty.entries
                difficulty = all[(difficulty.ordinal + d + all.size) % all.size]
                audio.play(Sfx.UI)
            }, detail = { "ENEMY PILOT REACTION AND AGGRESSION" }),
            MenuRow("START BATTLE", { "" }, isAction = true, onSelect = { startBattle() }),
        ),
    )

    /** The machine the title screen is showing off. */
    val previewSpec: com.rollerdash.arena.core.AtSpec get() = Roster.all[playerIndex]

    val pauseMenu = Menu(
        listOf(
            MenuRow("RESUME", { "" }, isAction = true, onSelect = { state = AppState.BATTLE }),
            MenuRow("RESTART MATCH", { "" }, isAction = true, onSelect = { startBattle() }),
            MenuRow("QUIT TO TITLE", { "" }, isAction = true, onSelect = { toTitle() }),
        ),
    )

    val resultMenu = Menu(
        align = com.rollerdash.arena.core.MenuAlign.LEFT,
        rows = listOf(
            MenuRow("REMATCH", { "" }, isAction = true, onSelect = { startBattle() }),
            MenuRow("CHANGE MACHINE", { "" }, isAction = true, onSelect = { toTitle() }),
        ),
    )

    private var viewW = 1
    private var viewH = 1

    fun layout(width: Int, height: Int) {
        viewW = width
        viewH = height
        controls.layout(width, height)
        hud.layout(width, height)
        titleMenu.layout(width, height)
        pauseMenu.layout(width, height)
        resultMenu.layout(width, height)
    }

    private fun relayoutControls() = controls.layout(viewW, viewH)

    private fun newBattle() = Battle(
        arena,
        Roster.all[playerIndex],
        Roster.all[enemyIndex],
        BattleConfig(
            roundTime = 90f,
            roundsToWin = difficulty.rounds,
            aiSkill = difficulty.skill,
            aimAssist = aimAssist,
        ),
    )

    fun startBattle() {
        battle = newBattle()
        effects.clear()
        lights.clear()
        slowMo = 0f
        dramaFocus = null
        cameraShake = 0f
        state = AppState.BATTLE
        hud.showBanner("ROUND 1", "READY", 2.0f)
        audio.play(Sfx.UI)
    }

    fun toTitle() {
        state = AppState.TITLE
        audio.play(Sfx.UI)
    }

    fun togglePause() {
        state = when (state) {
            AppState.BATTLE -> AppState.PAUSED
            AppState.PAUSED -> AppState.BATTLE
            else -> state
        }
        audio.play(Sfx.UI)
    }

    fun update(dt: Float) {
        controls.update(dt)
        hud.update(dt)
        lights.update(dt)
        cameraShake = maxOf(0f, cameraShake - dt * 2.6f)

        when (state) {
            AppState.BATTLE -> updateBattle(dt)
            AppState.TITLE -> {
                // The machine on show stands on the middle platform, turning
                // slowly, lit by a key light refreshed every frame.
                val m = battle.player
                val pedestal = arena.groundHeightAt(Vec3.ZERO)
                m.pos = Vec3(0f, pedestal, 0f)
                m.vel = Vec3.ZERO
                m.yaw = wrapAngle(m.yaw + dt * 0.28f)
                lights.add(
                    m.center + forwardOf(m.yaw) * 4.5f + Vec3(2.5f, 3.2f, 0f),
                    1f, 0.86f, 0.66f, 2.6f, 16f, 0.2f,
                )
                effects.update(dt * 0.35f)
            }
            AppState.PAUSED, AppState.RESULT -> effects.update(dt * 0.35f)
        }
    }

    private fun updateBattle(dt: Float) {
        // A kill drops the world into slow motion for a beat and pushes the
        // camera in on the wreck: the round should land, not just stop.
        if (slowMo > 0f) slowMo -= dt
        val scale = when {
            slowMo <= 0f -> 1f
            slowMo > 0.6f -> 0.30f
            else -> lerp(0.30f, 1f, 1f - slowMo / 0.6f)
        }
        val step = dt * scale
        battle.update(step, controls.input())
        consumeEvents()
        emitContinuousEffects(step)
        effects.update(step)
        dramaFocus = if (slowMo > 0f) battle.mechs.firstOrNull { !it.alive }?.center else null
        // Cosmetic mech state is smoothed by the renderer, which owns the model.
        if (battle.phase == RoundPhase.MATCH_OVER) {
            state = AppState.RESULT
        }
    }

    private fun consumeEvents() {
        val listenAt = battle.player.center
        for (e in battle.drainEvents()) {
            val gain = clamp(1f - e.pos.distanceTo(listenAt) / 110f, 0.12f, 1f)
            when (e.type) {
                EventType.MUZZLE -> {
                    effects.muzzleFlash(e.pos, e.dir, clamp(e.magnitude, 0.2f, 2f))
                    lights.add(e.pos, 1f, 0.78f, 0.42f, 2.2f + e.magnitude * 2f, 11f, 0.07f)
                    if (e.magnitude > 1.2f) {
                        audio.play(Sfx.CANNON, gain * 0.9f, 0.9f + e.magnitude * 0.05f)
                        if (e.actor == 0) cameraShake = maxOf(cameraShake, 0.35f)
                    } else {
                        audio.play(Sfx.SHOT, gain * 0.55f, 0.85f + (1f - e.magnitude) * 0.5f)
                    }
                }
                EventType.IMPACT -> {
                    effects.impact(e.pos, e.dir, clamp(e.magnitude, 0.2f, 2f))
                    lights.add(e.pos, 1f, 0.7f, 0.35f, 1.6f, 8f, 0.10f)
                    audio.play(Sfx.HIT, gain * 0.7f, 0.8f + e.magnitude * 0.3f)
                }
                EventType.EXPLOSION -> {
                    effects.explosion(e.pos, e.magnitude)
                    lights.add(e.pos, 1f, 0.62f, 0.26f, 6f + e.magnitude * 0.8f, e.magnitude * 4.5f, 0.45f)
                    audio.play(Sfx.EXPLOSION, gain, clamp(1.4f - e.magnitude * 0.06f, 0.6f, 1.6f))
                    cameraShake = maxOf(cameraShake, clamp(e.magnitude * 0.09f * gain, 0f, 1.2f))
                }
                EventType.MELEE_HIT -> {
                    effects.meleeSpark(e.pos, e.dir)
                    lights.add(e.pos, 1f, 0.9f, 0.7f, 4f, 14f, 0.16f)
                    audio.play(Sfx.MELEE, gain)
                    cameraShake = maxOf(cameraShake, 0.9f * gain)
                }
                EventType.MELEE_SWING -> audio.play(Sfx.MISSILE, gain * 0.4f, 1.6f)
                EventType.DASH_START -> audio.play(Sfx.DASH, gain * 0.75f, 0.95f)
                EventType.JUMP -> audio.play(Sfx.JUMP, gain * 0.7f)
                EventType.LAND -> {
                    effects.landingDust(e.pos, clamp(0.5f + e.magnitude, 0.4f, 2f))
                    audio.play(Sfx.LAND, gain * 0.7f)
                }
                EventType.DESTROYED -> {
                    audio.play(Sfx.KO, 1f, 0.85f)
                    cameraShake = 1.4f
                    slowMo = 1.9f
                    hud.showBanner(if (e.actor == 0) "DESTROYED" else "K.O.", "", 2.6f)
                }
                EventType.LOCK_ON -> audio.play(Sfx.LOCK, 0.35f, 1.2f)
                EventType.ROUND_START -> hud.showBanner("ROUND ${e.magnitude.toInt()}", "READY", 2.0f)
                EventType.ROUND_END -> hud.showBanner(battle.lastRoundResult, "", 2.8f)
                EventType.MATCH_END -> Unit
                EventType.KNOCKDOWN, EventType.GUARD -> Unit
            }
        }
    }

    /** Dust, thruster jets, smoke and burning ground - the streaming effects. */
    private fun emitContinuousEffects(dt: Float) {
        dustTimer -= dt
        smokeTimer -= dt
        for (m in battle.mechs) {
            val forward = forwardOf(m.yaw)
            val right = rightOf(m.yaw)
            // Backpack nozzles, in world space.
            val nozzle = m.center - forward * 1.35f + Vec3(0f, 0.25f, 0f)

            if (m.dashing) {
                if (dustTimer <= 0f) effects.rollerDust(m.pos, m.vel.flatNormalized(), 1f)
                val back = -m.vel.flatNormalized()
                for (s in intArrayOf(-1, 1)) {
                    effects.thrusterJet(nozzle + right * (s * 0.55f), back, 1.25f)
                }
            }
            if (m.airborne && m.vel.y > 0.5f) {
                for (s in intArrayOf(-1, 1)) {
                    effects.thrusterJet(
                        nozzle + right * (s * 0.55f) + Vec3(0f, -0.35f, 0f),
                        Vec3(0f, -1f, 0f),
                        1.0f,
                    )
                }
            }
            // Grit kicked up as each foot comes down.
            if (!m.airborne && m.vel.flatLength > 2.2f && !m.dashing) {
                val stride = kotlin.math.floor(m.walkPhase * 2f / PI_F).toInt()
                if (stride != stepMarker[m.index]) {
                    stepMarker[m.index] = stride
                    effects.landingDust(m.pos, 0.35f)
                }
            }

            // A machine below half armour starts trailing smoke.
            if (smokeTimer <= 0f && m.alive) {
                val hurt = 1f - m.armorFraction
                if (hurt > 0.5f) {
                    effects.damageSmoke(m.center + Vec3(0f, 0.6f, 0f), (hurt - 0.5f) * 2f)
                }
            }
        }
        if (dustTimer <= 0f) dustTimer = 0.03f
        if (smokeTimer <= 0f) smokeTimer = 0.10f

        burnTimer -= dt
        if (burnTimer <= 0f) {
            burnTimer = 0.04f
            for (f in battle.fields) effects.burnPatch(f.pos, f.radius)
        }
    }

    /** Called by the view when the player taps outside the on-screen controls. */
    fun onTapOutsideControls(x: Float, y: Float) {
        when (state) {
            AppState.TITLE -> titleMenu.onTap(x, y)
            AppState.PAUSED -> pauseMenu.onTap(x, y)
            AppState.RESULT -> resultMenu.onTap(x, y)
            AppState.BATTLE -> Unit
        }
    }

    fun resultLines(): List<String> {
        val winner = battle.matchWinner
        val title = when (winner) {
            0 -> "MISSION COMPLETE"
            1 -> "MISSION FAILED"
            else -> "DRAW"
        }
        return listOf(
            title,
            "ROUNDS  ${battle.roundsWon[0]} - ${battle.roundsWon[1]}",
            "${Roster.all[playerIndex].displayName} VS ${Roster.all[enemyIndex].displayName}",
            "SKILL  ${difficulty.label}",
        )
    }

    fun activeMenu(): Menu? = when (state) {
        AppState.TITLE -> titleMenu
        AppState.PAUSED -> pauseMenu
        AppState.RESULT -> resultMenu
        AppState.BATTLE -> null
    }

    /** Small helper for the gamepad: menus respond to the d-pad too. */
    fun menuInput(dx: Int, dy: Int, confirm: Boolean) {
        val menu = activeMenu() ?: return
        if (dy != 0) {
            menu.moveCursor(dy)
            audio.play(Sfx.UI, 0.5f)
        }
        if (dx != 0) {
            menu.change(dx)
        }
        if (confirm) menu.activate()
    }
}
