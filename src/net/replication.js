import * as THREE from 'three';

// Entity interpolation for REMOTE players under a host-authoritative sim.
//
// Remote players are never predicted. We do not know their inputs, so predicting
// them means guessing, and a wrong guess about a player who stops or turns is a
// visible rubber-band on someone else's body — much more noticeable than a
// smoothed correction on your own. Instead we deliberately render them in the
// past: buffer snapshots, then draw at (now - INTERP_DELAY) by interpolating
// between the two real snapshots that bracket that time. Every frame shown is
// then a blend of two things the host actually said, never a guess.
//
// The cost is that remote players are rendered ~100ms behind. That is the
// standard trade (Source does the same at 100ms) and it is the host's job to
// compensate for it at hit-registration time by rewinding.

// --- Tunables ----------------------------------------------------------

/**
 * How far in the past remote players are rendered, in seconds.
 *
 * Must exceed the snapshot interval, or the buffer will frequently have nothing
 * ahead of the render time and be forced to extrapolate. At a 20Hz snapshot rate
 * (50ms) this leaves two full intervals of slack, so a single dropped packet
 * still leaves a real snapshot on both sides of the render cursor. 100ms is also
 * about the point where added latency stops being perceptible as input lag on
 * someone else's motion.
 */
export const INTERP_DELAY = 0.1;

/**
 * Hard cap on extrapolation past the newest snapshot, in seconds.
 *
 * Extrapolation is off by default (see `allowExtrapolation`). When enabled it
 * exists purely to cover a burst of dropped packets, and it is capped tightly
 * because extrapolated motion is a linear guess: a player who was strafing and
 * has since stopped will slide through a wall if allowed to run. 150ms is three
 * dropped snapshots at 20Hz. Beyond the cap we freeze at the last known state,
 * which reads as a brief stutter — much better than a body sliding into geometry
 * and then snapping back.
 */
export const MAX_EXTRAPOLATION = 0.15;

/**
 * Snapshots older than this behind the render cursor are pruned. Two extra
 * interpolation delays of history is enough to survive reordering while keeping
 * the buffer small.
 */
export const HISTORY_WINDOW = INTERP_DELAY * 3;

/** Per-player snapshot ring capacity. 64 covers >3s at 20Hz. */
export const SNAPSHOT_BUFFER_SIZE = 64;

/**
 * Minimum snapshots kept regardless of age. Two is the floor: deriving velocity
 * (and extrapolating) needs a pair, and a starved buffer is exactly when that
 * matters most.
 */
export const MIN_HISTORY = 2;

/**
 * Maximum distance (metres) the rendered position may move in a single frame
 * while catching up after the buffer starved.
 *
 * The interpolation buffer can only bridge gaps up to INTERP_DELAY. Heavier loss
 * produces longer gaps — at 30% loss a run of five dropped snapshots is a 250ms
 * hole, well past a 100ms buffer. The interpolator then freezes on the newest
 * state, and when data resumes the render cursor has fallen behind by the whole
 * gap, so the correct interpolated position is suddenly far ahead. Snapping
 * there is a visible teleport.
 *
 * Rather than widening the buffer for everyone (which costs latency on every
 * frame for a rare event), the catch-up is rate-limited: the body sprints toward
 * the correct position at a bounded speed. 0.55m/frame at 60Hz is ~33m/s, about
 * 7x run speed — fast enough to resolve a quarter-second hole in a few frames,
 * slow enough to read as motion rather than a jump.
 */
export const MAX_CATCHUP_STEP = 0.55;

/**
 * A remote player who has sent nothing for this long is considered gone. Their
 * interpolator is kept (so a reconnect resumes cleanly) but marked stale so the
 * renderer can hide the model rather than leave a statue on the map.
 */
export const STALE_TIMEOUT = 2.0;

// --- Structs -----------------------------------------------------------
// Plain objects, defined here rather than imported: transport.js and
// protocol.js are being written concurrently. These are the shapes this module
// consumes and produces; integration adapts the wire format to them.

/**
 * One remote player's authoritative state at one host tick.
 * @typedef {object} RemoteSnapshot
 * @property {string|number} id   Stable player id.
 * @property {number} tick        Host tick. Used for ordering and dedup.
 * @property {number} time        Host timestamp in seconds. The interpolation
 *                                clock; must be monotonic per player on the
 *                                host's side even though delivery is not.
 * @property {{x:number,y:number,z:number}} position  Capsule centre.
 * @property {{x:number,y:number,z:number}} [velocity] Optional; derived from
 *                                neighbouring snapshots when absent.
 * @property {number} yaw
 * @property {number} pitch
 * @property {boolean} [crouching]
 * @property {number} [height]    Capsule height. Falls back to a stance guess.
 * @property {boolean} [grounded]
 * @property {number} [health]
 * @property {boolean} [firing]
 * @property {number} [weaponId]
 */

/**
 * Render-ready state for one remote player. THIS IS THE STRUCT THE MODEL/
 * ANIMATION LAYER CONSUMES. Field meanings:
 *
 * @typedef {object} RemoteRenderState
 * @property {string|number} id
 * @property {THREE.Vector3} position   Interpolated capsule centre, world space.
 *                                      Feet are at position.y - height/2.
 * @property {number} yaw               Radians, shortest-arc interpolated.
 * @property {number} pitch             Radians, for head/spine aim.
 * @property {THREE.Vector3} velocity   World-space m/s. Derived from the two
 *                                      bracketing snapshots, so it is consistent
 *                                      with the rendered motion — using the raw
 *                                      reported velocity would desync the legs
 *                                      from the actual on-screen translation.
 * @property {number} speed             hypot(velocity.x, velocity.z), m/s.
 *                                      Drive locomotion blend with this.
 * @property {number} moveDir           Radians: direction of horizontal travel
 *                                      relative to yaw, in [-PI, PI]. 0 = walking
 *                                      forward, PI/2 = strafing left. For a
 *                                      strafe blend tree.
 * @property {boolean} crouching
 * @property {number} height            Capsule height, m. Interpolated, so the
 *                                      crouch transition is smooth rather than a
 *                                      one-frame pop.
 * @property {number} stance            0 = fully standing, 1 = fully crouched.
 *                                      Normalised from height; use directly as a
 *                                      crouch blend weight.
 * @property {boolean} grounded
 * @property {number} verticalSpeed     velocity.y, m/s. Sign picks jump vs fall.
 * @property {number} health
 * @property {boolean} firing
 * @property {number} weaponId
 * @property {boolean} stale            No recent snapshots — hide the model.
 * @property {boolean} extrapolated     This frame is a guess, not a blend of two
 *                                      real snapshots. Useful for a debug tint.
 */

const finite = (n) => typeof n === 'number' && Number.isFinite(n);
const finiteVec = (v) => !!v && finite(v.x) && finite(v.y) && finite(v.z);

/** Interpolate an angle the short way round, so 179deg -> -179deg does not spin. */
function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/** Wrap to [-PI, PI]. */
function wrapAngle(a) {
  let x = (a + Math.PI) % (Math.PI * 2);
  if (x < 0) x += Math.PI * 2;
  return x - Math.PI;
}

// Stance heights, duplicated as constants rather than imported from movement.js
// so this module stays usable without the player subsystem. Kept in sync with
// MOVE.standHeight / MOVE.crouchHeight.
const STAND_HEIGHT = 1.37;
const CROUCH_HEIGHT = 0.97;

/**
 * Buffers snapshots for one remote player and samples them at a past time.
 *
 * The channel is UNORDERED but still retransmitted: PeerJS's {reliable:false}
 * sets only {ordered:false} and never sets maxRetransmits/maxPacketLifeTime, so
 * this is not classic fire-and-forget UDP. The realistic failure mode is a LATE
 * BURST of stale snapshots arriving together after a retransmit stall, rather
 * than a clean gap. Everything here is keyed on the snapshot's own `time` and
 * inserted at its sorted position, so a delayed burst is indistinguishable from
 * having received those packets in order — which is precisely what makes it
 * harmless. True loss is still handled (peer drop, congestion); it is just
 * rarer than the jitter case.
 */
class RemoteInterpolator {
  constructor(id) {
    this.id = id;
    /** Sorted ascending by `time`. @type {RemoteSnapshot[]} */
    this.buffer = [];
    this.lastTick = -Infinity;
    this.lastRenderTime = -Infinity;
    /** Last position actually rendered, for the catch-up rate limit. */
    this.lastPosition = null;

    // Reused so sampling does not allocate every frame for every player.
    this.state = {
      id,
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      yaw: 0, pitch: 0, speed: 0, moveDir: 0,
      crouching: false, height: STAND_HEIGHT, stance: 0,
      grounded: true, verticalSpeed: 0,
      health: 100, firing: false, weaponId: 0,
      stale: true, extrapolated: false,
    };
  }

  /**
   * Insert a snapshot. Rejects duplicates and non-finite payloads; accepts
   * out-of-order arrivals by inserting at the correct sorted position.
   * @param {RemoteSnapshot} snap
   * @returns {boolean} whether it was stored.
   */
  insert(snap) {
    if (!snap || !finite(snap.time) || !finiteVec(snap.position)) return false;
    if (!finite(snap.yaw) || !finite(snap.pitch)) return false;

    const buf = this.buffer;

    // Binary search for the insertion point by time.
    let lo = 0, hi = buf.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (buf[mid].time < snap.time) lo = mid + 1; else hi = mid;
    }

    // Duplicate: same time, or a tick already seen. The channel can deliver the
    // same datagram twice, and inserting it would create a zero-length segment
    // that makes the interpolation t divide by zero.
    if (lo < buf.length && buf[lo].time === snap.time) return false;
    if (finite(snap.tick) && buf.some((s) => s.tick === snap.tick)) return false;

    const stored = {
      id: this.id,
      tick: finite(snap.tick) ? snap.tick : 0,
      time: snap.time,
      position: { x: snap.position.x, y: snap.position.y, z: snap.position.z },
      velocity: finiteVec(snap.velocity)
        ? { x: snap.velocity.x, y: snap.velocity.y, z: snap.velocity.z }
        : null,
      yaw: snap.yaw,
      pitch: snap.pitch,
      crouching: !!snap.crouching,
      height: finite(snap.height)
        ? snap.height
        : (snap.crouching ? CROUCH_HEIGHT : STAND_HEIGHT),
      grounded: snap.grounded === undefined ? true : !!snap.grounded,
      health: finite(snap.health) ? snap.health : 100,
      firing: !!snap.firing,
      weaponId: finite(snap.weaponId) ? snap.weaponId : 0,
    };

    buf.splice(lo, 0, stored);
    // Ticks are masked on the wire and DO wrap, so `>` on raw tick numbers is
    // wrong at the wrap point. Ordering here is keyed on `time` throughout;
    // lastTick is only telemetry, so it tracks the newest *buffered* entry
    // rather than comparing magnitudes.
    this.lastTick = buf[buf.length - 1].tick;

    if (buf.length > SNAPSHOT_BUFFER_SIZE) buf.shift(); // oldest first
    return true;
  }

  /** Drop history well behind the render cursor. */
  prune(renderTime) {
    const cutoff = renderTime - HISTORY_WINDOW;
    // Keep one snapshot at or before the cutoff: it may still be the left-hand
    // side of the bracket if the next one is far ahead. Always keep at least two
    // entries — a starved buffer still needs a pair to derive velocity from,
    // both for the animation values and for capped extrapolation.
    let drop = 0;
    while (drop + 1 < this.buffer.length && this.buffer[drop + 1].time < cutoff) drop++;
    drop = Math.min(drop, Math.max(0, this.buffer.length - MIN_HISTORY));
    if (drop > 0) this.buffer.splice(0, drop);
  }

  get newestTime() {
    return this.buffer.length ? this.buffer[this.buffer.length - 1].time : -Infinity;
  }

  /**
   * Produce the render state at `renderTime` (already delayed by the caller).
   * @param {boolean} allowExtrapolation
   * @returns {RemoteRenderState|null} null until any snapshot has arrived.
   */
  sample(renderTime, allowExtrapolation) {
    const buf = this.buffer;
    if (buf.length === 0) return null;

    // Never let the render cursor walk backwards: an out-of-order arrival must
    // not rewind an already-drawn body.
    if (renderTime < this.lastRenderTime) renderTime = this.lastRenderTime;
    this.lastRenderTime = renderTime;

    const s = this.state;
    s.extrapolated = false;
    s.stale = (this.newestTime + STALE_TIMEOUT) < renderTime;

    // Find the bracketing pair: last snapshot at or before renderTime, and the
    // one after it.
    let i = -1;
    for (let k = 0; k < buf.length; k++) {
      if (buf[k].time <= renderTime) i = k; else break;
    }

    if (i < 0) {
      // renderTime precedes everything buffered — we have only just started
      // receiving this player. Hold the oldest known state rather than guessing
      // backwards.
      this.#write(buf[0], buf[0], 0, 0);
      return s;
    }

    if (i >= buf.length - 1) {
      // Nothing ahead of the cursor: buffer starved (packet loss, or the player
      // stopped sending).
      const newest = buf[buf.length - 1];
      const ahead = renderTime - newest.time;
      const prev = buf.length >= 2 ? buf[buf.length - 2] : newest;

      if (allowExtrapolation && ahead > 0 && prev !== newest) {
        // Capped linear extrapolation. Anything past MAX_EXTRAPOLATION is
        // frozen, because a longer linear guess puts bodies through walls.
        const t = Math.min(ahead, MAX_EXTRAPOLATION);
        const dt = newest.time - prev.time;
        if (dt > 1e-6) {
          this.#write(prev, newest, 1, 0);
          const vx = (newest.position.x - prev.position.x) / dt;
          const vy = (newest.position.y - prev.position.y) / dt;
          const vz = (newest.position.z - prev.position.z) / dt;
          s.position.x += vx * t;
          s.position.y += vy * t;
          s.position.z += vz * t;
          s.extrapolated = true;
          return this.#finish(s);
        }
      }

      // Default and fallback: freeze on the newest real state. A brief hitch is
      // preferable to invented motion.
      const prevForVel = buf.length >= 2 ? buf[buf.length - 2] : newest;
      this.#write(prevForVel, newest, 1, 0);
      return this.#finish(s);
    }

    const a = buf[i], b = buf[i + 1];
    const span = b.time - a.time;
    // span can never be 0 — insert() rejects equal times — but a corrupt
    // payload that slipped through must not produce Infinity here.
    const t = span > 1e-9 ? (renderTime - a.time) / span : 0;
    this.#write(a, b, Math.max(0, Math.min(1, t)), span);
    return this.#finish(s);
  }

  /**
   * Blend snapshot `a` -> `b` at `t` into the reusable state object.
   * `span` is b.time - a.time; 0 means "no valid segment", which suppresses
   * derived velocity rather than dividing by zero.
   */
  #write(a, b, t, span) {
    const s = this.state;

    s.position.set(
      a.position.x + (b.position.x - a.position.x) * t,
      a.position.y + (b.position.y - a.position.y) * t,
      a.position.z + (b.position.z - a.position.z) * t,
    );

    s.yaw = lerpAngle(a.yaw, b.yaw, t);
    s.pitch = a.pitch + (b.pitch - a.pitch) * t;

    // Velocity derived from the segment we are actually rendering along, so the
    // legs match the on-screen translation. Reported velocity is only a fallback
    // for the degenerate single-snapshot case.
    if (span > 1e-6) {
      s.velocity.set(
        (b.position.x - a.position.x) / span,
        (b.position.y - a.position.y) / span,
        (b.position.z - a.position.z) / span,
      );
    } else if (b.velocity) {
      s.velocity.set(b.velocity.x, b.velocity.y, b.velocity.z);
    } else {
      s.velocity.set(0, 0, 0);
    }

    s.height = a.height + (b.height - a.height) * t;
    // Discrete flags take the nearer snapshot's value rather than a threshold on
    // a blended number: a bool has no meaningful midpoint.
    const near = t < 0.5 ? a : b;
    s.crouching = near.crouching;
    s.grounded = near.grounded;
    s.firing = near.firing;
    s.weaponId = near.weaponId;
    s.health = a.health + (b.health - a.health) * t;
  }

  /** Compute derived animation values and scrub any non-finite result. */
  #finish(s) {
    // Rate-limit catch-up after a starved buffer, so recovering from packet loss
    // reads as fast motion rather than a teleport. Normal frames move far less
    // than the cap and are untouched by this.
    if (this.lastPosition && finiteVec(s.position)) {
      const dx = s.position.x - this.lastPosition.x;
      const dy = s.position.y - this.lastPosition.y;
      const dz = s.position.z - this.lastPosition.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > MAX_CATCHUP_STEP) {
        const k = MAX_CATCHUP_STEP / dist;
        s.position.set(
          this.lastPosition.x + dx * k,
          this.lastPosition.y + dy * k,
          this.lastPosition.z + dz * k,
        );
      }
    }

    s.speed = Math.hypot(s.velocity.x, s.velocity.z);
    s.verticalSpeed = s.velocity.y;

    // Travel direction relative to facing, for a strafe blend tree. Below a
    // small speed the direction is noise, so it is pinned to "forward".
    if (s.speed > 0.05) {
      // Movement heading in the same frame as yaw: yaw 0 faces -Z in this
      // engine (see the wishDir construction in movement.js).
      const heading = Math.atan2(-s.velocity.x, -s.velocity.z);
      s.moveDir = wrapAngle(heading - s.yaw);
    } else {
      s.moveDir = 0;
    }

    const range = STAND_HEIGHT - CROUCH_HEIGHT;
    s.stance = range > 1e-6
      ? Math.max(0, Math.min(1, (STAND_HEIGHT - s.height) / range))
      : (s.crouching ? 1 : 0);

    // Final gate. Nothing non-finite may reach a transform: a NaN written into
    // an Object3D position silently removes the whole subtree from rendering,
    // and it is not recoverable without a reload.
    if (!finiteVec(s.position)) s.position.set(0, 0, 0);
    if (!finiteVec(s.velocity)) s.velocity.set(0, 0, 0);
    if (!finite(s.yaw)) s.yaw = 0;
    if (!finite(s.pitch)) s.pitch = 0;
    if (!finite(s.speed)) s.speed = 0;
    if (!finite(s.moveDir)) s.moveDir = 0;
    if (!finite(s.height)) s.height = STAND_HEIGHT;
    if (!finite(s.stance)) s.stance = 0;
    if (!finite(s.verticalSpeed)) s.verticalSpeed = 0;
    if (!finite(s.health)) s.health = 0;

    // Remember the scrubbed, rate-limited position as the baseline for the next
    // frame's catch-up limit.
    if (!this.lastPosition) this.lastPosition = s.position.clone();
    else this.lastPosition.copy(s.position);

    return s;
  }
}

/**
 * Buffers and interpolates every remote player.
 *
 * Drives off the host's clock, not the local one. `now` passed to update() is a
 * host-domain time in seconds — whatever clock the snapshots' `time` field uses.
 * The clock estimate is slaved to the newest snapshot seen, so no explicit clock
 * sync handshake is needed for interpolation to be correct; it only needs the
 * two clocks to advance at the same rate, which they do.
 */
export class RemoteReplication {
  constructor({ interpDelay = INTERP_DELAY, allowExtrapolation = false } = {}) {
    this.interpDelay = interpDelay;
    /**
     * Off by default. Extrapolation invents motion that never happened; with a
     * 100ms buffer and a 20Hz snapshot rate, real starvation is rare enough that
     * freezing is the better failure mode.
     */
    this.allowExtrapolation = allowExtrapolation;

    /** @type {Map<string|number, RemoteInterpolator>} */
    this.players = new Map();

    this.hostClock = 0;      // best estimate of host time now
    this.renderTime = 0;     // hostClock - interpDelay
    this.accepted = 0;
    this.rejected = 0;       // duplicates, reorder-dupes, malformed
  }

  /**
   * Feed one snapshot. Order does not matter; duplicates are dropped.
   * @param {RemoteSnapshot} snap
   * @returns {boolean} whether it was stored.
   */
  ingest(snap) {
    if (!snap || snap.id === undefined || snap.id === null) { this.rejected++; return false; }
    let p = this.players.get(snap.id);
    if (!p) { p = new RemoteInterpolator(snap.id); this.players.set(snap.id, p); }
    const ok = p.insert(snap);
    if (ok) {
      this.accepted++;
      // Advance the clock only on newer data. A late-arriving old snapshot must
      // not drag the render cursor backwards for everyone.
      if (finite(snap.time) && snap.time > this.hostClock) this.hostClock = snap.time;
    } else {
      this.rejected++;
    }
    return ok;
  }

  /** Feed a batch (one datagram usually carries every player). */
  ingestAll(snaps) {
    let n = 0;
    for (const s of snaps || []) if (this.ingest(s)) n++;
    return n;
  }

  /**
   * Advance the local estimate of host time and recompute the render cursor.
   * Call once per rendered frame with the frame's dt.
   *
   * The clock free-runs between snapshots so motion stays smooth at render rate
   * rather than stepping at the snapshot rate.
   */
  update(dt) {
    if (finite(dt) && dt > 0) this.hostClock += dt;
    this.renderTime = this.hostClock - this.interpDelay;
    for (const p of this.players.values()) p.prune(this.renderTime);
    return this.renderTime;
  }

  /**
   * Render state for one player, or null if nothing has arrived yet.
   * The returned object is REUSED between calls for the same player — read it or
   * copy it before the next sample, do not retain it.
   * @returns {RemoteRenderState|null}
   */
  sample(id) {
    const p = this.players.get(id);
    return p ? p.sample(this.renderTime, this.allowExtrapolation) : null;
  }

  /**
   * Render states for every known player.
   * @returns {RemoteRenderState[]}
   */
  sampleAll() {
    const out = [];
    for (const p of this.players.values()) {
      const s = p.sample(this.renderTime, this.allowExtrapolation);
      if (s) out.push(s);
    }
    return out;
  }

  remove(id) { this.players.delete(id); }

  /** Ids whose newest snapshot is older than STALE_TIMEOUT. */
  staleIds() {
    const out = [];
    for (const [id, p] of this.players) {
      if (p.newestTime + STALE_TIMEOUT < this.renderTime) out.push(id);
    }
    return out;
  }

  /**
   * Convert a RemoteRenderState into the shape remoteplayer.js consumes.
   *
   * Two conventions genuinely differ between the two modules, and both are the
   * kind of mismatch that produces a subtly wrong result rather than an error,
   * so the conversion is done here explicitly instead of being left to whoever
   * wires them together:
   *
   *  - POSITION: this module reports the capsule CENTRE (matching
   *    PlayerMovement.position); the model roots at the FEET. Subtract half the
   *    interpolated height, so the offset stays correct through a crouch.
   *  - YAW: the engine's yaw has 0 facing -Z, with forward = (-sin, 0, -cos)
   *    (see the wishDir construction in movement.js). The model uses
   *    atan2(x, z), where 0 faces +Z. Those two encodings of the same heading
   *    differ by exactly PI — verified numerically, not assumed.
   *
   * Returns a fresh object; the source state is reused between frames.
   * @param {RemoteRenderState} s
   */
  static toModelState(s) {
    if (!s) return null;
    return {
      position: { x: s.position.x, y: s.position.y - s.height / 2, z: s.position.z },
      yaw: wrapAngle(s.yaw + Math.PI),
      pitch: s.pitch,
      velocity: { x: s.velocity.x, y: s.velocity.y, z: s.velocity.z },
      crouching: s.crouching,
      firing: s.firing,
      health: s.health,
      alive: s.health > 0,
    };
  }

  /** Every player's render state, converted for the model layer. */
  sampleAllForModel() {
    return this.sampleAll().map((s) => RemoteReplication.toModelState(s));
  }

  get debugStats() {
    let buffered = 0;
    for (const p of this.players.values()) buffered += p.buffer.length;
    return {
      players: this.players.size,
      buffered,
      accepted: this.accepted,
      rejected: this.rejected,
      renderTime: this.renderTime,
      hostClock: this.hostClock,
      delay: this.interpDelay,
    };
  }
}
