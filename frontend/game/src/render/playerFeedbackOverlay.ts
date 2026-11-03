import * as THREE from "three";
import type { PlayerFeedbackState } from "./playerFeedback";

// Borda sem texto: centro transparente e câmera imóvel, inclusive durante dano.
export class PlayerFeedbackOverlay {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.Camera();
  private readonly geometry = new THREE.PlaneGeometry(2, 2);
  private readonly material = new THREE.ShaderMaterial({
    transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
    uniforms: {
      tint: { value: new THREE.Color() },
      opacity: { value: 0 },
    },
    vertexShader: `
      varying vec2 screenUv;
      void main() {
        screenUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 tint;
      uniform float opacity;
      varying vec2 screenUv;
      void main() {
        float edge = max(abs(screenUv.x - 0.5), abs(screenUv.y - 0.5));
        float border = smoothstep(0.28, 0.5, edge);
        gl_FragColor = vec4(tint, opacity * border);
        #include <colorspace_fragment>
      }
    `,
  });
  private readonly preference = typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  private reducedMotion = this.preference?.matches ?? false;
  private readonly onPreference = (event: MediaQueryListEvent) => {
    this.reducedMotion = event.matches;
  };
  private disposed = false;

  constructor() {
    const mesh = new THREE.Mesh(this.geometry, this.material);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    this.preference?.addEventListener("change", this.onPreference);
  }

  render(renderer: THREE.WebGLRenderer, feedback?: PlayerFeedbackState): void {
    if (this.disposed || !feedback) return;
    const damage = this.reducedMotion ? 0 : feedback.damage;
    const respawn = this.reducedMotion ? 0 : feedback.respawn;
    const opacity = Math.max(feedback.dead ? 0.22 : 0, damage * 0.3, respawn * 0.15);
    if (opacity <= 0) return;
    this.material.uniforms.opacity.value = opacity;
    this.material.uniforms.tint.value.setHex(damage > 0 ? 0x990000 : respawn > 0 ? 0x77bbaa : 0x000000);
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    try {
      renderer.render(this.scene, this.camera);
    } finally {
      renderer.autoClear = autoClear;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.preference?.removeEventListener("change", this.onPreference);
    this.scene.clear();
    this.geometry.dispose();
    this.material.dispose();
  }
}
