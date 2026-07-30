// Map audit harness — programmatic, not eyeball.
//
//   node audit.mjs            everything
//   node audit.mjs interiors  one section
//
// Runs in-page against the real CollisionWorld and the real PlayerMovement, so
// what it measures is what the player gets. Screenshots prove how things LOOK;
// this proves how they BEHAVE.
import { chromium } from 'playwright';

const only = process.argv.slice(2);
const want = (n) => only.length === 0 || only.includes(n);

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
page.setDefaultTimeout(300000);
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message.slice(0, 200)));
await page.goto('http://localhost:5173/?lowspec=1', { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__ready === true');

const run = (fn, arg) => page.evaluate(fn, arg);

// --------------------------------------------------------------------------
// 1. Brush / object census + interior probe
// --------------------------------------------------------------------------
if (want('interiors')) {
  const r = await run(() => {
    const { world, renderer, THREE } = window.__dbg;
    let meshes = 0;
    renderer.scene.traverse((o) => { if (o.isMesh) meshes++; });

    // The four big blocks plus the mid shed, from the BUILDINGS table.
    const BLOCKS = [
      ['NW', -17, -19, 16, 12, 9.5], ['NE', 16, -20, 18, 10, 6.4],
      ['SW', -19, 17, 12, 14, 7.2], ['SE', 18, 18, 14, 12, 5.6],
      ['shed', 4.5, -6.5, 5, 4.5, 3.4],
    ];
    const HP = new THREE.Vector3(0.42, 0.685, 0.42);   // standing player half

    const report = BLOCKS.map(([name, x, z, w, d, h]) => {
      // Sample a grid of player-sized boxes through the block's interior at
      // several heights. "solid" means a player could never be there.
      let cells = 0, solid = 0;
      const openCells = [];
      for (let ix = -2; ix <= 2; ix++) {
        for (let iz = -2; iz <= 2; iz++) {
          for (const fy of [0.72, 2.5, 4.5]) {
            if (fy > h - 0.3) continue;
            const p = new THREE.Vector3(
              x + (ix / 2.5) * (w / 2 - 0.6), fy, z + (iz / 2.5) * (d / 2 - 0.6));
            cells++;
            if (world.overlaps(p, HP)) solid++;
            else openCells.push([+p.x.toFixed(1), +p.y.toFixed(1), +p.z.toFixed(1)]);
          }
        }
      }
      // Count meshes whose centre lies within the block footprint and below
      // its roofline — anything in here is invisible from outside if sealed.
      let inside = 0;
      const insideNames = new Set();
      renderer.scene.traverse((o) => {
        if (!o.isMesh) return;
        const p = o.position;
        if (Math.abs(p.x - x) < w / 2 - 0.3 && Math.abs(p.z - z) < d / 2 - 0.3 &&
            p.y > 0.5 && p.y < h - 0.3) {
          // Skip the block's own mass box (centre at h/2, full size).
          if (Math.abs(p.y - h / 2) < 0.01 && Math.abs(o.scale.x - w) < 0.01) return;
          inside++;
          insideNames.add(`${o.geometry.type}@${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}`);
        }
      });
      return { name, cells, solid, sealed: solid === cells, inside,
               openCells: openCells.slice(0, 6),
               insideNames: [...insideNames].slice(0, 8) };
    });
    return { brushes: world.brushes.length, meshes, report };
  });
  console.log(`\n== INTERIORS ==  brushes:${r.brushes} meshes:${r.meshes}`);
  for (const b of r.report) {
    const tag = b.sealed ? 'SEALED' : `OPEN ${b.cells - b.solid}/${b.cells}`;
    console.log(`  ${b.name.padEnd(6)} ${tag.padEnd(12)} interiorMeshes:${b.inside}`);
    if (!b.sealed) console.log(`         open at ${JSON.stringify(b.openCells)}`);
    if (b.inside) console.log(`         ${b.insideNames.join(' ')}`);
  }
}

// --------------------------------------------------------------------------
// 2. Floor coverage — the grid drop test (holes in the world)
// --------------------------------------------------------------------------
if (want('floor')) {
  const r = await run(() => {
    const { world, THREE } = window.__dbg;
    const holes = [];
    let n = 0;
    for (let x = -29; x <= 29; x += 1.0) {
      for (let z = -29; z <= 29; z += 1.0) {
        n++;
        const hit = world.raycast(
          new THREE.Vector3(x, 30, z), new THREE.Vector3(0, -1, 0), 60);
        if (!hit || hit.distance > 31.5) holes.push([x, z]);
      }
    }
    return { n, holes: holes.slice(0, 20), count: holes.length };
  });
  console.log(`\n== FLOOR ==  ${r.n} probes, ${r.count} holes`);
  if (r.count) console.log('  ' + JSON.stringify(r.holes));
}

// --------------------------------------------------------------------------
// 3. Spawn / patrol point validity
// --------------------------------------------------------------------------
if (want('points')) {
  const r = await run(() => {
    const { world, mapData, THREE } = window.__dbg;
    const HP = new THREE.Vector3(0.42, 0.685, 0.42);
    const check = (v, tag) => {
      const stuck = world.overlaps(v, HP);
      // Drop-settle: is there ground under it within a couple of metres?
      const down = world.raycast(v.clone(), new THREE.Vector3(0, -1, 0), 40);
      return { tag, at: v.toArray().map((k) => +k.toFixed(1)), stuck,
               floorBelow: down ? +down.distance.toFixed(2) : null };
    };
    return [
      ...mapData.spawns.map((v, i) => check(v, `spawn${i}`)),
      ...mapData.botPoints.map((v, i) => check(v, `bot${i}`)),
    ];
  });
  const bad = r.filter((p) => p.stuck || p.floorBelow === null);
  console.log(`\n== POINTS ==  ${r.length} checked, ${bad.length} bad`);
  for (const p of r) {
    if (p.stuck || p.floorBelow === null)
      console.log(`  !! ${p.tag} ${JSON.stringify(p.at)} stuck:${p.stuck} floor:${p.floorBelow}`);
  }
}

// --------------------------------------------------------------------------
// 4. Traversal sweep — drive the REAL controller from a grid of starts in
//    8 directions, and assert it never breaks the world.
// --------------------------------------------------------------------------
if (want('traverse')) {
  const r = await run(() => {
    const { world, THREE } = window.__dbg;
    // A private controller instance so we never disturb the live player.
    const MOVE = {
      maxSpeed: 4.6, crouchSpeed: 1.7, accelerate: 10, airAccelerate: 12,
      airWishCap: 0.57, friction: 5.2, stopSpeed: 1.9, gravity: 15.2,
      jumpImpulse: 5.6, standHeight: 1.37, crouchHeight: 0.97,
      radius: 0.42, stepHeight: 0.34,
    };
    const Ctl = window.__dbg.movement.constructor;
    const HP = new THREE.Vector3(MOVE.radius, MOVE.standHeight / 2, MOVE.radius);

    const DIRS = 8;
    const TICKS = 420;            // 7s at 60Hz — crosses 30m at full run
    const dt = 1 / 60;
    const results = { runs: 0, stuck: 0, inBrush: 0, outOfBounds: 0, fell: 0,
                      skipped: 0, stuckAt: [], brushAt: [], oobAt: [] };

    // A resting player sits flush on a surface, so overlaps() — which uses
    // strict inequalities — reports true on exact contact. Only count a brush
    // event when the box is genuinely INSIDE, by more than float slop.
    const penetration = (p, half) => {
      let worst = 0;
      for (const b of world.brushes) {
        const ox = Math.min(p.x + half.x, b.max.x) - Math.max(p.x - half.x, b.min.x);
        const oy = Math.min(p.y + half.y, b.max.y) - Math.max(p.y - half.y, b.min.y);
        const oz = Math.min(p.z + half.z, b.max.z) - Math.max(p.z - half.z, b.min.z);
        if (ox > 0 && oy > 0 && oz > 0) worst = Math.max(worst, Math.min(ox, oy, oz));
      }
      return worst;
    };
    const PEN_TOL = 0.02;   // 2cm — well above contact slop, well below a body

    for (let sx = -26; sx <= 26; sx += 6.5) {
      for (let sz = -26; sz <= 26; sz += 6.5) {
        // Seed by dropping from above and letting gravity seat the player, so
        // the start is a real standing position rather than a guessed Y.
        const seed = new Ctl(world, new THREE.Vector3(sx, 3.0, sz));
        for (let t = 0; t < 150; t++)
          seed.update({ forward: 0, right: 0, jump: false, crouch: false }, 0, dt);
        // Starts inside a building mass are not player-reachable; a "stuck"
        // there would be measuring nothing.
        if (seed.position.y < 0.1 || penetration(seed.position, seed.halfExtents) > PEN_TOL) {
          results.skipped++;
          continue;
        }

        for (let d = 0; d < DIRS; d++) {
          const yaw = (d / DIRS) * Math.PI * 2;
          const m = new Ctl(world, seed.position.clone());
          results.runs++;
          let stuckTicks = 0, worstStuck = 0;

          for (let t = 0; t < TICKS; t++) {
            const before = m.position.clone();
            // Hold forward. Jump every 40 ticks so ledges get attempted.
            m.update({ forward: 1, right: 0, jump: t % 40 === 39, crouch: false },
                     yaw, dt);
            const moved = m.position.distanceTo(before);

            // Stuck = no progress while grounded, with NOTHING blocking the
            // way. Standing still against a wall you are walking into is not
            // stuck, it is correct — and a perfectly perpendicular approach
            // legitimately zeroes velocity, since there is no tangential
            // component left to slide along. So the test is a sweep of the
            // player's own box, not a ray: does the body actually have room?
            if (t > 10 && m.grounded && moved < 0.004) {
              const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
              const probe = m.position.clone();
              const blocked = world.sweep(probe, m.halfExtents,
                fwd.clone().multiplyScalar(0.5)) !== null ||
                world.overlaps(probe.clone().addScaledVector(fwd, 0.5), m.halfExtents);
              if (!blocked) { stuckTicks++; worstStuck = Math.max(worstStuck, stuckTicks); }
              else stuckTicks = 0;
            } else stuckTicks = 0;

            if (penetration(m.position, m.halfExtents) > PEN_TOL) {
              results.inBrush++;
              results.brushAt.push([sx, sz, d, m.position.toArray().map((k) => +k.toFixed(2))]);
              break;
            }
            if (Math.abs(m.position.x) > 30.5 || Math.abs(m.position.z) > 30.5) {
              results.outOfBounds++;
              results.oobAt.push([sx, sz, d, m.position.toArray().map((k) => +k.toFixed(2))]);
              break;
            }
            if (m.position.y < -0.5) { results.fell++; break; }
          }
          // 30 consecutive ticks (0.5s) of no progress with open space ahead.
          if (worstStuck > 30) {
            results.stuck++;
            results.stuckAt.push([sx, sz, +yaw.toFixed(2), worstStuck]);
          }
        }
      }
    }
    results.brushAt = results.brushAt.slice(0, 10);
    results.oobAt = results.oobAt.slice(0, 10);
    results.stuckAt = results.stuckAt.slice(0, 12);
    return results;
  });
  console.log(`\n== TRAVERSAL ==  ${r.runs} runs x 420 ticks (7s each), ${r.skipped} starts skipped (inside geometry)`);
  console.log(`  inBrush:${r.inBrush}  outOfBounds:${r.outOfBounds}  fellOut:${r.fell}  stuck:${r.stuck}`);
  if (r.brushAt.length) console.log('  brush: ' + JSON.stringify(r.brushAt));
  if (r.oobAt.length) console.log('  oob:   ' + JSON.stringify(r.oobAt));
  if (r.stuckAt.length) console.log('  stuck: ' + JSON.stringify(r.stuckAt));
}

// --------------------------------------------------------------------------
// 4b. Floor-sink sweep. depenetrate() escapes along the shortest axis, so a
// box overlapping the ground brush near its top face can be pushed DOWN,
// through the world. Prove no reachable standing position does that.
// --------------------------------------------------------------------------
if (want('sink')) {
  const r = await run(() => {
    const { world, THREE } = window.__dbg;
    const Ctl = window.__dbg.movement.constructor;
    const HP = new THREE.Vector3(0.42, 0.685, 0.42);
    const S = 1.0, N = 60, xs = (i) => -30 + 0.5 + i * S;
    let runs = 0, sank = 0; const sankAt = [];
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      if (world.overlaps(new THREE.Vector3(xs(i), 0.72, xs(j)), HP)) continue;
      for (let d = 0; d < 4; d++) {
        const yaw = (d / 4) * Math.PI * 2;
        const m = new Ctl(world, new THREE.Vector3(xs(i), 0.685, xs(j)));
        runs++;
        for (let t = 0; t < 180; t++) {
          m.update({ forward: 1, right: 0, jump: t % 30 === 29, crouch: false }, yaw, 1 / 60);
          if (m.position.y < 0.1) {
            sank++;
            if (sankAt.length < 12) sankAt.push([xs(i), xs(j), d, +m.position.y.toFixed(2)]);
            break;
          }
        }
      }
    }
    return { runs, sank, sankAt };
  });
  console.log(`\n== FLOOR SINK ==  ${r.runs} runs from every open cell x4 dirs, ${r.sank} sank below the floor`);
  if (r.sankAt.length) console.log('  ' + JSON.stringify(r.sankAt));
}

// --------------------------------------------------------------------------
// 5. Escape attempts — sprint-and-jump at the perimeter and off high ground.
// --------------------------------------------------------------------------
if (want('escape')) {
  const r = await run(() => {
    const { world, THREE } = window.__dbg;
    const Ctl = window.__dbg.movement.constructor;
    const dt = 1 / 60;
    // [name, from, yaw] — run flat out at a boundary and jump into it.
    const TRIES = [
      ['north wall', [0, 0.71, -27], Math.PI],
      ['south wall', [0, 0.71, 27], 0],
      ['west wall', [-27, 0.71, 0], Math.PI / 2],
      ['east wall', [27, 0.71, 0], -Math.PI / 2],
      ['NW corner', [-26, 0.71, -26], Math.PI * 0.75],
      ['balcony north', [-20, 3.9, -3], Math.PI],
      ['balcony west', [-20, 3.9, 0.5], Math.PI / 2],
      ['shed roof west', [-13.5, 2.8, 8.5], Math.PI / 2],
      ['NE roof edge', [16, 7.1, -20], -Math.PI / 2],
    ];
    return TRIES.map(([name, p, yaw]) => {
      const m = new Ctl(world, new THREE.Vector3(...p));
      let maxY = p[1], escaped = false;
      for (let t = 0; t < 300; t++) {
        m.update({ forward: 1, right: 0, jump: t % 22 === 21, crouch: false }, yaw, dt);
        maxY = Math.max(maxY, m.position.y);
        if (Math.abs(m.position.x) > 30.6 || Math.abs(m.position.z) > 30.6 ||
            m.position.y > 6.5 && Math.abs(m.position.x) > 29) { escaped = true; break; }
      }
      return { name, escaped,
               end: m.position.toArray().map((k) => +k.toFixed(1)),
               maxY: +maxY.toFixed(2) };
    });
  });
  const out = r.filter((t) => t.escaped);
  console.log(`\n== ESCAPE ==  ${r.length} attempts, ${out.length} escaped`);
  for (const t of r) console.log(`  ${t.escaped ? '!!' : 'ok'} ${t.name.padEnd(16)} end:${JSON.stringify(t.end)} maxY:${t.maxY}`);
}

// --------------------------------------------------------------------------
// 6. Route reachability — can the player actually walk each intended route?
// --------------------------------------------------------------------------
if (want('routes')) {
  const r = await run(() => {
    const { world, THREE } = window.__dbg;
    const Ctl = window.__dbg.movement.constructor;
    const dt = 1 / 60;
    const HP = new THREE.Vector3(0.42, 0.685, 0.42);

    // Walkability grid. A cell is open if a standing player fits at any of the
    // sampled floor heights — ground, plinth, balcony, roofs.
    const S = 0.5, N = Math.round(60 / S);
    const idx = (i, j) => i * N + j;
    const xs = (i) => -30 + S / 2 + i * S;
    const open = new Uint8Array(N * N);
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      let ok = 0;
      for (const fy of [0.72, 1.13, 2.0, 2.35, 3.72])
        if (!world.overlaps(new THREE.Vector3(xs(i), fy, xs(j)), HP)) { ok = 1; break; }
      open[idx(i, j)] = ok;
    }

    // Connectivity: flood from the north spawn. Any open cell that is not
    // reached is a pocket the player can never get to.
    const flood = (si, sj) => {
      const seen = new Uint8Array(N * N);
      if (!open[idx(si, sj)]) return { seen, count: 0 };
      seen[idx(si, sj)] = 1; const q = [[si, sj]]; let h = 0, count = 1;
      while (h < q.length) {
        const [i, j] = q[h++];
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const a = i + di, b = j + dj;
          if (a < 0 || b < 0 || a >= N || b >= N || !open[idx(a, b)] || seen[idx(a, b)]) continue;
          seen[idx(a, b)] = 1; count++; q.push([a, b]);
        }
      }
      return { seen, count };
    };
    const spawnI = Math.round((0 + 30) / S), spawnJ = Math.round((-24 + 30) / S);
    const { seen, count } = flood(spawnI, spawnJ);
    let totalOpen = 0; for (let k = 0; k < N * N; k++) if (open[k]) totalOpen++;
    const pockets = [];
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++)
      if (open[idx(i, j)] && !seen[idx(i, j)] && pockets.length < 30)
        pockets.push([+xs(i).toFixed(1), +xs(j).toFixed(1)]);

    // BFS distance field to a goal, then steer down its gradient using the
    // REAL controller. A route is walkable only if the actual movement code
    // can follow a valid path along it — not if a straight line happens to
    // be clear, which is what a naive seek actually measures.
    const field = (gx, gz) => {
      const d = new Int32Array(N * N).fill(-1);
      let gi = Math.round((gx + 30) / S), gj = Math.round((gz + 30) / S);
      if (!open[idx(gi, gj)]) {          // snap a goal that landed on cover
        let bd = 1e9, bi = -1, bj = -1;
        for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) {
          if (!open[idx(a, b)]) continue;
          const v = (a - gi) ** 2 + (b - gj) ** 2;
          if (v < bd) { bd = v; bi = a; bj = b; }
        }
        if (bi < 0) return null; gi = bi; gj = bj;
      }
      d[idx(gi, gj)] = 0; const q = [[gi, gj]]; let h = 0;
      while (h < q.length) {
        const [i, j] = q[h++];
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const a = i + di, b = j + dj;
          if (a < 0 || b < 0 || a >= N || b >= N || !open[idx(a, b)] || d[idx(a, b)] >= 0) continue;
          d[idx(a, b)] = d[idx(i, j)] + 1; q.push([a, b]);
        }
      }
      return d;
    };

    const ROUTES = [
      ['spawnN->courtyard', [0, -24], [3, 4]],
      ['spawnS->courtyard', [0, 24], [3, 4]],
      ['west flank N->S', [-24, -14], [-24, 13]],
      ['west flank S->N', [-24, 13], [-24, -14]],
      ['east flank N->S', [24, -14], [24, 13]],
      ['east flank S->N', [24, 13], [24, -14]],
      ['courtyard->W arch', [-6, 0], [-16, 0]],
      ['courtyard->E arch', [6, 0], [16, 0]],
      ['courtyard->N arch', [0, -6], [0, -15]],
      ['courtyard->S arch', [0, 8], [0, 17]],
      ['market row', [-12, 12], [8, 13]],
      ['stairs->balcony', [-22, 10], [-19.5, 2]],
      ['mid past shed', [-8, -8], [12, -8]],
      ['spawnN->spawnS', [0, -24], [0, 24]],
      ['spawnN->balcony', [0, -24], [-19.5, 2]],
      ['spawnS->balcony', [0, 24], [-19.5, 2]],
    ];
    const routes = ROUTES.map(([name, from, goal]) => {
      const d = field(goal[0], goal[1]);
      if (!d) return { name, arrived: false, err: 'goal unreachable' };
      const m = new Ctl(world, new THREE.Vector3(from[0], 3, from[1]));
      for (let t = 0; t < 150; t++)
        m.update({ forward: 0, right: 0, jump: false, crouch: false }, 0, dt);
      let best = 1e9, arrived = false, ticks = 0;
      for (let t = 0; t < 2400; t++) {
        ticks = t;
        const dist = Math.hypot(goal[0] - m.position.x, goal[1] - m.position.z);
        best = Math.min(best, dist);
        if (dist < 1.6) { arrived = true; break; }
        const i = Math.round((m.position.x + 30) / S), j = Math.round((m.position.z + 30) / S);
        let bi = i, bj = j, bd = 1e9;
        for (let a = i - 1; a <= i + 1; a++) for (let b = j - 1; b <= j + 1; b++) {
          if (a < 0 || b < 0 || a >= N || b >= N || !open[idx(a, b)]) continue;
          const v = d[idx(a, b)]; if (v >= 0 && v < bd) { bd = v; bi = a; bj = b; }
        }
        const yaw = Math.atan2(-(xs(bi) - m.position.x), -(xs(bj) - m.position.z));
        m.update({ forward: 1, right: 0, jump: t % 50 === 49, crouch: false }, yaw, dt);
      }
      return { name, arrived, closest: +best.toFixed(2), secs: +(ticks / 60).toFixed(1),
               end: [+m.position.x.toFixed(1), +m.position.y.toFixed(1), +m.position.z.toFixed(1)] };
    });
    return { totalOpen, reachable: count, pockets, routes };
  });
  console.log(`\n== CONNECTIVITY ==  ${r.reachable}/${r.totalOpen} open cells reachable from north spawn, ${r.totalOpen - r.reachable} isolated`);
  if (r.pockets.length) console.log('  pockets: ' + JSON.stringify(r.pockets));
  const fail = r.routes.filter((x) => !x.arrived);
  console.log(`\n== ROUTES ==  ${r.routes.length} routes, ${fail.length} unwalkable`);
  for (const x of r.routes)
    console.log(`  ${x.arrived ? 'ok' : '!!'} ${x.name.padEnd(20)} closest:${x.closest}m t:${x.secs}s end:${JSON.stringify(x.end)}${x.err ? ' ' + x.err : ''}`);
}

// --------------------------------------------------------------------------
// 7. Sightline coverage — from a player's eye, how much of the map can each
//    key position see? A position that sees everything has no counterplay.
// --------------------------------------------------------------------------
if (want('sight')) {
  const r = await run(() => {
    const { world, THREE } = window.__dbg;
    // The real standing eye: a player settles at y=0.685 on flat ground and
    // the eye sits at position.y + height/2 - 0.09. Sampling from 1.7 would
    // shoot every sightline from 42cm above the head and flatter the cover.
    const EYE = 0.685 + 1.37 / 2 - 0.09;   // 1.28
    // Sample targets on a grid at chest height across the playable floor.
    const targets = [];
    for (let x = -27; x <= 27; x += 3) {
      for (let z = -27; z <= 27; z += 3) {
        const p = new THREE.Vector3(x, 1.1, z);
        // Only count spots a player could stand in.
        if (world.overlaps(p, new THREE.Vector3(0.42, 0.685, 0.42))) continue;
        targets.push(p);
      }
    }
    const SPOTS = [
      ['courtyard centre', [0, EYE, 4]],
      ['balcony south', [-19.5, 3.0 + EYE, 3]],   // deck top 3.0
      ['balcony north', [-19.5, 3.0 + EYE, -2]],
      ['shed roof', [-13.5, 2.1 + EYE, 8.5]],
      ['north spawn', [0, EYE, -24]],
      ['south spawn', [0, EYE, 24]],
      ['west flank', [-24, EYE, 0]],
      ['east flank', [24, EYE, 0]],
      ['market row', [-7.5, EYE, 10]],
      ['N archway', [0, EYE, -11.5]],
      ['S archway', [0, EYE, 14.5]],
      ['mid shed east', [10, EYE, -6]],
    ];
    return {
      total: targets.length,
      spots: SPOTS.map(([name, p]) => {
        const o = new THREE.Vector3(...p);
        let seen = 0;
        for (const t of targets) {
          const d = t.clone().sub(o);
          const len = d.length();
          if (len < 0.5) { seen++; continue; }
          d.multiplyScalar(1 / len);
          const hit = world.raycast(o, d, len - 0.15);
          if (!hit) seen++;
        }
        return { name, seen, pct: +(100 * seen / targets.length).toFixed(1) };
      }),
    };
  });
  console.log(`\n== SIGHTLINES ==  ${r.total} standable sample points`);
  for (const s of r.spots.sort((a, b) => b.pct - a.pct))
    console.log(`  ${s.name.padEnd(18)} sees ${String(s.seen).padStart(4)} / ${r.total}  = ${s.pct}%`);
}

await browser.close();
if (errors.length) console.log('\nerrors:\n' + errors.slice(0, 8).join('\n'));
