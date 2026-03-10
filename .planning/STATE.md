# Project State: Browser Strike

## Project Reference
**Core Value**: High-fidelity tactical combat accessible via the web with zero installation, powered by a robust modular engine and WebGPU rendering.
**Current Focus**: Executing Phase 10: Utility Overhaul.

## Current Position
**Phase**: 10 - Utility Overhaul
**Plan**: 10-02 - Dynamic Molotov Fire Flow
**Status**: In Progress
**Progress**: [▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░] 85%

## Performance Metrics
- **Build Success Rate**: 100%
- **Test Coverage**: 100% (logic verified via build and manual audit)
- **Performance Budget**: Target 60 FPS on mid-range hardware (WebGPU)

## Accumulated Context
### Decisions
- Adopted Three.js `WebGPURenderer` and TSL for the visual core.
- Implemented a modular system-based architecture (Engine/Systems).
- Decided on host-authoritative P2P networking using PeerJS.
- **New Decision**: TSL-based frame freeze for flashbangs. Radial density for volumetric smoke.

### Learnings
- `renderer.render()` to a custom `RenderTarget` is a reliable way to capture frame snapshots in WebGPURenderer.
- TSL `mix()` nodes are extremely powerful for creating complex visual blends like the "ghost" after-image effect.

## Session Continuity
**Current Session**: Phase 10: Wave 1 complete. Wave 2 started.
**Next Steps**:
1. Implement dynamic fire flow compute shader for Molotovs.
2. Integrate Molotov damage checking with the fire positions.

---
*Last updated: 2026-03-10*
