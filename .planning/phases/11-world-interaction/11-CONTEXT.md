# Phase Context: 11-World Interaction

## Domain
Implementing interactive map elements (Ladders, Doors) with a focus on classic tactical shooter mechanics.

## Decisions

### Ladder Mechanics
- **Mount Style**: Auto-Attach (Recommended)
- **Rationale**: Walk into the ladder to automatically stick, providing the fluid movement expected in a CS-like experience.
- **Implementation**: Detection in `PlayerControllerSystem` based on proximity to ladder objects.

### Climbing Controls
- **Decision**: Look-Based (Recommended)
- **Rationale**: W moves the player in the direction they are looking (UP if looking up, DOWN if looking down), which is intuitive for 3D navigation.
- **Implementation**: Update vertical velocity in `PlayerControllerSystem` based on view pitch and input.

### Dismount Logic
- **Decision**: Jump/Move Away (Recommended)
- **Rationale**: Pressing Space to jump off or physically moving away from the ladder plane provides quick and reliable detachment.
- **Implementation**: Detach state when Space is pressed or `distanceToLadder` exceeds a threshold.

### Combat on Ladders
- **Decision**: Inaccurate Firing (Recommended)
- **Rationale**: Maintains tactical realism where firing while climbing is possible but highly inaccurate.
- **Implementation**: Apply a massive `spread` penalty in `WeaponSystem` when `isOnLadder` is true.

## Specifics
- **Doors**: Default to manual 'E' key toggle for opening/closing. (Implicit decision for tactical depth).
- **Network Sync**: Object states (Open/Closed) must be synced via `NetworkSystem` to maintain map integrity for all players.

## Code Context
- `src/systems/PlayerControllerSystem.js`: Core movement and state tracking for ladders.
- `src/systems/WeaponSystem.js`: Handling accuracy penalties during climbing.
- `src/Maps_v2.js`: Defining ladder and door interactables.
