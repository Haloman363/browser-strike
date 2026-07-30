// Visual inspection harness. Named scenarios that pose the scene, capture it,
// and report anything that looks structurally wrong.
//
//   node inspect.mjs            all scenarios
//   node inspect.mjs bot gun    only the named ones
//
// Scenarios run in-page against window.__dbg, so they can drive game objects
// directly rather than trying to play the game from outside.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const OUT = 'shots/inspect';
mkdirSync(OUT, { recursive: true });

const only = process.argv.slice(2);
const want = (name) => only.length === 0 || only.some((a) => name.startsWith(a));

// Each scenario: [name, in-page setup returning diagnostics]
const SCENARIOS = [
  // The bot's model is driven from its physics body every update, so pose it
  // by moving the body and letting one update tick sync the model.
  ['bot-front', () => {
    const { bots } = window.__dbg;
    if (!bots.length) return { skip: 'no bots' };
    const b = window.__poseBot(bots[0], { at: [0, 0, -2], yaw: Math.PI });
    window.__shot([0, 1.35, 1.6], [0, 1.05, -2], 42);
    return b;
  }],
  ['bot-side', () => {
    const { bots } = window.__dbg;
    if (!bots.length) return { skip: 'no bots' };
    const b = window.__poseBot(bots[0], { at: [0, 0, -2], yaw: Math.PI });
    window.__shot([3.4, 1.35, -2], [0, 1.05, -2], 42);
    return b;
  }],
  ['bot-walk', () => {
    const { bots } = window.__dbg;
    if (!bots.length) return { skip: 'no bots' };
    const b = window.__poseBot(bots[0], { at: [0, 0, -2], yaw: Math.PI, walk: 3.2 });
    window.__shot([2.6, 1.4, 0.6], [0, 1.0, -2], 42);
    return b;
  }],
  ['gun-viewmodel', () => {
    const { rifle, renderer } = window.__dbg;
    if (!rifle) return { skip: 'no rifle' };
    // Point at open sky so only the weapon is in frame.
    window.__shot([0, 3, 10], [0, 14, -10], 90);
    rifle.renderViewmodel(renderer.renderer);
    return { parts: rifle.vmRoot ? rifle.vmRoot.children.length : 0 };
  }],
  ['gun-in-world', () => {
    const { rifle, renderer } = window.__dbg;
    if (!rifle) return { skip: 'no rifle' };
    window.__shot([0, 1.7, 18], [0, 1.6, 0], 90);
    rifle.renderViewmodel(renderer.renderer);
    return {};
  }],
  // The actual gameplay frame: weapon up, enemy downrange, map behind. This
  // is the only view that shows whether the parts work together.
  ['gameplay', () => {
    const { rifle, renderer, bots } = window.__dbg;
    if (!rifle || !bots.length) return { skip: 'need rifle + bot' };
    window.__poseBot(bots[0], { at: [1.5, 0, 4], yaw: 0.4, walk: 3.0 });
    window.__shot([0, 1.7, 14], [1.2, 1.4, 3], 90);
    rifle.renderViewmodel(renderer.renderer);
    return {};
  }],
  // -- weapon effects ------------------------------------------------------
  // Everything below drives rifle.fire() directly and steps rifle.update() by
  // hand, so an effect that lasts 40ms can be caught at the frame it peaks.

  // Muzzle flash, one small step after the shot so the quads are near full
  // opacity. Camera is aimed down the barrel line from beside the weapon.
  ['fx-flash', () => {
    const { rifle, renderer } = window.__dbg;
    window.__aimAt([0, 1.7, 6], [0, 1.7, -6]);
    rifle.fire();
    rifle.update(0.004, {}, null);
    window.__shot([0, 1.7, 6], [0, 1.7, -6], 90);
    rifle.renderViewmodel(renderer.renderer);
    return {
      flashVisible: rifle.flash.visible,
      opacity: +rifle.flashMat.opacity.toFixed(2),
      light: +rifle.flashLight.intensity.toFixed(2),
      rotZ: +rifle.flash.rotation.z.toFixed(2),
    };
  }],
  // Same shot, but the camera sits out to the side and looks back at the
  // muzzle so you can see WHERE the flash is relative to the barrel.
  ['fx-flash-side', () => {
    const { rifle, renderer } = window.__dbg;
    window.__aimAt([0, 1.7, 6], [0, 1.7, -6]);
    rifle.fire();
    rifle.update(0.004, {}, null);
    window.__shot([0, 1.7, 6], [0, 1.7, -6], 90);
    // Re-render the viewmodel from a rotated vm camera to see the muzzle from
    // the side without disturbing the world pass.
    const c = rifle.vmCamera;
    c.position.set(1.1, 0.15, 0.35);
    c.lookAt(0.1, -0.12, -0.55);
    c.updateProjectionMatrix();
    rifle.renderViewmodel(renderer.renderer);
    c.position.set(0, 0, 0);
    c.rotation.set(0, 0, 0);
    return { flashWorld: rifle.flash.getWorldPosition(new window.__dbg.THREE.Vector3())
      .toArray().map((v) => +v.toFixed(3)) };
  }],
  // Impact decal + sparks: stand close to a wall and put five rounds into it.
  ['fx-impact', () => {
    const { rifle, renderer } = window.__dbg;
    const spot = window.__wallSpot();
    if (!spot) return { skip: 'no wall found' };
    window.__aimAt(spot.eye, spot.look);
    const hits = [];
    for (let i = 0; i < 5; i++) {
      const h = rifle.fire();
      if (h) hits.push({ d: +h.distance.toFixed(2),
        n: h.normal.toArray().map((v) => +v.toFixed(2)) });
      rifle.cooldown = 0;
      rifle.recoil.pitch = rifle.recoil.yaw = 0; // keep all five on the wall
    }
    rifle.update(0.03, {}, null);
    window.__shot(spot.eye, spot.look, 60);
    rifle.renderViewmodel(renderer.renderer);
    return { hits, decalsOn: rifle.decals.filter((d) => d.visible).length,
      sparksOn: rifle.sparks.filter((s) => s.mesh.visible).length };
  }],
  // Decals alone, close up, no viewmodel — is the size right, is it flat on
  // the surface, is it z-fighting?
  ['fx-decal-closeup', () => {
    const { rifle } = window.__dbg;
    const spot = window.__wallSpot();
    if (!spot) return { skip: 'no wall found' };
    window.__aimAt(spot.eye, spot.look);
    let last = null;
    for (let i = 0; i < 3; i++) {
      const h = rifle.fire();
      if (h) last = h;
      rifle.cooldown = 0;
      rifle.recoil.pitch = 0; rifle.recoil.yaw = (i - 1) * 0.02;
    }
    rifle.update(0.5, {}, null); // sparks gone, decals remain
    if (!last) return { skip: 'no hit' };
    const p = last.point, n = last.normal;
    const eye = [p.x + n.x * 0.55, p.y + n.y * 0.55 + 0.1, p.z + n.z * 0.55];
    window.__shot(eye, [p.x, p.y, p.z], 55);
    const d = rifle.decals.find((x) => x.visible);
    return { hitPoint: p.toArray().map((v) => +v.toFixed(2)),
      normal: n.toArray().map((v) => +v.toFixed(2)),
      decalScale: d ? +d.scale.x.toFixed(2) : null,
      decalWorldSize: d ? +(0.075 * d.scale.x).toFixed(3) : null };
  }],
  // Sparks caught mid-burst, one small step after impact.
  ['fx-sparks', () => {
    const { rifle } = window.__dbg;
    const spot = window.__wallSpot();
    if (!spot) return { skip: 'no wall found' };
    window.__aimAt(spot.eye, spot.look);
    let last = null;
    for (let i = 0; i < 3; i++) { const h = rifle.fire(); if (h) last = h; rifle.cooldown = 0; }
    rifle.update(0.05, {}, null);
    if (!last) return { skip: 'no hit' };
    const p = last.point, n = last.normal;
    window.__shot([p.x + n.x * 0.9, p.y + n.y * 0.9 + 0.25, p.z + n.z * 0.9],
      [p.x, p.y, p.z], 45);
    const live = rifle.sparks.filter((s) => s.life > 0);
    return { live: live.length,
      scale: live[0] ? +live[0].mesh.scale.x.toFixed(2) : null,
      opacity: +rifle.sparkMat.opacity.toFixed(2) };
  }],
  // Decal pool recycling: fire more than MAX_DECALS and confirm the count is
  // capped and the oldest slot got reused rather than a new mesh appearing.
  ['fx-decal-pool', () => {
    const { rifle } = window.__dbg;
    const spot = window.__wallSpot();
    if (!spot) return { skip: 'no wall found' };
    window.__aimAt(spot.eye, spot.look);
    const first = rifle.decals[0];
    let firstPos = null;
    for (let i = 0; i < 80; i++) {
      rifle.cooldown = 0; rifle.ammo = 30;
      rifle.recoil.pitch = (Math.random() - 0.5) * 0.06;
      rifle.recoil.yaw = (Math.random() - 0.5) * 0.10;
      rifle.fire();
      if (i === 0) firstPos = first.position.clone();
    }
    rifle.update(0.5, {}, null);
    window.__shot(spot.eye, spot.look, 70);
    return { total: rifle.decals.length,
      visible: rifle.decals.filter((d) => d.visible).length,
      cursor: rifle.decalCursor,
      slot0Recycled: firstPos ? first.position.distanceTo(firstPos) > 1e-6 : null };
  }],
  // Shells: fire a burst, let them fly, look at where they went from the side.
  ['fx-shells', () => {
    const { rifle, renderer } = window.__dbg;
    window.__aimAt([0, 1.7, 6], [0, 1.7, -6]);
    for (let i = 0; i < 4; i++) { rifle.fire(); rifle.cooldown = 0; rifle.update(0.06, {}, null); }
    rifle.update(0.12, {}, null);
    const live = rifle.shells.filter((s) => s.life > 0);
    const pos = live.map((s) => s.mesh.position.toArray().map((v) => +v.toFixed(2)));
    // The shooter's own view: brass must read as leaving the ejection port.
    window.__shot([0, 1.7, 6], [0, 1.7, -6], 90);
    rifle.renderViewmodel(renderer.renderer);
    return { live: live.length, pos, camAt: [0, 1.7, 6] };
  }],
];

// Frame strips: [name, per-frame in-page fn returning diagnostics]
const STRIPS = [
  // Muzzle flash across its whole 40ms life plus the frames either side.
  ['fx-flash-strip', 10, (i) => {
    const { rifle, renderer } = window.__dbg;
    window.__aimAt([0, 1.7, 6], [0, 1.7, -6]);
    rifle.flashTimer = 0; rifle.flash.visible = false;
    rifle.kickPos.set(0, 0, 0); rifle.kickVel.set(0, 0, 0);
    rifle.kickRot.set(0, 0, 0); rifle.kickRotVel.set(0, 0, 0);
    rifle.cooldown = 0; rifle.ammo = 30;
    rifle.fire();
    for (let k = 0; k < i; k++) rifle.update(0.008, {}, null);
    if (i === 0) rifle.update(0.0005, {}, null);
    window.__shot([0, 1.7, 6], [0, 1.7, -6], 90);
    rifle.renderViewmodel(renderer.renderer);
    return { t: (i * 8) + 'ms', vis: rifle.flash.visible,
      op: +rifle.flashMat.opacity.toFixed(2) };
  }],
  // Shell arc: one shot, then eight successive time slices of its flight.
  ['fx-shell-strip', 8, (i) => {
    const { rifle, renderer } = window.__dbg;
    if (i === 0) {
      window.__aimAt([0, 1.7, 6], [0, 1.7, -6]);
      for (const s of rifle.shells) { s.life = 0; s.mesh.visible = false; }
      rifle.cooldown = 0; rifle.ammo = 30;
      rifle.fire();
    }
    for (let k = 0; k < 6; k++) rifle.update(1 / 120, {}, null);
    // The SHOOTER's own view is the one that matters — brass has to read as
    // leaving the ejection port and tumbling out of frame to the right.
    window.__shot([0, 1.7, 6], [0, 1.7, -6], 90);
    rifle.renderViewmodel(renderer.renderer);
    const s = rifle.shells.find((x) => x.life > 0);
    return { p: s ? s.mesh.position.toArray().map((v) => +v.toFixed(2)) : null };
  }],
  // The full 2.4s reload.
  ['fx-reload-strip', 10, (i) => {
    const { rifle, renderer } = window.__dbg;
    if (i === 0) {
      window.__aimAt([0, 1.7, 6], [0, 1.7, -6]);
      rifle.ammo = 3; rifle.reserve = 90; rifle.reloading = 0;
      rifle.kickPos.set(0, 0, 0); rifle.kickVel.set(0, 0, 0);
      rifle.kickRot.set(0, 0, 0); rifle.kickRotVel.set(0, 0, 0);
      rifle.reload();
    }
    // 2.4s over 10 frames = 0.24s per frame, stepped fine so springs behave.
    for (let k = 0; k < 24; k++) rifle.update(0.01, {}, null);
    window.__shot([0, 1.7, 6], [0, 1.7, -6], 90);
    rifle.renderViewmodel(renderer.renderer);
    return { left: +rifle.reloading.toFixed(2),
      magVis: rifle.magParts.filter((m) => m.visible).length,
      magN: rifle.magParts.length,
      magY: +rifle.magParts[0].position.y.toFixed(3) };
  }],
];

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
page.setDefaultTimeout(300000);

const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message.slice(0, 200)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 200));
});

await page.goto('http://localhost:5173/?lowspec=1', { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__ready === true');

// Helpers the effect scenarios need. Defined here rather than in main.js so
// the shipped bundle carries no test-only camera plumbing.
await page.evaluate(() => {
  const { renderer, world, THREE } = window.__dbg;
  // Park the world camera AND leave it there — __shot re-aims it the same way,
  // so hitscan (which reads the camera) and the capture agree.
  window.__aimAt = (pos, look) => {
    const c = renderer.camera;
    c.position.set(pos[0], pos[1], pos[2]);
    c.up.set(0, 1, 0);
    c.lookAt(look[0], look[1], look[2]);
    c.updateMatrixWorld(true);
  };
  // Find a spot in the map with a wall about 2.5m in front of the player.
  window.__wallSpot = () => {
    const eye = new THREE.Vector3(0, 1.6, 0);
    for (const [dx, dz] of [[0, -1], [0, 1], [1, 0], [-1, 0], [0.7, 0.7], [-0.7, 0.7]]) {
      for (let r = 0; r < 26; r += 2) {
        const o = new THREE.Vector3(dx * r, 1.6, dz * r);
        const d = new THREE.Vector3(dx, 0, dz);
        const hit = world.raycast(o, d, 40);
        if (hit && hit.distance > 2.0 && hit.distance < 6.0) {
          return {
            eye: [o.x, o.y, o.z],
            look: [o.x + dx * 10, 1.55, o.z + dz * 10],
          };
        }
      }
    }
    return null;
  };
});

for (const [name, fn] of SCENARIOS) {
  if (!want(name)) continue;
  const diag = await page.evaluate(fn);
  if (diag?.skip) { console.log(`  -- ${name}: ${diag.skip}`); continue; }
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${OUT}/${name}.jpeg`, type: 'jpeg', quality: 92 });
  console.log(`  ${name.padEnd(16)} ${JSON.stringify(diag)}`);
}

// Frame strips, stitched into one numbered contact sheet each.
for (const [name, frames, fn] of STRIPS) {
  if (!want(name)) continue;
  const shots = [];
  const diags = [];
  for (let i = 0; i < frames; i++) {
    diags.push(await page.evaluate(fn, i));
    await page.waitForTimeout(180);
    shots.push((await page.screenshot({ type: 'jpeg', quality: 90 })).toString('base64'));
  }
  await page.evaluate(async (imgs) => {
    const loaded = await Promise.all(imgs.map((d) => new Promise((res) => {
      const im = new Image();
      im.onload = () => res(im);
      im.src = 'data:image/jpeg;base64,' + d;
    })));
    // Two rows so a 10-frame strip is not 11000px wide and unreadable.
    const w = loaded[0].width, h = loaded[0].height;
    const cols = Math.ceil(loaded.length / 2);
    const c = document.createElement('canvas');
    c.width = w * cols; c.height = h * 2;
    const cx = c.getContext('2d');
    loaded.forEach((im, i) => {
      const x = (i % cols) * w, y = Math.floor(i / cols) * h;
      cx.drawImage(im, x, y);
      cx.fillStyle = '#000'; cx.fillRect(x, y, 34, 24);
      cx.fillStyle = '#0f0'; cx.font = 'bold 17px monospace';
      cx.fillText(String(i), x + 9, y + 18);
    });
    window.__sheet = c.toDataURL('image/jpeg', 0.88);
  }, shots);
  const data = await page.evaluate(() => window.__sheet);
  const { writeFileSync } = await import('fs');
  writeFileSync(`${OUT}/${name}.jpeg`, Buffer.from(data.split(',')[1], 'base64'));
  console.log(`  ${name.padEnd(16)} ${JSON.stringify(diags)}`);
}

await browser.close();
if (errors.length) console.log('\nerrors:\n' + errors.slice(0, 8).join('\n'));
