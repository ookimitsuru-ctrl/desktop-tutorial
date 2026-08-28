import * as THREE from "three";
import { buildMech } from "./mechBuilder.js";
import { clamp, lerpAngle } from "./utils.js";

const MAX_HP = 100;
const MAX_BOOST = 100;
const RADIUS = 0.85; // collision radius (meters)

export class Mech {
  constructor(scene, colorScheme, { x = 0, z = 0, facing = 0 } = {}) {
    const { root, parts } = buildMech(colorScheme);
    this.root = root;
    this.parts = parts;
    this.root.position.set(x, 0, z);
    this.root.rotation.y = facing;
    scene.add(this.root);

    this.hp = MAX_HP;
    this.maxHp = MAX_HP;
    this.boost = MAX_BOOST;
    this.maxBoost = MAX_BOOST;
    this.radius = RADIUS;
    this.alive = true;

    this.velocity = new THREE.Vector3();
    this.grounded = true;
    this.jumpVel = 0;
    this.airborne = false;

    // timers / cooldowns
    this.shotCooldown = 0;
    this.missileCooldown = 0;
    this.saberCooldown = 0;
    this.dashCooldown = 0;
    this.dashTimer = 0;
    this.dashDir = new THREE.Vector3();
    this.invuln = 0;
    this.hitFlash = 0;

    this.missileAmmo = 4;
    this.maxMissileAmmo = 4;
    this.missileRegen = 0;

    this.saberActive = 0; // >0 while blade should be visible/damaging
    this.saberHasHit = false;

    this.walkPhase = 0;
    this.leanTarget = 0;
    this.lean = 0;
  }

  get position() {
    return this.root.position;
  }

  get facing() {
    return this.root.rotation.y;
  }

  faceTowards(targetAngle, turnSpeed, dt) {
    this.root.rotation.y = lerpAngle(this.root.rotation.y, targetAngle, clamp(turnSpeed * dt, 0, 1));
  }

  takeDamage(amount, knockbackDir = null, knockbackForce = 0) {
    if (this.invuln > 0 || !this.alive) return false;
    this.hp = clamp(this.hp - amount, 0, this.maxHp);
    this.hitFlash = 0.15;
    if (knockbackDir) {
      this.velocity.x += knockbackDir.x * knockbackForce;
      this.velocity.z += knockbackDir.z * knockbackForce;
    }
    if (this.hp <= 0) this.alive = false;
    return true;
  }

  canDash() {
    return this.dashCooldown <= 0 && this.boost >= 18 && this.dashTimer <= 0;
  }

  startDash(dirX, dirZ) {
    const len = Math.hypot(dirX, dirZ) || 1;
    this.dashDir.set(dirX / len, 0, dirZ / len);
    this.dashTimer = 0.22;
    this.dashCooldown = 0.45;
    this.invuln = 0.16;
    this.boost = clamp(this.boost - 18, 0, this.maxBoost);
  }

  canJump() {
    return this.grounded && this.boost >= 15;
  }

  startJump() {
    this.jumpVel = 6.4;
    this.grounded = false;
    this.airborne = true;
    this.boost = clamp(this.boost - 15, 0, this.maxBoost);
  }

  canShot() {
    return this.shotCooldown <= 0;
  }
  fireShotCooldown() {
    this.shotCooldown = 0.16;
  }

  canMissile() {
    return this.missileCooldown <= 0 && this.missileAmmo > 0;
  }
  fireMissileCooldown() {
    this.missileCooldown = 0.55;
    this.missileAmmo -= 1;
  }

  canSaber() {
    return this.saberCooldown <= 0;
  }
  startSaber() {
    this.saberCooldown = 0.85;
    this.saberActive = 0.42;
    this.saberHasHit = false;
  }

  getMuzzleWorldPos(target) {
    this.parts.muzzle.getWorldPosition(target);
    return target;
  }

  getSaberWorldPos(target) {
    this.parts.saberHilt.getWorldPosition(target);
    return target;
  }

  update(dt, { moving, moveDirX, moveDirZ } = {}) {
    // cooldown timers
    this.shotCooldown = Math.max(0, this.shotCooldown - dt);
    this.missileCooldown = Math.max(0, this.missileCooldown - dt);
    this.saberCooldown = Math.max(0, this.saberCooldown - dt);
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.saberActive = Math.max(0, this.saberActive - dt);
    if (this.parts.saberBlade) this.parts.saberBlade.visible = this.saberActive > 0;

    // boost regen (slower while dashing/jumping)
    if (this.dashTimer <= 0) {
      this.boost = clamp(this.boost + dt * 14, 0, this.maxBoost);
    }
    // missile ammo regen
    this.missileRegen += dt;
    if (this.missileRegen >= 3.2 && this.missileAmmo < this.maxMissileAmmo) {
      this.missileRegen = 0;
      this.missileAmmo += 1;
    }

    // dash motion (overrides normal move while active)
    if (this.dashTimer > 0) {
      this.dashTimer = Math.max(0, this.dashTimer - dt);
      const speed = 13.5;
      this.velocity.x = this.dashDir.x * speed;
      this.velocity.z = this.dashDir.z * speed;
      this.leanTarget = 0.22;
    } else if (moving) {
      this.leanTarget = 0.12;
    } else {
      this.leanTarget = 0;
      this.velocity.x *= 0.8;
      this.velocity.z *= 0.8;
    }

    // gravity / jump
    if (!this.grounded) {
      this.jumpVel -= 16 * dt;
      this.root.position.y += this.jumpVel * dt;
      if (this.root.position.y <= 0) {
        this.root.position.y = 0;
        this.grounded = true;
        this.airborne = false;
        this.jumpVel = 0;
      }
    }

    // apply horizontal velocity
    this.root.position.x += this.velocity.x * dt;
    this.root.position.z += this.velocity.z * dt;

    // walk-cycle & lean animation
    const speedMag = Math.hypot(this.velocity.x, this.velocity.z);
    if (speedMag > 0.4 && this.grounded) {
      this.walkPhase += dt * Math.min(10, 4 + speedMag);
    } else {
      this.walkPhase += dt * 1.2; // idle sway
    }
    this.lean = lerpAngle(this.lean, this.leanTarget, clamp(dt * 6, 0, 1));

    const swing = Math.sin(this.walkPhase) * (this.grounded ? clamp(speedMag / 8, 0, 1) : 0);
    this.parts.legL.legRoot.rotation.x = swing * 0.55;
    this.parts.legR.legRoot.rotation.x = -swing * 0.55;
    this.parts.legL.shinRoot.rotation.x = Math.max(0, -swing) * 0.7;
    this.parts.legR.shinRoot.rotation.x = Math.max(0, swing) * 0.7;

    this.parts.torsoRoot.rotation.x = -this.lean * 0.6 + Math.sin(this.walkPhase * 0.5) * 0.015;
    this.parts.torsoRoot.position.y = 1.48 + Math.abs(Math.sin(this.walkPhase)) * 0.03 * (this.grounded ? clamp(speedMag / 8, 0, 1) : 0);

    // arm recoil / saber swing pose
    const gunArm = this.parts.armR.foreArmRoot;
    gunArm.rotation.x = lerpAngle(gunArm.rotation.x, this.shotCooldown > 0.1 ? -0.35 : 0, clamp(dt * 10, 0, 1));

    const saberArm = this.parts.armL.armRoot;
    if (this.saberActive > 0) {
      const t = 1 - this.saberActive / 0.42;
      saberArm.rotation.x = -1.9 + t * 2.6;
      saberArm.rotation.z = -0.3 + t * 0.6;
    } else {
      saberArm.rotation.x = lerpAngle(saberArm.rotation.x, 0, clamp(dt * 8, 0, 1));
      saberArm.rotation.z = lerpAngle(saberArm.rotation.z, 0, clamp(dt * 8, 0, 1));
    }

    // hit flash tint
    const flashT = this.hitFlash > 0 ? 1 : 0;
    this.parts.monoEye.material.emissiveIntensity = 2.2 + flashT * 2;
  }

  dispose(scene) {
    scene.remove(this.root);
  }
}
