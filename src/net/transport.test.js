// Run: node src/net/transport.test.js
//
// Tests the PURE protocol layer only. Transport and Session are thin wrappers
// over PeerJS and real RTCPeerConnections; mocking PeerJS here would only
// prove the mock behaves like the mock. Their real behaviour needs two
// browsers — see the report notes.
//
// NOTE: this deliberately does NOT use console.assert. console.assert prints
// and CONTINUES, so a suite built on it reports success while failing.
import {
  MSG, EVENT, BTN, SNAP_FLAG, TICK_MASK,
  encodeJoin, encodeWelcome, encodeInput, encodeSnapshot, encodeEvent,
  encodePing, encodePong, decode, decodeSnapshot,
  quantizeAngle, dequantizeAngle, tickDiff, snapshotSize, patchSnapshotAck,
  isReliableType,
} from './protocol.js';

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed++;
    console.log(`FAIL  ${name}`);
    console.log(`      ${err.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

function assertClose(actual, expected, tol, msg) {
  if (!(Math.abs(actual - expected) <= tol)) {
    throw new Error(`${msg || 'value'}: expected ${expected} +/- ${tol}, got ${actual}`);
  }
}

// --- sanity: the harness itself fails loudly ---------------------------------
// Guards against the failure mode that burned this project: a suite that can
// only ever print "ok".
check('harness detects a failure', () => {
  let threw = false;
  try { assert(false, 'intentional'); } catch { threw = true; }
  assert(threw, 'assert() did not throw on a false condition');
});

// --- angle quantization ------------------------------------------------------

check('angle quantization round-trips within one step', () => {
  // One int16 step over a full turn. Anything inside this is exact enough that
  // no player could see the difference.
  const tol = (Math.PI * 2) / 65536;
  for (const a of [0, 0.1, -0.1, 1.5707963, -1.5707963, 3.0, -3.0, 2.5, -0.0001]) {
    const back = dequantizeAngle(quantizeAngle(a));
    assertClose(back, a, tol, `angle ${a}`);
  }
});

check('angle quantization wraps multi-turn values', () => {
  const tol = (Math.PI * 2) / 65536;
  const TAU = Math.PI * 2;
  // A yaw that has accumulated 10 turns must land on the same wire value as
  // its wrapped equivalent, not clamp to the int16 rail.
  for (const base of [0.3, -0.7, 2.2]) {
    const wrapped = dequantizeAngle(quantizeAngle(base));
    for (const turns of [1, -1, 5, -10]) {
      const back = dequantizeAngle(quantizeAngle(base + TAU * turns));
      assertClose(back, wrapped, tol * 2, `${base} + ${turns} turns`);
    }
  }
});

check('angle quantization stays in int16 at the +PI boundary', () => {
  // Math.round(PI * scale) is +32768, one past int16. If this folds wrong,
  // setInt16 silently writes -32768 and looking straight backwards breaks.
  for (const a of [Math.PI, -Math.PI, Math.PI - 1e-9, Math.PI + 1e-9]) {
    const q = quantizeAngle(a);
    assert(q >= -32768 && q <= 32767, `quantizeAngle(${a}) = ${q} out of int16 range`);
    // +PI and -PI are the same heading, so either rail is correct.
    assert(Math.abs(Math.abs(q) - 32768) <= 1, `expected the PI rail, got ${q}`);
  }
});

// --- tick wraparound ---------------------------------------------------------

check('tickDiff is correct across 16-bit wraparound', () => {
  assert(tickDiff(10, 5) === 5, 'simple forward diff');
  assert(tickDiff(5, 10) === -5, 'simple backward diff');
  // The case a naive (a - b) gets wrong: 2 ticks after the counter wrapped.
  assert(tickDiff(1, 65535) === 2, `wrapped forward diff, got ${tickDiff(1, 65535)}`);
  assert(tickDiff(65535, 1) === -2, `wrapped backward diff, got ${tickDiff(65535, 1)}`);
  assert(tickDiff(0, 65535) === 1, 'one tick past rollover');
  assert(tickDiff(100, 100) === 0, 'identical ticks');
});

check('ticks survive encode/decode across the wrap point', () => {
  for (const tick of [0, 1, 32767, 65534, 65535]) {
    const msg = decode(encodeSnapshot({ tick, players: [] }));
    assert(msg.tick === tick, `tick ${tick} round-trip, got ${msg.tick}`);
  }
  // A tick past the 16-bit range must alias, not corrupt neighbouring fields.
  const wrapped = decode(encodeSnapshot({ tick: 65536 + 7, players: [] }));
  assert(wrapped.tick === 7, `65543 should mask to 7, got ${wrapped.tick}`);
  assert(wrapped.type === MSG.SNAPSHOT, 'type byte was corrupted by tick overflow');
});

// --- INPUT / bitfields -------------------------------------------------------

check('input round-trips every button combination', () => {
  const all = [BTN.JUMP, BTN.CROUCH, BTN.FIRE, BTN.RELOAD, BTN.WALK];
  // All 32 subsets, so a bit that leaks into a neighbouring field is caught.
  for (let mask = 0; mask < 32; mask++) {
    let buttons = 0;
    for (let b = 0; b < all.length; b++) if (mask & (1 << b)) buttons |= all[b];

    const msg = decode(encodeInput({
      seq: 1234, tick: 5678, forward: 1, right: -1,
      buttons, yaw: 0.5, pitch: -0.25, lastAckedSeq: 1200,
    }));

    assert(msg !== null, `mask ${mask} failed to decode`);
    assert(msg.type === MSG.INPUT, `mask ${mask}: wrong type ${msg.type}`);
    assert(msg.buttons === buttons, `mask ${mask}: buttons ${msg.buttons} !== ${buttons}`);
    // The WALK bit rides byte 0's high bit; make sure it did not eat the tag
    // or corrupt the movement axes.
    assert(msg.forward === 1, `mask ${mask}: forward corrupted -> ${msg.forward}`);
    assert(msg.right === -1, `mask ${mask}: right corrupted -> ${msg.right}`);
    assert(msg.seq === 1234, `mask ${mask}: seq corrupted -> ${msg.seq}`);
  }
});

check('input round-trips every movement axis combination', () => {
  for (const forward of [-1, 0, 1]) {
    for (const right of [-1, 0, 1]) {
      const msg = decode(encodeInput({
        seq: 0, tick: 0, forward, right, buttons: BTN.WALK | BTN.FIRE, yaw: 0, pitch: 0,
      }));
      assert(msg.forward === forward, `forward ${forward} -> ${msg.forward}`);
      assert(msg.right === right, `right ${right} -> ${msg.right}`);
      assert(msg.buttons === (BTN.WALK | BTN.FIRE), `buttons corrupted -> ${msg.buttons}`);
    }
  }
});

check('input carries lastAckedSeq for reconciliation', () => {
  // The prediction layer replays from this; if it aliased with seq the client
  // would rewind to the wrong input every frame.
  const msg = decode(encodeInput({
    seq: 60000, tick: 100, forward: 0, right: 0, buttons: 0,
    yaw: 0, pitch: 0, lastAckedSeq: 59990,
  }));
  assert(msg.seq === 60000, `seq ${msg.seq}`);
  assert(msg.lastAckedSeq === 59990, `lastAckedSeq ${msg.lastAckedSeq}`);
});

check('input is 12 bytes', () => {
  const buf = encodeInput({ seq: 1, tick: 1, forward: 1, right: 1, buttons: 31, yaw: 1, pitch: 1 });
  assert(buf.byteLength === 12, `expected 12 bytes, got ${buf.byteLength}`);
});

// --- SNAPSHOT ----------------------------------------------------------------

function samplePlayers(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({
      id: i + 1,
      flags: i % 2 ? SNAP_FLAG.CROUCHING | SNAP_FLAG.FIRING : SNAP_FLAG.GROUNDED,
      x: i * 3.5 - 20, y: 1.75 + i * 0.01, z: -i * 7.25,
      yaw: (i * 0.4) - 1.2, pitch: (i * 0.05) - 0.3,
    });
  }
  return out;
}

check('snapshot round-trips player state', () => {
  const players = samplePlayers(8);
  const msg = decode(encodeSnapshot({ tick: 4242, players, ackSeq: 99 }));

  assert(msg.type === MSG.SNAPSHOT, 'type');
  assert(msg.tick === 4242, `tick ${msg.tick}`);
  assert(msg.ackSeq === 99, `ackSeq ${msg.ackSeq}`);
  assert(msg.players.length === 8, `count ${msg.players.length}`);

  const angleTol = (Math.PI * 2) / 65536;
  for (let i = 0; i < 8; i++) {
    const a = players[i];
    const b = msg.players[i];
    assert(b.id === a.id, `player ${i} id`);
    assert(b.flags === a.flags, `player ${i} flags ${b.flags} !== ${a.flags}`);
    // float32 keeps ~7 significant digits; at these magnitudes that is far
    // below a millimetre.
    assertClose(b.x, a.x, 1e-3, `player ${i} x`);
    assertClose(b.y, a.y, 1e-3, `player ${i} y`);
    assertClose(b.z, a.z, 1e-3, `player ${i} z`);
    assertClose(b.yaw, a.yaw, angleTol, `player ${i} yaw`);
    assertClose(b.pitch, a.pitch, angleTol, `player ${i} pitch`);
  }
});

check('float32 positions keep sub-millimetre precision at map scale', () => {
  // The map is about 1km across at worst. float32 must not visibly round.
  const players = [{ id: 1, flags: 0, x: 999.9375, y: -512.03125, z: 0.001953125, yaw: 0, pitch: 0 }];
  const msg = decode(encodeSnapshot({ tick: 0, players }));
  assertClose(msg.players[0].x, 999.9375, 1e-4, 'x at 1km');
  assertClose(msg.players[0].y, -512.03125, 1e-4, 'y');
  assertClose(msg.players[0].z, 0.001953125, 1e-9, 'z small value');
});

check('snapshot handles the empty payload', () => {
  const buf = encodeSnapshot({ tick: 7, players: [] });
  const msg = decode(buf);
  assert(msg !== null, 'empty snapshot failed to decode');
  assert(msg.players.length === 0, `expected 0 players, got ${msg.players.length}`);
  assert(msg.tick === 7, 'tick lost on empty snapshot');
});

check('snapshot handles a max-size payload', () => {
  // 32 is the protocol cap; encoding more must clamp, not overflow the count
  // byte or write past the buffer.
  const msg = decode(encodeSnapshot({ tick: 1, players: samplePlayers(64) }));
  assert(msg !== null, 'max snapshot failed to decode');
  assert(msg.players.length === 32, `expected clamp to 32, got ${msg.players.length}`);
});

check('snapshot size matches the documented budget', () => {
  const eight = encodeSnapshot({ tick: 0, players: samplePlayers(8) });
  // 6 header bytes + 8 * 18. The bandwidth math in session.js depends on this.
  assert(eight.byteLength === 150, `8-player snapshot should be 150 bytes, got ${eight.byteLength}`);
  assert(snapshotSize(8) + 2 === eight.byteLength, 'snapshotSize() disagrees with encodeSnapshot');
});

check('patchSnapshotAck rewrites only the ack field', () => {
  const players = samplePlayers(4);
  const base = encodeSnapshot({ tick: 900, players, ackSeq: 1 });
  const patched = patchSnapshotAck(base, 4321);

  const a = decode(base);
  const b = decode(patched);
  assert(b.ackSeq === 4321, `patched ack ${b.ackSeq}`);
  assert(a.ackSeq === 1, 'patching mutated the original buffer');
  assert(b.tick === a.tick, 'tick changed');
  assert(b.players.length === a.players.length, 'player count changed');
  for (let i = 0; i < a.players.length; i++) {
    assert(b.players[i].x === a.players[i].x, `player ${i} x changed`);
    assert(b.players[i].id === a.players[i].id, `player ${i} id changed`);
  }
});

// --- other message types -----------------------------------------------------

check('join round-trips, including an empty name', () => {
  assert(decode(encodeJoin({ name: 'jaymes' })).name === 'jaymes', 'name');
  assert(decode(encodeJoin({ name: '' })).name === '', 'empty name');
  // UTF-8 must survive: the length prefix counts bytes, not code points.
  const emoji = decode(encodeJoin({ name: 'héllo wörld' }));
  assert(emoji.name === 'héllo wörld', `utf8 name -> ${emoji.name}`);
});

check('welcome round-trips id, tick and map seed', () => {
  const msg = decode(encodeWelcome({ playerId: 7, tick: 65535, mapSeed: 0xdeadbeef, name: 'host' }));
  assert(msg.type === MSG.WELCOME, 'type');
  assert(msg.playerId === 7, `playerId ${msg.playerId}`);
  assert(msg.tick === 65535, `tick ${msg.tick}`);
  // Seeds above 2^31 must not come back negative — the map generator would
  // produce a different world on the client.
  assert(msg.mapSeed === 0xdeadbeef, `mapSeed ${msg.mapSeed}`);
  assert(msg.name === 'host', 'name');
});

check('event round-trips every kind', () => {
  for (const kind of Object.values(EVENT)) {
    const msg = decode(encodeEvent({
      kind, tick: 300, actorId: 2, targetId: 5, amount: 45,
      x: 1.5, y: -2.25, z: 30.75,
    }));
    assert(msg.type === MSG.EVENT, `kind ${kind} type`);
    assert(msg.kind === kind, `kind ${msg.kind} !== ${kind}`);
    assert(msg.actorId === 2 && msg.targetId === 5, `kind ${kind} ids`);
    assert(msg.amount === 45, `kind ${kind} amount`);
    assertClose(msg.x, 1.5, 1e-6, 'x');
    assertClose(msg.z, 30.75, 1e-6, 'z');
  }
});

check('ping/pong preserve the timestamp exactly', () => {
  // float64 must be bit-exact or the RTT estimate drifts.
  const t = 1234567.8901234;
  assert(decode(encodePing(t)).sentAt === t, 'ping timestamp');
  assert(decode(encodePong(t)).sentAt === t, 'pong timestamp');
  assert(decode(encodePing(t)).type === MSG.PING, 'ping type');
  assert(decode(encodePong(t)).type === MSG.PONG, 'pong type');
});

check('channel routing matches the reliability rules', () => {
  // Snapshots and inputs supersede each other; events and handshakes do not.
  assert(isReliableType(MSG.JOIN), 'JOIN must be reliable');
  assert(isReliableType(MSG.WELCOME), 'WELCOME must be reliable');
  assert(isReliableType(MSG.EVENT), 'EVENT must be reliable');
  assert(!isReliableType(MSG.INPUT), 'INPUT must be unreliable');
  assert(!isReliableType(MSG.SNAPSHOT), 'SNAPSHOT must be unreliable');
  assert(!isReliableType(MSG.PING), 'PING must be unreliable');
});

// --- hostile input -----------------------------------------------------------

check('decoder rejects truncated buffers without crashing', () => {
  const samples = [
    encodeInput({ seq: 1, tick: 1, forward: 0, right: 0, buttons: 7, yaw: 1, pitch: 0 }),
    encodeSnapshot({ tick: 1, players: samplePlayers(6) }),
    encodeEvent({ kind: EVENT.HIT, tick: 1, actorId: 1, targetId: 2 }),
    encodeWelcome({ playerId: 1, tick: 1, mapSeed: 5, name: 'abc' }),
    encodeJoin({ name: 'abc' }),
    encodePing(123),
  ];
  // Every prefix of every valid message. A decoder that reads past the end
  // here would throw into the receive handler and kill the game loop.
  for (const buf of samples) {
    for (let len = 0; len < buf.byteLength; len++) {
      const truncated = buf.slice(0, len);
      const out = decode(truncated); // must not throw
      // A short buffer may still be a legal shorter message (e.g. a snapshot
      // with fewer players), so only demand that it did not explode.
      assert(out === null || typeof out === 'object', `prefix ${len} returned ${out}`);
    }
  }
});

check('decoder survives a fuzz of random bytes', () => {
  // Deterministic PRNG so a failure is reproducible.
  let seed = 0x1234abcd;
  const rand = () => {
    seed ^= seed << 13; seed >>>= 0;
    seed ^= seed >> 17;
    seed ^= seed << 5; seed >>>= 0;
    return seed;
  };

  for (let i = 0; i < 20000; i++) {
    const len = rand() % 300;
    const bytes = new Uint8Array(len);
    for (let j = 0; j < len; j++) bytes[j] = rand() & 0xff;
    // Bias a third of the cases to a valid type tag so the fuzzer actually
    // reaches the per-type decoders instead of bouncing off the tag switch.
    if (len > 0 && i % 3 === 0) bytes[0] = 1 + (rand() % 7);

    let out;
    try {
      out = decode(bytes.buffer);
    } catch (err) {
      throw new Error(`decode threw on random input (i=${i}, len=${len}): ${err.message}`);
    }
    if (out !== null) {
      assert(typeof out === 'object', `i=${i}: non-object result ${out}`);
      assert(typeof out.type === 'number', `i=${i}: result had no type`);
      // A snapshot claiming players must actually have produced them; a
      // count/length mismatch slipping through would desync the client.
      if (out.type === MSG.SNAPSHOT) {
        assert(Array.isArray(out.players), `i=${i}: snapshot without a player array`);
        assert(out.players.length <= 32, `i=${i}: ${out.players.length} players past the cap`);
        assert(len >= 6 + out.players.length * 18,
          `i=${i}: decoded ${out.players.length} players from ${len} bytes`);
      }
    }
  }
});

check('decoder rejects non-buffer input', () => {
  for (const junk of [null, undefined, 42, 'string', {}, [], true]) {
    assert(decode(junk) === null, `decode(${JSON.stringify(junk)}) should be null`);
  }
});

check('decoder rejects unknown message tags', () => {
  for (const tag of [0, 8, 9, 100, 127]) {
    const buf = new ArrayBuffer(32);
    new DataView(buf).setUint8(0, tag);
    assert(decode(buf) === null, `tag ${tag} should be unknown`);
  }
});

check('snapshot decoder rejects a lying player count', () => {
  // Hand-built: header says 32 players, buffer holds one. Trusting the count
  // would read far past the end of the buffer.
  const buf = new ArrayBuffer(6 + 18);
  const view = new DataView(buf);
  view.setUint8(0, MSG.SNAPSHOT);
  view.setUint8(1, 32);
  assert(decodeSnapshot(view) === null, 'oversized count was accepted');
  assert(decode(buf) === null, 'oversized count passed through decode()');
});

check('decoder accepts a typed-array view, not just ArrayBuffer', () => {
  // RTCDataChannel hands us Uint8Array in some browsers and ArrayBuffer in
  // others, and a wrongly-offset view would silently decode garbage.
  const buf = encodeEvent({ kind: EVENT.DEATH, tick: 55, actorId: 3, targetId: 4 });
  const padded = new Uint8Array(buf.byteLength + 10);
  padded.set(new Uint8Array(buf), 10);
  const viewOnly = padded.subarray(10);

  const direct = decode(buf);
  const offset = decode(viewOnly);
  assert(offset !== null, 'offset view failed to decode');
  assert(offset.tick === direct.tick, `tick ${offset.tick} !== ${direct.tick}`);
  assert(offset.actorId === 3 && offset.targetId === 4, 'ids wrong through offset view');
});

// --- results -----------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
