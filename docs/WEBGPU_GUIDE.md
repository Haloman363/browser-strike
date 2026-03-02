# WebGPU & TSL (Three.js Shading Language) Reference

This guide provides the core patterns for upgrading **Browser Strike** to WebGPU.

## 1. Renderer Initialization
Replace `WebGLRenderer` with `WebGPURenderer`.
```javascript
import WebGPURenderer from 'three/addons/renderers/webgpu/WebGPURenderer.js';

const renderer = new WebGPURenderer({ antialias: true });
await renderer.init();
```

## 2. Basic TSL Shader Pattern
Instead of GLSL strings, use TSL (JavaScript-based shader building).
```javascript
import { color, vec3, uniform, positionLocal } from 'three/tsl';

const material = new THREE.MeshStandardNodeMaterial();
material.colorNode = color(0xff0000); // Simple red
```

## 3. Advanced Effects (Explosion/Muzzle Flash)
Use TSL nodes for GPU-side calculations.
```javascript
const uTime = uniform(0);
const wave = positionLocal.y.add(uTime).sin();
material.positionNode = positionLocal.add(vec3(0, wave, 0));
```

## 4. Performance Checklist
- Use `StorageBuffer` for large instances (e.g., thousands of bullet impacts).
- Prefer `MeshStandardNodeMaterial` over legacy materials.
- Utilize Compute Shaders for physics-heavy tasks like the `bloodParticles` loop.
