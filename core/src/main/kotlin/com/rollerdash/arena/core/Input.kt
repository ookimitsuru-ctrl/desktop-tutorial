package com.rollerdash.arena.core

import kotlin.math.abs

/**
 * One frame of pilot intent, already resolved out of whatever control scheme the
 * player picked. Everything is "held this frame" - the simulation works out the
 * edges itself, so the AI and the human feed the mech through the exact same door.
 */
data class PilotInput(
    /** Strafe intent, -1 left .. +1 right, relative to the mech's facing. */
    val moveX: Float = 0f,
    /** Advance intent, -1 back .. +1 forward. */
    val moveZ: Float = 0f,
    /** Manual yaw, -1 .. +1. Ignored while a lock is held unless it exceeds the deadzone. */
    val turn: Float = 0f,
    val dash: Boolean = false,
    val jump: Boolean = false,
    val crouch: Boolean = false,
    val fireRight: Boolean = false,
    val fireLeft: Boolean = false,
) {
    /** Both triggers at once is the centre weapon, exactly as the cabinet did it. */
    val fireCenter: Boolean get() = fireRight && fireLeft
    val hasMove: Boolean get() = abs(moveX) > 0.02f || abs(moveZ) > 0.02f

    companion object {
        val IDLE = PilotInput()
    }
}

/** Which weapon a press resolved to, once both-triggers has been folded in. */
fun PilotInput.slotPressed(prev: PilotInput): WeaponSlot? = when {
    fireCenter && !prev.fireCenter -> WeaponSlot.CENTER
    fireRight && !prev.fireRight -> WeaponSlot.RIGHT
    fireLeft && !prev.fireLeft -> WeaponSlot.LEFT
    else -> null
}

/**
 * Raw state of the twin-lever scheme: two levers, two triggers, two turbo buttons.
 * The mapping is the arcade one - both levers forward walks, levers apart rotates,
 * turbo plus a direction is a roller dash, both turbos jump.
 */
data class TwinStick(
    val leftX: Float = 0f,
    val leftY: Float = 0f,
    val rightX: Float = 0f,
    val rightY: Float = 0f,
    val turboLeft: Boolean = false,
    val turboRight: Boolean = false,
    val triggerLeft: Boolean = false,
    val triggerRight: Boolean = false,
    val guard: Boolean = false,
) {
    fun toPilotInput(deadzone: Float = 0.28f): PilotInput {
        fun dz(v: Float) = if (abs(v) < deadzone) 0f else v

        val ly = dz(leftY)
        val ry = dz(rightY)
        val lx = dz(leftX)
        val rx = dz(rightX)

        val sameY = ly * ry > 0f
        val opposedY = ly * ry < 0f

        // Levers pushed opposite ways on the Y axis: pivot in place.
        val turn = if (opposedY) clamp((ly - ry) * 0.5f, -1f, 1f) else clamp((lx + rx) * 0.5f, -1f, 1f)

        val forward = if (sameY) clamp((ly + ry) * 0.5f, -1f, 1f) else 0f
        // Both levers shoved the same way sideways: strafe. Mixed input yields a slide.
        val strafe = if (lx * rx > 0f) clamp((lx + rx) * 0.5f, -1f, 1f) else 0f

        val bothTurbo = turboLeft && turboRight
        return PilotInput(
            moveX = strafe,
            moveZ = forward,
            turn = if (lx * rx > 0f) 0f else turn,
            dash = (turboLeft || turboRight) && !bothTurbo,
            jump = bothTurbo,
            crouch = guard,
            fireRight = triggerRight,
            fireLeft = triggerLeft,
        )
    }
}
