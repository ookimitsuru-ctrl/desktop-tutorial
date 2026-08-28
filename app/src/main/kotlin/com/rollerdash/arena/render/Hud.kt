package com.rollerdash.arena.render

import com.rollerdash.arena.core.Battle
import com.rollerdash.arena.core.Mech
import com.rollerdash.arena.core.Vec3
import com.rollerdash.arena.core.WeaponSlot
import com.rollerdash.arena.core.clamp
import com.rollerdash.arena.gl.QuadBatch
import com.rollerdash.arena.gl.ShaderProgram
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.cos
import kotlin.math.sin

/**
 * Thin wrapper that lets HUD code mix solid bars, rings, discs and text freely:
 * it flushes the batch whenever the shape mode has to change.
 */
class HudPainter(
    private val batch: QuadBatch,
    private val program: ShaderProgram,
    val font: FontAtlas,
) {
    private var mode = -1

    fun begin() { mode = -1 }

    private fun setMode(m: Int) {
        if (m != mode) {
            flush()
            program.setInt("uMode", m)
            mode = m
        }
    }

    fun flush() = batch.flush(program)

    fun rect(x: Float, y: Float, w: Float, h: Float, r: Float, g: Float, b: Float, a: Float = 1f) {
        setMode(0)
        batch.addRect(x, y, w, h, r, g, b, a)
    }

    /** Rectangle outline built from four thin bars. */
    fun frame(x: Float, y: Float, w: Float, h: Float, t: Float, r: Float, g: Float, b: Float, a: Float = 1f) {
        rect(x, y, w, t, r, g, b, a)
        rect(x, y + h - t, w, t, r, g, b, a)
        rect(x, y + t, t, h - t * 2f, r, g, b, a)
        rect(x + w - t, y + t, t, h - t * 2f, r, g, b, a)
    }

    fun disc(cx: Float, cy: Float, radius: Float, r: Float, g: Float, b: Float, a: Float = 1f) {
        setMode(3)
        batch.addRect(cx - radius, cy - radius, radius * 2f, radius * 2f, r, g, b, a)
    }

    fun ring(cx: Float, cy: Float, radius: Float, r: Float, g: Float, b: Float, a: Float = 1f) {
        setMode(2)
        batch.addRect(cx - radius, cy - radius, radius * 2f, radius * 2f, r, g, b, a)
    }

    fun text(
        s: String, x: Float, y: Float, size: Float,
        r: Float, g: Float, b: Float, a: Float = 1f,
        centered: Boolean = false, rightAligned: Boolean = false,
    ) {
        setMode(1)
        font.draw(batch, s, x, y, size, r, g, b, a, centered, rightAligned)
    }
}

/**
 * The combat display: armour bars, boost and magazine gauges, the round clock,
 * a sweep radar and the lock-on reticle that snaps shut when you have a clean line.
 */
class Hud {
    private var w = 0f
    private var h = 0f
    private var unit = 0f
    private var radarSweep = 0f
    private var bannerTimer = 0f
    private var banner = ""
    private var bannerSub = ""

    fun layout(width: Int, height: Int) {
        w = width.toFloat()
        h = height.toFloat()
        unit = minOf(w * 0.5f, h)
    }

    fun showBanner(text: String, sub: String = "", seconds: Float = 2.0f) {
        banner = text
        bannerSub = sub
        bannerTimer = seconds
    }

    fun update(dt: Float) {
        radarSweep += dt * 1.6f
        bannerTimer = maxOf(0f, bannerTimer - dt)
    }

    fun draw(p: HudPainter, battle: Battle, screenOf: (Vec3) -> FloatArray?, fps: Float) {
        val pad = unit * 0.045f
        val barW = w * 0.34f
        val barH = unit * 0.055f

        drawArmorBar(p, pad, pad, barW, barH, battle.player, mirrored = false)
        drawArmorBar(p, w - pad - barW, pad, barW, barH, battle.enemy, mirrored = true)

        drawClock(p, battle)
        drawGauges(p, battle.player)
        drawRadar(p, battle)
        drawReticle(p, battle, screenOf)
        drawDamageEdge(p, battle.player)
        drawBanner(p)

        if (fps > 0f) {
            p.text("${fps.toInt()}FPS", w - pad, h - unit * 0.05f, unit * 0.032f, 0.5f, 0.6f, 0.55f, 0.5f, rightAligned = true)
        }
    }

    private fun drawArmorBar(p: HudPainter, x: Float, y: Float, bw: Float, bh: Float, m: Mech, mirrored: Boolean) {
        val frac = m.armorFraction
        val warn = frac < 0.3f
        val r = if (warn) 1.0f else 0.45f
        val g = if (warn) 0.35f else 0.95f
        val b = if (warn) 0.25f else 0.55f
        p.rect(x, y, bw, bh, 0.05f, 0.07f, 0.06f, 0.55f)
        val fillW = bw * frac
        if (mirrored) {
            p.rect(x + bw - fillW, y, fillW, bh, r, g, b, 0.92f)
        } else {
            p.rect(x, y, fillW, bh, r, g, b, 0.92f)
        }
        p.frame(x, y, bw, bh, unit * 0.005f, 0.75f, 0.85f, 0.78f, 0.7f)

        // Segment ticks every 250 points of armour, so damage reads at a glance.
        val segs = maxOf(1, (m.spec.armor / 250f).toInt())
        for (i in 1 until segs) {
            val sx = x + bw * (i.toFloat() / segs)
            p.rect(sx, y, unit * 0.004f, bh, 0.1f, 0.12f, 0.1f, 0.6f)
        }
        val label = "${m.spec.displayName}  ${ceil(m.hp).toInt()}"
        val ts = unit * 0.040f
        if (mirrored) {
            p.text(label, x + bw, y + bh + unit * 0.012f, ts, 0.85f, 0.95f, 0.85f, 0.9f, rightAligned = true)
        } else {
            p.text(label, x, y + bh + unit * 0.012f, ts, 0.85f, 0.95f, 0.85f, 0.9f)
        }
    }

    private fun drawClock(p: HudPainter, battle: Battle) {
        val cx = w * 0.5f
        val secs = ceil(battle.timeLeft).toInt().coerceAtLeast(0)
        val urgent = secs <= 10
        val size = unit * 0.115f
        p.text(
            secs.toString().padStart(2, '0'), cx, unit * 0.03f, size,
            if (urgent) 1f else 0.9f, if (urgent) 0.4f else 0.98f, if (urgent) 0.3f else 0.85f, 1f,
            centered = true,
        )
        p.text("ROUND ${battle.roundNumber}", cx, unit * 0.155f, unit * 0.038f, 0.75f, 0.85f, 0.78f, 0.9f, centered = true)

        // Round pips: player on the left of the clock, enemy on the right.
        val pipR = unit * 0.018f
        val gap = pipR * 3f
        val need = battle.config.roundsToWin
        for (i in 0 until need) {
            val won = battle.roundsWon[0] > i
            p.disc(cx - unit * 0.16f - i * gap, unit * 0.075f, pipR,
                if (won) 0.4f else 0.25f, if (won) 1f else 0.3f, if (won) 0.6f else 0.28f, if (won) 1f else 0.6f)
            val ewon = battle.roundsWon[1] > i
            p.disc(cx + unit * 0.16f + i * gap, unit * 0.075f, pipR,
                if (ewon) 1f else 0.3f, if (ewon) 0.45f else 0.25f, if (ewon) 0.3f else 0.25f, if (ewon) 1f else 0.6f)
        }
    }

    private fun drawGauges(p: HudPainter, m: Mech) {
        val gw = w * 0.22f
        val gh = unit * 0.032f
        val x = w * 0.5f - gw * 0.5f
        var y = h - unit * 0.185f

        // Boost: the resource that decides whether you can dash out of trouble.
        p.rect(x, y, gw, gh, 0.05f, 0.07f, 0.06f, 0.5f)
        val low = m.boost < m.spec.dashCost
        p.rect(x, y, gw * m.boost, gh, if (low) 0.9f else 0.35f, if (low) 0.4f else 0.85f, if (low) 0.9f else 1f, 0.9f)
        p.text("BOOST", x - unit * 0.012f, y - unit * 0.004f, gh * 0.9f, 0.7f, 0.85f, 0.9f, 0.85f, rightAligned = true)
        y += gh + unit * 0.012f

        val slotW = (gw - unit * 0.02f) / 3f
        for ((i, slot) in listOf(WeaponSlot.RIGHT, WeaponSlot.LEFT, WeaponSlot.CENTER).withIndex()) {
            val sx = x + i * (slotW + unit * 0.01f)
            val amount = m.ammoOf(slot)
            val ready = amount >= m.spec.weapon(slot, m.stance).ammoCost
            p.rect(sx, y, slotW, gh * 0.8f, 0.05f, 0.07f, 0.06f, 0.5f)
            p.rect(sx, y, slotW * amount, gh * 0.8f,
                if (ready) 0.95f else 0.5f, if (ready) 0.8f else 0.35f, if (ready) 0.3f else 0.3f, 0.9f)
            val name = when (slot) {
                WeaponSlot.RIGHT -> "RW"
                WeaponSlot.LEFT -> "LW"
                WeaponSlot.CENTER -> "CW"
            }
            p.text(name, sx + slotW * 0.5f, y + gh * 0.9f, gh * 0.75f, 0.8f, 0.85f, 0.8f, 0.8f, centered = true)
        }

        val current = m.spec.weapon(WeaponSlot.RIGHT, m.stance).name
        p.text(current, w * 0.5f, h - unit * 0.225f, unit * 0.032f, 0.8f, 0.9f, 0.7f, 0.75f, centered = true)
    }

    private fun drawRadar(p: HudPainter, battle: Battle) {
        val r = unit * 0.115f
        val cx = w * 0.5f
        val cy = h - unit * 0.30f - r
        p.disc(cx, cy, r, 0.05f, 0.12f, 0.08f, 0.42f)
        p.ring(cx, cy, r, 0.5f, 0.9f, 0.6f, 0.55f)
        p.ring(cx, cy, r * 0.5f, 0.4f, 0.8f, 0.5f, 0.30f)

        // Sweep hand.
        val sweepR = r * 0.92f
        val sx = cx + sin(radarSweep) * sweepR * 0.5f
        val sy = cy - cos(radarSweep) * sweepR * 0.5f
        p.disc(sx, sy, r * 0.10f, 0.6f, 1f, 0.7f, 0.35f)

        val player = battle.player
        val enemy = battle.enemy
        val scale = r / battle.arena.halfSize
        // Rotate the world so the player's nose always points up the radar.
        val rel = enemy.pos - player.pos
        val c = cos(-player.yaw)
        val s = sin(-player.yaw)
        val rx = rel.x * c - rel.z * s
        val rz = rel.x * s + rel.z * c
        val bx = clamp(cx + rx * scale, cx - r, cx + r)
        val by = clamp(cy - rz * scale, cy - r, cy + r)
        val blip = if (battle.lockClear) 1f else 0.55f
        p.disc(bx, by, r * 0.13f, 1f, 0.35f * blip, 0.25f, 0.95f)
        p.disc(cx, cy, r * 0.09f, 0.5f, 1f, 0.6f, 0.95f)
        // Height difference marker.
        if (abs(enemy.pos.y - player.pos.y) > 1.5f) {
            val up = enemy.pos.y > player.pos.y
            p.text(if (up) "^" else "v", bx, by - r * 0.34f, r * 0.28f, 1f, 0.6f, 0.4f, 0.9f, centered = true)
        }
    }

    private fun drawReticle(p: HudPainter, battle: Battle, screenOf: (Vec3) -> FloatArray?) {
        if (!battle.enemy.alive) return
        val sp = screenOf(battle.enemy.center) ?: return
        val x = sp[0]
        val y = sp[1]
        val charge = battle.lockCharge
        val size = unit * (0.16f - 0.07f * charge)
        val locked = battle.lockClear && charge > 0.95f
        val r = if (locked) 1f else 0.6f
        val g = if (locked) 0.35f else 0.85f
        val b = if (locked) 0.25f else 0.6f
        val t = unit * 0.006f
        val arm = size * 0.42f
        // Four corner brackets that close in as the lock firms up.
        for (sx in intArrayOf(-1, 1)) {
            for (sy in intArrayOf(-1, 1)) {
                val cx = x + sx * size * 0.5f
                val cy = y + sy * size * 0.5f
                p.rect(cx - if (sx > 0) arm else 0f, cy, arm, t, r, g, b, 0.95f)
                p.rect(cx, cy - if (sy > 0) arm else 0f, t, arm, r, g, b, 0.95f)
            }
        }
        if (locked) {
            p.ring(x, y, size * 0.28f, r, g, b, 0.8f)
            p.text("LOCK", x, y + size * 0.55f, unit * 0.034f, r, g, b, 0.9f, centered = true)
        }
        val dist = battle.player.center.flatDistanceTo(battle.enemy.center)
        p.text("${dist.toInt()}M", x, y - size * 0.75f, unit * 0.030f, r, g, b, 0.8f, centered = true)
    }

    private fun drawDamageEdge(p: HudPainter, m: Mech) {
        val flash = m.tookDamageFlash
        val low = if (m.armorFraction < 0.25f) 0.35f + 0.25f * sin(radarSweep * 4f) else 0f
        val a = maxOf(flash * 0.5f, low * 0.4f)
        if (a <= 0.01f) return
        val t = unit * 0.05f
        p.rect(0f, 0f, w, t, 1f, 0.2f, 0.15f, a)
        p.rect(0f, h - t, w, t, 1f, 0.2f, 0.15f, a)
        p.rect(0f, 0f, t, h, 1f, 0.2f, 0.15f, a)
        p.rect(w - t, 0f, t, h, 1f, 0.2f, 0.15f, a)
    }

    private fun drawBanner(p: HudPainter) {
        if (bannerTimer <= 0f) return
        val a = clamp(bannerTimer * 1.6f, 0f, 1f)
        p.text(banner, w * 0.5f, h * 0.34f, unit * 0.14f, 1f, 0.92f, 0.55f, a, centered = true)
        if (bannerSub.isNotEmpty()) {
            p.text(bannerSub, w * 0.5f, h * 0.34f + unit * 0.16f, unit * 0.05f, 0.9f, 0.95f, 0.85f, a, centered = true)
        }
    }

    /** Full-screen pause / result overlay. Returns nothing - input is handled elsewhere. */
    fun drawOverlay(p: HudPainter, title: String, lines: List<String>, hint: String) {
        p.rect(0f, 0f, w, h, 0.02f, 0.03f, 0.03f, 0.72f)
        p.text(title, w * 0.5f, h * 0.18f, unit * 0.11f, 1f, 0.9f, 0.5f, 1f, centered = true)
        var y = h * 0.36f
        for (line in lines) {
            p.text(line, w * 0.5f, y, unit * 0.048f, 0.88f, 0.95f, 0.88f, 0.95f, centered = true)
            y += unit * 0.075f
        }
        p.text(hint, w * 0.5f, h * 0.86f, unit * 0.042f, 0.7f, 0.9f, 0.7f, 0.9f, centered = true)
    }
}
