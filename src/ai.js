import { dist2D, rand, clamp } from "./utils.js";

export class EnemyAI {
  constructor() {
    this.strafeDir = Math.random() < 0.5 ? 1 : -1;
    this.strafeTimer = rand(1.2, 2.4);
    this.decisionTimer = 0;
    this.wantDash = false;
    this.wantJump = false;
    this.wantShot = false;
    this.wantMissile = false;
    this.wantSaber = false;
    this.moveX = 0;
    this.moveY = 0;
  }

  update(dt, enemy, player, bullets) {
    const d = dist2D(enemy.position.x, enemy.position.z, player.position.x, player.position.z);

    this.strafeTimer -= dt;
    if (this.strafeTimer <= 0) {
      this.strafeTimer = rand(1.0, 2.2);
      if (Math.random() < 0.35) this.strafeDir *= -1;
    }

    // base movement: keep a preferred mid range, strafe around player
    const preferred = 11;
    let forward = 0;
    if (d > preferred + 2) forward = 1;
    else if (d < preferred - 3) forward = -1;

    this.moveY = forward;
    this.moveX = this.strafeDir * 0.85;

    // dodge incoming player bullets that are close & approaching
    this.wantDash = false;
    for (const b of bullets) {
      if (b.owner !== "player") continue;
      const bd = dist2D(b.mesh.position.x, b.mesh.position.z, enemy.position.x, enemy.position.z);
      if (bd < 6) {
        this.wantDash = Math.random() < 0.55;
        break;
      }
    }

    // occasional aggressive dash-in when far and boost is healthy
    if (!this.wantDash && d > preferred + 6 && enemy.boost > 40 && Math.random() < 0.01) {
      this.wantDash = true;
      this.moveY = 1;
      this.moveX = 0;
    }

    // jump occasionally to mix up approach
    this.wantJump = enemy.grounded && Math.random() < 0.002;

    // attacks
    this.wantSaber = d < 3.2 && enemy.canSaber() && Math.random() < 0.045;
    this.wantMissile = d < 20 && enemy.canMissile() && Math.random() < 0.012;
    this.wantShot = d < 22 && enemy.canShot() && Math.random() < 0.09;

    return {
      moveX: clamp(this.moveX, -1, 1),
      moveY: clamp(this.moveY, -1, 1),
      dash: this.wantDash,
      jump: this.wantJump,
      shot: this.wantShot,
      missile: this.wantMissile,
      saber: this.wantSaber,
    };
  }
}
