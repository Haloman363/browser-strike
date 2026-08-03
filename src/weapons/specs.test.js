// Guards the weapon table. The one that matters most is the AK check: rifle.js
// RIFLE was hand-tuned over a long session, and specs.js has to keep agreeing
// with it or a "new weapons" change silently retunes the gun that already felt
// right.
//
// Throw-based, like every other suite here. console.assert does NOT throw.
import { getSpec, allSpecs, WEAPON_IDS, KIND, TEAM } from './specs.js';
import { RIFLE } from './rifle.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ok    ${name}`); }
  catch (e) { failed++; console.log(`  FAIL  ${name}\n        ${e.message}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function eq(a, b, msg) {
  if (a !== b) throw new Error(`${msg || 'value'}: expected ${b}, got ${a}`);
}

// The harness must be able to fail, or every "ok" below is worthless.
test('the harness itself can fail', () => {
  let threw = false;
  try { assert(false, 'x'); } catch { threw = true; }
  assert(threw, 'assert() did not throw on a false condition');
});

test('the AK spec still matches the tuned RIFLE constants', () => {
  const ak = getSpec('ak47');
  // Only the fields that define how the gun FEELS. If one of these drifts the
  // existing tuning is gone, and no visual check would catch it.
  for (const k of ['rpm', 'magSize', 'damage', 'falloff', 'falloffUnit',
    'maxRange', 'recoilScale', 'recoverRate', 'recoverFraction',
    'patternJitter', 'patternResetTime', 'spreadBase', 'spreadCrouch',
    'spreadMove', 'spreadAir', 'spreadPerShot', 'spreadShotCap',
    'shotDecayRate']) {
    eq(ak[k], RIFLE[k], `ak47.${k} drifted from RIFLE.${k}`);
  }
});

test('every weapon id resolves to a complete spec', () => {
  for (const id of WEAPON_IDS) {
    const s = getSpec(id);
    assert(s.name, `${id}: no name`);
    assert(Object.values(KIND).includes(s.kind), `${id}: bad kind ${s.kind}`);
    assert(Object.values(TEAM).includes(s.team), `${id}: bad team ${s.team}`);
    assert(Array.isArray(s.pattern) && s.pattern.length > 0, `${id}: no pattern`);
    assert(s.anim && s.anim.draw > 0, `${id}: no draw time`);
  }
});

test('an unknown weapon throws rather than returning a broken spec', () => {
  let threw = false;
  try { getSpec('rocketlauncher'); } catch { threw = true; }
  assert(threw, 'getSpec should throw on an unknown id');
});

test('numeric stats are finite and sane', () => {
  for (const s of allSpecs()) {
    for (const k of ['rpm', 'damage', 'maxRange', 'recoilScale', 'moveScale',
      'armorPierce', 'pellets']) {
      const v = s[k];
      assert(Number.isFinite(v), `${s.id}.${k} is not finite: ${v}`);
      assert(v > 0, `${s.id}.${k} must be positive: ${v}`);
    }
    // magSize may be Infinity (knife), but never NaN or zero.
    assert(s.magSize > 0 && !Number.isNaN(s.magSize), `${s.id}.magSize bad`);
    assert(s.armorPierce <= 1.0, `${s.id}.armorPierce > 1 makes armour help`);
    assert(s.falloff > 0 && s.falloff <= 1, `${s.id}.falloff out of range`);
  }
});

test('patterns start on the crosshair', () => {
  // First shot landing anywhere but dead centre makes every gun feel broken.
  for (const s of allSpecs()) {
    const [x, y] = s.pattern[0];
    eq(x, 0, `${s.id}: first pattern shot has x offset`);
    eq(y, 0, `${s.id}: first pattern shot has y offset`);
  }
});

test('pattern entries are all finite pairs', () => {
  for (const s of allSpecs()) {
    for (let i = 0; i < s.pattern.length; i++) {
      const p = s.pattern[i];
      assert(Array.isArray(p) && p.length === 2, `${s.id}[${i}]: not a pair`);
      assert(Number.isFinite(p[0]) && Number.isFinite(p[1]),
        `${s.id}[${i}]: non-finite`);
    }
  }
});

test('defaults merge without clobbering nested anim timings', () => {
  // mp9 overrides only some anim fields; the rest must still be present.
  const mp9 = getSpec('mp9');
  assert(mp9.anim.draw === 0.55, 'override lost');
  assert(Number.isFinite(mp9.anim.fireKick), 'default anim field lost in merge');
  assert(Number.isFinite(mp9.anim.reloadCharge), 'default anim field lost');
});

test('specs are independent copies, not shared references', () => {
  // A caller mutating one spec must not silently retune every other weapon.
  const a = getSpec('ak47');
  a.damage = 999;
  a.anim.draw = 999;
  const b = getSpec('ak47');
  eq(b.damage, 36, 'spec damage leaked between calls');
  eq(b.anim.draw, 0.7, 'spec anim leaked between calls');
});

test('archetypes have the flags their code paths depend on', () => {
  for (const s of allSpecs()) {
    if (s.kind === KIND.SHOTGUN) {
      assert(s.pellets > 1, `${s.id}: shotgun with a single pellet`);
    }
    if (s.boltAction) {
      assert(!s.automatic, `${s.id}: bolt-action cannot also be automatic`);
    }
    if (s.scope) {
      assert(Array.isArray(s.scope.fovs) && s.scope.fovs.length > 0,
        `${s.id}: scope with no fov levels`);
      for (const f of s.scope.fovs) assert(f > 0 && f < 120, `${s.id}: bad scope fov`);
    }
    if (s.burst > 0) assert(!s.automatic, `${s.id}: burst weapon marked automatic`);
  }
});

test('pistols are not slower than rifles to hold', () => {
  // moveScale is a balance lever; an inverted one makes pistols feel wrong.
  const pistols = allSpecs().filter((s) => s.kind === KIND.PISTOL);
  const rifles = allSpecs().filter((s) => s.kind === KIND.RIFLE);
  const slowestPistol = Math.min(...pistols.map((s) => s.moveScale));
  const fastestRifle = Math.max(...rifles.map((s) => s.moveScale));
  assert(slowestPistol >= fastestRifle,
    `slowest pistol ${slowestPistol} < fastest rifle ${fastestRifle}`);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
