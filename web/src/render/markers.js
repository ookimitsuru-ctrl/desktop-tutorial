import * as THREE from 'three';

// 操作中の選手のリング、パスの受け手、セットプレーの狙い矢印など、ピッチ上の補助表示

const RING_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const RING_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
uniform float uOpacity;
uniform float uDash;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float ring = smoothstep(0.62, 0.7, r) * (1.0 - smoothstep(0.86, 0.94, r));
  float glow = exp(-pow((r - 0.78) * 5.0, 2.0)) * 0.5;
  float a = atan(p.y, p.x);
  float dash = uDash > 0.5 ? step(0.0, sin(a * 10.0 + uTime * 4.0)) : 1.0;
  float pulse = 0.8 + 0.2 * sin(uTime * 6.0);
  float alpha = (ring * dash + glow) * uOpacity * pulse;
  gl_FragColor = vec4(uColor * (1.0 + glow * 2.0), alpha);
}`;

function makeRing(color, dash = false) {
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    vertexShader: RING_VERT,
    fragmentShader: RING_FRAG,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uTime: { value: 0 },
      uOpacity: { value: 1 },
      uDash: { value: dash ? 1 : 0 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 3;
  m.frustumCulled = false;
  return m;
}

export class Markers {
  constructor(scene) {
    this.user = makeRing('#ffe14a');
    this.user.scale.setScalar(1.9);
    this.receiver = makeRing('#7fe7ff', true);
    this.receiver.scale.setScalar(1.6);
    scene.add(this.user, this.receiver);

    // 頭上の逆三角マーカー（画面上で一定サイズ）
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#ffe14a';
    g.strokeStyle = 'rgba(0,0,0,0.6)';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(10, 14);
    g.lineTo(54, 14);
    g.lineTo(32, 50);
    g.closePath();
    g.stroke();
    g.fill();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.arrow = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, sizeAttenuation: false, depthTest: false, transparent: true }));
    this.arrow.scale.set(0.028, 0.028, 1);
    this.arrow.renderOrder = 10;
    scene.add(this.arrow);

    // 狙い矢印
    const ag = new THREE.BufferGeometry();
    const pts = [
      [-0.12, 0], [0.12, 0], [0.12, 0.75], [0.3, 0.75], [0, 1], [-0.3, 0.75], [-0.12, 0.75],
    ];
    const verts = [];
    const tri = [[0, 1, 2], [0, 2, 6], [3, 4, 5], [2, 3, 5], [2, 5, 6]];
    for (const t of tri) for (const i of t) verts.push(pts[i][0], 0, pts[i][1]);
    ag.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    this.aim = new THREE.Mesh(
      ag,
      new THREE.MeshBasicMaterial({ color: 0xffe14a, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.aim.renderOrder = 4;
    this.aim.visible = false;
    scene.add(this.aim);
    this.time = 0;
  }

  setUserColor(color) {
    this.user.material.uniforms.uColor.value.set(color);
  }

  update(dt, { user, receiver, aim, showArrow = true }) {
    this.time += dt;
    for (const r of [this.user, this.receiver]) r.material.uniforms.uTime.value = this.time;
    if (user) {
      this.user.visible = true;
      this.user.position.set(user.x, 0.03, user.z);
      this.arrow.visible = showArrow;
      this.arrow.position.set(user.x, user.headY + 0.75 + Math.sin(this.time * 5) * 0.06, user.z);
    } else {
      this.user.visible = false;
      this.arrow.visible = false;
    }
    if (receiver) {
      this.receiver.visible = true;
      this.receiver.position.set(receiver.x, 0.03, receiver.z);
    } else this.receiver.visible = false;
    if (aim) {
      this.aim.visible = true;
      this.aim.position.set(aim.x, 0.05, aim.z);
      this.aim.rotation.y = Math.PI / 2 - aim.angle;
      this.aim.scale.setScalar(aim.length || 6);
    } else this.aim.visible = false;
  }
}
