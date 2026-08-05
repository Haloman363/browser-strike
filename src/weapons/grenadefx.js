import * as THREE from 'three';
import { GRENADE, GRENADE_SPECS } from './grenades.js';

// GRENADE FX -- the view layer for grenades.js.
//
// grenades.js is a pure simulation: it owns radii, opacities, intensities and
// positions, and it has no idea a renderer exists. Everything in this file
// READS that state and never writes it. If a picture and the simulation
// disagree, the picture is wrong.
//
// -------------------------------------------------------------------------
// WHY THE SMOKE IS DRAWN AS PUFFS AND NOT AS SHELLS
// -------------------------------------------------------------------------
// The first attempt drew SmokeCloud.radius as twelve concentric translucent
// spheres. Every shell is a closed surface with a hard silhouette, so the
// composite had twelve visible edges and read as a bullseye target rather than
// as a volume -- the alpha steps between shells are constant across the whole
// sphere, so the human eye locks onto them as rings. Adding more shells makes
// more rings; it does not make a cloud.
//
// The fix is to stop drawing SURFACES. A cloud is drawn here as ~64 camera-
// facing billboard quads scattered through the volume, each with a radial soft
// falloff baked into a canvas texture, at varied scale, rotation and opacity.
// Overlapping soft-edged sprites accumulate into a continuous density field
// with no shared silhouette anywhere, which is how every real-time engine has
// drawn smoke since Quake. It costs one draw call per puff of an
// already-uploaded 128px texture and no custom shader, so SwiftShader survives
// it.
//
// -------------------------------------------------------------------------
// GROUND CLAMPING: A DELIBERATE, BOUNDED RENDERER/SIM DIVERGENCE
// -------------------------------------------------------------------------
// The simulation's cloud is a SPHERE centred spec.centreLift (1.3m) above the
// impact point with radius 3.6m, so its lower hemisphere reaches y = -2.3:
// more than two metres of the drawn cloud was underground, and what was left
// above the floor was the sphere's upper cap -- a ball floating at head height
// with a visible gap of clear air beneath it. That is the second documented
// fault and it is a RENDERING fault: the sim never claimed the cloud was a
// dome, and SmokeCloud's own comment already names "a real CS smoke is a
// squashed dome that hugs the floor" as a known approximation.
//
// So the sim is UNCHANGED -- its sphere is still the LOS shape, still mutation
// tested -- and the renderer draws the part of that sphere that a player can
// actually see: puff centres are sampled in the sphere then clamped to sit at
// or above `groundY`, and the field is squashed vertically toward the floor.
// The divergence is one-directional and bounded: the drawn cloud is a SUBSET
// of the sim's sphere in the vertical axis and identical to it horizontally,
// so the renderer can never show clear air where the sim says "blocked" at any
// standing or crouching eye height. It can show smoke slightly lower than the
// sphere's underside, which is exactly the direction a real smoke errs in.
// `smokePuffField` returns the puff centres so a test can assert both halves
// of that claim without a GPU.

const TAU = Math.PI * 2;

/**
 * Deterministic hash-based unit noise. Math.random() would make every frame of
 * a capture strip a different cloud, which makes visual regressions impossible
 * to compare. Same input, same puff, forever.
 */
export function hash01(i, salt = 0) {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

// ---------------------------------------------------------------------------
// Textures
// ---------------------------------------------------------------------------

let _puffTex = null;
/**
 * A soft radial blob. The alpha ramp is the whole trick: a LINEAR ramp leaves a
 * faint but visible disc edge that reads as a ring once dozens overlap, so the
 * falloff is cubed, which puts the edge alpha derivative at zero and makes the
 * boundary genuinely invisible. Slight per-texel noise breaks up the perfect
 * radial symmetry that otherwise survives the accumulation as banding.
 */
export function puffTexture(size = 128) {
  if (_puffTex) return _puffTex;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const half = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - half) / half, dy = (y - half) / half;
      const d = Math.hypot(dx, dy);
      let a = Math.max(0, 1 - d);
      a = a * a * a;                                  // cubic: zero-slope edge
      // Low-amplitude value noise so the blob is not a perfect gradient.
      const n = 0.86 + 0.14 * hash01(x * 0.37 + 1, y * 0.53 + 1);
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(Math.max(0, Math.min(1, a * n)) * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  _puffTex = t;
  return t;
}

let _flameTex = null;
/**
 * A flame blob: opaque hot core, soft top, alpha dying off toward the edges.
 * Vertically asymmetric (denser low, wispy high) so a billboard of it reads as
 * a tongue of fire rather than a glowing dot.
 */
export function flameTexture(size = 128) {
  if (_flameTex) return _flameTex;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const half = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // v: 0 at the bottom of the texture, 1 at the top.
      const v = 1 - y / (size - 1);
      const dx = (x - half) / half;
      // Flame narrows with height, so the horizontal extent shrinks as v rises.
      const width = 1.0 - 0.55 * v * v;
      const r = Math.abs(dx) / Math.max(0.08, width);
      let a = Math.max(0, 1 - r);
      a = a * a;
      // Fade out the very top and feather the base into the ground.
      a *= Math.max(0, 1 - Math.pow(Math.max(0, v - 0.25) / 0.75, 1.6));
      a *= Math.min(1, v / 0.12 + 0.15);
      const n = 0.7 + 0.3 * hash01(x * 0.21 + 3, y * 0.41 + 7);
      // Colour: white-hot low, orange mid, deep red at the tip.
      const t = Math.min(1, v * 1.15);
      const rr = 255;
      const gg = Math.round(235 - 175 * t);
      const bb = Math.round(190 - 185 * Math.min(1, t * 1.6));
      const i = (y * size + x) * 4;
      img.data[i] = rr; img.data[i + 1] = gg; img.data[i + 2] = bb;
      img.data[i + 3] = Math.round(Math.max(0, Math.min(1, a * n)) * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  _flameTex = t;
  return t;
}

// ---------------------------------------------------------------------------
// Smoke
// ---------------------------------------------------------------------------

/** How many billboards make one cloud. 64 is where the density stops looking
 *  lumpy on SwiftShader without the fill cost becoming the frame budget. */
export const SMOKE_PUFFS = 64;

/**
 * Puff layout for one cloud, as pure geometry. Extracted from the mesh builder
 * so the ground-clamp and containment claims above are testable in Node with no
 * WebGL context at all.
 *
 * @param {number} radius   cloud radius, from SmokeCloud.radius
 * @param {number} centreY  cloud centre height, from SmokeCloud.centre.y
 * @param {number} groundY  the floor the cloud sits on (impact point y)
 * @param {number} [count]
 * @returns {Array<{x:number,y:number,z:number,scale:number,rot:number,alpha:number}>}
 *   positions are RELATIVE to the cloud centre.
 */
export function smokePuffField(radius, centreY, groundY, count = SMOKE_PUFFS) {
  const out = [];
  if (!(radius > 0.001)) return out;
  // How far the sphere's underside is below the floor. Everything below the
  // floor gets folded back up into the visible half rather than discarded --
  // discarding it would leave the cloud thin near the ground, which is the
  // opposite of what a real smoke does.
  const floorRel = groundY - centreY;         // negative when centre is aloft

  for (let i = 0; i < count; i++) {
    // Fibonacci-ish spherical sampling, radius biased toward the rim so the
    // shell of the volume is populated (a uniform-in-r sample clumps at the
    // centre and leaves a translucent halo that shows the sphere's edge).
    const u = hash01(i, 1) * 2 - 1;
    const phi = hash01(i, 2) * TAU;
    const rr = radius * (0.30 + 0.70 * Math.cbrt(hash01(i, 3)));
    const s = Math.sqrt(Math.max(0, 1 - u * u));
    let px = Math.cos(phi) * s * rr;
    let pz = Math.sin(phi) * s * rr;
    // Squash vertically: a real smoke is wider than it is tall. 0.72 keeps the
    // cloud tall enough to block a standing sightline while pulling the top
    // down out of "floating ball" territory.
    let py = u * rr * 0.72;

    // Ground clamp. A puff whose centre is below the floor is mirrored back up
    // and then nudged, so the densest band ends up sitting ON the ground.
    if (py < floorRel) py = floorRel + (floorRel - py) * 0.35;
    // Never let a puff centre sit under the floor at all.
    if (py < floorRel) py = floorRel;

    const height = py - floorRel;             // metres above the ground
    // Puffs are bigger low down (the cloud pools and pours) and smaller at the
    // crown, which kills the hard spherical top.
    const highT = Math.min(1, height / Math.max(0.001, radius * 1.4));
    const scale = radius * (0.62 + 0.30 * hash01(i, 4)) * (1.0 - 0.28 * highT);
    // Per-puff opacity noise. Constant alpha across the field is what made the
    // shells read as bands; varied alpha is what makes it read as smoke.
    const alpha = 0.30 + 0.42 * hash01(i, 5);
    out.push({ x: px, y: py, z: pz, scale, rot: hash01(i, 6) * TAU, alpha });
  }
  return out;
}

/**
 * A rendered smoke cloud. Owns a THREE.Group of sprites and re-reads the
 * simulation every frame.
 */
export class SmokeView {
  /**
   * @param {object} cloud    a live SmokeCloud
   * @param {number} groundY  floor height under the cloud (the impact y)
   */
  constructor(cloud, groundY = cloud.centre.y - (cloud.spec?.centreLift ?? 0)) {
    this.cloud = cloud;
    this.groundY = groundY;
    this.group = new THREE.Group();
    this.group.renderOrder = 4;
    const tex = puffTexture();
    this.sprites = [];
    for (let i = 0; i < SMOKE_PUFFS; i++) {
      const mat = new THREE.SpriteMaterial({
        map: tex,
        // Slightly cool grey. Pure white blows out under ACES and turns the
        // cloud into a hole in the frame.
        color: new THREE.Color().setHSL(0.6, 0.03, 0.72 + 0.08 * hash01(i, 7)),
        transparent: true,
        opacity: 0,
        depthWrite: false,
        depthTest: true,
        fog: true,
      });
      const sp = new THREE.Sprite(mat);
      sp.renderOrder = 4;
      this.group.add(sp);
      this.sprites.push(sp);
    }
    this.sync();
  }

  /** Pull the current radius/opacity out of the sim and lay the puffs out. */
  sync() {
    const c = this.cloud;
    const r = c.radius;
    const op = c.opacityAt();
    this.group.position.copy(c.centre);
    const field = smokePuffField(r, c.centre.y, this.groundY, SMOKE_PUFFS);
    for (let i = 0; i < this.sprites.length; i++) {
      const sp = this.sprites[i];
      const p = field[i];
      if (!p) { sp.visible = false; continue; }
      sp.visible = true;
      sp.position.set(p.x, p.y, p.z);
      sp.scale.setScalar(p.scale);
      sp.material.rotation = p.rot;
      sp.material.opacity = p.alpha * op;
    }
  }

  update() { this.sync(); }

  dispose() {
    for (const sp of this.sprites) sp.material.dispose();
    this.group.removeFromParent();
  }
}

// ---------------------------------------------------------------------------
// Fire
// ---------------------------------------------------------------------------

/** Flame billboards per fire. */
export const FIRE_FLAMES = 46;

/**
 * Flame layout for a molotov, as pure geometry.
 *
 * WHY THE OLD DISTRIBUTION WAS WRONG: it placed flames at
 * `r * sqrt(hash)`, which is the standard "uniform over a DISC" transform --
 * uniform by AREA, which means MOST samples land near the rim, because the rim
 * has most of the area. Combined with thin cone geometry the result was a ring
 * of spikes brightest at the edge with a hollow middle: the exact opposite of a
 * pool of burning fuel, which is densest where the bottle broke.
 *
 * Here the radial term is `r * hash^1.4`, biasing samples INWARD, and flame
 * height falls off toward the rim, so the fire is a mass with a hot core that
 * tapers into low licking flame at the edge.
 *
 * @returns {Array<{x:number,z:number,h:number,w:number,rot:number,alpha:number,
 *   coreT:number}>} positions relative to the fire origin.
 */
export function fireFlameField(radius, height, intensity, count = FIRE_FLAMES) {
  const out = [];
  if (!(radius > 0.001) || !(intensity > 0)) return out;
  for (let i = 0; i < count; i++) {
    const a = hash01(i, 11) * TAU;
    // ^1.4 concentrates toward the centre. sqrt() did the opposite.
    const rr = radius * Math.pow(hash01(i, 12), 1.4);
    const edgeT = rr / radius;                       // 0 core, 1 rim
    // Tall in the middle, low at the edges.
    const h = height * (0.45 + 0.55 * hash01(i, 13)) * (1 - 0.55 * edgeT) * intensity;
    if (h < 0.05) continue;
    // Wide flames, not spikes. A flame is roughly as wide as it is tall low
    // down; the old cones were 0.16m wide and 1.8m tall, i.e. spikes.
    const w = h * (0.55 + 0.35 * hash01(i, 14));
    out.push({
      x: Math.cos(a) * rr,
      z: Math.sin(a) * rr,
      h, w,
      rot: (hash01(i, 15) - 0.5) * 0.5,
      alpha: (0.55 + 0.45 * hash01(i, 16)) * intensity,
      coreT: 1 - edgeT,
    });
  }
  return out;
}

/** A rendered molotov fire: a glowing floor pool plus flame billboards. */
export class FireView {
  constructor(fire) {
    this.fire = fire;
    this.group = new THREE.Group();
    this.group.position.copy(fire.origin);
    this.group.renderOrder = 5;

    this.pool = new THREE.Mesh(
      new THREE.CircleGeometry(1, 36),
      new THREE.MeshBasicMaterial({
        map: puffTexture(), color: 0xff6a12, transparent: true,
        opacity: 0.6, depthWrite: false, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }));
    this.pool.rotation.x = -Math.PI / 2;
    this.pool.position.y = 0.03;
    this.group.add(this.pool);

    const tex = flameTexture();
    this.sprites = [];
    for (let i = 0; i < FIRE_FLAMES; i++) {
      const mat = new THREE.SpriteMaterial({
        map: tex, transparent: true, opacity: 0, depthWrite: false,
        // Additive: overlapping flames get HOTTER, which is what makes the
        // centre of the pool read as the brightest part instead of the rim.
        blending: THREE.AdditiveBlending, fog: false,
      });
      const sp = new THREE.Sprite(mat);
      // Sprite centre defaults to the middle of the quad; anchoring at the
      // bottom keeps the flame rooted to the floor as it changes height.
      sp.center.set(0.5, 0);
      this.group.add(sp);
      this.sprites.push(sp);
    }

    this.light = new THREE.PointLight(0xff7a20, 0, 12);
    this.light.position.y = 0.7;
    this.group.add(this.light);
    this.flicker = 0;
    this.sync(0);
  }

  sync(dt = 0) {
    const f = this.fire;
    const r = f.radius, inten = f.intensity;
    this.flicker += dt;
    const field = fireFlameField(r, f.spec.height, inten, FIRE_FLAMES);

    this.pool.scale.setScalar(Math.max(0.001, r * 1.15));
    this.pool.material.opacity = 0.5 * inten;
    this.pool.visible = r > 0.001;

    for (let i = 0; i < this.sprites.length; i++) {
      const sp = this.sprites[i];
      const p = field[i];
      if (!p) { sp.visible = false; continue; }
      sp.visible = true;
      // Per-flame flicker, out of phase so the pool shimmers rather than
      // pulsing as one block.
      const ph = hash01(i, 17) * TAU;
      const fl = 0.82 + 0.18 * Math.sin(this.flicker * 9 + ph);
      sp.position.set(p.x, 0.0, p.z);
      sp.scale.set(p.w, p.h * fl, 1);
      sp.material.rotation = p.rot;
      sp.material.opacity = p.alpha * fl;
      // Core flames burn whiter.
      sp.material.color.setRGB(1, 0.62 + 0.28 * p.coreT, 0.22 + 0.3 * p.coreT);
    }

    this.light.intensity = 14 * inten * (0.85 + 0.15 * Math.sin(this.flicker * 7));
    this.light.distance = Math.max(1, r * 4);
  }

  update(dt) { this.sync(dt); }

  dispose() {
    for (const sp of this.sprites) sp.material.dispose();
    this.pool.geometry.dispose();
    this.pool.material.dispose();
    this.group.removeFromParent();
  }
}

// ---------------------------------------------------------------------------
// The projectile itself
// ---------------------------------------------------------------------------

/** Body colour per grenade type, so a thrown nade is identifiable in flight. */
export const NADE_COLOR = {
  [GRENADE.HE]: 0x33452a,
  [GRENADE.FLASH]: 0x8c8f96,
  [GRENADE.SMOKE]: 0x4a5f70,
  [GRENADE.MOLOTOV]: 0x9a5a22,
  [GRENADE.DECOY]: 0x5d4f2a,
};

/** A thrown grenade in flight: a small tumbling body slaved to Grenade.position. */
export class ProjectileView {
  constructor(grenade) {
    this.grenade = grenade;
    const col = NADE_COLOR[grenade.type] ?? 0x555555;
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 12, 9),
      new THREE.MeshStandardMaterial({ color: col, roughness: 0.55, metalness: 0.2 }));
    this.mesh.castShadow = true;
    this.mesh.position.copy(grenade.position);
    this.spin = new THREE.Vector3(
      2 + hash01(1, 21) * 6, 3 + hash01(2, 22) * 6, 1 + hash01(3, 23) * 5);
  }

  update(dt) {
    this.mesh.position.copy(this.grenade.position);
    // Tumble only while moving; a resting grenade that keeps spinning looks
    // like a bug.
    if (!this.grenade.atRest) {
      this.mesh.rotation.x += this.spin.x * dt;
      this.mesh.rotation.y += this.spin.y * dt;
      this.mesh.rotation.z += this.spin.z * dt;
    }
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh.removeFromParent();
  }
}

// ---------------------------------------------------------------------------
// One-shot detonation pops
// ---------------------------------------------------------------------------

/**
 * A short-lived flash/blast puff. Purely cosmetic and self-expiring; it carries
 * no simulation state, so it is safe for a client to spawn locally even when
 * the host owns the damage.
 */
export class BurstView {
  constructor(position, { color = 0xffe6b0, radius = 1.2, life = 0.35,
    light = 40 } = {}) {
    this.life = life;
    this.age = 0;
    this.radius = radius;
    this.group = new THREE.Group();
    this.group.position.copy(position);
    this.mat = new THREE.SpriteMaterial({
      map: puffTexture(), color, transparent: true, opacity: 1,
      depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    });
    this.sprite = new THREE.Sprite(this.mat);
    this.sprite.scale.setScalar(radius);
    this.group.add(this.sprite);
    this.light = new THREE.PointLight(color, light, radius * 8);
    this.group.add(this.light);
    this.dead = false;
  }

  update(dt) {
    this.age += dt;
    const t = Math.min(1, this.age / this.life);
    // Fast expansion, quick decay -- an explosion is over before you see it.
    this.sprite.scale.setScalar(this.radius * (0.4 + 1.6 * t));
    this.mat.opacity = Math.max(0, 1 - t) ** 1.5;
    this.light.intensity = Math.max(0, 1 - t) * 40;
    if (t >= 1) this.dead = true;
  }

  dispose() {
    this.mat.dispose();
    this.group.removeFromParent();
  }
}

// ---------------------------------------------------------------------------
// The manager
// ---------------------------------------------------------------------------

/**
 * Mirrors a GrenadeSystem into a THREE.Scene.
 *
 * Strictly one-way: this reads `system.projectiles`, `system.smokes` and
 * `system.fires` every frame and adds/removes views to match. It never mutates
 * the simulation, so a host and a client running the same system get the same
 * picture, and the effects can be driven from replayed network events on a
 * client that owns no simulation at all.
 */
export class GrenadeFX {
  constructor(scene, system = null) {
    this.scene = scene;
    this.system = system;
    /** @type {Map<object, ProjectileView>} */
    this.projectiles = new Map();
    /** @type {Map<object, SmokeView>} */
    this.smokes = new Map();
    /** @type {Map<object, FireView>} */
    this.fires = new Map();
    /** @type {BurstView[]} */
    this.bursts = [];
  }

  /** Cosmetic pop for a detonation. Safe on clients; carries no damage. */
  burst(type, position) {
    const opts = {
      [GRENADE.HE]: { color: 0xffd79a, radius: 2.2, life: 0.4, light: 90 },
      [GRENADE.FLASH]: { color: 0xffffff, radius: 3.0, life: 0.3, light: 160 },
      [GRENADE.SMOKE]: { color: 0xd8d8d4, radius: 1.2, life: 0.3, light: 10 },
      [GRENADE.MOLOTOV]: { color: 0xff9430, radius: 1.8, life: 0.4, light: 60 },
      [GRENADE.DECOY]: { color: 0xfff0c0, radius: 0.7, life: 0.2, light: 20 },
    }[type] ?? {};
    const b = new BurstView(position, opts);
    this.scene.add(b.group);
    this.bursts.push(b);
    return b;
  }

  /** Reconcile views against the simulation and advance the cosmetic ones. */
  update(dt, system = this.system) {
    const live = system;
    if (live) {
      this._sync(live.projectiles, this.projectiles,
        (g) => { const v = new ProjectileView(g); this.scene.add(v.mesh); return v; }, dt);
      this._sync(live.smokes, this.smokes, (c) => {
        const v = new SmokeView(c, c.centre.y - (c.spec?.centreLift ?? 0));
        this.scene.add(v.group);
        return v;
      }, dt);
      this._sync(live.fires, this.fires,
        (f) => { const v = new FireView(f); this.scene.add(v.group); return v; }, dt);
    }
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.update(dt);
      if (b.dead) { b.dispose(); this.bursts.splice(i, 1); }
    }
  }

  _sync(simList, viewMap, make, dt) {
    const seen = new Set();
    for (const s of simList) {
      seen.add(s);
      let v = viewMap.get(s);
      if (!v) { v = make(s); viewMap.set(s, v); }
      v.update(dt);
    }
    for (const [s, v] of viewMap) {
      if (!seen.has(s)) { v.dispose(); viewMap.delete(s); }
    }
  }

  clear() {
    for (const m of [this.projectiles, this.smokes, this.fires]) {
      for (const v of m.values()) v.dispose();
      m.clear();
    }
    for (const b of this.bursts) b.dispose();
    this.bursts.length = 0;
  }
}

export { GRENADE, GRENADE_SPECS };
