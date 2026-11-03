import * as THREE from "three";
import { afterEach, expect, test, vi } from "vitest";
import { PlayerFeedbackOverlay } from "./playerFeedbackOverlay";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function fixture(reducedMotion = false) {
  const preference = Object.assign(new EventTarget(), { matches: reducedMotion });
  const remove = vi.spyOn(preference, "removeEventListener");
  vi.stubGlobal("matchMedia", () => preference);
  const draws: number[] = [];
  let mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  const renderer = {
    autoClear: true,
    render: vi.fn((scene: THREE.Scene) => {
      mesh = scene.children[0] as typeof mesh;
      draws.push(mesh.material.uniforms.opacity.value as number);
    }),
  };
  const overlay = new PlayerFeedbackOverlay();
  return { overlay, preference, remove, draws, renderer,
    gl: renderer as unknown as THREE.WebGLRenderer,
    resources: () => mesh };
}

test("reduced motion suppresses transients, preserves death, and updates live", () => {
  const f = fixture(true);
  f.overlay.render(f.gl, { damage: 1, dead: false, respawn: 1 });
  expect(f.draws).toEqual([]);
  f.overlay.render(f.gl, { damage: 1, dead: true, respawn: 1 });
  expect(f.draws).toEqual([0.22]);
  f.preference.dispatchEvent(Object.assign(new Event("change"), { matches: false }));
  f.overlay.render(f.gl, { damage: 1, dead: false, respawn: 0 });
  expect(f.draws.at(-1)).toBe(0.3);
  expect(f.renderer.autoClear).toBe(true);
  f.overlay.dispose();
});

test("cleanup releases GPU resources and the preference listener exactly once", () => {
  const f = fixture();
  f.overlay.render(f.gl, { damage: 1, dead: false, respawn: 0 });
  const mesh = f.resources();
  const geometry = vi.fn();
  const material = vi.fn();
  mesh.geometry.addEventListener("dispose", geometry);
  mesh.material.addEventListener("dispose", material);
  f.overlay.dispose();
  f.overlay.dispose();
  expect(geometry).toHaveBeenCalledTimes(1);
  expect(material).toHaveBeenCalledTimes(1);
  expect(f.remove).toHaveBeenCalledTimes(1);
  f.overlay.render(f.gl, { damage: 1, dead: true, respawn: 1 });
  expect(f.renderer.render).toHaveBeenCalledTimes(1);
});

test("a rendering failure restores autoClear for the next pass", () => {
  const f = fixture();
  f.renderer.render.mockImplementationOnce(() => { throw new Error("draw_failed"); });
  expect(() => f.overlay.render(f.gl, { damage: 1, dead: false, respawn: 0 })).toThrow("draw_failed");
  expect(f.renderer.autoClear).toBe(true);
  f.overlay.dispose();
});
