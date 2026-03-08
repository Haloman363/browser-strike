# Phase Context: 04-WebGPU Foundation

## Domain
Migrating the rendering engine from WebGL to WebGPU and converting the entire material library to Three Shading Language (TSL).

## Decisions

### Renderer Migration
- **Decision**: Total Replacement (Recommended)
- **Rationale**: Cleanest path forward. Three.js `WebGPURenderer` provides built-in compatibility for WebGL fallbacks, reducing technical debt.
- **Implementation**: Replace `WebGLRenderer` initialization in `Engine.js` and `main.js`.

### Material Scope
- **Decision**: Complete Overhaul
- **Rationale**: Ensure all weapons, skins, and environment assets benefit from the modern node-based system immediately.
- **Implementation**: Systematically convert all materials in `Factory.js` and `TextureGenerator.js` to `NodeMaterial`.

### Visual Feedback
- **Decision**: HUD Indicator (Recommended)
- **Rationale**: Essential for development and verification to know exactly which backend is powering the frames.
- **Implementation**: Add a small "Backend: WebGPU/WebGL" label to the HUD or debug overlay.

### Fallback Policy
- **Decision**: Auto Fallback (Recommended)
- **Rationale**: Ensures the game remains accessible to users on older hardware or browsers while offering high fidelity to modern users.
- **Implementation**: Utilize `WebGPURenderer`'s built-in detection and fallback logic.

## Specifics
- **Initialization**: Must use `await renderer.init()` pattern as specified in the project's WebGPU guide.
- **TSL Foundation**: Establish core TSL utility nodes for common effects (e.g., world-space texturing).

## Code Context
- `src/core/Engine.js`: Core renderer management.
- `src/Factory.js`: Primary location for material creation.
- `docs/WEBGPU_GUIDE.md`: Internal reference for transition patterns.
