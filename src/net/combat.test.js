// Headless tests for host-authoritative combat. Run: node src/net/combat.test.js
//
// These tests drive the REAL CombatHost through its real entry points and
// compare damage against the REAL damageAt/damageForHit. They deliberately do
// NOT restate expected numbers: this project has already shipped a false
// "fixed" claim from a test that asserted a function's authored intent instead
// of the solver's actual output, and hardcoding 36*4 here would reproduce that
// failure mode the moment RIFLE.damage changes.
//
// console.assert does not throw and would let every one of these "pass" while
// broken. Everything below throws.

import {
  CombatHost, SnapshotHistory, raycastPlayerHitbox,
  TICK_RATE, TICK_DURATION, MAX_REWIND_TICKS, MAX_FUTURE_TICKS,
  MAX_HEALTH, RESPAWN_DELAY, Reject,
} from './combat.js';
import { TICK_MASK } from './protocol.js';
import { RIFLE, damageAt } from '../weapons/rifle.js';
import { damageForHit, HITBOX_MULT } from '../ai/bot.js';

let passed = 0, failed = 0;
const failures = [];

function test(name, fn) {
  try { fn(); passed++; console.log(`  ok    ${name}`); }
  catch (e) {
    failed++;
    failures.push(`${name}: ${e.message}`);
    console.log(`  FAIL  ${name}\n        ${e.message}`);
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function close(a, b, eps, msg) {
  if (!(Math.abs(a - b) <= eps)) {
    throw new Error(`${msg || 'not close'}: ${a} vs ${b} (eps ${eps})`);
  }
}

const V = (x, y, z) => ({ x, y, z });
const norm = (v) => {
  const l = Math.hypot(v.x, v.y, v.z);
  return { x: v.x / l, y: v.y / l, z: v.z / l };
};

// Hitbox landmarks from bot.js, used only to AIM. The assertions never assume
// the boxes are where these say — they assert on what the raycast returns.
const Y_HEAD = 1.68, Y_CHEST = 1.36, Y_LEG = 0.55;

// ---------------------------------------------------------------------------
// Lag compensation — the whole point of the feature.
// ---------------------------------------------------------------------------

test('lag comp: shot at tick T hits the target THEN, and would MISS them NOW', () => {
  const host = new CombatHost();
  host.add('shooter');
  host.add('mover');

  // The mover strafes along +X at 4.6 m/s (MOVE.maxSpeed) past a shooter who
  // stands at the origin looking down -Z... actually along +X-crossing.
  // Geometry: shooter at (0,1.28,0) firing down +Z. Target crosses the +Z axis.
  const SPEED = 4.6;
  const shotTick = 10;
  const nowTick = shotTick + 16;  // 16 ticks = 125ms at 128Hz, inside the cap

  // Record history: the mover walks through x=0 exactly at shotTick.
  for (let t = 0; t <= nowTick; t++) {
    const x = (t - shotTick) * SPEED * TICK_DURATION;
    host.beginTick(t, [
      ['shooter', { position: V(0, 0, 0), yaw: 0 }],
      ['mover', { position: V(x, 0, 8), yaw: 0 }],
    ]);
  }

  // Aim dead at where the mover's chest was at shotTick: (0, 1.36, 8).
  const origin = V(0, 1.28, 0);
  const dir = norm(V(0, Y_CHEST - 1.28, 8));

  // --- Half one: with the rewind, this must HIT.
  const res = host.resolveShot({ shooterId: 'shooter', tick: shotTick, origin, direction: dir });
  assert(res.ok, `shot rejected: ${res.reason}`);
  assert(res.hits.length === 1, `expected exactly one hit, got ${res.hits.length}`);
  assert(res.hits[0].victimId === 'mover', 'wrong victim');

  // --- Half two: the SAME ray against the target's CURRENT position must miss.
  // This is the assertion that proves the rewind did something. Without it the
  // test would still pass on a build that ignored `tick` entirely.
  const nowState = host.history.at(nowTick).players.get('mover');
  const travelled = Math.abs(nowState.position.x);
  assert(travelled > 0.5,
    `target must actually have moved clear of its old position, moved ${travelled}m`);
  const missNow = raycastPlayerHitbox(nowState, origin, dir, RIFLE.maxRange);
  assert(missNow === null,
    `the same ray against the CURRENT position should miss, but hit ${missNow && missNow.part}`);

  // And the converse, so the geometry is not accidentally degenerate: the ray
  // DOES hit the rewound state when tested directly.
  const thenState = host.history.at(shotTick).players.get('mover');
  const hitThen = raycastPlayerHitbox(thenState, origin, dir, RIFLE.maxRange);
  assert(hitThen !== null, 'the rewound state must be hittable by the same ray');
});

test('lag comp: without rewinding (claiming the current tick) the same shot misses', () => {
  // The mirror of the test above through the real resolveShot path: the shooter
  // aims at the OLD position but claims the CURRENT tick, so the host tests
  // against the current position and finds nothing.
  const host = new CombatHost();
  host.add('shooter');
  host.add('mover');
  // 16 ticks at 128Hz is 125ms, which at 4.6 m/s moves the target ~0.58m —
  // comfortably clear of the 0.235m chest sphere. Eight ticks would only be
  // 0.29m and the ray would still clip the target, which is a test that proves
  // nothing rather than a bug in the rewind.
  const SPEED = 4.6, shotTick = 10, nowTick = 26;
  for (let t = 0; t <= nowTick; t++) {
    host.beginTick(t, [
      ['shooter', { position: V(0, 0, 0), yaw: 0 }],
      ['mover', { position: V((t - shotTick) * SPEED * TICK_DURATION, 0, 8), yaw: 0 }],
    ]);
  }
  const origin = V(0, 1.28, 0);
  const dir = norm(V(0, Y_CHEST - 1.28, 8));
  const res = host.resolveShot({ shooterId: 'shooter', tick: nowTick, origin, direction: dir });
  assert(res.ok, `shot should be accepted, got ${res.reason}`);
  assert(res.hits.length === 0,
    'aiming at the stale position while claiming the current tick must miss');
});

test('lag comp: rewound hit actually reduces the victim health', () => {
  const host = new CombatHost();
  host.add('shooter');
  const victim = host.add('mover');
  const shotTick = 5, nowTick = 12;
  for (let t = 0; t <= nowTick; t++) {
    host.beginTick(t, [
      ['shooter', { position: V(0, 0, 0), yaw: 0 }],
      ['mover', { position: V((t - shotTick) * 4.6 * TICK_DURATION, 0, 8), yaw: 0 }],
    ]);
  }
  const before = victim.health;
  const res = host.resolveShot({
    shooterId: 'shooter', tick: shotTick,
    origin: V(0, 1.28, 0), direction: norm(V(0, Y_CHEST - 1.28, 8)),
  });
  assert(res.ok && res.hits.length === 1, 'expected a hit');
  assert(victim.health < before, 'health must drop');
  close(victim.health, before - res.hits[0].damage, 1e-9, 'health must drop by exactly the damage');
});

// ---------------------------------------------------------------------------
// Rewind cap
// ---------------------------------------------------------------------------

test('rewind cap: a shot claiming an ancient tick is rejected', () => {
  const host = new CombatHost();
  host.add('shooter');
  host.add('target');
  const ancient = 1;
  const now = ancient + MAX_REWIND_TICKS + 1;   // one tick past the cap
  for (let t = 0; t <= now; t++) {
    host.beginTick(t, [
      ['shooter', { position: V(0, 0, 0), yaw: 0 }],
      ['target', { position: V(0, 0, 8), yaw: 0 }],
    ]);
  }
  const res = host.resolveShot({
    shooterId: 'shooter', tick: ancient,
    origin: V(0, 1.28, 0), direction: norm(V(0, Y_CHEST - 1.28, 8)),
  });
  assert(!res.ok, 'an out-of-window tick must be rejected outright');
  assert(res.reason === Reject.TICK_TOO_OLD, `wrong reason: ${res.reason}`);
});

test('rewind cap: a tick exactly at the boundary is still accepted', () => {
  // The cap must be inclusive at the edge, or the last honest connection in the
  // window is punished by an off-by-one.
  const host = new CombatHost();
  host.add('shooter');
  host.add('target');
  const now = MAX_REWIND_TICKS + 5;
  const edge = now - MAX_REWIND_TICKS;
  for (let t = 0; t <= now; t++) {
    host.beginTick(t, [
      ['shooter', { position: V(0, 0, 0), yaw: 0 }],
      ['target', { position: V(0, 0, 8), yaw: 0 }],
    ]);
  }
  const res = host.resolveShot({
    shooterId: 'shooter', tick: edge,
    origin: V(0, 1.28, 0), direction: norm(V(0, Y_CHEST - 1.28, 8)),
  });
  assert(res.ok, `boundary tick should be accepted, got ${res.reason}`);
  assert(res.hits.length === 1, 'and should still resolve the hit');
});

test('rewind cap: an implausible FUTURE tick is rejected', () => {
  const host = new CombatHost();
  host.add('shooter');
  host.beginTick(20, [['shooter', { position: V(0, 0, 0), yaw: 0 }]]);
  const res = host.resolveShot({
    shooterId: 'shooter', tick: 20 + MAX_FUTURE_TICKS + 1,
    origin: V(0, 1.28, 0), direction: V(0, 0, 1),
  });
  assert(!res.ok && res.reason === Reject.TICK_FUTURE, `expected future reject, got ${res.reason}`);
});

test('rewind cap is a real bound, not an accident of buffer size', () => {
  assert(MAX_REWIND_TICKS > 0, 'cap must be positive');
  assert(MAX_REWIND_TICKS < TICK_RATE, 'a rewind of a full second would be a time machine');
});

// ---------------------------------------------------------------------------
// Tick wrap. Ticks are 16-bit and roll over every ~8.5 minutes at 128Hz. A raw
// `a - b` comparison here is an EXPLOIT, not a rounding nit, so both sides of
// the rollover get their own test.
// ---------------------------------------------------------------------------

test('tick wrap: a shot straddling the rollover is still accepted', () => {
  const host = new CombatHost();
  host.add('shooter');
  host.add('target');
  // Host has just wrapped past 0xffff; the shot was fired a few ticks BEFORE
  // the wrap. With a naive subtraction this looks ~65000 ticks old and gets
  // refused, so an honest player's shots die once every eight minutes.
  const shotTick = (TICK_MASK - 3) & TICK_MASK;
  const nowTick = 2;
  for (const t of [shotTick, nowTick]) {
    host.beginTick(t, [
      ['shooter', { position: V(0, 0, 0), yaw: 0 }],
      ['target', { position: V(0, 0, 8), yaw: 0 }],
    ]);
  }
  host.tick = nowTick;
  const r = host.resolveShot({
    shooterId: 'shooter', tick: shotTick,
    origin: V(0, 1.28, 0), direction: norm(V(0, Y_CHEST - 1.28, 8)),
  });
  assert(r.ok, `a shot across the wrap must be accepted, got ${r.reason}`);
  assert(r.hits.length === 1, 'and must still register on the rewound target');
});

test('tick wrap: a genuinely ancient tick is STILL rejected after a rollover', () => {
  // The dangerous direction. A client claims a tick that, under a naive
  // subtraction, would come out as a small positive age purely because of the
  // 16-bit wrap — handing it a 65000-tick time machine.
  const host = new CombatHost();
  host.add('shooter');
  host.add('target');
  const nowTick = 100;
  host.beginTick(nowTick, [
    ['shooter', { position: V(0, 0, 0), yaw: 0 }],
    ['target', { position: V(0, 0, 8), yaw: 0 }],
  ]);
  host.tick = nowTick;
  // Half the tick space away — unambiguously outside any honest window in
  // either direction.
  const ancient = (nowTick + 0x8000 + 500) & TICK_MASK;
  const r = host.resolveShot({
    shooterId: 'shooter', tick: ancient,
    origin: V(0, 1.28, 0), direction: norm(V(0, Y_CHEST - 1.28, 8)),
  });
  assert(!r.ok, 'a wrapped-around ancient tick must not be accepted');
  assert(r.reason === Reject.TICK_TOO_OLD || r.reason === Reject.TICK_FUTURE,
    `expected a tick rejection, got ${r.reason}`);
});

test('history: an out-of-order snapshot does not drag the timeline backwards', () => {
  // The snapshot channel is unordered, so a stale packet can land after a fresh
  // one. If that moved "newest" backwards, the rewind window would shrink under
  // every in-flight shot claim.
  const h = new SnapshotHistory();
  h.record(50, [['a', { position: V(0, 0, 50), yaw: 0 }]]);
  h.record(48, [['a', { position: V(0, 0, 48), yaw: 0 }]]);   // late arrival
  assert(h.newestTick === 50, `newest must stay 50, got ${h.newestTick}`);
  // Both are still individually addressable — the late one is usable history.
  assert(h.at(48) !== null, 'the late snapshot must still be recorded');
  assert(h.at(50) !== null, 'the newer snapshot must be untouched');
});

test('host clock only advances, even on an out-of-order beginTick', () => {
  const host = new CombatHost();
  host.add('a');
  host.beginTick(100, [['a', { position: V(0, 0, 0), yaw: 0 }]]);
  host.beginTick(97, [['a', { position: V(0, 0, 0), yaw: 0 }]]);
  assert(host.tick === 100, `host clock must not rewind, got ${host.tick}`);
});

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

test('rate limit: rejects a fire rate faster than the rifle can cycle', () => {
  const host = new CombatHost();
  host.add('cheater');
  host.add('target');
  const setup = (t) => host.beginTick(t, [
    ['cheater', { position: V(0, 0, 0), yaw: 0 }],
    ['target', { position: V(0, 0, 8), yaw: 0 }],
  ]);
  for (let t = 0; t <= 40; t++) setup(t);

  const fire = (tick) => host.resolveShot({
    shooterId: 'cheater', tick,
    origin: V(0, 1.28, 0), direction: norm(V(0, Y_CHEST - 1.28, 8)),
  });

  const first = fire(30);
  assert(first.ok, `first shot should be accepted: ${first.reason}`);

  // The rifle cycles at RIFLE.rpm. Firing on the very next tick is far faster.
  const cyclicTicks = (60 / RIFLE.rpm) * TICK_RATE;
  assert(cyclicTicks > 1.5, 'this test assumes the cyclic rate spans several ticks');
  const tooFast = fire(31);
  assert(!tooFast.ok, 'a next-tick shot must be rejected');
  assert(tooFast.reason === Reject.RATE_LIMIT, `wrong reason: ${tooFast.reason}`);
});

test('rate limit: accepts a legitimate cyclic-rate spray', () => {
  const host = new CombatHost();
  host.add('player');
  host.add('target');
  for (let t = 0; t <= 200; t++) {
    host.beginTick(t, [
      ['player', { position: V(0, 0, 0), yaw: 0 }],
      ['target', { position: V(0, 0, 30), yaw: 0 }],
    ]);
  }
  // Space the shots at the true cyclic interval, rounded UP to whole ticks the
  // way a real client's tick clock would. The host's own tick has to advance
  // alongside them, or the later shots fall outside the rewind window and get
  // refused for a reason that has nothing to do with the rate limit.
  const step = Math.ceil((60 / RIFLE.rpm) * TICK_RATE);
  let accepted = 0;
  const reasons = [];
  for (let i = 0; i < 8; i++) {
    const tick = 100 + i * step;
    host.tick = tick;                       // host is live at the claimed tick
    const r = host.resolveShot({
      shooterId: 'player', tick,
      origin: V(0, 1.28, 0), direction: V(0, 0, 1),
    });
    if (r.ok) accepted++; else reasons.push(r.reason);
  }
  assert(accepted === 8,
    `a legitimate spray must not be throttled, ${accepted}/8 accepted (${reasons})`);
});

// ---------------------------------------------------------------------------
// Damage model — compared against the real functions, never against literals.
// ---------------------------------------------------------------------------

test('damage matches damageAt/damageForHit exactly for head/chest/limb at range', () => {
  // Several distances spanning the falloff curve. The rifle falls off as
  // 0.98^(d/9.5), so these are genuinely different multipliers.
  const distances = [3, 12, 30, 60];
  const aims = [
    ['head', Y_HEAD],
    ['chest', Y_CHEST],
    ['leg', Y_LEG],
  ];

  for (const dist of distances) {
    for (const [wantPart, aimY] of aims) {
      const host = new CombatHost();
      host.add('shooter');
      host.add('target');
      // Full health each time so nothing dies mid-sweep and swallows a hit.
      host.beginTick(0, [
        ['shooter', { position: V(0, 0, 0), yaw: 0 }],
        ['target', { position: V(0, 0, dist), yaw: 0 }],
      ]);

      const eyeY = 1.28;                       // player eye height in this game
      const origin = V(0, eyeY, 0);
      const dir = norm(V(0, aimY - eyeY, dist));
      const res = host.resolveShot({ shooterId: 'shooter', tick: 0, origin, direction: dir });
      assert(res.ok, `rejected at ${dist}m: ${res.reason}`);
      assert(res.hits.length === 1, `no hit at ${dist}m aiming at ${wantPart}`);
      const hit = res.hits[0];
      assert(hit.part === wantPart,
        `at ${dist}m aiming ${wantPart} the ray resolved to ${hit.part}`);

      // THE assertion: recompute through the same public functions the game
      // uses, from the distance the raycast actually reported.
      const expected = damageForHit(damageAt(hit.distance), hit.part);
      close(hit.damage, expected, 1e-9,
        `damage at ${dist}m on ${hit.part} must equal damageForHit(damageAt(d), part)`);
    }
  }
});

test('damage falls off with distance rather than being flat', () => {
  const dmg = (dist) => {
    const host = new CombatHost();
    host.add('s'); host.add('t');
    host.beginTick(0, [
      ['s', { position: V(0, 0, 0), yaw: 0 }],
      ['t', { position: V(0, 0, dist), yaw: 0 }],
    ]);
    const r = host.resolveShot({
      shooterId: 's', tick: 0,
      origin: V(0, 1.28, 0), direction: norm(V(0, Y_CHEST - 1.28, dist)),
    });
    assert(r.ok && r.hits.length === 1, `no hit at ${dist}m`);
    return r.hits[0].damage;
  };
  const near = dmg(3), far = dmg(80);
  assert(far < near, `damage must fall off: ${far} at 80m vs ${near} at 3m`);
});

test('head multiplier is applied and beats chest at the same distance', () => {
  // A fresh host per shot: a 10m headshot is fatal under this damage model, so
  // firing both at the same target would have the second round land on a
  // corpse and report zero.
  const shoot = (aimY) => {
    const host = new CombatHost();
    host.add('s'); host.add('t');
    host.beginTick(0, [
      ['s', { position: V(0, 0, 0), yaw: 0 }],
      ['t', { position: V(0, 0, 10), yaw: 0 }],
    ]);
    const r = host.resolveShot({
      shooterId: 's', tick: 0,
      origin: V(0, 1.28, 0), direction: norm(V(0, aimY - 1.28, 10)),
    });
    assert(r.ok && r.hits.length === 1, `no hit aiming at y=${aimY}: ${r.reason}`);
    return r;
  };
  const head = shoot(Y_HEAD);
  const chest = shoot(Y_CHEST);
  assert(head.hits[0].part === 'head' && chest.hits[0].part === 'chest', 'wrong parts hit');
  assert(head.hits[0].damage > chest.hits[0].damage, 'head must out-damage chest');

  // The ratio is NOT exactly HITBOX_MULT.head/HITBOX_MULT.chest: the head
  // sphere sits higher, so the ray reaches it at a slightly different distance
  // and picks up a slightly different falloff. Asserting a clean 4.0 here would
  // be asserting the multiplier's authored INTENT rather than what the model
  // actually produces — the precise failure mode this file exists to avoid.
  // So: normalise each hit by its own falloff and check the multiplier that
  // remains.
  for (const r of [head, chest]) {
    const h = r.hits[0];
    close(h.damage / damageAt(h.distance), HITBOX_MULT[h.part], 1e-9,
      `${h.part}: damage/damageAt(d) must equal the hitgroup multiplier`);
  }
  // And the ratio is still within a hair of 4x, since the two distances differ
  // by only the ~0.3m of hitbox separation.
  close(head.hits[0].damage / chest.hits[0].damage,
    HITBOX_MULT.head / HITBOX_MULT.chest, 0.01, 'head/chest ratio should be ~4x');
});

// ---------------------------------------------------------------------------
// Death, double-kill, respawn
// ---------------------------------------------------------------------------

test('death: health reaching <= 0 kills, and credits exactly one kill', () => {
  const host = new CombatHost();
  const shooter = host.add('s');
  const victim = host.add('t');
  const step = Math.ceil((60 / RIFLE.rpm) * TICK_RATE);
  // Record the snapshot for each tick AS the spray reaches it. Recording the
  // whole timeline up front would leave host.tick at the end while the shots
  // claim early ticks, and every one would be refused as out-of-window — a
  // rejection that has nothing to do with what this test is checking.
  let shots = 0;
  for (let i = 0; i < 20 && victim.alive; i++) {
    const tick = i * step;
    host.beginTick(tick, [
      ['s', { position: V(0, 0, 0), yaw: 0 }],
      ['t', { position: V(0, 0, 4), yaw: 0 }],
    ]);
    host.resolveShot({
      shooterId: 's', tick,
      origin: V(0, 1.28, 0), direction: norm(V(0, Y_CHEST - 1.28, 4)),
    });
    shots++;
  }
  assert(!victim.alive, `victim should be dead after ${shots} chest shots`);
  assert(victim.health <= 0, `dead player health must be <= 0, got ${victim.health}`);
  assert(shooter.kills === 1, `exactly one kill, got ${shooter.kills}`);
  assert(victim.deaths === 1, `exactly one death, got ${victim.deaths}`);
  const kills = host.drainEvents().filter((e) => e.type === 'kill');
  assert(kills.length === 1, `exactly one kill event, got ${kills.length}`);
});

test('no double-kill from two simultaneous fatal hits', () => {
  const host = new CombatHost();
  const a = host.add('a');
  const b = host.add('b');
  const victim = host.add('v');
  // Put the victim on 1 HP so a single round of ANY kind is fatal.
  victim.health = 1;
  host.beginTick(0, [
    ['a', { position: V(-1, 0, 0), yaw: 0 }],
    ['b', { position: V(1, 0, 0), yaw: 0 }],
    ['v', { position: V(0, 0, 6), yaw: 0 }],
  ]);
  const shoot = (id, x) => host.resolveShot({
    shooterId: id, tick: 0,
    origin: V(x, 1.28, 0),
    direction: norm(V(-x, Y_CHEST - 1.28, 6)),
  });
  const r1 = shoot('a', -1);
  const r2 = shoot('b', 1);
  assert(r1.ok && r1.hits.length === 1, 'first shooter must hit');
  assert(r2.ok && r2.hits.length === 1, 'second shooter must hit');
  assert(r1.hits[0].fatal, 'the first round should be the fatal one');
  assert(!r2.hits[0].fatal, 'the second round must not also be fatal');
  assert(a.kills + b.kills === 1,
    `exactly one kill total, got a=${a.kills} b=${b.kills}`);
  assert(victim.deaths === 1, `exactly one death, got ${victim.deaths}`);
  const kills = host.drainEvents().filter((e) => e.type === 'kill');
  assert(kills.length === 1, `exactly one kill event, got ${kills.length}`);
});

test('a dead player cannot fire', () => {
  const host = new CombatHost();
  const s = host.add('s');
  host.add('t');
  s.alive = false;
  host.beginTick(0, [
    ['s', { position: V(0, 0, 0), yaw: 0 }],
    ['t', { position: V(0, 0, 6), yaw: 0 }],
  ]);
  const r = host.resolveShot({
    shooterId: 's', tick: 0, origin: V(0, 1.28, 0), direction: V(0, 0, 1),
  });
  assert(!r.ok && r.reason === Reject.DEAD_SHOOTER, `expected dead-shooter, got ${r.reason}`);
});

test('respawn restores full health after the delay, not before', () => {
  const host = new CombatHost();
  host.add('s');
  const victim = host.add('t');
  victim.health = 1;
  host.beginTick(0, [
    ['s', { position: V(0, 0, 0), yaw: 0 }],
    ['t', { position: V(0, 0, 5), yaw: 0 }],
  ]);
  host.resolveShot({
    shooterId: 's', tick: 0,
    origin: V(0, 1.28, 0), direction: norm(V(0, Y_CHEST - 1.28, 5)),
  });
  assert(!victim.alive, 'victim must be dead');

  // Just short of the delay: still dead.
  host.update(RESPAWN_DELAY - 0.1);
  assert(!victim.alive, 'must not respawn early');

  host.update(0.2);
  assert(victim.alive, 'must respawn after the delay');
  assert(victim.health === MAX_HEALTH,
    `respawn must restore full health, got ${victim.health}`);
  const ev = host.drainEvents().filter((e) => e.type === 'respawn');
  assert(ev.length === 1, `expected one respawn event, got ${ev.length}`);
});

test('kill/death counters survive a respawn', () => {
  const host = new CombatHost();
  const s = host.add('s');
  const v = host.add('v');
  v.health = 1;
  host.beginTick(0, [
    ['s', { position: V(0, 0, 0), yaw: 0 }],
    ['v', { position: V(0, 0, 5), yaw: 0 }],
  ]);
  host.resolveShot({
    shooterId: 's', tick: 0,
    origin: V(0, 1.28, 0), direction: norm(V(0, Y_CHEST - 1.28, 5)),
  });
  host.update(RESPAWN_DELAY + 0.1);
  assert(s.kills === 1 && v.deaths === 1, 'score must not reset on respawn');
  const board = host.scoreboard();
  assert(board[0].id === 's', 'scoreboard should sort the killer first');
});

// ---------------------------------------------------------------------------
// NaN / Inf containment
// ---------------------------------------------------------------------------

test('no NaN or Inf reaches a health value or an event', () => {
  const host = new CombatHost();
  host.add('s');
  const t = host.add('t');
  host.beginTick(0, [
    ['s', { position: V(0, 0, 0), yaw: 0 }],
    ['t', { position: V(0, 0, 6), yaw: 0 }],
  ]);

  const poison = [
    { origin: V(NaN, 1.28, 0), direction: V(0, 0, 1) },
    { origin: V(0, 1.28, 0), direction: V(NaN, 0, 1) },
    { origin: V(Infinity, 1.28, 0), direction: V(0, 0, 1) },
    { origin: V(0, 1.28, 0), direction: V(0, 0, 0) },      // zero length
    { origin: V(0, Infinity, 0), direction: V(0, 0, 1) },
  ];
  for (const p of poison) {
    const r = host.resolveShot({ shooterId: 's', tick: 0, ...p });
    assert(!r.ok, `poisoned shot ${JSON.stringify(p)} should be rejected`);
    assert(r.reason === Reject.BAD_INPUT, `wrong reason: ${r.reason}`);
  }
  assert(Number.isFinite(t.health) && t.health === MAX_HEALTH,
    `health must be untouched and finite, got ${t.health}`);
  assert(host.drainEvents().length === 0, 'poisoned shots must emit no events');
});

test('a non-finite claimed tick is rejected', () => {
  const host = new CombatHost();
  host.add('s');
  host.beginTick(0, [['s', { position: V(0, 0, 0), yaw: 0 }]]);
  for (const tick of [NaN, Infinity, -Infinity, 'five', null, undefined]) {
    const r = host.resolveShot({
      shooterId: 's', tick, origin: V(0, 1.28, 0), direction: V(0, 0, 1),
    });
    assert(!r.ok, `tick ${String(tick)} should be rejected`);
  }
});

test('snapshot history refuses to store a non-finite transform', () => {
  const h = new SnapshotHistory();
  h.record(0, [
    ['good', { position: V(1, 2, 3), yaw: 0.5 }],
    ['nanpos', { position: V(NaN, 0, 0), yaw: 0 }],
    ['nanyaw', { position: V(0, 0, 0), yaw: NaN }],
    ['infpos', { position: V(0, Infinity, 0), yaw: 0 }],
  ]);
  const snap = h.at(0);
  assert(snap.players.has('good'), 'valid entry must be stored');
  assert(!snap.players.has('nanpos'), 'NaN position must not be stored');
  assert(!snap.players.has('nanyaw'), 'NaN yaw must not be stored');
  assert(!snap.players.has('infpos'), 'Inf position must not be stored');
});

test('every event field is finite', () => {
  const host = new CombatHost();
  host.add('s');
  const v = host.add('v');
  v.health = 1;
  host.beginTick(0, [
    ['s', { position: V(0, 0, 0), yaw: 0 }],
    ['v', { position: V(0, 0, 7), yaw: 0 }],
  ]);
  host.resolveShot({
    shooterId: 's', tick: 0,
    origin: V(0, 1.28, 0), direction: norm(V(0, Y_HEAD - 1.28, 7)),
  });
  const events = host.drainEvents();
  assert(events.length >= 2, 'expected a hit and a kill event');
  for (const e of events) {
    for (const [k, val] of Object.entries(e)) {
      if (typeof val === 'number') {
        assert(Number.isFinite(val), `event ${e.type}.${k} is ${val}`);
      }
      if (val && typeof val === 'object' && 'x' in val) {
        for (const axis of ['x', 'y', 'z']) {
          assert(Number.isFinite(val[axis]), `event ${e.type}.${k}.${axis} is ${val[axis]}`);
        }
      }
    }
  }
});

// ---------------------------------------------------------------------------
// Snapshot history mechanics
// ---------------------------------------------------------------------------

test('history returns null for a tick that has aged out of the ring buffer', () => {
  const h = new SnapshotHistory(8);
  for (let t = 0; t < 20; t++) {
    h.record(t, [['a', { position: V(0, 0, t), yaw: 0 }]]);
  }
  assert(h.at(19) !== null, 'newest tick must be present');
  assert(h.at(0) === null, 'an overwritten slot must not report a stale snapshot');
  // The ring wraps, so slot for tick 0 now holds tick 16. It must not be
  // mistaken for tick 0 — that would silently rewind to the wrong position.
  assert(h.at(16) !== null && h.at(16).tick === 16, 'wrapped slot must report its true tick');
});

test('a shot at a tick with no snapshot resolves as a clean miss, not a crash', () => {
  const host = new CombatHost();
  host.add('s');
  host.add('t');
  host.tick = 5;   // host thinks it is at tick 5 but recorded nothing
  const r = host.resolveShot({
    shooterId: 's', tick: 5, origin: V(0, 1.28, 0), direction: V(0, 0, 1),
  });
  assert(r.ok, 'a missing snapshot is not the client\'s fault; accept and miss');
  assert(r.hits.length === 0, 'and register no hits');
});

test('a shooter cannot hit themselves', () => {
  const host = new CombatHost();
  const s = host.add('s');
  host.beginTick(0, [['s', { position: V(0, 0, 0), yaw: 0 }]]);
  const r = host.resolveShot({
    shooterId: 's', tick: 0,
    // Fire straight up through their own head hitbox.
    origin: V(0, 0.5, 0), direction: V(0, 1, 0),
  });
  assert(r.ok && r.hits.length === 0, 'self-hits must be excluded');
  assert(s.health === MAX_HEALTH, 'shooter health untouched');
});

test('only the nearest player is hit by one round', () => {
  const host = new CombatHost();
  host.add('s');
  const near = host.add('near');
  const far = host.add('far');
  host.beginTick(0, [
    ['s', { position: V(0, 0, 0), yaw: 0 }],
    ['near', { position: V(0, 0, 5), yaw: 0 }],
    ['far', { position: V(0, 0, 12), yaw: 0 }],
  ]);
  const r = host.resolveShot({
    shooterId: 's', tick: 0,
    origin: V(0, Y_CHEST, 0), direction: V(0, 0, 1),
  });
  assert(r.ok && r.hits.length === 1, `expected one hit, got ${r.hits.length}`);
  assert(r.hits[0].victimId === 'near', `nearest player must absorb the round, hit ${r.hits[0].victimId}`);
  assert(far.health === MAX_HEALTH, 'the far player must be unharmed');
  assert(near.health < MAX_HEALTH, 'the near player must take the damage');
});

test('an unknown shooter is rejected', () => {
  const host = new CombatHost();
  const r = host.resolveShot({
    shooterId: 'ghost', tick: 0, origin: V(0, 1, 0), direction: V(0, 0, 1),
  });
  assert(!r.ok && r.reason === Reject.NO_SHOOTER, `got ${r.reason}`);
});

test('the yaw rotation of the hitboxes actually matters', () => {
  // The arm boxes sit at x = +-0.24 in LOCAL space. Rotating the target 90deg
  // must move them, or the rotation is being dropped and every hit resolves as
  // if the target always faced +Z.
  const facing0 = { position: V(0, 0, 0), yaw: 0 };
  const facing90 = { position: V(0, 0, 0), yaw: Math.PI / 2 };
  // Aim a ray down +Z at the spot where the LEFT arm sits when yaw = 0.
  const origin = V(0.24, 1.36, -6);
  const dir = V(0, 0, 1);
  const a = raycastPlayerHitbox(facing0, origin, dir);
  const b = raycastPlayerHitbox(facing90, origin, dir);
  assert(a && a.part === 'arm', `yaw=0 should hit an arm, got ${a && a.part}`);
  // At 90deg the arms have swung onto the Z axis, so that same lateral offset
  // now presents the torso (or nothing) rather than an arm.
  assert(!b || b.part !== 'arm',
    `yaw=90 should no longer present an arm there, got ${b && b.part}`);
});

// ---------------------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('\nfailures:\n  ' + failures.join('\n  '));
  process.exit(1);
}
