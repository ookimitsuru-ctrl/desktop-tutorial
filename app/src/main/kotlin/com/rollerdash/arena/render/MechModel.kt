package com.rollerdash.arena.render

import com.rollerdash.arena.core.Mech
import com.rollerdash.arena.core.MechPose
import com.rollerdash.arena.core.ProjectileKind
import com.rollerdash.arena.core.WeaponSlot
import com.rollerdash.arena.core.angleDelta
import com.rollerdash.arena.core.clamp
import com.rollerdash.arena.core.damp
import com.rollerdash.arena.core.yawOf
import com.rollerdash.arena.gl.MatrixStack
import com.rollerdash.arena.gl.Mesh
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin

/** Receives one part of the model per call. */
fun interface PartSink {
    fun part(mesh: Mesh, model: FloatArray, color: Int, emissive: Float)
}

/** Smoothed cosmetic state - the sim never touches it, so it can lag behind freely. */
class MechRenderState {
    var legYaw = 0f
    var bodyPitch = 0f
    var bodyRoll = 0f
    var hipDrop = 0f
    var kneeBend = 0f
    var armRecoil = 0f
    var downTilt = 0f
    var thrusterGlow = 0f
    var eyeX = 0f
}

/**
 * The Armored Trooper itself: a squat barrel torso on wheeled legs, a sliding
 * scope camera for a head, an arm-mounted heavy machine gun and a shoulder pod.
 * It is assembled every frame out of two primitives, so there are no art assets
 * to ship and every machine on the roster can be recoloured and re-proportioned.
 */
class MechModel(private val box: Mesh, private val cyl: Mesh) {

    private val m = FloatArray(16)

    private val dark = 0x24282A
    private val metal = 0x8D9295
    private val glass = 0x101418
    private val eyeGlow = 0xFF3A1E
    private val thruster = 0xFF9A3C

    fun update(state: MechRenderState, mech: Mech, dt: Float) {
        val speed = mech.vel.flatLength
        val moving = speed > 0.5f

        // Legs point where the machine is travelling, the torso keeps the enemy
        // in its sights - that twist is most of the personality in the walk.
        val travelYaw = if (moving) yawOf(mech.vel) else mech.yaw
        val wanted = clamp(angleDelta(mech.yaw, travelYaw), -1.15f, 1.15f)
        state.legYaw = damp(state.legYaw, if (moving) wanted else 0f, 7f, dt)

        val targetPitch = when (mech.pose) {
            MechPose.DASH -> 0.30f
            MechPose.CROUCH -> 0.24f
            MechPose.AIR -> -0.10f
            MechPose.STAGGER -> -0.28f
            else -> min(speed / mech.spec.walkSpeed, 1f) * 0.10f
        } - mech.recoil * 0.10f
        state.bodyPitch = damp(state.bodyPitch, targetPitch, 9f, dt)

        val targetRoll = if (mech.pose == MechPose.DASH) {
            clamp(angleDelta(mech.yaw, travelYaw), -1f, 1f) * -0.22f
        } else 0f
        state.bodyRoll = damp(state.bodyRoll, targetRoll, 7f, dt)

        val targetDrop = when (mech.pose) {
            MechPose.CROUCH -> 0.95f
            MechPose.DASH -> 0.34f
            MechPose.AIR -> -0.12f
            else -> 0f
        } + mech.landingSquash * 0.35f
        state.hipDrop = damp(state.hipDrop, targetDrop, 11f, dt)

        val targetKnee = when (mech.pose) {
            MechPose.CROUCH -> 1.15f
            MechPose.DASH -> 0.55f
            MechPose.AIR -> 0.75f
            else -> 0.10f
        }
        state.kneeBend = damp(state.kneeBend, targetKnee, 10f, dt)

        state.armRecoil = damp(state.armRecoil, mech.recoil, 16f, dt)

        val down = mech.pose == MechPose.DOWN || mech.pose == MechPose.DEAD
        state.downTilt = damp(state.downTilt, if (down) 1f else 0f, if (down) 9f else 4f, dt)

        val boosting = mech.dashing || (mech.airborne && mech.vel.y > 0f)
        state.thrusterGlow = damp(state.thrusterGlow, if (boosting) 1f else 0f, 12f, dt)
        state.eyeX = mech.eyeSlide
    }

    /**
     * Emits every part of one machine. `stack` must already be at the mech's
     * world position with no rotation applied.
     */
    fun draw(mech: Mech, st: MechRenderState, stack: MatrixStack, sink: PartSink) {
        val spec = mech.spec
        val bodyColor = spec.bodyColor
        val trim = spec.trimColor
        val scale = spec.height / 4.2f
        val width = spec.radius / 1.5f
        val flash = mech.tookDamageFlash

        stack.push()
        stack.rotateRad(mech.yaw, 0f, 1f, 0f)
        stack.scale(width, scale, width)
        // Knocked down: the whole frame pitches over onto its back.
        if (st.downTilt > 0.01f) {
            stack.translate(0f, 1.1f * st.downTilt, 0f)
            stack.rotateRad(-1.5f * st.downTilt, 1f, 0f, 0f)
        }

        drawLegs(mech, st, stack, sink, bodyColor, trim, flash)

        // Everything above the hips rides the body pitch and roll.
        stack.push()
        stack.translate(0f, 2.05f - st.hipDrop, 0f)
        stack.rotateRad(st.bodyPitch, 1f, 0f, 0f)
        stack.rotateRad(st.bodyRoll, 0f, 0f, 1f)

        drawTorso(stack, sink, bodyColor, trim, flash)
        drawBackpack(st, stack, sink, bodyColor, flash)
        drawHead(st, stack, sink, bodyColor, flash)
        drawArm(mech, st, stack, sink, WeaponSlot.RIGHT, bodyColor, trim, flash)
        drawArm(mech, st, stack, sink, WeaponSlot.LEFT, bodyColor, trim, flash)

        stack.pop()
        stack.pop()
    }

    private fun drawTorso(stack: MatrixStack, sink: PartSink, body: Int, trim: Int, flash: Float) {
        // Barrel body: the silhouette that says "armored trooper" at a glance.
        sink.part(cyl, stack.boxAt(0f, 0.62f, 0f, 2.30f, 1.45f, 2.05f, m), body, flash)
        // Chest plate and the collar ring it sits in.
        sink.part(box, stack.boxAt(0f, 0.70f, 0.92f, 1.55f, 1.05f, 0.42f, m), body, flash)
        sink.part(box, stack.boxAt(0f, 0.22f, 0.99f, 1.15f, 0.22f, 0.30f, m), trim, flash)
        sink.part(cyl, stack.boxAt(0f, 1.34f, 0f, 1.55f, 0.26f, 1.45f, m), dark, flash)
        // Hip block.
        sink.part(box, stack.boxAt(0f, -0.16f, 0f, 2.05f, 0.62f, 1.25f, m), dark, flash)
        sink.part(box, stack.boxAt(0f, -0.16f, 0.66f, 0.85f, 0.44f, 0.22f, m), trim, flash)
    }

    private fun drawBackpack(st: MechRenderState, stack: MatrixStack, sink: PartSink, body: Int, flash: Float) {
        sink.part(box, stack.boxAt(0f, 0.72f, -1.05f, 1.60f, 1.15f, 0.55f, m), body, flash)
        sink.part(box, stack.boxAt(0f, 1.18f, -1.05f, 1.20f, 0.22f, 0.62f, m), dark, flash)
        // Twin roller-dash thrusters, lit while the boosters are burning.
        for (s in intArrayOf(-1, 1)) {
            sink.part(cyl, stack.boxAt(s * 0.52f, 0.30f, -1.28f, 0.46f, 0.70f, 0.46f, m), metal, flash)
            if (st.thrusterGlow > 0.02f) {
                sink.part(
                    cyl,
                    stack.boxAt(s * 0.52f, -0.10f - st.thrusterGlow * 0.35f, -1.28f,
                        0.40f, 0.55f + st.thrusterGlow * 0.9f, 0.40f, m),
                    thruster, st.thrusterGlow,
                )
            }
        }
    }

    private fun drawHead(st: MechRenderState, stack: MatrixStack, sink: PartSink, body: Int, flash: Float) {
        stack.push()
        stack.translate(0f, 1.62f, 0.10f)
        // Turret head: a slab with a slit, and one camera eye that tracks across it.
        sink.part(box, stack.boxAt(0f, 0f, 0f, 1.35f, 0.62f, 1.05f, m), body, flash)
        sink.part(box, stack.boxAt(0f, 0.06f, 0.54f, 1.28f, 0.30f, 0.10f, m), glass, flash)
        sink.part(cyl, stack.boxAt(st.eyeX * 0.42f, 0.06f, 0.60f, 0.26f, 0.24f, 0.26f, m), eyeGlow, 1f)
        // Antenna, because every AT has one bent aerial.
        sink.part(box, stack.boxAt(-0.62f, 0.52f, -0.20f, 0.07f, 0.85f, 0.07f, m), metal, flash)
        stack.pop()
    }

    private fun drawArm(
        mech: Mech,
        st: MechRenderState,
        stack: MatrixStack,
        sink: PartSink,
        slot: WeaponSlot,
        body: Int,
        trim: Int,
        flash: Float,
    ) {
        // Model space +X is the machine's left (rotateY maps it opposite the
        // camera's right axis), so the right-hand weapon hangs off -X.
        val side = if (slot == WeaponSlot.RIGHT) -1f else 1f
        val firingThis = mech.action?.slot == slot || mech.action?.slot == WeaponSlot.CENTER
        val recoil = if (firingThis) st.armRecoil else 0f
        val melee = mech.action?.spec?.kind == ProjectileKind.MELEE && firingThis
        val swing = if (melee) {
            val a = mech.action!!
            val t = clamp(a.timer / (a.spec.windup + 0.18f), 0f, 1f)
            sin(t * 3.1416f) * 1.5f
        } else 0f

        stack.push()
        stack.translate(side * 1.28f, 0.86f, 0f)
        // Round shoulder pauldron, axle running across the machine.
        sink.part(cyl, stack.partAt(side * 0.12f, 0.10f, 0f, 90f, 0f, 0f, 1f, 1.30f, 0.78f, 1.20f, m), body, flash)
        stack.rotateRad(-swing - recoil * 0.22f, 1f, 0f, 0f)
        // Upper arm, elbow, forearm.
        sink.part(box, stack.boxAt(0f, -0.55f, 0f, 0.58f, 0.85f, 0.60f, m), dark, flash)
        sink.part(cyl, stack.partAt(0f, -1.02f, 0f, 90f, 0f, 0f, 1f, 0.56f, 0.60f, 0.56f, m), metal, flash)
        stack.translate(0f, -1.05f, 0f)
        sink.part(box, stack.boxAt(0f, -0.35f, 0.05f, 0.62f, 0.80f, 0.66f, m), body, flash)

        if (slot == WeaponSlot.RIGHT) {
            // Arm-mounted heavy machine gun, pushed back by its own recoil.
            val z = 0.55f - recoil * 0.30f
            sink.part(box, stack.boxAt(0f, -0.42f, z + 0.35f, 0.46f, 0.50f, 1.30f, m), dark, flash)
            sink.part(cyl, stack.partAt(0f, -0.42f, z + 1.15f, 90f, 1f, 0f, 0f, 0.24f, 0.90f, 0.24f, m), metal, flash)
            sink.part(box, stack.boxAt(0f, -0.10f, z + 0.10f, 0.30f, 0.26f, 0.70f, m), trim, flash)
        } else {
            // Shoulder pod / secondary launcher.
            sink.part(box, stack.boxAt(0f, -0.45f, 0.45f, 0.80f, 0.72f, 0.85f, m), trim, flash)
            for (r in 0 until 2) {
                for (c in 0 until 2) {
                    sink.part(
                        cyl,
                        stack.partAt(
                            -0.18f + c * 0.36f, -0.62f + r * 0.34f, 0.90f,
                            90f, 1f, 0f, 0f, 0.22f, 0.30f, 0.22f, m,
                        ),
                        dark, flash,
                    )
                }
            }
        }
        stack.pop()
    }

    private fun drawLegs(
        mech: Mech,
        st: MechRenderState,
        stack: MatrixStack,
        sink: PartSink,
        body: Int,
        trim: Int,
        flash: Float,
    ) {
        val speed = mech.vel.flatLength
        val stride = min(speed / mech.spec.walkSpeed, 1.4f)
        val swing = sin(mech.walkPhase * 2f) * 0.55f * stride
        val lift = abs(cos(mech.walkPhase * 2f)) * 0.12f * stride

        stack.push()
        stack.rotateRad(st.legYaw, 0f, 1f, 0f)
        // Waist swivel joint.
        sink.part(cyl, stack.boxAt(0f, 1.95f - st.hipDrop, 0f, 1.10f, 0.36f, 1.10f, m), metal, flash)

        for (i in intArrayOf(-1, 1)) {
            val phase = if (i > 0) swing else -swing
            val footLift = if (i > 0) lift else lift * 0.6f
            stack.push()
            stack.translate(i * 0.70f, 1.80f - st.hipDrop, 0f)
            stack.rotateRad(phase - st.kneeBend * 0.35f, 1f, 0f, 0f)
            // Thigh.
            sink.part(box, stack.boxAt(0f, -0.48f, 0f, 0.78f, 1.05f, 0.86f, m), body, flash)
            stack.translate(0f, -0.95f, 0f)
            stack.rotateRad(st.kneeBend * 0.9f - phase * 0.4f, 1f, 0f, 0f)
            // Shin and the armour skirt over it.
            sink.part(box, stack.boxAt(0f, -0.42f, 0.02f, 0.86f, 1.00f, 0.94f, m), body, flash)
            sink.part(box, stack.boxAt(0f, -0.30f, 0.50f, 0.62f, 0.62f, 0.16f, m), trim, flash)
            stack.translate(0f, -0.88f, 0f)
            stack.rotateRad(-st.kneeBend * 0.55f + phase * 0.25f, 1f, 0f, 0f)
            // Foot, and the roller-dash wheels set into its sole.
            sink.part(box, stack.boxAt(0f, -0.16f + footLift, 0.12f, 0.98f, 0.34f, 1.55f, m), dark, flash)
            val spin = mech.rollerSpin
            for (w in 0 until 3) {
                val z = -0.42f + w * 0.52f
                val rollerColor = if (mech.dashing) trim else metal
                sink.part(
                    cyl,
                    stack.wheelAt(0f, -0.40f + footLift, z, spin * 57.3f, 0.68f, 1.02f, m),
                    rollerColor, if (mech.dashing) 0.35f else flash,
                )
            }
            stack.pop()
        }
        stack.pop()
    }
}
