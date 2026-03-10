# Plan Summary: 12-Polish & Performance - Plan 01

**Objective:** Implement core performance optimizations and memory leak prevention.
**Status:** COMPLETE
**Date:** 2026-03-10

## Accomplishments
- **Dynamic Compute Throttling**: Added life-timers to `FXSystem.js` for sparks, smoke, and fire. The system now skips `renderer.compute()` calls when no particles are active, significantly reducing idle GPU usage.
- **Memory Leak Prevention**:
    - Created `Utils.deepDispose()` to recursively clean up Three.js geometries and materials.
    - Integrated `deepDispose` into map initialization, enemy removal, and object destruction loops in `main.js`.
- **Smoother Weapon Visuals**:
    - Refactored recoil and camera punch to use frame-rate independent exponential decay (`Math.exp`).
    - Consolidated camera recoil state into `WeaponSystem.js` and updated the `main.js` render loop to apply it as a temporary offset, preventing permanent rotation drift.
- **Factory Extension**: Added `createInstancedCrates` to `Factory.js` (prepared for high-count static props, though individual meshes were kept for current low-count destructibles).

## Key Files Created/Modified
- `src/systems/FXSystem.js` (Compute throttling)
- `src/systems/WeaponSystem.js` (Recoil refactor)
- `src/Utils.js` (Deep disposal helper)
- `main.js` (Cleanup integration and recoil rendering)
- `src/Factory.js` (Instancing support)

## Notable Deviations
- Decided to keep individual meshes for destructible crates for now, as the current map counts (10-20) do not justify the complexity of managing an `InstancedMesh` with per-instance health/destruction logic.

## Next Steps
- Implement Plan 12-02: Build Size Optimization (Splitting `Factory.js` and asset compression).
