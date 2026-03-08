# Plan Summary: 06-FX Overhaul - Plan 02

**Objective:** Smoke Tech & Soft Particles
**Status:** COMPLETE
**Date:** 2026-03-08

## Accomplishments
- **Smoke Simulation**: Implemented TSL compute simulation for volumetric smoke blooms with expansion, turbulence (noise), and drift logic.
- **Soft-Particle Blending**: Integrated TSL `viewportLinearDepth` nodes to achieve smooth edge blending for smoke particles, preventing harsh environment clipping.
- **Event Integration**: Wired the `grenade:detonated` event to trigger the `FXSystem` smoke cloud compute simulation.
- **Renderer Polish**: Restored and fixed the CRT post-processing effect in `Engine.js` using the modern TSL `film()` node from Three.js addons.
- **Build Integrity**: Resolved multiple TSL import errors and duplicate declarations to ensure a clean production build.

## Key Files Created/Modified
- `src/systems/FXSystem.js`
- `src/core/Engine.js`

## Notable Deviations
- Switched to `viewportLinearDepth` for soft particles as `viewportSafeDepth` was not available in the current Three.js version.

## Next Steps
- Begin Phase 7: Gunplay Refinement.
- Implement recoil patterns and movement inaccuracy.
