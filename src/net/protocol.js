// Wire format for host-authoritative netplay. Pure functions only — no browser,
// no PeerJS — so the whole format is testable under plain node.
//
// Every message is a single ArrayBuffer whose first byte is the type tag. The
// decoder is total: it returns null for anything it cannot parse rather than
// throwing, because these buffers arrive from the network and a malformed one
// must never take down the game loop.

export const MSG = {
  JOIN: 1,
  WELCOME: 2,
  INPUT: 3,
  SNAPSHOT: 4,
  EVENT: 5,
  PING: 6,
  PONG: 7,
};

// Events are host-authoritative facts, not requests. Kept as a small enum so
// the reliable channel carries a byte instead of a string.
export const EVENT = {
  SHOT: 1,
  HIT: 2,
  DEATH: 3,
  RESPAWN: 4,
};

// Ticks wrap at 16 bits. At a 128Hz sim that is a rollover every ~8.5 minutes,
// so anything comparing ticks must use tickDiff() rather than `a - b`.
export const TICK_MASK = 0xffff;

// Input sequence numbers wrap on the same 16-bit field for the same reason.
export const SEQ_MASK = 0xffff;

// Button bitfield. Shared by INPUT encoding and the movement code that
// consumes it, so the bit order is part of the wire contract.
export const BTN = {
  JUMP: 1 << 0,
  CROUCH: 1 << 1,
  FIRE: 1 << 2,
  RELOAD: 1 << 3,
  WALK: 1 << 4,
};

const MAX_PLAYERS = 32;

// Per-player snapshot record, see writePlayer/readPlayer.
const PLAYER_BYTES = 18;
const SNAPSHOT_HEADER_BYTES = 4;

/**
 * Signed difference between two wrapped tick/sequence counters.
 * Returns the shortest path around the ring, so it stays correct across
 * rollover as long as the true gap is under half the range.
 */
export function tickDiff(a, b) {
  return ((a - b + 0x8000) & TICK_MASK) - 0x8000;
}

// --- angle quantization -----------------------------------------------------
// Yaw and pitch ride in int16. Full turn over 65536 steps is ~0.0055 degrees,
// far below what a player can perceive or a mouse can express, so this is
// lossless in practice while halving the cost against float32.
const ANGLE_SCALE = 32768 / Math.PI;

export function quantizeAngle(radians) {
  // Wrap into [-PI, PI) first; otherwise a yaw that has accumulated many turns
  // would alias unpredictably when it hits the int16 clamp.
  let a = radians % (Math.PI * 2);
  if (a >= Math.PI) a -= Math.PI * 2;
  if (a < -Math.PI) a += Math.PI * 2;
  const q = Math.round(a * ANGLE_SCALE);
  // Math.round(PI * scale) lands on +32768, one past int16. Fold it to -32768,
  // which is the same angle after wrapping.
  return q > 32767 ? -32768 : q;
}

export function dequantizeAngle(q) {
  return q / ANGLE_SCALE;
}

// --- string helpers ---------------------------------------------------------
// Used only on the reliable channel (ids, room codes), never per-tick.

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder();

function writeString(view, offset, str) {
  const bytes = utf8Encoder.encode(str);
  if (bytes.length > 255) throw new RangeError(`string too long: ${bytes.length}`);
  view.setUint8(offset, bytes.length);
  new Uint8Array(view.buffer, view.byteOffset + offset + 1, bytes.length).set(bytes);
  return offset + 1 + bytes.length;
}

function readString(view, offset) {
  if (offset + 1 > view.byteLength) return null;
  const len = view.getUint8(offset);
  if (offset + 1 + len > view.byteLength) return null;
  const bytes = new Uint8Array(view.buffer, view.byteOffset + offset + 1, len);
  return { value: utf8Decoder.decode(bytes), offset: offset + 1 + len };
}

function stringBytes(str) {
  return 1 + utf8Encoder.encode(str).length;
}

// --- JOIN -------------------------------------------------------------------
// Reliable channel. Client announces itself; the host replies with WELCOME.

export function encodeJoin({ name = '' } = {}) {
  const buf = new ArrayBuffer(1 + stringBytes(name));
  const view = new DataView(buf);
  view.setUint8(0, MSG.JOIN);
  writeString(view, 1, name);
  return buf;
}

// --- WELCOME ----------------------------------------------------------------
// Reliable channel. Host tells a fresh client who it is and where the
// simulation currently stands, so it can start predicting from the right tick.

export function encodeWelcome({ playerId, tick, mapSeed, name = '' }) {
  const buf = new ArrayBuffer(1 + 1 + 2 + 4 + stringBytes(name));
  const view = new DataView(buf);
  view.setUint8(0, MSG.WELCOME);
  view.setUint8(1, playerId & 0xff);
  view.setUint16(2, tick & TICK_MASK);
  view.setUint32(4, mapSeed >>> 0);
  writeString(view, 8, name);
  return buf;
}

// --- INPUT ------------------------------------------------------------------
// Unreliable channel. A dropped input is not resent: by the time a retransmit
// arrived the host would have simulated past it. The client instead keeps
// sending its recent history and the host takes whatever lands.

export function encodeInput({ seq, tick, forward, right, buttons, yaw, pitch, lastAckedSeq = 0 }) {
  const buf = new ArrayBuffer(12);
  const view = new DataView(buf);
  view.setUint8(0, MSG.INPUT);
  // forward/right are -1|0|1 from the keyboard. Bias by 1 into 0..2 so they
  // fit a byte without a sign-extension dance on the far side.
  view.setUint8(1, ((forward + 1) & 0x3) | (((right + 1) & 0x3) << 2));
  view.setUint16(2, seq & SEQ_MASK);
  view.setUint16(4, tick & TICK_MASK);
  // The host echoes this back as SNAPSHOT.ackSeq; reconciliation replays
  // everything after it.
  view.setUint16(6, lastAckedSeq & SEQ_MASK);
  view.setInt16(8, quantizeAngle(yaw));
  view.setInt16(10, quantizeAngle(pitch));
  // Buttons pack into the spare high bits of byte 1.
  view.setUint8(1, view.getUint8(1) | ((buttons & 0xf) << 4));
  // RELOAD/WALK overflow a nibble, so the 5th bit rides byte 0's high bit —
  // the type tag only needs values up to 7.
  if (buttons & BTN.WALK) view.setUint8(0, MSG.INPUT | 0x80);
  return buf;
}

export function decodeInput(view) {
  if (view.byteLength < 12) return null;
  const packed = view.getUint8(1);
  let buttons = (packed >> 4) & 0xf;
  if (view.getUint8(0) & 0x80) buttons |= BTN.WALK;
  return {
    type: MSG.INPUT,
    forward: (packed & 0x3) - 1,
    right: ((packed >> 2) & 0x3) - 1,
    seq: view.getUint16(2),
    tick: view.getUint16(4),
    lastAckedSeq: view.getUint16(6),
    yaw: dequantizeAngle(view.getInt16(8)),
    pitch: dequantizeAngle(view.getInt16(10)),
    buttons,
  };
}

// --- SNAPSHOT ---------------------------------------------------------------
// Unreliable channel. Each snapshot is a complete world state, so a lost one
// costs nothing: the next supersedes it. That is what buys us the right to
// drop reliability here.
//
// Per player: id(1) flags(1) x,y,z(12) yaw,pitch(4) = 18 bytes.
// Header: type(1) count(1) tick(2) = 4 bytes.
// An 8-player snapshot is 148 bytes; at 20Hz that is ~3.0 KB/s per client
// downstream, which the host can sustain over 7 peers on a home uplink.

export const SNAP_FLAG = {
  CROUCHING: 1 << 0,
  GROUNDED: 1 << 1,
  FIRING: 1 << 2,
  DEAD: 1 << 3,
};

export function snapshotSize(playerCount) {
  return SNAPSHOT_HEADER_BYTES + playerCount * PLAYER_BYTES;
}

export function encodeSnapshot({ tick, players, ackSeq = 0 }) {
  const n = Math.min(players.length, MAX_PLAYERS);
  const buf = new ArrayBuffer(snapshotSize(n) + 2);
  const view = new DataView(buf);
  view.setUint8(0, MSG.SNAPSHOT);
  view.setUint8(1, n);
  view.setUint16(2, tick & TICK_MASK);
  // Per-client echo of the last input the host consumed. The transport patches
  // this per recipient before sending, since one snapshot body serves everyone.
  view.setUint16(4, ackSeq & SEQ_MASK);

  let off = 6;
  for (let i = 0; i < n; i++) {
    const p = players[i];
    view.setUint8(off, p.id & 0xff);
    view.setUint8(off + 1, p.flags & 0xff);
    // float32 positions: ~0.5mm resolution over a 1km map, well past what the
    // renderer or hit detection can distinguish.
    view.setFloat32(off + 2, p.x);
    view.setFloat32(off + 6, p.y);
    view.setFloat32(off + 10, p.z);
    view.setInt16(off + 14, quantizeAngle(p.yaw));
    view.setInt16(off + 16, quantizeAngle(p.pitch));
    off += PLAYER_BYTES;
  }
  return buf;
}

export function decodeSnapshot(view) {
  if (view.byteLength < 6) return null;
  const n = view.getUint8(1);
  if (n > MAX_PLAYERS) return null;
  // Reject anything whose declared count does not match the bytes present.
  // A truncated snapshot must not yield half a player list.
  if (view.byteLength < 6 + n * PLAYER_BYTES) return null;

  const players = [];
  let off = 6;
  for (let i = 0; i < n; i++) {
    players.push({
      id: view.getUint8(off),
      flags: view.getUint8(off + 1),
      x: view.getFloat32(off + 2),
      y: view.getFloat32(off + 6),
      z: view.getFloat32(off + 10),
      yaw: dequantizeAngle(view.getInt16(off + 14)),
      pitch: dequantizeAngle(view.getInt16(off + 16)),
    });
    off += PLAYER_BYTES;
  }

  return { type: MSG.SNAPSHOT, tick: view.getUint16(2), ackSeq: view.getUint16(4), players };
}

/**
 * Overwrite the ackSeq field of an already-encoded snapshot in place.
 * Lets the host encode the player array once and stamp each client's own
 * acknowledgement onto a copy, instead of re-encoding per recipient.
 */
export function patchSnapshotAck(buf, ackSeq) {
  const copy = buf.slice(0);
  new DataView(copy).setUint16(4, ackSeq & SEQ_MASK);
  return copy;
}

// --- EVENT ------------------------------------------------------------------
// Reliable ordered channel. Unlike snapshots these do not supersede each other:
// a missed death or respawn desyncs the client permanently.

export function encodeEvent({ kind, tick, actorId, targetId = 0, x = 0, y = 0, z = 0, amount = 0 }) {
  const buf = new ArrayBuffer(20);
  const view = new DataView(buf);
  view.setUint8(0, MSG.EVENT);
  view.setUint8(1, kind & 0xff);
  view.setUint16(2, tick & TICK_MASK);
  view.setUint8(4, actorId & 0xff);
  view.setUint8(5, targetId & 0xff);
  view.setUint16(6, amount & 0xffff);
  view.setFloat32(8, x);
  view.setFloat32(12, y);
  view.setFloat32(16, z);
  return buf;
}

export function decodeEvent(view) {
  if (view.byteLength < 20) return null;
  return {
    type: MSG.EVENT,
    kind: view.getUint8(1),
    tick: view.getUint16(2),
    actorId: view.getUint8(4),
    targetId: view.getUint8(5),
    amount: view.getUint16(6),
    x: view.getFloat32(8),
    y: view.getFloat32(12),
    z: view.getFloat32(16),
  };
}

// --- PING / PONG ------------------------------------------------------------
// Unreliable channel. The timestamp is a float64 of performance.now(); a lost
// ping just means one missed RTT sample.

export function encodePing(sentAt) {
  const buf = new ArrayBuffer(9);
  const view = new DataView(buf);
  view.setUint8(0, MSG.PING);
  view.setFloat64(1, sentAt);
  return buf;
}

export function encodePong(sentAt) {
  const buf = new ArrayBuffer(9);
  const view = new DataView(buf);
  view.setUint8(0, MSG.PONG);
  view.setFloat64(1, sentAt);
  return buf;
}

// --- dispatch ---------------------------------------------------------------

/**
 * Decode any message. Returns null on unknown tags, short buffers, or garbage.
 * Never throws: callers are on the receive path of a public network.
 */
export function decode(data) {
  let view;
  try {
    if (data instanceof ArrayBuffer) view = new DataView(data);
    else if (ArrayBuffer.isView(data)) view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    else return null;
  } catch {
    return null;
  }

  if (view.byteLength < 1) return null;
  // Mask off the WALK overflow bit that encodeInput borrows.
  const type = view.getUint8(0) & 0x7f;

  try {
    switch (type) {
      case MSG.JOIN: {
        const s = readString(view, 1);
        return s ? { type: MSG.JOIN, name: s.value } : null;
      }
      case MSG.WELCOME: {
        if (view.byteLength < 8) return null;
        const s = readString(view, 8);
        return s ? {
          type: MSG.WELCOME,
          playerId: view.getUint8(1),
          tick: view.getUint16(2),
          mapSeed: view.getUint32(4),
          name: s.value,
        } : null;
      }
      case MSG.INPUT: return decodeInput(view);
      case MSG.SNAPSHOT: return decodeSnapshot(view);
      case MSG.EVENT: return decodeEvent(view);
      case MSG.PING:
      case MSG.PONG:
        if (view.byteLength < 9) return null;
        return { type, sentAt: view.getFloat64(1) };
      default:
        return null;
    }
  } catch {
    // Defence in depth: the length guards above should already cover every
    // path, but a decoder on a public network gets exactly one chance.
    return null;
  }
}

/** Which channel a message type belongs on. See transport.js for why. */
export function isReliableType(type) {
  return type === MSG.JOIN || type === MSG.WELCOME || type === MSG.EVENT;
}
