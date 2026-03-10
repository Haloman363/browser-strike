# Architecture Patterns

**Domain:** Browser-based Tactical FPS
**Researched:** 2026-03-06

## Recommended Architecture

### Modular ECS-Lite (Current + Enhanced)

The existing `Engine` + `System` architecture is solid. It should be strictly adhered to, avoiding logic leakage into `main.js`.

**System Diagram:**
```
[Engine]
  |-- [InputSystem] (Captures Raw Input)
  |-- [NetworkSystem] (Manages Connections, Sync)
  |-- [PlayerControllerSystem] (Applies Input -> Physics)
  |-- [PhysicsSystem] (Collision Detection)
  |-- [WeaponSystem] (Raycasts, Ammo)
  |-- [RenderSystem] (WebGPU/Three.js)
  |-- [UISystem] (HUD, Menus)
```

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| **NetworkSystem** | Send/Recv packets, Buffer states, Clock sync. | `Engine`, `PlayerController` |
| **PlayerController** | Move logic, Input processing, Prediction. | `InputSystem`, `PhysicsSystem`, `NetworkSystem` |
| **WeaponSystem** | Firing logic, Reloads, Hit checks (Raycasts). | `InputSystem`, `NetworkSystem` (for Lag Comp) |
| **RenderSystem** | Scene graph updates, TSL material updates. | `Engine` (Scene/Camera) |

### Data Flow (Host-Authoritative P2P)

1.  **Input:** `InputSystem` captures `{ up: true, aim: 0.5 }` + `seq: 101`.
2.  **Local (Client):** `PlayerController` *immediately* applies input (Prediction).
3.  **Network (Send):** `NetworkSystem` sends Input + Seq to Host.
4.  **Host Logic:** Host processes input, updates authoritative state.
5.  **Network (Recv):** Client receives `{ pos: {x,y,z}, lastSeq: 101 }`.
6.  **Reconciliation:** Client compares local pos with Host pos. If different, snap & replay inputs > 101.

## Patterns to Follow

### Pattern 1: Deterministic Command Pattern
**What:** Encapsulate movement logic into a pure function `applyInput(state, input, dt)`.
**When:** BOTH Client (Prediction) and Host (Authority) use the exact same function.
**Example:**
```javascript
// Shared Logic
function applyInput(body, input, dt) {
    if (input.forward) body.velocity.z -= speed * dt;
    // ... collision checks ...
    return body.position;
}
```

### Pattern 2: Interpolation Buffer
**What:** Store remote player states with timestamps. Render them ~100ms in the past.
**When:** Rendering any entity controlled by another machine.
**Why:** Prevents jitter from variable network latency.

### Pattern 3: Lag Compensation (Backtracking)
**What:** When Host processes a shot, rewind world state to the shooter's timestamp.
**When:** `WeaponSystem` on Host checks for hits.
**Why:** Ensures shots that looked like hits on the client are registered as hits.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Trusting Client Transform
**What:** Client sends `position: {x,y,z}` to Host.
**Why bad:** Trivial to cheat (teleport hacks).
**Instead:** Client sends `inputs: {W, A, S, D}`, Host calculates position.

### Anti-Pattern 2: Coupling Rendering to Physics
**What:** Updating meshes directly in the physics loop.
**Why bad:** Physics might run at 60Hz, network at 20Hz, rendering at 144Hz.
**Instead:** Physics updates logical state; RenderSystem updates meshes from state (with interpolation).

## WebGPU Integration

**WebGPURenderer** uses an async init pattern.
```javascript
const renderer = new THREE.WebGPURenderer();
await renderer.init();
```
**TSL (Three Shading Language)** replaces `ShaderMaterial`.
```javascript
import { color, mix, positionLocal } from 'three/tsl';
const material = new THREE.MeshStandardNodeMaterial();
material.colorNode = mix(color(0xff0000), color(0x0000ff), positionLocal.y);
```

## Sources

- [Three.js WebGPU Examples](https://threejs.org/examples/?q=webgpu)
- [Gaffer on Games: Networked Physics](https://gafferongames.com/post/networked_physics_2004/)
