# Phase Context: 11-World Interaction

## Domain
Implementing interactive map elements (Ladders) with a focus on classic tactical shooter mechanics.

## Decisions

### Ladder Mechanics
- **Mount Style**: Auto-Attach (Proximity based).
- **Movement**: Look-based climbing (W moves player in look direction).
- **Combat**: Massive spread penalty while climbing (5.0x).
- **Dismount**: Jump key (Space) or moving away from ladder bounds.

## Strategy
- **Collision**: Use simple bounding box checks for attachment.
- **Velocity Override**: While `isOnLadder` is true, gravity is disabled and velocity is driven by camera pitch.

## Code Context
- `src/systems/PlayerControllerSystem.js`: Core movement and state tracking for ladders.
- `src/systems/WeaponSystem.js`: Handling accuracy penalties during climbing.
- `src/Maps_v2.js`: Defining ladder interactables.
