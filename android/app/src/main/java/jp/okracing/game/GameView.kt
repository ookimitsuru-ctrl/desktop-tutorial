package jp.okracing.game

import android.annotation.SuppressLint
import android.content.Context
import android.os.Build
import android.view.*
import kotlin.math.*

/**
 * 全画面の描画面。専用スレッドで「ゲームを 1 フレーム進めて描く」を繰り返す。
 * 描画解像度は dp × dpr (画質設定と負荷に応じて下げる) に固定し、表示時に画面いっぱいへ拡大する。
 */
@SuppressLint("ViewConstructor")
class GameView(context: Context, private val game: Game) : SurfaceView(context), SurfaceHolder.Callback {
    @Volatile private var running = false
    private var thread: Thread? = null
    private val density = resources.displayMetrics.density.toDouble()
    @Volatile private var viewW = 0; @Volatile private var viewH = 0
    @Volatile private var surfW = 0; @Volatile private var surfH = 0
    @Volatile private var surfaceOk = false
    @Volatile private var safe = Safe()
    private val ctx = Ctx2D(android.graphics.Canvas())

    init {
        holder.addCallback(this)
        isFocusable = true; isFocusableInTouchMode = true
        game.onResolution = { post { applyResolution() } }
    }

    override fun onSizeChanged(w: Int, h: Int, ow: Int, oh: Int) { super.onSizeChanged(w, h, ow, oh); viewW = w; viewH = h; applyResolution() }
    override fun onApplyWindowInsets(insets: WindowInsets): WindowInsets {
        if (Build.VERSION.SDK_INT >= 28) {
            val c = insets.displayCutout
            if (c != null) safe = Safe(c.safeInsetLeft / density, c.safeInsetRight / density, c.safeInsetTop / density, c.safeInsetBottom / density)
        }
        applyResolution()
        return super.onApplyWindowInsets(insets)
    }
    private fun applyResolution() {
        if (viewW <= 0 || viewH <= 0) return
        val dpr = min(density, game.dprLimit())
        val wdp = viewW / density; val hdp = viewH / density
        val sw = (wdp * dpr).roundToInt(); val sh = (hdp * dpr).roundToInt()
        holder.setFixedSize(sw, sh)
        synchronized(game) { game.resize(wdp, hdp, sw / wdp, safe) }
    }

    override fun surfaceCreated(h: SurfaceHolder) { surfaceOk = true; start() }
    override fun surfaceChanged(h: SurfaceHolder, format: Int, w: Int, hh: Int) { surfW = w; surfH = hh }
    override fun surfaceDestroyed(h: SurfaceHolder) { surfaceOk = false; stop() }

    fun start() {
        if (running || !surfaceOk) return
        running = true
        thread = Thread({ loop() }, "game").apply { start() }
    }
    fun stop() { running = false; thread?.join(500); thread = null }

    private fun loop() {
        var last = System.nanoTime()
        while (running) {
            val now = System.nanoTime(); val dt = (now - last) / 1e9; last = now
            val canvas = try { if (Build.VERSION.SDK_INT >= 26) holder.lockHardwareCanvas() else holder.lockCanvas() } catch (e: Exception) { null }
            if (canvas == null) { Thread.sleep(8); continue }
            try {
                ctx.canvas = canvas
                synchronized(game) { if (game.w > 0) game.frame(ctx, max(1e-4, dt)) }
            } finally { holder.unlockCanvasAndPost(canvas) }
        }
    }

    // ---- タッチ (dp 座標に直してゲームへ) ----
    @SuppressLint("ClickableViewAccessibility")
    override fun onTouchEvent(e: MotionEvent): Boolean {
        val k = 1 / density
        synchronized(game) {
            when (e.actionMasked) {
                MotionEvent.ACTION_DOWN, MotionEvent.ACTION_POINTER_DOWN -> { val i = e.actionIndex; game.touchDown(e.getPointerId(i), e.getX(i) * k, e.getY(i) * k) }
                MotionEvent.ACTION_MOVE -> for (i in 0 until e.pointerCount) game.touchMove(e.getPointerId(i), e.getX(i) * k, e.getY(i) * k)
                MotionEvent.ACTION_UP, MotionEvent.ACTION_POINTER_UP -> { val i = e.actionIndex; game.touchUp(e.getPointerId(i), e.getX(i) * k, e.getY(i) * k) }
                MotionEvent.ACTION_CANCEL -> game.touchCancel()
            }
        }
        return true
    }

    // ---- キーボード / ゲームパッド ----
    fun key(code: Int, down: Boolean, repeat: Int): Boolean {
        val inp = game.input
        synchronized(game) {
            when (code) {
                KeyEvent.KEYCODE_DPAD_UP, KeyEvent.KEYCODE_W -> { inp.kUp = down; return true }
                KeyEvent.KEYCODE_DPAD_DOWN, KeyEvent.KEYCODE_S, KeyEvent.KEYCODE_SPACE -> { inp.kDn = down; return true }
                KeyEvent.KEYCODE_DPAD_RIGHT, KeyEvent.KEYCODE_X, KeyEvent.KEYCODE_E, KeyEvent.KEYCODE_BUTTON_R1, KeyEvent.KEYCODE_BUTTON_A -> { if (down && repeat == 0) inp.shiftKey(1); return true }
                KeyEvent.KEYCODE_DPAD_LEFT, KeyEvent.KEYCODE_Z, KeyEvent.KEYCODE_Q, KeyEvent.KEYCODE_BUTTON_L1, KeyEvent.KEYCODE_BUTTON_X -> { if (down && repeat == 0) inp.shiftKey(-1); return true }
                KeyEvent.KEYCODE_P, KeyEvent.KEYCODE_ESCAPE, KeyEvent.KEYCODE_BUTTON_START -> { if (down && repeat == 0) game.input.onButton?.invoke("pause"); return true }
            }
        }
        return false
    }
    override fun onGenericMotionEvent(e: MotionEvent): Boolean {
        if (e.source and InputDevice.SOURCE_JOYSTICK == InputDevice.SOURCE_JOYSTICK && e.action == MotionEvent.ACTION_MOVE) {
            synchronized(game) {
                game.input.padThr = max(e.getAxisValue(MotionEvent.AXIS_RTRIGGER), e.getAxisValue(MotionEvent.AXIS_GAS)).toDouble()
                game.input.padBrk = max(e.getAxisValue(MotionEvent.AXIS_LTRIGGER), e.getAxisValue(MotionEvent.AXIS_BRAKE)).toDouble()
            }
            return true
        }
        return super.onGenericMotionEvent(e)
    }
}
