import * as THREE from 'three';
import { WEAPON_IDS } from './specs.js';

// Procedural geometry for every weapon in the table.
//
// AXES, matching rifle.js buildViewmodel() exactly:
//   -Z is down the barrel (the direction the bullet leaves)
//   +X is the shooter's right, +Y is up
//   the origin sits at the FRONT OF THE RECEIVER, so a rifle straddles
//   z ~ -0.62 (muzzle) .. +0.30 (butt plate).
// Everything below is authored in real metres at that origin. The AK in
// rifle.js is the reference for scale and for how much detail is worth
// modelling; anything that reads at 0.58 scale in a 56-degree viewmodel
// camera is worth a box, anything smaller is not.
//
// MATERIALS ARE BUILT HERE, ON PURPOSE. The world's material set is authored
// at 1m texel scale for map geometry; applied to a 0.2m handguard the albedo
// tiles into a blotchy plank and the normal map reads as noise. This module
// takes a `materials` argument only so callers have a uniform signature -- it
// is deliberately ignored for surfacing. Untextured MeshStandardMaterial at
// the right colour beats a texture at the wrong scale every time.
//
// METALNESS is kept mid-range (0.3-0.5) rather than physically-correct 0.9:
// the viewmodel scene has no environment map, and a fully metallic PBR
// surface with nothing to reflect renders BLACK. Same trap rifle.js
// documents; do not "fix" these upward without adding an env map first.

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

/** One shared palette per module load. 23 weapons x 6 materials is waste. */
let _mats = null;

export function weaponMaterials() {
  if (_mats) return _mats;
  const std = (color, roughness, metalness) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness });
  return (_mats = {
    metal: std(0x3a3b41, 0.42, 0.35),      // parkerised steel, the default
    worn: std(0x55575e, 0.30, 0.45),       // rubbed-bright edges, small parts
    dark: std(0x24252a, 0.50, 0.30),       // blued steel, shadowed masses
    bore: std(0x1b1d21, 0.60, 0.25),       // barrels, suppressor tubes
    poly: std(0x201e1c, 0.55, 0.10),       // black polymer furniture
    polyTan: std(0x6f6047, 0.62, 0.05),    // FDE / tan polymer (FAMAS, P90)
    wood: std(0x7a4a20, 0.68, 0.00),       // AK laminate
    woodDark: std(0x633a17, 0.72, 0.00),   // lower furniture, shotgun stocks
    // Scope lens. Dark glass with a faint coating sheen -- an emissive lens
    // reads as a glowing blue plastic disc, which made every optic on the
    // arsenal sheet look like a toy. Keep the emissive low enough to suggest a
    // coating without lighting up.
    glass: new THREE.MeshStandardMaterial({
      color: 0x151f27, roughness: 0.08, metalness: 0.45,
      emissive: 0x0a1a26, emissiveIntensity: 0.12 }),
    brass: std(0xb08a34, 0.35, 0.60),      // exposed rounds on a belt
    blade: std(0xb9bec6, 0.18, 0.72),      // knife steel -- polished, not black
  });
}

// ---------------------------------------------------------------------------
// Part helpers
// ---------------------------------------------------------------------------
// Each takes a target Group plus explicit dimensions. They are shape
// vocabulary, not a parameterised universal gun: a `magazine()` that can be
// straight, curved, or a horizontal box is three silhouettes, and choosing
// between them per weapon is what stops everything looking like the same
// blob with different numbers.

/** Axis-aligned box. Returns the mesh so callers can rotate it. */
function box(g, w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  g.add(m);
  return m;
}

/**
 * Cylinder. Default axis is 'z' (down the barrel), because most tubes on a gun
 * point that way; 'y' stands it upright, 'x' lays it across.
 * Segment counts stay low -- this must run on SwiftShader.
 */
function cyl(g, rt, rb, h, mat, x, y, z, seg = 12, axis = 'z') {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  if (axis === 'z') m.rotation.x = Math.PI / 2;
  else if (axis === 'x') m.rotation.z = Math.PI / 2;
  m.position.set(x, y, z);
  g.add(m);
  return m;
}

/**
 * Barrel from the receiver face forward, with an optional muzzle device.
 * `style`: 'plain' | 'brake' | 'flash' (birdcage) | 'crown' (thick sniper)
 * Returns the z of the true muzzle -- that is what the 'muzzle' marker uses,
 * and returning it rather than recomputing it at the call site is what keeps
 * the marker on the actual end of the barrel when a length changes.
 */
function barrel(g, m, { z0, len, r = 0.0105, y = 0, style = 'plain' }) {
  const zEnd = z0 - len;
  cyl(g, r, r, len, m.bore, 0, y, z0 - len / 2, 12);
  if (style === 'brake') {
    cyl(g, r * 1.65, r * 1.45, 0.050, m.worn, 0, y, zEnd - 0.022, 12);
    cyl(g, r * 0.8, r * 0.8, 0.018, m.bore, 0, y, zEnd - 0.040, 10);
    return zEnd - 0.050;
  }
  if (style === 'flash') {
    // Birdcage: a slotted cone. The slots are three thin dark boxes rather
    // than real cuts -- at 2cm they read identically and cost nothing.
    cyl(g, r * 1.5, r * 1.25, 0.042, m.dark, 0, y, zEnd - 0.020, 10);
    for (let i = 0; i < 3; i++) {
      box(g, r * 3.1, 0.004, 0.026, m.bore, 0, y, zEnd - 0.020)
        .rotation.z = (i / 3) * Math.PI;
    }
    return zEnd - 0.042;
  }
  if (style === 'crown') {
    cyl(g, r * 1.3, r * 1.3, 0.030, m.worn, 0, y, zEnd - 0.014, 12);
    return zEnd - 0.030;
  }
  return zEnd;
}

/**
 * A suppressor: a fat tube over the bore. The one part that changes a
 * silhouette more than anything else its size, which is why the M4A1-S, USP-S
 * and MP5-SD all get one and all read as different guns because of it.
 */
function suppressor(g, m, { z0, len, r = 0.021, y = 0 }) {
  cyl(g, r, r, len, m.dark, 0, y, z0 - len / 2, 14);
  // End caps slightly proud, so the tube has ends instead of fading out.
  cyl(g, r * 1.06, r * 1.06, 0.010, m.metal, 0, y, z0 - 0.005, 14);
  cyl(g, r * 1.06, r * 1.06, 0.010, m.metal, 0, y, z0 - len + 0.005, 14);
  // Two shallow grooves so the tube is not a featureless sausage.
  for (let i = 1; i <= 2; i++) {
    cyl(g, r * 0.94, r * 0.94, 0.012, m.bore, 0, y, z0 - (len * i) / 3, 14);
  }
  return z0 - len;
}

/**
 * Box magazine. `curve` in radians per segment: 0 is a straight STANAG-style
 * stick, -0.20 is the AK's forward banana, +0.12 leans it back.
 * Walks a point down the mag's centreline turning by `curve` each step --
 * accumulating the turn is what actually produces a curve, whereas setting
 * absolute rotations on segments at fixed offsets just fans them out around a
 * common origin and reads as a straight box (a bug rifle.js paid for once).
 */
function magazine(g, m, {
  x = 0, y, z, w = 0.038, d = 0.072, segs = 4, seg = 0.048,
  lean = -0.10, curve = -0.20, mat = null, plate = true,
}) {
  const mm = mat || m.poly;
  const parts = [];
  let my = y, mz = z, ma = lean;
  for (let i = 0; i < segs; i++) {
    const sw = w - i * 0.001;
    const b = box(g, sw, seg * 1.06, d - i * 0.002, mm, x, my, mz);
    b.rotation.x = ma;
    parts.push(b);
    // Pressed reinforcement rib on the leading face -- three pixels of edge
    // that stop a long magazine reading as a featureless slab.
    const r = box(g, sw * 0.88, 0.006, 0.008, m.metal, x, my, mz - d / 2 + 0.002);
    r.rotation.x = ma;
    parts.push(r);
    my -= Math.cos(ma) * seg;
    mz += Math.sin(ma) * seg;
    ma += curve;
  }
  if (plate) {
    const p = box(g, w * 1.05, 0.010, d, m.worn, x, my + 0.020, mz);
    p.rotation.x = ma - curve;
    parts.push(p);
  }
  return { parts, endY: my, endZ: mz };
}

/**
 * Drum / helical magazine: a lying cylinder. P90 and Bizon both carry their
 * rounds horizontally and it is the whole reason they look like nothing else.
 */
function tubeMag(g, m, { y, z, len, r = 0.030, mat = null, axis = 'z' }) {
  const mm = mat || m.poly;
  const t = cyl(g, r, r, len, mm, 0, y, z, 14, axis);
  // Rib bands along the tube, so the length reads.
  for (let i = 0; i < 3; i++) {
    const off = (i - 1) * (len / 3.4);
    cyl(g, r * 1.05, r * 1.05, 0.008, m.metal,
      0, y, axis === 'z' ? z + off : z, 14, axis)
      .position[axis === 'z' ? 'z' : 'y'] += 0;
  }
  return t;
}

/**
 * Shoulder stock. `style`:
 *  'wood'      tapered wrist swelling to a butt (AK, Nova, G3)
 *  'poly'      squared-off polymer tube (M4, Galil)
 *  'skeleton'  two thin rails with a gap you can see through (Scout, Tec-9 none)
 *  'wire'      folding wire loop (MAC-10, Mag-7)
 *  'sniper'    heavy thumbhole with a cheek riser (AWP, SCAR-20)
 */
function stock(g, m, { z0, len, y = -0.02, style = 'poly', mat = null }) {
  const mm = mat || (style === 'wood' ? m.wood : m.poly);
  const zc = z0 + len / 2;
  if (style === 'wood') {
    const wrist = new THREE.Mesh(
      new THREE.CylinderGeometry(0.019, 0.026, len * 0.60, 4), mm);
    wrist.rotation.set(Math.PI / 2 - 0.10, Math.PI / 4, 0);
    wrist.position.set(0, y - 0.008, z0 + len * 0.30);
    g.add(wrist);
    const butt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.026, 0.031, len * 0.42, 4), mm);
    butt.rotation.set(Math.PI / 2 - 0.10, Math.PI / 4, 0);
    butt.position.set(0, y - 0.026, z0 + len * 0.78);
    g.add(butt);
    box(g, 0.034, 0.058, 0.012, m.poly, 0, y - 0.032, z0 + len);
    return;
  }
  if (style === 'poly') {
    box(g, 0.030, 0.034, len * 0.55, mm, 0, y, z0 + len * 0.28);   // buffer tube
    box(g, 0.038, 0.052, len * 0.42, mm, 0, y - 0.010, z0 + len * 0.78);
    box(g, 0.040, 0.062, 0.012, m.dark, 0, y - 0.012, z0 + len);   // butt pad
    box(g, 0.026, 0.014, len * 0.5, mm, 0, y + 0.026, z0 + len * 0.5); // comb
    return;
  }
  if (style === 'skeleton') {
    // Two rails with real daylight between them -- the whole point of the
    // silhouette, so keep the gap wider than the rails are thick.
    for (const dy of [0.030, -0.030]) {
      box(g, 0.020, 0.011, len * 0.82, mm, 0, y + dy, z0 + len * 0.42);
    }
    box(g, 0.028, 0.090, 0.014, m.dark, 0, y, z0 + len * 0.88);    // butt plate
    box(g, 0.022, 0.048, 0.020, mm, 0, y, z0 + 0.010);             // root block
    return;
  }
  if (style === 'wire') {
    // Folding wire: two thin bars angling out to a narrow shoulder bar.
    for (const dx of [0.026, -0.026]) {
      const b = box(g, 0.008, 0.008, len * 0.92, m.worn, dx * 0.55, y, zc);
      b.rotation.y = -Math.sign(dx) * 0.10;
    }
    box(g, 0.070, 0.010, 0.012, m.worn, 0, y, z0 + len);
    return;
  }
  if (style === 'sniper') {
    box(g, 0.042, 0.070, len * 0.55, mm, 0, y - 0.012, z0 + len * 0.28);
    box(g, 0.040, 0.048, len * 0.44, mm, 0, y - 0.020, z0 + len * 0.76);
    box(g, 0.034, 0.026, len * 0.42, mm, 0, y + 0.040, z0 + len * 0.62); // cheek riser
    box(g, 0.046, 0.086, 0.016, m.dark, 0, y - 0.014, z0 + len);         // recoil pad
    // Thumbhole: the hole is implied by a bridge above a gap. Cheaper than CSG
    // and at this size it reads the same.
    box(g, 0.024, 0.012, 0.060, mm, 0, y + 0.014, z0 + len * 0.34);
    return;
  }
}

/** Pistol grip plus a trigger guard you can see daylight through. */
function grip(g, m, {
  x = 0, y, z, h = 0.100, tilt = 0.34, w = 0.030, d = 0.042, mat = null,
}) {
  const mm = mat || m.poly;
  const b = box(g, w, h, d, mm, x, y, z);
  b.rotation.x = tilt;
  box(g, w * 1.10, 0.012, d * 1.10, mm, x,
    y - h * 0.46 * Math.cos(tilt), z + h * 0.46 * Math.sin(tilt)).rotation.x = tilt;
  return b;
}

function triggerGuard(g, m, { y, z, len = 0.062 }) {
  box(g, 0.022, 0.006, len, m.metal, 0, y, z);                    // bottom bar
  box(g, 0.022, 0.022, 0.006, m.metal, 0, y + 0.010, z - len / 2); // front strap
  box(g, 0.022, 0.020, 0.006, m.metal, 0, y + 0.009, z + len / 2); // rear strap
  box(g, 0.007, 0.020, 0.009, m.worn, 0, y + 0.008, z - 0.006);   // blade
}

/**
 * Telescopic sight on a mount. `big` gives the AWP/SCAR its heavy glass; the
 * small version is the AUG/SG in-line optic. The lens caps are what make it
 * read as a scope and not a pipe, so they are not optional.
 */
function scope(g, m, { z, y, len = 0.20, r = 0.023, mount = true, big = false }) {
  const R = big ? r * 1.25 : r;
  cyl(g, R, R, len, m.dark, 0, y, z, 14);
  cyl(g, R * 1.45, R * 1.20, 0.050, m.dark, 0, y, z - len * 0.34, 14); // objective bell
  cyl(g, R * 1.30, R * 1.15, 0.040, m.dark, 0, y, z + len * 0.40, 14); // ocular
  cyl(g, R * 1.36, R * 1.36, 0.006, m.glass, 0, y, z - len * 0.34 - 0.026, 14);
  cyl(g, R * 1.20, R * 1.20, 0.006, m.glass, 0, y, z + len * 0.40 + 0.020, 14);
  cyl(g, R * 0.55, R * 0.55, 0.026, m.metal, 0, y + R * 1.1, z, 8, 'y'); // turret
  if (mount) {
    for (const dz of [-len * 0.22, len * 0.22]) {
      box(g, 0.026, 0.030, 0.016, m.metal, 0, y - R - 0.012, z + dz);
    }
  }
}

/** Flat-top rail: a row of ribs. Cheap, and it says "modern" instantly. */
function rail(g, m, { z0, len, y, w = 0.026 }) {
  box(g, w, 0.008, len, m.dark, 0, y, z0 - len / 2);
  const n = Math.max(3, Math.round(len / 0.022));
  for (let i = 0; i < n; i++) {
    box(g, w * 0.92, 0.006, 0.007, m.metal, 0, y + 0.006,
      z0 - 0.010 - (i * (len - 0.014)) / (n - 1));
  }
}

/** Iron sights: a front post between ears, and a rear notch block. */
function ironSights(g, m, { frontZ, rearZ, y, ears = true }) {
  box(g, 0.026, 0.034, 0.024, m.metal, 0, y + 0.014, frontZ);
  cyl(g, 0.0035, 0.0035, 0.024, m.worn, 0, y + 0.040, frontZ, 8, 'y');
  if (ears) {
    for (const dx of [-0.011, 0.011]) {
      box(g, 0.007, 0.028, 0.012, m.metal, dx, y + 0.042, frontZ);
    }
  }
  box(g, 0.040, 0.016, 0.026, m.metal, 0, y + 0.030, rearZ);
  box(g, 0.010, 0.012, 0.007, m.poly, 0, y + 0.042, rearZ);
}

/** Slide-topped pistol body: the frame, the slide, and the slide serrations. */
function pistolSlide(g, m, {
  zFront, zBack, y = 0, w = 0.030, h = 0.038, mat = null, serrations = 5,
}) {
  const mm = mat || m.metal;
  const len = zBack - zFront;
  box(g, w, h, len, mm, 0, y, (zFront + zBack) / 2);
  // Serrations at the rear: vertical dark slots. This is the single detail
  // that makes a box read as a pistol slide.
  for (let i = 0; i < serrations; i++) {
    box(g, w * 1.02, h * 0.62, 0.004, m.dark, 0, y, zBack - 0.012 - i * 0.010);
  }
  // Ejection port, right side, and the front sight blade.
  box(g, w * 0.55, h * 0.34, 0.030, m.dark, w * 0.26, y + h * 0.14, zFront + len * 0.32);
  box(g, 0.006, 0.010, 0.008, m.worn, 0, y + h * 0.55, zFront + 0.012);
  box(g, 0.020, 0.010, 0.010, m.worn, 0, y + h * 0.55, zBack - 0.010);
}

/** Under-barrel foregrip -- the vertical kind, on SMGs and LMGs. */
function foregrip(g, m, { z, y, h = 0.070, mat = null }) {
  const b = box(g, 0.026, h, 0.032, mat || m.poly, 0, y - h / 2, z);
  b.rotation.x = 0.10;
  return b;
}

/** Bipod: two folded-back legs. Only the LMGs and heavy snipers get one. */
function bipod(g, m, { z, y }) {
  for (const dx of [-1, 1]) {
    const leg = box(g, 0.008, 0.008, 0.130, m.worn, dx * 0.018, y - 0.020, z + 0.050);
    leg.rotation.set(0.45, dx * 0.12, 0);
  }
  box(g, 0.040, 0.016, 0.024, m.metal, 0, y - 0.006, z);
}

/** Ventilated handguard: a tube with slot shadows cut down its flanks. */
function handguard(g, m, {
  z0, len, r = 0.026, y = 0, mat = null, slots = 4, round = true,
}) {
  const mm = mat || m.poly;
  const zc = z0 - len / 2;
  if (round) cyl(g, r, r, len, mm, 0, y, zc, 12);
  else box(g, r * 1.8, r * 1.7, len, mm, 0, y, zc);
  for (let i = 0; i < slots; i++) {
    const z = z0 - 0.020 - (i * (len - 0.035)) / Math.max(1, slots - 1);
    box(g, r * 2.2, 0.010, 0.016, m.bore, 0, y + r * 0.45, z);
    box(g, r * 2.2, 0.010, 0.016, m.bore, 0, y - r * 0.45, z);
  }
}

/** Belt of exposed rounds feeding into a receiver. Pure LMG cue. */
function ammoBelt(g, m, { x, y, z, n = 6 }) {
  for (let i = 0; i < n; i++) {
    const b = cyl(g, 0.0055, 0.0045, 0.030, m.brass,
      x, y - i * 0.011, z + i * 0.004, 6, 'x');
    b.rotation.z = Math.PI / 2 + i * 0.05;
  }
  box(g, 0.006, n * 0.011, 0.020, m.dark, x, y - (n * 0.011) / 2, z + 0.010);
}

// ---------------------------------------------------------------------------
// Per-weapon builders
// ---------------------------------------------------------------------------
// Each returns { muzzleZ, muzzleY } after populating the group. Keeping the
// muzzle position as a RETURN VALUE rather than a literal at the call site is
// what guarantees the 'muzzle' marker follows a barrel length when it changes.

/** Shared AK-family receiver: shallow box, domed dust cover, magwell lip. */
function akReceiver(g, m, { front = -0.212, back = 0.072 } = {}) {
  const len = back - front;
  box(g, 0.058, 0.046, len, m.metal, 0, 0.004, (front + back) / 2);
  box(g, 0.064, 0.014, 0.115, m.metal, 0, -0.023, front + 0.097);
  cyl(g, 0.031, 0.031, len * 0.82, m.metal, 0, 0.027, (front + back) / 2 - 0.018, 14)
    .scale.set(1.0, 1.0, 0.38);
  box(g, 0.007, 0.046, 0.014, m.worn, 0.031, 0.006, back - 0.110);  // selector
  box(g, 0.018, 0.010, 0.046, m.worn, 0.036, 0.022, front + 0.077); // charging handle
}

/** AR-15 family receiver: flat-sided upper + lower, carry-handle-less flat top. */
function arReceiver(g, m, { front = -0.190, back = 0.080 } = {}) {
  const len = back - front;
  box(g, 0.042, 0.040, len, m.dark, 0, 0.010, (front + back) / 2);       // upper
  box(g, 0.038, 0.048, len * 0.62, m.dark, 0, -0.026, front + len * 0.36); // lower/magwell
  box(g, 0.048, 0.020, 0.052, m.dark, 0.004, 0.006, back - 0.040);       // forward assist blob
  cyl(g, 0.014, 0.014, 0.040, m.metal, 0.020, 0.018, back - 0.030, 8, 'x'); // brass deflector
  box(g, 0.010, 0.012, 0.030, m.worn, 0, 0.032, back - 0.008);           // charging latch
}

const BUILDERS = {
  // ---- Rifles ------------------------------------------------------------

  // The reference weapon. Deliberately a close match to rifle.js's viewmodel:
  // wood furniture, banana mag, slant brake, gas tube over the handguard.
  ak47(g, m) {
    akReceiver(g, m);
    magazine(g, m, { y: -0.052, z: -0.130, curve: -0.20, lean: -0.12 });
    box(g, 0.048, 0.034, 0.155, m.wood, 0, 0.036, -0.300);
    box(g, 0.052, 0.046, 0.170, m.woodDark, 0, -0.026, -0.292).rotation.x = -0.03;
    for (let i = 0; i < 3; i++) box(g, 0.050, 0.012, 0.022, m.poly, 0, 0.040, -0.262 - i * 0.040);
    cyl(g, 0.0125, 0.0125, 0.150, m.metal, 0, 0.055, -0.300, 12);       // gas tube
    box(g, 0.030, 0.048, 0.034, m.metal, 0, 0.022, -0.392);             // gas block
    ironSights(g, m, { frontZ: -0.545, rearZ: -0.222, y: 0.008 });
    grip(g, m, { y: -0.076, z: 0.058 });
    triggerGuard(g, m, { y: -0.048, z: 0.016 });
    stock(g, m, { z0: 0.080, len: 0.240, style: 'wood', mat: m.wood });
    return { muzzleZ: barrel(g, m, { z0: -0.380, len: 0.232, style: 'brake' }) };
  },

  // M4A4: black polymer, straight STANAG mag, long round handguard, carry-
  // handle-free flat top with a birdcage. Reads apart from the AK by the
  // straight magazine and the tube stock.
  m4a4(g, m) {
    arReceiver(g, m);
    rail(g, m, { z0: 0.070, len: 0.240, y: 0.032 });
    magazine(g, m, { y: -0.062, z: -0.120, w: 0.032, d: 0.058, curve: -0.05, lean: -0.05 });
    handguard(g, m, { z0: -0.190, len: 0.230, r: 0.030, y: 0.008, slots: 5 });
    grip(g, m, { y: -0.078, z: 0.056, tilt: 0.30 });
    triggerGuard(g, m, { y: -0.050, z: 0.014 });
    stock(g, m, { z0: 0.082, len: 0.230, style: 'poly' });
    ironSights(g, m, { frontZ: -0.430, rearZ: 0.040, y: 0.030, ears: true });
    return { muzzleZ: barrel(g, m, { z0: -0.420, len: 0.165, r: 0.0095, y: 0.008, style: 'flash' }) };
  },

  // M4A1-S: the M4 minus the birdcage, plus a fat suppressor that adds 17cm of
  // tube. The one change that makes the two M4s instantly separable.
  m4a1s(g, m) {
    arReceiver(g, m);
    rail(g, m, { z0: 0.070, len: 0.240, y: 0.032 });
    magazine(g, m, { y: -0.062, z: -0.120, w: 0.032, d: 0.058, curve: -0.05, lean: -0.05 });
    handguard(g, m, { z0: -0.190, len: 0.215, r: 0.029, y: 0.008, slots: 4 });
    grip(g, m, { y: -0.078, z: 0.056, tilt: 0.30 });
    triggerGuard(g, m, { y: -0.050, z: 0.014 });
    stock(g, m, { z0: 0.082, len: 0.230, style: 'poly' });
    barrel(g, m, { z0: -0.405, len: 0.055, r: 0.0095, y: 0.008 });
    return { muzzleZ: suppressor(g, m, { z0: -0.460, len: 0.185, r: 0.022, y: 0.008 }), muzzleY: 0.008 };
  },

  // Galil: AK bones with a black polymer body, a straighter 35-round mag and a
  // distinctive folding stock. Sits visually between the AK and the M4.
  galil(g, m) {
    akReceiver(g, m, { front: -0.205, back: 0.068 });
    magazine(g, m, { y: -0.054, z: -0.124, segs: 5, seg: 0.044, curve: -0.13, lean: -0.10 });
    handguard(g, m, { z0: -0.200, len: 0.175, r: 0.028, y: 0.004, slots: 3, round: false });
    box(g, 0.030, 0.044, 0.030, m.metal, 0, 0.022, -0.382);         // gas block
    grip(g, m, { y: -0.076, z: 0.054 });
    triggerGuard(g, m, { y: -0.048, z: 0.014 });
    stock(g, m, { z0: 0.076, len: 0.210, style: 'skeleton' });
    ironSights(g, m, { frontZ: -0.420, rearZ: -0.214, y: 0.010 });
    // Carry handle -- Galil-specific, and a good silhouette tell from above.
    box(g, 0.012, 0.030, 0.070, m.metal, 0, 0.060, -0.100);
    return { muzzleZ: barrel(g, m, { z0: -0.372, len: 0.170, style: 'flash' }) };
  },

  // FAMAS: bullpup. Magazine BEHIND the grip, carry-handle sight bridge running
  // the length of the gun, no protruding stock. Nothing else looks like it.
  famas(g, m) {
    box(g, 0.046, 0.070, 0.430, m.polyTan, 0, -0.004, -0.030);      // one-piece shell
    box(g, 0.040, 0.040, 0.120, m.polyTan, 0, -0.040, 0.140);       // butt swell
    box(g, 0.048, 0.070, 0.014, m.dark, 0, -0.020, 0.198);          // butt pad
    // Carry handle: a long bridge on two pylons -- the FAMAS's whole face.
    box(g, 0.020, 0.024, 0.300, m.polyTan, 0, 0.062, -0.090);
    box(g, 0.020, 0.036, 0.024, m.polyTan, 0, 0.038, -0.226);
    box(g, 0.020, 0.036, 0.024, m.polyTan, 0, 0.038, 0.046);
    box(g, 0.014, 0.014, 0.020, m.worn, 0, 0.052, -0.230);          // front post
    magazine(g, m, { y: -0.070, z: 0.078, w: 0.030, d: 0.052, segs: 3,
      seg: 0.046, curve: 0.0, lean: 0.06 });                        // behind the grip
    grip(g, m, { y: -0.070, z: -0.070, h: 0.092, tilt: 0.22, mat: m.polyTan });
    triggerGuard(g, m, { y: -0.044, z: -0.108 });
    foregrip(g, m, { z: -0.220, y: -0.036, h: 0.050, mat: m.polyTan });
    box(g, 0.028, 0.030, 0.090, m.polyTan, 0, -0.036, -0.212);      // fore-end
    return { muzzleZ: barrel(g, m, { z0: -0.244, len: 0.150, r: 0.0090, style: 'flash' }) };
  },

  // SG 553: AK-ish mass, but scoped, black, with a side-folding stock and a
  // long tri-rail fore-end. The scope is what tells it from the Galil.
  sg553(g, m) {
    akReceiver(g, m, { front: -0.200, back: 0.076 });
    magazine(g, m, { y: -0.056, z: -0.122, curve: -0.14, lean: -0.10 });
    handguard(g, m, { z0: -0.194, len: 0.190, r: 0.029, y: 0.006, slots: 4, round: false });
    grip(g, m, { y: -0.078, z: 0.058 });
    triggerGuard(g, m, { y: -0.048, z: 0.016 });
    stock(g, m, { z0: 0.084, len: 0.215, style: 'poly' });
    scope(g, m, { z: -0.060, y: 0.078, len: 0.175, r: 0.021 });
    return { muzzleZ: barrel(g, m, { z0: -0.386, len: 0.185, style: 'flash' }) };
  },

  // AUG: bullpup like the FAMAS but with a fat in-line optic instead of a
  // carry handle, and a folding vertical foregrip well forward.
  aug(g, m) {
    box(g, 0.048, 0.076, 0.420, m.polyTan, 0, -0.006, -0.020);      // shell
    box(g, 0.044, 0.058, 0.110, m.polyTan, 0, -0.030, 0.150);
    box(g, 0.050, 0.078, 0.014, m.dark, 0, -0.018, 0.208);
    scope(g, m, { z: -0.140, y: 0.070, len: 0.200, r: 0.026, big: true, mount: false });
    box(g, 0.034, 0.030, 0.230, m.polyTan, 0, 0.042, -0.120);       // optic housing
    magazine(g, m, { y: -0.072, z: 0.070, w: 0.032, d: 0.056, segs: 3,
      seg: 0.048, curve: 0.02, lean: 0.04 });
    grip(g, m, { y: -0.072, z: -0.084, h: 0.094, tilt: 0.24, mat: m.polyTan });
    triggerGuard(g, m, { y: -0.044, z: -0.122 });
    foregrip(g, m, { z: -0.250, y: -0.040, h: 0.084, mat: m.polyTan });
    return { muzzleZ: barrel(g, m, { z0: -0.230, len: 0.175, r: 0.0095, style: 'flash' }) };
  },

  // ---- Snipers -----------------------------------------------------------

  // AWP: the longest, heaviest silhouette in the game. Huge scope, thick
  // fluted barrel, bolt handle out the right, thumbhole stock, bipod.
  awp(g, m) {
    box(g, 0.048, 0.056, 0.300, m.dark, 0, 0.006, -0.060);          // receiver
    box(g, 0.056, 0.040, 0.360, m.poly, 0, -0.040, -0.130);         // stock fore-end
    magazine(g, m, { y: -0.058, z: -0.100, w: 0.034, d: 0.062, segs: 2,
      seg: 0.040, curve: -0.02, lean: -0.02 });
    // Bolt: a handle sticking out the right, angled back. Unique to bolt guns.
    cyl(g, 0.008, 0.008, 0.055, m.worn, 0.040, 0.022, 0.010, 8, 'x');
    cyl(g, 0.012, 0.012, 0.014, m.worn, 0.068, 0.022, 0.010, 8, 'x');
    scope(g, m, { z: -0.090, y: 0.078, len: 0.290, r: 0.026, big: true });
    grip(g, m, { y: -0.082, z: 0.070, h: 0.104, tilt: 0.30 });
    triggerGuard(g, m, { y: -0.052, z: 0.026 });
    stock(g, m, { z0: 0.090, len: 0.280, style: 'sniper' });
    bipod(g, m, { z: -0.430, y: -0.052 });
    // Fluted heavy barrel: bigger radius than any rifle here.
    return { muzzleZ: barrel(g, m, { z0: -0.300, len: 0.400, r: 0.0145, style: 'crown' }) };
  },

  // SSG 08 (Scout): the AWP's light cousin. Shorter, thinner barrel, skeleton
  // stock with visible daylight through it, smaller scope, no bipod.
  ssg08(g, m) {
    box(g, 0.042, 0.048, 0.260, m.dark, 0, 0.004, -0.055);
    box(g, 0.046, 0.034, 0.240, m.poly, 0, -0.034, -0.130);
    magazine(g, m, { y: -0.052, z: -0.095, w: 0.030, d: 0.056, segs: 2,
      seg: 0.036, curve: 0.0, lean: 0.0 });
    cyl(g, 0.007, 0.007, 0.048, m.worn, 0.036, 0.018, 0.006, 8, 'x');
    scope(g, m, { z: -0.080, y: 0.070, len: 0.215, r: 0.021 });
    grip(g, m, { y: -0.078, z: 0.062, h: 0.096 });
    triggerGuard(g, m, { y: -0.048, z: 0.020 });
    stock(g, m, { z0: 0.078, len: 0.250, style: 'skeleton' });
    return { muzzleZ: barrel(g, m, { z0: -0.264, len: 0.280, r: 0.0105, style: 'crown' }) };
  },

  // SCAR-20: semi-auto DMR. Boxy modern receiver, long top rail, big mag,
  // adjustable stock with a cheek riser, bipod. Reads heavier than the AWP's
  // bolt lines because of the rail and the 20-round mag.
  scar20(g, m) {
    box(g, 0.050, 0.062, 0.330, m.dark, 0, 0.008, -0.070);
    rail(g, m, { z0: 0.090, len: 0.330, y: 0.044, w: 0.030 });
    handguard(g, m, { z0: -0.240, len: 0.230, r: 0.030, y: 0.000, slots: 5, round: false });
    magazine(g, m, { y: -0.070, z: -0.130, w: 0.036, d: 0.066, segs: 4,
      seg: 0.046, curve: -0.06, lean: -0.06 });
    scope(g, m, { z: -0.080, y: 0.098, len: 0.250, r: 0.024, big: true });
    grip(g, m, { y: -0.086, z: 0.070, h: 0.104, tilt: 0.28 });
    triggerGuard(g, m, { y: -0.054, z: 0.026 });
    stock(g, m, { z0: 0.100, len: 0.260, style: 'sniper' });
    bipod(g, m, { z: -0.400, y: -0.048 });
    return { muzzleZ: barrel(g, m, { z0: -0.470, len: 0.170, r: 0.0115, style: 'flash' }) };
  },

  // G3SG1: the T-side DMR. Wood-ish furniture, a huge distinctive charging
  // handle tube running up the left of the barrel, and a long straight mag.
  g3sg1(g, m) {
    box(g, 0.048, 0.058, 0.320, m.metal, 0, 0.006, -0.070);
    // Cocking tube: the G3's signature -- a full-length tube above the barrel
    // ending in a handle that sticks out sideways.
    cyl(g, 0.016, 0.016, 0.290, m.metal, 0, 0.048, -0.290, 12);
    cyl(g, 0.008, 0.008, 0.045, m.worn, -0.032, 0.048, -0.400, 8, 'x');
    handguard(g, m, { z0: -0.240, len: 0.200, r: 0.028, y: -0.006, slots: 4 });
    magazine(g, m, { y: -0.068, z: -0.126, w: 0.034, d: 0.064, segs: 4,
      seg: 0.048, curve: -0.04, lean: -0.04 });
    scope(g, m, { z: -0.070, y: 0.086, len: 0.240, r: 0.023, big: true });
    grip(g, m, { y: -0.084, z: 0.068, h: 0.100 });
    triggerGuard(g, m, { y: -0.052, z: 0.024 });
    stock(g, m, { z0: 0.096, len: 0.250, style: 'wood', mat: m.woodDark });
    return { muzzleZ: barrel(g, m, { z0: -0.450, len: 0.180, r: 0.0110, style: 'flash' }) };
  },

  // ---- SMGs --------------------------------------------------------------
  // The hard archetype: six small black boxes. Every one gets one dominant,
  // non-negotiable silhouette feature so they are separable at a glance.

  // MP9: tiny. Short barrel, mag IN the grip, top rail, folding stock.
  mp9(g, m) {
    box(g, 0.040, 0.052, 0.190, m.poly, 0, 0.004, -0.040);
    rail(g, m, { z0: 0.040, len: 0.140, y: 0.034, w: 0.024 });
    // Mag through the pistol grip -- the MP9's defining proportion.
    magazine(g, m, { y: -0.072, z: 0.028, w: 0.028, d: 0.040, segs: 3,
      seg: 0.040, curve: -0.02, lean: 0.30 });
    grip(g, m, { y: -0.048, z: 0.030, h: 0.070, tilt: 0.30, w: 0.036, d: 0.048 });
    triggerGuard(g, m, { y: -0.040, z: -0.016, len: 0.050 });
    stock(g, m, { z0: 0.056, len: 0.130, style: 'wire', y: 0.010 });
    box(g, 0.030, 0.026, 0.070, m.poly, 0, -0.024, -0.150);         // fore-end
    return { muzzleZ: barrel(g, m, { z0: -0.135, len: 0.075, r: 0.0080 }) };
  },

  // MAC-10: a square steel box with the mag in the grip, a stubby barrel and a
  // wire stock. The boxiest thing in the game -- that IS the silhouette.
  mac10(g, m) {
    box(g, 0.048, 0.070, 0.175, m.metal, 0, 0.006, -0.020);         // slab receiver
    box(g, 0.052, 0.012, 0.175, m.dark, 0, 0.042, -0.020);          // top plate
    cyl(g, 0.012, 0.012, 0.020, m.worn, 0, 0.046, -0.020, 8, 'y');  // top cocking knob
    magazine(g, m, { y: -0.080, z: 0.010, w: 0.030, d: 0.044, segs: 4,
      seg: 0.044, curve: 0.0, lean: 0.0 });
    grip(g, m, { y: -0.050, z: 0.010, h: 0.056, tilt: 0.0, w: 0.042, d: 0.056 });
    triggerGuard(g, m, { y: -0.042, z: -0.038, len: 0.048 });
    stock(g, m, { z0: 0.070, len: 0.150, style: 'wire', y: 0.006 });
    box(g, 0.020, 0.020, 0.030, m.metal, 0, 0.000, -0.120);         // barrel nut
    return { muzzleZ: barrel(g, m, { z0: -0.132, len: 0.070, r: 0.0090 }) };
  },

  // MP5-SD: the integrally-suppressed one. A fat tube runs most of the gun's
  // length, with the classic curved 30-round mag and a slim receiver.
  mp5sd(g, m) {
    box(g, 0.040, 0.048, 0.230, m.dark, 0, 0.006, -0.055);
    // Integral suppressor: fat, long, starts almost at the receiver.
    const mz = suppressor(g, m, { z0: -0.170, len: 0.240, r: 0.024, y: 0.006 });
    box(g, 0.028, 0.020, 0.060, m.dark, 0, 0.034, -0.190);          // hooded front sight
    cyl(g, 0.016, 0.016, 0.030, m.dark, 0, 0.032, -0.060, 10);      // rear drum sight
    magazine(g, m, { y: -0.062, z: -0.100, w: 0.028, d: 0.052, segs: 4,
      seg: 0.046, curve: -0.09, lean: -0.06 });
    grip(g, m, { y: -0.072, z: 0.050, h: 0.088, tilt: 0.30 });
    triggerGuard(g, m, { y: -0.046, z: 0.012, len: 0.054 });
    stock(g, m, { z0: 0.070, len: 0.190, style: 'poly' });
    cyl(g, 0.009, 0.009, 0.040, m.worn, -0.028, 0.030, -0.150, 8, 'x'); // charging handle
    return { muzzleZ: mz, muzzleY: 0.006 };
  },

  // UMP-45: chunky polymer, straight fat .45 mag, folding stock, short barrel
  // poking out of a squared fore-end. Bulkier than the MP5, no suppressor.
  ump45(g, m) {
    box(g, 0.046, 0.056, 0.250, m.poly, 0, 0.004, -0.060);
    box(g, 0.050, 0.014, 0.180, m.dark, 0, 0.034, -0.070);          // top rail slab
    magazine(g, m, { y: -0.066, z: -0.110, w: 0.036, d: 0.058, segs: 4,
      seg: 0.044, curve: -0.03, lean: -0.02 });                     // fat, near-straight
    box(g, 0.038, 0.038, 0.100, m.poly, 0, -0.020, -0.220);         // fore-end
    grip(g, m, { y: -0.074, z: 0.048, h: 0.092, tilt: 0.32 });
    triggerGuard(g, m, { y: -0.048, z: 0.010, len: 0.056 });
    stock(g, m, { z0: 0.072, len: 0.185, style: 'skeleton' });
    return { muzzleZ: barrel(g, m, { z0: -0.272, len: 0.090, r: 0.0105 }) };
  },

  // P90: the one everyone recognises. Horizontal top-mounted magazine running
  // the whole length of the gun, thumbhole shell, barrel low and forward.
  p90(g, m) {
    box(g, 0.050, 0.078, 0.360, m.polyTan, 0, -0.012, -0.070);      // shell
    // Top magazine: a long flat translucent-looking box lying along the top.
    box(g, 0.036, 0.026, 0.270, m.dark, 0, 0.044, -0.075);
    for (let i = 0; i < 6; i++) {
      box(g, 0.038, 0.008, 0.008, m.brass, 0, 0.044, -0.185 + i * 0.044);
    }
    box(g, 0.030, 0.026, 0.040, m.polyTan, 0, 0.030, 0.062);        // mag latch hump
    cyl(g, 0.018, 0.018, 0.040, m.dark, 0, 0.070, -0.120, 10);      // reflex sight body
    box(g, 0.026, 0.020, 0.010, m.glass, 0, 0.070, -0.142);
    // Thumbhole grip: a hole implied by a bridge over a gap.
    box(g, 0.038, 0.046, 0.030, m.polyTan, 0, -0.062, 0.020);
    box(g, 0.038, 0.014, 0.060, m.polyTan, 0, -0.084, -0.010);
    triggerGuard(g, m, { y: -0.052, z: -0.036, len: 0.052 });
    foregrip(g, m, { z: -0.190, y: -0.048, h: 0.044, mat: m.polyTan });
    box(g, 0.046, 0.020, 0.014, m.dark, 0, -0.048, 0.106);          // butt pad
    return { muzzleZ: barrel(g, m, { z0: -0.250, len: 0.060, r: 0.0085, y: -0.010 }), muzzleY: -0.010 };
  },

  // PP-Bizon: helical magazine lying UNDER the barrel, running most of the
  // gun's length. Nothing else in the game has a tube slung underneath.
  bizon(g, m) {
    box(g, 0.042, 0.050, 0.240, m.poly, 0, 0.008, -0.055);
    tubeMag(g, m, { y: -0.048, z: -0.180, len: 0.290, r: 0.030 });
    cyl(g, 0.032, 0.032, 0.020, m.metal, 0, -0.048, -0.030, 14);    // mag collar
    grip(g, m, { y: -0.074, z: 0.052, h: 0.090, tilt: 0.30 });
    triggerGuard(g, m, { y: -0.048, z: 0.014, len: 0.054 });
    stock(g, m, { z0: 0.072, len: 0.180, style: 'skeleton' });
    box(g, 0.028, 0.022, 0.026, m.metal, 0, 0.038, -0.170);         // front sight
    box(g, 0.030, 0.018, 0.024, m.metal, 0, 0.036, -0.010);         // rear sight
    return { muzzleZ: barrel(g, m, { z0: -0.180, len: 0.130, r: 0.0085, y: 0.006 }), muzzleY: 0.006 };
  },

  // ---- Pistols -----------------------------------------------------------
  // All small; the differences are proportion and one strong cue each.

  // USP-S: slim, suppressed. The can nearly doubles its length.
  usp(g, m) {
    pistolSlide(g, m, { zFront: -0.115, zBack: 0.040, y: 0.010, w: 0.028, h: 0.036 });
    box(g, 0.028, 0.030, 0.080, m.poly, 0, -0.016, -0.010);          // frame/dust cover
    grip(g, m, { y: -0.062, z: 0.028, h: 0.080, tilt: 0.26, w: 0.030, d: 0.040 });
    triggerGuard(g, m, { y: -0.032, z: -0.010, len: 0.044 });
    magazine(g, m, { y: -0.070, z: 0.030, w: 0.024, d: 0.032, segs: 2,
      seg: 0.038, curve: 0.0, lean: 0.26, plate: false });
    return { muzzleZ: suppressor(g, m, { z0: -0.118, len: 0.130, r: 0.019, y: 0.010 }), muzzleY: 0.010 };
  },

  // Glock-18: blocky polymer frame, squared slide, no hammer, 20-round mag
  // sticking out past the grip.
  glock(g, m) {
    pistolSlide(g, m, { zFront: -0.100, zBack: 0.048, y: 0.010, w: 0.030, h: 0.040, mat: m.dark });
    box(g, 0.030, 0.034, 0.070, m.poly, 0, -0.018, -0.006);
    grip(g, m, { y: -0.066, z: 0.030, h: 0.086, tilt: 0.22, w: 0.032, d: 0.044 });
    triggerGuard(g, m, { y: -0.034, z: -0.012, len: 0.046 });
    // Extended 20-round mag: hangs below the grip, which is the visual tell.
    magazine(g, m, { y: -0.108, z: 0.046, w: 0.026, d: 0.034, segs: 2,
      seg: 0.034, curve: 0.0, lean: 0.22 });
    return { muzzleZ: barrel(g, m, { z0: -0.100, len: 0.014, r: 0.0075, y: 0.010 }), muzzleY: 0.010 };
  },

  // Desert Eagle: the big one. Fat slabbed slide with the barrel rib and gas
  // tube on top, huge trigger guard, wide frame. Must read as oversized.
  deagle(g, m) {
    pistolSlide(g, m, { zFront: -0.140, zBack: 0.052, y: 0.012, w: 0.038, h: 0.052,
      mat: m.metal, serrations: 6 });
    box(g, 0.020, 0.014, 0.170, m.worn, 0, 0.040, -0.056);           // barrel rib
    box(g, 0.026, 0.020, 0.060, m.metal, 0, -0.014, -0.110);         // gas tube under
    box(g, 0.036, 0.040, 0.070, m.metal, 0, -0.020, -0.004);
    grip(g, m, { y: -0.074, z: 0.038, h: 0.092, tilt: 0.28, w: 0.036, d: 0.050 });
    triggerGuard(g, m, { y: -0.038, z: -0.012, len: 0.056 });
    magazine(g, m, { y: -0.086, z: 0.048, w: 0.028, d: 0.038, segs: 2,
      seg: 0.036, curve: 0.0, lean: 0.24, plate: false });
    return { muzzleZ: barrel(g, m, { z0: -0.142, len: 0.020, r: 0.0105, y: 0.012 }), muzzleY: 0.012 };
  },

  // P250: compact, stubby, unremarkable on purpose -- it is the small one.
  p250(g, m) {
    pistolSlide(g, m, { zFront: -0.088, zBack: 0.040, y: 0.010, w: 0.028, h: 0.036,
      mat: m.dark, serrations: 4 });
    box(g, 0.028, 0.028, 0.056, m.poly, 0, -0.016, -0.004);
    grip(g, m, { y: -0.060, z: 0.026, h: 0.076, tilt: 0.26, w: 0.032, d: 0.042 });
    triggerGuard(g, m, { y: -0.032, z: -0.008, len: 0.042 });
    magazine(g, m, { y: -0.092, z: 0.042, w: 0.024, d: 0.032, segs: 1,
      seg: 0.030, curve: 0.0, lean: 0.24 });
    return { muzzleZ: barrel(g, m, { z0: -0.090, len: 0.012, r: 0.0070, y: 0.010 }), muzzleY: 0.010 };
  },

  // Five-SeveN: long slide for a pistol, polymer frame, high bore axis, and a
  // visibly longer grip than the P250 for its 20 rounds.
  fiveseven(g, m) {
    pistolSlide(g, m, { zFront: -0.120, zBack: 0.046, y: 0.012, w: 0.030, h: 0.038,
      mat: m.poly, serrations: 6 });
    box(g, 0.032, 0.030, 0.084, m.poly, 0, -0.016, -0.014);
    box(g, 0.026, 0.008, 0.100, m.dark, 0, 0.032, -0.040);           // slide top flat
    grip(g, m, { y: -0.068, z: 0.030, h: 0.090, tilt: 0.24, w: 0.032, d: 0.044 });
    triggerGuard(g, m, { y: -0.034, z: -0.012, len: 0.046 });
    magazine(g, m, { y: -0.100, z: 0.044, w: 0.024, d: 0.034, segs: 1,
      seg: 0.030, curve: 0.0, lean: 0.22 });
    return { muzzleZ: barrel(g, m, { z0: -0.122, len: 0.014, r: 0.0075, y: 0.012 }), muzzleY: 0.012 };
  },

  // Tec-9: machine pistol. Long ported barrel shroud out front, long straight
  // mag in front of the trigger, no stock. Reads longer than any other pistol.
  tec9(g, m) {
    box(g, 0.036, 0.056, 0.190, m.dark, 0, 0.008, -0.030);           // slab receiver
    // Ported shroud: the Tec-9's face. A vented tube ahead of the receiver.
    handguard(g, m, { z0: -0.125, len: 0.110, r: 0.017, y: 0.008, slots: 4 });
    // Magazine, ahead of the grip. `y` here is the CENTRE of the topmost
    // segment, not its top: at y=-0.070 with seg=0.042 the mag started 27mm
    // BELOW the receiver's -0.020 floor and hung in mid-air, which the arsenal
    // sheet showed plainly and which is what pushed the model to 0.262m tall.
    // Seated at -0.044 the first segment's top meets the receiver, and three
    // segments is the ~13cm stick a 32-round Tec-9 actually carries -- four was
    // a drum's worth of magazine on a pistol.
    magazine(g, m, { y: -0.044, z: -0.060, w: 0.026, d: 0.038, segs: 3,
      seg: 0.042, curve: 0.0, lean: 0.06 });
    grip(g, m, { y: -0.062, z: 0.052, h: 0.084, tilt: 0.24, w: 0.032, d: 0.046 });
    triggerGuard(g, m, { y: -0.036, z: 0.014, len: 0.044 });
    cyl(g, 0.008, 0.008, 0.026, m.worn, -0.024, 0.030, -0.010, 8, 'x'); // cocking knob
    return { muzzleZ: barrel(g, m, { z0: -0.236, len: 0.030, r: 0.0080, y: 0.008 }), muzzleY: 0.008 };
  },

  // CZ75-Auto: all-steel, slide rides INSIDE the frame rails so the frame is
  // visible full-length -- a lower, squarer profile than the polymer pistols.
  cz75(g, m) {
    pistolSlide(g, m, { zFront: -0.098, zBack: 0.044, y: 0.014, w: 0.026, h: 0.030,
      mat: m.worn, serrations: 5 });
    box(g, 0.032, 0.032, 0.120, m.metal, 0, -0.010, -0.024);         // full-length frame
    box(g, 0.020, 0.014, 0.026, m.metal, 0, 0.034, 0.048);           // hammer spur
    grip(g, m, { y: -0.062, z: 0.034, h: 0.080, tilt: 0.24, w: 0.034, d: 0.044,
      mat: m.woodDark });                                            // wood grip panels
    triggerGuard(g, m, { y: -0.034, z: -0.006, len: 0.044 });
    magazine(g, m, { y: -0.092, z: 0.046, w: 0.024, d: 0.032, segs: 1,
      seg: 0.028, curve: 0.0, lean: 0.24 });
    return { muzzleZ: barrel(g, m, { z0: -0.100, len: 0.012, r: 0.0075, y: 0.014 }), muzzleY: 0.014 };
  },

  // R8 Revolver: a cylinder and no slide. The one pistol with a completely
  // different topology -- exposed barrel, fluted cylinder, hammer spur.
  r8(g, m) {
    box(g, 0.024, 0.046, 0.110, m.dark, 0, 0.006, 0.016);            // frame
    // Cylinder: fluted, and the reason this reads as a revolver at 20px.
    cyl(g, 0.024, 0.024, 0.048, m.metal, 0, 0.006, -0.020, 8);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      cyl(g, 0.005, 0.005, 0.050, m.bore,
        Math.cos(a) * 0.016, 0.006 + Math.sin(a) * 0.016, -0.020, 6);
    }
    box(g, 0.016, 0.020, 0.030, m.worn, 0, 0.034, 0.052);            // hammer
    box(g, 0.018, 0.026, 0.100, m.dark, 0, 0.018, -0.098);           // barrel shroud/rib
    grip(g, m, { y: -0.062, z: 0.058, h: 0.084, tilt: 0.30, w: 0.032, d: 0.048,
      mat: m.woodDark });
    triggerGuard(g, m, { y: -0.034, z: 0.018, len: 0.044 });
    return { muzzleZ: barrel(g, m, { z0: -0.048, len: 0.115, r: 0.0080, y: 0.014 }), muzzleY: 0.014 };
  },

  // ---- Shotguns ----------------------------------------------------------

  // Nova: pump-action. Wood furniture, a long tube magazine slung under the
  // barrel, and a sliding fore-end. The classic hunting-gun outline.
  nova(g, m) {
    box(g, 0.044, 0.056, 0.180, m.metal, 0, 0.004, 0.010);           // receiver
    cyl(g, 0.0205, 0.0205, 0.400, m.bore, 0, 0.014, -0.290, 12);     // fat 12ga barrel
    cyl(g, 0.0135, 0.0135, 0.320, m.metal, 0, -0.022, -0.250, 10);   // magazine tube
    // Pump fore-end: ribbed wood sleeve around the mag tube.
    box(g, 0.046, 0.042, 0.130, m.woodDark, 0, -0.020, -0.200);
    for (let i = 0; i < 5; i++) box(g, 0.048, 0.008, 0.008, m.wood, 0, -0.020, -0.150 - i * 0.024);
    cyl(g, 0.0075, 0.0075, 0.014, m.worn, 0, 0.036, -0.470, 8, 'y'); // bead sight
    grip(g, m, { y: -0.058, z: 0.106, h: 0.070, tilt: 0.42, mat: m.wood });
    triggerGuard(g, m, { y: -0.040, z: 0.062, len: 0.052 });
    stock(g, m, { z0: 0.100, len: 0.270, style: 'wood', mat: m.wood });
    return { muzzleZ: -0.490, muzzleY: 0.014 };
  },

  // XM1014: semi-auto. Black polymer, shorter fatter receiver, heat shield
  // over the barrel, and a full pistol grip -- reads modern next to the Nova.
  xm1014(g, m) {
    box(g, 0.050, 0.062, 0.200, m.dark, 0, 0.004, 0.000);
    cyl(g, 0.0205, 0.0205, 0.300, m.bore, 0, 0.014, -0.250, 12);
    cyl(g, 0.0145, 0.0145, 0.260, m.metal, 0, -0.024, -0.230, 10);   // mag tube
    // Heat shield: a vented shroud over the barrel. Big silhouette cue.
    handguard(g, m, { z0: -0.130, len: 0.190, r: 0.027, y: 0.014, slots: 5 });
    grip(g, m, { y: -0.078, z: 0.078, h: 0.096, tilt: 0.30 });
    triggerGuard(g, m, { y: -0.048, z: 0.036, len: 0.056 });
    stock(g, m, { z0: 0.092, len: 0.230, style: 'poly' });
    return { muzzleZ: barrel(g, m, { z0: -0.400, len: 0.010, r: 0.0180, y: 0.014 }), muzzleY: 0.014 };
  },

  // MAG-7: bullpup shotgun. Short, fat, with a BOX magazine in the forward
  // grip -- unmistakable, and unlike every other shotgun here.
  mag7(g, m) {
    box(g, 0.058, 0.078, 0.290, m.dark, 0, -0.004, 0.010);           // fat shell
    box(g, 0.062, 0.016, 0.190, m.metal, 0, 0.040, 0.000);           // top rail slab
    cyl(g, 0.0210, 0.0210, 0.150, m.bore, 0, 0.010, -0.200, 12);
    // Box mag INSIDE the forward vertical grip -- the whole point of a MAG-7.
    box(g, 0.044, 0.110, 0.062, m.dark, 0, -0.098, -0.100).rotation.x = 0.06;
    box(g, 0.048, 0.014, 0.066, m.worn, 0, -0.156, -0.098);
    grip(g, m, { y: -0.072, z: 0.086, h: 0.086, tilt: 0.28 });
    triggerGuard(g, m, { y: -0.046, z: 0.046, len: 0.052 });
    stock(g, m, { z0: 0.150, len: 0.120, style: 'wire', y: -0.010 });
    return { muzzleZ: barrel(g, m, { z0: -0.272, len: 0.010, r: 0.0185, y: 0.010 }), muzzleY: 0.010 };
  },

  // Sawed-Off: double-barrel, cut down at both ends. Shortest long gun in the
  // game, two visible bores, no stock past the pistol grip.
  sawedoff(g, m) {
    box(g, 0.056, 0.056, 0.130, m.metal, 0, 0.000, 0.040);           // breech block
    // Twin barrels side by side -- the entire identity of this weapon.
    for (const dx of [-0.019, 0.019]) {
      cyl(g, 0.0185, 0.0185, 0.260, m.bore, dx, 0.006, -0.150, 10);
      cyl(g, 0.0140, 0.0140, 0.024, m.dark, dx, 0.006, -0.272, 10);  // bore recess
    }
    box(g, 0.056, 0.014, 0.240, m.metal, 0, 0.026, -0.150);          // top rib
    box(g, 0.058, 0.036, 0.100, m.woodDark, 0, -0.030, -0.070);      // stubby fore-end
    box(g, 0.020, 0.020, 0.036, m.worn, 0, 0.034, 0.086);            // top lever
    grip(g, m, { y: -0.066, z: 0.104, h: 0.092, tilt: 0.36, w: 0.034,
      d: 0.048, mat: m.woodDark });
    triggerGuard(g, m, { y: -0.040, z: 0.062, len: 0.050 });
    return { muzzleZ: -0.284, muzzleY: 0.006 };
  },

  // ---- LMGs --------------------------------------------------------------

  // M249: the biggest thing in the game. Belt of brass hanging out of the
  // feed tray, box magazine under the receiver, bipod, carry handle.
  m249(g, m) {
    box(g, 0.062, 0.078, 0.380, m.metal, 0, 0.008, -0.070);          // receiver
    box(g, 0.066, 0.026, 0.230, m.dark, 0, 0.052, -0.090);           // feed tray cover
    box(g, 0.014, 0.034, 0.110, m.metal, 0, 0.086, -0.070);          // carry handle
    // Ammo box: a big square can slung under the receiver.
    box(g, 0.086, 0.110, 0.150, m.dark, 0, -0.096, -0.040);
    box(g, 0.090, 0.012, 0.156, m.metal, 0, -0.152, -0.040);
    ammoBelt(g, m, { x: 0.036, y: -0.020, z: -0.100, n: 6 });
    handguard(g, m, { z0: -0.280, len: 0.180, r: 0.030, y: 0.000, slots: 5, round: false });
    grip(g, m, { y: -0.086, z: 0.100, h: 0.104, tilt: 0.28 });
    triggerGuard(g, m, { y: -0.054, z: 0.056, len: 0.058 });
    stock(g, m, { z0: 0.128, len: 0.230, style: 'poly' });
    bipod(g, m, { z: -0.470, y: -0.040 });
    ironSights(g, m, { frontZ: -0.480, rearZ: -0.040, y: 0.052 });
    return { muzzleZ: barrel(g, m, { z0: -0.460, len: 0.220, r: 0.0135, style: 'flash' }) };
  },

  // Negev: also huge, but distinct from the M249 -- a rail-covered rectangular
  // receiver, a cylindrical drum instead of a square can, and no carry handle.
  negev(g, m) {
    box(g, 0.058, 0.086, 0.400, m.dark, 0, 0.004, -0.080);
    rail(g, m, { z0: 0.100, len: 0.330, y: 0.056, w: 0.032 });
    // Drum: round, not square. Reads apart from the M249's box at a glance.
    cyl(g, 0.060, 0.060, 0.090, m.dark, 0, -0.086, -0.050, 16, 'x');
    cyl(g, 0.062, 0.062, 0.010, m.metal, 0.046, -0.086, -0.050, 16, 'x');
    ammoBelt(g, m, { x: 0.032, y: -0.024, z: -0.090, n: 5 });
    handguard(g, m, { z0: -0.300, len: 0.190, r: 0.029, y: -0.004, slots: 5 });
    foregrip(g, m, { z: -0.350, y: -0.044, h: 0.080 });
    grip(g, m, { y: -0.090, z: 0.104, h: 0.106, tilt: 0.28 });
    triggerGuard(g, m, { y: -0.056, z: 0.058, len: 0.058 });
    stock(g, m, { z0: 0.132, len: 0.220, style: 'skeleton' });
    bipod(g, m, { z: -0.490, y: -0.044 });
    return { muzzleZ: barrel(g, m, { z0: -0.480, len: 0.210, r: 0.0130, style: 'flash' }) };
  },

  // ---- Knife -------------------------------------------------------------

  // Bayonet-ish: a tapered blade with a false edge, a guard, a wrapped handle
  // and a pommel. Deliberately NOT gun-shaped and much smaller than any gun.
  knife(g, m) {
    // Blade: a flattened box tapering to a point, plus a bevelled edge strip
    // in a brighter material so the cutting edge catches light.
    const b = box(g, 0.006, 0.030, 0.150, m.blade, 0, 0.004, -0.090);
    b.scale.set(1, 1, 1);
    // Tip: a wedge. A 3-sided cylinder is a triangular prism for free.
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.0001, 0.017, 0.060, 3), m.blade);
    tip.rotation.set(Math.PI / 2, 0, Math.PI / 2);
    tip.position.set(0, 0.004, -0.192);
    tip.scale.set(1, 1, 0.36);
    g.add(tip);
    box(g, 0.0035, 0.008, 0.140, m.worn, 0, -0.010, -0.088);         // cutting edge
    box(g, 0.0035, 0.006, 0.055, m.worn, 0, 0.018, -0.150);          // false edge
    box(g, 0.0070, 0.010, 0.070, m.bore, 0, 0.006, -0.070);          // fuller groove
    // Guard: crosses the blade, with a muzzle ring on the far side.
    box(g, 0.026, 0.030, 0.012, m.metal, 0, 0.002, -0.012);
    cyl(g, 0.011, 0.011, 0.010, m.metal, 0, 0.020, -0.014, 10);      // muzzle ring
    // Handle: a slightly tapered grip with wrap grooves.
    cyl(g, 0.013, 0.015, 0.100, m.poly, 0, -0.002, 0.042, 10);
    for (let i = 0; i < 4; i++) {
      cyl(g, 0.0145, 0.0145, 0.006, m.dark, 0, -0.002, 0.012 + i * 0.022, 10);
    }
    box(g, 0.020, 0.022, 0.016, m.metal, 0, -0.002, 0.098);          // pommel
    return { muzzleZ: -0.220, muzzleY: 0.004 };
  },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Viewmodel framing, matching rifle.js's tuned AK exactly for the rifle-sized
 * weapons. The three constraints rifle.js documents still apply:
 *   - Y must not go below ~-0.11 or the magazine crops off the bottom edge.
 *   - Yaw past ~0.3 turns the stock broadside and it fills the right half.
 *   - Negative pitch is what tips the receiver's left side into view.
 * Small weapons are pushed FORWARD (less negative z) and up, because a pistol
 * held at the rifle's z is a speck in the corner of the frame; long weapons
 * are pulled back so the butt does not fill the screen.
 */
const VIEW_POSE = {
  // scale, position, rotation -- the AK's values are the baseline.
  default: { scale: 0.58, pos: [0.140, -0.100, -0.370], rot: [-0.11, 0.075, 0.055] },
  pistol: { scale: 0.85, pos: [0.130, -0.115, -0.300], rot: [-0.10, 0.090, 0.050] },
  smg: { scale: 0.68, pos: [0.140, -0.108, -0.340], rot: [-0.11, 0.080, 0.055] },
  sniper: { scale: 0.50, pos: [0.150, -0.095, -0.400], rot: [-0.10, 0.070, 0.050] },
  lmg: { scale: 0.46, pos: [0.155, -0.090, -0.400], rot: [-0.10, 0.070, 0.050] },
  shotgun: { scale: 0.54, pos: [0.145, -0.100, -0.380], rot: [-0.11, 0.075, 0.055] },
  knife: { scale: 1.05, pos: [0.130, -0.120, -0.280], rot: [-0.28, 0.240, 0.140] },
};

/** Which pose family each weapon uses. Defaults to `default` (rifle framing). */
const POSE_OF = {
  awp: 'sniper', ssg08: 'sniper', scar20: 'sniper', g3sg1: 'sniper',
  mp9: 'smg', mac10: 'smg', mp5sd: 'smg', ump45: 'smg', p90: 'smg', bizon: 'smg',
  usp: 'pistol', glock: 'pistol', deagle: 'pistol', p250: 'pistol',
  fiveseven: 'pistol', tec9: 'pistol', cz75: 'pistol', r8: 'pistol',
  nova: 'shotgun', xm1014: 'shotgun', mag7: 'shotgun', sawedoff: 'shotgun',
  m249: 'lmg', negev: 'lmg',
  knife: 'knife',
};

/**
 * World-model scale. A dropped or carried-by-a-bot weapon is rendered at TRUE
 * SIZE in world space -- the viewmodel's 0.58 exists only to frame the gun in
 * a 56-degree weapon camera, and applying it to a world model would give every
 * bot an undersized toy. So world scale is 1.0 and viewmodel scale is not,
 * which is also the invariant models.test.js asserts.
 */
const WORLD_SCALE = 1.0;

/**
 * Build a weapon.
 * @param {string} id                  a key from specs.js WEAPON_IDS
 * @param {object|null} materials      IGNORED for surfacing -- see the note at
 *                                     the top of the file. Accepted so callers
 *                                     can pass the world material set without
 *                                     special-casing this module.
 * @param {{viewmodel?:boolean}} [opts] viewmodel:true applies the held pose
 * @returns {THREE.Group} with a child Object3D named 'muzzle' at the bore exit
 */
export function buildWeaponModel(id, materials = null, opts = {}) {
  const build = BUILDERS[id];
  if (!build) throw new Error(`no model for weapon: ${id}`);
  const m = weaponMaterials();

  const gun = new THREE.Group();
  gun.name = id;
  const out = build(gun, m) || {};

  // Muzzle marker. Every weapon has one, at the true bore exit, because the
  // net/effects layer attaches flash and tracers to it by name.
  const muzzle = new THREE.Object3D();
  muzzle.name = 'muzzle';
  muzzle.position.set(0, out.muzzleY ?? 0.004, out.muzzleZ ?? -0.5);
  gun.add(muzzle);

  // Ejection port, for parity with rifle.js. Named so the same lookup works.
  const eject = new THREE.Object3D();
  eject.name = 'eject';
  eject.position.set(0.034, 0.022, out.ejectZ ?? -0.060);
  gun.add(eject);

  // Shadows off: the viewmodel scene has no shadow-casting lights, and in the
  // world these are small props. Turning them on costs a shadow pass per gun.
  gun.traverse((c) => { c.castShadow = false; c.receiveShadow = false; });

  if (opts.viewmodel) {
    const p = VIEW_POSE[POSE_OF[id] || 'default'];
    gun.scale.setScalar(p.scale);
    gun.position.set(p.pos[0], p.pos[1], p.pos[2]);
    gun.rotation.set(p.rot[0], p.rot[1], p.rot[2]);
  } else {
    gun.scale.setScalar(WORLD_SCALE);
  }
  return gun;
}

/** The pose a viewmodel gets, exposed so animation code can return to rest. */
export function viewmodelPose(id) {
  const p = VIEW_POSE[POSE_OF[id] || 'default'];
  return { scale: p.scale, pos: [...p.pos], rot: [...p.rot] };
}

/** Convenience for tests and tooling. */
export const MODEL_IDS = WEAPON_IDS.filter((id) => id in BUILDERS);

/** Ids in WEAPON_IDS with no builder. Should always be empty. */
export const MISSING_MODELS = WEAPON_IDS.filter((id) => !(id in BUILDERS));
