# Phase Context: 05-Visual Fidelity

## Domain
Implementing advanced materials and post-processing using Three Shading Language (TSL) to achieve high visual fidelity.

## Decisions

### PBR Overhaul
- **Decision**: Full PBR (Recommended)
- **Rationale**: Provides realistic metallic and roughness properties, essential for a modern high-fidelity tactical FPS.
- **Implementation**: Convert `MeshPhongNodeMaterial` usage to `MeshStandardNodeMaterial` in `Factory.js`.

### Body-cam FX
- **Decision**: No body cam styling
- **Rationale**: User preference.
- **Implementation**: Skip fisheye/distortion effects. Minimal stylization if needed for depth.

### CRT Overlay
- **Decision**: Full Screen (Recommended)
- **Rationale**: Provides a cohesive "tactical feed" look with scanlines and subpixel masks across the entire viewport.
- **Implementation**: Implement a TSL post-processing node for scanlines and RGB distortion.

### Pass Budget
- **Decision**: Balanced (3-4 Passes) (Recommended)
- **Rationale**: Modular approach allowing for separate control of Scene, CRT, and Bloom while maintaining 60 FPS on mid-range hardware.
- **Implementation**: Setup a post-processing chain in `Engine.js`.

## Specifics
- **Metallic/Roughness**: Assign default PBR values to materials in `Factory.js` based on weapon/character parts (e.g., steel = high metallic, polymer = high roughness).
- **TSL Utilities**: Create shared TSL nodes for CRT effects to allow easy toggling.

## Code Context
- `src/Factory.js`: Primary material creation logic.
- `src/core/Engine.js`: Renderer and post-processing management.
