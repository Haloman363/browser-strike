import * as THREE from 'three';

// Procedural PBR material library. Every texture is drawn to a canvas at load
// time — no image files, no fetches, so the game runs from a cold offline load.
//
// The recipe for each material is the same three-buffer pass:
//   albedo  : what colour the surface is
//   height  : a scalar field of bumps/grooves, never uploaded to the GPU
//   rough   : per-pixel roughness (worn/polished areas differ from surrounding)
// The normal map is *derived* from height by Sobel gradient. That derivation is
// the entire reason surfaces catch the low Mirage sun instead of looking flat;
// a hand-authored "normal map" that is really just tinted noise reads as static.

// ---------------------------------------------------------------------------
// Noise
// ---------------------------------------------------------------------------

// Value noise on an integer lattice. Cheap, and with 5-6 octaves of FBM it is
// indistinguishable from Perlin for surface detail. Tileable by construction:
// lattice coords wrap at `period`, so every texture repeats seamlessly.
function makeNoise(seed) {
  // Integer hash, deterministic per seed so builds are stable.
  // Everything stays inside 32-bit via Math.imul: plain `*` on large constants
  // silently exceeds MAX_SAFE_INTEGER and collapses the output range, which
  // shows up as textures with no high-end detail at all.
  const hash = (x, y) => {
    let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967295;
  };

  const fade = (t) => t * t * (3 - 2 * t); // smoothstep; C1 is enough here

  // Lattice cache. Every pixel hashes its four corners, and neighbouring pixels
  // share corners, so the same handful of values get rehashed hundreds of times
  // per octave. Memoising the lattice per (period) grid turns that into an array
  // read and is worth several seconds of load time across the set.
  // Only cache grids small enough that building one costs less than the hashing
  // it saves; a 720-cell octave is touched about once per cell, so precomputing
  // it is pure overhead.
  const MAX_CACHED = 1 << 16;
  const grids = new Map();
  const gridFor = (px, py) => {
    const cells = px * py;
    if (cells > MAX_CACHED) return null;
    const key = px * 100003 + py;
    let g = grids.get(key);
    if (!g) {
      g = new Float32Array(cells);
      for (let j = 0; j < py; j++) for (let i = 0; i < px; i++) g[j * px + i] = hash(i, j);
      grids.set(key, g);
    }
    return g;
  };

  // Periods must be integers for the wrap to line up on tile edges, and are
  // independent per axis so stretched noise still tiles.
  const value2 = (x, y, px, py = px) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = fade(x - xi), yf = fade(y - yi);
    const x0 = ((xi % px) + px) % px;
    const y0 = ((yi % py) + py) % py;
    const x1 = (x0 + 1) % px;
    const y1 = (y0 + 1) % py;
    const g = gridFor(px, py);
    const a = g ? g[y0 * px + x0] : hash(x0, y0);
    const b = g ? g[y0 * px + x1] : hash(x1, y0);
    const c = g ? g[y1 * px + x0] : hash(x0, y1);
    const d = g ? g[y1 * px + x1] : hash(x1, y1);
    const top = a + (b - a) * xf;
    return top + ((c + (d - c) * xf) - top) * yf;
  };

  return {
    value: value2,
    /**
     * Fractal sum over u,v in 0..1. `fx`/`fy` are cells across the tile per
     * axis — anisotropic on purpose, since grain and streaks need to be
     * stretched. Both must be integers: the lattice wraps at the frequency, so
     * a fractional one lands mid-cell at u=1 and leaves a visible seam. Scale
     * via these arguments rather than by multiplying u/v at the call site,
     * which silently changes the period and reintroduces the seam.
     */
    fbm(x, y, fx, fy = fx, octaves = 5, gain = 0.5, lacunarity = 2) {
      let sum = 0, amp = 1, norm = 0, a = Math.max(1, Math.round(fx)), b = Math.max(1, Math.round(fy));
      for (let o = 0; o < octaves; o++) {
        sum += value2(x * a, y * b, a, b) * amp;
        norm += amp;
        amp *= gain;
        a = Math.max(1, Math.round(a * lacunarity));
        b = Math.max(1, Math.round(b * lacunarity));
      }
      return sum / norm;
    },
    /** Ridged variant — sharp creases. Good for cracks and rock. */
    ridged(x, y, fx, fy = fx, octaves = 4) {
      let sum = 0, amp = 1, norm = 0, a = Math.max(1, Math.round(fx)), b = Math.max(1, Math.round(fy));
      for (let o = 0; o < octaves; o++) {
        const n = 1 - Math.abs(value2(x * a, y * b, a, b) * 2 - 1);
        sum += n * n * amp;
        norm += amp;
        amp *= 0.5;
        a = Math.max(1, Math.round(a * 2));
        b = Math.max(1, Math.round(b * 2));
      }
      return sum / norm;
    },
  };
}

// ---------------------------------------------------------------------------
// Canvas helpers
// ---------------------------------------------------------------------------

function makeCanvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

/** Per-pixel writer. `fn(x, y, u, v)` returns [r,g,b] in 0..255. */
function paint(size, fn) {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const inv = 1 / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const c = fn(x, y, x * inv, y * inv);
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Grayscale field -> canvas. Values are clamped 0..1. */
function paintScalar(size, fn) {
  return paint(size, (x, y, u, v) => {
    const g = Math.max(0, Math.min(1, fn(x, y, u, v))) * 255;
    return [g, g, g];
  });
}

/**
 * Summary statistics for one canvas, kept so verifyMaterials() can assert that
 * a generator actually produced variation instead of a flat field.
 *
 * `sd` is over luminance for colour maps and over the red channel for scalar
 * ones (paintScalar writes grey, so red is the value). Sampling every 4th
 * pixel: at 1024 that is still 65k samples, plenty for a mean and an sd, and
 * it keeps the stats pass off the critical path of load time.
 */
function canvasStats(canvas) {
  const size = canvas.width;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const d = ctx.getImageData(0, 0, size, size).data;
  let sum = 0, sumSq = 0, count = 0, min = 255, max = 0;
  for (let i = 0; i < d.length; i += 16) {
    // Rec.601 luma — close enough for "does this vary", and identical to the
    // channel value for the grey scalar maps.
    const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    sum += l; sumSq += l * l; count++;
    if (l < min) min = l;
    if (l > max) max = l;
  }
  const mean = sum / count;
  return { mean, sd: Math.sqrt(Math.max(0, sumSq / count - mean * mean)), min, max, range: max - min };
}

/** Read a canvas back as a Float32 height field in 0..1. */
function readHeight(canvas) {
  const size = canvas.width;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const d = ctx.getImageData(0, 0, size, size).data;
  const h = new Float32Array(size * size);
  for (let i = 0; i < h.length; i++) h[i] = d[i * 4] / 255;
  return h;
}

/**
 * Sobel the height field into a tangent-space normal map.
 *
 * Encoding is the OpenGL convention Three.js expects: rgb = (n*0.5+0.5) with
 * +Y up in texture space. Sampling wraps, so the normal map tiles as cleanly as
 * the height it came from — a clamped Sobel leaves a visible seam grid.
 * `strength` scales the gradient; it is the bump depth dial.
 */
function heightToNormal(height, size, strength = 2.2) {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const at = (x, y) => height[(((y % size) + size) % size) * size + (((x % size) + size) % size)];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const tl = at(x - 1, y - 1), t = at(x, y - 1), tr = at(x + 1, y - 1);
      const l = at(x - 1, y), r = at(x + 1, y);
      const bl = at(x - 1, y + 1), b = at(x, y + 1), br = at(x + 1, y + 1);

      const dx = (tr + 2 * r + br) - (tl + 2 * l + bl);
      const dy = (bl + 2 * b + br) - (tl + 2 * t + tr);

      // Surface normal of the height field: (-dx, -dy, 1), normalised.
      let nx = -dx * strength;
      let ny = -dy * strength;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len; ny /= len;
      const nzn = nz / len;

      const i = (y * size + x) * 4;
      d[i] = (nx * 0.5 + 0.5) * 255;
      // Flip Y: canvas rows run downward, tangent space runs up.
      d[i + 1] = (-ny * 0.5 + 0.5) * 255;
      d[i + 2] = (nzn * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// ---------------------------------------------------------------------------
// Texture wrapping
// ---------------------------------------------------------------------------

function texture(canvas, { srgb, repeat, aniso }) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = aniso;
  // The bug this guards: only albedo carries colour. Normal and roughness are
  // *data*. Tagging them sRGB applies a decode curve, which flattens normals
  // toward blue and lifts roughness — surfaces go plasticky and shadowless.
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

// ---------------------------------------------------------------------------
// Palette — CS2 Mirage: sun-bleached sandstone, warm shadow, dusty everything
// ---------------------------------------------------------------------------

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
const smooth = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
const mixRGB = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

// ---------------------------------------------------------------------------
// Macro variation — the AAA/procedural dividing line
// ---------------------------------------------------------------------------
//
// Pass 1 looked like printed wallpaper because every generator only had
// high-frequency detail. Detail noise averages out at 3m and beyond, so a wall
// collapses to one flat colour and the tiling becomes the only thing you see.
//
// The fix is a deliberately *low* frequency layer — 1-3 cells across the tile.
// At TEXEL 0.5 one tile is ~2m of world, so a 2-cell field varies over roughly
// a metre: patch discolouration you read as "this bit of wall is dirtier",
// not as texture detail. Every material mixes one in.
//
// It cannot fix tiling on its own (a period-1 field repeats with the tile), so
// the generators pair it with strong *structural* identity — per-block tone,
// per-plank tone — which is what makes the eye read blocks instead of pattern.

/**
 * Low-frequency multiplicative grime/bleach field, centred on 1.
 * `amount` is the peak swing either side. Two octaves only: more and it stops
 * being macro and rejoins the detail band it is supposed to counteract.
 */
function macro(n, u, v, amount, seedOff = 0) {
  // seedOff shifts the lattice by whole cells so each caller gets a different
  // field without breaking the wrap — a fractional offset would desync the
  // tile edges and put a seam down every wall.
  const s = Math.round(seedOff);
  const big = n.fbm(u, v, 2, 2, 2, 0.55) * 0.72;
  const mid = n.fbm(u, v, 5 + s, 5 + s, 2, 0.5) * 0.28;
  return 1 + ((big + mid) - 0.5) * 2 * amount;
}

/**
 * Downward water/dirt streaking from ledges and sills.
 * Stretched ~10:1 along v so runs are vertical ribbons, and biased by `from`
 * (0 = stains start at the top of the tile) with a long falloff — real staining
 * fades out rather than stopping, so a hard cutoff reads as a painted band.
 */
function streaks(n, u, v, { sharp = 0.52, width = 14, fade = 1 } = {}) {
  // Anisotropy comes from the period arguments, never from scaling u/v: many
  // cells across, one or two down, so the noise smears into vertical ribbons.
  const s = n.fbm(u, v, width, 2, 3, 0.55);
  const run = smooth(sharp, sharp + 0.3, s);
  // Each ribbon fades out along its own length using a second slow field, so
  // runs start and stop at different heights. Fading on absolute v instead
  // would put an identical stain band at every vertical tile repeat.
  return run * lerp(1, n.fbm(u, v, 3, 5, 2), fade);
}

/**
 * Ground-in dirt, as blotchy low-lying patches rather than a gradient.
 *
 * The obvious implementation — smoothstep toward v=1 — is wrong here and was
 * already called out for plaster: map.js tiles a wall several times
 * vertically, so a "bottom of the tile" gradient paints a dirty band at every
 * repeat and reads as stripes. Keying to a stretched noise field instead gives
 * accumulation that looks like it settled somewhere without announcing the
 * tile boundary.
 *
 * ponytail: proper base-of-wall grime needs world-space UVs or vertex colour
 * from map.js. Out of scope for a texture-only pass; this is the honest
 * tiling-safe approximation.
 */
function grimePatches(n, u, v, strength = 0.3, freqU = 9, freqV = 14) {
  return smooth(0.58, 0.92, n.fbm(u, v, freqU, freqV, 3)) * strength;
}

// ---------------------------------------------------------------------------
// Generators. Each returns { albedo, height, rough } canvases.
// ---------------------------------------------------------------------------

// Weathered sandstone ashlar. The read is: big blocks, deep mortar, and each
// block a slightly different bake of the same stone.
function genSandstone(size, n) {
  // ROWS must be even: running bond alternates the half-block offset per course,
  // so an odd count puts two identically-offset courses together at the wrap.
  const COLS = 3, ROWS = 6;
  const MORTAR = 0.012;             // mortar width in UV — ashlar, not brick
  const cw = 1 / COLS, ch = 1 / ROWS;

  // Per-block randoms. Three decorrelated draws so a block's tone, its height
  // and whether it is chipped are independent — one shared value made every
  // pale block also a proud block, which read as a regular embossed grid.
  const blockTint = (bx, by) => n.value(bx * 7.3 + 0.5, by * 3.1 + 0.5, 64, 64);
  const blockLift = (bx, by) => n.value(bx * 2.9 + 17.5, by * 11.7 + 3.5, 64, 64);
  const blockWear = (bx, by) => n.value(bx * 13.1 + 41.5, by * 5.3 + 29.5, 64, 64);

  const field = (u, v) => {
    const row = Math.floor(v / ch);
    // Running bond: alternate courses offset by half a block.
    const uo = (u + (row % 2 ? cw * 0.5 : 0)) % 1;
    const col = Math.floor(uo / cw);
    const fx = (uo - col * cw) / cw;      // 0..1 within block
    const fy = (v - row * ch) / ch;

    // Distance to nearest block edge, in UV. Mortar is where this is small.
    const edge = Math.min(fx, 1 - fx) * cw;
    const edgeY = Math.min(fy, 1 - fy) * ch;
    const dEdge = Math.min(edge, edgeY);

    // Wobble the joint so it isn't a CAD line.
    const wobble = (n.fbm(u, v, 48, 48, 3) - 0.5) * 0.010;
    const mortar = 1 - smooth(MORTAR * 0.25, MORTAR + wobble, dEdge);

    // Arris: the narrow band of block face right at the joint. Real ashlar has
    // a rounded, chipped-back edge there, so shading it separately from the
    // mortar is what turns a drawn line into a groove with a lip.
    const arris = (1 - smooth(MORTAR, MORTAR * 3.2, dEdge)) * (1 - mortar);

    return { col, row, fx, fy, dEdge, mortar, arris };
  };

  const height = paintScalar(size, (x, y, u, v) => {
    const f = field(u, v);
    // Base stone sits high in the range so the mortar has room to fall a long
    // way below it. Pass 1 put the face at 0.62 and the joint at 0.24; after
    // Sobel that is a gentle ramp, which is exactly why the walls read as a
    // printed pattern. The face now lives at ~0.85 and mortar bottoms near
    // 0.10 — a 0.75 drop across ~3px, which Sobel turns into a real edge.
    let h = 0.85 + (n.fbm(u, v, 12, 12, 5) - 0.5) * 0.16 + (n.fbm(u, v, 96, 96, 3) - 0.5) * 0.06;
    // Each block sits proud by its own amount — hand-set ashlar is never flush,
    // and this is most of what makes blocks read as separate objects.
    h += (blockLift(f.col, f.row) - 0.5) * 0.16;
    // Mortar recedes, hard. Deep and slightly noisy so the groove floor is not
    // a flat shelf catching a uniform highlight.
    h = lerp(h, 0.10 + (n.fbm(u, v, 130, 130, 2) - 0.5) * 0.07, f.mortar);
    // The arris rolls off toward the joint, so the lit side of every groove has
    // a soft shoulder and the shaded side a sharp one. That asymmetry is what
    // the eye uses to decide a groove is a groove.
    h -= f.arris * 0.14;
    // Chipped corners: erode where two edges meet, gated per block so only
    // some blocks are damaged rather than all of them equally.
    const corner = (1 - smooth(0, 0.11, f.fx) * smooth(0, 0.11, 1 - f.fx)) *
                   (1 - smooth(0, 0.11, f.fy) * smooth(0, 0.11, 1 - f.fy));
    const wear = smooth(0.42, 0.78, blockWear(f.col, f.row));
    h -= corner * n.fbm(u, v, 30, 30, 3) * 0.34 * (0.35 + wear);
    // A few blocks carry a real crack across the face.
    const crack = smooth(0.70, 0.92, n.ridged(u, v, 9, 6, 4)) * wear;
    h -= crack * 0.22;
    return h;
  });

  const STONE_L = [214, 192, 154];
  const STONE_D = [150, 126, 94];
  const BLEACH  = [231, 216, 186];   // sun-baked, almost chalky
  const DAMP    = [118, 100, 76];    // shaded/damp stone, still warm
  const MORTAR_C = [146, 136, 118];
  const GRIME    = [86, 72, 56];

  const albedo = paint(size, (x, y, u, v) => {
    const f = field(u, v);
    const grain = n.fbm(u, v, 20, 20, 5);
    let c = mixRGB(STONE_D, STONE_L, grain * 0.7 + 0.25);

    // Per-block bake. Pushed from a 0.3 multiplicative nudge to an actual
    // palette lerp: a wall wants blocks that are visibly different stones, and
    // brightness-only variation washes out under a bright sun.
    const t = blockTint(f.col, f.row);
    if (t > 0.62) c = mixRGB(c, BLEACH, smooth(0.62, 1.0, t) * 0.55);
    else if (t < 0.38) c = mixRGB(c, DAMP, smooth(0.38, 0.0, t) * 0.45);

    // Macro patch discolouration — the layer that stops a 12m wall reading as
    // one flat colour at distance.
    c = shade(c, macro(n, u, v, 0.13, 1));

    // Fine tooth breaks up flat areas at close range.
    c = shade(c, 0.94 + n.fbm(u, v, 110, 110, 3) * 0.12);

    // Mortar is cooler, greyer and darker — it is recessed, so less sky
    // reaches it. Baking that occlusion in agrees with the normal map.
    c = mixRGB(c, shade(MORTAR_C, 0.68 + n.fbm(u, v, 90, 90, 2) * 0.3), f.mortar);
    // Chipped-back arris exposes fresh, paler stone.
    c = mixRGB(c, BLEACH, f.arris * smooth(0.45, 0.85, blockWear(f.col, f.row)) * 0.4);

    // Water staining running down the wall, plus a shorter wash below each
    // course where the joint sheds water onto the block under it.
    c = mixRGB(c, GRIME, streaks(n, u, v, { sharp: 0.55, width: 16 }) * 0.26);
    const belowJoint = smooth(0.45, 0.0, f.fy) * 0.55;
    c = mixRGB(c, GRIME, streaks(n, u, v, { sharp: 0.5, width: 26, fade: 0.4 }) * belowJoint * 0.32);

    // Ground-in dirt in patches — see grimePatches on why this is not a
    // gradient toward the bottom of the tile.
    c = mixRGB(c, GRIME, grimePatches(n, u, v, 0.30, 7, 12));
    return c;
  });

  const rough = paintScalar(size, (x, y, u, v) => {
    const f = field(u, v);
    let r = 0.78 + (n.fbm(u, v, 16, 16, 4) - 0.5) * 0.22;
    // Macro wet/dry patches. Roughness variation at this scale is what makes
    // the sun's sheen crawl across a wall as you strafe — uniform roughness
    // gives a dead, matte panel no matter how good the normal map is.
    r *= macro(n, u, v, 0.16, 5);
    // Wind-polished proud faces go smoother; sheltered eroded stone rougher.
    r = lerp(r, 0.58, smooth(0.55, 0.85, n.fbm(u, v, 7, 7, 3)) * 0.7);
    // Mortar is chalk. Chipped arrises are freshly broken and rougher still.
    r = lerp(r, 0.96, f.mortar);
    r = lerp(r, 0.92, f.arris * 0.5);
    return r;
  });

  return { albedo, height, rough };
}

// Painted plaster over masonry, flaking. The story: warm off-white paint, and
// where it has failed you see the grey-pink substrate underneath.
function genPlaster(size, n) {
  // Flake mask: large blobby regions where paint has let go. The narrow
  // smoothstep band is deliberate — paint tears at a hard edge, it doesn't fade.
  // Two populations, because one threshold on one field gave the leopard-print
  // that made pass 1's plaster read as camouflage: a lot of small flakes plus a
  // few large failures, rather than uniformly-sized blobs at 50% coverage.
  const flake = (u, v) => {
    // Flakes are SMALL and clustered. Earlier versions drove them from a low
    // frequency field, which produced wall-sized blobs that read as mould
    // rather than as paint lifting off.
    const blob = n.fbm(u, v, 17, 17, 5);
    const edge = n.fbm(u, v, 44, 44, 3);
    const small = smooth(0.58, 0.66, blob * 0.68 + edge * 0.32);
    // A slow field only GATES where flaking happens (near damp), it never
    // becomes a patch by itself.
    const wet = smooth(0.50, 0.78, n.fbm(u, v, 3, 4, 2));
    const mid = smooth(0.62, 0.70, n.fbm(u, v, 11, 12, 4)) * wet;
    return clamp01(small * 0.6 + mid * 0.5);
  };

  // Crack network from ridged noise — thin, branching, deep. Thresholds sit
  // near the p90/p99 of the noise distribution: higher and nothing fires.
  const crack = (u, v) => {
    const r = n.ridged(u, v, 7, 7, 4);
    return smooth(0.62, 0.86, r) * smooth(0.30, 0.55, n.fbm(u + 9, v + 4, 4, 4, 3));
  };

  const height = paintScalar(size, (x, y, u, v) => {
    const f = flake(u, v);
    const c = crack(u, v);
    // Sits high so the flake step and cracks have somewhere to fall to.
    let h = 0.86 + (n.fbm(u, v, 5, 5, 4) - 0.5) * 0.09 + (n.fbm(u, v, 80, 80, 3) - 0.5) * 0.03;
    // Paint has real thickness — the step down to bare substrate is the whole
    // reason flaking reads as flaking rather than as a stain. 0.13 was far too
    // shallow to survive Sobel at gameplay distance.
    h -= smooth(0.35, 0.62, f) * 0.30;
    // Bare substrate is coarse render, not smooth paint.
    h -= f * (n.fbm(u, v, 55, 55, 3) - 0.5) * 0.10;
    h -= c * 0.42;                         // cracks cut in
    return h;
  });

  const PAINT = [226, 210, 182];
  const PAINT_DIRTY = [198, 180, 152];
  // Substrate is the render coat under the paint, so it is close in value —
  // a big paint/substrate contrast reads as camouflage blotching up close.
  const SUBSTRATE = [196, 172, 143];
  const GRIME = [96, 82, 66];

  const albedo = paint(size, (x, y, u, v) => {
    const f = flake(u, v);
    const c = crack(u, v);
    let col = mixRGB(PAINT_DIRTY, PAINT, n.fbm(u, v, 9, 9, 4));
    // Macro: whole regions of the wall are dirtier or more sun-bleached. Applied
    // before the flaking so exposed substrate inherits the same regional tone.
    col = shade(col, macro(n, u, v, 0.11, 2));
    col = mixRGB(col, shade(SUBSTRATE, 0.9 + n.fbm(u, v, 40, 40, 3) * 0.25), f);
    // A darker lip where paint tore away reads as thickness.
    const lip = smooth(0.30, 0.55, f) * (1 - smooth(0.55, 0.85, f));
    col = shade(col, 1 - lip * 0.26);
    // Cracks are dark, not black — ambient still reaches into them.
    col = mixRGB(col, [70, 58, 48], c * 0.8);
    // Water staining runs vertically.
    col = mixRGB(col, GRIME, streaks(n, u, v, { sharp: 0.5, width: 18 }) * 0.22);
    // Ground-in dirt. Keyed to noise, not to v: the texture tiles vertically,
    // so a gradient toward the bottom edge would band at every repeat.
    col = mixRGB(col, GRIME, grimePatches(n, u, v, 0.28));
    return col;
  });

  const rough = paintScalar(size, (x, y, u, v) => {
    const f = flake(u, v);
    // Intact paint is comparatively smooth; bare substrate is chalk.
    let r = lerp(0.55, 0.95, f) + (n.fbm(u, v, 25, 25, 3) - 0.5) * 0.14;
    // Macro sheen variation: paint that still has body vs paint gone matte.
    r *= macro(n, u, v, 0.15, 3);
    // Rain-washed runs are smoother than the chalky field around them.
    r = lerp(r, 0.5, streaks(n, u, v, { sharp: 0.58, width: 18 }) * 0.35);
    return r;
  });

  return { albedo, height, rough };
}

// Terracotta barrel roof tiles: repeating half-cylinders with mortar between.
function genTerracotta(size, n) {
  const TILES = 6;                  // barrels across the tile
  const tw = 1 / TILES;

  const field = (u, v) => {
    const col = Math.floor(u / tw);
    const fx = (u - col * tw) / tw;
    // Barrel cross-section. sqrt of the sine biases the shoulder outward so the
    // lit crown is narrow and the shaded flanks are wide — a plain sine reads as
    // a flat stripe because it spends too long near its peak.
    const curve = Math.sqrt(Math.max(0, Math.sin(fx * Math.PI)));
    // Overlap seams run across the barrels every 1/3 of the tile.
    const seamPhase = (v * 3) % 1;
    const seam = 1 - smooth(0.0, 0.10, Math.min(seamPhase, 1 - seamPhase) * 2);
    return { col, fx, curve, seam };
  };

  const height = paintScalar(size, (x, y, u, v) => {
    const f = field(u, v);
    // Half-cylinder cross-section — sin gives the barrel its round catch.
    let h = 0.30 + f.curve * 0.55;
    // Per-tile height jitter: hand-laid tiles never sit flush.
    h += (n.value(f.col, Math.floor(v * 3) % 3, TILES, 3) - 0.5) * 0.10;
    h += (n.fbm(u, v, 60, 60, 3) - 0.5) * 0.05;      // clay grain
    h += (n.fbm(u, v, 220, 220, 2) - 0.5) * 0.03;     // fine tooth, keeps it from going soft
    h -= f.seam * 0.22;                          // step down at the overlap
    return h;
  });

  const CLAY_L = [196, 96, 58];
  const CLAY_D = [138, 62, 40];
  const BLEACH = [206, 150, 110];

  const albedo = paint(size, (x, y, u, v) => {
    const f = field(u, v);
    const tileVar = n.value(f.col, Math.floor(v * 3) % 3, TILES, 3);
    let c = mixRGB(CLAY_D, CLAY_L, n.fbm(u, v, 14, 14, 4) * 0.6 + tileVar * 0.4);
    // Sun bleaches the crown of each barrel; the flanks stay saturated.
    c = mixRGB(c, BLEACH, smooth(0.72, 1.0, f.curve) * 0.4);
    // Ambient occlusion baked into albedo at the valleys — cheap, and reads
    // correctly because the normal map agrees with it.
    c = shade(c, 0.55 + f.curve * 0.45);
    c = shade(c, 1 - f.seam * 0.3);
    // Lichen/dust in the valleys.
    const valley = 1 - f.curve;
    c = mixRGB(c, [122, 118, 92], valley * smooth(0.44, 0.72, n.fbm(u, v, 11, 11, 4)) * 0.45);
    return c;
  });

  const rough = paintScalar(size, (x, y, u, v) => {
    const f = field(u, v);
    // Fired clay crowns are slightly glazed; the dusty valleys are not.
    return lerp(0.94, 0.68, smooth(0.35, 0.95, f.curve)) +
           (n.fbm(u, v, 30, 30, 3) - 0.5) * 0.1;
  });

  return { albedo, height, rough };
}

// Poured concrete: grey-tan, air-bubble pitting, form-board staining.
function genConcrete(size, n) {
  // Pit mask: sparse round voids where air was trapped against the form.
  // Narrower and higher than pass 1 (0.60/0.76 fired on roughly a quarter of
  // the surface, which is blotch, not bug-holes).
  const pits = (u, v) => smooth(0.72, 0.82, n.fbm(u, v, 34, 34, 3));

  // Slab joints. This material is used for the plaza floor as well as poured
  // walls, and a joint that runs in v only reads as timber decking from any
  // elevated view. Running it in BOTH axes reads as paving either way up.
  const jointAt = (t, n_) => 1 - smooth(0, 0.02, Math.abs(((t * n_) % 1) - 0.5) * 0.5);
  const boardLine = (u, v) => Math.max(jointAt(v, 4), jointAt(u, 3));

  const height = paintScalar(size, (x, y, u, v) => {
    const b = boardLine(u, v);
    let h = 0.80 + (n.fbm(u, v, 8, 8, 5) - 0.5) * 0.09 + (n.fbm(u, v, 120, 120, 3) - 0.5) * 0.04;
    h -= pits(u, v) * 0.40;              // bug-holes are deep, not dimples
    h -= b * 0.14;                       // form-board joint, now a real step
    h -= smooth(0.80, 0.95, n.ridged(u, v, 6, 6, 3)) * 0.10;   // shrinkage cracks
    return h;
  });

  // Mirage's plaza is sun-bleached paving, not grey structural concrete. A
  // neutral grey here reads as cold and drains the warmth out of every shot
  // that includes the ground, which is most of them.
  const BASE = [193, 174, 142];
  const WARM = [209, 190, 155];
  const STAIN = [132, 104, 76];

  const albedo = paint(size, (x, y, u, v) => {
    let c = mixRGB(BASE, WARM, n.fbm(u, v, 7, 7, 5));
    // Macro pour variation — concrete placed on different days never matches.
    c = shade(c, macro(n, u, v, 0.12, 4));
    c = shade(c, 0.92 + n.fbm(u, v, 55, 55, 4) * 0.16);
    // Pits read darker because they self-shadow. Kept shallow: at the ground's
    // 12x repeat a strong value drop tiles as visible black speckling.
    c = shade(c, 1 - pits(u, v) * 0.18);
    // Rust/dirt streaks running down.
    c = mixRGB(c, STAIN, streaks(n, u, v, { sharp: 0.5, width: 20 }) * 0.24);
    // Broad damp patches.
    c = shade(c, 1 - smooth(0.48, 0.70, n.fbm(u, v, 3, 3, 3)) * 0.16);
    // Dirt collecting along the form-board scars.
    c = mixRGB(c, STAIN, boardLine(u, v) * 0.18);
    c = mixRGB(c, STAIN, grimePatches(n, u, v, 0.20, 6, 10));
    return c;
  });

  const rough = paintScalar(size, (x, y, u, v) => {
    // Pits are rough; the trowelled skin between them is smoother. Wide spread
    // so the sheen breaks up across a big flat slab.
    let r = lerp(0.62, 0.97, pits(u, v)) + (n.fbm(u, v, 18, 18, 4) - 0.5) * 0.16;
    r *= macro(n, u, v, 0.14, 9);
    // Rain-washed and hand-polished areas go smoother still.
    r = lerp(r, 0.48, smooth(0.6, 0.9, n.fbm(u, v, 4, 4, 3)) * 0.5);
    return lerp(r, 0.95, boardLine(u, v) * 0.6);
  });

  return { albedo, height, rough };
}

// Weathered planking. Grain comes from stretching noise hard along the board
// axis — the anisotropy is what makes it read as wood and not as marble.
function genWood(size, n, { planks = 5, gapDepth = 0.35 } = {}) {
  const pw = 1 / planks;

  // Per-plank randoms, decorrelated the same way as sandstone's blocks.
  const plankTone = (i) => n.value(i * 4.3 + 0.5, 1.5, 32, 32);
  const plankLift = (i) => n.value(i * 9.7 + 21.5, 7.5, 32, 32);
  const plankWear = (i) => n.value(i * 3.1 + 53.5, 13.5, 32, 32);

  const field = (u, v) => {
    const idx = Math.floor(v / pw);
    const fy = (v - idx * pw) / pw;
    // Tightened from 0.05 to 0.028 so the gap is a narrow dark slot rather than
    // a soft 10%-of-the-board shadow — a wide soft gap reads as a painted
    // stripe, which is what made pass 1's decking look like a printed plank.
    const gap = (1 - smooth(0, 0.028, fy)) + smooth(0.972, 1, fy);
    return { idx, fy, gap: clamp01(gap) };
  };

  // Grain: low frequency across the board, very high along it.
  const grain = (u, v, idx) => {
    const off = idx * 3.77;
    const rings = n.fbm(u + off, v + off, 11, 234, 4);
    // Turbulence the ring position slightly so lines aren't parallel.
    const warp = n.fbm(u + off, v, 10, 40, 3) * 0.25;
    return (Math.sin((rings + warp) * 34) * 0.5 + 0.5);
  };

  const height = paintScalar(size, (x, y, u, v) => {
    const f = field(u, v);
    const g = grain(u, v, f.idx);
    const wear = plankWear(f.idx);
    // Base sits high so the gap can cut a genuinely deep slot.
    let h = 0.86 + (g - 0.5) * 0.16;            // grain stands proud/recessed
    // Each plank sits at its own height and cups slightly across its width —
    // weathered boards always do, and it is the strongest cue that these are
    // separate pieces of timber rather than a striped surface.
    h += (plankLift(f.idx) - 0.5) * 0.14;
    h -= Math.sin(f.fy * Math.PI) * 0.05 * wear;
    h += (n.fbm(u, v, 90, 600, 3) - 0.5) * 0.05;
    h -= f.gap * gapDepth;                       // the joint between boards
    // Split ends and dents, gated per plank so only some boards are damaged.
    h -= smooth(0.62, 0.84, n.ridged(u, v, 20, 120, 3)) * 0.20 * (0.4 + wear);
    return h;
  });

  const WOOD_L = [162, 122, 78];
  const WOOD_D = [92, 64, 40];
  const GREY = [138, 126, 110];   // sun-silvered surface
  const DIRT = [74, 58, 42];

  const albedo = paint(size, (x, y, u, v) => {
    const f = field(u, v);
    const g = grain(u, v, f.idx);
    // Per-board base tone so the boards clearly came from different trees.
    // Widened from a 0.35 weight to a full palette lerp for the extremes.
    const tone = plankTone(f.idx);
    let c = mixRGB(WOOD_D, WOOD_L, g * 0.6 + tone * 0.4);
    // Weathering silvers exposed boards unevenly, and some far more than
    // others — a whole plank going grey is a very readable per-plank cue.
    const silver = smooth(0.34, 0.70, n.fbm(u, v, 5, 5, 4)) * 0.4 +
                   smooth(0.55, 0.9, plankWear(f.idx)) * 0.4;
    c = mixRGB(c, GREY, clamp01(silver));
    c = shade(c, macro(n, u, v, 0.10, 6));
    c = shade(c, 0.92 + n.fbm(u, v, 80, 720, 3) * 0.16);
    // Dirt worked into the grain and along the joints.
    c = mixRGB(c, DIRT, grimePatches(n, u, v, 0.26, 8, 20));
    // Dirt banks up against the joints where it cannot be swept out.
    c = mixRGB(c, DIRT, smooth(0.25, 0.0, Math.min(f.fy, 1 - f.fy)) * 0.30);
    // Gaps are dark: geometry behind the boards is unlit.
    c = shade(c, 1 - f.gap * 0.8);
    return c;
  });

  const rough = paintScalar(size, (x, y, u, v) => {
    const f = field(u, v);
    const g = grain(u, v, f.idx);
    // Raised grain is rough; worn flats have been polished by handling and by
    // boots. Range widened from 0.55-0.88 to 0.42-0.98.
    let r = 0.74 + g * 0.24;
    // Traffic polish: the middle of each plank wears smooth, edges stay rough.
    const centre = 1 - smooth(0.0, 0.55, Math.abs(f.fy - 0.5) * 2);
    r = lerp(r, 0.42, centre * smooth(0.45, 0.85, plankWear(f.idx)) * 0.8);
    r = lerp(r, 0.55, smooth(0.50, 0.78, n.fbm(u, v, 4, 4, 3)) * 0.7);
    r *= macro(n, u, v, 0.12, 13);
    return lerp(r, 0.98, f.gap);
  });

  return { albedo, height, rough };
}

// Painted steel losing the fight with rust. Metalness stays high globally and
// roughness carries the rust — cheaper than a metalnessMap and visually the
// same at play distance, since rust reads as "rough metal" not "dielectric".
function genMetal(size, n) {
  const rust = (u, v) => {
    const blotch = n.fbm(u, v, 5, 5, 5);
    const detail = n.fbm(u + 2.3, v + 8.1, 20, 20, 4);
    // Rust creeps downward from where water sat.
    const creep = n.fbm(u, v, 24, 4, 2);
    return clamp01(smooth(0.40, 0.60, blotch * 0.6 + detail * 0.25 + creep * 0.15));
  };

  const height = paintScalar(size, (x, y, u, v) => {
    const r = rust(u, v);
    // Rolled steel is near-flat; rust blisters and eventually pits through.
    let h = 0.76 + (n.fbm(u, v, 60, 60, 3) - 0.5) * 0.03;
    h += r * (n.fbm(u, v, 45, 45, 4) - 0.5) * 0.16;
    h -= smooth(0.70, 0.95, r) * 0.18;
    // Panel seam and rivet line across the middle.
    const seam = 1 - smooth(0, 0.010, Math.abs(v - 0.5));
    h -= seam * 0.22;
    const rivet = Math.hypot(((u * 8) % 1) - 0.5, (v - 0.5) * 8) ;
    h += (1 - smooth(0.10, 0.20, rivet)) * 0.14;
    return h;
  });

  const PAINT = [92, 104, 106];    // faded industrial blue-grey
  const RUST_L = [150, 82, 40];
  const RUST_D = [88, 46, 26];

  const albedo = paint(size, (x, y, u, v) => {
    const r = rust(u, v);
    let c = shade(PAINT, 0.85 + n.fbm(u, v, 12, 12, 4) * 0.3);
    const rc = mixRGB(RUST_D, RUST_L, n.fbm(u, v, 28, 28, 4));
    c = mixRGB(c, rc, r);
    // Chalky halo where paint is lifting but not yet gone.
    c = mixRGB(c, [180, 178, 170], smooth(0.20, 0.40, r) * (1 - smooth(0.40, 0.6, r)) * 0.35);
    return c;
  });

  const rough = paintScalar(size, (x, y, u, v) => {
    const r = rust(u, v);
    // Intact paint is semi-gloss (0.4); rust is completely matte (0.95).
    return lerp(0.40, 0.95, r) + (n.fbm(u, v, 35, 35, 3) - 0.5) * 0.08;
  });

  return { albedo, height, rough };
}

// Ground sand. Two scales that matter: metre-scale ripples the eye tracks as
// you run, and grain-scale sparkle that stops the ground looking like felt.
function genSand(size, n) {
  // This tile covers ~2m and the ground plane repeats it ~35 times, so it is
  // the material most punished by high-frequency contrast: pass 1's hard-
  // thresholded pebbles turned the whole courtyard into grey static. Rules
  // here are (a) nothing high-frequency gets high contrast, (b) every colour
  // stays warm, (c) the structure the eye tracks lives at low frequency.

  const ripple = (u, v) => {
    // Warp the wave with noise so ripples meander instead of being a grating.
    // The v multiplier must be even: sin() has to complete whole cycles across
    // the tile or the wave arrives at v=1 out of phase with v=0 and seams.
    const warp = n.fbm(u, v, 4, 4, 4) * 0.6 + n.fbm(u, v, 11, 11, 3) * 0.25;
    return Math.sin((v * 10 + warp * 6) * Math.PI) * 0.5 + 0.5;
  };

  // Compacted footpaths: broad, smooth, slightly sunken and darker.
  const path = (u, v) => smooth(0.46, 0.74, n.fbm(u, v, 2, 3, 3));

  // Scattered stones. Sparse and *small*: a high threshold on a mid-frequency
  // field, so a few stones per tile rather than a uniform pepper. The old
  // 0.72/0.86 band on period-50 noise fired on ~15% of pixels.
  const stones = (u, v) => smooth(0.80, 0.90, n.fbm(u, v, 26, 26, 2));

  const height = paintScalar(size, (x, y, u, v) => {
    const p = path(u, v);
    let h = 0.52 + (n.fbm(u, v, 3, 3, 4) - 0.5) * 0.34;   // dune undulation
    // Ripples are wind structure: strong on open sand, flattened on the paths
    // where feet have compacted them. That contrast is most of the read.
    h += (ripple(u, v) - 0.5) * 0.26 * (1 - p * 0.8);
    h += (n.fbm(u, v, 140, 140, 3) - 0.5) * 0.05;         // grain
    h -= p * 0.09;                                        // paths sit lower
    h += stones(u, v) * 0.22;                             // stones sit proud
    return h;
  });

  // Warm throughout — no grey or blue anywhere in the albedo, including the
  // stones. A cool pebble colour was what gave pass 1's ground its grey cast.
  const SAND_L = [222, 196, 152];
  const SAND_D = [176, 148, 108];
  const SAND_PALE = [234, 214, 176];   // sun-bleached drift
  const PATH_C = [158, 130, 96];       // compacted, damper, still warm
  const STONE_C = [170, 150, 122];

  const albedo = paint(size, (x, y, u, v) => {
    const r = ripple(u, v);
    let c = mixRGB(SAND_D, SAND_L, n.fbm(u, v, 6, 6, 5) * 0.6 + r * 0.4);

    // Large-scale tonal drift — the fix for "uniform at every distance". Two
    // separate macro fields so lightness and warmth vary independently.
    c = mixRGB(c, SAND_PALE, smooth(0.5, 0.95, n.fbm(u, v, 2, 2, 3)) * 0.45);
    c = shade(c, macro(n, u, v, 0.10, 7));

    // Fine grain, deliberately low contrast: this is the band that turns to
    // noise once the tile is a few metres away.
    c = shade(c, 0.965 + n.fbm(u, v, 120, 120, 3) * 0.07);

    // Compacted paths.
    c = mixRGB(c, PATH_C, path(u, v) * 0.5);
    // Stones: warm, and only lightly tinted so they read as embedded, not laid
    // on top. The height field and normal are doing the real work.
    c = mixRGB(c, STONE_C, stones(u, v) * 0.45);
    return c;
  });

  const rough = paintScalar(size, (x, y, u, v) => {
    // Loose sand is matte; compacted paths are polished by traffic; stones are
    // smoother again. Widened well past pass 1's ±0.06 so the sun actually
    // travels across the ground as you move.
    let r = 0.95 - path(u, v) * 0.22;
    r = lerp(r, 0.62, stones(u, v) * 0.8);
    r *= macro(n, u, v, 0.08, 11);
    return r + (n.fbm(u, v, 40, 40, 3) - 0.5) * 0.08;
  });

  return { albedo, height, rough };
}

// Shipping crate: vertical planks with a frame band top and bottom. Unlike
// `wood` this is authored to look right on a 1m cube at 1x repeat.
function genCrate(size, n) {
  const PLANKS = 6;
  const pw = 1 / PLANKS;
  const FRAME = 0.13;              // frame band height in UV

  const plankTone = (i) => n.value(i * 6.1 + 0.5, 2.5, 32, 32);
  const plankLift = (i) => n.value(i * 15.3 + 37.5, 8.5, 32, 32);
  const plankWear = (i) => n.value(i * 2.7 + 61.5, 19.5, 32, 32);

  const field = (u, v) => {
    const idx = Math.floor(u / pw);
    const fx = (u - idx * pw) / pw;
    // Narrower than pass 1's 0.055: crate slats butt close together, and a wide
    // soft gap reads as a stripe painted on a box rather than a real slot.
    const gap = clamp01((1 - smooth(0, 0.030, fx)) + smooth(0.970, 1, fx));
    // Frame rails run horizontally across the top and bottom.
    const frame = smooth(FRAME + 0.01, FRAME - 0.01, v) + smooth(1 - FRAME - 0.01, 1 - FRAME + 0.01, v);
    return { idx, fx, gap, frame: clamp01(frame) };
  };

  const grain = (u, v, idx) => {
    const off = idx * 2.91;
    const rings = n.fbm(u + off, v + off, 88, 7, 4);
    // Ring frequency has to stay low: a 1m crate fills little screen space, and
    // packing many light/dark bands into it aliases into a shredded texture
    // rather than reading as wood.
    return Math.sin(rings * 9) * 0.5 + 0.5;
  };

  const height = paintScalar(size, (x, y, u, v) => {
    const f = field(u, v);
    const g = grain(u, v, f.idx);
    // Raised to 0.80 so the slot between slats has depth to fall into.
    let h = 0.80 + (g - 0.5) * 0.14;
    h += (plankLift(f.idx) - 0.5) * 0.10;    // slats never sit perfectly flush
    h -= f.gap * 0.46 * (1 - f.frame);       // frame rails bridge the gaps
    h += f.frame * 0.22;                     // rails sit proud of the planks
    // Nail heads where each plank meets each rail.
    const nailU = Math.abs(f.fx - 0.5);
    const nailV = Math.min(Math.abs(v - FRAME * 0.5), Math.abs(v - (1 - FRAME * 0.5)));
    h += (1 - smooth(0.02, 0.055, Math.hypot(nailU * 0.6, nailV))) * 0.12;
    // Chipped/splintered slat edges on the more beaten-up boards.
    h -= smooth(0.60, 0.85, n.ridged(u, v, 120, 14, 3)) * 0.14 * plankWear(f.idx);
    h += (n.fbm(u, v, 468, 78, 3) - 0.5) * 0.04;
    return h;
  });

  const PINE_L = [188, 156, 110];
  const PINE_D = [152, 120, 80];
  const WEATHERED = [128, 118, 100];
  const DIRT = [76, 62, 46];

  const albedo = paint(size, (x, y, u, v) => {
    const f = field(u, v);
    const g = grain(u, v, f.idx);
    let c = mixRGB(PINE_D, PINE_L, g * 0.6 + plankTone(f.idx) * 0.4);
    // Some slats have greyed off far more than their neighbours.
    c = mixRGB(c, WEATHERED, smooth(0.38, 0.72, n.fbm(u, v, 6, 6, 4)) * 0.30 +
                             smooth(0.6, 0.95, plankWear(f.idx)) * 0.35);
    c = shade(c, macro(n, u, v, 0.10, 8));
    // Rails are a touch darker — different stock, more handling.
    c = shade(c, 1 - f.frame * 0.12);
    c = shade(c, 1 - f.gap * 0.75 * (1 - f.frame));
    // Scuffs and ground-in dirt, noise-placed so the tile has no top/bottom.
    c = mixRGB(c, DIRT, grimePatches(n, u, v, 0.34, 14, 20));
    // Edge wear: corners of the tile are handled most, so they bleach.
    const edge = Math.min(u, 1 - u, v, 1 - v);
    c = mixRGB(c, [206, 186, 152], (1 - smooth(0, 0.06, edge)) * 0.35);
    return c;
  });

  const rough = paintScalar(size, (x, y, u, v) => {
    const f = field(u, v);
    // Handled edges and rails are burnished smooth. Spread widened so a crate
    // has an obvious sheen gradient from its worn corners to its dusty faces.
    const edge = Math.min(u, 1 - u, v, 1 - v);
    let r = 0.90 + (n.fbm(u, v, 22, 22, 3) - 0.5) * 0.16;
    r *= macro(n, u, v, 0.10, 15);
    r = lerp(r, 0.48, (1 - smooth(0, 0.10, edge)) * 0.85);
    r = lerp(r, 0.62, f.frame * 0.6);
    // Whole slats that have been rubbed smooth by handling.
    r = lerp(r, 0.55, smooth(0.55, 0.9, plankWear(f.idx)) * 0.5);
    return lerp(r, 0.97, f.gap);
  });

  return { albedo, height, rough };
}

// ---------------------------------------------------------------------------
// Recipes
// ---------------------------------------------------------------------------

// `repeat` is tuned for world units of roughly 1 texture tile per 2-4 metres,
// which is the density CS-style maps use. `normalScale` is per-material because
// the height fields have different natural amplitudes.
// `bump` scales the Sobel gradient; `normalScale` scales the resulting normal
// again in the shader. They multiply, so raising both compounds fast.
//
// Pass 1's problem was not only that these were low, but that the height fields
// they sampled were shallow — a big normalScale on a soft height field just
// makes soft shading louder, it does not create an edge. The height fields were
// deepened first (mortar 0.62->0.10 rather than 0.62->0.24, plaster's flake
// step 0.13->0.30, plank gaps 0.32->0.46) and these were then raised on top.
// Values are held at or under ~1.5 normalScale: past that the derived normals
// start to exceed what the tangent basis on a flat box face can represent and
// lit surfaces develop a faceted, foil-like look.
const RECIPES = {
  sandstone: { gen: genSandstone, size: 1024, seed: 11, repeat: 1, bump: 4.2, normalScale: 1.5, roughness: 1.0, metalness: 0.0, color: 0xffffff },
  plaster:   { gen: genPlaster,   size: 1024, seed: 23, repeat: 1, bump: 3.4, normalScale: 1.25, roughness: 1.0, metalness: 0.0, color: 0xffffff },
  terracotta:{ gen: genTerracotta,size: 1024, seed: 37, repeat: 2, bump: 3.4, normalScale: 1.25, roughness: 1.0, metalness: 0.0, color: 0xffffff },
  concrete:  { gen: genConcrete,  size: 1024, seed: 51, repeat: 1, bump: 3.6, normalScale: 1.3, roughness: 1.0, metalness: 0.0, color: 0xffffff },
  wood:      { gen: genWood,      size: 1024, seed: 67, repeat: 1, bump: 4.0, normalScale: 1.4, roughness: 1.0, metalness: 0.0, color: 0xffffff },
  metal:     { gen: genMetal,     size: 512,  seed: 83, repeat: 1, bump: 2.4, normalScale: 1.0, roughness: 1.0, metalness: 0.85, color: 0xffffff },
  // Sand stays lower: the ground is viewed at a grazing angle where strong
  // normals turn into shimmer, and it tiles ~35x so any harshness multiplies.
  // Sand carries its read almost entirely in the normal map — the albedo is
  // nearly flat by nature, so weak normals leave it looking like paper.
  sand:      { gen: genSand,      size: 1024, seed: 97, repeat: 8, bump: 3.4, normalScale: 1.5, roughness: 1.0, metalness: 0.0, color: 0xffffff },
  crate:     { gen: genCrate,     size: 512,  seed: 113, repeat: 1, bump: 4.0, normalScale: 1.4, roughness: 1.0, metalness: 0.0, color: 0xffffff },
};

export const MATERIAL_NAMES = Object.freeze(Object.keys(RECIPES));

export class Materials {
  constructor() {
    /** @type {Map<string, THREE.MeshStandardMaterial>} */
    this.cache = new Map();
    this.maxAnisotropy = 1;
    /**
     * Per-material texture statistics, filled in as each one is generated.
     * verifyMaterials() asserts against these; they are the only way to check
     * "did this texture come out varied" without eyeballing a screenshot.
     * @type {Map<string, {albedo: object, height: object, rough: object, ms: number}>}
     */
    this.stats = new Map();
    /** Total wall-clock milliseconds spent in the last build(). */
    this.buildMs = 0;
  }

  /**
   * Build every material. Idempotent: a second call returns the same instances.
   *
   * The per-material work is synchronous CPU canvas painting, but on software GL
   * the whole loop measured ~17s, and because it never yields the browser cannot
   * repaint for its duration -- the loading overlay froze mid-animation and read
   * as a hang. Awaiting between materials hands the main thread back so the
   * progress label and spinner actually tick. The yields add a frame each and do
   * not change what gets built.
   *
   * @param {number} maxAnisotropy renderer.capabilities.getMaxAnisotropy()
   * @param {(done:number,total:number,name:string)=>void} [onProgress]
   * @returns {Record<string, THREE.MeshStandardMaterial>}
   */
  async build(maxAnisotropy = 8, onProgress = null) {
    this.maxAnisotropy = maxAnisotropy;
    const t0 = performance.now();
    const out = {};
    let done = 0;
    for (const name of MATERIAL_NAMES) {
      onProgress?.(done, MATERIAL_NAMES.length, name);
      // Yield BEFORE the work, so the label naming this material is painted
      // while it is being built rather than after it finishes.
      await new Promise((r) => requestAnimationFrame(() => r()));
      out[name] = this.get(name);
      done++;
    }
    onProgress?.(done, MATERIAL_NAMES.length, '');
    this.buildMs = performance.now() - t0;
    console.log(`materials: built ${MATERIAL_NAMES.length} in ${this.buildMs.toFixed(0)}ms`);
    return out;
  }

  /** Build one material on demand, cached. */
  get(name) {
    const cached = this.cache.get(name);
    if (cached) return cached;

    const r = RECIPES[name];
    if (!r) throw new Error(`unknown material "${name}"`);

    const t0 = performance.now();
    const n = makeNoise(r.seed);
    const { albedo, height, rough } = r.gen(r.size, n);
    const aniso = this.maxAnisotropy;

    const normalCanvas = heightToNormal(readHeight(height), r.size, r.bump);

    this.stats.set(name, {
      albedo: canvasStats(albedo),
      height: canvasStats(height),
      rough: canvasStats(rough),
      ms: performance.now() - t0,
    });

    const mat = new THREE.MeshStandardMaterial({
      color: r.color,
      map: texture(albedo, { srgb: true, repeat: r.repeat, aniso }),
      normalMap: texture(normalCanvas, { srgb: false, repeat: r.repeat, aniso }),
      roughnessMap: texture(rough, { srgb: false, repeat: r.repeat, aniso }),
      roughness: r.roughness,
      metalness: r.metalness,
    });
    mat.normalScale.set(r.normalScale, r.normalScale);
    mat.name = name;

    this.cache.set(name, mat);
    return mat;
  }

  /** Free GPU memory. Textures are not shared between materials. */
  dispose() {
    for (const mat of this.cache.values()) {
      mat.map?.dispose();
      mat.normalMap?.dispose();
      mat.roughnessMap?.dispose();
      mat.dispose();
    }
    this.cache.clear();
  }
}

/**
 * Clone `material` with its texture repeat rescaled for a surface `worldSize`
 * metres across, so a 12m wall and a 2m crate show the same texel density.
 *
 * Clones rather than mutating because THREE.Texture.repeat is shared by every
 * mesh using that texture — editing in place silently rescales the whole map.
 * `tileMetres` is how many world metres one texture tile should cover.
 */
export function applyTriplanarRepeat(material, worldSize, tileMetres = 2.5) {
  const mat = material.clone();
  const rx = Math.max(1, Math.round(worldSize / tileMetres));
  for (const key of ['map', 'normalMap', 'roughnessMap']) {
    const src = material[key];
    if (!src) continue;
    const t = src.clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, rx);
    t.colorSpace = src.colorSpace;   // clone() copies it, but be explicit
    t.needsUpdate = true;
    mat[key] = t;
  }
  return mat;
}

/**
 * Minimum texture statistics per material.
 *
 * These exist because the pass-1 failure mode was invisible to every structural
 * check: the maps were all present, correctly tagged and correctly wrapped, and
 * the surfaces still looked like flat printed paper. What was actually wrong
 * was *distributional* — not enough spread in the albedo, not enough depth in
 * the height field, near-constant roughness. So those are what get asserted.
 *
 *   albedoSd   luminance sd, 0..255. Proof the surface is not one flat colour.
 *   heightRange peak-to-trough of the height field, 0..255. This is the number
 *              that decides whether mortar is a groove or a darker pixel row.
 *   roughSd    roughness sd. Low sd means light cannot play across the surface.
 *
 * Thresholds are set a little under what the current generators produce, so
 * they catch a regression without failing on every small tweak. Verified
 * against measured values in-browser rather than guessed — see the report.
 */
const STAT_FLOOR = {
  sandstone: { albedoSd: 14, heightRange: 150, roughSd: 12 },
  plaster:   { albedoSd: 12, heightRange: 130, roughSd: 14 },
  terracotta:{ albedoSd: 18, heightRange: 150, roughSd: 12 },
  concrete:  { albedoSd: 8,  heightRange: 130, roughSd: 12 },
  wood:      { albedoSd: 14, heightRange: 150, roughSd: 12 },
  metal:     { albedoSd: 12, heightRange: 100, roughSd: 14 },
  // Sand is deliberately the calmest surface in the map, so its floors are the
  // lowest — but non-zero, since a flat ground plane was the pass-1 complaint.
  sand:      { albedoSd: 6,  heightRange: 110, roughSd: 6 },
  crate:     { albedoSd: 14, heightRange: 150, roughSd: 12 },
};

/**
 * Browser-side self-check. Canvas does not exist in plain Node, so this cannot
 * run under `node`; call it from the console or a dev build after build().
 *
 * Pass a Materials instance (not a plain object) to get the statistical checks
 * as well — the stats are collected during generation and live on the instance.
 * Returns { ok, failures }.
 */
export function verifyMaterials(materials) {
  const failures = [];
  const fail = (m) => failures.push(m);

  const entries = materials instanceof Materials
    ? Object.fromEntries(materials.cache)
    : materials;
  const stats = materials instanceof Materials ? materials.stats : null;

  for (const name of MATERIAL_NAMES) {
    if (!(name in entries)) { fail(`${name}: missing`); continue; }
    const mat = entries[name];

    if (!(mat instanceof THREE.MeshStandardMaterial)) {
      fail(`${name}: not a MeshStandardMaterial`);
      continue;
    }
    for (const key of ['map', 'normalMap', 'roughnessMap']) {
      if (!mat[key]) fail(`${name}.${key}: not set`);
    }
    // The whole point of the check: colour data decoded, surface data not.
    if (mat.map && mat.map.colorSpace !== THREE.SRGBColorSpace) {
      fail(`${name}.map: expected SRGBColorSpace, got "${mat.map.colorSpace}"`);
    }
    if (mat.normalMap && mat.normalMap.colorSpace === THREE.SRGBColorSpace) {
      fail(`${name}.normalMap: must NOT be sRGB`);
    }
    if (mat.roughnessMap && mat.roughnessMap.colorSpace === THREE.SRGBColorSpace) {
      fail(`${name}.roughnessMap: must NOT be sRGB`);
    }
    for (const key of ['map', 'normalMap', 'roughnessMap']) {
      const t = mat[key];
      if (!t) continue;
      if (t.wrapS !== THREE.RepeatWrapping || t.wrapT !== THREE.RepeatWrapping) {
        fail(`${name}.${key}: wrap is not RepeatWrapping`);
      }
      if (t.anisotropy < 1) fail(`${name}.${key}: anisotropy ${t.anisotropy}`);
    }
    // A flat normal map means the Sobel pass produced nothing — usually a sign
    // the height generator returned a constant. Sample the centre pixel.
    if (mat.normalMap?.image) {
      const img = mat.normalMap.image;
      const ctx = img.getContext?.('2d');
      if (ctx) {
        const px = ctx.getImageData(img.width >> 1, img.height >> 1, 1, 1).data;
        if (px[2] < 120) fail(`${name}.normalMap: blue channel ${px[2]}, normals look wrong`);
      }
    }

    // Normal maps should also be *tilted* across the surface, not merely
    // non-flat at one pixel. A wholly flat map has r=g=128 everywhere, so the
    // sd of the red channel going to ~0 is the signature of a dead height
    // field even when the centre pixel happens to look fine.
    if (mat.normalMap?.image) {
      const ns = canvasStats(mat.normalMap.image);
      if (ns.sd < 3) fail(`${name}.normalMap: sd ${ns.sd.toFixed(1)}, effectively flat`);
    }

    // Distributional checks — the ones that would have caught pass 1.
    const s = stats?.get(name);
    const floor = STAT_FLOOR[name];
    if (s && floor) {
      if (s.albedo.sd < floor.albedoSd) {
        fail(`${name}.map: albedo sd ${s.albedo.sd.toFixed(1)} < ${floor.albedoSd}, too uniform`);
      }
      if (s.height.range < floor.heightRange) {
        fail(`${name}: height range ${s.height.range.toFixed(0)} < ${floor.heightRange}, relief too shallow`);
      }
      if (s.rough.sd < floor.roughSd) {
        fail(`${name}.roughnessMap: sd ${s.rough.sd.toFixed(1)} < ${floor.roughSd}, roughness too uniform`);
      }
      // A roughness map that has clipped to 0 or 1 across most of its area has
      // lost the variation it was supposed to carry, whatever its sd says.
      if (s.rough.mean > 250 || s.rough.mean < 40) {
        fail(`${name}.roughnessMap: mean ${s.rough.mean.toFixed(0)} is clipped`);
      }
      // Albedo must not be blown out or crushed — either kills the tone
      // variation regardless of how much sd survives.
      if (s.albedo.mean > 235) fail(`${name}.map: albedo mean ${s.albedo.mean.toFixed(0)}, blown out`);
    }
  }

  if (stats && stats.size === 0) {
    fail('no texture stats collected — was build() called on this instance?');
  }

  const ok = failures.length === 0;
  if (ok) {
    console.log(`verifyMaterials: ${MATERIAL_NAMES.length} materials ok`);
    if (stats) console.table(Object.fromEntries([...stats].map(([k, s]) => [k, {
      albedoSd: +s.albedo.sd.toFixed(1),
      heightRange: +s.height.range.toFixed(0),
      roughSd: +s.rough.sd.toFixed(1),
      ms: +s.ms.toFixed(0),
    }])));
  } else for (const f of failures) console.error(`verifyMaterials: ${f}`);
  return { ok, failures };
}
