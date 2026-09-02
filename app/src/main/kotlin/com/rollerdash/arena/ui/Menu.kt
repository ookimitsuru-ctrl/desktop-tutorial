package com.rollerdash.arena.ui

import com.rollerdash.arena.core.MenuAlign
import com.rollerdash.arena.core.MenuLayout
import com.rollerdash.arena.render.HudPainter

/** One selectable line: a label, the current value, and how to change it. */
class MenuRow(
    val label: String,
    val value: () -> String,
    val onChange: (Int) -> Unit = {},
    val onSelect: () -> Unit = {},
    val isAction: Boolean = false,
    val detail: () -> String = { "" },
)

/**
 * A tap-driven menu. Tapping the left third of a row steps its value back, the
 * right third steps it forward, and the middle selects. Works the same for a
 * gamepad d-pad via [moveCursor] / [activate].
 *
 * Geometry comes from [MenuLayout], which shrinks the rows to fit rather than
 * letting them run into the title or the footer.
 */
class Menu(private val rows: List<MenuRow>, private val align: MenuAlign = MenuAlign.CENTER) {

    private companion object {
        /** The blurb gets two lines; anything more collides with the footer. */
        const val MAX_DETAIL_LINES = 2
    }

    var cursor = 0
        private set

    private var layout: MenuLayout? = null

    fun layout(width: Int, height: Int) {
        layout = MenuLayout(width.toFloat(), height.toFloat(), rows.size, align)
    }

    fun moveCursor(delta: Int) {
        cursor = (cursor + delta + rows.size) % rows.size
    }

    fun change(delta: Int) = rows[cursor].onChange(delta)

    fun activate() {
        val row = rows[cursor]
        if (row.isAction) row.onSelect() else row.onChange(1)
    }

    /** Routes a tap. Returns true when the menu handled it. */
    fun onTap(x: Float, y: Float): Boolean {
        val l = layout ?: return false
        val index = l.rows.indexOfFirst { y >= it.y && y <= it.bottom }
        if (index < 0) return false
        val rect = l.rows[index]
        if (x < rect.x || x > rect.right) return false
        cursor = index
        val row = rows[index]
        when {
            row.isAction -> row.onSelect()
            x < rect.x + rect.w * 0.33f -> row.onChange(-1)
            else -> row.onChange(1)
        }
        return true
    }

    private fun wrap(text: String, maxWidth: Float, size: Float, p: HudPainter): List<String> {
        val words = text.split(' ')
        val lines = ArrayList<String>(2)
        var current = StringBuilder()
        for (word in words) {
            val candidate = if (current.isEmpty()) word else "$current $word"
            if (p.font.measure(candidate, size) > maxWidth && current.isNotEmpty()) {
                lines += current.toString()
                current = StringBuilder(word)
                if (lines.size == MAX_DETAIL_LINES) {
                    // Out of room: say so rather than stopping mid-sentence,
                    // giving back a word if the dots no longer fit the column.
                    var last = lines.last()
                    while (last.contains(' ') && p.font.measure("$last...", size) > maxWidth) {
                        last = last.substringBeforeLast(' ')
                    }
                    lines[lines.lastIndex] = "$last..."
                    current = StringBuilder()
                    break
                }
            } else {
                current = StringBuilder(candidate)
            }
        }
        if (lines.size < MAX_DETAIL_LINES && current.isNotEmpty()) lines += current.toString()
        return lines
    }

    fun draw(p: HudPainter, title: String, subtitle: String, footer: String) {
        val l = layout ?: return
        val panel = l.panel
        if (panel != null) {
            // Side panel: the machine stays on show next to the menu.
            p.rect(panel.x, panel.y, panel.w, panel.h, 0.02f, 0.035f, 0.035f, 0.80f)
            p.rect(panel.right - l.unit * 0.004f, panel.y, l.unit * 0.004f, panel.h, 0.95f, 0.7f, 0.3f, 0.55f)
        } else {
            p.rect(0f, 0f, l.width, l.height, 0.03f, 0.04f, 0.04f, 0.80f)
        }
        val centred = panel == null
        val textX = if (centred) l.width * 0.5f else l.title.x
        p.text(title, textX, l.title.y, l.titleSize, 1f, 0.86f, 0.42f, 1f, centered = centred)
        p.text(subtitle, textX, l.subtitle.y, l.subtitleSize, 0.8f, 0.9f, 0.8f, 0.9f, centered = centred)
        if (!centred) {
            p.rect(l.title.x, l.subtitle.bottom + l.unit * 0.012f, l.rowWidth * 0.55f, l.unit * 0.004f, 0.95f, 0.7f, 0.3f, 0.7f)
        }

        for ((i, row) in rows.withIndex()) {
            val rect = l.rows[i]
            val selected = i == cursor
            p.rect(rect.x, rect.y, rect.w, rect.h, 0.35f, 0.55f, 0.42f, if (selected) 0.32f else 0.14f)
            if (selected) {
                p.frame(rect.x, rect.y, rect.w, rect.h, l.unit * 0.005f, 0.7f, 1f, 0.7f, 0.85f)
            }
            val ts = l.rowTextSize
            val ty = rect.cy - ts * 0.5f
            if (row.isAction) {
                p.text(row.label, rect.cx, ty, ts * 1.15f, 1f, 0.95f, 0.6f, 1f, centered = true)
            } else {
                p.text(row.label, rect.x + l.unit * 0.028f, ty, ts, 0.75f, 0.85f, 0.78f, 0.95f)
                p.text(row.value(), rect.right - l.unit * 0.028f, ty, ts, 1f, 0.92f, 0.55f, 1f, rightAligned = true)
                if (selected) {
                    p.text("<", rect.x + rect.w * 0.60f, ty, ts, 0.7f, 1f, 0.7f, 0.85f, centered = true)
                    p.text(">", rect.right - l.unit * 0.075f, ty, ts, 0.7f, 1f, 0.7f, 0.85f, centered = true)
                }
            }
        }

        val detail = rows[cursor].detail()
        if (detail.isNotEmpty()) {
            // Wrap to the column: the blurbs are long enough to run off it.
            val maxWidth = if (centred) l.width * 0.8f else l.rowWidth
            var lineY = l.detail.y
            for (line in wrap(detail, maxWidth, l.detailSize, p)) {
                p.text(line, textX, lineY, l.detailSize, 0.7f, 0.85f, 0.75f, 0.9f, centered = centred)
                lineY += l.detailSize * 1.35f
            }
        }
        p.text(
            footer, if (centred) l.width * 0.5f else l.footer.x, l.footer.y, l.footerSize,
            0.65f, 0.8f, 0.65f, 0.85f, centered = centred,
        )
    }
}
