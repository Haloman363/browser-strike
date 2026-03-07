# Phase 1: Networking Core - Research

**Researched:** 2026-03-06
**Domain:** P2P Networking / WebRTC / Host-Authoritative Architecture
**Confidence:** HIGH

## Summary
Phase 1 focuses on establishing a robust, host-authoritative P2P foundation using PeerJS. Research confirms that PeerJS is suitable for rapid prototyping of the networking layer, but requires careful implementation of the "Superpeer" pattern to maintain game state integrity. By utilizing mixed data channels (reliable/unreliable) and a snapshot interpolation library, we can achieve smooth movement even in a P2P environment.

**Primary recommendation:** Use `@geckos.io/snapshot-interpolation` alongside `PeerJS` to manage state synchronization, and implement a fixed-timestep update loop (e.g., 20Hz) on the host to broadcast authoritative snapshots.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Networking Library**: PeerJS (Public Cloud). Rationale: Zero-setup signaling and built-in WebRTC management allow for rapid prototyping.
- **Data Transmission**: Mixed Channels (Reliable + Unreliable). Rationale: FPS games require fast, lossy updates for position (unreliable) but guaranteed delivery for events like "Player Joined" (reliable).
- **Host Discovery**: Lobby Codes. Rationale: Short, human-readable codes (e.g., "ABCD") improve UX over long PeerIDs.

### Claude's Discretion
- **System Integration**: `NetworkSystem` will be registered with the `Engine` and manage all P2P connections.
- **Initial Sync**: Must handle player names, selected teams, and basic spawn synchronization.

### Deferred Ideas (OUT OF SCOPE)
- **Phase 2+**: Client-Side Prediction (CSP), Server Reconciliation, Lag Compensation are deferred to subsequent phases. Phase 1 focuses purely on the authoritative foundation and basic visibility.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| NET-01 | Host-Authoritative P2P Networking (Input-based state sync) | Research confirms PeerJS can support multiple channels for mixed reliability; Snapshot interpolation provides the base for state sync. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `peerjs` | ^1.5.4 | WebRTC P2P Transport | Easiest abstraction for WebRTC signaling and data channels in the browser. |
| `@geckos.io/snapshot-interpolation` | ^1.1.0 | State Sync & Interpolation | Industry standard for JS multiplayer; network-agnostic; handles jitter and packet loss. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|--------------|
| `vitest` | ^1.0.0 | Testing Framework | Recommended by project skills for Three.js/Vite projects. |
| `nanoid` | ^5.0.0 | Lobby Code Generation | If custom short ID logic is needed beyond basic Math.random. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| PeerJS | Simple-Peer | More control, but requires a custom signaling server (WebSockets/Socket.io). |
| Geckos.io SI | Custom interpolation | Higher complexity, harder to handle jitter and late packets correctly. |

**Installation:**
```bash
npm install peerjs @geckos.io/snapshot-interpolation
npm install -D vitest jsdom
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── systems/
│   └── NetworkSystem.js   # Orchestrates PeerJS and SnapshotInterpolation
├── core/
│   └── NetworkEntity.js   # Base class for networked objects (players, projectiles)
└── utils/
    └── BinaryPacker.js    # (Future) For bit-packing state if JSON becomes too heavy
```

### Pattern 1: Host-Authoritative "Superpeer"
**What:** One client acts as the server. It receives inputs, runs the simulation, and broadcasts state.
**When to use:** Small-scale P2P games (up to 8-16 players).
**Mechanism:**
1. Clients send inputs to Host.
2. Host processes inputs at a **fixed timestep** (e.g., every 50ms / 20Hz).
3. Host sends a "Snapshot" of the entire world state to all clients via **Unreliable Channel**.

### Pattern 2: Mixed Reliability Channels
**What:** Opening two `DataConnection` objects to the same PeerID.
**When to use:** Always in an FPS.
- **Reliable Channel (`reliable: true`):** For events like `PLAYER_JOIN`, `CHAT`, `WEAPON_PICKUP`, `BOMB_PLANTED`.
- **Unreliable Channel (`reliable: false`):** For `PLAYER_POSITION`, `PLAYER_ROTATION`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Signaling / NAT Traversal | Custom ICE/STUN/Signaling | PeerJS | PeerJS handles the "handshake" automatically via their cloud server. |
| Snapshot Buffering | Custom array management | Geckos.io SI | Correctly handles "interpolation delay" to smooth out network jitter. |
| JSON Serialization | Custom stringification | PeerJS BinaryPack | PeerJS automatically uses `binarypack` for ArrayBuffers/Blobs. |

## Common Pitfalls

### Pitfall 1: Head-of-Line Blocking
**What goes wrong:** Using a single reliable channel for everything. If one movement packet is lost, all subsequent packets (including newer movement) are blocked until the lost one is retransmitted.
**How to avoid:** Use separate channels. Movement MUST be sent over `reliable: false`.

### Pitfall 2: requestAnimationFrame Ticking
**What goes wrong:** Sending network updates inside `requestAnimationFrame`. If the user switches tabs or has a 144Hz monitor, the network rate becomes unstable.
**How to avoid:** Use `setInterval` or a custom accumulator for a fixed update rate (e.g., 20 or 30 ticks per second) for networking.

### Pitfall 3: PeerID Collisions
**What goes wrong:** Short lobby codes (e.g., "ABCD") have a high collision probability if not managed.
**How to avoid:** Check `unavailable-id` error in PeerJS and regenerate, or use 6+ character alphanumeric codes.

## Code Examples

### PeerJS Mixed Channel Setup
```javascript
// On the Client
const peer = new Peer(generateShortCode());

// 1. Reliable Connection for Events
const reliable = peer.connect(hostId, { reliable: true, label: 'reliable' });

// 2. Unreliable Connection for High-Frequency State
const unreliable = peer.connect(hostId, { reliable: false, label: 'unreliable' });

reliable.on('open', () => {
    reliable.send({ type: 'JOIN', name: 'Player1' });
});

unreliable.on('open', () => {
    // Send position at a fixed interval
    setInterval(() => {
        unreliable.send({ type: 'POS', x: 10, y: 0, z: 5 });
    }, 50); // 20Hz
});
```

### Snapshot Interpolation (Client Side)
```javascript
import { SnapshotInterpolation } from '@geckos.io/snapshot-interpolation';

const SI = new SnapshotInterpolation(20); // 20 is the server/host FPS

// When data received from Host
unreliable.on('data', (data) => {
    if (data.type === 'SNAPSHOT') {
        SI.snapshot.add(data.snapshot);
    }
});

// In the Three.js update loop
function update() {
    const snapshot = SI.calcInterpolation('x y z');
    if (snapshot) {
        const { state } = snapshot;
        state.forEach(p => {
            const playerMesh = players.get(p.id);
            playerMesh.position.set(p.x, p.y, p.z);
        });
    }
}
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest |
| Config file | `vite.config.js` (add `test` block) |
| Quick run command | `npm test` |
| Full suite command | `npm test --run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| NET-01 | Host can generate a short PeerID | unit | `npx vitest src/systems/NetworkSystem.test.js` | ❌ Wave 0 |
| NET-01 | Host accepts incoming connections | integration | `npx vitest src/systems/NetworkSystem.test.js` | ❌ Wave 0 |
| NET-01 | State snapshots are valid JSON/Binary | unit | `npx vitest src/utils/Serialization.test.js` | ❌ Wave 0 |

### Wave 0 Gaps
- [ ] `src/systems/NetworkSystem.test.js` — covers connection logic and ID generation.
- [ ] Install `vitest` and `jsdom`.
- [ ] Configure `vite.config.js` to support Vitest.

## Sources

### Primary (HIGH confidence)
- **PeerJS Documentation** - Confirmed multiple connections per peer for mixed reliability.
- **Geckos.io Documentation** - Confirmed network-agnostic snapshot interpolation.
- **Threejs-browser-strike Skill** - Confirmed Vitest as preferred test runner.

### Secondary (MEDIUM confidence)
- **WebRTC Networking Articles (Gaffer on Games)** - Confirmed best practices for "Listen Servers" (P2P Host).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Libraries are mature and widely used.
- Architecture: HIGH - Host-authoritative is the standard for non-deterministic web games.
- Pitfalls: MEDIUM - P2P NAT traversal can still fail for ~5% of users (STUN/TURN limitations).

**Research date:** 2026-03-06
**Valid until:** 2026-04-06
