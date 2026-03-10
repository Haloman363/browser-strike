# Plan Summary: 10-Tactical Utility - Plan 02

**Objective:** Overhaul the legacy Molotov effect with a high-fidelity, compute-driven TSL fire simulation.
**Status:** COMPLETE
**Date:** 2026-03-10

## Accomplishments
- **Compute Fire Flow**: Developed a TSL compute shader in `FXSystem.js` that simulates 500+ fire particles with surface-alignment and dynamic spreading logic.
- **TSL Fire Material**: Created a multi-stage `SpriteNodeMaterial` that blends from a white core to orange/red flames, including flicker effects and radial/soft-particle fading.
- **Detonation Integration**: Refactored `main.js` to emit the `grenade:detonated` event for Molotovs, triggering the `FXSystem` simulation.
- **Legacy Removal**: Deleted the CPU-based `createFireArea` function and its associated THREE.Group logic from `main.js`.
- **Refactored Damage**: Decoupled Molotov damage logic from visual assets, ensuring consistent tick-based damage for players and AI within the fire radius.

## Key Files Created/Modified
- `src/systems/FXSystem.js` (Added TSL fire compute and rendering)
- `main.js` (Removed legacy code and integrated event-driven effects)
- `src/Constants_v2.js` (Verified GRENADES_DATA)

## Notable Deviations
- Maintained simple radial damage checking in `main.js` for performance, while using the advanced TSL simulation for all visual aspects.

## Next Steps
- Finalize Phase 10 validation and move to Phase 11: World Interaction.
