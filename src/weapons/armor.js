// Body armour: kevlar vest + optional helmet.
//
// The model is CS's, because CS's is the one every player already has intuition
// for: armour does not add health, it converts incoming damage into armour
// durability at a per-weapon exchange rate. The rate is `armorPierce`, which
// already lives on every entry in specs.js -- an AK at 0.775 keeps 77.5% of its
// damage through a vest, a USP at 0.505 keeps barely half. That number IS the
// armour model; nothing here invents a second one.
//
// Two rules make it feel right rather than merely arithmetically correct:
//
//   1. A HELMET is what protects the head. A vest alone does nothing about a
//      headshot -- the 4x hitbox multiplier lands in full. This is why "kevlar
//      + helmet" is a separate purchase and why an AK headshot kills through
//      full armour anyway (36 * 4 * 0.775 = 111.6).
//   2. Armour DEGRADES. Each absorbed hit eats durability proportional to the
//      damage it stopped, so a player who has been shot at is progressively
//      less protected. Without this, one vest trivialises a whole round.
//
// applyArmor is a PURE function over numbers. It knows nothing about players,
// hitboxes or the network, so the host, the client prediction and the tests can
// all call it and get identical answers.

/** Armour points a fresh vest carries. Matches CS's 100. */
export const MAX_ARMOR = 100;

/**
 * Fraction of the damage that armour ABSORBED which is charged to durability.
 *
 * Tuning note: at 0.5, an AK to the chest (36 damage, 0.775 pierce) stops
 * 36 * 0.225 = 8.1 damage and costs 4 armour, so a vest survives ~24 chest
 * rounds -- far more than a player survives, which makes degradation invisible.
 * At 1.0 the vest dies in ~12 hits, roughly the CS feel where a second engaging
 * in the same round finds you noticeably softer. 0.5 is the CS:GO number and
 * the one kept here: the vest is meant to outlast one duel, not the round.
 */
export const ARMOR_ABSORB_RATE = 0.5;

/** Parts the helmet covers. Everything else is the vest's problem. */
export const HELMET_PARTS = new Set(['head']);

/**
 * Parts the vest covers. Legs are deliberately EXCLUDED -- in CS armour does
 * not reduce leg damage at all, which is why leg shots are the reliable way to
 * chip a fully-armoured opponent. Dropping this makes armour strictly better
 * than it should be and quietly removes a real tactical choice.
 */
export const VEST_PARTS = new Set(['chest', 'stomach', 'arm']);

const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Apply armour to one incoming hit.
 *
 * @param {number} damage      post-hitgroup, post-falloff damage
 * @param {string} part        'head' | 'chest' | 'stomach' | 'arm' | 'leg'
 * @param {number} armor       current armour points, 0..MAX_ARMOR
 * @param {boolean} helmet     is a helmet worn
 * @param {number} armorPierce weapon's armorPierce from specs.js, 0..1
 * @returns {{damage:number, armorLost:number}} damage actually taken and the
 *   armour durability consumed. Both are always finite and >= 0.
 */
export function applyArmor(damage, part, armor, helmet, armorPierce) {
  // Defensive up front: a NaN here would propagate straight into a health bar
  // and make a player unkillable. Every caller-supplied number is checked, not
  // trusted, because one of the callers is a network message.
  const dmg = finite(damage) && damage > 0 ? damage : 0;
  if (dmg === 0) return { damage: 0, armorLost: 0 };

  const armorPts = finite(armor) ? Math.max(0, Math.min(MAX_ARMOR, armor)) : 0;
  const pierce = finite(armorPierce) ? Math.max(0, Math.min(1, armorPierce)) : 1;

  // No armour left, or this part is not covered: full damage, nothing absorbed.
  if (armorPts <= 0) return { damage: dmg, armorLost: 0 };

  const covered = HELMET_PARTS.has(part)
    ? !!helmet                 // head is helmet-only; a vest does not help
    : VEST_PARTS.has(part);    // legs fall through to `false` on purpose

  if (!covered) return { damage: dmg, armorLost: 0 };

  const reduced = dmg * pierce;
  const absorbed = dmg - reduced;

  // Durability is charged against what was actually stopped, and capped at the
  // armour remaining. A hit big enough to exhaust the vest still only reduces
  // by the amount the vest could pay for -- otherwise the last point of armour
  // would soak an AWP round for free.
  let armorLost = absorbed * ARMOR_ABSORB_RATE;
  let finalDamage = reduced;

  if (armorLost > armorPts) {
    // Partial protection: the vest covers the fraction of the hit it can afford
    // and the remainder arrives unreduced.
    const fraction = armorPts / armorLost;
    armorLost = armorPts;
    finalDamage = dmg - absorbed * fraction;
  }

  return {
    damage: Math.max(0, finalDamage),
    armorLost: Math.max(0, armorLost),
  };
}

/**
 * Mutable armour carried by one player. A thin wrapper so game code has
 * somewhere to keep the state; all the maths is still in applyArmor.
 */
export class Armor {
  constructor(points = 0, helmet = false) {
    this.points = finite(points) ? Math.max(0, Math.min(MAX_ARMOR, points)) : 0;
    this.helmet = !!helmet;
  }

  /** Buy/refill. `helmet` only ever upgrades -- you cannot un-buy a helmet. */
  equip(points = MAX_ARMOR, helmet = false) {
    this.points = Math.max(0, Math.min(MAX_ARMOR, points));
    this.helmet = this.helmet || !!helmet;
    return this;
  }

  /**
   * Take one hit, degrading the vest. Returns the damage that got through.
   * The helmet is LOST when armour reaches zero -- a shattered vest and an
   * intact helmet is not a state CS has, and modelling it would mean tracking
   * two durability pools for one purchase.
   */
  absorb(damage, part, armorPierce) {
    const r = applyArmor(damage, part, this.points, this.helmet, armorPierce);
    this.points = Math.max(0, this.points - r.armorLost);
    if (this.points <= 0) this.helmet = false;
    return r.damage;
  }

  get hasArmor() { return this.points > 0; }

  toJSON() { return { armor: Math.round(this.points), helmet: this.helmet }; }
}
