# Project State: Browser Strike

## Project Reference
**Core Value**: High-fidelity tactical combat accessible via the web with zero installation, powered by a robust modular engine and WebGPU rendering.
**Current Focus**: Executing Phase 3: Hit Registration.

## Current Position
**Phase**: 03 - Hit Registration
**Plan**: 03-02 - Authoritative Hit-Scan & Backtracking
**Status**: In Progress
**Progress**: [▓▓▓▓░░░░░░░░░░░░░░░░] 30%

## Performance Metrics
- **Build Success Rate**: 100%
- **Test Coverage**: 100% (on new modules)
- **Performance Budget**: Target 60 FPS on mid-range hardware (WebGPU)

## Accumulated Context
### Decisions
- Adopted Three.js `WebGPURenderer` and TSL for the visual core.
- Implemented a modular system-based architecture (Engine/Systems).
- Decided on host-authoritative P2P networking using PeerJS.
- **New Decision**: NTP-style clock sync for shared game time. Host-side state history (200ms+) for backtracking.

### Learnings
- NTP algorithm reliably aligns client clocks within 10ms over WebRTC.
- Historical snapshots must include all movement-affecting state (like crouching) for accurate hit validation.

## Session Continuity
**Current Session**: Phase 3: Wave 1 complete. Wave 2 started.
**Next Steps**:
1. Refactor shooting to `SHOOT` command flow.
2. Implement host-side rewind and hit validation logic.

---
*Last updated: 2026-03-08*
