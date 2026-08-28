import * as THREE from "three";

// Virtual-On style lock-on chase camera: always frames the axis between
// the two mechs from behind the player, with a slight free-look orbit.
export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.orbit = 0; // radians, user-controlled side orbit
    this._pos = new THREE.Vector3(0, 6, -10);
    this._look = new THREE.Vector3();
    camera.position.copy(this._pos);
  }

  update(dt, player, enemy, orbitInput = 0, shake = 0) {
    this.orbit += orbitInput * dt * 1.6;
    this.orbit *= 0.9; // self-centering

    const p = player.position;
    const e = enemy.position;
    let axis = new THREE.Vector3(e.x - p.x, 0, e.z - p.z);
    if (axis.lengthSq() < 0.0001) axis.set(0, 0, 1);
    axis.normalize();

    const perp = new THREE.Vector3(-axis.z, 0, axis.x);
    const orbitAxis = axis.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), this.orbit);
    const orbitPerp = new THREE.Vector3(-orbitAxis.z, 0, orbitAxis.x);

    const camDistance = 8.5;
    const camHeight = 4.4;

    const desired = new THREE.Vector3(
      p.x - orbitAxis.x * camDistance + orbitPerp.x * 0.6,
      p.y + camHeight,
      p.z - orbitAxis.z * camDistance + orbitPerp.z * 0.6
    );

    const lookTarget = new THREE.Vector3(
      p.x + axis.x * 3.5,
      p.y + 2.4 + (e.y - p.y) * 0.3,
      p.z + axis.z * 3.5
    );

    const smooth = 1 - Math.pow(0.0008, dt);
    this._pos.lerp(desired, smooth);
    this._look.lerp(lookTarget, smooth);

    let shakeOffset = new THREE.Vector3();
    if (shake > 0) {
      shakeOffset.set((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    }

    this.camera.position.copy(this._pos).add(shakeOffset);
    this.camera.lookAt(this._look);
  }
}
