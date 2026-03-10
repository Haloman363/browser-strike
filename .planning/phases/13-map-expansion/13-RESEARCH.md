# Phase 13: Map Expansion - Research

**Researched:** 2026-03-10
**Domain:** Procedural Geometry & Level Design
**Confidence:** HIGH

## Reference Analysis
- **Scale Reference**: Standard CSGO dimensions use roughly 1 unit = 1 inch. Our current scale in `Maps_v2.js` uses large values (e.g., 1600 width). We need to verify player movement speed (1000 units/sec) against these dimensions to ensure "travel time" between sites feels correct.
- **Layout Maps**: Reference top-down images in `resources/CS Maps` provide the skeletal structure for Mirage and Inferno.

## Technical Goals
- **Verticality**: Current `createLadder` tool works well. Need to add `createStairs` or support for inclined walls to `EnvironmentFactory.js`.
- **Optimization**:
    - **Occlusion Culling**: With larger maps like Inferno, we may need a simple zone-based visibility system.
    - **Static Merging**: Explore merging static wall meshes of the same material into a single `BufferGeometry` during map load to reduce draw calls beyond what simple frustum culling provides.

## Validation Strategy
- Verify timing from spawn to bomb sites against original game references.
- Test collision consistency on new slanted/vertical geometry.
- Audit draw call counts in complex areas (e.g., Mirage Middle).
