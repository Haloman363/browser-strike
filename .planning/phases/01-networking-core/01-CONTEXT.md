# Phase Context: 01-Networking Core

## Domain
Establishing the Host-Authoritative P2P foundation using PeerJS and WebRTC for a high-fidelity browser FPS.

## Decisions

### Networking Library
- **Decision**: PeerJS (Public Cloud)
- **Rationale**: Zero-setup signaling and built-in WebRTC management allow for rapid prototyping of the core network layer.
- **Implementation**: Integrate PeerJS into a new `NetworkSystem` modular component.

### Data Transmission
- **Decision**: Mixed Channels (Reliable + Unreliable)
- **Rationale**: FPS games require fast, lossy updates for position/rotation (unreliable) but guaranteed delivery for events like "Player Joined" or "C4 Planted" (reliable).
- **Implementation**: Utilize PeerJS data channel options to specify reliability per message type.

### Host Discovery
- **Decision**: Lobby Codes
- **Rationale**: Short, human-readable codes (e.g., "ABCD") improve UX over long PeerIDs for web-native sharing.
- **Implementation**: A simple mapping logic (Host PeerID <-> Short Code) on the client/signaling layer.

## Specifics
- **System Integration**: `NetworkSystem` will be registered with the `Engine` and manage all P2P connections.
- **Initial Sync**: Must handle player names, selected teams, and basic spawn synchronization.

## Code Context
- Reuses the `Engine`/`System` pattern seen in `src/core/Engine.js`.
- `DebugBridge.js` provides a reference for WebSocket-based messaging that can be adapted for WebRTC.
