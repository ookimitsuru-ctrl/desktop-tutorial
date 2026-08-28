package com.rollerdash.arena

import android.app.Activity
import android.os.Bundle
import android.view.View
import android.view.WindowManager

/**
 * Single-activity game: a GL surface, an audio mixer, and nothing else.
 * Landscape and fullscreen are pinned in the manifest.
 */
class MainActivity : Activity() {

    private lateinit var audio: Audio
    private lateinit var game: Game
    private lateinit var view: GameView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        audio = Audio()
        game = Game(audio)
        view = GameView(this, game)
        setContentView(view)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        goFullscreen()
    }

    @Deprecated("Predictive back is not used: the game handles back itself.")
    override fun onBackPressed() {
        // Back steps out of the fight before it steps out of the game.
        if (!view.handleBackPressed()) {
            @Suppress("DEPRECATION")
            super.onBackPressed()
        }
    }

    private fun goFullscreen() {
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                or View.SYSTEM_UI_FLAG_FULLSCREEN
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            )
    }

    override fun onResume() {
        super.onResume()
        view.onResume()
        audio.start()
        goFullscreen()
    }

    override fun onPause() {
        super.onPause()
        view.onPause()
        audio.stop()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) goFullscreen()
    }

    override fun onDestroy() {
        super.onDestroy()
        audio.stop()
    }
}
