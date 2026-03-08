# Project State: Browser Strike

## Project Reference
**Core Value**: High-fidelity tactical combat accessible via the web with zero installation, powered by a robust modular engine and WebGPU rendering.
**Current Focus**: Executing Phase 1: Networking Core.

## Current Position
**Phase**: 01 - Networking Core
**Plan**: 01-02 - Lobby & Connection Management
**Status**: In Progress
**Progress**: [▓░░░░░░░░░░░░░░░░░░░] 8%

## Performance Metrics
- **Build Success Rate**: 100%
- **Test Coverage**: 100% (on new modules)
- **Performance Budget**: Target 60 FPS on mid-range hardware (WebGPU)

## Accumulated Context
### Decisions
- Adopted Three.js `WebGPURenderer` and TSL for the visual core.
- Implemented a modular system-based architecture (Engine/Systems).
- Decided on host-authoritative P2P networking using PeerJS.
- **New Decision**: PeerJS Public Cloud for signaling. Lobby codes for host discovery.

### Learnings
- PeerJS allows opening multiple data channels to the same peer with different labels (reliable/unreliable).
- Vitest provides a clean mocking environment for WebRTC/PeerJS.

## Session Continuity
**Current Session**: Phase 1: Wave 1 complete. Wave 2 started.
**Next Steps**:
1. Implement host/client handshake in `NetworkSystem`.
2. Establish mixed reliability channels.

---
*Last updated: 2026-03-07*
