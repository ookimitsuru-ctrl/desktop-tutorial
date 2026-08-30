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
 * The combat display. Everything is anchored to [HudLayout], which keeps the
 * clusters apart: your own status on the left, the enemy on the right, the clock
 * up top and only the radar in the middle.
 */
class Hud {
    private var layout = HudLayout(1f, 1f)
    private var radarSweep = 0f
    private var bannerTimer = 0f
    private var banner = ""
    private var bannerSub = ""

    fun layout(width: Int, height: Int) {
        layout = HudLayout(width.toFloat(), height.toFloat())
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
        drawArmorBar(p, layout.playerArmor, battle.player, mirrored = false)
        drawArmorBar(p, layout.enemyArmor, battle.enemy, mirrored = true)
        drawClock(p, battle)
        drawGauges(p, battle.player)
        drawRadar(p, battle)
        drawReticle(p, battle, screenOf)
        drawDamageEdge(p, battle.player)
        drawBanner(p)
        if (fps > 0f) {
            p.text(
                "${fps.toInt()}FPS", layout.width - layout.pad, layout.height - layout.textSmall * 1.4f,
                layout.textSmall * 0.85f, 0.5f, 0.6f, 0.55f, 0.45f, rightAligned = true,
            )
        }
    }

    private fun drawArmorBar(p: HudPainter, box: com.rollerdash.arena.core.Rect, m: Mech, mirrored: Boolean) {
        val frac = m.armorFraction
        val warn = frac < 0.3f
        val r = if (warn) 1.0f else 0.45f
        val g = if (warn) 0.35f else 0.95f
        val b = if (warn) 0.25f else 0.55f
        p.rect(box.x, box.y, box.w, box.h, 0.05f, 0.07f, 0.06f, 0.6f)
        val fillW = box.w * frac
        if (mirrored) {
            p.rect(box.right - fillW, box.y, fillW, box.h, r, g, b, 0.92f)
        } else {
            p.rect(box.x, box.y, fillW, box.h, r, g, b, 0.92f)
        }
        p.frame(box.x, box.y, box.w, box.h, layout.unit * 0.005f, 0.75f, 0.85f, 0.78f, 0.7f)

        val segs = maxOf(1, (m.spec.armor / 250f).toInt())
        for (i in 1 until segs) {
            p.rect(box.x + box.w * (i.toFloat() / segs), box.y, layout.unit * 0.004f, box.h, 0.1f, 0.12f, 0.1f, 0.6f)
        }
        val label = "${m.spec.displayName}  ${ceil(m.hp).toInt()}"
        val ty = box.bottom + layout.unit * 0.010f
        if (mirrored) {
            p.text(label, box.right, ty, layout.textSmall, 0.85f, 0.95f, 0.85f, 0.9f, rightAligned = true)
        } else {
            p.text(label, box.x, ty, layout.textSmall, 0.85f, 0.95f, 0.85f, 0.9f)
        }
    }

    private fun drawClock(p: HudPainter, battle: Battle) {
        val box = layout.timer
        val secs = ceil(battle.timeLeft).toInt().coerceAtLeast(0)
        val urgent = secs <= 10
        p.text(
            secs.toString().padStart(2, '0'), box.cx, box.y, box.h * 0.86f,
            if (urgent) 1f else 0.9f, if (urgent) 0.4f else 0.98f, if (urgent) 0.3f else 0.85f, 1f,
            centered = true,
        )
        p.text(
            "ROUND ${battle.roundNumber}", box.cx, box.bottom - layout.textSmall * 0.2f,
            layout.textSmall * 0.9f, 0.75f, 0.85f, 0.78f, 0.9f, centered = true,
        )
        val need = battle.config.roundsToWin
        for (i in 0 until need) {
            val won = battle.roundsWon[0] > i
            p.disc(
                layout.playerPipX - i * layout.pipGap, layout.pipY, layout.pipRadius,
                if (won) 0.4f else 0.25f, if (won) 1f else 0.3f, if (won) 0.6f else 0.28f, if (won) 1f else 0.6f,
            )
            val enemyWon = battle.roundsWon[1] > i
            p.disc(
                layout.enemyPipX + i * layout.pipGap, layout.pipY, layout.pipRadius,
                if (enemyWon) 1f else 0.3f, if (enemyWon) 0.45f else 0.25f, if (enemyWon) 0.3f else 0.25f,
                if (enemyWon) 1f else 0.6f,
            )
        }
    }

    private fun drawGauges(p: HudPainter, m: Mech) {
        val boost = layout.boost
        p.rect(boost.x, boost.y, boost.w, boost.h, 0.05f, 0.07f, 0.06f, 0.55f)
        val low = m.boost < m.spec.dashCost
        p.rect(
            boost.x, boost.y, boost.w * m.boost, boost.h,
            if (low) 0.9f else 0.35f, if (low) 0.4f else 0.85f, if (low) 0.9f else 1f, 0.9f,
        )
        p.text(
            "BOOST", boost.right + layout.unit * 0.012f, boost.y - boost.h * 0.15f,
            boost.h * 1.1f, 0.7f, 0.85f, 0.9f, 0.8f,
        )

        for ((i, slot) in listOf(WeaponSlot.RIGHT, WeaponSlot.LEFT, WeaponSlot.CENTER).withIndex()) {
            val box = layout.ammo[i]
            val amount = m.ammoOf(slot)
            val ready = amount >= m.spec.weapon(slot, m.stance).ammoCost
            p.rect(box.x, box.y, box.w, box.h, 0.05f, 0.07f, 0.06f, 0.55f)
            p.rect(
                box.x, box.y, box.w * amount, box.h,
                if (ready) 0.95f else 0.5f, if (ready) 0.8f else 0.35f, 0.3f, 0.9f,
            )
            val name = when (slot) {
                WeaponSlot.RIGHT -> "RW"
                WeaponSlot.LEFT -> "LW"
                WeaponSlot.CENTER -> "CW"
            }
            p.text(name, box.cx, box.bottom + layout.unit * 0.004f, box.h * 0.95f, 0.8f, 0.85f, 0.8f, 0.8f, centered = true)
        }

        p.text(
            m.spec.weapon(WeaponSlot.RIGHT, m.stance).name, layout.weaponName.x,
            layout.weaponName.y + layout.unit * 0.014f, layout.textSmall * 0.9f,
            0.8f, 0.9f, 0.7f, 0.8f,
        )
    }

    private fun drawRadar(p: HudPainter, battle: Battle) {
        val r = layout.radar.r
        val cx = layout.radar.cx
        val cy = layout.radar.cy
        p.disc(cx, cy, r, 0.05f, 0.12f, 0.08f, 0.40f)
        p.ring(cx, cy, r, 0.5f, 0.9f, 0.6f, 0.55f)
        p.ring(cx, cy, r * 0.5f, 0.4f, 0.8f, 0.5f, 0.28f)
        p.disc(cx + sin(radarSweep) * r * 0.46f, cy - cos(radarSweep) * r * 0.46f, r * 0.09f, 0.6f, 1f, 0.7f, 0.32f)

        val player = battle.player
        val enemy = battle.enemy
        // Player-up radar: project the offset onto the machine's own axes.
        val rel = enemy.pos - player.pos
        val forward = forwardOf(player.yaw)
        val right = rightOf(player.yaw)
        val scale = r / battle.arena.halfSize
        val bx = clamp(cx + rel.dot(right) * scale, cx - r * 0.94f, cx + r * 0.94f)
        val by = clamp(cy - rel.dot(forward) * scale, cy - r * 0.94f, cy + r * 0.94f)
        val blip = if (battle.lockClear) 1f else 0.55f
        p.disc(bx, by, r * 0.13f, 1f, 0.35f * blip, 0.25f, 0.95f)
        p.disc(cx, cy, r * 0.09f, 0.5f, 1f, 0.6f, 0.95f)
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
        val size = layout.unit * (0.15f - 0.065f * charge)
        val locked = battle.lockClear && charge > 0.95f
        val r = if (locked) 1f else 0.6f
        val g = if (locked) 0.35f else 0.85f
        val b = if (locked) 0.25f else 0.6f
        val t = layout.unit * 0.006f
        val arm = size * 0.42f
        for (sx in intArrayOf(-1, 1)) {
            for (sy in intArrayOf(-1, 1)) {
                val bx = x + sx * size * 0.5f
                val by = y + sy * size * 0.5f
                p.rect(bx - if (sx > 0) arm else 0f, by, arm, t, r, g, b, 0.95f)
                p.rect(bx, by - if (sy > 0) arm else 0f, t, arm, r, g, b, 0.95f)
            }
        }
        if (locked) {
            p.ring(x, y, size * 0.28f, r, g, b, 0.8f)
        }
        val dist = battle.player.center.flatDistanceTo(battle.enemy.center)
        p.text("${dist.toInt()}M", x, y - size * 0.78f, layout.textSmall * 0.8f, r, g, b, 0.85f, centered = true)
    }

    private fun drawDamageEdge(p: HudPainter, m: Mech) {
        val flash = m.tookDamageFlash
        val low = if (m.armorFraction < 0.25f) 0.35f + 0.25f * sin(radarSweep * 4f) else 0f
        val a = maxOf(flash * 0.5f, low * 0.4f)
        if (a <= 0.01f) return
        val t = layout.unit * 0.05f
        val w = layout.width
        val h = layout.height
        p.rect(0f, 0f, w, t, 1f, 0.2f, 0.15f, a)
        p.rect(0f, h - t, w, t, 1f, 0.2f, 0.15f, a)
        p.rect(0f, 0f, t, h, 1f, 0.2f, 0.15f, a)
        p.rect(w - t, 0f, t, h, 1f, 0.2f, 0.15f, a)
    }

    private fun drawBanner(p: HudPainter) {
        if (bannerTimer <= 0f) return
        val a = clamp(bannerTimer * 1.6f, 0f, 1f)
        // High enough to clear the radar and the thumbs.
        val y = layout.height * 0.26f
        p.text(banner, layout.width * 0.5f, y, layout.unit * 0.13f, 1f, 0.92f, 0.55f, a, centered = true)
        if (bannerSub.isNotEmpty()) {
            p.text(
                bannerSub, layout.width * 0.5f, y + layout.unit * 0.15f, layout.unit * 0.048f,
                0.9f, 0.95f, 0.85f, a, centered = true,
            )
        }
    }
}
