import * as THREE from "three";

// Procedurally builds a Votoms-"AT" flavored humanoid mech:
// blocky torso, mono-eye head, chunky forearms, backpack thrusters,
// digitigrade-ish legs with boosters. Returns the root group plus
// named parts used for animation and weapon muzzle placement.
export function buildMech({
  armor = 0x5b6152,
  armorDark = 0x33372e,
  accent = 0xff8a2b,
  eye = 0xffcf3a,
  visor = 0x101410,
} = {}) {
  const matArmor = new THREE.MeshStandardMaterial({ color: armor, roughness: 0.65, metalness: 0.4 });
  const matArmorDark = new THREE.MeshStandardMaterial({ color: armorDark, roughness: 0.7, metalness: 0.35 });
  const matJoint = new THREE.MeshStandardMaterial({ color: 0x1c1e1a, roughness: 0.8, metalness: 0.2 });
  const matAccent = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.4, metalness: 0.6, emissive: accent, emissiveIntensity: 0.25 });
  const matEye = new THREE.MeshStandardMaterial({ color: eye, emissive: eye, emissiveIntensity: 2.2, roughness: 0.3 });
  const matThruster = new THREE.MeshStandardMaterial({ color: 0x223037, emissive: 0x2fb8ff, emissiveIntensity: 0.9, roughness: 0.4, metalness: 0.6 });
  const matBlade = new THREE.MeshStandardMaterial({ color: 0xbdf3ff, emissive: 0x4be3ff, emissiveIntensity: 2.4, roughness: 0.2, transparent: true, opacity: 0.92 });

  const root = new THREE.Object3D();
  const visualRoot = new THREE.Object3D();
  root.add(visualRoot);

  // ---- legs ----
  function buildLeg(sign) {
    const legRoot = new THREE.Object3D();
    legRoot.position.set(0.42 * sign, 1.12, 0);

    const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.62, 0.42), matArmor);
    thigh.position.y = -0.31;
    legRoot.add(thigh);

    const knee = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), matJoint);
    knee.position.y = -0.62;
    legRoot.add(knee);

    const shinRoot = new THREE.Object3D();
    shinRoot.position.y = -0.62;
    const shin = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.58, 0.36), matArmorDark);
    shin.position.y = -0.29;
    shinRoot.add(shin);

    const thruster = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 0.3, 10), matThruster);
    thruster.rotation.x = Math.PI / 2;
    thruster.position.set(0, -0.2, -0.24);
    shinRoot.add(thruster);

    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.16, 0.62), matArmorDark);
    foot.position.set(0, -0.66, 0.1);
    shinRoot.add(foot);

    legRoot.add(shinRoot);
    return { legRoot, thigh, shinRoot };
  }
  const legL = buildLeg(1);
  const legR = buildLeg(-1);
  visualRoot.add(legL.legRoot, legR.legRoot);

  // ---- hips / waist ----
  const hip = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.36, 0.62), matArmorDark);
  hip.position.y = 1.3;
  visualRoot.add(hip);

  // ---- torso ----
  const torsoRoot = new THREE.Object3D();
  torsoRoot.position.y = 1.48;
  visualRoot.add(torsoRoot);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.86, 0.68), matArmor);
  torso.position.y = 0.43;
  torsoRoot.add(torso);

  const chestPlate = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.18), matArmorDark);
  chestPlate.position.set(0, 0.55, 0.4);
  torsoRoot.add(chestPlate);

  const chestVent = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.03), matAccent);
  chestVent.position.set(0, 0.55, 0.5);
  torsoRoot.add(chestVent);

  // backpack with twin thrusters + saber storage
  const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.28), matArmorDark);
  backpack.position.set(0, 0.5, -0.44);
  torsoRoot.add(backpack);

  [-0.2, 0.2].forEach((x) => {
    const th = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.34, 10), matThruster);
    th.rotation.x = Math.PI / 2;
    th.position.set(x, 0.55, -0.6);
    torsoRoot.add(th);
  });

  // ---- shoulders / arms ----
  function buildArm(sign, isGunArm) {
    const shoulder = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.4), matArmorDark);
    shoulder.position.set(0.68 * sign, 0.78, 0);
    torsoRoot.add(shoulder);

    const armRoot = new THREE.Object3D();
    armRoot.position.set(0.68 * sign, 0.62, 0);
    torsoRoot.add(armRoot);

    const upperArm = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.5, 0.28), matArmor);
    upperArm.position.y = -0.25;
    armRoot.add(upperArm);

    const foreArmRoot = new THREE.Object3D();
    foreArmRoot.position.y = -0.52;
    armRoot.add(foreArmRoot);

    const foreArm = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.46, 0.3), matArmorDark);
    foreArm.position.y = -0.23;
    foreArmRoot.add(foreArm);

    let muzzle = null;
    let saberHilt = null;
    let saberBlade = null;

    if (isGunArm) {
      const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.5, 8), matJoint);
      gun.rotation.x = Math.PI / 2;
      gun.position.set(0, -0.4, 0.32);
      foreArmRoot.add(gun);
      muzzle = new THREE.Object3D();
      muzzle.position.set(0, -0.4, 0.6);
      foreArmRoot.add(muzzle);
    } else {
      saberHilt = new THREE.Object3D();
      saberHilt.position.set(0, -0.5, 0.1);
      foreArmRoot.add(saberHilt);
      const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.22, 8), matJoint);
      hilt.rotation.x = Math.PI / 2;
      saberHilt.add(hilt);
      saberBlade = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.02, 1.15, 8), matBlade);
      saberBlade.position.set(0, 0, 0.68);
      saberBlade.rotation.x = Math.PI / 2;
      saberBlade.visible = false;
      saberHilt.add(saberBlade);
    }

    return { shoulder, armRoot, foreArmRoot, muzzle, saberHilt, saberBlade };
  }
  const armR = buildArm(-1, true); // right forearm = gun
  const armL = buildArm(1, false); // left forearm = saber

  // ---- neck / head / mono-eye ----
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.14, 8), matJoint);
  neck.position.set(0, 0.9, 0);
  torsoRoot.add(neck);

  const headRoot = new THREE.Object3D();
  headRoot.position.set(0, 1.02, 0);
  torsoRoot.add(headRoot);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.3, 0.38), matArmorDark);
  headRoot.add(head);

  const visorMesh = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.05), new THREE.MeshStandardMaterial({ color: visor, roughness: 0.9 }));
  visorMesh.position.set(0, 0.02, 0.2);
  headRoot.add(visorMesh);

  const monoEye = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 10), matEye);
  monoEye.position.set(0, 0.02, 0.24);
  headRoot.add(monoEye);

  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.36, 6), matJoint);
  antenna.position.set(0.12, 0.28, -0.05);
  antenna.rotation.z = 0.25;
  headRoot.add(antenna);

  // shadow flags
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  return {
    root,
    visualRoot,
    parts: {
      hip,
      torsoRoot,
      headRoot,
      monoEye,
      legL,
      legR,
      armR, // gun arm
      armL, // saber arm
      muzzle: armR.muzzle,
      saberHilt: armL.saberHilt,
      saberBlade: armL.saberBlade,
    },
  };
}
