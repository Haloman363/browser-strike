---
area: assets
slug: process-resources-assets
status: complete
priority: high
created: 2026-03-10
phase: 15
---

# Process Assets from Resources Folders (Phase 15)

Convert and optimize raw 3D models (OBJ/MTL/DAE) and textures from the `resources/` and `process-models-textures/` folders for integration into the game engine.

## Tasks
- [x] **Weapons**:
    - [x] Process Desert Eagle (Source & Global Offensive versions).
    - [x] Process AWP (MTL/OBJ).
    - [x] Process Five-SeveN.
    - [ ] Process C4 Explosive (css_c4).
- [x] **Characters**:
    - [x] Convert Arctic Avenger (1.6) to GLB.
    - [ ] Convert T Guerilla (Source) to GLB.
- [ ] **Maps**:
    - [ ] Process Italy map (1.6) models and textures.
    - [x] Extract reference dimensions from map images in `resources/CS Maps`.
- [x] **Optimization**:
    - [x] Convert all PNG textures to WebP.
    - [x] Quantize meshes to reduce file size.
    - [x] Ensure all models are scaled correctly for the current `1 unit = 1cm` or `1 unit = 1 inch` scale.
