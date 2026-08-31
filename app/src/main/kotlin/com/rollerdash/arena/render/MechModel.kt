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
    fun part(mesh: Mesh, model: FloatArray, color: Int, emissive: Float, material: Int)
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
 * The Armored Trooper: a squat barrel torso on wheeled legs, a sliding scope
 * camera for a head, an arm-mounted heavy machine gun and a shoulder pod.
 *
 * It is assembled every frame out of two primitives - a box and a cylinder - so
 * there are no art assets to ship, and every machine on the roster can be
 * recoloured and reproportioned from its stat block. The detail comes from part
 * count and from the material each part declares: painted plate gets panel
 * seams and chipping, bare metal gets a tight highlight, the lens glows.
 */
class MechModel(private val box: Mesh, private val cyl: Mesh) {

    private val m = FloatArray(16)

    fun update(state: MechRenderState, mech: Mech, dt: Float) {
        val speed = mech.vel.flatLength
        val moving = speed > 0.5f

        // Legs point where the machine is travelling, the torso keeps the enemy
        // in its sights - that twist is most of the personality in the walk.
        val travelYaw = if (moving) yawOf(mech.vel) else mech.yaw
        val wanted = clamp(angleDelta(mech.yaw, travelYaw), -1.15f, 1.15f)
        state.legYaw = damp(state.legYaw, if (moving) wanted else 0f, 7f, dt)

        val targetPitch = when (mech.pose) {
            MechPose.DASH -> 0.32f
            MechPose.CROUCH -> 0.26f
            MechPose.AIR -> -0.12f
            MechPose.STAGGER -> -0.30f
            else -> min(speed / mech.spec.walkSpeed, 1f) * 0.10f
        } - mech.recoil * 0.10f
        state.bodyPitch = damp(state.bodyPitch, targetPitch, 9f, dt)

        val targetRoll = if (mech.pose == MechPose.DASH) {
            clamp(angleDelta(mech.yaw, travelYaw), -1f, 1f) * -0.24f
        } else 0f
        state.bodyRoll = damp(state.bodyRoll, targetRoll, 7f, dt)

        val targetDrop = when (mech.pose) {
            MechPose.CROUCH -> 0.95f
            MechPose.DASH -> 0.36f
            MechPose.AIR -> -0.14f
            else -> 0f
        } + mech.landingSquash * 0.35f
        state.hipDrop = damp(state.hipDrop, targetDrop, 11f, dt)

        val targetKnee = when (mech.pose) {
            MechPose.CROUCH -> 1.15f
            MechPose.DASH -> 0.58f
            MechPose.AIR -> 0.78f
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
        val body = spec.bodyColor
        val trim = spec.trimColor
        val scale = spec.height / 4.2f
        val width = spec.radius / 1.5f
        val flash = mech.tookDamageFlash

        stack.push()
        stack.rotateRad(mech.yaw, 0f, 1f, 0f)
        stack.scale(width, scale, width)
        if (st.downTilt > 0.01f) {
            stack.translate(0f, 1.1f * st.downTilt, 0f)
            stack.rotateRad(-1.5f * st.downTilt, 1f, 0f, 0f)
        }

        drawLegs(mech, st, stack, sink, body, trim)

        stack.push()
        stack.translate(0f, 2.05f - st.hipDrop, 0f)
        stack.rotateRad(st.bodyPitch, 1f, 0f, 0f)
        stack.rotateRad(st.bodyRoll, 0f, 0f, 1f)

        drawTorso(stack, sink, body, trim)
        drawBackpack(st, stack, sink, body)
        drawHead(st, stack, sink, body, trim)
        drawArm(mech, st, stack, sink, WeaponSlot.RIGHT, body, trim)
        drawArm(mech, st, stack, sink, WeaponSlot.LEFT, body, trim)

        stack.pop()
        stack.pop()
    }

    private fun armor(sink: PartSink, mesh: Mesh, model: FloatArray, color: Int, emissive: Float = 0f) =
        sink.part(mesh, model, color, emissive, MATERIAL_ARMOR)

    private fun metalPart(sink: PartSink, mesh: Mesh, model: FloatArray, color: Int = METAL, emissive: Float = 0f) =
        sink.part(mesh, model, color, emissive, MATERIAL_METAL)

    private fun lens(sink: PartSink, mesh: Mesh, model: FloatArray, color: Int, emissive: Float) =
        sink.part(mesh, model, color, emissive, MATERIAL_LENS)

    private fun drawTorso(stack: MatrixStack, sink: PartSink, body: Int, trim: Int) {
        // Barrel body: the silhouette that says "armored trooper" at a glance.
        armor(sink, cyl, stack.boxAt(0f, 0.62f, 0f, 2.30f, 1.45f, 2.05f, m), body)
        // Waist taper under it.
        armor(sink, cyl, stack.boxAt(0f, -0.02f, 0f, 2.05f, 0.34f, 1.85f, m), shade(body, 0.85f))
        // Chest plate, hatch and the collar ring the head sits in.
        armor(sink, box, stack.boxAt(0f, 0.72f, 0.94f, 1.50f, 1.00f, 0.40f, m), body)
        armor(sink, box, stack.boxAt(0f, 0.74f, 1.10f, 1.05f, 0.72f, 0.12f, m), shade(body, 1.1f))
        metalPart(sink, box, stack.boxAt(0f, 0.24f, 1.14f, 1.18f, 0.16f, 0.10f, m), trim)
        metalPart(sink, cyl, stack.boxAt(0f, 1.36f, 0f, 1.50f, 0.24f, 1.42f, m), DARK)
        // Side intake vents.
        for (s in intArrayOf(-1, 1)) {
            metalPart(sink, box, stack.boxAt(s * 1.02f, 0.62f, 0.30f, 0.20f, 0.80f, 0.70f, m), DARK)
            for (v in 0 until 3) {
                metalPart(sink, box, stack.boxAt(s * 1.10f, 0.36f + v * 0.24f, 0.30f, 0.10f, 0.10f, 0.62f, m), trim)
            }
        }
        // Hip block and skirts.
        armor(sink, box, stack.boxAt(0f, -0.30f, 0f, 2.00f, 0.56f, 1.22f, m), DARK)
        armor(sink, box, stack.boxAt(0f, -0.28f, 0.68f, 0.90f, 0.44f, 0.20f, m), trim)
        for (s in intArrayOf(-1, 1)) {
            armor(sink, box, stack.boxAt(s * 1.02f, -0.34f, 0.10f, 0.22f, 0.62f, 0.96f, m), body)
        }
    }

    private fun drawBackpack(st: MechRenderState, stack: MatrixStack, sink: PartSink, body: Int) {
        armor(sink, box, stack.boxAt(0f, 0.72f, -1.06f, 1.62f, 1.16f, 0.58f, m), body)
        metalPart(sink, box, stack.boxAt(0f, 1.20f, -1.06f, 1.24f, 0.20f, 0.66f, m), DARK)
        // Fuel drums either side of the spine.
        for (s in intArrayOf(-1, 1)) {
            metalPart(sink, cyl, stack.partAt(s * 0.62f, 0.86f, -1.34f, 90f, 1f, 0f, 0f, 0.46f, 0.70f, 0.46f, m), DARK)
        }
        // Twin roller-dash thrusters, lit while the boosters are burning.
        for (s in intArrayOf(-1, 1)) {
            metalPart(sink, cyl, stack.boxAt(s * 0.52f, 0.28f, -1.30f, 0.50f, 0.74f, 0.50f, m), METAL)
            metalPart(sink, cyl, stack.boxAt(s * 0.52f, -0.08f, -1.30f, 0.58f, 0.16f, 0.58f, m), DARK)
            if (st.thrusterGlow > 0.02f) {
                lens(
                    sink, cyl,
                    stack.boxAt(
                        s * 0.52f, -0.22f - st.thrusterGlow * 0.42f, -1.30f,
                        0.40f, 0.55f + st.thrusterGlow * 1.1f, 0.40f, m,
                    ),
                    THRUSTER, 0.6f + st.thrusterGlow * 0.4f,
                )
            }
        }
    }

    private fun drawHead(st: MechRenderState, stack: MatrixStack, sink: PartSink, body: Int, trim: Int) {
        stack.push()
        stack.translate(0f, 1.62f, 0.10f)
        // Turret head: a slab with a slit, and one camera eye tracking across it.
        armor(sink, box, stack.boxAt(0f, 0f, 0f, 1.38f, 0.60f, 1.06f, m), body)
        armor(sink, box, stack.boxAt(0f, 0.30f, -0.05f, 1.20f, 0.16f, 0.92f, m), shade(body, 1.08f))
        metalPart(sink, box, stack.boxAt(0f, 0.04f, 0.55f, 1.30f, 0.30f, 0.10f, m), GLASS)
        lens(sink, cyl, stack.partAt(st.eyeX * 0.42f, 0.04f, 0.60f, 90f, 1f, 0f, 0f, 0.24f, 0.14f, 0.24f, m), EYE, 1f)
        metalPart(sink, cyl, stack.partAt(st.eyeX * 0.42f, 0.04f, 0.56f, 90f, 1f, 0f, 0f, 0.30f, 0.10f, 0.30f, m), DARK)
        // Sensor cluster, grab handles and the bent aerial every AT carries.
        metalPart(sink, box, stack.boxAt(0.44f, 0.30f, 0.42f, 0.22f, 0.20f, 0.22f, m), trim)
        metalPart(sink, box, stack.boxAt(-0.62f, 0.52f, -0.20f, 0.06f, 0.86f, 0.06f, m), METAL)
        metalPart(sink, box, stack.boxAt(-0.60f, 0.94f, -0.10f, 0.06f, 0.06f, 0.24f, m), METAL)
        for (s in intArrayOf(-1, 1)) {
            metalPart(sink, box, stack.boxAt(s * 0.60f, -0.10f, -0.30f, 0.14f, 0.30f, 0.14f, m), DARK)
        }
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
    ) {
        // Model space +X is the machine's left, so the right-hand weapon is -X.
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
        // Round shoulder pauldron with its bolt cap.
        armor(sink, cyl, stack.partAt(side * 0.12f, 0.10f, 0f, 90f, 0f, 0f, 1f, 1.32f, 0.80f, 1.22f, m), body)
        metalPart(sink, cyl, stack.partAt(side * 0.52f, 0.10f, 0f, 90f, 0f, 0f, 1f, 0.52f, 0.14f, 0.52f, m), DARK)
        armor(sink, box, stack.boxAt(side * 0.10f, 0.62f, 0f, 0.90f, 0.24f, 1.10f, m), shade(body, 1.06f))

        stack.rotateRad(-swing - recoil * 0.22f, 1f, 0f, 0f)
        metalPart(sink, box, stack.boxAt(0f, -0.55f, 0f, 0.56f, 0.86f, 0.58f, m), DARK)
        // Piston along the upper arm.
        metalPart(sink, cyl, stack.boxAt(side * 0.26f, -0.55f, -0.26f, 0.14f, 0.80f, 0.14f, m), METAL)
        metalPart(sink, cyl, stack.partAt(0f, -1.02f, 0f, 90f, 0f, 0f, 1f, 0.58f, 0.62f, 0.58f, m), METAL)

        stack.translate(0f, -1.05f, 0f)
        armor(sink, box, stack.boxAt(0f, -0.35f, 0.05f, 0.64f, 0.82f, 0.68f, m), body)
        metalPart(sink, box, stack.boxAt(0f, -0.72f, 0.05f, 0.52f, 0.20f, 0.60f, m), DARK)

        if (slot == WeaponSlot.RIGHT) {
            // Arm-mounted heavy machine gun, pushed back by its own recoil.
            val z = 0.55f - recoil * 0.32f
            metalPart(sink, box, stack.boxAt(0f, -0.42f, z + 0.30f, 0.48f, 0.52f, 1.30f, m), DARK)
            metalPart(sink, box, stack.boxAt(0f, -0.14f, z + 0.16f, 0.34f, 0.26f, 0.80f, m), trim)
            // Barrel with a vented heat shroud.
            metalPart(sink, cyl, stack.partAt(0f, -0.42f, z + 1.18f, 90f, 1f, 0f, 0f, 0.26f, 0.95f, 0.26f, m), METAL)
            for (i in 0 until 3) {
                metalPart(
                    sink, cyl,
                    stack.partAt(0f, -0.42f, z + 0.95f + i * 0.22f, 90f, 1f, 0f, 0f, 0.34f, 0.07f, 0.34f, m),
                    DARK,
                )
            }
            // Ammo drum on the outside of the arm.
            metalPart(sink, cyl, stack.partAt(side * 0.34f, -0.46f, z - 0.05f, 90f, 0f, 0f, 1f, 0.52f, 0.24f, 0.52f, m), DARK)
        } else {
            // Shoulder pod / secondary launcher with individual tubes.
            armor(sink, box, stack.boxAt(0f, -0.45f, 0.45f, 0.84f, 0.76f, 0.88f, m), trim)
            metalPart(sink, box, stack.boxAt(0f, -0.05f, 0.45f, 0.90f, 0.10f, 0.94f, m), DARK)
            for (r in 0 until 2) {
                for (c in 0 until 2) {
                    metalPart(
                        sink, cyl,
                        stack.partAt(
                            -0.19f + c * 0.38f, -0.63f + r * 0.36f, 0.92f,
                            90f, 1f, 0f, 0f, 0.24f, 0.32f, 0.24f, m,
                        ),
                        DARK,
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
    ) {
        val speed = mech.vel.flatLength
        val stride = min(speed / mech.spec.walkSpeed, 1.4f)
        val swing = sin(mech.walkPhase * 2f) * 0.55f * stride
        val lift = abs(cos(mech.walkPhase * 2f)) * 0.12f * stride

        stack.push()
        stack.rotateRad(st.legYaw, 0f, 1f, 0f)
        metalPart(sink, cyl, stack.boxAt(0f, 1.95f - st.hipDrop, 0f, 1.16f, 0.38f, 1.16f, m), METAL)

        for (i in intArrayOf(-1, 1)) {
            val phase = if (i > 0) swing else -swing
            val footLift = if (i > 0) lift else lift * 0.6f
            stack.push()
            stack.translate(i * 0.70f, 1.80f - st.hipDrop, 0f)
            stack.rotateRad(phase - st.kneeBend * 0.35f, 1f, 0f, 0f)
            // Hip actuator, thigh and its armour plate.
            metalPart(sink, cyl, stack.partAt(0f, 0f, 0f, 90f, 0f, 0f, 1f, 0.62f, 0.66f, 0.62f, m), DARK)
            armor(sink, box, stack.boxAt(0f, -0.48f, 0f, 0.80f, 1.06f, 0.88f, m), body)
            armor(sink, box, stack.boxAt(i * 0.42f, -0.50f, 0.02f, 0.16f, 0.86f, 0.70f, m), shade(body, 1.06f))
            metalPart(sink, cyl, stack.boxAt(0f, -0.50f, -0.44f, 0.16f, 0.86f, 0.16f, m), METAL)

            stack.translate(0f, -0.95f, 0f)
            stack.rotateRad(st.kneeBend * 0.9f - phase * 0.4f, 1f, 0f, 0f)
            // Knee cap, shin, and the skirt over the roller housing.
            metalPart(sink, cyl, stack.partAt(0f, 0.04f, 0.10f, 90f, 0f, 0f, 1f, 0.66f, 0.70f, 0.66f, m), DARK)
            armor(sink, box, stack.boxAt(0f, -0.42f, 0.02f, 0.88f, 1.00f, 0.96f, m), body)
            armor(sink, box, stack.boxAt(0f, -0.30f, 0.52f, 0.64f, 0.64f, 0.16f, m), trim)
            metalPart(sink, cyl, stack.boxAt(0f, -0.44f, -0.46f, 0.18f, 0.82f, 0.18f, m), METAL)

            stack.translate(0f, -0.88f, 0f)
            stack.rotateRad(-st.kneeBend * 0.55f + phase * 0.25f, 1f, 0f, 0f)
            // Ankle, foot pan, toe cap and the roller-dash wheels in the sole.
            metalPart(sink, cyl, stack.partAt(0f, 0.10f, 0f, 90f, 0f, 0f, 1f, 0.44f, 0.52f, 0.44f, m), DARK)
            armor(sink, box, stack.boxAt(0f, -0.16f + footLift, 0.12f, 1.00f, 0.36f, 1.58f, m), shade(body, 0.8f))
            armor(sink, box, stack.boxAt(0f, -0.16f + footLift, 0.86f, 0.86f, 0.30f, 0.30f, m), trim)
            val spin = mech.rollerSpin
            for (w in 0 until 3) {
                val z = -0.42f + w * 0.52f
                metalPart(
                    sink, cyl,
                    stack.wheelAt(0f, -0.40f + footLift, z, spin * 57.3f, 0.70f, 1.04f, m),
                    if (mech.dashing) trim else DARK,
                    if (mech.dashing) 0.30f else 0f,
                )
                metalPart(
                    sink, cyl,
                    stack.wheelAt(0f, -0.40f + footLift, z, spin * 57.3f, 0.34f, 1.10f, m),
                    METAL,
                )
            }
            stack.pop()
        }
        stack.pop()
    }

    /** Multiplies an 0xRRGGBB colour, for plates that catch a little more light. */
    private fun shade(color: Int, factor: Float): Int {
        val r = (((color shr 16) and 0xFF) * factor).toInt().coerceIn(0, 255)
        val g = (((color shr 8) and 0xFF) * factor).toInt().coerceIn(0, 255)
        val b = ((color and 0xFF) * factor).toInt().coerceIn(0, 255)
        return (r shl 16) or (g shl 8) or b
    }

    companion object {
        const val MATERIAL_ARMOR = 0
        const val MATERIAL_METAL = 1
        const val MATERIAL_LENS = 2

        const val DARK = 0x24282A
        const val METAL = 0x8D9295
        const val GLASS = 0x0E1114
        const val EYE = 0xFF3A1E
        const val THRUSTER = 0xFF9A3C
    }
}
