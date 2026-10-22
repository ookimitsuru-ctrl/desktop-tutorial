import * as THREE from 'three';
import * as A from '../render/anim.js';
import { makePose, POSE_KEYS } from '../render/anim.js';

// 優勝セレモニー: トロフィーを掲げる主将、喜ぶ選手たち、紙吹雪と花火、周回カメラ

function trophyGeometry() {
  // 回転体のプロファイル（半径, 高さ）
  const pts = [
    [0.0, 0.0], [0.13, 0.0], [0.135, 0.02], [0.12, 0.04], [0.125, 0.06], [0.11, 0.08], [0.09, 0.1],
    [0.06, 0.13], [0.045, 0.2], [0.05, 0.26], [0.07, 0.3], [0.06, 0.34], [0.05, 0.38], [0.085, 0.42],
    [0.11, 0.46], [0.115, 0.5], [0.095, 0.54], [0.06, 0.565], [0.0, 0.575],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(pts, 48);
  g.computeVertexNormals();
  return g;
}

export class Ceremony {
  constructor(app, mv, team) {
    this.app = app;
    this.mv = mv;
    this.world = mv.world;
    this.team = mv.match.teams.find((t) => t.data.id === team.id);
    this.t = 0;
    this.pose = makePose();
    const gold = new THREE.MeshStandardMaterial({ color: 0xffc845, metalness: 1, roughness: 0.18, envMapIntensity: 1.6 });
    const green = new THREE.MeshStandardMaterial({ color: 0x0b5a3a, metalness: 0.2, roughness: 0.25 });
    this.trophy = new THREE.Group();
    const body = new THREE.Mesh(trophyGeometry(), gold);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.118, 0.012, 8, 48), green);
    band.rotation.x = Math.PI / 2;
    band.position.y = 0.065;
    const band2 = band.clone();
    band2.position.y = 0.035;
    this.trophy.add(body, band, band2);
    this.trophy.scale.setScalar(1.25);
    this.trophy.traverse((o) => {
      o.castShadow = true;
    });
    this.world.scene.add(this.trophy);
    this.light = new THREE.PointLight(0xfff0c0, 6, 6, 2);
    this.world.scene.add(this.light);
    this.nextConfetti = 0;
    this.nextFirework = 1;
    const kit = this.team.kit;
    this.colors = [kit.shirt, kit.shirt2, '#ffd84a', '#ffffff'];
    this.captain = this.team.players.filter((p) => !p.isGK).sort((a, b) => b.data.ovr - a.data.ovr)[0];
    this.world.fx.confettiBurst(this.colors, 900);
  }

  update(dt) {
    this.t += dt;
    const w = this.world;
    const H = w.humans;
    const team = this.team;
    const m = this.mv.match;
    const cx = 0;
    const cz = 4;
    m.teams.forEach((t, ti) => {
      t.players.forEach((p, i) => {
        const idx = ti * 11 + i;
        const tr = H.transforms[idx];
        const pose = this.pose;
        tr.visible = true;
        tr.y = 0;
        if (t === team) {
          if (p === this.captain) {
            tr.x = cx;
            tr.z = cz;
            tr.yaw = 0.15;
            A.throwBall(pose, 0.3, true);
            pose.lShSwing = 3.0;
            pose.rShSwing = 3.0;
            pose.lElbow = 0.35 + Math.sin(this.t * 3) * 0.1;
            pose.rElbow = 0.35 + Math.sin(this.t * 3) * 0.1;
            pose.rootY = Math.max(0, Math.sin(this.t * 4)) * 0.12;
            pose.groundLock = 0;
          } else {
            const k = t.players.indexOf(p);
            const ang = Math.PI * (0.15 + (k / 10) * 0.7);
            const r = 2.4 + (k % 2) * 1.1;
            tr.x = cx + Math.cos(ang) * r * 1.4;
            tr.z = cz - Math.sin(ang) * r * 0.6 - 0.8;
            tr.yaw = Math.atan2(cx - tr.x, cz + 6 - tr.z) * 0.3;
            A.celebrate(pose, k % 3 === 0 ? 2 : 3, 0.5, 0, 0, w.time + k);
            pose.rootY += Math.max(0, Math.sin(w.time * 6 + k)) * 0.22;
            pose.groundLock = 0;
          }
        } else {
          // 敗れたチームは少し離れて座り込む
          const k = t.players.indexOf(p);
          tr.x = -18 + k * 3.2;
          tr.z = -14 + (k % 3) * 2.5;
          tr.yaw = Math.PI;
          if (k % 2) A.dejected(pose, w.time, idx);
          else A.tired(pose, w.time, idx);
        }
        const target = H.poses[idx];
        const kk = 1 - Math.exp(-dt * 12);
        for (const key of POSE_KEYS) target[key] += (pose[key] - target[key]) * kk;
        target.groundLock = pose.groundLock;
      });
    });
    for (let k = 0; k < 3; k++) H.transforms[22 + k].visible = false;
    H.update();
    for (const f of w.flags) f.visible = false;
    // トロフィーは主将の両手の間
    const ci = team.index * 11 + this.captain.index;
    const hp = H.handPos[ci];
    this.trophy.position.set((hp[0].x + hp[1].x) / 2, (hp[0].y + hp[1].y) / 2 - 0.05, (hp[0].z + hp[1].z) / 2);
    this.trophy.rotation.y += dt * 0.6;
    this.light.position.copy(this.trophy.position).add(new THREE.Vector3(0.6, 0.8, 1.2));
    w.ball.update({ x: 0, y: -5, z: 0 }, { x: 0, y: 0, z: 0 }, dt, w.camera, true);
    w.markers.update(dt, { user: null, receiver: null, aim: null });
    // 紙吹雪・花火
    this.nextConfetti -= dt;
    if (this.nextConfetti <= 0) {
      this.nextConfetti = 2.5;
      w.fx.confettiBurst(this.colors, 350, { x: cx, z: cz, w: 30, d: 24 });
    }
    this.nextFirework -= dt;
    if (this.nextFirework <= 0) {
      this.nextFirework = 0.6 + Math.random() * 0.8;
      const a = Math.random() * Math.PI * 2;
      w.fx.firework(Math.cos(a) * 60, 55 + Math.random() * 25, Math.sin(a) * 45, this.colors[Math.floor(Math.random() * 3)]);
    }
    // 周回カメラ
    const cam = w.camera;
    const a = this.t * 0.18 - 0.3;
    const r = 9 - Math.min(2.5, this.t * 0.25);
    cam.position.set(cx + Math.sin(a) * r, 2.4 + Math.sin(this.t * 0.3) * 0.5, cz + Math.cos(a) * r);
    cam.lookAt(cx, 1.7, cz - 0.5);
    cam.fov = 40;
    cam.updateProjectionMatrix();
    w.stadium.setBroadcastView(false);
    w.crowd.setExcitement(1, 1, 1);
    w.update(dt);
  }

  destroy() {
    this.world.scene.remove(this.trophy);
    this.world.scene.remove(this.light);
  }
}
