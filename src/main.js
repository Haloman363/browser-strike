import * as THREE from 'three';
import { Renderer } from './render/renderer.js';
import { CollisionWorld } from './world/collision.js';
import { PlayerMovement } from './player/movement.js';
import { PlayerCamera } from './player/camera.js';
import { Input } from './player/input.js';

// Progress, for the capture harnesses AND for the human staring at the overlay.
// A cold load on software GL takes seconds (PMREM alone is most of it), and the
// start screen says "click to play" the whole time, so without this the game
// looks broken and unresponsive rather than busy.
const stage = (s) => {
  window.__stage = s;
  const el = document.getElementById('stage');
  if (el) el.textContent = s;
};

stage('renderer');
const canvas = document.getElementById('game');
const renderer = new Renderer(canvas);
renderer.resize();

const world = new CollisionWorld();

// Modules built by parallel agents. Load each defensively: a failure in one
// should leave the rest of the game inspectable rather than blanking the page.
//
// The loader takes a thunk, not a path string. An `import(path)` on a variable
// is opaque to Vite, so the module never gets bundled and 404s in production
// while working fine against the dev server. A literal import() inside the
// caller's thunk is statically analysable and bundles correctly.
async function tryLoad(load, fn, label) {
  try {
    const mod = await load();
    return await fn(mod);
  } catch (e) {
    console.error(`[${label}] unavailable:`, e);
    const el = document.getElementById('err');
    el.style.display = 'block';
    el.textContent += `[${label}] ${e.message}\n`;
    return null;
  }
}

const maxAniso = renderer.renderer.capabilities.getMaxAnisotropy();

stage('materials');
const materials = await tryLoad(() => import('./render/materials.js'), async (m) => {
  const mats = new m.Materials();
  // Materials is the long pole on software GL (~17s of a ~20s cold load), so it
  // reports per-material progress rather than sitting on one static label.
  return await mats.build(maxAniso, (done, total, name) => {
    stage(name ? `materials ${done + 1}/${total} · ${name}` : 'materials');
  });
}, 'materials') ?? fallbackMaterials();

stage('map');
const mapData = await tryLoad(() => import('./world/map.js'),
  (m) => m.buildMap(renderer.scene, world, materials), 'map') ?? fallbackMap();

const spawn = mapData.spawns?.[0] ?? new THREE.Vector3(0, 2, 0);
const movement = new PlayerMovement(world, spawn.clone());
const playerCam = new PlayerCamera(renderer.camera);
const input = new Input(canvas);

stage('rifle');
const rifle = await tryLoad(() => import('./weapons/rifle.js'),
  (m) => new m.Rifle(renderer.scene, renderer.camera, world, { materials }), 'rifle');

// The viewmodel lives in its own scene, so it needs the environment map handed
// to it explicitly — without one, gunmetal has nothing to reflect and renders
// as a black silhouette no matter how bright the lights are.
if (rifle?.vmScene) {
  rifle.vmScene.environment = renderer.scene.environment;
  rifle.vmScene.environmentIntensity = 0.85;
}

stage('bots');
const bots = await tryLoad(() => import('./ai/bot.js'), (m) => {
  const points = mapData.botPoints ?? [];
  return (mapData.spawns ?? []).slice(1, 3).map(
    (p) => new m.Bot(renderer.scene, world, p.clone(), points));
}, 'bots') ?? [];

// Aim the sun at the middle of the play space so the shadow box is centred.
renderer.sun.target.position.copy(mapData.bounds?.center ?? new THREE.Vector3());
renderer.sun.target.updateMatrixWorld();

// --- HUD ---------------------------------------------------------------
const hud = {
  hp: document.getElementById('hp'),
  mag: document.getElementById('mag'),
  reserve: document.getElementById('reserve'),
  marker: document.getElementById('hitmarker'),
  damage: document.getElementById('damage'),
  ct: document.getElementById('ct'), cb: document.getElementById('cb'),
  cl: document.getElementById('cl'), cr: document.getElementById('cr'),
};

let health = 100;
let markerTimer = 0;

// --- Multiplayer -------------------------------------------------------
// Null until the player hosts or joins. While it is null main.js runs the
// exact singleplayer path it always did, so a broker outage or a blocked
// WebRTC connection costs the offline game nothing.
let match = null;
// Reused each tick; the net layer copies out of it rather than retaining it.
const localState = {
  position: movement.position, yaw: 0, pitch: 0, crouching: false, alive: true,
};

function setCrosshairGap(px) {
  const g = Math.round(px);
  hud.ct.style.transform = `translateY(${-g - 7}px)`;
  hud.cb.style.transform = `translateY(${g}px)`;
  hud.cl.style.transform = `translateX(${-g - 7}px)`;
  hud.cr.style.transform = `translateX(${g}px)`;
}
setCrosshairGap(4);

// --- Lobby -------------------------------------------------------------
const mp = {
  panel: document.getElementById('mp'),
  hostBtn: document.getElementById('mp-host'),
  joinBtn: document.getElementById('mp-join'),
  code: document.getElementById('mp-code'),
  status: document.getElementById('mp-status'),
};

function mpStatus(text) { if (mp.status) mp.status.textContent = text; }

async function startMatch(kind) {
  if (match) return;
  mp.hostBtn.disabled = mp.joinBtn.disabled = true;
  mpStatus(kind === 'host' ? 'creating room...' : 'connecting...');
  try {
    const m = new (await import('./net/match.js')).Match({
      scene: renderer.scene, world, spawns: mapData.spawns ?? [],
    });
    if (kind === 'host') {
      const code = await m.host();
      mpStatus(`room ${code} — waiting for players, click to play`);
    } else {
      await m.join(mp.code.value.trim().toUpperCase());
      mpStatus('connected — click to play');
    }
    m.onEvent = () => {};
    match = m;
    // The AI bots are singleplayer filler; a real opponent replaces them.
    for (const bot of bots) bot.dispose?.();
    bots.length = 0;
  } catch (e) {
    // A dead broker or a bad code must not take the offline game down with it.
    console.error('[match]', e);
    mpStatus(`failed: ${e.message}`);
    mp.hostBtn.disabled = mp.joinBtn.disabled = false;
  }
}

mp.hostBtn?.addEventListener('click', (e) => { e.stopPropagation(); startMatch('host'); });
mp.joinBtn?.addEventListener('click', (e) => { e.stopPropagation(); startMatch('join'); });
// The overlay itself grabs pointer lock; without this, typing a room code
// would start the game on the first keystroke's click.
mp.panel?.addEventListener('click', (e) => e.stopPropagation());

document.getElementById('start').addEventListener('click', () => canvas.requestPointerLock());
document.addEventListener('pointerlockchange', () => {
  document.getElementById('start').classList.toggle(
    'hidden', document.pointerLockElement === canvas);
});

// --- Loop --------------------------------------------------------------
// Fixed-step simulation: movement and recoil must not vary with frame rate.
const TICK = 1 / 128;
let accumulator = 0;
let last = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  if (window.__captureMode) return; // capture harness owns the camera
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25; // tab was backgrounded

  const state = input.sample();
  if (input.locked) playerCam.onMouseMove(state.dx, state.dy);

  accumulator += dt;
  let steps = 0;
  while (accumulator >= TICK && steps < 8) {
    if (input.locked) movement.update(state, playerCam.yaw, TICK);
    if (match?.active) {
      localState.position = movement.position;
      localState.yaw = playerCam.yaw;
      localState.pitch = playerCam.pitch;
      localState.crouching = movement.crouching;
      match.fixedStep(localState);
      match.sendLocalState(localState);
    }
    accumulator -= TICK;
    steps++;
  }

  playerCam.update(movement, dt);
  if (match?.active) match.update(dt, localState);

  if (rifle) {
    const ammoBefore = rifle.ammo;
    rifle.update(dt, state, movement, playerCam);
    // Firing happens inside rifle.update(), so detect it by the round leaving
    // the magazine rather than restructuring the weapon around a callback.
    // A reload raises ammo, so only a decrease counts as a shot.
    if (match?.active && rifle.ammo < ammoBefore && rifle.lastShot) {
      match.reportShot(rifle.lastShot.origin, rifle.lastShot.direction);
    }
    hud.mag.textContent = rifle.ammo;
    hud.reserve.textContent = `/ ${rifle.reserve}`;
    if (rifle.spread !== undefined) setCrosshairGap(4 + rifle.spread * 900);
  }

  for (const bot of bots) bot.update(dt, playerCam.camera.position, movement.position);

  if (markerTimer > 0) {
    markerTimer -= dt;
    hud.marker.style.opacity = Math.max(0, markerTimer / 0.12);
  }

  // In a match the host owns health; locally-tracked damage would let a client
  // simply decline to believe it had been shot.
  hud.hp.textContent = Math.max(0, Math.round(match?.active ? match.localHealth : health));
  renderer.render();
  // Viewmodel renders last, in its own scene with the depth buffer cleared,
  // so the gun can never clip into walls.
  if (rifle) rifle.renderViewmodel(renderer.renderer);
}
requestAnimationFrame(frame);

// --- Fallbacks ---------------------------------------------------------
// Used only when an agent module is missing, so the pipeline stays testable.
function fallbackMaterials() {
  const mk = (c, r) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
  return {
    sandstone: mk(0xc4a97e, 0.92), plaster: mk(0xded0b8, 0.88),
    terracotta: mk(0xb06442, 0.85), concrete: mk(0xa8a293, 0.9),
    wood: mk(0x8a6640, 0.82), metal: mk(0x6f6a63, 0.45),
    sand: mk(0xcbb083, 0.96), crate: mk(0x9c7448, 0.8),
  };
}

function fallbackMap() {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    new THREE.MeshStandardMaterial({ color: 0xcbb083, roughness: 0.96 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  renderer.scene.add(ground);
  world.addBox(new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(80, 1, 80));

  // A few blocks so lighting and shadows have something to work with.
  for (let i = 0; i < 6; i++) {
    const s = 1 + (i % 3);
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(s, s, s),
      new THREE.MeshStandardMaterial({ color: 0xb59a72, roughness: 0.9 }));
    const x = Math.cos(i / 6 * Math.PI * 2) * 8;
    const z = Math.sin(i / 6 * Math.PI * 2) * 8;
    box.position.set(x, s / 2, z);
    box.castShadow = box.receiveShadow = true;
    renderer.scene.add(box);
    world.addBox(box.position.clone(), new THREE.Vector3(s, s, s));
  }

  return {
    spawns: [new THREE.Vector3(0, 2, 0)],
    botPoints: [],
    bounds: { center: new THREE.Vector3() },
  };
}

// Capture harness: fixed vantage points so screenshots are comparable between
// iterations. Drives the camera directly, bypassing the player controller.
window.__shot = (pos, lookAt, fov = 90) => {
  window.__captureMode = true;
  document.getElementById('start').classList.add('hidden');
  document.getElementById('hud').style.display = 'none';
  const cam = renderer.camera;
  cam.fov = fov;
  cam.updateProjectionMatrix();
  cam.position.set(pos[0], pos[1], pos[2]);
  cam.up.set(0, 1, 0);
  cam.lookAt(lookAt[0], lookAt[1], lookAt[2]);
  renderer.render();
  return true;
};
// Park a bot at a fixed spot in a chosen pose, for visual inspection. The
// model is slaved to the physics body, so move the body and tick once.
window.__poseBot = (bot, { at = [0, 0, 0], yaw = 0, walk = 0 } = {}) => {
  const centreY = at[1] + bot.half.y;
  bot.position.set(at[0], centreY, at[2]);
  bot.velocity.set(0, 0, 0);
  bot.yaw = bot.aimYaw = yaw;
  bot.state = 'PATROL';
  if (walk) {
    // Advance the gait far enough to reach a clear mid-stride pose.
    for (let i = 0; i < 24; i++) {
      bot.velocity.set(Math.sin(yaw) * walk, 0, Math.cos(yaw) * walk);
      bot.position.set(at[0], centreY, at[2]);
      bot.update(1 / 60, new THREE.Vector3(0, 1.6, 40), new THREE.Vector3(0, 0, 40));
    }
  }
  bot.position.set(at[0], centreY, at[2]);
  bot.update(1 / 60, new THREE.Vector3(0, 1.6, 40), new THREE.Vector3(0, 0, 40));
  return {
    modelPos: bot.model.position.toArray().map((v) => +v.toFixed(2)),
    state: bot.state,
    meshes: (() => { let n = 0; bot.model.traverse((o) => { if (o.isMesh) n++; }); return n; })(),
  };
};

// Drive a bot to an exact fraction `t` of its gait cycle, for frame-strip
// capture. Steps the real update() so what is captured is what plays.
window.__animPose = ({ at = [0, 0, 0], yaw = 0, speed = 3.2, t = 0 } = {}) => {
  const bot = bots[0];
  if (!bot) return null;
  const eye = new THREE.Vector3(at[0], 1.6, at[2] + 40);
  const feet = new THREE.Vector3(at[0], 0, at[2] + 40);
  const vel = new THREE.Vector3(Math.sin(yaw) * speed, 0, Math.cos(yaw) * speed);
  // Body CENTRE, derived from the capsule's own half-height. Hardcoding 0.93
  // parked the feet plane 24.5cm above the paving and the bot looked airborne.
  const centreY = at[1] + bot.half.y;

  // Settle first so damped joints are at their steady-state for this speed,
  // otherwise every strip frame shows the rig still easing in from rest.
  for (let i = 0; i < 60; i++) {
    bot.position.set(at[0], centreY, at[2]);
    bot.velocity.copy(vel);
    bot.yaw = bot.aimYaw = yaw;
    bot.update(1 / 60, eye, feet);
  }
  // Standing still, the gait phase does not advance, so sampling by phase
  // would show eight identical frames. Advance the idle clocks over time
  // instead so breathing and weight-shift are actually visible in the strip.
  if (speed < 0.15) {
    const period = 6.0;
    for (let i = 0; i < Math.round(t * period * 60); i++) {
      bot.position.set(at[0], centreY, at[2]);
      bot.velocity.set(0, 0, 0);
      bot.update(1 / 60, eye, feet);
    }
    bot.position.set(at[0], centreY, at[2]);
    bot.model.position.set(at[0], bot.model.position.y, at[2]);
    return { idleT: +t.toFixed(2) };
  }

  // Then walk the phase to exactly t.
  bot.phase = t * Math.PI * 2;
  bot.position.set(at[0], centreY, at[2]);
  bot.velocity.copy(vel);
  bot.yaw = bot.aimYaw = yaw;
  bot.update(1 / 600, eye, feet);
  bot.position.set(at[0], centreY, at[2]);
  bot.model.position.set(at[0], bot.model.position.y, at[2]);
  return { phase: +bot.phase.toFixed(3) };
};

window.__dbg = { renderer, world, materials, mapData, movement, rifle, bots, THREE };
// Live match, for the two-browser harness. A getter, not a snapshot: match is
// null until someone hosts or joins.
Object.defineProperty(window, '__match', { get: () => match });
// Set last: the capture script waits on this, so everything above must exist.
stage('ready');
// Swap the overlay from progress to controls. Only now is clicking meaningful:
// pointer lock and the multiplayer buttons are both live from here.
document.getElementById('start')?.classList.remove('loading');
window.__ready = true;

export { renderer, world, movement, playerCam, mapData };
