package com.rollerdash.arena

import com.rollerdash.arena.core.Arena
import com.rollerdash.arena.core.Battle
import com.rollerdash.arena.core.BattleConfig
import com.rollerdash.arena.core.EventType
import com.rollerdash.arena.core.Roster
import com.rollerdash.arena.core.RoundPhase
import com.rollerdash.arena.core.Vec3
import com.rollerdash.arena.core.clamp
import com.rollerdash.arena.core.forwardOf
import com.rollerdash.arena.render.Effects
import com.rollerdash.arena.render.Hud
import com.rollerdash.arena.render.MechRenderState
import com.rollerdash.arena.ui.ControlScheme
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

    var battle: Battle = newBattle()
        private set

    var cameraShake = 0f
        private set

    private var dustTimer = 0f
    private var burnTimer = 0f

    val titleMenu = Menu(
        listOf(
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
            MenuRow("SKILL", { difficulty.label }, { d ->
                val all = Difficulty.entries
                difficulty = all[(difficulty.ordinal + d + all.size) % all.size]
                audio.play(Sfx.UI)
            }, detail = { "ENEMY PILOT REACTION AND AGGRESSION" }),
            MenuRow("START BATTLE", { "" }, isAction = true, onSelect = { startBattle() }),
        ),
    )

    val pauseMenu = Menu(
        listOf(
            MenuRow("RESUME", { "" }, isAction = true, onSelect = { state = AppState.BATTLE }),
            MenuRow("RESTART MATCH", { "" }, isAction = true, onSelect = { startBattle() }),
            MenuRow("QUIT TO TITLE", { "" }, isAction = true, onSelect = { toTitle() }),
        ),
    )

    val resultMenu = Menu(
        listOf(
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
        BattleConfig(roundTime = 90f, roundsToWin = difficulty.rounds, aiSkill = difficulty.skill),
    )

    fun startBattle() {
        battle = newBattle()
        effects.clear()
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
        cameraShake = maxOf(0f, cameraShake - dt * 2.6f)

        when (state) {
            AppState.BATTLE -> updateBattle(dt)
            AppState.PAUSED, AppState.TITLE, AppState.RESULT -> effects.update(dt * 0.35f)
        }
    }

    private fun updateBattle(dt: Float) {
        battle.update(dt, controls.input())
        consumeEvents()
        emitContinuousEffects(dt)
        effects.update(dt)
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
                    if (e.magnitude > 1.2f) {
                        audio.play(Sfx.CANNON, gain * 0.9f, 0.9f + e.magnitude * 0.05f)
                        if (e.actor == 0) cameraShake = maxOf(cameraShake, 0.35f)
                    } else {
                        audio.play(Sfx.SHOT, gain * 0.55f, 0.85f + (1f - e.magnitude) * 0.5f)
                    }
                }
                EventType.IMPACT -> {
                    effects.impact(e.pos, e.dir, clamp(e.magnitude, 0.2f, 2f))
                    audio.play(Sfx.HIT, gain * 0.7f, 0.8f + e.magnitude * 0.3f)
                }
                EventType.EXPLOSION -> {
                    effects.explosion(e.pos, e.magnitude)
                    audio.play(Sfx.EXPLOSION, gain, clamp(1.4f - e.magnitude * 0.06f, 0.6f, 1.6f))
                    cameraShake = maxOf(cameraShake, clamp(e.magnitude * 0.09f * gain, 0f, 1.2f))
                }
                EventType.MELEE_HIT -> {
                    effects.meleeSpark(e.pos, e.dir)
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

    /** Dust, thruster wash and burning ground - things that stream rather than fire once. */
    private fun emitContinuousEffects(dt: Float) {
        dustTimer -= dt
        for (m in battle.mechs) {
            if (m.dashing && dustTimer <= 0f) {
                effects.rollerDust(m.pos, m.vel.flatNormalized(), 1f)
            }
            if (m.airborne && m.vel.y > 0.5f) {
                effects.boosterWash(m.center + Vec3(0f, -0.8f, 0f), Vec3(0f, -1f, 0f))
            }
            if (m.dashing) {
                effects.boosterWash(
                    m.center - forwardOf(m.yaw) * 1.4f,
                    -m.vel.flatNormalized(),
                )
            }
        }
        if (dustTimer <= 0f) dustTimer = 0.03f

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
