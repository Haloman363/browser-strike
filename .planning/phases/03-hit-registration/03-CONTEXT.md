# Phase Context: 03-Hit Registration

## Domain
Implementing Lag Compensation (Backtracking) and Authoritative Hit Confirmation for accurate tactical combat.

## Decisions

### Rewind Window
- **Decision**: 200ms (Recommended)
- **Rationale**: Covers standard latency while minimizing the "shot behind walls" sensation for targets.
- **Implementation**: Host must maintain a 200ms history buffer of all player positions.

### Hit Feedback
- **Decision**: Confirmed (Recommended)
- **Rationale**: Ensures that blood splatters only appear when damage is actually dealt, maintaining competitive integrity.
- **Implementation**: Client sends fire requests; host calculates and broadcasts `HIT` events back to clients.

### Shooter Favor
- **Decision**: Shooter (Recommended)
- **Rationale**: "What you see is what you hit." This is the industry standard for tactical FPS games to ensure gunplay feels rewarding.
- **Implementation**: Host validates hits against the target's position at the shooter's perceived time (timestamp-based backtracking).

### Kill Prediction
- **Decision**: Confirmed (Recommended)
- **Rationale**: Prevents confusing "resurrections" where an enemy dies but is then corrected by the host.
- **Implementation**: Ragdoll triggers and kill-feed updates only occur upon host confirmation.

## Specifics
- **Backtracking Math**: Use the shooter's latency (RTT/2) to determine which historical snapshot to use for validation.
- **Validation Threshold**: Hits must be within a reasonable bounding box of the target's past position.

## Code Context
- Reuses the existing `NetworkSystem.js` for message passing and `WeaponSystem.js` for firing logic.
- SnapshotInterpolation vault can be used on the host to store history.
