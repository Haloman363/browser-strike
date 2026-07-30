import { Peer } from 'peerjs';
import {
  MSG, decode, encodePing, encodePong, isReliableType,
} from './protocol.js';

// Thin wrapper over PeerJS. The public broker is used for signaling only —
// once ICE completes, game traffic is direct peer-to-peer and the broker can
// fall over without affecting an in-progress match.
//
// TWO CONNECTIONS PER PEER. Verified against peerjs 1.5.5:
// dist/bundler.mjs:742 creates the datachannel with `{ordered: !!options.reliable}`
// and sets nothing else. So:
//   - `{reliable: true}`  -> ordered, retransmitted (the RTCDataChannel default)
//   - `{reliable: false}` -> UNORDERED, but STILL RETRANSMITTED, because PeerJS
//     never passes maxRetransmits or maxPacketLifeTime.
// That second mode is not true unreliable delivery. PeerJS gives us no way to
// reach it without patching the library, so what we actually get for snapshots
// is unordered-reliable. In practice unordered is the half that matters: it
// removes head-of-line blocking, so one lost packet no longer stalls every
// snapshot queued behind it while SCTP retransmits. A late snapshot still
// arrives and is simply discarded by tick number on receipt (see onMessage).
//
// We also force `serialization: 'raw'`, which hands our ArrayBuffers to the
// datachannel untouched. The default 'binary' mode wraps everything in msgpack
// and a chunking layer — pure overhead when the payload is already packed
// bytes, and it would undo the compact encoding in protocol.js.

const RELIABLE_LABEL = 'rel';
const UNRELIABLE_LABEL = 'unrel';

const PING_INTERVAL_MS = 1000;
// Three missed pings. Long enough to ride out a WiFi hiccup, short enough that
// a dead peer clears before the player notices it is shooting a statue.
const PEER_TIMEOUT_MS = 5000;
// The public broker routinely takes seconds to assign an id, and sometimes
// never does.
const BROKER_TIMEOUT_MS = 15000;

// Ambiguity-free room code alphabet: no O/0, I/1, or similar look-alikes,
// because these get read aloud and typed by hand.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 5;
// The public broker is a shared namespace, so a bare 5-char code would collide
// with every other project using it.
const ROOM_PREFIX = 'bstrike-';

function randomCode() {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

/** Connection state, exposed so the UI can render it without guessing. */
export const NET_STATE = {
  IDLE: 'idle',
  CONNECTING: 'connecting',
  ONLINE: 'online',
  FAILED: 'failed',
  CLOSED: 'closed',
};

export class Transport {
  constructor({ debug = false } = {}) {
    this.state = NET_STATE.IDLE;
    this.error = null;
    this.roomCode = null;
    this.isHost = false;
    this.peerId = null;
    this.debug = debug;

    /** @type {Map<string, PeerLink>} */
    this.peers = new Map();

    // Callbacks. Assigned by Session; default to no-ops so an unset handler is
    // never a crash mid-match.
    this.onPeerJoin = () => {};
    this.onPeerLeave = () => {};
    this.onMessage = () => {};
    this.onStateChange = () => {};

    this._peer = null;
    this._pingTimer = null;
    this._destroyed = false;
  }

  // --- lifecycle ------------------------------------------------------------

  /**
   * Become the host. Resolves with a room code others can join with.
   * Rejects only if the broker never answers — every later failure surfaces
   * through onStateChange instead, so the game loop never sees a throw.
   */
  async host() {
    const code = randomCode();
    this.isHost = true;
    this.roomCode = code;
    await this._openBroker(ROOM_PREFIX + code);
    return code;
  }

  /** Join an existing room by code. */
  async join(code) {
    const clean = String(code).trim().toUpperCase();
    this.isHost = false;
    this.roomCode = clean;
    // Clients take a broker-assigned id; only the host needs a guessable one.
    await this._openBroker(undefined);
    this._connectTo(ROOM_PREFIX + clean);
  }

  _setState(state, error = null) {
    if (this.state === state && this.error === error) return;
    this.state = state;
    this.error = error;
    this.onStateChange(state, error);
  }

  _openBroker(desiredId) {
    this._setState(NET_STATE.CONNECTING);

    return new Promise((resolve, reject) => {
      let settled = false;
      const peer = desiredId ? new Peer(desiredId) : new Peer();
      this._peer = peer;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        this._setState(NET_STATE.FAILED, 'broker timeout');
        peer.destroy();
        reject(new Error('signaling broker unreachable'));
      }, BROKER_TIMEOUT_MS);

      peer.on('open', (id) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.peerId = id;
        this._setState(NET_STATE.ONLINE);
        this._startPinging();
        resolve(id);
      });

      peer.on('connection', (conn) => this._adoptConnection(conn));

      peer.on('error', (err) => {
        // 'peer-unavailable' means the room code is wrong or the host quit —
        // recoverable for the user, so it does not kill our broker link.
        if (err.type === 'peer-unavailable') {
          this._setState(NET_STATE.FAILED, 'room not found');
          return;
        }
        if (settled) {
          // Post-connection broker errors are survivable: existing peer
          // connections are direct and keep working without it.
          this._log('broker error after open', err.type);
          return;
        }
        settled = true;
        clearTimeout(timer);
        // An id collision means someone already holds this room code.
        const msg = err.type === 'unavailable-id' ? 'room code taken' : (err.type || 'broker error');
        this._setState(NET_STATE.FAILED, msg);
        reject(new Error(msg));
      });

      peer.on('disconnected', () => {
        // Broker link only. Reconnect so future joins work, but do not touch
        // the live peer connections.
        if (!this._destroyed) {
          try { peer.reconnect(); } catch { /* already gone */ }
        }
      });
    });
  }

  /** Open both channels to a remote peer. */
  _connectTo(remoteId) {
    const link = this._link(remoteId);

    const reliable = this._peer.connect(remoteId, {
      label: RELIABLE_LABEL, reliable: true, serialization: 'raw',
    });
    const unreliable = this._peer.connect(remoteId, {
      label: UNRELIABLE_LABEL, reliable: false, serialization: 'raw',
    });

    this._wire(link, reliable);
    this._wire(link, unreliable);
  }

  /** An inbound connection; the label tells us which of the pair it is. */
  _adoptConnection(conn) {
    this._wire(this._link(conn.peer), conn);
  }

  _link(remoteId) {
    let link = this.peers.get(remoteId);
    if (!link) {
      link = {
        id: remoteId,
        reliable: null,
        unreliable: null,
        rtt: 0,
        // Seeded false so a half-open link (one channel up) is not announced
        // as a join until both channels are usable.
        announced: false,
        lastSeen: now(),
        _rttInit: false,
      };
      this.peers.set(remoteId, link);
    }
    return link;
  }

  _wire(link, conn) {
    const slot = conn.label === UNRELIABLE_LABEL ? 'unreliable' : 'reliable';
    link[slot] = conn;

    conn.on('open', () => {
      link.lastSeen = now();
      // Both channels up: only now can Session rely on send({reliable:true})
      // and send({reliable:false}) both landing.
      if (link.reliable?.open && link.unreliable?.open && !link.announced) {
        link.announced = true;
        this.onPeerJoin(link.id);
      }
    });

    conn.on('data', (data) => {
      link.lastSeen = now();
      const msg = decode(data);
      // Undecodable traffic is dropped silently. On a public broker anyone who
      // learns the room code can connect and send whatever they like.
      if (!msg) return;

      // RTT is measured here rather than in the game layer so it keeps
      // updating even when the simulation is paused or loading.
      if (msg.type === MSG.PING) {
        this._rawSend(link, encodePong(msg.sentAt), false);
        return;
      }
      if (msg.type === MSG.PONG) {
        const sample = now() - msg.sentAt;
        // First sample seeds directly; smoothing from 0 would spend seconds
        // climbing to the true value and mislead the prediction layer.
        link.rtt = link._rttInit ? link.rtt * 0.9 + sample * 0.1 : sample;
        link._rttInit = true;
        return;
      }

      this.onMessage(link.id, msg);
    });

    conn.on('close', () => this._dropPeer(link.id, 'closed'));
    // Per-connection errors are routine on flaky links; treat as a disconnect
    // rather than letting PeerJS emit an unhandled error.
    conn.on('error', (err) => {
      this._log('conn error', link.id, err?.type);
      this._dropPeer(link.id, 'error');
    });
  }

  _dropPeer(remoteId, reason) {
    const link = this.peers.get(remoteId);
    if (!link) return;
    this.peers.delete(remoteId);
    for (const conn of [link.reliable, link.unreliable]) {
      try { conn?.close(); } catch { /* already closed */ }
    }
    // Only report a leave for peers we reported joining, so a connection that
    // dies during handshake does not produce an unmatched onPeerLeave.
    if (link.announced) this.onPeerLeave(remoteId, reason);
  }

  // --- sending --------------------------------------------------------------

  _rawSend(link, buf, reliable) {
    const conn = reliable ? link.reliable : link.unreliable;
    if (!conn || !conn.open) return false;
    try {
      conn.send(buf);
      return true;
    } catch (err) {
      // A send failing mid-match must not propagate into the game loop; the
      // peer is either gone or its buffer is full, and both self-resolve.
      this._log('send failed', link.id, err?.message);
      return false;
    }
  }

  /**
   * Send an encoded message to one peer. `msg` is an ArrayBuffer from
   * protocol.js. Returns false if it could not be handed to the channel.
   */
  send(peerId, msg, { reliable } = {}) {
    const link = this.peers.get(peerId);
    if (!link) return false;
    return this._rawSend(link, msg, reliable ?? this._inferReliable(msg));
  }

  /** Send to every connected peer. Returns how many accepted it. */
  broadcast(msg, { reliable, except = null } = {}) {
    const flag = reliable ?? this._inferReliable(msg);
    let sent = 0;
    for (const link of this.peers.values()) {
      if (link.id === except) continue;
      if (this._rawSend(link, msg, flag)) sent++;
    }
    return sent;
  }

  /**
   * Choose a channel from the message tag when the caller did not say.
   * Keeps callers from having to remember which events are reliable.
   */
  _inferReliable(msg) {
    try {
      const view = msg instanceof ArrayBuffer ? new DataView(msg) : null;
      if (!view || view.byteLength < 1) return true;
      return isReliableType(view.getUint8(0) & 0x7f);
    } catch {
      return true;
    }
  }

  // --- liveness -------------------------------------------------------------

  _startPinging() {
    if (this._pingTimer) return;
    this._pingTimer = setInterval(() => {
      const t = now();
      for (const link of [...this.peers.values()]) {
        // A peer that has said nothing at all for the timeout is gone. WebRTC's
        // own 'close' event can take tens of seconds on a hard disconnect
        // (laptop lid, killed tab), which is far too slow for a shooter.
        if (t - link.lastSeen > PEER_TIMEOUT_MS) {
          this._dropPeer(link.id, 'timeout');
          continue;
        }
        this._rawSend(link, encodePing(t), false);
      }
    }, PING_INTERVAL_MS);
  }

  /** Smoothed round-trip time in ms, or null if not yet measured. */
  rttTo(peerId) {
    const link = this.peers.get(peerId);
    return link && link._rttInit ? link.rtt : null;
  }

  /** All measured RTTs, for the netgraph. */
  rtts() {
    const out = {};
    for (const link of this.peers.values()) if (link._rttInit) out[link.id] = link.rtt;
    return out;
  }

  get peerIds() {
    return [...this.peers.keys()];
  }

  destroy() {
    this._destroyed = true;
    clearInterval(this._pingTimer);
    this._pingTimer = null;
    for (const id of [...this.peers.keys()]) this._dropPeer(id, 'shutdown');
    try { this._peer?.destroy(); } catch { /* already gone */ }
    this._peer = null;
    this._setState(NET_STATE.CLOSED);
  }

  _log(...args) {
    if (this.debug) console.log('[net]', ...args);
  }
}

// performance.now() is monotonic; Date.now() jumps when the clock syncs and
// would produce negative RTT samples.
function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
