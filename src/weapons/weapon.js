import * as THREE from 'three';
import { getSpec } from './specs.js';

// One weapon class that plays any spec from specs.js.
//
// rifle.js is the reference: its RecoilState / patternOffset / spreadFor /
// damageAt were tuned by hand and the AK must keep feeling EXACTLY the same
// after being routed through here. So the math half below is rifle.js's math
// with `RIFLE.foo` replaced by `spec.foo` and the pattern table replaced by
// `spec.pattern` -- same expressions, same operation order, same rand() call
// order. weapon.test.js compares this path against the real rifle.js functions
// shot for shot; if you "tidy" one of these expressions that guard will fail,
// and it is right and you are wrong.
//
// Split, same as rifle.js:
//   - WeaponRecoil / spreadForSpec / patternOffsetFor / damageAtFor are PURE
//     MATH over plain numbers. No THREE, no DOM. Headlessly testable.
//   - Weapon owns the scene graph, the state machine, and the animation, and
//     only ever reads the math half.

// ---------------------------------------------------------------------------
// Math half -- mirrors rifle.js exactly, parameterised by spec
// ---------------------------------------------------------------------------

/**
 * Deterministic per-shot recoil offset in pattern units.
 * Mirrors rifle.js patternOffset(), reading spec.pattern instead of the module
 * PATTERN table. `rand` is injected so tests get exact repeatability.
 * @param {import('./specs.js').WeaponSpec} spec
 * @param {number} shotIndex
 * @param {() => number} [rand]
 * @returns {{x:number, y:number}} offset in pattern units
 */
export function patternOffsetFor(spec, shotIndex, rand = Math.random) {
  const pat = spec.pattern;
  const p = pat[Math.min(shotIndex, pat.length - 1)];
  const j = spec.patternJitter;
  return {
    x: p[0] + (rand() * 2 - 1) * j,
    y: p[1] + (rand() * 2 - 1) * j * 0.6, // vertical is tighter -- it must be
  };
}

/**
 * Spread cone half-angle in radians. Pure function of shooter state + spec.
 *
 * Beyond rifle.js this understands `scoped`: a scoped weapon is far tighter
 * standing still and far WORSE moving, which is the whole AWP dynamic. The
 * unscoped path is byte-identical to rifle.js spreadFor().
 * @param {import('./specs.js').WeaponSpec} spec
 * @param {{speed:number, airborne:boolean, crouching:boolean, consecutive:number, scoped?:boolean}} s
 */
export function spreadForSpec(spec, s) {
  let spread = spec.spreadBase;
  spread += (s.speed || 0) * spec.spreadMove;
  if (s.airborne) spread += spec.spreadAir;
  const shots = Math.min(s.consecutive || 0, spec.spreadShotCap);
  spread += shots * spec.spreadPerShot;
  if (s.crouching) spread *= spec.spreadCrouch;

  // Scoping is applied AFTER the base terms so it scales the whole cone, the
  // same way crouch does. A scope is not a flat bonus: it makes a stationary
  // shot near-perfect and leaves the movement penalty intact and then some,
  // which is why an AWP is useless while running but lethal when planted.
  if (s.scoped && spec.scope) {
    const moving = (s.speed || 0) > SCOPE_MOVE_THRESHOLD || s.airborne;
    spread *= moving ? SCOPE_MOVING_PENALTY : SCOPE_STILL_BONUS;
  }
  return spread;
}

// Below this speed (m/s) you count as planted for scope purposes -- a tiny
// residual velocity from a stop must not throw the shot.
const SCOPE_MOVE_THRESHOLD = 0.35;
// Planted and scoped: the cone all but vanishes. Moving and scoped: the scope
// actively hurts, so run-and-scope is never the right play.
const SCOPE_STILL_BONUS = 0.12;
const SCOPE_MOVING_PENALTY = 2.2;

/** Damage after distance falloff. Mirrors rifle.js damageAt(). */
export function damageAtFor(spec, distance) {
  return spec.damage * Math.pow(spec.falloff, distance / spec.falloffUnit);
}

/**
 * Accumulated recoil + consecutive-shot bookkeeping. Plain numbers only.
 * Mirrors rifle.js RecoilState with the constants coming from a spec.
 */
export class WeaponRecoil {
  constructor(spec) {
    this.spec = spec;
    this.pitch = 0;        // radians, positive = view pushed up
    this.yaw = 0;          // radians, positive = view pushed right
    this.shotIndex = 0;    // index into the pattern
    this.consecutive = 0;  // fractional, decays over time
    this.idle = 0;         // seconds since the last shot
    this.triggerHeld = false;
  }

  /** Apply one shot's worth of pattern kick. */
  kick(rand = Math.random) {
    const o = patternOffsetFor(this.spec, this.shotIndex, rand);
    this.pitch += o.y * this.spec.recoilScale;
    this.yaw += o.x * this.spec.recoilScale;
    this.shotIndex++;
    this.consecutive++;
    this.idle = 0;
    return o;
  }

  /**
   * Decay toward zero. Only recovers while the trigger is NOT held -- holding
   * it parks the view where the pattern put it, which is what makes pulling
   * down a learnable skill rather than an automatic correction.
   */
  update(dt) {
    if (this.triggerHeld) return;
    this.idle += dt;

    const k = Math.exp(-this.spec.recoverRate * dt);
    const keep = 1 - (1 - k) * this.spec.recoverFraction;
    this.pitch *= keep;
    this.yaw *= keep;
    this.consecutive = Math.max(0, this.consecutive - this.spec.shotDecayRate * dt);
    if (this.idle >= this.spec.patternResetTime) this.shotIndex = 0;
  }

  reset() {
    this.pitch = 0;
    this.yaw = 0;
    this.shotIndex = 0;
    this.consecutive = 0;
    this.idle = this.spec.patternResetTime;
  }
}

/**
 * Perturb an aim direction into the spread cone. Same uniform-in-disc sampling
 * as rifle.js applySpread(), and deliberately the same rand() call order so a
 * seeded comparison against it matches.
 */
export function applySpreadTo(dir, spread, rand = Math.random) {
  if (spread <= 0) return dir;
  const r = Math.sqrt(rand()) * spread;
  const theta = rand() * Math.PI * 2;

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

const VIEWMODEL_FOV = 56;
const MUZZLE_FLASH_TIME = 0.045;

/**
 * Reload states. Kept as a small explicit machine rather than one countdown
 * because shell-at-a-time reloads have to be interruptible BETWEEN shells, and
 * a single float cannot express "two shells in, tube not full, trigger pulled".
 */
export const RELOAD = {
  NONE: 'none',
  OUT: 'out',        // mag leaving the well (or pump/shell-start for tube guns)
  IN: 'in',          // new mag going in (or one shell being pushed in)
  CHARGE: 'charge',  // optional bolt/slide pull after seating
};

/** Knife swings. Primary is the fast slash, secondary the slow heavy stab. */
export const SWING = { NONE: 'none', SLASH: 'slash', STAB: 'stab' };

/**
 * Default model factory. The real geometry comes from another module's
 * buildWeaponModel(id, materials, {viewmodel}); until that is wired in, a stub
 * that produces an empty group with a 'muzzle' child keeps every code path
 * here -- animation, muzzle attachment, transforms -- runnable and testable.
 * @returns {THREE.Group}
 */
export function stubWeaponModel(id, _materials, _opts) {
  const g = new THREE.Group();
  g.name = id || 'weapon';
  const muzzle = new THREE.Object3D();
  muzzle.name = 'muzzle';
  muzzle.position.set(0, 0, -0.6);
  g.add(muzzle);
  return g;
}

/**
 * A weapon driven entirely by its spec.
 *
 * Constructed with a model FACTORY, not a model: geometry is another module's
 * job, and taking a function means this class is testable headlessly and does
 * not have to wait on it.
 */
export class Weapon {
  /**
   * @param {string|object} idOrSpec           weapon id, or a spec object
   * @param {object} [opts]
   * @param {THREE.Scene} [opts.scene]         world scene (effects live here)
   * @param {THREE.PerspectiveCamera} [opts.camera]  world camera -- hitscan origin
   * @param {object} [opts.world]              CollisionWorld, needs .raycast()
   * @param {Function} [opts.modelFactory]     (id, materials, {viewmodel}) => THREE.Object3D
   * @param {object} [opts.materials]          handed straight to the factory
   * @param {Function} [opts.hitCallback]      (point, normal, distance) per hit
   * @param {boolean} [opts.viewmodel]         build the viewmodel scene (default true)
   */
  constructor(idOrSpec, opts = {}) {
    this.spec = typeof idOrSpec === 'string' ? getSpec(idOrSpec) : idOrSpec;
    this.id = this.spec.id;
    this.scene = opts.scene || null;
    this.camera = opts.camera || null;
    this.world = opts.world || null;
    this.hitCallback = opts.hitCallback || null;
    this.materials = opts.materials || null;
    this.modelFactory = opts.modelFactory || stubWeaponModel;

    const s = this.spec;
    this.recoil = new WeaponRecoil(s);
    this.ammo = Number.isFinite(s.magSize) ? s.magSize : Infinity;
    this.reserve = s.reserve;
    this.cooldown = 0;
    this.time = 0;

    // Fire-rate gate. Bolt guns add a re-chamber on top of this interval.
    this.shotInterval = 60 / s.rpm;
    // A bolt cycle is the part of the shot interval that is not the shot: an
    // AWP's 41rpm IS its bolt cycle, so deriving the chamber time from rpm
    // keeps one number (rpm) authoritative instead of inventing a second.
    this.chamberTime = s.boltAction ? this.shotInterval * BOLT_CHAMBER_FRACTION : 0;
    this.chambering = 0;

    // Trigger edge tracking. Semi-auto and burst weapons need to see the
    // RELEASE, not just the held state, or holding the button free-runs them.
    this.triggerDown = false;
    this.triggerConsumed = false;

    // Burst state.
    this.burstLeft = 0;
    this.burstTimer = 0;

    // Reload state machine.
    this.reloadState = RELOAD.NONE;
    this.reloadTimer = 0;
    this.shellReload = isShellFed(s);

    // Scope.
    this.scopeLevel = 0;   // 0 = hipfire, 1..n index into spec.scope.fovs
    this.baseFov = opts.camera ? opts.camera.fov : 90;

    // Knife.
    this.swing = SWING.NONE;
    this.swingTimer = 0;
    this.swingTotal = 0;

    // Draw.
    this.drawTimer = s.anim.draw;
    // Inspect.
    this.inspectTimer = 0;

    // Net layer reads this, same contract as rifle.js.
    this.lastShot = null;
    // Populated by fire(): one entry per pellet, so shotguns report every ray.
    this.lastShots = [];
    this.spread = spreadForSpec(s, { speed: 0, airborne: false, crouching: false, consecutive: 0 });
    this.aimState = { speed: 0, airborne: false, crouching: false, consecutive: 0, scoped: false };

    // Viewmodel animation state, same springs as rifle.js.
    this.bobPhase = 0;
    this.kickPos = new THREE.Vector3();
    this.kickVel = new THREE.Vector3();
    this.kickRot = new THREE.Vector3();
    this.kickRotVel = new THREE.Vector3();
    this.swayTarget = new THREE.Vector2();
    this.sway = new THREE.Vector2();
    this.lastYaw = 0;
    this.lastPitch = 0;
    this.flashTimer = 0;
    this.flashScale = 1;

    if (opts.viewmodel !== false) this.buildViewmodel();
  }

  // -- construction ---------------------------------------------------------

  /**
   * The viewmodel lives in its OWN scene rendered by its OWN camera with the
   * depth buffer cleared -- same reasoning as rifle.js: depthTest:false makes
   * the gun's own parts render out of order, and scaling it down still clips
   * the near plane against walls.
   */
  buildViewmodel() {
    this.vmScene = new THREE.Scene();
    this.vmCamera = new THREE.PerspectiveCamera(
      VIEWMODEL_FOV, aspectOr(16 / 9), 0.01, 10);
    this.vmRoot = new THREE.Group();
    this.vmScene.add(this.vmRoot);

    // The viewmodel scene is not in the world, so no map lighting reaches it.
    const key = new THREE.DirectionalLight(0xfff0d4, 3.4);
    key.position.set(-0.6, 1.0, 0.8);
    this.vmScene.add(key);
    const rim = new THREE.DirectionalLight(0xbfd4f0, 1.6);
    rim.position.set(1.2, 0.6, -1.0);
    this.vmScene.add(rim);
    const fill = new THREE.DirectionalLight(0xd9a877, 0.9);
    fill.position.set(0.2, -1.0, 0.4);
    this.vmScene.add(fill);
    this.vmScene.add(new THREE.HemisphereLight(0x9fb8d8, 0x6a5540, 1.4));

    const model = this.modelFactory(this.id, this.materials, { viewmodel: true });
    this.gun = model || stubWeaponModel(this.id, null, null);

    // The factory owns the model's own scale/offset; the resting POSE is the
    // animation's business, so it is applied here and only here.
    const pose = restPoseFor(this.spec);
    if (!this.gun.userData?.posed) {
      this.gun.position.set(pose.pos[0], pose.pos[1], pose.pos[2]);
      this.gun.rotation.set(pose.rot[0], pose.rot[1], pose.rot[2]);
    }
    this.gunHome = { pos: this.gun.position.clone(), rot: this.gun.rotation.clone() };
    this.vmRoot.add(this.gun);

    // Named parts the animation drives if the model provides them. Every one is
    // optional: a model without a 'magazine' still reloads, it just does not
    // show the mag leaving the well.
    this.muzzle = findPart(this.gun, 'muzzle') || fallbackMuzzle(this.gun);
    this.magPart = findPart(this.gun, 'magazine') || findPart(this.gun, 'mag');
    this.boltPart = findPart(this.gun, 'bolt') || findPart(this.gun, 'charging')
      || findPart(this.gun, 'slide');
    this.magHome = this.magPart ? this.magPart.position.clone() : null;
    this.boltHome = this.boltPart ? this.boltPart.position.clone() : null;
  }

  // -- input ----------------------------------------------------------------

  setTriggerHeld(held) {
    const down = !!held;
    // Releasing the trigger re-arms a semi-auto / burst weapon. Without this
    // edge, holding the button on a FAMAS free-runs it as full auto.
    if (!down) this.triggerConsumed = false;
    this.triggerDown = down;
    this.recoil.triggerHeld = down;
  }

  /** True when the weapon is between shots, mid-reload, or still being drawn. */
  get busy() {
    return this.cooldown > 0 || this.chambering > 0 || this.drawTimer > 0
      || (this.reloadState !== RELOAD.NONE && !this.shellReload);
  }

  get scoped() { return this.scopeLevel > 0; }

  /** FOV the camera should use. Unscoped weapons return the base FOV. */
  get fov() {
    const sc = this.spec.scope;
    if (!sc || this.scopeLevel <= 0) return this.baseFov;
    return sc.fovs[Math.min(this.scopeLevel, sc.fovs.length) - 1];
  }

  /** Movement multiplier: the spec's, replaced by the scope's while zoomed. */
  get moveScale() {
    const sc = this.spec.scope;
    if (sc && this.scopeLevel > 0) return sc.moveScale;
    return this.spec.moveScale;
  }

  /**
   * Cycle the scope: hip -> first zoom -> second zoom -> hip. Weapons without
   * a scope ignore it entirely rather than throwing, so callers can bind the
   * key unconditionally.
   */
  toggleScope() {
    const sc = this.spec.scope;
    if (!sc) return false;
    this.scopeLevel = (this.scopeLevel + 1) % (sc.fovs.length + 1);
    return this.scoped;
  }

  setScope(level) {
    const sc = this.spec.scope;
    if (!sc) { this.scopeLevel = 0; return; }
    this.scopeLevel = Math.max(0, Math.min(level | 0, sc.fovs.length));
  }

  /** Start a reload if one is possible and not already running. */
  reload() {
    const s = this.spec;
    if (s.magSize === Infinity) return false;          // knife
    if (this.reloadState !== RELOAD.NONE) return false;
    if (this.ammo >= s.magSize || this.reserve <= 0) return false;
    if (this.drawTimer > 0) return false;
    this.reloadState = RELOAD.OUT;
    this.reloadTimer = s.anim.reloadOut;
    // Scoping through a reload looks and plays badly; drop out of the scope.
    this.scopeLevel = 0;
    return true;
  }

  /** Cancel a running reload. Shells already loaded STAY loaded. */
  cancelReload() {
    if (this.reloadState === RELOAD.NONE) return false;
    this.reloadState = RELOAD.NONE;
    this.reloadTimer = 0;
    return true;
  }

  startInspect() {
    if (this.reloadState !== RELOAD.NONE || this.drawTimer > 0) return false;
    this.inspectTimer = this.spec.anim.inspect;
    return true;
  }

  /** Re-draw the weapon, e.g. after a swap. */
  deploy() {
    this.drawTimer = this.spec.anim.draw;
    this.reloadState = RELOAD.NONE;
    this.reloadTimer = 0;
    this.scopeLevel = 0;
    this.burstLeft = 0;
    this.recoil.reset();
  }

  // -- firing ---------------------------------------------------------------

  /**
   * Can the trigger produce a shot right now? Split out of fire() because the
   * burst timer and the tests both need to ask without side effects.
   */
  canFire() {
    if (this.drawTimer > 0) return false;
    if (this.cooldown > 0) return false;
    if (this.chambering > 0) return false;
    if (this.ammo <= 0) return false;
    // A tube-fed reload is interruptible: pulling the trigger aborts it and the
    // shot goes off. A mag reload is not.
    if (this.reloadState !== RELOAD.NONE && !this.shellReload) return false;
    return true;
  }

  /**
   * Fire one round if the weapon is ready.
   *
   * Shotguns roll `pellets` independent spread rays from ONE trigger pull and
   * consume ONE round; the returned hit is the closest, and every ray lands in
   * `lastShots` for the net layer.
   * @returns {null | {point:THREE.Vector3, normal:THREE.Vector3, distance:number, damage:number}}
   */
  fire(rand = Math.random) {
    if (!this.canFire()) return null;
    // Firing out of a shell reload interrupts it and keeps what is loaded.
    if (this.reloadState !== RELOAD.NONE) this.cancelReload();

    const s = this.spec;
    this.cooldown = this.shotInterval;
    if (s.boltAction) this.chambering = this.chamberTime;
    if (Number.isFinite(this.ammo)) this.ammo--;

    // Recoil and cosmetics happen whether or not there is a world to hit.
    this.recoil.kick(rand);
    this.triggerKick(rand);
    this.flashTimer = MUZZLE_FLASH_TIME;
    this.flashScale = 0.85 + rand() * 0.45;

    this.lastShots = [];
    if (!this.camera || !this.world) {
      // Headless / no world: the state machine still ran, there is just no ray.
      this.lastShot = null;
      return null;
    }

    const origin = this.camera.getWorldPosition(new THREE.Vector3());
    const baseDir = this.camera.getWorldDirection(new THREE.Vector3());
    const spread = spreadForSpec(s, this.aimState);

    const pellets = Math.max(1, s.pellets | 0);
    let best = null;
    for (let i = 0; i < pellets; i++) {
      // Each pellet rolls its OWN cone sample. Sharing one direction across
      // pellets is what makes a "shotgun" that behaves like a single bullet.
      const dir = baseDir.clone();
      applySpreadTo(dir, spread, rand);
      const hit = this.world.raycast(origin, dir, s.maxRange);
      this.lastShots.push({ origin: origin.clone(), direction: dir.clone() });
      if (hit && (!best || hit.distance < best.distance)) {
        best = { point: hit.point, distance: hit.distance, dir };
      }
    }
    // The net layer reads lastShot; keep it the FIRST ray so a single-pellet
    // weapon behaves exactly as rifle.js did.
    this.lastShot = this.lastShots[0] || null;

    if (!best) return null;

    const normal = this.surfaceNormal(best.point, best.dir);
    const info = {
      point: best.point,
      normal,
      distance: best.distance,
      damage: damageAtFor(s, best.distance),
    };
    if (this.hitCallback) this.hitCallback(info.point, info.normal, info.distance);
    return info;
  }

  /**
   * Knife attacks. Primary is the fast slash, secondary the slow heavy stab.
   * Damage is applied by the caller against whatever it hit; `backstab` is
   * passed in because only the caller knows the relative facing.
   * @param {boolean} heavy   secondary (stab) rather than primary (slash)
   * @param {boolean} backstab
   * @returns {null | {damage:number, kind:string, duration:number}}
   */
  meleeAttack(heavy = false, backstab = false) {
    const s = this.spec;
    if (s.kind !== 'knife') return null;
    if (this.cooldown > 0 || this.drawTimer > 0) return null;

    const rpm = heavy ? (s.heavyRpm ?? s.rpm) : s.rpm;
    this.cooldown = 60 / rpm;
    let damage = heavy ? (s.heavyDamage ?? s.damage) : s.damage;
    if (backstab) damage *= s.backstabMult ?? 1;

    this.swing = heavy ? SWING.STAB : SWING.SLASH;
    // The swing ANIMATION is its own timing from the spec, deliberately not the
    // cooldown: a stab's recovery is longer than the visible thrust.
    this.swingTotal = heavy ? (s.anim.stab ?? 0.75) : (s.anim.slash ?? 0.4);
    this.swingTimer = this.swingTotal;
    this.triggerKick(Math.random, heavy ? 1.6 : 0.7);
    return { damage, kind: this.swing, duration: this.swingTotal };
  }

  /**
   * Recover a surface normal from a hit point. CollisionWorld.raycast does not
   * report one and the map is axis-aligned boxes, so probe short rays back.
   * Same approach as rifle.js -- if collision.js ever returns a normal, both
   * copies of this go away.
   */
  surfaceNormal(point, dir) {
    if (!this.world) return dir.clone().negate();
    const back = point.clone().addScaledVector(dir, -0.02);
    let best = null;
    let bestDist = Infinity;
    for (const axis of NORMAL_PROBES) {
      if (axis.dot(dir) >= 0) continue;
      const probe = this.world.raycast(back, axis.clone().negate(), 0.06);
      if (probe && probe.distance < bestDist) {
        bestDist = probe.distance;
        best = axis;
      }
    }
    return best ? best.clone() : dir.clone().negate();
  }

  // -- frame ----------------------------------------------------------------

  /**
   * One frame. Mirrors rifle.js update()'s ordering: timers, reload, aim state,
   * trigger, recoil decay, sway, animation.
   * @param {number} dt
   * @param {{fire?:boolean, altFire?:boolean, reload?:boolean, inspect?:boolean, scope?:boolean}} input
   * @param {object} [movement] PlayerMovement-shaped: .velocity, .grounded, .crouching
   */
  update(dt, input = {}, movement = null) {
    this.time += dt;
    if (this.drawTimer > 0) this.drawTimer = Math.max(0, this.drawTimer - dt);
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.chambering > 0) this.chambering -= dt;
    if (this.inspectTimer > 0) this.inspectTimer = Math.max(0, this.inspectTimer - dt);
    if (this.swingTimer > 0) {
      this.swingTimer -= dt;
      if (this.swingTimer <= 0) { this.swingTimer = 0; this.swing = SWING.NONE; }
    }

    if (input.reload) this.reload();
    if (input.inspect) this.startInspect();
    this.updateReload(dt);

    // Cache the shooter state the spread math needs, so fire() stays cheap and
    // the math half never has to know what a PlayerMovement is.
    const speed = movement ? Math.hypot(movement.velocity.x, movement.velocity.z) : 0;
    this.aimState = {
      speed,
      airborne: movement ? !movement.grounded : false,
      crouching: movement ? !!movement.crouching : false,
      consecutive: this.recoil.consecutive,
      scoped: this.scoped,
    };
    this.spread = spreadForSpec(this.spec, this.aimState);

    this.setTriggerHeld(!!input.fire);
    this.updateTrigger(dt, input);

    this.recoil.update(dt);
    this.updateSwayTarget();
    this.animate(dt, speed, movement);
    if (this.flashTimer > 0) this.flashTimer -= dt;
  }

  /**
   * Fire-mode logic. This is where automatic / semi / burst / bolt actually
   * differ, and it is the only place they differ.
   */
  updateTrigger(dt, input) {
    const s = this.spec;

    // A burst in flight keeps firing on its own clock -- releasing the trigger
    // does NOT cut it short, which is what makes a FAMAS burst commit.
    if (this.burstLeft > 0) {
      this.burstTimer -= dt;
      if (this.burstTimer <= 0 && this.canFire()) {
        this.fire();
        this.burstLeft--;
        this.burstTimer = this.shotInterval;
        if (this.burstLeft <= 0) this.burstTimer = 0;
      }
      return;
    }

    if (!this.triggerDown) return;

    if (s.burst > 0) {
      // One trigger pull = exactly N rounds, then the trigger must be released.
      if (this.triggerConsumed) return;
      if (!this.canFire()) return;
      this.triggerConsumed = true;
      this.fire();
      this.burstLeft = s.burst - 1;
      this.burstTimer = this.shotInterval;
      return;
    }

    if (!s.automatic) {
      // Semi and bolt: one shot per pull. The consumed flag clears on release.
      if (this.triggerConsumed) return;
      // A dry click still consumes the pull -- otherwise an empty semi-auto
      // fires the instant a reload finishes while the button is still held.
      this.triggerConsumed = true;
      this.fire();
      return;
    }

    this.fire();
  }

  /**
   * Reload state machine. Two shapes share it:
   *   - MAG guns: OUT (mag leaves) -> IN (new mag seats) -> optional CHARGE.
   *   - TUBE guns: OUT once (pump/first shell), then IN repeatedly, one shell
   *     per cycle, until the tube is full or the reserve runs out. Interrupted
   *     by fire(), and every shell already pushed in STAYS in.
   */
  updateReload(dt) {
    if (this.reloadState === RELOAD.NONE) return;
    const s = this.spec;
    this.reloadTimer -= dt;
    if (this.reloadTimer > 0) return;

    if (this.reloadState === RELOAD.OUT) {
      this.reloadState = RELOAD.IN;
      this.reloadTimer += s.anim.reloadIn;   // carry the overshoot, no drift
      return;
    }

    if (this.reloadState === RELOAD.IN) {
      if (this.shellReload) {
        // One shell per cycle. This is the whole point: the tube fills
        // incrementally, so an interruption keeps what is already in it.
        if (this.ammo < s.magSize && this.reserve > 0) {
          this.ammo++;
          this.reserve--;
        }
        if (this.ammo >= s.magSize || this.reserve <= 0) {
          this.reloadState = RELOAD.NONE;
          this.reloadTimer = 0;
          this.recoil.reset();
          return;
        }
        this.reloadTimer += s.anim.reloadIn;
        return;
      }
      // Mag gun: the whole magazine arrives at once.
      const want = s.magSize - this.ammo;
      const take = Math.min(want, this.reserve);
      this.ammo += take;
      this.reserve -= take;
      if (s.anim.reloadCharge > 0) {
        this.reloadState = RELOAD.CHARGE;
        this.reloadTimer += s.anim.reloadCharge;
        return;
      }
      this.reloadState = RELOAD.NONE;
      this.reloadTimer = 0;
      this.recoil.reset();
      return;
    }

    // CHARGE: the bolt/slide pull after seating. Ammo is already in; this is
    // dead time you cannot fire through, which is why a USP reload feels longer
    // than its mag swap alone.
    this.reloadState = RELOAD.NONE;
    this.reloadTimer = 0;
    this.recoil.reset();
  }

  /** Total reload duration for the CURRENT state of the weapon, seconds. */
  reloadDuration() {
    const s = this.spec;
    if (this.shellReload) {
      const shells = Math.min(s.magSize - this.ammo, this.reserve);
      return s.anim.reloadOut + shells * s.anim.reloadIn;
    }
    return s.anim.reloadOut + s.anim.reloadIn + s.anim.reloadCharge;
  }

  /** 0..1 progress through the current reload, for HUD/animation. */
  get reloadProgress() {
    if (this.reloadState === RELOAD.NONE) return 0;
    const s = this.spec;
    if (this.reloadState === RELOAD.OUT) {
      return clamp01(1 - this.reloadTimer / Math.max(1e-6, s.anim.reloadOut)) * 0.5;
    }
    if (this.reloadState === RELOAD.IN) {
      return 0.5 + clamp01(1 - this.reloadTimer / Math.max(1e-6, s.anim.reloadIn)) * 0.4;
    }
    return 0.9 + clamp01(1 - this.reloadTimer / Math.max(1e-6, s.anim.reloadCharge)) * 0.1;
  }

  // -- viewmodel animation --------------------------------------------------

  /**
   * Impulse into the kick spring. Scaled by the weapon's own fireKick timing
   * and its recoil, so an AWP shoves the viewmodel and an MP9 taps it -- the
   * per-weapon difference is the entire reason spec.anim exists.
   */
  triggerKick(rand = Math.random, scale = 1) {
    const s = this.spec;
    // Reference point: the AK's tuned impulse at its own recoilScale/fireKick.
    // Every other weapon is that impulse scaled by how hard IT kicks, so the
    // AK path reproduces rifle.js exactly and an AWP lands ~1.5x heavier.
    const k = scale * (s.recoilScale / AK_RECOIL_SCALE) ** 0.6
      * (s.anim.fireKick / AK_FIRE_KICK) ** 0.35;
    this.kickVel.z += 1.55 * k;
    this.kickVel.y += 0.42 * k;
    this.kickRotVel.x -= 5.2 * k;
    this.kickRotVel.z += (rand() * 2 - 1) * 2.6 * k;
    this.kickRotVel.y += (rand() * 2 - 1) * 1.4 * k;
  }

  /** Mouse sway target from view delta, read off the camera. */
  updateSwayTarget() {
    if (!this.camera) return;
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
  }

  /**
   * The animation. Everything additive on top of the rest pose:
   * draw, bob, idle sway, mouse sway, fire kick, reload, inspect, knife swing,
   * scope. Amplitudes and speeds come from spec.anim so an AWP is heavy and an
   * MP9 is light -- deliberately NOT one shared curve.
   */
  animate(dt, speed = 0, movement = null) {
    const g = this.gun;
    if (!g) return;
    const s = this.spec;
    const A = s.anim;

    // Critically-damped-ish spring on position and rotation kick. Same
    // constants as rifle.js so the AK's recovery is unchanged.
    const stiff = 190, damp = 21;
    for (const [val, vel] of [[this.kickPos, this.kickVel], [this.kickRot, this.kickRotVel]]) {
      vel.addScaledVector(val, -stiff * dt);
      vel.multiplyScalar(Math.max(0, 1 - damp * dt));
      val.addScaledVector(vel, dt);
    }

    // Walk bob: phase advances with DISTANCE, not time, so it stays locked to
    // footfalls at any speed and stops dead when you stop.
    this.bobPhase += speed * dt * 6.4;
    const bobAmt = Math.min(speed / 4.6, 1) * (movement?.crouching ? 0.4 : 1) * A.sway;
    const bobX = Math.sin(this.bobPhase) * 0.016 * bobAmt;
    const bobY = -Math.abs(Math.cos(this.bobPhase)) * 0.014 * bobAmt;

    // Idle sway: slow lissajous, amplitude scaled by the weapon's sway factor
    // so a heavy AWP drifts less than a light MP9.
    const idle = 1 - Math.min(speed / 2.0, 1);
    const swayX = Math.sin(this.time * 1.1) * 0.004 * idle * A.sway;
    const swayY = Math.sin(this.time * 0.83 + 1.3) * 0.003 * idle * A.sway;

    this.sway.lerp(this.swayTarget, Math.min(1, dt * 9));

    const airDrop = movement && !movement.grounded ? -0.03 : 0;

    let rx = 0, ry = 0, rz = 0, px = 0, py = 0, pz = 0;

    // -- draw: the weapon swings up from below and rolls level ---------------
    if (this.drawTimer > 0) {
      const t = 1 - this.drawTimer / Math.max(1e-6, A.draw);
      // Ease-out: fast off the hip, settling into the rest pose. A linear draw
      // reads as the gun being slid into place on rails.
      const e = 1 - (1 - t) * (1 - t);
      const k = 1 - e;
      py -= k * 0.22;
      pz += k * 0.10;
      rz += k * 0.55;
      rx -= k * 0.30;
    }

    // -- reload --------------------------------------------------------------
    if (this.reloadState !== RELOAD.NONE) {
      const phase = this.reloadPhaseShape();
      // Tilt in, hold, tilt back out. Amounts inherited from rifle.js's tuned
      // reload: any more roll and the receiver leaves the bottom of frame and
      // the whole reload plays out off-screen.
      const tilt = phase.tilt;
      rz += tilt * 0.26;
      ry += tilt * 0.20;
      rx += tilt * 0.16;
      px += tilt * 0.028;     // OUT toward the right, not in toward centre
      py += tilt * 0.075;     // lift so the mag drop stays in frame
      pz += tilt * 0.050;

      // A tube gun's per-shell push is a short jab, not the mag-swap arc.
      if (this.shellReload && this.reloadState === RELOAD.IN) {
        const j = Math.sin(phase.local * Math.PI);
        py += j * 0.020;
        rx += j * 0.10;
      }
      // The charge/bolt pull is a sharp yank back and a snap forward.
      if (this.reloadState === RELOAD.CHARGE) {
        const c = Math.sin(phase.local * Math.PI);
        pz += c * 0.045;
        rx -= c * 0.09;
      }

      if (this.magPart && this.magHome) {
        this.magPart.position.copy(this.magHome);
        // Shell guns do not drop a magazine at all -- animating one out of a
        // Nova would be a visible lie.
        if (!this.shellReload) {
          this.magPart.position.y -= phase.magOut * 0.26;
          this.magPart.position.z += phase.magOut * 0.05;
          this.magPart.visible = phase.magOut < 0.72;
        }
      }
      if (this.boltPart && this.boltHome && this.reloadState === RELOAD.CHARGE) {
        this.boltPart.position.copy(this.boltHome);
        this.boltPart.position.z += Math.sin(phase.local * Math.PI) * 0.045;
      }
    } else {
      if (this.magPart && this.magHome) {
        this.magPart.position.copy(this.magHome);
        this.magPart.visible = true;
      }
      if (this.boltPart && this.boltHome) this.boltPart.position.copy(this.boltHome);
    }

    // -- bolt cycle: the visible re-chamber between sniper shots --------------
    if (this.chambering > 0 && this.chamberTime > 0) {
      const t = 1 - this.chambering / this.chamberTime;
      const c = Math.sin(clamp01(t) * Math.PI);
      pz += c * 0.055;
      rx -= c * 0.12;
      rz += c * 0.10;
      if (this.boltPart && this.boltHome) {
        this.boltPart.position.copy(this.boltHome);
        this.boltPart.position.z += c * 0.05;
      }
    }

    // -- inspect: roll the weapon over and back ------------------------------
    if (this.inspectTimer > 0) {
      const t = 1 - this.inspectTimer / Math.max(1e-6, A.inspect);
      const env = Math.sin(clamp01(t) * Math.PI);          // in and back out
      ry += env * 0.9;
      rz += env * 0.7;
      rx += Math.sin(clamp01(t) * Math.PI * 2) * 0.25;     // a turn partway through
      px -= env * 0.06;
      py += env * 0.05;
      pz += env * 0.12;
    }

    // -- knife swing ---------------------------------------------------------
    if (this.swing !== SWING.NONE && this.swingTotal > 0) {
      const t = 1 - this.swingTimer / this.swingTotal;
      if (this.swing === SWING.SLASH) {
        // Slash: wind up across to the right, then whip left-and-down fast.
        // Asymmetric on purpose -- an even sine reads as a wave, not a cut.
        const wind = t < 0.30 ? t / 0.30 : 0;
        const cut = t >= 0.30 ? Math.sin(((t - 0.30) / 0.70) * Math.PI) : 0;
        px += wind * 0.10 - cut * 0.20;
        py += wind * 0.06 - cut * 0.05;
        rz += wind * 0.5 - cut * 1.15;
        ry += wind * 0.35 - cut * 0.8;
      } else {
        // Stab: pull back slowly, thrust straight down the bore, recover.
        const pull = t < 0.42 ? Math.sin((t / 0.42) * (Math.PI / 2)) : 0;
        const push = t >= 0.42 ? Math.sin(((t - 0.42) / 0.58) * Math.PI) : 0;
        pz += pull * 0.16 - push * 0.30;
        py += pull * 0.05 - push * 0.02;
        rx += pull * 0.45 - push * 0.35;
        ry += pull * 0.25 - push * 0.15;
      }
    }

    // -- scope: pull the weapon down and out of the way ----------------------
    if (this.scoped) {
      py -= 0.10;
      pz += 0.10;
      ry -= 0.06;
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

    // A NaN reaching a transform silently deletes the weapon from the frame and
    // leaves no error to find. One dt of 0 or an empty spec field is enough to
    // cause it, so it is caught here rather than debugged from a black screen.
    if (!finiteVec(g.position) || !finiteEuler(g.rotation)) {
      g.position.copy(this.gunHome.pos);
      g.rotation.copy(this.gunHome.rot);
      this.kickPos.set(0, 0, 0); this.kickVel.set(0, 0, 0);
      this.kickRot.set(0, 0, 0); this.kickRotVel.set(0, 0, 0);
      this.sway.set(0, 0);
    }
  }

  /**
   * Shape parameters for the reload animation: how far into the tilt we are and
   * where the magazine should be. Derived from the STATE MACHINE rather than
   * from one global 0..1, so the out and in phases keep their own per-weapon
   * durations instead of being squashed into a shared curve.
   */
  reloadPhaseShape() {
    const s = this.spec;
    const A = s.anim;
    if (this.reloadState === RELOAD.OUT) {
      const local = clamp01(1 - this.reloadTimer / Math.max(1e-6, A.reloadOut));
      return { local, tilt: Math.sin(local * (Math.PI / 2)), magOut: local };
    }
    if (this.reloadState === RELOAD.IN) {
      const local = clamp01(1 - this.reloadTimer / Math.max(1e-6, A.reloadIn));
      // Mag out for the first half of the seat, then the new one rises.
      const magOut = local < 0.5 ? 1 : 1 - (local - 0.5) / 0.5;
      // Hold the tilt until the very end, then release it -- the weapon comes
      // back level as the mag seats, not before.
      const tilt = local < 0.75 ? 1 : Math.cos(((local - 0.75) / 0.25) * (Math.PI / 2));
      return { local, tilt, magOut };
    }
    const local = clamp01(1 - this.reloadTimer / Math.max(1e-6, A.reloadCharge));
    return { local, tilt: 0.35 * (1 - local), magOut: 0 };
  }

  /** View offset the camera controller should ADD to the player's aim angles. */
  get viewOffset() {
    return { pitch: this.recoil.pitch, yaw: this.recoil.yaw };
  }

  /** Call after the world render pass. Clears depth so the gun never clips. */
  renderViewmodel(renderer) {
    if (!this.vmScene) return;
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

  dispose() {
    this.vmRoot?.clear();
  }
}

// The AK is the reference the per-weapon kick scaling is expressed against.
const AK_RECOIL_SCALE = 0.0075;
const AK_FIRE_KICK = 0.055;

// Bolt guns: the fraction of the shot interval spent cycling the bolt, i.e.
// locked out of firing beyond the plain rate gate. 0.85 leaves a sliver of
// interval so the two gates are distinguishable in a test.
const BOLT_CHAMBER_FRACTION = 0.85;

/**
 * Tube-fed shotguns load one shell at a time. Encoded as a rule over the spec
 * rather than a per-id list: the tell is a shotgun whose reloadIn is SHORTER
 * than its reloadOut, which is exactly how specs.js writes the per-shell time
 * ("reloadIn is PER SHELL, not for the whole tube"). MAG-7 is a box-mag
 * shotgun and its longer reloadIn correctly excludes it.
 */
export function isShellFed(spec) {
  return spec.kind === 'shotgun' && spec.anim.reloadIn <= spec.anim.reloadOut;
}

/**
 * Rest pose per archetype. Same lower-right framing as rifle.js for everything
 * rifle-shaped; pistols sit higher and closer, the knife closer still, snipers
 * further out so the scope body does not fill the frame.
 */
export function restPoseFor(spec) {
  switch (spec.kind) {
    case 'pistol':
      return { pos: [0.145, -0.115, -0.300], rot: [-0.09, 0.10, 0.05] };
    case 'knife':
      return { pos: [0.150, -0.130, -0.260], rot: [-0.20, 0.28, 0.16] };
    case 'sniper':
      return { pos: [0.135, -0.095, -0.400], rot: [-0.10, 0.065, 0.05] };
    case 'shotgun':
      return { pos: [0.140, -0.105, -0.380], rot: [-0.10, 0.075, 0.055] };
    case 'smg':
      return { pos: [0.140, -0.105, -0.345], rot: [-0.11, 0.085, 0.055] };
    case 'lmg':
      return { pos: [0.145, -0.100, -0.395], rot: [-0.10, 0.070, 0.050] };
    default: // rifle -- the AK's tuned pose, unchanged
      return { pos: [0.140, -0.100, -0.370], rot: [-0.11, 0.075, 0.055] };
  }
}

/** Find a named part anywhere under the model. Case-insensitive substring. */
export function findPart(root, name) {
  if (!root) return null;
  const want = name.toLowerCase();
  let found = null;
  root.traverse((o) => {
    if (found) return;
    if (o !== root && typeof o.name === 'string' && o.name.toLowerCase().includes(want)) {
      found = o;
    }
  });
  return found;
}

/**
 * A model with no 'muzzle' marker still needs one, or the flash spawns at the
 * gun's origin -- inside the receiver, behind the shooter's hand. Put it at the
 * front of the bounding box on the bore line.
 */
function fallbackMuzzle(gun) {
  const m = new THREE.Object3D();
  m.name = 'muzzle';
  const bb = new THREE.Box3().setFromObject(gun);
  m.position.set(0, 0, Number.isFinite(bb.min.z) ? bb.min.z : -0.6);
  gun.add(m);
  return m;
}

const NORMAL_PROBES = [
  new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0),
  new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1),
];
const _euler = new THREE.Euler();

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function finiteVec(v) {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}
function finiteEuler(e) {
  return Number.isFinite(e.x) && Number.isFinite(e.y) && Number.isFinite(e.z);
}

// innerWidth is absent under Node; the aspect is corrected on first render.
function aspectOr(fallback) {
  return typeof innerWidth === 'number' ? innerWidth / innerHeight : fallback;
}
