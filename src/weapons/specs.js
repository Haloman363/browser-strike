// Every weapon in the game, as data.
//
// The AK-47's numbers were tuned first and live in rifle.js; this file is the
// shape they generalise to. A weapon is a stat block plus a spray pattern plus
// a set of animation timings -- nothing here is code, so a new gun is an entry
// in this table rather than another 1300-line module. Behaviour that genuinely
// differs by archetype (a bolt cycle, a scope, a pellet spread) is a FLAG read
// by the shared weapon class, not a per-gun fork.
//
// Damage/rpm/recoil figures are CS-like rather than scraped: they are tuned for
// how this game feels at this scale, and the AK entry must keep matching
// rifle.js RIFLE or the existing tuning silently regresses.

/** Archetypes drive which code paths run, not just which numbers are used. */
export const KIND = {
  RIFLE: 'rifle',
  SMG: 'smg',
  PISTOL: 'pistol',
  SNIPER: 'sniper',
  SHOTGUN: 'shotgun',
  LMG: 'lmg',
  KNIFE: 'knife',
  GRENADE: 'grenade',
  BOMB: 'bomb',
};

export const TEAM = { CT: 'ct', T: 't', BOTH: 'both' };

/**
 * Shared defaults. A spec overrides only what differs, so a reader can see at a
 * glance what actually makes each weapon distinct.
 */
export const WEAPON_DEFAULTS = {
  kind: KIND.RIFLE,
  team: TEAM.BOTH,
  price: 0,
  rpm: 600,
  magSize: 30,
  reserve: 90,
  reloadTime: 2.4,
  damage: 36,
  armorPierce: 0.75,     // fraction of damage that survives armour
  falloff: 0.98,
  falloffUnit: 9.5,
  maxRange: 120,
  pellets: 1,            // >1 makes it a shotgun; each pellet rolls spread

  recoilScale: 0.0075,
  recoverRate: 9.0,
  recoverFraction: 1.0,
  patternJitter: 0.11,
  patternResetTime: 0.65,

  spreadBase: 0.00045,
  spreadCrouch: 0.45,
  spreadMove: 0.0016,
  spreadAir: 0.055,
  spreadPerShot: 0.0022,
  spreadShotCap: 12,
  shotDecayRate: 6.0,

  // Movement speed multiplier while held. Heavy guns slow you down; this is a
  // real part of CS balance, not flavour.
  moveScale: 0.92,

  // --- Behaviour flags read by the shared weapon class.
  automatic: true,
  boltAction: false,     // re-chamber between shots (AWP/Scout)
  scope: null,           // {fovs:[...], moveScale} when the gun can zoom
  burst: 0,              // >0 fires N-round bursts per trigger pull
  silenced: false,
  canDetach: false,      // USP/M4A1-S silencer toggle

  // --- Animation timings, seconds. Per weapon because an AWP must feel heavy
  // and an MP9 must feel light; sharing one number makes every gun feel same-y.
  anim: {
    draw: 0.7,
    reloadOut: 0.75,     // mag leaves the well
    reloadIn: 1.15,      // new mag seated
    reloadCharge: 0.0,   // bolt/slide pull after seating, 0 = none
    inspect: 2.2,
    fireKick: 0.055,
    sway: 1.0,           // multiplier on idle sway amplitude
  },
};

/**
 * The spray patterns. Authored as per-shot [x, y] deltas in pattern units --
 * +y up, +x right -- exactly like the AK's, so they stay readable and tunable.
 * Guns that do not spray (pistols, snipers) get a short pattern; the shared
 * code clamps the index, so a pattern never has to cover the whole magazine.
 */
export const PATTERNS = {
  // The AK: hard climb, left sweep, back right, loose weave. Mirrors rifle.js.
  ak47: [
    [0.00, 0.00],
    [0.05, 1.55], [-0.10, 1.70], [0.08, 1.80], [-0.06, 1.75],
    [0.12, 1.60], [-0.15, 1.45], [0.10, 1.30], [-0.20, 1.10], [0.05, 0.95],
    [-0.85, 0.55], [-1.10, 0.35], [-1.25, 0.20], [-1.15, 0.05], [-0.90, -0.05],
    [0.60, 0.10], [1.15, 0.15], [1.35, 0.05], [1.30, -0.05], [1.05, 0.00],
    [0.55, 0.20], [-0.35, 0.25], [-0.80, 0.10], [-0.70, -0.10], [-0.25, -0.05],
    [0.45, 0.15], [0.85, 0.10], [0.70, -0.10], [0.25, 0.05], [-0.30, 0.10],
  ],
  // M4: same family, tamer climb and a tighter weave -- the reason it is the
  // easier rifle to control.
  m4: [
    [0.00, 0.00],
    [0.04, 1.25], [-0.08, 1.35], [0.06, 1.40], [-0.05, 1.35],
    [0.09, 1.25], [-0.11, 1.15], [0.08, 1.05], [-0.14, 0.90], [0.04, 0.80],
    [-0.60, 0.45], [-0.78, 0.30], [-0.88, 0.18], [-0.80, 0.05], [-0.62, -0.04],
    [0.45, 0.08], [0.82, 0.12], [0.95, 0.04], [0.90, -0.04], [0.72, 0.00],
    [0.40, 0.16], [-0.25, 0.20], [-0.55, 0.08], [-0.48, -0.08], [-0.18, -0.04],
    [0.32, 0.12], [0.60, 0.08], [0.50, -0.08], [0.18, 0.04], [-0.20, 0.08],
  ],
  // SMGs climb fast and wander wide: accurate for the first few, messy after.
  smg: [
    [0.00, 0.00],
    [0.10, 1.15], [-0.18, 1.25], [0.16, 1.20], [-0.22, 1.10],
    [0.28, 0.95], [-0.35, 0.85], [0.30, 0.70], [-0.42, 0.60], [0.25, 0.50],
    [-0.70, 0.35], [0.85, 0.30], [-0.95, 0.20], [0.90, 0.10], [-0.75, 0.05],
    [0.65, 0.12], [-0.80, 0.08], [0.88, -0.05], [-0.70, 0.02], [0.55, 0.08],
  ],
  // Pistols: mostly vertical, and you are expected to pace your shots.
  pistol: [
    [0.00, 0.00],
    [0.06, 1.40], [-0.12, 1.55], [0.10, 1.45], [-0.15, 1.30],
    [0.18, 1.15], [-0.22, 1.00], [0.16, 0.85], [-0.20, 0.70], [0.12, 0.60],
  ],
  // Bolt guns barely have a pattern: one shot, then you re-chamber.
  sniper: [[0.00, 0.00], [0.05, 2.10], [-0.08, 2.20]],
  // Shotguns kick hard and straight.
  shotgun: [[0.00, 0.00], [0.10, 2.40], [-0.14, 2.55], [0.12, 2.45]],
  // LMG: long, ugly, and it never really settles.
  lmg: [
    [0.00, 0.00],
    [0.08, 1.60], [-0.14, 1.75], [0.12, 1.70], [-0.10, 1.60],
    [0.18, 1.45], [-0.24, 1.30], [0.20, 1.15], [-0.28, 1.00], [0.14, 0.90],
    [-0.90, 0.60], [-1.15, 0.40], [-1.30, 0.25], [-1.20, 0.10], [-0.95, 0.00],
    [0.70, 0.15], [1.25, 0.18], [1.45, 0.08], [1.38, -0.04], [1.10, 0.02],
    [0.60, 0.22], [-0.40, 0.26], [-0.85, 0.12], [-0.75, -0.08], [-0.30, -0.02],
    [0.50, 0.16], [0.90, 0.12], [0.75, -0.08], [0.28, 0.06], [-0.32, 0.12],
  ],
};

/**
 * @typedef {typeof WEAPON_DEFAULTS & {id:string, name:string, pattern:number[][]}} WeaponSpec
 */

/** Raw per-weapon overrides. Merged with WEAPON_DEFAULTS by getSpec(). */
const SPECS = {
  // ---- Rifles ------------------------------------------------------------
  ak47: {
    name: 'AK-47', kind: KIND.RIFLE, team: TEAM.T, price: 2700,
    rpm: 600, magSize: 30, damage: 36, armorPierce: 0.775,
    pattern: 'ak47', moveScale: 0.9,
    anim: { draw: 0.7, reloadOut: 0.75, reloadIn: 1.15, inspect: 2.2 },
  },
  m4a4: {
    name: 'M4A4', kind: KIND.RIFLE, team: TEAM.CT, price: 3100,
    rpm: 666, magSize: 30, damage: 33, armorPierce: 0.7,
    recoilScale: 0.0062, pattern: 'm4', moveScale: 0.91,
    anim: { draw: 0.72, reloadOut: 0.8, reloadIn: 1.2, inspect: 2.2 },
  },
  m4a1s: {
    name: 'M4A1-S', kind: KIND.RIFLE, team: TEAM.CT, price: 2900,
    rpm: 600, magSize: 20, reserve: 80, damage: 38, armorPierce: 0.7,
    recoilScale: 0.0050, pattern: 'm4', moveScale: 0.91,
    silenced: true, canDetach: true,
    anim: { draw: 0.72, reloadOut: 0.8, reloadIn: 1.25, inspect: 2.4 },
  },
  galil: {
    name: 'Galil AR', kind: KIND.RIFLE, team: TEAM.T, price: 1800,
    rpm: 666, magSize: 35, damage: 30, armorPierce: 0.775,
    recoilScale: 0.0085, pattern: 'ak47', moveScale: 0.92,
    anim: { draw: 0.75, reloadOut: 0.85, reloadIn: 1.3, inspect: 2.2 },
  },
  famas: {
    name: 'FAMAS', kind: KIND.RIFLE, team: TEAM.CT, price: 2050,
    rpm: 666, magSize: 25, damage: 30, armorPierce: 0.7,
    // Burst mode: one trigger pull sends 3, so it is not free-running auto.
    recoilScale: 0.0072, pattern: 'm4', burst: 3, automatic: false, moveScale: 0.92,
    anim: { draw: 0.72, reloadOut: 0.8, reloadIn: 1.2, inspect: 2.2 },
  },
  sg553: {
    name: 'SG 553', kind: KIND.RIFLE, team: TEAM.T, price: 3000,
    rpm: 545, magSize: 30, damage: 30, armorPierce: 1.0,
    recoilScale: 0.0068, pattern: 'ak47', moveScale: 0.88,
    scope: { fovs: [40], moveScale: 0.5 },
    anim: { draw: 0.8, reloadOut: 0.85, reloadIn: 1.3, inspect: 2.4 },
  },
  aug: {
    name: 'AUG', kind: KIND.RIFLE, team: TEAM.CT, price: 3300,
    rpm: 666, magSize: 30, damage: 28, armorPierce: 0.9,
    recoilScale: 0.0058, pattern: 'm4', moveScale: 0.88,
    scope: { fovs: [40], moveScale: 0.5 },
    anim: { draw: 0.8, reloadOut: 0.85, reloadIn: 1.3, inspect: 2.4 },
  },

  // ---- Snipers -----------------------------------------------------------
  awp: {
    name: 'AWP', kind: KIND.SNIPER, price: 4750,
    rpm: 41, magSize: 10, reserve: 30, damage: 115, armorPierce: 0.975,
    falloff: 0.99, maxRange: 200,
    recoilScale: 0.011, pattern: 'sniper', automatic: false, boltAction: true,
    moveScale: 0.66, spreadMove: 0.011,
    scope: { fovs: [40, 15], moveScale: 0.35 },
    anim: { draw: 1.25, reloadOut: 1.0, reloadIn: 1.5, reloadCharge: 0.45, inspect: 2.8, sway: 0.7 },
  },
  ssg08: {
    name: 'SSG 08', kind: KIND.SNIPER, price: 1700,
    rpm: 48, magSize: 10, reserve: 30, damage: 88, armorPierce: 0.85,
    falloff: 0.99, maxRange: 180,
    recoilScale: 0.009, pattern: 'sniper', automatic: false, boltAction: true,
    moveScale: 0.85, spreadMove: 0.009,
    scope: { fovs: [40, 15], moveScale: 0.5 },
    anim: { draw: 1.0, reloadOut: 0.9, reloadIn: 1.35, reloadCharge: 0.4, inspect: 2.6, sway: 0.8 },
  },
  scar20: {
    name: 'SCAR-20', kind: KIND.SNIPER, team: TEAM.CT, price: 5000,
    rpm: 80, magSize: 20, reserve: 90, damage: 80, armorPierce: 0.825,
    falloff: 0.99, maxRange: 180,
    recoilScale: 0.010, pattern: 'sniper', automatic: false,
    moveScale: 0.7, scope: { fovs: [40, 15], moveScale: 0.4 },
    anim: { draw: 1.1, reloadOut: 0.95, reloadIn: 1.4, inspect: 2.6, sway: 0.75 },
  },
  g3sg1: {
    name: 'G3SG1', kind: KIND.SNIPER, team: TEAM.T, price: 5000,
    rpm: 80, magSize: 20, reserve: 90, damage: 80, armorPierce: 0.825,
    falloff: 0.99, maxRange: 180,
    recoilScale: 0.010, pattern: 'sniper', automatic: false,
    moveScale: 0.7, scope: { fovs: [40, 15], moveScale: 0.4 },
    anim: { draw: 1.1, reloadOut: 0.95, reloadIn: 1.4, inspect: 2.6, sway: 0.75 },
  },

  // ---- SMGs --------------------------------------------------------------
  mp9: {
    name: 'MP9', kind: KIND.SMG, team: TEAM.CT, price: 1250,
    rpm: 857, magSize: 30, damage: 26, armorPierce: 0.6,
    falloff: 0.94, falloffUnit: 8, maxRange: 90,
    recoilScale: 0.0055, pattern: 'smg', moveScale: 0.98, spreadMove: 0.0009,
    anim: { draw: 0.55, reloadOut: 0.6, reloadIn: 0.95, inspect: 1.8, sway: 1.15 },
  },
  mac10: {
    name: 'MAC-10', kind: KIND.SMG, team: TEAM.T, price: 1050,
    rpm: 800, magSize: 30, damage: 29, armorPierce: 0.575,
    falloff: 0.94, falloffUnit: 8, maxRange: 90,
    recoilScale: 0.0068, pattern: 'smg', moveScale: 0.98, spreadMove: 0.0010,
    anim: { draw: 0.55, reloadOut: 0.6, reloadIn: 0.95, inspect: 1.8, sway: 1.15 },
  },
  mp5sd: {
    name: 'MP5-SD', kind: KIND.SMG, price: 1500,
    rpm: 750, magSize: 30, damage: 27, armorPierce: 0.6,
    falloff: 0.94, falloffUnit: 8, maxRange: 95,
    recoilScale: 0.0052, pattern: 'smg', moveScale: 0.96, silenced: true,
    anim: { draw: 0.6, reloadOut: 0.65, reloadIn: 1.0, inspect: 2.0, sway: 1.1 },
  },
  ump45: {
    name: 'UMP-45', kind: KIND.SMG, price: 1200,
    rpm: 666, magSize: 25, damage: 35, armorPierce: 0.65,
    falloff: 0.92, falloffUnit: 8, maxRange: 90,
    recoilScale: 0.0060, pattern: 'smg', moveScale: 0.96,
    anim: { draw: 0.6, reloadOut: 0.65, reloadIn: 1.0, inspect: 2.0, sway: 1.1 },
  },
  p90: {
    name: 'P90', kind: KIND.SMG, price: 2350,
    rpm: 857, magSize: 50, reserve: 100, damage: 26, armorPierce: 0.69,
    falloff: 0.94, falloffUnit: 8, maxRange: 95,
    recoilScale: 0.0058, pattern: 'smg', moveScale: 0.95,
    anim: { draw: 0.65, reloadOut: 0.9, reloadIn: 1.35, inspect: 2.2, sway: 1.05 },
  },
  bizon: {
    name: 'PP-Bizon', kind: KIND.SMG, price: 1400,
    rpm: 750, magSize: 64, reserve: 120, damage: 27, armorPierce: 0.6,
    falloff: 0.94, falloffUnit: 8, maxRange: 85,
    recoilScale: 0.0056, pattern: 'smg', moveScale: 0.96,
    anim: { draw: 0.6, reloadOut: 0.8, reloadIn: 1.25, inspect: 2.0, sway: 1.1 },
  },

  // ---- Pistols -----------------------------------------------------------
  usp: {
    name: 'USP-S', kind: KIND.PISTOL, team: TEAM.CT, price: 0,
    rpm: 352, magSize: 12, reserve: 24, damage: 35, armorPierce: 0.505,
    falloff: 0.91, falloffUnit: 8, maxRange: 80,
    recoilScale: 0.0060, pattern: 'pistol', automatic: false,
    moveScale: 1.0, silenced: true, canDetach: true,
    anim: { draw: 0.5, reloadOut: 0.55, reloadIn: 0.9, reloadCharge: 0.25, inspect: 1.8, sway: 1.2 },
  },
  glock: {
    name: 'Glock-18', kind: KIND.PISTOL, team: TEAM.T, price: 0,
    rpm: 400, magSize: 20, reserve: 120, damage: 30, armorPierce: 0.47,
    falloff: 0.91, falloffUnit: 8, maxRange: 80,
    recoilScale: 0.0055, pattern: 'pistol', automatic: false, moveScale: 1.0,
    anim: { draw: 0.5, reloadOut: 0.55, reloadIn: 0.9, reloadCharge: 0.2, inspect: 1.8, sway: 1.2 },
  },
  deagle: {
    name: 'Desert Eagle', kind: KIND.PISTOL, price: 700,
    rpm: 267, magSize: 7, reserve: 35, damage: 63, armorPierce: 0.93,
    falloff: 0.93, falloffUnit: 9, maxRange: 110,
    recoilScale: 0.0135, pattern: 'pistol', automatic: false,
    moveScale: 0.98, spreadPerShot: 0.006,
    anim: { draw: 0.6, reloadOut: 0.7, reloadIn: 1.05, reloadCharge: 0.3, inspect: 2.0, sway: 1.0 },
  },
  p250: {
    name: 'P250', kind: KIND.PISTOL, price: 300,
    rpm: 400, magSize: 13, reserve: 26, damage: 38, armorPierce: 0.645,
    falloff: 0.90, falloffUnit: 7, maxRange: 75,
    recoilScale: 0.0062, pattern: 'pistol', automatic: false, moveScale: 1.0,
    anim: { draw: 0.5, reloadOut: 0.55, reloadIn: 0.9, reloadCharge: 0.2, inspect: 1.8, sway: 1.2 },
  },
  fiveseven: {
    name: 'Five-SeveN', kind: KIND.PISTOL, team: TEAM.CT, price: 500,
    rpm: 400, magSize: 20, reserve: 100, damage: 32, armorPierce: 0.685,
    falloff: 0.92, falloffUnit: 8, maxRange: 85,
    recoilScale: 0.0058, pattern: 'pistol', automatic: false, moveScale: 1.0,
    anim: { draw: 0.5, reloadOut: 0.55, reloadIn: 0.92, reloadCharge: 0.2, inspect: 1.8, sway: 1.2 },
  },
  tec9: {
    name: 'Tec-9', kind: KIND.PISTOL, team: TEAM.T, price: 500,
    rpm: 500, magSize: 18, reserve: 90, damage: 33, armorPierce: 0.62,
    falloff: 0.92, falloffUnit: 8, maxRange: 85,
    recoilScale: 0.0070, pattern: 'pistol', automatic: false, moveScale: 1.0,
    anim: { draw: 0.5, reloadOut: 0.55, reloadIn: 0.9, reloadCharge: 0.2, inspect: 1.8, sway: 1.2 },
  },
  cz75: {
    name: 'CZ75-Auto', kind: KIND.PISTOL, price: 500,
    rpm: 750, magSize: 12, reserve: 12, damage: 31, armorPierce: 0.755,
    falloff: 0.92, falloffUnit: 8, maxRange: 80,
    recoilScale: 0.0075, pattern: 'pistol', automatic: true, moveScale: 1.0,
    anim: { draw: 0.5, reloadOut: 0.55, reloadIn: 0.9, reloadCharge: 0.2, inspect: 1.8, sway: 1.2 },
  },
  r8: {
    name: 'R8 Revolver', kind: KIND.PISTOL, price: 600,
    rpm: 150, magSize: 8, reserve: 8, damage: 86, armorPierce: 0.93,
    falloff: 0.93, falloffUnit: 9, maxRange: 110,
    recoilScale: 0.0130, pattern: 'pistol', automatic: false, moveScale: 0.98,
    anim: { draw: 0.8, reloadOut: 0.9, reloadIn: 1.4, inspect: 2.2, sway: 1.0 },
  },

  // ---- Shotguns ----------------------------------------------------------
  nova: {
    name: 'Nova', kind: KIND.SHOTGUN, price: 1050,
    rpm: 68, magSize: 8, reserve: 32, damage: 26, armorPierce: 0.5,
    pellets: 9, falloff: 0.75, falloffUnit: 6, maxRange: 40,
    spreadBase: 0.035, recoilScale: 0.012, pattern: 'shotgun',
    automatic: false, moveScale: 0.92,
    // Shell-at-a-time: reloadIn is PER SHELL, not for the whole tube.
    anim: { draw: 0.8, reloadOut: 0.5, reloadIn: 0.45, inspect: 2.2, sway: 0.9 },
  },
  xm1014: {
    name: 'XM1014', kind: KIND.SHOTGUN, price: 2000,
    rpm: 171, magSize: 7, reserve: 32, damage: 20, armorPierce: 0.8,
    pellets: 6, falloff: 0.75, falloffUnit: 6, maxRange: 45,
    spreadBase: 0.030, recoilScale: 0.010, pattern: 'shotgun',
    moveScale: 0.92,
    anim: { draw: 0.8, reloadOut: 0.5, reloadIn: 0.45, inspect: 2.2, sway: 0.9 },
  },
  mag7: {
    name: 'MAG-7', kind: KIND.SHOTGUN, team: TEAM.CT, price: 1300,
    rpm: 120, magSize: 5, reserve: 32, damage: 30, armorPierce: 0.75,
    pellets: 8, falloff: 0.72, falloffUnit: 5, maxRange: 35,
    spreadBase: 0.032, recoilScale: 0.011, pattern: 'shotgun',
    automatic: false, moveScale: 0.9,
    anim: { draw: 0.8, reloadOut: 0.7, reloadIn: 1.1, inspect: 2.2, sway: 0.9 },
  },
  sawedoff: {
    name: 'Sawed-Off', kind: KIND.SHOTGUN, team: TEAM.T, price: 1100,
    rpm: 68, magSize: 7, reserve: 32, damage: 32, armorPierce: 0.55,
    pellets: 8, falloff: 0.70, falloffUnit: 5, maxRange: 30,
    spreadBase: 0.042, recoilScale: 0.013, pattern: 'shotgun',
    automatic: false, moveScale: 0.9,
    anim: { draw: 0.8, reloadOut: 0.5, reloadIn: 0.45, inspect: 2.2, sway: 0.9 },
  },

  // ---- LMGs --------------------------------------------------------------
  m249: {
    name: 'M249', kind: KIND.LMG, price: 5200,
    rpm: 750, magSize: 100, reserve: 200, damage: 32, armorPierce: 0.8,
    falloff: 0.97, maxRange: 130,
    recoilScale: 0.0080, pattern: 'lmg', moveScale: 0.76,
    anim: { draw: 1.2, reloadOut: 1.4, reloadIn: 2.2, inspect: 2.8, sway: 0.8 },
  },
  negev: {
    name: 'Negev', kind: KIND.LMG, price: 1700,
    rpm: 800, magSize: 150, reserve: 200, damage: 35, armorPierce: 0.75,
    falloff: 0.97, maxRange: 130,
    recoilScale: 0.0105, pattern: 'lmg', moveScale: 0.74,
    anim: { draw: 1.2, reloadOut: 1.5, reloadIn: 2.4, inspect: 2.8, sway: 0.8 },
  },

  // ---- Knife -------------------------------------------------------------
  knife: {
    name: 'Knife', kind: KIND.KNIFE, price: 0,
    rpm: 240, magSize: Infinity, reserve: 0, reloadTime: 0,
    damage: 42, armorPierce: 0.85, maxRange: 1.4,
    // Secondary is the heavy stab; backstabs are a large multiplier both ways.
    heavyDamage: 90, heavyRpm: 70, backstabMult: 4.5,
    automatic: false, moveScale: 1.0, spreadBase: 0,
    anim: { draw: 0.45, inspect: 2.0, slash: 0.4, stab: 0.75, sway: 1.3 },
  },
};

/**
 * Merge a spec over the defaults. Nested `anim` merges too, so a weapon that
 * only overrides `draw` still gets every other timing.
 * @param {string} id
 * @returns {WeaponSpec}
 */
export function getSpec(id) {
  const raw = SPECS[id];
  if (!raw) throw new Error(`unknown weapon: ${id}`);
  const pattern = PATTERNS[raw.pattern] ?? PATTERNS.pistol;
  return {
    ...WEAPON_DEFAULTS,
    ...raw,
    id,
    pattern,
    anim: { ...WEAPON_DEFAULTS.anim, ...(raw.anim ?? {}) },
  };
}

export const WEAPON_IDS = Object.keys(SPECS);

/** Every spec, built once. Useful for tests that must cover the whole table. */
export function allSpecs() {
  return WEAPON_IDS.map(getSpec);
}
