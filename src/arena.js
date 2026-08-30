import * as THREE from "three";
import { rand } from "./utils.js";

export const ARENA_RADIUS = 34;

function gridTexture() {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#12181c";
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = "rgba(75,227,255,0.28)";
  ctx.lineWidth = 2;
  const step = size / 16;
  for (let i = 0; i <= 16; i++) {
    ctx.beginPath();
    ctx.moveTo(i * step, 0);
    ctx.lineTo(i * step, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * step);
    ctx.lineTo(size, i * step);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(255,138,43,0.5)";
  ctx.lineWidth = 5;
  ctx.strokeRect(4, 4, size - 8, size - 8);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 6);
  return tex;
}

export function buildArena(scene) {
  // floor
  const floorGeo = new THREE.CircleGeometry(ARENA_RADIUS, 48);
  const floorMat = new THREE.MeshStandardMaterial({ map: gridTexture(), roughness: 0.95, metalness: 0.05, color: 0x9aa6ab });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // outer wall ring (low barrier, glowing top edge, VOOT-arena style)
  const wallGeo = new THREE.CylinderGeometry(ARENA_RADIUS + 0.6, ARENA_RADIUS + 0.6, 3.2, 48, 1, true);
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x1a2126,
    roughness: 0.7,
    metalness: 0.3,
    side: THREE.DoubleSide,
    emissive: 0x1c4c66,
    emissiveIntensity: 0.4,
    transparent: true,
    opacity: 1,
  });
  const wall = new THREE.Mesh(wallGeo, wallMat);
  wall.position.y = 1.6;
  scene.add(wall);

  const ringGeo = new THREE.TorusGeometry(ARENA_RADIUS + 0.6, 0.08, 8, 64);
  const ringMat = new THREE.MeshStandardMaterial({ color: 0x4be3ff, emissive: 0x4be3ff, emissiveIntensity: 1.4 });
  const ringTop = new THREE.Mesh(ringGeo, ringMat);
  ringTop.rotation.x = Math.PI / 2;
  ringTop.position.y = 3.2;
  scene.add(ringTop);

  // distant silhouettes for atmosphere (wasteland ruins, Votoms-esque)
  const ruinMat = new THREE.MeshStandardMaterial({ color: 0x0d1114, roughness: 1 });
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const r = ARENA_RADIUS + rand(14, 40);
    const h = rand(6, 26);
    const box = new THREE.Mesh(new THREE.BoxGeometry(rand(3, 8), h, rand(3, 8)), ruinMat);
    box.position.set(Math.cos(a) * r, h / 2, Math.sin(a) * r);
    box.rotation.y = rand(0, Math.PI);
    scene.add(box);
  }

  // scattered cover obstacles inside the arena. Each gets its own material
  // instance (not shared) so individual crates can fade independently when
  // they block the view of the player.
  const obstacles = [];
  const layout = [
    [10, 8],
    [-11, -6],
    [6, -13],
    [-8, 12],
  ];
  layout.forEach(([x, z]) => {
    const size = rand(2.6, 3.6);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x3a4147,
      roughness: 0.8,
      metalness: 0.3,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 1,
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size * 1.4, size), mat);
    mesh.position.set(x, (size * 1.4) / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    obstacles.push({ mesh, x, z, radius: size * 0.62 });
  });

  // occluders: everything that can end up between the chase camera and the
  // player, and should fade out rather than fill the screen when it does
  const occluders = [{ mesh: wall, baseOpacity: 1 }, ...obstacles.map((o) => ({ mesh: o.mesh, baseOpacity: 1 }))];

  return { radius: ARENA_RADIUS, obstacles, wall, occluders };
}
