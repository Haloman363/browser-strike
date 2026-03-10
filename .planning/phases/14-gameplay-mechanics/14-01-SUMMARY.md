# Plan Summary: 14-Gameplay Mechanics - Plan 01

**Objective:** Implement a robust tactical economy system with consecutive loss bonuses, specific kill rewards, and utility buy limits.
**Status:** COMPLETE
**Date:** 2026-03-10

## Accomplishments
- **Dynamic Economy Rules**: Added `ECONOMY_SETTINGS` to `Constants_v2.js`, defining competitive rewards for round wins, losses (with streak scaling), and specific kill rewards per weapon category.
- **Stateful Tracking**: Updated `GameState.js` to track `lossStreak` and `utilityCount`, ensuring accurate rewards and enforcement of buy limits.
- **Round Reward Logic**: Refactored `RoundSystem.js` to calculate and grant round-end rewards based on team performance and consecutive losses.
- **Weapon System Integration**: Updated `WeaponSystem.js` to handle specialized kill rewards (e.g., $1500 for Knife, $600 for SMGs) and enforce purchase limits for grenades (max 4 total, max 2 flashbangs).
- **Buy Menu Enforcement**: Enhanced `UISystem.js` to visually grey out items in the Buy Menu when the player cannot afford them or has reached carrying capacity.
- **Refactored Kill Logic**: Moved cash awarding from `main.js` to `RoundSystem.js` via the `entity:killed` event for better architectural separation.

## Key Files Created/Modified
- `src/Constants_v2.js` (Added economy settings and per-weapon rewards)
- `src/GameState.js` (Added loss streak and utility tracking)
- `src/systems/RoundSystem.js` (Implemented reward calculation logic)
- `src/systems/WeaponSystem.js` (Enforced limits and handled specialized rewards)
- `src/systems/UISystem.js` (Updated Buy Menu UI feedback)
- `main.js` (Cleaned up legacy reward logic)

## Notable Deviations
- Consolidated several utility limit checks into the `WeaponSystem.giveWeapon` method to provide a single point of authority for equipment gain.

## Next Steps
- Implement Plan 14-02: Refined Movement (Counter-strafing and Damage Tagging).
