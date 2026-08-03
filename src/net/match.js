import * as THREE from 'three';
import { Session, SESSION_STATE } from './session.js';
import { PredictedPlayer } from './prediction.js';
import { RemoteReplication } from './replication.js';
import { RemotePlayerSet } from './remoteplayer.js';
import { CombatHost } from './combat.js';
import { EVENT, SNAP_FLAG } from './protocol.js';
import { MOVE } from '../player/movement.js';


// Glue between the game loop and the netcode. Everything below exists so
// main.js can stay a single loop that does not branch on "am I the host" at
// every line: a Match owns that distinction and exposes one shape to the game.
//
// Singleplayer is NOT a degenerate multiplayer session -- when no Match is
// active main.js runs exactly the code it always did. That keeps the offline
// game working even if the broker is down or WebRTC is blocked.

// Combat keys players by string id; Session issues numeric ones. Converting at
// this single boundary is cheaper than making either side generic, but it has
// to be done consistently or lookups silently miss and nobody ever takes damage.
const cid = (id) => String(id);

export const MATCH_ROLE = { HOST: 'host', CLIENT: 'client' };

export class Match {
  /**
   * @param {object} deps
   * @param {THREE.Scene} deps.scene
   * @param {object} deps.world      CollisionWorld, for prediction replay
   * @param {THREE.Vector3[]} deps.spawns
   */
  constructor({ scene, world, spawns = [] }) {
    this.scene = scene;
    this.world = world;
    this.spawns = spawns.length ? spawns : [new THREE.Vector3(0, 2, 0)];

    this.session = new Session();
    this.remotes = new RemotePlayerSet(scene);
    this.replication = new RemoteReplication();

    /** Host only. Clients never construct one: they do not own damage. */
    this.combat = null;
    /** Client only: local prediction. The host's own movement IS authority. */
    this.predicted = null;

    this.tick = 0;
    /** Fire claims from clients, drained by the host each tick. */
    this._pendingShots = [];
    /** Set by the host when the local player is hit; read by main.js. */
    this.localHealth = 100;
    this.onEvent = null;

    this._wire();
  }

  /**
   * Always read through to the session. A cached copy is assigned on the
   * PLAYING transition, which is AFTER the roster is first built and after the
   * host has already started stamping snapshots -- a stale 0 there silently
   * mislabels the local player and spawns an avatar for yourself.
   */
  get localId() { return this.session.localId; }

  get state() { return this.session.state; }
  /** Derived for the same reason as localId: set() marks isHost before LOBBY. */
  get isHost() { return this.session.isHost; }
  get role() { return this.isHost ? MATCH_ROLE.HOST : MATCH_ROLE.CLIENT; }
  get active() { return this.session.state === SESSION_STATE.PLAYING; }
  get roomCode() { return this.session.roomCode; }

  _wire() {
    this.session.onPlayersChanged = () => this._syncRoster();
    this.session.onStateChange = (s) => {
      if (s === SESSION_STATE.PLAYING && this.isHost && !this.combat) {
        this.combat = new CombatHost();
        // A peer can be admitted (and its state created) before this fires, so
        // register anyone already known -- otherwise the first joiner has no
        // CombatPlayer and is permanently invulnerable.
        if (this._states) for (const id of this._states.keys()) this.combat.add(cid(id));
      }
      if (s === SESSION_STATE.HOST_LEFT || s === SESSION_STATE.FAILED) this._teardown();
    };

    // Host: a client's input arrives. We do not simulate other players'
    // movement here -- they predict locally and we trust their position,
    // which is the accepted tradeoff for P2P. What we DO own is combat.
    this.session.onInput = (playerId, input) => {
      if (!this.isHost) return;
      const p = this._ensureRemoteState(playerId);
      if (input.position) p.position.copy(input.position);
      if (Number.isFinite(input.yaw)) p.yaw = input.yaw;
      if (Number.isFinite(input.pitch)) p.pitch = input.pitch;
      p.crouching = !!input.crouching;
      if (input.fire) {
        this._pendingShots.push({
          shooterId: cid(playerId),
          tick: input.tick,
          origin: input.origin,
          direction: input.direction,
        });
      }
    };

    // Client: authoritative state landed.
    //
    // The wire carries ONE packet holding every player; replication wants one
    // snapshot PER player, keyed by id and stamped with a time. Feeding it the
    // raw packet leaves snap.id undefined and it rejects all of them -- the
    // symptom is a connected client whose world never moves.
    this.session.onSnapshot = (packet) => {
      if (this.isHost || !packet?.players) return;
      // The wire has no clock, so timestamp on arrival. Jitter in arrival time
      // becomes jitter in the interpolation cursor, which the 100ms buffer is
      // there to absorb; a monotonic local clock is still better than a host
      // clock we cannot read.
      const time = performance.now() / 1000;
      for (const w of packet.players) {
        if (w.id === this.localId) {
          // Our own row is authority for reconciliation, not something to
          // interpolate -- interpolating it would fight prediction.
          if (this.predicted) {
            this.predicted.reconcile({
              tick: packet.tick, ackSeq: packet.ackSeq,
              position: { x: w.x, y: w.y, z: w.z },
            });
          }
          continue;
        }
        this.replication.ingest({
          id: w.id, tick: packet.tick, time,
          position: { x: w.x, y: w.y, z: w.z },
          yaw: w.yaw, pitch: w.pitch,
          crouching: !!(w.flags & SNAP_FLAG.CROUCHING),
          grounded: !!(w.flags & SNAP_FLAG.GROUNDED),
          firing: !!(w.flags & SNAP_FLAG.FIRING),
          health: (w.flags & SNAP_FLAG.DEAD) ? 0 : 100,
        });
      }
    };

    this.session.onEvent = (e) => {
      if (e.kind === EVENT.HIT && cid(e.targetId) === cid(this.localId)) {
        this.localHealth = Math.max(0, this.localHealth - (e.amount ?? 0));
      }
      if (e.kind === EVENT.RESPAWN && cid(e.targetId) === cid(this.localId)) {
        this.localHealth = 100;
      }
      if (this.onEvent) this.onEvent(e);
    };
  }

  async host() {
    const code = await this.session.create({ mapSeed: 1 });
    return code;
  }

  async join(code) {
    await this.session.join(code);
    // Clients predict; the host's own sim is already authoritative.
    this.predicted = new PredictedPlayer(this.world, this.spawns[0].clone());
    return this.session.state;
  }

  leave() {
    this.session.leave();
    this._teardown();
  }

  _teardown() {
    this.remotes.clear();
    this.combat = null;
    this.predicted = null;
  }

  /** Per-player authoritative-ish state the host tracks for its own snapshot. */
  _ensureRemoteState(playerId) {
    if (!this._states) this._states = new Map();
    let s = this._states.get(playerId);
    if (!s) {
      s = { position: new THREE.Vector3(), yaw: 0, pitch: 0, crouching: false };
      this._states.set(playerId, s);
      if (this.combat) this.combat.add(cid(playerId));
    }
    return s;
  }

  _syncRoster() {
    const seen = new Set();
    for (const p of this.session.playerList()) {
      // Filter on the roster's own `local` flag, not on this.localId: the
      // roster is populated before the PLAYING transition that sets localId,
      // so an id comparison here matches nobody and every player -- including
      // you -- gets an avatar standing in the map.
      if (p.local || p.id === this.session.localId) continue;
      seen.add(p.id);
      if (!this.remotes.get(p.id)) this.remotes.spawn(p.id);
      if (this.isHost) this._ensureRemoteState(p.id);
    }
    // Despawn anyone who left, or their body stands in the map forever.
    for (const id of [...this.remotes.players.keys()]) {
      if (!seen.has(id)) {
        this.remotes.despawn(id);
        this._states?.delete(id);
      }
    }
  }

  /**
   * Called from the fixed-step loop, once per simulation tick.
   * @param {object} localState {position, yaw, pitch, crouching, alive}
   */
  fixedStep(localState) {
    if (!this.active) return;
    this.tick = (this.tick + 1) & 0xffff;

    if (this.isHost) {
      const states = new Map();
      states.set(cid(this.localId), {
        position: localState.position, yaw: localState.yaw,
      });
      if (this._states) {
        for (const [id, s] of this._states) {
          states.set(cid(id), { position: s.position, yaw: s.yaw });
        }
      }
      this.combat.beginTick(this.tick, states);

      // Resolve claims AFTER recording this tick, so a shot claiming the
      // current tick finds a position in history to rewind to.
      for (const claim of this._pendingShots) {
        const res = this.combat.resolveShot(claim);
        if (res.ok && res.events) for (const e of res.events) this.session.sendEvent(e);
      }
      this._pendingShots.length = 0;
    }
  }

  /** Called once per rendered frame, after the fixed steps. */
  update(dt, localState) {
    if (!this.active) return;

    if (this.isHost) {
      this.combat.update(dt);
      for (const e of this.combat.events.splice(0)) this.session.sendEvent(e);

      const players = [{
        id: this.localId, position: localState.position,
        yaw: localState.yaw, pitch: localState.pitch,
        crouching: localState.crouching, health: this.localHealth,
      }];
      if (this._states) {
        for (const [id, s] of this._states) {
          const cp = this.combat.players.get(cid(id));
          players.push({
            id, position: s.position, yaw: s.yaw, pitch: s.pitch,
            crouching: s.crouching, health: cp ? cp.health : 100,
          });
        }
      }
      // The encoder reads FLAT p.x/p.y/p.z and writes p.flags verbatim; it
      // derives neither. Handing it a {position: Vector3} silently encodes
      // NaN-from-undefined and every snapshot is rejected on arrival for a
      // non-finite position -- a connected client whose world never moves.
      for (const p of players) {
        p.x = p.position.x; p.y = p.position.y; p.z = p.position.z;
        p.flags = (p.crouching ? SNAP_FLAG.CROUCHING : 0)
          | (p.health <= 0 ? SNAP_FLAG.DEAD : 0);
      }
      // Session rate-limits internally, so calling every frame is correct.
      this.session.sendSnapshot(this.tick, players);

      // The host sees remotes at their reported positions with no interpolation
      // delay -- it has no newer information to wait for. Route through the
      // same toModelState the client path uses rather than re-deriving the
      // centre->feet offset and the yaw convention flip here: those are two
      // silent-wrong-answer bugs (buried model, backwards run) and one tested
      // conversion is worth more than a second copy that looks right.
      this.remotes.applyStates(players
        .filter((p) => p.id !== this.localId)
        .map((p) => RemoteReplication.toModelState({
          id: p.id,
          position: p.position,
          height: p.crouching ? MOVE.crouchHeight : MOVE.standHeight,
          // No velocity: RemotePlayer prefers a supplied one and only falls
          // back to differencing positions when it is absent. Passing a zero
          // vector here is WORSE than passing nothing -- it wins the branch and
          // pins the gait at standstill, so the avatar slides without walking.
          yaw: p.yaw, pitch: p.pitch,
          crouching: p.crouching, health: p.health,
        })), dt);
    } else {
      this.replication.update(dt);
      this.remotes.applyStates(this.replication.sampleAllForModel(), dt);
      if (this.predicted) this.predicted.updateSmoothing(dt);
    }
  }

  /** Client: report a shot for the host to adjudicate. Host resolves locally. */
  reportShot(origin, direction) {
    if (!this.active) return;
    if (this.isHost) {
      this._pendingShots.push({
        shooterId: cid(this.localId), tick: this.tick,
        origin: { x: origin.x, y: origin.y, z: origin.z },
        direction: { x: direction.x, y: direction.y, z: direction.z },
      });
    } else {
      this.session.sendInput({
        tick: this.tick, fire: true,
        origin: { x: origin.x, y: origin.y, z: origin.z },
        direction: { x: direction.x, y: direction.y, z: direction.z },
      });
    }
  }

  /** Client: send movement state to the host each tick. */
  sendLocalState(localState) {
    if (!this.active || this.isHost) return;
    this.session.sendInput({
      tick: this.tick,
      position: localState.position, yaw: localState.yaw, pitch: localState.pitch,
      crouching: localState.crouching,
    });
  }
}
