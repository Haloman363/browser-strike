# Phase 11: World Interaction (Ladders) - Research

**Researched:** 2024-03-21
**Domain:** FPS Environment Interaction
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Ladder Attachment**: Proximity-based auto-attach. No "use" key required.
- **Ladder Movement**: Look-based. W moves player in the direction they are looking.
- **Weapon Accuracy**: Massive spread penalty while climbing.
</user_constraints>

## Technical Research

### Ladder Geometry & Proximity
- Ladders in `Maps_v2.js` are defined as simple meshes with `userData.type = 'ladder'`.
- Attachment check uses XZ distance to ladder center and Y-range check.
- `PlayerControllerSystem.js` handles the state transition to `isOnLadder`.

### Climbing Physics
- When `isOnLadder` is true:
    - Set `velocity.y` based on `forward/backward` input and `camera.rotation.x`.
    - Apply extra friction to avoid sliding when not pressing keys.
    - Ignore gravity.
- Dismount logic:
    - `jump` input sets `isOnLadder = false` and applies an upward/outward impulse.
    - Moving too far from the ladder center (distXZ > threshold) resets the state.

## Implementation Details

### Weapon Accuracy Penalty
- `WeaponSystem.js` needs to access `PlayerControllerSystem.isOnLadder`.
- Apply `PHYSICS.LADDER_SPREAD_MULTIPLIER` during spread calculation.

## Risk Assessment
- **Jittery Transitions**: Solved by using a generous attachment threshold and smooth velocity interpolation.
- **Ceiling Collision**: Ensure the player doesn't clip through ceilings while climbing up.

## Validation Plan
- [x] Verify auto-attach proximity.
- [x] Verify climbing direction based on pitch.
- [x] Verify jump-to-dismount.
- [x] Verify spread penalty integration.

## Sources
### Primary (HIGH confidence)
- `.planning/phases/11-world-interaction/11-CONTEXT.md` - Locked mechanics.
- `src/systems/PlayerControllerSystem.js` - Existing movement logic.
- `src/Physics.js` - Collision handling.
