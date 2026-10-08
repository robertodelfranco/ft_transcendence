<<<<<<< HEAD
=======
import * as THREE from "three";

const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  100,
);
camera.position.z = 3;

const sphere = new THREE.Mesh(
  new THREE.SphereGeometry(0.5, 32, 16),
  new THREE.MeshBasicMaterial({ color: 0x00f0ff }),
);
sphere.position.x = -0.8;

const sphere2 = new THREE.Mesh(
  new THREE.SphereGeometry(0.5, 32, 16),
  new THREE.MeshBasicMaterial({ color: 0xff0000 }),
);
sphere2.position.x = 0.8;

scene.add(sphere, sphere2);
renderer.render(scene, camera);
>>>>>>> a5f623a (test)
