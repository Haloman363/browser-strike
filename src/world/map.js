import * as THREE from 'three';

// "Dust Market" — a compact Mirage-flavoured arena, 60m x 60m, origin centred.
// Everything is axis-aligned boxes because CollisionWorld is AABB-only; the
// visual mesh and the collision brush are the same box, built together.
//
// Axes: +X east, +Z south, +Y up. All dimensions in metres, sized against
// MOVE: 0.42m radius, 1.37m stand height, 0.34m step, ~1.03m jump apex.

const HALF = 30;            // perimeter half-extent
const WALL_H = 5.2;         // > 4m so a jump (1.03m) never clears it
const DOOR_W = 1.9;         // > 1.4m: comfortable for a 0.84m-wide player
const DOOR_H = 2.5;
const TEXEL = 0.5;          // texture repeats per metre — the density constant

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

// One shared unit cube; every box is a scaled instance of it. Cheaper than a
// BoxGeometry per brush and keeps the draw calls uniform.
const UNIT = new THREE.BoxGeometry(1, 1, 1);

// Materials are cloned per texel-scale so an 8m wall and a 1m crate get the
// same texture density. Keyed by material + repeat so we clone once, not per
// mesh — hundreds of unique materials would kill the shadow pass.
const materialCache = new Map();

function scaledMaterial(base, u, v) {
  if (!base.map && !base.normalMap && !base.roughnessMap) return base;
  const ru = Math.max(0.25, Math.round(u * 4) / 4);
  const rv = Math.max(0.25, Math.round(v * 4) / 4);
  const key = `${base.uuid}:${ru}:${rv}`;
  const hit = materialCache.get(key);
  if (hit) return hit;

  const mat = base.clone();
  for (const slot of ['map', 'normalMap', 'roughnessMap', 'aoMap', 'metalnessMap']) {
    if (!mat[slot]) continue;
    // Textures must be cloned too — repeat lives on the texture, not the
    // material, so sharing one would make every clone fight over the scale.
    const tex = mat[slot].clone();
    tex.needsUpdate = true;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(ru, rv);
    mat[slot] = tex;
  }
  return materialCache.set(key, mat), mat;
}

/**
 * The workhorse: a box mesh + a matching collision brush.
 * `solid: false` skips collision (trim, cloth, overhangs above head height).
 * Texture repeat is derived from world size so texel density stays constant.
 */
function box(ctx, material, cx, cy, cz, sx, sy, sz, opts = {}) {
  const { solid = true, cast = true, receive = true, rotY = 0 } = opts;

  // Pick the two largest axes for UV scale — a box's dominant faces.
  const dims = [sx, sy, sz].sort((a, b) => b - a);
  const mat = scaledMaterial(material, dims[0] * TEXEL, dims[1] * TEXEL);

  const mesh = new THREE.Mesh(UNIT, mat);
  mesh.position.set(cx, cy, cz);
  mesh.scale.set(sx, sy, sz);
  mesh.rotation.y = rotY;
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  ctx.scene.add(mesh);

  // ponytail: rotated boxes get an axis-aligned collision brush sized to the
  // rotated footprint. Only used for the few cosmetic angled props, where the
  // slop is under 20cm. Upgrade path: OBB support in CollisionWorld.
  if (solid) {
    const c = Math.abs(Math.cos(rotY)), s = Math.abs(Math.sin(rotY));
    ctx.collision.addBox(
      new THREE.Vector3(cx, cy, cz),
      new THREE.Vector3(sx * c + sz * s, sy, sx * s + sz * c),
    );
  }
  return mesh;
}

/** Thin decorative strip — cornice, trim, sill. Never collides. */
function trim(ctx, material, cx, cy, cz, sx, sy, sz) {
  return box(ctx, material, cx, cy, cz, sx, sy, sz, { solid: false, receive: true });
}

/**
 * A wall with a rectangular opening punched in it, built as up-to-4 boxes.
 * `axis` is the wall's long axis ('x' or 'z'); `at` is the opening centre
 * along that axis. Lintel and jambs are solid so you can't shoot through.
 */
function wallWithOpening(ctx, material, opts) {
  const { axis, at, openW = DOOR_W, openH = DOOR_H, thick = 0.45 } = opts;
  const { x, z, len, h, y = 0 } = opts;
  const long = axis === 'x';
  const half = len / 2;
  const centre = long ? x : z;

  const seg = (segCentre, segLen) => {
    if (segLen <= 0.02) return;
    box(ctx, material,
      long ? segCentre : x, y + h / 2, long ? z : segCentre,
      long ? segLen : thick, h, long ? thick : segLen);
  };

  // Jambs either side of the opening.
  const leftEnd = at - openW / 2;
  const rightStart = at + openW / 2;
  seg((centre - half + leftEnd) / 2, leftEnd - (centre - half));
  seg((rightStart + centre + half) / 2, (centre + half) - rightStart);

  // Lintel above the opening.
  if (h > openH) {
    box(ctx, material,
      long ? at : x, y + openH + (h - openH) / 2, long ? z : at,
      long ? openW : thick, h - openH, long ? thick : openW);
  }

  // Door frame reveal — reads as a chamfer, no collision.
  const fx = long ? at : x;
  const fz = long ? z : at;
  trim(ctx, ctx.mat.concrete, fx, y + openH + 0.06, fz,
    long ? openW + 0.5 : thick + 0.14, 0.12, long ? thick + 0.14 : openW + 0.5);
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

/**
 * A sandstone building mass: walls, plinth, cornice, parapet, window recesses.
 * Solid inside (we never enter these) unless `hollow` names its doorways.
 */
function building(ctx, def) {
  const { x, z, w, d, h, mat = ctx.mat.sandstone, windows = [], roof = true } = def;

  // Main mass. Solid block: interiors here are not playable, which keeps the
  // brush count low and removes any chance of getting wedged inside a wall.
  box(ctx, mat, x, h / 2, z, w, h, d);

  // Plinth — a slightly wider base. Reads as a chamfer and catches sun.
  box(ctx, ctx.mat.concrete, x, 0.22, z, w + 0.28, 0.44, d + 0.28);

  // Cornice band below the roofline, plus a parapet lip above it.
  trim(ctx, ctx.mat.plaster, x, h - 0.42, z, w + 0.24, 0.26, d + 0.24);
  if (roof) {
    box(ctx, ctx.mat.terracotta, x, h + 0.16, z, w + 0.6, 0.32, d + 0.6,
      { solid: false });
    trim(ctx, ctx.mat.plaster, x, h + 0.55, z, w + 0.2, 0.5, d + 0.2);
  }

  // Window recesses: a dark inset box plus a sill. Purely visual — the recess
  // is only 0.2m deep so it never affects movement.
  for (const win of windows) {
    const { face, u, y: wy, w: ww = 1.0, h: wh = 1.4 } = win;
    const half = { n: -d / 2, s: d / 2, w: -w / 2, e: w / 2 }[face];
    const along = face === 'n' || face === 's';
    const px = along ? x + u : x + half;
    const pz = along ? z + half : z + u;
    const nx = along ? 0 : Math.sign(half);
    const nz = along ? Math.sign(half) : 0;

    trim(ctx, ctx.mat.concrete, px - nx * 0.1, wy + wh / 2, pz - nz * 0.1,
      along ? ww : 0.24, wh, along ? 0.24 : ww);
    trim(ctx, ctx.mat.plaster, px + nx * 0.06, wy - 0.08, pz + nz * 0.06,
      along ? ww + 0.34 : 0.36, 0.16, along ? 0.36 : ww + 0.34);
    trim(ctx, ctx.mat.wood, px + nx * 0.05, wy + wh + 0.12, pz + nz * 0.05,
      along ? ww + 0.34 : 0.34, 0.14, along ? 0.34 : ww + 0.34);
  }
}

/** A freestanding archway: two piers, a lintel, and a keystone-ish trim. */
function archway(ctx, x, z, axis, w = 3.0, h = 3.2, pier = 0.6) {
  const long = axis === 'x';
  const off = w / 2 + pier / 2;
  const pierBox = (px, pz) => {
    box(ctx, ctx.mat.sandstone, px, h / 2, pz, long ? pier : 1.0, h, long ? 1.0 : pier);
    trim(ctx, ctx.mat.concrete, px, h - 0.2, pz,
      (long ? pier : 1.0) + 0.2, 0.24, (long ? 1.0 : pier) + 0.2);
  };
  pierBox(long ? x - off : x, long ? z : z - off);
  pierBox(long ? x + off : x, long ? z : z + off);

  // Lintel sits above head height, so it gets collision (you can't jump onto
  // it, but a shot should stop) without ever blocking a walk-through.
  box(ctx, ctx.mat.sandstone, x, h + 0.35, z,
    long ? w + pier * 2 : 1.0, 0.7, long ? 1.0 : w + pier * 2);
  trim(ctx, ctx.mat.plaster, x, h + 0.78, z,
    long ? w + pier * 2 + 0.3 : 1.3, 0.2, long ? 1.3 : w + pier * 2 + 0.3);
}

/** Step-height-friendly staircase. Each riser is <= MOVE.stepHeight (0.34). */
function stairs(ctx, def) {
  const { x, z, width, steps, rise, run, dir } = def;
  // dir: +1 climbs toward +axis. 'axis' is the travel axis.
  const along = def.axis === 'x';

  for (let i = 0; i < steps; i++) {
    const h = rise * (i + 1);
    const offset = dir * (i + 0.5) * run;
    // Each tread is a full-height block from the ground so there is no gap
    // under the stairs for the player to fall into.
    box(ctx, ctx.mat.concrete,
      along ? x + offset : x, h / 2, along ? z : z + offset,
      along ? run : width, h, along ? width : run);
  }

  // Side stringers read as a stone balustrade and stop players sliding off.
  const total = steps * run;
  const topH = steps * rise;
  for (const s of [-1, 1]) {
    const cx = along ? x + dir * total / 2 : x + s * (width / 2 + 0.18);
    const cz = along ? z + s * (width / 2 + 0.18) : z + dir * total / 2;
    box(ctx, ctx.mat.sandstone, cx, topH / 2 + 0.35, cz,
      along ? total : 0.36, topH + 0.7, along ? 0.36 : total);
  }
}

/** A wooden crate. `stack` values raise it onto whatever is below. */
function crate(ctx, x, y, z, s, rotY = 0) {
  box(ctx, ctx.mat.crate, x, y + s / 2, z, s, s, s, { rotY });
  // Corner banding: four thin strips. Sells the crate as built, not extruded.
  const b = s * 0.5 + 0.012;
  for (const sign of [-1, 1]) {
    trim(ctx, ctx.mat.wood, x, y + s / 2, z + sign * b * Math.cos(rotY),
      s * 0.94, s * 0.1, 0.03);
  }
}

/** A barrel — an 8-sided cylinder with hoops. Collision is a box, close enough. */
function barrel(ctx, x, y, z, r = 0.32, h = 0.88) {
  const geo = new THREE.CylinderGeometry(r, r * 0.92, h, 10);
  const mesh = new THREE.Mesh(geo, scaledMaterial(ctx.mat.wood, h * TEXEL, h * TEXEL));
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = mesh.receiveShadow = true;
  ctx.scene.add(mesh);

  for (const t of [0.24, 0.76]) {
    const hoop = new THREE.Mesh(
      new THREE.CylinderGeometry(r * 1.04, r * 1.04, 0.07, 10),
      ctx.mat.metal);
    hoop.position.set(x, y + h * t, z);
    hoop.castShadow = true;
    ctx.scene.add(hoop);
  }
  ctx.collision.addBox(
    new THREE.Vector3(x, y + h / 2, z),
    new THREE.Vector3(r * 1.85, h, r * 1.85));
}

/** Market stall: four posts, a plank counter, a sagging cloth awning. */
function stall(ctx, x, z, w = 3.4, d = 2.2, rotY = 0, seed = 5, color = 0xb8503c) {
  const postH = 2.35;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    box(ctx, ctx.mat.wood, x + sx * (w / 2 - 0.1), postH / 2, z + sz * (d / 2 - 0.1),
      0.14, postH, 0.14);
  }
  // Counter at 0.95m — chest-high cover you can shoot over but not vault.
  box(ctx, ctx.mat.wood, x, 0.88, z - d / 2 + 0.35, w, 0.14, 0.7);
  box(ctx, ctx.mat.wood, x, 0.44, z - d / 2 + 0.35, w - 0.3, 0.72, 0.5);

  // Awning: two panels sagging between the ridge pole and the eaves, rather
  // than the rigid slabs of pass 1. Above head height, no collision.
  for (const s of [-1, 1]) {
    const pw = w + 0.35, pd = d / 2 + 0.2;
    const sd = seed + (s + 2) * 17;
    const geo = tintCloth(clothGeometry(pw, pd, pd * 0.22, sd, 10, 6), sd);
    const panel = new THREE.Mesh(geo, clothMaterial(color, sd));
    panel.position.set(x, postH + 0.22, z + s * (d / 4 + 0.05));
    // A cloth panel lies near-flat and pitches gently down from the ridge.
    // Rotating by a full PI/2 stood the panels on edge, so they read as brown
    // walls hanging in the air rather than as an awning.
    panel.rotation.set(s * 0.34, 0, 0);
    panel.castShadow = true;
    panel.receiveShadow = true;
    ctx.scene.add(panel);
    ctx.cloth.push({ mesh: panel, seed: sd, base: panel.rotation.z });
  }
  box(ctx, ctx.mat.wood, x, postH + 0.5, z, w + 0.6, 0.1, 0.1, { solid: false });

  // Goods on the counter and pots at the foot — a stall in use, not a table.
  for (let i = 0; i < 3; i++) {
    const s = seed + i * 9.1;
    const gx = x + (i - 1) * (w / 3.4);
    box(ctx, ctx.mat.crate, gx, 1.03, z - d / 2 + 0.35,
      rndRange(s, 0.2, 0.34), 0.16, rndRange(s + 1, 0.2, 0.3),
      { solid: false, rotY: rnd(s + 2) * 0.6 });
  }
  pot(ctx, x + w / 2 - 0.35, z + d / 2 - 0.3, rndRange(seed + 3, 0.42, 0.62), seed + 4, false);
}

// A cheap deterministic hash -> 0..1. Used everywhere below so every scatter is
// stable between reloads; Math.random would make screenshots non-comparable.
function rnd(seed) {
  const s = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}
const rndRange = (seed, a, b) => a + rnd(seed) * (b - a);

/**
 * Cloth: a subdivided plane sagging under its own weight.
 *
 * The flat-rectangle read in pass 1 came from a 1x1 PlaneGeometry — with no
 * interior vertices there is nothing for the normal to vary across, so it
 * shades as a single flat value no matter the light. Subdividing and pushing
 * the interior into a catenary gives the normals something to do, which is
 * what actually makes cloth read as cloth.
 */
function clothGeometry(w, h, sagAmt, seed, segX = 10, segY = 8) {
  const geo = new THREE.PlaneGeometry(w, h, segX, segY);
  const pos = geo.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const u = x / w + 0.5;          // 0..1 across the span
    const v = 0.5 - y / h;          // 0 at the top edge, 1 at the hem

    // Catenary between the two support points. cosh normalised so the ends
    // stay pinned at 0 and the centre hangs by `sagAmt`.
    const t = (u - 0.5) * 2;
    const sag = (Math.cosh(t * 1.6) - Math.cosh(1.6)) / (1 - Math.cosh(1.6));
    pos.setY(i, y - sag * sagAmt * (0.35 + 0.65 * v));

    // Slack billows out of plane, strongest mid-span and toward the hem.
    const billow = Math.sin(u * Math.PI) * Math.sin(v * Math.PI * 0.85);
    let z = billow * sagAmt * 0.5;
    // Per-vertex noise so the surface is not a perfect mathematical sheet.
    z += (rnd(seed + i * 3.7) - 0.5) * sagAmt * 0.22;
    pos.setZ(i, z);
    // Hem wander: the free bottom edge of hanging cloth is never straight.
    if (v > 0.85) pos.setY(i, pos.getY(i) + (rnd(seed + i * 5.1) - 0.5) * h * 0.09);
  }

  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/**
 * Cloth material. Vertex colours carry a slow dye-lot variation plus darkening
 * into the folds, so even in flat ambient the panel is not one solid chip.
 */
function clothMaterial(color, seed) {
  // Desaturate toward the sand tone. Fabric that has hung in desert sun for
  // years is never a clean dye colour, and saturated panels read as cartoon
  // props next to the muted stone around them.
  const c = new THREE.Color(color);
  const hsl = {};
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s * 0.55, Math.min(0.72, hsl.l * 0.92 + 0.06));
  return new THREE.MeshStandardMaterial({
    color: c, roughness: 0.95, side: THREE.DoubleSide,
    vertexColors: true, metalness: 0.0,
  });
}

function tintCloth(geo, seed) {
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    // Sun-bleaching runs from the top down; weave slubs add fine variation.
    const v = 0.5 - pos.getY(i) / 2;
    const k = 0.74 + rnd(seed + i * 1.9) * 0.16 + Math.min(0.24, v * 0.14);
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

/** Cloth banner hanging from a wall or line. Decorative only. */
function banner(ctx, x, y, z, w, h, color, rotY = 0, seed = 1) {
  const geo = tintCloth(clothGeometry(w, h, h * 0.22, seed), seed);
  const mesh = new THREE.Mesh(geo, clothMaterial(color, seed));
  mesh.position.set(x, y - h / 2, z);
  mesh.rotation.y = rotY;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  ctx.scene.add(mesh);
  ctx.cloth.push({ mesh, seed, base: mesh.rotation.z });
  return mesh;
}

// ---------------------------------------------------------------------------
// Palm
// ---------------------------------------------------------------------------

/**
 * One date-palm frond, built once and instanced.
 *
 * Pass 1 used flat boxes, which is why it read as a placeholder: a frond's
 * silhouette is the whole tell. This builds a tapered strip of `SEG` quads
 * bent along an arc, with leaflets notched out of both edges so the outline is
 * serrated rather than a rectangle. Local space: +X is out along the rachis,
 * the arc droops in -Y, and the strip has width in Z.
 */
function frondGeometry(length = 2.6, droop = 0.85, SEG = 14) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];

  // Rachis centreline: straight out, curving downward with distance.
  const spine = [];
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG;
    spine.push(new THREE.Vector3(
      t * length,
      // Quadratic droop — the frond leaves the crown near-horizontal and only
      // falls away toward the tip, which is what makes it look heavy.
      -droop * t * t,
      0,
    ));
  }

  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG;
    // Half-width: widest at ~35% of the length, tapering to a point at the tip.
    const taper = Math.sin(Math.min(1, t * 1.55) * Math.PI * 0.62);
    let hw = 0.30 * taper * (1 - t * 0.55);
    // Leaflet serration: alternate segments pinch in, so the edge is a comb
    // rather than a smooth curve. Cheap way to get a palm silhouette.
    hw *= i % 2 === 0 ? 1.0 : 0.72;
    if (t > 0.97) hw *= 0.25;

    // Twist along the rachis so the frond is not a flat ribbon.
    const twist = t * 0.5;
    const up = Math.sin(twist) * hw * 0.5;

    const p = spine[i];
    positions.push(p.x, p.y + up, p.z - hw);
    positions.push(p.x, p.y + up, p.z + hw);
    // Normal follows the droop tangent; good enough at play distance.
    const ny = Math.cos(twist), nz = Math.sin(twist) * 0.3;
    normals.push(0, ny, -nz, 0, ny, nz);
    uvs.push(t, 0, t, 1);
  }

  for (let i = 0; i < SEG; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    indices.push(a, c, b, b, c, d);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

// Built lazily and shared by every palm — one geometry, N instances.
let FROND_GEO = null;

/**
 * A date palm: tapered curving trunk with frond-scar banding, and 15-25
 * fronds radiating from the crown at varied length, droop and rotation.
 * Collision is a single trunk-sized box; the crown is decoration.
 */
function palm(ctx, x, z, baseY, height = 4.2, seed = 7) {
  FROND_GEO ??= frondGeometry();

  // --- trunk: stacked tapered drums so it can lean and curve ---------------
  const DRUMS = 7;
  const lean = new THREE.Vector2(rndRange(seed, -0.22, 0.22), rndRange(seed + 1, -0.22, 0.22));
  const trunkMat = scaledMaterial(ctx.mat.wood, 1.6, 2.4);
  let topX = x, topZ = z, topY = 0;

  for (let i = 0; i < DRUMS; i++) {
    const t0 = i / DRUMS, t1 = (i + 1) / DRUMS;
    const y0 = baseY + t0 * height, y1 = baseY + t1 * height;
    // Taper: date palms are fat at the base and near-constant higher up.
    const r0 = 0.30 - 0.14 * Math.pow(t0, 0.7);
    const r1 = 0.30 - 0.14 * Math.pow(t1, 0.7);
    // Curve accumulates with height, so the lean reads as growth not a tilt.
    const cx = x + lean.x * t0 * t0 * height * 0.5;
    const cz = z + lean.y * t0 * t0 * height * 0.5;
    const nx = x + lean.x * t1 * t1 * height * 0.5;
    const nz = z + lean.y * t1 * t1 * height * 0.5;

    const drum = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, y1 - y0, 9), trunkMat);
    drum.position.set((cx + nx) / 2, (y0 + y1) / 2, (cz + nz) / 2);
    // Aim each drum at the next centre so the segments stay joined.
    drum.lookAt(nx, y1 + (y1 - y0), nz);
    drum.rotateX(Math.PI / 2);
    drum.castShadow = drum.receiveShadow = true;
    ctx.scene.add(drum);
    topX = nx; topZ = nz; topY = y1;
  }

  // Frond scars: the stubby ring texture left by shed fronds. Two per drum,
  // alternating rotation so the banding spirals like the real thing.
  for (let i = 0; i < 12; i++) {
    const t = 0.06 + (i / 12) * 0.88;
    const r = 0.31 - 0.14 * Math.pow(t, 0.7);
    const ring = new THREE.Mesh(
      new THREE.CylinderGeometry(r * 1.13, r * 1.05, 0.11, 9),
      trunkMat);
    ring.position.set(
      x + lean.x * t * t * height * 0.5, baseY + t * height,
      z + lean.y * t * t * height * 0.5);
    ring.rotation.y = i * 0.7;
    ring.rotation.z = rndRange(seed + i * 3, -0.05, 0.05);
    ring.castShadow = true;
    ctx.scene.add(ring);
  }

  // --- crown ---------------------------------------------------------------
  const FRONDS = 19;
  const crown = new THREE.Group();
  crown.position.set(topX, topY, topZ);
  ctx.scene.add(crown);

  // Deeper than a leaf looks in isolation: these are DoubleSide, so fronds
  // lit from behind render at full face brightness and wash out against the
  // sky. Date palms are a dusty grey-green, not a fresh green.
  const frondMat = new THREE.MeshStandardMaterial({
    color: 0x5a6b34, roughness: 0.92, side: THREE.DoubleSide, metalness: 0,
  });

  for (let i = 0; i < FRONDS; i++) {
    const s = seed + i * 13.3;
    const f = new THREE.Mesh(FROND_GEO, frondMat);
    // Radiate evenly with jitter, so the crown has no visible spokes.
    f.rotation.y = (i / FRONDS) * Math.PI * 2 + rndRange(s, -0.16, 0.16);
    // Older outer fronds sit lower and droop harder; new spears point up.
    const age = i / FRONDS;
    f.rotation.z = rndRange(s + 1, -0.22, 0.16) - age * 0.55 + 0.30;
    f.scale.setScalar(rndRange(s + 2, 0.72, 1.18));
    // Per-frond roll gives each one a different presented angle.
    f.rotation.x = rndRange(s + 3, -0.45, 0.45);
    f.position.y = rndRange(s + 4, -0.16, 0.10);
    f.castShadow = true;
    crown.add(f);
    ctx.palmFronds.push({ mesh: f, seed: s, baseZ: f.rotation.z });
  }

  // Date clusters hanging under the crown — a warm colour note against green.
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + rnd(seed + i);
    const bunch = new THREE.Mesh(
      new THREE.SphereGeometry(0.20, 6, 5),
      new THREE.MeshStandardMaterial({ color: 0x8a5a2c, roughness: 0.9 }));
    bunch.position.set(Math.cos(a) * 0.42, -0.30, Math.sin(a) * 0.42);
    bunch.scale.set(1, 1.5, 1);
    bunch.castShadow = true;
    crown.add(bunch);
  }

  // One collision box for the trunk. The crown is above head height anyway.
  ctx.collision.addBox(
    new THREE.Vector3(
      x + lean.x * height * 0.25, baseY + height / 2, z + lean.y * height * 0.25),
    new THREE.Vector3(0.62, height, 0.62));
}

// ---------------------------------------------------------------------------
// Contact dressing — what makes props look placed rather than dropped in
// ---------------------------------------------------------------------------

/**
 * Sand drift piling against a wall. A low wedge whose top face slopes away
 * from the wall, so the wall/ground junction stops being a hard 90-degree line.
 * Never solid — it is ankle height and the player should walk straight over it.
 */
function drift(ctx, x, z, len, axis, side, seed, depth = 0.85, hgt = 0.20) {
  const along = axis === 'x';
  const SLICES = Math.max(3, Math.round(len / 1.4));
  for (let i = 0; i < SLICES; i++) {
    const t = (i + 0.5) / SLICES;
    const s = seed + i * 7.7;
    // Drift is not uniform: it heaps in places and thins out in others.
    const heap = 0.45 + rnd(s) * 0.55;
    const d = depth * heap;
    const h = hgt * heap;
    const off = (t - 0.5) * len;
    const dx = along ? off : side * d * 0.5;
    const dz = along ? side * d * 0.5 : off;
    box(ctx, ctx.mat.sand,
      x + dx, h / 2, z + dz,
      along ? len / SLICES * 1.05 : d,
      h,
      along ? d : len / SLICES * 1.05,
      { solid: false, cast: false, rotY: rndRange(s + 1, -0.06, 0.06) });
  }
}

/**
 * Rubble scatter: small stones and chips at varied rotation and size.
 * `bias` skews the spread along one axis so it can hug a wall line.
 */
function rubble(ctx, x, z, radius, count, seed, mat = null) {
  const m = mat ?? ctx.mat.concrete;
  for (let i = 0; i < count; i++) {
    const s = seed + i * 4.3;
    const a = rnd(s) * Math.PI * 2;
    const r = Math.sqrt(rnd(s + 1)) * radius;   // sqrt = uniform over the disc
    const size = rndRange(s + 2, 0.07, 0.22);
    box(ctx, m,
      x + Math.cos(a) * r, size * 0.42, z + Math.sin(a) * r,
      size, size * rndRange(s + 3, 0.4, 0.9), size * rndRange(s + 4, 0.7, 1.4),
      { solid: false, rotY: rnd(s + 5) * Math.PI });
  }
}

/** A clay pot / amphora on a lathe profile. Solid — you expect to bump it. */
function pot(ctx, x, z, height = 0.8, seed = 3, solid = true) {
  const pts = [];
  const SEG = 9;
  const belly = rndRange(seed, 0.30, 0.42);
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG;
    // Profile: narrow foot, wide belly, pinched neck, small flared lip.
    const r = height * (
      0.10 + belly * Math.sin(Math.min(1, t * 1.22) * Math.PI * 0.92) +
      (t > 0.86 ? 0.10 * (t - 0.86) / 0.14 : 0));
    pts.push(new THREE.Vector2(Math.max(0.03, r), t * height));
  }
  const mesh = new THREE.Mesh(
    new THREE.LatheGeometry(pts, 10),
    scaledMaterial(ctx.mat.terracotta, 1.2, 1.2));
  mesh.position.set(x, 0, z);
  mesh.rotation.y = rnd(seed + 1) * Math.PI;
  mesh.castShadow = mesh.receiveShadow = true;
  ctx.scene.add(mesh);

  if (solid) {
    const w = height * (belly + 0.12) * 2;
    ctx.collision.addBox(
      new THREE.Vector3(x, height / 2, z), new THREE.Vector3(w, height, w));
  }
  // A pot always sits in a little scatter of its own grit.
  rubble(ctx, x, z, height * 0.9, 3, seed + 20, ctx.mat.sand);
  return mesh;
}

// ---------------------------------------------------------------------------
// Data tables — the map itself
// ---------------------------------------------------------------------------

// Building masses at varied heights so the skyline is not one flat block.
// Left/right of the courtyard, with gaps forming the flank corridors.
const BUILDINGS = [
  // North-west block: tallest mass, anchors the long north sightline.
  { x: -17, z: -19, w: 16, d: 12, h: 9.5, windows: [
    { face: 's', u: -4.5, y: 3.4 }, { face: 's', u: 0, y: 3.4 },
    { face: 's', u: 4.5, y: 3.4 }, { face: 's', u: -2.2, y: 6.4, w: 0.8 },
    { face: 's', u: 2.2, y: 6.4, w: 0.8 },
    { face: 'e', u: -3, y: 3.4 }, { face: 'e', u: 2.5, y: 3.4 },
  ] },
  // North-east block: shorter, so the balcony above it stays readable.
  { x: 16, z: -20, w: 18, d: 10, h: 6.4, windows: [
    { face: 's', u: -5, y: 2.9 }, { face: 's', u: 0, y: 2.9 },
    { face: 's', u: 5, y: 2.9 },
    { face: 'w', u: -2, y: 2.9 },
  ] },
  // South-west block with the market frontage.
  { x: -19, z: 17, w: 12, d: 14, h: 7.2, windows: [
    { face: 'n', u: -3, y: 3.1 }, { face: 'n', u: 2.5, y: 3.1 },
    { face: 'e', u: -4, y: 3.1 }, { face: 'e', u: 1, y: 3.1 },
    { face: 'e', u: -1.5, y: 5.6, w: 0.8 },
  ] },
  // South-east block: mid-height, plaster finish for material variety.
  { x: 18, z: 18, w: 14, d: 12, h: 5.6, mat: null, windows: [
    { face: 'n', u: -4, y: 2.6 }, { face: 'n', u: 1.5, y: 2.6 },
    { face: 'w', u: -3, y: 2.6 }, { face: 'w', u: 2, y: 2.6 },
  ] },
  // Small mid-map shed that breaks the east-west sightline across mid.
  { x: 4.5, z: -6.5, w: 5, d: 4.5, h: 3.4, roof: true, windows: [
    { face: 's', u: 0, y: 1.5, w: 0.9, h: 1.1 },
  ] },
];

// Cover in and around the courtyard: [x, z, size, rotation, stackHeight]
const CRATES = [
  [-6.0, 1.5, 1.0, 0.0, 0], [-6.0, 2.6, 1.0, 0.12, 0], [-6.0, 2.05, 1.0, 0.05, 1.0],
  [-4.7, 1.9, 0.7, 0.4, 0],
  [6.6, 3.4, 1.2, 0.0, 0], [6.6, 3.4, 0.9, 0.35, 1.2],
  [7.9, 3.1, 0.8, -0.2, 0],
  [0.5, 8.5, 1.0, 0.18, 0], [1.7, 8.7, 0.7, -0.3, 0],
  [-9.5, -3.0, 1.1, 0.0, 0], [-9.5, -3.0, 0.8, 0.5, 1.1],
  [11.5, -2.0, 1.0, -0.15, 0],
  // Stacked ramp onto the west low roof: 1.0 then 1.9 — both step-reachable
  // from each other after a jump, and the top is 0.34m under the roof edge.
  [-13.2, 6.4, 1.0, 0.0, 0],
  [-13.2, 5.2, 0.9, 0.1, 0], [-13.2, 5.2, 0.9, -0.08, 0.9],
];

const BARRELS = [
  [-3.4, 0, 6.2], [-2.7, 0, 7.0], [8.9, 0, -0.6],
  [13.0, 0, 8.4], [13.7, 0, 9.0], [-11.0, 0, -8.5],
];

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

export function buildMap(scene, collisionWorld, materials) {
  // cloth/palmFronds collect animatable handles as the map builds, so the
  // returned update() can breathe on them without re-walking the scene graph.
  const ctx = {
    scene, collision: collisionWorld, mat: materials,
    cloth: [], palmFronds: [],
  };

  ground(ctx);
  perimeter(ctx);
  BUILDINGS.forEach((def) => building(ctx, {
    ...def, mat: def.mat === null ? materials.plaster : def.mat,
  }));
  courtyard(ctx);
  flanks(ctx);
  elevated(ctx);
  props(ctx);
  dressing(ctx);

  // Wind: a slow sway with a per-object phase offset. Rotation-only, so it is
  // a handful of Euler writes per frame — no geometry re-upload.
  let t = 0;
  const update = (dt) => {
    t += dt;
    for (const c of ctx.cloth) {
      const p = c.seed * 0.37;
      c.mesh.rotation.z = c.base + Math.sin(t * 1.1 + p) * 0.035 +
                          Math.sin(t * 2.7 + p * 1.9) * 0.012;
    }
    for (const f of ctx.palmFronds) {
      const p = f.seed * 0.11;
      f.mesh.rotation.z = f.baseZ + Math.sin(t * 0.9 + p) * 0.05 +
                          Math.sin(t * 2.3 + p * 2.1) * 0.018;
    }
  };

  return {
    update,
    // Two attacker/defender spawns on opposite ends of the long axis.
    spawns: [
      new THREE.Vector3(0, MOVE_FEET, -24),
      new THREE.Vector3(0, MOVE_FEET, 24),
    ],
    // Patrol points spanning courtyard, both flanks, market, and the balcony.
    botPoints: [
      new THREE.Vector3(-3.5, MOVE_FEET, 0.5),     // courtyard, west of planter
      new THREE.Vector3(-24, MOVE_FEET, 0),        // west flank corridor
      new THREE.Vector3(24, MOVE_FEET, 0),         // east flank corridor
      new THREE.Vector3(-7.5, MOVE_FEET, 10.0),    // market frontage
      new THREE.Vector3(10, MOVE_FEET, 10),        // south-east plaza
      new THREE.Vector3(-6, MOVE_FEET, -13),       // north approach
      new THREE.Vector3(14, MOVE_FEET, -12),       // east of the shed
      new THREE.Vector3(-19.5, 3.0 + MOVE_FEET, 2), // west balcony
    ],
    bounds: new THREE.Box3(
      new THREE.Vector3(-HALF, 0, -HALF),
      new THREE.Vector3(HALF, WALL_H + 6, HALF),
    ),
  };
}

// Spawn/patrol Y is the AABB *centre*, and PlayerMovement positions are centres.
const MOVE_FEET = 1.37 / 2 + 0.02;

function ground(ctx) {
  const size = HALF * 2 + 8;
  const geo = new THREE.PlaneGeometry(size, size, 1, 1);
  const mat = scaledMaterial(ctx.mat.sand, size * TEXEL * 0.7, size * TEXEL * 0.7);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;   // ground only receives
  ctx.scene.add(mesh);
  ctx.collision.addBox(
    new THREE.Vector3(0, -1, 0), new THREE.Vector3(size, 2, size));

  // Worn stone paving over the courtyard — a lighter patch that anchors the
  // centre and gives the eye a scale reference.
  const pave = new THREE.Mesh(
    new THREE.PlaneGeometry(24, 26),
    scaledMaterial(ctx.mat.concrete, 24 * TEXEL, 26 * TEXEL));
  pave.rotation.x = -Math.PI / 2;
  pave.position.set(0, 0.012, 1);
  pave.receiveShadow = true;
  ctx.scene.add(pave);
}

function perimeter(ctx) {
  const t = 0.9;
  const outer = HALF + t / 2;
  for (const [dx, dz] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
    const horiz = dz !== 0;
    box(ctx, ctx.mat.sandstone,
      dx * outer, WALL_H / 2, dz * outer,
      horiz ? HALF * 2 + t * 2 : t, WALL_H, horiz ? t : HALF * 2 + t * 2);
    // Coping course on top — reads as a finished wall, not a cut plane.
    trim(ctx, ctx.mat.concrete, dx * outer, WALL_H + 0.13, dz * outer,
      horiz ? HALF * 2 + t * 2 + 0.3 : t + 0.3, 0.26,
      horiz ? t + 0.3 : HALF * 2 + t * 2 + 0.3);
    // Pilasters every 10m give the long walls vertical rhythm and shadow.
    for (let p = -HALF + 5; p < HALF; p += 10) {
      const px = horiz ? p : dx * (outer - t / 2 - 0.16);
      const pz = horiz ? dz * (outer - t / 2 - 0.16) : p;
      trim(ctx, ctx.mat.plaster, px, WALL_H / 2, pz,
        horiz ? 0.7 : 0.36, WALL_H, horiz ? 0.36 : 0.7);
    }
  }
}

function courtyard(ctx) {
  // Low walls: 0.95m, so they are hard cover standing and shootable-over
  // crouched. This is the courtyard's main sightline breaker.
  const lows = [
    { x: -3.5, z: -3.2, w: 7.0, d: 0.5 },
    { x: 5.5, z: -3.2, w: 5.0, d: 0.5 },
    { x: -10.5, z: 4.0, w: 0.5, d: 7.0 },
    { x: 10.0, z: 5.5, w: 0.5, d: 8.0 },
    { x: 2.0, z: 11.5, w: 9.0, d: 0.5 },
  ];
  for (const w of lows) {
    box(ctx, ctx.mat.sandstone, w.x, 0.475, w.z, w.w, 0.95, w.d);
    trim(ctx, ctx.mat.concrete, w.x, 1.0, w.z, w.w + 0.16, 0.14, w.d + 0.16);
  }

  // Central planter — a raised bed you can crouch behind or stand on. Its
  // 0.62m lip is one step up, so it doubles as a movement shortcut.
  box(ctx, ctx.mat.sandstone, 0, 0.31, 1.0, 4.2, 0.62, 4.2);
  trim(ctx, ctx.mat.concrete, 0, 0.67, 1.0, 4.5, 0.14, 4.5);
  // Soil bed, then the palm. The palm builds its own trunk collision; the
  // fronds are geometry only, well above head height.
  box(ctx, ctx.mat.sand, 0, 0.66, 1.0, 3.6, 0.06, 3.6, { solid: false, cast: false });
  palm(ctx, 0, 1.0, 0.69, 4.4, 7);
  // Fallen fronds and grit around the base — the tree has been dropping them
  // for years, and it stops the planter reading as a clean tub.
  rubble(ctx, 0, 1.0, 2.4, 6, 91, ctx.mat.sand);

  // Archways framing the four courtyard entrances.
  archway(ctx, 0, -11.5, 'x', 3.4, 3.3);
  archway(ctx, 0, 14.5, 'x', 3.4, 3.3);
  archway(ctx, -12.5, 0, 'z', 3.2, 3.1);
  archway(ctx, 12.5, 0, 'z', 3.2, 3.1);
}

function flanks(ctx) {
  // West flank: a 6m-wide corridor between the perimeter and the west blocks,
  // pinched by a doorway wall so it is not a free run.
  wallWithOpening(ctx, ctx.mat.sandstone, {
    axis: 'x', x: -24, z: -8, len: 12, h: 4.2, at: -24, openW: 2.2, openH: 2.6,
  });
  // Southern pinch of the west flank. Its opening sits at the perimeter end so
  // the flank stairs (x ~ -22) have clear run-up on the courtyard side.
  wallWithOpening(ctx, ctx.mat.sandstone, {
    axis: 'x', x: -26.5, z: 11.5, len: 7, h: 4.2, at: -28.4, openW: 2.2, openH: 2.6,
  });

  // East flank: wider and longer — the "fast" route, paid for by exposure.
  wallWithOpening(ctx, ctx.mat.plaster, {
    axis: 'x', x: 24, z: -9, len: 11, h: 4.6, at: 25.5, openW: 2.4, openH: 2.7,
  });
  wallWithOpening(ctx, ctx.mat.plaster, {
    axis: 'z', x: 8.5, z: 4, len: 10, h: 4.6, at: 3.0, openW: 2.4, openH: 2.7,
  });

  // Connector between the north blocks — a covered alley with a long sightline
  // straight down mid, broken only by the shed.
  wallWithOpening(ctx, ctx.mat.sandstone, {
    axis: 'x', x: -1, z: -13.6, len: 12, h: 4.4, at: -6.5, openW: 2.6, openH: 2.8,
  });

  // Awning slabs over both flank mouths: overhead shade, no collision (they
  // sit at 3.1m, above the 1.37m + 1.03m jump reach).
  for (const [ax, az, aw, ad] of [[-24, 0, 6.5, 4.0], [24, 0, 7.0, 4.0]]) {
    trim(ctx, ctx.mat.wood, ax, 3.15, az, aw, 0.16, ad);
    for (let i = -1; i <= 1; i++) {
      trim(ctx, ctx.mat.wood, ax, 3.32, az + i * (ad / 2 - 0.3), aw + 0.4, 0.14, 0.16);
    }
  }
}

/**
 * The elevated position: stairs off the west flank up to a 3.0m balcony that
 * overlooks the courtyard. 10 steps x 0.30m rise clears MOVE.stepHeight (0.34)
 * with margin, so it can be walked without jumping.
 */
function elevated(ctx) {
  const TOP = 3.0;
  stairs(ctx, { x: -22.0, z: 8.5, axis: 'z', dir: -1, width: 2.6, steps: 10, rise: TOP / 10, run: 0.42 });

  // Balcony deck, running north along the west side of the courtyard.
  box(ctx, ctx.mat.concrete, -20.0, TOP - 0.2, 0.5, 5.6, 0.4, 9.0);
  trim(ctx, ctx.mat.plaster, -20.0, TOP + 0.02, 0.5, 5.9, 0.14, 9.3);

  // Chest-high balustrade on the courtyard side — cover for a defender holding
  // the high ground, and it stops a careless walk-off.
  box(ctx, ctx.mat.sandstone, -17.3, TOP + 0.48, 0.5, 0.32, 0.96, 9.0);
  trim(ctx, ctx.mat.concrete, -17.3, TOP + 1.0, 0.5, 0.5, 0.14, 9.2);
  // Gap in the balustrade at the north end: a drop-down escape route.
  box(ctx, ctx.mat.sandstone, -20.0, TOP + 0.48, -3.85, 5.6, 0.96, 0.32);

  // Support posts under the deck, so it doesn't read as floating.
  for (const pz of [-3.0, 0.5, 4.0]) {
    box(ctx, ctx.mat.wood, -18.0, TOP / 2 - 0.2, pz, 0.28, TOP - 0.4, 0.28);
  }

  // A second, lower perch: the shed roof, reachable from the stacked crates
  // near -13.2/5.2 with a jump. Rewards knowing the map.
  box(ctx, ctx.mat.concrete, -13.5, 1.85, 8.5, 6.0, 0.5, 5.0);
  trim(ctx, ctx.mat.terracotta, -13.5, 2.16, 8.5, 6.5, 0.2, 5.5);
  for (const [px, pz] of [[-16.0, 6.4], [-11.0, 6.4], [-16.0, 10.6], [-11.0, 10.6]]) {
    box(ctx, ctx.mat.wood, px, 0.8, pz, 0.22, 1.6, 0.22);
  }
}

function props(ctx) {
  for (const [x, z, s, rot, base] of CRATES) crate(ctx, x, base, z, s, rot);
  for (const [x, y, z] of BARRELS) barrel(ctx, x, y, z);

  // Market row along the south, facing the courtyard. Different awning dye
  // lots so the row does not read as three copies of one stall.
  stall(ctx, -7.5, 12.8, 3.4, 2.2, 0, 5, 0xb8503c);
  stall(ctx, 6.0, 13.4, 3.0, 2.0, 0, 31, 0xc98a3e);
  // ponytail: dye lots stay inside the arid palette — a lavender awning was
  // the one colour in the map with no warm neighbour, and it read as a bug.
  stall(ctx, 15.5, 6.5, 3.2, 2.2, 0, 57, 0xa8763e);

  // A broken cart: tilted bed, one wheel on, one wheel fallen flat.
  box(ctx, ctx.mat.wood, 9.5, 0.75, -4.5, 2.6, 0.16, 1.5, { rotY: 0.22 });
  box(ctx, ctx.mat.wood, 9.5, 0.42, -4.5, 2.2, 0.5, 1.1, { rotY: 0.22 });
  for (const [wx, wz, flat] of [[8.6, -3.9, false], [8.6, -5.1, false], [10.9, -5.4, true]]) {
    const wheel = new THREE.Mesh(
      new THREE.TorusGeometry(0.44, 0.07, 6, 14),
      scaledMaterial(ctx.mat.wood, 1.2, 1.2));
    wheel.position.set(wx, flat ? 0.08 : 0.46, wz);
    if (flat) wheel.rotation.x = Math.PI / 2;
    else wheel.rotation.y = Math.PI / 2;
    wheel.castShadow = wheel.receiveShadow = true;
    ctx.scene.add(wheel);
  }
  ctx.collision.addBox(new THREE.Vector3(9.5, 0.5, -4.5), new THREE.Vector3(3.0, 1.0, 2.0));

  // Hanging cloth: washing lines strung between the courtyard buildings.
  // Pure decoration at 3.5m+, and it breaks up the flat sky in the sightlines.
  const CLOTH = [
    [-9, 3.6, -8.5, 1.6, 1.5, 0xc46a3f, 0], [-7.2, 3.6, -8.5, 1.2, 1.9, 0xd8b06a, 0],
    [-5.5, 3.6, -8.5, 1.5, 1.3, 0x8fa2b8, 0],
    [13.5, 3.9, 2.0, 1.7, 1.7, 0xb8503c, Math.PI / 2],
    [13.5, 3.9, 4.2, 1.3, 1.2, 0xd8b06a, Math.PI / 2],
    [-2.0, 4.2, 15.5, 1.8, 1.6, 0x7f9a6d, 0],
  ];
  CLOTH.forEach(([x, y, z, w, h, c, r], i) => banner(ctx, x, y, z, w, h, c, r, 40 + i * 6));
  // Lines the cloth hangs from.
  trim(ctx, ctx.mat.metal, -7.2, 3.62, -8.5, 8.0, 0.04, 0.04);
  trim(ctx, ctx.mat.metal, 13.5, 3.92, 3.1, 0.04, 0.04, 6.0);

  // Sandbag stack near the east arch — low cover on the fast route.
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 4 - row; i++) {
      box(ctx, ctx.mat.sand,
        14.2 + (i - (3 - row) / 2) * 0.62, 0.14 + row * 0.26, -8.0,
        0.6, 0.26, 0.42, { rotY: row * 0.08 });
    }
  }
}

// ---------------------------------------------------------------------------
// Set dressing
// ---------------------------------------------------------------------------

/**
 * Everything that exists purely to break silhouettes and sell contact with the
 * ground. Almost all of it is `solid: false` — it lives at the edges of the
 * play space and along wall bases, never in a movement lane.
 */
function dressing(ctx) {
  contact(ctx);
  clutter(ctx);
  roofline(ctx);
}

/** Sand drift and rubble where vertical surfaces meet the ground. */
function contact(ctx) {
  // Drift along the inside face of the perimeter wall. Wind piles sand against
  // the leeward side, so only two of the four walls get a deep drift.
  drift(ctx, 0, -HALF + 0.7, 52, 'x', 1, 101, 1.1, 0.26);
  drift(ctx, 0, HALF - 0.7, 52, 'x', -1, 131, 0.9, 0.22);
  drift(ctx, -HALF + 0.7, 0, 52, 'z', 1, 161, 0.8, 0.20);
  drift(ctx, HALF - 0.7, 0, 52, 'z', -1, 191, 0.7, 0.18);

  // Drift banked against the building masses that face the open courtyard.
  drift(ctx, -17, -13.2, 15, 'x', 1, 211, 0.9, 0.22);   // NW block, south face
  drift(ctx, 16, -15.2, 17, 'x', 1, 231, 0.8, 0.20);    // NE block, south face
  drift(ctx, -19, 10.2, 11, 'x', -1, 251, 0.8, 0.20);   // SW block, north face
  drift(ctx, 18, 12.2, 13, 'x', -1, 271, 0.7, 0.18);    // SE block, north face
  drift(ctx, -13.2, 17, 13, 'z', 1, 291, 0.8, 0.20);    // SW block, east face
  drift(ctx, 11.2, 18, 11, 'z', -1, 311, 0.7, 0.18);    // SE block, west face

  // Rubble collecting in the corners of the arena and at the base of piers.
  const CORNERS = [
    [-27, -27, 2.6, 14], [27, -27, 2.6, 14], [-27, 27, 2.6, 14], [27, 27, 2.6, 14],
  ];
  for (const [x, z, r, n] of CORNERS) rubble(ctx, x, z, r, n, x * 13 + z);

  // Chips and grit at the foot of each archway pier — heavy stone sheds.
  for (const [x, z] of [[0, -11.5], [0, 14.5], [-12.5, 0], [12.5, 0]]) {
    rubble(ctx, x - 2.2, z, 0.8, 4, x * 7 + z + 3);
    rubble(ctx, x + 2.2, z, 0.8, 4, x * 7 + z + 9);
  }

  // Scatter along the low courtyard walls, where kicked-up debris settles.
  rubble(ctx, -3.5, -3.9, 3.0, 7, 401);
  rubble(ctx, 5.5, -3.9, 2.4, 5, 419);
  rubble(ctx, -11.2, 4.0, 2.2, 5, 433);
  rubble(ctx, 2.0, 12.2, 3.0, 6, 447);

  // A broken section of wall with its rubble pile: the exposed-core look, sat
  // off the south-west lane so it never pinches the route.
  const bx = -25.5, bz = -18;
  box(ctx, ctx.mat.sandstone, bx, 0.85, bz, 2.6, 1.7, 0.5);
  box(ctx, ctx.mat.sandstone, bx + 1.5, 0.5, bz, 0.5, 1.0, 0.5, { rotY: 0.18 });
  // Exposed core behind the fallen face — rougher, cheaper stone.
  trim(ctx, ctx.mat.concrete, bx, 1.05, bz - 0.2, 2.3, 1.2, 0.2);
  rubble(ctx, bx + 1.1, bz + 0.5, 1.6, 12, 463);
  rubble(ctx, bx - 1.3, bz - 0.4, 1.1, 7, 479);
  drift(ctx, bx, bz + 0.5, 3.0, 'x', 1, 491, 0.7, 0.16);
}

/** Props that break up straight lines: pots, crates, pipes, lanterns. */
function clutter(ctx) {
  // Amphorae clustered against walls and in the market. Pots are solid — a
  // waist-high jar is something a player expects to collide with.
  const POTS = [
    [-12.2, 13.6, 0.92, 511], [-11.3, 14.2, 0.72, 523],
    [7.8, 15.4, 0.85, 541], [8.7, 15.9, 0.62, 557],
    [17.2, 4.4, 0.88, 571], [-21.5, -4.5, 0.80, 587],
    [21.8, -13.5, 0.86, 601], [-8.0, -15.4, 0.74, 613],
  ];
  for (const [x, z, h, s] of POTS) pot(ctx, x, z, h, s);

  // A rolled carpet leaning against the market wall. Two cylinders so the roll
  // has a visible end cap; no collision, it is thin and against a wall.
  for (const [x, z, rot, len, s] of [[-12.9, 12.2, 0.34, 2.1, 631], [19.6, 9.8, -0.28, 1.8, 647]]) {
    const roll = new THREE.Mesh(
      new THREE.CylinderGeometry(0.17, 0.19, len, 8),
      scaledMaterial(ctx.mat.wood, 1.4, 1.4));
    roll.position.set(x, len / 2 * Math.cos(rot), z);
    roll.rotation.set(rot, rnd(s) * Math.PI, rndRange(s + 1, -0.3, 0.3));
    roll.castShadow = roll.receiveShadow = true;
    ctx.scene.add(roll);
    rubble(ctx, x, z, 0.7, 3, s + 5, ctx.mat.sand);
  }

  // Planks leaning against walls — strong diagonals against all the verticals.
  for (const [x, z, ry, s] of [[-26.8, 6.5, 0.2, 661], [26.5, -3.0, -1.4, 677], [-8.6, -16.4, 0.9, 691]]) {
    const lean = rndRange(s, 0.28, 0.44);
    box(ctx, ctx.mat.wood, x, 1.05, z, 0.26, 2.4, 0.05,
      { solid: false, rotY: ry });
    // A second plank at a different angle so it reads as a stack, not a sign.
    box(ctx, ctx.mat.wood, x + Math.cos(ry) * 0.18, 0.95, z + Math.sin(ry) * 0.18,
      0.22, 2.1, 0.05, { solid: false, rotY: ry + lean * 0.3 });
    rubble(ctx, x, z, 0.6, 3, s + 7);
  }

  // Crates tipped at an angle against the south-east wall. Solid: they are
  // full-size cover, and they sit clear of the plaza lane.
  crate(ctx, 24.5, 0, -19.5, 0.9, 0.5);
  crate(ctx, 25.2, 0, -18.3, 0.7, -0.25);
  crate(ctx, 24.8, 0.9, -19.5, 0.6, 0.9);
  rubble(ctx, 24.8, -19.0, 1.4, 6, 701);

  // Wall-mounted conduit and pipework climbing the buildings. Thin trim, no
  // collision, and it gives the big flat facades a vertical accent.
  const PIPES = [
    [-9.2, -13.1, 5.4, 'z'], [-24.6, -13.1, 4.6, 'z'],
    [7.4, -15.1, 3.9, 'z'], [24.2, -15.1, 3.4, 'z'],
    [-13.1, 12.0, 4.2, 'x'], [11.1, 14.0, 3.4, 'x'],
  ];
  for (const [x, z, h, ax] of PIPES) {
    trim(ctx, ctx.mat.metal, x, h / 2, z, 0.11, h, 0.11);
    // Brackets every ~1.4m, and an elbow at the top turning into the wall.
    for (let y = 0.9; y < h; y += 1.4) {
      trim(ctx, ctx.mat.metal, x, y, z,
        ax === 'z' ? 0.3 : 0.16, 0.09, ax === 'z' ? 0.16 : 0.3);
    }
    trim(ctx, ctx.mat.metal, x, h, z,
      ax === 'z' ? 0.11 : 0.5, 0.11, ax === 'z' ? 0.5 : 0.11);
  }

  // Hanging lanterns under the arches and awnings. A small emissive-ish warm
  // box on a wire; at 2.6m they never obstruct movement.
  for (const [x, z] of [[-1.3, -11.5], [1.3, -11.5], [-1.3, 14.5], [1.3, 14.5],
                        [-24, 1.6], [24, 1.6], [-7.5, 11.5], [6.0, 12.2]]) {
    trim(ctx, ctx.mat.metal, x, 2.95, z, 0.03, 0.5, 0.03);
    const lamp = new THREE.Mesh(
      new THREE.CylinderGeometry(0.10, 0.14, 0.28, 6),
      new THREE.MeshStandardMaterial({
        color: 0xc9a24a, roughness: 0.55, metalness: 0.6,
      }));
    lamp.position.set(x, 2.56, z);
    lamp.castShadow = true;
    ctx.scene.add(lamp);
  }

  // Rooftop kit: an AC unit and a satellite dish. Reads instantly as a lived-in
  // rooftop and gives the skyline something other than parapets.
  const ac = (x, y, z, s, ry) => {
    box(ctx, ctx.mat.metal, x, y + 0.35, z, 1.2 * s, 0.7 * s, 0.9 * s,
      { solid: false, rotY: ry });
    // Louvre slats on the face.
    for (let i = 0; i < 4; i++) {
      trim(ctx, ctx.mat.metal, x, y + 0.15 + i * 0.14, z + 0.46 * s,
        1.0 * s, 0.06, 0.04);
    }
  };
  ac(-13.5, 9.7, -17.0, 1.0, 0.3);
  ac(19.0, 6.6, -18.0, 0.85, -0.5);
  ac(-16.5, 7.4, 19.0, 0.9, 0.15);

  // Satellite dish on the north-east roof: a lathe bowl on a short mast.
  const dishPts = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    dishPts.push(new THREE.Vector2(t * 0.55, t * t * 0.34));
  }
  const dish = new THREE.Mesh(
    new THREE.LatheGeometry(dishPts, 12),
    new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.7, side: THREE.DoubleSide }));
  dish.position.set(13.5, 7.1, -18.5);
  dish.rotation.set(-1.05, 0, 0.4);
  dish.castShadow = true;
  ctx.scene.add(dish);
  trim(ctx, ctx.mat.metal, 13.5, 6.8, -18.5, 0.09, 0.6, 0.09);

  // A low arched niche in the north-west block: a dark recess that breaks the
  // longest flat wall in the map. Trim only — 0.25m deep, no collision.
  for (const [x, z, w] of [[-21.0, -13.05, 1.1], [-13.0, -13.05, 1.1]]) {
    trim(ctx, ctx.mat.concrete, x, 1.15, z, w, 2.3, 0.22);
    trim(ctx, ctx.mat.sandstone, x, 2.42, z, w + 0.35, 0.3, 0.3);
    // Half-round head, faked with three stepped blocks.
    for (let i = 0; i < 3; i++) {
      const k = 1 - i * 0.28;
      trim(ctx, ctx.mat.sandstone, x, 2.32 + i * 0.14, z + 0.02, w * k, 0.14, 0.26);
    }
    pot(ctx, x + 0.55, z + 0.5, 0.5, x * 3 + 7, false);
  }
}

/** Roof and parapet irregularity — chipped coping, slipped tiles. */
function roofline(ctx) {
  // Displaced roof tiles: a few slabs offset and rotated off each roofline, so
  // the edge is not a ruled line. Sat on top of the existing cornice.
  const ROOFS = [
    [-17, -19, 16, 12, 9.5], [16, -20, 18, 10, 6.4],
    [-19, 17, 12, 14, 7.2], [18, 18, 14, 12, 5.6],
  ];
  for (const [x, z, w, d, h] of ROOFS) {
    for (let i = 0; i < 5; i++) {
      const s = x * 17 + z * 3 + i * 11;
      // Place along a random edge of this roof.
      const edge = Math.floor(rnd(s) * 4);
      const t = rndRange(s + 1, -0.42, 0.42);
      const px = edge < 2 ? x + t * w : x + (edge === 2 ? -1 : 1) * (w / 2 + 0.25);
      const pz = edge < 2 ? z + (edge === 0 ? -1 : 1) * (d / 2 + 0.25) : z + t * d;
      box(ctx, ctx.mat.terracotta, px, h + 0.36, pz,
        rndRange(s + 2, 0.45, 0.8), 0.14, rndRange(s + 3, 0.4, 0.7),
        { solid: false, rotY: rndRange(s + 4, -0.5, 0.5) });
    }

    // Chipped parapet corners: a small block knocked out of alignment at each
    // corner, plus uneven coping stones along the top.
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const s = x + z + sx * 3 + sz * 7;
      if (rnd(s) < 0.35) continue;   // not every corner is damaged
      box(ctx, ctx.mat.plaster,
        x + sx * (w / 2 - 0.15), h + 0.62 + rndRange(s + 1, -0.1, 0.06),
        z + sz * (d / 2 - 0.15),
        rndRange(s + 2, 0.3, 0.55), 0.42, rndRange(s + 3, 0.3, 0.55),
        { solid: false, rotY: rndRange(s + 4, -0.28, 0.28) });
    }
  }

  // Uneven coping along the perimeter wall: a course of individual stones with
  // slight height and rotation jitter, replacing the read of one long extrusion.
  for (const [dx, dz] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
    const horiz = dz !== 0;
    const outer = HALF + 0.45;
    for (let p = -HALF + 2; p < HALF - 1; p += 3.1) {
      const s = p * 7 + dx * 13 + dz * 29;
      if (rnd(s) < 0.55) continue;   // sparse — most of the course is intact
      const px = horiz ? p : dx * outer;
      const pz = horiz ? dz * outer : p;
      box(ctx, ctx.mat.concrete,
        px, WALL_H + 0.30 + rndRange(s + 1, -0.05, 0.10), pz,
        horiz ? rndRange(s + 2, 0.5, 1.1) : 1.3, 0.22,
        horiz ? 1.3 : rndRange(s + 2, 0.5, 1.1),
        { solid: false, rotY: rndRange(s + 3, -0.06, 0.06) });
    }
  }
}
