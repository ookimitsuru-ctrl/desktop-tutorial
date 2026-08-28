package com.rollerdash.arena.render

import android.opengl.Matrix
import com.rollerdash.arena.core.Battle
import com.rollerdash.arena.core.Vec3
import com.rollerdash.arena.core.clamp
import com.rollerdash.arena.core.damp
import com.rollerdash.arena.core.forwardOf
import kotlin.math.cos
import kotlin.math.sin
import kotlin.random.Random

/**
 * Chase camera in the arcade tradition: it sits behind your machine and frames
 * both fighters, so the enemy stays on screen even when you dash past them.
 */
class Camera {
    val view = FloatArray(16)
    val proj = FloatArray(16)
    val viewProj = FloatArray(16)

    var position = Vec3(0f, 8f, -20f)
        private set
    private var lookAt = Vec3.ZERO
    private var orbit = 0f
    private val rng = Random(31)
    private var shakeX = 0f
    private var shakeY = 0f

    private var aspect = 1.6f
    private var viewportW = 1f
    private var viewportH = 1f

    fun resize(width: Int, height: Int) {
        viewportW = width.toFloat()
        viewportH = height.toFloat()
        aspect = if (height == 0) 1.6f else width.toFloat() / height.toFloat()
        Matrix.perspectiveM(proj, 0, 58f, aspect, 0.35f, 460f)
    }

    fun updateBattle(dt: Float, battle: Battle, shake: Float) {
        val player = battle.player
        val enemy = battle.enemy
        val toEnemy = Vec3(enemy.pos.x - player.pos.x, 0f, enemy.pos.z - player.pos.z)
        val dist = toEnemy.flatLength
        val back = if (dist > 1.5f) toEnemy.flatNormalized() else forwardOf(player.yaw)

        // Pull further out as the fight opens up, and lift with the player's jump.
        val range = 13.5f + clamp(dist * 0.14f, 0f, 7.5f)
        val height = 6.2f + player.pos.y * 0.85f + clamp(dist * 0.05f, 0f, 3f)
        val desired = player.center - back * range + Vec3(0f, height, 0f)
        val desiredLook = com.rollerdash.arena.core.lerp(
            player.center + Vec3(0f, 1.4f, 0f),
            enemy.center + Vec3(0f, 1.0f, 0f),
            0.34f,
        )

        position = damp(position, desired, 6.5f, dt)
        lookAt = damp(lookAt, desiredLook, 9f, dt)
        applyShake(dt, shake)
        buildMatrices()
    }

    /** Slow orbit used behind the menus. */
    fun updateOrbit(dt: Float, battle: Battle) {
        orbit += dt * 0.22f
        val center = battle.player.center
        val r = 17f
        val desired = center + Vec3(sin(orbit) * r, 7.5f, cos(orbit) * r)
        position = damp(position, desired, 3.5f, dt)
        lookAt = damp(lookAt, center + Vec3(0f, 0.8f, 0f), 4f, dt)
        shakeX = 0f
        shakeY = 0f
        buildMatrices()
    }

    private fun applyShake(dt: Float, shake: Float) {
        if (shake <= 0.01f) {
            shakeX = damp(shakeX, 0f, 12f, dt)
            shakeY = damp(shakeY, 0f, 12f, dt)
            return
        }
        val amp = shake * 0.55f
        shakeX = (rng.nextFloat() * 2f - 1f) * amp
        shakeY = (rng.nextFloat() * 2f - 1f) * amp
    }

    private fun buildMatrices() {
        val px = position.x + shakeX
        val py = position.y + shakeY
        val pz = position.z
        Matrix.setLookAtM(
            view, 0,
            px, py, pz,
            lookAt.x, lookAt.y + shakeY * 0.4f, lookAt.z,
            0f, 1f, 0f,
        )
        Matrix.multiplyMM(viewProj, 0, proj, 0, view, 0)
    }

    /** Camera right/up in world space, for building billboards. */
    fun rightX() = view[0]
    fun rightY() = view[4]
    fun rightZ() = view[8]
    fun upX() = view[1]
    fun upY() = view[5]
    fun upZ() = view[9]

    private val projScratch = FloatArray(4)
    private val outScratch = FloatArray(2)

    /** World point to screen pixels, or null when it is behind the camera. */
    fun project(p: Vec3): FloatArray? {
        projScratch[0] = p.x
        projScratch[1] = p.y
        projScratch[2] = p.z
        projScratch[3] = 1f
        val out = FloatArray(4)
        Matrix.multiplyMV(out, 0, viewProj, 0, projScratch, 0)
        if (out[3] <= 0.001f) return null
        val ndcX = out[0] / out[3]
        val ndcY = out[1] / out[3]
        outScratch[0] = (ndcX * 0.5f + 0.5f) * viewportW
        outScratch[1] = (1f - (ndcY * 0.5f + 0.5f)) * viewportH
        return outScratch
    }
}
