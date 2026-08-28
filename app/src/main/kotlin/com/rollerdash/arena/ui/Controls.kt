package com.rollerdash.arena.ui

import android.view.MotionEvent
import com.rollerdash.arena.core.PilotInput
import com.rollerdash.arena.core.TwinStick
import com.rollerdash.arena.core.clamp
import com.rollerdash.arena.render.HudPainter
import kotlin.math.abs
import kotlin.math.sqrt

enum class ControlScheme {
    /** One stick to move, drag to turn, buttons on the right. */
    MODERN,

    /** The cabinet layout: two levers, two triggers, two turbo buttons. */
    TWIN_STICK,
}

enum class ButtonId { FIRE_R, FIRE_L, FIRE_C, JUMP, DASH, GUARD, TURBO_L, TURBO_R, MENU }

/** A round on-screen button that remembers which finger is holding it. */
class TouchButton(
    val id: ButtonId,
    val label: String,
    var cx: Float = 0f,
    var cy: Float = 0f,
    var radius: Float = 0f,
) {
    var pointerId = -1
    var glow = 0f
    val pressed: Boolean get() = pointerId != -1

    fun contains(x: Float, y: Float): Boolean {
        val dx = x - cx
        val dy = y - cy
        // Generous by a quarter radius: thumbs are not precise.
        val r = radius * 1.25f
        return dx * dx + dy * dy <= r * r
    }
}

/** A virtual lever with a fixed base and a knob that follows the finger. */
class VirtualStick {
    var cx = 0f
    var cy = 0f
    var radius = 0f
    var knobX = 0f
    var knobY = 0f
    var pointerId = -1
    val active: Boolean get() = pointerId != -1

    /** -1..1, screen axes (y grows downward). */
    val x: Float get() = if (radius <= 0f) 0f else clamp(knobX / radius, -1f, 1f)
    val y: Float get() = if (radius <= 0f) 0f else clamp(knobY / radius, -1f, 1f)

    fun contains(px: Float, py: Float): Boolean {
        val dx = px - cx
        val dy = py - cy
        val r = radius * 1.6f
        return dx * dx + dy * dy <= r * r
    }

    fun grab(id: Int, px: Float, py: Float) {
        pointerId = id
        move(px, py)
    }

    fun move(px: Float, py: Float) {
        var dx = px - cx
        var dy = py - cy
        val len = sqrt(dx * dx + dy * dy)
        if (len > radius) {
            dx = dx / len * radius
            dy = dy / len * radius
        }
        knobX = dx
        knobY = dy
    }

    fun release() {
        pointerId = -1
        knobX = 0f
        knobY = 0f
    }
}

/** State pushed in from a physical gamepad, if one is connected. */
class GamepadState {
    var leftX = 0f
    var leftY = 0f
    var rightX = 0f
    var rightY = 0f
    var fireR = false
    var fireL = false
    var fireC = false
    var jump = false
    var dash = false
    var guard = false
    var connected = false

    val anyActivity: Boolean
        get() = connected && (abs(leftX) > 0.15f || abs(leftY) > 0.15f || abs(rightX) > 0.15f ||
            fireR || fireL || fireC || jump || dash || guard)
}

/**
 * Owns the on-screen controls: layout, multi-touch tracking, drawing, and the
 * translation from fingers to a [PilotInput] the simulation understands.
 */
class Controls(var scheme: ControlScheme = ControlScheme.MODERN) {

    private var width = 0f
    private var height = 0f

    val leftStick = VirtualStick()
    val rightStick = VirtualStick()
    val buttons = ArrayList<TouchButton>()
    val gamepad = GamepadState()

    /** Free drag on the right of the screen turns the machine. */
    private var turnPointer = -1
    private var turnLastX = 0f
    private var turnValue = 0f

    var visible = true

    fun layout(w: Int, h: Int) {
        width = w.toFloat()
        height = h.toFloat()
        buttons.clear()
        val unit = minOf(width * 0.5f, height)
        val stickR = unit * 0.20f
        val margin = unit * 0.30f

        leftStick.radius = stickR
        leftStick.cx = margin
        leftStick.cy = height - margin
        rightStick.radius = stickR
        rightStick.cx = width - margin
        rightStick.cy = height - margin

        val br = unit * 0.115f
        when (scheme) {
            ControlScheme.MODERN -> {
                val bx = width - unit * 0.34f
                val by = height - unit * 0.30f
                buttons += TouchButton(ButtonId.FIRE_R, "RW", bx, by, br * 1.25f)
                buttons += TouchButton(ButtonId.FIRE_L, "LW", bx - br * 2.6f, by - br * 0.6f, br)
                buttons += TouchButton(ButtonId.FIRE_C, "CW", bx - br * 1.5f, by - br * 2.5f, br * 1.05f)
                buttons += TouchButton(ButtonId.DASH, "DASH", bx + br * 0.4f, by - br * 2.9f, br)
                buttons += TouchButton(ButtonId.JUMP, "JUMP", bx + br * 2.4f, by - br * 1.1f, br)
                buttons += TouchButton(ButtonId.GUARD, "GUARD", width * 0.5f + br * 1.4f, height - br * 1.4f, br * 0.85f)
            }
            ControlScheme.TWIN_STICK -> {
                buttons += TouchButton(ButtonId.FIRE_L, "LT", leftStick.cx + stickR * 1.05f, leftStick.cy - stickR * 1.5f, br)
                buttons += TouchButton(ButtonId.TURBO_L, "L.TURBO", leftStick.cx + stickR * 2.3f, leftStick.cy - stickR * 0.1f, br)
                buttons += TouchButton(ButtonId.FIRE_R, "RT", rightStick.cx - stickR * 1.05f, rightStick.cy - stickR * 1.5f, br)
                buttons += TouchButton(ButtonId.TURBO_R, "R.TURBO", rightStick.cx - stickR * 2.3f, rightStick.cy - stickR * 0.1f, br)
                buttons += TouchButton(ButtonId.GUARD, "GUARD", width * 0.5f, height - br * 1.5f, br * 0.85f)
            }
        }
        buttons += TouchButton(ButtonId.MENU, "MENU", width - br * 0.9f, br * 0.9f, br * 0.62f)
    }

    fun button(id: ButtonId): TouchButton? = buttons.firstOrNull { it.id == id }

    fun isPressed(id: ButtonId) = button(id)?.pressed == true

    /** Consumes a touch event. Returns true when a control took it. */
    fun onTouch(event: MotionEvent): Boolean {
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN, MotionEvent.ACTION_POINTER_DOWN -> {
                val i = event.actionIndex
                grab(event.getPointerId(i), event.getX(i), event.getY(i))
            }
            MotionEvent.ACTION_MOVE -> {
                for (i in 0 until event.pointerCount) {
                    val id = event.getPointerId(i)
                    val x = event.getX(i)
                    val y = event.getY(i)
                    if (leftStick.pointerId == id) leftStick.move(x, y)
                    if (rightStick.pointerId == id) rightStick.move(x, y)
                    if (turnPointer == id) {
                        turnValue = clamp((x - turnLastX) / (width * 0.18f), -1f, 1f)
                        turnLastX = x
                    }
                }
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_POINTER_UP, MotionEvent.ACTION_CANCEL -> {
                val id = event.getPointerId(event.actionIndex)
                release(id)
                if (event.actionMasked == MotionEvent.ACTION_CANCEL) {
                    for (b in buttons) b.pointerId = -1
                    leftStick.release()
                    rightStick.release()
                    turnPointer = -1
                    turnValue = 0f
                }
            }
        }
        return true
    }

    private fun grab(id: Int, x: Float, y: Float) {
        for (b in buttons) {
            if (!b.pressed && b.contains(x, y)) {
                b.pointerId = id
                b.glow = 1f
                return
            }
        }
        if (!leftStick.active && leftStick.contains(x, y)) {
            leftStick.grab(id, x, y)
            return
        }
        if (scheme == ControlScheme.TWIN_STICK) {
            if (!rightStick.active && rightStick.contains(x, y)) {
                rightStick.grab(id, x, y)
                return
            }
        }
        if (scheme == ControlScheme.MODERN && x > width * 0.42f && turnPointer == -1) {
            turnPointer = id
            turnLastX = x
        }
    }

    private fun release(id: Int) {
        for (b in buttons) if (b.pointerId == id) b.pointerId = -1
        if (leftStick.pointerId == id) leftStick.release()
        if (rightStick.pointerId == id) rightStick.release()
        if (turnPointer == id) {
            turnPointer = -1
            turnValue = 0f
        }
    }

    /** True on the frame the menu button goes down; consumes the press. */
    fun consumeMenuPress(): Boolean {
        val b = button(ButtonId.MENU) ?: return false
        if (b.pressed) {
            b.pointerId = -1
            return true
        }
        return false
    }

    fun update(dt: Float) {
        for (b in buttons) b.glow = maxOf(0f, b.glow - dt * 3f)
        if (turnPointer == -1) turnValue *= maxOf(0f, 1f - dt * 8f)
    }

    /** Folds fingers and gamepad into one frame of pilot intent. */
    fun input(): PilotInput {
        val pad = gamepad
        val touch = when (scheme) {
            ControlScheme.MODERN -> PilotInput(
                moveX = leftStick.x,
                moveZ = -leftStick.y,
                turn = turnValue,
                dash = isPressed(ButtonId.DASH),
                jump = isPressed(ButtonId.JUMP),
                crouch = isPressed(ButtonId.GUARD),
                fireRight = isPressed(ButtonId.FIRE_R) || isPressed(ButtonId.FIRE_C),
                fireLeft = isPressed(ButtonId.FIRE_L) || isPressed(ButtonId.FIRE_C),
            )
            ControlScheme.TWIN_STICK -> TwinStick(
                leftX = leftStick.x,
                leftY = -leftStick.y,
                rightX = rightStick.x,
                rightY = -rightStick.y,
                turboLeft = isPressed(ButtonId.TURBO_L),
                turboRight = isPressed(ButtonId.TURBO_R),
                triggerLeft = isPressed(ButtonId.FIRE_L),
                triggerRight = isPressed(ButtonId.FIRE_R),
                guard = isPressed(ButtonId.GUARD),
            ).toPilotInput()
        }
        if (!pad.connected) return touch
        return PilotInput(
            moveX = pickAxis(touch.moveX, pad.leftX),
            moveZ = pickAxis(touch.moveZ, -pad.leftY),
            turn = pickAxis(touch.turn, pad.rightX),
            dash = touch.dash || pad.dash,
            jump = touch.jump || pad.jump,
            crouch = touch.crouch || pad.guard,
            fireRight = touch.fireRight || pad.fireR || pad.fireC,
            fireLeft = touch.fireLeft || pad.fireL || pad.fireC,
        )
    }

    private fun pickAxis(touch: Float, pad: Float) = if (abs(pad) > abs(touch)) pad else touch

    // ---- drawing -------------------------------------------------------------

    fun draw(p: HudPainter) {
        if (!visible) return
        drawStick(p, leftStick)
        if (scheme == ControlScheme.TWIN_STICK) drawStick(p, rightStick)
        for (b in buttons) drawButton(p, b)
    }

    private fun drawStick(p: HudPainter, s: VirtualStick) {
        p.ring(s.cx, s.cy, s.radius, 0.55f, 0.85f, 0.65f, if (s.active) 0.42f else 0.24f)
        p.disc(s.cx, s.cy, s.radius * 0.16f, 0.6f, 0.9f, 0.7f, 0.25f)
        p.disc(
            s.cx + s.knobX, s.cy + s.knobY, s.radius * 0.40f,
            0.75f, 0.95f, 0.75f, if (s.active) 0.5f else 0.28f,
        )
    }

    private fun drawButton(p: HudPainter, b: TouchButton) {
        val a = if (b.pressed) 0.6f else 0.24f + b.glow * 0.2f
        val tint = when (b.id) {
            ButtonId.FIRE_R -> Triple(1.0f, 0.72f, 0.35f)
            ButtonId.FIRE_L -> Triple(0.65f, 0.85f, 1.0f)
            ButtonId.FIRE_C -> Triple(1.0f, 0.45f, 0.35f)
            ButtonId.JUMP -> Triple(0.72f, 1.0f, 0.72f)
            ButtonId.DASH -> Triple(1.0f, 0.95f, 0.5f)
            ButtonId.GUARD -> Triple(0.8f, 0.8f, 0.9f)
            else -> Triple(0.85f, 0.9f, 0.85f)
        }
        p.disc(b.cx, b.cy, b.radius, tint.first, tint.second, tint.third, a)
        p.ring(b.cx, b.cy, b.radius, tint.first, tint.second, tint.third, a + 0.25f)
        val size = b.radius * 0.46f
        p.text(b.label, b.cx, b.cy - size * 0.5f, size, 1f, 1f, 1f, 0.95f, centered = true)
    }
}
