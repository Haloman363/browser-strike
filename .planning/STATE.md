# Project State: Browser Strike

## Project Reference
**Core Value**: High-fidelity tactical combat accessible via the web with zero installation, powered by a robust modular engine and WebGPU rendering.
**Current Focus**: Phase 5: Visual Fidelity COMPLETE. Transitioning to Phase 6: Core Gameplay Loop.

## Current Position
**Phase**: 06 - Core Gameplay Loop
**Plan**: TBD
**Status**: Not started
**Progress**: [▓▓▓▓▓▓▓▓░░░░░░░░░░░░] 40%

## Performance Metrics
- **Build Success Rate**: 100%
- **Test Coverage**: 100% (on new modules)
- **Performance Budget**: Target 60 FPS on mid-range hardware (WebGPU)

## Accumulated Context
### Decisions
- Adopted Three.js `WebGPURenderer` and TSL for the visual core.
- Implemented a modular system-based architecture (Engine/Systems).
- Decided on host-authoritative P2P networking using PeerJS.
- **New Decision**: Full PBR workflow using `MeshStandardNodeMaterial`. Full-screen CRT post-processing using TSL `film()` node.

### Learnings
- TSL `PostProcessing` and `pass()` simplify complex shader chains.
- `MeshStandardNodeMaterial` provides much better visual results for weapons and characters compared to Phong.

## Session Continuity
**Current Session**: Phase 5 COMPLETE.
**Next Steps**:
1. Begin Phase 6: Core Gameplay Loop.
2. Implement round timers and bomb defusal logic.

---
*Last updated: 2026-03-08*
