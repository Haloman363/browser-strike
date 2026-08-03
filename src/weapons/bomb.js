import * as THREE from 'three';
import { HITBOX_MULT, damageForHit } from '../ai/bot.js';
import { blastDamage, segmentClear, EYE_HEIGHT } from './grenades.js';

// THE C4. Plant, countdown, defuse, detonation.
//
// SCOPE: this file is the bomb and nothing else. It does not know what a round
// is, it does not decide who wins, it does not spawn anyone. It exposes a state
// machine and a stream of events; the game mode that owns rounds reads them.
// Keeping the boundary here is what stops "bomb logic" from becoming "all of
// the game mode logic that happens to mention the bomb".
//
// The timings are CS's, because the whole late-round tension is calibrated to
// them: 40 seconds is exactly long enough that a 5-second kit defuse is a
// coinflip worth taking and a 10-second no-kit defuse usually is not.

const finite = (v) => typeof v === 'number' && Number.isFinite(v);

export const BOMB = {
  /** Seconds of holding the plant key before the bomb is down. */
  plantTime: 3.2,
  /** Seconds from plant to detonation. */
  fuseTime: 40.0,

  /** Defuse without a kit. */
  defuseTime: 10.0,
  /** Defuse with a kit. The kit is the entire reason the CT economy matters. */
  defuseTimeKit: 5.0,

  /**
   * Blast. Far bigger than an HE -- the C4 must clear the whole site so that
   * "stand next to it and hope" is never a plan. 500 at the epicentre with a
   * 500-radius-metre... no: 500 damage over 12m, which kills anything with a
   * clear line inside about 9m and chips at the edge.
   */
  damage: 500,
  radius: 12.0,
  falloffPow: 1.35,
  /** Kevlar does very little against a detonating explosive charge. */
  armorPierce: 0.85,

  /**
   * Beep cadence. The accelerating beep is the single best-known audio cue in
   * the genre and it is doing real work: it is how a player 30m away knows,
   * without looking, how long they have. Linear interpolation between these two
   * over the fuse makes the acceleration audible from about 15 seconds in.
   */
  beepIntervalStart: 1.0,
  beepIntervalEnd: 0.12,
  /**
   * Fraction of the fuse over which the interval ramps. 0.85 means the last
   * ~6 seconds are a near-continuous tone, which is the "you are not making it"
   * signal.
   */
  beepRampFraction: 0.85,
};

export const BombState = {
  CARRIED: 'carried',
  PLANTING: 'planting',
  PLANTED: 'planted',
  DEFUSING: 'defusing',
  DEFUSED: 'defused',
  EXPLODED: 'exploded',
};

/**
 * Beep interval in seconds at `elapsed` seconds into a `fuse`-second countdown.
 *
 * Pure so it can be tested and so the client's audio and the host's state
 * cannot drift: both compute the cadence from the same clock.
 */
export function beepInterval(elapsed, fuse = BOMB.fuseTime, cfg = BOMB) {
  if (!finite(elapsed) || !finite(fuse) || fuse <= 0) return cfg.beepIntervalStart;
  const t = Math.max(0, Math.min(1, elapsed / (fuse * cfg.beepRampFraction)));
  // Quadratic ease so most of the acceleration lands in the final third, where
  // it carries information, rather than being spread evenly and sounding like
  // a slow ramp from the first second.
  const eased = t * t;
  return cfg.beepIntervalStart +
    (cfg.beepIntervalEnd - cfg.beepIntervalStart) * eased;
}

/**
 * Seconds a defuse takes.
 * Exposed separately from the state machine so UI ("you cannot make it") and
 * bot decision-making can ask the question without owning a bomb.
 */
export function defuseDuration(hasKit, cfg = BOMB) {
  return hasKit ? cfg.defuseTimeKit : cfg.defuseTime;
}

/**
 * Can a defuse started NOW finish before detonation?
 * The honest answer to "should I try", which is a real decision players make
 * every round. Returns true only if it strictly completes in time.
 */
export function canDefuseInTime(timeLeft, hasKit, cfg = BOMB) {
  if (!finite(timeLeft)) return false;
  return timeLeft >= defuseDuration(hasKit, cfg);
}

/**
 * The C4 itself.
 *
 * Events are pushed in the same {kind, tick, actorId, targetId, x, y, z, amount}
 * shape combat.js emits, so a host can drain them onto the same wire path.
 */
export class Bomb {
  /**
   * @param {object} opts
   * @param {object} [opts.world]     CollisionWorld, for the blast LOS gate
   * @param {number} [opts.eventKind] EVENT.* value from protocol.js
   * @param {object} [opts.cfg]       override BOMB for tests/tuning
   */
  constructor({ world = null, eventKind = 1, cfg = BOMB } = {}) {
    this.world = world;
    this.eventKind = eventKind;
    this.cfg = cfg;

    this.state = BombState.CARRIED;
    /** Who is holding it, when CARRIED. */
    this.carrierId = null;
    /** Where it sits once planted. */
    this.position = new THREE.Vector3();

    /** Progress accumulators, seconds. */
    this.plantProgress = 0;
    this.elapsed = 0;          // since plant
    this.defuseProgress = 0;
    this.defuserId = null;
    this.defuserHasKit = false;
    this.planterId = null;

    /** Beep bookkeeping. */
    this.beepTimer = 0;
    this.beeps = 0;

    this.tick = 0;
    /** @type {object[]} */
    this.events = [];
  }

  // -- queries --------------------------------------------------------------

  get planted() {
    return this.state === BombState.PLANTED || this.state === BombState.DEFUSING;
  }
  get timeLeft() {
    return this.planted ? Math.max(0, this.cfg.fuseTime - this.elapsed) : 0;
  }
  /** 0..1 plant progress, for the progress bar. */
  get plantFraction() {
    return Math.max(0, Math.min(1, this.plantProgress / this.cfg.plantTime));
  }
  /** 0..1 defuse progress. */
  get defuseFraction() {
    if (this.state !== BombState.DEFUSING) return 0;
    return Math.max(0, Math.min(1,
      this.defuseProgress / defuseDuration(this.defuserHasKit, this.cfg)));
  }
  /** Would a defuse started now finish? */
  canDefuse(hasKit) {
    return this.planted && canDefuseInTime(this.timeLeft, hasKit, this.cfg);
  }

  // -- planting -------------------------------------------------------------

  /**
   * Call every frame the planter is holding the key at `position`.
   * Interrupting is simply NOT calling it -- `cancelPlant` resets the bar.
   * @returns {boolean} true on the frame the bomb goes down
   */
  plant(dt, position, actorId = null) {
    if (this.state !== BombState.CARRIED && this.state !== BombState.PLANTING) return false;
    if (!finite(dt) || dt <= 0) return false;

    if (this.state === BombState.CARRIED) {
      this.state = BombState.PLANTING;
      this.plantProgress = 0;
      this.emit('plant-start', actorId, position, 0);
    }

    this.plantProgress += dt;
    if (position) this.position.set(position.x, position.y, position.z);

    if (this.plantProgress >= this.cfg.plantTime) {
      this.state = BombState.PLANTED;
      this.planterId = actorId;
      this.elapsed = 0;
      this.beepTimer = 0;
      this.beeps = 0;
      this.emit('planted', actorId, this.position, Math.round(this.cfg.fuseTime));
      return true;
    }
    return false;
  }

  /** Planter let go or died. The bar resets -- CS does not bank plant progress. */
  cancelPlant() {
    if (this.state !== BombState.PLANTING) return false;
    this.state = BombState.CARRIED;
    this.plantProgress = 0;
    this.emit('plant-cancel', this.carrierId, this.position, 0);
    return true;
  }

  /** Force a planted state, for tests and for a host restoring a snapshot. */
  forcePlant(position, actorId = null) {
    this.state = BombState.PLANTED;
    this.planterId = actorId;
    if (position) this.position.set(position.x, position.y, position.z);
    this.plantProgress = this.cfg.plantTime;
    this.elapsed = 0;
    this.beepTimer = 0;
    this.beeps = 0;
    return this;
  }

  // -- defusing -------------------------------------------------------------

  /**
   * Call every frame the defuser is holding the key.
   * @returns {boolean} true on the frame the bomb is defused
   */
  defuse(dt, actorId = null, hasKit = false) {
    if (!this.planted) return false;
    if (!finite(dt) || dt <= 0) return false;

    // A DIFFERENT defuser starting means the previous one's progress is gone.
    // CS is explicit about this: you cannot tag-team a defuse, and a player who
    // could inherit half a defuse from a dead teammate would break the whole
    // "kill the defuser" interaction.
    if (this.state !== BombState.DEFUSING || this.defuserId !== actorId) {
      this.state = BombState.DEFUSING;
      this.defuserId = actorId;
      this.defuserHasKit = !!hasKit;
      this.defuseProgress = 0;
      this.emit('defuse-start', actorId, this.position,
        Math.round(defuseDuration(hasKit, this.cfg) * 1000));
    }

    this.defuseProgress += dt;
    if (this.defuseProgress >= defuseDuration(this.defuserHasKit, this.cfg)) {
      this.state = BombState.DEFUSED;
      this.emit('defused', actorId, this.position, 0);
      return true;
    }
    return false;
  }

  /** Defuser stopped or died. Progress is lost, not banked. */
  cancelDefuse() {
    if (this.state !== BombState.DEFUSING) return false;
    this.state = BombState.PLANTED;
    const who = this.defuserId;
    this.defuserId = null;
    this.defuseProgress = 0;
    this.emit('defuse-cancel', who, this.position, 0);
    return true;
  }

  // -- the clock ------------------------------------------------------------

  /**
   * Advance the countdown, emit beeps, and detonate when the fuse runs out.
   *
   * ORDERING MATTERS and is deliberate: the fuse is advanced and checked BEFORE
   * a defuse completing in the same frame would be considered, because defuse()
   * is called by the caller and this is called after. A frame in which both
   * would complete resolves as an explosion. That is the correct bias -- the
   * alternative rewards a defuse that started too late.
   *
   * @param {number} dt
   * @param {Array<object>} targets same shape GrenadeSystem.update takes
   */
  update(dt, targets = []) {
    if (!this.planted || !finite(dt) || dt <= 0) return null;

    this.elapsed += dt;

    // Beeps. Interval is recomputed from the CURRENT elapsed each time, so the
    // cadence accelerates continuously rather than in steps.
    this.beepTimer -= dt;
    let guard = 0;
    while (this.beepTimer <= 0 && this.elapsed < this.cfg.fuseTime && guard++ < 64) {
      const interval = beepInterval(this.elapsed, this.cfg.fuseTime, this.cfg);
      this.beepTimer += Math.max(0.02, interval);
      this.beeps++;
      this.emit('beep', this.planterId, this.position,
        Math.round(this.timeLeft * 1000));
    }

    if (this.elapsed >= this.cfg.fuseTime) return this.explode(targets);
    return null;
  }

  /**
   * Detonate. Radial damage with the SAME blast model the HE grenade uses --
   * one falloff curve, one LOS gate, one place to fix a bug in either.
   */
  explode(targets = []) {
    if (this.state === BombState.EXPLODED || this.state === BombState.DEFUSED) return null;
    this.state = BombState.EXPLODED;

    const spec = {
      damage: this.cfg.damage,
      radius: this.cfg.radius,
      falloffPow: this.cfg.falloffPow,
      armorPierce: this.cfg.armorPierce,
    };

    const casualties = [];
    for (const t of targets) {
      if (!t || t.alive === false) continue;
      const sample = {
        x: t.feet.x,
        y: t.feet.y + EYE_HEIGHT * 0.65,
        z: t.feet.z,
      };
      const raw = blastDamage(spec, this.position, sample, this.world);
      if (raw <= 0) continue;

      let dmg = damageForHit(raw, 'chest', HITBOX_MULT);
      if (t.armor > 0 && typeof t.absorb === 'function') {
        dmg = t.absorb(dmg, 'chest', spec.armorPierce);
      }
      if (!finite(dmg) || dmg <= 0) continue;

      if (typeof t.applyDamage === 'function') {
        t.applyDamage(dmg, { source: 'c4', ownerId: this.planterId, point: this.position });
      }
      casualties.push({ id: t.id, damage: dmg });
      this.emit('hit', this.planterId, this.position, Math.round(dmg), t.id);
    }

    this.emit('exploded', this.planterId, this.position, 0);
    return { position: this.position.clone(), casualties };
  }

  /** Has a clear line from the bomb to `point`? Used by "am I safe" UI/AI. */
  hasLineTo(point) {
    return segmentClear(this.world, this.position, point);
  }

  // -- plumbing -------------------------------------------------------------

  emit(type, actorId, position, amount, targetId = null) {
    this.events.push({
      type,
      kind: this.eventKind,
      tick: this.tick,
      actorId: actorId ?? null,
      targetId,
      x: position ? position.x : 0,
      y: position ? position.y : 0,
      z: position ? position.z : 0,
      amount: finite(amount) ? Math.max(0, Math.min(65535, Math.round(amount))) : 0,
    });
  }

  drainEvents() {
    const out = this.events;
    this.events = [];
    return out;
  }

  /** Back to a carried, unplanted bomb. The game mode calls this between rounds. */
  reset(carrierId = null) {
    this.state = BombState.CARRIED;
    this.carrierId = carrierId;
    this.planterId = null;
    this.defuserId = null;
    this.plantProgress = 0;
    this.defuseProgress = 0;
    this.elapsed = 0;
    this.beepTimer = 0;
    this.beeps = 0;
    this.events.length = 0;
    return this;
  }

  /** Everything the HUD needs, as plain data. */
  snapshot() {
    return {
      state: this.state,
      planted: this.planted,
      timeLeft: +this.timeLeft.toFixed(3),
      plantFraction: +this.plantFraction.toFixed(3),
      defuseFraction: +this.defuseFraction.toFixed(3),
      position: [this.position.x, this.position.y, this.position.z],
      defuserId: this.defuserId,
      beeps: this.beeps,
    };
  }
}
