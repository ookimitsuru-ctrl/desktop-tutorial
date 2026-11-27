package jp.okracing.game

import jp.okracing.core.*
import kotlin.math.*

// 入力 (Web 版 src/input.js の移植): プレイヤーが操作するのは アクセル・ブレーキ・シフト だけ。ステアリングは自動。
//  ・左下: 1本の横スライドパッド (標準は 右=アクセル / 左=ブレーキ)
//  ・右下: パドルシフト。左が DOWN、右が UP

const val PEDAL_DEAD = 0.05
const val PEDAL_EDGE = 0.04

class Rc(var x: Double, var y: Double, var w: Double, var h: Double) {
    fun has(px: Double, py: Double, pad: Double = 0.0) = px >= x - pad && px <= x + w + pad && py >= y - pad && py <= y + h + pad
}
class Safe(val l: Double = 0.0, val r: Double = 0.0, val t: Double = 0.0, val b: Double = 0.0)

class Layout(val w: Double, val h: Double, val safe: Safe) {
    val m = max(8.0, jsRound(h * 0.022).toDouble())
    val ml = m + safe.l; val mr = m + safe.r; val mb = m + safe.b; val mt = m + safe.t
    val padW = clamp(w * 0.40, 230.0, 430.0) * 0.9; val padH = clamp(h * 0.21, 62.0, 96.0)
    val padY = h - mb - padH
    val pedal = Rc(0.0, padY, padW, padH)
    val gap = max(8.0, w * 0.012)
    val pw = clamp(w * 0.145, 92.0, 160.0); val ph = clamp(h * 0.3, 84.0, 132.0)
    val shiftUp = Rc(w - mr - pw, h - mb - ph, pw, ph)
    val shiftDown = Rc(w - mr - pw * 2 - gap, h - mb - ph, pw, ph)
    val bs = clamp(h * 0.105, 34.0, 46.0)
    val pedalZone = Rc(0.0, padY - padH * 0.45, pedal.x + padW + 16, h - padY + padH * 0.45)
    val pause = Rc(ml, mt, bs, bs)
    val pit = Rc(ml + bs + 8, mt, bs * 1.7, bs)
    val reset = Rc(ml + bs * 2.7 + 16, mt, bs * 1.5, bs)
    val retry = Rc(ml + bs + 8, mt, bs * 1.7, bs)
    val tyreBtns = List(4) { k -> Rc(ml + k * (bs + 6), mt + bs + 8, bs, bs) }
    val trRow: List<Rc>
    val centre = Rc(pedal.x + padW + 10, 0.0, shiftDown.x - (pedal.x + padW) - 20, 0.0)
    init { val tw = clamp(w * 0.105, 74.0, 104.0); trRow = List(3) { k -> Rc(ml + k * (tw + 6), mt + bs + 8, tw, bs * 0.82) } }
}

class Input {
    var layout: Layout? = null
    var accelRight = true; var holdOnRelease = false
    var throttle = 0.0; var brake = 0.0
    var pedal = 0.0                       // -1 (アクセル全開) 〜 0 〜 +1 (フルブレーキ)。表示用
    private class Ptr(val role: String, var x: Double, var y: Double)
    private val pointers = HashMap<Int, Ptr>()
    var onShift: ((Int) -> Unit)? = null
    var onButton: ((String) -> Unit)? = null
    var enabled = true; var showPit = false; var showTyres = false; var showReset = true; var showRetry = false; var showTrain = false
    var flashUp = 0.0; var flashDown = 0.0
    var pedalPtr = false
    // ハードウェアキー / ゲームパッド
    var kUp = false; var kDn = false; private var kThr = 0.0; private var kBrk = 0.0
    var padThr = 0.0; var padBrk = 0.0

    fun down(id: Int, x: Double, y: Double) {
        val L = layout ?: return
        if (!enabled) return
        if (L.pause.has(x, y, 8.0)) { onButton?.invoke("pause"); return }
        if (showPit && L.pit.has(x, y, 4.0)) { onButton?.invoke("pit"); return }
        if (showReset && L.reset.has(x, y, 4.0)) { onButton?.invoke("reset"); return }
        if (showRetry && L.retry.has(x, y, 4.0)) { onButton?.invoke("retry"); return }
        if (showTrain) for (k in 0 until 3) if (L.trRow[k].has(x, y, 3.0)) { onButton?.invoke("tr$k"); return }
        if (showTyres) for (k in 0 until 4) if (L.tyreBtns[k].has(x, y, 3.0)) { onButton?.invoke("tyre$k"); return }
        val role = if (L.shiftUp.has(x, y, 6.0)) { flashUp = 0.18; onShift?.invoke(1); "up" }
        else if (L.shiftDown.has(x, y, 6.0)) { flashDown = 0.18; onShift?.invoke(-1); "down" }
        else if (L.pedalZone.has(x, y)) "pedal" else return
        if (role == "pedal") pointers.entries.removeAll { it.value.role == "pedal" }
        pointers[id] = Ptr(role, x, y)
    }
    fun move(id: Int, x: Double, y: Double) { pointers[id]?.let { it.x = x; it.y = y } }
    fun up(id: Int) { pointers.remove(id) }
    fun cancelAll() { pointers.clear() }
    fun reset() { pointers.clear(); throttle = 0.0; brake = 0.0; pedal = 0.0; kThr = 0.0; kBrk = 0.0; kUp = false; kDn = false }
    fun shiftKey(dir: Int) { if (!enabled) return; if (dir > 0) flashUp = 0.18 else flashDown = 0.18; onShift?.invoke(dir) }

    private fun pedalFromX(x: Double): Double {
        val r = layout!!.pedal
        val t = (x - r.x) / r.w - 0.5
        val a = abs(t); val span = 0.5 - PEDAL_DEAD - PEDAL_EDGE
        val v = sat((a - PEDAL_DEAD) / span)
        return if (t < 0) -v else v
    }

    fun update(dt: Double) {
        flashUp = max(0.0, flashUp - dt); flashDown = max(0.0, flashDown - dt)
        layout ?: return
        val pp = pointers.values.lastOrNull { it.role == "pedal" }
        if (pp != null) pedal = pedalFromX(pp.x) * (if (accelRight) -1 else 1)
        else if (!holdOnRelease) pedal = 0.0
        var thr = if (pedal < 0) -pedal else 0.0; var brk = if (pedal > 0) pedal else 0.0
        kThr = clamp(kThr + (if (kUp) dt * 4.5 else -dt * 7), 0.0, 1.0)
        kBrk = clamp(kBrk + (if (kDn) dt * 5 else -dt * 8), 0.0, 1.0)
        thr = max(thr, max(kThr, padThr)); brk = max(brk, max(kBrk, padBrk))
        throttle = thr; brake = brk
        if (pp == null) pedal = if (brk > 0) brk else -thr
        pedalPtr = pp != null
    }
}
