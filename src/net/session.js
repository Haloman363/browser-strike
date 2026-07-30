import { Transport, NET_STATE } from './transport.js';
import {
  MSG, encodeJoin, encodeWelcome, encodeSnapshot, patchSnapshotAck, encodeInput, encodeEvent,
} from './protocol.js';

// Lobby and room lifecycle on top of Transport.
//
// HOST MIGRATION IS OUT OF SCOPE. The host runs the authoritative simulation;
// its state is not replicated anywhere else, so there is nothing for a
// surviving client to take over. If the host leaves, every client moves to
// SESSION_STATE.HOST_LEFT and the match is over. Implementing migration would
// mean replicating full authoritative state to a standby peer, which costs
// more bandwidth than the whole rest of the protocol.

// Snapshot rate, deliberately decoupled from the 128Hz simulation tick.
// Sending 128 snapshots/sec to 7 peers would be 148 bytes * 128 * 7 = ~132 KB/s
// upstream, which is past a typical home uplink and pointless besides: no
// display shows it and the client interpolates between snapshots anyway. At
// 20Hz the same match costs ~21 KB/s upstream, and the 50ms gap is comfortably
// covered by the interpolation buffer the prediction layer maintains.
export const SNAPSHOT_HZ = 20;
export const SNAPSHOT_INTERVAL_MS = 1000 / SNAPSHOT_HZ;

export const SESSION_STATE = {
  IDLE: 'idle',
  CONNECTING: 'connecting',
  LOBBY: 'lobby',
  PLAYING: 'playing',
  HOST_LEFT: 'host-left',
  FAILED: 'failed',
};

export class Session {
  constructor({ name = 'player', debug = false } = {}) {
    this.transport = new Transport({ debug });
    this.state = SESSION_STATE.IDLE;
    this.error = null;
    this.roomCode = null;
    this.isHost = false;
    this.localId = 0;
    this.mapSeed = 0;
    this.localName = name;

    /**
     * Stable player ids, independent of PeerJS peer strings.
     * @type {Map<number, {id:number, peerId:string|null, name:string, local:boolean, rtt:number}>}
     */
    this.players = new Map();

    // peerId <-> playerId, so message handlers can go either way in O(1).
    this._peerToPlayer = new Map();
    this._playerToPeer = new Map();
    // Player ids are never reused within a session; a reconnecting peer gets a
    // fresh one so stale snapshots can't be misattributed to it.
    this._nextPlayerId = 1;

    // Last input sequence the host consumed per player, echoed in snapshots so
    // clients know how far reconciliation must replay.
    this._ackSeq = new Map();
    this._lastSnapshotAt = 0;

    // Consumer hooks.
    this.onPlayersChanged = () => {};
    this.onStateChange = () => {};
    this.onInput = () => {};    // host: (playerId, input)
    this.onSnapshot = () => {}; // client: (snapshot)
    this.onEvent = () => {};    // both: (event)

    this.transport.onPeerJoin = (peerId) => this._handlePeerJoin(peerId);
    this.transport.onPeerLeave = (peerId, reason) => this._handlePeerLeave(peerId, reason);
    this.transport.onMessage = (peerId, msg) => this._handleMessage(peerId, msg);
    this.transport.onStateChange = (netState, err) => {
      if (netState === NET_STATE.FAILED) this._setState(SESSION_STATE.FAILED, err);
    };
  }

  // --- lifecycle ------------------------------------------------------------

  /** Create a room and become host. Resolves with the room code. */
  async create({ mapSeed = (Math.random() * 0xffffffff) >>> 0 } = {}) {
    this._setState(SESSION_STATE.CONNECTING);
    this.isHost = true;
    this.mapSeed = mapSeed >>> 0;
    this.localId = this._nextPlayerId++;
    this._addPlayer(this.localId, null, this.localName, true);

    try {
      this.roomCode = await this.transport.host();
    } catch (err) {
      this._setState(SESSION_STATE.FAILED, err.message);
      throw err;
    }
    this._setState(SESSION_STATE.LOBBY);
    return this.roomCode;
  }

  /** Join an existing room. Resolves once connected; the host assigns our id. */
  async join(code) {
    this._setState(SESSION_STATE.CONNECTING);
    this.isHost = false;
    this.roomCode = String(code).trim().toUpperCase();
    try {
      await this.transport.join(this.roomCode);
    } catch (err) {
      this._setState(SESSION_STATE.FAILED, err.message);
      throw err;
    }
    // localId stays 0 until WELCOME arrives.
    return this.roomCode;
  }

  leave() {
    this.transport.destroy();
    this.players.clear();
    this._peerToPlayer.clear();
    this._playerToPeer.clear();
    this._setState(SESSION_STATE.IDLE);
    this.onPlayersChanged();
  }

  _setState(state, error = null) {
    if (this.state === state && this.error === error) return;
    this.state = state;
    this.error = error;
    this.onStateChange(state, error);
  }

  // --- peer plumbing --------------------------------------------------------

  _addPlayer(id, peerId, name, local = false) {
    this.players.set(id, { id, peerId, name, local, rtt: 0 });
    if (peerId) {
      this._peerToPlayer.set(peerId, id);
      this._playerToPeer.set(id, peerId);
    }
    this.onPlayersChanged();
  }

  _handlePeerJoin(peerId) {
    if (this.isHost) {
      // Host waits for the client's JOIN before allocating an id, so the
      // player list never shows a nameless placeholder.
      return;
    }
    // Client's single peer is the host; announce ourselves.
    this.transport.send(peerId, encodeJoin({ name: this.localName }), { reliable: true });
  }

  _handlePeerLeave(peerId, reason) {
    const playerId = this._peerToPlayer.get(peerId);
    this._peerToPlayer.delete(peerId);
    if (playerId !== undefined) {
      this.players.delete(playerId);
      this._playerToPeer.delete(playerId);
      this._ackSeq.delete(playerId);
      this.onPlayersChanged();
    }

    // A client only ever has one peer: the host. Losing it ends the match.
    // See the host-migration note at the top of this file.
    if (!this.isHost) {
      this._setState(SESSION_STATE.HOST_LEFT, reason);
    }
  }

  _handleMessage(peerId, msg) {
    switch (msg.type) {
      case MSG.JOIN: {
        if (!this.isHost) return; // clients have no authority to admit anyone
        const id = this._nextPlayerId++;
        this._addPlayer(id, peerId, msg.name || `player${id}`);
        this.transport.send(peerId, encodeWelcome({
          playerId: id,
          tick: this.currentTick ?? 0,
          mapSeed: this.mapSeed,
          name: this.localName,
        }), { reliable: true });
        break;
      }

      case MSG.WELCOME: {
        if (this.isHost) return;
        this.localId = msg.playerId;
        this.mapSeed = msg.mapSeed;
        this.hostTick = msg.tick;
        this._addPlayer(this.localId, null, this.localName, true);
        // Host occupies player id 1 by construction (create() takes it first).
        this._addPlayer(1, peerId, msg.name || 'host');
        this._setState(SESSION_STATE.PLAYING);
        break;
      }

      case MSG.INPUT: {
        if (!this.isHost) return;
        const playerId = this._peerToPlayer.get(peerId);
        if (playerId === undefined) return; // input before JOIN was processed
        // Inputs arrive unordered, so an older one may land after a newer.
        // Dropping it here keeps the ack monotonic for reconciliation.
        const prev = this._ackSeq.get(playerId);
        if (prev !== undefined && seqOlderOrEqual(msg.seq, prev)) return;
        this._ackSeq.set(playerId, msg.seq);
        this.onInput(playerId, msg);
        break;
      }

      case MSG.SNAPSHOT: {
        if (this.isHost) return;
        if (this.state === SESSION_STATE.LOBBY) this._setState(SESSION_STATE.PLAYING);
        this.onSnapshot(msg);
        break;
      }

      case MSG.EVENT:
        this.onEvent(msg);
        break;
    }
  }

  // --- host send path -------------------------------------------------------

  /**
   * Host: broadcast world state, rate-limited to SNAPSHOT_HZ.
   * Call every simulation tick; it decides whether this tick is due.
   * Returns the bytes sent (0 when skipped) so the netgraph can chart it.
   */
  sendSnapshot(tick, players, nowMs = perfNow()) {
    if (!this.isHost) return 0;
    if (nowMs - this._lastSnapshotAt < SNAPSHOT_INTERVAL_MS) return 0;
    this._lastSnapshotAt = nowMs;
    this.currentTick = tick;

    const base = encodeSnapshot({ tick, players });
    let bytes = 0;
    for (const [playerId, peerId] of this._playerToPeer) {
      // Each client needs its own ack, but the body is identical, so encode
      // once and stamp the ack per recipient.
      const buf = patchSnapshotAck(base, this._ackSeq.get(playerId) ?? 0);
      if (this.transport.send(peerId, buf, { reliable: false })) bytes += buf.byteLength;
    }
    return bytes;
  }

  /** Host: broadcast an authoritative event on the reliable channel. */
  sendEvent(event) {
    if (!this.isHost) return 0;
    return this.transport.broadcast(encodeEvent(event), { reliable: true });
  }

  // --- client send path -----------------------------------------------------

  /** Client: send one input sample to the host. */
  sendInput(input) {
    if (this.isHost) return false;
    const peerId = this._playerToPeer.get(1);
    if (!peerId) return false;
    return this.transport.send(peerId, encodeInput(input), { reliable: false });
  }

  // --- accessors ------------------------------------------------------------

  /** Player list with live RTT folded in. */
  playerList() {
    return [...this.players.values()].map((p) => ({
      ...p,
      rtt: p.peerId ? (this.transport.rttTo(p.peerId) ?? 0) : 0,
    }));
  }

  /** Smoothed RTT to the host, for the prediction layer. Null until measured. */
  get hostRtt() {
    if (this.isHost) return 0;
    const peerId = this._playerToPeer.get(1);
    return peerId ? this.transport.rttTo(peerId) : null;
  }

  get playerCount() {
    return this.players.size;
  }
}

/** True if `a` is at or behind `b` on the wrapped 16-bit sequence ring. */
function seqOlderOrEqual(a, b) {
  return (((a - b + 0x8000) & 0xffff) - 0x8000) <= 0;
}

function perfNow() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
