# Domain Pitfalls

**Domain:** Browser-based Tactical FPS
**Researched:** 2026-03-06

## Critical Pitfalls

Mistakes that cause rewrites or major issues.

### Pitfall 1: Naive P2P Networking
**What goes wrong:** Sending player positions directly (`x,y,z`) and broadcasting them.
**Why it happens:** Easiest to implement initially.
**Consequences:** 
1. **Cheating:** Users can teleport anywhere.
2. **Jitter:** Network fluctuations move players erratically.
3. **Desync:** Clients see different game states.
**Prevention:** Use **Host-Authoritative** model. Send *inputs*, not positions. Host validates and sends back authoritative state.

### Pitfall 2: Input Lag (Lack of Prediction)
**What goes wrong:** Waiting for server response before moving the player.
**Why it happens:** Avoiding the complexity of prediction/reconciliation.
**Consequences:** Game feels sluggish and unresponsive ("unplayable" for FPS).
**Prevention:** Implement **Client-Side Prediction**. Move immediately, correct later if wrong.

### Pitfall 3: "Shot Behind Cover" (Lack of Lag Comp)
**What goes wrong:** Player A shoots Player B. Player B moved into cover on Server, but was still visible on Player A's screen (due to latency). Server denies hit.
**Consequences:** Frustration, "hitreg sucks" complaints.
**Prevention:** **Lag Compensation (Backtracking)**. Host rewinds hitboxes to where Player A saw them when the shot was fired.

## Moderate Pitfalls

### Pitfall 1: WebGPU Compatibility
**What goes wrong:** Game crashes or shows black screen on older devices/browsers.
**Prevention:** Check `WebGPU.isAvailable()`. Fallback to WebGL if necessary (easier with TSL which compiles to both).

### Pitfall 2: Memory Leaks in Long Sessions
**What goes wrong:** Creating geometries/materials/textures without disposing.
**Prevention:** Strict resource management in `System.destroy()` methods. Use resource pools for bullets/particles.

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| **Networking** | Floating point determinism issues causing drift. | Quantize inputs/state (e.g., send integers for position * 100). |
| **WebGPU** | Over-optimizing with Compute Shaders too early. | Stick to standard TSL materials first; use Compute only for heavy particle systems later. |
| **Gameplay** | Hardcoding weapon logic in `PlayerController`. | Keep `WeaponSystem` separate and data-driven (ScriptableObjects/JSON configs). |

## Sources

- [Valve Networking Articles](https://developer.valvesoftware.com/wiki/Source_Multiplayer_Networking)
- [Gaffer on Games](https://gafferongames.com/)
