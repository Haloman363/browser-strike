# Phase 15: Asset Integration - Research

**Researched:** 2026-03-10
**Domain:** 3D Asset Pipelines & Loading
**Confidence:** HIGH

## Technical Analysis
- **Async Factory Methods**: Since `GLTFLoader` is asynchronous, our `createGunModel` and `createHumanoidModel` functions need to support returning a placeholder (the procedural model) and swapping it out once the high-res asset loads, or becoming `async`. 
    - *Decision*: Support a "swap" mechanism where the procedural model acts as a proxy until the external asset is ready.
- **Scaling & Orientation**: Procedural models use a specific coordinate system (Y-up, Z-forward). External assets (especially CSGO rips) often require a 90-degree rotation or a 0.01x - 100x scale adjustment to match our 1:1 tactical scale.
- **Resource Management**: 
    - `public/assets/models/deagle/` currently exists.
    - Raw OBJ/DAE files in `resources/` require conversion. Since external conversion tools are not available in this CLI, we will focus on implementing the *loading logic* for the pre-placed `deagle` and future assets.

## Asset Targets
- **Desert Eagle**: Use `public/assets/models/weapons/deagle/deagle.obj` or convert to GLB if possible.
- **AWP**: High-priority for sniper scope fidelity.
- **Characters**: Arctic Avenger (1.6) and T Guerilla (Source).

## Validation Strategy
- Verify that "High-Res" toggle correctly enables/disables external asset loading.
- Test that weapon animations (slide, bolt) still work with external meshes (requires naming consistency in the GLB).
- Audit memory usage when loading multiple high-res models.
