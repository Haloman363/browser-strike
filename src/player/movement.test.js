// Run: node src/player/movement.test.js
import * as THREE from 'three';
import { CollisionWorld } from '../world/collision.js';
import { PlayerMovement, MOVE } from './movement.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const DT = 1 / 128;
let passed = 0;

let failed = 0;
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

function check(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok    ${name}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${e.message}`);
  }
}

const flatWorld = () => new CollisionWorld().addBox(V(0, -0.5, 0), V(200, 1, 200));
const noInput = { forward: 0, right: 0, jump: false, crouch: false };
const run = (p, input, ticks, yaw = 0) => {
  for (let i = 0; i < ticks; i++) p.update(input, yaw, DT);
};

check('settles onto the ground and stays grounded', () => {
  const p = new PlayerMovement(flatWorld(), V(0, 3, 0));
  run(p, noInput, 128);
  assert(p.grounded, 'expected grounded');
  const feet = p.position.y - p.height / 2;
  assert(Math.abs(feet) < 1e-2, `feet should rest at y=0, got ${feet}`);
});

check('forward run converges on max speed', () => {
  const p = new PlayerMovement(flatWorld(), V(0, 1, 0));
  run(p, noInput, 32);
  run(p, { ...noInput, forward: 1 }, 256);
  const speed = Math.hypot(p.velocity.x, p.velocity.z);
  assert(Math.abs(speed - MOVE.maxSpeed) < 0.15,
    `expected ~${MOVE.maxSpeed}, got ${speed.toFixed(3)}`);
});

check('diagonal input does not exceed max speed', () => {
  const p = new PlayerMovement(flatWorld(), V(0, 1, 0));
  run(p, noInput, 32);
  run(p, { ...noInput, forward: 1, right: 1 }, 256);
  const speed = Math.hypot(p.velocity.x, p.velocity.z);
  assert(speed <= MOVE.maxSpeed + 0.05,
    `diagonal must not be faster, got ${speed.toFixed(3)}`);
});

check('releasing input stops the player promptly', () => {
  const p = new PlayerMovement(flatWorld(), V(0, 1, 0));
  run(p, noInput, 32);
  run(p, { ...noInput, forward: 1 }, 256);
  run(p, noInput, 64); // half a second
  const speed = Math.hypot(p.velocity.x, p.velocity.z);
  assert(speed < 0.35, `expected near-stop, got ${speed.toFixed(3)}`);
});

check('jump leaves the ground and gravity returns it', () => {
  const p = new PlayerMovement(flatWorld(), V(0, 1, 0));
  run(p, noInput, 32);
  const restY = p.position.y;
  p.update({ ...noInput, jump: true }, 0, DT);
  assert(!p.grounded, 'expected airborne right after jump');
  let peak = -Infinity;
  for (let i = 0; i < 200; i++) {
    p.update(noInput, 0, DT);
    peak = Math.max(peak, p.position.y);
  }
  const height = peak - restY;
  // Source jump clears ~54 units ≈ 1.03 m.
  assert(height > 0.85 && height < 1.25, `jump height ${height.toFixed(3)}m out of range`);
  assert(p.grounded, 'expected to land again');
});

check('air acceleration is capped (no free ground speed in air)', () => {
  const p = new PlayerMovement(flatWorld(), V(0, 6, 0));
  // Airborne from the start; hold forward the whole way down.
  for (let i = 0; i < 40; i++) p.update({ ...noInput, forward: 1 }, 0, DT);
  const speed = Math.hypot(p.velocity.x, p.velocity.z);
  assert(speed <= MOVE.airWishCap + 0.02,
    `air speed should cap at ${MOVE.airWishCap}, got ${speed.toFixed(3)}`);
});

check('air-strafing gains speed beyond the air cap', () => {
  const p = new PlayerMovement(flatWorld(), V(0, 20, 0));
  p.velocity.set(0, 0, -MOVE.maxSpeed); // moving forward at run speed
  let yaw = 0;
  // Hold right-strafe while sweeping the mouse right: the classic gain.
  for (let i = 0; i < 220; i++) {
    yaw -= 0.006;
    p.update({ forward: 0, right: 1, jump: false, crouch: false }, yaw, DT);
  }
  const speed = Math.hypot(p.velocity.x, p.velocity.z);
  assert(speed > MOVE.maxSpeed * 1.05,
    `strafing should exceed run speed, got ${speed.toFixed(3)} vs ${MOVE.maxSpeed}`);
});

check('crouching lowers the eye and slows movement', () => {
  const p = new PlayerMovement(flatWorld(), V(0, 1, 0));
  run(p, noInput, 32);
  const standEye = p.eye.y;
  run(p, { ...noInput, crouch: true, forward: 1 }, 256);
  assert(p.eye.y < standEye - 0.3, `eye should drop, ${standEye} -> ${p.eye.y}`);
  const speed = Math.hypot(p.velocity.x, p.velocity.z);
  assert(Math.abs(speed - MOVE.crouchSpeed) < 0.15,
    `expected crouch speed ${MOVE.crouchSpeed}, got ${speed.toFixed(3)}`);
});

check('cannot stand up under a low ceiling', () => {
  // Underside at y=1.15 — below standing height (1.37), above crouch (0.97).
  const world = flatWorld().addBox(V(0, 1.3, 0), V(4, 0.3, 4));
  const p = new PlayerMovement(world, V(0, 0.5, 0));
  run(p, { ...noInput, crouch: true }, 64);
  assert(p.crouching, 'should be crouched');
  run(p, noInput, 64); // try to stand
  assert(p.height === MOVE.crouchHeight,
    `should stay crouched under ceiling, height=${p.height}`);
});

check('walks up a step instead of stopping', () => {
  // Raised platform starting at x=2 and extending well past the walk distance,
  // so the player ends up standing on top of it rather than crossing it.
  const world = flatWorld().addBox(V(30, 0.15, 0), V(56, 0.3, 8));
  const p = new PlayerMovement(world, V(0, 1, 0));
  run(p, noInput, 32);
  run(p, { ...noInput, forward: 0, right: 1 }, 128);
  assert(p.position.x > 2.5,
    `expected to climb onto the step, x=${p.position.x.toFixed(2)}`);
  const feet = p.position.y - p.height / 2;
  assert(feet > 0.25, `expected to stand on top (~0.3), feet=${feet.toFixed(3)}`);
});

check('a wall too tall to step is not climbed', () => {
  const world = flatWorld().addBox(V(3, 0.5, 0), V(2, 1, 8)); // 1m wall
  const p = new PlayerMovement(world, V(0, 1, 0));
  run(p, noInput, 32);
  run(p, { ...noInput, forward: 0, right: 1 }, 128);
  const feet = p.position.y - p.height / 2;
  assert(feet < 0.05, `should not have climbed a 1m wall, feet=${feet.toFixed(3)}`);
  assert(p.position.x < 2.1, `should be stopped by the wall, x=${p.position.x.toFixed(2)}`);
});

check('does not tunnel through a wall at high speed', () => {
  const world = flatWorld().addBox(V(6, 2, 0), V(0.5, 4, 20));
  const p = new PlayerMovement(world, V(0, 1, 0));
  p.velocity.set(60, 0, 0); // absurd speed, one big tick
  p.update(noInput, 0, 1 / 30);
  assert(p.position.x < 5.8, `tunnelled through wall to x=${p.position.x.toFixed(2)}`);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
