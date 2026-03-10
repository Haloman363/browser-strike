# Phase 4: WebGPU Foundation - Research

**Researched:** 2025-03-08
**Domain:** Three.js WebGPU Rendering & TSL
**Confidence:** HIGH

## Summary
Phase 4 focuses on migrating the core rendering engine from the legacy WebGL-only `WebGLRenderer` to the unified `WebGPURenderer`. This transition involves not just a renderer swap but a fundamental change in how materials are defined, moving from GLSL-backed materials to the node-based **Three.js Shading Language (TSL)**. 

As of Three.js r183, the `WebGPURenderer` is the recommended path for modern web graphics, providing automatic fallback to WebGL 2 while enabling advanced features like Compute Shaders and bind-group optimizations when WebGPU is available. The migration requires an asynchronous initialization pattern and a complete overhaul of the material library in `Factory.js`.

**Primary recommendation:** Use the `WebGPURenderer` from the `three/webgpu` entry point and convert all materials to `NodeMaterial` equivalents using TSL nodes for color and texture mapping.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Renderer Migration**: Total Replacement. Replace `WebGLRenderer` initialization in `Engine.js` and `main.js`.
- **Material Scope**: Complete Overhaul. Systematically convert all materials in `Factory.js` and `TextureGenerator.js` to `NodeMaterial`.
- **Visual Feedback**: HUD Indicator. Add a small "Backend: WebGPU/WebGL" label to the HUD or debug overlay.
- **Fallback Policy**: Auto Fallback. Utilize `WebGPURenderer`'s built-in detection and fallback logic.

### Claude's Discretion
- Established core TSL utility nodes for common effects (e.g., world-space texturing).
- Choice of specific `NodeMaterial` types (e.g., `MeshStandardNodeMaterial` vs `MeshPhongNodeMaterial`).

### Deferred Ideas (OUT OF SCOPE)
- TSL-based Post-processing (Phase 5)
- WebGPU-optimized particle systems (Phase 6)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| WGPU-01 | Migration to Three.js `WebGPURenderer` | Verified `WebGPURenderer` init pattern and async requirements. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Three.js | ^0.183.1 | Core Rendering | Industry standard for web 3D; WebGPU is now the primary focus. |
| TSL | N/A | Shading Language | Built-in to Three.js; replaces GLSL with node-based JS. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vite-plugin-top-level-await` | Latest | Build Support | Necessary if `esnext` target isn't enough for some environments. |

**Installation:**
```bash
# No new packages needed as three.js already includes WebGPU/TSL
npm install
```

## Architecture Patterns

### Recommended Project Structure
No changes to folder structure required, but `src/core/Engine.js` and `src/Factory.js` will undergo heavy internal refactoring.

### Pattern 1: Async Renderer Initialization
WebGPU requires an asynchronous setup to check for adapter availability and initialize the device.

**Example:**
```javascript
// Source: https://threejs.org/docs/#manual/en/introduction/WebGPU-renderer
import { WebGPURenderer } from 'three/webgpu';

const renderer = new WebGPURenderer({ antialias: true });
await renderer.init(); // MUST be awaited
```

### Pattern 2: TSL Material Migration
Legacy materials like `MeshPhongMaterial` must be replaced with `MeshPhongNodeMaterial` (or `MeshStandardNodeMaterial` for PBR).

**Example:**
```javascript
// Source: https://github.com/mrdoob/three.js/blob/master/examples/webgpu_materials.html
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { color, texture, float } from 'three/tsl';

const material = new MeshStandardNodeMaterial();
material.colorNode = texture( myTexture );
material.roughnessNode = float( 0.5 );
```

### Anti-Patterns to Avoid
- **Synchronous Init:** Do not try to render before `renderer.init()` completes.
- **Mixing legacy and Node materials:** While `WebGPURenderer` handles legacy materials via a bridge, TSL-based effects only work on `NodeMaterial` types.
- **GLSL Strings:** Avoid using `ShaderMaterial` with raw strings; use the TSL transpiler or rewrite logic in TSL nodes.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Shaders | Raw GLSL | TSL | TSL handles WGSL/GLSL transpilation and bind-group management automatically. |
| WebGL Fallback | Custom Detection | `WebGPURenderer` | Built-in fallback to WebGL 2 if WebGPU is unsupported. |
| Noise/Math | Custom GLSL math | `three/tsl` math nodes | Optimized, tree-shakable, and readable JS-based math. |

## Common Pitfalls

### Pitfall 1: Vite Build Target
**What goes wrong:** Vite may fail to bundle top-level `await` used in `Engine.js` or `main.js`.
**How to avoid:** Set `build.target: 'esnext'` in `vite.config.js`.

### Pitfall 2: Node Reassignment `needsUpdate`
**What goes wrong:** Changing `material.colorNode` after the first render might not update the visual.
**How to avoid:** Set `material.needsUpdate = true` when changing the structure of the node graph. Note: Updating a `uniform()` value does NOT require `needsUpdate`.

### Pitfall 3: Strict Typing in r183
**What goes wrong:** TSL in r183+ is stricter about node types (e.g., trying to use `.xy` on a `float` node).
**How to avoid:** Use explicit type hints if needed and ensure math operations are between compatible nodes.

## Code Examples

### HUD Indicator for Backend
```javascript
// Implementation in Engine.js or a dedicated HUD system
const backend = renderer.isWebGPU ? 'WebGPU' : 'WebGL';
this.hud.setBackendLabel(backend);
```

### World-Space Texturing Utility (TSL)
```javascript
import { positionWorld, texture, vec3 } from 'three/tsl';

// Simple triplanar-style or world-space mapping
const worldUV = positionWorld.xz;
const wallMaterial = new MeshStandardNodeMaterial();
wallMaterial.colorNode = texture(wallTex, worldUV);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `WebGLRenderer` | `WebGPURenderer` | r160+ | Unified backend, async init. |
| GLSL Strings | TSL (Three Shading Language) | r167+ | Type-safe, JS-based shader composition. |
| `EffectComposer` | `PostProcessing` (TSL) | r170+ | Integrated node-based post-effects. |

## Open Questions

1. **Performance of `MeshPhongNodeMaterial` vs `MeshStandardNodeMaterial`?**
   - *What we know:* `MeshStandard` is PBR and more modern, but the game currently uses `MeshPhong` heavily.
   - *Recommendation:* Stick to `MeshPhongNodeMaterial` for existing assets to maintain visual parity, then transition to `MeshStandardNodeMaterial` for new high-fidelity assets.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest |
| Config file | vite.config.js |
| Quick run command | `npm test` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| WGPU-01 | Renderer initializes WebGPU or WebGL 2 | Smoke | `npm test` (check Engine init logic) | ❌ Wave 0 |
| WGPU-01 | Material creation returns NodeMaterial | Unit | `npm test` (verify Factory output) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test`
- **Per wave merge:** Manual browser check with HUD indicator (due to WebGPU hardware requirement).

### Wave 0 Gaps
- [ ] `src/core/Engine.test.js` — Mocking `WebGPURenderer` to verify init flow.
- [ ] `src/Factory.test.js` — Updating existing tests to check for `NodeMaterial` instances.
- [ ] `vite.config.js` update — `build.target: 'esnext'`.

## Sources

### Primary (HIGH confidence)
- Official Three.js WebGPU Examples - [threejs.org](https://threejs.org/examples/?q=webgpu)
- Three.js r183 Release Notes & TSL Updates.
- Three.js Manual: WebGPU Renderer - [threejs.org/docs](https://threejs.org/docs/#manual/en/introduction/WebGPU-renderer)

### Secondary (MEDIUM confidence)
- "The Future of Three.js: WebGPU and TSL" community articles (2025).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Core Three.js documentation is clear.
- Architecture: HIGH - Async init and TSL patterns are well-documented.
- Pitfalls: HIGH - Vite config and typing issues are common in recent versions.

**Research date:** 2025-03-08
**Valid until:** 2025-04-08
