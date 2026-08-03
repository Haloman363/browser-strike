// Behavioural tests for the shared Weapon class.
//
// The rule this suite is written under: assert what the CODE DOES, not what a
// comment says it intends. So fire rate is measured by counting shots over
// simulated time through the real update() loop rather than by reading
// shotInterval back; the AK guard compares against the ACTUAL rifle.js
// functions rather than against numbers copied out of them; and the reload
// tests drive the real state machine rather than calling an internal.
//
// Throw-based. console.assert does NOT throw, so it is never used here.
//
//   node src/weapons/weapon.test.js
import * as THREE from 'three';
import { getSpec, allSpecs, WEAPON_IDS } from './specs.js';
import {
  Weapon, WeaponRecoil, spreadForSpec, patternOffsetFor, damageAtFor,
  applySpreadTo, isShellFed, restPoseFor, findPart, stubWeaponModel, RELOAD, SWING,
} from './weapon.js';
// The reference implementation. Compared against directly -- copying its
// numbers into this file would be exactly the false-confidence failure mode
// this suite exists to prevent.
import {
  RIFLE, RecoilState, patternOffset, spreadFor, damageAt, applySpread,
} from './rifle.js';

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

// A seeded PRNG so anything comparing two implementations gets the SAME random
// stream fed to both. Deterministic and cheap; xorshift is plenty here.
function seeded(seed = 12345) {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5; x >>>= 0;
    return x / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Harness sanity -- if these do not hold, every "ok" below is worthless.
// ---------------------------------------------------------------------------

test('the harness itself can fail', () => {
  let threw = false;
  try { assert(false, 'x'); } catch { threw = true; }
  assert(threw, 'assert() did not throw on a false condition');
});

test('the seeded rng is deterministic and differs between draws', () => {
  const a = seeded(7), b = seeded(7);
  const seqA = [a(), a(), a(), a()];
  const seqB = [b(), b(), b(), b()];
  for (let i = 0; i < 4; i++) eq(seqA[i], seqB[i], `stream position ${i}`);
  assert(new Set(seqA).size === 4, 'rng returned the same value four times');
  for (const v of seqA) assert(v >= 0 && v < 1, `rng out of range: ${v}`);
});

// ---------------------------------------------------------------------------
// Test doubles. A flat wall at z = -10 facing +z; everything else is empty.
// ---------------------------------------------------------------------------

// Shot rays travel maxRange (tens of metres); surfaceNormal() probes 6cm to
// recover a face normal. Counting both as "shots" made a 1-pellet rifle look
// like it cast 4 rays -- the implementation was right and the counter naive.
const PROBE_MAX_DIST = 0.1;

class FakeWorld {
  constructor(wallZ = -10) { this.wallZ = wallZ; this.rays = []; this.allRays = []; }
  raycast(origin, dir, maxDist) {
    const rec = { origin: origin.clone(), dir: dir.clone(), maxDist };
    this.allRays.push(rec);
    // `rays` holds SHOT rays only, so pellet counts mean what they say.
    if (maxDist > PROBE_MAX_DIST) this.rays.push(rec);
    if (dir.z >= -1e-9) return null;                  // not heading at the wall
    const t = (this.wallZ - origin.z) / dir.z;
    if (t < 0 || t > maxDist) return null;
    const point = origin.clone().addScaledVector(dir, t);
    return { point, distance: t };
  }
}

/** A camera at the origin looking down -Z, with no scene graph to maintain. */
function fakeCamera(fov = 90) {
  const c = new THREE.PerspectiveCamera(fov, 16 / 9, 0.1, 500);
  c.position.set(0, 1.28, 0);   // player eye height is 1.28m, not 1.7m
  c.updateMatrixWorld(true);
  return c;
}

/** Movement stub shaped like PlayerMovement. */
function mover({ speed = 0, grounded = true, crouching = false } = {}) {
  return { velocity: new THREE.Vector3(0, 0, -speed), grounded, crouching };
}

/**
 * Build a weapon wired to the fake world. viewmodel:true by default so the
 * animation path is exercised -- a test that never animates would not catch a
 * NaN reaching a transform, which is one of the things this suite must catch.
 */
function mk(id, opts = {}) {
  const { drawn = true, ...rest } = opts;
  const w = new Weapon(id, {
    camera: fakeCamera(),
    world: new FakeWorld(),
    ...rest,
  });
  // A weapon starts mid-draw and genuinely cannot fire until it finishes --
  // that is correct behaviour, not a bug. Tests about FIRING want a drawn
  // weapon; pass {drawn:false} to exercise the draw state itself.
  if (drawn) w.drawTimer = 0;
  return w;
}

/**
 * Run a weapon for `seconds` of simulated time at a fixed tick with the trigger
 * held (or pulsed), counting how many rounds actually left the barrel.
 * Rounds are counted by AMMO CONSUMED, which is the ground truth -- counting
 * fire() return values would miss shots that hit nothing.
 */
function simulate(w, seconds, {
  tick = 1 / 256, fire = () => true, movement = null, reserveTop = true,
} = {}) {
  let shots = 0;
  let prevAmmo = w.ammo;
  const steps = Math.round(seconds / tick);
  for (let i = 0; i < steps; i++) {
    const t = i * tick;
    w.update(tick, { fire: !!fire(t, i) }, movement);
    if (w.ammo < prevAmmo) shots += prevAmmo - w.ammo;
    prevAmmo = w.ammo;
    // Keep the magazine irrelevant to a RATE measurement: without this an AK
    // test measures how fast 30 rounds run out, not its rpm.
    if (reserveTop && w.ammo <= 1 && Number.isFinite(w.ammo)) {
      w.ammo = w.spec.magSize;
      prevAmmo = w.ammo;
      w.reloadState = RELOAD.NONE;
      w.reloadTimer = 0;
    }
  }
  return shots;
}

// ---------------------------------------------------------------------------
// The regression guard. The AK routed through Weapon must produce the SAME
// numbers as rifle.js, compared against the real functions with a shared
// random stream. This is what protects the existing tuning.
// ---------------------------------------------------------------------------

test('AK pattern offsets match rifle.js patternOffset() exactly, jitter included', () => {
  const ak = getSpec('ak47');
  for (let i = 0; i < 40; i++) {
    // Same seed on both sides = same jitter draws in the same order.
    const a = patternOffsetFor(ak, i, seeded(1000 + i));
    const b = patternOffset(i, seeded(1000 + i));
    eq(a.x, b.x, `shot ${i} pattern x`);
    eq(a.y, b.y, `shot ${i} pattern y`);
  }
});

test('AK spread matches rifle.js spreadFor() across the whole state space', () => {
  const ak = getSpec('ak47');
  let cases = 0;
  for (const speed of [0, 0.5, 2.3, 4.6, 9.9]) {
    for (const airborne of [false, true]) {
      for (const crouching of [false, true]) {
        for (const consecutive of [0, 1, 3.7, 12, 30]) {
          const st = { speed, airborne, crouching, consecutive };
          eq(spreadForSpec(ak, st), spreadFor(st),
            `spread differs at ${JSON.stringify(st)}`);
          cases++;
        }
      }
    }
  }
  assert(cases === 100, `expected 100 comparisons, ran ${cases}`);
});

test('AK damage falloff matches rifle.js damageAt() over range', () => {
  const ak = getSpec('ak47');
  for (let d = 0; d <= 120; d += 3) {
    eq(damageAtFor(ak, d), damageAt(d), `damage at ${d}m`);
  }
});

test('AK recoil accumulation matches rifle.js RecoilState shot for shot', () => {
  const ak = getSpec('ak47');
  const mine = new WeaponRecoil(ak);
  const ref = new RecoilState();
  const rMine = seeded(4242), rRef = seeded(4242);
  mine.triggerHeld = ref.triggerHeld = true;
  for (let i = 0; i < 30; i++) {
    mine.kick(rMine); ref.kick(rRef);
    mine.update(1 / 128); ref.update(1 / 128);
    eq(mine.pitch, ref.pitch, `pitch after shot ${i + 1}`);
    eq(mine.yaw, ref.yaw, `yaw after shot ${i + 1}`);
    eq(mine.shotIndex, ref.shotIndex, `shotIndex after shot ${i + 1}`);
  }
  // ...and the recovery curve, which is the half that actually decays.
  mine.triggerHeld = ref.triggerHeld = false;
  for (let i = 0; i < 200; i++) {
    mine.update(1 / 128); ref.update(1 / 128);
    eq(mine.pitch, ref.pitch, `recovery pitch at step ${i}`);
    eq(mine.consecutive, ref.consecutive, `recovery consecutive at step ${i}`);
    eq(mine.shotIndex, ref.shotIndex, `recovery shotIndex at step ${i}`);
  }
  assert(Math.abs(ref.pitch) < 1e-6, 'reference never recovered -- test is vacuous');
});

test('AK spread cone sampling matches rifle.js applySpread() direction for direction', () => {
  for (let i = 0; i < 20; i++) {
    const d1 = new THREE.Vector3(0.1 * i - 1, 0.05, -1).normalize();
    const d2 = d1.clone();
    applySpreadTo(d1, 0.02, seeded(900 + i));
    applySpread(d2, 0.02, seeded(900 + i));
    near(d1.x, d2.x, 0, `cone x sample ${i}`);
    near(d1.y, d2.y, 0, `cone y sample ${i}`);
    near(d1.z, d2.z, 0, `cone z sample ${i}`);
  }
});

test('a full AK spray through Weapon lands where a rifle.js spray lands', () => {
  // End-to-end rather than per-function: 30 rounds through the real Weapon
  // update loop, versus 30 through rifle.js's own math, same rng stream.
  const w = mk('ak47');
  const ref = new RecoilState();
  const rRef = seeded(77);
  w.recoil = new WeaponRecoil(w.spec);
  const rMine = seeded(77);
  // Drive Weapon.fire() with the seeded rand so both sides consume identically.
  // fire() draws: recoil.kick (2), triggerKick (2), flashScale (1), then
  // spread (2 per pellet). The reference only needs the kick draws, so it gets
  // its own stream advanced the same way.
  for (let i = 0; i < 30; i++) {
    w.cooldown = 0;
    w.recoil.triggerHeld = true;
    w.fire(rMine);
    ref.triggerHeld = true;
    ref.kick(rRef);
    rRef(); rRef();          // triggerKick's two draws
    rRef();                  // flashScale
    rRef(); rRef();          // applySpread's two draws
  }
  eq(w.recoil.shotIndex, ref.shotIndex, 'shot index diverged');
  near(w.recoil.pitch, ref.pitch, 1e-12, 'accumulated pitch diverged');
  near(w.recoil.yaw, ref.yaw, 1e-12, 'accumulated yaw diverged');
  assert(w.recoil.pitch > 0.1, `spray produced no meaningful climb: ${w.recoil.pitch}`);
});

test('the AK rest pose is byte-identical to the tuned rifle.js viewmodel pose', () => {
  // rifle.js line ~556: gun.position.set(0.140, -0.100, -0.370)
  //                     gun.rotation.set(-0.11, 0.075, 0.055)
  // Read out of a live Rifle would need a DOM; the pose table is the only copy
  // in this module, so assert its values against those literals.
  const p = restPoseFor(getSpec('ak47'));
  eq(p.pos[0], 0.140, 'AK rest x');
  eq(p.pos[1], -0.100, 'AK rest y');
  eq(p.pos[2], -0.370, 'AK rest z');
  eq(p.rot[0], -0.11, 'AK rest pitch');
  eq(p.rot[1], 0.075, 'AK rest yaw');
  eq(p.rot[2], 0.055, 'AK rest roll');
});

test('spec constants used by Weapon still agree with the tuned RIFLE block', () => {
  // Belt and braces with specs.test.js: if either the spec or RIFLE drifts, the
  // per-function equality tests above would pass vacuously on matching-but-
  // wrong numbers only if BOTH moved. This catches one moving.
  const ak = getSpec('ak47');
  for (const k of ['rpm', 'magSize', 'damage', 'falloff', 'falloffUnit', 'maxRange',
    'recoilScale', 'recoverRate', 'recoverFraction', 'patternJitter',
    'patternResetTime', 'spreadBase', 'spreadCrouch', 'spreadMove', 'spreadAir',
    'spreadPerShot', 'spreadShotCap', 'shotDecayRate']) {
    eq(ak[k], RIFLE[k], `ak47.${k} drifted from RIFLE.${k}`);
  }
});

// ---------------------------------------------------------------------------
// Fire rate. Counted over simulated time, per archetype.
// ---------------------------------------------------------------------------

test('rpm gates the fire rate of a full-auto rifle', () => {
  const w = mk('ak47');
  const shots = simulate(w, 2.0);
  const expected = 2.0 * (600 / 60);   // 20
  // +/-1 for edge alignment at the start and end of the window.
  near(shots, expected, 1, `AK fired ${shots} in 2s, expected ~${expected}`);
});

test('rpm gates the fire rate across every automatic archetype', () => {
  // One shared gate must produce each weapon's OWN rate, or the table is
  // decorative. Every automatic weapon in the game, measured.
  const auto = allSpecs().filter((s) => s.automatic && Number.isFinite(s.magSize));
  assert(auto.length >= 8, `expected many automatic weapons, found ${auto.length}`);
  for (const spec of auto) {
    const w = mk(spec.id);
    const secs = 2.0;
    const shots = simulate(w, secs);
    const expected = secs * (spec.rpm / 60);
    const tol = Math.max(1, expected * 0.06);
    near(shots, expected, tol,
      `${spec.id} (${spec.rpm}rpm) fired ${shots} in ${secs}s, expected ~${expected.toFixed(1)}`);
  }
});

test('a faster weapon actually fires more rounds than a slower one', () => {
  // Guards against a gate that ignores rpm and lets everything free-run at the
  // tick rate -- which would still pass a single-weapon tolerance check.
  const mp9 = simulate(mk('mp9'), 1.5);       // 857 rpm
  const ak = simulate(mk('ak47'), 1.5);       // 600 rpm
  const sg = simulate(mk('sg553'), 1.5);      // 545 rpm
  assert(mp9 > ak && ak > sg,
    `rate ordering broken: mp9=${mp9} ak=${ak} sg553=${sg}`);
});

test('a semi-automatic weapon does not free-run on a held trigger', () => {
  const w = mk('deagle');
  w.reserve = 999;
  const held = simulate(w, 1.5);       // trigger down the whole time
  eq(held, 1, `held trigger fired ${held} rounds from a semi-auto`);
});

test('a semi-automatic weapon fires once per trigger release', () => {
  const w = mk('deagle');
  w.reserve = 999;
  // Pulse the trigger far slower than the 267rpm gate so the gate is not what
  // is being measured -- the trigger EDGE is.
  let pulses = 0;
  const shots = simulate(w, 3.0, {
    fire: (t) => {
      const on = Math.floor(t / 0.5) % 2 === 0;
      return on;
    },
  });
  pulses = 3;   // t in [0,.5),[1,1.5),[2,2.5) -> three separate pulls
  eq(shots, pulses, `expected ${pulses} shots from ${pulses} pulls, got ${shots}`);
});

// ---------------------------------------------------------------------------
// Burst
// ---------------------------------------------------------------------------

test('a burst weapon fires exactly N rounds per trigger pull', () => {
  const w = mk('famas');
  const spec = getSpec('famas');
  eq(spec.burst, 3, 'famas is not a 3-round burst in the spec');
  const before = w.ammo;
  // Trigger down for one long hold: a burst weapon must stop at N.
  simulate(w, 1.2, { reserveTop: false });
  eq(before - w.ammo, spec.burst,
    `one held trigger produced ${before - w.ammo} rounds, expected ${spec.burst}`);
});

test('a burst weapon requires a NEW trigger pull for the next burst', () => {
  const w = mk('famas');
  const spec = getSpec('famas');
  const before = w.ammo;
  // Two distinct pulls, separated by a real release.
  simulate(w, 2.0, {
    reserveTop: false,
    fire: (t) => t < 0.6 || (t >= 1.0 && t < 1.6),
  });
  eq(before - w.ammo, spec.burst * 2,
    `two pulls produced ${before - w.ammo} rounds, expected ${spec.burst * 2}`);
});

test('a burst commits: releasing the trigger mid-burst still sends all N', () => {
  const w = mk('famas');
  const spec = getSpec('famas');
  const before = w.ammo;
  // Trigger down for a single tick only, then released for the rest.
  simulate(w, 1.0, { reserveTop: false, fire: (t) => t < 0.002 });
  eq(before - w.ammo, spec.burst,
    `a tapped burst sent ${before - w.ammo}, expected the full ${spec.burst}`);
});

test('a burst still respects the rpm gate between its own rounds', () => {
  const w = mk('famas');
  const spec = getSpec('famas');
  const interval = 60 / spec.rpm;
  const before = w.ammo;
  // Stop time short of the second round: only one may have left.
  simulate(w, interval * 0.5, { reserveTop: false });
  eq(before - w.ammo, 1, 'burst emitted more than one round inside one interval');
});

// ---------------------------------------------------------------------------
// Bolt action
// ---------------------------------------------------------------------------

test('a bolt-action weapon cannot fire during the re-chamber', () => {
  const w = mk('awp');
  assert(w.spec.boltAction, 'awp is not bolt-action in the spec');
  eq(w.fire() === null, false, 'first AWP shot did not go off');
  assert(w.chambering > 0, 'firing did not start a bolt cycle');
  // Step forward through the chamber window, trying to fire at every tick.
  const tick = 1 / 256;
  let firedDuringCycle = 0;
  const steps = Math.floor((w.chamberTime * 0.95) / tick);
  for (let i = 0; i < steps; i++) {
    w.cooldown = 0;                        // rate gate removed on purpose:
    if (w.fire()) firedDuringCycle++;      // ONLY the bolt may be stopping it
    w.update(tick, {}, null);
  }
  eq(firedDuringCycle, 0, `${firedDuringCycle} rounds went off mid-bolt-cycle`);
  assert(w.chambering > 0, 'bolt cycle ended early -- window was too short to test');
});

test('a bolt-action weapon fires again once the bolt cycle completes', () => {
  const w = mk('awp');
  w.fire();
  const tick = 1 / 256;
  for (let i = 0; i < Math.ceil((w.chamberTime + w.shotInterval) / tick) + 2; i++) {
    w.update(tick, {}, null);
  }
  eq(w.chambering <= 0, true, 'bolt never finished cycling');
  assert(w.fire() !== null || w.lastShots.length > 0, 'AWP could not fire after cycling');
});

test('bolt-action rpm is what actually limits sustained AWP fire', () => {
  const w = mk('awp');
  w.reserve = 999;
  const secs = 6.0;
  // Pulse the trigger fast: a bolt gun is semi-auto, so a held trigger would
  // only ever produce one shot and the rate would not be under test.
  const shots = simulate(w, secs, { fire: (t) => Math.floor(t * 40) % 2 === 0 });
  const expected = secs * (41 / 60);   // ~4.1
  near(shots, expected, 1, `AWP fired ${shots} in ${secs}s, expected ~${expected.toFixed(1)}`);
});

test('a non-bolt sniper has no re-chamber lockout', () => {
  const w = mk('scar20');   // semi-auto sniper, boltAction false
  assert(!w.spec.boltAction, 'scar20 should not be bolt-action');
  w.fire();
  eq(w.chambering, 0, 'a non-bolt weapon started a bolt cycle');
});

// ---------------------------------------------------------------------------
// Shotgun pellets
// ---------------------------------------------------------------------------

test('a shotgun emits exactly `pellets` rays per trigger pull, for one round', () => {
  for (const id of ['nova', 'xm1014', 'mag7', 'sawedoff']) {
    const world = new FakeWorld();
    const w = mk(id, { world });
    const spec = getSpec(id);
    assert(spec.pellets > 1, `${id} is not a multi-pellet weapon`);
    const before = w.ammo;
    world.rays.length = 0;
    w.fire();
    eq(world.rays.length, spec.pellets,
      `${id}: ${world.rays.length} rays cast, expected ${spec.pellets}`);
    eq(w.lastShots.length, spec.pellets, `${id}: lastShots length`);
    eq(before - w.ammo, 1, `${id}: one trigger pull consumed ${before - w.ammo} rounds`);
  }
});

test('shotgun pellets each roll their OWN spread, not one shared direction', () => {
  const world = new FakeWorld();
  const w = mk('nova', { world });
  world.rays.length = 0;
  w.fire();
  const dirs = world.rays.map((r) => r.dir);
  // Every pair must differ, or "9 pellets" is one bullet drawn nine times.
  let identical = 0;
  for (let i = 1; i < dirs.length; i++) {
    if (dirs[i].distanceTo(dirs[0]) < 1e-12) identical++;
  }
  eq(identical, 0, `${identical} pellets shared the first pellet's direction`);
  // ...and they must be genuinely spread, not a rounding difference.
  const maxSep = Math.max(...dirs.map((d) => d.distanceTo(dirs[0])));
  assert(maxSep > 0.005, `pellet cone is degenerate: max separation ${maxSep}`);
});

test('a single-pellet weapon casts exactly one ray', () => {
  const world = new FakeWorld();
  const w = mk('ak47', { world });
  world.rays.length = 0;
  w.fire();
  eq(world.rays.length, 1, 'a rifle cast more than one ray');
});

test('a shotgun hit reports the CLOSEST pellet, and damage falls off with range', () => {
  const world = new FakeWorld(-8);
  const w = mk('nova', { world });
  const hit = w.fire();
  assert(hit, 'nova hit nothing against a wall 8m away');
  const closest = Math.min(...world.rays.map((r) => {
    const t = (world.wallZ - r.origin.z) / r.dir.z;
    return t > 0 ? t : Infinity;
  }));
  near(hit.distance, closest, 1e-9, 'reported hit was not the closest pellet');
  assert(hit.damage < getSpec('nova').damage, 'no falloff applied at 8m');
});

// ---------------------------------------------------------------------------
// Scope
// ---------------------------------------------------------------------------

test('scoping changes fov, spread AND moveScale together', () => {
  const w = mk('awp');
  const spec = getSpec('awp');
  const hipFov = w.fov, hipMove = w.moveScale;
  const still = { speed: 0, airborne: false, crouching: false, consecutive: 0 };
  const hipSpread = spreadForSpec(spec, { ...still, scoped: false });

  w.toggleScope();
  eq(w.scoped, true, 'first scope toggle did not zoom');
  eq(w.fov, spec.scope.fovs[0], 'fov did not move to the first zoom level');
  assert(w.fov < hipFov, `scoped fov ${w.fov} is not narrower than hip ${hipFov}`);
  eq(w.moveScale, spec.scope.moveScale, 'moveScale did not become the scoped one');
  assert(w.moveScale < hipMove, `scoped moveScale ${w.moveScale} not slower than ${hipMove}`);
  const scopedSpread = spreadForSpec(spec, { ...still, scoped: true });
  assert(scopedSpread < hipSpread,
    `scoped spread ${scopedSpread} is not tighter than hip ${hipSpread}`);
});

test('the AWP second zoom level is narrower than the first', () => {
  const w = mk('awp');
  w.toggleScope();
  const first = w.fov;
  w.toggleScope();
  const second = w.fov;
  assert(second < first, `second zoom ${second} not narrower than first ${first}`);
  w.toggleScope();
  eq(w.scoped, false, 'the third toggle did not return to hipfire');
  eq(w.fov, w.baseFov, 'fov did not return to base after unscoping');
});

test('the AWP is accurate scoped-and-planted but useless scoped-and-moving', () => {
  const spec = getSpec('awp');
  const planted = spreadForSpec(spec,
    { speed: 0, airborne: false, crouching: false, consecutive: 0, scoped: true });
  const running = spreadForSpec(spec,
    { speed: 4.6, airborne: false, crouching: false, consecutive: 0, scoped: true });
  const hipRunning = spreadForSpec(spec,
    { speed: 4.6, airborne: false, crouching: false, consecutive: 0, scoped: false });
  assert(planted < 0.0002, `planted scoped AWP is not accurate: ${planted}`);
  assert(running > planted * 100,
    `running scoped AWP is not punished: ${running} vs ${planted}`);
  assert(running > hipRunning,
    `scoping while running is not worse than hipfire: ${running} vs ${hipRunning}`);
});

test('a weapon with no scope ignores scope input rather than breaking', () => {
  const w = mk('ak47');
  eq(w.toggleScope(), false, 'a scopeless weapon reported a zoom');
  eq(w.scoped, false, 'a scopeless weapon became scoped');
  eq(w.fov, w.baseFov, 'a scopeless weapon changed fov');
  eq(w.moveScale, getSpec('ak47').moveScale, 'a scopeless weapon changed moveScale');
  w.setScope(3);
  eq(w.scopeLevel, 0, 'setScope forced a level onto a scopeless weapon');
});

test('every scoped weapon zooms in and slows the player down', () => {
  for (const spec of allSpecs().filter((s) => s.scope)) {
    const w = mk(spec.id);
    const hipMove = w.moveScale;
    w.setScope(1);
    assert(w.fov < w.baseFov, `${spec.id}: scoped fov did not narrow`);
    assert(w.moveScale < hipMove, `${spec.id}: scoping did not slow movement`);
  }
});

test('reloading drops the scope', () => {
  const w = mk('awp');
  w.ammo = 1;
  w.toggleScope();
  eq(w.scoped, true, 'setup: not scoped');
  w.reload();
  eq(w.scoped, false, 'a reload left the weapon scoped');
});

// ---------------------------------------------------------------------------
// Reload -- magazine
// ---------------------------------------------------------------------------

test('a reload refills the magazine from the reserve', () => {
  const w = mk('ak47');
  w.ammo = 0;
  w.reserve = 90;
  w.reload();
  const t = 1 / 256;
  for (let i = 0; i < Math.ceil(w.reloadDuration() / t) + 4; i++) w.update(t, {}, null);
  eq(w.reloadState, RELOAD.NONE, 'reload never finished');
  eq(w.ammo, 30, 'magazine not full after a reload');
  eq(w.reserve, 60, 'reserve did not lose exactly one magazine');
});

test('a partial magazine keeps its rounds and takes only what it needs', () => {
  const w = mk('ak47');
  w.ammo = 12;
  w.reserve = 90;
  w.reload();
  const t = 1 / 256;
  for (let i = 0; i < Math.ceil(w.reloadDuration() / t) + 4; i++) w.update(t, {}, null);
  eq(w.ammo, 30, 'partial mag did not top up to full');
  eq(w.reserve, 72, `reserve should drop by 18, got ${90 - w.reserve}`);
});

test('a reload with less reserve than a full magazine loads only what is left', () => {
  const w = mk('ak47');
  w.ammo = 4;
  w.reserve = 7;
  w.reload();
  const t = 1 / 256;
  for (let i = 0; i < Math.ceil(w.reloadDuration() / t) + 4; i++) w.update(t, {}, null);
  eq(w.ammo, 11, 'ammo should be 4 + 7');
  eq(w.reserve, 0, 'reserve should be empty');
});

test('a reload cannot start with a full magazine or an empty reserve', () => {
  const full = mk('ak47');
  eq(full.reload(), false, 'a full magazine started a reload');
  const dry = mk('ak47');
  dry.ammo = 0; dry.reserve = 0;
  eq(dry.reload(), false, 'an empty reserve started a reload');
  eq(dry.reloadState, RELOAD.NONE, 'reload state left dirty');
});

test('a mag reload cannot be interrupted by firing', () => {
  const w = mk('ak47');
  w.ammo = 5; w.reserve = 90;
  w.reload();
  const t = 1 / 256;
  const before = w.ammo;
  for (let i = 0; i < 40; i++) { w.cooldown = 0; w.fire(); w.update(t, {}, null); }
  eq(w.ammo, before, 'a round left the barrel during a magazine reload');
  assert(w.reloadState !== RELOAD.NONE, 'firing cancelled a magazine reload');
});

test('the reload passes through distinct out and in phases', () => {
  const w = mk('ak47');
  w.ammo = 0;
  w.reload();
  const seen = new Set();
  const t = 1 / 512;
  for (let i = 0; i < Math.ceil(w.reloadDuration() / t) + 4; i++) {
    seen.add(w.reloadState);
    w.update(t, {}, null);
  }
  assert(seen.has(RELOAD.OUT), 'never entered the mag-out phase');
  assert(seen.has(RELOAD.IN), 'never entered the mag-in phase');
});

test('reloadCharge holds the weapon after the ammo has already arrived', () => {
  const w = mk('usp');
  const spec = getSpec('usp');
  assert(spec.anim.reloadCharge > 0, 'usp has no charge phase in the spec');
  w.ammo = 0; w.reserve = 24;
  w.reload();
  const t = 1 / 512;
  let ammoArrivedAt = -1, doneAt = -1;
  const total = Math.ceil(w.reloadDuration() / t) + 8;
  for (let i = 0; i < total; i++) {
    w.update(t, {}, null);
    if (ammoArrivedAt < 0 && w.ammo > 0) ammoArrivedAt = i;
    if (doneAt < 0 && ammoArrivedAt >= 0 && w.reloadState === RELOAD.NONE) doneAt = i;
  }
  assert(ammoArrivedAt >= 0, 'ammo never arrived');
  assert(doneAt > ammoArrivedAt, 'the charge phase took no time');
  const chargeSecs = (doneAt - ammoArrivedAt) * t;
  near(chargeSecs, spec.anim.reloadCharge, 0.02,
    `charge lasted ${chargeSecs.toFixed(3)}s, spec says ${spec.anim.reloadCharge}`);
});

test('you cannot fire during the post-seat charge phase', () => {
  const w = mk('usp');
  w.ammo = 0; w.reserve = 24;
  w.reload();
  const t = 1 / 512;
  let firedDuringCharge = 0;
  for (let i = 0; i < Math.ceil(w.reloadDuration() / t) + 4; i++) {
    w.update(t, {}, null);
    if (w.reloadState === RELOAD.CHARGE) {
      w.cooldown = 0;
      if (w.fire()) firedDuringCharge++;
    }
  }
  eq(firedDuringCharge, 0, 'a round went off during the charge phase');
});

test('every weapon reload duration follows its OWN spec timings, not a shared one', () => {
  // The point of per-weapon anim is that an AWP takes longer than an MP9. If
  // this collapses, the table is decorative.
  const durations = new Map();
  for (const spec of allSpecs()) {
    if (!Number.isFinite(spec.magSize)) continue;
    const w = mk(spec.id);
    w.ammo = 0;
    w.reserve = spec.reserve;
    const expected = w.shellReload
      ? spec.anim.reloadOut + Math.min(spec.magSize, spec.reserve) * spec.anim.reloadIn
      : spec.anim.reloadOut + spec.anim.reloadIn + spec.anim.reloadCharge;
    w.reload();
    const t = 1 / 512;
    let elapsed = 0;
    for (let i = 0; i < Math.ceil(expected / t) + 16; i++) {
      if (w.reloadState === RELOAD.NONE && i > 0) break;
      w.update(t, {}, null);
      elapsed += t;
    }
    near(elapsed, expected, 0.03, `${spec.id} reload took ${elapsed.toFixed(3)}s, expected ${expected.toFixed(3)}s`);
    durations.set(spec.id, elapsed);
  }
  assert(durations.get('awp') > durations.get('mp9') * 1.3,
    `an AWP reload (${durations.get('awp')}) is not meaningfully heavier than an MP9 (${durations.get('mp9')})`);
  assert(new Set([...durations.values()].map((v) => v.toFixed(2))).size > 6,
    'reload durations collapsed to a handful of shared values');
});

// ---------------------------------------------------------------------------
// Reload -- shell at a time
// ---------------------------------------------------------------------------

test('tube-fed shotguns are shell-fed and box-mag ones are not', () => {
  eq(isShellFed(getSpec('nova')), true, 'nova should be shell-fed');
  eq(isShellFed(getSpec('xm1014')), true, 'xm1014 should be shell-fed');
  eq(isShellFed(getSpec('sawedoff')), true, 'sawedoff should be shell-fed');
  eq(isShellFed(getSpec('mag7')), false, 'mag7 is a box mag, not a tube');
  eq(isShellFed(getSpec('ak47')), false, 'a rifle is not shell-fed');
});

test('a shell reload loads ONE shell per cycle, not the whole tube at once', () => {
  const w = mk('nova');
  const spec = getSpec('nova');
  w.ammo = 0; w.reserve = 32;
  w.reload();
  const t = 1 / 512;
  const counts = [];
  for (let i = 0; i < Math.ceil((spec.anim.reloadOut + 4 * spec.anim.reloadIn) / t); i++) {
    w.update(t, {}, null);
    counts.push(w.ammo);
  }
  // Ammo must climb one at a time, never jumping.
  for (let i = 1; i < counts.length; i++) {
    assert(counts[i] - counts[i - 1] <= 1,
      `tube gained ${counts[i] - counts[i - 1]} shells in one tick`);
  }
  assert(w.ammo >= 3 && w.ammo <= 5,
    `after out + ~4 shell cycles the tube holds ${w.ammo}, expected ~4`);
});

test('a shell reload can be interrupted by firing and KEEPS the loaded shells', () => {
  const w = mk('nova');
  const spec = getSpec('nova');
  w.ammo = 0; w.reserve = 32;
  w.reload();
  const t = 1 / 512;
  // Load partway up the tube.
  const untilThree = Math.ceil((spec.anim.reloadOut + 3.1 * spec.anim.reloadIn) / t);
  for (let i = 0; i < untilThree; i++) w.update(t, {}, null);
  const loaded = w.ammo;
  assert(loaded >= 2 && loaded < spec.magSize,
    `setup: expected a partly-loaded tube, got ${loaded}/${spec.magSize}`);
  const reserveAt = w.reserve;

  // Now fire out of the reload.
  w.cooldown = 0;
  const hit = w.fire();
  eq(w.reloadState, RELOAD.NONE, 'firing did not interrupt the shell reload');
  eq(w.ammo, loaded - 1, `shells were lost on interrupt: had ${loaded}, now ${w.ammo}`);
  eq(w.reserve, reserveAt, 'the reserve changed on interrupt');
  assert(hit !== null || w.lastShots.length === spec.pellets,
    'the interrupting shot did not actually fire');
});

test('an interrupted shell reload can be resumed and still fills the tube', () => {
  const w = mk('nova');
  const spec = getSpec('nova');
  w.ammo = 0; w.reserve = 32;
  w.reload();
  const t = 1 / 512;
  for (let i = 0; i < Math.ceil((spec.anim.reloadOut + 2.1 * spec.anim.reloadIn) / t); i++) {
    w.update(t, {}, null);
  }
  w.cooldown = 0;
  w.fire();
  const after = w.ammo;
  w.cooldown = 0;
  eq(w.reload(), true, 'could not restart the reload after interrupting');
  // reloadDuration() shrinks as the tube fills, so a bound captured once is far
  // too short. Run until the reload actually ends, with a hard cap so a stall
  // fails the test instead of hanging it.
  const cap = Math.ceil(10 / t);
  let spun = 0;
  while (w.reloadState !== RELOAD.NONE && spun < cap) { w.update(t, {}, null); spun++; }
  assert(spun < cap, 'shell reload never completed');
  eq(w.ammo, spec.magSize, `tube did not fill on resume: ${w.ammo}/${spec.magSize}`);
  assert(w.reserve < 32, 'resuming took nothing from the reserve');
  assert(after < spec.magSize, 'setup was vacuous -- tube was already full');
});

test('a shell reload stops when the reserve runs dry', () => {
  const w = mk('nova');
  w.ammo = 0; w.reserve = 3;
  w.reload();
  const t = 1 / 512;
  for (let i = 0; i < Math.ceil((0.5 + 10 * 0.45) / t); i++) w.update(t, {}, null);
  eq(w.ammo, 3, 'loaded more shells than the reserve held');
  eq(w.reserve, 0, 'reserve went negative or was not consumed');
  eq(w.reloadState, RELOAD.NONE, 'reload kept running with an empty reserve');
});

test('a shell reload stops when the tube is full', () => {
  const w = mk('nova');
  const spec = getSpec('nova');
  w.ammo = 0; w.reserve = 32;
  w.reload();
  const t = 1 / 512;
  for (let i = 0; i < Math.ceil((0.5 + 20 * 0.45) / t); i++) w.update(t, {}, null);
  eq(w.ammo, spec.magSize, 'tube did not fill');
  eq(w.reserve, 32 - spec.magSize, 'wrong number of shells taken from the reserve');
  eq(w.reloadState, RELOAD.NONE, 'reload did not stop at a full tube');
});

test('the MAG-7 reloads as a box mag, all at once', () => {
  const w = mk('mag7');
  const spec = getSpec('mag7');
  w.ammo = 0; w.reserve = 32;
  w.reload();
  const t = 1 / 512;
  let jumped = false;
  let prev = w.ammo;
  for (let i = 0; i < Math.ceil(w.reloadDuration() / t) + 8; i++) {
    w.update(t, {}, null);
    if (w.ammo - prev > 1) jumped = true;
    prev = w.ammo;
  }
  eq(w.ammo, spec.magSize, 'mag7 did not fill');
  assert(jumped, 'mag7 loaded one shell at a time -- it is a box mag');
});

// ---------------------------------------------------------------------------
// Dry fire
// ---------------------------------------------------------------------------

test('dry-firing at zero ammo does nothing at all', () => {
  const world = new FakeWorld();
  const w = mk('ak47', { world });
  w.ammo = 0;
  const recoilBefore = w.recoil.pitch;
  const idxBefore = w.recoil.shotIndex;
  world.rays.length = 0;
  eq(w.fire(), null, 'a dry weapon returned a hit');
  eq(world.rays.length, 0, 'a dry weapon cast a ray');
  eq(w.ammo, 0, 'ammo went negative');
  eq(w.recoil.pitch, recoilBefore, 'a dry click applied recoil');
  eq(w.recoil.shotIndex, idxBefore, 'a dry click advanced the spray pattern');
  eq(w.flashTimer, 0, 'a dry click lit the muzzle flash');
});

test('dry-firing an automatic weapon held down stays silent for the whole hold', () => {
  const world = new FakeWorld();
  const w = mk('ak47', { world });
  w.ammo = 0; w.reserve = 0;
  world.rays.length = 0;
  simulate(w, 1.0, { reserveTop: false });
  eq(world.rays.length, 0, `a dry weapon cast ${world.rays.length} rays over a second`);
  eq(w.ammo, 0, 'ammo went below zero');
});

test('firing while the weapon is still being drawn does nothing', () => {
  const w = mk('awp', { drawn: false });
  assert(w.drawTimer > 0, 'weapon did not start in the draw state');
  eq(w.fire(), null, 'fired mid-draw');
  eq(w.ammo, getSpec('awp').magSize, 'a round left the magazine mid-draw');
});

// ---------------------------------------------------------------------------
// Knife
// ---------------------------------------------------------------------------

test('the knife slash and stab have different damage and different timing', () => {
  const w = mk('knife');
  w.drawTimer = 0;
  const spec = getSpec('knife');
  const slash = w.meleeAttack(false, false);
  assert(slash, 'slash did not connect');
  eq(slash.damage, spec.damage, 'slash damage is not the light damage');
  eq(slash.kind, SWING.SLASH, 'slash reported the wrong swing kind');

  w.cooldown = 0; w.drawTimer = 0;
  const stab = w.meleeAttack(true, false);
  assert(stab, 'stab did not connect');
  eq(stab.damage, spec.heavyDamage, 'stab damage is not the heavy damage');
  eq(stab.kind, SWING.STAB, 'stab reported the wrong swing kind');

  assert(stab.damage > slash.damage, 'the heavy stab does not hit harder');
  assert(stab.duration > slash.duration,
    `stab (${stab.duration}s) is not slower than slash (${slash.duration}s)`);
});

test('the knife rate limit differs between slash and stab', () => {
  const spec = getSpec('knife');
  const a = mk('knife'); a.drawTimer = 0;
  a.meleeAttack(false);
  const slashCooldown = a.cooldown;
  const b = mk('knife'); b.drawTimer = 0;
  b.meleeAttack(true);
  const stabCooldown = b.cooldown;
  near(slashCooldown, 60 / spec.rpm, 1e-9, 'slash cooldown is not rpm-derived');
  near(stabCooldown, 60 / spec.heavyRpm, 1e-9, 'stab cooldown is not heavyRpm-derived');
  assert(stabCooldown > slashCooldown, 'the stab is not slower to repeat');
});

test('a backstab multiplies damage for both slash and stab', () => {
  const spec = getSpec('knife');
  const a = mk('knife'); a.drawTimer = 0;
  const front = a.meleeAttack(false, false).damage;
  a.cooldown = 0;
  const back = a.meleeAttack(false, true).damage;
  near(back, front * spec.backstabMult, 1e-9, 'slash backstab multiplier wrong');

  const b = mk('knife'); b.drawTimer = 0;
  const heavyFront = b.meleeAttack(true, false).damage;
  b.cooldown = 0;
  const heavyBack = b.meleeAttack(true, true).damage;
  near(heavyBack, heavyFront * spec.backstabMult, 1e-9, 'stab backstab multiplier wrong');
  assert(heavyBack > 100, `a heavy backstab should be lethal, got ${heavyBack}`);
});

test('the knife rate gate stops a second swing arriving early', () => {
  const w = mk('knife');
  w.drawTimer = 0;
  assert(w.meleeAttack(false), 'first swing failed');
  eq(w.meleeAttack(false), null, 'a second swing landed inside the cooldown');
  const t = 1 / 256;
  // Capture the bound BEFORE stepping: update() decrements w.cooldown, so
  // reading it in the loop condition ends the loop while it is still counting.
  const steps = Math.ceil(w.cooldown / t) + 2;
  for (let i = 0; i < steps; i++) w.update(t, {}, null);
  assert(w.meleeAttack(false), 'could not swing again after the cooldown');
});

test('meleeAttack does nothing on a weapon that is not a knife', () => {
  const w = mk('ak47');
  w.drawTimer = 0;
  eq(w.meleeAttack(false), null, 'a rifle performed a melee attack');
});

test('the knife swing animation runs for its spec duration and then clears', () => {
  const w = mk('knife');
  w.drawTimer = 0;
  const spec = getSpec('knife');
  w.meleeAttack(true);
  eq(w.swing, SWING.STAB, 'swing state not set');
  const t = 1 / 256;
  for (let i = 0; i < Math.ceil(spec.anim.stab / t) - 4; i++) w.update(t, {}, null);
  eq(w.swing, SWING.STAB, 'the stab animation ended early');
  for (let i = 0; i < 8; i++) w.update(t, {}, null);
  eq(w.swing, SWING.NONE, 'the stab animation never ended');
});

// ---------------------------------------------------------------------------
// Animation: per-weapon differentiation, and no NaN reaching a transform
// ---------------------------------------------------------------------------

test('no NaN reaches a transform for any weapon under any input', () => {
  // The failure this guards against is silent: a NaN position deletes the
  // weapon from the frame and logs nothing.
  const inputs = [
    {}, { fire: true }, { reload: true }, { inspect: true },
    { fire: true, reload: true },
  ];
  const movements = [
    null, mover(), mover({ speed: 4.6 }), mover({ speed: 4.6, grounded: false }),
    mover({ speed: 1.1, crouching: true }),
  ];
  for (const id of WEAPON_IDS) {
    const w = mk(id);
    for (let i = 0; i < 200; i++) {
      const input = inputs[i % inputs.length];
      const m = movements[(i >> 2) % movements.length];
      // Include degenerate dt: a zero-length frame is what a paused tab hands
      // you, and it is the classic source of a divide-by-zero NaN.
      const dt = i % 37 === 0 ? 0 : 1 / 128;
      w.update(dt, input, m);
      if (i % 23 === 0) w.toggleScope();
      if (id === 'knife' && i % 17 === 0) { w.cooldown = 0; w.meleeAttack(i % 34 === 0); }
      const p = w.gun.position, r = w.gun.rotation;
      for (const [k, v] of [['pos.x', p.x], ['pos.y', p.y], ['pos.z', p.z],
        ['rot.x', r.x], ['rot.y', r.y], ['rot.z', r.z]]) {
        assert(Number.isFinite(v), `${id}: ${k} became ${v} at step ${i}`);
      }
      assert(Number.isFinite(w.spread) && w.spread >= 0,
        `${id}: spread became ${w.spread} at step ${i}`);
      assert(Number.isFinite(w.recoil.pitch) && Number.isFinite(w.recoil.yaw),
        `${id}: recoil became NaN at step ${i}`);
    }
  }
});

test('the viewmodel actually moves when the weapon is used', () => {
  // A "no NaN" test passes trivially on an animation that never runs. This is
  // the companion that proves there is motion to check.
  const w = mk('ak47');
  w.drawTimer = 0;
  w.update(1 / 128, {}, null);
  const rest = w.gun.position.clone();
  const restRot = w.gun.rotation.clone();
  w.fire();
  for (let i = 0; i < 3; i++) w.update(1 / 128, {}, null);
  assert(w.gun.position.distanceTo(rest) > 1e-4,
    `firing did not move the viewmodel: ${w.gun.position.toArray()}`);
  assert(Math.abs(w.gun.rotation.x - restRot.x) > 1e-4, 'firing did not rotate the viewmodel');
});

test('the fire kick settles back to rest instead of drifting', () => {
  const w = mk('ak47');
  w.drawTimer = 0;
  w.update(1 / 128, {}, null);
  const rest = w.gun.position.clone();
  w.fire();
  for (let i = 0; i < 256; i++) w.update(1 / 128, {}, null);
  assert(w.gun.position.distanceTo(rest) < 5e-3,
    `viewmodel drifted after the kick settled: ${w.gun.position.distanceTo(rest)}`);
});

test('a heavy weapon kicks the viewmodel harder than a light one', () => {
  // The per-weapon difference is the point of spec.anim; a shared curve here
  // would make every gun feel the same.
  const peak = (id) => {
    const w = mk(id);
    w.drawTimer = 0;
    w.update(1 / 128, {}, null);
    const rest = w.gun.position.clone();
    w.fire(seeded(5));
    let max = 0;
    for (let i = 0; i < 40; i++) {
      w.update(1 / 128, {}, null);
      max = Math.max(max, w.gun.position.distanceTo(rest));
    }
    return max;
  };
  const awp = peak('awp'), mp9 = peak('mp9'), ak = peak('ak47');
  assert(awp > ak, `AWP kick ${awp} is not heavier than AK ${ak}`);
  assert(ak > mp9, `AK kick ${ak} is not heavier than MP9 ${mp9}`);
});

test('idle sway amplitude follows the per-weapon sway multiplier', () => {
  const amp = (id) => {
    const w = mk(id);
    w.drawTimer = 0;
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < 1400; i++) {
      w.update(1 / 128, {}, mover({ speed: 0 }));
      lo = Math.min(lo, w.gun.position.x);
      hi = Math.max(hi, w.gun.position.x);
    }
    return hi - lo;
  };
  const awp = amp('awp');    // sway 0.7
  const mp9 = amp('mp9');    // sway 1.15
  assert(mp9 > awp * 1.2,
    `MP9 sway ${mp9.toFixed(5)} is not livelier than the AWP's ${awp.toFixed(5)}`);
  assert(awp > 0, 'the AWP does not sway at all');
});

test('draw, reload and inspect each displace the viewmodel differently', () => {
  const sample = (setup) => {
    const w = mk('ak47');
    w.drawTimer = 0;
    w.update(1 / 128, {}, null);
    const rest = w.gun.position.clone();
    setup(w);
    let max = 0, at = null;
    for (let i = 0; i < 400; i++) {
      w.update(1 / 128, {}, null);
      const d = w.gun.position.distanceTo(rest);
      if (d > max) { max = d; at = w.gun.position.clone().sub(rest); }
    }
    return { max, at };
  };
  const draw = sample((w) => { w.deploy(); });
  const reload = sample((w) => { w.ammo = 0; w.reload(); });
  const inspect = sample((w) => { w.startInspect(); });
  for (const [name, r] of [['draw', draw], ['reload', reload], ['inspect', inspect]]) {
    assert(r.max > 0.01, `${name} barely moved the viewmodel (${r.max})`);
  }
  // Different motions, not one curve with three names.
  const dirs = [draw.at.clone().normalize(), reload.at.clone().normalize(),
    inspect.at.clone().normalize()];
  for (let i = 0; i < 3; i++) {
    for (let j = i + 1; j < 3; j++) {
      assert(dirs[i].distanceTo(dirs[j]) > 0.1,
        `two of draw/reload/inspect displace the weapon identically`);
    }
  }
});

test('the reload animation spends real time in both the out and in shapes', () => {
  const w = mk('awp');
  w.drawTimer = 0;
  w.ammo = 0;
  w.reload();
  const t = 1 / 256;
  let outFrames = 0, inFrames = 0;
  for (let i = 0; i < Math.ceil(w.reloadDuration() / t) + 4; i++) {
    if (w.reloadState === RELOAD.OUT) outFrames++;
    if (w.reloadState === RELOAD.IN) inFrames++;
    w.update(t, {}, null);
  }
  const spec = getSpec('awp');
  near(outFrames * t, spec.anim.reloadOut, 0.03, 'mag-out phase did not last its spec time');
  near(inFrames * t, spec.anim.reloadIn, 0.03, 'mag-in phase did not last its spec time');
});

test('the bolt cycle visibly animates between sniper shots', () => {
  const w = mk('awp');
  w.drawTimer = 0;
  w.update(1 / 256, {}, null);
  const rest = w.gun.position.clone();
  w.fire();
  let max = 0;
  const t = 1 / 256;
  for (let i = 0; i < Math.ceil(w.chamberTime / t); i++) {
    w.update(t, {}, null);
    max = Math.max(max, w.gun.position.distanceTo(rest));
  }
  assert(max > 0.02, `the bolt cycle barely moved the weapon (${max})`);
});

test('scoping pulls the viewmodel out of the way', () => {
  const w = mk('awp');
  w.drawTimer = 0;
  for (let i = 0; i < 60; i++) w.update(1 / 128, {}, null);
  const hip = w.gun.position.clone();
  w.setScope(1);
  for (let i = 0; i < 60; i++) w.update(1 / 128, {}, null);
  assert(w.gun.position.y < hip.y - 0.05,
    `scoping did not lower the weapon: ${hip.y} -> ${w.gun.position.y}`);
});

// ---------------------------------------------------------------------------
// Model factory injection and general construction
// ---------------------------------------------------------------------------

test('every weapon id constructs without throwing', () => {
  for (const id of WEAPON_IDS) {
    const w = mk(id);
    assert(w.gun, `${id}: no model`);
    assert(w.muzzle, `${id}: no muzzle marker`);
    assert(Number.isFinite(w.shotInterval) && w.shotInterval > 0,
      `${id}: bad shot interval ${w.shotInterval}`);
  }
});

test('the model factory is called with the id and the viewmodel flag', () => {
  const calls = [];
  const w = new Weapon('m4a4', {
    modelFactory: (id, mats, o) => { calls.push([id, mats, o]); return stubWeaponModel(id); },
    materials: { tag: 'mats' },
  });
  eq(calls.length, 1, 'factory was not called exactly once');
  eq(calls[0][0], 'm4a4', 'factory got the wrong id');
  eq(calls[0][1].tag, 'mats', 'factory did not receive the materials');
  eq(calls[0][2].viewmodel, true, 'factory was not told this is a viewmodel');
  assert(w.gun, 'the returned model was not adopted');
});

test('a factory model with named parts gets them animated', () => {
  const factory = (id) => {
    const g = new THREE.Group();
    const muzzle = new THREE.Object3D(); muzzle.name = 'muzzle';
    muzzle.position.set(0, 0, -0.6); g.add(muzzle);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1, 0.03));
    mag.name = 'magazine'; mag.position.set(0, -0.06, -0.1); g.add(mag);
    const bolt = new THREE.Object3D(); bolt.name = 'bolt'; g.add(bolt);
    return g;
  };
  const w = new Weapon('ak47', { modelFactory: factory });
  assert(w.magPart, 'the magazine part was not found');
  assert(w.boltPart, 'the bolt part was not found');
  const magRest = w.magHome.clone();
  w.drawTimer = 0;
  w.ammo = 0;
  w.reload();
  let moved = false, hidden = false;
  for (let i = 0; i < Math.ceil(w.reloadDuration() * 256) + 4; i++) {
    w.update(1 / 256, {}, null);
    if (w.magPart.position.distanceTo(magRest) > 0.05) moved = true;
    if (w.magPart.visible === false) hidden = true;
  }
  assert(moved, 'the magazine never left the magwell during a reload');
  assert(hidden, 'the magazine never went out of sight after clearing the well');
  assert(w.magPart.position.distanceTo(magRest) < 1e-9,
    'the magazine did not return home after the reload');
  eq(w.magPart.visible, true, 'the magazine stayed hidden after the reload');
});

test('a model with no muzzle marker still gets one at the front of the weapon', () => {
  const factory = () => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.8));
    body.position.z = -0.3;
    g.add(body);
    return g;
  };
  const w = new Weapon('ak47', { modelFactory: factory });
  assert(w.muzzle, 'no fallback muzzle was created');
  assert(w.muzzle.position.z < -0.5,
    `fallback muzzle sits at z=${w.muzzle.position.z}, not at the front`);
});

test('findPart matches case-insensitively and never returns the root', () => {
  const g = new THREE.Group();
  g.name = 'Magazine';                     // the root itself is named
  const child = new THREE.Object3D();
  child.name = 'Muzzle_Flash_Point';
  g.add(child);
  eq(findPart(g, 'muzzle'), child, 'case-insensitive match failed');
  eq(findPart(g, 'magazine'), null, 'findPart returned the root object');
  eq(findPart(g, 'nothing'), null, 'findPart invented a part');
});

test('a headless weapon (no scene, no camera) still runs its whole state machine', () => {
  const w = new Weapon('nova', { viewmodel: false });
  w.drawTimer = 0;
  eq(w.fire(), null, 'a weapon with no world returned a hit');
  eq(w.ammo, getSpec('nova').magSize - 1, 'the round was not consumed headlessly');
  w.ammo = 0;
  w.reload();
  for (let i = 0; i < 4000; i++) w.update(1 / 256, {}, null);
  eq(w.ammo, getSpec('nova').magSize, 'the headless reload did not fill the tube');
});

test('the net layer contract survives: lastShot carries origin and direction', () => {
  const w = mk('ak47');
  w.drawTimer = 0;
  w.fire();
  assert(w.lastShot, 'lastShot was not populated');
  assert(w.lastShot.origin instanceof THREE.Vector3, 'lastShot.origin is not a Vector3');
  assert(w.lastShot.direction instanceof THREE.Vector3, 'lastShot.direction is not a Vector3');
  near(w.lastShot.direction.length(), 1, 1e-6, 'lastShot.direction is not normalised');
  // Hitscan fires from the EYE, not the muzzle -- otherwise you can shoot
  // through a wall your barrel is clipping into.
  const eye = w.camera.getWorldPosition(new THREE.Vector3());
  near(w.lastShot.origin.distanceTo(eye), 0, 1e-9, 'shots do not originate at the eye');
});

test('moveScale is the spec value while hipfiring, for every weapon', () => {
  for (const spec of allSpecs()) {
    const w = mk(spec.id);
    eq(w.moveScale, spec.moveScale, `${spec.id}: hipfire moveScale wrong`);
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
