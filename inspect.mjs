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

  // -- grenades, C4 and armour ---------------------------------------------
  // Nothing in the game renders these yet: grenades.js and bomb.js are pure
  // simulation with no view layer. So these scenarios build a throwaway scene
  // and drive the REAL simulation into it -- the smoke sphere is the actual
  // SmokeCloud.radius, the fire disc is the actual FireArea.radius, the
  // grenade's path is the actual CollisionWorld solve. If the numbers are
  // wrong, the picture is wrong. A stand-in scene with invented numbers would
  // prove nothing, which is the whole reason this file exists.

  // The blast sphere at the moment an HE goes off, drawn against the real
  // falloff: concentric shells sized to where damage crosses 75/50/25/0.
  ['nade-he-blast', () => window.__nadeScene('he-blast')],
  // The molotov's fire area, in the map, seen from a player's eye height.
  ['nade-fire', () => window.__nadeScene('fire')],
  // A smoke at full size next to a player-height reference, to check it is
  // actually big enough to hide a person.
  ['nade-smoke', () => window.__nadeScene('smoke')],
  // Smoke and fire together in the real map, from a real sight line: the only
  // frame that shows whether a smoke would actually cut a lane.
  ['nade-smoke-lane', () => window.__nadeScene('smoke-lane')],
];

// Frame strips: [name, per-frame in-page fn returning diagnostics]
const STRIPS = [
  // A real thrown grenade bouncing off a real wall, one frame per 4 sim steps.
  // The path is drawn as a trail of markers so a single frame shows the whole
  // arc so far; the bright marker is the grenade NOW.
  ['nade-bounce-strip', 10, (i) => window.__nadeStrip('bounce', i)],
  // A smoke cloud from detonation to full size. Frame 0 is the pop.
  ['nade-smoke-growth', 8, (i) => window.__nadeStrip('smoke', i)],
  // Molotov fire spreading from the impact point to its full radius.
  ['nade-fire-spread', 8, (i) => window.__nadeStrip('fire', i)],

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

// Grenade/bomb visual harness. These modules have NO renderer in the game, so
// the only way to look at them is to build a scene from their simulation state.
// Everything drawn below is read from a live object -- SmokeCloud.radius,
// FireArea.radius, Grenade.position stepped against the real CollisionWorld.
await page.evaluate(async () => {
  const THREE = window.__dbg.THREE;
  const { renderer, world } = window.__dbg;
  const G = await import('/src/weapons/grenades.js');
  const C = await import('/src/world/collision.js');
  window.__G = G;
  window.__CW = C.CollisionWorld;

  // A scene bright enough to survive the renderer's ACES tonemapping. The pass
  // before this one lit it "normally" and every screenshot came back black.
  const lit = (bg) => {
    const s = new THREE.Scene();
    s.background = new THREE.Color(bg);
    s.add(new THREE.HemisphereLight(0xdfe8ff, 0x8b8175, 6.0));
    const key = new THREE.DirectionalLight(0xfff2dd, 9.0);
    key.position.set(3, 6, 4); s.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 4.0);
    fill.position.set(-3, 3, 4); s.add(fill);
    const rim = new THREE.DirectionalLight(0xaaccff, 3.5);
    rim.position.set(-3, 2, -4); s.add(rim);
    return s;
  };
  // A checkerboard ground so scale and motion are readable; a flat plane makes
  // a bouncing grenade look stationary.
  const ground = (size = 24) => {
    const g = new THREE.Group();
    const n = Math.round(size / 1);
    for (let x = 0; x < n; x++) for (let z = 0; z < n; z++) {
      if ((x + z) % 2) continue;
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshStandardMaterial({ color: 0x8a8578, roughness: 0.95 }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(x - n / 2 + 0.5, 0.002, z - n / 2 + 0.5);
      g.add(m);
    }
    const base = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshStandardMaterial({ color: 0x5e5a51, roughness: 1 }));
    base.rotation.x = -Math.PI / 2;
    g.add(base);
    return g;
  };
  // A 1.8m human box, so "is this smoke big enough to hide behind" is a
  // question the picture can answer.
  const human = (x, z, color = 0x2f6fbf) => {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 1.8, 0.32),
      new THREE.MeshStandardMaterial({ color, roughness: 0.6 }));
    m.position.set(x, 0.9, z);
    return m;
  };
  const wall = (cx, cy, cz, sx, sy, sz) => {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(sx, sy, sz),
      new THREE.MeshStandardMaterial({ color: 0x9c9384, roughness: 0.9 }));
    m.position.set(cx, cy, cz);
    return m;
  };

  // A smoke cloud drawn from its REAL radius: nested translucent shells, which
  // is what a volume looks like without a volumetric shader. A single opaque
  // sphere would read as a beach ball and hide exactly the bug we are hunting.
  window.__smokeMesh = (cloud) => {
    const g = new THREE.Group();
    const r = cloud.radius, op = cloud.opacityAt();
    if (!(r > 0.001)) return g;
    // 12 shells. The first pass used 5 at 0.20 each, which composited to only
    // ~0.67 and rendered a fully readable enemy STANDING INSIDE the cloud while
    // blocksLineOfSight() said "blocked". The sim was right and the picture was
    // lying, which is the exact failure this harness exists to catch, so the
    // shells now accumulate to effectively opaque at the core.
    const N = 12;
    for (let i = 0; i < N; i++) {
      const f = 1 - i * (0.92 / N);
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(r * f, 28, 20),
        new THREE.MeshStandardMaterial({
          color: 0xcfcfca, roughness: 1, transparent: true,
          // Denser toward the core, thin at the rim, like real smoke.
          opacity: (0.13 + 0.22 * (i / N)) * op,
          depthWrite: false, side: THREE.DoubleSide,
        }));
      g.add(m);
    }
    g.position.copy(cloud.centre);
    return g;
  };
  // Fire drawn from the REAL radius: a floor disc PLUS a column of flame
  // billboards up to spec.height. A flat disc alone is precisely the failure
  // this scenario is here to catch, so the height has to be visible.
  window.__fireMesh = (fire) => {
    const g = new THREE.Group();
    const r = fire.radius;
    if (!(r > 0.001)) return g;
    const inten = fire.intensity;
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(r, 40),
      new THREE.MeshBasicMaterial({
        color: 0xff7a1e, transparent: true, opacity: 0.55 * inten,
        side: THREE.DoubleSide, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.02;
    g.add(disc);
    // Flames: deterministic placement (a hash, not Math.random) so successive
    // frames of a strip are comparable rather than a different fire each frame.
    const H = fire.spec.height;
    for (let i = 0; i < 70; i++) {
      const a = (i * 2.399963) % (Math.PI * 2);
      const rr = r * Math.sqrt(((i * 0.6180339887) % 1));
      const h = H * (0.35 + 0.65 * ((i * 0.7548776662) % 1)) * inten;
      if (h < 0.02) continue;
      const t = h / H;
      const m = new THREE.Mesh(
        new THREE.ConeGeometry(0.16 + 0.1 * (1 - t), h, 6),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color().setHSL(0.09 - 0.06 * t, 1.0, 0.45 + 0.2 * t),
          transparent: true, opacity: 0.55 * inten, depthWrite: false }));
      m.position.set(Math.cos(a) * rr, h / 2, Math.sin(a) * rr);
      g.add(m);
    }
    const light = new THREE.PointLight(0xff7a20, 12 * inten, r * 4);
    light.position.y = 0.6;
    g.add(light);
    g.position.copy(fire.origin);
    return g;
  };

  // Fit a camera to a scene's extent, so nothing is a speck in the middle.
  //
  // TRAP, hit on the first pass and worth stating: the start overlay and HUD
  // are DOM elements stacked ON TOP of the canvas, so a screenshot catches the
  // menu, not the render. __shot hides them; this path has to do it itself or
  // every frame comes back as a dark "BROWSER STRIKE" splash.
  window.__fit = (scene, from, look, fov = 55) => {
    document.getElementById('start')?.classList.add('hidden');
    for (const el of document.querySelectorAll('body > *:not(canvas)')) {
      el.style.display = 'none';
    }
    const cam = new THREE.PerspectiveCamera(fov, 1100 / 800, 0.05, 400);
    cam.position.set(from[0], from[1], from[2]);
    cam.up.set(0, 1, 0);
    cam.lookAt(look[0], look[1], look[2]);
    cam.updateMatrixWorld(true);
    window.__captureMode = true;
    renderer.renderer.render(scene, cam);
    return cam;
  };

  // ---- one-off scenes ----------------------------------------------------
  window.__nadeScene = (which) => {
    const scene = lit(0x4a5766);
    scene.add(ground(26));

    if (which === 'he-blast') {
      // Shells at the distances where REAL blastDamage crosses each threshold.
      const spec = G.getGrenadeSpec(G.GRENADE.HE);
      const centre = new THREE.Vector3(0, 0.9, 0);
      const bands = [];
      for (const want of [75, 50, 25, 1]) {
        let lo = 0, hi = spec.radius;
        for (let k = 0; k < 40; k++) {
          const mid = (lo + hi) / 2;
          const d = G.blastDamage(spec, centre,
            { x: centre.x + mid, y: centre.y, z: centre.z });
          if (d > want) lo = mid; else hi = mid;
        }
        bands.push({ dmg: want, r: +lo.toFixed(2) });
      }
      // Wireframe rings for the outer bands, solid only for the lethal core.
      // Solid translucent shells at every band washed the whole frame out and
      // made the victims unreadable, which defeats the point of the picture.
      const cols = [0xff2010, 0xff7a10, 0xffd020, 0x40c8ff];
      bands.forEach((b, i) => {
        const m = new THREE.Mesh(
          new THREE.SphereGeometry(b.r, 32, 22),
          new THREE.MeshBasicMaterial({ color: cols[i], transparent: true,
            opacity: i === 0 ? 0.22 : 0.10, wireframe: i > 0,
            depthWrite: false, side: THREE.DoubleSide }));
        m.position.copy(centre);
        scene.add(m);
      });
      // Core flash.
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.55, 20, 14),
        new THREE.MeshBasicMaterial({ color: 0xfff2c0 }));
      core.position.copy(centre); scene.add(core);
      scene.add(new THREE.PointLight(0xffd090, 60, 20));
      // A row of victims at 1/3/5/7m, coloured by the damage they take.
      const taken = [];
      for (const d of [1, 3, 5, 7]) {
        const sample = { x: d, y: G.EYE_HEIGHT * 0.65, z: 0 };
        const dmg = G.blastDamage(spec, centre, sample);
        taken.push({ at: d, dmg: +dmg.toFixed(1) });
        const c = new THREE.Color().setHSL(0.33 * (1 - Math.min(1, dmg / 98)), 0.9, 0.45);
        scene.add(human(d, 0, c.getHex()));
      }
      window.__fit(scene, [-3.5, 4.6, 11.5], [3.0, 1.0, 0], 50);
      return { bands, taken };
    }

    if (which === 'smoke') {
      const cloud = new G.SmokeCloud(new THREE.Vector3(0, 0.06, 0));
      cloud.update(G.GRENADE_SPECS[G.GRENADE.SMOKE].growTime);
      scene.add(window.__smokeMesh(cloud));
      // People either side, so the picture answers "does it hide a player".
      scene.add(human(-2.6, 0, 0x2f6fbf));
      scene.add(human(0, 0, 0xcf4030));
      scene.add(human(2.6, 0, 0x2f6fbf));
      window.__fit(scene, [0, 3.0, 11.5], [0, 1.4, 0], 55);
      return {
        radius: +cloud.radius.toFixed(2), opacity: +cloud.opacityAt().toFixed(2),
        centreY: +cloud.centre.y.toFixed(2),
        hidesAPlayer: cloud.blocksLineOfSight(
          { x: 0, y: 1.4, z: 9 }, { x: 0, y: 1.4, z: -9 }),
      };
    }

    if (which === 'fire') {
      const fire = new G.FireArea(new THREE.Vector3(0, 0, 0));
      fire.update(G.GRENADE_SPECS[G.GRENADE.MOLOTOV].spreadTime);
      scene.add(window.__fireMesh(fire));
      scene.add(human(-3.4, 0, 0x2f6fbf));       // safe
      scene.add(human(0.9, 0.6, 0xcf4030));      // burning
      window.__fit(scene, [-1.5, 2.0, 8.5], [0, 0.8, 0], 55);
      return {
        radius: +fire.radius.toFixed(2), height: fire.spec.height,
        intensity: +fire.intensity.toFixed(2),
        burnsTheCloseOne: fire.damageFor({ x: 0.9, y: 0, z: 0.6 }, 1) > 0,
        sparesTheFarOne: fire.damageFor({ x: -3.4, y: 0, z: 0 }, 1) === 0,
      };
    }

    if (which === 'smoke-lane') {
      // A corridor: two walls with a gap, a smoke in the gap, an enemy beyond.
      scene.add(wall(-4.2, 1.6, 0, 1.0, 3.2, 16));
      scene.add(wall(4.2, 1.6, 0, 1.0, 3.2, 16));
      const cloud = new G.SmokeCloud(new THREE.Vector3(0, 0.06, -1));
      cloud.update(G.GRENADE_SPECS[G.GRENADE.SMOKE].growTime);
      scene.add(window.__smokeMesh(cloud));
      scene.add(human(0.4, -6.5, 0xcf4030));
      const a = { x: 0, y: 1.4, z: 7 }, b = { x: 0.4, y: 1.4, z: -6.5 };
      window.__fit(scene, [0, 1.65, 7], [0.4, 1.4, -6.5], 75);
      return {
        radius: +cloud.radius.toFixed(2),
        blocksTheLane: cloud.blocksLineOfSight(a, b),
        // Same eye height, but hugging the wall: should be clear round the side.
        blocksTheWideAngle: cloud.blocksLineOfSight(
          { x: 3.4, y: 1.4, z: 7 }, { x: 3.4, y: 1.4, z: -6.5 }),
      };
    }
    return { skip: 'unknown scene ' + which };
  };

  // ---- frame strips ------------------------------------------------------
  // State persists between frames so a strip shows one continuous simulation,
  // not eight independent ones.
  window.__nadeState = {};
  window.__nadeStrip = (which, i) => {
    const S = window.__nadeState;

    if (which === 'bounce') {
      if (i === 0) {
        // A REAL CollisionWorld -- floor plus a wall -- and a real throw at it.
        const CW = window.__CW;
        const w = new CW();
        w.addBox(new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(60, 1, 60));
        w.addBox(new THREE.Vector3(6, 1.6, 0), new THREE.Vector3(0.5, 3.2, 10));
        const t = G.throwVector(new THREE.Vector3(-5, G.EYE_HEIGHT, 0),
          new THREE.Vector3(1, 0.16, 0).normalize(), G.THROW.MEDIUM);
        S.world = w;
        S.g = new G.Grenade({ type: G.GRENADE.SMOKE, position: t.position,
          velocity: t.velocity });
        S.trail = [];
      }
      // 8 frames of sim between captures: enough motion to see, fine enough
      // that the bounce is not skipped over.
      for (let k = 0; k < (i === 0 ? 1 : 8); k++) {
        S.g.fuse = 999;
        S.g.update(1 / 60, S.world);
        S.trail.push(S.g.position.clone());
      }
      const scene = lit(0x3d4a5c);
      scene.add(ground(26));
      scene.add(wall(6, 1.6, 0, 0.5, 3.2, 10));
      // A 1.8m figure at the throw point, purely as a height reference: without
      // one, "the arc peaked at 1.8m" is not something a picture can tell you.
      scene.add(human(-5, 0, 0x30506f));
      // The path so far, as fading dots. Big enough to actually see -- the
      // first pass used 0.05m spheres and the whole trajectory was invisible.
      S.trail.forEach((p, k) => {
        const age = k / Math.max(1, S.trail.length - 1);
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8),
          new THREE.MeshBasicMaterial({ color: 0x18d8ff, transparent: true,
            opacity: 0.35 + 0.55 * age }));
        m.position.copy(p); scene.add(m);
      });
      const now = new THREE.Mesh(new THREE.SphereGeometry(0.17, 18, 14),
        new THREE.MeshStandardMaterial({ color: 0x1c3a18, roughness: 0.45,
          emissive: 0x39ff4a, emissiveIntensity: 0.7 }));
      now.position.copy(S.g.position); scene.add(now);
      // A true side elevation: the camera sits well off to +Z at about the
      // arc's apex height, so the trajectory reads as an arc rather than the
      // near-ground-level foreshortened line the first pass produced.
      window.__fit(scene, [1.0, 2.4, 15.5], [1.0, 1.2, 0], 44);
      return { p: S.g.position.toArray().map((v) => +v.toFixed(2)),
        v: +S.g.velocity.length().toFixed(2), b: S.g.bounces, rest: S.g.atRest };
    }

    if (which === 'smoke') {
      if (i === 0) S.cloud = new G.SmokeCloud(new THREE.Vector3(0, 0.06, 0));
      // Sample across the whole grow phase and a little past it.
      if (i > 0) S.cloud.update(G.GRENADE_SPECS[G.GRENADE.SMOKE].growTime / 6);
      const scene = lit(0x4a5766);
      scene.add(ground(24));
      scene.add(human(-2.6, 0, 0x2f6fbf));
      scene.add(human(2.6, 0, 0x2f6fbf));
      scene.add(window.__smokeMesh(S.cloud));
      window.__fit(scene, [0, 3.0, 11.5], [0, 1.4, 0], 55);
      return { age: +S.cloud.age.toFixed(2), r: +S.cloud.radius.toFixed(2),
        op: +S.cloud.opacityAt().toFixed(2) };
    }

    if (which === 'fire') {
      if (i === 0) S.fire = new G.FireArea(new THREE.Vector3(0, 0, 0));
      if (i > 0) S.fire.update(G.GRENADE_SPECS[G.GRENADE.MOLOTOV].spreadTime / 5);
      const scene = lit(0x2b2f38);
      scene.add(ground(20));
      scene.add(human(-3.4, 0, 0x2f6fbf));
      scene.add(window.__fireMesh(S.fire));
      window.__fit(scene, [-1.2, 2.1, 8.0], [0, 0.7, 0], 55);
      return { age: +S.fire.age.toFixed(2), r: +S.fire.radius.toFixed(2),
        inten: +S.fire.intensity.toFixed(2) };
    }
    return { skip: 'unknown strip ' + which };
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
