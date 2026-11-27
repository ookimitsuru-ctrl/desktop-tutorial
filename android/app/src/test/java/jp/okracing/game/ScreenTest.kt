package jp.okracing.game

import android.graphics.Bitmap
import android.graphics.Canvas
import org.robolectric.RuntimeEnvironment
import jp.okracing.core.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File
import java.io.FileOutputStream

/** 実際のゲームを 1 フレームずつ進めながら、画面をビットマップに描いて PNG に保存する (目で確認するため) */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class ScreenTest {
    private val W = 844.0; private val H = 390.0; private val DPR = 2.0
    private val dir = File(System.getProperty("shotDir") ?: "build/shots").also { it.mkdirs() }
    private val bmp = Bitmap.createBitmap((W * DPR).toInt(), (H * DPR).toInt(), Bitmap.Config.ARGB_8888)
    private val ctx = Ctx2D(Canvas(bmp))
    private fun shot(name: String) { FileOutputStream(File(dir, "$name.png")).use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }; println("shot $name") }
    private fun run(g: Game, sec: Double, drv: Driver? = null) {
        var t = 0.0
        while (t < sec) {
            if (drv != null) { val S = g.session!!; if (S.state == "green") { drv.update(1.0 / 60, S.wet, S.cars, DriveInfo()); g.input.padThr = S.player.car.throttle; g.input.padBrk = S.player.car.brake } }
            g.frame(ctx, 1.0 / 60); t += 1.0 / 60
        }
    }
    private fun tap(g: Game, x: Double, y: Double) { g.touchDown(0, x, y); g.touchUp(0, x, y); g.frame(ctx, 1.0 / 60) }

    @Test fun screens() {
        val g = Game(RuntimeEnvironment.getApplication())
        g.resize(W, H, DPR, Safe())
        run(g, 1.0); shot("01-title")
        tap(g, 400.0, 200.0); run(g, 0.5); shot("02-menu")
        g.ui.hits.firstOrNull()?.let { }
        // フリー走行の設定画面 → スタート
        val card = g.ui.hits.first { it.w > 100 && it.h > 80 }   // 最初のカード (フリー走行)
        tap(g, card.x + 10, card.y + 10); run(g, 0.3); shot("03-config")
        val go = g.ui.hits.maxBy { it.x }   // 右上の「スタート」
        tap(g, go.x + 5, go.y + 5); run(g, 0.2)
        val S = g.session!!
        val drv = Driver(S.player.car, S.T, S.line, skill = 0.9, steerOnly = false)
        S.player.car.assistTC = true; S.player.car.assistABS = true; S.player.car.autoShift = true
        run(g, 4.0, drv); shot("04-free-start")
        run(g, 25.0, drv); shot("05-free-run")
        run(g, 30.0, drv); shot("06-free-run2")
        g.back(); run(g, 0.3); shot("07-pause")
        println("lap=${S.player.lap} best=${S.player.bestLap} s=${S.player.car.s} speed=${S.player.car.speed * 3.6}")
    }

    private fun auto(g: Game): Driver { val S = g.session!!; val c = S.player.car; c.assistTC = true; c.assistABS = true; c.autoShift = true; return Driver(c, S.T, S.line, skill = 0.9) }

    @Test fun race() {
        val g = Game(RuntimeEnvironment.getApplication()); g.resize(W, H, DPR, Safe())
        val l = g.store.last(); l.laps = 5; l.gridMode = "mid"; g.store.saveLast(l)
        g.startSession("race"); run(g, 1.0); shot("10-race-grid")
        run(g, 3.0); shot("11-race-lights")
        val d = auto(g); run(g, 5.0, d); shot("12-race-start")
        run(g, 40.0, d); shot("13-race-run")
        g.session!!.player.pitRequest = true; run(g, 0.5, d); shot("14-race-pitreq")
        g.session!!.finishSession(); run(g, 2.0); shot("15-race-results")
        println("race pos=${g.session!!.player.pos}")
    }
    @Test fun training() {
        val g = Game(RuntimeEnvironment.getApplication()); g.resize(W, H, DPR, Safe())
        val l = g.store.last(); l.trainSec = 5; g.store.saveLast(l)
        g.startSession("train"); run(g, 1.0); shot("20-train-ready")
        val d = auto(g); run(g, 4.0, d); shot("21-train-run")
        var t = 0.0; while (g.state != "review" && t < 60) { run(g, 0.5, d); t += 0.5 }
        run(g, 0.5); shot("22-train-review")
    }
    @Test fun menus() {
        val g = Game(RuntimeEnvironment.getApplication()); g.resize(W, H, DPR, Safe())
        g.state = "menu"
        for ((k, n) in listOf("settings", "howto", "records", "credits").withIndex()) { g.show(n); run(g, 0.2); shot("3$k-$n") }
        g.show("config", mapOf("mode" to "race")); run(g, 0.2); shot("34-config-race")
        g.show("config", mapOf("mode" to "train")); run(g, 0.2); shot("35-config-train")
        // 狭い画面 (折りたたみ端末相当) と広い画面
        g.resize(700.0, 560.0, DPR, Safe()); g.show("menu"); run(g, 0.2)
        val b2 = Bitmap.createBitmap((700 * DPR).toInt(), (560 * DPR).toInt(), Bitmap.Config.ARGB_8888); val c2 = Ctx2D(Canvas(b2))
        g.frame(c2, 1.0 / 60); FileOutputStream(File(dir, "36-menu-700.png")).use { b2.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }
}
