# Phase 06: FX Overhaul - Research

**Researched:** 2026-03-08
**Domain:** WebGPU Compute Shader Particle Systems (TSL)
**Confidence:** HIGH

## Summary

This phase focuses on replacing legacy particle effects with high-performance, GPU-simulated systems using Three.js Shading Language (TSL). By leveraging WebGPU compute shaders, we can simulate thousands of particles with complex physics (drag, gravity, collision) at a fraction of the CPU cost of traditional systems.

**Primary recommendation:** Use a centralized `FXSystem` to manage shared GPU Storage Buffers (`instancedArray`) and dispatch compute nodes (`renderer.compute`) for both muzzle flashes and volumetric smoke.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Compute Logic**: TSL Nodes (utilize `compute()` and `StorageBuffer` nodes for simulation).
- **Muzzle Flash**: 3D Compute Sparks (dedicated TSL compute shader for emitting and updating spark particles per gunshot).
- **Smoke Tech**: Dense Compute Particles (TSL compute simulation for expanding smoke clouds with per-particle depth and opacity logic).
- **Network Sync**: Hybrid Sync (Sync detonation events via `NetworkSystem`; clients then trigger local compute simulations).

### Claude's Discretion
- **Performance**: Target < 2ms GPU time for total particle simulation on mid-range hardware.
- **Visuals**: Integrate with Phase 5's PBR and Post-processing for consistent look.

### Deferred Ideas (OUT OF SCOPE)
- Full-physics collisions for every spark (simple ground-plane or bounding-box collisions only).
- Fluid simulation for smoke (stick to particle-based volumetric approximation).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| WGPU-04 | WebGPU-optimized particle systems (Muzzle flash, Smokes) | TSL `instancedArray` and `compute` nodes enable massive parallelization on GPU. |
| SUCCESS-1 | Muzzle flashes produce high-performance sparks using WebGPU compute shaders. | Research into `computeSpawn` patterns for pool-based emission. |
| SUCCESS-2 | Smoke grenades produce dense, performant volumetric-style particles. | TSL `texture` and `depth` nodes allow for soft-particle blending and noise-driven alpha. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `three/webgpu` | ^0.183.1 | Core Renderer | The new standard for WebGPU support in Three.js. |
| `three/tsl` | ^0.183.1 | Shader Logic | High-level abstraction for WGSL, portable and node-based. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|--------------|
| `instancedArray` | N/A (TSL) | GPU Storage | For storing particle positions, velocities, and ages on GPU memory. |
| `PointsNodeMaterial` | N/A (TSL) | Spark Rendering | Optimized for single-pixel or small circular particles. |
| `SpriteNodeMaterial` | N/A (TSL) | Smoke Rendering | Required for billboards/sprites with proper alpha blending. |

**Installation:**
```bash
# Core dependencies already installed in Phase 4
npm install three@latest
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── systems/
│   └── FXSystem.js       # Central manager for Compute Nodes and Storage Buffers
└── utils/
    └── FXUtils.js        # TSL function definitions (Noise, Physics, etc.)
```

### Pattern 1: Pool-Based Compute Emission
Instead of creating/destroying objects, we maintain a fixed-size Storage Buffer and "reset" blocks of data when an effect is triggered.
**What:** Use a "Spawn" compute node that overwrites a slice of the buffer.
**When to use:** High-frequency events like muzzle flashes.
**Example:**
```javascript
// Source: Three.js WebGPU Examples
const computeSpawn = Fn(() => {
    const position = positionBuffer.element(instanceIndex);
    const age = ageBuffer.element(instanceIndex);
    
    position.assign(muzzlePos);
    age.assign(0.0);
}).compute(particlesPerShot); 

// In FXSystem
renderer.compute(computeSpawn);
```

### Anti-Patterns to Avoid
- **CPU-to-GPU Sync:** Never read storage buffer data back to the CPU during the game loop. Use TSL for all physics and life-cycle logic.
- **Per-Shot Buffer Allocation:** Don't create new `instancedArray` objects on the fly. Pre-allocate a large "FX Pool" and manage indices.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Noise Generation | Custom WGSL Perlin | TSL `mx_noise` / `noise` | Built-in TSL noise is optimized and cross-platform. |
| Delta Time | Custom Uniforms | TSL `deltaTime` | Automatically managed by `WebGPURenderer`. |
| Depth Blending | Custom Depth Sampling | TSL `depth` node | Handles coordinate space conversions (NDC to View) automatically. |

## Common Pitfalls

### Pitfall 1: Async Initialization
**What goes wrong:** Attempting to run `renderer.compute()` before the WebGPU device is ready.
**Why it happens:** `renderer.init()` is asynchronous.
**How to avoid:** Await `renderer.init()` in `Engine.js` before initializing systems that use compute.

### Pitfall 2: Overdraw with Smoke
**What goes wrong:** Dense smoke particles filling the screen cause a massive drop in FPS.
**Why it happens:** Translucent particles are rendered multiple times per pixel.
**How to avoid:** Use TSL to fade particles based on distance to camera and limit the max particle size. Use `AdditiveBlending` where appropriate to avoid sorting issues.

## Code Examples

### Volumetric Smoke Alpha (TSL)
Verified pattern for soft-particle blending:
```javascript
// Source: three.js/examples/jsm/nodes/display/ViewportDepthNode.js
const smokeAlpha = Fn(() => {
    const screenDepth = depth; // Viewport depth
    const particleDepth = viewportSafeDepth; // Current fragment depth
    const diff = screenDepth.sub(particleDepth);
    
    // Soften edges when intersecting geometry
    const softFactor = diff.smoothstep(0.0, 0.1);
    return texColor.a.mul(softFactor).mul(ageFade);
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `THREE.Points` (CPU) | `instancedArray` (GPU) | 2024 (r160+) | 100x increase in particle count with 0 CPU cost. |
| GLSL Strings | TSL (Node-based) | 2024 (r166+) | Type-safe, composable shader logic in JS. |

## Open Questions

1. **Particle Sorting**
   - What we know: Standard `WebGPURenderer` doesn't automatically sort compute-managed instances for transparency.
   - What's unclear: Will `AdditiveBlending` be sufficient for smoke, or do we need a custom TSL order-independent transparency (OIT) solution?
   - Recommendation: Start with `AdditiveBlending` and `depthWrite: false`. If smoke looks "flat", explore depth-based alpha sorting in the compute update.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest |
| Config file | vitest.config.js (via vite.config.js) |
| Quick run command | `npm test` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| WGPU-04 | FXSystem initializes storage buffers | Unit | `npm test src/systems/FXSystem.test.js` | ❌ Wave 0 |
| WGPU-04 | Listeners attached to 'weapon:fired' | Unit | `npm test src/systems/FXSystem.test.js` | ❌ Wave 0 |
| WGPU-04 | Compute node dispatch on trigger | Unit/Mock | `npm test src/systems/FXSystem.test.js` | ❌ Wave 0 |

### Wave 0 Gaps
- [ ] `src/systems/FXSystem.test.js` — covers system initialization and event wiring.
- [ ] `src/systems/FXSystem.js` — scaffold for the new system.
- [ ] `DevViewer.js` updates — add a toggle to visualize FX bounds or counts.

## Sources

### Primary (HIGH confidence)
- Three.js WebGPU Examples (`webgpu_compute_particles`, `webgpu_tsl_vfx_linkedparticles`)
- Three.js TSL Documentation (GitHub Wiki/Examples)

### Secondary (MEDIUM confidence)
- "Three.js Shading Language (TSL) for VFX" - community tutorials.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - TSL is well-established in Three.js r170+.
- Architecture: HIGH - Event-driven compute dispatch is a proven pattern.
- Pitfalls: MEDIUM - Overdraw performance varies significantly by hardware.

**Research date:** 2026-03-08
**Valid until:** 2026-04-08
