package com.rollerdash.arena.ui

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
 */
class Menu(private val rows: List<MenuRow>) {
    var cursor = 0
        private set

    private var w = 0f
    private var h = 0f
    private var unit = 0f
    private var rowH = 0f
    private var top = 0f

    fun layout(width: Int, height: Int) {
        w = width.toFloat()
        h = height.toFloat()
        unit = minOf(w * 0.5f, h)
        rowH = unit * 0.115f
        top = h * 0.42f - rows.size * rowH * 0.5f
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
        val index = ((y - top) / rowH).toInt()
        if (index < 0 || index >= rows.size) return false
        cursor = index
        val row = rows[index]
        val left = w * 0.5f - unit * 0.42f
        val right = w * 0.5f + unit * 0.42f
        when {
            row.isAction -> row.onSelect()
            x < left + (right - left) * 0.33f -> row.onChange(-1)
            x > left + (right - left) * 0.67f -> row.onChange(1)
            else -> row.onChange(1)
        }
        return true
    }

    fun draw(p: HudPainter, title: String, subtitle: String, footer: String) {
        p.rect(0f, 0f, w, h, 0.03f, 0.04f, 0.04f, 0.78f)
        p.text(title, w * 0.5f, h * 0.10f, unit * 0.12f, 1f, 0.86f, 0.42f, 1f, centered = true)
        p.text(subtitle, w * 0.5f, h * 0.10f + unit * 0.15f, unit * 0.042f, 0.8f, 0.9f, 0.8f, 0.9f, centered = true)

        val left = w * 0.5f - unit * 0.42f
        val width = unit * 0.84f
        for ((i, row) in rows.withIndex()) {
            val y = top + i * rowH
            val selected = i == cursor
            val a = if (selected) 0.30f else 0.14f
            p.rect(left, y, width, rowH * 0.86f, 0.35f, 0.55f, 0.42f, a)
            if (selected) p.frame(left, y, width, rowH * 0.86f, unit * 0.005f, 0.7f, 1f, 0.7f, 0.85f)
            val ts = unit * 0.048f
            val ty = y + rowH * 0.43f - ts * 0.5f
            if (row.isAction) {
                p.text(row.label, w * 0.5f, ty, ts * 1.15f, 1f, 0.95f, 0.6f, 1f, centered = true)
            } else {
                p.text(row.label, left + unit * 0.03f, ty, ts, 0.75f, 0.85f, 0.78f, 0.95f)
                p.text(row.value(), left + width - unit * 0.03f, ty, ts, 1f, 0.92f, 0.55f, 1f, rightAligned = true)
                if (selected) {
                    p.text("<", left + width * 0.5f - unit * 0.16f, ty, ts, 0.7f, 1f, 0.7f, 0.8f, centered = true)
                    p.text(">", left + width * 0.5f + unit * 0.16f, ty, ts, 0.7f, 1f, 0.7f, 0.8f, centered = true)
                }
            }
        }
        val detail = rows[cursor].detail()
        if (detail.isNotEmpty()) {
            p.text(detail, w * 0.5f, top + rows.size * rowH + unit * 0.03f, unit * 0.036f,
                0.7f, 0.85f, 0.75f, 0.9f, centered = true)
        }
        p.text(footer, w * 0.5f, h * 0.90f, unit * 0.038f, 0.65f, 0.8f, 0.65f, 0.85f, centered = true)
    }
}
