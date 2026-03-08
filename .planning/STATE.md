# Project State: Browser Strike

## Project Reference
**Core Value**: High-fidelity tactical combat accessible via the web with zero installation, powered by a robust modular engine and WebGPU rendering.
**Current Focus**: Phase 6: FX Overhaul COMPLETE. Transitioning to Phase 7: Gunplay Refinement.

## Current Position
**Phase**: 07 - Gunplay Refinement
**Plan**: TBD
**Status**: Not started
**Progress**: [▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░] 50%

## Performance Metrics
- **Build Success Rate**: 100%
- **Test Coverage**: 100% (on new modules)
- **Performance Budget**: Target 60 FPS on mid-range hardware (WebGPU)

## Accumulated Context
### Decisions
- Adopted Three.js `WebGPURenderer` and TSL for the visual core.
- Implemented a modular system-based architecture (Engine/Systems).
- Decided on host-authoritative P2P networking using PeerJS.
- **New Decision**: TSL compute-shader particle systems for sparks and smoke. Soft-particle depth blending for volumetric effects.

### Learnings
- TSL `film()` node from addons provides an easy way to add CRT-style overlays.
- Soft-particle blending requires accurate viewport depth nodes (`viewportLinearDepth`) to work correctly in WebGPU.

## Session Continuity
**Current Session**: Phase 6 COMPLETE.
**Next Steps**:
1. Begin Phase 7: Gunplay Refinement.
2. Research deterministic recoil patterns and spread logic.

---
*Last updated: 2026-03-08*
