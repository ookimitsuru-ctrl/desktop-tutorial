package com.rollerdash.arena.ui

import android.view.MotionEvent
import com.rollerdash.arena.core.ControlButton
import com.rollerdash.arena.core.ControlLayout
import com.rollerdash.arena.core.ControlScheme
import com.rollerdash.arena.core.HudLayout
import com.rollerdash.arena.core.PilotInput
import com.rollerdash.arena.core.TwinStick
import com.rollerdash.arena.core.clamp
import com.rollerdash.arena.render.HudPainter
import kotlin.math.abs
import kotlin.math.sqrt

/** A round on-screen button that remembers which finger is holding it. */
class TouchButton(
    val id: ControlButton,
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
}

/**
 * Owns the on-screen controls: multi-touch tracking, drawing, and the
 * translation from fingers to a [PilotInput] the simulation understands.
 * Where each control sits is decided by [ControlLayout], which is unit tested.
 */
class Controls(scheme: ControlScheme = ControlScheme.MODERN) {

    private var width = 0f
    private var height = 0f

    var scheme: ControlScheme = scheme
        set(value) {
            field = value
            relayout()
        }

    /** Mirrors the two halves for left-handed players. */
    var mirrored: Boolean = false
        set(value) {
            field = value
            relayout()
        }

    val leftStick = VirtualStick()
    val rightStick = VirtualStick()
    val buttons = ArrayList<TouchButton>()
    val gamepad = GamepadState()

    /** Free drag on the empty side of the screen turns the machine. */
    private var turnPointer = -1
    private var turnLastX = 0f
    private var turnValue = 0f

    var visible = true

    fun layout(w: Int, h: Int) {
        width = w.toFloat()
        height = h.toFloat()
        relayout()
    }

    private fun relayout() {
        if (width <= 0f || height <= 0f) return
        val layout = ControlLayout(width, height, scheme, mirrored)
        buttons.clear()

        leftStick.cx = layout.moveStick.cx
        leftStick.cy = layout.moveStick.cy
        leftStick.radius = layout.moveStick.r
        layout.aimStick?.let {
            rightStick.cx = it.cx
            rightStick.cy = it.cy
            rightStick.radius = it.r
        }
        for (slot in layout.buttons) {
            buttons += TouchButton(slot.id, slot.label, slot.disc.cx, slot.disc.cy, slot.disc.r)
        }
        // The pause button belongs to the HUD corner, not the thumb clusters.
        val hud = HudLayout(width, height)
        buttons += TouchButton(ControlButton.MENU, "II", hud.menu.cx, hud.menu.cy, hud.menu.r)
    }

    fun button(id: ControlButton): TouchButton? = buttons.firstOrNull { it.id == id }

    fun isPressed(id: ControlButton) = button(id)?.pressed == true

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
        // Anything left over on the far side from the movement stick turns you.
        val onTurnSide = if (mirrored) x < width * 0.58f else x > width * 0.42f
        if (scheme == ControlScheme.MODERN && onTurnSide && turnPointer == -1) {
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

    /** True on the frame the pause button goes down; consumes the press. */
    fun consumeMenuPress(): Boolean {
        val b = button(ControlButton.MENU) ?: return false
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
                dash = isPressed(ControlButton.DASH),
                jump = isPressed(ControlButton.JUMP),
                crouch = isPressed(ControlButton.GUARD),
                fireRight = isPressed(ControlButton.FIRE_R) || isPressed(ControlButton.FIRE_C),
                fireLeft = isPressed(ControlButton.FIRE_L) || isPressed(ControlButton.FIRE_C),
            )
            ControlScheme.TWIN_STICK -> TwinStick(
                leftX = leftStick.x,
                leftY = -leftStick.y,
                rightX = rightStick.x,
                rightY = -rightStick.y,
                turboLeft = isPressed(ControlButton.TURBO_L),
                turboRight = isPressed(ControlButton.TURBO_R),
                triggerLeft = isPressed(ControlButton.FIRE_L),
                triggerRight = isPressed(ControlButton.FIRE_R),
                guard = isPressed(ControlButton.GUARD),
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
        p.ring(s.cx, s.cy, s.radius, 0.55f, 0.85f, 0.65f, if (s.active) 0.45f else 0.26f)
        p.disc(s.cx, s.cy, s.radius * 0.14f, 0.6f, 0.9f, 0.7f, 0.25f)
        p.disc(
            s.cx + s.knobX, s.cy + s.knobY, s.radius * 0.38f,
            0.75f, 0.95f, 0.75f, if (s.active) 0.55f else 0.30f,
        )
    }

    private fun drawButton(p: HudPainter, b: TouchButton) {
        val a = if (b.pressed) 0.62f else 0.26f + b.glow * 0.2f
        val tint = when (b.id) {
            ControlButton.FIRE_R -> Triple(1.0f, 0.72f, 0.35f)
            ControlButton.FIRE_L -> Triple(0.65f, 0.85f, 1.0f)
            ControlButton.FIRE_C -> Triple(1.0f, 0.45f, 0.35f)
            ControlButton.JUMP -> Triple(0.72f, 1.0f, 0.72f)
            ControlButton.DASH -> Triple(1.0f, 0.95f, 0.5f)
            ControlButton.GUARD -> Triple(0.8f, 0.8f, 0.9f)
            else -> Triple(0.85f, 0.9f, 0.85f)
        }
        p.disc(b.cx, b.cy, b.radius, tint.first, tint.second, tint.third, a)
        p.ring(b.cx, b.cy, b.radius, tint.first, tint.second, tint.third, minOf(1f, a + 0.3f))
        val size = b.radius * 0.44f
        p.text(b.label, b.cx, b.cy - size * 0.5f, size, 1f, 1f, 1f, 0.95f, centered = true)
    }
}
