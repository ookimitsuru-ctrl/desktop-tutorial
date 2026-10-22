import * as THREE from 'three';
import { Environment, PRESETS } from '../render/environment.js';
import { createPitch, applyPitchStyle, PITCH_STYLES } from '../render/pitch.js';
import { Stadium } from '../render/stadium.js';
import { Crowd } from '../render/crowd.js';
import { Goals } from '../render/goals.js';
import { Humans } from '../render/humans.js';
import { BallView } from '../render/ballview.js';
import { Markers } from '../render/markers.js';
import { Effects } from '../render/fx.js';
import { shared } from '../render/shading.js';
import { computeBroadcastFrame } from '../render/cameras.js';
import { Rain } from '../render/rain.js';
import { StandFlags } from '../render/standflags.js';

// 3Dの世界（スタジアム一式）。タイトル画面から試合まで使い回す。

export class World {
  constructor(gfx) {
    this.gfx = gfx;
    this.scene = new THREE.Scene();
    this.env = new Environment(this.scene, gfx.renderer);
    this.pitch = createPitch();
    this.scene.add(this.pitch);
    this.stadium = new Stadium(this.scene);
    this.crowd = new Crowd(this.scene, gfx.quality.crowd);
    this.goals = new Goals(this.scene);
    this.humans = new Humans(this.scene, 40);
    this.ball = new BallView(this.scene);
    this.markers = new Markers(this.scene);
    this.fx = new Effects(this.scene);
    this.rain = new Rain(this.scene);
    this.standFlags = new StandFlags(this.scene);
    this.weather = 'clear';
    this.camera = new THREE.PerspectiveCamera(30, gfx.aspect, 0.5, 4000);
    this.time = 0;
    this.buildFlags();
    this.presetName = 'day';
    this.setPreset('day');
    this.broadcast = null;
    gfx.onResize = () => this.onResize();
    this.onResize();
  }

  buildFlags() {
    // 副審のフラッグ
    const c = document.createElement('canvas');
    c.width = 32;
    c.height = 32;
    const g = c.getContext('2d');
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      g.fillStyle = (x + y) % 2 ? '#ffd200' : '#e11d2e';
      g.fillRect(x * 8, y * 8, 8, 8);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const geo = new THREE.PlaneGeometry(0.42, 0.32);
    geo.translate(0.21, 0.0, 0);
    const mat = new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.7 });
    const stick = new THREE.CylinderGeometry(0.012, 0.012, 0.6, 5);
    this.flags = [0, 1].map(() => {
      const grp = new THREE.Group();
      const s = new THREE.Mesh(stick, new THREE.MeshStandardMaterial({ color: 0x222222 }));
      s.position.y = 0.0;
      const f = new THREE.Mesh(geo, mat);
      f.position.y = 0.16;
      grp.add(s, f);
      grp.visible = false;
      this.scene.add(grp);
      return grp;
    });
  }

  setWeather(w) {
    this.weather = w;
    this.setPreset(this.presetName);
  }

  setPreset(name) {
    this.presetName = name;
    this.env.apply(name, this.gfx.post, this.weather);
    const wet = this.weather === 'rain';
    this.rain.setEnabled(wet, name === 'night');
    this.pitch.userData.uniforms.uWet.value = wet ? 1 : 0;
    this.stadium.setLighting(this.env.preset);
    this.crowd.setLighting(this.env);
    this.humans.setBlobMode(name === 'night', name === 'night' ? 0.32 : name === 'sunset' ? 0.42 : 0.4);
    this.gfx.renderer.shadowMap.needsUpdate = true;
  }

  get preset() {
    return PRESETS[this.presetName];
  }

  setPitchStyle(i) {
    applyPitchStyle(this.pitch, PITCH_STYLES[i % PITCH_STYLES.length]);
  }

  setCrowdTeams(home, away) {
    this.crowd.setTeams(home, away);
  }

  onResize() {
    this.camera.aspect = this.gfx.aspect;
    this.broadcast = computeBroadcastFrame(this.gfx.aspect, { fov: 30, elevation: 40 });
    this.camera.updateProjectionMatrix();
    this.onAfterResize?.();
  }

  /** 中継カメラの位置にセット */
  setBroadcastCamera() {
    const f = this.broadcast;
    this.camera.fov = f.fov;
    this.camera.position.copy(f.position);
    this.camera.lookAt(f.target);
    this.camera.updateProjectionMatrix();
    this.stadium.setBroadcastView(true);
  }

  setShadowQuality(size) {
    this.env.setShadowQuality(size);
  }

  update(dt) {
    this.time += dt;
    shared.uTime.value = this.time;
    this.env.update(this.time);
    this.stadium.update(dt);
    this.crowd.update(dt);
    this.goals.update(this.time);
    this.fx.update(dt);
    this.rain.update(this.time, this.camera);
  }

  render() {
    this.gfx.render(this.scene, this.camera, this.time);
  }

  /**
   * 普段は隠れている描画物（足元のリング・頭上の矢印・粒子・雨・ボールの軌跡など）も含め、
   * 全ての材質のシェーダを先に作っておく。試合中に初めて表示された瞬間に作られて一瞬止まるのを防ぐ。
   */
  precompile({ warm = false } = {}) {
    const r = this.gfx.renderer;
    if (!this.gfx.post.sceneRT) this.gfx.resize();
    const prev = r.getRenderTarget();
    // 実際の描画と同じ描画先（HDR）を指定して、同じ種類のシェーダを作らせる
    r.setRenderTarget(this.gfx.post.sceneRT);
    r.compile(this.scene, this.camera);
    r.setRenderTarget(prev);
    if (!warm) return;
    // 影の描画用のシェーダは compile では作られないので、全てを表示し、影の範囲をピッチ全体にして
    // 一度描く（読み込み画面の裏で行うので見えない）
    const shown = [];
    const culled = [];
    this.scene.traverse((o) => {
      if (!o.visible) {
        o.visible = true;
        shown.push(o);
      }
      if (o.frustumCulled) {
        o.frustumCulled = false;
        culled.push(o);
      }
    });
    this.env.focusShadow(null);
    this.render();
    for (const o of shown) o.visible = false;
    for (const o of culled) o.frustumCulled = true;
  }
}
