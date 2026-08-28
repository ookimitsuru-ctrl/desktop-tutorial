import * as THREE from "three";
import { Mech } from "./mech.js";
import { buildArena } from "./arena.js";
import { ProjectileSystem, checkSaberHit } from "./weapons.js";
import { InputController } from "./input.js";
import { CameraRig } from "./camera.js";
import { EnemyAI } from "./ai.js";
import { HUD } from "./hud.js";
import { sfx } from "./audio.js";
import { clamp, dist2D } from "./utils.js";

const canvas = document.getElementById("scene");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a1016);
scene.fog = new THREE.Fog(0x0a1016, 30, 95);

const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 400);

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

// ---- lighting ----
scene.add(new THREE.AmbientLight(0x8fa6b8, 0.55));
const sun = new THREE.DirectionalLight(0xfff2d6, 1.15);
sun.position.set(20, 30, -10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -40;
sun.shadow.camera.right = 40;
sun.shadow.camera.top = 40;
sun.shadow.camera.bottom = -40;
sun.shadow.camera.far = 120;
scene.add(sun);
const rim = new THREE.DirectionalLight(0x4be3ff, 0.35);
rim.position.set(-15, 10, 20);
scene.add(rim);

const arena = buildArena(scene);

// ---- mechs ----
const player = new Mech(
  scene,
  { armor: 0x5b6152, armorDark: 0x2e3226, accent: 0x4be3ff, eye: 0xffcf3a },
  { x: -9, z: 0, facing: Math.PI / 2 }
);
const enemy = new Mech(
  scene,
  { armor: 0x6b3230, armorDark: 0x2c1614, accent: 0xff3b4e, eye: 0xff5a4d },
  { x: 9, z: 0, facing: -Math.PI / 2 }
);

const cameraRig = new CameraRig(camera);
const input = new InputController();
const projectiles = new ProjectileSystem(scene);
const ai = new EnemyAI();
const hud = new HUD();

let state = "start"; // start | countdown | playing | result
let timer = 60;
let shake = 0;
let prevInput = { dash: false, jump: false, saber: false, missile: false };

const tmpVec = new THREE.Vector3();

function resetRound() {
  player.hp = player.maxHp;
  player.boost = player.maxBoost;
  player.missileAmmo = player.maxMissileAmmo;
  player.alive = true;
  player.root.position.set(-9, 0, 0);
  player.root.rotation.y = Math.PI / 2;
  player.velocity.set(0, 0, 0);

  enemy.hp = enemy.maxHp;
  enemy.boost = enemy.maxBoost;
  enemy.missileAmmo = enemy.maxMissileAmmo;
  enemy.alive = true;
  enemy.root.position.set(9, 0, 0);
  enemy.root.rotation.y = -Math.PI / 2;
  enemy.velocity.set(0, 0, 0);

  projectiles.clear();
  timer = 60;
}

function startCountdown() {
  resetRound();
  state = "countdown";
  hud.hideResult();
  const steps = ["3", "2", "1", "FIGHT!"];
  steps.forEach((label, i) => {
    setTimeout(() => {
      hud.flashMessage(label);
      if (label === "FIGHT!") {
        sfx.fight();
        state = "playing";
      } else {
        sfx.countdown();
      }
    }, i * 700);
  });
}

document.getElementById("start-btn").addEventListener("click", () => {
  hud.hideStart();
  startCountdown();
});
document.getElementById("retry-btn").addEventListener("click", () => {
  hud.hideResult();
  startCountdown();
});

function resolveArenaBounds(mech) {
  const r = Math.hypot(mech.root.position.x, mech.root.position.z);
  if (r > arena.radius - mech.radius) {
    const scale = (arena.radius - mech.radius) / r;
    mech.root.position.x *= scale;
    mech.root.position.z *= scale;
  }
  for (const o of arena.obstacles) {
    const d = dist2D(mech.root.position.x, mech.root.position.z, o.x, o.z);
    const minD = o.radius + mech.radius;
    if (d < minD && d > 0.0001) {
      const push = (minD - d) / d;
      mech.root.position.x += (mech.root.position.x - o.x) * push;
      mech.root.position.z += (mech.root.position.z - o.z) * push;
    }
  }
}

function onProjectileHit(target, dmg, dir, knockback) {
  target.takeDamage(dmg, dir, knockback);
  shake = Math.max(shake, 0.18);
  sfx.hit();
}

function applyMovement(mech, moveX, moveY, axis, perp, speed) {
  if (mech.dashTimer > 0) return; // dash handles its own velocity
  const dx = perp.x * moveX + axis.x * moveY;
  const dz = perp.z * moveX + axis.z * moveY;
  const len = Math.hypot(dx, dz);
  if (len > 0.05) {
    mech.velocity.x = (dx / Math.max(len, 1)) * speed * Math.min(len, 1);
    mech.velocity.z = (dz / Math.max(len, 1)) * speed * Math.min(len, 1);
  } else {
    mech.velocity.x *= 0.8;
    mech.velocity.z *= 0.8;
  }
}

function handleSaberResolution(attacker, defender) {
  if (attacker.saberActive > 0 && !attacker.saberHasHit && attacker.saberActive <= 0.28) {
    if (checkSaberHit(attacker, defender)) {
      const dir = new THREE.Vector3(defender.position.x - attacker.position.x, 0, defender.position.z - attacker.position.z).normalize();
      defender.takeDamage(22, dir, 4.5);
      attacker.saberHasHit = true;
      shake = Math.max(shake, 0.32);
      sfx.hit();
    }
  }
}

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, clock.getDelta());

  const inp = input.poll();

  if (state === "playing") {
    // --- facing: both mechs always face each other (Virtual On lock-on style) ---
    const angPtoE = Math.atan2(enemy.position.x - player.position.x, enemy.position.z - player.position.z);
    const angEtoP = Math.atan2(player.position.x - enemy.position.x, player.position.z - enemy.position.z);
    player.faceTowards(angPtoE, 10, dt);
    enemy.faceTowards(angEtoP, 6, dt);

    // movement axes for player relative to the lock-on line
    const axis = new THREE.Vector3(enemy.position.x - player.position.x, 0, enemy.position.z - player.position.z).normalize();
    const perp = new THREE.Vector3(-axis.z, 0, axis.x);

    const moving = Math.abs(inp.moveX) > 0.08 || Math.abs(inp.moveY) > 0.08;
    applyMovement(player, inp.moveX, inp.moveY, axis, perp, 6.4);

    // dash (rising edge)
    if (inp.dash && !prevInput.dash && player.canDash()) {
      let ddx = perp.x * inp.moveX + axis.x * inp.moveY;
      let ddz = perp.z * inp.moveX + axis.z * inp.moveY;
      if (Math.hypot(ddx, ddz) < 0.1) {
        ddx = axis.x;
        ddz = axis.z;
      }
      player.startDash(ddx, ddz);
      sfx.dash();
    }
    // jump (rising edge)
    if (inp.jump && !prevInput.jump && player.canJump()) {
      player.startJump();
    }
    // shot (continuous, cooldown limited)
    if (inp.shot && player.canShot()) {
      const muzzle = player.getMuzzleWorldPos(tmpVec.clone());
      const dir = new THREE.Vector3(enemy.position.x - muzzle.x, 0, enemy.position.z - muzzle.z);
      projectiles.fireBullet(muzzle, dir.x, dir.z, "player", { damage: 4 });
      player.fireShotCooldown();
      sfx.shot();
    }
    // missile (rising edge)
    if (inp.missile && !prevInput.missile && player.canMissile()) {
      const muzzle = player.getMuzzleWorldPos(tmpVec.clone());
      const dir = new THREE.Vector3(enemy.position.x - muzzle.x, 0, enemy.position.z - muzzle.z);
      projectiles.fireMissile(muzzle, dir.x, dir.z, "player", enemy, { damage: 10 });
      player.fireMissileCooldown();
      sfx.missile();
    }
    // saber (rising edge)
    if (inp.saber && !prevInput.saber && player.canSaber()) {
      player.startSaber();
      const d = dist2D(player.position.x, player.position.z, enemy.position.x, enemy.position.z);
      if (d > 3.4 && d < 6.5) {
        player.velocity.x += axis.x * 9;
        player.velocity.z += axis.z * 9;
      }
      sfx.saber();
    }

    prevInput = { dash: inp.dash, jump: inp.jump, saber: inp.saber, missile: inp.missile };

    // --- enemy AI ---
    const decision = ai.update(dt, enemy, player, [...projectiles.bullets, ...projectiles.missiles]);
    const axisE = new THREE.Vector3(player.position.x - enemy.position.x, 0, player.position.z - enemy.position.z).normalize();
    const perpE = new THREE.Vector3(-axisE.z, 0, axisE.x);
    applyMovement(enemy, decision.moveX, decision.moveY, axisE, perpE, 6.0);

    if (decision.dash && enemy.canDash()) {
      let ddx = perpE.x * decision.moveX + axisE.x * decision.moveY;
      let ddz = perpE.z * decision.moveX + axisE.z * decision.moveY;
      if (Math.hypot(ddx, ddz) < 0.1) {
        ddx = axisE.x;
        ddz = axisE.z;
      }
      enemy.startDash(ddx, ddz);
    }
    if (decision.jump && enemy.canJump()) enemy.startJump();
    if (decision.shot && enemy.canShot()) {
      const muzzle = enemy.getMuzzleWorldPos(tmpVec.clone());
      const dir = new THREE.Vector3(player.position.x - muzzle.x, 0, player.position.z - muzzle.z);
      projectiles.fireBullet(muzzle, dir.x, dir.z, "enemy", { damage: 4 });
      enemy.fireShotCooldown();
    }
    if (decision.missile && enemy.canMissile()) {
      const muzzle = enemy.getMuzzleWorldPos(tmpVec.clone());
      const dir = new THREE.Vector3(player.position.x - muzzle.x, 0, player.position.z - muzzle.z);
      projectiles.fireMissile(muzzle, dir.x, dir.z, "enemy", player, { damage: 10 });
      enemy.fireMissileCooldown();
    }
    if (decision.saber && enemy.canSaber()) {
      enemy.startSaber();
      const d = dist2D(enemy.position.x, enemy.position.z, player.position.x, player.position.z);
      if (d > 3.4 && d < 6.5) {
        enemy.velocity.x += axisE.x * 9;
        enemy.velocity.z += axisE.z * 9;
      }
    }

    // --- physics update ---
    player.update(dt, { moving });
    enemy.update(dt, { moving: decision.moveX !== 0 || decision.moveY !== 0 });
    resolveArenaBounds(player);
    resolveArenaBounds(enemy);

    // --- saber resolution ---
    handleSaberResolution(player, enemy);
    handleSaberResolution(enemy, player);

    // --- projectiles ---
    projectiles.update(dt, { player, enemy, obstacles: arena.obstacles, arenaRadius: arena.radius, onHit: onProjectileHit });

    // --- round end checks ---
    timer -= dt;
    if (!player.alive || !enemy.alive || timer <= 0) {
      let win;
      if (!player.alive && !enemy.alive) win = false;
      else if (!player.alive) win = false;
      else if (!enemy.alive) win = true;
      else win = player.hp >= enemy.hp;
      state = "result";
      sfx.explode();
      setTimeout(() => hud.showResult(win), 550);
    }
  } else {
    // idle animation while not fighting
    player.update(dt, { moving: false });
    enemy.update(dt, { moving: false });
  }

  shake = Math.max(0, shake - dt * 1.4);
  cameraRig.update(dt, player, enemy, 0, shake);
  hud.update({ player, enemy, timer, camera });

  renderer.render(scene, camera);
}

animate();
