package jp.okracing.game

import android.graphics.Bitmap
import android.graphics.Color
import jp.okracing.core.*
import kotlin.math.*

// OK-90 (1990年前後のF1を参考にした架空マシン) のトップビュー描画 (Web 版 src/carsprite.js の移植)
// スプライトは車体中心(重心)を原点、ノーズを +x 方向として生成する。

object CarSprite {
    const val SPR_SCALE = 34.0
    private const val SW = 5.4; private const val SH = 2.9
    class Spr(val bmp: Bitmap, val w: Double, val h: Double)
    private val cache = HashMap<String, Spr>()

    fun shade(c: Int, f: Double): Int {
        var r = Color.red(c).toDouble(); var g = Color.green(c).toDouble(); var b = Color.blue(c).toDouble()
        if (f >= 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f } else { r *= 1 + f; g *= 1 + f; b *= 1 + f }
        return Color.rgb(r.toInt(), g.toInt(), b.toInt())
    }

    fun sprite(team: Team, noFront: Boolean = false, noRear: Boolean = false, ghost: Boolean = false, number: Int? = null): Spr {
        val key = "${team.c1}${team.c2}${team.c3}|${if (noFront) 1 else 0}${if (noRear) 1 else 0}${if (ghost) 1 else 0}|${number ?: ""}"
        cache[key]?.let { return it }
        val cv = OffCanvas((SW * SPR_SCALE).roundToInt(), (SH * SPR_SCALE).roundToInt())
        val g = cv.ctx
        g.translate(cv.width / 2.0, cv.height / 2.0)
        g.scale(SPR_SCALE, SPR_SCALE)
        g.lineJoin = "round"; g.lineCap = "round"
        val c1 = team.c1; val c2 = team.c2; val c3 = team.c3
        val dark = "#15171a"
        // --- サスペンションアーム ---
        g.strokeStyle = "#2f3338"; g.lineWidth = 0.065
        fun arm(x1: Double, y1: Double, x2: Double, y2: Double) { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.moveTo(x1, -y1); g.lineTo(x2, -y2); g.stroke() }
        arm(1.95, 0.2, CAR.a, 0.9); arm(1.3, 0.26, CAR.a, 0.9); arm(1.62, 0.22, 1.62, 0.88)
        arm(-0.85, 0.3, -CAR.b, 0.86); arm(-1.55, 0.2, -CAR.b, 0.86); arm(-1.23, 0.25, -1.23, 0.84)
        // --- フロア ---
        g.fillStyle = dark
        g.beginPath()
        g.moveTo(1.15, 0.3); g.lineTo(0.95, 0.58); g.lineTo(-0.95, 0.6); g.lineTo(-1.45, 0.42); g.lineTo(-1.7, 0.3)
        g.lineTo(-1.7, -0.3); g.lineTo(-1.45, -0.42); g.lineTo(-0.95, -0.6); g.lineTo(0.95, -0.58); g.lineTo(1.15, -0.3); g.closePath(); g.fill()
        // --- リアウイング ---
        if (!noRear) {
            g.fillStyle = shade(c2, -0.15); g.fillRect(-2.14, -0.5, 0.56, 1.0)
            g.fillStyle = c2; g.fillRect(-2.1, -0.47, 0.2, 0.94)
            g.fillStyle = shade(c2, 0.18); g.fillRect(-1.86, -0.47, 0.22, 0.94)
            g.fillStyle = c1; g.fillRect(-2.16, -0.53, 0.6, 0.06); g.fillRect(-2.16, 0.47, 0.6, 0.06)
            g.fillStyle = c3; g.fillRect(-1.99, -0.3, 0.1, 0.6)
        } else { g.fillStyle = "#333"; g.fillRect(-1.75, -0.08, 0.2, 0.16) }
        // --- サイドポンツーン ---
        fun pod(sg: Double) {
            g.beginPath()
            g.moveTo(0.95, sg * 0.34); g.lineTo(1.0, sg * 0.7); g.quadraticCurveTo(0.3, sg * 0.75, -0.45, sg * 0.72)
            g.quadraticCurveTo(-0.9, sg * 0.64, -1.5, sg * 0.22); g.lineTo(-0.9, sg * 0.28); g.closePath()
        }
        for (sg in doubleArrayOf(1.0, -1.0)) {
            g.fillStyle = c1; pod(sg); g.fill()
            g.fillStyle = "#0c0d0f"; g.beginPath(); g.moveTo(1.0, sg * 0.36); g.lineTo(1.0, sg * 0.69); g.lineTo(0.86, sg * 0.68); g.lineTo(0.86, sg * 0.38); g.closePath(); g.fill()
            g.fillStyle = c2; g.beginPath(); g.moveTo(0.6, sg * 0.57); g.lineTo(-0.45, sg * 0.55); g.lineTo(-0.58, sg * 0.67); g.lineTo(0.55, sg * 0.71); g.closePath(); g.fill()
            g.fillStyle = c3; g.fillRect(-0.42, if (sg > 0) 0.49 else -0.53, 0.98, 0.04)
        }
        // --- モノコック / ノーズ ---
        g.fillStyle = c1
        g.beginPath()
        g.moveTo(2.38, 0.07); g.quadraticCurveTo(1.6, 0.19, 1.05, 0.33); g.lineTo(0.2, 0.4); g.lineTo(-0.5, 0.36)
        g.quadraticCurveTo(-1.2, 0.3, -1.72, 0.17); g.lineTo(-1.72, -0.17); g.quadraticCurveTo(-1.2, -0.3, -0.5, -0.36)
        g.lineTo(0.2, -0.4); g.lineTo(1.05, -0.33); g.quadraticCurveTo(1.6, -0.19, 2.38, -0.07); g.closePath(); g.fill()
        val grd = g.createLinearGradient(0.0, -0.4, 0.0, 0.4)
        grd.addColorStop(0.0, "rgba(0,0,0,0.22)"); grd.addColorStop(0.42, "rgba(255,255,255,0.20)"); grd.addColorStop(0.58, "rgba(255,255,255,0.12)"); grd.addColorStop(1.0, "rgba(0,0,0,0.28)")
        g.fillStyle = grd; g.fill()
        g.fillStyle = c2
        g.beginPath(); g.moveTo(2.38, 0.07); g.quadraticCurveTo(2.0, 0.13, 1.75, 0.17); g.lineTo(1.75, -0.17); g.quadraticCurveTo(2.0, -0.13, 2.38, -0.07); g.closePath(); g.fill()
        g.fillStyle = c3; g.fillRect(1.66, -0.19, 0.07, 0.38)
        if (number != null) {
            g.save(); g.translate(1.36, 0.0); g.rotate(PI / 2)
            g.fillStyle = "#fff"; g.beginPath(); g.arc(0.0, 0.0, 0.15, 0.0, 6.3); g.fill()
            g.fillStyle = "#111"; g.font = "bold 0.2px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"
            g.fillText(number.toString(), 0.0, 0.012); g.restore()
        }
        // --- エンジンカバー ---
        g.fillStyle = shade(c1, -0.12)
        g.beginPath(); g.moveTo(-0.15, 0.2); g.quadraticCurveTo(-0.9, 0.24, -1.68, 0.1); g.lineTo(-1.68, -0.1); g.quadraticCurveTo(-0.9, -0.24, -0.15, -0.2); g.closePath(); g.fill()
        g.fillStyle = c2; g.beginPath(); g.moveTo(-0.3, 0.07); g.lineTo(-1.6, 0.04); g.lineTo(-1.6, -0.04); g.lineTo(-0.3, -0.07); g.closePath(); g.fill()
        g.fillStyle = "#0b0b0c"; g.beginPath(); g.ellipse(-0.14, 0.0, 0.1, 0.16, 0.0, 0.0, 6.3); g.fill()
        g.fillStyle = shade(c1, 0.15); g.beginPath(); g.ellipse(-0.22, 0.0, 0.08, 0.17, 0.0, 0.0, 6.3); g.fill()
        // --- コックピット ---
        g.fillStyle = "#0d0e10"
        g.beginPath(); g.ellipse(0.38, 0.0, 0.42, 0.24, 0.0, 0.0, 6.3); g.fill()
        g.fillStyle = "#2b2b2b"; g.fillRect(0.6, -0.13, 0.05, 0.26)
        g.fillStyle = c3; g.beginPath(); g.arc(0.25, 0.0, 0.15, 0.0, 6.3); g.fill()
        g.fillStyle = c2; g.fillRect(0.18, -0.15, 0.06, 0.3)
        g.fillStyle = "rgba(20,24,30,0.9)"; g.beginPath(); g.arc(0.3, 0.0, 0.13, -0.9, 0.9); g.fill()
        g.strokeStyle = "rgba(190,220,255,0.55)"; g.lineWidth = 0.035; g.beginPath(); g.arc(0.5, 0.0, 0.3, -0.75, 0.75); g.stroke()
        g.fillStyle = c1; g.fillRect(0.68, 0.36, 0.1, 0.12); g.fillRect(0.68, -0.48, 0.1, 0.12)
        // --- フロントウイング ---
        if (!noFront) {
            g.fillStyle = shade(c2, -0.1)
            g.beginPath(); g.moveTo(2.44, 0.1); g.lineTo(2.44, 0.67); g.lineTo(2.02, 0.67); g.lineTo(2.08, 0.12); g.closePath(); g.fill()
            g.beginPath(); g.moveTo(2.44, -0.1); g.lineTo(2.44, -0.67); g.lineTo(2.02, -0.67); g.lineTo(2.08, -0.12); g.closePath(); g.fill()
            g.fillStyle = shade(c2, 0.2); g.fillRect(2.28, 0.12, 0.14, 0.54); g.fillRect(2.28, -0.66, 0.14, 0.54)
            g.fillStyle = c1; g.fillRect(1.98, 0.67, 0.5, 0.055); g.fillRect(1.98, -0.725, 0.5, 0.055)
        }
        if (ghost) {
            g.globalCompositeOperation = "source-in"; g.setTransform(1.0, 0.0, 0.0, 1.0, 0.0, 0.0)
            g.fillStyle = "rgba(120,220,255,0.55)"; g.fillRect(0.0, 0.0, cv.width.toDouble(), cv.height.toDouble())
        }
        val s = Spr(cv.bmp, SW, SH)
        cache[key] = s
        return s
    }

    /** タイヤ位置 [x, y, 長さ, 幅, 操舵するか] */
    val WHEELS = arrayOf(doubleArrayOf(CAR.a, -0.9, 0.68, 0.34, 1.0), doubleArrayOf(CAR.a, 0.9, 0.68, 0.34, 1.0), doubleArrayOf(-CAR.b, -0.86, 0.72, 0.48, 0.0), doubleArrayOf(-CAR.b, 0.86, 0.72, 0.48, 0.0))

    /** ctx はワールド座標系(1=1m)に変換済みであること */
    fun drawCar(ctx: Ctx2D, x: Double, y: Double, yaw: Double, delta: Double, dmgF: Double, dmgR: Double, team: Team, ghost: Boolean = false, number: Int? = null, tyreColor: Int? = null) {
        ctx.save()
        ctx.translate(x, y); ctx.rotate(yaw)
        for (k in 0 until 4) {
            val w = WHEELS[k]
            ctx.save(); ctx.translate(w[0], w[1]); if (w[4] != 0.0) ctx.rotate(delta)
            ctx.fillStyle = if (ghost) "rgba(120,220,255,0.4)" else "#101113"
            val hl = w[2] / 2; val hw = w[3] / 2
            ctx.beginPath(); ctx.roundRect(-hl, -hw, w[2], w[3], 0.09); ctx.fill()
            if (!ghost) {
                ctx.fillStyle = "rgba(255,255,255,0.10)"; ctx.fillRect(-hl + 0.06, -hw + 0.05, w[2] - 0.12, w[3] * 0.28)
                if (tyreColor != null) { ctx.fillStyle = tyreColor; ctx.fillRect(-0.05, if (k % 2 == 1) hw - 0.07 else -hw + 0.02, 0.1, 0.05) }
            }
            ctx.restore()
        }
        val sp = sprite(team, noFront = dmgF > 0.55, noRear = dmgR > 0.65, ghost = ghost, number = number)
        ctx.drawImage(sp.bmp, -sp.w / 2, -sp.h / 2, sp.w, sp.h)
        ctx.restore()
    }

    /** タイトル画面の静止画: 左向きの側面図 (単位 m、地面 y=0、上が負) */
    fun drawShowcase(g: Ctx2D, W: Double, H: Double, team: Team, number: Int) {
        val sc = min(W / 4.8, H / 1.35)
        g.save(); g.translate(W / 2 + 0.1 * sc, H / 2 + 0.5 * sc); g.scale(sc, sc)
        g.lineJoin = "round"; g.lineCap = "round"
        val c1 = team.c1; val c2 = team.c2; val c3 = team.c3; val DK = "#15171c"
        val FX = -1.47; val RX = 1.43; val FR = 0.315; val RR = 0.34
        fun path(vararg pts: Double) { g.beginPath(); var i = 0; while (i < pts.size) { if (i == 0) g.moveTo(pts[0], pts[1]) else g.lineTo(pts[i], pts[i + 1]); i += 2 }; g.closePath() }
        g.fillStyle = "rgba(0,0,0,0.28)"; g.beginPath(); g.ellipse(-0.08, 0.015, 2.2, 0.035, 0.0, 0.0, 6.3); g.fill()
        g.fillStyle = DK; path(-1.05, -0.05, 1.62, -0.05, 1.85, -0.2, 1.62, -0.11, -1.05, -0.11); g.fill()
        g.fillStyle = DK; g.fillRect(1.5, -0.52, 0.07, 0.3)
        g.fillStyle = c2; path(1.5, -0.97, 2.06, -0.97, 2.06, -0.36, 1.94, -0.3, 1.62, -0.3, 1.5, -0.42); g.fill()
        g.fillStyle = c3; g.fillRect(1.5, -0.97, 0.56, 0.045)
        g.fillStyle = c3; path(-2.25, -0.075, -1.84, -0.115, -1.82, -0.085, -2.25, -0.045); g.fill()
        g.fillStyle = c2; path(-2.27, -0.2, -1.82, -0.2, -1.82, -0.04, -2.27, -0.04); g.fill()
        g.fillStyle = c3; g.fillRect(-2.27, -0.2, 0.45, 0.03)
        fun body() {
            g.beginPath(); g.moveTo(-2.22, -0.13)
            g.bezierCurveTo(-2.05, -0.2, -1.6, -0.38, -1.05, -0.5)
            g.lineTo(-0.72, -0.56)
            g.lineTo(-0.5, -0.5); g.lineTo(-0.02, -0.5)
            g.lineTo(-0.02, -0.82); g.quadraticCurveTo(-0.02, -0.86, 0.03, -0.86)
            g.lineTo(0.2, -0.86)
            g.bezierCurveTo(0.6, -0.86, 1.05, -0.6, 1.66, -0.4)
            g.lineTo(1.7, -0.2); g.lineTo(1.4, -0.1); g.lineTo(-1.0, -0.1)
            g.bezierCurveTo(-1.5, -0.1, -2.0, -0.1, -2.22, -0.13); g.closePath()
        }
        body(); g.fillStyle = c1; g.fill()
        g.save(); body(); g.clip()
        g.fillStyle = c2; path(-2.6, -0.1, 1.8, -0.1, 1.8, -0.25, 0.9, -0.2, -2.6, -0.16); g.fill()
        g.fillStyle = c3; path(-2.6, -0.185, 0.9, -0.225, 1.8, -0.275, 1.8, -0.25, 0.9, -0.2, -2.6, -0.16); g.fill()
        g.fillStyle = "rgba(255,255,255,0.16)"; path(-2.25, -0.2, -1.0, -0.53, -0.7, -0.57, -0.7, -0.52, -2.25, -0.17); g.fill()
        g.fillStyle = "rgba(0,0,0,0.14)"; path(0.15, -0.9, 0.6, -0.9, 1.7, -0.42, 1.7, -0.3, 0.5, -0.6); g.fill()
        g.restore()
        g.fillStyle = DK; path(-0.02, -0.83, 0.035, -0.83, 0.035, -0.71, -0.02, -0.71); g.fill()
        g.beginPath(); g.moveTo(-0.58, -0.12); g.lineTo(-0.58, -0.4); g.quadraticCurveTo(-0.5, -0.47, -0.3, -0.47)
        g.bezierCurveTo(0.3, -0.47, 0.75, -0.42, 1.12, -0.3); g.lineTo(1.2, -0.12); g.closePath()
        g.fillStyle = c1; g.fill(); g.strokeStyle = "rgba(0,0,0,0.3)"; g.lineWidth = 0.014; g.stroke()
        g.fillStyle = DK; path(-0.58, -0.38, -0.5, -0.4, -0.5, -0.16, -0.58, -0.14); g.fill()
        g.fillStyle = c2; path(-0.5, -0.12, 1.2, -0.12, 1.16, -0.2, -0.5, -0.2); g.fill()
        g.fillStyle = c3; g.fillRect(-0.5, -0.215, 1.655, 0.02)
        g.fillStyle = c3; g.beginPath(); g.arc(-1.02, -0.33, 0.115, 0.0, 6.3); g.fill()
        g.fillStyle = c2; g.font = "800 0.17px Roboto Condensed"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(number.toString(), -1.02, -0.32)
        g.fillStyle = c3; g.font = "italic 800 0.15px Roboto Condensed"; g.fillText("OK-90", 0.3, -0.325)
        g.fillStyle = DK; path(-0.5, -0.5, -0.02, -0.5, -0.03, -0.6, -0.45, -0.56); g.fill()
        g.fillStyle = c3; g.beginPath(); g.arc(-0.2, -0.66, 0.125, 0.0, 6.3); g.fill()
        g.fillStyle = c1; g.beginPath(); g.arc(-0.2, -0.66, 0.125, PI * 1.05, PI * 1.75); g.lineTo(-0.2, -0.66); g.fill()
        g.fillStyle = DK; path(-0.33, -0.69, -0.22, -0.7, -0.22, -0.63, -0.325, -0.62); g.fill()
        g.strokeStyle = DK; g.lineWidth = 0.02; g.beginPath(); g.moveTo(-0.62, -0.57); g.lineTo(-0.66, -0.66); g.stroke()
        g.fillStyle = c1; g.fillRect(-0.7, -0.7, 0.08, 0.05)
        g.strokeStyle = DK; g.lineWidth = 0.022
        g.beginPath(); g.moveTo(FX, -FR - 0.12); g.lineTo(-1.15, -0.44); g.moveTo(FX, -FR + 0.1); g.lineTo(-1.2, -0.2); g.stroke()
        fun wheel(x: Double, r: Double) {
            g.fillStyle = "#17181b"; g.beginPath(); g.arc(x, -r, r, 0.0, 6.3); g.fill()
            g.strokeStyle = "rgba(255,255,255,0.1)"; g.lineWidth = 0.02; g.beginPath(); g.arc(x, -r, r * 0.9, 0.0, 6.3); g.stroke()
            g.strokeStyle = "#e9c63a"; g.lineWidth = 0.012; g.beginPath(); g.arc(x, -r, r * 0.74, 0.0, 6.3); g.stroke()
            g.fillStyle = "#c9ccd2"; g.beginPath(); g.arc(x, -r, r * 0.52, 0.0, 6.3); g.fill()
            g.fillStyle = "#6d727c"; g.beginPath(); g.arc(x, -r, r * 0.42, 0.0, 6.3); g.fill()
            g.strokeStyle = "#c9ccd2"; g.lineWidth = 0.03
            for (k in 0 until 5) { val a = k * PI * 2 / 5 - 0.3; g.beginPath(); g.moveTo(x, -r); g.lineTo(x + cos(a) * r * 0.48, -r + sin(a) * r * 0.48); g.stroke() }
            g.fillStyle = "#2a2d33"; g.beginPath(); g.arc(x, -r, r * 0.13, 0.0, 6.3); g.fill()
        }
        wheel(FX, FR); wheel(RX, RR)
        g.restore()
    }
}
