import * as THREE from 'three';
import { Bot, BotState, buildBotModel, damp, angleDelta } from '../ai/bot.js';
import { MOVE } from '../player/movement.js';

// Visual representation of ANOTHER human player.
//
// The one design decision that matters here: this class does NOT contain an
// animation system. The bot's gait cost a whole session to get right — 2-bone
// analytic leg IK, distance-driven phase, contact-authored foot targets,
// undamped cyclic torso terms — and re-implementing any of it would guarantee
// the two drift apart. So RemotePlayer BORROWS Bot.prototype.animate and its
// callees (see ANIM_METHODS below) and simply presents the same field surface
// those methods read.
//
// That is possible because the animation half of Bot touches no AI and no
// collision world at all. It reads exactly these:
//   feet (from position), velocity, yaw, aimYaw, aimPitch, state, model,
//   joints, phase, speedNorm, strideLength, breathe, rifleVel, spineAim,
//   chestAim, spinePitch, chestPitch, headYaw, headPitch, muzzleFlash,
//   muzzleFlashTime, deathTime, deathTumble, respawnTimer.
// Every one of those is kinematic. The AI owns none of them.

/**
 * The interpolated per-player state this class consumes.
 *
 * ANOTHER AGENT OWNS THE WIRE FORMAT. This is deliberately declared here and
 * NOT imported from replication.js so the two can be reconciled explicitly.
 * Everything is optional except position and yaw; missing fields hold their
 * previous value, so a reduced snapshot degrades rather than snapping.
 *
 * @typedef {object} RemoteState
 * @property {{x:number,y:number,z:number}} position  FEET position, world metres.
 *   Not the capsule centre. The bot model's root sits at the feet, and the
 *   replicated authority for a player is their ground contact.
 * @property {number} yaw     body/movement facing, radians. atan2(x, z) convention,
 *   matching Bot.yaw — 0 is +Z, increasing turns toward +X.
 * @property {number} [pitch] look pitch, radians, positive = looking UP.
 *   Drives the upper body independently of the legs.
 * @property {number} [aimYaw] where the player is LOOKING, if it differs from
 *   the body yaw. Omit and it follows `yaw`. Supplying it is what lets a remote
 *   player strafe left while covering right, which is most of what reads as a
 *   human opponent rather than a walking dummy.
 * @property {{x:number,y:number,z:number}} [velocity] world m/s. The gait is
 *   DISTANCE-driven, so this only sets cadence and blend weight; if it is
 *   absent it is derived from successive positions instead (see applyState).
 * @property {boolean} [crouching]
 * @property {boolean} [alive]   false starts the death collapse.
 * @property {boolean} [firing]  true on a tick this player fired; lights the
 *   muzzle flash and switches the arms to the aiming pose.
 * @property {number} [health]   cosmetic only here; combat.js is authoritative.
 */

// Methods lifted wholesale from Bot. Listing them explicitly (rather than
// walking the prototype) means adding an AI method to Bot can never silently
// become part of the remote player's update path.
const ANIM_METHODS = [
  'animate', 'animateLegs', 'animateArms', 'animateDeath',
  'snapLeftHandToForegrip',
];

// How fast the visual body yaw chases the networked yaw. The network value is
// already interpolated, so this is only here to absorb the step at a snapshot
// boundary — high enough that it is not a second source of latency.
const YAW_TRACK_RATE = 18;

// A crouch is a uniform squash of the whole rig rather than a re-solve of the
// leg IK against a lowered hip. The IK's foot targets are authored against a
// fixed hip height (see contactSweep in bot.js); feeding it a crouched hip
// makes the solver bottom out and the "planted" foot hangs in the air, which is
// the exact defect the IK rewrite existed to kill. Scaling the root keeps the
// soles on the floor and the eye at the right height, which is what the other
// player actually needs to see.
const CROUCH_SCALE = MOVE.crouchHeight / MOVE.standHeight;
const CROUCH_RATE = 12;

// Velocity derived from position deltas is noisy at small dt — a single 2ms
// frame across a 1mm jitter reads as 0.5 m/s. Floor the dt used for that
// division so a hitched frame cannot spike the gait cadence.
const MIN_DERIV_DT = 1 / 120;

export class RemotePlayer {
  /**
   * @param {THREE.Scene} scene
   * @param {string} id      peer id; the caller's key for despawn
   * @param {object} [opts]  { name?: string }
   */
  constructor(scene, id, opts = {}) {
    this.scene = scene;
    this.id = id;
    this.name = opts.name || id;

    // --- Fields the borrowed animation reads. Names and initial values match
    // Bot's constructor exactly; anything that diverges here shows up as a
    // pose difference between a bot and a player standing side by side.
    this.position = new THREE.Vector3();   // FEET, unlike Bot (capsule centre)
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.aimYaw = 0;
    this.aimPitch = 0;
    this.headYaw = 0;
    this.headPitch = 0;
    this.state = BotState.PATROL;

    this.phase = 0;
    this.strideLength = 1.4;
    this.speedNorm = 0;
    this.breathe = Math.random() * Math.PI * 2;
    this.rifleVel = { x: 0, y: 0, z: 0 };
    this.spineAim = 0;
    this.chestAim = 0;
    this.spinePitch = 0;
    this.chestPitch = 0;
    this.muzzleFlashTime = 0;
    this.deathTime = 0;
    this.deathTumble = 0;
    // animateDeath fades the model out when this drops under 0.4s. A remote
    // corpse should stay until the network says the player respawned, so park
    // it high and let despawn/respawn do the hiding.
    this.respawnTimer = Infinity;

    // --- Remote-specific
    this.crouching = false;
    this.crouchBlend = 0;      // 0 standing .. 1 crouched, damped
    this.health = 100;
    this.alive = true;
    this.lastPosition = new THREE.Vector3();
    this.hasState = false;     // suppress the first-frame velocity derivation

    if (scene) {
      const built = buildBotModel();
      this.model = built.root;
      this.joints = built.joints;
      this.materials = built.materials;
      scene.add(this.model);

      this.muzzleFlash = new THREE.PointLight(0xffc070, 0, 6, 2);
      this.joints.muzzle.add(this.muzzleFlash);
    }
  }

  /** Feet position. The borrowed animate() reads this to place the model. */
  get feet() {
    return this.position;
  }

  /**
   * Apply one interpolated snapshot.
   *
   * @param {RemoteState} s
   * @param {number} dt seconds since the last applyState. Drives the gait
   *   integration and every damped joint, so it must be the real frame delta,
   *   not the network tick.
   */
  applyState(s, dt) {
    if (!s) return;
    // Never let a bad packet reach a transform. A single NaN in a THREE
    // position poisons the whole matrix chain and the model vanishes with no
    // error — one of the least debuggable failures in this codebase.
    if (!finiteVec(s.position)) return;
    dt = finite(dt) && dt > 0 ? Math.min(dt, 0.1) : 1 / 60;

    if (this.hasState) this.lastPosition.copy(this.position);
    this.position.set(s.position.x, s.position.y, s.position.z);
    if (!this.hasState) this.lastPosition.copy(this.position);

    // --- Velocity. Prefer what the sender told us; fall back to differencing
    // positions. This matters more than it looks: the gait phase advances by
    // DISTANCE travelled, so the velocity only sets cadence and the blend
    // weight. Getting it slightly wrong changes how energetic the walk looks,
    // never whether the feet skate.
    if (finiteVec(s.velocity)) {
      this.velocity.set(s.velocity.x, s.velocity.y, s.velocity.z);
    } else if (this.hasState) {
      const h = Math.max(dt, MIN_DERIV_DT);
      this.velocity.set(
        (this.position.x - this.lastPosition.x) / h,
        (this.position.y - this.lastPosition.y) / h,
        (this.position.z - this.lastPosition.z) / h,
      );
    }

    // --- Facing. Body yaw is the movement facing; aimYaw is where they look.
    // Keeping them separate is what lets the torso twist off the leg direction.
    const wantYaw = finite(s.yaw) ? s.yaw : this.yaw;
    this.yaw += angleDelta(this.yaw, wantYaw) * (1 - Math.exp(-YAW_TRACK_RATE * dt));
    const wantAim = finite(s.aimYaw) ? s.aimYaw : wantYaw;
    // Aim tracks harder than the body: a player's view snaps, their feet do not.
    this.aimYaw += angleDelta(this.aimYaw, wantAim) * (1 - Math.exp(-30 * dt));
    // Bot.aimPitch is positive-up and animate() negates it into the spine, so
    // the networked pitch goes in with the same sign convention. Clamped to the
    // same +-0.7 the bot's faceTarget uses, so the torso solve stays in range.
    if (finite(s.pitch)) this.aimPitch = clamp(s.pitch, -0.7, 0.7);

    // --- Life cycle
    if (finite(s.health)) this.health = s.health;
    const nowAlive = s.alive === undefined ? this.alive : !!s.alive;
    if (nowAlive !== this.alive) nowAlive ? this.respawn() : this.die();

    // --- Firing: one-shot flash, same 45ms window the bot uses.
    if (s.firing) this.muzzleFlashTime = 0.045;
    this.muzzleFlashTime = Math.max(0, this.muzzleFlashTime - dt);

    // --- Crouch. Damped so a spammed crouch key does not strobe the model.
    if (s.crouching !== undefined) this.crouching = !!s.crouching;
    this.crouchBlend = damp(this.crouchBlend, this.crouching ? 1 : 0, CROUCH_RATE, dt);

    // ENGAGE is the bot's "weapon up" arm pose. A remote player is always a
    // threat, so hold it whenever they are alive — a player carrying the rifle
    // slung at patrol-rest would read as harmless.
    if (this.alive) this.state = BotState.ENGAGE;

    this.hasState = true;
    this.update(dt);
  }

  /**
   * Advance the animation. Split out from applyState so the caller can render
   * extra frames between snapshots without inventing new network state.
   */
  update(dt) {
    if (!this.model) return;
    this.breatheGuard();
    // The death collapse is driven by deathTime, but animateDeath only READS
    // it — Bot advances the clock in update(), which is the AI/physics path
    // this class deliberately does not borrow. Without this line the corpse
    // freezes at t=0 forever, standing upright with its arms out. Caught by
    // looking at the contact sheet, not by any assertion.
    if (!this.alive) this.deathTime += dt;
    // THE gait/IK/torso solve, straight off Bot.prototype. See ANIM_METHODS.
    this.animate(dt);
    // Crouch squashes the root AFTER animate() has written the pose, so the IK
    // still solves against the full-height rig it was authored for.
    const k = 1 - this.crouchBlend * (1 - CROUCH_SCALE);
    this.model.scale.set(1, k, 1);
  }

  /**
   * Guard against a non-finite creeping into any transform-bound field. A NaN
   * here is silent — the model just stops being drawn — so it is worth the
   * handful of comparisons per frame to catch it at the source.
   */
  breatheGuard() {
    if (!finite(this.phase)) this.phase = 0;
    if (!finite(this.breathe)) this.breathe = 0;
    if (!finite(this.speedNorm)) this.speedNorm = 0;
    if (!finiteVec(this.velocity)) this.velocity.set(0, 0, 0);
    if (!finiteVec(this.position)) this.position.set(0, 0, 0);
    if (!finite(this.yaw)) this.yaw = 0;
    if (!finite(this.aimYaw)) this.aimYaw = this.yaw;
    if (!finite(this.aimPitch)) this.aimPitch = 0;
  }

  /** Start the death collapse. Idempotent. */
  die(hitPoint = null) {
    if (!this.alive) return;
    this.alive = false;
    this.health = 0;
    this.state = BotState.DEAD;
    this.deathTime = 0;
    this.velocity.set(0, 0, 0);
    // Ground level to topple about; see Bot.die(). Without this the shared
    // animateDeath sinks the corpse through the floor.
    this.deathBaseY = this.model ? this.model.position.y : 0;
    // Same keyframed collapse the bot uses — topple away from the shot.
    if (hitPoint && finiteVec(hitPoint)) {
      this.deathTumble = Math.atan2(
        this.position.x - hitPoint.x, this.position.z - hitPoint.z) - this.yaw;
    } else {
      this.deathTumble = (Math.random() * 2 - 1) * 0.6;
    }
  }

  /** Back to a standing, animating body. */
  respawn() {
    this.alive = true;
    this.health = 100;
    this.state = BotState.ENGAGE;
    this.deathTime = 0;
    this.deathTumble = 0;
    this.phase = 0;
    this.speedNorm = 0;
    this.velocity.set(0, 0, 0);
    this.crouchBlend = 0;
    this.crouching = false;
    if (this.model) {
      this.model.visible = true;
      // animateDeath writes the ROOT rotation to topple the body; nothing else
      // ever clears it, so a respawned player would come back lying down.
      this.model.rotation.set(0, 0, 0);
      this.model.scale.set(1, 1, 1);
    }
  }

  /** Remove from the scene and free GPU resources. Call on disconnect. */
  dispose() {
    if (!this.model) return;
    this.model.traverse((o) => {
      if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); }
    });
    this.scene.remove(this.model);
    this.model = null;
    this.joints = null;
  }
}

// Graft the animation in. Assigning from Bot.prototype rather than copying the
// source is the whole point: there is exactly one gait solver in this project
// and both the AI and the network path call it.
for (const name of ANIM_METHODS) {
  const fn = Bot.prototype[name];
  if (typeof fn !== 'function') {
    throw new Error(`RemotePlayer: Bot.prototype.${name} is missing — ` +
      'the animation graft is broken, not merely degraded.');
  }
  RemotePlayer.prototype[name] = fn;
}

const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const finiteVec = (v) => !!v && finite(v.x) && finite(v.y) && finite(v.z);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * Keyed collection of remote players. Thin on purpose — the session layer owns
 * who exists; this just maps ids to models and guarantees despawn frees them.
 */
export class RemotePlayerSet {
  constructor(scene) {
    this.scene = scene;
    /** @type {Map<string, RemotePlayer>} */
    this.players = new Map();
  }

  get(id) { return this.players.get(id) || null; }

  spawn(id, opts) {
    let p = this.players.get(id);
    if (p) return p;
    p = new RemotePlayer(this.scene, id, opts);
    this.players.set(id, p);
    return p;
  }

  despawn(id) {
    const p = this.players.get(id);
    if (!p) return false;
    p.dispose();
    this.players.delete(id);
    return true;
  }

  /** @param {Record<string, RemoteState>} states keyed by peer id */
  applyStates(states, dt) {
    for (const id in states) {
      const p = this.players.get(id) || this.spawn(id);
      p.applyState(states[id], dt);
    }
  }

  update(dt) {
    for (const p of this.players.values()) p.update(dt);
  }

  clear() {
    for (const id of [...this.players.keys()]) this.despawn(id);
  }
}
