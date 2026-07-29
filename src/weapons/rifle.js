import * as THREE from 'three';

// AK-equivalent rifle: CS-style hitscan, learnable spray pattern, viewmodel.
//
// The whole design splits in two halves on purpose:
//   - RecoilState / spreadFor / patternOffset are PURE MATH over plain numbers.
//     No THREE objects, no DOM. That half is what _testRecoil() exercises.
//   - Rifle owns the Three.js scene graph and only ever *reads* the math half.
// If the feel is wrong, it is wrong in the first half, and you can bisect it
// headlessly with `node src/weapons/rifle.js --test`.

export const RIFLE = {
  rpm: 600,
  magSize: 30,
  reloadTime: 2.4,
  damage: 36,
  // CS falloff: damage *= falloff^(distance/500u). 500u ~ 9.5m at our scale.
  falloff: 0.98,
  falloffUnit: 9.5,
  maxRange: 120,

  // Recoil pattern scale, in radians per pattern unit. The pattern arrays below
  // are authored in abstract units so the shape is readable; this is the knob
  // that makes the whole spray bigger or smaller without changing its shape.
  recoilScale: 0.0075,
  // How fast accumulated recoil decays once the trigger is released (1/s).
  recoverRate: 9.0,
  // Fraction of the kick the view actually recovers. CS pulls the view back
  // down to (near) the original aim; 1.0 is a full return.
  recoverFraction: 1.0,
  // Random jitter added on top of the pattern, in pattern units. Small — the
  // pattern must dominate or it stops being learnable.
  patternJitter: 0.11,

  // Spread, in radians of cone half-angle.
  spreadBase: 0.00045,      // standing still, standing up: near-perfect
  spreadCrouch: 0.45,       // multiplier when crouched
  spreadMove: 0.0016,       // per (m/s) of horizontal speed
  spreadAir: 0.055,         // flat airborne penalty — jumping shots are useless
  spreadPerShot: 0.0022,    // per consecutive shot, up to the cap
  spreadShotCap: 12,        // consecutive shots after which spread stops growing
  // Consecutive-shot counter decays this fast (shots/s) while not firing —
  // this drives the SPREAD recovering, which is gradual.
  shotDecayRate: 6.0,
  // Idle time before the spray PATTERN restarts from shot 1. Fixed, not
  // proportional to spray length: in CS a one-second pause resets you to the
  // top of the pattern whether you fired 3 rounds or 30.
  patternResetTime: 0.65,
};

// The classic AK spray: hard vertical climb for ~10 shots, then a left sweep,
// then back across to the right, then a loose figure-of-eight. Authored as
// per-shot DELTAS in pattern units: +y is up on screen, +x is right.
// ponytail: 30 hand-authored entries rather than a curve fit. It is a lookup
// table either way, and a table you can read is a table you can tune.
const PATTERN = [
  [0.00, 0.00], // shot 1 lands on the crosshair, always
  [0.05, 1.55], [-0.10, 1.70], [0.08, 1.80], [-0.06, 1.75],
  [0.12, 1.60], [-0.15, 1.45], [0.10, 1.30], [-0.20, 1.10], [0.05, 0.95],
  // Left sweep — the part everyone learns second.
  [-0.85, 0.55], [-1.10, 0.35], [-1.25, 0.20], [-1.15, 0.05], [-0.90, -0.05],
  // Back across to the right.
  [0.60, 0.10], [1.15, 0.15], [1.35, 0.05], [1.30, -0.05], [1.05, 0.00],
  // Loose weave at the tail: still fixed, just less steep.
  [0.55, 0.20], [-0.35, 0.25], [-0.80, 0.10], [-0.70, -0.10], [-0.25, -0.05],
  [0.45, 0.15], [0.85, 0.10], [0.70, -0.10], [0.25, 0.05], [-0.30, 0.10],
];

/**
 * Deterministic per-shot recoil offset in pattern units.
 * `rand` is injected so tests can pass a constant and get exact repeatability;
 * the game passes Math.random.
 * @returns {{x:number, y:number}} offset in pattern units
 */
export function patternOffset(shotIndex, rand = Math.random) {
  // Past the end of the table the spray just repeats the tail weave. Only
  // matters for the 30th+ shot of a mag that cannot hold 31, so: cheap.
  const p = PATTERN[Math.min(shotIndex, PATTERN.length - 1)];
  const j = RIFLE.patternJitter;
  return {
    x: p[0] + (rand() * 2 - 1) * j,
    y: p[1] + (rand() * 2 - 1) * j * 0.6, // vertical is tighter — it must be
  };
}

/**
 * Spread cone half-angle in radians. Pure function of the shooter's state.
 * @param {{speed:number, airborne:boolean, crouching:boolean, consecutive:number}} s
 */
export function spreadFor(s) {
  let spread = RIFLE.spreadBase;
  spread += (s.speed || 0) * RIFLE.spreadMove;
  if (s.airborne) spread += RIFLE.spreadAir;
  const shots = Math.min(s.consecutive || 0, RIFLE.spreadShotCap);
  spread += shots * RIFLE.spreadPerShot;
  // Crouching scales everything, including the accumulated spray penalty —
  // that is why crouch-spraying is viable in CS and jump-spraying is not.
  if (s.crouching) spread *= RIFLE.spreadCrouch;
  return spread;
}

/** Damage after distance falloff. */
export function damageAt(distance) {
  return RIFLE.damage * Math.pow(RIFLE.falloff, distance / RIFLE.falloffUnit);
}

/**
 * Accumulated recoil + consecutive-shot bookkeeping. Plain numbers only.
 * `pitch`/`yaw` are the CURRENT view offset applied on top of the player's aim.
 */
export class RecoilState {
  constructor() {
    this.pitch = 0;        // radians, positive = view pushed up
    this.yaw = 0;          // radians, positive = view pushed right
    this.shotIndex = 0;    // index into the pattern
    this.consecutive = 0;  // fractional, decays over time
    this.idle = 0;         // seconds since the last shot
    this.triggerHeld = false;
  }

  /** Apply one shot's worth of pattern kick. */
  kick(rand = Math.random) {
    const o = patternOffset(this.shotIndex, rand);
    this.pitch += o.y * RIFLE.recoilScale;
    this.yaw += o.x * RIFLE.recoilScale;
    this.shotIndex++;
    this.consecutive++;
    this.idle = 0;
    return o;
  }

  /**
   * Decay toward zero. CS only recovers while the trigger is NOT held — holding
   * it keeps the view parked where the pattern put it, which is what makes
   * pulling down a learnable skill rather than an automatic correction.
   */
  update(dt) {
    if (this.triggerHeld) return;
    this.idle += dt;

    const k = Math.exp(-RIFLE.recoverRate * dt);
    const keep = 1 - (1 - k) * RIFLE.recoverFraction;
    this.pitch *= keep;
    this.yaw *= keep;
    this.consecutive = Math.max(0, this.consecutive - RIFLE.shotDecayRate * dt);
    // Pattern reset is on a fixed idle timer, independent of how long the
    // spread takes to bleed off — a 30-round spray must not take five seconds
    // to return you to the top of the pattern.
    if (this.idle >= RIFLE.patternResetTime) this.shotIndex = 0;
  }

  reset() {
    this.pitch = 0;
    this.yaw = 0;
    this.shotIndex = 0;
    this.consecutive = 0;
    this.idle = RIFLE.patternResetTime;
  }
}

/**
 * Perturb an aim direction into the spread cone. Separated out so the cone
 * sampling can be reasoned about without a camera in play.
 * Mutates and returns `dir` (assumed normalised).
 */
export function applySpread(dir, spread, rand = Math.random) {
  if (spread <= 0) return dir;
  // Uniform-in-disc sampling: sqrt keeps the density even instead of clumping
  // shots at the centre. CS's cone is roughly uniform, not gaussian.
  const r = Math.sqrt(rand()) * spread;
  const theta = rand() * Math.PI * 2;

  // Build a basis perpendicular to dir, avoiding the degenerate up-vector case.
  const up = Math.abs(dir.y) > 0.99 ? _SPREAD_ALT : _SPREAD_UP;
  _sx.crossVectors(dir, up).normalize();
  _sy.crossVectors(dir, _sx).normalize();

  dir.addScaledVector(_sx, Math.cos(theta) * r);
  dir.addScaledVector(_sy, Math.sin(theta) * r);
  return dir.normalize();
}

const _SPREAD_UP = new THREE.Vector3(0, 1, 0);
const _SPREAD_ALT = new THREE.Vector3(1, 0, 0);
const _sx = new THREE.Vector3();
const _sy = new THREE.Vector3();

// ---------------------------------------------------------------------------
// Scene-graph half
// ---------------------------------------------------------------------------

const MAX_DECALS = 64;
const MAX_SHELLS = 16;
const MAX_SPARKS = 24;
const MUZZLE_FLASH_TIME = 0.04;
const VIEWMODEL_FOV = 56;

export class Rifle {
  /**
   * @param {THREE.Scene} scene       world scene (decals, sparks live here)
   * @param {THREE.PerspectiveCamera} camera  world camera — hitscan origin
   * @param {import('../world/collision.js').CollisionWorld} collisionWorld
   * @param {{materials?:object, hitCallback?:Function}} [opts]
   */
  constructor(scene, camera, collisionWorld, opts = {}) {
    this.scene = scene;
    this.camera = camera;
    this.world = collisionWorld;
    this.hitCallback = opts.hitCallback || null;

    this.recoil = new RecoilState();
    this.ammo = RIFLE.magSize;
    this.reserve = 90;
    this.cooldown = 0;
    this.reloading = 0;
    this.shotInterval = 60 / RIFLE.rpm;
    this.time = 0;

    // Viewmodel animation state.
    this.bobPhase = 0;
    this.kickPos = new THREE.Vector3();   // spring position offset
    this.kickVel = new THREE.Vector3();
    this.kickRot = new THREE.Vector3();   // spring rotation offset (pitch,yaw,roll)
    this.kickRotVel = new THREE.Vector3();
    this.swayTarget = new THREE.Vector2();
    this.sway = new THREE.Vector2();
    this.lastYaw = 0;
    this.lastPitch = 0;

    // CLIPPING: the viewmodel lives in its OWN scene rendered by its OWN camera
    // in a second pass with the depth buffer cleared. The alternatives both
    // fail in practice: depthTest:false makes the gun's own parts render out of
    // order into a flat mess, and scaling it down near the camera still clips
    // on the near plane when you walk into a wall. A separate pass is what
    // every real engine does, and it also gets us the narrower weapon FOV for
    // free. Call renderViewmodel(renderer) after the world pass.
    this.vmScene = new THREE.Scene();
    this.vmCamera = new THREE.PerspectiveCamera(
      VIEWMODEL_FOV, innerWidthOr(16 / 9), 0.01, 10);
    this.vmRoot = new THREE.Group();
    this.vmScene.add(this.vmRoot);
    // The viewmodel scene needs its own light — it is not in the world scene,
    // so none of the map lighting reaches it.
    const key = new THREE.DirectionalLight(0xfff0d4, 3.4);
    key.position.set(-0.6, 1.0, 0.8);
    this.vmScene.add(key);
    // Rim from behind-right separates the weapon's top edge from the world
    // behind it; without it a dark receiver merges into whatever it overlaps.
    const rim = new THREE.DirectionalLight(0xbfd4f0, 1.6);
    rim.position.set(1.2, 0.6, -1.0);
    this.vmScene.add(rim);
    // Warm from below, standing in for bounce off the ground and the player's
    // own body — this is what keeps the underside from going solid black.
    const fill = new THREE.DirectionalLight(0xd9a877, 0.9);
    fill.position.set(0.2, -1.0, 0.4);
    this.vmScene.add(fill);
    this.vmScene.add(new THREE.HemisphereLight(0x9fb8d8, 0x6a5540, 1.4));

    this.buildViewmodel(opts.materials);
    this.buildEffects();
  }

  // -- construction ---------------------------------------------------------

  /**
   * AK-pattern rifle, composed from primitives. Gun-local axes: -Z is down the
   * barrel (camera forward), +X is the shooter's right, +Y up. The origin sits
   * at the front of the receiver so the whole thing straddles z ~ -0.62..+0.30.
   *
   * Deliberately NOT using the world material set here. Those are 1m-scale
   * textured materials for map geometry; on a 0.2m handguard the albedo tiles
   * into a blotchy mess and the normal map reads as noise. Plain standard
   * materials at the right colour beat a texture at the wrong scale.
   */
  buildViewmodel(_materials) {
    // METALNESS: the viewmodel scene has no environment map (the world's lives
    // on renderer.scene), and a fully metallic PBR surface with nothing to
    // reflect renders BLACK. So the steel here is deliberately semi-metallic
    // with a lifted base colour — it reads as parkerised steel under the three
    // viewmodel lights, where metalness:0.9 read as a silhouette.
    const metal = new THREE.MeshStandardMaterial({
      color: 0x3a3b41, roughness: 0.42, metalness: 0.35 });    // parkerised steel
    const worn = new THREE.MeshStandardMaterial({
      color: 0x55575e, roughness: 0.3, metalness: 0.45 });     // rubbed-bright edges
    const wood = new THREE.MeshStandardMaterial({
      color: 0x7a4a20, roughness: 0.68, metalness: 0.0 });     // AK laminate
    const woodDark = new THREE.MeshStandardMaterial({
      color: 0x633a17, roughness: 0.72, metalness: 0.0 });     // lower furniture
    const poly = new THREE.MeshStandardMaterial({
      color: 0x201e1c, roughness: 0.55, metalness: 0.1 });     // bakelite/polymer
    const bore = new THREE.MeshStandardMaterial({
      color: 0x1b1d21, roughness: 0.6, metalness: 0.25 });     // barrel, unpolished

    const gun = new THREE.Group();
    const box = (w, h, d, mat, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      gun.add(m);
      return m;
    };
    // Cylinders default to standing along Z (down the barrel); pass axis 'y'
    // for the ones that stay upright.
    const cyl = (rt, rb, h, mat, x, y, z, seg = 14, axis = 'z') => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
      if (axis === 'z') m.rotation.x = Math.PI / 2;
      m.position.set(x, y, z);
      gun.add(m);
      return m;
    };

    // -- receiver: a real box with a separate dust cover sitting proud of it --
    // Kept SHALLOW on purpose: the AK receiver is only ~55mm tall and it is the
    // dust cover's dome plus the magwell below that make up the visual mass.
    // A tall box here is exactly what made the old model read as a slab.
    box(0.058, 0.046, 0.285, metal, 0, 0.004, -0.070);         // receiver body
    box(0.064, 0.014, 0.115, metal, 0, -0.023, -0.115);        // magwell lip
    // Dust cover: slightly wider than the receiver, domed with a squashed half
    // cylinder — that rounded top is the AK's most-copied profile line.
    cyl(0.031, 0.031, 0.235, metal, 0, 0.027, -0.088, 16)
      .scale.set(1.0, 1.0, 0.38);                              // squashed = dome
    box(0.058, 0.012, 0.026, metal, 0, 0.038, -0.200);         // cover front lug
    // Rivet row — three tiny studs on the flat, sells the stamped receiver.
    for (let i = 0; i < 3; i++) {
      cyl(0.004, 0.004, 0.005, worn, 0.030, -0.010, -0.03 - i * 0.070, 8, 'y')
        .rotation.z = Math.PI / 2;
    }
    // Rear sight block + leaf, on the trunnion just ahead of the dust cover.
    box(0.044, 0.018, 0.028, metal, 0, 0.038, -0.222);
    box(0.010, 0.014, 0.007, poly, 0, 0.050, -0.220);          // sight notch
    // Selector lever: the long stamped bar down the right side.
    box(0.007, 0.046, 0.014, worn, 0.031, 0.006, -0.038);
    // Charging handle, right side, riding in its slot.
    box(0.018, 0.010, 0.046, worn, 0.036, 0.022, -0.135);
    box(0.011, 0.009, 0.028, worn, 0.028, 0.022, -0.162);

    // -- magazine: the silhouette. 4 segments, each rotated a bit more, so the
    // stack curves forward the way a 7.62x39 mag does. --------------------
    // Walk a point down the mag's centreline, turning a fixed amount per
    // segment. That accumulation is what actually produces a curve — the old
    // version set absolute rotations on segments at fixed offsets, which just
    // fanned them out around a common origin and read as a straight box.
    this.magParts = [];
    let mx = 0, my = -0.052, mz = -0.130, ma = -0.12; // ma = lean, radians
    const SEG = 0.048;
    for (let i = 0; i < 4; i++) {
      const w = 0.038 - i * 0.001;
      const m = box(w, SEG * 1.06, 0.072 - i * 0.002, poly, mx, my, mz);
      m.rotation.x = ma;
      this.magParts.push(m);
      // Spine rib on the front face of each segment — pressed reinforcement.
      const r = box(w * 0.9, 0.006, 0.008, metal, mx, my, mz - 0.038);
      r.rotation.x = ma;
      this.magParts.push(r);
      // Step down along the segment's own tilted axis, then lean further.
      my -= Math.cos(ma) * SEG;
      mz += Math.sin(ma) * SEG;   // +sin with negative ma walks the mag FORWARD
      ma -= 0.20;
    }
    // Floorplate: a brighter lip so the mag bottom reads as an edge, not a
    // fade-out. This is the deepest point of the weapon in the frame.
    const plate = box(0.040, 0.010, 0.070, worn, mx, my + 0.020, mz);
    plate.rotation.x = ma + 0.20;
    this.magParts.push(plate);
    this.magHome = this.magParts.map((m) => m.position.clone());

    // -- handguard: upper + lower wood, vents in the upper, gas tube above ----
    box(0.048, 0.034, 0.155, wood, 0, 0.036, -0.300);          // upper handguard
    const lower = box(0.052, 0.046, 0.170, woodDark, 0, -0.026, -0.292);
    lower.rotation.x = -0.03;                                  // slight downslope
    box(0.040, 0.014, 0.150, woodDark, 0, -0.049, -0.290);     // lower belly
    // Vent slots: dark slits cut into the sides of the upper handguard. Cheaper
    // than CSG — inset dark boxes at the surface read the same at this size.
    for (let i = 0; i < 3; i++) {
      const z = -0.262 - i * 0.040;
      box(0.050, 0.012, 0.022, poly, 0, 0.040, z);
    }
    // Gas tube: sits on top of the upper handguard, capped at the rear.
    cyl(0.0125, 0.0125, 0.150, metal, 0, 0.055, -0.300, 12);
    cyl(0.016, 0.016, 0.020, metal, 0, 0.055, -0.222, 12);     // gas tube collar

    // -- gas block, front sight, barrel --------------------------------------
    cyl(0.0105, 0.0105, 0.235, bore, 0, 0.004, -0.470, 14);    // barrel
    box(0.030, 0.048, 0.034, metal, 0, 0.022, -0.392);         // gas block
    box(0.020, 0.024, 0.020, metal, 0, 0.048, -0.392);         // gas port stub
    box(0.026, 0.040, 0.028, metal, 0, 0.020, -0.545);         // front sight base
    // Protective ears with the post standing between them.
    box(0.007, 0.030, 0.014, metal, -0.011, 0.052, -0.545);
    box(0.007, 0.030, 0.014, metal, 0.011, 0.052, -0.545);
    cyl(0.0035, 0.0035, 0.026, worn, 0, 0.052, -0.545, 8, 'y'); // front post
    box(0.020, 0.010, 0.030, metal, 0, -0.014, -0.545);        // cleaning-rod lug
    // Slant brake: flared, and cut away on one side like the real muzzle device.
    cyl(0.0175, 0.0155, 0.052, worn, 0, 0.004, -0.612, 14);
    cyl(0.0085, 0.0085, 0.020, bore, 0, 0.004, -0.632, 12);    // bore recess

    // -- grip, trigger, trigger guard ----------------------------------------
    // Grip sits well BEHIND the magazine (+z) so the two read as separate
    // shapes. Overlapping them is what made the old model's underside mush.
    const grip = box(0.030, 0.100, 0.042, poly, 0, -0.076, 0.058);
    grip.rotation.x = 0.34;
    box(0.033, 0.012, 0.046, poly, 0, -0.122, 0.074).rotation.x = 0.34; // grip cap
    // Trigger guard: four thin bars forming an actual loop, so you can see
    // daylight through it. A solid block here reads as a lump.
    box(0.022, 0.006, 0.062, metal, 0, -0.048, 0.016);         // guard bottom bar
    box(0.022, 0.022, 0.006, metal, 0, -0.038, -0.012);        // guard front strap
    box(0.022, 0.020, 0.006, metal, 0, -0.039, 0.044);         // guard rear strap
    box(0.007, 0.020, 0.009, worn, 0, -0.040, 0.010);          // trigger blade

    // -- stock: goes back toward the camera and off-frame, which is correct ---
    // The AK stock is a narrow wrist that swells to the butt, not a plank. It
    // is also the biggest thing in frame at this angle, so it gets a real
    // taper: a 4-sided cylinder is a wedge for free and reads far better than
    // a constant-section box.
    const wrist = new THREE.Mesh(
      new THREE.CylinderGeometry(0.019, 0.026, 0.145, 4), wood);
    wrist.rotation.set(Math.PI / 2 - 0.10, Math.PI / 4, 0);
    wrist.position.set(0, -0.028, 0.150);
    gun.add(wrist);
    const butt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.026, 0.030, 0.100, 4), wood);
    butt.rotation.set(Math.PI / 2 - 0.10, Math.PI / 4, 0);
    butt.position.set(0, -0.048, 0.262);
    gun.add(butt);
    box(0.034, 0.058, 0.012, poly, 0, -0.056, 0.310);          // butt plate
    // Tang: kept narrower than the receiver so it tucks under the rear of it
    // rather than reading as a separate block bolted on the back.
    box(0.030, 0.030, 0.050, wood, 0, -0.014, 0.086);

    for (const c of gun.children) { c.castShadow = false; c.receiveShadow = false; }

    // Resting pose, tuned against screenshots. Lower-right quarter, barrel
    // angled in toward screen centre. Three constraints fight here:
    //   - Y cannot go below about -0.11: the mag hangs to y ~ -0.24 in gun
    //     space, and any lower crops the magazine off the bottom edge, which
    //     is the one feature that makes the weapon identifiable.
    //   - YAW past ~0.3 turns the stock broadside to the camera and it fills
    //     the right half of the frame as a slab.
    //   - Negative PITCH is what tips the receiver's left side into view; at
    //     0 the camera looks down the top and the gun reads as a plank.
    // Scale 0.58 keeps the muzzle clear of the crosshair at screen centre.
    gun.scale.setScalar(0.58);
    gun.position.set(0.140, -0.100, -0.370);
    gun.rotation.set(-0.15, 0.21, 0.10);
    this.gun = gun;
    this.gunHome = { pos: gun.position.clone(), rot: gun.rotation.clone() };
    this.vmRoot.add(gun);

    // Muzzle marker: where flash and shells attach, in gun-local space. Must
    // track the brake — it moved forward when the barrel got shorter.
    this.muzzle = new THREE.Object3D();
    this.muzzle.position.set(0, 0.004, -0.642);
    gun.add(this.muzzle);
    // Eject port: right side of the receiver, under the dust cover lip.
    this.ejectPort = new THREE.Object3D();
    this.ejectPort.position.set(0.036, 0.026, -0.075);
    gun.add(this.ejectPort);

    this.buildMuzzleFlash();
  }

  buildMuzzleFlash() {
    // Flash geometry: two crossed quads so it reads as volumetric from any
    // angle without needing a real billboard sprite or a texture file.
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffd070,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.flashMat = mat;
    this.flash = new THREE.Group();
    for (let i = 0; i < 2; i++) {
      const q = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), mat);
      q.rotation.y = i * Math.PI / 2;
      this.flash.add(q);
    }
    this.flash.visible = false;
    this.muzzle.add(this.flash);

    // A real light so the flash actually lifts the gun and nearby geometry.
    // ponytail: the light lives in the viewmodel scene only, so it lights the
    // gun but not the world. Add a second one to the world scene if you want
    // muzzle flash on walls — costs a shadow-less point light per shot.
    this.flashLight = new THREE.PointLight(0xffc860, 0, 3.5, 2);
    this.muzzle.add(this.flashLight);
  }

  buildEffects() {
    // Decal pool: one shared geometry, per-instance mesh. A ring buffer means
    // the oldest decal is silently recycled once we hit the cap.
    const decalGeo = new THREE.PlaneGeometry(0.075, 0.075);
    const decalMat = new THREE.MeshBasicMaterial({
      color: 0x2e2b28,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
    });
    this.decals = [];
    this.decalCursor = 0;
    for (let i = 0; i < MAX_DECALS; i++) {
      const m = new THREE.Mesh(decalGeo, decalMat);
      m.visible = false;
      m.renderOrder = 1;
      this.scene.add(m);
      this.decals.push(m);
    }

    // Shell pool.
    const shellGeo = new THREE.CylinderGeometry(0.0045, 0.0045, 0.019, 6);
    const shellMat = new THREE.MeshStandardMaterial({
      color: 0xc9a03a, roughness: 0.35, metalness: 0.9 });
    this.shells = [];
    for (let i = 0; i < MAX_SHELLS; i++) {
      const m = new THREE.Mesh(shellGeo, shellMat);
      m.visible = false;
      this.scene.add(m);
      this.shells.push({
        mesh: m,
        life: 0,
        vel: new THREE.Vector3(),
        spin: new THREE.Vector3(),
      });
    }
    this.shellCursor = 0;

    // Spark/puff pool: tiny additive quads that fly off the impact point.
    const sparkGeo = new THREE.PlaneGeometry(0.02, 0.02);
    const sparkMat = new THREE.MeshBasicMaterial({
      color: 0xffd9a0,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.sparkMat = sparkMat;
    this.sparks = [];
    for (let i = 0; i < MAX_SPARKS; i++) {
      const m = new THREE.Mesh(sparkGeo, sparkMat);
      m.visible = false;
      this.scene.add(m);
      this.sparks.push({ mesh: m, life: 0, vel: new THREE.Vector3() });
    }
    this.sparkCursor = 0;

    this.flashTimer = 0;
  }

  // -- input ----------------------------------------------------------------

  setTriggerHeld(held) {
    this.recoil.triggerHeld = !!held;
  }

  reload() {
    if (this.reloading > 0 || this.ammo === RIFLE.magSize || this.reserve <= 0) return;
    this.reloading = RIFLE.reloadTime;
  }

  /**
   * Fire one round if the weapon is ready.
   * @returns {null | {point:THREE.Vector3, normal:THREE.Vector3, distance:number, damage:number}}
   */
  fire() {
    if (this.cooldown > 0 || this.reloading > 0 || this.ammo <= 0) return null;
    this.cooldown = this.shotInterval;
    this.ammo--;

    // Hitscan from the CAMERA CENTRE, not the muzzle. This is load-bearing:
    // firing from the muzzle means the gun's offset from the eye makes shots
    // miss around corners you can see past, and lets you shoot through a wall
    // your barrel is clipping into. CS fires from the eye; so do we.
    const origin = this.camera.getWorldPosition(new THREE.Vector3());
    const dir = this.camera.getWorldDirection(new THREE.Vector3());

    const spread = spreadFor(this.aimState);
    applySpread(dir, spread);

    const hit = this.world.raycast(origin, dir, RIFLE.maxRange);

    // Recoil and cosmetics happen regardless of whether we hit anything.
    this.recoil.kick();
    this.triggerKick();
    this.spawnShell();
    this.flashTimer = MUZZLE_FLASH_TIME;
    this.flash.rotation.z = Math.random() * Math.PI * 2; // no two flashes alike
    const s = 0.8 + Math.random() * 0.5;
    this.flash.scale.set(s, s, s);

    if (!hit) return null;

    const normal = this.surfaceNormal(hit.point, dir);
    this.spawnDecal(hit.point, normal);
    this.spawnSparks(hit.point, normal);

    const info = {
      point: hit.point,
      normal,
      distance: hit.distance,
      damage: damageAt(hit.distance),
    };
    if (this.hitCallback) this.hitCallback(info.point, info.normal, info.distance);
    return info;
  }

  /**
   * CollisionWorld.raycast reports distance and point but not a normal, so
   * recover it from the hit point: the map is axis-aligned boxes, so the face
   * is whichever axis the point sits flattest against. Probing 6 short rays
   * back from just off the surface is cheap and needs no changes to collision.js.
   * ponytail: if collision.js ever returns a normal, delete this whole method.
   */
  surfaceNormal(point, dir) {
    const back = point.clone().addScaledVector(dir, -0.02);
    let best = null;
    let bestDist = Infinity;
    for (const axis of NORMAL_PROBES) {
      // Only faces we could actually have hit — those pointing back at us.
      if (axis.dot(dir) >= 0) continue;
      const probe = this.world.raycast(back, axis.clone().negate(), 0.06);
      if (probe && probe.distance < bestDist) {
        bestDist = probe.distance;
        best = axis;
      }
    }
    // Fall back to facing the shooter if the probes are inconclusive (corners).
    return best ? best.clone() : dir.clone().negate();
  }

  // -- effects --------------------------------------------------------------

  spawnDecal(point, normal) {
    const d = this.decals[this.decalCursor];
    this.decalCursor = (this.decalCursor + 1) % MAX_DECALS;
    // Lift off the surface: polygonOffset handles most z-fighting, but a
    // physical gap is what survives a depth-prepass or a different GPU.
    d.position.copy(point).addScaledVector(normal, 0.004);
    d.lookAt(point.clone().add(normal));
    d.rotateZ(Math.random() * Math.PI * 2);
    const s = 0.8 + Math.random() * 0.5;
    d.scale.set(s, s, 1);
    d.visible = true;
  }

  spawnSparks(point, normal) {
    const n = 4;
    for (let i = 0; i < n; i++) {
      const p = this.sparks[this.sparkCursor];
      this.sparkCursor = (this.sparkCursor + 1) % MAX_SPARKS;
      p.mesh.position.copy(point).addScaledVector(normal, 0.01);
      p.mesh.visible = true;
      p.life = 0.16 + Math.random() * 0.14;
      p.maxLife = p.life;
      // Scatter into the hemisphere around the surface normal.
      p.vel.set(
        (Math.random() * 2 - 1),
        (Math.random() * 2 - 1),
        (Math.random() * 2 - 1),
      ).normalize().multiplyScalar(1.2 + Math.random() * 1.8);
      p.vel.addScaledVector(normal, 2.2);
    }
  }

  spawnShell() {
    const s = this.shells[this.shellCursor];
    this.shellCursor = (this.shellCursor + 1) % MAX_SHELLS;
    // Shells live in the WORLD scene (they should fall on the floor and be
    // occluded by it), so convert the eject port out of viewmodel space by
    // hand: viewmodel space is camera space, so camera.localToWorld does it.
    const local = this.ejectPort.position.clone().add(this.gun.position);
    s.mesh.position.copy(this.camera.localToWorld(local));

    const right = new THREE.Vector3();
    const up = new THREE.Vector3();
    this.camera.matrixWorld.extractBasis(right, up, new THREE.Vector3());
    s.vel.copy(right).multiplyScalar(2.0 + Math.random() * 1.0)
      .addScaledVector(up, 1.4 + Math.random() * 0.8);
    s.spin.set(
      (Math.random() * 2 - 1) * 22,
      (Math.random() * 2 - 1) * 22,
      (Math.random() * 2 - 1) * 22,
    );
    s.life = 3.0;
    s.mesh.visible = true;
  }

  updateEffects(dt) {
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      const t = Math.max(0, this.flashTimer / MUZZLE_FLASH_TIME);
      this.flash.visible = true;
      this.flashMat.opacity = t;
      this.flashLight.intensity = t * 6;
    } else if (this.flash.visible) {
      this.flash.visible = false;
      this.flashLight.intensity = 0;
    }

    for (const s of this.shells) {
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) { s.mesh.visible = false; continue; }
      s.vel.y -= 15.2 * dt; // same gravity as the player
      s.mesh.position.addScaledVector(s.vel, dt);
      s.mesh.rotation.x += s.spin.x * dt;
      s.mesh.rotation.y += s.spin.y * dt;
      s.mesh.rotation.z += s.spin.z * dt;
      // ponytail: no bounce, shells fall through the floor and expire. Add a
      // single downward raycast per shell per frame if that ever reads wrong.
    }

    for (const p of this.sparks) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.mesh.visible = false; continue; }
      p.vel.y -= 9 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.quaternion.copy(this.camera.quaternion); // cheap billboard
      const t = p.life / p.maxLife;
      p.mesh.scale.setScalar(0.4 + t * 0.9);
    }
    // One shared material means one opacity for all sparks. They are spawned in
    // bursts and live ~0.2s, so the visual difference is not worth per-particle
    // materials or a custom shader.
    this.sparkMat.opacity = 0.9;
  }

  // -- viewmodel animation --------------------------------------------------

  triggerKick() {
    // Impulse into the spring: back (+z), up (+y), and a small roll.
    this.kickVel.z += 1.55;
    this.kickVel.y += 0.42;
    this.kickRotVel.x -= 5.2;                                // muzzle rises
    this.kickRotVel.z += (Math.random() * 2 - 1) * 2.6;      // roll wobble
    this.kickRotVel.y += (Math.random() * 2 - 1) * 1.4;
  }

  animate(dt, speed, movement) {
    const g = this.gun;

    // Critically-damped-ish spring on both position and rotation kick.
    const stiff = 190, damp = 21;
    for (const [val, vel] of [[this.kickPos, this.kickVel], [this.kickRot, this.kickRotVel]]) {
      vel.addScaledVector(val, -stiff * dt);
      vel.multiplyScalar(Math.max(0, 1 - damp * dt));
      val.addScaledVector(vel, dt);
    }

    // Walk bob: phase advances with distance travelled, not with time, so the
    // bob stays locked to footfalls at any speed and stops dead when you stop.
    this.bobPhase += speed * dt * 6.4;
    const bobAmt = Math.min(speed / 4.6, 1) * (movement?.crouching ? 0.4 : 1);
    const bobX = Math.sin(this.bobPhase) * 0.016 * bobAmt;
    const bobY = -Math.abs(Math.cos(this.bobPhase)) * 0.014 * bobAmt;

    // Idle sway: slow lissajous so a stationary gun is not perfectly frozen.
    const idle = 1 - Math.min(speed / 2.0, 1);
    const swayX = Math.sin(this.time * 1.1) * 0.004 * idle;
    const swayY = Math.sin(this.time * 0.83 + 1.3) * 0.003 * idle;

    // Mouse sway: the gun lags the view, then catches up.
    this.sway.lerp(this.swayTarget, Math.min(1, dt * 9));

    // Airborne: drop the gun a little, like CS's jump viewmodel.
    const airDrop = movement && !movement.grounded ? -0.03 : 0;

    let rx = 0, ry = 0, rz = 0, px = 0, py = 0, pz = 0;
    if (this.reloading > 0) {
      const t = 1 - this.reloading / RIFLE.reloadTime;
      // Tilt in, hold, tilt back out.
      const tilt = Math.sin(Math.min(1, t * 1.25) * Math.PI);
      rz = tilt * 0.55;
      ry = tilt * 0.32;
      px = -tilt * 0.05;
      py = -tilt * 0.09;
      pz = tilt * 0.06;

      // Magazine drops out over the first third, new one seats in the last.
      const magOut = t < 0.34 ? t / 0.34 : (t > 0.62 ? 1 - (t - 0.62) / 0.38 : 1);
      const gone = magOut < 0.98;
      for (let i = 0; i < this.magParts.length; i++) {
        this.magParts[i].position.copy(this.magHome[i]);
        this.magParts[i].position.y -= magOut * 0.30;
        this.magParts[i].visible = gone;
      }
    } else {
      for (let i = 0; i < this.magParts.length; i++) {
        this.magParts[i].position.copy(this.magHome[i]);
        this.magParts[i].visible = true;
      }
    }

    g.position.set(
      this.gunHome.pos.x + bobX + swayX + this.sway.x + px + this.kickPos.x * 0.06,
      this.gunHome.pos.y + bobY + swayY + airDrop + py + this.kickPos.y * 0.05,
      this.gunHome.pos.z + pz + this.kickPos.z * 0.055,
    );
    g.rotation.set(
      this.gunHome.rot.x + rx + this.kickRot.x * 0.035 - this.sway.y * 1.6,
      this.gunHome.rot.y + ry + this.kickRot.y * 0.03 - this.sway.x * 1.9,
      this.gunHome.rot.z + rz + this.kickRot.z * 0.03 + bobX * 0.9,
    );
  }

  // -- frame ----------------------------------------------------------------

  /**
   * @param {number} dt
   * @param {{fire?:boolean, reload?:boolean}} input
   * @param {import('../player/movement.js').PlayerMovement} movement
   */
  update(dt, input = {}, movement = null) {
    this.time += dt;
    if (this.cooldown > 0) this.cooldown -= dt;

    if (input.reload) this.reload();
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        this.reloading = 0;
        const want = RIFLE.magSize - this.ammo;
        const take = Math.min(want, this.reserve);
        this.ammo += take;
        this.reserve -= take;
        this.recoil.reset();
      }
    }

    // Cache the shooter state the spread math needs, so fire() stays cheap and
    // the math half never has to know what a PlayerMovement is.
    const speed = movement
      ? Math.hypot(movement.velocity.x, movement.velocity.z)
      : 0;
    this.aimState = {
      speed,
      airborne: movement ? !movement.grounded : false,
      crouching: movement ? movement.crouching : false,
      consecutive: this.recoil.consecutive,
    };

    this.setTriggerHeld(!!input.fire);
    if (input.fire) this.fire();

    this.recoil.update(dt);

    // Mouse sway target from view delta. Camera yaw/pitch is owned elsewhere,
    // so read it off the camera rather than plumbing another parameter.
    const e = _euler.setFromQuaternion(this.camera.quaternion, 'YXZ');
    let dyaw = e.y - this.lastYaw;
    if (dyaw > Math.PI) dyaw -= Math.PI * 2;
    if (dyaw < -Math.PI) dyaw += Math.PI * 2;
    this.swayTarget.set(
      THREE.MathUtils.clamp(dyaw * 1.4, -0.035, 0.035),
      THREE.MathUtils.clamp((e.x - this.lastPitch) * 1.4, -0.03, 0.03),
    );
    this.lastYaw = e.y;
    this.lastPitch = e.x;

    this.animate(dt, speed, movement);
    this.updateEffects(dt);
  }

  /**
   * View offset the camera controller should ADD to the player's aim angles.
   * Kept as a getter rather than mutating the camera so the camera stays the
   * single owner of its own orientation.
   */
  get viewOffset() {
    return { pitch: this.recoil.pitch, yaw: this.recoil.yaw };
  }

  /** Call after the world render pass. Clears depth so the gun never clips. */
  renderViewmodel(renderer) {
    const w = renderer.domElement.width / renderer.domElement.height;
    if (this.vmCamera.aspect !== w) {
      this.vmCamera.aspect = w;
      this.vmCamera.updateProjectionMatrix();
    }
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.vmScene, this.vmCamera);
    renderer.autoClear = true;
  }
}

const NORMAL_PROBES = [
  new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0),
  new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1),
];
const _euler = new THREE.Euler();

// innerWidth is absent under Node; the aspect is corrected on first render.
function innerWidthOr(fallback) {
  return typeof innerWidth === 'number' ? innerWidth / innerHeight : fallback;
}

// ---------------------------------------------------------------------------
// Headless self-check — no DOM, no renderer. `node src/weapons/rifle.js --test`
// ---------------------------------------------------------------------------

export function _testRecoil() {
  const results = [];
  const check = (name, cond, detail = '') => {
    results.push({ name, ok: !!cond, detail });
  };
  const fixedRand = () => 0.5; // jitter cancels: (0.5*2-1) === 0

  // Deterministic per shot index.
  const a = patternOffset(7, fixedRand);
  const b = patternOffset(7, fixedRand);
  check('pattern is deterministic for a given shot index',
    a.x === b.x && a.y === b.y, `${a.x},${a.y} vs ${b.x},${b.y}`);
  check('pattern differs between shot indices',
    patternOffset(2, fixedRand).y !== patternOffset(14, fixedRand).y);
  check('early shots climb, mid shots sweep left',
    patternOffset(3, fixedRand).y > 1.0 && patternOffset(12, fixedRand).x < -0.5);
  check('first shot has no pattern offset',
    patternOffset(0, fixedRand).x === 0 && patternOffset(0, fixedRand).y === 0);

  // Spread ordering.
  const still = spreadFor({ speed: 0, airborne: false, crouching: false, consecutive: 0 });
  const crouchStill = spreadFor({ speed: 0, airborne: false, crouching: true, consecutive: 0 });
  const moving = spreadFor({ speed: 4.6, airborne: false, crouching: false, consecutive: 0 });
  const air = spreadFor({ speed: 4.6, airborne: true, crouching: false, consecutive: 0 });
  const sprayed = spreadFor({ speed: 0, airborne: false, crouching: false, consecutive: 8 });

  check('first shot standing still is near-perfect', still < 0.001, `${still}`);
  check('crouched-still is the tightest', crouchStill < still, `${crouchStill} < ${still}`);
  check('moving is worse than still', moving > still, `${moving} > ${still}`);
  check('airborne is far worse than crouched-still',
    air > crouchStill * 20, `${air} vs ${crouchStill}`);
  check('airborne is worse than merely moving', air > moving);
  check('spread grows with consecutive shots', sprayed > still, `${sprayed} > ${still}`);
  check('spread growth is monotonic in shot count', (() => {
    let prev = -1;
    for (let n = 0; n <= 10; n++) {
      const s = spreadFor({ speed: 0, airborne: false, crouching: false, consecutive: n });
      if (s < prev) return false;
      prev = s;
    }
    return true;
  })());
  check('spread stops growing past the cap',
    spreadFor({ speed: 0, airborne: false, crouching: false, consecutive: 40 }) ===
    spreadFor({ speed: 0, airborne: false, crouching: false, consecutive: RIFLE.spreadShotCap }));

  // Recoil accumulation and recovery.
  const r = new RecoilState();
  r.triggerHeld = true;
  for (let i = 0; i < 10; i++) { r.kick(fixedRand); r.update(1 / 128); }
  const peak = r.pitch;
  check('spraying accumulates upward pitch', peak > 0.05, `${peak}`);
  check('held trigger does not recover', r.pitch === peak);

  r.triggerHeld = false;
  for (let i = 0; i < 128; i++) r.update(1 / 128); // one second
  check('releasing the trigger recovers toward zero',
    Math.abs(r.pitch) < Math.abs(peak) * 0.05, `${peak} -> ${r.pitch}`);
  check('recovery does not overshoot past zero', Math.sign(r.pitch) !== -Math.sign(peak) ||
    Math.abs(r.pitch) < 1e-6, `${r.pitch}`);
  check('pattern restarts after the idle timeout', r.shotIndex === 0);

  // A 30-round spray must reset the pattern just as fast as a 3-round burst —
  // this is the bug the fixed idle timer exists to prevent.
  const long = new RecoilState();
  long.triggerHeld = true;
  for (let i = 0; i < 30; i++) long.kick(fixedRand);
  long.triggerHeld = false;
  for (let i = 0; i < Math.ceil(RIFLE.patternResetTime * 128) + 1; i++) long.update(1 / 128);
  check('a long spray resets the pattern on the same timer as a short one',
    long.shotIndex === 0, `shotIndex=${long.shotIndex}`);
  check('pattern does not reset before the idle timeout', (() => {
    const s = new RecoilState();
    s.triggerHeld = true;
    for (let i = 0; i < 5; i++) s.kick(fixedRand);
    s.triggerHeld = false;
    for (let i = 0; i < Math.floor(RIFLE.patternResetTime * 128) - 4; i++) s.update(1 / 128);
    return s.shotIndex === 5;
  })());

  // Two identical sprays land in the same place with jitter removed.
  const spray = () => {
    const s = new RecoilState();
    s.triggerHeld = true;
    for (let i = 0; i < 15; i++) s.kick(fixedRand);
    return [s.pitch, s.yaw];
  };
  const [p1, y1] = spray();
  const [p2, y2] = spray();
  check('a full spray is reproducible (learnable)', p1 === p2 && y1 === y2);

  // Damage falloff.
  check('damage falls off with distance', damageAt(50) < damageAt(5));
  check('point-blank damage is full', Math.abs(damageAt(0) - RIFLE.damage) < 1e-9);

  // Viewmodel geometry. Building the scene graph needs no DOM or renderer, so
  // the assembled weapon's proportions are assertable headlessly — this is what
  // catches "the magazine is above the receiver" without opening a browser.
  const vm = Object.create(Rifle.prototype);
  vm.vmRoot = new THREE.Group();
  vm.buildViewmodel(null);
  // Measure in GUN-LOCAL space: the resting pose's rotation would skew the box
  // and turn "is it rifle-shaped" into "is it posed a particular way".
  vm.gun.position.set(0, 0, 0);
  vm.gun.rotation.set(0, 0, 0);
  vm.gun.scale.setScalar(1);
  vm.gun.updateMatrixWorld(true);
  // Only the gun's own parts — the muzzle flash quads are children too, and
  // they are 0.16m of billboard that would fake up the length.
  const bb = new THREE.Box3();
  let meshCount = 0;
  for (const c of vm.gun.children) {
    if (!c.isMesh) continue;
    meshCount++;
    bb.union(new THREE.Box3().setFromObject(c));
  }
  const size = bb.getSize(new THREE.Vector3());

  check('viewmodel is roughly rifle-length (~0.9m)',
    size.z > 0.85 && size.z < 1.00, `${size.z.toFixed(3)}m, ${meshCount} meshes`);
  check('viewmodel is not a plank — it has real height and width',
    size.y > 0.25 && size.x > 0.06, `${size.x.toFixed(3)} x ${size.y.toFixed(3)}`);
  check('magazine hangs below the receiver', (() => {
    const mag = new THREE.Box3();
    for (const m of vm.magParts) mag.union(new THREE.Box3().setFromObject(m));
    return mag.min.y < -0.20 && mag.max.y < 0.0;
  })(), `mag y ${new THREE.Box3().setFromObject(vm.magParts[3]).min.y.toFixed(3)}`);
  check('muzzle sits at the front of the weapon, on the bore line',
    vm.muzzle.position.z < bb.min.z + 0.03 && Math.abs(vm.muzzle.position.y) < 0.03,
    `${vm.muzzle.position.z} vs bbox front ${bb.min.z.toFixed(3)}`);
  check('eject port is on the right side of the receiver',
    vm.ejectPort.position.x > 0.02 && Math.abs(vm.ejectPort.position.z) < 0.16);

  const failed = results.filter((r2) => !r2.ok);
  return { results, passed: results.length - failed.length, failed: failed.length };
}

/** Convenience wrapper so callers can assert in one line. */
export function verifyRifle() {
  const { results, passed, failed } = _testRecoil();
  for (const r of results) {
    console.log(`  ${r.ok ? 'ok  ' : 'FAIL'}  ${r.name}${r.detail && !r.ok ? `\n        ${r.detail}` : ''}`);
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  return failed === 0;
}

if (typeof process !== 'undefined' && process.argv?.includes('--test')) {
  process.exit(verifyRifle() ? 0 : 1);
}
