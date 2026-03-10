# Phase Context: 09-Tactical Economy

## Domain
Implementing the strategic layer of the game, including the Buy Menu UI, cash reward system, and inventory persistence.

## Decisions

### Buy Menu UI
- **Decision**: Radial Wheel (Recommended)
- **Rationale**: Optimized for fast keyboard navigation (1-9), maintaining the high-intensity feel of a competitive shooter.
- **Implementation**: A circular SVG or canvas-based overlay in `UISystem.js`.

### Buy Zones
- **Decision**: Spawn Zone Only (Recommended)
- **Rationale**: Adds tactical importance to the start of the round and prevents mid-map equipment upgrades.
- **Implementation**: Check player position against spawn volumes in `UISystem` before allowing the menu to open.

### Persistence
- **Decision**: Full Persistence (Recommended)
- **Rationale**: Survival becomes a strategic objective, allowing players to "save" expensive equipment for subsequent rounds.
- **Implementation**: `GameState` will not reset weapon slots during the `round:reset` sequence if the player is alive.

### Weapon Dropping
- **Decision**: Manual Drop (Recommended)
- **Rationale**: Encourages teamplay and allows for flexible resource sharing on the fly.
- **Implementation**: New 'G' key binding that spawns a physicalized weapon pickup in the world.

## Specifics
- **Cash Rewards**: 
  - Kill: $300
  - Round Win: $3250
  - Round Loss: $1400 (plus loss streak bonus if possible)
- **Key Binding**: 'B' to open/close the buy menu. 'G' to drop.

## Code Context
- `src/systems/UISystem.js`: Buy menu rendering and zone checks.
- `src/GameState.js`: Cash tracking and inventory persistence.
- `src/systems/RoundSystem.js`: Triggering end-of-round cash rewards.
- `src/Factory.js`: Creating world-space weapon pickups for dropping.
