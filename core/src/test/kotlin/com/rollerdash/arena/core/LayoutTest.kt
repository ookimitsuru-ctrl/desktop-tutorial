package com.rollerdash.arena.core

import kotlin.test.Test
import kotlin.test.assertTrue
import kotlin.test.fail

/**
 * The screen is the one thing that cannot be tried out from a build machine, so
 * every placement rule is asserted here instead: on a real handset the menu rows
 * ran straight through the title, and a button sat half off the right edge.
 */
class LayoutTest {

    /** Landscape sizes a phone or tablet actually reports, plus awkward extremes. */
    private val screens = listOf(
        1920 to 1080,   // 16:9
        2400 to 1080,   // 20:9, the common tall phone in landscape
        2340 to 1080,   // 19.5:9
        2560 to 1080,   // 21:9
        1600 to 720,    // low-end
        2560 to 1600,   // tablet
        1600 to 1200,   // 4:3
        3840 to 1644,   // very wide foldable, unfolded
    )

    private fun eachScreen(body: (Float, Float, String) -> Unit) {
        for ((w, h) in screens) body(w.toFloat(), h.toFloat(), "${w}x$h")
    }

    @Test
    fun hudElementsStayOnScreenAndApart() {
        eachScreen { w, h, name ->
            val hud = HudLayout(w, h)
            val boxes = hud.boxes()
            for ((label, rect) in boxes) {
                assertTrue(rect.insideScreen(w, h), "$name: $label is off screen ($rect)")
            }
            for (i in boxes.indices) {
                for (j in i + 1 until boxes.size) {
                    val (an, a) = boxes[i]
                    val (bn, b) = boxes[j]
                    // Gauges in one stack are allowed to sit close; nothing may cross.
                    if (a.overlaps(b)) fail("$name: $an overlaps $bn ($a vs $b)")
                }
            }
        }
    }

    @Test
    fun controlsStayOnScreenAndDoNotCollide() {
        for (scheme in ControlScheme.entries) {
            for (mirrored in listOf(false, true)) {
                eachScreen { w, h, name ->
                    val layout = ControlLayout(w, h, scheme, mirrored)
                    val discs = layout.discs()
                    val where = "$name $scheme mirrored=$mirrored"
                    for ((label, d) in discs) {
                        assertTrue(d.insideScreen(w, h), "$where: $label is off screen ($d)")
                    }
                    for (i in discs.indices) {
                        for (j in i + 1 until discs.size) {
                            val (an, a) = discs[i]
                            val (bn, b) = discs[j]
                            if (a.overlaps(b)) fail("$where: $an overlaps $bn ($a vs $b)")
                        }
                    }
                }
            }
        }
    }

    @Test
    fun controlsAndHudKeepOutOfEachOthersWay() {
        for (scheme in ControlScheme.entries) {
            eachScreen { w, h, name ->
                val hud = HudLayout(w, h)
                val controls = ControlLayout(w, h, scheme)
                for ((cn, disc) in controls.discs()) {
                    for ((hn, rect) in hud.boxes()) {
                        if (disc.bounds().overlaps(rect)) {
                            fail("$name $scheme: control $cn overlaps HUD $hn")
                        }
                    }
                }
            }
        }
    }

    @Test
    fun mirroringSwapsTheHalvesWithoutBreakingAnything() {
        val w = 2400f
        val h = 1080f
        val normal = ControlLayout(w, h, ControlScheme.MODERN, mirrored = false)
        val mirrored = ControlLayout(w, h, ControlScheme.MODERN, mirrored = true)
        assertTrue(normal.moveStick.cx < w * 0.5f, "the movement stick should start on the left")
        assertTrue(mirrored.moveStick.cx > w * 0.5f, "mirroring should move it to the right")
        val fireNormal = normal.buttons.first { it.id == ControlButton.FIRE_R }.disc
        val fireMirrored = mirrored.buttons.first { it.id == ControlButton.FIRE_R }.disc
        assertTrue(fireNormal.cx > w * 0.5f && fireMirrored.cx < w * 0.5f)
    }

    @Test
    fun menuRowsNeverRunIntoTheTitleOrTheFooter() {
        for (rowCount in 2..6) {
            eachScreen { w, h, name ->
                val menu = MenuLayout(w, h, rowCount)
                val boxes = menu.boxes()
                val where = "$name rows=$rowCount"
                for ((label, rect) in boxes) {
                    assertTrue(rect.insideScreen(w, h, -1f), "$where: $label is off screen ($rect)")
                }
                for (i in boxes.indices) {
                    for (j in i + 1 until boxes.size) {
                        val (an, a) = boxes[i]
                        val (bn, b) = boxes[j]
                        if (a.overlaps(b)) fail("$where: $an overlaps $bn ($a vs $b)")
                    }
                }
                assertTrue(menu.rows.first().y > menu.subtitle.bottom, "$where: first row is above the subtitle")
                assertTrue(menu.rows.last().bottom < menu.footer.y, "$where: rows run past the footer")
                assertTrue(menu.rows.first().h > menu.unit * 0.03f, "$where: rows collapsed to nothing")
            }
        }
    }
}

/** The camera's right and the mech's right have to be the same direction. */
class HandednessTest {

    private fun cross(a: Vec3, b: Vec3) = a.cross(b)

    @Test
    fun rightOfMatchesTheCamerasRightAxis() {
        // setLookAtM builds its right axis as forward x up; the strafe direction
        // must agree with it or the stick sends the mech the wrong way.
        for (i in 0 until 16) {
            val yaw = i * 0.4f
            val expected = cross(forwardOf(yaw), Vec3.UP).normalized()
            val actual = rightOf(yaw)
            val dot = expected.dot(actual)
            assertTrue(dot > 0.999f, "yaw=$yaw: rightOf points the wrong way (dot=$dot)")
        }
    }

    @Test
    fun pushingTheStickRightMovesTheMechToTheCamerasRight() {
        val arena = Arena(200f)
        val mech = Mech(0, Roster.SCOPE_HOUND, Vec3.ZERO, 0.8f)
        val input = PilotInput(moveX = 1f)
        var prev = PilotInput.IDLE
        repeat(60) {
            mech.update(1f / 60f, input, prev, arena, null)
            prev = input
        }
        val travelled = mech.pos.flatNormalized()
        val cameraRight = forwardOf(mech.yaw).cross(Vec3.UP).normalized()
        assertTrue(
            travelled.dot(cameraRight) > 0.9f,
            "strafing right went the wrong way (travel=$travelled, right=$cameraRight)",
        )
    }
}
