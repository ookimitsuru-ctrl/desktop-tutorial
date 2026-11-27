package jp.okracing.game

import android.app.Activity
import android.os.Build
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager

/** Formula simulator (ネイティブ版): ゲーム全体を Kotlin で動かし、全画面の SurfaceView に描く */
class MainActivity : Activity() {
    private lateinit var game: Game
    private lateinit var view: GameView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        if (Build.VERSION.SDK_INT >= 28) window.attributes = window.attributes.apply { layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES }
        game = Game(this)
        view = GameView(this, game)
        setContentView(view)
        hideSystemUi()
    }
    @Suppress("DEPRECATION")
    private fun hideSystemUi() {
        if (Build.VERSION.SDK_INT >= 30) {
            window.setDecorFitsSystemWindows(false)
            window.insetsController?.let { it.hide(WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars()); it.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE }
        } else {
            window.decorView.systemUiVisibility = (View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_STABLE or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION)
        }
    }
    override fun onWindowFocusChanged(hasFocus: Boolean) { super.onWindowFocusChanged(hasFocus); if (hasFocus) hideSystemUi() }
    override fun onPause() { super.onPause(); synchronized(game) { game.onPauseApp() }; view.stop() }
    override fun onResume() { super.onResume(); hideSystemUi(); synchronized(game) { game.onResumeApp() }; view.start() }
    override fun onDestroy() { game.audio.release(); super.onDestroy() }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() { val handled = synchronized(game) { game.back() }; if (!handled) finish() }
    override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean = view.key(keyCode, true, event.repeatCount) || super.onKeyDown(keyCode, event)
    override fun onKeyUp(keyCode: Int, event: KeyEvent): Boolean = view.key(keyCode, false, 0) || super.onKeyUp(keyCode, event)
}
