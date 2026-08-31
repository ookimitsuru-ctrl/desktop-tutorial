package com.rollerdash.arena.core

import kotlin.math.min
import kotlin.math.sqrt

/** Axis-aligned screen rectangle, y growing downward as it does on a display. */
data class Rect(val x: Float, val y: Float, val w: Float, val h: Float) {
    val right: Float get() = x + w
    val bottom: Float get() = y + h
    val cx: Float get() = x + w * 0.5f
    val cy: Float get() = y + h * 0.5f

    fun overlaps(o: Rect, gap: Float = 0f): Boolean =
        x < o.right + gap && o.x < right + gap && y < o.bottom + gap && o.y < bottom + gap

    fun insideScreen(width: Float, height: Float, margin: Float = 0f): Boolean =
        x >= margin && y >= margin && right <= width - margin && bottom <= height - margin
}

/** A round control or gauge. */
data class Disc(val cx: Float, val cy: Float, val r: Float) {
    fun bounds() = Rect(cx - r, cy - r, r * 2f, r * 2f)

    fun overlaps(o: Disc, gap: Float = 0f): Boolean {
        val dx = cx - o.cx
        val dy = cy - o.cy
        val min = r + o.r + gap
        return dx * dx + dy * dy < min * min
    }

    fun insideScreen(width: Float, height: Float, margin: Float = 0f) = bounds().insideScreen(width, height, margin)
}

enum class ControlButton { FIRE_R, FIRE_L, FIRE_C, JUMP, DASH, GUARD, TURBO_L, TURBO_R, MENU }

/**
 * How much of the picture the device is asked to draw. The pipeline is a real
 * one - shadow map, floating point scene, bloom, FXAA - and an older handset
 * should be able to drop the expensive parts rather than the frame rate.
 */
enum class Quality(val label: String, val shadows: Boolean, val bloom: Boolean, val antialias: Boolean) {
    HIGH("HIGH", true, true, true),
    BALANCED("BALANCED", true, true, false),
    PERFORMANCE("PERFORMANCE", false, false, false),
}

enum class ControlScheme {
    /** One stick to move, drag to turn, weapon buttons under the other thumb. */
    MODERN,

    /** The cabinet layout: two levers, two triggers, two turbo buttons. */
    TWIN_STICK,
}

/**
 * Where everything sits on screen.
 *
 * All three layouts below are plain arithmetic on the surface size, kept in the
 * simulation module on purpose: a phone screen is the one thing hardest to try
 * out from here, so the placement is unit tested instead - nothing off screen,
 * nothing overlapping, across every aspect ratio a handset is likely to have.
 */
class HudLayout(val width: Float, val height: Float) {
    /** Reference size that keeps proportions sane on very wide screens. */
    val unit = min(width * 0.55f, height)
    val pad = unit * 0.035f

    val barWidth = min(width * 0.26f, unit * 0.62f)
    val barHeight = unit * 0.048f
    val textSmall = unit * 0.034f
    val textMedium = unit * 0.042f

    /** Pause button, alone in the top-right corner and out of the thumbs' way. */
    val menu = Disc(width - pad - unit * 0.05f, pad + unit * 0.05f, unit * 0.05f)

    val playerArmor = Rect(pad, pad, barWidth, barHeight)
    val enemyArmor = Rect(menu.cx - menu.r - pad - barWidth, pad, barWidth, barHeight)

    /** Boost and magazines stack under the player's own armour, on the left. */
    val boost = Rect(pad, playerArmor.bottom + textSmall + unit * 0.022f, barWidth * 0.74f, unit * 0.026f)
    val ammo: List<Rect> = run {
        val gap = unit * 0.010f
        val each = (boost.w - gap * 2f) / 3f
        (0 until 3).map { Rect(boost.x + it * (each + gap), boost.bottom + unit * 0.028f, each, unit * 0.020f) }
    }
    val weaponName = Rect(boost.x, ammo[0].bottom + unit * 0.024f, boost.w, textSmall)

    /** Round clock, centred at the top with the round pips either side. */
    val timer = Rect(width * 0.5f - unit * 0.11f, pad * 0.5f, unit * 0.22f, unit * 0.135f)
    val pipRadius = unit * 0.017f
    val pipGap = pipRadius * 3f
    val pipY = timer.y + timer.h * 0.42f
    val playerPipX = timer.x - unit * 0.045f
    val enemyPipX = timer.right + unit * 0.045f

    /**
     * Small radar, tucked between the movement thumb and the centre of the
     * screen. The middle belongs to the machine you are driving - the old
     * bottom-centre radar sat right on top of it.
     */
    val radar = Disc(width * 0.34f, height - pad - unit * 0.075f, unit * 0.075f)

    /** Everything that must not collide, for the layout test. */
    fun boxes(): List<Pair<String, Rect>> = listOf(
        "menu" to menu.bounds(),
        "playerArmor" to playerArmor,
        "enemyArmor" to enemyArmor,
        "boost" to boost,
        "ammo0" to ammo[0], "ammo1" to ammo[1], "ammo2" to ammo[2],
        "weaponName" to weaponName,
        "timer" to timer,
        "radar" to radar.bounds(),
    )
}

/** One on-screen button: which control it is and where it lives. */
data class ButtonSlot(val id: ControlButton, val label: String, val disc: Disc)

/**
 * Thumb furniture. `mirrored` swaps the two halves for left-handed players.
 */
class ControlLayout(
    val width: Float,
    val height: Float,
    val scheme: ControlScheme,
    val mirrored: Boolean = false,
) {
    val unit = min(width * 0.55f, height)

    private fun flip(x: Float) = if (mirrored) width - x else x
    private fun disc(x: Float, y: Float, r: Float) = Disc(flip(x), y, r)

    private val stickRadius = unit * 0.165f
    private val stickY = height - unit * 0.255f

    /** Movement lever. */
    val moveStick = disc(unit * 0.285f, stickY, stickRadius)

    /** Second lever, twin-stick only. */
    val aimStick: Disc? =
        if (scheme == ControlScheme.TWIN_STICK) disc(width - unit * 0.285f, stickY, stickRadius) else null

    val buttons: List<ButtonSlot> = when (scheme) {
        ControlScheme.MODERN -> {
            // Two triggers under the thumb, the rest stepping up and to the left,
            // spaced so no two circles touch on any handset in the layout test.
            val rMain = unit * 0.092f
            val rSub = unit * 0.078f
            val rowOne = height - unit * 0.200f
            val rowTwo = height - unit * 0.425f
            val rightX = width - unit * 0.155f
            listOf(
                ButtonSlot(ControlButton.FIRE_R, "RW", disc(rightX, rowOne, rMain)),
                ButtonSlot(ControlButton.FIRE_L, "LW", disc(rightX - unit * 0.245f, rowOne, rMain)),
                ButtonSlot(ControlButton.DASH, "DASH", disc(width - unit * 0.145f, rowTwo, rSub)),
                ButtonSlot(ControlButton.FIRE_C, "CW", disc(width - unit * 0.345f, rowTwo, rSub)),
                ButtonSlot(ControlButton.JUMP, "JUMP", disc(width - unit * 0.245f, height - unit * 0.630f, rSub)),
                ButtonSlot(ControlButton.GUARD, "GUARD", disc(width - unit * 0.560f, height - unit * 0.300f, unit * 0.070f)),
            )
        }
        ControlScheme.TWIN_STICK -> {
            // Trigger above each lever, turbo inboard of it - index fingers on the
            // triggers, thumbs on the levers, as the cabinet had it.
            val r = unit * 0.090f
            val triggerY = stickY - unit * 0.280f
            listOf(
                ButtonSlot(ControlButton.FIRE_L, "LT", disc(unit * 0.145f, triggerY, r)),
                ButtonSlot(ControlButton.TURBO_L, "L.TB", disc(unit * 0.400f, triggerY - unit * 0.075f, r)),
                ButtonSlot(ControlButton.FIRE_R, "RT", disc(width - unit * 0.145f, triggerY, r)),
                ButtonSlot(ControlButton.TURBO_R, "R.TB", disc(width - unit * 0.400f, triggerY - unit * 0.075f, r)),
                ButtonSlot(ControlButton.GUARD, "GD", disc(width - unit * 0.640f, triggerY - unit * 0.020f, unit * 0.080f)),
            )
        }
    }

    fun discs(): List<Pair<String, Disc>> =
        listOfNotNull(
            "moveStick" to moveStick,
            aimStick?.let { "aimStick" to it },
        ) + buttons.map { it.id.name to it.disc }
}

/** Where a menu sits: filling the screen, or as a panel down one side. */
enum class MenuAlign { CENTER, LEFT }

/**
 * Menu screens. Rows shrink to fit rather than running into the title or the
 * footer, which is what went wrong on a real handset.
 *
 * [MenuAlign.LEFT] puts the whole menu in a column on the left, which is how
 * the title screen keeps the machine you are choosing in view beside it.
 */
class MenuLayout(
    val width: Float,
    val height: Float,
    val rowCount: Int,
    val align: MenuAlign = MenuAlign.CENTER,
) {
    val unit = min(width * 0.55f, height)
    private val left = align == MenuAlign.LEFT

    val titleSize = unit * (if (left) 0.070f else 0.105f)
    val subtitleSize = unit * 0.036f
    val detailSize = unit * 0.032f
    val footerSize = unit * 0.034f
    val rowTextSize: Float

    val rowWidth = if (left) min(width * 0.44f, unit * 0.92f) else min(width * 0.66f, unit * 0.98f)
    private val columnX = if (left) unit * 0.06f else (width - rowWidth) * 0.5f

    val title = Rect(columnX, height * (if (left) 0.075f else 0.055f), rowWidth, titleSize)
    val subtitle = Rect(columnX, title.bottom + unit * 0.022f, rowWidth, subtitleSize)
    val footer = Rect(
        if (left) columnX else 0f, height - unit * 0.05f - footerSize,
        if (left) rowWidth else width, footerSize,
    )

    val rowGap = unit * 0.013f
    val rows: List<Rect>
    val detail: Rect

    /** Panel drawn behind the column, when there is one. */
    val panel: Rect?

    init {
        val top = subtitle.bottom + unit * 0.04f
        val detailHeight = detailSize * 1.8f
        val available = footer.y - unit * 0.03f - top - detailHeight
        val rowHeight = min(unit * 0.094f, (available - rowGap * (rowCount - 1)) / rowCount)
        rows = (0 until rowCount).map {
            Rect(columnX, top + it * (rowHeight + rowGap), rowWidth, rowHeight)
        }
        rowTextSize = rowHeight * 0.44f
        val lastBottom = rows.lastOrNull()?.bottom ?: top
        detail = Rect(columnX, lastBottom + unit * 0.018f, rowWidth, detailSize)
        panel = if (left) {
            Rect(0f, 0f, columnX + rowWidth + unit * 0.06f, height)
        } else {
            null
        }
    }

    fun boxes(): List<Pair<String, Rect>> =
        listOf("title" to title, "subtitle" to subtitle) +
            rows.mapIndexed { i, r -> "row$i" to r } +
            listOf("detail" to detail, "footer" to footer)
}
