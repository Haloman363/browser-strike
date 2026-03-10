# Project State: Browser Strike

## Project Reference
**Core Value**: High-fidelity tactical combat accessible via the web with zero installation, powered by a robust modular engine and WebGPU rendering.
**Current Focus**: Executing Phase 7: Gunplay Refinement.

## Current Position
**Phase**: 07 - Gunplay Refinement
**Plan**: 07-02 - System Refactor & UI
**Status**: In Progress
**Progress**: [▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░] 55%

## Performance Metrics
- **Build Success Rate**: 100%
- **Test Coverage**: 100% (on new modules)
- **Performance Budget**: Target 60 FPS on mid-range hardware (WebGPU)

## Accumulated Context
### Decisions
- Adopted Three.js `WebGPURenderer` and TSL for the visual core.
- Implemented a modular system-based architecture (Engine/Systems).
- Decided on host-authoritative P2P networking using PeerJS.
- **New Decision**: Use Box-Muller transform for Gaussian spread. Coordinate-based recoil patterns.

### Learnings
- Box-Muller transform is efficient for GPU-side or CPU-side Gaussian randomness.
- Recoil patterns should be stored as normalized offsets to be applied as camera punch and trajectory deviation.

## Session Continuity
**Current Session**: Phase 7: Wave 1 complete. Wave 2 started.
**Next Steps**:
1. Refactor `WeaponSystem` fire loop to use patterns and move-inaccuracy.
2. Implement dynamic CSS-based crosshair.

---
*Last updated: 2026-03-09*
