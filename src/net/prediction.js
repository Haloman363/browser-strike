import * as THREE from 'three';
import { PlayerMovement } from '../player/movement.js';

// Client-side prediction for the LOCAL player under a host-authoritative sim.
//
// The client cannot wait for the host to tell it where it is — at 60ms RTT that
// is ~8 ticks of input lag on every keypress, which is unplayable. So the client
// runs the *same* movement code immediately and keeps every input it has sent
// but not yet seen acknowledged. When the host's version of the world arrives,
// it is authoritative but stale: it reflects the world as of some older input.
// We snap to it and re-apply the inputs the host had not processed yet, which
// lands us back at the present.
//
// This only works because PlayerMovement.update() is a deterministic function of
// (state, input, yaw, dt). Verified: no Math.random, no time reads, no hidden
// accumulators — the only fields carried across ticks are position, velocity,
// height, grounded and crouching. landingImpact/fallSpeed/wasGrounded are
// write-only outputs consumed by the camera, and never feed back into physics,
// so they are deliberately excluded from the replay state.

/** Fixed simulation step. Must match the loop in main.js. */
export const TICK = 1 / 128;

// --- Tunables ----------------------------------------------------------

/**
 * Corrections with error below this (metres) are blended in smoothly rather
 * than applied to the rendered position at once. At 128Hz a normal misprediction
 * is floating-point noise plus whatever the host resolved differently on a
 * contact — millimetres. Anything under a body radius is small enough that the
 * player will not notice it arriving over a few frames, and smoothing it beats
 * a visible camera jolt on every snapshot. Nausea comes from the jolt, not the
 * error.
 *
 * Comfortably above the noise floor from wire quantization: angles ship as
 * int16, a step of 2*PI/65536 ~= 9.6e-5 rad, which at run speed over one 20Hz
 * snapshot interval displaces the player by ~1.1e-5 m. That is ~4 orders of
 * magnitude below this threshold, so quantization error is always absorbed
 * silently by smoothing and can never provoke a snap or a correction fight.
 */
export const SMOOTH_CORRECTION_MAX = 0.42; // = MOVE.radius, one body width

/**
 * Above this the correction is a real desync, not drift: a teleport, a respawn,
 * a host rewind after a long stall. Blending it would drag the camera across the
 * map over half a second, which is far worse than a snap. Snap immediately.
 * Kept separate from SMOOTH_CORRECTION_MAX so the band between them can be
 * smoothed with a shorter time constant if it ever proves too laggy.
 */
export const SNAP_CORRECTION_MIN = 2.0;

/**
 * Rate the visual correction offset decays, per second, as a fraction remaining.
 * 0.001 means 99.9% of the offset is gone after one second. Chosen so a typical
 * few-centimetre correction is imperceptible (~100ms to settle) while a
 * near-threshold one still resolves before the next likely correction.
 */
export const CORRECTION_DECAY = 0.001;

/**
 * Ring buffer capacity for unacknowledged inputs. At 128Hz this is 2 seconds of
 * input, which covers any RTT a P2P game is playable at. If it ever fills, the
 * connection is already dead by any useful standard.
 */
export const INPUT_BUFFER_SIZE = 256;

// --- Structs -----------------------------------------------------------
// These are plain objects, defined here rather than imported, because the
// transport/protocol modules are being written concurrently. Integration
// converts between these and the wire format; nothing here touches the wire.

/**
 * A single sampled input, as applied to exactly one tick.
 * @typedef {object} InputCommand
 * @property {number} seq        Monotonic sequence number, never reused.
 * @property {number} tick       Simulation tick this was applied at.
 * @property {number} forward    -1, 0 or 1.
 * @property {number} right      -1, 0 or 1.
 * @property {boolean} jump
 * @property {boolean} crouch
 * @property {number} yaw        Camera yaw in radians at sample time. Yaw is
 *                               client-authoritative (the host cannot predict a
 *                               mouse), so it travels with the input.
 * @property {number} pitch      Carried for the host's hit registration; the
 *                               movement step ignores it.
 */

/**
 * Authoritative local-player state from the host.
 * @typedef {object} LocalStateSnapshot
 * @property {number} ackSeq     Highest input seq the host had consumed.
 * @property {number} tick       Host tick this state is from.
 * @property {{x:number,y:number,z:number}} position
 * @property {{x:number,y:number,z:number}} velocity
 * @property {number} height     Capsule height (encodes stance transitions).
 * @property {boolean} grounded
 * @property {boolean} crouching
 */

/** True only for a finite number. Guards every value that reaches a transform. */
const finite = (n) => typeof n === 'number' && Number.isFinite(n);

const finiteVec = (v) =>
  !!v && finite(v.x) && finite(v.y) && finite(v.z);

/**
 * Predicts the local player and reconciles against host snapshots.
 *
 * Owns a PlayerMovement — the real one, against the real CollisionWorld. Replay
 * must not use a simplified physics copy: the step-up retry and the depenetrate
 * pass in movement.js are exactly where a simplified version would diverge, and
 * a divergence that only appears near stairs is the worst kind to debug.
 */
export class PredictedPlayer {
  /**
   * @param {import('../world/collision.js').CollisionWorld} world
   * @param {THREE.Vector3} spawn
   */
  constructor(world, spawn = new THREE.Vector3(0, 2, 0)) {
    this.movement = new PlayerMovement(world, spawn);

    /** Ring of unacknowledged inputs. @type {(InputCommand|null)[]} */
    this.pending = new Array(INPUT_BUFFER_SIZE).fill(null);
    this.head = 0;      // next write index
    this.count = 0;     // live entries
    this.nextSeq = 1;   // 0 is reserved for "nothing acked yet"
    this.tick = 0;
    this.lastAckSeq = 0;

    /**
     * Visual-only offset: where the predicted position *was* minus where it is
     * after a correction. Added to the rendered position and decayed to zero, so
     * the simulation is corrected instantly while the camera catches up smoothly.
     */
    this.correctionOffset = new THREE.Vector3();

    // Debug/HUD telemetry.
    this.lastError = 0;        // metres of misprediction on the last snapshot
    this.peakError = 0;
    this.lastReplayCount = 0;  // inputs replayed on the last snapshot
    this.snapCount = 0;        // hard snaps taken (should stay near zero)
    this.droppedInputs = 0;    // overruns; nonzero means the link is gone
  }

  // --- Prediction ------------------------------------------------------

  /**
   * Apply one locally-sampled input immediately and record it for replay.
   * Call once per fixed tick, from the same place main.js calls
   * movement.update().
   *
   * @param {{forward:number,right:number,jump:boolean,crouch:boolean}} sample
   * @param {number} yaw
   * @param {number} [pitch]
   * @returns {InputCommand} the command to send to the host.
   */
  applyInput(sample, yaw, pitch = 0) {
    const cmd = {
      seq: this.nextSeq++,
      tick: this.tick++,
      forward: sample.forward | 0,
      right: sample.right | 0,
      jump: !!sample.jump,
      crouch: !!sample.crouch,
      // A non-finite yaw would poison position permanently through the sin/cos
      // in the movement step, so it is clamped at the boundary, not downstream.
      yaw: finite(yaw) ? yaw : 0,
      pitch: finite(pitch) ? pitch : 0,
    };

    this.#push(cmd);
    this.movement.update(cmd, cmd.yaw, TICK);
    return cmd;
  }

  #push(cmd) {
    if (this.count === INPUT_BUFFER_SIZE) {
      // Overwriting the oldest. Those inputs can no longer be replayed, so a
      // future snapshot acking below them will reconcile to a slightly wrong
      // place — but the alternative is unbounded memory on a dead link.
      this.droppedInputs++;
      this.count--;
    }
    this.pending[this.head] = cmd;
    this.head = (this.head + 1) % INPUT_BUFFER_SIZE;
    this.count++;
  }

  /** Unacknowledged inputs, oldest first. Resend set for an unreliable channel. */
  unacknowledged() {
    const out = [];
    const start = (this.head - this.count + INPUT_BUFFER_SIZE) % INPUT_BUFFER_SIZE;
    for (let i = 0; i < this.count; i++) {
      out.push(this.pending[(start + i) % INPUT_BUFFER_SIZE]);
    }
    return out;
  }

  // --- Reconciliation --------------------------------------------------

  /**
   * Accept an authoritative state from the host: drop acked inputs, snap the
   * simulation to the host's state, then replay everything the host had not yet
   * consumed to return to the present.
   *
   * Safe to call with out-of-order or duplicate snapshots — anything not newer
   * than the last one applied is ignored, because reconciling to a state older
   * than one already reconciled would rewind the player.
   *
   * @param {LocalStateSnapshot} snap
   * @returns {boolean} whether the snapshot was applied.
   */
  reconcile(snap) {
    if (!snap) return false;
    // Reject garbage before it can touch the simulation. One NaN in position
    // propagates through every subsequent tick and never recovers.
    if (!finite(snap.ackSeq) || !finiteVec(snap.position) ||
        !finiteVec(snap.velocity) || !finite(snap.height)) return false;
    if (snap.ackSeq <= this.lastAckSeq) return false; // stale or duplicate

    this.lastAckSeq = snap.ackSeq;
    this.#dropAcked(snap.ackSeq);

    // Where prediction thinks we are, before being overwritten.
    const predicted = this.movement.position.clone();

    const m = this.movement;
    m.position.set(snap.position.x, snap.position.y, snap.position.z);
    m.velocity.set(snap.velocity.x, snap.velocity.y, snap.velocity.z);
    m.height = snap.height;
    m.grounded = !!snap.grounded;
    m.crouching = !!snap.crouching;

    // Replay the tail. Each input carries its own yaw, so a replayed frame
    // reproduces the exact wish direction it originally had — reusing the
    // *current* yaw here would silently curve the whole replayed path.
    const tail = this.unacknowledged();
    for (const cmd of tail) m.update(cmd, cmd.yaw, TICK);
    this.lastReplayCount = tail.length;

    // Error is measured against the re-simulated present, not against the raw
    // snapshot: comparing to the snapshot would report the (large, expected)
    // latency offset instead of the (small, meaningful) prediction error.
    const error = predicted.distanceTo(m.position);
    this.lastError = error;
    if (error > this.peakError) this.peakError = error;

    this.#absorbCorrection(predicted, error);
    return true;
  }

  #dropAcked(ackSeq) {
    while (this.count > 0) {
      const start = (this.head - this.count + INPUT_BUFFER_SIZE) % INPUT_BUFFER_SIZE;
      if (this.pending[start].seq > ackSeq) break;
      this.pending[start] = null;
      this.count--;
    }
  }

  /**
   * Decide how the correction reaches the screen. The simulation is always
   * corrected; the only question is whether the *camera* moves at once.
   */
  #absorbCorrection(predicted, error) {
    if (error >= SNAP_CORRECTION_MIN) {
      // Real desync — teleport, respawn, host rewind. Snap; smoothing this
      // would slide the view across the map.
      this.correctionOffset.set(0, 0, 0);
      this.snapCount++;
      return;
    }
    if (error <= SMOOTH_CORRECTION_MAX) {
      // Carry the old rendered position forward as an offset and let it decay.
      // Accumulating onto the existing offset (rather than replacing it) keeps
      // back-to-back corrections from re-introducing the jolt we just removed.
      this.correctionOffset.add(predicted).sub(this.movement.position);
      this.#clampOffset();
      return;
    }
    // Between the thresholds: too big to hide entirely, too small to justify a
    // snap. Absorb the smoothable share and let the rest land now.
    const keep = SMOOTH_CORRECTION_MAX / error;
    this.correctionOffset.addScaledVector(
      predicted.clone().sub(this.movement.position), keep);
    this.#clampOffset();
  }

  #clampOffset() {
    // Belt and braces: a corrupt snapshot that slipped the finite checks must
    // never leave an unbounded offset sitting on the camera.
    if (!finiteVec(this.correctionOffset)) {
      this.correctionOffset.set(0, 0, 0);
      return;
    }
    const len = this.correctionOffset.length();
    if (len > SNAP_CORRECTION_MIN) {
      this.correctionOffset.multiplyScalar(SNAP_CORRECTION_MIN / len);
    }
  }

  /**
   * Decay the visual correction. Call once per rendered frame with the frame's
   * dt (not the tick) — this is smoothing, so it should track the display, not
   * the simulation.
   */
  updateSmoothing(dt) {
    if (!finite(dt) || dt <= 0) return;
    const keep = Math.pow(CORRECTION_DECAY, dt);
    this.correctionOffset.multiplyScalar(keep);
    // Kill the tail so the offset actually reaches zero instead of asymptoting
    // at a value that keeps the camera microscopically off forever.
    if (this.correctionOffset.lengthSq() < 1e-10) this.correctionOffset.set(0, 0, 0);
  }

  // --- Output ----------------------------------------------------------

  /**
   * Position to render the local player at: the authoritative-and-replayed
   * position plus whatever correction has not been absorbed yet.
   * @returns {THREE.Vector3}
   */
  get renderPosition() {
    return this.movement.position.clone().add(this.correctionOffset);
  }

  /**
   * Eye position to render from, correction included. Feed this to the camera
   * instead of movement.eye when prediction is active.
   * @returns {THREE.Vector3}
   */
  get renderEye() {
    return this.movement.eye.add(this.correctionOffset);
  }

  /** Snapshot of the telemetry a debug HUD wants. All plain numbers. */
  get debugStats() {
    return {
      error: this.lastError,               // metres, last misprediction
      peakError: this.peakError,
      smoothing: this.correctionOffset.length(), // metres still being blended
      pending: this.count,                 // unacked inputs in flight
      replayed: this.lastReplayCount,      // inputs replayed last reconcile
      snaps: this.snapCount,               // hard snaps taken
      dropped: this.droppedInputs,         // buffer overruns
      ackSeq: this.lastAckSeq,
      tick: this.tick,
    };
  }

  /** Clear prediction history. Use on respawn or when the host resets us. */
  reset(position, velocity = new THREE.Vector3()) {
    this.pending.fill(null);
    this.head = 0;
    this.count = 0;
    this.correctionOffset.set(0, 0, 0);
    this.lastError = 0;
    this.lastReplayCount = 0;
    if (position) this.movement.position.copy(position);
    this.movement.velocity.copy(velocity);
  }
}
