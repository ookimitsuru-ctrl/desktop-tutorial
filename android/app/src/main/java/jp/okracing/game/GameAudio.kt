package jp.okracing.game

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import jp.okracing.core.*
import java.util.concurrent.ConcurrentLinkedQueue
import kotlin.math.*

// サウンド (Web 版 src/audio.js の移植)。音声ファイルは使わず、すべてその場で合成する。
// Web Audio API の部品 (発振器・バイクアッドフィルタ・ウェーブシェイパー・コンプレッサ・パン) を Kotlin で作り、
// 専用スレッドで計算して AudioTrack に流す。音の作り (倍音・歪み・ノイズ・回転帯ごとの切り替え) は Web 版と同じ。

private const val SR = 44100
private const val BLOCK = 64
private const val NOISE_LEVEL = 0.55
private const val D_MID = 2.5; private const val D_MIDHI = 3.0; private const val D_COMP = 0.15
private const val G_MID = 0.4; private const val G_MIDHI = 0.5; private const val G_HIGH = 0.25
private const val R_PITCH = 0.04; private const val R_LEVEL = 0.8; private const val R_NOISE = 0.9
private const val ENGINE_CLEAN_K = 2.8; private const val MASTER_CLEAN_K = 1.5
private const val SOFT_DRIVE = 2.4
private fun smooth01(v0: Double): Double { val v = clamp(v0, 0.0, 1.0); return v * v * (3 - 2 * v) }
private fun highBand(rpm: Double) = smooth01((rpm - 11000) / 1500)

/** setTargetAtTime と同じ: 目標へ時定数 tc で近づく値 (ブロックごとに更新) */
class Param(init: Double) {
    @Volatile var target = init; @Volatile var tc = 0.05
    var v = init
    fun set(t: Double, timeConst: Double) { target = t; tc = timeConst }
    fun step() { val tcc = tc; v += (target - v) * (if (tcc <= 0) 1.0 else 1 - exp(-BLOCK.toDouble() / SR / tcc)) }
}

private class Wave(harm: DoubleArray) {
    val n = 2048; val tab = FloatArray(n + 1)
    init {
        var peak = 0.0; val tmp = DoubleArray(n)
        for (i in 0 until n) { var s = 0.0; for (k in harm.indices) s += harm[k] * sin(2 * PI * (k + 1) * i / n); tmp[i] = s; peak = max(peak, abs(s)) }
        for (i in 0 until n) tab[i] = (tmp[i] / peak).toFloat(); tab[n] = tab[0]
    }
}
private class Osc(val w: Wave) {
    var ph = Math.random()
    fun next(freq: Double): Float { ph += freq / SR; ph -= floor(ph); val x = ph * w.n; val i = x.toInt(); val f = (x - i).toFloat(); return w.tab[i] + (w.tab[i + 1] - w.tab[i]) * f }
}
private class Shaper(curve: (Double) -> Double) {
    val n = 1024; val c = FloatArray(n)
    init { for (i in 0 until n) c[i] = curve(i / ((n - 1) / 2.0) - 1).toFloat() }
    fun run(x: Float): Float { val p = (clamp(x.toDouble(), -1.0, 1.0) + 1) * (n - 1) / 2; val i = min(n - 2, p.toInt()); val f = (p - i).toFloat(); return c[i] + (c[i + 1] - c[i]) * f }
}
/** Web Audio の BiquadFilterNode と同じ係数 (lowpass/highpass の Q は dB) */
private class Biquad(val type: String) {
    var b0 = 1.0; var b1 = 0.0; var b2 = 0.0; var a1 = 0.0; var a2 = 0.0
    var x1 = 0.0; var x2 = 0.0; var y1 = 0.0; var y2 = 0.0
    private var lf = -1.0; private var lq = -1.0; private var lg = -99.0
    fun setup(freq0: Double, q: Double, gainDb: Double = 0.0) {
        if (freq0 == lf && q == lq && gainDb == lg) return
        lf = freq0; lq = q; lg = gainDb
        val f = clamp(freq0, 10.0, SR / 2.0 - 10); val w0 = 2 * PI * f / SR; val cw = cos(w0); val sw = sin(w0)
        var B0: Double; var B1: Double; var B2: Double; val A0: Double; val A1: Double; val A2: Double
        when (type) {
            "lowpass", "highpass" -> {
                val qq = 10.0.pow(q / 20); val alpha = sw / (2 * qq)
                if (type == "lowpass") { B0 = (1 - cw) / 2; B1 = 1 - cw; B2 = (1 - cw) / 2 } else { B0 = (1 + cw) / 2; B1 = -(1 + cw); B2 = (1 + cw) / 2 }
                A0 = 1 + alpha; A1 = -2 * cw; A2 = 1 - alpha
            }
            "bandpass" -> { val alpha = sw / (2 * max(q, 1e-4)); B0 = alpha; B1 = 0.0; B2 = -alpha; A0 = 1 + alpha; A1 = -2 * cw; A2 = 1 - alpha }
            else -> { // peaking
                val A = 10.0.pow(gainDb / 40); val alpha = sw / (2 * max(q, 1e-4))
                B0 = 1 + alpha * A; B1 = -2 * cw; B2 = 1 - alpha * A; A0 = 1 + alpha / A; A1 = -2 * cw; A2 = 1 - alpha / A
            }
        }
        b0 = B0 / A0; b1 = B1 / A0; b2 = B2 / A0; a1 = A1 / A0; a2 = A2 / A0
    }
    fun run(x: Double): Double { val y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y }
}
/** DynamicsCompressorNode の近似 (ニー付きの圧縮カーブ + 自動メイクアップゲイン) */
private class Compressor(val threshold: Double, val knee: Double, val ratio: Double, val attack: Double, val release: Double) {
    private var env = 0.0
    private val makeup = 1 / curveGain(1.0).pow(0.6)
    private fun curveGain(x: Double): Double {
        val xd = 20 * log10(max(x, 1e-9)); val t = threshold; val k = knee
        val yd = if (xd < t - k / 2) xd else if (k > 0 && xd <= t + k / 2) xd + (1 / ratio - 1) * (xd - t + k / 2).pow(2) / (2 * k) else t + (xd - t) / ratio
        return 10.0.pow((yd - xd) / 20)
    }
    private val aA = exp(-1.0 / (SR * attack)); private val aR = exp(-1.0 / (SR * release))
    fun run(l: Double, r: Double, out: DoubleArray) {
        val x = max(abs(l), abs(r))
        env = if (x > env) aA * env + (1 - aA) * x else aR * env + (1 - aR) * x
        val g = curveGain(env) * makeup
        out[0] = l * g; out[1] = r * g
    }
}

private class Noise(val buf: FloatArray) { var i = (Math.random() * buf.size).toInt(); fun next(): Float { val v = buf[i]; i++; if (i >= buf.size) i = 0; return v } }

private class Engine(main: Boolean, noise: FloatArray) {
    val wA = Wave(doubleArrayOf(1.0, 0.62, 0.48, 0.3, 0.26, 0.15, 0.12, 0.08, 0.06, 0.04))
    val wB = Wave(doubleArrayOf(1.0, 0.3, 0.55, 0.2, 0.3, 0.1, 0.12))
    val wC = Wave(doubleArrayOf(0.6, 1.0, 0.5, 0.7, 0.3, 0.35, 0.2, 0.2, 0.1, 0.12, 0.06, 0.08))
    val o1 = Osc(wA); val o2 = Osc(wB); val o3 = Osc(wC); val o4 = Osc(wA)
    val f1 = Param(300.0); val f2 = Param(150.0); val f3 = Param(60.0); val f4 = Param(303.0)
    val g1 = Param(0.5); val g2 = Param(0.3); val g3 = Param(0.35); val g4 = Param(0.0)
    val mix = Param(1.0); val ng = Param(0.0); val nfF = Param(1500.0); val drive = Param(1.0)
    val shG = Param(1.0); val cleanG = Param(0.0); val lpF = Param(2000.0); val pkG = Param(5.0)
    val gritG = Param(0.0); val dryG = Param(1.0); val out = Param(0.0); val pan = Param(0.0)
    val all = arrayOf(f1, f2, f3, f4, g1, g2, g3, g4, mix, ng, nfF, drive, shG, cleanG, lpF, pkG, gritG, dryG, out, pan)
    val sh = Shaper { x -> tanh(x * 3.5 + 0.12) * 0.8 - 0.07 }
    val soft = Shaper { x -> tanh(SOFT_DRIVE * x) / tanh(SOFT_DRIVE) }
    val grit = Shaper { x -> tanh(x * 2.2 + 0.18) / tanh(2.2) - tanh(0.18) / tanh(2.2) }
    val nf = Biquad("bandpass"); val lp = Biquad("lowpass"); val pk = Biquad("peaking")
    val nz = Noise(noise)
    fun block() { for (p in all) p.step(); nf.setup(nfF.v, 0.9); lp.setup(lpF.v, 0.8); pk.setup(1300.0, 1.2, pkG.v) }
    /** 1 サンプル (モノラル) */
    fun sample(): Double {
        if (out.v < 1e-5 && out.target < 1e-5) return 0.0
        val m = (o1.next(f1.v) * g1.v + o2.next(f2.v) * g2.v + o3.next(f3.v) * g3.v + o4.next(f4.v) * g4.v + nf.run(nz.next().toDouble()) * ng.v) * mix.v
        val a = sh.run((m * drive.v).toFloat()) * shG.v + soft.run((m * 0.5).toFloat()) * cleanG.v
        val p = pk.run(lp.run(a))
        return (p * dryG.v + grit.run((p * 2.2).toFloat()) * gritG.v) * out.v
    }
}
private class NoiseCh(type: String, freq: Double, val q: Double, noise: FloatArray) {
    val f = Biquad(type); val g = Param(0.0); val fr = Param(freq); val nz = Noise(noise)
    fun block() { g.step(); fr.step(); f.setup(fr.v, q) }
    fun sample(): Double { if (g.v < 1e-5 && g.target < 1e-5) return 0.0; return f.run(nz.next().toDouble()) * g.v }
}
/** 効果音: 短い発振 / ノイズの破裂音 (blip / noiseBurst) */
private class Voice(val kind: String, val freq: Double, val dur: Double, val vol: Double, val type: String, var delay: Int, noise: FloatArray?) {
    var t = 0; var ph = 0.0
    val nz = noise?.let { Noise(it) }; val f = Biquad(if (type == "bandpass") "bandpass" else "lowpass").also { it.setup(freq, if (type == "bandpass") 1.0 else 1.0) }
    val n = ((dur + 0.02) * SR).toInt()
    fun done() = t >= n
    fun sample(): Double {
        if (delay > 0) { delay--; return 0.0 }
        val tt = t.toDouble() / SR; t++
        if (kind == "noise") { val env = vol * (0.0008 / vol).pow(min(1.0, tt / dur)); return f.run(nz!!.next().toDouble()) * env }
        val env = if (tt < 0.008) vol * tt / 0.008 else vol * (0.0008 / vol).pow(min(1.0, (tt - 0.008) / max(1e-3, dur - 0.008)))
        ph += freq / SR; ph -= floor(ph)
        val s = when (type) { "square" -> if (ph < 0.5) 1.0 else -1.0; "sawtooth" -> 2 * ph - 1; "triangle" -> 1 - 4 * abs(ph - 0.5); else -> sin(2 * PI * ph) }
        return s * env
    }
}

class GameAudio {
    @Volatile var ready = false
    private var track: AudioTrack? = null
    private var thread: Thread? = null
    @Volatile private var running = false
    private val noise = FloatArray(SR * 2) { (Math.random() * 2 - 1).toFloat() }
    private lateinit var player: Engine; private val others = ArrayList<Engine>()
    private lateinit var squeal: NoiseCh; private lateinit var wind: NoiseCh; private lateinit var rumble: NoiseCh; private lateinit var rainN: NoiseCh; private lateinit var scrapeN: NoiseCh
    private val master = Param(0.8); private val satG = Param(1.0); private val cleanG = Param(0.0)
    private val masterSat = Shaper { x -> tanh(x * 1.9) / tanh(1.9) * 0.96 + x * 0.04 }
    private val comp = Compressor(-14.0, 30.0, 5.0, 0.004, 0.2)
    private val lim = Compressor(-2.5, 0.0, 20.0, 0.001, 0.12)
    private val voices = ArrayList<Voice>(); private val pending = ConcurrentLinkedQueue<Voice>()
    private var vol = 0.8; private var muted = false
    private var lastT = 0L; private var loadSm = Double.NaN; private var prevDown = false; private var dnT = 0.0

    private fun build() {
        player = Engine(true, noise)
        for (k in 0 until 3) others.add(Engine(false, noise))
        squeal = NoiseCh("bandpass", 1150.0, 5.0, noise); wind = NoiseCh("lowpass", 500.0, 0.6, noise); rumble = NoiseCh("lowpass", 150.0, 1.2, noise)
        rainN = NoiseCh("highpass", 3200.0, 0.5, noise); scrapeN = NoiseCh("bandpass", 3800.0, 1.6, noise)
        master.set(vol, 0.0); master.v = vol
    }
    /** 音を出さずに合成だけ行う (テスト用) */
    internal fun initOffline() { if (!ready) { build(); ready = true } }
    fun init() {
        if (track != null) { if (!running) start(); return }
        build()
        val minBuf = AudioTrack.getMinBufferSize(SR, AudioFormat.CHANNEL_OUT_STEREO, AudioFormat.ENCODING_PCM_16BIT)
        track = AudioTrack.Builder()
            .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_GAME).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
            .setAudioFormat(AudioFormat.Builder().setSampleRate(SR).setEncoding(AudioFormat.ENCODING_PCM_16BIT).setChannelMask(AudioFormat.CHANNEL_OUT_STEREO).build())
            .setBufferSizeInBytes(max(minBuf, BLOCK * 4 * 16)).setTransferMode(AudioTrack.MODE_STREAM).build()
        ready = true
        start()
    }
    private fun start() {
        val tr = track ?: return
        running = true; tr.play()
        thread = Thread({ loop(tr) }, "audio").apply { priority = Thread.MAX_PRIORITY; start() }
    }
    fun stop() { running = false; thread?.join(300); thread = null; track?.pause() }
    fun release() { stop(); track?.release(); track = null; ready = false }

    private val outBuf = ShortArray(BLOCK * 2); private val o2 = DoubleArray(2)
    private val engines by lazy { arrayOf(player) + others.toTypedArray() }
    private val chans by lazy { arrayOf(squeal, wind, rumble, rainN, scrapeN) }
    /** 1 ブロック (BLOCK サンプル・ステレオ) を合成する */
    internal fun renderBlock(): ShortArray {
        val buf = outBuf; val o = o2
        for (e in engines) e.block(); for (c in chans) c.block(); master.step(); satG.step(); cleanG.step()
        while (true) { val v = pending.poll() ?: break; voices.add(v) }
        for (s in 0 until BLOCK) {
            var l = 0.0; var r = 0.0
            for (e in engines) { val v = e.sample(); if (v != 0.0) { val p = e.pan.v; val a = (p + 1) * PI / 4; l += v * cos(a); r += v * sin(a) } }
            var mono = 0.0
            for (c in chans) mono += c.sample()
            var i = voices.size - 1
            while (i >= 0) { val vc = voices[i]; mono += vc.sample(); if (vc.done()) voices.removeAt(i); i-- }
            l = (l + mono) * master.v; r = (r + mono) * master.v
            // 全体: わずかに歪ませる経路と歪みのない経路 → コンプレッサ → リミッター
            val ls = masterSat.run(l.toFloat()) * satG.v + l * cleanG.v; val rs = masterSat.run(r.toFloat()) * satG.v + r * cleanG.v
            comp.run(ls, rs, o); lim.run(o[0], o[1], o)
            buf[s * 2] = (clamp(o[0] * 0.86, -1.0, 1.0) * 32767).toInt().toShort(); buf[s * 2 + 1] = (clamp(o[1] * 0.86, -1.0, 1.0) * 32767).toInt().toShort()
        }
        return buf
    }
    private fun loop(tr: AudioTrack) { while (running) { val b = renderBlock(); tr.write(b, 0, b.size) } }

    private fun setEngine(e: Engine, rpm: Double, load: Double, gain: Double, pan: Double = 0.0) {
        val f = clamp(rpm, 1500.0, 14500.0) / 60 * 5
        val a1 = smooth01((rpm - 4500) / 2500); val a2 = smooth01((rpm - 8000) / 2000); val a3 = smooth01((rpm - 11000) / 1500)
        val wLow = 1 - a1; val wMid = a1 * (1 - a2); val wMidHi = a2 * (1 - a3); val wHigh = a3
        val rough = wLow + wMid * 0.35
        val jf = 1 + (Math.random() - 0.5) * R_PITCH * rough; val ja = 1 + (Math.random() - 0.5) * R_LEVEL * rough; val jn = 1 + (Math.random() - 0.5) * R_NOISE * rough
        val tj = if (rough > 0.05) 0.012 else 0.02
        val x = clamp((rpm - 8500) / 3000, 0.0, 1.0); val murk = 1 - x * x * (3 - 2 * x)
        e.f1.set(f * jf, tj); e.f2.set(f * 0.5 * jf, tj); e.f3.set(f * 0.2 * jf, tj); e.f4.set(f * jf * (1 + 0.011 + 0.006 * (1 - murk)), tj)
        e.g4.set(0.30 * murk, 0.05); e.g2.set(0.30 + 0.12 * murk, 0.05); e.g3.set(0.35 + 0.12 * murk, 0.05)
        e.lpF.set((900 + load * 4200 + rpm * 0.16) * (1 - 0.30 * murk), 0.04)
        e.pkG.set(5 - 2.5 * murk, 0.06)
        e.mix.set(0.55 + load * 0.75, 0.03)
        val nz = wLow * 2.3 + wMid * 1.4 + wMidHi * 0.4
        e.ng.set(nz * NOISE_LEVEL * jn, if (rough > 0.05) 0.02 else 0.05)
        e.nfF.set(clamp(f * (wLow * 2.0 + wMid * 2.4 + wMidHi * 3.2 + wHigh * 3.2), 350.0, 4200.0), 0.06)
        val dr = 1 + D_MID * wMid + D_MIDHI * wMidHi
        e.drive.set(dr, 0.05)
        val gr = G_MID * wMid + G_MIDHI * wMidHi + G_HIGH * wHigh
        e.gritG.set(gr * 0.62, 0.05); e.dryG.set(1 - gr * 0.3, 0.05)
        e.shG.set(cos(wHigh * PI / 2) * dr.pow(-D_COMP), 0.05)
        e.cleanG.set(sin(wHigh * PI / 2) * ENGINE_CLEAN_K, 0.05)
        e.out.set(gain * ja, if (rough > 0.05) 0.01 else 0.05)
        e.pan.set(clamp(pan, -1.0, 1.0), 0.08)
    }
    fun setVolume(v: Double) { vol = v; master.set(if (muted) 0.0 else v, 0.05) }
    fun setMuted(m: Boolean) { muted = m; master.set(if (m) 0.0 else vol, 0.08) }

    fun update(session: Session, camRot: Double, dtFixed: Double = -1.0) {
        if (!ready) return
        val pl = session.player; val c = pl.car
        val now = System.nanoTime(); val dt = if (dtFixed >= 0) dtFixed else if (lastT == 0L) 0.0 else clamp((now - lastT) / 1e9, 0.0, 0.1); lastT = now
        val cut = if (c.limiter && floor(now / 1e9 * 28).toLong() % 2 == 0L) 0.35 else 1.0
        val rf = clamp((c.rpm - 3000) / 9500, 0.0, 1.0)
        val target = if (pl.pit != null) 0.25 else max(clamp(c.throttle, 0.0, 1.0), 0.15 + 0.5 * rf)
        if (loadSm.isNaN()) loadSm = target
        loadSm += (target - loadSm) * (1 - exp(-dt / (if (target > loadSm) 0.04 else 0.28)))
        val down = c.shiftT > 0 && c.nextGear < c.gear
        if (down && !prevDown) dnT = 1.0
        prevDown = down; dnT = max(0.0, dnT - dt / 0.4)
        val upShifting = c.shiftT > 0 && c.nextGear >= c.gear
        val load = clamp(loadSm + 0.35 * dnT, 0.0, 1.15) * (if (upShifting) 0.25 else 1.0)
        setEngine(player, c.rpm, load, (0.16 + 0.26 * load) * cut * (1 + 0.25 * dnT))
        run { val hw = if (pl.pit != null) 0.0 else highBand(c.rpm); satG.set(1 - hw, 0.05); cleanG.set(hw * MASTER_CLEAN_K, 0.05) }
        // 近い他車 3 台
        val near = session.entries.filter { it !== pl && !it.out }.map { e -> val dx = e.car.x - c.x; val dy = e.car.y - c.y; Triple(e, dx * dx + dy * dy, doubleArrayOf(dx, dy)) }.filter { it.second < 150 * 150 }.sortedBy { it.second }
        for (k in others.indices) {
            val n = near.getOrNull(k); val o = others[k]
            if (n == null) { o.out.set(0.0, 0.1); continue }
            val d = sqrt(n.second); val g = 0.2 / (1 + d * d / 500)
            val oc = n.first.car; val ndx = n.third[0]; val ndy = n.third[1]
            val rel = ((oc.vx * cos(oc.yaw) - c.vx * cos(c.yaw)) * ndx + (oc.vx * sin(oc.yaw) - c.vx * sin(c.yaw)) * ndy) / (d + 1)
            val dop = 1 - clamp(rel / 340, -0.25, 0.25)
            val sx = cos(camRot) * ndx - sin(camRot) * ndy
            setEngine(o, oc.rpm * dop, clamp(oc.throttle, 0.0, 1.0), g, sx / 40)
        }
        val slip = max(max(abs(c.saF) - 0.1, abs(c.saR) - 0.09), max(max(abs(c.kR) - 0.14, abs(c.kF) - 0.14), 0.0))
        val onRoad = c.offCount < 3 && pl.pit == null
        val sq = if (onRoad) clamp(slip * 4, 0.0, 1.0) * clamp(c.speed / 12, 0.0, 1.0) * (1 - session.wet * 0.75) else 0.0
        squeal.g.set(sq * 0.22, 0.05); squeal.fr.set(950 + c.speed * 6 + slip * 300, 0.06)
        wind.g.set(clamp(c.speed / 90, 0.0, 1.0).pow(2) * 0.2, 0.1); wind.fr.set(350 + c.speed * 9, 0.1)
        var rough = 0.0; for (k in 0 until 4) rough += if (c.surf[k] == 1) 0.3 else if (c.surf[k] >= 2) 0.25 else 0.0
        rumble.g.set(if (pl.pit != null) 0.0 else clamp(rough * c.speed / 30, 0.0, 1.0) * 0.5, 0.04); rumble.fr.set(90 + c.speed * 3.5, 0.05)
        val T = session.T
        if (pl.pit == null && c.offCount < 3) {
            val vib = T.bumpAt(c.s, c.speed); val sc = T.scrape(c.s, c.vx)
            if (vib > 0) rumble.g.set(clamp(rough * c.speed / 30 + vib * 0.35, 0.0, 1.0) * 0.5, 0.04)
            scrapeN.g.set(if (sc > 0.12) min(0.32, sc * 0.4) else 0.0, if (sc > 0.12) 0.005 else 0.03)
            scrapeN.fr.set(3000 + Math.random() * 1800, 0.01)
        } else scrapeN.g.set(0.0, 0.03)
        rainN.g.set(session.rain * 0.05 + session.wet * clamp(c.speed / 80, 0.0, 1.0) * 0.07, 0.3)
    }
    fun silence() {
        if (!ready) return
        player.out.set(0.0, 0.08); for (e in others) e.out.set(0.0, 0.08)
        for (n in arrayOf(squeal, wind, rumble, rainN, scrapeN)) n.g.set(0.0, 0.08)
        lastT = 0L
    }
    // 効果音
    fun blip(freq: Double, dur: Double = 0.12, vol: Double = 0.2, type: String = "sine", delayS: Double = 0.0) { if (ready) pending.add(Voice("osc", freq, dur, vol, type, (delayS * SR).toInt(), null)) }
    private fun noiseBurst(dur: Double, vol: Double, freq: Double, type: String = "lowpass") { if (ready) pending.add(Voice("noise", freq, dur, vol, type, 0, noise)) }
    fun shift() { noiseBurst(0.06, 0.25, 2400.0, "bandpass"); blip(140.0, 0.05, 0.12, "square") }
    fun denied() = blip(180.0, 0.14, 0.14, "sawtooth")
    fun crash(v: Double) { noiseBurst(0.35 + min(0.5, v * 0.03), min(0.9, 0.25 + v * 0.05), 700.0); blip(70.0, 0.25, min(0.5, 0.15 + v * 0.03), "triangle") }
    fun light() = blip(520.0, 0.16, 0.2, "square")
    fun go() = blip(1040.0, 0.5, 0.24, "square")
    fun good() { blip(880.0, 0.1, 0.16); blip(1320.0, 0.18, 0.16, delayS = 0.09) }
    fun best() { blip(880.0, 0.09, 0.16); blip(1175.0, 0.09, 0.16, delayS = 0.08); blip(1568.0, 0.25, 0.18, delayS = 0.16) }
    fun bad() = blip(300.0, 0.2, 0.14, "triangle")
    fun click() = blip(660.0, 0.05, 0.1, "triangle")
}
