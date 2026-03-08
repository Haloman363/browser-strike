# Plan Summary: 06-FX Overhaul - Plan 01

**Objective:** FXSystem Foundation & Muzzle Flash Sparks
**Status:** COMPLETE
**Date:** 2026-03-08

## Accomplishments
- **FXSystem Skeleton**: Created `src/systems/FXSystem.js` with WebGPU support check and central event handling.
- **Compute Storage**: Allocated `StorageBuffer` for up to 10,000 spark particles using TSL `instancedArray`.
- **Muzzle Flash Simulation**: Implemented TSL compute shaders for spawning and updating dynamic sparks with randomized velocities and gravity.
- **Rendering Integration**: Implemented a `Points` mesh using `PointsNodeMaterial` to visualize the compute-driven sparks.
- **Unit Testing**: Verified system registration and event listening in `src/systems/FXSystem.test.js`.

## Key Files Created/Modified
- `src/systems/FXSystem.js`
- `src/systems/FXSystem.test.js`
- `src/core/Engine.js` (System registration)
- `src/Factory.js` (Build fix for duplicate import)

## Notable Deviations
- Added a `PointsNodeMaterial` opacity hack using the `life` property to handle inactive particles without CPU-side filtering.

## Next Steps
- Implement Smoke Grenade particle simulation with TSL soft-particle blending (Plan 06-02).
