# Phase Context: 02-Game Feel

## Domain
Implementing Client-Side Prediction (CSP) and Server Reconciliation to eliminate perceived latency for movement and tactical actions.

## Decisions

### Prediction Scope
- **Decision**: Movement, Jump, & Crouch (Recommended)
- **Rationale**: These are the most critical "feel" elements for immediate response. Predicting them provides the zero-latency sensation essential for an FPS.
- **Implementation**: `PlayerControllerSystem` will apply inputs immediately to the local player and buffer them for the host.

### Reconciliation Threshold
- **Decision**: Tight (0.1 units) (Recommended)
- **Rationale**: Corrects even small drift for maximum precision and competitive integrity.
- **Implementation**: `NetworkSystem` will compare host-provided authoritative state with local predicted state and re-simulate if the difference exceeds this threshold.

## Specifics
- **Input Buffering**: Maintain a sequence-numbered input buffer on the client for rewinding and re-simulating.
- **Host Validation**: Host must process sequence numbers and echo them back in snapshots for reconciliation.

## Code Context
- Reuses the existing `PlayerControllerSystem.js` and `NetworkSystem.js`.
- `PHYSICS` constants from `src/Constants_v2.js` provide the ground truth for movement math.
