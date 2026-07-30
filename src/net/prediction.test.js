// Run: node src/net/prediction.test.js
//
// Every physics assertion below drives the REAL PlayerMovement against the REAL
// CollisionWorld. There is no simplified movement model in this file on purpose:
// a test that reimplements the solver only proves the reimplementation agrees
// with itself, which has produced false "fixed" claims in this repo before. The
// numbers asserted are whatever the real solver produces.
//
// console.assert does not throw and would let a broken build report success, so
// it is not used anywhere here.

import * as THREE from 'three';
import { CollisionWorld } from '../world/collision.js';
import { PlayerMovement } from '../player/movement.js';
import {
  PredictedPlayer, TICK,
  SMOOTH_CORRECTION_MAX, SNAP_CORRECTION_MIN,
} from './prediction.js';
import {
  RemoteReplication, INTERP_DELAY, MAX_EXTRAPOLATION, MAX_CATCHUP_STEP,
} from './replication.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
let passed = 0;
let failed = 0;
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

function check(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok    ${name}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${e.message}`);
  }
}

// A world with a floor, a step and a wall, so replay exercises the step-up
// retry and the slide path — the parts a simplified physics copy would get
// wrong, and the parts prediction drift actually shows up in.
const world = () => new CollisionWorld()
  .addBox(V(0, -0.5, 0), V(200, 1, 200))
  .addBox(V(30, 0.15, 0), V(56, 0.3, 8))
  .addBox(V(-6, 2, 0), V(0.5, 4, 20));

/** Deterministic pseudo-random input script — no Math.random in tests. */
function scriptedInput(i) {
  return {
    forward: (i % 7 < 4) ? 1 : -1,
    right: (i % 11 < 5) ? 1 : 0,
    jump: i % 53 === 0,
    crouch: i % 97 < 20,
  };
}
const scriptedYaw = (i) => Math.sin(i * 0.037) * 0.9;

/** Full physics state, as the reconciler restores it. */
const stateOf = (m) => ({
  position: { x: m.position.x, y: m.position.y, z: m.position.z },
  velocity: { x: m.velocity.x, y: m.velocity.y, z: m.velocity.z },
  height: m.height,
  grounded: m.grounded,
  crouching: m.crouching,
});

// =====================================================================
// Determinism — the assumption everything else rests on.
// =====================================================================

check('movement.js is deterministic: identical inputs give bit-identical state', () => {
  const run = () => {
    const p = new PlayerMovement(world(), V(0, 3, 0));
    const trail = [];
    for (let i = 0; i < 400; i++) {
      p.update(scriptedInput(i), scriptedYaw(i), TICK);
      trail.push(p.position.x, p.position.y, p.position.z,
        p.velocity.x, p.velocity.y, p.velocity.z, p.height, p.grounded ? 1 : 0);
    }
    return trail;
  };
  const a = run(), b = run();
  assert(a.length === b.length, 'trail lengths differ');
  for (let i = 0; i < a.length; i++) {
    // Object.is, not ===, so a stray NaN counts as equal to itself rather than
    // masking a real mismatch as a difference.
    assert(Object.is(a[i], b[i]),
      `sample ${i} diverged: ${a[i]} vs ${b[i]} — movement.js is NOT deterministic`);
  }
  assert(!a.some(Number.isNaN), 'NaN in the deterministic trail');
});

check('replay through PredictedPlayer matches a straight simulation exactly', () => {
  // The prediction wrapper must not perturb the physics it wraps.
  const direct = new PlayerMovement(world(), V(0, 3, 0));
  const pred = new PredictedPlayer(world(), V(0, 3, 0));
  for (let i = 0; i < 300; i++) {
    const inp = scriptedInput(i), yaw = scriptedYaw(i);
    direct.update(inp, yaw, TICK);
    pred.applyInput(inp, yaw);
  }
  assert(Object.is(direct.position.x, pred.movement.position.x) &&
         Object.is(direct.position.y, pred.movement.position.y) &&
         Object.is(direct.position.z, pred.movement.position.z),
    `wrapper altered physics: ${direct.position.toArray()} vs ${pred.movement.position.toArray()}`);
});

check('replay determinism: two independent replays are bit-identical', () => {
  // Build a host state at tick 100, then replay ticks 100..299 twice from it.
  const host = new PlayerMovement(world(), V(0, 3, 0));
  for (let i = 0; i < 100; i++) host.update(scriptedInput(i), scriptedYaw(i), TICK);
  const acked = stateOf(host);

  const replay = () => {
    const p = new PredictedPlayer(world(), V(0, 3, 0));
    for (let i = 0; i < 300; i++) p.applyInput(scriptedInput(i), scriptedYaw(i));
    p.reconcile({ ackSeq: 100, tick: 100, ...acked });
    return p.movement.position.clone();
  };
  const a = replay(), b = replay();
  assert(Object.is(a.x, b.x) && Object.is(a.y, b.y) && Object.is(a.z, b.z),
    `replays diverged: ${a.toArray()} vs ${b.toArray()}`);
});

// =====================================================================
// Reconciliation
// =====================================================================

check('reconciliation with a correct host state leaves the player where predicted', () => {
  // Host and client run the same inputs, so replay must return to exactly the
  // predicted position. Any nonzero error here means replay is lossy.
  const host = new PlayerMovement(world(), V(0, 3, 0));
  const pred = new PredictedPlayer(world(), V(0, 3, 0));

  const N = 250, ACK = 180;
  let ackedState = null;
  for (let i = 0; i < N; i++) {
    const inp = scriptedInput(i), yaw = scriptedYaw(i);
    pred.applyInput(inp, yaw);
    host.update(inp, yaw, TICK);
    if (i === ACK - 1) ackedState = stateOf(host);
  }
  const before = pred.movement.position.clone();

  const ok = pred.reconcile({ ackSeq: ACK, tick: ACK, ...ackedState });
  assert(ok, 'snapshot rejected');
  assert(pred.lastReplayCount === N - ACK,
    `expected ${N - ACK} replayed inputs, got ${pred.lastReplayCount}`);

  const err = before.distanceTo(pred.movement.position);
  assert(err === 0, `agreeing host should give exactly zero error, got ${err}`);
  assert(pred.lastError === 0, `reported error ${pred.lastError}`);
});

check('reconciliation converges: injected divergence collapses after replay', () => {
  // Host disagrees by a known offset. After replay the client must land on the
  // host's trajectory, not on its own — error to the host-continued path ~0.
  const host = new PlayerMovement(world(), V(0, 3, 0));
  const pred = new PredictedPlayer(world(), V(0, 3, 0));

  const N = 240, ACK = 160;
  for (let i = 0; i < ACK; i++) {
    const inp = scriptedInput(i), yaw = scriptedYaw(i);
    pred.applyInput(inp, yaw);
    host.update(inp, yaw, TICK);
  }

  // Inject the divergence: shove the HOST 0.5m sideways at the ack point. The
  // client never saw this and is now genuinely mispredicting.
  host.position.x += 0.5;
  const ackedState = stateOf(host);

  // Both continue with identical inputs from here.
  for (let i = ACK; i < N; i++) {
    const inp = scriptedInput(i), yaw = scriptedYaw(i);
    pred.applyInput(inp, yaw);
    host.update(inp, yaw, TICK);
  }

  const beforeErr = pred.movement.position.distanceTo(host.position);
  assert(beforeErr > 0.2,
    `divergence should be visible pre-reconcile, got ${beforeErr.toFixed(4)}`);

  pred.reconcile({ ackSeq: ACK, tick: ACK, ...ackedState });

  // The client replayed the same inputs the host did, from the same state, so
  // it must now be exactly on the host's position.
  const afterErr = pred.movement.position.distanceTo(host.position);
  assert(afterErr < 1e-9,
    `expected convergence to ~0, got ${afterErr.toExponential(3)} (was ${beforeErr.toFixed(4)})`);

  // And the reported misprediction magnitude should be the real one.
  assert(pred.lastError > 0.2 && pred.lastError < 1.0,
    `lastError should report the real misprediction, got ${pred.lastError}`);
});

check('a small correction is smoothed, not snapped', () => {
  const pred = new PredictedPlayer(world(), V(0, 1, 0));
  const host = new PlayerMovement(world(), V(0, 1, 0));
  for (let i = 0; i < 60; i++) {
    const inp = scriptedInput(i), yaw = 0;
    pred.applyInput(inp, yaw);
    host.update(inp, yaw, TICK);
  }
  const rendered = pred.renderPosition.clone();
  host.position.x += 0.1; // well under SMOOTH_CORRECTION_MAX
  pred.reconcile({ ackSeq: 60, tick: 60, ...stateOf(host) });

  assert(pred.snapCount === 0, 'small correction must not snap');
  const jump = rendered.distanceTo(pred.renderPosition);
  assert(jump < 1e-9,
    `rendered position must not move on a smoothed correction, jumped ${jump}`);
  assert(pred.correctionOffset.length() > 0.05,
    'correction should be held as a visual offset');

  // And it must actually decay to nothing.
  for (let i = 0; i < 120; i++) pred.updateSmoothing(1 / 60);
  assert(pred.correctionOffset.length() === 0,
    `offset should reach exactly zero, got ${pred.correctionOffset.length()}`);
});

check('a large correction snaps immediately', () => {
  const pred = new PredictedPlayer(world(), V(0, 1, 0));
  const host = new PlayerMovement(world(), V(0, 1, 0));
  for (let i = 0; i < 60; i++) { pred.applyInput(scriptedInput(i), 0); host.update(scriptedInput(i), 0, TICK); }

  host.position.x += SNAP_CORRECTION_MIN + 5; // a teleport
  pred.reconcile({ ackSeq: 60, tick: 60, ...stateOf(host) });

  assert(pred.snapCount === 1, `expected one snap, got ${pred.snapCount}`);
  assert(pred.correctionOffset.length() === 0, 'snap must leave no smoothing offset');
  const err = pred.renderPosition.distanceTo(pred.movement.position);
  assert(err === 0, 'render position must equal the authoritative position after a snap');
});

check('correction thresholds are ordered and the mid band is partially absorbed', () => {
  assert(SMOOTH_CORRECTION_MAX < SNAP_CORRECTION_MIN, 'thresholds inverted');
  const pred = new PredictedPlayer(world(), V(0, 1, 0));
  const host = new PlayerMovement(world(), V(0, 1, 0));
  for (let i = 0; i < 60; i++) { pred.applyInput(scriptedInput(i), 0); host.update(scriptedInput(i), 0, TICK); }

  const mid = (SMOOTH_CORRECTION_MAX + SNAP_CORRECTION_MIN) / 2;
  host.position.x += mid;
  pred.reconcile({ ackSeq: 60, tick: 60, ...stateOf(host) });
  assert(pred.snapCount === 0, 'mid-band should not snap');
  const off = pred.correctionOffset.length();
  assert(off > 1e-6 && off <= SMOOTH_CORRECTION_MAX + 1e-6,
    `mid-band offset should be capped at the smooth max, got ${off}`);
});

check('acked inputs are dropped and stale/duplicate snapshots are ignored', () => {
  const pred = new PredictedPlayer(world(), V(0, 1, 0));
  const host = new PlayerMovement(world(), V(0, 1, 0));
  for (let i = 0; i < 100; i++) { pred.applyInput(scriptedInput(i), 0); host.update(scriptedInput(i), 0, TICK); }
  const snap = { ackSeq: 60, tick: 60, ...stateOf(host) };

  assert(pred.reconcile(snap) === true, 'first apply should succeed');
  assert(pred.count === 40, `expected 40 pending inputs, got ${pred.count}`);
  const after = pred.movement.position.clone();

  assert(pred.reconcile(snap) === false, 'duplicate snapshot must be rejected');
  assert(pred.reconcile({ ...snap, ackSeq: 30 }) === false, 'stale snapshot must be rejected');
  assert(after.equals(pred.movement.position), 'rejected snapshots must not move the player');
});

check('non-finite snapshots are rejected and never reach the transform', () => {
  const pred = new PredictedPlayer(world(), V(0, 1, 0));
  for (let i = 0; i < 30; i++) pred.applyInput(scriptedInput(i), 0);
  const good = pred.movement.position.clone();

  const bad = [
    { ackSeq: 10, position: { x: NaN, y: 1, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, height: 1.37 },
    { ackSeq: 11, position: { x: 0, y: Infinity, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, height: 1.37 },
    { ackSeq: 12, position: { x: 0, y: 1, z: 0 }, velocity: { x: NaN, y: 0, z: 0 }, height: 1.37 },
    { ackSeq: 13, position: { x: 0, y: 1, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, height: NaN },
    { ackSeq: NaN, position: { x: 0, y: 1, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, height: 1.37 },
    null, undefined,
  ];
  for (const b of bad) assert(pred.reconcile(b) === false, `should reject ${JSON.stringify(b)}`);
  assert(good.equals(pred.movement.position), 'rejected garbage moved the player');

  // A non-finite yaw must be clamped at the input boundary too.
  pred.applyInput(scriptedInput(0), NaN);
  const p = pred.movement.position;
  assert(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z),
    `NaN yaw poisoned position: ${p.toArray()}`);
  const r = pred.renderPosition;
  assert(Number.isFinite(r.x) && Number.isFinite(r.y) && Number.isFinite(r.z),
    'NaN reached renderPosition');
});

check('debugStats exposes a finite misprediction magnitude', () => {
  const pred = new PredictedPlayer(world(), V(0, 1, 0));
  const host = new PlayerMovement(world(), V(0, 1, 0));
  for (let i = 0; i < 80; i++) { pred.applyInput(scriptedInput(i), 0); host.update(scriptedInput(i), 0, TICK); }
  host.position.z += 0.25;
  pred.reconcile({ ackSeq: 50, tick: 50, ...stateOf(host) });

  const s = pred.debugStats;
  for (const [k, v] of Object.entries(s)) {
    assert(typeof v === 'number' && Number.isFinite(v), `debugStats.${k} = ${v}`);
  }
  assert(s.error > 0.1, `expected a reported error, got ${s.error}`);
  assert(s.replayed === 30, `expected 30 replayed, got ${s.replayed}`);
});

// =====================================================================
// Entity interpolation
// =====================================================================

/** Constant-velocity snapshot track for a remote player. */
function track(i, { rate = 20, speed = 4, yaw = 0 } = {}) {
  const t = i / rate;
  return {
    id: 'r1', tick: i, time: t,
    position: { x: speed * t, y: 1, z: 0 },
    yaw, pitch: 0, crouching: false, grounded: true, health: 100,
  };
}

check('interpolation renders the PAST position, not the latest one', () => {
  const rep = new RemoteReplication();
  const SPEED = 4, RATE = 20;

  // Feed 2 seconds of snapshots.
  for (let i = 0; i <= 40; i++) rep.ingest(track(i, { rate: RATE, speed: SPEED }));

  // Drive the clock to exactly the newest snapshot's time.
  rep.hostClock = 40 / RATE; // 2.0s
  rep.update(0);

  const s = rep.sample('r1');
  assert(s !== null, 'no state produced');

  // Rendered at 2.0 - 0.1 = 1.9s => x = 4 * 1.9 = 7.6, NOT 8.0.
  const expected = SPEED * (2.0 - INTERP_DELAY);
  assert(Math.abs(s.position.x - expected) < 1e-9,
    `expected past position x=${expected}, got ${s.position.x}`);

  const latest = SPEED * 2.0;
  assert(Math.abs(s.position.x - latest) > 0.3,
    'rendering the latest snapshot instead of the interpolated past');

  // Derived velocity must match the real motion so animation matches translation.
  assert(Math.abs(s.velocity.x - SPEED) < 1e-6,
    `derived velocity ${s.velocity.x}, expected ${SPEED}`);
  assert(Math.abs(s.speed - SPEED) < 1e-6, `speed ${s.speed}`);
  assert(s.extrapolated === false, 'should be a true interpolation, not extrapolation');
});

check('interpolation lands between the two bracketing snapshots at a mid time', () => {
  const rep = new RemoteReplication();
  const SPEED = 4, RATE = 20;
  for (let i = 0; i <= 40; i++) rep.ingest(track(i, { rate: RATE, speed: SPEED }));

  // Choose a host time whose render cursor falls mid-segment: renderTime 1.425s
  // sits between snapshots 28 (1.40s) and 29 (1.45s), t = 0.5.
  rep.hostClock = 1.425 + INTERP_DELAY;
  rep.update(0);
  const s = rep.sample('r1');
  const expected = SPEED * 1.425;
  assert(Math.abs(s.position.x - expected) < 1e-9,
    `mid-segment expected x=${expected}, got ${s.position.x}`);
  // And strictly between the bracketing snapshot positions.
  assert(s.position.x > SPEED * 1.40 && s.position.x < SPEED * 1.45,
    'not between the bracketing snapshots');
});

check('yaw interpolates the short way across the PI wrap', () => {
  const rep = new RemoteReplication();
  rep.ingest({ id: 'y', tick: 0, time: 0, position: { x: 0, y: 1, z: 0 }, yaw: Math.PI - 0.1, pitch: 0 });
  rep.ingest({ id: 'y', tick: 1, time: 1, position: { x: 0, y: 1, z: 0 }, yaw: -Math.PI + 0.1, pitch: 0 });
  rep.hostClock = 0.5 + INTERP_DELAY;
  rep.update(0);
  const s = rep.sample('y');
  // Halfway the short way round is exactly +PI (or -PI); certainly not ~0.
  assert(Math.abs(Math.abs(s.yaw) - Math.PI) < 1e-9,
    `expected |yaw| ~ PI, got ${s.yaw} (interpolated the long way)`);
});

check('out-of-order snapshots do not corrupt state', () => {
  const inOrder = new RemoteReplication();
  const shuffled = new RemoteReplication();
  const SPEED = 4, RATE = 20;

  const snaps = [];
  for (let i = 0; i <= 40; i++) snaps.push(track(i, { rate: RATE, speed: SPEED }));

  for (const s of snaps) inOrder.ingest(s);

  // Deterministic shuffle: reverse in blocks of 5, which guarantees every
  // insertion lands before something already buffered.
  for (let b = 0; b < snaps.length; b += 5) {
    const block = snaps.slice(b, b + 5).reverse();
    for (const s of block) shuffled.ingest(s);
  }

  for (const rep of [inOrder, shuffled]) { rep.hostClock = 2.0; rep.update(0); }
  const a = inOrder.sample('r1'), b = shuffled.sample('r1');

  assert(Math.abs(a.position.x - b.position.x) < 1e-12,
    `reordering changed the result: ${a.position.x} vs ${b.position.x}`);
  const expected = SPEED * (2.0 - INTERP_DELAY);
  assert(Math.abs(b.position.x - expected) < 1e-9,
    `shuffled stream rendered x=${b.position.x}, expected ${expected}`);
});

check('duplicate snapshots are rejected and change nothing', () => {
  const rep = new RemoteReplication();
  for (let i = 0; i <= 20; i++) rep.ingest(track(i));
  rep.hostClock = 1.0; rep.update(0);
  const before = rep.sample('r1').position.clone();
  const buffered = rep.debugStats.buffered;

  // Redeliver every snapshot, plus a triple of one still in the buffer.
  //
  // Not every redelivery is *rejected*: prune() evicts history well behind the
  // render cursor, so a re-sent ancient snapshot can legitimately be re-admitted
  // as new. That is harmless — it lands behind the cursor and is pruned again.
  // The property that actually matters is that redelivery never duplicates an
  // entry the buffer still holds, and never moves the rendered body. Assert
  // that, not a redelivery count that just encodes the prune window.
  const live = rep.players.get('r1').buffer.map((s) => s.time);
  for (let i = 0; i <= 20; i++) rep.ingest(track(i));
  for (let k = 0; k < 3; k++) {
    assert(rep.ingest(track(10)) === false,
      'a snapshot still in the buffer must be rejected as a duplicate');
  }

  // No time appears twice: a duplicated entry would create a zero-length
  // interpolation segment and divide by zero.
  const times = rep.players.get('r1').buffer.map((s) => s.time);
  assert(new Set(times).size === times.length,
    `duplicate times entered the buffer: ${times}`);
  for (const t of live) {
    assert(times.filter((x) => x === t).length === 1,
      `previously-buffered snapshot t=${t} was duplicated`);
  }

  rep.update(0);
  const after = rep.sample('r1').position;
  assert(Math.abs(after.x - before.x) < 1e-9 && Math.abs(after.z - before.z) < 1e-9,
    `duplicates moved the player: ${before.x} -> ${after.x}`);
  assert(buffered > 0, 'buffer should have held snapshots');

  // Two snapshots at the SAME time but different ticks. Only the time-equality
  // check can reject this, so it isolates that guard specifically — a
  // tick-based check alone would let it through and create a zero-length
  // segment, which is a divide-by-zero in the interpolation t.
  const rep2 = new RemoteReplication();
  assert(rep2.ingest({ id: 'd', tick: 1, time: 0.5, position: { x: 0, y: 1, z: 0 }, yaw: 0, pitch: 0 }) === true,
    'first same-time insert should be accepted');
  assert(rep2.ingest({ id: 'd', tick: 2, time: 0.5, position: { x: 99, y: 1, z: 0 }, yaw: 0, pitch: 0 }) === false,
    'a second snapshot at an identical time must be rejected regardless of tick');
  assert(rep2.players.get('d').buffer.length === 1,
    'same-time snapshot entered the buffer and created a zero-length segment');
});

check('a snapshot arriving after its render time does not rewind the body', () => {
  const rep = new RemoteReplication();
  for (let i = 0; i <= 30; i++) rep.ingest(track(i));
  rep.hostClock = 1.5; rep.update(0);
  const x1 = rep.sample('r1').position.x;

  // A very late duplicate-time-adjacent snapshot from the past turns up.
  rep.ingest({ id: 'r1', tick: 999, time: 0.31, position: { x: -50, y: 1, z: 0 }, yaw: 0, pitch: 0 });
  rep.update(0);
  const x2 = rep.sample('r1').position.x;
  assert(x2 >= x1 - 1e-9, `body rewound: ${x1} -> ${x2}`);
  assert(Number.isFinite(x2), 'late snapshot produced non-finite position');
});

check('30% packet loss keeps motion continuous, monotonic and bounded', () => {
  const rep = new RemoteReplication();
  const SPEED = 4, RATE = 20, N = 200;

  // Deterministic 30% drop: a fixed LCG, no Math.random, so a failure is
  // reproducible rather than flaky.
  let seed = 12345;
  const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

  let dropped = 0;
  const snaps = [];
  for (let i = 0; i <= N; i++) {
    if (rand() < 0.3) { dropped++; continue; }
    snaps.push(track(i, { rate: RATE, speed: SPEED }));
  }
  assert(dropped > N * 0.2 && dropped < N * 0.4,
    `expected ~30% loss, dropped ${dropped}/${N}`);

  // Deliver progressively, sampling at render rate, as it would happen live.
  const FRAME = 1 / 60;
  let next = 0;
  let prevX = -Infinity;
  let maxStep = 0;
  let samples = 0;
  const stepLog = [];

  rep.hostClock = 0;
  for (let f = 0; f * FRAME <= N / RATE; f++) {
    const now = f * FRAME;
    while (next < snaps.length && snaps[next].time <= now) rep.ingest(snaps[next++]);
    rep.hostClock = now;
    rep.update(0);
    const s = rep.sample('r1');
    if (!s) continue;

    assert(Number.isFinite(s.position.x) && Number.isFinite(s.position.y) &&
           Number.isFinite(s.position.z), `NaN position at t=${now}`);
    assert(Number.isFinite(s.velocity.x) && Number.isFinite(s.speed) &&
           Number.isFinite(s.yaw) && Number.isFinite(s.stance),
      `NaN in derived animation values at t=${now}`);

    if (prevX > -Infinity) {
      const step = s.position.x - prevX;
      // Constant forward motion: never goes backwards.
      assert(step >= -1e-9, `motion reversed at t=${now}: step ${step}`);
      maxStep = Math.max(maxStep, step);
      stepLog.push(step);
    }
    prevX = s.position.x;
    samples++;
  }

  assert(samples > 100, `too few samples (${samples})`);
  // A frame of true motion is SPEED*FRAME = 0.067m, but 30% loss produces runs
  // of consecutive drops — the worst gap in this stream is 250ms, which a 100ms
  // interpolation buffer physically cannot bridge. The buffer starves, freezes,
  // and then has to catch up. So the guarantee is NOT "every step is one frame
  // of motion"; it is that catch-up is rate-limited to MAX_CATCHUP_STEP and
  // never becomes an unbounded teleport.
  assert(maxStep <= MAX_CATCHUP_STEP + 1e-9,
    `catch-up exceeded its cap: max step ${maxStep.toFixed(4)}m > ${MAX_CATCHUP_STEP}m`);
  // Steps at the cap must be rare — they only occur while recovering from a
  // starved buffer, not during ordinary interpolation.
  const cappedFrames = stepLog.filter((v) => v > SPEED * FRAME * 1.5).length;
  assert(cappedFrames < samples * 0.15,
    `catch-up engaged on ${cappedFrames}/${samples} frames — buffer is starving constantly`);
  // And it must actually have travelled roughly the right distance overall.
  const travelled = prevX;
  assert(travelled > SPEED * (N / RATE) * 0.8,
    `lost too much ground under loss: travelled ${travelled.toFixed(2)}m`);
});

check('a delayed burst of retransmitted snapshots does not corrupt or teleport', () => {
  // The realistic failure mode on this channel. PeerJS {reliable:false} is
  // unordered but STILL retransmits, so packets are rarely lost outright —
  // instead a stall delivers a clump of stale snapshots all at once, out of
  // order. Rendering must absorb that without jumping or reversing.
  const rep = new RemoteReplication();
  const SPEED = 4, RATE = 20, FRAME = 1 / 60;

  const snaps = [];
  for (let i = 0; i <= 120; i++) snaps.push(track(i, { rate: RATE, speed: SPEED }));

  // Ticks 40..64 stall, then arrive together (reversed) at the time tick 64
  // would have been delivered.
  const STALL_FROM = 40, STALL_TO = 64;
  const burstAt = STALL_TO / RATE;
  const delivery = new Map(); // delivery time -> snapshots
  for (const s of snaps) {
    const inStall = s.tick >= STALL_FROM && s.tick <= STALL_TO;
    const at = inStall ? burstAt : s.time;
    if (!delivery.has(at)) delivery.set(at, []);
    delivery.get(at).push(s);
  }
  // The burst arrives reversed — worst-case ordering.
  delivery.get(burstAt).sort((a, b) => b.tick - a.tick);

  const times = [...delivery.keys()].sort((a, b) => a - b);
  let next = 0, prevX = -Infinity, maxStep = 0, samples = 0, sawBurst = false;

  for (let f = 0; f * FRAME <= 120 / RATE; f++) {
    const now = f * FRAME;
    while (next < times.length && times[next] <= now) {
      const batch = delivery.get(times[next++]);
      if (batch.length > 1) sawBurst = true;
      for (const s of batch) rep.ingest(s);
    }
    rep.hostClock = now;
    rep.update(0);
    const s = rep.sample('r1');
    if (!s) continue;

    assert(Number.isFinite(s.position.x) && Number.isFinite(s.speed),
      `non-finite output at t=${now}`);
    if (prevX > -Infinity) {
      const step = s.position.x - prevX;
      assert(step >= -1e-9, `burst caused motion to reverse at t=${now}: ${step}`);
      maxStep = Math.max(maxStep, step);
    }
    prevX = s.position.x;
    samples++;
  }

  assert(sawBurst, 'test did not actually deliver a burst');
  assert(samples > 100, `too few samples (${samples})`);
  assert(maxStep <= MAX_CATCHUP_STEP + 1e-9,
    `delayed burst teleported: ${maxStep.toFixed(4)}m`);
  // Once the burst lands, the buffer is whole again, so the run must finish on
  // the correct interpolated position rather than somewhere behind.
  const expected = SPEED * (120 / RATE - INTERP_DELAY);
  assert(Math.abs(prevX - expected) < 0.3,
    `after the burst resolved, expected ~${expected.toFixed(2)}m, got ${prevX.toFixed(2)}m`);
});

check('tick numbers that wrap do not corrupt ordering', () => {
  // Ticks are masked on the wire and wrap. Ordering is keyed on `time`, so a
  // wrap mid-stream must be a non-event.
  const rep = new RemoteReplication();
  const MASK = 0xffff;
  for (let i = 0; i <= 20; i++) {
    rep.ingest({
      id: 'w',
      tick: (MASK - 8 + i) & MASK, // wraps through 0 partway through
      time: i / 20,
      position: { x: 4 * (i / 20), y: 1, z: 0 },
      yaw: 0, pitch: 0,
    });
  }
  rep.hostClock = 1.0;
  rep.update(0);
  const s = rep.sample('w');
  const expected = 4 * (1.0 - INTERP_DELAY);
  assert(Math.abs(s.position.x - expected) < 1e-9,
    `tick wrap broke interpolation: expected ${expected}, got ${s.position.x}`);
  assert(rep.players.get('w').buffer.length > 1, 'buffer collapsed across the wrap');
});

check('extrapolation is off by default and freezes on a starved buffer', () => {
  const rep = new RemoteReplication();
  const SPEED = 4, RATE = 20;
  for (let i = 0; i <= 20; i++) rep.ingest(track(i, { rate: RATE, speed: SPEED }));

  // Push the clock far past the newest snapshot (1.0s): nothing ahead.
  rep.hostClock = 1.0 + INTERP_DELAY + 0.5;
  rep.update(0);
  const s = rep.sample('r1');
  assert(s.extrapolated === false, 'default must not extrapolate');
  assert(Math.abs(s.position.x - SPEED * 1.0) < 1e-9,
    `should freeze on the newest state x=${SPEED * 1.0}, got ${s.position.x}`);
});

check('extrapolation, when enabled, is capped hard', () => {
  const rep = new RemoteReplication({ allowExtrapolation: true });
  const SPEED = 4, RATE = 20;
  for (let i = 0; i <= 20; i++) rep.ingest(track(i, { rate: RATE, speed: SPEED }));

  // Ask for a full second past the newest snapshot.
  rep.hostClock = 1.0 + INTERP_DELAY + 1.0;
  rep.update(0);
  const s = rep.sample('r1');
  assert(s.extrapolated === true, 'expected extrapolation');

  const frozen = SPEED * 1.0;
  const capped = frozen + SPEED * MAX_EXTRAPOLATION;
  assert(Math.abs(s.position.x - capped) < 1e-6,
    `expected the cap at x=${capped}, got ${s.position.x}`);
  assert(s.position.x <= capped + 1e-9,
    'extrapolation ran past MAX_EXTRAPOLATION');
});

check('malformed snapshots never reach a transform', () => {
  const rep = new RemoteReplication();
  const bad = [
    { id: 'b', tick: 0, time: NaN, position: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 },
    { id: 'b', tick: 1, time: 1, position: { x: NaN, y: 0, z: 0 }, yaw: 0, pitch: 0 },
    { id: 'b', tick: 2, time: 2, position: { x: 0, y: Infinity, z: 0 }, yaw: 0, pitch: 0 },
    { id: 'b', tick: 3, time: 3, position: { x: 0, y: 0, z: 0 }, yaw: NaN, pitch: 0 },
    { id: 'b', tick: 4, time: 4, position: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: Infinity },
    { id: 'b', tick: 5, time: 5, position: null, yaw: 0, pitch: 0 },
    null,
  ];
  for (const s of bad) assert(rep.ingest(s) === false, `should reject ${JSON.stringify(s)}`);
  assert(rep.sample('b') === null, 'a rejected-only player must produce no state');

  // A valid stream mixed with garbage still yields finite output.
  for (let i = 0; i <= 20; i++) { rep.ingest(track(i)); rep.ingest(bad[1]); }
  rep.hostClock = 1.0; rep.update(0);
  const s = rep.sample('r1');
  for (const k of ['x', 'y', 'z']) {
    assert(Number.isFinite(s.position[k]), `position.${k} not finite`);
    assert(Number.isFinite(s.velocity[k]), `velocity.${k} not finite`);
  }
});

check('remote render struct exposes every documented animation field', () => {
  const rep = new RemoteReplication();
  for (let i = 0; i <= 20; i++) {
    rep.ingest({
      ...track(i, { speed: 3, yaw: 0.5 }),
      crouching: i > 10, height: i > 10 ? 0.97 : 1.37,
      grounded: true, health: 87, firing: i % 4 === 0, weaponId: 2,
    });
  }
  rep.hostClock = 1.0; rep.update(0);
  const s = rep.sample('r1');

  const numeric = ['yaw', 'pitch', 'speed', 'moveDir', 'height', 'stance',
    'verticalSpeed', 'health'];
  for (const k of numeric) {
    assert(typeof s[k] === 'number' && Number.isFinite(s[k]), `${k} = ${s[k]}`);
  }
  for (const k of ['crouching', 'grounded', 'firing', 'stale', 'extrapolated']) {
    assert(typeof s[k] === 'boolean', `${k} should be boolean, got ${typeof s[k]}`);
  }
  assert(s.position instanceof THREE.Vector3, 'position must be a Vector3');
  assert(s.velocity instanceof THREE.Vector3, 'velocity must be a Vector3');
  assert(s.id === 'r1', 'id missing');
  assert(typeof s.weaponId === 'number', 'weaponId missing');
  assert(s.stance >= 0 && s.stance <= 1, `stance out of [0,1]: ${s.stance}`);
  assert(s.stale === false, 'a live stream should not be stale');
  // Crouched at render time (renderTime 0.9s => snapshot 18, crouching).
  assert(s.crouching === true, 'crouch state not tracked');
  assert(Math.abs(s.stance - 1) < 1e-6, `crouched stance should be 1, got ${s.stance}`);
});

check('stance blends smoothly through a crouch transition', () => {
  const rep = new RemoteReplication();
  // Height steps down over three snapshots so the blend has something to lerp.
  const heights = [1.37, 1.37, 1.17, 0.97, 0.97];
  for (let i = 0; i < heights.length; i++) {
    rep.ingest({
      id: 'c', tick: i, time: i * 0.05,
      position: { x: 0, y: 1, z: 0 }, yaw: 0, pitch: 0,
      height: heights[i], crouching: heights[i] < 1.2,
    });
  }
  // renderTime 0.125s sits between snapshot 2 (1.17) and 3 (0.97), t=0.5.
  rep.hostClock = 0.125 + INTERP_DELAY;
  rep.update(0);
  const s = rep.sample('c');
  assert(Math.abs(s.height - 1.07) < 1e-9, `expected height 1.07, got ${s.height}`);
  assert(s.stance > 0.4 && s.stance < 0.9, `stance should be mid-blend, got ${s.stance}`);
});

check('multiple remote players stay independent', () => {
  const rep = new RemoteReplication();
  for (let i = 0; i <= 20; i++) {
    rep.ingest({ ...track(i, { speed: 4 }), id: 'a' });
    rep.ingest({ ...track(i, { speed: -2 }), id: 'b' });
  }
  rep.hostClock = 1.0; rep.update(0);
  const all = rep.sampleAll();
  assert(all.length === 2, `expected 2 players, got ${all.length}`);
  const a = all.find((s) => s.id === 'a'), b = all.find((s) => s.id === 'b');
  const rt = 1.0 - INTERP_DELAY;
  assert(Math.abs(a.position.x - 4 * rt) < 1e-9, `a at ${a.position.x}`);
  assert(Math.abs(b.position.x - -2 * rt) < 1e-9, `b at ${b.position.x}`);
});

check('toModelState converts feet position and yaw convention correctly', () => {
  // remoteplayer.js roots the model at the FEET and encodes yaw as atan2(x, z)
  // with 0 facing +Z. This module reports the capsule CENTRE with the engine's
  // yaw (0 facing -Z). Both conversions are silent-wrong-answer hazards, so
  // they are pinned numerically here.
  const rep = new RemoteReplication();
  const YAW = 0.7, HEIGHT = 1.37;
  for (let i = 0; i <= 20; i++) {
    rep.ingest({
      id: 'm', tick: i, time: i / 20,
      position: { x: 0, y: 5, z: 0 },
      yaw: YAW, pitch: 0.2, height: HEIGHT, crouching: false, health: 90,
    });
  }
  rep.hostClock = 1.0;
  rep.update(0);
  const s = rep.sample('m');
  const m = RemoteReplication.toModelState(s);

  assert(Math.abs(m.position.y - (5 - HEIGHT / 2)) < 1e-9,
    `feet should be centre - height/2, got ${m.position.y}`);

  // The converted yaw must describe the SAME world heading as the engine yaw.
  const fwd = { x: -Math.sin(YAW), z: -Math.cos(YAW) };  // engine forward
  const rebuilt = Math.atan2(fwd.x, fwd.z);              // in the model's encoding
  assert(Math.abs(m.yaw - rebuilt) < 1e-9,
    `yaw convention wrong: ${m.yaw} vs ${rebuilt}`);
  assert(m.alive === true && Math.abs(m.pitch - 0.2) < 1e-9, 'passthrough fields lost');

  // Crouching must keep the feet on the floor, not sink the model.
  const rep2 = new RemoteReplication();
  for (let i = 0; i <= 20; i++) {
    rep2.ingest({
      id: 'c2', tick: i, time: i / 20,
      position: { x: 0, y: 0.485, z: 0 }, // centre of a 0.97 capsule, feet at 0
      yaw: 0, pitch: 0, height: 0.97, crouching: true,
    });
  }
  rep2.hostClock = 1.0; rep2.update(0);
  const mc = RemoteReplication.toModelState(rep2.sample('c2'));
  assert(Math.abs(mc.position.y) < 1e-9,
    `crouched feet should stay at y=0, got ${mc.position.y}`);
});

check('a silent player goes stale rather than standing there forever', () => {
  const rep = new RemoteReplication();
  for (let i = 0; i <= 10; i++) rep.ingest(track(i));
  rep.hostClock = 0.5; rep.update(0);
  assert(rep.sample('r1').stale === false, 'should be live');
  rep.hostClock = 10; rep.update(0);
  assert(rep.sample('r1').stale === true, 'should have gone stale');
  assert(rep.staleIds().includes('r1'), 'staleIds should list the silent player');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
