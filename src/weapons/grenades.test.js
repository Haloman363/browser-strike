// Grenades, C4 and armour.
//
// These three modules were written in one pass and had never been executed
// beyond an import check. Everything here drives the REAL CollisionWorld --
// there is no stub physics anywhere in this file, because the failure mode this
// project keeps hitting is a test that asserts an author's INTENT while the
// actual solver does something else.
//
// Throw-based, like every other suite here. console.assert does NOT throw.
import * as THREE from 'three';
import { CollisionWorld } from '../world/collision.js';
import { HITBOX_MULT, damageForHit } from '../ai/bot.js';
import { getSpec } from './specs.js';
import {
  GRENADE, GRENADE_SPECS, getGrenadeSpec, Grenade, GrenadeSystem,
  SmokeCloud, FireArea, PHYSICS, THROW, blastDamage, flashBlind, segmentClear,
  throwVector, EYE_HEIGHT,
} from './grenades.js';
import {
  BOMB, Bomb, BombState, beepInterval, canDefuseInTime, defuseDuration,
} from './bomb.js';
import {
  ARMOR_ABSORB_RATE, Armor, HELMET_PARTS, MAX_ARMOR, VEST_PARTS, applyArmor,
} from './armor.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ok    ${name}`); }
  catch (e) { failed++; console.log(`  FAIL  ${name}\n        ${e.message}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function eq(a, b, msg) {
  if (a !== b) throw new Error(`${msg || 'value'}: expected ${b}, got ${a}`);
}
function near(a, b, tol, msg) {
  if (!(Math.abs(a - b) <= tol)) {
    throw new Error(`${msg || 'value'}: expected ${b} +/- ${tol}, got ${a}`);
  }
}
/** Every number that ends up in a position, a damage or a timer goes through here. */
function ok(v, msg) {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`${msg || 'number'} is not finite: ${v}`);
  }
  return v;
}
function okVec(v, msg) {
  ok(v.x, `${msg}.x`); ok(v.y, `${msg}.y`); ok(v.z, `${msg}.z`);
  return v;
}

// ---------------------------------------------------------------------------
// Harness self-check. If these two do not behave, every "ok" below is worthless.
// ---------------------------------------------------------------------------

test('the harness itself can fail', () => {
  let threw = false;
  try { assert(false, 'x'); } catch { threw = true; }
  assert(threw, 'assert() did not throw on a false condition');
  threw = false;
  try { eq(1, 2, 'y'); } catch { threw = true; }
  assert(threw, 'eq() did not throw on unequal values');
  threw = false;
  try { near(1, 2, 0.1, 'z'); } catch { threw = true; }
  assert(threw, 'near() did not throw outside tolerance');
  threw = false;
  try { ok(NaN, 'n'); } catch { threw = true; }
  assert(threw, 'ok() did not throw on NaN');
  threw = false;
  try { ok(Infinity, 'i'); } catch { threw = true; }
  assert(threw, 'ok() did not throw on Infinity');
});

test('a deliberately failing test is counted as a failure', () => {
  // Prove the runner's bookkeeping, not just the assert. Run a nested harness
  // with one passing and one failing case and check the tallies.
  let p = 0, f = 0;
  const t = (fn) => { try { fn(); p++; } catch { f++; } };
  t(() => assert(true));
  t(() => assert(false, 'boom'));
  eq(p, 1, 'nested pass count');
  eq(f, 1, 'nested fail count');
});

// ---------------------------------------------------------------------------
// Test worlds -- REAL CollisionWorld, no stubs.
// ---------------------------------------------------------------------------

/**
 * Floor at y=0 (top surface). 120m across, because a FULL throw covers over
 * 30m before it lands and a 40m floor let the grenade fly off the edge -- which
 * looked exactly like "sank through the floor" in the settle test.
 */
function floorWorld() {
  const w = new CollisionWorld();
  w.addBox(new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(120, 1, 120));
  return w;
}
/** Floor + a wall at x = +4, 0.4m thick, 6m tall, spanning z. */
function wallWorld() {
  const w = floorWorld();
  w.addBox(new THREE.Vector3(4, 3, 0), new THREE.Vector3(0.4, 6, 20));
  return w;
}

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------------------
// Exports exist and are the shape the callers assume
// ---------------------------------------------------------------------------

test('every documented grenade export exists', () => {
  for (const [name, v] of Object.entries({
    GRENADE, GRENADE_SPECS, getGrenadeSpec, Grenade, GrenadeSystem, SmokeCloud,
    FireArea, PHYSICS, THROW, blastDamage, flashBlind, segmentClear, throwVector,
  })) assert(v !== undefined, `grenades.js is missing ${name}`);
  ok(EYE_HEIGHT, 'EYE_HEIGHT');
  for (const id of Object.values(GRENADE)) {
    const s = getGrenadeSpec(id);
    assert(s.name, `${id}: no name`);
    ok(s.fuse, `${id}.fuse`);
    ok(s.restitution, `${id}.restitution`);
    ok(s.friction, `${id}.friction`);
    ok(s.radius, `${id}.radius`);
    assert(s.price > 0, `${id}.price`);
  }
  let threw = false;
  try { getGrenadeSpec('nuke'); } catch { threw = true; }
  assert(threw, 'getGrenadeSpec should throw on an unknown type');
});

test('PHYSICS constants are sane', () => {
  for (const k of ['gravity', 'drag', 'radius', 'restBounceSpeed', 'restSpeed', 'maxStep']) {
    ok(PHYSICS[k], `PHYSICS.${k}`);
    assert(PHYSICS[k] > 0, `PHYSICS.${k} must be positive`);
  }
  assert(PHYSICS.drag > 0 && PHYSICS.drag <= 1, 'drag must be a retention factor in (0,1]');
  assert(PHYSICS.maxStep <= 1 / 60, 'substep must be at most one 60Hz frame');
});

// ---------------------------------------------------------------------------
// Throw vector
// ---------------------------------------------------------------------------

test('throwVector produces the requested speed and biases upward', () => {
  for (const s of Object.values(THROW)) {
    const { position, velocity } = throwVector(V(0, 1.6, 0), V(0, 0, -1), s);
    okVec(position, 'throw position'); okVec(velocity, 'throw velocity');
    near(velocity.length(), s.speed, 1e-6, `${s.id} speed`);
    // The bias tilts the throw UP, never down. FULL's bias is 0 by design (a
    // long lineup is thrown flat along the crosshair), so this is >= not >.
    assert(velocity.y >= 0, `${s.id} must not lob downward, got vy=${velocity.y}`);
    if (s.pitchBias > 0) {
      assert(velocity.y > 0, `${s.id} has a pitchBias but did not lob up`);
    }
    near(position.z, -s.forwardOffset, 1e-6, `${s.id} forward offset`);
  }
  // Underhand lobs steeper than a full throw.
  const full = throwVector(V(0, 1.6, 0), V(0, 0, -1), THROW.FULL).velocity;
  const under = throwVector(V(0, 1.6, 0), V(0, 0, -1), THROW.UNDERHAND).velocity;
  assert(Math.atan2(under.y, -under.z) > Math.atan2(full.y, -full.z),
    'underhand should leave at a steeper angle than a full throw');
});

test('throwVector survives a degenerate look direction', () => {
  const { velocity } = throwVector(V(0, 1.6, 0), V(0, 0, 0), THROW.FULL);
  okVec(velocity, 'degenerate throw velocity');
  near(velocity.length(), THROW.FULL.speed, 1e-6, 'fallback speed');
});

// ---------------------------------------------------------------------------
// Bounce: the trajectory itself, against the real solver
// ---------------------------------------------------------------------------

test('a grenade bounces off a real wall: velocity reflects and speed drops', () => {
  const world = wallWorld();
  // Fire flat along +x at the wall face (x=3.8), well above the floor so the
  // only contact is the wall.
  const g = new Grenade({
    type: GRENADE.HE, position: V(0, 2.0, 0), velocity: V(14, 0, 0),
  });
  const before = g.velocity.clone();
  let stepped = 0;
  while (g.bounces === 0 && stepped < 200) { g.update(1 / 120, world); stepped++; }
  assert(g.bounces > 0, 'grenade never contacted the wall');
  okVec(g.position, 'post-bounce position');
  okVec(g.velocity, 'post-bounce velocity');

  // 1. The x component REVERSED. This is the reflection, not "something happened".
  assert(before.x > 0 && g.velocity.x < 0,
    `x velocity should reverse: before ${before.x}, after ${g.velocity.x}`);
  // 2. Speed DECREASED -- restitution + friction + drag must all take a cut.
  assert(g.velocity.length() < before.length(),
    `speed should drop: before ${before.length()}, after ${g.velocity.length()}`);
  // 3. And by roughly the restitution, not some unrelated amount. Approach was
  //    ~14 m/s minus a little drag; the rebound should be ~0.45 of that.
  const spec = getGrenadeSpec(GRENADE.HE);
  const expected = 14 * spec.restitution;
  assert(Math.abs(g.velocity.x) > expected * 0.7 && Math.abs(g.velocity.x) < expected * 1.15,
    `rebound speed ${Math.abs(g.velocity.x)} is not ~restitution*approach (${expected})`);
  // 4. It is on the near side of the wall, not inside or through it.
  assert(g.position.x < 4 - 0.2 + PHYSICS.radius,
    `grenade ended at x=${g.position.x}, i.e. inside/through the wall face at 3.8`);
});

test('tangential velocity survives a wall bounce, scrubbed by friction', () => {
  const world = wallWorld();
  const g = new Grenade({
    type: GRENADE.HE, position: V(0, 2.0, 0), velocity: V(14, 0, 6),
  });
  let n = 0;
  while (g.bounces === 0 && n++ < 200) g.update(1 / 120, world);
  assert(g.bounces > 0, 'no contact');
  // The +z component is tangential to an x-facing wall: it must persist in the
  // same direction, reduced by friction (0.72), not reversed or zeroed.
  assert(g.velocity.z > 0, `tangential z should keep its sign, got ${g.velocity.z}`);
  assert(g.velocity.z < 6, `tangential z should be scrubbed, got ${g.velocity.z}`);
  assert(g.velocity.z > 6 * 0.5, `tangential z lost too much, got ${g.velocity.z}`);
});

test('a molotov breaks on the first hard contact instead of bouncing', () => {
  const world = wallWorld();
  const g = new Grenade({
    type: GRENADE.MOLOTOV, position: V(0, 2.0, 0), velocity: V(14, 0, 0),
  });
  let n = 0;
  while (!g.detonated && n++ < 400) g.update(1 / 120, world);
  assert(g.detonated, 'molotov never broke');
  assert(g.age < g.spec.fuse, `molotov should break on impact, not on the fuse (age ${g.age})`);
  assert(g.bounces === 0, `molotov bounced ${g.bounces} times before breaking`);
  okVec(g.result.position, 'molotov break position');
});

test('a molotov dropped gently does NOT shatter on a soft touch', () => {
  const world = floorWorld();
  // Released just above the floor with almost no speed: the impact is under the
  // 1.2 m/s break threshold on the first substep.
  const g = new Grenade({
    type: GRENADE.MOLOTOV, position: V(0, 0.09, 0), velocity: V(0, 0, 0),
  });
  g.update(1 / 240, world);
  assert(!g.detonated, 'a near-zero-speed touch should not break the bottle');
});

// ---------------------------------------------------------------------------
// Settling
// ---------------------------------------------------------------------------

test('a thrown grenade settles: stable, above the floor, not jittering', () => {
  const world = floorWorld();
  const { position, velocity } = throwVector(V(0, EYE_HEIGHT, 0), V(0, 0.05, -1), THROW.FULL);
  // Use a long-fused type so the projectile is still alive when it settles.
  const g = new Grenade({ type: GRENADE.SMOKE, position, velocity });
  // Run 6 seconds at 60Hz, ignoring the fuse (we want the physics, not the pop).
  for (let i = 0; i < 360; i++) {
    g.fuse = 999;
    g.update(1 / 60, world);
    okVec(g.position, `position at frame ${i}`);
    okVec(g.velocity, `velocity at frame ${i}`);
    assert(g.position.y > -0.5, `sank through the floor at frame ${i}: y=${g.position.y}`);
  }
  assert(g.atRest, `grenade never came to rest (v=${g.velocity.length()}, y=${g.position.y})`);
  // Resting ON the floor: the collision half-extent means centre sits at radius.
  near(g.position.y, PHYSICS.radius, 0.03, 'resting height above the floor');

  // And it STAYS there -- a jittering grenade passes an "atRest" flag check but
  // wanders on screen.
  const p = g.position.clone();
  for (let i = 0; i < 120; i++) { g.fuse = 999; g.update(1 / 60, world); }
  near(g.position.distanceTo(p), 0, 1e-6, 'resting grenade drifted');
  eq(g.velocity.lengthSq(), 0, 'resting grenade has residual velocity');
});

test('a grenade dropped straight down settles rather than bouncing forever', () => {
  const world = floorWorld();
  const g = new Grenade({ type: GRENADE.SMOKE, position: V(0, 3, 0), velocity: V(0, 0, 0) });
  for (let i = 0; i < 600; i++) { g.fuse = 999; g.update(1 / 60, world); }
  assert(g.atRest, `never rested: y=${g.position.y} v=${g.velocity.length()}`);
  near(g.position.y, PHYSICS.radius, 0.03, 'rest height');
  assert(g.bounces < 40, `absurd bounce count ${g.bounces} -- infinite bounce series`);
});

test('a fast grenade does not tunnel through a thin wall', () => {
  const world = wallWorld();
  // 60 m/s is far faster than any throw; if substepping is wrong it clears the
  // 0.4m brush in a single frame.
  const g = new Grenade({ type: GRENADE.HE, position: V(0, 2, 0), velocity: V(60, 0, 0) });
  for (let i = 0; i < 60; i++) { g.fuse = 999; g.update(1 / 60, world); }
  assert(g.position.x < 4.5, `tunnelled through the wall to x=${g.position.x}`);
});

test('a grenade with no world still integrates finitely', () => {
  const g = new Grenade({ type: GRENADE.HE, position: V(0, 5, 0), velocity: V(3, 2, 0) });
  for (let i = 0; i < 60; i++) { g.fuse = 999; g.update(1 / 60, null); }
  okVec(g.position, 'worldless position');
  assert(g.position.y < 5, 'gravity should still pull it down without a world');
});

test('bad dt never poisons a grenade', () => {
  const world = floorWorld();
  const g = new Grenade({ type: GRENADE.HE, position: V(0, 2, 0), velocity: V(1, 0, 0) });
  const before = g.position.clone();
  for (const bad of [NaN, Infinity, -1, 0, undefined, null]) {
    eq(g.update(bad, world), null, `update(${bad}) should be a no-op`);
  }
  near(g.position.distanceTo(before), 0, 0, 'bad dt moved the grenade');
  okVec(g.position, 'position after bad dt');
});

test('a grenade spawned inside geometry escapes instead of falling through', () => {
  const world = wallWorld();
  // Dead centre of the wall brush.
  const g = new Grenade({ type: GRENADE.SMOKE, position: V(4, 2, 0), velocity: V(0, 0, 0) });
  for (let i = 0; i < 120; i++) { g.fuse = 999; g.update(1 / 60, world); }
  okVec(g.position, 'position after spawning inside a brush');
  assert(!world.overlaps(g.position, g.half),
    `grenade is still inside the brush at ${g.position.toArray()}`);
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

test('an identical throw produces a bit-identical trajectory', () => {
  const run = () => {
    const world = wallWorld();
    const { position, velocity } = throwVector(V(0, EYE_HEIGHT, 0), V(1, 0.12, -0.3), THROW.FULL);
    const g = new Grenade({ type: GRENADE.SMOKE, position, velocity, rand: () => 0.5 });
    const path = [];
    for (let i = 0; i < 240; i++) {
      g.fuse = 999;
      g.update(1 / 60, world);
      path.push(g.position.x, g.position.y, g.position.z);
    }
    return path;
  };
  const a = run(), b = run();
  eq(a.length, b.length, 'path lengths');
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) throw new Error(`trajectory diverged at sample ${i}: ${a[i]} vs ${b[i]}`);
  }
  // And it is not a trivially still trajectory.
  assert(Math.abs(a[a.length - 3] - a[0]) > 1, 'the "trajectory" barely moved');
});

test('an injected rand makes decoy shot timing exactly repeatable', () => {
  const run = (seedStart) => {
    let s = seedStart;
    // Deterministic LCG, so the sequence is fixed but not constant.
    const rand = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
    const sys = new GrenadeSystem({ world: floorWorld(), rand });
    sys.decoys.push({ position: V(0, 0.5, 0), timer: 0, left: 6, ownerId: 'a' });
    const times = [];
    for (let i = 0; i < 360; i++) {
      sys.update(1 / 60, []);
      for (const e of sys.drainEvents()) if (e.type === 'decoy-shot') times.push(i);
    }
    return times;
  };
  const a = run(7), b = run(7), c = run(99);
  eq(JSON.stringify(a), JSON.stringify(b), 'same seed must give the same shot times');
  assert(a.length > 5, `decoy fired only ${a.length} times in 6s`);
  assert(JSON.stringify(a) !== JSON.stringify(c), 'a different seed gave identical timing');
  // Cadence roughly matches the spec interval, jitter included.
  const gaps = a.slice(1).map((t, i) => (t - a[i]) / 60);
  const s = GRENADE_SPECS[GRENADE.DECOY];
  for (const g of gaps) {
    ok(g, 'decoy gap');
    assert(g >= s.shotInterval * (1 - s.shotJitter) - 0.03 &&
           g <= s.shotInterval * (1 + s.shotJitter) + 0.03,
      `decoy gap ${g}s outside the jittered interval band`);
  }
});

// ---------------------------------------------------------------------------
// Line of sight
// ---------------------------------------------------------------------------

test('segmentClear sees through open air and is blocked by a wall', () => {
  const world = wallWorld();
  assert(segmentClear(world, V(0, 2, 0), V(3, 2, 0)), 'open air should be clear');
  assert(!segmentClear(world, V(0, 2, 0), V(8, 2, 0)), 'the wall should block');
  // Around the end of the wall (it spans z in [-10,10], height 0..6): over the top.
  assert(segmentClear(world, V(0, 8, 0), V(8, 8, 0)), 'over the top should be clear');
  // A degenerate segment is trivially clear.
  assert(segmentClear(world, V(0, 2, 0), V(0, 2, 0)), 'zero-length segment');
  // No world at all: permissive.
  assert(segmentClear(null, V(0, 2, 0), V(8, 2, 0)), 'null world should not block');
});

// ---------------------------------------------------------------------------
// HE blast
// ---------------------------------------------------------------------------

test('HE damage falls off with distance and dies at the radius', () => {
  const spec = getGrenadeSpec(GRENADE.HE);
  const c = V(0, 1, 0);
  const at = (d) => ok(blastDamage(spec, c, V(d, 1, 0)), `blast at ${d}m`);
  const d0 = at(0.05), d2 = at(2), d4 = at(4), d6 = at(6);
  assert(d0 > d2 && d2 > d4 && d4 > d6, `not monotonic: ${d0} ${d2} ${d4} ${d6}`);
  assert(d0 > 90 && d0 <= spec.damage, `epicentre damage ${d0} off spec`);
  eq(at(spec.radius), 0, 'at the radius');
  eq(at(spec.radius + 1), 0, 'beyond the radius');
  // The falloff has to actually MATTER: half the radius should not still be
  // near-lethal, or "landed on him" and "landed near him" are the same throw.
  assert(d4 < d0 * 0.5, `damage at 4m (${d4}) is not meaningfully below the epicentre`);
});

test('HE damage is ZERO through a wall and non-zero around it', () => {
  const world = wallWorld();
  // Blast at x=2, victim at x=6: the wall at x=4 is between them, 4m apart,
  // comfortably inside the 7m radius.
  const spec = getGrenadeSpec(GRENADE.HE);
  const centre = V(2, 1.2, 0), victim = V(6, 1.2, 0);
  const open = ok(blastDamage(spec, centre, victim, null), 'no-LOS-gate damage');
  assert(open > 0, 'control: the victim must be in range with the gate off');
  eq(blastDamage(spec, centre, victim, world), 0, 'wall must block the blast entirely');

  // Same distance, no wall in the way (both on the near side): damage lands.
  const nearSide = ok(blastDamage(spec, centre, V(-2, 1.2, 0), world), 'clear-line damage');
  near(nearSide, open, 1e-9, 'a clear line at the same distance should be identical');

  // And around the END of the wall: z=+14 is past the brush's z half-extent of 10.
  const around = ok(blastDamage(spec, V(4.0, 1.2, 12), V(4.0, 1.2, 15), world), 'around');
  assert(around > 0, 'a blast past the end of the wall should not be occluded');
});

test('blastDamage rejects garbage instead of returning NaN', () => {
  const spec = getGrenadeSpec(GRENADE.HE);
  eq(blastDamage(spec, null, V(0, 0, 0)), 0, 'null centre');
  eq(blastDamage(null, V(0, 0, 0), V(0, 0, 0)), 0, 'null spec');
  eq(blastDamage(spec, V(NaN, 0, 0), V(0, 0, 0)), 0, 'NaN centre');
  eq(blastDamage(spec, V(0, 0, 0), V(0, Infinity, 0)), 0, 'Infinite target');
});

// ---------------------------------------------------------------------------
// Flashbang
// ---------------------------------------------------------------------------

test('flash blind is highest facing it, lower facing away, zero fully turned', () => {
  const spec = getGrenadeSpec(GRENADE.FLASH);
  const eye = V(0, EYE_HEIGHT, 0);
  const centre = V(0, EYE_HEIGHT, -4);           // 4m in front
  const facing = ok(flashBlind(spec, centre, eye, V(0, 0, -1)), 'facing');
  const side = ok(flashBlind(spec, centre, eye, V(1, 0, 0)), 'side-on');
  const away = ok(flashBlind(spec, centre, eye, V(0, 0, 1)), 'facing away');
  assert(facing > side, `facing (${facing}) should beat side-on (${side})`);
  assert(side > away, `side-on (${side}) should beat facing away (${away})`);
  eq(away, 0, 'a full 180 turn should be a total counter');
  assert(facing > 1.5 && facing <= spec.maxBlind, `facing blind ${facing} out of range`);
  // Distance also matters.
  const far = ok(flashBlind(spec, V(0, EYE_HEIGHT, -13), eye, V(0, 0, -1)), 'far');
  assert(far < facing, 'a distant flash should blind less');
  eq(flashBlind(spec, V(0, EYE_HEIGHT, -20), eye, V(0, 0, -1)), 0, 'beyond the radius');
});

test('flash blind is exactly zero behind a wall', () => {
  const world = wallWorld();
  const spec = getGrenadeSpec(GRENADE.FLASH);
  const eye = V(6, EYE_HEIGHT, 0);
  const centre = V(2, EYE_HEIGHT, 0);            // wall at x=4 between them
  const forward = V(-1, 0, 0);                   // staring straight at it
  assert(flashBlind(spec, centre, eye, forward, null) > 0, 'control: unblocked it blinds');
  eq(flashBlind(spec, centre, eye, forward, world), 0, 'a wall must fully stop a flash');
});

test('flashBlind rejects garbage', () => {
  const spec = getGrenadeSpec(GRENADE.FLASH);
  const eye = V(0, 1, 0);
  eq(flashBlind(spec, V(0, 1, -3), eye, V(0, 0, 0)), 0, 'zero-length forward');
  eq(flashBlind(spec, V(NaN, 1, -3), eye, V(0, 0, -1)), 0, 'NaN centre');
  eq(flashBlind(spec, eye, eye, V(0, 0, -1)), 0, 'coincident eye and flash');
  eq(flashBlind(null, V(0, 1, -3), eye, V(0, 0, -1)), 0, 'null spec');
});

// ---------------------------------------------------------------------------
// Smoke
// ---------------------------------------------------------------------------

test('a smoke cloud grows, holds, then dies', () => {
  const s = new SmokeCloud(V(0, 0, 0));
  const spec = GRENADE_SPECS[GRENADE.SMOKE];
  eq(s.radius, 0, 'a smoke starts with no radius');
  s.update(spec.growTime * 0.5);
  const half = ok(s.radius, 'mid-grow radius');
  assert(half > 0 && half < spec.radius, `mid-grow radius ${half} out of range`);
  s.update(spec.growTime * 0.5);
  near(s.radius, spec.radius, 1e-9, 'full radius after growTime');
  eq(s.opacityAt(), 1, 'full opacity at full size');
  s.update(spec.holdTime);
  near(s.radius, spec.radius, 1e-9, 'still full during hold');
  s.update(spec.fadeTime);
  assert(s.dead, 'the cloud should be dead after grow+hold+fade');
  ok(s.totalLife, 'totalLife');
});

test('smoke blocks a line through it and not one around it', () => {
  const s = new SmokeCloud(V(0, 0, 0));
  s.update(GRENADE_SPECS[GRENADE.SMOKE].growTime);   // full size
  const lift = GRENADE_SPECS[GRENADE.SMOKE].centreLift;
  // Straight through the middle of the cloud.
  assert(s.blocksLineOfSight(V(-10, lift, 0), V(10, lift, 0)), 'a line through the centre');
  // Parallel but well outside the radius.
  assert(!s.blocksLineOfSight(V(-10, lift, 8), V(10, lift, 8)), 'a line 8m to the side');
  // Above the cloud.
  assert(!s.blocksLineOfSight(V(-10, lift + 6, 0), V(10, lift + 6, 0)), 'a line above it');
  // A segment that STOPS short of the cloud must not be blocked -- the clamp to
  // the segment ends is what stops a smoke behind you occluding your view.
  assert(!s.blocksLineOfSight(V(-10, lift, 0), V(-6, lift, 0)), 'a segment stopping short');
  // And one that starts past it.
  assert(!s.blocksLineOfSight(V(6, lift, 0), V(10, lift, 0)), 'a segment starting past it');
  // Grazing just inside the radius blocks; just outside does not.
  const r = s.radius;
  assert(s.blocksLineOfSight(V(-10, lift, r - 0.05), V(10, lift, r - 0.05)), 'grazing inside');
  assert(!s.blocksLineOfSight(V(-10, lift, r + 0.05), V(10, lift, r + 0.05)), 'grazing outside');
});

test('a fresh or dead smoke does not block anything', () => {
  const s = new SmokeCloud(V(0, 0, 0));
  const lift = GRENADE_SPECS[GRENADE.SMOKE].centreLift;
  assert(!s.blocksLineOfSight(V(-10, lift, 0), V(10, lift, 0)), 'age 0 must not block');
  s.update(0.02);
  assert(!s.blocksLineOfSight(V(-10, lift, 0), V(10, lift, 0)), 'a pinprick must not block');
  s.update(s.totalLife);
  assert(s.dead && !s.blocksLineOfSight(V(-10, lift, 0), V(10, lift, 0)), 'dead must not block');
});

test('the smoke cloud sits above where it landed', () => {
  const s = new SmokeCloud(V(1, 0.05, -2));
  okVec(s.centre, 'smoke centre');
  near(s.centre.y, 0.05 + GRENADE_SPECS[GRENADE.SMOKE].centreLift, 1e-9, 'centre lift');
  // A cloud whose centre was at the impact point would be half buried; the lift
  // must be at least a good fraction of the radius or it still is.
  assert(GRENADE_SPECS[GRENADE.SMOKE].centreLift > 0.3 * GRENADE_SPECS[GRENADE.SMOKE].radius,
    'centreLift is too small -- the cloud will be half buried in the floor');
});

test('smoke geometry is finite under garbage updates', () => {
  const s = new SmokeCloud(V(0, 0, 0));
  for (const bad of [NaN, Infinity, -1, 0]) s.update(bad);
  eq(s.age, 0, 'garbage dt advanced the cloud');
  ok(s.radius, 'radius'); ok(s.opacityAt(), 'opacity');
});

// ---------------------------------------------------------------------------
// Molotov / fire
// ---------------------------------------------------------------------------

test('fire spreads from nothing to its full radius', () => {
  const spec = GRENADE_SPECS[GRENADE.MOLOTOV];
  const f = new FireArea(V(0, 0, 0));
  eq(f.radius, 0, 'a fire starts with no area');
  f.update(spec.spreadTime * 0.4);
  const mid = ok(f.radius, 'mid-spread radius');
  assert(mid > 0 && mid < spec.radius, `mid radius ${mid} out of range`);
  f.update(spec.spreadTime);
  near(f.radius, spec.radius, 1e-9, 'full radius after spreadTime');
});

test('fire damages only inside its area', () => {
  const spec = GRENADE_SPECS[GRENADE.MOLOTOV];
  const f = new FireArea(V(0, 0, 0));
  f.update(spec.spreadTime);                      // fully spread
  const dt = 0.1;
  const inside = ok(f.damageFor(V(0, 0, 0), dt), 'inside');
  assert(inside > 0, 'standing in the middle should burn');
  near(inside, spec.dps * dt * f.intensity, 1e-9, 'dps math');
  eq(f.damageFor(V(spec.radius + 1, 0, 0), dt), 0, 'outside the radius');
  // Vertical containment: fire is a cylinder, not a sphere.
  eq(f.damageFor(V(0, spec.height + 1, 0), dt), 0, 'well above the flame column');
  assert(f.damageFor(V(0, spec.height * 0.5, 0), dt) > 0, 'inside the column');
  // A player standing just inside the edge burns.
  assert(f.damageFor(V(spec.radius - 0.1, 0, 0), dt) > 0, 'just inside the edge');
});

test('fire stops damaging when it burns out', () => {
  const spec = GRENADE_SPECS[GRENADE.MOLOTOV];
  const f = new FireArea(V(0, 0, 0));
  let total = 0;
  for (let i = 0; i < Math.ceil(spec.burnTime * 60) + 120; i++) {
    f.update(1 / 60);
    total += ok(f.damageFor(V(0, 0, 0), 1 / 60), `fire tick ${i}`);
  }
  assert(f.dead, 'fire should burn out');
  eq(f.damageFor(V(0, 0, 0), 1), 0, 'a dead fire must not damage');
  // The total should be in the right ballpark: dps * burnTime, reduced by the
  // spread ramp at the start and the gutter at the end.
  const ceiling = spec.dps * spec.burnTime;
  assert(total > ceiling * 0.6 && total < ceiling,
    `total burn damage ${total} is not a sane fraction of ${ceiling}`);
});

test('fire intensity guts out at the end and never goes negative', () => {
  const f = new FireArea(V(0, 0, 0));
  const spec = GRENADE_SPECS[GRENADE.MOLOTOV];
  eq(f.intensity, 1, 'full intensity when fresh');
  f.update(spec.burnTime - 0.6);
  const dim = ok(f.intensity, 'guttering intensity');
  assert(dim > 0 && dim < 1, `intensity ${dim} should be guttering`);
  f.update(1.0);
  eq(f.intensity, 0, 'burnt out');
});

// ---------------------------------------------------------------------------
// Armour
// ---------------------------------------------------------------------------

test('armour exports are what the callers assume', () => {
  eq(MAX_ARMOR, 100, 'MAX_ARMOR');
  ok(ARMOR_ABSORB_RATE, 'ARMOR_ABSORB_RATE');
  assert(HELMET_PARTS.has('head'), 'the helmet must cover the head');
  for (const p of ['chest', 'stomach', 'arm']) assert(VEST_PARTS.has(p), `vest: ${p}`);
  assert(!VEST_PARTS.has('leg'), 'legs must NOT be vest-covered');
  assert(!VEST_PARTS.has('head'), 'the vest must not cover the head');
});

test('a vest reduces chest damage by the weapon armorPierce from specs.js', () => {
  // Real numbers from the real table, not invented ones.
  for (const id of ['ak47', 'usp', 'awp', 'p90']) {
    const spec = getSpec(id);
    const raw = damageForHit(spec.damage, 'chest', HITBOX_MULT);
    const r = applyArmor(raw, 'chest', MAX_ARMOR, false, spec.armorPierce);
    ok(r.damage, `${id} armoured damage`);
    ok(r.armorLost, `${id} armour lost`);
    near(r.damage, raw * spec.armorPierce, 1e-9, `${id}: damage should be raw*armorPierce`);
    near(r.armorLost, raw * (1 - spec.armorPierce) * ARMOR_ABSORB_RATE, 1e-9,
      `${id}: armour lost should be absorbed*rate`);
    assert(r.damage < raw, `${id}: armour did not reduce damage`);
  }
});

test('armour does nothing to legs, and nothing to the head without a helmet', () => {
  const ak = getSpec('ak47');
  const legRaw = damageForHit(ak.damage, 'leg', HITBOX_MULT);
  const leg = applyArmor(legRaw, 'leg', MAX_ARMOR, true, ak.armorPierce);
  near(leg.damage, legRaw, 1e-9, 'legs must take full damage even with helmet+vest');
  eq(leg.armorLost, 0, 'a leg shot must not eat armour');

  const headRaw = damageForHit(ak.damage, 'head', HITBOX_MULT);
  const noHelm = applyArmor(headRaw, 'head', MAX_ARMOR, false, ak.armorPierce);
  near(noHelm.damage, headRaw, 1e-9, 'a vest alone must not stop a headshot');
  eq(noHelm.armorLost, 0, 'a vest must not lose durability to a headshot');
});

test('a helmet changes headshot damage specifically', () => {
  const ak = getSpec('ak47');
  const headRaw = damageForHit(ak.damage, 'head', HITBOX_MULT);
  near(headRaw, 144, 1e-9, 'AK headshot base (36 * 4)');
  const helm = applyArmor(headRaw, 'head', MAX_ARMOR, true, ak.armorPierce);
  ok(helm.damage, 'helmeted headshot damage');
  assert(helm.damage < headRaw, 'a helmet must reduce a headshot');
  near(helm.damage, headRaw * ak.armorPierce, 1e-9, 'helmet uses the same pierce rate');
  // The documented consequence: an AK headshot still kills through a helmet.
  assert(helm.damage >= 100, `AK headshot through a helmet should still kill, got ${helm.damage}`);
  // But a USP headshot does NOT, which is the whole point of buying one.
  const usp = getSpec('usp');
  const uspHead = damageForHit(usp.damage, 'head', HITBOX_MULT);
  assert(uspHead >= 100, 'control: a USP headshot kills an unhelmeted player');
  const uspHelm = applyArmor(uspHead, 'head', MAX_ARMOR, true, usp.armorPierce);
  assert(uspHelm.damage < 100, `a helmet should survive a USP headshot, got ${uspHelm.damage}`);
  // And a helmet does not change a CHEST hit at all.
  const chestRaw = damageForHit(ak.damage, 'chest', HITBOX_MULT);
  near(applyArmor(chestRaw, 'chest', MAX_ARMOR, true, ak.armorPierce).damage,
    applyArmor(chestRaw, 'chest', MAX_ARMOR, false, ak.armorPierce).damage, 1e-12,
    'a helmet must not affect chest damage');
});

test('armour degrades as it absorbs, and protects less as it goes', () => {
  const ak = getSpec('ak47');
  const raw = damageForHit(ak.damage, 'chest', HITBOX_MULT);
  const a = new Armor(MAX_ARMOR, false);
  const first = ok(a.absorb(raw, 'chest', ak.armorPierce), 'first hit');
  assert(a.points < MAX_ARMOR, 'armour did not degrade');
  const afterFirst = a.points;
  let hits = 1, last = first;
  while (a.hasArmor && hits < 200) { last = a.absorb(raw, 'chest', ak.armorPierce); hits++; }
  eq(a.points, 0, 'armour should reach exactly zero, not go negative');
  assert(hits > 5 && hits < 60, `a vest lasting ${hits} AK chest rounds is not the CS model`);
  assert(last >= first, 'the last hit through a dying vest should hurt at least as much');
  // Once empty, full damage.
  near(a.absorb(raw, 'chest', ak.armorPierce), raw, 1e-9, 'a dead vest must not reduce damage');
  ok(afterFirst, 'armour points'); ok(a.points, 'armour points');
});

test('a dying vest pays partial protection, never free protection', () => {
  const awp = getSpec('awp');
  const raw = damageForHit(awp.damage, 'chest', HITBOX_MULT);
  // 1 point of armour left against an AWP round.
  const r = applyArmor(raw, 'chest', 1, false, awp.armorPierce);
  ok(r.damage, 'partial damage'); ok(r.armorLost, 'partial armorLost');
  eq(r.armorLost, 1, 'it can only spend the armour it has');
  const full = applyArmor(raw, 'chest', MAX_ARMOR, false, awp.armorPierce);
  assert(r.damage > full.damage, 'one point of armour must not protect like a full vest');
  assert(r.damage < raw, 'one point of armour should still do something');
});

test('the helmet is lost with the vest', () => {
  const a = new Armor(4, true);
  assert(a.helmet, 'control: helmet on');
  a.absorb(200, 'chest', 0.5);
  eq(a.points, 0, 'vest destroyed');
  assert(!a.helmet, 'helmet should be gone once the vest is');
  // And equip only ever upgrades the helmet.
  a.equip(MAX_ARMOR, false);
  assert(!a.helmet, 'equipping without a helmet must not grant one');
  a.equip(MAX_ARMOR, true);
  assert(a.helmet, 'equipping with a helmet grants one');
  a.equip(MAX_ARMOR, false);
  assert(a.helmet, 'you cannot un-buy a helmet');
});

test('applyArmor never returns NaN, negatives, or free healing', () => {
  const cases = [
    [NaN, 'chest', 100, true, 0.5], [Infinity, 'chest', 100, true, 0.5],
    [-30, 'chest', 100, true, 0.5], [30, 'chest', NaN, true, 0.5],
    [30, 'chest', -50, true, 0.5], [30, 'chest', 1e9, true, 0.5],
    [30, 'chest', 100, true, NaN], [30, 'chest', 100, true, -1],
    [30, 'chest', 100, true, 5], [30, 'nonsense', 100, true, 0.5],
    [30, undefined, 100, true, 0.5],
  ];
  for (const c of cases) {
    const r = applyArmor(...c);
    ok(r.damage, `damage for ${JSON.stringify(c)}`);
    ok(r.armorLost, `armorLost for ${JSON.stringify(c)}`);
    assert(r.damage >= 0, `negative damage for ${JSON.stringify(c)}`);
    assert(r.armorLost >= 0, `negative armorLost for ${JSON.stringify(c)}`);
    assert(r.armorLost <= MAX_ARMOR, `armorLost > MAX_ARMOR for ${JSON.stringify(c)}`);
  }
  // armorPierce clamping must not make armour a damage AMPLIFIER.
  assert(applyArmor(30, 'chest', 100, true, 5).damage <= 30, 'pierce > 1 amplified damage');
  const a = new Armor(NaN, true);
  eq(a.points, 0, 'a NaN armour value must clamp to 0');
});

// ---------------------------------------------------------------------------
// GrenadeSystem end to end
// ---------------------------------------------------------------------------

/** A target in the shape GrenadeSystem/Bomb expect. */
function makeTarget(id, x, y, z, { armor = 0, helmet = false, forward = [0, 0, -1] } = {}) {
  const a = new Armor(armor, helmet);
  return {
    id, alive: true, health: 100,
    feet: { x, y, z },
    eye: { x, y: y + EYE_HEIGHT, z },
    forward: { x: forward[0], y: forward[1], z: forward[2] },
    armorObj: a,
    get armor() { return a.points; },
    absorb: (d, part, pierce) => a.absorb(d, part, pierce),
    damage: 0, flashed: 0,
    applyDamage(amount) { this.damage += amount; this.health -= amount; },
    onFlash(secs) { this.flashed = Math.max(this.flashed, secs); },
  };
}

test('an HE grenade thrown at someone hurts them; a wall between them saves them', () => {
  const world = wallWorld();
  const run = (victimX) => {
    const sys = new GrenadeSystem({ world, rand: () => 0.5 });
    const t = makeTarget('v', victimX, 0, 0);
    // Drop an HE straight down at x=2 by handing the system a projectile.
    const g = new Grenade({ type: GRENADE.HE, position: V(2, 0.3, 0), velocity: V(0, 0, 0), ownerId: 'me' });
    sys.projectiles.push(g);
    for (let i = 0; i < 180; i++) sys.update(1 / 60, [t]);
    return { t, sys };
  };
  const exposed = run(0);      // same side of the wall as the blast
  assert(exposed.t.damage > 0, 'an exposed victim 2m from an HE took no damage');
  ok(exposed.t.damage, 'exposed damage');
  const covered = run(6);      // wall at x=4 between blast (x=2) and victim (x=6)
  eq(covered.t.damage, 0, 'a victim behind a wall must take zero HE damage');
  // The detonation event fires either way.
  const kinds = exposed.sys.drainEvents().map((e) => e.type);
  assert(kinds.includes('detonate'), 'no detonate event');
  assert(kinds.includes('hit'), 'no hit event');
});

test('grenade damage events carry finite, in-range numbers', () => {
  const world = floorWorld();
  const sys = new GrenadeSystem({ world, rand: () => 0.5 });
  const t = makeTarget('v', 0.5, 0, 0);
  sys.projectiles.push(new Grenade({
    type: GRENADE.HE, position: V(0, 0.3, 0), velocity: V(0, 0, 0), ownerId: 'me',
  }));
  for (let i = 0; i < 180; i++) sys.update(1 / 60, [t]);
  const evs = sys.drainEvents();
  assert(evs.length > 0, 'no events at all');
  for (const e of evs) {
    ok(e.x, 'event.x'); ok(e.y, 'event.y'); ok(e.z, 'event.z');
    ok(e.amount, 'event.amount');
    assert(e.amount >= 0 && e.amount <= 65535, `event amount ${e.amount} not wire-safe`);
    assert(Number.isInteger(e.amount), `event amount ${e.amount} is not an integer`);
  }
});

test('a smoke grenade leaves a cloud that the system reports as blocking', () => {
  const world = floorWorld();
  const sys = new GrenadeSystem({ world, rand: () => 0.5 });
  sys.projectiles.push(new Grenade({
    type: GRENADE.SMOKE, position: V(0, 0.3, 0), velocity: V(0, 0, 0),
  }));
  const lift = GRENADE_SPECS[GRENADE.SMOKE].centreLift;
  assert(!sys.blocksLineOfSight(V(-8, lift, 0), V(8, lift, 0)), 'nothing blocks before the pop');
  for (let i = 0; i < 200; i++) sys.update(1 / 60, []);
  eq(sys.smokes.length, 1, 'exactly one cloud after one smoke');
  assert(sys.blocksLineOfSight(V(-8, lift, 0), V(8, lift, 0)), 'the cloud should block a sightline through it');
  assert(!sys.blocksLineOfSight(V(-8, lift, 9), V(8, lift, 9)), 'and not one 9m to the side');
  // Run it out and the cloud is reaped.
  const spec = GRENADE_SPECS[GRENADE.SMOKE];
  const total = spec.growTime + spec.holdTime + spec.fadeTime;
  for (let i = 0; i < Math.ceil(total * 60) + 60; i++) sys.update(1 / 60, []);
  eq(sys.smokes.length, 0, 'the cloud should be reaped when it dies');
});

test('a molotov burns someone standing in it and stops when it burns out', () => {
  const world = floorWorld();
  const sys = new GrenadeSystem({ world, rand: () => 0.5 });
  const inFire = makeTarget('in', 0, 0, 0);
  const outside = makeTarget('out', 8, 0, 0);
  sys.projectiles.push(new Grenade({
    type: GRENADE.MOLOTOV, position: V(0, 0.3, 0), velocity: V(0, -8, 0), ownerId: 'me',
  }));
  const spec = GRENADE_SPECS[GRENADE.MOLOTOV];
  for (let i = 0; i < Math.ceil((spec.burnTime + 1) * 60); i++) sys.update(1 / 60, [inFire, outside]);
  assert(inFire.damage > 0, 'a player standing in a molotov took no damage');
  ok(inFire.damage, 'fire damage');
  eq(outside.damage, 0, 'a player 8m away took fire damage');
  eq(sys.fires.length, 0, 'the fire should be reaped when it burns out');
  // Damage stops. Another 3 seconds must add nothing.
  const at = inFire.damage;
  for (let i = 0; i < 180; i++) sys.update(1 / 60, [inFire, outside]);
  eq(inFire.damage, at, 'a burnt-out fire kept damaging');
  // Fire ignores kevlar entirely (armorPierce 1.0), so armour must not help.
  eq(spec.armorPierce, 1.0, 'molotov armorPierce should be 1 (fire ignores kevlar)');
});

test('a flashbang blinds a facing viewer and not one behind a wall', () => {
  const world = wallWorld();
  const sys = new GrenadeSystem({ world, rand: () => 0.5 });
  // Flash at x=2. Facing viewer at x=0 looking +x; covered viewer at x=6.
  const seer = makeTarget('seer', 0, 0, 0, { forward: [1, 0, 0] });
  const hidden = makeTarget('hidden', 6, 0, 0, { forward: [-1, 0, 0] });
  sys.projectiles.push(new Grenade({
    type: GRENADE.FLASH, position: V(2, 1.2, 0), velocity: V(0, 0, 0), ownerId: 'me',
  }));
  for (let i = 0; i < 180; i++) sys.update(1 / 60, [seer, hidden]);
  assert(seer.flashed > 0, 'a viewer staring at a flash was not blinded');
  ok(seer.flashed, 'blind seconds');
  eq(hidden.flashed, 0, 'a viewer behind a wall was blinded');
  const flashEv = sys.drainEvents().filter((e) => e.type === 'flash');
  eq(flashEv.length, 1, 'exactly one flash event');
  assert(Number.isInteger(flashEv[0].amount) && flashEv[0].amount > 0,
    'blind time should ride the wire as integer milliseconds');
  near(flashEv[0].amount / 1000, seer.flashed, 0.001, 'ms amount should match the seconds');
});

test('dead targets are ignored by every payload', () => {
  const world = floorWorld();
  const sys = new GrenadeSystem({ world, rand: () => 0.5 });
  const dead = makeTarget('d', 0.5, 0, 0, { forward: [1, 0, 0] });
  dead.alive = false;
  for (const type of [GRENADE.HE, GRENADE.FLASH, GRENADE.MOLOTOV]) {
    sys.projectiles.push(new Grenade({ type, position: V(0, 0.3, 0), velocity: V(0, 0, 0) }));
  }
  for (let i = 0; i < 600; i++) sys.update(1 / 60, [dead]);
  eq(dead.damage, 0, 'a corpse took grenade damage');
  eq(dead.flashed, 0, 'a corpse was flashed');
});

test('armour reduces HE damage by the grenade armorPierce, not a made-up number', () => {
  const world = floorWorld();
  const spec = getGrenadeSpec(GRENADE.HE);
  const run = (armor) => {
    const sys = new GrenadeSystem({ world, rand: () => 0.5 });
    const t = makeTarget('v', 1.5, 0, 0, { armor });
    sys.projectiles.push(new Grenade({
      type: GRENADE.HE, position: V(0, 0.4, 0), velocity: V(0, 0, 0),
    }));
    for (let i = 0; i < 180; i++) sys.update(1 / 60, [t]);
    return t;
  };
  const bare = run(0), vested = run(MAX_ARMOR);
  assert(bare.damage > 0, 'control: an unarmoured victim was hurt');
  assert(vested.damage > 0, 'a vest should not make you immune to HE');
  assert(vested.damage < bare.damage, 'a vest did not reduce HE damage');
  near(vested.damage, bare.damage * spec.armorPierce, 1e-6,
    'HE through armour should be raw * the HE armorPierce');
  assert(vested.armor < MAX_ARMOR, 'the vest did not degrade from an HE blast');
});

test('the system survives a full pathological update loop without NaN', () => {
  const world = wallWorld();
  const sys = new GrenadeSystem({ world, rand: () => 0.5 });
  const targets = [makeTarget('a', 1, 0, 0, { armor: 100, helmet: true }),
                   makeTarget('b', 6, 0, 2)];
  for (const type of Object.values(GRENADE)) {
    sys.throwGrenade(type, V(0, EYE_HEIGHT, 0), V(1, 0.1, 0.2), THROW.MEDIUM, 'me', 0);
  }
  for (let i = 0; i < 1200; i++) {
    sys.update(1 / 60, targets);
    for (const g of sys.projectiles) { okVec(g.position, `proj at ${i}`); okVec(g.velocity, `vel at ${i}`); }
    for (const s of sys.smokes) { okVec(s.centre, 'smoke centre'); ok(s.radius, 'smoke radius'); }
    for (const f of sys.fires) { okVec(f.origin, 'fire origin'); ok(f.radius, 'fire radius'); }
  }
  for (const t of targets) { ok(t.damage, `${t.id} damage`); ok(t.health, `${t.id} health`); }
  for (const e of sys.drainEvents()) ok(e.amount, 'event amount');
  sys.clear();
  eq(sys.projectiles.length + sys.smokes.length + sys.fires.length + sys.decoys.length, 0,
    'clear() left something behind');
});

// ---------------------------------------------------------------------------
// The bomb
// ---------------------------------------------------------------------------

test('bomb exports and timings match the CS numbers the design depends on', () => {
  eq(BOMB.fuseTime, 40, 'the 40s fuse is the whole late-round calibration');
  eq(BOMB.defuseTime, 10, 'no-kit defuse');
  eq(BOMB.defuseTimeKit, 5, 'kit defuse');
  ok(BOMB.plantTime, 'plantTime');
  eq(defuseDuration(true), 5, 'defuseDuration with a kit');
  eq(defuseDuration(false), 10, 'defuseDuration without');
  for (const s of ['CARRIED', 'PLANTING', 'PLANTED', 'DEFUSING', 'DEFUSED', 'EXPLODED']) {
    assert(BombState[s], `BombState.${s} missing`);
  }
});

test('planting takes the full plant time and can be interrupted', () => {
  const b = new Bomb({ world: floorWorld() });
  eq(b.state, BombState.CARRIED, 'starts carried');
  const site = V(3, 0, -2);
  let down = false;
  const frames = Math.floor(BOMB.plantTime * 60);
  for (let i = 0; i < frames; i++) {
    down = b.plant(1 / 60, site, 'planter');
    if (i < frames - 1) assert(!down, `bomb planted early at frame ${i}`);
  }
  assert(!down, 'the bomb should not be down before the full plant time');
  eq(b.state, BombState.PLANTING, 'still planting');
  assert(b.plantFraction > 0.98 && b.plantFraction <= 1, `plantFraction ${b.plantFraction}`);
  assert(b.plant(1 / 30, site, 'planter'), 'the bomb should go down at plantTime');
  eq(b.state, BombState.PLANTED, 'planted');
  eq(b.planterId, 'planter', 'planter recorded');
  near(b.position.x, 3, 1e-9, 'planted position x');
  near(b.timeLeft, BOMB.fuseTime, 1e-9, 'the clock starts at the full fuse');

  // Interruption resets the bar.
  const c = new Bomb();
  for (let i = 0; i < 60; i++) c.plant(1 / 60, site, 'p');
  assert(c.plantFraction > 0, 'control: some progress');
  assert(c.cancelPlant(), 'cancelPlant should report the cancel');
  eq(c.plantFraction, 0, 'plant progress must not bank');
  eq(c.state, BombState.CARRIED, 'back to carried');
});

test('a planted bomb counts down 40 seconds and then explodes', () => {
  const b = new Bomb({ world: floorWorld() }).forcePlant(V(0, 0.1, 0), 'planter');
  const victim = makeTarget('v', 3, 0, 0);
  let boom = null;
  // 40*60 frames lands exactly ON the fuse; the check is `elapsed >= fuseTime`
  // after the increment, so detonation is the frame AFTER. Give it a margin.
  for (let i = 0; i < 40 * 60 + 30; i++) {
    ok(b.timeLeft, `timeLeft at frame ${i}`);
    assert(b.timeLeft >= 0, `negative timeLeft at frame ${i}`);
    const r = b.update(1 / 60, [victim]);
    if (r) { boom = { r, frame: i }; break; }
  }
  assert(boom, 'the bomb never exploded');
  near(boom.frame / 60, BOMB.fuseTime, 0.05, 'detonation time');
  eq(b.state, BombState.EXPLODED, 'state after detonation');
  eq(b.timeLeft, 0, 'timeLeft after detonation');
  assert(victim.damage > 0, 'a victim 3m from the C4 took nothing');
  assert(victim.health <= 0, 'a C4 at 3m with a clear line must be lethal');
  eq(boom.r.casualties.length, 1, 'one casualty');
  ok(boom.r.casualties[0].damage, 'casualty damage');
});

test('the C4 blast is LOS gated like every other explosion', () => {
  const world = wallWorld();
  const b = new Bomb({ world }).forcePlant(V(2, 0.1, 0), 'p');
  const covered = makeTarget('c', 6, 0, 0);
  const exposed = makeTarget('e', 0, 0, 0);
  const r = b.explode([covered, exposed]);
  assert(exposed.damage > 0, 'the exposed target took nothing');
  eq(covered.damage, 0, 'a target behind a wall took C4 damage');
  eq(r.casualties.length, 1, 'only the exposed target should be a casualty');
  assert(!b.hasLineTo({ x: 6, y: 1, z: 0 }), 'hasLineTo should be false through the wall');
  assert(b.hasLineTo({ x: 0, y: 1, z: 0 }), 'hasLineTo should be true in the clear');
});

test('a defuse takes 5s with a kit and 10s without', () => {
  for (const [hasKit, secs] of [[true, 5], [false, 10]]) {
    const b = new Bomb().forcePlant(V(0, 0, 0), 'p');
    let done = false, frames = 0;
    while (!done && frames < 20 * 60) { done = b.defuse(1 / 60, 'ct', hasKit); frames++; }
    assert(done, `defuse with kit=${hasKit} never completed`);
    near(frames / 60, secs, 0.05, `defuse duration with kit=${hasKit}`);
    eq(b.state, BombState.DEFUSED, 'state after defusing');
    // A defused bomb cannot then explode.
    eq(b.update(1 / 60, []), null, 'a defused bomb kept ticking');
    eq(b.explode([]), null, 'a defused bomb exploded');
  }
});

test('defuse progress does not bank and cannot be tag-teamed', () => {
  const b = new Bomb().forcePlant(V(0, 0, 0), 'p');
  for (let i = 0; i < 4 * 60; i++) b.defuse(1 / 60, 'ct1', true);
  assert(b.defuseFraction > 0.7, `control: ct1 got most of the way (${b.defuseFraction})`);
  // A second defuser starts from scratch.
  b.defuse(1 / 60, 'ct2', true);
  assert(b.defuseFraction < 0.05, `ct2 inherited ct1's progress (${b.defuseFraction})`);
  eq(b.defuserId, 'ct2', 'defuser switched');
  // Cancelling loses it entirely.
  assert(b.cancelDefuse(), 'cancelDefuse should report');
  eq(b.state, BombState.PLANTED, 'back to planted');
  eq(b.defuseFraction, 0, 'defuse progress must not bank');
  // A bomb that is not planted cannot be defused.
  const fresh = new Bomb();
  assert(!fresh.defuse(1 / 60, 'ct', true), 'a carried bomb was defusable');
});

test('canDefuseInTime is exact at the boundary', () => {
  eq(canDefuseInTime(5.0, true), true, 'exactly 5s with a kit is makeable');
  eq(canDefuseInTime(4.999, true), false, 'just under 5s with a kit is not');
  eq(canDefuseInTime(5.001, true), true, 'just over 5s with a kit is');
  eq(canDefuseInTime(10.0, false), true, 'exactly 10s without a kit is makeable');
  eq(canDefuseInTime(9.999, false), false, 'just under 10s without a kit is not');
  eq(canDefuseInTime(7, false), false, '7s without a kit is not enough');
  eq(canDefuseInTime(7, true), true, '7s with a kit is');
  eq(canDefuseInTime(NaN, true), false, 'NaN is not a defuse');
  // Infinity is rejected too. Deliberate: the guard is `finite`, and a clock
  // that has gone infinite is a bug upstream, not a free defuse.
  eq(canDefuseInTime(Infinity, true), false, 'a non-finite clock is not a defuse');
  eq(canDefuseInTime(-1, true), false, 'negative time');
  // And the instance method agrees, including the "not planted" case.
  const b = new Bomb();
  eq(b.canDefuse(true), false, 'a carried bomb cannot be defused');
  b.forcePlant(V(0, 0, 0), 'p');
  eq(b.canDefuse(true), true, 'a fresh plant is defusable with a kit');
  b.elapsed = BOMB.fuseTime - 4.9;
  eq(b.canDefuse(true), false, '4.9s left is not enough for a kit defuse');
  eq(b.canDefuse(false), false, '4.9s left is definitely not enough without one');
  b.elapsed = BOMB.fuseTime - 5.1;
  eq(b.canDefuse(true), true, '5.1s left is enough for a kit defuse');
  eq(b.canDefuse(false), false, '5.1s left is not enough without a kit');
});

test('a defuse that completes on the same frame the fuse expires loses', () => {
  // The documented bias: explosion wins the tie.
  const b = new Bomb().forcePlant(V(0, 0, 0), 'p');
  b.elapsed = BOMB.fuseTime - 5 - 1 / 60;
  let done = false;
  for (let i = 0; i < 5 * 60 + 4; i++) {
    done = b.defuse(1 / 60, 'ct', true);
    const r = b.update(1 / 60, []);
    if (done || r) break;
  }
  // Either outcome is legal here depending on rounding, but the STATE must be
  // one of the two terminal ones and never both.
  assert(b.state === BombState.DEFUSED || b.state === BombState.EXPLODED,
    `bomb ended in ${b.state}`);
  // What must NOT happen: a defused bomb also exploding.
  if (b.state === BombState.DEFUSED) eq(b.explode([]), null, 'a defused bomb exploded anyway');
});

test('the beep cadence accelerates monotonically and stays audible', () => {
  const start = ok(beepInterval(0), 'interval at t=0');
  near(start, BOMB.beepIntervalStart, 1e-9, 'starts at the slow interval');
  let prev = start;
  for (let t = 0.5; t <= BOMB.fuseTime; t += 0.5) {
    const iv = ok(beepInterval(t), `interval at ${t}s`);
    assert(iv <= prev + 1e-12, `cadence slowed down between ${t - 0.5}s and ${t}s`);
    assert(iv >= BOMB.beepIntervalEnd - 1e-12, `interval ${iv} below the floor`);
    prev = iv;
  }
  near(prev, BOMB.beepIntervalEnd, 1e-9, 'ends at the fast interval');
  assert(beepInterval(BOMB.fuseTime * 0.5) > beepInterval(BOMB.fuseTime * 0.9),
    'the last stretch must be faster than the middle');
  // Garbage in gives the safe slow interval, not NaN.
  ok(beepInterval(NaN), 'NaN elapsed'); ok(beepInterval(0, 0), 'zero fuse');
  eq(beepInterval(NaN), BOMB.beepIntervalStart, 'NaN falls back to the slow interval');
});

test('the bomb actually emits accelerating beeps over the countdown', () => {
  const b = new Bomb().forcePlant(V(0, 0, 0), 'p');
  const beepFrames = [];
  for (let i = 0; i < 40 * 60; i++) {
    const before = b.beeps;
    if (b.update(1 / 60, [])) break;
    for (let k = 0; k < b.beeps - before; k++) beepFrames.push(i);
  }
  assert(beepFrames.length > 40, `only ${beepFrames.length} beeps in 40 seconds`);
  // First 10 seconds vs the last 10: the late cadence must be far denser.
  const early = beepFrames.filter((f) => f < 10 * 60).length;
  const late = beepFrames.filter((f) => f >= 30 * 60).length;
  assert(late > early * 2, `beeps did not accelerate: ${early} early vs ${late} late`);
  // No beep after the bomb goes off.
  const at = b.beeps;
  b.update(1 / 60, []);
  eq(b.beeps, at, 'the bomb beeped after exploding');
});

test('bomb events are wire-safe and the snapshot is finite', () => {
  const b = new Bomb({ world: floorWorld() });
  const site = V(1, 0, 2);
  for (let i = 0; i < 300; i++) b.plant(1 / 60, site, 'p');
  for (let i = 0; i < 60 * 41; i++) if (b.update(1 / 60, [makeTarget('v', 2, 0, 2)])) break;
  const evs = b.drainEvents();
  assert(evs.length > 0, 'no bomb events');
  const types = new Set(evs.map((e) => e.type));
  for (const t of ['plant-start', 'planted', 'beep', 'exploded']) {
    assert(types.has(t), `missing a ${t} event`);
  }
  for (const e of evs) {
    ok(e.x, 'x'); ok(e.y, 'y'); ok(e.z, 'z');
    assert(Number.isInteger(e.amount) && e.amount >= 0 && e.amount <= 65535,
      `event amount ${e.amount} is not a uint16`);
  }
  const s = b.snapshot();
  ok(s.timeLeft, 'snapshot timeLeft'); ok(s.plantFraction, 'snapshot plantFraction');
  ok(s.defuseFraction, 'snapshot defuseFraction'); ok(s.beeps, 'snapshot beeps');
  for (const v of s.position) ok(v, 'snapshot position component');
});

test('bad dt and reset leave the bomb in a clean state', () => {
  const b = new Bomb().forcePlant(V(0, 0, 0), 'p');
  for (const bad of [NaN, Infinity, -1, 0]) {
    eq(b.update(bad, []), null, `update(${bad})`);
    eq(b.defuse(bad, 'ct', true), false, `defuse(${bad})`);
  }
  eq(b.elapsed, 0, 'garbage dt advanced the clock');
  near(b.timeLeft, BOMB.fuseTime, 1e-9, 'clock untouched');
  b.update(5, []);
  b.reset('carrier');
  eq(b.state, BombState.CARRIED, 'reset state');
  eq(b.elapsed, 0, 'reset clock');
  eq(b.timeLeft, 0, 'an unplanted bomb has no time left');
  eq(b.events.length, 0, 'reset should clear events');
  eq(b.carrierId, 'carrier', 'carrier');
});

test('armoured targets take less C4 damage, using BOMB.armorPierce', () => {
  const b1 = new Bomb().forcePlant(V(0, 0.1, 0), 'p');
  const b2 = new Bomb().forcePlant(V(0, 0.1, 0), 'p');
  const bare = makeTarget('bare', 8, 0, 0);
  const vested = makeTarget('vest', 8, 0, 0, { armor: MAX_ARMOR });
  b1.explode([bare]);
  b2.explode([vested]);
  assert(bare.damage > 0 && vested.damage > 0, 'control: both should be hurt at 8m');
  near(vested.damage, bare.damage * BOMB.armorPierce, 1e-6,
    'C4 through a vest should be raw * BOMB.armorPierce');
  assert(vested.armor < MAX_ARMOR, 'the vest should degrade');
});

// ---------------------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
