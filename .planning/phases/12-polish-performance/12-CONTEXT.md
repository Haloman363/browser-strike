# Phase Context: 12-Polish & Performance

## Domain
Optimizing the rendering pipeline, reducing build sizes, auditing memory usage, and final gameplay balancing for the v1 release.

## Decisions

### Rendering Optimization
- **Instancing**: Maximize the use of `InstancedMesh` for repeated environment objects (crates, pillars).
- **TSL Efficiency**: Audit compute shaders in `FXSystem.js` to ensure optimal dispatch counts and storage buffer usage.
- **Frustum Culling**: Ensure complex models (weapons, characters) are correctly culled when not in view.

### Build Optimization
- **Code Splitting**: Address the large `Factory.js` chunk (>1.2MB) by implementing dynamic imports or lazy loading for weapon/character models.
- **Asset Compression**: Verify that textures and audio are web-optimized.

### Memory Management
- **Leak Audit**: Check for proper disposal of Three.js geometries and materials during map transitions and round resets.
- **Event Listeners**: Ensure `EventEmitter` and DOM listeners are cleaned up to prevent accumulation.

## Strategy
- **Baseline Audit**: Run production builds and analyze chunk sizes.
- **Profiling**: Use Chrome DevTools (if available) or internal performance markers to identify bottlenecks.
- **Incremental Refactoring**: Apply optimizations without breaking existing system-based architecture.

## Code Context
- `src/Factory.js`: The primary target for build-size optimization.
- `src/systems/FXSystem.js`: Core rendering and compute logic.
- `src/core/Engine.js`: Global lifecycle management and event handling.
