# Phase Context: 06-FX Overhaul

## Domain
Developing performant, high-fidelity particle systems optimized for WebGPU compute shaders using Three Shading Language (TSL).

## Decisions

### Compute Logic
- **Decision**: TSL Nodes (Recommended)
- **Rationale**: Maintaining consistency with the Phase 4/5 migration. TSL nodes provide a high-level abstraction that is portable and easier to maintain than raw WGSL.
- **Implementation**: Utilize `compute()` and `StorageBuffer` nodes for simulation.

### Muzzle Flash
- **Decision**: 3D Compute Sparks (Recommended)
- **Rationale**: High-fidelity sparks with individual life and basic physics provide a far more dynamic and immersive experience than 2D sprites.
- **Implementation**: A dedicated TSL compute shader for emitting and updating spark particles per gunshot.

### Smoke Tech
- **Decision**: Dense Compute Particles (Recommended)
- **Rationale**: Using thousands of small particles allows for a more "volumetric" and realistic smoke bloom that reacts better to lighting.
- **Implementation**: TSL compute simulation for expanding smoke clouds with per-particle depth and opacity logic.

### Network Sync
- **Decision**: Hybrid Sync (Recommended)
- **Rationale**: Only the critical "event" of an effect (e.g., Smoke grenade detonation time/pos) needs to be synced. Detailed particle simulation remains local to the client to save bandwidth.
- **Implementation**: Sync detonation events via `NetworkSystem`; clients then trigger local compute simulations.

## Specifics
- **Performance**: Target < 2ms GPU time for total particle simulation on mid-range hardware.
- **Visuals**: Integrate with Phase 5's PBR and Post-processing for consistent look.

## Code Context
- `src/systems/WeaponSystem.js`: Event source for muzzle flashes.
- `src/core/Engine.js`: Management of global compute simulations.
