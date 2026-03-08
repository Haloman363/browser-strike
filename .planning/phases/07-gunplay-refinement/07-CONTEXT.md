# Phase Context: 07-Gunplay Refinement

## Domain
Implementing advanced weapon mechanics including deterministic recoil, movement inaccuracy scaling, and dynamic UI feedback.

## Decisions

### Recoil Type
- **Decision**: Camera + Trajectory (Recommended)
- **Rationale**: This is the industry standard for tactical shooters. It balances visual feedback (camera punch) with actual skill-based trajectory management.
- **Implementation**: `WeaponSystem` will apply both camera rotation offsets and a ray-casting vector offset during fire.

### Pattern Format
- **Decision**: Coordinate Arrays (Recommended)
- **Rationale**: Allows for precise "learnable" spray patterns (e.g., the characteristic AK-47 "7" shape), which is a key differentiator for competitive integrity.
- **Implementation**: Define patterns as `[ {x, y}, ... ]` in `WeaponRecipes.js` or a new `RecoilPatterns.js`.

### Move Inaccuracy
- **Decision**: Strict Tactical (Recommended)
- **Rationale**: Discourages "run-and-gun" gameplay, forcing players to stop or crouch for accurate shots, which reinforces the tactical nature of the game.
- **Implementation**: Calculate spread as a base value plus a scalar linked to velocity and airborne state.

### Crosshair Style
- **Decision**: Dynamic (Recommended)
- **Rationale**: Provides immediate and intuitive feedback to the player about their current accuracy state, which is especially important given the strict movement penalties.
- **Implementation**: `UISystem` will update crosshair gap size based on the current `spread` calculated in `WeaponSystem`.

## Specifics
- **Recovery**: Recoil should smoothly reset to zero when not firing.
- **Crouch Bonus**: Crouching should significantly reduce both base spread and recoil intensity.

## Code Context
- `src/systems/WeaponSystem.js`: Core logic for firing and spread.
- `src/systems/UISystem.js`: Crosshair rendering logic.
- `src/WeaponRecipes.js`: Source for weapon-specific stats.
