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
                      worst: [], stuckAt: [], brushAt: [], oobAt: [] };

    for (let sx = -26; sx <= 26; sx += 6.5) {
      for (let sz = -26; sz <= 26; sz += 6.5) {
        // Skip starts that are inside a building mass — not player-reachable,
        // so a "stuck" there is meaningless.
        const start = new THREE.Vector3(sx, MOVE.standHeight / 2 + 0.02, sz);
        if (world.overlaps(start, HP)) continue;

        for (let d = 0; d < DIRS; d++) {
          const yaw = (d / DIRS) * Math.PI * 2;
          const m = new Ctl(world, start.clone());
          results.runs++;
          let minY = 99, maxSpeedSeen = 0;
          let stuckTicks = 0, worstStuck = 0;

          for (let t = 0; t < TICKS; t++) {
            const before = m.position.clone();
            // Hold forward. Jump every 40 ticks so ledges get attempted.
            m.update({ forward: 1, right: 0, jump: t % 40 === 39, crouch: false },
                     yaw, dt);
            const moved = m.position.distanceTo(before);
            const speed = Math.hypot(m.velocity.x, m.velocity.z);
            maxSpeedSeen = Math.max(maxSpeedSeen, speed);
            minY = Math.min(minY, m.position.y);

            // Stuck = barely moving while grounded and asking to move, AND
            // nothing solid directly ahead to justify it.
            if (m.grounded && moved < 0.004) {
              const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
              const eye = m.position.clone();
              const hit = world.raycast(eye, fwd, 1.2);
              if (!hit) { stuckTicks++; worstStuck = Math.max(worstStuck, stuckTicks); }
              else stuckTicks = 0;
            } else stuckTicks = 0;

            if (world.overlaps(m.position, m.halfExtents)) {
              results.inBrush++;
              results.brushAt.push([sx, sz, d, m.position.toArray().map((k) => +k.toFixed(1))]);
              break;
            }
            if (Math.abs(m.position.x) > 30.5 || Math.abs(m.position.z) > 30.5) {
              results.outOfBounds++;
              results.oobAt.push([sx, sz, d, m.position.toArray().map((k) => +k.toFixed(1))]);
              break;
            }
            if (m.position.y < -1.5) {
              results.fell++;
              break;
            }
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
  console.log(`\n== TRAVERSAL ==  ${r.runs} runs x 420 ticks (7s each)`);
  console.log(`  inBrush:${r.inBrush}  outOfBounds:${r.outOfBounds}  fellOut:${r.fell}  stuck:${r.stuck}`);
  if (r.brushAt.length) console.log('  brush: ' + JSON.stringify(r.brushAt));
  if (r.oobAt.length) console.log('  oob:   ' + JSON.stringify(r.oobAt));
  if (r.stuckAt.length) console.log('  stuck: ' + JSON.stringify(r.stuckAt));
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
    // Steer toward a goal with a simple seek, and see if we arrive.
    const ROUTES = [
      ['spawnN->courtyard', [0, 0.71, -24], [0, 1]],
      ['spawnS->courtyard', [0, 0.71, 24], [0, -1]],
      ['west flank N->S', [-24, 0.71, -14], [-24, 14]],
      ['west flank S->N', [-24, 0.71, 14], [-24, -14]],
      ['east flank N->S', [24, 0.71, -14], [24, 14]],
      ['east flank S->N', [24, 0.71, 14], [24, -14]],
      ['courtyard->W arch', [-6, 0.71, 0], [-16, 0]],
      ['courtyard->E arch', [6, 0.71, 0], [16, 0]],
      ['courtyard->N arch', [0, 0.71, -6], [0, -15]],
      ['courtyard->S arch', [0, 0.71, 8], [0, 17]],
      ['market row', [-12, 0.71, 12], [8, 13]],
      ['stairs->balcony', [-22, 0.71, 10], [-22, 3.0]],
      ['balcony->north drop', [-20, 3.9, 3], [-20, -5]],
      ['mid past shed', [-8, 0.71, -8], [12, -8]],
    ];
    return ROUTES.map(([name, p, goal]) => {
      const m = new Ctl(world, new THREE.Vector3(...p));
      const g = new THREE.Vector2(goal[0], goal[1]);
      let best = 1e9, arrived = false, ticks = 0;
      for (let t = 0; t < 900; t++) {
        ticks = t;
        const to = new THREE.Vector2(g.x - m.position.x, g.y - m.position.z);
        const d = to.length();
        best = Math.min(best, d);
        if (d < 1.6) { arrived = true; break; }
        // yaw such that forward=1 heads toward the goal.
        const yaw = Math.atan2(-to.x, -to.y);
        m.update({ forward: 1, right: 0, jump: t % 45 === 44, crouch: false }, yaw, dt);
      }
      return { name, arrived, closest: +best.toFixed(2), ticks,
               end: [+m.position.x.toFixed(1), +m.position.y.toFixed(1), +m.position.z.toFixed(1)] };
    });
  });
  const fail = r.filter((x) => !x.arrived);
  console.log(`\n== ROUTES ==  ${r.length} routes, ${fail.length} unreachable`);
  for (const x of r)
    console.log(`  ${x.arrived ? 'ok' : '!!'} ${x.name.padEnd(20)} closest:${x.closest}m end:${JSON.stringify(x.end)}`);
}

// --------------------------------------------------------------------------
// 7. Sightline coverage — from a player's eye, how much of the map can each
//    key position see? A position that sees everything has no counterplay.
// --------------------------------------------------------------------------
if (want('sight')) {
  const r = await run(() => {
    const { world, THREE } = window.__dbg;
    const EYE = 1.7;
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
      ['balcony south', [-19.5, 3.0 + EYE, 3]],
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
