# Project State: Browser Strike

## Project Reference
**Core Value**: High-fidelity tactical combat accessible via the web with zero installation, powered by a robust modular engine and WebGPU rendering.
**Current Focus**: Phase 13 - Map Expansion (Mirage & Inferno).

## Current Position
**Phase**: 13 - Map Expansion
**Plan**: 13-01 - Mirage Layout & Geometry
**Status**: IN_PROGRESS
**Progress**: [░░░░░░░░░░░░░░░░░░░░] 0% (of current phase)

## Performance Metrics
- **Build Success Rate**: 100%
- **Initial Load Time**: Optimized (manual chunks + bandwidth-aware textures).
- **Memory Stability**: High (verified with deepDispose).
- **Frame Rate**: Target 60 FPS on WebGPU.

## Accumulated Context
### Final Decisions (v1)
- **WebGPU & TSL**: High-fidelity particles and post-processing.
- **Modular Systems**: Clean separation of core loops.
- **Optimized Factory**: Specialized procedural model builders.
- **Bandwidth Aware**: User-toggleable high-res assets.

### New Decisions (Phase 13)
- **Scale Standardization**: Adopting 1 unit = 1 inch (CSGO standard) for new map layouts.
- **Procedural Stairs**: Planned addition to `EnvironmentFactory.js` to handle verticality better than just ladders.

## Session Continuity
**Current Session**: Promoted "Map Creation" todo to Phase 13. Defined Context and Research.
**Next Steps**:
1. Implement `13-01-PLAN.md` for Mirage Layout.
2. Extend `EnvironmentFactory.js` with a `createStairs()` helper.
3. Begin blocking out Mirage geometry in `Maps_v2.js`.

---
*Last updated: 2026-03-10*
