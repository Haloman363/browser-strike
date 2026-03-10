# Phase 14: Gameplay Mechanics - Research

**Researched:** 2026-03-10
**Domain:** Game Rules & Combat Mechanics
**Confidence:** HIGH

## Economy Analysis
- **Standard Rewards**:
    - Win (Elimination/Time): $3250
    - Win (Bomb/Hostage): $3500
    - Loss Bonus: Starts at $1400, increases by $500 per consecutive loss (max $3400).
    - Kill Rewards: Knife ($1500), SMG ($600), Rifle ($300), AWP ($100).
- **Buy Limits**: Need to track utility counts per round (e.g., max 2 flashbangs, 4 utility items total).

## Movement Mechanics
- **Counter-Strafing**: In CS, pressing the opposite movement key decelerates the player instantly to 0 velocity, resetting accuracy faster than natural friction.
    - *Implementation*: Detect `KeyA` while `moveRight` is true (and vice versa) and apply a massive negative impulse.
- **Tagging**: Movement speed reduction when taking damage.
    - *Implementation*: Reduce `MOVE_SPEED` temporarily by a percentage based on the weapon hit (e.g., 30-50% reduction for 0.5s).

## Game Mode: Hostage Rescue
- **Entity**: New `Hostage` entity in `Factory.js` with basic "follow" AI.
- **Rules**:
    - T's defend hostages.
    - CT's win by extracting at least one hostage to spawn or eliminating T's.
    - Damaging hostages results in heavy economic penalties.

## Validation Strategy
- Verify economy values match standard CSGO/CS2 models.
- Manual feel test for counter-strafing snappiness.
- Multiplayer test for hostage sync and extraction events.
