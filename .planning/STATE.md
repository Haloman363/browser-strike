# Project State: Browser Strike

## Project Reference
**Core Value**: High-fidelity tactical combat accessible via the web with zero installation, powered by a robust modular engine and WebGPU rendering.
**Current Focus**: Executing Phase 4: WebGPU Foundation.

## Current Position
**Phase**: 04 - WebGPU Foundation
**Plan**: 04-02 - TSL Material Overhaul
**Status**: In Progress
**Progress**: [▓▓▓▓▓▓░░░░░░░░░░░░░░] 35%

## Performance Metrics
- **Build Success Rate**: 100%
- **Test Coverage**: 100% (on new modules)
- **Performance Budget**: Target 60 FPS on mid-range hardware (WebGPU)

## Accumulated Context
### Decisions
- Adopted Three.js `WebGPURenderer` and TSL for the visual core.
- Implemented a modular system-based architecture (Engine/Systems).
- Decided on host-authoritative P2P networking using PeerJS.
- **New Decision**: Use `WebGPURenderer` with automatic WebGL 2 fallback. Set build target to `esnext`.

### Learnings
- Top-level await in renderer initialization requires Vite `esnext` target.
- `WebGPURenderer` simplifies backend fallback management.

## Session Continuity
**Current Session**: Phase 4: Wave 1 complete. Wave 2 started.
**Next Steps**:
1. Convert materials in `Factory.js` to `NodeMaterial` (TSL).
2. Implement HUD backend indicator.

---
*Last updated: 2026-03-08*
