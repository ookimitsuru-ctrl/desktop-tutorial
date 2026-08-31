package com.rollerdash.arena.render

import com.rollerdash.arena.core.Battle
import com.rollerdash.arena.core.HudLayout
import com.rollerdash.arena.core.Mech
import com.rollerdash.arena.core.Vec3
import com.rollerdash.arena.core.WeaponSlot
import com.rollerdash.arena.core.clamp
import com.rollerdash.arena.core.forwardOf
import com.rollerdash.arena.core.rightOf
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

    /** Gauge fill: scanlined, with a hot leading edge. */
    fun gaugeFill(x: Float, y: Float, w: Float, h: Float, r: Float, g: Float, b: Float, a: Float = 1f) {
        if (w <= 0.5f) return
        setMode(4)
        batch.addRect(x, y, w, h, r, g, b, a)
    }

    /** Bevelled round plate used for the on-screen buttons. */
    fun plate(cx: Float, cy: Float, radius: Float, r: Float, g: Float, b: Float, a: Float = 1f) {
        setMode(5)
        batch.addRect(cx - radius, cy - radius, radius * 2f, radius * 2f, r, g, b, a)
    }

    /**
     * A gauge: dark well, scanlined fill, a pale ghost of damage just taken, tick
     * marks and a hairline frame.
     */
    fun gauge(
        x: Float, y: Float, w: Float, h: Float,
        fraction: Float, ghost: Float, segments: Int,
        r: Float, g: Float, b: Float,
        mirrored: Boolean = false,
    ) {
        rect(x - 1f, y - 1f, w + 2f, h + 2f, 0.02f, 0.03f, 0.03f, 0.62f)
        val fill = w * fraction.coerceIn(0f, 1f)
        val ghostW = w * ghost.coerceIn(0f, 1f)
        if (mirrored) {
            if (ghostW > fill) rect(x + w - ghostW, y, ghostW - fill, h, 0.95f, 0.85f, 0.7f, 0.55f)
            gaugeFill(x + w - fill, y, fill, h, r, g, b, 0.95f)
        } else {
            if (ghostW > fill) rect(x + fill, y, ghostW - fill, h, 0.95f, 0.85f, 0.7f, 0.55f)
            gaugeFill(x, y, fill, h, r, g, b, 0.95f)
        }
        for (i in 1 until segments) {
            rect(x + w * (i.toFloat() / segments), y, 1.5f, h, 0.02f, 0.03f, 0.03f, 0.85f)
        }
        frame(x - 1f, y - 1f, w + 2f, h + 2f, 1.5f, 0.55f, 0.72f, 0.66f, 0.8f)
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
 * The combat display: your own status stacked in the left column, the enemy on
 * the right, the round clock up top, and nothing but a small radar anywhere near
 * the middle of the screen, which belongs to your machine.
 */
class Hud {
    private var layout = HudLayout(1f, 1f)
    private var radarSweep = 0f
    private var bannerTimer = 0f
    private var banner = ""
    private var bannerSub = ""
    private var bannerPunch = 0f

    // Armour that drains a beat behind the real value, so a hit reads as a hit.
    private var playerGhost = 1f
    private var enemyGhost = 1f
    private var lockPulse = 0f

    fun layout(width: Int, height: Int) {
        layout = HudLayout(width.toFloat(), height.toFloat())
    }

    fun showBanner(text: String, sub: String = "", seconds: Float = 2.0f) {
        banner = text
        bannerSub = sub
        bannerTimer = seconds
        bannerPunch = 1f
    }

    fun update(dt: Float) {
        radarSweep += dt * 1.9f
        lockPulse += dt * 3.4f
        bannerTimer = maxOf(0f, bannerTimer - dt)
        bannerPunch = maxOf(0f, bannerPunch - dt * 3.2f)
    }

    fun draw(p: HudPainter, battle: Battle, screenOf: (Vec3) -> FloatArray?, fps: Float) {
        val dt = 1f / 60f
        playerGhost = approachGhost(playerGhost, battle.player.armorFraction, dt)
        enemyGhost = approachGhost(enemyGhost, battle.enemy.armorFraction, dt)

        drawStatus(p, layout.playerArmor, battle.player, playerGhost, mirrored = false)
        drawStatus(p, layout.enemyArmor, battle.enemy, enemyGhost, mirrored = true)
        drawClock(p, battle)
        drawGauges(p, battle.player)
        drawRadar(p, battle)
        drawReticle(p, battle, screenOf)
        drawDamageEdge(p, battle.player)
        drawBanner(p)
        if (fps > 0f) {
            p.text(
                "${fps.toInt()}FPS", layout.width - layout.pad, layout.height - layout.textSmall * 1.4f,
                layout.textSmall * 0.8f, 0.45f, 0.55f, 0.5f, 0.4f, rightAligned = true,
            )
        }
    }

    private fun approachGhost(ghost: Float, actual: Float, dt: Float): Float =
        if (actual > ghost) actual else maxOf(actual, ghost - dt * 0.35f)

    private fun drawStatus(
        p: HudPainter,
        box: com.rollerdash.arena.core.Rect,
        m: Mech,
        ghost: Float,
        mirrored: Boolean,
    ) {
        val frac = m.armorFraction
        val critical = frac < 0.28f
        val warn = frac < 0.55f
        val r = if (critical) 1.0f else if (warn) 0.95f else 0.35f
        val g = if (critical) 0.28f else if (warn) 0.72f else 0.92f
        val b = if (critical) 0.22f else if (warn) 0.25f else 0.55f
        val segments = maxOf(2, (m.spec.armor / 250f).toInt())
        p.gauge(box.x, box.y, box.w, box.h, frac, ghost, segments, r, g, b, mirrored)

        val ts = layout.textSmall
        val ty = box.bottom + layout.unit * 0.012f
        if (mirrored) {
            p.text(m.spec.displayName, box.right, ty, ts, 0.86f, 0.92f, 0.86f, 0.92f, rightAligned = true)
            p.text(
                "${ceil(m.hp).toInt()}", box.x, ty, ts,
                if (critical) 1f else 0.9f, if (critical) 0.4f else 0.95f, 0.6f, 0.95f,
            )
        } else {
            p.text(m.spec.displayName, box.x, ty, ts, 0.86f, 0.92f, 0.86f, 0.92f)
            p.text(
                "${ceil(m.hp).toInt()}", box.right, ty, ts,
                if (critical) 1f else 0.9f, if (critical) 0.4f else 0.95f, 0.6f, 0.95f, rightAligned = true,
            )
        }
        // Corner ticks: the frame reads as instrumentation rather than a rectangle.
        val t = layout.unit * 0.006f
        val armLen = box.h * 0.9f
        val cornerX = if (mirrored) box.right - armLen else box.x
        p.rect(cornerX, box.y - t * 2.2f, armLen, t, 0.7f, 0.85f, 0.78f, 0.75f)
        p.rect(cornerX, box.bottom + t * 1.2f, armLen, t, 0.7f, 0.85f, 0.78f, 0.75f)
    }

    private fun drawClock(p: HudPainter, battle: Battle) {
        val box = layout.timer
        val secs = ceil(battle.timeLeft).toInt().coerceAtLeast(0)
        val urgent = secs <= 10 && battle.phase == com.rollerdash.arena.core.RoundPhase.FIGHT
        val pulse = if (urgent) 0.75f + 0.25f * sin(lockPulse * 3f) else 1f
        p.text(
            secs.toString().padStart(2, '0'), box.cx, box.y, box.h * 0.9f,
            if (urgent) 1f else 0.92f, if (urgent) 0.35f * pulse else 0.96f, if (urgent) 0.25f else 0.82f, 1f,
            centered = true,
        )
        // Bracket either side of the clock.
        val t = layout.unit * 0.006f
        val h = box.h * 0.62f
        for (s in intArrayOf(-1, 1)) {
            val x = box.cx + s * box.w * 0.44f
            p.rect(x - t * 0.5f, box.y + box.h * 0.16f, t, h, 0.75f, 0.85f, 0.7f, 0.7f)
            p.rect(x - s * t * 2.5f - t * 0.5f, box.y + box.h * 0.16f, t * 3f, t, 0.75f, 0.85f, 0.7f, 0.7f)
            p.rect(x - s * t * 2.5f - t * 0.5f, box.y + box.h * 0.16f + h - t, t * 3f, t, 0.75f, 0.85f, 0.7f, 0.7f)
        }
        p.text(
            "ROUND ${battle.roundNumber}", box.cx, box.bottom - layout.textSmall * 0.1f,
            layout.textSmall * 0.85f, 0.7f, 0.8f, 0.72f, 0.85f, centered = true,
        )

        // Round wins: slanted bars, filled as they are taken.
        val need = battle.config.roundsToWin
        val pipW = layout.pipRadius * 2.4f
        val pipH = layout.pipRadius * 0.9f
        for (i in 0 until need) {
            val won = battle.roundsWon[0] > i
            p.rect(
                layout.playerPipX - i * layout.pipGap - pipW, layout.pipY - pipH * 0.5f, pipW, pipH,
                if (won) 0.45f else 0.22f, if (won) 1f else 0.3f, if (won) 0.65f else 0.28f, if (won) 1f else 0.55f,
            )
            val enemyWon = battle.roundsWon[1] > i
            p.rect(
                layout.enemyPipX + i * layout.pipGap, layout.pipY - pipH * 0.5f, pipW, pipH,
                if (enemyWon) 1f else 0.3f, if (enemyWon) 0.4f else 0.24f, if (enemyWon) 0.28f else 0.24f,
                if (enemyWon) 1f else 0.55f,
            )
        }
    }

    private fun drawGauges(p: HudPainter, m: Mech) {
        val boost = layout.boost
        val low = m.boost < m.spec.dashCost
        p.gauge(
            boost.x, boost.y, boost.w, boost.h, m.boost, m.boost, 4,
            if (low) 0.95f else 0.30f, if (low) 0.45f else 0.85f, if (low) 0.85f else 1f,
        )
        p.text(
            "BOOST", boost.right + layout.unit * 0.014f, boost.y - boost.h * 0.1f,
            boost.h * 1.05f, 0.6f, 0.82f, 0.9f, 0.85f,
        )

        for ((i, slot) in listOf(WeaponSlot.RIGHT, WeaponSlot.LEFT, WeaponSlot.CENTER).withIndex()) {
            val box = layout.ammo[i]
            val amount = m.ammoOf(slot)
            val spec = m.spec.weapon(slot, m.stance)
            val ready = amount >= spec.ammoCost
            p.gauge(
                box.x, box.y, box.w, box.h, amount, amount, maxOf(1, (1f / spec.ammoCost).toInt()),
                if (ready) 0.98f else 0.42f, if (ready) 0.76f else 0.34f, if (ready) 0.26f else 0.26f,
            )
            val name = when (slot) {
                WeaponSlot.RIGHT -> "RW"
                WeaponSlot.LEFT -> "LW"
                WeaponSlot.CENTER -> "CW"
            }
            p.text(
                name, box.cx, box.bottom + layout.unit * 0.005f, box.h * 0.9f,
                if (ready) 0.85f else 0.5f, if (ready) 0.88f else 0.5f, 0.8f, 0.85f, centered = true,
            )
        }

        p.text(
            m.spec.weapon(WeaponSlot.RIGHT, m.stance).name, layout.weaponName.x,
            layout.weaponName.y + layout.unit * 0.016f, layout.textSmall * 0.92f,
            0.95f, 0.82f, 0.42f, 0.85f,
        )
    }

    private fun drawRadar(p: HudPainter, battle: Battle) {
        val r = layout.radar.r
        val cx = layout.radar.cx
        val cy = layout.radar.cy
        p.disc(cx, cy, r * 1.02f, 0.03f, 0.07f, 0.05f, 0.55f)
        p.ring(cx, cy, r, 0.45f, 0.9f, 0.6f, 0.6f)
        p.ring(cx, cy, r * 0.55f, 0.4f, 0.8f, 0.5f, 0.28f)
        // Cross hairs and the forward cone.
        p.rect(cx - r, cy - r * 0.012f, r * 2f, r * 0.024f, 0.4f, 0.8f, 0.5f, 0.28f)
        p.rect(cx - r * 0.012f, cy - r, r * 0.024f, r * 2f, 0.4f, 0.8f, 0.5f, 0.28f)
        val sweepX = cx + sin(radarSweep) * r * 0.5f
        val sweepY = cy - cos(radarSweep) * r * 0.5f
        p.disc(sweepX, sweepY, r * 0.10f, 0.55f, 1f, 0.7f, 0.35f)

        val player = battle.player
        val enemy = battle.enemy
        val rel = enemy.pos - player.pos
        val forward = forwardOf(player.yaw)
        val right = rightOf(player.yaw)
        val scale = r / battle.arena.halfSize
        val bx = clamp(cx + rel.dot(right) * scale, cx - r * 0.92f, cx + r * 0.92f)
        val by = clamp(cy - rel.dot(forward) * scale, cy - r * 0.92f, cy + r * 0.92f)
        val locked = battle.lockClear
        p.disc(bx, by, r * 0.15f, 1f, if (locked) 0.30f else 0.55f, 0.22f, 0.98f)
        if (locked) p.ring(bx, by, r * 0.26f, 1f, 0.4f, 0.3f, 0.7f)
        p.disc(cx, cy, r * 0.09f, 0.55f, 1f, 0.65f, 0.95f)
        if (abs(enemy.pos.y - player.pos.y) > 1.5f) {
            val up = enemy.pos.y > player.pos.y
            p.text(if (up) "^" else "v", bx, by - r * 0.42f, r * 0.34f, 1f, 0.6f, 0.4f, 0.95f, centered = true)
        }
    }

    private fun drawReticle(p: HudPainter, battle: Battle, screenOf: (Vec3) -> FloatArray?) {
        if (!battle.enemy.alive) return
        val sp = screenOf(battle.enemy.center) ?: return
        val x = sp[0]
        val y = sp[1]
        val charge = battle.lockCharge
        val size = layout.unit * (0.155f - 0.07f * charge)
        val locked = battle.lockClear && charge > 0.95f
        val r = if (locked) 1f else 0.55f
        val g = if (locked) 0.32f else 0.88f
        val b = if (locked) 0.22f else 0.62f
        val t = layout.unit * 0.0055f
        val arm = size * 0.38f

        for (sx in intArrayOf(-1, 1)) {
            for (sy in intArrayOf(-1, 1)) {
                val bx = x + sx * size * 0.5f
                val by = y + sy * size * 0.5f
                p.rect(bx - if (sx > 0) arm else 0f, by, arm, t, r, g, b, 0.95f)
                p.rect(bx, by - if (sy > 0) arm else 0f, t, arm, r, g, b, 0.95f)
            }
        }
        if (locked) {
            // Locked: a ring plus four ticks spinning slowly around the target.
            p.ring(x, y, size * 0.30f, r, g, b, 0.85f)
            for (i in 0 until 4) {
                val a = lockPulse * 0.8f + i * 1.5708f
                val tx = x + sin(a) * size * 0.46f
                val ty = y - cos(a) * size * 0.46f
                p.rect(tx - t, ty - t, t * 2f, t * 2f, r, g, b, 0.9f)
            }
        }
        val dist = battle.player.center.flatDistanceTo(battle.enemy.center)
        p.text(
            "${dist.toInt()}M", x, y - size * 0.72f, layout.textSmall * 0.78f,
            r, g, b, 0.9f, centered = true,
        )
    }

    private fun drawDamageEdge(p: HudPainter, m: Mech) {
        val flash = m.tookDamageFlash
        val low = if (m.armorFraction < 0.25f) 0.35f + 0.25f * sin(radarSweep * 3f) else 0f
        val a = maxOf(flash * 0.35f, low * 0.22f)
        if (a <= 0.01f) return
        val t = layout.unit * 0.055f
        val w = layout.width
        val h = layout.height
        p.rect(0f, 0f, w, t, 1f, 0.18f, 0.12f, a)
        p.rect(0f, h - t, w, t, 1f, 0.18f, 0.12f, a)
        p.rect(0f, 0f, t, h, 1f, 0.18f, 0.12f, a)
        p.rect(w - t, 0f, t, h, 1f, 0.18f, 0.12f, a)
    }

    /**
     * The machine's card on the title screen: designation, name, and the four
     * numbers that actually decide how it plays.
     */
    fun drawSpecCard(
        p: HudPainter,
        spec: com.rollerdash.arena.core.AtSpec,
        x: Float,
        y: Float,
        w: Float,
        unit: Float,
    ) {
        val pad = unit * 0.022f
        val labelSize = unit * 0.030f
        val barH = unit * 0.020f
        val rowH = barH + labelSize * 1.5f
        val h = pad * 2f + unit * 0.055f + unit * 0.075f + rowH * 4f

        p.rect(x, y, w, h, 0.02f, 0.035f, 0.035f, 0.72f)
        p.rect(x, y, w, unit * 0.004f, 0.95f, 0.7f, 0.3f, 0.7f)
        p.text(spec.codeName, x + pad, y + pad, labelSize, 0.95f, 0.72f, 0.3f, 0.95f)
        p.text(spec.displayName, x + pad, y + pad + labelSize * 1.5f, unit * 0.052f, 0.92f, 0.96f, 0.92f, 1f)

        val rw = spec.weapon(
            com.rollerdash.arena.core.WeaponSlot.RIGHT,
            com.rollerdash.arena.core.Stance.GROUND,
        )
        val cw = spec.weapon(
            com.rollerdash.arena.core.WeaponSlot.CENTER,
            com.rollerdash.arena.core.Stance.GROUND,
        )
        val stats = listOf(
            "ARMOR" to spec.armor / 1500f,
            "SPEED" to spec.dashSpeed / 35f,
            "BOOST" to spec.boostRegen / 0.34f,
            "POWER" to (rw.damage * rw.shots + cw.damage) / 620f,
        )
        var barY = y + pad + unit * 0.055f + unit * 0.075f
        for ((label, valueRaw) in stats) {
            val value = clamp(valueRaw, 0.06f, 1f)
            p.text(label, x + pad, barY, labelSize, 0.72f, 0.82f, 0.76f, 0.9f)
            val barX = x + pad + unit * 0.13f
            val barW = w - (barX - x) - pad
            p.gauge(barX, barY, barW, barH, value, value, 5, 0.95f, 0.78f, 0.32f)
            barY += rowH
        }
    }

    private fun drawBanner(p: HudPainter) {
        if (bannerTimer <= 0f) return
        val a = clamp(bannerTimer * 1.6f, 0f, 1f)
        val y = layout.height * 0.24f
        val size = layout.unit * (0.125f + bannerPunch * 0.05f)
        val w = p.font.measure(banner, size)
        // Dark strip behind the word, so it reads over any background.
        p.rect(
            layout.width * 0.5f - w * 0.62f, y - size * 0.22f, w * 1.24f, size * 1.35f,
            0.02f, 0.03f, 0.03f, 0.5f * a,
        )
        p.rect(layout.width * 0.5f - w * 0.62f, y - size * 0.22f, w * 1.24f, layout.unit * 0.004f, 1f, 0.8f, 0.4f, a)
        p.text(banner, layout.width * 0.5f, y, size, 1f, 0.9f, 0.5f, a, centered = true)
        if (bannerSub.isNotEmpty()) {
            p.text(
                bannerSub, layout.width * 0.5f, y + size * 1.25f, layout.unit * 0.045f,
                0.9f, 0.95f, 0.85f, a, centered = true,
            )
        }
    }
}
