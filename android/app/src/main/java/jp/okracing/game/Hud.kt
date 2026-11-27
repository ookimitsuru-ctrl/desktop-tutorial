package jp.okracing.game

import jp.okracing.core.*
import kotlin.math.*

// HUD 描画 (Web 版 src/hud.js の移植。画面座標 = dp)

private const val FONT = "Roboto Condensed"
private val TYRE_IDS = listOf("soft", "medium", "hard", "rain")
val MODE_NAME = mapOf("free" to "フリー走行", "ta" to "タイムアタック", "quali" to "予選", "race" to "決勝", "train" to "トレーニング")

fun rr(ctx: Ctx2D, x: Double, y: Double, w: Double, h: Double, r: Double) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r) }
fun panel(ctx: Ctx2D, x: Double, y: Double, w: Double, h: Double, r: Double = 8.0, a: Double = 0.55) { rr(ctx, x, y, w, h, r); ctx.fillStyle = Ctx2D.rgba(8, 12, 22, a); ctx.fill() }
fun text(ctx: Ctx2D, s: String, x: Double, y: Double, size: Double, col: Any = "#fff", align: String = "left", weight: String = "700", italic: Boolean = false) {
    ctx.font = "${if (italic) "italic " else ""}$weight ${size}px $FONT"; ctx.textAlign = align; ctx.fillStyle = col; ctx.fillText(s, x, y)
}
private fun tempColor(ty: Tyre, t: Double): String {
    val d = t - ty.opt
    return if (d < -35) "#4aa3ff" else if (d < -18) "#6fd0e8" else if (d < 14) "#4be07a" else if (d < 30) "#f2c230" else "#ff5040"
}
private fun f1(v: Double) = String.format(java.util.Locale.US, "%.1f", v)
private fun f2(v: Double) = String.format(java.util.Locale.US, "%.2f", v)

class Flash(val time: Double, val col: String, val t0: Double)

class Hud {
    private class Msg(val text: String, val color: String, var t: Double, val dur: Double, val big: Boolean)
    private val msgs = ArrayList<Msg>()
    var secFlash = arrayOfNulls<Flash>(3); var lapFlash: Flash? = null
    var t = 0.0; private var cornerName = ""; private var cornerT = 0.0; private var lastSection: String? = null
    private var posRight = 0.0; private var narrow = false; private var timingBottom = 0.0
    private var mapBottom = 0.0; private var mapX = 0.0; private var mapW = 0.0

    fun message(s: String, color: String = "#fff", dur: Double = 2.4, big: Boolean = false) { msgs.add(Msg(s, color, 0.0, dur, big)); if (msgs.size > 3) msgs.removeAt(0) }
    fun reset() { msgs.clear(); secFlash = arrayOfNulls(3); lapFlash = null; cornerName = ""; lastSection = null }

    fun draw(ctx: Ctx2D, L: Layout, S: Session, input: Input, cfg: Settings, R: Renderer, dt: Double) {
        t += dt
        val w = L.w; val h = L.h; val pl = S.player; val c = pl.car
        ctx.textBaseline = "alphabetic"; ctx.lineJoin = "round"
        val u = clamp(min(h / 400, w / 800), 0.82, 1.5)

        drawPedal(ctx, L.pedal, input, cfg, c, u)
        drawPaddle(ctx, L.shiftUp, "▲", "UP", input.flashUp, false, u)
        drawPaddle(ctx, L.shiftDown, "▼", "DOWN", input.flashDown, c.shiftDenied > 0, u)
        drawCluster(ctx, L, c, u)

        drawButton(ctx, L.pause, "II", false, u)
        var lx = L.pause.x + L.pause.w + 8
        if (input.showPit) {
            val on = pl.pitRequest || pl.pit != null
            rr(ctx, L.pit.x, L.pit.y, L.pit.w, L.pit.h, 8.0); ctx.fillStyle = if (on) "rgba(255,170,30,0.92)" else "rgba(8,12,22,0.6)"; ctx.fill()
            ctx.strokeStyle = if (on) "#fff" else "rgba(255,255,255,0.35)"; ctx.lineWidth = 1.5; ctx.stroke()
            ctx.textBaseline = "middle"
            text(ctx, "PIT", L.pit.x + L.pit.w * 0.36, L.pit.y + L.pit.h / 2 + 1, 15 * u, if (on) "#111" else "#fff", "center", "800")
            val nt = TYRES[pl.nextTyre]!!
            ctx.beginPath(); ctx.arc(L.pit.x + L.pit.w * 0.76, L.pit.y + L.pit.h / 2, L.pit.h * 0.3, 0.0, 6.3); ctx.fillStyle = "#111"; ctx.fill(); ctx.strokeStyle = nt.color; ctx.lineWidth = 3.0; ctx.stroke()
            text(ctx, nt.short, L.pit.x + L.pit.w * 0.76, L.pit.y + L.pit.h / 2 + 1, 12 * u, "#fff", "center", "800")
            ctx.textBaseline = "alphabetic"
            lx = L.pit.x + L.pit.w + 8
            if (input.showTyres) {
                L.tyreBtns.forEachIndexed { k, b ->
                    val ty = TYRES[TYRE_IDS[k]]!!; val sel = pl.nextTyre == ty.id
                    rr(ctx, b.x, b.y, b.w, b.h, 8.0); ctx.fillStyle = if (sel) "rgba(255,255,255,0.92)" else "rgba(8,12,22,0.7)"; ctx.fill()
                    ctx.beginPath(); ctx.arc(b.x + b.w / 2, b.y + b.h / 2, b.h * 0.33, 0.0, 6.3); ctx.fillStyle = "#111"; ctx.fill(); ctx.strokeStyle = ty.color; ctx.lineWidth = 3.5; ctx.stroke()
                    ctx.textBaseline = "middle"; text(ctx, ty.short, b.x + b.w / 2, b.y + b.h / 2 + 1, 13 * u, "#fff", "center", "800"); ctx.textBaseline = "alphabetic"
                }
                text(ctx, "次に履くタイヤ", L.tyreBtns[3].x + L.tyreBtns[3].w + 8, L.tyreBtns[0].y + L.tyreBtns[0].h * 0.62, 11 * u, "rgba(255,255,255,0.85)", "left", "600")
            }
        }
        if (input.showReset) { drawButton(ctx, L.reset, "復帰", false, u, 12.0); lx = L.reset.x + L.reset.w + 8 }
        if (input.showRetry) {
            val tr = S.trainer
            rr(ctx, L.retry.x, L.retry.y, L.retry.w, L.retry.h, 8.0); ctx.fillStyle = "rgba(244,122,31,0.92)"; ctx.fill()
            ctx.strokeStyle = "rgba(255,255,255,0.6)"; ctx.lineWidth = 1.5; ctx.stroke()
            ctx.textBaseline = "middle"; text(ctx, "↻ やり直し", L.retry.x + L.retry.w / 2, L.retry.y + L.retry.h / 2 + 1, 12.5 * u, "#fff", "center", "800"); ctx.textBaseline = "alphabetic"
            lx = L.retry.x + L.retry.w + 8
            if (input.showTrain && tr != null) {
                val items = listOf("自動リピート" to cfg.trainAuto, "ガイド" to cfg.trainGuide, "ゴースト" to cfg.ghost)
                items.forEachIndexed { k, (label, on) ->
                    val b = L.trRow[k]
                    rr(ctx, b.x, b.y, b.w, b.h, 8.0); ctx.fillStyle = if (on) "rgba(60,190,120,0.85)" else "rgba(8,12,22,0.6)"; ctx.fill()
                    ctx.strokeStyle = if (on) "rgba(255,255,255,0.7)" else "rgba(255,255,255,0.3)"; ctx.lineWidth = 1.5; ctx.stroke()
                    ctx.textBaseline = "middle"; text(ctx, label, b.x + b.w / 2, b.y + b.h * 0.36, 11 * u, "#fff", "center", "800"); text(ctx, if (on) "ON" else "OFF", b.x + b.w / 2, b.y + b.h * 0.74, 9.5 * u, if (on) "#fff" else "rgba(255,255,255,0.55)", "center", "800"); ctx.textBaseline = "alphabetic"
                }
            }
        }
        // 順位 / 周回
        run {
            val bx = lx + 2; val by = L.pause.y; val bh = L.pause.h
            val s1: String; val s2: String
            if (S.mode == "race") { s1 = "P${pl.pos}"; s2 = "/${S.entries.size}" } else { s1 = MODE_NAME[S.mode] ?: ""; s2 = "" }
            ctx.font = "italic 800 ${22 * u}px $FONT"; val w1 = ctx.measureText(s1)
            ctx.font = "700 ${12 * u}px $FONT"; val w2 = ctx.measureText(s2)
            val lapStr = if (S.mode == "train") "${S.trainer!!.sec.short}  ${S.trainer!!.runs}回目" else if (S.mode == "race") "LAP ${min(max(pl.lap, 1), S.laps)}/${S.laps}" else if (S.mode == "quali") "LAP ${max(0, min(pl.lap, S.laps))}/${S.laps}" else "LAP ${max(0, pl.lap)}"
            ctx.font = "700 ${13 * u}px $FONT"; val w3 = ctx.measureText(lapStr)
            val pw = w1 + w2 + w3 + 34
            panel(ctx, bx, by, pw, bh, 8.0); posRight = bx + pw
            ctx.textBaseline = "middle"
            text(ctx, s1, bx + 10, by + bh / 2 + 1, (if (S.mode == "race") 22.0 else 14.0) * u, if (S.mode == "race") "#ffb347" else "#fff", "left", "800", true)
            ctx.font = "italic 800 ${(if (S.mode == "race") 22.0 else 14.0) * u}px $FONT"; val ww = ctx.measureText(s1)
            text(ctx, s2, bx + 12 + ww, by + bh / 2 + 4, 12 * u, "rgba(255,255,255,0.7)")
            text(ctx, lapStr, bx + pw - 10, by + bh / 2 + 1, 13 * u, "#fff", "right")
            ctx.textBaseline = "alphabetic"
        }
        if (S.mode == "train" && S.trainer != null) drawTrainer(ctx, L, S, cfg, u)
        drawTiming(ctx, L, S, pl, u)
        drawMinimap(ctx, L, S, R)
        drawInfo(ctx, S, c, u)
        if (S.mode == "race" && cfg.showBoard) drawBoard(ctx, L, S, pl, u)

        // コーナー名
        val sec = S.T.sectionAt(c.s)
        if (sec != null && sec.name != lastSection) { lastSection = sec.name; cornerName = sec.name; cornerT = 2.6 }
        if (sec == null) lastSection = null
        if (cornerT > 0 && S.state == "green") {
            cornerT -= dt; val a = sat(cornerT / 0.5) * sat((2.6 - cornerT) / 0.25)
            ctx.globalAlpha = a * 0.95
            val cy = h * 0.115 + 62 * u + 44 * u
            ctx.font = "italic 800 ${17 * u}px $FONT"; val tw = ctx.measureText(cornerName)
            rr(ctx, w / 2 - tw / 2 - 14, cy - 15 * u, tw + 28, 24 * u, 12 * u); ctx.fillStyle = "rgba(8,12,22,0.55)"; ctx.fill()
            text(ctx, cornerName, w / 2, cy + 3 * u, 17 * u, "#fff", "center", "800", true)
            ctx.globalAlpha = 1.0
        }
        // 次のブレーキングポイント
        val cat = R.assist
        if (cat != null && S.state == "green" && pl.pit == null && R.lineAssistOn) {
            val N = S.T.N; val ds = S.T.ds
            var dist = -1.0; val inBrake = cat[c.i].toInt() == 2
            if (!inBrake) for (q in 1 until 260) if (cat[(c.i + q) % N].toInt() == 2) { dist = q * ds; break }
            if (inBrake || (dist > 0 && dist < 60 + c.speed * 4.2)) {
                var nm = ""; val s2 = S.T.wrapS(c.s + max(0.0, dist) + 90); val sc2 = S.T.sectionAt(s2); if (sc2 != null && sc2.no != 0) nm = sc2.name
                val bw = 150 * u; val bx = w / 2 - bw / 2; val by = h * 0.115 + 62 * u
                panel(ctx, bx, by, bw, 22 * u, 6.0, 0.6)
                if (inBrake) { rr(ctx, bx, by, bw, 22 * u, 6.0); ctx.fillStyle = "rgba(255,60,45,0.85)"; ctx.fill(); text(ctx, "BRAKE  $nm", w / 2, by + 15.5 * u, 12 * u, "#fff", "center", "800", true) }
                else {
                    val f = sat(1 - dist / (60 + c.speed * 4.2))
                    rr(ctx, bx, by, max(8.0, bw * f), 22 * u, 6.0); ctx.fillStyle = if (f > 0.7) "rgba(255,150,40,0.8)" else "rgba(255,210,60,0.55)"; ctx.fill()
                    text(ctx, "${jsRound(dist / 10) * 10}m  $nm", w / 2, by + 15.5 * u, 12 * u, "#fff", "center", "800", true)
                }
            }
        }
        // スタートシグナル / カウントダウン
        if (S.state == "lights" || (S.lightsOut && S.state == "green" && S.stateT < 1.6) || S.state == "grid") {
            val n = if (S.state == "lights") S.lights else 0; val r = 15 * u; val gap = 10 * u; val tw = 5 * r * 2 + 4 * gap
            val x0 = w / 2 - tw / 2; val y0 = h * 0.33
            panel(ctx, x0 - 14, y0 - r - 12, tw + 28, r * 2 + 24, 14.0, 0.82)
            for (k in 0 until 5) {
                val go = S.lightsOut && S.state == "green"
                ctx.beginPath(); ctx.arc(x0 + r + k * (2 * r + gap), y0, r, 0.0, 6.3)
                ctx.fillStyle = if (go) "#27f06a" else if (k < n) "#ff2516" else "#2a0b08"; ctx.fill()
                if (k < n || go) { ctx.shadowColor = if (go) "#27f06a" else "#ff2516"; ctx.shadowBlur = 18.0; ctx.fill(); ctx.shadowBlur = 0.0 }
            }
            if (S.state == "grid") text(ctx, "グリッドにつけ", w / 2, y0 + r + 34 * u, 15 * u, "#fff", "center")
        }
        if (S.state == "countdown" && S.mode == "train") {
            val f = sat(S.stateT / S.cdDur)
            text(ctx, "READY", w / 2, h * 0.43, 54 * u, "#fff", "center", "800", true)
            rr(ctx, w / 2 - 90 * u, h * 0.43 + 16 * u, 180 * u, 6.0, 3.0); ctx.fillStyle = "rgba(255,255,255,0.2)"; ctx.fill()
            rr(ctx, w / 2 - 90 * u, h * 0.43 + 16 * u, max(6.0, 180 * u * f), 6.0, 3.0); ctx.fillStyle = "#ffb347"; ctx.fill()
            text(ctx, "お手本と同じ速度から始まります", w / 2, h * 0.43 + 44 * u, 13 * u, "rgba(255,255,255,0.85)", "center", "600")
        } else if (S.state == "countdown") {
            val n = max(1, 3 - floor(S.stateT).toInt())
            val f = S.stateT % 1
            ctx.globalAlpha = 1 - f * 0.6
            text(ctx, n.toString(), w / 2, h * 0.42, (70 + 30 * (1 - f)) * u, "#fff", "center", "800", true)
            ctx.globalAlpha = 1.0
            text(ctx, "ローリングスタート — コントロールライン通過で計測開始", w / 2, h * 0.5, 13 * u, "rgba(255,255,255,0.85)", "center", "600")
        }
        // 警告表示
        var warn: String? = null; var wcol = "#ff5040"
        val pit = pl.pit
        if (pit != null) { warn = if (pit.state == "service") "ピット作業中  ${f1(max(0.0, pit.timer))}s" else if (pit.state == "in") "ピットイン (自動走行)" else "ピットアウト (自動走行)"; wcol = "#ffb347" }
        else if (abs(c.relH) > 2.0 && c.speed > 3 && S.state == "green") warn = "逆走しています"
        else if (c.retired) warn = "マシン破損 — リタイア"
        else if (c.fuel <= 0) warn = "燃料切れ"
        else if (pl.pitRequest) { warn = "ピットイン予約中 — ${if (S.T.pit.side > 0) "右" else "左"}側のピットレーンへ" + (if (c.speed > 75) " (270km/h以下に減速)" else ""); wcol = "#ffb347" }
        else if (!pl.lapValid && S.mode != "race" && S.mode != "train" && pl.lap >= 1) { warn = "このラップは無効 (コースアウト)"; wcol = "#ffd23a" }
        else if (S.mode == "race" && S.leaderFinished && !pl.finished) { warn = "ファイナルラップ"; wcol = "#fff" }
        if (warn != null) {
            val y = h * 0.2
            ctx.font = "800 ${14 * u}px $FONT"; val tw = ctx.measureText(warn)
            rr(ctx, w / 2 - tw / 2 - 14, y - 16 * u, tw + 28, 24 * u, 6.0); ctx.fillStyle = "rgba(8,12,22,0.72)"; ctx.fill()
            text(ctx, warn, w / 2, y + 1 * u, 14 * u, wcol, "center", "800")
        }
        // メッセージ
        var my = h * 0.38
        var i = msgs.size - 1
        while (i >= 0) {
            val m = msgs[i]; m.t += dt
            if (m.t > m.dur) { msgs.removeAt(i); i--; continue }
            val a = sat(m.t / 0.15) * sat((m.dur - m.t) / 0.4)
            ctx.globalAlpha = a
            val sz = (if (m.big) 34.0 else 20.0) * u
            ctx.font = "italic 800 ${sz}px $FONT"; val tw = ctx.measureText(m.text)
            rr(ctx, w / 2 - tw / 2 - 18, my - sz * 0.95, tw + 36, sz * 1.4, 8.0); ctx.fillStyle = "rgba(8,12,22,0.7)"; ctx.fill()
            text(ctx, m.text, w / 2, my, sz, m.color, "center", "800", true)
            ctx.globalAlpha = 1.0; my += sz * 1.6
            i--
        }
    }

    private fun drawButton(ctx: Ctx2D, r: Rc, label: String, on: Boolean, u: Double, size: Double = 15.0) {
        rr(ctx, r.x, r.y, r.w, r.h, 8.0); ctx.fillStyle = if (on) "rgba(255,170,30,0.9)" else "rgba(8,12,22,0.6)"; ctx.fill()
        ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = 1.5; ctx.stroke()
        ctx.textBaseline = "middle"; text(ctx, label, r.x + r.w / 2, r.y + r.h / 2 + 1, size * u, "#fff", "center", "800"); ctx.textBaseline = "alphabetic"
    }

    private fun drawPedal(ctx: Ctx2D, r: Rc, input: Input, cfg: Settings, c: Car, u: Double) {
        val swap = cfg.pedalAccelRight
        val thr = input.throttle; val brk = input.brake
        val GREEN = "#35d07f"; val RED = "#ff4a3d"
        val mid = r.x + r.w / 2; val dead = r.w * PEDAL_DEAD; val edge = r.w * PEDAL_EDGE; val span = r.w / 2 - dead - edge
        rr(ctx, r.x, r.y, r.w, r.h, 14.0); ctx.fillStyle = "rgba(8,12,22,0.55)"; ctx.fill()
        ctx.strokeStyle = "rgba(255,255,255,0.28)"; ctx.lineWidth = 1.5; ctx.stroke()
        ctx.save(); rr(ctx, r.x + 3, r.y + 3, r.w - 6, r.h - 6, 11.0); ctx.clip()
        fun half(side: Int, v: Double, col: String) {
            val g = ctx.createLinearGradient(mid, 0.0, mid + side * r.w / 2, 0.0)
            g.addColorStop(0.0, col + "30"); g.addColorStop(1.0, col)
            ctx.fillStyle = g; ctx.globalAlpha = 0.14; ctx.fillRect(if (side < 0) r.x else mid, r.y, r.w / 2, r.h)
            if (v > 0.001) { val fw = dead + span * v + (if (v >= 0.999) edge else 0.0); ctx.globalAlpha = 0.35 + 0.55 * v; ctx.fillRect(if (side < 0) mid - fw else mid, r.y, fw, r.h) }
            ctx.globalAlpha = 1.0
            ctx.strokeStyle = "rgba(255,255,255,0.3)"; ctx.lineWidth = 1.0
            for (k in 1..4) { val x = mid + side * (dead + span * k / 4); val hh = if (k % 2 == 0) r.h * 0.28 else r.h * 0.16; ctx.beginPath(); ctx.moveTo(x, r.y + r.h - 4); ctx.lineTo(x, r.y + r.h - 4 - hh); ctx.stroke() }
        }
        half(if (swap) 1 else -1, thr, GREEN); half(if (swap) -1 else 1, brk, RED)
        ctx.fillStyle = "rgba(255,255,255,0.10)"; ctx.fillRect(mid - dead, r.y, dead * 2, r.h)
        ctx.fillStyle = "rgba(255,255,255,0.55)"; ctx.fillRect(mid - 0.75, r.y, 1.5, r.h)
        ctx.restore()
        val pv = input.pedal * (if (swap) -1 else 1)
        val kx = mid + (if (pv == 0.0) 0.0 else sign(pv) * (dead + span * abs(pv)))
        if (input.pedalPtr || pv != 0.0) { rr(ctx, kx - 5, r.y + 5, 10.0, r.h - 10, 5.0); ctx.fillStyle = "#fff"; ctx.globalAlpha = if (input.pedalPtr) 0.95 else 0.6; ctx.fill(); ctx.globalAlpha = 1.0 }
        fun lab(side: Int, name: String, v: Double) {
            val x = if (side < 0) r.x + 12 else r.x + r.w - 12; val al = if (side < 0) "left" else "right"
            text(ctx, if (side < 0) "◀ $name" else "$name ▶", x, r.y + 17 * u, 11 * u, "rgba(255,255,255,0.8)", al, "800", true)
            text(ctx, "${jsRound(v * 100)}", x, r.y + 42 * u, 22 * u, if (v > 0.001) "#fff" else "rgba(255,255,255,0.35)", al, "800", true)
        }
        lab(if (swap) 1 else -1, "ACCEL", thr); lab(if (swap) -1 else 1, "BRAKE", brk)
        val alert = if (c.lockedF && c.speed > 4) "LOCK" else if (c.kR > 0.3 && c.speed > 2) "SPIN" else null
        if (alert != null && floor(t * 8).toInt() % 2 == 0) {
            rr(ctx, mid - 30 * u, r.y - 22 * u, 60 * u, 18 * u, 4.0); ctx.fillStyle = if (alert == "LOCK") RED else "#ffb020"; ctx.fill()
            text(ctx, alert, mid, r.y - 8.5 * u, 12 * u, "#111", "center", "800")
        }
    }
    private fun drawPaddle(ctx: Ctx2D, r: Rc, sym: String, label: String, flash: Double, denied: Boolean, u: Double) {
        rr(ctx, r.x, r.y, r.w, r.h, 14.0)
        ctx.fillStyle = if (denied) "rgba(255,60,40,0.75)" else if (flash > 0) "rgba(255,255,255,0.85)" else "rgba(8,12,22,0.5)"; ctx.fill()
        ctx.strokeStyle = "rgba(255,255,255,0.32)"; ctx.lineWidth = 1.5; ctx.stroke()
        val col = if (flash > 0 && !denied) "#111" else "#fff"
        ctx.textBaseline = "middle"
        text(ctx, sym, r.x + r.w / 2, r.y + r.h * 0.42, 22 * u, col, "center", "800")
        text(ctx, label, r.x + r.w / 2, r.y + r.h * 0.78, 11 * u, col, "center", "800", true)
        ctx.textBaseline = "alphabetic"
    }

    private fun drawCluster(ctx: Ctx2D, L: Layout, c: Car, u: Double) {
        val cw = clamp(L.centre.w, 150.0, 250.0); val cx = L.centre.x + L.centre.w / 2; val x0 = cx - cw / 2
        val ch = clamp(L.h * 0.15, 52.0, 66.0); val y0 = L.h - L.m - L.safe.b - ch
        panel(ctx, x0, y0, cw, ch, 12.0, 0.6)
        val n = 14; val lw2 = (cw - 20 - (n - 1) * 3) / n; val rpm = c.rpm
        val lo = 6500.0; val hi = 13300.0
        val lit = jsRound(sat((rpm - lo) / (hi - lo)) * n)
        val flashAll = rpm > 13150 && floor(t * 12).toInt() % 2 == 0
        for (k in 0 until n) {
            val on = k < lit
            val col = if (k < 6) "#35d07f" else if (k < 10) "#f2c230" else "#ff4030"
            rr(ctx, x0 + 10 + k * (lw2 + 3), y0 + 6, lw2, 8 * u, 2.0)
            ctx.fillStyle = if (flashAll) "#58a8ff" else if (on) col else "rgba(255,255,255,0.12)"; ctx.fill()
        }
        val by = y0 + ch - 9
        val gtxt = if (c.gear == 0) "R" else (if (c.shiftT > 0) (if (c.nextGear == 0) "R" else c.nextGear.toString()) else c.gear.toString())
        text(ctx, gtxt, cx, by + 2, 36 * u, if (c.limiter) "#ff5040" else "#fff", "center", "800", true)
        val kmh = jsRound(abs(c.speed) * 3.6)
        text(ctx, kmh.toString(), x0 + cw * 0.3, by, 25 * u, "#fff", "right", "800", true)
        text(ctx, "km/h", x0 + cw * 0.3 + 3, by, 8.5 * u, "rgba(255,255,255,0.65)", "left", "700")
        text(ctx, "${jsRound(rpm / 10) * 10}", x0 + cw - 30 * u, by, 13 * u, "rgba(255,255,255,0.9)", "right", "700")
        text(ctx, "rpm", x0 + cw - 27 * u, by, 8.5 * u, "rgba(255,255,255,0.6)", "left", "700")
    }

    private fun drawInfo(ctx: Ctx2D, S: Session, c: Car, u: Double) {
        val x0 = mapX - 4; val bw = mapW + 8; val y0 = mapBottom + 2
        val rh = 13 * u; val ph = rh * 4 + 16 * u
        panel(ctx, x0, y0, bw, ph, 8.0, 0.5)
        val ty = c.tyre; val lx = x0 + 8; val rxe = x0 + bw - 8
        val br = 9 * u; val bcx = lx + br; val bcy = y0 + 5 + rh
        ctx.beginPath(); ctx.arc(bcx, bcy, br, 0.0, 6.3); ctx.fillStyle = "#111"; ctx.fill(); ctx.strokeStyle = ty.color; ctx.lineWidth = 3.0; ctx.stroke()
        ctx.textBaseline = "middle"; text(ctx, ty.short, bcx, bcy + 0.5, 10 * u, "#fff", "center", "800"); ctx.textBaseline = "alphabetic"
        val tx = lx + br * 2 + 7
        fun bar(label: String, frac: Double, col: String, v: String, warn: Boolean, y: Double) {
            text(ctx, label, tx, y + 8.5 * u, 9 * u, "rgba(255,255,255,0.7)", "left", "700")
            val bx = tx + 12 * u; val ww = rxe - 30 * u - bx
            rr(ctx, bx, y, ww, 9 * u, 2.0); ctx.fillStyle = "rgba(255,255,255,0.14)"; ctx.fill()
            rr(ctx, bx, y, max(2.0, ww * frac), 9 * u, 2.0); ctx.fillStyle = col; ctx.fill()
            text(ctx, v, rxe, y + 8.5 * u, 10 * u, if (warn) "#ff5040" else "#fff", "right", "700")
        }
        var y = y0 + 6
        bar("F", 1 - c.wearF, tempColor(ty, c.tempF), "${jsRound((1 - c.wearF) * 100)}", c.wearF > 0.72, y); y += rh
        bar("R", 1 - c.wearR, tempColor(ty, c.tempR), "${jsRound((1 - c.wearR) * 100)}", c.wearR > 0.72, y); y += rh
        val cap = if (S.mode == "race") S.laps * S.T.fuelPerLap * 1.04 + 4 else 40.0; val low = c.fuel < S.T.fuelPerLap * 1.2
        bar("燃", sat(c.fuel / cap), if (low) "#ff5040" else "#7fb6ff", "${f1(c.fuel / S.T.fuelPerLap)}周", low, y); y += rh
        val dmg = c.dmgF + c.dmgR + c.dmgS; val sy = y + 9.5 * u
        if (dmg > 0.03) {
            val parts = ArrayList<String>(); if (c.dmgF > 0.03) parts.add("前${jsRound(c.dmgF * 100)}"); if (c.dmgR > 0.03) parts.add("後${jsRound(c.dmgR * 100)}"); if (c.dmgS > 0.03) parts.add("足${jsRound(c.dmgS * 100)}")
            text(ctx, "破損 " + parts.joinToString(" "), lx, sy, 9.5 * u, "#ff7a5a", "left", "700")
        } else if (c.draft > 0.15) text(ctx, "スリップストリーム", lx, sy, 9.5 * u, "#7fd6ff", "left", "700")
        else {
            val wetTxt = if (S.wet < 0.05) "DRY" else if (S.wet < 0.45) "DAMP ${jsRound(S.wet * 100)}%" else "WET ${jsRound(S.wet * 100)}%"
            text(ctx, (if (S.rain > 0.1) "雨 " else "") + "路面 " + wetTxt, lx, sy, 9.5 * u, if (S.wet < 0.05) "rgba(255,255,255,0.7)" else "#7fd6ff", "left", "700")
        }
        if (c.assistTC || c.autoShift) text(ctx, (if (c.assistTC) "ASSIST " else "") + (if (c.autoShift) "AT" else ""), rxe, sy, 8.5 * u, "#ffd23a", "right", "700")
        run {
            val ww = bw - 16; val bx = x0 + 8; val yy = y0 + ph - 9 * u; val cx = bx + ww / 2
            rr(ctx, bx, yy, ww, 4.0, 2.0); ctx.fillStyle = "rgba(255,255,255,0.14)"; ctx.fill()
            ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.fillRect(cx - 0.5, yy - 2, 1.0, 8.0)
            val sx = cx + clamp(c.steerIn, -1.0, 1.0) * ww / 2
            ctx.fillStyle = "#ffb347"; ctx.fillRect(min(cx, sx), yy, abs(sx - cx), 4.0)
            rr(ctx, sx - 2.5, yy - 3, 5.0, 10.0, 2.0); ctx.fillStyle = "#fff"; ctx.fill()
        }
        mapBottom = y0 + ph + 2
    }

    private fun drawTrainer(ctx: Ctx2D, L: Layout, S: Session, cfg: Settings, u: Double) {
        val tr = S.trainer!!; val c = S.player.car; val w = L.w
        if (cfg.trainGuide && (S.state == "green" || S.state == "countdown")) {
            val tg = tr.target
            val px = L.m + L.safe.l; val py = L.trRow[0].y + L.trRow[0].h + 8; val pw = clamp(w * 0.255, 176.0, 236.0); val ph = 118 * u
            panel(ctx, px, py, pw, ph, 12.0, 0.7)
            ctx.strokeStyle = "rgba(244,122,31,0.8)"; ctx.lineWidth = 1.5; rr(ctx, px, py, pw, ph, 12.0); ctx.stroke()
            text(ctx, "お手本の目標", px + 10, py + 14 * u, 10 * u, "#ffc79a", "left", "800")
            val tk = jsRound(tg.speed * 3.6); val nk = jsRound(c.speed * 3.6); val dk = nk - tk
            text(ctx, tk.toString(), px + 10, py + 52 * u, 42 * u, "#fff", "left", "800", true)
            text(ctx, "km/h", px + 12, py + 66 * u, 10 * u, "rgba(255,255,255,0.7)", "left", "700")
            val gw = 56 * u; val gx = px + pw - gw - 10; val gy = py + 22 * u; val gh = 50 * u
            val ok = tg.gearState == "ok"
            rr(ctx, gx, gy, gw, gh, 10.0); ctx.fillStyle = if (ok) "rgba(53,208,127,0.9)" else "rgba(244,122,31,0.95)"; ctx.fill()
            text(ctx, tg.gear.toString(), gx + gw / 2, gy + 40 * u, 42 * u, "#fff", "center", "800", true)
            text(ctx, "最適ギヤ", gx + gw / 2, py + 14 * u, 9 * u, "#ffc79a", "center", "800")
            text(ctx, "${if (ok) "OK" else if (tg.gearState == "up") "▲ UP" else "▼ DOWN"}  今${c.gear}速", gx + gw, gy + gh + 13 * u, 11 * u, if (ok) "#7dffb0" else "#ffd23a", "right", "800")
            val ac = if (abs(dk) <= 6) "#7dffb0" else if (abs(dk) <= 20) "#ffd23a" else "#ff7a6a"
            text(ctx, "いま $nk", px + 10, py + 86 * u, 12 * u, "#fff", "left", "700")
            text(ctx, "${if (dk > 0) "+" else if (dk < 0) "−" else "±"}${abs(dk)}", px + 12 + 58 * u, py + 86 * u, 12 * u, ac, "left", "800")
            val chip: String; val ccol: String
            if (tg.brk > 0.1) { chip = "ブレーキ ${jsRound(tg.brk * 100)}%"; ccol = "rgba(255,74,61,0.9)" }
            else if (tg.thr > 0.92) { chip = "アクセル全開"; ccol = "rgba(53,208,127,0.9)" }
            else if (tg.thr > 0.15) { chip = "アクセル ${jsRound(tg.thr * 100)}%"; ccol = "rgba(53,160,127,0.9)" }
            else { chip = "リフト (離す)"; ccol = "rgba(120,130,150,0.9)" }
            rr(ctx, px + 8, py + 94 * u, pw - 16, 18 * u, 6.0); ctx.fillStyle = ccol; ctx.fill()
            text(ctx, chip, px + pw / 2, py + 107 * u, 11.5 * u, "#fff", "center", "800")
        }
        val cue = tr.cue
        if (cue != null && S.time - cue.at < cue.dur && S.state == "green") {
            val age = S.time - cue.at; val a = sat(age / 0.12) * sat((cue.dur - age) / 0.3)
            val col = if (cue.sev == "urgent") "#ff4a3d" else if (cue.sev == "warn") "#f4a21f" else if (cue.sev == "good") "#35d07f" else "#4aa3ff"
            val big = cue.sev == "urgent"
            ctx.globalAlpha = a
            val sz = (if (big) 22.0 else 15.0) * u
            ctx.font = "800 ${sz}px $FONT"; val tw = ctx.measureText(cue.text)
            val bw = tw + 58 * u; val bh = (if (big) 34.0 else 28.0) * u; val bx = w / 2 - bw / 2; val by = L.pause.y + 61 * u
            rr(ctx, bx, by, bw, bh, bh / 2); ctx.fillStyle = "rgba(8,12,22,0.82)"; ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 2.0; ctx.stroke()
            ctx.beginPath(); ctx.arc(bx + bh / 2, by + bh / 2, bh * 0.36, 0.0, 6.3); ctx.fillStyle = col; ctx.fill()
            ctx.textBaseline = "middle"; text(ctx, "T", bx + bh / 2, by + bh / 2 + 1, bh * 0.42, "#111", "center", "800"); ctx.textBaseline = "alphabetic"
            text(ctx, cue.text, bx + bh + 6 * u, by + bh / 2 + sz * 0.36, sz, "#fff", "left", "800")
            ctx.globalAlpha = 1.0
        }
    }

    private fun drawTiming(ctx: Ctx2D, L: Layout, S: Session, pl: Entry, u: Double) {
        val w = L.w; val y0 = L.pause.y
        val mapXX = L.w - L.m - L.safe.r - clamp(L.w * 0.2, 130.0, 210.0) - 4
        var pw = clamp(w * 0.3, 190.0, 290.0); val ph = 58 * u
        var xL = max(w / 2 - pw / 2, posRight + 8)
        narrow = mapXX - 8 - (posRight + 8) < 190
        if (narrow) { val right = w - L.m - L.safe.r; pw = clamp(right - (posRight + 8), 150.0, pw); xL = right - pw; timingBottom = y0 + ph }
        else if (xL + pw > mapXX - 8) pw = max(170.0, mapXX - 8 - xL)
        val cx = xL + pw / 2
        panel(ctx, cx - pw / 2, y0, pw, ph, 10.0, 0.58)
        val tr = S.trainer
        if (S.mode == "train" && tr != null) {
            val x0 = cx - pw / 2
            val running = S.state == "green" && !tr.done
            val tNow = if (running) tr.runT else (tr.lastRunTime ?: 0.0)
            text(ctx, if (running || tr.lastRunTime != null) fmtTime(tNow) else "-:--.---", x0 + 12, y0 + 25 * u, 23 * u, "#fff", "left", "800", true)
            if (running && tr.runT > 0.5) {
                val d = tr.target.delta; val col = if (d <= 0) "#3fe07f" else "#ff5a4a"
                text(ctx, (if (d >= 0) "+" else "−") + f2(abs(d)), x0 + pw - 12, y0 + 24 * u, 19 * u, col, "right", "800", true)
                text(ctx, "vs お手本", x0 + pw - 12, y0 + 37 * u, 9 * u, "rgba(255,255,255,0.65)", "right", "700")
            }
            val rep = tr.lastReport
            text(ctx, if (rep != null && !rep.aborted) "前回 ${if (rep.delta >= 0) "+" else "−"}${f2(abs(rep.delta))}s ${"★".repeat(rep.stars)}" else "前回 --", x0 + 12, y0 + 42 * u, 10.5 * u, "rgba(255,255,255,0.85)", "left", "700")
            val prog = sat(tr.runDist / tr.prep.len)
            rr(ctx, x0 + 12, y0 + 48 * u, pw - 24, 5 * u, 2.5); ctx.fillStyle = "rgba(255,255,255,0.15)"; ctx.fill()
            rr(ctx, x0 + 12, y0 + 48 * u, max(5.0, (pw - 24) * prog), 5 * u, 2.5); ctx.fillStyle = "#ffb347"; ctx.fill()
            return
        }
        val now = if (S.mode == "race") S.raceTime else S.time
        val running = pl.lap >= 1 && S.state == "green" && !pl.finished
        var cur: Double? = if (running) now - pl.lapStart else null
        val lf = lapFlash
        val flashing = lf != null && t - lf.t0 < 3.2
        if (flashing) cur = lf!!.time
        val flashCol = if (flashing) lf!!.col else "#fff"
        text(ctx, if (cur == null) "-:--.---" else fmtTime(cur), cx - pw / 2 + 12, y0 + 25 * u, 23 * u, flashCol, "left", "800", true)
        val dl = S.delta
        if (dl != null && running && !flashing) {
            val col = if (dl <= 0) "#3fe07f" else "#ff5a4a"
            text(ctx, (if (dl >= 0) "+" else "−") + f2(abs(dl)), cx + pw / 2 - 12, y0 + 24 * u, 17 * u, col, "right", "800", true)
        } else if (S.mode == "race") { val rt = fmtTime(S.raceTime); text(ctx, rt.substring(0, rt.length - 2), cx + pw / 2 - 12, y0 + 22 * u, 12 * u, "rgba(255,255,255,0.7)", "right", "700") }
        text(ctx, "LAST ${fmtTime(pl.lastLap)}", cx - pw / 2 + 12, y0 + 40 * u, 10.5 * u, if (pl.lastLap != null && !pl.lastValid) "#ffd23a" else "rgba(255,255,255,0.85)", "left", "700")
        text(ctx, "BEST ${fmtTime(pl.bestLap)}", cx + pw / 2 - 12, y0 + 40 * u, 10.5 * u, "#d7a6ff", "right", "700")
        val sw = (pw - 24 - 8) / 3
        for (k in 0 until 3) {
            val x = cx - pw / 2 + 12 + k * (sw + 4); val y = y0 + 45 * u
            val f = secFlash[k]
            var col = "rgba(255,255,255,0.14)"; var label = "S${k + 1}"
            val tcur = pl.curSec[k]
            if (tcur != null) { col = f?.col ?: "#f2c230"; label = f2(tcur) }
            else if (f != null && t - f.t0 < 4) { col = f.col; label = f2(f.time) }
            else if (pl.sector == k && running) col = "rgba(255,255,255,0.4)"
            rr(ctx, x, y, sw, 9 * u, 2.0); ctx.fillStyle = col; ctx.fill()
            text(ctx, label, x + sw / 2, y + 7.6 * u, 8.5 * u, if (tcur != null || (f != null && t - f.t0 < 4)) "#111" else "rgba(255,255,255,0.8)", "center", "800")
        }
    }

    private fun drawMinimap(ctx: Ctx2D, L: Layout, S: Session, R: Renderer) {
        val mm = R.minimap
        val pw = clamp(L.w * 0.2, 130.0, 210.0); val sc = min(pw / mm.W, clamp(L.h * 0.26, 96.0, 150.0) / mm.H); val mw = mm.W * sc; val mh = mm.H * sc
        val px0 = L.w - L.m - L.safe.r - pw; val x0 = px0 + (pw - mw) / 2; val y0 = if (narrow) timingBottom + 8 else L.pause.y
        panel(ctx, px0 - 4, y0 - 2, pw + 8, mh + 4, 8.0, 0.4)
        ctx.drawImage(mm.bmp, x0, y0, mw, mh)
        val pl = S.player
        for (e in S.entries) {
            if (e.out || e === pl) continue
            val x = x0 + mm.mx(e.car.x) * sc; val y = y0 + mm.my(e.car.y) * sc
            ctx.beginPath(); ctx.arc(x, y, 2.6, 0.0, 6.3); ctx.fillStyle = e.team.c1; ctx.fill(); ctx.strokeStyle = "rgba(0,0,0,0.7)"; ctx.lineWidth = 0.8; ctx.stroke()
        }
        S.ghostPose?.let { val x = x0 + mm.mx(it.x) * sc; val y = y0 + mm.my(it.y) * sc; ctx.beginPath(); ctx.arc(x, y, 3.0, 0.0, 6.3); ctx.fillStyle = "rgba(120,220,255,0.9)"; ctx.fill() }
        val px = x0 + mm.mx(pl.car.x) * sc; val py = y0 + mm.my(pl.car.y) * sc
        ctx.beginPath(); ctx.arc(px, py, 4.4, 0.0, 6.3); ctx.fillStyle = "#ff7a1a"; ctx.fill(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.6; ctx.stroke()
        mapBottom = y0 + mh + 6; mapX = px0; mapW = pw
    }

    private fun drawBoard(ctx: Ctx2D, L: Layout, S: Session, pl: Entry, u: Double) {
        val order = S.order; val n = order.size; if (n < 2) return
        val rows = min(if (L.h < 380) 3 else 5, n)
        val start = (pl.pos - 1 - rows / 2).coerceIn(0, n - rows)
        val rh = 15 * u; val bw = mapW + 8; val x0 = mapX - 4; val y0 = mapBottom + 2
        if (y0 + rows * rh > L.shiftUp.y - 6 && L.shiftUp.x > L.w / 2) return
        if (y0 + rows * rh > L.shiftDown.y - 6 && L.shiftDown.x > L.w / 2) return
        panel(ctx, x0, y0, bw, rows * rh + 6, 8.0, 0.5)
        for (k in 0 until rows) {
            val e = order[start + k]; val y = y0 + 3 + k * rh
            if (e === pl) { rr(ctx, x0 + 2, y, bw - 4, rh, 4.0); ctx.fillStyle = "rgba(255,140,30,0.35)"; ctx.fill() }
            text(ctx, e.pos.toString(), x0 + 20 * u, y + rh * 0.75, 11 * u, "#fff", "right", "800")
            ctx.fillStyle = e.team.c1; ctx.fillRect(x0 + 24 * u, y + 3, 3.0, rh - 6)
            text(ctx, e.d.short, x0 + 31 * u, y + rh * 0.75, 11 * u, if (e.retired) "rgba(255,255,255,0.4)" else "#fff", "left", "700")
            var g = ""
            if (e.retired) g = "OUT" else if (e.pit != null) g = "PIT"
            else if (e !== pl) { val dd = e.dist - pl.dist; val laps = abs(dd) / S.T.length; g = if (laps >= 1) "${if (dd > 0) "+" else "-"}${floor(laps).toInt()}L" else "${if (dd > 0) "-" else "+"}${f1(abs(dd) / max(20.0, (abs(e.car.speed) + pl.car.speed) / 2))}" }
            text(ctx, g, x0 + bw - 6, y + rh * 0.75, 10 * u, if (e.pit != null) "#ffb347" else "rgba(255,255,255,0.8)", "right", "700")
        }
    }
}
