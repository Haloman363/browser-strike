# Plan Summary: 10-Tactical Utility - Plan 01

**Objective:** Refine Flashbang and Smoke grenade effects with advanced TSL post-processing and compute logic.
**Status:** COMPLETE
**Date:** 2026-03-10

## Accomplishments
- **Frame Capture**: Implemented `Engine.captureFrame()` to snapshot the viewport texture for visual effects.
- **Ghost Flash**: Developed a TSL post-processing pass in `FXSystem.js` that blends the "frozen" frame with a white-out effect for realistic blindness.
- **Tactical Smokes**: Refactored the smoke particle material to use radial density (`uv()` distance), allowing for better visibility at the cloud edges.
- **Unified Detonation**: Refactored `main.js` to emit a standard `grenade:detonated` event, decoupling gameplay logic from visual refinements.
- **LoS Validation**: Implemented raycast-based Line of Sight checks for flashbangs to ensure competitive fairness.

## Key Files Created/Modified
- `src/core/Engine.js` (Added capture foundation)
- `src/systems/FXSystem.js` (Flash and Smoke TSL overhaul)
- `main.js` (Integrated detonation events)

## Notable Deviations
- Consolidated Flash and Smoke refinements into Plan 01 to ensure visual consistency across the utility suite.

## Next Steps
- Implement Dynamic Molotov Fire Flow using TSL compute shaders (Plan 10-02).
