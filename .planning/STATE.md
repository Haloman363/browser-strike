# Project State: Browser Strike

## Project Reference
**Core Value**: High-fidelity tactical combat accessible via the web with zero installation, powered by a robust modular engine and WebGPU rendering.
**Current Focus**: Executing Phase 1: Networking Core.

## Current Position
**Phase**: 01 - Networking Core
**Plan**: 01-03 - State Sync & Snapshots
**Status**: In Progress
**Progress**: [▓▓░░░░░░░░░░░░░░░░░░] 16%

## Performance Metrics
- **Build Success Rate**: 100%
- **Test Coverage**: 100% (on new modules)
- **Performance Budget**: Target 60 FPS on mid-range hardware (WebGPU)

## Accumulated Context
### Decisions
- Adopted Three.js `WebGPURenderer` and TSL for the visual core.
- Implemented a modular system-based architecture (Engine/Systems).
- Decided on host-authoritative P2P networking using PeerJS.
- **New Decision**: Mixed reliability channels (reliable for events, unreliable for state).

### Learnings
- PeerJS data channel labels are crucial for distinguishing streams.
- Automating handshakes on 'open' and 'connection' events ensures consistency.

## Session Continuity
**Current Session**: Phase 1: Wave 2 complete. Wave 3 started.
**Next Steps**:
1. Implement host-authoritative broadcast loop (20Hz).
2. Integrate snapshot-interpolation on the client.

---
*Last updated: 2026-03-07*
