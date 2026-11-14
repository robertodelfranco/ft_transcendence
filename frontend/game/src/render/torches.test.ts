import * as THREE from "three";
import { expect, it } from "vitest";
import { Torches } from "./torches";

// Tocha em (1,1) com parede ao norte (y=0): a chama fica 0,14 à frente da face, a luz mais 0,2.
const grid = ["111", "1T1", "101", "111"];

const flameScaleY = (torches: Torches) => {
  const flames = torches.object.children.find(
    (child): child is THREE.InstancedMesh => child instanceof THREE.InstancedMesh
      && child.geometry instanceof THREE.ConeGeometry,
  )!;
  const matrix = new THREE.Matrix4();
  flames.getMatrixAt(0, matrix);
  return new THREE.Vector3().setFromMatrixScale(matrix).y;
};

it("a luz fica à frente da chama, longe da parede", () => {
  const torches = new Torches(grid);
  torches.update(new THREE.Vector3(1.5, 0.5, 1.5), 0);
  const light = torches.object.children.find((child) => child instanceof THREE.PointLight)!;
  // face da parede norte em z=1; chama em z=1,14; luz em z=1,34
  expect(light.position.z).toBeCloseTo(1.34);
  torches.dispose();
});

it("a chama estica e encolhe com o tempo, no ritmo da luz", () => {
  const torches = new Torches(grid);
  const camera = new THREE.Vector3(1.5, 0.5, 1.5);
  torches.update(camera, 0);
  const before = flameScaleY(torches);
  torches.update(camera, 0.05);
  expect(flameScaleY(torches)).not.toBeCloseTo(before);
  torches.dispose();
});
