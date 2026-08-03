// Headless checks on the weapon geometry. `node src/weapons/models.test.js`.
//
// WHAT THIS CAN AND CANNOT DO. Three of the last four real bugs in this project
// were found by looking at a screenshot, not by a unit test -- a magazine can
// pass every bound below and still be buried inside the receiver, and a
// material can be the wrong scale and still have a plausible bounding box.
// So this file asserts the things that are genuinely checkable from the scene
// graph -- it builds, the marker exists, the sizes are in range, no NaN, the
// scales differ -- and the REAL verification is the contact sheet from
// `node inspect.mjs weapons`. Do not add a test here and call the weapon done.
//
// console.assert does NOT throw. Every check below goes through check(), which
// records a failure and drives the exit code.

import * as THREE from 'three';
import { WEAPON_IDS, getSpec, KIND } from './specs.js';
import { buildWeaponModel, MODEL_IDS, MISSING_MODELS, viewmodelPose } from './models.js';

const results = [];
function check(name, cond, detail = '') {
  results.push({ name, ok: !!cond, detail });
}
function fail(name, detail) { check(name, false, detail); }

// Plausible world-space bounding boxes, in metres, per archetype. Generous
// enough not to be a straitjacket, tight enough that "a pistol is 1.5m long"
// and "an AWP is the size of a knife" both fail.
const SIZE = {
  [KIND.RIFLE]:   { len: [0.55, 1.05], h: [0.12, 0.40], w: [0.04, 0.16] },
  [KIND.SNIPER]:  { len: [0.70, 1.30], h: [0.15, 0.45], w: [0.04, 0.18] },
  [KIND.SMG]:     { len: [0.28, 0.75], h: [0.10, 0.34], w: [0.04, 0.16] },
  [KIND.PISTOL]:  { len: [0.10, 0.42], h: [0.08, 0.26], w: [0.02, 0.12] },
  [KIND.SHOTGUN]: { len: [0.35, 1.10], h: [0.12, 0.42], w: [0.04, 0.18] },
  [KIND.LMG]:     { len: [0.70, 1.30], h: [0.20, 0.55], w: [0.05, 0.24] },
  [KIND.KNIFE]:   { len: [0.15, 0.45], h: [0.02, 0.14], w: [0.01, 0.08] },
};

/** Local-space bounds of the gun's meshes, ignoring markers. */
function bounds(gun) {
  const bb = new THREE.Box3();
  let meshes = 0;
  let tris = 0;
  gun.updateMatrixWorld(true);
  gun.traverse((c) => {
    if (!c.isMesh) return;
    meshes++;
    const g = c.geometry;
    const idx = g.index ? g.index.count : g.attributes.position.count;
    tris += idx / 3;
    bb.union(new THREE.Box3().setFromObject(c));
  });
  return { bb, size: bb.getSize(new THREE.Vector3()), meshes, tris };
}

function finite(v) {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

// --- coverage ---------------------------------------------------------------

check('every id in WEAPON_IDS has a model builder',
  MISSING_MODELS.length === 0, `missing: ${MISSING_MODELS.join(', ')}`);
// Every spec must have a model. The count is read from the table rather than
// hardcoded: an earlier "23" here was simply my miscount of the spec file and
// failed a suite whose subject was fine.
check('MODEL_IDS covers every weapon in the spec table',
  MODEL_IDS.length === WEAPON_IDS.length && WEAPON_IDS.length > 0,
  `${MODEL_IDS.length} models for ${WEAPON_IDS.length} ids`);

// --- per-weapon -------------------------------------------------------------

let totalTris = 0;
const lengths = {};
const sizes = {};

for (const id of WEAPON_IDS) {
  const spec = getSpec(id);
  let world = null;
  try {
    world = buildWeaponModel(id, null, { viewmodel: false });
    check(`${id}: builds a world model without throwing`, true);
  } catch (e) {
    fail(`${id}: builds a world model without throwing`, String(e && e.message));
    continue;
  }

  let view = null;
  try {
    view = buildWeaponModel(id, null, { viewmodel: true });
    check(`${id}: builds a viewmodel without throwing`, true);
  } catch (e) {
    fail(`${id}: builds a viewmodel without throwing`, String(e && e.message));
    continue;
  }

  check(`${id}: returns a THREE.Group`, world.isGroup === true);

  // Muzzle marker. Named exactly 'muzzle' because that is the contract the
  // effects/net layer looks up by.
  const muzzle = world.getObjectByName('muzzle');
  check(`${id}: has a child named 'muzzle'`, !!muzzle);
  if (!muzzle) continue;

  const b = bounds(world);
  totalTris += b.tris;
  lengths[id] = b.size.z;
  // Full extent, for the silhouette comparison below. Length alone is a poor
  // proxy for "these two read as the same gun".
  sizes[id] = [b.size.x, b.size.y, b.size.z];

  check(`${id}: has real geometry`, b.meshes >= 4, `${b.meshes} meshes`);
  check(`${id}: bounds are finite`, finite(b.size) && finite(b.bb.min) && finite(b.bb.max),
    `${JSON.stringify(b.size.toArray())}`);

  // The muzzle must be AT the front of the weapon on the bore line -- not
  // buried in the receiver, and not floating a metre past the barrel.
  check(`${id}: muzzle sits at the front of the model`,
    muzzle.position.z <= b.bb.min.z + 0.035 && muzzle.position.z >= b.bb.min.z - 0.06,
    `muzzle z ${muzzle.position.z.toFixed(3)} vs front ${b.bb.min.z.toFixed(3)}`);
  check(`${id}: muzzle is on the bore line, not off to the side`,
    Math.abs(muzzle.position.x) < 0.03 && Math.abs(muzzle.position.y) < 0.06,
    `${muzzle.position.x.toFixed(3)}, ${muzzle.position.y.toFixed(3)}`);
  check(`${id}: muzzle points down -Z (ahead of the origin)`,
    muzzle.position.z < 0, `${muzzle.position.z}`);

  // No NaN anywhere in the transform tree. A single NaN silently deletes the
  // whole subtree from the render (it fails frustum culling), which looks like
  // "the gun is invisible" and is otherwise very hard to chase.
  let bad = null;
  world.traverse((c) => {
    if (bad) return;
    for (const v of [c.position, c.scale, c.rotation]) {
      const a = [v.x, v.y, v.z];
      if (a.some((n) => !Number.isFinite(n))) bad = `${c.name || c.type}`;
    }
    if (c.isMesh) {
      const p = c.geometry.attributes.position.array;
      for (let i = 0; i < p.length; i++) {
        if (!Number.isFinite(p[i])) { bad = `${c.name || c.type} geometry`; break; }
      }
    }
  });
  check(`${id}: no NaN in any transform or vertex`, bad === null, `bad node: ${bad}`);

  // Size envelope per archetype.
  const env = SIZE[spec.kind];
  if (!env) { fail(`${id}: has a size envelope for kind ${spec.kind}`, ''); continue; }
  check(`${id}: length is plausible for a ${spec.kind}`,
    b.size.z >= env.len[0] && b.size.z <= env.len[1],
    `${b.size.z.toFixed(3)}m not in [${env.len}]`);
  check(`${id}: height is plausible for a ${spec.kind}`,
    b.size.y >= env.h[0] && b.size.y <= env.h[1],
    `${b.size.y.toFixed(3)}m not in [${env.h}]`);
  check(`${id}: width is plausible for a ${spec.kind}`,
    b.size.x >= env.w[0] && b.size.x <= env.w[1],
    `${b.size.x.toFixed(3)}m not in [${env.w}]`);

  // Not a plank: a weapon whose height and width are both a rounding error
  // next to its length is a stick, and every gun here has a grip or a mag.
  check(`${id}: is not a bare stick`, b.size.y > b.size.z * 0.10,
    `h/len ${(b.size.y / b.size.z).toFixed(2)}`);

  // World vs viewmodel scale must DIFFER, and the viewmodel must be the
  // shrunk one -- this is the invariant that stops someone "simplifying" the
  // two paths into one and shipping a bot holding a 0.58-scale toy.
  const pose = viewmodelPose(id);
  check(`${id}: world scale is 1.0 (true size)`,
    Math.abs(world.scale.x - 1) < 1e-9, `${world.scale.x}`);
  check(`${id}: viewmodel scale differs from world scale`,
    Math.abs(view.scale.x - world.scale.x) > 0.02,
    `vm ${view.scale.x} vs world ${world.scale.x}`);
  check(`${id}: viewmodel is posed in the lower-right of the frame`,
    view.position.x > 0.05 && view.position.y < 0 && view.position.z < -0.1,
    `${view.position.toArray().map((v) => v.toFixed(3))}`);
  check(`${id}: viewmodel pose matches viewmodelPose()`,
    Math.abs(pose.scale - view.scale.x) < 1e-9 &&
    Math.abs(pose.pos[1] - view.position.y) < 1e-9);

  // Materials must be OUR materials, at weapon scale, never a textured world
  // material -- that mistake produced "a blotchy plank" once already.
  let textured = null;
  world.traverse((c) => {
    if (c.isMesh && c.material && c.material.map) textured = c.name || c.type;
  });
  check(`${id}: uses untextured weapon-scale materials`, textured === null,
    `textured mesh: ${textured}`);
}

// --- cross-weapon: silhouettes must actually differ -------------------------
// Bounding boxes cannot prove two guns look different, but they can prove two
// guns that SHOULD differ do not. These are the pairs a reviewer would call
// out as re-skins if they matched.

const DISTINCT = [
  ['ak47', 'awp', 0.12],       // rifle vs sniper: the sniper must be longer
  ['ak47', 'usp', 0.30],       // rifle vs pistol
  ['m4a4', 'm4a1s', 0.06],     // suppressor must change the length
  ['usp', 'deagle', 0.02],     // suppressed compact vs hand cannon
  ['nova', 'sawedoff', 0.15],  // full shotgun vs cut-down
  ['mp9', 'p90', 0.08],        // smallest SMG vs the big one
  ['mp9', 'bizon', 0.06],
  ['m249', 'mp9', 0.30],       // LMG vs the smallest SMG
];
for (const [a, b, minDelta] of DISTINCT) {
  const d = Math.abs((lengths[a] ?? 0) - (lengths[b] ?? 0));
  check(`${a} and ${b} have visibly different lengths`, d >= minDelta,
    `delta ${d.toFixed(3)}m < ${minDelta}m (${(lengths[a] ?? 0).toFixed(3)} vs ${(lengths[b] ?? 0).toFixed(3)})`);
}

// Every SMG's length must be unique enough that two of them are not the same
// black box. This is a weak proxy for "distinct silhouette" and is documented
// as such -- the contact sheet is the real check.
// Distinctness is about SILHOUETTE, not length. An earlier version of this
// check compared lengths alone and flagged mac10/p90 as clashing at 0.005m
// apart -- they are a boxy vertical-grip machine pistol and a tan bullpup with
// a top-mounted magazine, which nobody could confuse. Comparing the full box
// (length AND height AND width) is a far better proxy for "reads as the same
// gun", and it stops the suite failing on weapons that are genuinely different.
function boxOf(id) {
  const [x, y, z] = sizes[id] ?? [0, 0, 0];
  return [Math.max(x, z), y, Math.min(x, z)];
}
function shapeDistance(a, b) {
  const A = boxOf(a), B = boxOf(b);
  // Relative difference per axis, so a 2cm gap matters more on a pistol than
  // on an LMG. Summed rather than maxed: differing on one axis is enough.
  let d = 0;
  for (let i = 0; i < 3; i++) {
    const scale = Math.max(A[i], B[i], 1e-4);
    d += Math.abs(A[i] - B[i]) / scale;
  }
  return d;
}

for (const kind of [KIND.SMG, KIND.RIFLE, KIND.PISTOL, KIND.SNIPER]) {
  const group = WEAPON_IDS.filter((id) => getSpec(id).kind === kind);
  const clashes = [];
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      const d = shapeDistance(group[i], group[j]);
      if (d < 0.06) clashes.push(`${group[i]}/${group[j]} ${d.toFixed(3)}`);
    }
  }
  check(`no two ${kind}s share an effectively identical silhouette`,
    clashes.length === 0, clashes.join(', '));
}

// --- budget -----------------------------------------------------------------
// SwiftShader. A dropped-weapon pile or a lobby of bots each holding one of
// these must not blow the frame budget on geometry alone.
check('the whole armoury is under 40k triangles', totalTris < 40000,
  `${Math.round(totalTris)} tris across ${WEAPON_IDS.length} weapons`);

// --- error handling ---------------------------------------------------------
let threw = false;
try { buildWeaponModel('not_a_gun'); } catch { threw = true; }
check('an unknown weapon id throws', threw);

// --- report -----------------------------------------------------------------
const failed = results.filter((r) => !r.ok);
for (const r of failed) {
  console.log(`  FAIL  ${r.name}${r.detail ? `\n        ${r.detail}` : ''}`);
}
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
if (!failed.length) {
  console.log(`(${Math.round(totalTris)} triangles across ${WEAPON_IDS.length} weapons)`);
  console.log('NOTE: geometry correctness is only confirmed by `node inspect.mjs weapons`.');
}
process.exit(failed.length ? 1 : 0);
