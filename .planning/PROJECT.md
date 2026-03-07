# Project: Browser Strike

## Vision
A high-performance, browser-based tactical first-person shooter (FPS) built with Three.js, featuring modern rendering (WebGPU/TSL), real-time debugging tools, and modular system architecture.

## Core Value
High-fidelity tactical combat accessible via the web with zero installation, powered by a robust modular engine and professional asset generation tools.

## Requirements

### Validated
- ✓ **Core Engine**: Modular System & EventEmitter architecture (Engine.js, System.js)
- ✓ **Rendering**: Three.js WebGL implementation with WebGPU/TSL foundations
- ✓ **Physics**: Custom collision detection, surface-specific interactions (Physics.js)
- ✓ **Weaponry**: Functional AK47, Knife, HE/Flash/Smoke/Molotov grenades, and C4 logic
- ✓ **Combat Mechanics**: Recoil, ADS (Aim Down Sights), reload animations, and muzzle flashes
- ✓ **Player Movement**: Tactical movement including crouching, jumping, and bobbing
- ✓ **AI System**: Bot behaviors, ragdoll physics, and training range respawn logic
- ✓ **Audio**: Spatial SFX and BGM engine (SoundEngine.js)
- ✓ **UI**: Integrated HUD (Health, Ammo, Kill Feed) and scoreboard
- ✓ **Debug Suite**: Live weapon/enemy tweaking via MCP Debug Bridge
- ✓ **Asset Pipeline**: Procedural texture generation and Tripo/Flux 3D model support

### Active
- [ ] **WebGPU Transition**: Full migration to WebGPU/TSL for advanced post-processing
- [ ] **Multiplayer Stability**: Reliable P2P networking and state synchronization
- [ ] **Advanced Maps**: Dynamic environments and interactive map elements
- [ ] **Persistence**: Player profiles, inventory persistence, and rank tracking

### Out of Scope
- **VR Support**: Focused on desktop browser experience for initial release
- **Large-Scale BR**: Tactical and Deathmatch modes are the priority

## Key Decisions
| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Modular Systems | Decouples logic (Physics, AI, Input) for easier testing/scaling | Validated |
| MCP Debug Bridge | Allows real-time tweaks without reloading during dev | Validated |
| WebGPU/TSL | Future-proofing rendering performance and visual quality | In Progress |

---
*Last updated: 2026-03-06 after initialization*
