// Run: node src/world/collision.test.js
import * as THREE from 'three';
import { CollisionWorld } from './collision.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const half = V(0.4, 0.9, 0.4);
let passed = 0;

function check(name, fn) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

// Floor at y=0 (1 unit thick, top surface at y=0), wall at x=5.
const world = new CollisionWorld()
  .addBox(V(0, -0.5, 0), V(40, 1, 40))
  .addBox(V(5, 2, 0), V(1, 4, 10));

check('clear path moves fully', () => {
  const pos = V(0, 1, 0);
  world.moveSlide(pos, half, V(1, 0, 0), 1);
  console.assert(Math.abs(pos.x - 1) < 1e-2, `expected x~1, got ${pos.x}`);
});

check('walking into a wall stops at its face', () => {
  const pos = V(0, 1, 0);
  world.moveSlide(pos, half, V(20, 0, 0), 1);
  // Wall face at x=4.5, minus our half-width 0.4.
  console.assert(pos.x < 4.11 && pos.x > 4.0, `expected x~4.1, got ${pos.x}`);
});

check('falling onto the floor reports grounded', () => {
  const pos = V(0, 5, 0);
  const out = {};
  const vel = V(0, -20, 0);
  world.moveSlide(pos, half, vel, 1, out);
  console.assert(out.grounded, 'expected grounded=true');
  console.assert(Math.abs(pos.y - 0.9) < 1e-2, `expected y~0.9, got ${pos.y}`);
  console.assert(Math.abs(vel.y) < 1e-3, `floor should cancel fall speed, got ${vel.y}`);
});

check('diagonal into a wall slides along it', () => {
  const pos = V(0, 1, 0);
  const vel = V(20, 0, 5);
  world.moveSlide(pos, half, vel, 1);
  console.assert(pos.x < 4.11, `should be blocked in x, got ${pos.x}`);
  console.assert(pos.z > 1, `should retain z motion (slide), got ${pos.z}`);
});

check('depenetrate escapes a brush', () => {
  const pos = V(5, 2, 0); // dead centre of the wall
  world.depenetrate(pos, half);
  const inside = pos.x > 4.5 - half.x && pos.x < 5.5 + half.x &&
                 pos.y > 0 - half.y && pos.y < 4 + half.y &&
                 pos.z > -5 - half.z && pos.z < 5 + half.z;
  console.assert(!inside, `still inside brush at ${pos.toArray()}`);
});

check('raycast hits the wall at the expected distance', () => {
  const hit = world.raycast(V(0, 2, 0), V(1, 0, 0));
  console.assert(hit, 'expected a hit');
  console.assert(Math.abs(hit.distance - 4.5) < 1e-3, `expected 4.5, got ${hit.distance}`);
});

check('raycast into empty space misses', () => {
  const hit = world.raycast(V(0, 2, 0), V(-1, 0, 0), 3);
  console.assert(!hit, 'expected no hit');
});

console.log(`\n${passed} checks passed`);
