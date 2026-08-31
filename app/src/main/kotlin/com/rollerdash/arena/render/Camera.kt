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
    private var fov = 62f
    private var fovKick = 0f
    private var viewportW = 1f
    private var viewportH = 1f

    fun resize(width: Int, height: Int) {
        viewportW = width.toFloat()
        viewportH = height.toFloat()
        aspect = if (height == 0) 1.6f else width.toFloat() / height.toFloat()
        fov = 62f
        Matrix.perspectiveM(proj, 0, fov, aspect, 0.35f, 520f)
    }

    fun updateBattle(dt: Float, battle: Battle, shake: Float, dramaFocus: Vec3? = null) {
        val player = battle.player
        val enemy = battle.enemy
        val toEnemy = Vec3(enemy.pos.x - player.pos.x, 0f, enemy.pos.z - player.pos.z)
        val dist = toEnemy.flatLength
        val back = if (dist > 1.5f) toEnemy.flatNormalized() else forwardOf(player.yaw)

        // Close and low: the machine has to fill enough of the frame to read as
        // a machine. It only backs off as the two of them open the distance.
        val range = 9.0f + clamp(dist * 0.105f, 0f, 5.5f)
        val height = 4.3f + player.pos.y * 0.80f + clamp(dist * 0.035f, 0f, 2.2f)
        val desired = clearedCameraSpot(
            battle,
            player.center - back * range + Vec3(0f, height, 0f),
            player.center + Vec3(0f, 1.2f, 0f),
        )
        // Aim above the pilot so the machine sits low in frame, the way a chase
        // camera in a fighting game does.
        val desiredLook = com.rollerdash.arena.core.lerp(
            player.center + Vec3(0f, 1.95f, 0f),
            enemy.center + Vec3(0f, 1.4f, 0f),
            0.30f,
        )

        if (dramaFocus != null) {
            // Slow motion after a kill: push in on the wreck from where we are.
            val toWreck = (dramaFocus - position).flatNormalized()
            val close = dramaFocus - toWreck * 7.0f + Vec3(0f, 2.6f, 0f)
            position = damp(position, close, 3.2f, dt)
            lookAt = damp(lookAt, dramaFocus + Vec3(0f, 0.9f, 0f), 4.5f, dt)
            fovKick = damp(fovKick, -6f, 3f, dt)
            Matrix.perspectiveM(proj, 0, fov + fovKick, aspect, 0.35f, 520f)
            applyShake(dt, shake)
            buildMatrices()
            return
        }

        position = damp(position, desired, 7.5f, dt)
        lookAt = damp(lookAt, desiredLook, 10f, dt)
        // Boosting widens the lens - the cheapest way to make speed feel like speed.
        val wanted = if (player.dashing) 7.5f else 0f
        fovKick = damp(fovKick, wanted, if (player.dashing) 9f else 4f, dt)
        Matrix.perspectiveM(proj, 0, fov + fovKick, aspect, 0.35f, 520f)
        applyShake(dt, shake)
        buildMatrices()
    }

    /**
     * Keeps the camera inside the arena and out of the cover: it walks the line
     * back towards the pilot until the view is clear, so a wall can never end up
     * filling the screen.
     */
    private fun clearedCameraSpot(battle: Battle, desired: Vec3, eye: Vec3): Vec3 {
        val arena = battle.arena
        val limit = arena.halfSize - 2.5f
        var fallback = desired
        for (step in 0..6) {
            val t = 1f - step * 0.13f
            var candidate = com.rollerdash.arena.core.lerp(eye, desired, t)
            candidate = Vec3(
                clamp(candidate.x, -limit, limit),
                maxOf(candidate.y, arena.groundHeightAt(candidate) + 1.6f),
                clamp(candidate.z, -limit, limit),
            )
            fallback = candidate
            if (!arena.blocked(candidate, eye)) return candidate
        }
        return fallback
    }

    /**
     * Attract camera: a slow, low three-quarter orbit of the machine on show.
     * The aim point is pushed sideways so the mech sits to the right of the
     * screen, clear of the menu column.
     */
    fun updateOrbit(dt: Float, battle: Battle) {
        orbit += dt * 0.13f
        val center = battle.player.center + Vec3(0f, 0.2f, 0f)
        val r = 14.5f
        val desired = center + Vec3(sin(orbit) * r, 3.4f + sin(orbit * 0.7f) * 0.7f, cos(orbit) * r)
        position = damp(position, desired, 3.0f, dt)

        // Shift the aim off to one side; the machine slides the other way.
        val toCenter = (center - desired).flatNormalized()
        val side = Vec3(-toCenter.z, 0f, toCenter.x)
        lookAt = damp(lookAt, center - side * 4.6f + Vec3(0f, 0.4f, 0f), 3.5f, dt)

        fovKick = damp(fovKick, 0f, 4f, dt)
        Matrix.perspectiveM(proj, 0, fov + fovKick, aspect, 0.35f, 520f)
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
