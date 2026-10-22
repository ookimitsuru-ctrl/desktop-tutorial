import * as THREE from 'three';

// パーティクル: スライディングの芝の飛沫、ゴール後の紙吹雪、優勝時の花火

const VERT = /* glsl */ `
attribute vec4 aColor;
attribute float aSize;
varying vec4 vColor;
void main() {
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (600.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = /* glsl */ `
varying vec4 vColor;
uniform float uSquare;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float a = uSquare > 0.5 ? step(abs(p.x), 0.9) * step(abs(p.y), 0.55) : 1.0 - smoothstep(0.5, 1.0, length(p));
  if (a < 0.05) discard;
  gl_FragColor = vec4(vColor.rgb, vColor.a * a);
}`;

class ParticlePool {
  constructor(scene, max, { additive = false, square = false } = {}) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.base = new Float32Array(max * 4);
    this.spin = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(
      g,
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: { uSquare: { value: square ? 1 : 0 } },
        transparent: true,
        depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      }),
    );
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
    this.cursor = 0;
    this.alive = 0;
  }

  emit(x, y, z, vx, vy, vz, color, size, life, grav = 9.8, drag = 0.5) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this.base.set([color.r, color.g, color.b, color.a ?? 1], i * 4);
    this.size[i] = size;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.grav[i] = grav;
    this.drag[i] = drag;
    this.spin[i] = Math.random() * 6.28;
  }

  update(dt) {
    let alive = 0;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) {
        this.col[i * 4 + 3] = 0;
        continue;
      }
      alive++;
      this.life[i] -= dt;
      const k = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= k;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k - this.grav[i] * dt;
      this.vel[i * 3 + 2] *= k;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0.02) {
        this.pos[i * 3 + 1] = 0.02;
        this.vel[i * 3] *= 0.5;
        this.vel[i * 3 + 2] *= 0.5;
        this.vel[i * 3 + 1] = 0;
      }
      const f = this.life[i] / this.maxLife[i];
      // 紙吹雪のちらつき（裏表）
      this.spin[i] += dt * 8;
      const flick = 0.6 + 0.4 * Math.abs(Math.sin(this.spin[i]));
      this.col[i * 4] = this.base[i * 4] * flick;
      this.col[i * 4 + 1] = this.base[i * 4 + 1] * flick;
      this.col[i * 4 + 2] = this.base[i * 4 + 2] * flick;
      this.col[i * 4 + 3] = this.base[i * 4 + 3] * Math.min(1, f * 3);
    }
    this.alive = alive;
    this.points.visible = alive > 0;
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.aColor.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true;
  }
}

export class Effects {
  constructor(scene) {
    this.grass = new ParticlePool(scene, 300);
    this.confetti = new ParticlePool(scene, 1500, { square: true });
    this.sparks = new ParticlePool(scene, 1200, { additive: true });
    this.fireworks = [];
  }

  grassSpray(x, z, dirX, dirZ, amount = 14) {
    for (let i = 0; i < amount; i++) {
      const s = 1.5 + Math.random() * 3;
      const g = 0.25 + Math.random() * 0.25;
      this.grass.emit(
        x + (Math.random() - 0.5) * 0.4,
        0.05,
        z + (Math.random() - 0.5) * 0.4,
        dirX * s + (Math.random() - 0.5) * 2,
        1 + Math.random() * 2.5,
        dirZ * s + (Math.random() - 0.5) * 2,
        { r: g * 0.5, g, b: g * 0.3, a: 1 },
        0.05 + Math.random() * 0.05,
        0.6 + Math.random() * 0.5,
      );
    }
  }

  /** スタンドから紙吹雪を降らせる */
  confettiBurst(colors, count = 600, area = null) {
    for (let i = 0; i < count; i++) {
      const c = new THREE.Color(colors[i % colors.length]);
      const x = area ? area.x + (Math.random() - 0.5) * area.w : (Math.random() - 0.5) * 120;
      const z = area ? area.z + (Math.random() - 0.5) * area.d : (Math.random() < 0.5 ? -1 : 1) * (45 + Math.random() * 20);
      this.confetti.emit(x, 18 + Math.random() * 20, z, (Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3, { r: c.r, g: c.g, b: c.b, a: 1 }, 0.14 + Math.random() * 0.08, 6 + Math.random() * 4, 1.2, 1.6);
    }
  }

  firework(x, y, z, color) {
    const c = new THREE.Color(color);
    for (let i = 0; i < 120; i++) {
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const s = 10 + Math.random() * 6;
      this.sparks.emit(x, y, z, Math.cos(a) * r * s, u * s, Math.sin(a) * r * s, { r: c.r * 4, g: c.g * 4, b: c.b * 4, a: 1 }, 0.5, 1.4 + Math.random() * 0.8, 3, 1.4);
    }
  }

  update(dt) {
    this.grass.update(dt);
    this.confetti.update(dt);
    this.sparks.update(dt);
  }
}
