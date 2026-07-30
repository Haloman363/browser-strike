import * as THREE from 'three';
import { MOVE } from '../player/movement.js';

// Enemy bot: articulated primitive humanoid + procedural animation + a flat
// state machine. Everything the combat math needs is a pure function at the
// top of this file so it can be tested headlessly (see _testBot).

export const BOT = {
  health: 100,
  eyeHeight: 1.52,          // metres above feet, standing
  height: MOVE.standHeight, // share the player capsule so LOS reads the same
  radius: MOVE.radius,
  walkSpeed: 1.9,
  runSpeed: 4.1,
  strafeSpeed: 2.6,
  accel: 14,
  gravity: MOVE.gravity,

  fovDeg: 110,
  sightRange: 42,
  // Human reaction time. Sampled per-acquisition so bots don't all snap at once.
  reactionMin: 0.18,
  reactionMax: 0.35,

  // Aim error in radians: starts wide on acquisition, decays as the bot "settles"
  // on target. 0.085 rad at 20m is ~1.7m off — a clear miss.
  // aimErrorMin is deliberately NOT tight enough to guarantee a hit: at 15m it
  // still throws ~0.42m, wider than a torso, so even a settled bot drops rounds.
  // Tightening this below ~0.023 makes bots feel like aimbots.
  aimErrorMax: 0.085,
  aimErrorMin: 0.028,
  aimSettleTime: 1.4,       // seconds of sustained sight to reach aimErrorMin

  fireRate: 0.098,          // seconds between rounds, ~600 RPM
  burstMin: 3,
  burstMax: 7,
  burstPauseMin: 0.35,
  burstPauseMax: 0.85,
  magSize: 30,
  reloadTime: 2.4,
  damage: 26,               // per round, before falloff
  damageFalloffStart: 12,   // metres
  damageFalloffEnd: 45,
  damageFalloffMin: 0.55,

  respawnDelay: 6,
  loseSightGrace: 3.0,      // seconds of ALERT hunting after losing the player
};

// CS-style hitgroup multipliers.
export const HITBOX_MULT = {
  head: 4.0,
  chest: 1.0,
  stomach: 1.25,
  arm: 0.75,
  leg: 0.75,
};

// ---------------------------------------------------------------------------
// Pure math — no THREE scene, no DOM. Tested by _testBot().
// ---------------------------------------------------------------------------

/**
 * Is `target` inside a view cone of `fovDeg` centred on `forward` from `origin`?
 * All vectors are plain {x,y,z}. The cone is full-angle, so half-angle compare.
 */
export function inViewCone(origin, forward, target, fovDeg, maxDist) {
  const dx = target.x - origin.x, dy = target.y - origin.y, dz = target.z - origin.z;
  const dist = Math.hypot(dx, dy, dz);
  if (dist > maxDist || dist < 1e-6) return false;
  const fl = Math.hypot(forward.x, forward.y, forward.z);
  if (fl < 1e-6) return false;
  const cos = (dx * forward.x + dy * forward.y + dz * forward.z) / (dist * fl);
  return cos >= Math.cos((fovDeg * Math.PI / 180) / 2);
}

/**
 * Aim error half-angle in radians given how long the bot has held sight.
 * Decays exponentially so the first shots of a peek are the sloppy ones —
 * that is the difference between "fun" and "aimbot".
 */
export function aimErrorFor(sightTime, cfg = BOT) {
  const t = Math.max(0, Math.min(1, sightTime / cfg.aimSettleTime));
  const eased = 1 - Math.pow(1 - t, 2);
  return cfg.aimErrorMax + (cfg.aimErrorMin - cfg.aimErrorMax) * eased;
}

/** Distance falloff on bot damage, so cross-map pot shots sting less. */
export function damageFalloff(distance, cfg = BOT) {
  if (distance <= cfg.damageFalloffStart) return 1;
  if (distance >= cfg.damageFalloffEnd) return cfg.damageFalloffMin;
  const t = (distance - cfg.damageFalloffStart) /
    (cfg.damageFalloffEnd - cfg.damageFalloffStart);
  return 1 + (cfg.damageFalloffMin - 1) * t;
}

/** Final damage for one round landing on `part`. */
export function damageForHit(base, part, mult = HITBOX_MULT) {
  return base * (mult[part] ?? 1);
}

/**
 * Does a shot with `errorRad` of aim error connect with a target of
 * `targetRadius` at `distance`? Deterministic given `roll` in [0,1).
 * Modelling the error as a uniform angular offset keeps this testable.
 */
export function shotConnects(errorRad, distance, targetRadius, roll) {
  const offset = errorRad * roll * distance;
  return offset <= targetRadius;
}

/** Ray vs sphere. Returns the near hit distance in [0,maxDist] or null. */
export function raySphere(origin, dir, center, radius, maxDist) {
  const ox = origin.x - center.x, oy = origin.y - center.y, oz = origin.z - center.z;
  const b = ox * dir.x + oy * dir.y + oz * dir.z;
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  let t = -b - sq;
  if (t < 0) t = -b + sq;   // origin inside the sphere
  if (t < 0 || t > maxDist) return null;
  return t;
}

/** Shortest signed angle from a to b, in (-pi, pi]. */
export function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

/** Frame-rate independent exponential approach. rate = 1/e-folds per second. */
export function damp(current, target, rate, dt) {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (lo, hi) => lo + Math.random() * (hi - lo);

// ---------------------------------------------------------------------------
// Character model
// ---------------------------------------------------------------------------

// Militia palette. Desaturated and warm so the bot reads against Mirage's
// sandstone. Nothing here is near-black: flat blacks kill the shading that
// makes primitives read as volume, which is what made the old bot a mannequin.
const SKIN = {
  fatigue: 0x9a8560,      // tan sleeves
  fatigueLit: 0xa89268,   // slightly lifted tone for shoulders/upper sleeve
  trouser: 0x8d7a57,      // trousers, a touch cooler than the sleeves
  trouserDark: 0x7a6a4c,  // bloused shin section
  vest: 0x4a4234,         // olive-brown plate carrier
  vestDark: 0x3d3629,     // straps and cummerbund
  pouch: 0x585040,        // mag pouches, lifted so they read against the vest
  belt: 0x3a2f22,
  wrap: 0x9c6a52,         // dust-red shemagh
  wrapPale: 0xc0a68c,     // off-white fold highlights
  balaclava: 0x3b352e,    // face covering: dark but not black
  skin: 0xb08a68,
  boot: 0x3a2c20,
  bootSole: 0x2b221a,
  glove: 0x4b3a2a,
  gun: 0x2e2a26,
  gunMetal: 0x4a4642,
  gunWood: 0x6b4a2c,
};

// Human proportions in metres for a 1.80m figure (~7.5 heads tall).
// Hip pivot sits at HALF body height — the single number that stops the bot
// reading as stilt-legged.
const P = {
  height: 1.80,
  headR: 0.115,           // 0.23m head diameter
  neck: 0.085,
  shoulderSpan: 0.46,
  chestH: 0.28,           // ribcage, shoulder down to the floating ribs
  chestW: 0.36,
  chestD: 0.22,
  spineH: 0.16,           // floating ribs down to the waist
  hipW: 0.34,
  hipH: 0.16,
  // Hip pivot at HALF body height. thigh + shin + ankle = 0.915, leaving a
  // ~0.015m rest flex at the knee — nobody stands with locked knees, and it
  // also guarantees the knee bends the correct way when the cycle starts.
  hipY: 0.90,
  // Neutral standing flex, solved so the ankle lands directly under the hip
  // with the sole flat on y=0: 0.44cos(h) + 0.415cos(h+k) = 0.90 - ankleH.
  // SIGNS MATTER: the model faces -Z, so a negative rotation.x swings a
  // segment's far end forward. The knee must therefore be POSITIVE — it folds
  // the shin backward, the way a human knee works. An earlier solve satisfied
  // the position constraint with both angles pushing forward, which put the
  // ankle ahead of the knee all cycle and read as backwards knees.
  restHip: -0.18,
  restKnee: 0.371,
  upperArm: 0.29,
  lowerArm: 0.25,
  armR: 0.052,
  upperLeg: 0.44,
  lowerLeg: 0.415,
  legR: 0.082,
  ankleH: 0.06,           // ankle pivot above the sole
  footL: 0.27,
  footW: 0.115,
};

// Rest height of the hips GROUP. The leg pivots hang P.hipH/2 below it, so the
// group sits that much above the anatomical hip height. animate() and the death
// collapse both write hips.position.y, so this must be one shared number.
const HIPS_Y = P.hipY + P.hipH / 2;

function mat(color, rough = 0.85, metal = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
}

/** Add a mesh under `parent`, positioned by its centre. Everything casts. */
function part(parent, geo, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

/**
 * Build the articulated skeleton. Every joint is an Object3D pivot at the joint
 * itself, with geometry hung below it — that is what makes rotating a node look
 * like a limb bending rather than a box spinning in place.
 *
 * Returns { root, joints } where root sits at the bot's FEET.
 */
export function buildBotModel() {
  const M = {
    fatigue: mat(SKIN.fatigue, 0.94),
    fatigueLit: mat(SKIN.fatigueLit, 0.94),
    trouser: mat(SKIN.trouser, 0.95),
    trouserDark: mat(SKIN.trouserDark, 0.95),
    vest: mat(SKIN.vest, 0.88),
    vestDark: mat(SKIN.vestDark, 0.9),
    pouch: mat(SKIN.pouch, 0.92),
    belt: mat(SKIN.belt, 0.8),
    wrap: mat(SKIN.wrap, 0.96),
    wrapPale: mat(SKIN.wrapPale, 0.96),
    balaclava: mat(SKIN.balaclava, 0.93),
    skin: mat(SKIN.skin, 0.7),
    boot: mat(SKIN.boot, 0.6),
    bootSole: mat(SKIN.bootSole, 0.85),
    glove: mat(SKIN.glove, 0.8),
    gun: mat(SKIN.gun, 0.4, 0.8),
    gunMetal: mat(SKIN.gunMetal, 0.35, 0.85),
    gunWood: mat(SKIN.gunWood, 0.75),
  };

  const root = new THREE.Group();          // origin at the feet
  const joints = {};

  // --- Hips: the animation root. Bobs and leans; everything hangs off it.
  const hips = new THREE.Group();
  hips.position.y = HIPS_Y;
  root.add(hips);
  joints.hips = hips;

  // Pelvis block plus a slightly wider seat behind it — a flat box reads as a
  // plank from the side, which was half of the "slab" problem.
  part(hips, new THREE.BoxGeometry(P.hipW, P.hipH, 0.24), M.trouser, 0, 0, 0);
  part(hips, new THREE.BoxGeometry(P.hipW - 0.03, P.hipH * 0.8, 0.10), M.trouser,
    0, -0.02, -0.11);
  // Belt with a buckle: separates trousers from vest and gives a waist line.
  part(hips, new THREE.BoxGeometry(P.hipW + 0.02, 0.05, 0.25), M.belt, 0, P.hipH / 2 - 0.01, 0);
  // Hip pouch on the left — asymmetry is what stops a rig reading as a toy.
  part(hips, new THREE.BoxGeometry(0.09, 0.13, 0.08), M.pouch, 0.19, -0.02, 0.02);

  // --- Spine -> chest -> neck -> head
  const spine = new THREE.Group();
  spine.position.y = P.hipH / 2;
  hips.add(spine);
  joints.spine = spine;
  // Waist: narrower than both hips and chest. The pinch is the taper.
  part(spine, new THREE.BoxGeometry(0.29, P.spineH + 0.03, 0.20), M.fatigue,
    0, P.spineH / 2, 0);

  const chest = new THREE.Group();
  chest.position.y = P.spineH;
  spine.add(chest);
  joints.chest = chest;

  // Ribcage as a real volume: a 4-sided cylinder flares from the waist up to
  // the shoulders, so the torso has depth and taper instead of being a slab.
  const rib = part(chest,
    new THREE.CylinderGeometry(P.chestW / 2, P.chestW / 2 - 0.055, P.chestH, 10),
    M.fatigue, 0, P.chestH / 2, 0);
  rib.scale.z = P.chestD / P.chestW;       // squash front-to-back into an oval
  // Upper back slab fills the cylinder's flat back so the pack has something
  // to sit against.

  // Plate carrier: a SEPARATE layer sitting proud of the ribcage with real
  // thickness, front and back plates plus a cummerbund wrapping the sides.
  const plateW = P.chestW - 0.04, plateH = P.chestH * 0.66;
  part(chest, new THREE.BoxGeometry(plateW, plateH, 0.055), M.vest,
    0, P.chestH * 0.55, P.chestD / 2 - 0.01);                       // front plate
  part(chest, new THREE.BoxGeometry(plateW, plateH, 0.05), M.vest,
    0, P.chestH * 0.55, -P.chestD / 2 + 0.01);                      // back plate
  part(chest, new THREE.BoxGeometry(P.chestW + 0.03, plateH * 0.5, P.chestD + 0.02),
    M.vestDark, 0, P.chestH * 0.40, 0);                             // cummerbund
  // Shoulder straps over the trapezius, joining front plate to back plate.
  for (const sx of [-1, 1]) {
    part(chest, new THREE.BoxGeometry(0.07, 0.05, P.chestD + 0.06), M.vestDark,
      sx * 0.095, P.chestH * 0.90, 0);
  }
  // Mag pouches: three across the front, standing off the plate.
  for (let i = -1; i <= 1; i++) {
    part(chest, new THREE.BoxGeometry(0.082, 0.125, 0.06), M.pouch,
      i * 0.093, P.chestH * 0.50, P.chestD / 2 + 0.035);
  }
  // Radio pouch high on the left chest — breaks the three-pouch symmetry.
  part(chest, new THREE.BoxGeometry(0.07, 0.09, 0.05), M.pouch,
    0.115, P.chestH * 0.76, P.chestD / 2 + 0.03);
  // Sling running diagonally across the chest. Strong soldier cue in silhouette.
  const sling = part(chest, new THREE.BoxGeometry(0.035, P.chestH * 1.15, 0.02),
    M.vestDark, 0.01, P.chestH * 0.55, P.chestD / 2 + 0.035);
  sling.rotation.z = 0.62;
  // Bedroll strapped across the back — mass behind the shoulders.
  const roll = part(chest, new THREE.CapsuleGeometry(0.055, 0.24, 4, 8), M.wrapPale,
    0, P.chestH * 0.60, -P.chestD / 2 - 0.06);
  roll.rotation.z = Math.PI / 2;
  // Small pack under it, so the back is not a flat plane.
  part(chest, new THREE.BoxGeometry(0.24, 0.20, 0.09), M.vestDark,
    0, P.chestH * 0.36, -P.chestD / 2 - 0.05);

  // Deltoid yoke: spans the full shoulder width so the top of the silhouette is
  // broad. Sits BEHIND the deltoid balls so no gap can open at the joint.
  part(chest, new THREE.BoxGeometry(P.shoulderSpan - 0.09, 0.10, 0.18), M.fatigueLit,
    0, P.chestH * 0.94, 0);

  const neck = new THREE.Group();
  neck.position.y = P.chestH;
  chest.add(neck);
  joints.neck = neck;
  // Neck overlaps down into the collar so turning the head never opens a hole.
  part(neck, new THREE.CylinderGeometry(0.052, 0.068, P.neck + 0.05, 10), M.skin,
    0, P.neck / 2 - 0.03, 0);
  // Collar of the shemagh bunched at the base of the neck.
  const collar = part(neck, new THREE.TorusGeometry(0.072, 0.033, 8, 14), M.wrap,
    0, -0.005, 0);
  collar.rotation.x = Math.PI / 2;

  const head = new THREE.Group();
  head.position.y = P.neck;
  neck.add(head);
  joints.head = head;

  // Skull: an ovoid, longer front-to-back than it is wide, with a jaw block
  // beneath. A bare sphere is what read as a black ball.
  const skull = part(head, new THREE.SphereGeometry(P.headR, 16, 12), M.balaclava,
    0, P.headR * 0.85, -0.005);
  skull.scale.set(0.92, 1.02, 1.10);
  const jaw = part(head, new THREE.BoxGeometry(0.145, 0.085, 0.15), M.balaclava,
    0, P.headR * 0.55, 0.012);
  jaw.rotation.x = -0.08;
  // Face plane: a flat inset with brow above and the balaclava mouth below, so
  // the head has an unambiguous front at any distance.
  part(head, new THREE.BoxGeometry(0.115, 0.075, 0.02), M.skin,
    0, P.headR * 1.02, P.headR * 0.98);
  part(head, new THREE.BoxGeometry(0.125, 0.028, 0.03), M.balaclava,
    0, P.headR * 1.36, P.headR * 0.93);                        // brow band
  for (const ex of [-1, 1]) {
    part(head, new THREE.SphereGeometry(0.016, 8, 6), M.balaclava,
      ex * 0.032, P.headR * 1.02, P.headR * 1.02);             // eyes
  }
  // Shemagh: a wrapped crown plus two offset fold bands. The offsets are what
  // make it read as cloth wound round a head rather than a hat.
  const crown = part(head, new THREE.SphereGeometry(P.headR * 1.04, 14, 10), M.wrap,
    0, P.headR * 1.02, -0.015);
  crown.scale.set(0.98, 0.78, 1.06);
  const fold1 = part(head, new THREE.TorusGeometry(P.headR * 0.98, 0.028, 8, 16),
    M.wrapPale, 0, P.headR * 1.30, -0.012);
  fold1.rotation.set(Math.PI / 2, 0, 0.20);
  // Cloth drape down the back of the neck, and a tail over one shoulder.
  const drape = part(head, new THREE.BoxGeometry(0.155, 0.13, 0.045), M.wrap,
    0, P.headR * 0.72, -P.headR * 0.92);
  drape.rotation.x = 0.22;
  const tail = part(head, new THREE.BoxGeometry(0.055, 0.22, 0.035), M.wrap,
    -P.headR * 0.92, P.headR * 0.30, -0.06);
  tail.rotation.z = 0.38;

  // --- Arms. Shoulders sit at the yoke ends; elbows are child pivots.
  // Every segment is over-long by `lap` and the joints carry a ball, so no gap
  // can open at the extremes of the walk cycle.
  const lap = 0.03;
  const armY = P.chestH * 0.86;
  for (const side of ['L', 'R']) {
    const s = side === 'L' ? 1 : -1;

    const shoulder = new THREE.Group();
    shoulder.position.set(s * (P.shoulderSpan / 2 - 0.045), armY, 0);
    chest.add(shoulder);
    joints[`shoulder${side}`] = shoulder;

    // Deltoid ball: bigger than the sleeve so it covers the socket from every
    // angle. This is the fix for the "floating sausage" arms.
    const delt = part(shoulder, new THREE.SphereGeometry(P.armR * 1.55, 12, 10),
      M.fatigueLit, 0, 0.005, 0);
    delt.scale.set(1.0, 1.15, 1.0);
    // Shoulder tab of the vest riding over the deltoid.
    part(shoulder, new THREE.BoxGeometry(0.10, 0.04, 0.13), M.vestDark, 0, 0.045, 0);
    part(shoulder,
      new THREE.CapsuleGeometry(P.armR, P.upperArm - P.armR * 2 + lap, 4, 10),
      M.fatigue, 0, -(P.upperArm - lap) / 2, 0);

    const elbow = new THREE.Group();
    elbow.position.y = -P.upperArm;
    shoulder.add(elbow);
    joints[`elbow${side}`] = elbow;

    part(elbow, new THREE.SphereGeometry(P.armR * 1.05, 10, 8), M.fatigue, 0, 0, 0);
    part(elbow,
      new THREE.CapsuleGeometry(P.armR * 0.9, P.lowerArm - P.armR * 2 + lap, 4, 10),
      M.fatigue, 0, -(P.lowerArm - lap) / 2, 0);
    const hand = new THREE.Group();
    hand.position.y = -P.lowerArm - 0.005;
    elbow.add(hand);
    joints[`hand${side}`] = hand;
    // Gloved fist, wrapping slightly forward so it reads as gripping.
    part(hand, new THREE.BoxGeometry(0.062, 0.095, 0.075), M.glove, 0, -0.045, 0.008);
    part(hand, new THREE.BoxGeometry(0.05, 0.035, 0.055), M.glove, 0, -0.085, 0.02);
  }

  // --- Legs. Trousers are visibly bulkier than the shins and blouse into the
  // boot tops, which is most of the "soldier not mannequin" read below the belt.
  for (const side of ['L', 'R']) {
    const s = side === 'L' ? 1 : -1;

    const hip = new THREE.Group();
    hip.position.set(s * (P.hipW / 2 - 0.085), -P.hipH / 2, 0);
    hips.add(hip);
    joints[`hip${side}`] = hip;

    // Hip ball covers the socket during the swing extremes.
    part(hip, new THREE.SphereGeometry(P.legR * 1.2, 10, 8), M.trouser, 0, 0.01, 0);
    part(hip,
      new THREE.CapsuleGeometry(P.legR * 1.12, P.upperLeg - P.legR * 2 + lap, 4, 10),
      M.trouser, 0, -(P.upperLeg - lap) / 2, 0);
    // Thigh cargo pocket.
    part(hip, new THREE.BoxGeometry(0.075, 0.13, 0.05), M.trouserDark,
      s * 0.075, -P.upperLeg * 0.55, 0.03);

    const knee = new THREE.Group();
    knee.position.y = -P.upperLeg;
    hip.add(knee);
    joints[`knee${side}`] = knee;

    part(knee, new THREE.SphereGeometry(P.legR * 1.05, 10, 8), M.trouser, 0, 0, 0);
    // Calf tapers toward the ankle — a straight capsule reads as a pipe.
    part(knee,
      new THREE.CapsuleGeometry(P.legR * 0.92, P.lowerLeg * 0.62, 4, 10),
      M.trouser, 0, -P.lowerLeg * 0.34, 0);
    // Bloused cuff bunched over the boot top.
    part(knee, new THREE.CylinderGeometry(P.legR * 1.05, P.legR * 0.86, 0.11, 10),
      M.trouserDark, 0, -P.lowerLeg + 0.06, 0);

    const ankle = new THREE.Group();
    ankle.position.y = -P.lowerLeg;
    knee.add(ankle);
    joints[`ankle${side}`] = ankle;

    // Neutral standing flex. animate() overwrites these every frame, but the
    // un-animated model (editor previews, the headless proportion check) must
    // still stand on its soles rather than sinking through the floor.
    hip.rotation.x = P.restHip;
    knee.rotation.x = P.restKnee;
    ankle.rotation.x = -(P.restHip + P.restKnee);

    // BOOT. Built as ankle collar -> foot mass -> sole -> toe cap, all forward
    // of the ankle pivot, so heel-strike and toe-off actually read in the gait.
    // Local geometry: y=0 is the ankle, sole bottom at y=-P.ankleH, toe at +Z.
    const toeZ = P.footL - 0.085;   // ankle sits ~8.5cm back from the toe
    part(ankle, new THREE.CylinderGeometry(P.legR * 0.85, P.legR * 0.8, 0.09, 10),
      M.boot, 0, -0.015, 0.005);                                   // ankle collar
    part(ankle, new THREE.BoxGeometry(P.footW, 0.075, P.footL - 0.06), M.boot,
      0, -P.ankleH + 0.05, (toeZ - 0.085) / 2 + 0.01);             // foot mass
    part(ankle, new THREE.BoxGeometry(P.footW + 0.012, 0.028, P.footL), M.bootSole,
      0, -P.ankleH + 0.012, (toeZ - 0.085) / 2 + 0.01);            // sole
    const toe = part(ankle, new THREE.BoxGeometry(P.footW - 0.01, 0.055, 0.06),
      M.boot, 0, -P.ankleH + 0.045, toeZ - 0.03);                  // toe cap
    toe.rotation.x = -0.14;                                        // toe spring
    part(ankle, new THREE.BoxGeometry(P.footW - 0.02, 0.05, 0.035), M.bootSole,
      0, -P.ankleH + 0.03, -0.075);                                // heel block
  }

  // --- Rifle, held in the right hand, left hand supporting the foregrip.
  // The rifle GROUP's origin is the PISTOL GRIP, not the receiver centre: the
  // grip is what the right fist closes on, so making it the pivot means the
  // weapon rotates about the hand instead of swinging the hand around. It also
  // pulls the foregrip back to roughly 0.24m forward, inside the left arm's
  // 0.54m reach — without this the left hand can never touch the handguard.
  const rifle = new THREE.Group();
  joints.handR.add(rifle);
  joints.rifle = rifle;
  const gun = new THREE.Group();
  gun.position.set(0, GRIP_OFFSET.y, GRIP_OFFSET.z);
  rifle.add(gun);
  buildRifle(gun, M);

  // Muzzle marker so the shoot code can spawn tracers from the right place.
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.055, 0.56);
  gun.add(muzzle);
  joints.muzzle = muzzle;

  return { root, joints, materials: M };
}

// Where the pistol grip and the foregrip sit in raw rifle geometry space. The
// rifle group is shifted by -GRIP_OFFSET so its origin lands on the pistol grip;
// FOREGRIP is then where the LEFT hand has to reach, in rifle-group space.
const GRIP_OFFSET = { y: 0.048, z: -0.03 };
const FOREGRIP = { y: 0.055 + GRIP_OFFSET.y, z: 0.27 + GRIP_OFFSET.z };

/** Simple AK-flavoured primitive rifle, +Z is the barrel direction. */
function buildRifle(g, M) {
  part(g, new THREE.BoxGeometry(0.055, 0.09, 0.34), M.gun, 0, 0.03, 0.10);        // receiver
  part(g, new THREE.BoxGeometry(0.058, 0.03, 0.12), M.gunMetal, 0, 0.075, 0.02);  // dust cover
  part(g, new THREE.CylinderGeometry(0.012, 0.012, 0.42, 8), M.gunMetal, 0, 0.058, 0.36)
    .rotation.x = Math.PI / 2;                                                     // barrel
  part(g, new THREE.CylinderGeometry(0.019, 0.019, 0.06, 8), M.gunMetal, 0, 0.058, 0.55)
    .rotation.x = Math.PI / 2;                                                     // muzzle brake
  part(g, new THREE.BoxGeometry(0.052, 0.065, 0.18), M.gunWood, 0, 0.042, 0.27);  // handguard
  part(g, new THREE.BoxGeometry(0.05, 0.075, 0.24), M.gunWood, 0, 0.018, -0.19);  // stock
  part(g, new THREE.BoxGeometry(0.038, 0.09, 0.055), M.gun, 0, -0.048, 0.03);     // grip
  // Curved magazine: an angled block sells the AK read in silhouette.
  const mag = part(g, new THREE.BoxGeometry(0.035, 0.19, 0.065), M.gun, 0, -0.105, 0.145);
  mag.rotation.x = -0.35;
  part(g, new THREE.BoxGeometry(0.018, 0.04, 0.02), M.gunMetal, 0, 0.095, 0.44);  // front sight
  part(g, new THREE.BoxGeometry(0.03, 0.028, 0.02), M.gunMetal, 0, 0.088, 0.12);  // rear sight
}

// ---------------------------------------------------------------------------
// Hitboxes
// ---------------------------------------------------------------------------

// Spheres in bot-local space (origin at feet, +Z forward), radius in metres.
// Ordered head-first so the multiplier resolution is stable when they overlap.
// ponytail: spheres rather than oriented boxes. At CS ranges the difference is
// under a pixel; swap for OBBs if the bots ever get prone/lean poses.
// Landmarks from the rebuilt model (measured, see _testBot): crown 1.80,
// head centre 1.68, shoulder 1.46, hip pivot 0.90, knee 0.46, ankle 0.06.
const HITBOXES = [
  { part: 'head', y: 1.68, r: 0.125 },
  { part: 'chest', y: 1.36, r: 0.235 },
  { part: 'stomach', y: 1.07, r: 0.215 },
  // Four leg spheres: consecutive radii must overlap or shots slip through the
  // shin. The self-check sweeps every 5cm of height to enforce that. The extra
  // low sphere covers the boot now that the model has actual feet.
  { part: 'leg', y: 0.78, r: 0.185 },
  { part: 'leg', y: 0.55, r: 0.16 },
  { part: 'leg', y: 0.32, r: 0.155 },
  { part: 'leg', y: 0.12, r: 0.145 },
  { part: 'arm', y: 1.36, r: 0.115, x: 0.24 },
  { part: 'arm', y: 1.36, r: 0.115, x: -0.24 },
];

// ---------------------------------------------------------------------------
// Bot
// ---------------------------------------------------------------------------

export const BotState = {
  PATROL: 'PATROL',
  ALERT: 'ALERT',
  ENGAGE: 'ENGAGE',
  RELOAD: 'RELOAD',
  DEAD: 'DEAD',
};

export class Bot {
  /**
   * @param {THREE.Scene} scene
   * @param {import('../world/collision.js').CollisionWorld} collisionWorld
   * @param {THREE.Vector3} spawnPos  feet position
   * @param {THREE.Vector3[]} patrolPoints
   */
  constructor(scene, collisionWorld, spawnPos, patrolPoints = []) {
    this.scene = scene;
    this.world = collisionWorld;
    this.spawnPos = spawnPos.clone();
    this.patrolPoints = patrolPoints.map(p => p.clone());

    // Physics body: centre of the capsule, matching the player box.
    this.position = spawnPos.clone();
    this.position.y += BOT.height / 2;
    this.velocity = new THREE.Vector3();
    this.grounded = false;
    this.half = new THREE.Vector3(BOT.radius, BOT.height / 2, BOT.radius);

    this.yaw = 0;             // body facing
    this.aimYaw = 0;          // upper body / weapon facing
    this.aimPitch = 0;
    this.headYaw = 0;         // head tracks independently within limits
    this.headPitch = 0;

    this.health = BOT.health;
    this.state = BotState.PATROL;
    this.stateTime = 0;

    // Perception
    this.canSee = false;
    this.sightTime = 0;       // seconds of continuous sight, drives aim error
    this.lostSightTime = 0;
    this.reactionTimer = 0;
    this.reactionDelay = 0;
    this.lastKnownPos = new THREE.Vector3();

    // Weapon
    this.ammo = BOT.magSize;
    this.fireTimer = 0;
    this.burstLeft = 0;
    this.burstPause = 0;

    // Movement intent
    this.patrolIndex = 0;
    this.moveTarget = null;
    this.strafeDir = 1;
    this.strafeTimer = 0;
    this.lookTimer = 0;
    this.lookYawOffset = 0;

    // Animation
    this.phase = 0;           // gait phase in radians
    this.speedNorm = 0;       // 0..1 blend weight for the walk cycle
    this.breathe = Math.random() * Math.PI * 2;
    this.deathTime = 0;
    this.deathTumble = 0;
    this.respawnTimer = 0;
    this.muzzleFlashTime = 0;

    /** Called with (damage) when the bot lands a shot on the player. */
    this.onShootPlayer = null;
    /** Called with (muzzleWorldPos, dirWorld, didHit) on every round fired. */
    this.onFire = null;

    // Scene construction is guarded so the math above is testable in Node.
    if (scene) {
      const built = buildBotModel();
      this.model = built.root;
      this.joints = built.joints;
      this.model.position.copy(spawnPos);
      scene.add(this.model);

      this.muzzleFlash = new THREE.PointLight(0xffc070, 0, 6, 2);
      this.joints.muzzle.add(this.muzzleFlash);
    }

    this.pickNextPatrolPoint();
  }

  get alive() { return this.state !== BotState.DEAD; }

  /** Feet position — the model root and the AI's ground reference. */
  get feet() {
    return new THREE.Vector3(
      this.position.x, this.position.y - BOT.height / 2, this.position.z);
  }

  /** Eye position, used for line-of-sight and as the shot origin. */
  get eye() {
    return new THREE.Vector3(
      this.position.x,
      this.position.y - BOT.height / 2 + BOT.eyeHeight,
      this.position.z,
    );
  }

  get forward() {
    return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  // -------------------------------------------------------------------------
  // Combat surface
  // -------------------------------------------------------------------------

  /**
   * Hitscan against the bot's hitboxes. Origin/dir in world space, dir normalised.
   * @returns {{part:string, multiplier:number, point:THREE.Vector3, distance:number}|null}
   */
  raycastHitbox(origin, dir, maxDist = 1000) {
    if (!this.alive) return null;

    const feet = this.feet;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);

    let best = null;
    for (const box of HITBOXES) {
      // Rotate the local offset into world space around Y.
      const lx = box.x ?? 0;
      const cx = feet.x + lx * cos;
      const cz = feet.z - lx * sin;
      const center = { x: cx, y: feet.y + box.y, z: cz };

      const t = raySphere(origin, dir, center, box.r, maxDist);
      if (t === null) continue;
      if (!best || t < best.distance) {
        best = {
          part: box.part,
          multiplier: HITBOX_MULT[box.part],
          distance: t,
          point: new THREE.Vector3(
            origin.x + dir.x * t, origin.y + dir.y * t, origin.z + dir.z * t),
        };
      }
    }
    return best;
  }

  takeDamage(amount, hitPoint) {
    if (!this.alive) return;
    this.health -= amount;

    // Getting shot from behind is how bots find you — same as CS.
    if (hitPoint) {
      this.lastKnownPos.copy(hitPoint);
      if (this.state === BotState.PATROL) {
        this.setState(BotState.ALERT);
        this.reactionDelay = rand(BOT.reactionMin, BOT.reactionMax);
        this.reactionTimer = 0;
      }
    }

    if (this.health <= 0) this.die(hitPoint);
  }

  die(hitPoint) {
    this.health = 0;
    this.setState(BotState.DEAD);
    this.deathTime = 0;
    this.respawnTimer = BOT.respawnDelay;
    this.velocity.set(0, 0, 0);

    // Fall away from the shot. Not physics, just a direction to topple in.
    if (hitPoint) {
      const dx = this.position.x - hitPoint.x;
      const dz = this.position.z - hitPoint.z;
      this.deathTumble = Math.atan2(dx, dz) - this.yaw;
    } else {
      this.deathTumble = rand(-0.6, 0.6);
    }
  }

  respawn() {
    this.position.copy(this.spawnPos);
    this.position.y += BOT.height / 2;
    this.velocity.set(0, 0, 0);
    this.health = BOT.health;
    this.ammo = BOT.magSize;
    this.burstLeft = 0;
    this.sightTime = 0;
    this.canSee = false;
    this.deathTime = 0;
    this.setState(BotState.PATROL);
    this.pickNextPatrolPoint();
    if (this.model) this.model.visible = true;
  }

  setState(next) {
    if (this.state === next) return;
    this.state = next;
    this.stateTime = 0;
  }

  // -------------------------------------------------------------------------
  // Perception
  // -------------------------------------------------------------------------

  /** Cone test + a real LOS raycast against the map. */
  checkVision(playerEye) {
    const eye = this.eye;
    // The cone is tested against the AIM direction, not the body: a bot that has
    // turned its torso to look down a corridor should see down that corridor.
    const fwd = { x: Math.sin(this.aimYaw), y: 0, z: Math.cos(this.aimYaw) };
    if (!inViewCone(eye, fwd, playerEye, BOT.fovDeg, BOT.sightRange)) return false;

    const dir = new THREE.Vector3().subVectors(playerEye, eye);
    const dist = dir.length();
    if (dist < 1e-4) return true;
    dir.multiplyScalar(1 / dist);

    const hit = this.world.raycast(eye, dir, dist);
    // Anything solid between us and the player blocks sight.
    return !hit || hit.distance >= dist - 0.05;
  }

  // -------------------------------------------------------------------------
  // Update
  // -------------------------------------------------------------------------

  /**
   * @param {number} dt
   * @param {THREE.Vector3} playerEye
   * @param {THREE.Vector3} playerPos  player capsule centre
   */
  update(dt, playerEye, playerPos) {
    this.stateTime += dt;
    this.muzzleFlashTime = Math.max(0, this.muzzleFlashTime - dt);

    if (this.state === BotState.DEAD) {
      this.deathTime += dt;
      this.respawnTimer -= dt;
      this.applyGravityOnly(dt);
      if (this.respawnTimer <= 0) this.respawn();
      this.animate(dt);
      return;
    }

    // Perception runs every frame regardless of state.
    const sees = this.checkVision(playerEye);
    this.canSee = sees;
    if (sees) {
      this.sightTime += dt;
      this.lostSightTime = 0;
      this.lastKnownPos.copy(playerPos);
      this.reactionTimer += dt;
    } else {
      this.lostSightTime += dt;
      // Sight confidence bleeds off rather than resetting, so a bot that
      // briefly loses you behind a crate doesn't have to re-aim from scratch.
      this.sightTime = Math.max(0, this.sightTime - dt * 1.5);
      this.reactionTimer = 0;
    }

    switch (this.state) {
      case BotState.PATROL: this.updatePatrol(dt); break;
      case BotState.ALERT: this.updateAlert(dt, playerPos); break;
      case BotState.ENGAGE: this.updateEngage(dt, playerEye, playerPos); break;
      case BotState.RELOAD: this.updateReload(dt, playerPos); break;
    }

    this.applyPhysics(dt);
    this.animate(dt);
  }

  updatePatrol(dt) {
    if (this.canSee) {
      this.setState(BotState.ALERT);
      this.reactionDelay = rand(BOT.reactionMin, BOT.reactionMax);
      this.reactionTimer = 0;
      return;
    }

    this.walkToward(this.moveTarget, BOT.walkSpeed, dt);

    // Idle scanning: sweep the aim yaw around the walk direction so the bot
    // looks like it's checking angles rather than staring at its feet.
    this.lookTimer -= dt;
    if (this.lookTimer <= 0) {
      this.lookTimer = rand(1.2, 2.8);
      this.lookYawOffset = rand(-0.7, 0.7);
    }
    this.aimYaw = damp(this.aimYaw, this.yaw + this.lookYawOffset, 3, dt);
    this.aimPitch = damp(this.aimPitch, 0, 3, dt);

    if (this.moveTarget &&
        this.horizDistTo(this.moveTarget) < 0.9) this.pickNextPatrolPoint();
  }

  updateAlert(dt, playerPos) {
    // Reaction gate: the bot has seen the player but hasn't reacted yet. It
    // turns toward the contact, and only after the delay does it engage.
    this.faceTarget(this.lastKnownPos, dt, 9);
    this.velocity.x = damp(this.velocity.x, 0, 8, dt);
    this.velocity.z = damp(this.velocity.z, 0, 8, dt);

    if (this.canSee && this.reactionTimer >= this.reactionDelay) {
      this.setState(BotState.ENGAGE);
      this.burstLeft = 0;
      this.burstPause = 0.05;
      return;
    }

    if (!this.canSee) {
      // Hunt toward the last known position for a while, then give up.
      if (this.lostSightTime > BOT.loseSightGrace) {
        this.setState(BotState.PATROL);
        this.pickNextPatrolPoint();
      } else if (this.horizDistTo(this.lastKnownPos) > 2) {
        this.walkToward(this.lastKnownPos, BOT.runSpeed * 0.75, dt);
      }
    }
  }

  updateEngage(dt, playerEye, playerPos) {
    if (this.ammo <= 0) { this.setState(BotState.RELOAD); return; }

    if (!this.canSee) {
      if (this.lostSightTime > 0.6) { this.setState(BotState.ALERT); }
      // Keep aiming at where they were for the grace period.
      this.faceTarget(this.lastKnownPos, dt, 8);
      this.decelerate(dt);
      return;
    }

    this.faceTarget(playerEye, dt, 12);

    // Strafe: CS bots don't plant. Flip direction on a timer, or immediately if
    // the strafe is blocked, so they shuffle in cover instead of hugging a wall.
    this.strafeTimer -= dt;
    if (this.strafeTimer <= 0) {
      this.strafeTimer = rand(0.45, 1.1);
      this.strafeDir = Math.random() < 0.5 ? -1 : 1;
    }

    const toPlayer = new THREE.Vector3().subVectors(playerPos, this.position);
    toPlayer.y = 0;
    const dist = toPlayer.length();
    if (dist > 1e-4) toPlayer.multiplyScalar(1 / dist);
    const right = new THREE.Vector3(toPlayer.z, 0, -toPlayer.x);

    const wish = right.clone().multiplyScalar(this.strafeDir);
    // Close the gap if far, back off if uncomfortably close.
    if (dist > 14) wish.addScaledVector(toPlayer, 0.9);
    else if (dist < 4.5) wish.addScaledVector(toPlayer, -0.8);
    if (wish.lengthSq() > 1e-6) wish.normalize();

    this.accelerateXZ(wish, BOT.strafeSpeed, dt);
    this.tryFire(dt, playerEye, playerPos, dist);
  }

  updateReload(dt, playerPos) {
    this.decelerate(dt);
    // Break line of sight if we can — just back away from the last known spot.
    if (this.stateTime < BOT.reloadTime * 0.6) {
      const away = new THREE.Vector3().subVectors(this.position, this.lastKnownPos);
      away.y = 0;
      if (away.lengthSq() > 1e-4) {
        away.normalize();
        this.accelerateXZ(away, BOT.walkSpeed, dt);
      }
    }
    this.faceTarget(this.lastKnownPos, dt, 5);

    if (this.stateTime >= BOT.reloadTime) {
      this.ammo = BOT.magSize;
      this.setState(this.canSee ? BotState.ENGAGE : BotState.ALERT);
    }
  }

  // -------------------------------------------------------------------------
  // Firing
  // -------------------------------------------------------------------------

  tryFire(dt, playerEye, playerPos, dist) {
    this.fireTimer -= dt;

    if (this.burstLeft <= 0) {
      this.burstPause -= dt;
      if (this.burstPause > 0) return;
      this.burstLeft = Math.round(rand(BOT.burstMin, BOT.burstMax));
    }

    if (this.fireTimer > 0) return;
    this.fireTimer = BOT.fireRate;
    this.burstLeft--;
    this.ammo--;
    if (this.burstLeft <= 0) this.burstPause = rand(BOT.burstPauseMin, BOT.burstPauseMax);
    if (this.ammo <= 0) this.setState(BotState.RELOAD);

    this.muzzleFlashTime = 0.045;

    // Accuracy. The error cone shrinks with sustained sight; a fresh peek is a
    // spray, a bot that has watched you for 1.5s is dangerous.
    const err = aimErrorFor(this.sightTime);
    // roll^0.5 biases toward the edge of the cone — a flat roll makes bots hit
    // far too often because most of the disc area is near the rim.
    const roll = Math.sqrt(Math.random());
    // Player torso is roughly 0.35m wide as a target.
    const hit = shotConnects(err, dist, 0.35, roll);

    if (this.onFire) {
      const origin = this.eye;
      const dir = new THREE.Vector3().subVectors(playerEye, origin).normalize();
      // Scatter the visual ray by the same error so tracers match the outcome.
      const off = err * roll;
      dir.x += Math.cos(roll * 100) * off;
      dir.y += Math.sin(roll * 100) * off * 0.6;
      dir.normalize();
      this.onFire(origin, dir, hit);
    }

    if (hit && this.onShootPlayer) {
      this.onShootPlayer(BOT.damage * damageFalloff(dist));
    }
  }

  // -------------------------------------------------------------------------
  // Movement
  // -------------------------------------------------------------------------

  pickNextPatrolPoint() {
    if (!this.patrolPoints.length) { this.moveTarget = null; return; }
    this.patrolIndex = (this.patrolIndex + 1) % this.patrolPoints.length;
    this.moveTarget = this.patrolPoints[this.patrolIndex];
  }

  horizDistTo(p) {
    return Math.hypot(p.x - this.position.x, p.z - this.position.z);
  }

  /** Turn the body (and aim) toward a world point. */
  faceTarget(target, dt, rate) {
    const wantYaw = Math.atan2(target.x - this.position.x, target.z - this.position.z);
    this.yaw += angleDelta(this.yaw, wantYaw) * (1 - Math.exp(-rate * 0.6 * dt));
    this.aimYaw += angleDelta(this.aimYaw, wantYaw) * (1 - Math.exp(-rate * dt));

    const eye = this.eye;
    const horiz = Math.hypot(target.x - eye.x, target.z - eye.z);
    const wantPitch = Math.atan2(target.y - eye.y, Math.max(horiz, 1e-3));
    this.aimPitch = damp(this.aimPitch, clamp(wantPitch, -0.7, 0.7), rate, dt);
  }

  walkToward(target, speed, dt) {
    if (!target) { this.decelerate(dt); return; }
    const dir = new THREE.Vector3(target.x - this.position.x, 0, target.z - this.position.z);
    const d = dir.length();
    if (d < 1e-4) { this.decelerate(dt); return; }
    dir.multiplyScalar(1 / d);

    // Face where we're going; walking sideways looks wrong on a biped.
    const wantYaw = Math.atan2(dir.x, dir.z);
    this.yaw += angleDelta(this.yaw, wantYaw) * (1 - Math.exp(-5 * dt));

    this.accelerateXZ(dir, speed, dt);
  }

  accelerateXZ(wishDir, wishSpeed, dt) {
    const target = wishDir.clone().multiplyScalar(wishSpeed);
    this.velocity.x = damp(this.velocity.x, target.x, BOT.accel, dt);
    this.velocity.z = damp(this.velocity.z, target.z, BOT.accel, dt);
  }

  decelerate(dt) {
    this.velocity.x = damp(this.velocity.x, 0, 10, dt);
    this.velocity.z = damp(this.velocity.z, 0, 10, dt);
  }

  applyPhysics(dt) {
    if (this.grounded && this.velocity.y <= 0) this.velocity.y = 0;
    else this.velocity.y -= BOT.gravity * dt;

    const out = {};
    this.world.moveSlide(this.position, this.half, this.velocity, dt, out);
    this.world.depenetrate(this.position, this.half);
    this.grounded = out.grounded || this.probeGround();

    // Stuck against geometry while patrolling? Skip to the next waypoint rather
    // than grinding a wall forever.
    // ponytail: no navmesh, so patrol points must be mutually visible-ish.
    // Upgrade path: A* over a coarse grid baked from the collision brushes.
    if (this.state === BotState.PATROL &&
        Math.hypot(this.velocity.x, this.velocity.z) < 0.25) {
      this.stuckTime = (this.stuckTime || 0) + dt;
      if (this.stuckTime > 1.2) { this.stuckTime = 0; this.pickNextPatrolPoint(); }
    } else {
      this.stuckTime = 0;
    }
  }

  applyGravityOnly(dt) {
    if (!this.grounded) this.velocity.y -= BOT.gravity * dt;
    else this.velocity.y = 0;
    this.velocity.x = damp(this.velocity.x, 0, 6, dt);
    this.velocity.z = damp(this.velocity.z, 0, 6, dt);
    const out = {};
    this.world.moveSlide(this.position, this.half, this.velocity, dt, out);
    this.world.depenetrate(this.position, this.half);
    this.grounded = out.grounded || this.probeGround();
  }

  probeGround(tolerance = 0.06) {
    const probe = this.position.clone();
    probe.y += tolerance;
    const hit = this.world.sweep(probe, this.half, new THREE.Vector3(0, -tolerance * 2, 0));
    if (!hit || hit.normal.y <= 0.7) return false;
    this.position.y = probe.y - tolerance * 2 * hit.t;
    if (this.velocity.y < 0) this.velocity.y = 0;
    return true;
  }

  // -------------------------------------------------------------------------
  // Procedural animation
  // -------------------------------------------------------------------------

  /**
   * The whole rig is driven from three signals: gait phase, a 0..1 locomotion
   * blend weight, and the aim offset between body yaw and aim yaw. Poses are
   * written absolutely each frame (not accumulated) so state changes can't drift.
   */
  animate(dt) {
    if (!this.model) return;
    const J = this.joints;

    this.model.position.copy(this.feet);

    if (this.state === BotState.DEAD) { this.animateDeath(dt); return; }

    // --- Gait phase advances by DISTANCE, not time. This is the single thing
    // that stops the legs sliding: stride length is fixed, so at half speed the
    // cycle runs at half rate and the feet stay planted relative to the ground.
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    // One full cycle = TWO steps, so this is the distance covered by a left
    // and a right step together. For a 1.80m human that is ~1.5m; 0.82 made
    // the cycle run at nearly double rate, which is what made the legs look
    // like they were shuffling and skating rather than striding.
    const strideLength = 1.5;
    this.phase += (speed * dt / strideLength) * Math.PI * 2;
    if (this.phase > Math.PI * 4) this.phase -= Math.PI * 4;

    // Blend weight ramps in over the walk range, so a bot creeping at 0.3 m/s
    // gets a small shuffle rather than a full march.
    const target = clamp(speed / BOT.runSpeed, 0, 1);
    this.speedNorm = damp(this.speedNorm, target, 8, dt);
    const w = this.speedNorm;
    // Amplitude scales sub-linearly: walking and running differ in cadence more
    // than in swing angle.
    const amp = Math.pow(clamp(speed / BOT.runSpeed, 0, 1), 0.65);

    const p = this.phase;
    const sinP = Math.sin(p), cosP = Math.cos(p);
    this.breathe += dt * 1.6;

    // --- Hips: vertical bob at 2x gait (one dip per footfall), lateral sway at
    // 1x (weight shifts onto the planted leg), plus breathing at rest.
    // Pelvis rises at midstance (support leg straight under the body) and dips
    // at double-support. cos(2p) gives both halves of that travel; -|sin| only
    // ever went DOWN, so the body read as a constant slight crouch with no
    // rise-and-fall at all — the main reason the walk looked floaty.
    const bob = Math.cos(p * 2) * 0.032 * amp;
    const idleBreath = Math.sin(this.breathe) * 0.008 * (1 - w);
    // Flight phase: past a jog the body is briefly airborne between steps, so
    // the whole rig lifts around the double-support moments. Ramped in from
    // half speed, because a walk always keeps one foot down.
    const airborne = Math.max(0, w - 0.5) * 2;
    const flight = Math.max(0, -Math.cos(p * 2)) * 0.045 * airborne;
    J.hips.position.y = HIPS_Y + bob + idleBreath + flight;
    J.hips.position.x = cosP * 0.022 * amp;
    J.hips.rotation.z = -cosP * 0.055 * amp;   // pelvis tilt toward the swing leg
    J.hips.rotation.y = sinP * 0.10 * amp;     // pelvis counter-rotation
    // Lean into the run. Quadratic in speed so a walk stays near-upright while
    // a sprint commits — a runner's mass has to be ahead of their feet or the
    // stride reads as marching rather than driving forward.
    J.hips.rotation.x = 0.03 + w * w * 0.30;

    // --- Torso. Aim offset is the yaw difference between where the feet point
    // and where the gun points; the spine absorbs it so the bot can strafe
    // sideways while still covering the player.
    const aimOff = clamp(angleDelta(this.yaw, this.aimYaw), -1.3, 1.3);
    J.spine.rotation.y = damp(J.spine.rotation.y, aimOff * 0.4 - sinP * 0.06 * amp, 14, dt);
    J.spine.rotation.x = damp(J.spine.rotation.x, -this.aimPitch * 0.15, 10, dt);
    J.spine.rotation.z = sinP * 0.03 * amp;

    J.chest.rotation.y = damp(J.chest.rotation.y, aimOff * 0.6, 14, dt);
    J.chest.rotation.x = damp(J.chest.rotation.x,
      -this.aimPitch * 0.35 + Math.sin(this.breathe) * 0.012 * (1 - w), 10, dt);

    // --- Head: tracks the aim target but only within neck limits, and lags the
    // torso slightly so it reads as looking rather than being welded on.
    const headTargetYaw = clamp(aimOff - (J.spine.rotation.y + J.chest.rotation.y), -0.85, 0.85);
    this.headYaw = damp(this.headYaw, headTargetYaw, 9, dt);
    this.headPitch = damp(this.headPitch,
      clamp(-this.aimPitch * 0.5, -0.5, 0.5), 9, dt);
    J.head.rotation.y = this.headYaw;
    // Counter the body's forward lean so the head stays level and eyes stay on
    // the target. Without this the bot sprints staring at the ground.
    J.head.rotation.x = this.headPitch + Math.abs(sinP) * 0.02 * amp
      - J.hips.rotation.x * 0.75;
    J.head.rotation.z = -cosP * 0.03 * amp;

    this.animateLegs(p, amp, dt);
    this.animateArms(p, amp, w, dt);

    if (this.muzzleFlash) {
      this.muzzleFlash.intensity = this.muzzleFlashTime > 0 ? 14 : 0;
    }
  }

  /**
   * Leg cycle. Each leg runs a two-phase loop: swing (foot off the ground,
   * knee bends a lot to clear) and stance (foot planted, leg nearly straight,
   * rotating back under the body). The asymmetry between them is what reads as
   * walking; a pure sine on both hip and knee reads as a marionette.
   */
  animateLegs(p, amp, dt) {
    const J = this.joints;
    for (const side of ['L', 'R']) {
      const ph = side === 'L' ? p : p + Math.PI;
      // Real gait is ~60% stance / 40% swing, not the 50/50 a plain sine gives.
      // Warping the phase so the swing half passes faster is what produces the
      // whip through the air and the slow, weighted drive back underneath.
      const warped = ph - 0.22 * Math.sin(ph * 2);
      const s = Math.sin(warped), c = Math.cos(warped);

      // All three angles are offsets from the STANDING pose (P.restHip etc), so
      // at amp=0 the leg settles into a soft-knee stand rather than snapping
      // straight and driving the sole through the floor.
      // Hip swings fore/aft. Slight forward bias so the bot leans into its stride.
      const hipAngle = P.restHip + s * 0.62 * amp + 0.06 * amp;

      // Knee: only flexes on the swing half. max(0, -cos) gates it to the half
      // of the cycle where the foot is airborne. Knees never hyperextend.
      const swing = Math.max(0, -c);
      // ADDS to restKnee: more positive = more folded. Subtracting drove the
      // joint toward (and past) straight, hyperextending it backwards.
      const kneeAngle = P.restKnee + (swing * swing * 1.15 + 0.10) * amp;

      // Ankle. Now that there is an actual foot forward of this pivot, the
      // ankle drives the visible part of the gait: positive rotation.x pitches
      // the toe DOWN (plantarflex), negative lifts it (dorsiflex).
      //   stance, late  (c ~ -1..0 rising)  -> toe-off, toe pushes down
      //   swing, early  (swing high)        -> dorsiflex to clear the ground
      //   swing, late   (s ~ +1)            -> level out for heel-strike
      const heelStrike = Math.max(0, s) * (1 - swing);
      const restAnkle = -(P.restHip + P.restKnee);   // keeps the sole flat at rest
      const ankleAngle = restAnkle +
        (c * 0.40 - swing * 0.34 - heelStrike * 0.14) * amp;

      const hip = J[`hip${side}`], knee = J[`knee${side}`], ankle = J[`ankle${side}`];
      // Damping rates DESCEND down the chain so each joint lags its parent
      // slightly. Equal rates move the whole leg in lockstep, which is the
      // marionette look; the lag is what reads as follow-through.
      hip.rotation.x = damp(hip.rotation.x, hipAngle, 34, dt);
      // Splay slightly outward so the legs don't scissor through each other.
      hip.rotation.z = damp(hip.rotation.z, (side === 'L' ? 1 : -1) * 0.045, 12, dt);
      knee.rotation.x = damp(knee.rotation.x, kneeAngle, 26, dt);
      ankle.rotation.x = damp(ankle.rotation.x, ankleAngle, 20, dt);
    }
  }

  /**
   * Arms. Both hands stay on the rifle, so unlike a normal walk cycle the arms
   * cannot counter-swing freely — the whole weapon assembly sways as a unit and
   * the elbows absorb the difference. This is what a carried-rifle walk is.
   */
  animateArms(p, amp, w, dt) {
    const J = this.joints;
    const sinP = Math.sin(p);
    const aiming = this.state === BotState.ENGAGE || this.state === BotState.ALERT;

    // Weapon sway: idle drift plus a bigger jostle while moving. Damped so it
    // never snaps when the bot starts or stops.
    const swayX = Math.sin(this.breathe * 0.7) * 0.045 * (1 - w * 0.6) + sinP * 0.09 * amp;
    const swayY = Math.cos(this.breathe * 0.53) * 0.035 * (1 - w * 0.6);

    // These angles are SOLVED, not eyeballed: a search over the arm chain for
    // the pose that puts the right fist on the pistol grip with the barrel
    // level and forward, then the left arm onto the resulting foregrip. Nudging
    // any of them by more than ~0.1 rad breaks the two-handed grip.
    const rShoulderX = aiming ? -0.05 : -0.30;
    const rShoulderY = aiming ? 0.20 : 0.16;
    const rShoulderZ = aiming ? 0.00 : -0.10;
    const rElbow = aiming ? -1.72 : -1.50;
    const rElbowY = -0.40;

    // Left arm crosses the body to the foregrip. This is the closed triangle
    // that reads as "person holding a gun" rather than "gun floating nearby".
    const lShoulderX = aiming ? -0.60 : -0.44;
    const lShoulderY = aiming ? 0.80 : 0.62;
    const lShoulderZ = aiming ? -0.80 : -0.55;
    const lElbow = aiming ? 0.00 : -0.20;
    const lElbowY = -1.00;

    const R = J.shoulderR, L = J.shoulderL;
    R.rotation.x = damp(R.rotation.x, rShoulderX + swayX * 0.5, 9, dt);
    R.rotation.y = damp(R.rotation.y, rShoulderY, 9, dt);
    R.rotation.z = damp(R.rotation.z, rShoulderZ + swayY, 9, dt);
    J.elbowR.rotation.x = damp(J.elbowR.rotation.x, rElbow - swayX * 0.35, 9, dt);
    J.elbowR.rotation.y = damp(J.elbowR.rotation.y, rElbowY, 9, dt);

    L.rotation.x = damp(L.rotation.x, lShoulderX + swayX * 0.5, 9, dt);
    L.rotation.y = damp(L.rotation.y, lShoulderY, 9, dt);
    L.rotation.z = damp(L.rotation.z, lShoulderZ + swayY, 9, dt);
    J.elbowL.rotation.x = damp(J.elbowL.rotation.x, lElbow - swayX * 0.35, 9, dt);
    J.elbowL.rotation.y = damp(J.elbowL.rotation.y, lElbowY, 9, dt);

    // Rifle pivots about the PISTOL GRIP (see GRIP_OFFSET), so these rotations
    // turn the weapon in the fist rather than swinging the hand. Solved so the
    // barrel points down +Z with the muzzle level at ~1.22m — chest height.
    // Recoil kicks it up and settles fast: the visible tell that it is firing.
    const recoil = this.muzzleFlashTime > 0 ? 0.16 : 0;
    J.rifle.rotation.set(
      damp(J.rifle.rotation.x, 1.86 + recoil, 30, dt),
      damp(J.rifle.rotation.y, -0.35, 12, dt),
      damp(J.rifle.rotation.z, aiming ? -0.40 : -0.20, 10, dt),
    );
    J.rifle.position.set(0, 0, 0);

    // Snap the left hand onto the foregrip. Two-bone IK would be nicer, but a
    // direct world-space placement of the hand pivot is exact and costs one
    // matrix update — and this joint carries no geometry of its own beyond the
    // fist, so nothing shears.
    // ponytail: positional snap, no elbow-plane solve. If the left arm ever
    // needs to look right from behind, swap in a proper 2-bone IK here.
    this.snapLeftHandToForegrip();
  }

  /**
   * Place the LEFT hand on the rifle's foregrip so both arms close a triangle
   * onto the weapon. Reads the rifle's world matrix, so it must run after the
   * arm poses above are written.
   */
  snapLeftHandToForegrip() {
    const J = this.joints;
    if (!J.rifle || !J.handL) return;
    if (!this._gripLocal) this._gripLocal = new THREE.Vector3(0, FOREGRIP.y, FOREGRIP.z);
    if (!this._gripWorld) this._gripWorld = new THREE.Vector3();

    // Both chains hang off the chest, so updating from there is enough.
    J.chest.updateMatrixWorld(true);
    this._gripWorld.copy(this._gripLocal).applyMatrix4(J.rifle.matrixWorld);
    J.handL.parent.worldToLocal(this._gripWorld);
    // Clamp the reach so a bad aim pose can never rip the hand off the forearm.
    const maxReach = 0.14;
    const rest = -P.lowerArm - 0.005;
    this._gripWorld.y -= 0;
    const dx = this._gripWorld.x, dy = this._gripWorld.y - rest, dz = this._gripWorld.z;
    const d = Math.hypot(dx, dy, dz);
    const k = d > maxReach ? maxReach / d : 1;
    J.handL.position.set(dx * k, rest + dy * k, dz * k);
  }

  /**
   * Death: a two-second collapse. The legs buckle first, the torso folds, then
   * the whole root topples in the tumble direction and settles flat.
   * ponytail: keyframed collapse rather than a ragdoll solver. It costs nothing
   * and never explodes. Swap for verlet-constrained bones if bodies need to
   * drape over crates.
   */
  animateDeath(dt) {
    const J = this.joints;
    const t = clamp(this.deathTime / 1.6, 0, 1);
    // Ease-out: the initial buckle is fast, the settle is slow.
    const e = 1 - Math.pow(1 - t, 3);

    // Buckle: knees give way in the first third, dropping the hips.
    const buckle = clamp(this.deathTime / 0.5, 0, 1);
    J.hips.position.y = HIPS_Y * (1 - buckle * 0.55);

    // Topple about the tumble axis. Rotating the ROOT (not the hips) is what
    // makes the body end up lying on the ground rather than folded in place.
    this.model.rotation.y = this.yaw;
    this.model.rotation.x = Math.cos(this.deathTumble) * e * (Math.PI / 2) * 0.95;
    this.model.rotation.z = Math.sin(this.deathTumble) * e * (Math.PI / 2) * 0.95;

    J.hips.rotation.set(e * 0.35, 0, 0);
    J.spine.rotation.set(e * 0.30, e * 0.12, 0);
    J.chest.rotation.set(e * 0.22, -e * 0.18, 0);
    // Head lolls, and keeps lolling slightly after the body has stopped.
    J.head.rotation.set(e * 0.55, -e * 0.4, e * 0.25);

    // Limbs go slack and splay.
    J.shoulderL.rotation.set(-0.3 + e * 0.9, 0, 0.9 + e * 0.5);
    J.shoulderR.rotation.set(-0.3 + e * 0.7, 0, -0.9 - e * 0.5);
    J.elbowL.rotation.x = -0.9 + e * 0.55;
    J.elbowR.rotation.x = -0.9 + e * 0.55;
    J.hipL.rotation.set(e * 0.45, 0, 0.22);
    J.hipR.rotation.set(e * 0.20, 0, -0.15);
    J.kneeL.rotation.x = P.restKnee + e * 0.85;
    J.kneeR.rotation.x = P.restKnee + e * 0.45;

    if (this.muzzleFlash) this.muzzleFlash.intensity = 0;

    // Fade out just before respawn so bodies don't pop.
    if (this.respawnTimer < 0.4) this.model.visible = false;
  }

  dispose() {
    if (!this.model) return;
    this.model.traverse(o => {
      if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); }
    });
    this.scene.remove(this.model);
  }
}

// ---------------------------------------------------------------------------
// Headless self-check. Run: node src/ai/bot.js
// ---------------------------------------------------------------------------

export function _testBot() {
  let passed = 0, failed = 0;
  const check = (name, fn) => {
    try { fn(); passed++; console.log(`  ok    ${name}`); }
    catch (e) { failed++; console.log(`  FAIL  ${name}\n        ${e.message}`); }
  };
  const assert = (c, m) => { if (!c) throw new Error(m); };

  const O = { x: 0, y: 0, z: 0 };
  const FWD = { x: 0, y: 0, z: 1 };

  check('FOV cone accepts a target dead ahead', () => {
    assert(inViewCone(O, FWD, { x: 0, y: 0, z: 10 }, BOT.fovDeg, BOT.sightRange),
      'should see straight ahead');
  });

  check('FOV cone rejects a target directly behind', () => {
    assert(!inViewCone(O, FWD, { x: 0, y: 0, z: -10 }, BOT.fovDeg, BOT.sightRange),
      'must not see behind');
  });

  check('FOV cone rejects targets outside the half-angle', () => {
    // 110 deg full cone => 55 deg half. 70 deg off-axis must fail, 40 must pass.
    const at = deg => ({
      x: Math.sin(deg * Math.PI / 180) * 10, y: 0, z: Math.cos(deg * Math.PI / 180) * 10,
    });
    assert(inViewCone(O, FWD, at(40), 110, 50), '40deg should be inside');
    assert(!inViewCone(O, FWD, at(70), 110, 50), '70deg should be outside');
    assert(inViewCone(O, FWD, at(-40), 110, 50), 'cone must be symmetric');
  });

  check('FOV cone rejects targets beyond sight range', () => {
    assert(!inViewCone(O, FWD, { x: 0, y: 0, z: BOT.sightRange + 1 }, BOT.fovDeg, BOT.sightRange),
      'out of range must fail');
  });

  check('damage multipliers apply per part', () => {
    assert(damageForHit(26, 'head') === 26 * 4, 'head should be 4x');
    assert(damageForHit(26, 'chest') === 26, 'chest should be 1x');
    assert(damageForHit(26, 'stomach') === 26 * 1.25, 'stomach should be 1.25x');
    assert(damageForHit(26, 'leg') === 26 * 0.75, 'leg should be 0.75x');
    assert(damageForHit(26, 'arm') === 26 * 0.75, 'arm should be 0.75x');
    assert(damageForHit(26, 'nonsense') === 26, 'unknown part falls back to 1x');
  });

  check('one headshot with the bot rifle is lethal to 100hp', () => {
    assert(damageForHit(BOT.damage, 'head') >= 100, 'head should one-shot');
    assert(damageForHit(BOT.damage, 'chest') < 100, 'chest must not one-shot');
  });

  check('aim error decreases with sustained visibility', () => {
    const e0 = aimErrorFor(0);
    const e1 = aimErrorFor(BOT.aimSettleTime * 0.5);
    const e2 = aimErrorFor(BOT.aimSettleTime);
    assert(e0 > e1 && e1 > e2, `error must decay monotonically: ${e0} ${e1} ${e2}`);
    assert(Math.abs(e0 - BOT.aimErrorMax) < 1e-9, 'fresh sight uses max error');
    assert(Math.abs(e2 - BOT.aimErrorMin) < 1e-9, 'settled sight uses min error');
    assert(Math.abs(aimErrorFor(99) - BOT.aimErrorMin) < 1e-9, 'clamps past settle time');
  });

  check('fresh acquisitions miss more than settled aim', () => {
    // Same deterministic rolls, both at 15m against a 0.35m torso.
    let fresh = 0, settled = 0;
    for (let i = 0; i < 100; i++) {
      const roll = i / 100;
      if (shotConnects(aimErrorFor(0), 15, 0.35, roll)) fresh++;
      if (shotConnects(aimErrorFor(BOT.aimSettleTime), 15, 0.35, roll)) settled++;
    }
    assert(settled > fresh, `settled (${settled}) should out-hit fresh (${fresh})`);
    assert(fresh > 0, 'fresh aim should still land some rounds');
    assert(settled < 100, 'settled aim must still miss sometimes');
  });

  check('shot connection respects distance', () => {
    const err = aimErrorFor(0.5);
    const roll = 0.9;
    assert(shotConnects(err, 3, 0.35, roll), 'point blank should connect');
    assert(!shotConnects(err, 60, 0.35, roll), 'long range with error should miss');
  });

  check('damage falloff is 1x near and clamps far', () => {
    assert(damageFalloff(5) === 1, 'inside falloff start is full damage');
    assert(damageFalloff(BOT.damageFalloffEnd + 20) === BOT.damageFalloffMin, 'clamps at min');
    const mid = damageFalloff((BOT.damageFalloffStart + BOT.damageFalloffEnd) / 2);
    assert(mid < 1 && mid > BOT.damageFalloffMin, `midpoint should interpolate, got ${mid}`);
  });

  check('reaction delay gates firing', () => {
    // Simulate the ALERT gate: sight is continuous, but firing waits.
    const delay = 0.28;
    let timer = 0, firedAt = null;
    const dt = 1 / 128;
    for (let i = 0; i < 128 && firedAt === null; i++) {
      timer += dt;
      if (timer >= delay) firedAt = timer;
    }
    assert(firedAt !== null, 'should eventually fire');
    assert(firedAt >= delay, 'must not fire before the delay elapses');
    assert(firedAt < delay + dt * 2, `should fire promptly after, got ${firedAt}`);
    assert(BOT.reactionMin >= 0.18 && BOT.reactionMax <= 0.35, 'delay range is human');
  });

  check('ray-sphere hits a target ahead and misses one behind', () => {
    const dir = { x: 0, y: 0, z: 1 };
    assert(raySphere(O, dir, { x: 0, y: 0, z: 5 }, 0.2, 50) !== null, 'ahead should hit');
    assert(raySphere(O, dir, { x: 0, y: 0, z: -5 }, 0.2, 50) === null, 'behind should miss');
    assert(raySphere(O, dir, { x: 2, y: 0, z: 5 }, 0.2, 50) === null, 'offset should miss');
    assert(raySphere(O, dir, { x: 0, y: 0, z: 5 }, 0.2, 3) === null, 'beyond maxDist misses');
  });

  check('hitboxes span a human silhouette without gaps', () => {
    // Fire a horizontal ray at every 5cm of height through the model centre and
    // assert the body is continuously covered from knee to crown.
    const dir = { x: 0, y: 0, z: 1 };
    for (let y = 0.25; y <= 1.75; y += 0.05) {
      const origin = { x: 0, y, z: -5 };
      const anyHit = HITBOXES.some(b =>
        (b.x ?? 0) === 0 && raySphere(origin, dir, { x: 0, y: b.y, z: 0 }, b.r, 50) !== null);
      assert(anyHit, `no hitbox covers height ${y.toFixed(2)}m`);
    }
  });

  check('head hitbox sits above the chest hitbox', () => {
    const head = HITBOXES.find(b => b.part === 'head');
    const chest = HITBOXES.find(b => b.part === 'chest');
    assert(head.y - head.r > chest.y, 'head must be clear of the chest box');
    assert(head.y + head.r < BOT.height + 0.5, 'head should be at human height');
  });

  check('angleDelta takes the short way round', () => {
    assert(Math.abs(angleDelta(3.0, -3.0) - 0.2831853) < 1e-4,
      `should wrap forward, got ${angleDelta(3.0, -3.0)}`);
    assert(Math.abs(angleDelta(0, Math.PI / 2) - Math.PI / 2) < 1e-9, 'simple case');
    assert(Math.abs(angleDelta(1, 1)) < 1e-9, 'no delta to self');
  });

  check('damp converges and is stable at large dt', () => {
    let v = 0;
    for (let i = 0; i < 200; i++) v = damp(v, 10, 8, 1 / 128);
    assert(Math.abs(v - 10) < 0.05, `should converge, got ${v}`);
    // A 1-second frame must not overshoot — this is why it is exponential.
    assert(damp(0, 10, 8, 1) <= 10, 'must never overshoot the target');
  });

  // --- Model geometry. buildBotModel() is pure Three.js with no DOM and no
  // renderer, so the whole rig can be measured headlessly. These are the checks
  // that would otherwise need a screenshot.
  const model = buildBotModel();
  model.root.updateMatrixWorld(true);
  const worldY = name => {
    const v = new THREE.Vector3();
    model.joints[name].getWorldPosition(v);
    return v.y;
  };
  const bounds = obj => new THREE.Box3().setFromObject(obj);

  check('model measures 1.80m tall and stands on the ground plane', () => {
    const b = bounds(model.root);
    const h = b.max.y - b.min.y;
    assert(Math.abs(h - P.height) < 0.03, `height should be ~1.80m, got ${h.toFixed(3)}`);
    // Root origin is the feet, so the soles must sit on y=0, not float or sink.
    assert(Math.abs(b.min.y) < 0.03, `soles should touch y=0, got ${b.min.y.toFixed(3)}`);
  });

  check('joint heights match human proportions', () => {
    const hip = worldY('hipL'), sh = worldY('shoulderL'), head = worldY('head');
    // Hip at HALF body height is the number that stops the bot reading stilt-like.
    assert(Math.abs(hip - P.height / 2) < 0.03,
      `hip should be at ~0.90m (half height), got ${hip.toFixed(3)}`);
    assert(sh > 1.40 && sh < 1.52, `shoulder should be ~1.46m, got ${sh.toFixed(3)}`);
    assert(head > sh, 'head must sit above the shoulder');
    // ~7.5 heads tall: a 1.80m figure over a 0.23m head.
    const heads = P.height / (P.headR * 2);
    assert(heads > 7.0 && heads < 8.2, `should be ~7.5 heads tall, got ${heads.toFixed(2)}`);
  });

  check('feet extend forward of the ankle and rotate with it', () => {
    for (const side of ['L', 'R']) {
      const ankle = model.joints[`ankle${side}`];
      const pivot = new THREE.Vector3();
      ankle.getWorldPosition(pivot);
      const fb = bounds(ankle);
      const forward = fb.max.z - pivot.z;
      const behind = pivot.z - fb.min.z;
      assert(forward > 0.14, `${side} foot must extend forward, got ${forward.toFixed(3)}`);
      assert(forward > behind * 1.5,
        `${side} foot mass must be mostly forward of the ankle (${forward.toFixed(3)} vs ${behind.toFixed(3)})`);
      const len = fb.max.z - fb.min.z;
      assert(len > 0.22 && len < 0.34, `${side} foot should be ~0.27m, got ${len.toFixed(3)}`);
      // Rotating the ankle must carry the foot with it — that is the whole
      // point of parenting the boot to the joint rather than to the shin.
      ankle.rotation.x += 0.5;
      ankle.updateMatrixWorld(true);
      const after = bounds(ankle);
      assert(Math.abs(after.max.y - fb.max.y) > 0.01, `${side} foot must follow the ankle`);
      ankle.rotation.x -= 0.5;
      ankle.updateMatrixWorld(true);
    }
  });

  check('every mesh casts shadow and uses a lit standard material', () => {
    let meshes = 0, flat = 0;
    model.root.traverse(o => {
      if (!o.isMesh) return;
      meshes++;
      assert(o.castShadow, 'every part must cast a shadow');
      assert(o.material.isMeshStandardMaterial, 'parts must use MeshStandardMaterial');
      // Near-black parts are what made the old bot read as an unlit placeholder.
      // THREE.Color stores linear values, so convert back to the sRGB the
      // palette was authored in before judging brightness.
      const c = o.material.color.clone().convertLinearToSRGB();
      if ((c.r + c.g + c.b) / 3 < 0.13) flat++;
    });
    assert(meshes > 40 && meshes <= 80, `mesh budget is ~70, got ${meshes}`);
    assert(flat === 0, `${flat} parts are near-black and will read as unlit`);
    // Colour variety: a single flat tone is the other half of the placeholder look.
    const tones = new Set();
    model.root.traverse(o => { if (o.isMesh) tones.add(o.material.color.getHex()); });
    assert(tones.size >= 8, `expected varied per-part colour, got ${tones.size} tones`);
  });

  check('knees fold backward, never forward, across the whole gait cycle', () => {
    // The model faces -Z, so a correctly bent knee puts the ankle at MORE +z
    // than the knee. This shipped inverted once: both rest angles satisfied the
    // standing-height constraint while bending the joint the wrong way, and
    // nothing caught it because the pose still stood up straight.
    // Tested on the JOINT ANGLE, not on world positions: at heel-strike the
    // hip legitimately swings the whole leg forward, so the ankle can lead the
    // knee in world space with the joint itself perfectly straight. What must
    // never happen is the knee angle going negative — that is the joint
    // hinging the wrong way.
    for (let amp of [0, 0.5, 1]) {
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const swing = Math.max(0, -Math.cos(a));
        const kneeAngle = P.restKnee + (swing * swing * 1.15 + 0.10) * amp;
        assert(kneeAngle > 0,
          `knee angle ${kneeAngle.toFixed(3)} <= 0 at phase ${i}, amp ${amp}: ` +
          `the joint is hinging forward`);
      }
    }
    assert(P.restKnee > 0, `restKnee must be positive (folds back), got ${P.restKnee}`);
    assert(P.restHip < 0, `restHip must be negative (thigh back), got ${P.restHip}`);
  });

  check('limb segments overlap at every joint so no gaps open when posed', () => {
    // Drive the rig through a full gait cycle and assert the child limb's
    // geometry always reaches back over its parent pivot.
    const pairs = [['hipL', 'kneeL'], ['kneeL', 'ankleL'], ['shoulderL', 'elbowL']];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      model.joints.hipL.rotation.x = Math.sin(a) * 0.62 + P.restHip;
      model.joints.kneeL.rotation.x = P.restKnee + Math.max(0, -Math.cos(a)) * 1.15;
      model.joints.shoulderL.rotation.x = -1.2 + Math.sin(a) * 0.3;
      model.root.updateMatrixWorld(true);
      for (const [, childName] of pairs) {
        const child = model.joints[childName];
        const pivot = new THREE.Vector3();
        child.getWorldPosition(pivot);
        const cb = bounds(child);
        // The child's own geometry must enclose its pivot point, which means it
        // overlaps back into the parent segment rather than leaving a hole.
        assert(cb.min.y <= pivot.y + 1e-3 && cb.max.y >= pivot.y - 1e-3,
          `${childName} geometry leaves a gap at its joint (phase ${i})`);
      }
    }
    model.joints.hipL.rotation.x = P.restHip;
    model.joints.kneeL.rotation.x = P.restKnee;
    model.joints.shoulderL.rotation.x = 0;
    model.root.updateMatrixWorld(true);
  });

  check('the rifle is parented to the right hand and sits at chest height', () => {
    // Parenting is what makes the weapon read as held rather than floating.
    let p = model.joints.rifle.parent, found = false;
    while (p) { if (p === model.joints.handR) { found = true; break; } p = p.parent; }
    assert(found, 'rifle must be a descendant of the right hand');
    // Pose the arms the way animateArms() does when aiming, then check height,
    // barrel direction, and that BOTH hands are on the weapon.
    model.joints.shoulderR.rotation.set(-0.05, 0.20, 0.00);
    model.joints.elbowR.rotation.set(-1.72, -0.40, 0);
    model.joints.shoulderL.rotation.set(-0.60, 0.80, -0.80);
    model.joints.elbowL.rotation.set(0.00, -1.00, 0);
    model.joints.rifle.rotation.set(1.86, -0.35, -0.40);
    model.joints.rifle.position.set(0, 0, 0);
    model.root.updateMatrixWorld(true);

    const gun = new THREE.Vector3();
    model.joints.rifle.getWorldPosition(gun);
    assert(gun.y > 1.05, `weapon should be at chest height, not the waist (${gun.y.toFixed(2)})`);
    const muzzle = new THREE.Vector3();
    model.joints.muzzle.getWorldPosition(muzzle);
    // Barrel must point forward and level, not at the sky — that was the bug
    // where the folded forearm aimed the whole weapon upward.
    const barrel = muzzle.clone().sub(gun).normalize();
    assert(barrel.z > 0.9, `barrel must point forward, got z=${barrel.z.toFixed(2)}`);
    assert(Math.abs(barrel.y) < 0.2, `barrel must be level, got y=${barrel.y.toFixed(2)}`);

    // The closed arms-to-weapon triangle: the right fist is on the pistol grip
    // (the rifle pivot) and the left hand reaches the foregrip.
    const handR = new THREE.Vector3(), handL = new THREE.Vector3();
    model.joints.handR.getWorldPosition(handR);
    model.joints.handL.getWorldPosition(handL);
    assert(handR.distanceTo(gun) < 0.12,
      `right hand must be on the grip, off by ${handR.distanceTo(gun).toFixed(3)}m`);
    const fore = new THREE.Vector3(0, FOREGRIP.y, FOREGRIP.z)
      .applyMatrix4(model.joints.rifle.matrixWorld);
    // animate() snaps the left hand the rest of the way; the pose only has to
    // land inside that snap's reach clamp.
    assert(handL.distanceTo(fore) < 0.14,
      `left hand must reach the foregrip, off by ${handL.distanceTo(fore).toFixed(3)}m`);
  });

  check('hitbox spheres stay inside the model silhouette', () => {
    const b = bounds(model.root);
    for (const box of HITBOXES) {
      assert(box.y - box.r > -0.05, `${box.part} hitbox dips below the feet`);
      assert(box.y + box.r < b.max.y + 0.12,
        `${box.part} hitbox at ${box.y} overshoots the ${b.max.y.toFixed(2)}m crown`);
      assert(Math.abs(box.x ?? 0) + box.r < 0.45, `${box.part} hitbox is wider than the body`);
    }
    const head = HITBOXES.find(h => h.part === 'head');
    // The head sphere must actually sit on the modelled head, not near it.
    assert(Math.abs(head.y - worldY('head') - 0.09) < 0.09,
      `head hitbox (${head.y}) is off the modelled head (pivot ${worldY('head').toFixed(2)})`);
  });

  check('bot health and rifle damage give a sane time-to-kill', () => {
    const perChest = damageForHit(BOT.damage, 'chest');
    const rounds = Math.ceil(BOT.health / perChest);
    assert(rounds >= 3 && rounds <= 5, `expected 3-5 chest rounds, got ${rounds}`);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  return failed;
}

// Executed directly (node src/ai/bot.js) rather than imported by the game.
if (typeof process !== 'undefined' && process.argv?.[1]?.endsWith('bot.js')) {
  process.exit(_testBot() ? 1 : 0);
}
