package com.rollerdash.arena

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import kotlin.math.exp
import kotlin.math.min
import kotlin.math.sin
import kotlin.random.Random

enum class Sfx { SHOT, CANNON, MISSILE, EXPLOSION, MELEE, DASH, JUMP, LAND, LOCK, HIT, KO, UI }

/**
 * Every sound in the game is synthesised at startup - noise bursts, decaying
 * sines and a couple of sweeps - then mixed by hand into one streaming track.
 * No audio assets, no SoundPool limits, and pitch is free.
 */
class Audio {
    private val rate = 22050
    private val bank = HashMap<Sfx, ShortArray>()
    private val voices = arrayOfNulls<Voice>(24)
    private var track: AudioTrack? = null
    private var thread: Thread? = null
    @Volatile private var running = false
    @Volatile var muted = false

    private class Voice(val data: ShortArray, var pos: Float, val step: Float, val gain: Float)

    private val rng = Random(7)

    init { buildBank() }

    fun start() {
        if (running) return
        val minBuf = AudioTrack.getMinBufferSize(
            rate, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT,
        ).coerceAtLeast(2048)
        val t = AudioTrack.Builder()
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_GAME)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build(),
            )
            .setAudioFormat(
                AudioFormat.Builder()
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setSampleRate(rate)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                    .build(),
            )
            .setBufferSizeInBytes(minBuf * 2)
            .setTransferMode(AudioTrack.MODE_STREAM)
            .build()
        track = t
        t.play()
        running = true
        thread = Thread({ mixLoop(t) }, "rollerdash-audio").apply {
            priority = Thread.NORM_PRIORITY + 1
            start()
        }
    }

    fun stop() {
        running = false
        thread?.join(400)
        thread = null
        track?.let {
            try {
                it.pause()
                it.flush()
                it.release()
            } catch (_: IllegalStateException) {
                // Track already torn down; nothing to clean up.
            }
        }
        track = null
        synchronized(voices) { for (i in voices.indices) voices[i] = null }
    }

    fun play(sfx: Sfx, gain: Float = 1f, pitch: Float = 1f) {
        if (!running || muted) return
        val data = bank[sfx] ?: return
        synchronized(voices) {
            var slot = voices.indexOfFirst { it == null }
            if (slot < 0) slot = rng.nextInt(voices.size)
            voices[slot] = Voice(data, 0f, pitch.coerceIn(0.25f, 4f), gain.coerceIn(0f, 1.6f))
        }
    }

    private fun mixLoop(t: AudioTrack) {
        val frames = 512
        val mix = FloatArray(frames)
        val out = ShortArray(frames)
        while (running) {
            java.util.Arrays.fill(mix, 0f)
            synchronized(voices) {
                for (i in voices.indices) {
                    val v = voices[i] ?: continue
                    var pos = v.pos
                    for (f in 0 until frames) {
                        val idx = pos.toInt()
                        if (idx >= v.data.size - 1) break
                        // Linear interpolation keeps pitch shifts from buzzing.
                        val frac = pos - idx
                        val s = v.data[idx] * (1f - frac) + v.data[idx + 1] * frac
                        mix[f] += s * v.gain
                        pos += v.step
                    }
                    v.pos = pos
                    if (pos >= v.data.size - 1) voices[i] = null
                }
            }
            for (f in 0 until frames) {
                // Soft clip so a wall of explosions distorts gracefully.
                val x = mix[f] / 32768f
                val y = x / (1f + kotlin.math.abs(x) * 0.7f)
                out[f] = (y * 32000f).toInt().coerceIn(-32768, 32767).toShort()
            }
            try {
                t.write(out, 0, frames)
            } catch (_: IllegalStateException) {
                return
            }
        }
    }

    // ---- synthesis -----------------------------------------------------------

    private fun buildBank() {
        bank[Sfx.SHOT] = build(0.13f) { t, n ->
            val env = exp(-t * 42f)
            (noise() * 0.7f + sin(t * 2f * PI * (240f - t * 400f)) * 0.5f) * env * (1f - n * 0.1f)
        }
        bank[Sfx.CANNON] = build(0.45f) { t, _ ->
            val env = exp(-t * 9f)
            (noise() * 0.5f + sin(t * 2f * PI * (110f - t * 90f)) * 0.9f) * env
        }
        bank[Sfx.MISSILE] = build(0.5f) { t, _ ->
            val env = min(1f, t * 12f) * exp(-t * 4f)
            (noise() * 0.55f + sin(t * 2f * PI * (500f + t * 700f)) * 0.25f) * env
        }
        bank[Sfx.EXPLOSION] = build(1.15f) { t, _ ->
            val env = exp(-t * 3.6f)
            val rumble = sin(t * 2f * PI * (58f - t * 20f)) * 0.75f
            (noise() * 0.9f + rumble) * env
        }
        bank[Sfx.MELEE] = build(0.55f) { t, _ ->
            val env = exp(-t * 12f)
            val ring = sin(t * 2f * PI * 1450f) * 0.4f + sin(t * 2f * PI * 2270f) * 0.25f
            (noise() * 0.5f + ring) * env
        }
        bank[Sfx.DASH] = build(0.7f) { t, _ ->
            val env = min(1f, t * 8f) * exp(-t * 3.2f)
            (sin(t * 2f * PI * (300f + t * 900f)) * 0.55f + noise() * 0.45f) * env
        }
        bank[Sfx.JUMP] = build(0.55f) { t, _ ->
            val env = exp(-t * 5f)
            (noise() * 0.8f + sin(t * 2f * PI * (180f + t * 260f)) * 0.4f) * env
        }
        bank[Sfx.LAND] = build(0.42f) { t, _ ->
            val env = exp(-t * 11f)
            (noise() * 0.6f + sin(t * 2f * PI * (90f - t * 40f)) * 0.85f) * env
        }
        bank[Sfx.LOCK] = build(0.16f) { t, _ ->
            val env = exp(-t * 16f)
            sin(t * 2f * PI * 1500f) * env * 0.6f
        }
        bank[Sfx.HIT] = build(0.30f) { t, _ ->
            val env = exp(-t * 16f)
            (noise() * 0.7f + sin(t * 2f * PI * 780f) * 0.4f) * env
        }
        bank[Sfx.KO] = build(1.8f) { t, _ ->
            val env = exp(-t * 2.1f)
            val rumble = sin(t * 2f * PI * (46f - t * 14f)) * 0.9f
            (noise() * 0.85f + rumble) * env
        }
        bank[Sfx.UI] = build(0.12f) { t, _ ->
            val env = exp(-t * 22f)
            sin(t * 2f * PI * 880f) * env * 0.5f
        }
    }

    private inline fun build(seconds: Float, gen: (t: Float, norm: Float) -> Float): ShortArray {
        val n = (seconds * rate).toInt()
        val out = ShortArray(n)
        for (i in 0 until n) {
            val t = i.toFloat() / rate
            val v = gen(t, i.toFloat() / n)
            out[i] = (v.coerceIn(-1f, 1f) * 30000f).toInt().toShort()
        }
        return out
    }

    private fun noise() = rng.nextFloat() * 2f - 1f

    private companion object {
        const val PI = 3.14159265f
    }
}
