import * as THREE from "three";
import { dist2D } from "./utils.js";

const bulletGeo = new THREE.SphereGeometry(0.09, 6, 6);
const missileGeo = new THREE.ConeGeometry(0.1, 0.42, 6);

export class ProjectileSystem {
  constructor(scene) {
    this.scene = scene;
    this.bullets = [];
    this.missiles = [];
  }

  fireBullet(originPos, dirX, dirZ, owner, opts = {}) {
    const mat = new THREE.MeshStandardMaterial({
      color: owner === "player" ? 0x4be3ff : 0xff5a4d,
      emissive: owner === "player" ? 0x4be3ff : 0xff5a4d,
      emissiveIntensity: 3,
    });
    const mesh = new THREE.Mesh(bulletGeo, mat);
    mesh.position.copy(originPos);
    const light = new THREE.PointLight(mat.color, 1.2, 4);
    mesh.add(light);
    this.scene.add(mesh);
    this.bullets.push({
      mesh,
      dir: new THREE.Vector3(dirX, 0, dirZ).normalize(),
      speed: 34,
      life: 1.4,
      owner,
      damage: opts.damage ?? 4,
    });
  }

  fireMissile(originPos, dirX, dirZ, owner, target, opts = {}) {
    const mat = new THREE.MeshStandardMaterial({
      color: owner === "player" ? 0xffcf3a : 0xff8a2b,
      emissive: owner === "player" ? 0xffcf3a : 0xff8a2b,
      emissiveIntensity: 2,
    });
    const mesh = new THREE.Mesh(missileGeo, mat);
    mesh.position.copy(originPos);
    const light = new THREE.PointLight(mat.color, 1.4, 5);
    mesh.add(light);
    this.scene.add(mesh);
    const dir = new THREE.Vector3(dirX, 0, dirZ).normalize();
    mesh.rotation.x = Math.PI / 2;
    mesh.rotation.z = Math.atan2(dir.x, dir.z);
    this.missiles.push({
      mesh,
      dir,
      speed: 15,
      life: 4,
      owner,
      target,
      damage: opts.damage ?? 10,
    });
  }

  update(dt, { player, enemy, obstacles, arenaRadius, onHit }) {
    this._updateBullets(dt, { player, enemy, obstacles, arenaRadius, onHit });
    this._updateMissiles(dt, { player, enemy, obstacles, arenaRadius, onHit });
  }

  _resolveTargetMech(b, player, enemy) {
    return b.owner === "player" ? enemy : player;
  }

  _updateBullets(dt, { player, enemy, obstacles, arenaRadius, onHit }) {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.life -= dt;
      b.mesh.position.x += b.dir.x * b.speed * dt;
      b.mesh.position.z += b.dir.z * b.speed * dt;

      let dead = b.life <= 0;
      if (!dead) dead = this._checkArenaAndObstacles(b.mesh.position, obstacles, arenaRadius);

      if (!dead) {
        const target = this._resolveTargetMech(b, player, enemy);
        if (target.alive && dist2D(b.mesh.position.x, b.mesh.position.z, target.position.x, target.position.z) < target.radius) {
          onHit(target, b.damage, b.dir, 1.2);
          dead = true;
        }
      }

      if (dead) {
        this.scene.remove(b.mesh);
        this.bullets.splice(i, 1);
      }
    }
  }

  _updateMissiles(dt, { player, enemy, obstacles, arenaRadius, onHit }) {
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i];
      m.life -= dt;

      const target = m.target;
      if (target && target.alive) {
        const toTarget = new THREE.Vector3(target.position.x - m.mesh.position.x, 0, target.position.z - m.mesh.position.z).normalize();
        m.dir.lerp(toTarget, Math.min(1, dt * 2.6)).normalize();
        m.mesh.rotation.z = Math.atan2(m.dir.x, m.dir.z);
      }

      m.mesh.position.x += m.dir.x * m.speed * dt;
      m.mesh.position.z += m.dir.z * m.speed * dt;

      let dead = m.life <= 0;
      if (!dead) dead = this._checkArenaAndObstacles(m.mesh.position, obstacles, arenaRadius);

      if (!dead && target && target.alive) {
        if (dist2D(m.mesh.position.x, m.mesh.position.z, target.position.x, target.position.z) < target.radius + 0.4) {
          onHit(target, m.damage, m.dir, 2.6);
          dead = true;
        }
      }

      if (dead) {
        this.scene.remove(m.mesh);
        this.missiles.splice(i, 1);
      }
    }
  }

  _checkArenaAndObstacles(pos, obstacles, arenaRadius) {
    if (Math.hypot(pos.x, pos.z) > arenaRadius) return true;
    for (const o of obstacles) {
      if (dist2D(pos.x, pos.z, o.x, o.z) < o.radius) return true;
    }
    return false;
  }

  clear() {
    for (const b of this.bullets) this.scene.remove(b.mesh);
    for (const m of this.missiles) this.scene.remove(m.mesh);
    this.bullets = [];
    this.missiles = [];
  }
}

// melee saber hit test: attacker must be within range & roughly facing defender
export function checkSaberHit(attacker, defender) {
  const d = dist2D(attacker.position.x, attacker.position.z, defender.position.x, defender.position.z);
  if (d > 3.4) return false;
  const toTarget = Math.atan2(defender.position.x - attacker.position.x, defender.position.z - attacker.position.z);
  let diff = Math.abs(((toTarget - attacker.facing + Math.PI) % (Math.PI * 2)) - Math.PI);
  return diff < 0.9;
}
