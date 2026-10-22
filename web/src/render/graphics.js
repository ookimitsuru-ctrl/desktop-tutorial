import * as THREE from 'three';
import { PostFX } from './post.js';

// レンダラーと画質設定・動的解像度スケーリング

export const QUALITY = {
  high: { scale: 1.0, maxDpr: 2.0, msaa: 4, post: true, shadow: 2048, crowd: 1.0 },
  medium: { scale: 0.85, maxDpr: 1.75, msaa: 4, post: true, shadow: 2048, crowd: 0.7 },
  low: { scale: 0.7, maxDpr: 1.5, msaa: 0, post: false, shadow: 1024, crowd: 0.4 },
};

export class Graphics {
  constructor(container) {
    this.container = container;
    const canvas = document.createElement('canvas');
    canvas.id = 'gl';
    container.appendChild(canvas);
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
      alpha: false,
      preserveDrawingBuffer: false,
    });
    const r = this.renderer;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NoToneMapping;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    this.post = new PostFX(r);
    this.qualityName = 'high';
    this.quality = QUALITY.high;
    this.dynScale = 1;
    this.frameTimes = [];
    this.autoQuality = true;
    this.width = 1;
    this.height = 1;
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  /** GPU名から初期の画質を推定 */
  guessQuality() {
    try {
      const gl = this.renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '';
      this.gpuName = name;
      if (/Mali-(T|G5[0-9]|G31|G52|G57)|Adreno \(TM\) (3|4|5)\d\d|PowerVR|SwiftShader/i.test(name)) return 'medium';
      if (/Adreno \(TM\) 6[0-3]\d/i.test(name)) return 'medium';
    } catch {
      /* 取得できない */
    }
    return 'high';
  }

  setQuality(name) {
    this.qualityName = name;
    this.quality = QUALITY[name] || QUALITY.high;
    this.post.msaa = this.quality.msaa;
    this.post.sceneRT?.dispose();
    this.post.sceneRT = null;
    this.post.width = 0;
    if (!this.quality.post) {
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    } else {
      this.renderer.toneMapping = THREE.NoToneMapping;
    }
    this.resize();
  }

  get pixelRatio() {
    return Math.min(devicePixelRatio || 1, this.quality.maxDpr) * this.quality.scale * this.dynScale;
  }

  resize() {
    const w = this.container.clientWidth || innerWidth;
    const h = this.container.clientHeight || innerHeight;
    this.width = w;
    this.height = h;
    const pr = this.pixelRatio;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, true);
    this.post.setSize(w * pr, h * pr);
    this.onResize?.(w, h);
  }

  get aspect() {
    return this.width / this.height;
  }

  render(scene, camera, time, toneExposure = 1) {
    if (this.quality.post) {
      this.post.render(scene, camera, time);
    } else {
      this.renderer.toneMappingExposure = this.post.uniforms.uExposure.value * toneExposure;
      this.renderer.setRenderTarget(null);
      this.renderer.render(scene, camera);
    }
  }

  /** フレーム時間を監視して、重い端末では描画解像度を自動で下げる */
  trackFrame(dt) {
    if (!this.autoQuality) return;
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 90) return;
    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length * 0.5)];
    this.frameTimes.length = 0;
    let next = this.dynScale;
    if (p50 > 1 / 45) {
      if (this.dynScale <= 0.6) {
        // 解像度を下げきっても重い: 画質プリセットを一段下げる
        this.onDegrade?.();
        return;
      }
      next = Math.max(0.55, this.dynScale - 0.1);
    } else if (p50 < 1 / 58 && this.dynScale < 1) next = Math.min(1, this.dynScale + 0.05);
    if (Math.abs(next - this.dynScale) > 1e-3) {
      this.dynScale = next;
      this.resize();
    }
  }
}
