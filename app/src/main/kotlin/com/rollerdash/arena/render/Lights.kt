package com.rollerdash.arena.render

import com.rollerdash.arena.core.Vec3

/**
 * A tiny pool of short-lived point lights, so a muzzle flash or a blast actually
 * throws light onto the machines and the ground instead of hanging in front of
 * them like a sticker. Four slots is all a mobile fragment shader wants; the
 * brightest live ones win.
 */
class Lights(private val slots: Int = 4) {
    private val x = FloatArray(slots)
    private val y = FloatArray(slots)
    private val z = FloatArray(slots)
    private val r = FloatArray(slots)
    private val g = FloatArray(slots)
    private val b = FloatArray(slots)
    private val radius = FloatArray(slots)
    private val life = FloatArray(slots)
    private val maxLife = FloatArray(slots)
    private val power = FloatArray(slots)

    /** Packed for the shader: xyz position, w radius. */
    val positions = FloatArray(slots * 4)

    /** Packed for the shader: rgb colour scaled by the current intensity. */
    val colors = FloatArray(slots * 3)

    fun add(pos: Vec3, cr: Float, cg: Float, cb: Float, intensity: Float, rad: Float, seconds: Float) {
        var slot = -1
        var weakest = Float.MAX_VALUE
        for (i in 0 until slots) {
            if (life[i] <= 0f) { slot = i; break }
            val strength = power[i] * (life[i] / maxLife[i])
            if (strength < weakest) { weakest = strength; slot = i }
        }
        if (slot < 0) return
        // Do not stamp on a light that is currently brighter than this one.
        if (life[slot] > 0f && weakest > intensity) return
        x[slot] = pos.x; y[slot] = pos.y; z[slot] = pos.z
        r[slot] = cr; g[slot] = cg; b[slot] = cb
        radius[slot] = rad
        power[slot] = intensity
        life[slot] = seconds
        maxLife[slot] = seconds
    }

    fun update(dt: Float) {
        for (i in 0 until slots) {
            if (life[i] > 0f) life[i] -= dt
            val t = if (life[i] > 0f) life[i] / maxLife[i] else 0f
            // Quick decay: a flash is mostly over in the first third of its life.
            val fall = t * t
            positions[i * 4] = x[i]
            positions[i * 4 + 1] = y[i]
            positions[i * 4 + 2] = z[i]
            positions[i * 4 + 3] = if (life[i] > 0f) radius[i] else 0f
            colors[i * 3] = r[i] * power[i] * fall
            colors[i * 3 + 1] = g[i] * power[i] * fall
            colors[i * 3 + 2] = b[i] * power[i] * fall
        }
    }

    fun clear() {
        for (i in 0 until slots) life[i] = 0f
        update(0f)
    }
}
