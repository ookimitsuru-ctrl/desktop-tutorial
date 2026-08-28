package com.rollerdash.arena

import android.content.Context
import android.opengl.GLSurfaceView
import android.view.InputDevice
import android.view.KeyEvent
import android.view.MotionEvent
import com.rollerdash.arena.render.GameRenderer

/**
 * The GL surface plus all input routing. Touches arrive on the UI thread and are
 * handed to the GL thread with [queueEvent], so control state is only ever
 * mutated where it is read.
 */
class GameView(context: Context, private val game: Game) : GLSurfaceView(context) {

    private val renderer: GameRenderer

    init {
        setEGLContextClientVersion(3)
        setEGLConfigChooser(8, 8, 8, 0, 16, 0)
        renderer = GameRenderer(game)
        setRenderer(renderer)
        renderMode = RENDERMODE_CONTINUOUSLY
        isFocusable = true
        isFocusableInTouchMode = true
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        val copy = MotionEvent.obtain(event)
        queueEvent {
            try {
                handleTouch(copy)
            } finally {
                copy.recycle()
            }
        }
        return true
    }

    private fun handleTouch(event: MotionEvent) {
        if (game.state == AppState.BATTLE) {
            game.controls.onTouch(event)
            if (game.controls.consumeMenuPress()) game.togglePause()
            return
        }
        // Menus only care about taps.
        if (event.actionMasked == MotionEvent.ACTION_DOWN) {
            game.onTapOutsideControls(event.x, event.y)
        }
    }

    // ---- gamepad -------------------------------------------------------------

    override fun onGenericMotionEvent(event: MotionEvent): Boolean {
        if (event.source and InputDevice.SOURCE_JOYSTICK != InputDevice.SOURCE_JOYSTICK) {
            return super.onGenericMotionEvent(event)
        }
        val lx = axis(event, MotionEvent.AXIS_X)
        val ly = axis(event, MotionEvent.AXIS_Y)
        val rx = axis(event, MotionEvent.AXIS_Z)
        val ry = axis(event, MotionEvent.AXIS_RZ)
        val lt = event.getAxisValue(MotionEvent.AXIS_LTRIGGER)
        val rt = event.getAxisValue(MotionEvent.AXIS_RTRIGGER)
        queueEvent {
            val pad = game.controls.gamepad
            pad.connected = true
            pad.leftX = lx
            pad.leftY = ly
            pad.rightX = rx
            pad.rightY = ry
            pad.fireL = lt > 0.4f
            pad.fireR = rt > 0.4f
            pad.fireC = lt > 0.4f && rt > 0.4f
        }
        return true
    }

    private fun axis(event: MotionEvent, axis: Int): Float {
        val v = event.getAxisValue(axis)
        return if (kotlin.math.abs(v) < 0.16f) 0f else v
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean =
        if (handleKey(keyCode, true)) true else super.onKeyDown(keyCode, event)

    override fun onKeyUp(keyCode: Int, event: KeyEvent): Boolean =
        if (handleKey(keyCode, false)) true else super.onKeyUp(keyCode, event)

    private fun handleKey(keyCode: Int, down: Boolean): Boolean {
        val inMenu = game.state != AppState.BATTLE
        queueEvent {
            val pad = game.controls.gamepad
            pad.connected = true
            when (keyCode) {
                KeyEvent.KEYCODE_BUTTON_R1 -> pad.fireR = down
                KeyEvent.KEYCODE_BUTTON_L1 -> pad.fireL = down
                KeyEvent.KEYCODE_BUTTON_Y -> pad.fireC = down
                KeyEvent.KEYCODE_BUTTON_A -> if (inMenu) {
                    if (down) game.menuInput(0, 0, true)
                } else {
                    pad.jump = down
                }
                KeyEvent.KEYCODE_BUTTON_B -> pad.dash = down
                KeyEvent.KEYCODE_BUTTON_X -> pad.guard = down
                KeyEvent.KEYCODE_BUTTON_START, KeyEvent.KEYCODE_MENU ->
                    if (down) game.togglePause()
                KeyEvent.KEYCODE_DPAD_UP -> if (down && inMenu) game.menuInput(0, -1, false)
                KeyEvent.KEYCODE_DPAD_DOWN -> if (down && inMenu) game.menuInput(0, 1, false)
                KeyEvent.KEYCODE_DPAD_LEFT -> if (down && inMenu) game.menuInput(-1, 0, false)
                KeyEvent.KEYCODE_DPAD_RIGHT -> if (down && inMenu) game.menuInput(1, 0, false)
                KeyEvent.KEYCODE_DPAD_CENTER -> if (down && inMenu) game.menuInput(0, 0, true)
            }
        }
        return keyCode in HANDLED_KEYS
    }

    /** True when the player asked to back out of the battle. */
    fun handleBackPressed(): Boolean {
        return when (game.state) {
            AppState.BATTLE -> {
                queueEvent { game.togglePause() }
                true
            }
            AppState.PAUSED, AppState.RESULT -> {
                queueEvent { game.toTitle() }
                true
            }
            AppState.TITLE -> false
        }
    }

    private companion object {
        val HANDLED_KEYS = setOf(
            KeyEvent.KEYCODE_BUTTON_A, KeyEvent.KEYCODE_BUTTON_B, KeyEvent.KEYCODE_BUTTON_X,
            KeyEvent.KEYCODE_BUTTON_Y, KeyEvent.KEYCODE_BUTTON_L1, KeyEvent.KEYCODE_BUTTON_R1,
            KeyEvent.KEYCODE_BUTTON_START, KeyEvent.KEYCODE_MENU,
            KeyEvent.KEYCODE_DPAD_UP, KeyEvent.KEYCODE_DPAD_DOWN,
            KeyEvent.KEYCODE_DPAD_LEFT, KeyEvent.KEYCODE_DPAD_RIGHT, KeyEvent.KEYCODE_DPAD_CENTER,
        )
    }
}
