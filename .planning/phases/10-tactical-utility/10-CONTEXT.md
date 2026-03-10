# Phase Context: 10-Tactical Utility

## Domain
Refining and balancing tactical grenades (Flash, Smoke, Molotov) with advanced TSL effects and dynamic world interaction.

## Decisions

### Flashbang Effect
- **Decision**: Ghost After-image (Recommended)
- **Rationale**: Capture a snapshot of the last seen frame to create a disorienting, realistic blindness effect.
- **Implementation**: TSL post-processing pass that samples the frame buffer on detonation and blends it with white.

### Smoke Behavior
- **Decision**: Radial Density
- **Rationale**: Allows players to "lurk" on the edges of smoke and see out slightly better than those looking in, adding tactical depth.
- **Implementation**: Per-particle opacity in `FXSystem.js` based on distance to the detonation center.

### Molotov Spread
- **Decision**: Dynamic Flow
- **Rationale**: Maximizes immersion by having fire particles spread and "pool" on flat surfaces like ground or crates.
- **Implementation**: TSL compute simulation for fire particles with simple surface-alignment and neighbor-spreading logic.

### Flashbang Validation
- **Decision**: Standard LoS (Recommended)
- **Rationale**: Simple and predictable mechanic for competitive play. If the detonation point is in the frustum and not occluded, the player is blinded.
- **Implementation**: Raycast from player camera to detonation point in `WeaponSystem` or `FXSystem`.

## Specifics
- **Damage over Time (DoT)**: Molotovs will use the dynamic fire flow positions to check for player damage in `RoundSystem` or `PhysicsSystem`.
- **Sync**: Detonation events will be synced via PeerJS; particle simulations remain local for performance.

## Code Context
- `src/systems/FXSystem.js`: Core logic for all utility visual effects.
- `src/Weapon.js`: Existing grenade logic and detonation triggers.
- `src/core/Engine.js`: Management of the after-image sample buffer.
