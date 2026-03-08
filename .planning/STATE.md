# Project State: Browser Strike

## Project Reference
**Core Value**: High-fidelity tactical combat accessible via the web with zero installation, powered by a robust modular engine and WebGPU rendering.
**Current Focus**: Phase 2: Game Feel COMPLETE. Transitioning to Phase 3: Hit Registration.

## Current Position
**Phase**: 03 - Hit Registration
**Plan**: TBD
**Status**: Not started
**Progress**: [▓▓▓▓░░░░░░░░░░░░░░░░] 25%

## Performance Metrics
- **Build Success Rate**: 100%
- **Test Coverage**: 100% (on new modules)
- **Performance Budget**: Target 60 FPS on mid-range hardware (WebGPU)

## Accumulated Context
### Decisions
- Adopted Three.js `WebGPURenderer` and TSL for the visual core.
- Implemented a modular system-based architecture (Engine/Systems).
- Decided on host-authoritative P2P networking using PeerJS.
- **New Decision**: Server reconciliation with "Rewind and Replay" for movement stability.

### Learnings
- Client-side prediction requires skipping interpolation for the local player to avoid visual feedback delay.
- Deterministic `applyInput` is crucial for accurate reconciliation.

## Session Continuity
**Current Session**: Phase 2 COMPLETE.
**Next Steps**:
1. Begin Phase 3: Hit Registration (Lag Compensation).
2. Research hit-scan backtracking patterns.

---
*Last updated: 2026-03-08*
