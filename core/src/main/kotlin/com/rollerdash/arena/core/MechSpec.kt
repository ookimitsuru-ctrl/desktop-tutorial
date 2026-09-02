package com.rollerdash.arena.core

/** Which hardpoint a weapon hangs off. Pressing both triggers fires the centre weapon. */
enum class WeaponSlot { RIGHT, LEFT, CENTER }

/** The move you get out of a slot depends on what the mech is doing when you pull the trigger. */
enum class Stance { GROUND, DASH, AIR }

enum class ProjectileKind {
    /** Flat, fast tracer. Machine guns and solid shot. */
    BULLET,
    /** Slower bolt that leaves a fat glow. */
    PLASMA,
    /** Homing, burns fuel, turns hard. */
    MISSILE,
    /** Lobbed under gravity, bursts on contact. */
    MORTAR,
    /** Sticks to the ground and burns - area denial. */
    NAPALM,
    /** Not a projectile at all: an arm swing resolved as a short capsule sweep. */
    MELEE,
}

data class WeaponSpec(
    val name: String,
    val kind: ProjectileKind,
    val damage: Float,
    val speed: Float,
    val shots: Int = 1,
    /** Radians of scatter applied per shot. */
    val spread: Float = 0f,
    /** Seconds between shots inside a burst. */
    val burstInterval: Float = 0.05f,
    /** Seconds locked out after the move finishes. */
    val recovery: Float = 0.5f,
    /** Fraction of the slot magazine spent by one press. */
    val ammoCost: Float = 0.25f,
    val lifetime: Float = 3f,
    val blastRadius: Float = 0f,
    /** How hard the hit shoves the stagger meter. 1.0 knocks a light mech down in four hits. */
    val impact: Float = 0.25f,
    /** Homing strength in radians per second. */
    val turnRate: Float = 0f,
    val gravity: Float = 0f,
    /** Extra upward tilt on launch, for lobbed shots. */
    val launchPitch: Float = 0f,
    val radius: Float = 0.25f,
    /** Forward shove applied to the shooter - the tackle move rides this. */
    val selfThrust: Float = 0f,
    /** Seconds the shooter is committed before the shot comes out. */
    val windup: Float = 0.05f,
)

/** Per-slot magazine behaviour. Crouching reloads at [crouchReloadRate]. */
data class MagazineSpec(
    val reloadRate: Float = 0.18f,
    val crouchReloadRate: Float = 0.75f,
)

data class AtSpec(
    val id: String,
    val displayName: String,
    val codeName: String,
    val blurb: String,
    val armor: Float,
    val radius: Float = 1.5f,
    val height: Float = 4.2f,
    val walkSpeed: Float = 8.5f,
    val strafeScale: Float = 0.85f,
    val backScale: Float = 0.7f,
    val dashSpeed: Float = 27f,
    val dashDuration: Float = 0.75f,
    val dashCost: Float = 0.30f,
    val dashTailCost: Float = 0.22f,
    val boostRegen: Float = 0.26f,
    val crouchBoostRegen: Float = 0.85f,
    val jumpSpeed: Float = 17f,
    val jumpCost: Float = 0.22f,
    val hoverThrust: Float = 16f,
    val hoverDrain: Float = 0.45f,
    val gravity: Float = 30f,
    val turnRate: Float = 4.2f,
    /** Higher weight shrugs off more stagger. */
    val weight: Float = 1f,
    val staggerRecovery: Float = 0.55f,
    val bodyColor: Int = 0x7B8C6A,
    val trimColor: Int = 0xC9C24A,
    val mags: Map<WeaponSlot, MagazineSpec> = mapOf(
        WeaponSlot.RIGHT to MagazineSpec(),
        WeaponSlot.LEFT to MagazineSpec(0.10f, 0.55f),
        WeaponSlot.CENTER to MagazineSpec(0.08f, 0.45f),
    ),
    val weapons: Map<Pair<WeaponSlot, Stance>, WeaponSpec>,
) {
    fun weapon(slot: WeaponSlot, stance: Stance): WeaponSpec =
        weapons[slot to stance] ?: weapons.getValue(slot to Stance.GROUND)
}

/** The four machines on the roster. */
object Roster {

    private fun hmg(dmg: Float, shots: Int, spread: Float) = WeaponSpec(
        name = "HEAVY MACHINE GUN", kind = ProjectileKind.BULLET, damage = dmg, speed = 120f,
        shots = shots, spread = spread, burstInterval = 0.06f, recovery = 0.45f,
        ammoCost = 0.22f, lifetime = 2.0f, impact = 0.13f, radius = 0.18f,
    )

    val SCOPE_HOUND = AtSpec(
        id = "scope_hound",
        displayName = "SCOPE HOUND",
        codeName = "ATM-09-ST",
        blurb = "Mass production trooper. No vice, no virtue, no surprises.",
        armor = 1000f,
        bodyColor = 0x6E7F5E, trimColor = 0xD8C455,
        weapons = mapOf(
            (WeaponSlot.RIGHT to Stance.GROUND) to hmg(34f, 4, 0.016f),
            (WeaponSlot.RIGHT to Stance.DASH) to hmg(26f, 7, 0.030f).copy(
                name = "DASH SWEEP", recovery = 0.30f, ammoCost = 0.30f, impact = 0.10f,
            ),
            (WeaponSlot.RIGHT to Stance.AIR) to hmg(30f, 5, 0.022f).copy(
                name = "STRAFE FIRE", recovery = 0.35f, ammoCost = 0.28f,
            ),
            (WeaponSlot.LEFT to Stance.GROUND) to WeaponSpec(
                name = "MISSILE POD", kind = ProjectileKind.MISSILE, damage = 78f, speed = 34f,
                shots = 2, spread = 0.12f, burstInterval = 0.14f, recovery = 0.85f,
                ammoCost = 0.50f, lifetime = 5f, blastRadius = 4.5f, impact = 0.45f,
                turnRate = 2.4f, radius = 0.3f, windup = 0.12f,
            ),
            (WeaponSlot.LEFT to Stance.DASH) to WeaponSpec(
                name = "SPREAD BOMB", kind = ProjectileKind.MORTAR, damage = 64f, speed = 30f,
                shots = 3, spread = 0.20f, burstInterval = 0.05f, recovery = 0.60f,
                ammoCost = 0.5f, lifetime = 4f, blastRadius = 6f, impact = 0.5f,
                gravity = 22f, launchPitch = 0.22f, radius = 0.35f,
            ),
            (WeaponSlot.LEFT to Stance.AIR) to WeaponSpec(
                name = "CLUSTER RAIN", kind = ProjectileKind.MISSILE, damage = 46f, speed = 26f,
                shots = 5, spread = 0.30f, burstInterval = 0.08f, recovery = 0.7f,
                ammoCost = 0.6f, lifetime = 5f, blastRadius = 4f, impact = 0.3f,
                turnRate = 1.9f, radius = 0.25f,
            ),
            (WeaponSlot.CENTER to Stance.GROUND) to WeaponSpec(
                name = "SOLID SHOT", kind = ProjectileKind.BULLET, damage = 150f, speed = 95f,
                shots = 1, recovery = 1.25f, ammoCost = 1f, lifetime = 3f,
                impact = 1.1f, radius = 0.45f, windup = 0.22f,
            ),
            (WeaponSlot.CENTER to Stance.DASH) to WeaponSpec(
                name = "ARM PUNCH", kind = ProjectileKind.MELEE, damage = 230f, speed = 0f,
                recovery = 1.0f, ammoCost = 1f, lifetime = 0.22f, impact = 1.6f,
                radius = 3.2f, selfThrust = 34f, windup = 0.14f,
            ),
            (WeaponSlot.CENTER to Stance.AIR) to WeaponSpec(
                name = "DROP MORTAR", kind = ProjectileKind.MORTAR, damage = 170f, speed = 26f,
                recovery = 1.1f, ammoCost = 1f, lifetime = 4f, blastRadius = 8f,
                impact = 1.2f, gravity = 26f, launchPitch = -0.15f, radius = 0.4f,
            ),
        ),
    )

    val FANG_HOUND = AtSpec(
        id = "fang_hound",
        displayName = "FANG HOUND",
        codeName = "ATH-14-WP",
        blurb = "Red assault frame. Thicker plate, shorter reach, and a very bad temper.",
        armor = 1220f, radius = 1.65f, height = 4.4f,
        walkSpeed = 7.8f, dashSpeed = 25f, dashDuration = 0.8f, dashCost = 0.32f,
        boostRegen = 0.24f, jumpSpeed = 15.5f, turnRate = 3.8f, weight = 1.35f,
        bodyColor = 0x8A3B2E, trimColor = 0xE0B24A,
        weapons = mapOf(
            (WeaponSlot.RIGHT to Stance.GROUND) to WeaponSpec(
                name = "SHOT CANNON", kind = ProjectileKind.BULLET, damage = 26f, speed = 90f,
                shots = 6, spread = 0.075f, burstInterval = 0.01f, recovery = 0.75f,
                ammoCost = 0.34f, lifetime = 1.0f, impact = 0.16f, radius = 0.2f,
            ),
            (WeaponSlot.RIGHT to Stance.DASH) to WeaponSpec(
                name = "HIP SHOT", kind = ProjectileKind.BULLET, damage = 22f, speed = 88f,
                shots = 8, spread = 0.11f, burstInterval = 0.01f, recovery = 0.45f,
                ammoCost = 0.34f, lifetime = 0.9f, impact = 0.13f, radius = 0.2f,
            ),
            (WeaponSlot.RIGHT to Stance.AIR) to WeaponSpec(
                name = "AIR SHELL", kind = ProjectileKind.BULLET, damage = 30f, speed = 92f,
                shots = 5, spread = 0.09f, burstInterval = 0.02f, recovery = 0.5f,
                ammoCost = 0.34f, lifetime = 1.1f, impact = 0.18f, radius = 0.22f,
            ),
            (WeaponSlot.LEFT to Stance.GROUND) to WeaponSpec(
                name = "FLAME BURST", kind = ProjectileKind.NAPALM, damage = 40f, speed = 26f,
                shots = 4, spread = 0.09f, burstInterval = 0.06f, recovery = 0.7f,
                ammoCost = 0.4f, lifetime = 1.6f, blastRadius = 5f, impact = 0.28f,
                gravity = 8f, radius = 0.5f,
            ),
            (WeaponSlot.LEFT to Stance.DASH) to WeaponSpec(
                name = "FIRE WALL", kind = ProjectileKind.NAPALM, damage = 34f, speed = 20f,
                shots = 6, spread = 0.26f, burstInterval = 0.04f, recovery = 0.55f,
                ammoCost = 0.45f, lifetime = 2.2f, blastRadius = 5.5f, impact = 0.22f,
                gravity = 6f, radius = 0.55f,
            ),
            (WeaponSlot.LEFT to Stance.AIR) to WeaponSpec(
                name = "FIRE RAIN", kind = ProjectileKind.NAPALM, damage = 36f, speed = 18f,
                shots = 7, spread = 0.34f, burstInterval = 0.05f, recovery = 0.6f,
                ammoCost = 0.5f, lifetime = 2.4f, blastRadius = 5f, impact = 0.24f,
                gravity = 14f, radius = 0.5f,
            ),
            (WeaponSlot.CENTER to Stance.GROUND) to WeaponSpec(
                name = "HEAVY SLUG", kind = ProjectileKind.BULLET, damage = 180f, speed = 80f,
                recovery = 1.35f, ammoCost = 1f, lifetime = 2.6f, impact = 1.3f,
                radius = 0.5f, windup = 0.26f,
            ),
            (WeaponSlot.CENTER to Stance.DASH) to WeaponSpec(
                name = "SHOULDER RAM", kind = ProjectileKind.MELEE, damage = 270f, speed = 0f,
                recovery = 1.05f, ammoCost = 1f, lifetime = 0.26f, impact = 1.9f,
                radius = 3.6f, selfThrust = 38f, windup = 0.16f,
            ),
            (WeaponSlot.CENTER to Stance.AIR) to WeaponSpec(
                name = "DIVE STOMP", kind = ProjectileKind.MELEE, damage = 240f, speed = 0f,
                recovery = 1.1f, ammoCost = 1f, lifetime = 0.3f, impact = 1.7f,
                radius = 4.2f, selfThrust = -6f, windup = 0.2f,
            ),
        ),
    )

    val TORTOISE = AtSpec(
        id = "tortoise",
        displayName = "STANDING TORTOISE",
        codeName = "ATM-03-ST",
        blurb = "Artillery frame. Slow, wide, and able to end a round from the far wall.",
        armor = 1450f, radius = 1.85f, height = 4.0f,
        walkSpeed = 7.4f, strafeScale = 0.8f, backScale = 0.72f,
        dashSpeed = 23f, dashDuration = 0.75f, dashCost = 0.32f,
        boostRegen = 0.26f, jumpSpeed = 13.5f, jumpCost = 0.28f,
        turnRate = 3.2f, weight = 1.6f,
        bodyColor = 0x5A6B78, trimColor = 0xB6742F,
        weapons = mapOf(
            (WeaponSlot.RIGHT to Stance.GROUND) to WeaponSpec(
                name = "LONG CANNON", kind = ProjectileKind.PLASMA, damage = 118f, speed = 140f,
                shots = 1, recovery = 0.80f, ammoCost = 0.34f, lifetime = 3.5f,
                impact = 0.7f, radius = 0.3f, windup = 0.14f,
            ),
            (WeaponSlot.RIGHT to Stance.DASH) to WeaponSpec(
                name = "SNAP SHOT", kind = ProjectileKind.PLASMA, damage = 72f, speed = 130f,
                shots = 2, spread = 0.05f, burstInterval = 0.09f, recovery = 0.45f,
                ammoCost = 0.34f, lifetime = 3f, impact = 0.4f, radius = 0.26f,
            ),
            (WeaponSlot.RIGHT to Stance.AIR) to WeaponSpec(
                name = "ARC CANNON", kind = ProjectileKind.PLASMA, damage = 88f, speed = 120f,
                shots = 2, spread = 0.04f, burstInterval = 0.12f, recovery = 0.6f,
                ammoCost = 0.4f, lifetime = 3f, impact = 0.5f, radius = 0.28f,
            ),
            (WeaponSlot.LEFT to Stance.GROUND) to WeaponSpec(
                name = "MORTAR SALVO", kind = ProjectileKind.MORTAR, damage = 105f, speed = 42f,
                shots = 3, spread = 0.07f, burstInterval = 0.18f, recovery = 0.9f,
                ammoCost = 0.5f, lifetime = 6f, blastRadius = 8f, impact = 0.6f,
                gravity = 20f, launchPitch = 0.42f, radius = 0.4f,
            ),
            (WeaponSlot.LEFT to Stance.DASH) to WeaponSpec(
                name = "SIDE MORTAR", kind = ProjectileKind.MORTAR, damage = 74f, speed = 40f,
                shots = 2, spread = 0.16f, burstInterval = 0.09f, recovery = 0.6f,
                ammoCost = 0.45f, lifetime = 5f, blastRadius = 6.5f, impact = 0.5f,
                gravity = 20f, launchPitch = 0.3f, radius = 0.38f,
            ),
            (WeaponSlot.LEFT to Stance.AIR) to WeaponSpec(
                name = "SIEGE RAIN", kind = ProjectileKind.MORTAR, damage = 70f, speed = 34f,
                shots = 4, spread = 0.22f, burstInterval = 0.1f, recovery = 0.8f,
                ammoCost = 0.6f, lifetime = 5f, blastRadius = 6f, impact = 0.45f,
                gravity = 24f, radius = 0.36f,
            ),
            (WeaponSlot.CENTER to Stance.GROUND) to WeaponSpec(
                name = "SIEGE LANCE", kind = ProjectileKind.PLASMA, damage = 260f, speed = 160f,
                recovery = 1.4f, ammoCost = 1f, lifetime = 3f, blastRadius = 4f,
                impact = 1.5f, radius = 0.55f, windup = 0.35f,
            ),
            (WeaponSlot.CENTER to Stance.DASH) to WeaponSpec(
                name = "ROLLING BOMB", kind = ProjectileKind.MORTAR, damage = 210f, speed = 44f,
                recovery = 1.2f, ammoCost = 1f, lifetime = 4f, blastRadius = 10f,
                impact = 1.4f, gravity = 26f, launchPitch = 0.12f, radius = 0.5f,
            ),
            (WeaponSlot.CENTER to Stance.AIR) to WeaponSpec(
                name = "CARPET SHELL", kind = ProjectileKind.MORTAR, damage = 120f, speed = 30f,
                shots = 3, spread = 0.18f, burstInterval = 0.12f, recovery = 1.3f,
                ammoCost = 1f, lifetime = 4f, blastRadius = 7f, impact = 0.9f,
                gravity = 28f, radius = 0.42f,
            ),
        ),
    )

    val BERSERK = AtSpec(
        id = "berserk",
        displayName = "BERSERK HOUND",
        codeName = "ATH-Q1-EX",
        blurb = "Prototype duel frame. Paper thin, absurdly fast, all forward.",
        armor = 900f, radius = 1.4f, height = 4.3f,
        walkSpeed = 10.5f, strafeScale = 0.95f, backScale = 0.8f,
        dashSpeed = 33f, dashDuration = 0.85f, dashCost = 0.26f, dashTailCost = 0.18f,
        boostRegen = 0.32f, crouchBoostRegen = 1.0f,
        jumpSpeed = 19f, jumpCost = 0.18f, turnRate = 5.2f, weight = 0.8f,
        bodyColor = 0x36414F, trimColor = 0xCF4B3A,
        weapons = mapOf(
            (WeaponSlot.RIGHT to Stance.GROUND) to WeaponSpec(
                name = "ARM GUN", kind = ProjectileKind.BULLET, damage = 26f, speed = 130f,
                shots = 5, spread = 0.014f, burstInterval = 0.05f, recovery = 0.35f,
                ammoCost = 0.2f, lifetime = 1.8f, impact = 0.11f, radius = 0.16f,
            ),
            (WeaponSlot.RIGHT to Stance.DASH) to WeaponSpec(
                name = "RUSH FIRE", kind = ProjectileKind.BULLET, damage = 20f, speed = 130f,
                shots = 9, spread = 0.028f, burstInterval = 0.035f, recovery = 0.25f,
                ammoCost = 0.28f, lifetime = 1.6f, impact = 0.09f, radius = 0.16f,
            ),
            (WeaponSlot.RIGHT to Stance.AIR) to WeaponSpec(
                name = "FALL FIRE", kind = ProjectileKind.BULLET, damage = 24f, speed = 128f,
                shots = 6, spread = 0.02f, burstInterval = 0.045f, recovery = 0.3f,
                ammoCost = 0.24f, lifetime = 1.7f, impact = 0.1f, radius = 0.16f,
            ),
            (WeaponSlot.LEFT to Stance.GROUND) to WeaponSpec(
                name = "ARM PILE", kind = ProjectileKind.MELEE, damage = 190f, speed = 0f,
                recovery = 0.75f, ammoCost = 0.5f, lifetime = 0.2f, impact = 1.2f,
                radius = 3.0f, selfThrust = 18f, windup = 0.1f,
            ),
            (WeaponSlot.LEFT to Stance.DASH) to WeaponSpec(
                name = "SLASH RUSH", kind = ProjectileKind.MELEE, damage = 215f, speed = 0f,
                recovery = 0.7f, ammoCost = 0.5f, lifetime = 0.26f, impact = 1.5f,
                radius = 3.4f, selfThrust = 30f, windup = 0.09f,
            ),
            (WeaponSlot.LEFT to Stance.AIR) to WeaponSpec(
                name = "DIVE CLAW", kind = ProjectileKind.MELEE, damage = 205f, speed = 0f,
                recovery = 0.8f, ammoCost = 0.5f, lifetime = 0.28f, impact = 1.4f,
                radius = 3.6f, selfThrust = 24f, windup = 0.12f,
            ),
            (WeaponSlot.CENTER to Stance.GROUND) to WeaponSpec(
                name = "PILE BUNKER", kind = ProjectileKind.MELEE, damage = 330f, speed = 0f,
                recovery = 1.3f, ammoCost = 1f, lifetime = 0.24f, impact = 2.2f,
                radius = 3.2f, selfThrust = 26f, windup = 0.3f,
            ),
            (WeaponSlot.CENTER to Stance.DASH) to WeaponSpec(
                name = "LANCE CHARGE", kind = ProjectileKind.MELEE, damage = 300f, speed = 0f,
                recovery = 1.15f, ammoCost = 1f, lifetime = 0.34f, impact = 2.0f,
                radius = 3.4f, selfThrust = 46f, windup = 0.12f,
            ),
            (WeaponSlot.CENTER to Stance.AIR) to WeaponSpec(
                name = "SKY DIVIDER", kind = ProjectileKind.MELEE, damage = 290f, speed = 0f,
                recovery = 1.2f, ammoCost = 1f, lifetime = 0.36f, impact = 1.9f,
                radius = 4.0f, selfThrust = 30f, windup = 0.16f,
            ),
        ),
    )

    val all = listOf(SCOPE_HOUND, FANG_HOUND, TORTOISE, BERSERK)

    fun byId(id: String): AtSpec = all.firstOrNull { it.id == id } ?: SCOPE_HOUND
}
