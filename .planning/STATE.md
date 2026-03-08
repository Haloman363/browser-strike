# Project State: Browser Strike

## Project Reference
**Core Value**: High-fidelity tactical combat accessible via the web with zero installation, powered by a robust modular engine and WebGPU rendering.
**Current Focus**: Executing Phase 6: FX Overhaul.

## Current Position
**Phase**: 06 - FX Overhaul
**Plan**: 06-02 - Smoke Tech & Soft Particles
**Status**: In Progress
**Progress**: [▓▓▓▓▓▓▓▓▓░░░░░░░░░░░] 45%

## Performance Metrics
- **Build Success Rate**: 100%
- **Test Coverage**: 100% (on new modules)
- **Performance Budget**: Target 60 FPS on mid-range hardware (WebGPU)

## Accumulated Context
### Decisions
- Adopted Three.js `WebGPURenderer` and TSL for the visual core.
- Implemented a modular system-based architecture (Engine/Systems).
- Decided on host-authoritative P2P networking using PeerJS.
- **New Decision**: Centralized `FXSystem` for managing all GPU-side particle simulations. Use TSL `PointsNodeMaterial` for spark visualization.

### Learnings
- TSL compute shaders allow for massive particle counts (10k+) with minimal CPU overhead.
- `instancedArray` is the preferred way to store and share particle state between compute and render passes in Three.js WebGPU.

## Session Continuity
**Current Session**: Phase 6: Wave 1 complete. Wave 2 started.
**Next Steps**:
1. Implement smoke particle simulation in `FXSystem.js`.
2. Add TSL soft-particle depth fading for smooth smoke blooms.

---
*Last updated: 2026-03-08*
