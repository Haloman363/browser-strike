# Phase 12: Polish & Performance - Research

**Researched:** 2026-03-10
**Domain:** GPU Optimization & Asset Management
**Confidence:** HIGH

## Build Analysis
- **Current Bundle Size**: ~1.5MB total (uncompressed).
- **Primary Culprit**: `Factory.js` (1.26 MB).
    - Contains massive procedural weapon and character generation logic.
    - Many imports from `three/tsl` and `three/webgpu`.
    - **Optimization**: Splitting weapon recipes and building logic into smaller, lazily-loaded modules.

## Rendering Audit
- **Instancing Status**: 
    - Particles (Smoke, Sparks, Fire) use `InstancedMesh` and Storage Buffers. GOOD.
    - Environment (Crates, Walls, Pillars) creates unique Mesh/Material for every instance. BAD.
    - **Optimization**: Implement a `StaticInstancingSystem` or update `Factory.js` to return instances of shared geometries/materials for common props.
- **Compute Overhead**:
    - `FXSystem` dispatches 3 compute shaders every frame (45k total particles).
    - **Optimization**: Use an "active" flag or counter to skip `renderer.compute()` when no particles are in their life cycle.

## Memory Audit
- **Geometry Disposal**: 
    - `Maps_v2.js` clears the scene but doesn't explicitly call `.dispose()` on geometries and materials.
    - This can lead to GPU memory leaks over multiple map changes.
    - **Optimization**: Implement a proper cleanup utility in `Engine.js`.

## Gameplay Polish
- **UI Latency**: Current radial menu and HUD update every frame via React-like logic but in vanilla JS.
- **Weapon Recoil**: Patterns are good but could benefit from smoothing (interpolation).

## Optimization Plan (Wave 1)
1.  **Skip Empty Computes**: Track active particle life in `FXSystem`.
2.  **Crate Instancing**: Refactor `Factory.createCrate` to use instancing where possible.
3.  **Explicit Disposal**: Add `.dispose()` calls to `Maps_v2.js` build/cleanup logic.
