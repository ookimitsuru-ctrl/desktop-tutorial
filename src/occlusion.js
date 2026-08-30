import * as THREE from "three";
import { clamp } from "./utils.js";

const FADED_OPACITY = 0.08;
const FADE_SPEED = 9; // per-second lerp rate

// Fades out any wall/obstacle that ends up between the chase camera and the
// player (e.g. the player backed up against the arena wall) instead of
// letting it fill the whole screen.
export class OcclusionFader {
  constructor(occluders) {
    this.occluders = occluders; // [{ mesh, baseOpacity }]
    this.raycaster = new THREE.Raycaster();
    this._dir = new THREE.Vector3();
    this._targetPos = new THREE.Vector3();
    this._meshes = occluders.map((o) => o.mesh);
  }

  update(dt, camera, playerPosition) {
    this._targetPos.copy(playerPosition);
    this._targetPos.y += 1.6;
    this._dir.subVectors(this._targetPos, camera.position);
    const dist = this._dir.length();
    if (dist < 0.01) return;
    this._dir.divideScalar(dist);

    this.raycaster.set(camera.position, this._dir);
    this.raycaster.near = 0.05;
    this.raycaster.far = Math.max(0.1, dist - 0.4); // stop short of the player mesh itself

    const hits = this.raycaster.intersectObjects(this._meshes, false);
    const hitSet = new Set(hits.map((h) => h.object));

    const lerpT = clamp(dt * FADE_SPEED, 0, 1);
    for (const o of this.occluders) {
      const target = hitSet.has(o.mesh) ? FADED_OPACITY : o.baseOpacity;
      const mat = o.mesh.material;
      mat.opacity += (target - mat.opacity) * lerpT;
      mat.depthWrite = mat.opacity > 0.9;
    }
  }
}
