package jp.okracing.game

import jp.okracing.core.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import java.io.DataOutputStream
import java.io.File
import java.io.FileOutputStream
import kotlin.math.*

/** エンジン音の合成を音を出さずに実行し、WAV に書き出して音量・異常値を調べる */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class AudioTest {
    @Test fun engineSweep() {
        val g = Game(RuntimeEnvironment.getApplication())
        g.startSession("free")
        val S = g.session!!; val c = S.player.car
        val a = GameAudio(); a.initOffline()
        val sr = 44100; val secs = 14.0; val n = (secs * sr / 64).toInt()
        val out = java.io.ByteArrayOutputStream()
        var peak = 0; var sumSq = 0.0; var cnt = 0L; var nan = false
        for (b in 0 until n) {
            val t = b * 64.0 / sr
            // 0〜10 秒: 3,000 → 13,500rpm を全開で吹け上がる / 10〜12 秒: アクセルを戻して回転が落ちる / 12 秒〜: 高回転を保持
            c.rpm = if (t < 10) 3000 + 10500 * t / 10 else if (t < 12) 13500 - 6000 * (t - 10) / 2 else 13000.0
            c.throttle = if (t < 10 || t >= 12) 1.0 else 0.0; c.speed = c.rpm / 13500 * 80
            if (b % 12 == 0) a.update(S, 0.0, 12 * 64.0 / sr)
            val buf = a.renderBlock()
            for (v in buf) { val x = v.toInt(); peak = max(peak, abs(x)); sumSq += x.toDouble() * x; cnt++; out.write(x and 0xff); out.write((x shr 8) and 0xff) }
        }
        val rms = sqrt(sumSq / cnt) / 32768; val db = 20 * log10(rms)
        println("audio rms=${"%.1f".format(db)}dB peak=${"%.3f".format(peak / 32768.0)}")
        val dir = File(System.getProperty("shotDir") ?: "build/shots").also { it.mkdirs() }
        val pcm = out.toByteArray()
        DataOutputStream(FileOutputStream(File(dir, "engine-sweep.wav"))).use { d ->
            fun i32(v: Int) { d.write(v and 0xff); d.write((v shr 8) and 0xff); d.write((v shr 16) and 0xff); d.write((v shr 24) and 0xff) }
            fun i16(v: Int) { d.write(v and 0xff); d.write((v shr 8) and 0xff) }
            d.writeBytes("RIFF"); i32(36 + pcm.size); d.writeBytes("WAVEfmt "); i32(16); i16(1); i16(2); i32(sr); i32(sr * 4); i16(4); i16(16); d.writeBytes("data"); i32(pcm.size); d.write(pcm)
        }
        assert(db > -40 && peak < 32767)
    }
}
