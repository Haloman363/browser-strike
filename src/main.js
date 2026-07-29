import * as THREE from 'three';
import { Renderer } from './render/renderer.js';
import { CollisionWorld } from './world/collision.js';
import { PlayerMovement } from './player/movement.js';
import { PlayerCamera } from './player/camera.js';
import { Input } from './player/input.js';

const canvas = document.getElementById('game');
const renderer = new Renderer(canvas);
renderer.resize();

const world = new CollisionWorld();

// Modules built by parallel agents. Load each defensively: a failure in one
// should leave the rest of the game inspectable rather than blanking the page.
async function tryLoad(path, fn, label) {
  try {
    const mod = await import(/* @vite-ignore */ path);
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

const materials = await tryLoad('./render/materials.js', async (m) => {
  const mats = new m.Materials();
  return await mats.build(maxAniso);
}, 'materials') ?? fallbackMaterials();

const mapData = await tryLoad('./world/map.js',
  (m) => m.buildMap(renderer.scene, world, materials), 'map') ?? fallbackMap();

const spawn = mapData.spawns?.[0] ?? new THREE.Vector3(0, 2, 0);
const movement = new PlayerMovement(world, spawn.clone());
const playerCam = new PlayerCamera(renderer.camera);
const input = new Input(canvas);

const rifle = await tryLoad('./weapons/rifle.js',
  (m) => new m.Rifle(renderer.scene, renderer.camera, world), 'rifle');

const bots = await tryLoad('./ai/bot.js', (m) => {
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

function setCrosshairGap(px) {
  const g = Math.round(px);
  hud.ct.style.transform = `translateY(${-g - 7}px)`;
  hud.cb.style.transform = `translateY(${g}px)`;
  hud.cl.style.transform = `translateX(${-g - 7}px)`;
  hud.cr.style.transform = `translateX(${g}px)`;
}
setCrosshairGap(4);

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
    accumulator -= TICK;
    steps++;
  }

  playerCam.update(movement, dt);

  if (rifle) {
    rifle.update(dt, state, movement, playerCam);
    hud.mag.textContent = rifle.ammo;
    hud.reserve.textContent = `/ ${rifle.reserve}`;
    if (rifle.spread !== undefined) setCrosshairGap(4 + rifle.spread * 900);
  }

  for (const bot of bots) bot.update(dt, playerCam.camera.position, movement.position);

  if (markerTimer > 0) {
    markerTimer -= dt;
    hud.marker.style.opacity = Math.max(0, markerTimer / 0.12);
  }

  hud.hp.textContent = Math.max(0, Math.round(health));
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
window.__dbg = { renderer, world, materials, mapData, movement, rifle, bots, THREE };
// Set last: the capture script waits on this, so everything above must exist.
window.__ready = true;

export { renderer, world, movement, playerCam, mapData };
