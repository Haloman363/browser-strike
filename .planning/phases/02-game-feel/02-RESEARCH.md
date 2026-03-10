# Phase 2: Game Feel - Research

**Researched:** 2026-03-07
**Domain:** Networked Character Controller (CSP & Server Reconciliation)
**Confidence:** HIGH

## Summary

This phase focuses on eliminating the "floaty" feeling of networked movement by implementing Client-Side Prediction (CSP) and Server Reconciliation (SR). In our P2P architecture, the "Host" acts as the authoritative server. 

The primary challenge is refactoring the `PlayerControllerSystem` to support deterministic re-simulation. When the Host sends a snapshot that contradicts the Client's predicted state (beyond the 0.1-unit threshold), the Client must "rewind" to the last known authoritative state and "replay" all unacknowledged inputs to restore the present state.

**Primary recommendation:** Refactor `PlayerControllerSystem` to extract movement logic into a pure `applyInput(input, delta)` function shared between the prediction and reconciliation loops.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Prediction Scope**: Movement, Jump, & Crouch.
- **Reconciliation Threshold**: Tight (0.1 units).
- **Input Buffering**: Maintain a sequence-numbered input buffer on the client for rewinding and re-simulating.
- **Host Validation**: Host must process sequence numbers and echo them back in snapshots for reconciliation.

### Claude's Discretion
- Implementation details for the input buffer and sequence numbering.
- Refactoring strategy for `PlayerControllerSystem` and `NetworkSystem`.

### Deferred Ideas (OUT OF SCOPE)
- Lag Compensation (Rewind) for hit registration (Phase 3).
- Smooth interpolation between reconciled states (Phase 2 focuses on functional correctness first).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| NET-02 | Client-Side Prediction (CSP) | Validated standard JS pattern for input numbering and local application. |
| NET-03 | Server Reconciliation | Identified "Rewind & Replay" as the standard solution for host-authoritative corrections. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| PeerJS | ^1.5.5 | P2P Connectivity | Standard for browser-based P2P; supports unreliable/reliable channels. |
| Snapshot Interpolation | ^1.1.1 | State Smoothing | Handles jitter and interpolation for *other* players. |
| Three.js | ^0.183.1 | Rendering/Math | Uses `Vector3`, `Box3`, and `Matrix4` for deterministic movement math. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|--------------|
| Vitest | ^4.0.18 | Unit Testing | Validating reconciliation logic without a full network. |

## Architecture Patterns

### Recommended Project Structure
No structural changes; logic resides in existing systems.
```
src/
├── systems/
│   ├── NetworkSystem.js          # Handles input syncing & reconciliation triggers
│   ├── PlayerControllerSystem.js # Deterministic applyInput & prediction buffer
│   └── PhysicsSystem.js          # Ground-truth collision checks
```

### Pattern 1: Sequence-Numbered Input Buffering
**What:** Every input sent to the host is tagged with an incrementing integer.
**When to use:** Crucial for matching server snapshots (which are "the past") to the client's local history.
**Example:**
```typescript
interface InputState {
  seq: number;
  dt: number;
  keys: { w: boolean, s: boolean, a: boolean, d: boolean, space: boolean, ctrl: boolean };
}
```

### Pattern 2: Rewind & Replay (Reconciliation)
**What:** On desync, reset position to Host state and loop through the buffer.
**Example:**
```javascript
// Source: gabrielgambetta.com
onServerUpdate(serverSnapshot) {
  const lastSeq = serverSnapshot.lastProcessedSeq;
  this.pendingInputs = this.pendingInputs.filter(i => i.seq > lastSeq);
  
  const dist = this.localEntity.position.distanceTo(serverSnapshot.pos);
  if (dist > 0.1) {
    this.localEntity.position.copy(serverSnapshot.pos); // SNAP
    for (const input of this.pendingInputs) {
      this.applyInput(input, input.dt); // REPLAY
    }
  }
}
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Jitter/Smoothing | Custom Lerp | `SnapshotInterpolation` | Handles clock sync, buffer offsets, and jitter naturally. |
| P2P Channels | Custom WebRTC | `PeerJS` | Manages ICE candidates and signaling complexity. |

## Common Pitfalls

### Pitfall 1: Interpolating the Local Player
**What goes wrong:** The client receives a snapshot of itself from 50-100ms ago. If the `NetworkSystem` interpolates this, the player will feel "rubber-banded" backwards every frame.
**How to avoid:** Explicitly check `if (entity.id === localPlayerId) return;` inside the interpolation loop in `NetworkSystem.js`.

### Pitfall 2: Non-Deterministic delta
**What goes wrong:** Client uses `requestAnimationFrame` delta (variable), while Host uses a fixed `setInterval` (20Hz). Even small differences lead to drift.
**How to avoid:** Send the exact `delta` used for the prediction in the input packet so the Host can simulate using the same time step.

### Pitfall 3: Physics Overlap
**What goes wrong:** Replaying 10+ frames of movement in a single tick might skip collision checks if the logic isn't robust.
**How to avoid:** `applyInput` must perform a full collision check (via `PhysicsSystem.checkCollision`) every step of the replay loop.

## Code Examples

### Refactored applyInput (Pattern)
```javascript
// Inside PlayerControllerSystem.js
applyInput(input, delta) {
    const speed = input.keys.ctrl ? PHYSICS.CROUCH_SPEED : PHYSICS.MOVE_SPEED;
    
    // Friction & Gravity (Simplified from current code)
    this.velocity.x -= this.velocity.x * 10.0 * delta;
    this.velocity.z -= this.velocity.z * 10.0 * delta;
    this.velocity.y -= PHYSICS.GRAVITY * delta;

    // ... calculate moveVec using input.keys ...
    
    // Collision check (Existing logic)
    if (!this.physics.checkCollision(nextX)) this.entity.position.x = nextX.x;
    if (!this.physics.checkCollision(nextZ)) this.entity.position.z = nextZ.z;
    // ... Y logic ...
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Dumb Clients | Client Prediction | Late 90s (Quake World) | Essential for playable FPS over internet. |
| Lockstep | Snapshot Interpolation | Early 2000s (Source) | Smoother visuals for other players. |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest + JSDOM |
| Config file | `vite.config.js` |
| Quick run command | `npx vitest run src/systems/NetworkSystem.test.js` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| NET-02 | Input buffering + Prediction | Unit | `npx vitest run tests/Prediction.test.js` | ❌ Wave 0 |
| NET-03 | Replay on desync > 0.1 | Integration | `npx vitest run tests/Reconciliation.test.js` | ❌ Wave 0 |
| NET-02/03 | Local entity skipped in SI | Unit | `npx vitest run src/systems/NetworkSystem.test.js` | ✅ Modified |

### Wave 0 Gaps
- [ ] `tests/Prediction.test.js` — covers local prediction and buffer growth.
- [ ] `tests/Reconciliation.test.js` — simulates a server correction and verifies position after replay.
- [ ] Mock `PhysicsSystem` for deterministic test runs.

## Sources

### Primary (HIGH confidence)
- [gabrielgambetta.com](https://www.gabrielgambetta.com/client-side-prediction-server-reconciliation.html) - Canonical explanation of CSP/SR.
- [geckosio/snapshot-interpolation] - Official docs for the SI library.
- [src/systems/NetworkSystem.js] - Current project implementation.

### Secondary (MEDIUM confidence)
- Three.js Documentation - `Box3` and `Vector3` math for collisions.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Libraries are already integrated and working.
- Architecture: HIGH - Industry standard patterns for FPS networking.
- Pitfalls: HIGH - Common "rubber-banding" issues are well-documented for this stack.

**Research date:** 2026-03-07
**Valid until:** 2026-04-07
