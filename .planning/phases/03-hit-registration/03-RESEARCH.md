# Phase 3: Hit Registration - Research

**Researched:** 2024-03-08
**Domain:** Lag Compensation, Backtracking, and Authoritative Hit Registration
**Confidence:** HIGH

## Summary

This phase focuses on implementing **Lag Compensation (Backtracking)** to ensure fair and accurate combat in a peer-to-peer (P2P) environment. The primary goal is to resolve the "I shot them on my screen but they didn't die" issue caused by network latency. 

The implementation will follow the **Shooter Favor** principle: if a player sees a target on their screen and shoots it, the host should acknowledge that hit by "rewinding" the world state to the exact moment the player fired. We will use a history vault to store recent world states and perform authoritative raycasting on the host.

**Primary recommendation:** Use `@geckos.io/snapshot-interpolation`'s `Vault` class on the host to manage a 200ms-1000ms history of entity positions, synchronized via an NTP-style clock offset algorithm.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Rewind Window**: 200ms. Covers standard latency while minimizing the "shot behind walls" sensation for targets.
- **Hit Feedback**: Confirmed. Blood splatters only appear when damage is actually dealt, maintaining competitive integrity.
- **Shooter Favor**: Shooter. "What you see is what you hit." The industry standard for tactical FPS games.
- **Kill Prediction**: Confirmed. Ragdoll triggers and kill-feed updates only occur upon host confirmation.

### Claude's Discretion
- **Backtracking Math**: Use the shooter's latency (RTT/2) to determine which historical snapshot to use for validation.
- **Validation Threshold**: Hits must be within a reasonable bounding box of the target's past position.

### Deferred Ideas (OUT OF SCOPE)
- N/A for this phase context.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| NET-04 | Lag Compensation (Rewind) for accurate hit registration | Implementation pattern for `History Vault` and `Rewind & Replay` raycasting logic. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `peerjs` | ^1.5.0 | P2P Signaling | Lightweight and widely used for WebRTC data channels. |
| `@geckos.io/snapshot-interpolation` | ^1.0.1 | Snapshot Mgmt | Provides `Vault` and `Interpolation` logic natively. |
| `three.js` | ^0.160.0 | Raycasting | Built-in high-performance raycasting for hit detection. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|--------------|
| `performance.now()` | Native | Monotonic Clock | Use for high-precision timing, avoiding `Date.now()` jumps. |

**Installation:**
```bash
npm install @geckos.io/snapshot-interpolation peerjs three
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── core/
│   └── ClockSync.js      # New: NTP-style clock synchronization
└── systems/
    ├── NetworkSystem.js   # Expanded: Vault management & HIT_CONFIRMED messages
    └── WeaponSystem.js    # Expanded: Separation of SHOOT_REQUEST and AUTHORITATIVE_HIT
```

### Pattern 1: Authoritative Rewind (Backtracking)
**What:** The host maintains a history of world snapshots. When a player fires, the host finds the snapshot matching the player's view time, moves entities to those positions, checks the hit, and restores them.
**When to use:** All hitscan weapon firing.
**Example:**
```javascript
// Source: https://github.com/geckosio/snapshot-interpolation#vault
const pastState = vault.get(timestamp); // Interpolated past state
if (pastState) {
    applyState(pastState); // Temporarily move targets
    const hit = raycaster.intersectObjects(targets);
    restoreState(); // Move targets back to present
}
```

### Anti-Patterns to Avoid
- **Client-Authoritative Hits:** Allowing the client to tell the host "I hit player X" leads to cheating and desync.
- **Fixed-Delay Rewind:** Assuming a constant 100ms lag. Latency varies per player; the host must use the specific player's RTT/2 and Clock Offset.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Time history | Custom arrays | `SI.Vault` | Handles interpolation and size-capping automatically. |
| Raycasting | Custom math | `THREE.Raycaster` | Optimized and well-tested with Three.js meshes. |
| Clock Sync | Assuming same time | NTP Algorithm | System clocks drift; NTP provides sub-10ms accuracy. |

## Common Pitfalls

### Pitfall 1: Ghost Hits (Shot behind walls)
**What goes wrong:** A player gets hit after they have already run behind cover on their screen.
**Why it happens:** The shooter has high latency, and the host rewinds the target too far back.
**How to avoid:** Cap the Rewind Window at 200ms-300ms. If the shooter's lag is higher, they must lead their shots.

### Pitfall 2: Bounding Box Desync
**What goes wrong:** The host raycasts against a standing hitbox while the client shot at a crouching target.
**Why it happens:** The snapshot only stored `position`, not `isCrouched` state.
**How to avoid:** Include all hit-relevant state (crouching, rotation, animation frame) in the snapshot.

## Code Examples

### Clock Sync (NTP-style)
```javascript
// Client sends T1
this.send('TIME_SYNC', { t1: performance.now() });

// Host receives T1, sends T1 + HostTime
this.send('TIME_ACK', { t1: data.t1, hostTime: performance.now() });

// Client receives ACK at T2
const rtt = t2 - data.t1;
const offset = (data.hostTime + rtt/2) - t2;
const syncedTime = performance.now() + offset;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Client-Authoritative | Host-Authoritative | ~2010 (CS:GO/OW) | Eliminated "god mode" hacks. |
| Leading Shots | Lag Compensation | ~2000 (Source Engine) | Improved feel for high-ping players. |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest |
| Config file | `vitest.config.js` |
| Quick run command | `npm test` |
| Full suite command | `npm run test:full` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| NET-04 | Host maintains 200ms Vault | unit | `npm test src/systems/NetworkSystem.test.js` | ✅ |
| NET-04 | Rewind restores correct positions | unit | `npm test src/systems/NetworkSystem.test.js` | ❌ Wave 0 |
| NET-04 | Raycast hits rewound mesh | integration | `npm test src/systems/WeaponSystem.test.js` | ❌ Wave 0 |
| HIT-01 | Shot confirmed by host broadcast | unit | `npm test src/systems/NetworkSystem.test.js` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test src/systems/NetworkSystem.test.js`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/systems/WeaponSystem.test.js` — covers shooting logic and authoritative hit detection.
- [ ] Expansion of `src/systems/NetworkSystem.test.js` — covers clock sync and vault retrieval.

## Sources

### Primary (HIGH confidence)
- [Snapshot Interpolation Docs](https://github.com/geckosio/snapshot-interpolation) - History and Vault usage.
- [Valve Developer Wiki: Lag Compensation](https://developer.valvesoftware.com/wiki/Latency_Compensating_Methods_in_Client/Server_In-game_Protocol_Design_and_Optimization) - Industry standard patterns.

### Secondary (MEDIUM confidence)
- [NTP Algorithm Research] - Verified standard implementation for clock sync in JS.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Libraries already in use and well-documented.
- Architecture: HIGH - Industry standard patterns (Source Engine style).
- Pitfalls: HIGH - Well-known issues in FPS networking.

**Research date:** 2024-03-08
**Valid until:** 2024-06-08 (Stable technology)
