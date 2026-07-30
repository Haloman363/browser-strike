import { HITBOXES, HITBOX_MULT, damageForHit, raySphere } from '../ai/bot.js';
import { RIFLE, damageAt } from '../weapons/rifle.js';
import { tickDiff, EVENT, TICK_MASK } from './protocol.js';

// HOST-AUTHORITATIVE hit registration with lag compensation.
//
// Topology: P2P, one peer is the host. Clients do not decide damage; they say
// "at tick T I fired from P along D". The host rewinds every other player's
// hitboxes to where ITS OWN snapshot history says they were at tick T, tests
// the ray there, and applies damage.
//
// Without the rewind, a player at 100ms of latency is shooting at where the
// target was 100ms ago while the host tests against where it is now — at a
// 4.6 m/s strafe that is 46cm, wider than a torso. High-ping players would
// simply never hit anything, and would correctly conclude the game is broken.
//
// ANTI-CHEAT, HONESTLY: this model stops a lying CLIENT (fabricated fire rates,
// impossible ticks, shots from nowhere) because the host re-derives every
// number that matters. It cannot stop a cheating HOST. The host owns the
// authoritative state by construction, so a modified host can hand itself
// whatever it likes. That is inherent to host-authoritative P2P, not a bug with
// a fix — the only cure is a dedicated server the players do not control.
// Everything below is written to be correct against clients, not against hosts.

/**
 * Simulation tick rate, matching the transport layer's 128Hz sim clock. The
 * rewind window and every tick<->time conversion are expressed against this,
 * so changing it here changes them together.
 */
export const TICK_RATE = 128;
export const TICK_DURATION = 1 / TICK_RATE;

/**
 * How far back the host will rewind a hitbox, in seconds.
 *
 * THE TRADEOFF, both directions:
 *   Too small and genuinely laggy players are punished for their connection —
 *     their shots are tested against positions the target has already left, and
 *     they can never hit a moving opponent. 200ms covers essentially every
 *     playable connection (100ms RTT plus interpolation delay plus a jitter
 *     margin).
 *   Too large and you have handed every client a time machine. A client that
 *     claims an old tick gets to shoot people where they USED TO BE — around a
 *     corner they have since walked behind, or at a peek they already broke.
 *     The victim experiences being shot through a wall, seconds after they
 *     believe they got to safety. CS:GO caps this at 200ms for exactly this
 *     reason; Overwatch at ~220ms; Valorant lower still.
 * 200ms is the point where the last honest connections are still served and the
 * abuse window is short enough to be indistinguishable from ordinary lag.
 */
export const MAX_REWIND_SECONDS = 0.2;
export const MAX_REWIND_TICKS = Math.round(MAX_REWIND_SECONDS * TICK_RATE);

/**
 * How far into the FUTURE a claimed tick may be before it is rejected.
 * A client's tick estimate legitimately runs slightly ahead of the host's (that
 * is what input prediction is for), but only by about half an RTT. Anything
 * beyond this is either a broken clock or a client trying to shoot at a
 * position the host has not simulated yet.
 */
export const MAX_FUTURE_TICKS = 4;

/** Rounds per second the rifle can physically cycle. */
const CYCLIC_INTERVAL = 60 / RIFLE.rpm;

/**
 * Tolerance on the rate limit, as a fraction of the cyclic interval.
 * Clients time their own shots against a frame clock that is not the host's, so
 * a legitimate shot can arrive a few percent early. Rejecting at exactly the
 * cyclic interval would drop real rounds from every player on a 144Hz monitor.
 * 5% is far under the 2x a rapid-fire cheat needs to be worth using.
 */
const RATE_TOLERANCE = 0.05;
const MIN_SHOT_INTERVAL = CYCLIC_INTERVAL * (1 - RATE_TOLERANCE);

/** Health a player spawns with. Matches BOT.health so duels are symmetric. */
export const MAX_HEALTH = 100;
/** Seconds between death and respawn. */
export const RESPAWN_DELAY = 5;

/** Why a shot was thrown away. Surfaced so the host can log/telemeter abuse. */
export const Reject = {
  NO_SHOOTER: 'no-shooter',
  DEAD_SHOOTER: 'dead-shooter',
  RATE_LIMIT: 'rate-limit',
  TICK_TOO_OLD: 'tick-too-old',
  TICK_FUTURE: 'tick-future',
  BAD_INPUT: 'bad-input',
};

const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const finiteVec = (v) => !!v && finite(v.x) && finite(v.y) && finite(v.z);

/**
 * Ring buffer of per-tick world snapshots. The host writes one entry per
 * simulation tick; lag compensation reads them back.
 *
 * Sized to the rewind cap plus a small margin rather than "a few seconds": a
 * buffer longer than MAX_REWIND_TICKS is memory that exists only to be refused.
 */
export class SnapshotHistory {
  constructor(capacity = MAX_REWIND_TICKS + 8) {
    this.capacity = capacity;
    /** @type {Array<{tick:number, players:Map<string,object>}>} */
    this.buffer = new Array(capacity).fill(null);
    this.newestTick = -1;
  }

  /**
   * Record the state of every player at `tick`.
   * @param {number} tick
   * @param {Iterable<[string, {position:{x,y,z}, yaw:number, alive:boolean}]>} entries
   */
  record(tick, entries) {
    if (!finite(tick)) return;
    // Ticks wrap at 16 bits, so store the masked value and compare masked.
    const t = tick & TICK_MASK;
    const players = new Map();
    for (const [id, s] of entries) {
      if (!finiteVec(s.position) || !finite(s.yaw)) continue;   // never store NaN
      players.set(id, {
        position: { x: s.position.x, y: s.position.y, z: s.position.z },
        yaw: s.yaw,
        alive: s.alive !== false,
      });
    }
    this.buffer[t % this.capacity] = { tick: t, players };
    // The snapshot channel is UNORDERED, so a late packet can arrive after a
    // newer one. tickDiff keeps "newest" meaningful across the wrap AND stops a
    // straggler from dragging the timeline backwards — which would make the
    // rewind window think the world is older than it is and start refusing
    // perfectly valid shots.
    if (this.newestTick < 0 || tickDiff(t, this.newestTick) > 0) this.newestTick = t;
  }

  /** The snapshot recorded at exactly `tick`, or null if it has aged out. */
  at(tick) {
    if (!finite(tick)) return null;
    const t = tick & TICK_MASK;
    const slot = this.buffer[t % this.capacity];
    return slot && slot.tick === t ? slot : null;
  }

  /**
   * One player's state at `tick`, clamped into the rewind window.
   * Returns null rather than extrapolating: inventing a position the host never
   * simulated is how you get hits registered on players who were never there.
   */
  playerAt(tick, id) {
    const snap = this.at(tick);
    if (!snap) return null;
    return snap.players.get(id) || null;
  }

  clear() {
    this.buffer.fill(null);
    this.newestTick = -1;
  }
}

/**
 * Rewind-aware hitbox raycast. Same spheres, same ordering and same
 * nearest-hit resolution as Bot.raycastHitbox — the local and networked paths
 * must agree about what counts as a headshot.
 *
 * @param {{position:{x,y,z}, yaw:number}} state FEET position + facing
 * @param {{x,y,z}} origin normalised ray origin
 * @param {{x,y,z}} dir    normalised direction
 * @param {number} maxDist
 * @returns {{part:string, multiplier:number, distance:number, point:{x,y,z}}|null}
 */
export function raycastPlayerHitbox(state, origin, dir, maxDist = RIFLE.maxRange) {
  if (!state || !finiteVec(state.position) || !finite(state.yaw)) return null;
  if (!finiteVec(origin) || !finiteVec(dir) || !finite(maxDist)) return null;

  const feet = state.position;
  const sin = Math.sin(state.yaw), cos = Math.cos(state.yaw);

  let best = null;
  for (const box of HITBOXES) {
    // Rotate the local lateral offset into world space about Y. Identical to
    // Bot.raycastHitbox — the arm boxes are the only ones with an x offset and
    // getting the sign wrong swaps left and right arm hits.
    const lx = box.x ?? 0;
    const center = {
      x: feet.x + lx * cos,
      y: feet.y + box.y,
      z: feet.z - lx * sin,
    };
    const t = raySphere(origin, dir, center, box.r, maxDist);
    if (t === null) continue;
    if (!best || t < best.distance) {
      best = {
        part: box.part,
        multiplier: HITBOX_MULT[box.part],
        distance: t,
        point: {
          x: origin.x + dir.x * t,
          y: origin.y + dir.y * t,
          z: origin.z + dir.z * t,
        },
      };
    }
  }
  return best;
}

/**
 * One tracked combatant. Health, lifecycle and score only — position lives in
 * the snapshot history, because that is the thing that has to be rewound.
 */
export class CombatPlayer {
  constructor(id, opts = {}) {
    this.id = id;
    this.name = opts.name || id;
    this.health = MAX_HEALTH;
    this.alive = true;
    this.kills = 0;
    this.deaths = 0;
    this.damageDealt = 0;
    this.respawnTimer = 0;
    /** Host tick of this player's last accepted shot; drives the rate limit. */
    this.lastShotTick = -Infinity;
    /** Who fired the killing round, so a double-fatal cannot double-credit. */
    this.killedBy = null;
  }
}

/**
 * The host's authoritative combat state.
 *
 * Usage per host tick:
 *   combat.beginTick(tick, playerStates)   // record the snapshot
 *   combat.update(dt)                      // respawn timers
 *   combat.resolveShot(claim)              // for each client fire request
 */
export class CombatHost {
  constructor(opts = {}) {
    /** @type {Map<string, CombatPlayer>} */
    this.players = new Map();
    this.history = new SnapshotHistory(opts.historyTicks);
    this.tick = 0;
    /** @type {Array<object>} events drained by the host for broadcast */
    this.events = [];
    this.maxRewindTicks = opts.maxRewindTicks ?? MAX_REWIND_TICKS;
    this.respawnDelay = opts.respawnDelay ?? RESPAWN_DELAY;
  }

  add(id, opts) {
    let p = this.players.get(id);
    if (!p) { p = new CombatPlayer(id, opts); this.players.set(id, p); }
    return p;
  }

  remove(id) { return this.players.delete(id); }
  get(id) { return this.players.get(id) || null; }

  /**
   * Advance the authoritative tick and store the world snapshot the rewind
   * will read back.
   * @param {number} tick
   * @param {Iterable<[string, {position:{x,y,z}, yaw:number}]>} playerStates
   */
  beginTick(tick, playerStates) {
    if (!finite(tick)) return;
    // Only ever advance. The host's own sim is ordered, but this is also the
    // path a late/unordered snapshot takes, and letting a straggler move the
    // authoritative clock backwards would shrink the rewind window under every
    // in-flight shot claim.
    const t = tick & TICK_MASK;
    if (this.tick === undefined || tickDiff(t, this.tick) > 0) this.tick = t;
    const entries = [];
    for (const [id, s] of playerStates) {
      const p = this.players.get(id);
      entries.push([id, { position: s.position, yaw: s.yaw, alive: p ? p.alive : true }]);
    }
    this.history.record(tick, entries);
  }

  /** Respawn timers. Health/death are event-driven, not polled. */
  update(dt) {
    if (!finite(dt) || dt <= 0) return;
    for (const p of this.players.values()) {
      if (p.alive) continue;
      p.respawnTimer -= dt;
      if (p.respawnTimer <= 0) this.respawn(p.id);
    }
  }

  /**
   * @typedef {object} ShotClaim
   * @property {string} shooterId
   * @property {number} tick        the tick the client believes it fired on
   * @property {{x,y,z}} origin     world-space eye position at that tick
   * @property {{x,y,z}} direction  normalised aim direction
   * @property {string} [weapon]
   */

  /**
   * Validate and resolve one client shot claim.
   * @param {ShotClaim} claim
   * @returns {{ok:true, hits:Array<object>}|{ok:false, reason:string}}
   */
  resolveShot(claim) {
    if (!claim || typeof claim.shooterId !== 'string') {
      return { ok: false, reason: Reject.BAD_INPUT };
    }
    const shooter = this.players.get(claim.shooterId);
    if (!shooter) return { ok: false, reason: Reject.NO_SHOOTER };
    if (!shooter.alive) return { ok: false, reason: Reject.DEAD_SHOOTER };

    if (!finite(claim.tick)) return { ok: false, reason: Reject.BAD_INPUT };
    if (!finiteVec(claim.origin) || !finiteVec(claim.direction)) {
      return { ok: false, reason: Reject.BAD_INPUT };
    }
    // A zero-length direction would make every raySphere degenerate; normalise
    // here rather than trusting a client to have done it.
    const dl = Math.hypot(claim.direction.x, claim.direction.y, claim.direction.z);
    if (!(dl > 1e-6)) return { ok: false, reason: Reject.BAD_INPUT };
    const dir = {
      x: claim.direction.x / dl,
      y: claim.direction.y / dl,
      z: claim.direction.z / dl,
    };

    // --- Plausibility of the claimed tick, in both directions.
    // TICKS WRAP at 16 bits (~8.5 minutes at 128Hz), so every comparison below
    // goes through the wrap-safe tickDiff. A raw `a - b` here is not a rounding
    // nit: at the rollover it turns a valid shot into an "ancient" one and, far
    // worse, makes a genuinely ancient claim look current — an exploit that
    // would open a 65000-tick time machine once every eight minutes.
    const age = tickDiff(this.tick, claim.tick);   // >0 = in the past

    // Too far in the future: the host has not simulated it, so there is nothing
    // honest to test against.
    if (age < -MAX_FUTURE_TICKS) {
      return { ok: false, reason: Reject.TICK_FUTURE };
    }
    // Too far in the past: this is the time-machine cap. Refusing outright
    // rather than clamping to the oldest available tick is deliberate — a
    // silent clamp would still let the client shoot at a stale position, just a
    // slightly less stale one.
    if (age > this.maxRewindTicks) {
      return { ok: false, reason: Reject.TICK_TOO_OLD };
    }

    // --- Rate limit. The rifle cannot cycle faster than RIFLE.rpm, so two
    // accepted shots cannot be closer together than that in TICK time. Using
    // the claimed ticks (not arrival times) is what makes this immune to a
    // client batching or delaying its packets.
    // lastShotTick starts at -Infinity, which tickDiff cannot represent, so the
    // first shot of a life short-circuits past it.
    if (Number.isFinite(shooter.lastShotTick)) {
      const sinceLast = tickDiff(claim.tick, shooter.lastShotTick) * TICK_DURATION;
      if (sinceLast < MIN_SHOT_INTERVAL) {
        return { ok: false, reason: Reject.RATE_LIMIT };
      }
    }
    shooter.lastShotTick = claim.tick & TICK_MASK;

    // --- LAG COMPENSATION. Rewind every other player to the claimed tick and
    // test the ray against where they WERE, not where they are now.
    const snap = this.history.at(claim.tick);
    const hits = [];
    let best = null, bestId = null;

    if (snap) {
      for (const [id, state] of snap.players) {
        if (id === claim.shooterId) continue;
        const victim = this.players.get(id);
        // Alive at the TIME OF THE SHOT, per the snapshot — a player who has
        // died since must still be hittable at the tick they were alive, or
        // trades stop working.
        if (!state.alive) continue;
        if (!victim) continue;

        const hit = raycastPlayerHitbox(state, claim.origin, dir, RIFLE.maxRange);
        if (!hit) continue;
        if (!best || hit.distance < best.distance) { best = hit; bestId = id; }
      }
    }

    // A rifle round stops at the first body it meets, so only the nearest hit
    // counts. Returning an array anyway keeps the shape stable if penetration
    // is ever added.
    if (best) {
      hits.push(this.applyHit(shooter, bestId, best, claim));
    }
    return { ok: true, hits };
  }

  /**
   * Apply damage from a resolved hit and emit the events the host broadcasts.
   * Damage numbers come entirely from the existing model — damageAt for the
   * distance falloff, damageForHit for the hitgroup multiplier. Nothing new is
   * invented here on purpose: a second damage table is a second thing to tune.
   */
  applyHit(shooter, victimId, hit, claim) {
    const victim = this.players.get(victimId);
    const base = damageAt(hit.distance);
    const damage = damageForHit(base, hit.part);

    const record = {
      shooterId: shooter.id,
      victimId,
      part: hit.part,
      distance: hit.distance,
      damage,
      point: hit.point,
      weapon: claim.weapon || 'rifle',
      tick: claim.tick,
      fatal: false,
    };

    // A non-finite damage would silently NaN the victim's health and make them
    // unkillable — a health bar that never moves is a much worse bug than a
    // dropped shot.
    if (!finite(damage) || damage < 0) return record;
    if (!victim || !victim.alive) return record;

    victim.health -= damage;
    shooter.damageDealt += damage;

    // Emitted in protocol.js's EVENT shape so the host can hand it straight to
    // encodeEvent. `amount` is a uint16 on the wire, so damage is rounded here
    // rather than silently truncated at encode time.
    this.events.push({
      ...record,
      type: 'hit',
      kind: EVENT.HIT,
      tick: claim.tick & TICK_MASK,
      actorId: shooter.id,
      targetId: victimId,
      x: hit.point.x, y: hit.point.y, z: hit.point.z,
      amount: Math.max(0, Math.round(damage)),
    });

    if (victim.health <= 0) {
      // DOUBLE-KILL GUARD. Two fatal rounds can land on the same tick — a trade,
      // or one spray where two rounds resolve back to back. killedBy is set
      // exactly once and kill() early-outs on !alive, so the second round is
      // damage that lands on a corpse and credits nobody.
      record.fatal = true;
      this.kill(shooter, victim, record);
    }
    return record;
  }

  kill(shooter, victim, record) {
    if (!victim.alive) return;
    victim.alive = false;
    victim.health = 0;
    victim.deaths++;
    victim.killedBy = shooter.id;
    victim.respawnTimer = this.respawnDelay;
    // Suicide (world damage routed through here) must not award a kill.
    if (shooter.id !== victim.id) shooter.kills++;

    this.events.push({
      type: 'kill',
      kind: EVENT.DEATH,
      tick: record.tick & TICK_MASK,
      actorId: shooter.id,       // killer
      targetId: victim.id,       // victim
      x: record.point.x, y: record.point.y, z: record.point.z,
      amount: 0,
      killerId: shooter.id,
      victimId: victim.id,
      weapon: record.weapon,
      part: record.part,
      distance: record.distance,
      headshot: record.part === 'head',
    });
  }

  respawn(id) {
    const p = this.players.get(id);
    if (!p) return null;
    p.health = MAX_HEALTH;
    p.alive = true;
    p.respawnTimer = 0;
    p.killedBy = null;
    // The rate limiter keys off claimed ticks; leaving lastShotTick set means a
    // respawned player's first round is not spuriously rejected.
    p.lastShotTick = -Infinity;
    this.events.push({
      type: 'respawn',
      kind: EVENT.RESPAWN,
      tick: this.tick & TICK_MASK,
      actorId: id,
      targetId: id,
      x: 0, y: 0, z: 0,
      amount: MAX_HEALTH,
      playerId: id,
    });
    return p;
  }

  /** Take the pending events and clear the queue. */
  drainEvents() {
    const out = this.events;
    this.events = [];
    return out;
  }

  /** Scoreboard, highest kills first. */
  scoreboard() {
    return [...this.players.values()]
      .map((p) => ({
        id: p.id, name: p.name, kills: p.kills, deaths: p.deaths,
        health: p.health, alive: p.alive,
        damageDealt: Math.round(p.damageDealt),
      }))
      .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
  }
}
