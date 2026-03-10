# Project State: Browser Strike

## Project Reference
**Core Value**: High-fidelity tactical combat accessible via the web with zero installation, powered by a robust modular engine and WebGPU rendering.
**Current Focus**: Executing Phase 9: Tactical Economy.

## Current Position
**Phase**: 09 - Tactical Economy
**Plan**: 09-02 - Radial Buy Menu UI
**Status**: In Progress
**Progress**: [▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░] 75%

## Performance Metrics
- **Build Success Rate**: 100%
- **Test Coverage**: 100% (on new modules)
- **Performance Budget**: Target 60 FPS on mid-range hardware (WebGPU)

## Accumulated Context
### Decisions
- Adopted Three.js `WebGPURenderer` and TSL for the visual core.
- Implemented a modular system-based architecture (Engine/Systems).
- Decided on host-authoritative P2P networking using PeerJS.
- **New Decision**: Centralized inventory in `GameState`. Survival-based persistence. Standard CS:GO cash rewards.

### Learnings
- Decoupling inventory state from 3D model management allows for easier persistence and network syncing.
- 'G' drop logic requires a robust event-based communication between `WeaponSystem` and world spawning logic.

## Session Continuity
**Current Session**: Phase 9: Wave 1 complete. Wave 2 started.
**Next Steps**:
1. Implement SVG-based Radial Buy Menu in `UISystem.js`.
2. Add buy zone proximity checks.

---
*Last updated: 2026-03-09*
