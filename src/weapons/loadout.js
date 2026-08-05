import { GRENADE, THROW } from './grenades.js';

// EQUIPMENT LOADOUT -- what the number keys throw, and how long you held one.
//
// Kept out of grenades.js on purpose: that file is the simulation and knows
// nothing about input. This is the binding layer between a keypress and a
// throw, so it is the only place that has an opinion about keyboards.

/**
 * One key per grenade. CS-style ordering: frag on 4, then the utility.
 * `count` is the carry limit for that slot.
 */
export const GRENADE_SLOTS = [
  { key: '4', type: GRENADE.HE, count: 1 },
  { key: '5', type: GRENADE.FLASH, count: 2 },
  { key: '6', type: GRENADE.SMOKE, count: 1 },
  { key: '7', type: GRENADE.MOLOTOV, count: 1 },
  { key: '8', type: GRENADE.DECOY, count: 1 },
];

/** Hold thresholds, in seconds, for the medium and full throws. */
export const COOK_MEDIUM = 0.2;
export const COOK_FULL = 0.8;

/**
 * Map how long the throw key was held to one of the three throw strengths.
 *
 * Non-finite or negative holds fall back to UNDERHAND rather than returning
 * undefined -- a dropped frame or a clock glitch must still produce a
 * throwable grenade, because the alternative is a crash mid-round while the
 * player is holding live ordnance.
 */
export function strengthForCook(held) {
  if (!Number.isFinite(held) || held <= 0) return THROW.UNDERHAND;
  if (held >= COOK_FULL) return THROW.FULL;
  if (held >= COOK_MEDIUM) return THROW.MEDIUM;
  return THROW.UNDERHAND;
}
