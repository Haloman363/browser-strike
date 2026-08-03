import * as THREE from 'three';
import { HITBOX_MULT, damageForHit } from '../ai/bot.js';

// GRENADES: thrown physics, fuses, and five payloads.
//
// The throw arc is a real skill in CS -- people learn lineups, they practise
// bank shots off a specific pixel of a specific wall. That only works if the
// simulation is DETERMINISTIC and the bounce is honest, so the projectile here
// is integrated against the same CollisionWorld the player walks on, using
// sweep() and its surface normal to reflect velocity. There is no physics
// engine and no second collision representation.
//
// Everything that could be random takes an injectable `rand` (same convention
// as rifle.js patternOffset), so a test can pass a constant and get an exact
// trajectory back.

const EPS = 1e-4;
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/** Eye height a thrown grenade leaves from and blast LOS is tested against. */
export const EYE_HEIGHT = 1.28;

// ---------------------------------------------------------------------------
// Throw strengths
// ---------------------------------------------------------------------------

/**
 * CS gives you three throws and the whole grenade meta is built on them:
 * a full throw for long lineups, a "medium" (both buttons) for mid-range pops,
 * and an underhand lob to drop something at your feet or just over a box.
 * The speeds are metres/second at this map's 60m scale.
 */
export const THROW = {
  FULL:      { id: 'full',      speed: 22.0, pitchBias: 0.00, forwardOffset: 0.55 },
  MEDIUM:    { id: 'medium',    speed: 13.5, pitchBias: 0.06, forwardOffset: 0.50 },
  UNDERHAND: { id: 'underhand', speed: 7.0,  pitchBias: 0.22, forwardOffset: 0.40 },
};

// ---------------------------------------------------------------------------
// Projectile physics constants
// ---------------------------------------------------------------------------

/**
 * Restitution and friction, per grenade type. TUNING NOTES, because these are
 * the numbers that decide whether a lineup is learnable:
 *
 *   restitution 0.45 (HE/flash/smoke/decoy) -- a 22 m/s full throw into a wall
 *     comes back at ~9.9 m/s, then ~4.5, then ~2, and is at rest inside about
 *     four contacts. At 0.6 the grenade skittered for another second and a half
 *     and overshot every wall bounce; at 0.3 it died on the first wall and bank
 *     shots stopped existing as a technique. 0.45 is where a two-wall bounce is
 *     still predictable but a grenade does not run away from where you aimed.
 *   friction 0.72 -- applied to the TANGENTIAL component on every contact.
 *     Below ~0.6 grenades slid across the floor like hockey pucks and never
 *     settled where they landed; above ~0.85 they stuck to the first floor
 *     contact and vertical drops stopped rolling at all.
 *   MOLOTOV: restitution 0.05. A molotov is a glass bottle -- it must not
 *     bounce. It breaks on the first hard contact (see BREAK_ON_IMPACT).
 */
export const PHYSICS = {
  gravity: 9.81,
  /**
   * Air drag as a per-second velocity retention factor, applied as
   * pow(drag, dt) so it is framerate independent. 0.88 costs a full throw about
   * 12% of its speed per second of flight -- enough that a long lob visibly
   * shortens, not so much that the arc stops looking ballistic.
   */
  drag: 0.88,
  /** Collision half-extents. Grenades are ~7cm; a sphere approximated as a box. */
  radius: 0.055,
  /**
   * Below this speed on a contact, stop bouncing and let it roll/rest. Without
   * it, restitution generates an infinite series of ever-smaller bounces and
   * the grenade jitters against the floor forever, which looks broken and
   * burns CPU on a corpse of a projectile.
   */
  restBounceSpeed: 0.9,
  /** Below this total speed while grounded, snap to rest. */
  restSpeed: 0.35,
  /** Max integration substep. A fast grenade must not tunnel a 0.2m wall. */
  maxStep: 1 / 120,
};

// ---------------------------------------------------------------------------
// Grenade specifications
// ---------------------------------------------------------------------------

export const GRENADE = {
  HE: 'he',
  FLASH: 'flash',
  SMOKE: 'smoke',
  MOLOTOV: 'molotov',
  DECOY: 'decoy',
};

/**
 * Per-type stat table, in the style of specs.js: data, not code. Behaviour that
 * genuinely differs by type is a FLAG read below, not a per-grenade class.
 */
export const GRENADE_SPECS = {
  [GRENADE.HE]: {
    name: 'HE Grenade', price: 300, fuse: 1.6,
    restitution: 0.45, friction: 0.72,
    /**
     * Blast damage. 98 at the epicentre so a point-blank HE on a full-health
     * unarmoured player is a near-kill but never a guaranteed one -- a nade
     * that reliably kills from full is a nade nobody has to aim.
     */
    damage: 98,
    radius: 7.0,
    /**
     * Falloff exponent over the normalised radius. 1.6 keeps damage meaningful
     * out to about half the radius then drops off a cliff, which is what makes
     * the difference between "landed on him" and "landed near him" matter.
     */
    falloffPow: 1.6,
    armorPierce: 0.5,   // HE is poorly stopped by kevlar in CS; half gets through
  },
  [GRENADE.FLASH]: {
    name: 'Flashbang', price: 200, fuse: 1.6,
    restitution: 0.45, friction: 0.72,
    /** Full-face, close, unobstructed blind, in seconds. */
    maxBlind: 3.2,
    /** Beyond this the flash does nothing regardless of angle. */
    radius: 14.0,
    /**
     * Half-angle in radians beyond which the flash is fully behind you. Past
     * ~100 degrees off your view axis, you were not looking anywhere near it.
     */
    maxAngle: Math.PI * 0.58,
  },
  [GRENADE.SMOKE]: {
    name: 'Smoke Grenade', price: 300, fuse: 1.5,
    restitution: 0.42, friction: 0.78,
    /** Final cloud radius. CS smokes are ~144 units; this map is metric. */
    radius: 3.6,
    /** Seconds for the cloud to reach full size after detonation. */
    growTime: 1.4,
    /** Seconds at full size before it starts to fade. */
    holdTime: 14.0,
    /** Seconds fading out; LOS blocking scales down with it. */
    fadeTime: 3.0,
    /** Centre height above the impact point -- a smoke billows upward. */
    centreLift: 1.3,
  },
  [GRENADE.MOLOTOV]: {
    name: 'Molotov', price: 400, fuse: 2.4,
    restitution: 0.05, friction: 0.9,
    breakOnImpact: true,   // glass: shatters on the first real contact
    /** Ground fire radius once fully spread. */
    radius: 2.8,
    /** Seconds to spread from the impact point to full radius. */
    spreadTime: 1.2,
    /** Total burn duration including the spread. */
    burnTime: 7.0,
    /** Damage per second to anyone standing in it. */
    dps: 22,
    /** How tall the flame column is for the "inside it" test. */
    height: 1.8,
    armorPierce: 1.0,     // fire ignores kevlar entirely
  },
  [GRENADE.DECOY]: {
    name: 'Decoy Grenade', price: 50, fuse: 2.0,
    restitution: 0.45, friction: 0.72,
    /** Seconds between fake gunshots. */
    shotInterval: 0.42,
    /** How long it keeps firing. */
    duration: 12.0,
    /** Random jitter on the interval, as a fraction. Uses the injected rand. */
    shotJitter: 0.35,
    /**
     * A real decoy detonates for a little damage when it expires. Kept small:
     * the decoy is an information tool, not a cheap HE.
     */
    damage: 20,
    radius: 3.2,
    falloffPow: 1.6,
    armorPierce: 0.5,
  },
};

export function getGrenadeSpec(type) {
  const s = GRENADE_SPECS[type];
  if (!s) throw new Error(`unknown grenade: ${type}`);
  return s;
}

// ---------------------------------------------------------------------------
// Line of sight
// ---------------------------------------------------------------------------

/**
 * Is the straight segment a->b clear of static geometry?
 *
 * The whole point of the HE and flash LOS checks: a wall between the blast and
 * the victim must stop it. Implemented against world.raycast, which is the same
 * slab test the bullets use, so "can the nade see you" and "can a bullet see
 * you" cannot drift apart.
 */
export function segmentClear(world, a, b) {
  if (!world || typeof world.raycast !== 'function') return true;
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const dist = Math.hypot(dx, dy, dz);
  if (!(dist > EPS)) return true;
  const dir = new THREE.Vector3(dx / dist, dy / dist, dz / dist);
  const origin = new THREE.Vector3(a.x, a.y, a.z);
  const hit = world.raycast(origin, dir, dist);
  // A hit strictly before the endpoint blocks. The small slack keeps a blast
  // that detonated flush against a wall from occluding itself.
  return !hit || hit.distance >= dist - 1e-3;
}

// ---------------------------------------------------------------------------
// Blast damage
// ---------------------------------------------------------------------------

/**
 * Radial damage with distance falloff and a hard LOS gate.
 *
 * Returns 0 when a wall is in the way. NOT a partial reduction: a solid brush
 * in this map is a real wall, and "50% damage through concrete" is the kind of
 * rule that makes players distrust cover. If the map ever grows thin/breakable
 * geometry, that is where a penetration term belongs, not here.
 *
 * @param {object} spec       grenade spec with {damage, radius, falloffPow}
 * @param {{x,y,z}} centre    blast epicentre
 * @param {{x,y,z}} target    victim's centre-of-mass sample point
 * @param {object} [world]    CollisionWorld; omit to skip the LOS gate
 * @returns {number} damage before armour
 */
export function blastDamage(spec, centre, target, world = null) {
  if (!spec || !centre || !target) return 0;
  const dx = target.x - centre.x, dy = target.y - centre.y, dz = target.z - centre.z;
  const dist = Math.hypot(dx, dy, dz);
  if (!finite(dist) || dist >= spec.radius) return 0;

  if (world && !segmentClear(world, centre, target)) return 0;

  const t = 1 - dist / spec.radius;                 // 1 at centre, 0 at the edge
  const dmg = spec.damage * Math.pow(t, spec.falloffPow);
  return finite(dmg) && dmg > 0 ? dmg : 0;
}

// ---------------------------------------------------------------------------
// Flashbang
// ---------------------------------------------------------------------------

/**
 * Blind duration in seconds for one viewer.
 *
 * Three multiplicative terms, all of which a player can influence:
 *   DISTANCE  -- linear-ish falloff to the spec radius.
 *   ANGLE     -- how far off your view axis the flash went off. Looking away is
 *                the counterplay, so this must actually matter: a flash at the
 *                edge of vision is worth about a fifth of one you stared at.
 *   LOS       -- behind a wall is ZERO. Not reduced, zero. A flash that blinds
 *                through cover teaches players that turning is pointless.
 *
 * Returns seconds; the caller decides what a screen effect looks like. This
 * module deliberately does not touch rendering.
 *
 * @param {object} spec    flash spec
 * @param {{x,y,z}} centre flash position
 * @param {{x,y,z}} eye    viewer's eye position
 * @param {{x,y,z}} forward viewer's normalised look direction
 * @param {object} [world] CollisionWorld for the LOS gate
 */
export function flashBlind(spec, centre, eye, forward, world = null) {
  if (!spec || !centre || !eye || !forward) return 0;
  const dx = centre.x - eye.x, dy = centre.y - eye.y, dz = centre.z - eye.z;
  const dist = Math.hypot(dx, dy, dz);
  if (!finite(dist) || dist >= spec.radius) return 0;

  // Behind cover: nothing at all.
  if (world && !segmentClear(world, centre, eye)) return 0;

  // Distance term. Squared-ish rolloff so standing at the far edge of the
  // radius is a flicker, not a blind.
  const near = Math.max(0, 1 - dist / spec.radius);
  const distTerm = Math.pow(near, 0.75);

  // Angle term. dot of the look direction against the direction TO the flash.
  const fl = Math.hypot(forward.x, forward.y, forward.z);
  if (!(fl > EPS) || !(dist > EPS)) return 0;
  const cos = (dx * forward.x + dy * forward.y + dz * forward.z) / (dist * fl);
  const angle = Math.acos(Math.max(-1, Math.min(1, cos)));
  if (angle >= spec.maxAngle) return 0;                 // fully turned away
  // Cosine-shaped, so a small turn off centre costs little and a big one costs
  // a lot -- matching how a real flash washes out peripheral vision less.
  const angleTerm = Math.pow(1 - angle / spec.maxAngle, 1.35);

  const secs = spec.maxBlind * distTerm * angleTerm;
  return finite(secs) && secs > 0 ? secs : 0;
}

// ---------------------------------------------------------------------------
// Smoke
// ---------------------------------------------------------------------------

/**
 * A live smoke cloud. Grows, holds, fades.
 *
 * BLOCKING APPROACH, and its limits, stated plainly:
 *
 *   The cloud is treated as a SPHERE and blocksLineOfSight is a segment-vs-
 *   sphere intersection: closest approach of the segment to the centre, compare
 *   against the current radius. If the segment passes within the sphere, sight
 *   is blocked.
 *
 *   Why a sphere: the alternative is voxelising the volume or ray-marching a
 *   density field, and both cost far more than this game can spend on a test
 *   that AI and combat may call for every pair of players every tick. A sphere
 *   is one dot product and a subtraction.
 *
 *   WHAT IT GETS WRONG, honestly:
 *     - A real CS smoke is a squashed dome that hugs the floor and pours over
 *       cover; a sphere is symmetric. Standing on a box next to a smoke, you
 *       will be blocked slightly more than you should be, and prone-low sight
 *       lines under the cloud edge do not exist.
 *     - It does not respect walls. A smoke detonating against one side of a
 *       thin wall has a sphere that pokes through to the other side, so it can
 *       block a sight line it should not reach. The map's walls are all thicker
 *       than a few centimetres, and the blast is offset off the surface, so in
 *       practice the overhang is small -- but it is real, and clipping the
 *       sphere against brushes is the fix if it ever shows.
 *     - Partial occlusion does not exist. A grazing segment is fully blocked.
 *       Real smoke thins at the edge. `opacityAt` exposes the density term for
 *       renderers, but the LOS test is boolean because half-visible enemies are
 *       a worse experience than a clean binary.
 */
export class SmokeCloud {
  constructor(centre, spec = GRENADE_SPECS[GRENADE.SMOKE]) {
    this.spec = spec;
    // Smoke billows up from where the grenade landed rather than spherically
    // around it, so the visible cloud is not half-buried in the floor.
    this.centre = new THREE.Vector3(centre.x, centre.y + spec.centreLift, centre.z);
    this.age = 0;
    this.dead = false;
  }

  get totalLife() {
    return this.spec.growTime + this.spec.holdTime + this.spec.fadeTime;
  }

  /** Current radius. Eased grow, full hold, shrinking fade. */
  get radius() {
    const s = this.spec;
    if (this.age <= 0) return 0;
    if (this.age < s.growTime) {
      // Ease-out: a smoke bloom is fast then settles, it does not expand linearly.
      const t = this.age / s.growTime;
      return s.radius * (1 - Math.pow(1 - t, 2));
    }
    if (this.age < s.growTime + s.holdTime) return s.radius;
    const t = (this.age - s.growTime - s.holdTime) / s.fadeTime;
    return s.radius * Math.max(0, 1 - t * 0.35);   // shrinks a little as it thins
  }

  /** 0..1 visual density. Renderers use this; the LOS test does not. */
  opacityAt() {
    const s = this.spec;
    if (this.age < s.growTime) return Math.min(1, this.age / s.growTime);
    if (this.age < s.growTime + s.holdTime) return 1;
    const t = (this.age - s.growTime - s.holdTime) / s.fadeTime;
    return Math.max(0, 1 - t);
  }

  update(dt) {
    if (!finite(dt) || dt <= 0) return;
    this.age += dt;
    if (this.age >= this.totalLife) this.dead = true;
  }

  /**
   * Does this cloud block the segment a->b?
   * Segment-vs-sphere by closest approach, clamped to the segment ends so a
   * cloud behind the shooter or past the target does not block.
   */
  blocksLineOfSight(a, b) {
    if (this.dead) return false;
    const r = this.radius;
    // Below a token radius, a fresh smoke should not already be blocking a
    // sightline across the map.
    if (!(r > 0.2)) return false;

    const ax = a.x - this.centre.x, ay = a.y - this.centre.y, az = a.z - this.centre.z;
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const len2 = dx * dx + dy * dy + dz * dz;

    if (!(len2 > EPS)) {
      // Degenerate segment: is the point itself inside?
      return ax * ax + ay * ay + az * az <= r * r;
    }

    // Project the centre onto the segment, clamped to [0,1].
    let t = -(ax * dx + ay * dy + az * dz) / len2;
    t = Math.max(0, Math.min(1, t));

    const cx = ax + dx * t, cy = ay + dy * t, cz = az + dz * t;
    return cx * cx + cy * cy + cz * cz <= r * r;
  }
}

// ---------------------------------------------------------------------------
// Molotov
// ---------------------------------------------------------------------------

/**
 * A spreading ground fire. The area grows from the impact point to the spec
 * radius over spreadTime, then burns out.
 *
 * Modelled as a growing CYLINDER, not a sphere: fire lies on the floor and
 * rises, so the containment test is "within radius horizontally AND within
 * height vertically". A sphere here would let you stand on top of a fire and
 * take damage from the flames beneath your feet, and would fail to burn someone
 * whose feet are in it but whose sample point is high.
 */
export class FireArea {
  constructor(origin, spec = GRENADE_SPECS[GRENADE.MOLOTOV]) {
    this.spec = spec;
    this.origin = new THREE.Vector3(origin.x, origin.y, origin.z);
    this.age = 0;
    this.dead = false;
  }

  get radius() {
    const s = this.spec;
    if (this.age <= 0) return 0;
    const t = Math.min(1, this.age / s.spreadTime);
    // Fire spreads fast at first as the fuel flows out, then creeps.
    return s.radius * (1 - Math.pow(1 - t, 2.2));
  }

  /** 0..1 intensity; full while spreading and burning, guttering at the end. */
  get intensity() {
    const s = this.spec;
    const left = s.burnTime - this.age;
    if (left <= 0) return 0;
    return Math.min(1, left / 1.2);
  }

  update(dt) {
    if (!finite(dt) || dt <= 0) return;
    this.age += dt;
    if (this.age >= this.spec.burnTime) this.dead = true;
  }

  /** Is `p` (a FEET position) standing in the fire? */
  contains(p) {
    if (this.dead) return false;
    const r = this.radius;
    if (!(r > 0)) return false;
    const dx = p.x - this.origin.x, dz = p.z - this.origin.z;
    if (dx * dx + dz * dz > r * r) return false;
    const dy = p.y - this.origin.y;
    return dy >= -0.5 && dy <= this.spec.height;
  }

  /** Damage for `dt` seconds of standing in it. 0 when outside. */
  damageFor(p, dt) {
    if (!this.contains(p) || !finite(dt) || dt <= 0) return 0;
    const d = this.spec.dps * dt * this.intensity;
    return finite(d) && d > 0 ? d : 0;
  }
}

// ---------------------------------------------------------------------------
// The projectile
// ---------------------------------------------------------------------------

/**
 * One thrown grenade in flight.
 *
 * Integrated in fixed substeps against CollisionWorld.sweep(). On a contact we
 * take the returned surface normal and split velocity into normal and tangent:
 * the normal component is reversed and scaled by restitution (the bounce), the
 * tangent component is scaled by friction (the scrub). That is the whole
 * bounce model, and it is the same normal the player's moveSlide uses, so a
 * grenade cannot bounce off a wall the player can walk through.
 */
export class Grenade {
  /**
   * @param {object} opts
   * @param {string} opts.type      GRENADE.*
   * @param {{x,y,z}} opts.position throw origin (usually eye + forward*offset)
   * @param {{x,y,z}} opts.velocity initial velocity
   * @param {string} [opts.ownerId] who threw it, for damage attribution
   * @param {number} [opts.tick]    tick thrown, so events carry it
   * @param {() => number} [opts.rand] injectable RNG for the decoy's jitter
   */
  constructor({ type, position, velocity, ownerId = null, tick = 0, rand = Math.random }) {
    this.type = type;
    this.spec = getGrenadeSpec(type);
    this.ownerId = ownerId;
    this.tick = tick;
    this.rand = rand;

    this.position = new THREE.Vector3(position.x, position.y, position.z);
    this.velocity = new THREE.Vector3(velocity.x, velocity.y, velocity.z);
    this.half = new THREE.Vector3(PHYSICS.radius, PHYSICS.radius, PHYSICS.radius);

    this.fuse = this.spec.fuse;
    this.detonated = false;
    this.atRest = false;
    this.bounces = 0;
    /** Total time in flight, for effects and for tests that assert settling. */
    this.age = 0;
    /** Set on detonation; the effect the world should spawn. */
    this.result = null;
  }

  /**
   * Advance the projectile. Returns a detonation descriptor on the step it goes
   * off, otherwise null. Callers pass the CollisionWorld.
   */
  update(dt, world) {
    if (this.detonated || !finite(dt) || dt <= 0) return null;
    this.age += dt;

    // Fixed substeps. A 22 m/s grenade travels 37cm in a 60Hz frame, which is
    // wider than some map trim; without substepping it tunnels through it.
    let remaining = dt;
    let guard = 0;
    while (remaining > EPS && guard++ < 64) {
      const step = Math.min(PHYSICS.maxStep, remaining);
      remaining -= step;
      this.step(step, world);
      if (this.detonated) break;
    }

    this.fuse -= dt;
    if (this.fuse <= 0 && !this.detonated) return this.detonate();
    return this.detonated ? this.result : null;
  }

  /** One physics substep. */
  step(dt, world) {
    if (this.atRest) return;

    // Gravity, then drag. Drag as pow(k, dt) so the result does not depend on
    // how the frame happened to be sliced.
    this.velocity.y -= PHYSICS.gravity * dt;
    const keep = Math.pow(PHYSICS.drag, dt);
    this.velocity.multiplyScalar(keep);

    if (!world) { this.position.addScaledVector(this.velocity, dt); return; }

    let delta = this.velocity.clone().multiplyScalar(dt);
    // Up to three contacts per substep resolves a corner (floor + two walls)
    // without letting a pathological case spin here forever.
    for (let i = 0; i < 3; i++) {
      if (delta.lengthSq() < EPS * EPS) break;
      const hit = world.sweep(this.position, this.half, delta);
      if (!hit) { this.position.add(delta); break; }

      // Advance to just short of contact.
      const safe = Math.max(0, hit.t - EPS);
      this.position.addScaledVector(delta, safe);
      const n = hit.normal;

      // Glass breaks instead of bouncing.
      if (this.spec.breakOnImpact) {
        const impact = Math.abs(this.velocity.dot(n));
        if (impact > 1.2) { this.detonate(); return; }
      }

      this.bounces++;

      // Split velocity into normal + tangent about the contact normal.
      const vn = this.velocity.dot(n);
      const normalPart = n.clone().multiplyScalar(vn);
      const tangent = this.velocity.clone().sub(normalPart);

      const approach = Math.abs(vn);
      if (approach < PHYSICS.restBounceSpeed) {
        // Too slow to bounce: kill the normal component entirely and let it
        // slide/roll. This is what stops the infinite bounce series.
        this.velocity.copy(tangent).multiplyScalar(this.spec.friction);
      } else {
        this.velocity.copy(tangent).multiplyScalar(this.spec.friction)
          .addScaledVector(n, approach * this.spec.restitution);
      }

      // Remaining motion this substep, projected onto the surface.
      const left = delta.clone().multiplyScalar(1 - safe);
      left.addScaledVector(n, -left.dot(n));
      delta = left;
    }

    // Never let the projectile end a step inside geometry -- one bad frame of
    // penetration and sweep() starts skipping the brush entirely, which is how
    // a grenade falls through the floor forever.
    if (world.overlaps(this.position, this.half)) {
      world.depenetrate(this.position, this.half);
    }

    // Rest test: grounded and slow. Checked by probing just below.
    if (this.velocity.lengthSq() < PHYSICS.restSpeed * PHYSICS.restSpeed) {
      const probe = this.position.clone();
      probe.y -= 0.02;
      if (world.overlaps(probe, this.half)) {
        this.atRest = true;
        this.velocity.set(0, 0, 0);
      }
    }

    // Paranoia: a NaN in a position is unrecoverable and would poison every
    // downstream distance test. Freeze rather than propagate.
    if (!finite(this.position.x) || !finite(this.position.y) || !finite(this.position.z)) {
      this.position.set(0, 0, 0);
      this.velocity.set(0, 0, 0);
      this.atRest = true;
    }
  }

  /** Fuse expired (or glass broke). Produces the payload descriptor. */
  detonate() {
    if (this.detonated) return this.result;
    this.detonated = true;
    this.result = {
      type: this.type,
      ownerId: this.ownerId,
      tick: this.tick,
      position: this.position.clone(),
      spec: this.spec,
    };
    return this.result;
  }
}

/**
 * Build a throw. Given an eye position and a normalised look direction, returns
 * the {position, velocity} a Grenade should start with.
 *
 * The pitchBias tilts the throw up so an underhand actually lobs rather than
 * being a slow flat toss into your own feet.
 */
export function throwVector(eye, forward, strength = THROW.FULL) {
  const dir = new THREE.Vector3(forward.x, forward.y, forward.z);
  if (dir.lengthSq() < EPS) dir.set(0, 0, -1);
  dir.normalize();

  // Bias upward, then renormalise so the strength is purely the speed term.
  const biased = dir.clone();
  biased.y += strength.pitchBias;
  biased.normalize();

  return {
    position: new THREE.Vector3(eye.x, eye.y, eye.z)
      .addScaledVector(dir, strength.forwardOffset),
    velocity: biased.multiplyScalar(strength.speed),
  };
}

// ---------------------------------------------------------------------------
// Manager
// ---------------------------------------------------------------------------

/**
 * Owns every live grenade, cloud and fire, and turns detonations into damage
 * events in the SAME shape combat.js emits -- {kind, tick, actorId, targetId,
 * x, y, z, amount} -- so grenade damage rides the existing host event path
 * rather than a parallel one.
 */
export class GrenadeSystem {
  /**
   * @param {object} opts
   * @param {object} opts.world   CollisionWorld
   * @param {() => number} [opts.rand]
   * @param {number} [opts.eventKind] EVENT.HIT value from protocol.js
   */
  constructor({ world, rand = Math.random, eventKind = 1 } = {}) {
    this.world = world;
    this.rand = rand;
    this.eventKind = eventKind;
    /** @type {Grenade[]} */
    this.projectiles = [];
    /** @type {SmokeCloud[]} */
    this.smokes = [];
    /** @type {FireArea[]} */
    this.fires = [];
    /** @type {Array<{position:THREE.Vector3, timer:number, left:number, ownerId:string}>} */
    this.decoys = [];
    /** @type {object[]} drained by the host */
    this.events = [];
    this.tick = 0;
  }

  /** Throw one. `eye` and `forward` are the thrower's. */
  throwGrenade(type, eye, forward, strength = THROW.FULL, ownerId = null, tick = 0) {
    const { position, velocity } = throwVector(eye, forward, strength);
    const g = new Grenade({ type, position, velocity, ownerId, tick, rand: this.rand });
    this.projectiles.push(g);
    return g;
  }

  /**
   * Step everything.
   *
   * @param {number} dt
   * @param {Array<object>} targets players/bots as
   *   {id, feet:{x,y,z}, eye:{x,y,z}, forward:{x,y,z}, alive:boolean,
   *    armor?:number, helmet?:boolean, applyDamage?:(amount, info) => void,
   *    onFlash?:(seconds) => void}
   */
  update(dt, targets = []) {
    if (!finite(dt) || dt <= 0) return;

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const g = this.projectiles[i];
      const det = g.update(dt, this.world);
      if (det) {
        this.projectiles.splice(i, 1);
        this.resolveDetonation(det, targets);
      }
    }

    for (let i = this.smokes.length - 1; i >= 0; i--) {
      this.smokes[i].update(dt);
      if (this.smokes[i].dead) this.smokes.splice(i, 1);
    }

    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      f.update(dt);
      for (const t of targets) {
        if (!t || t.alive === false) continue;
        const dmg = f.damageFor(t.feet, dt);
        if (dmg > 0) this.damage(t, dmg, f.origin, GRENADE.MOLOTOV, f.spec, f.ownerId);
      }
      if (f.dead) this.fires.splice(i, 1);
    }

    for (let i = this.decoys.length - 1; i >= 0; i--) {
      const d = this.decoys[i];
      d.left -= dt;
      d.timer -= dt;
      if (d.timer <= 0) {
        // Jittered so the fake fire does not sound like a metronome, which is
        // exactly how players learn to identify a decoy by ear in half a second.
        const s = GRENADE_SPECS[GRENADE.DECOY];
        const j = 1 + (this.rand() * 2 - 1) * s.shotJitter;
        d.timer = s.shotInterval * j;
        this.events.push({
          type: 'decoy-shot',
          kind: this.eventKind,
          tick: this.tick,
          actorId: d.ownerId,
          targetId: null,
          x: d.position.x, y: d.position.y, z: d.position.z,
          amount: 0,
        });
      }
      if (d.left <= 0) {
        // Decoys pop for a little damage when they expire.
        this.resolveBlast(
          GRENADE_SPECS[GRENADE.DECOY], d.position, targets, d.ownerId, GRENADE.DECOY);
        this.decoys.splice(i, 1);
      }
    }
  }

  /** Turn a detonation into its payload. */
  resolveDetonation(det, targets) {
    const { type, spec, position, ownerId } = det;
    switch (type) {
      case GRENADE.HE:
        this.resolveBlast(spec, position, targets, ownerId, GRENADE.HE);
        break;
      case GRENADE.FLASH:
        this.resolveFlash(spec, position, targets, ownerId);
        break;
      case GRENADE.SMOKE:
        this.smokes.push(new SmokeCloud(position, spec));
        break;
      case GRENADE.MOLOTOV: {
        const f = new FireArea(position, spec);
        f.ownerId = ownerId;
        this.fires.push(f);
        break;
      }
      case GRENADE.DECOY:
        this.decoys.push({
          position: position.clone(),
          timer: 0,
          left: spec.duration,
          ownerId,
        });
        break;
      default:
        break;
    }
    this.events.push({
      type: 'detonate',
      kind: this.eventKind,
      tick: this.tick,
      actorId: ownerId,
      targetId: null,
      x: position.x, y: position.y, z: position.z,
      amount: 0,
      grenade: type,
    });
    return det;
  }

  /** Radial damage against everyone in range, LOS-gated. */
  resolveBlast(spec, centre, targets, ownerId, kindName) {
    for (const t of targets) {
      if (!t || t.alive === false) continue;
      // Sample at CHEST height, not at the feet. A blast at floor level with a
      // feet sample is blocked by the floor brush itself on any downward slope,
      // and a blast above you would miss entirely.
      const sample = {
        x: t.feet.x,
        y: t.feet.y + EYE_HEIGHT * 0.65,
        z: t.feet.z,
      };
      const raw = blastDamage(spec, centre, sample, this.world);
      if (raw <= 0) continue;
      this.damage(t, raw, centre, kindName, spec, ownerId);
    }
  }

  /** Per-viewer blind values, emitted as events and pushed to onFlash hooks. */
  resolveFlash(spec, centre, targets, ownerId) {
    for (const t of targets) {
      if (!t || t.alive === false) continue;
      const secs = flashBlind(spec, centre, t.eye, t.forward, this.world);
      if (secs <= 0) continue;
      if (typeof t.onFlash === 'function') t.onFlash(secs);
      this.events.push({
        type: 'flash',
        kind: this.eventKind,
        tick: this.tick,
        actorId: ownerId,
        targetId: t.id,
        x: centre.x, y: centre.y, z: centre.z,
        // `amount` is a uint16 on the wire, so blind time travels in
        // milliseconds rather than as a fraction that would truncate to 0 or 1.
        amount: Math.max(0, Math.round(secs * 1000)),
        seconds: secs,
      });
    }
  }

  /**
   * Apply damage to one target through the EXISTING model: the hitgroup
   * multiplier table from bot.js, then armour from armor.js if the caller
   * supplied any. Blast damage is a chest hit -- explosions do not headshot.
   */
  damage(target, raw, centre, kindName, spec, ownerId) {
    let dmg = damageForHit(raw, 'chest', HITBOX_MULT);

    if (target.armor > 0 && typeof target.absorb === 'function') {
      dmg = target.absorb(dmg, 'chest', spec.armorPierce ?? 1);
    }

    if (!finite(dmg) || dmg <= 0) return 0;

    if (typeof target.applyDamage === 'function') {
      target.applyDamage(dmg, { source: kindName, ownerId, point: centre });
    }

    this.events.push({
      type: 'hit',
      kind: this.eventKind,
      tick: this.tick,
      actorId: ownerId,
      targetId: target.id,
      x: centre.x, y: centre.y, z: centre.z,
      amount: Math.max(0, Math.round(dmg)),
      weapon: kindName,
      part: 'chest',
    });
    return dmg;
  }

  /**
   * Is the segment a->b obscured by ANY live smoke? This is the hook combat.js
   * and the bot AI call; it is deliberately the only thing they need to know
   * about smoke.
   */
  blocksLineOfSight(a, b) {
    for (const s of this.smokes) {
      if (s.blocksLineOfSight(a, b)) return true;
    }
    return false;
  }

  drainEvents() {
    const out = this.events;
    this.events = [];
    return out;
  }

  clear() {
    this.projectiles.length = 0;
    this.smokes.length = 0;
    this.fires.length = 0;
    this.decoys.length = 0;
    this.events.length = 0;
  }
}
