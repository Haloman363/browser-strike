# Phase 10: Tactical Utility - Research

**Researched:** 2026-03-10
**Domain:** Complex Particles & Post-Processing
**Confidence:** HIGH

## Summary
Overhauling tactical equipment with high-fidelity visual effects and synchronized logic. Focuses on disorienting flashbangs, tactical smokes, and immersive fire effects.

## Standard Stack
| Library | Version | Purpose |
|---------|---------|---------|
| Three.js | Latest | TSL Post-processing and Compute |
| WebGPU | N/A | Storage Buffers for Fire and Smoke |

## Architecture Patterns
- **After-image Capture**: Use `renderer.copyTextureToTexture()` or a TSL `renderTarget()` node to freeze the frame on detonation.
- **Radial Occlusion**: Use per-particle distance math in TSL to scale opacity (`1.0 - saturate(dist / maxRadius)`).
- **Surface Spreading**: Molotov particles use `compute()` to check floor normal and spread along the plane until life expires.
- **LoS Validation**: `WeaponSystem` performs a single raycast to the grenade entity center to determine blind intensity.

## Implementation Strategy
- **Flashbang**: A TSL pass that blends the "frozen" frame with a white uniform, decaying over 3-5 seconds.
- **Smoke**: Increase particle count to 5000 per grenade. Use `mix()` based on radial distance for one-way translucency logic.
- **Molotov**: 500 compute-driven fire particles. Use a `StorageBuffer` to track "ignited" floor points.

## Key Constraints
- **Performance**: High overdraw with dense smoke. Must use soft-particle blending (from Phase 6) to keep edges cheap.
- **Network**: Only sync `detonate` event with timestamp. All simulation remains local.

## Validation Architecture
- **REQ-UTIL-01/02/03**: Verify visual state and damage/blind logic across local/host roles.
